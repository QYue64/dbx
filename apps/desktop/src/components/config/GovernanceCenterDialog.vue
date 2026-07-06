<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Activity, Bot, ClipboardCheck, Save, ShieldCheck } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useConnectionStore } from "@/stores/connectionStore";
import { useQueryStore } from "@/stores/queryStore";
import {
  buildDiagnosticsSummary,
  createQueryAuditRecord,
  evaluateSqlGovernance,
  planAiGovernance,
  readConnectionSharePolicies,
  readGovernanceAuditRecords,
  readGovernancePolicy,
  saveGovernancePolicy,
  normalizeGovernancePolicy,
  upsertConnectionSharePolicy,
  type GovernanceSeverity,
  type GovernancePolicySettings,
  type WorkspaceRole,
  type WorkspacePrincipal,
  type ConnectionSharePolicy,
} from "@/lib/workspaceGovernance";
import { useToast } from "@/composables/useToast";
import { getDriverRuntimeSummary, loadDesktopSettings, saveDesktopSettings, type DriverRuntimeSummary } from "@/lib/backend/api";

const open = defineModel<boolean>("open", { default: false });
const connectionStore = useConnectionStore();
const queryStore = useQueryStore();
const { toast } = useToast();
const { t, te } = useI18n();

const policy = ref<GovernancePolicySettings>(readGovernancePolicy());
const connectionPolicies = ref<ConnectionSharePolicy[]>(readConnectionSharePolicies());
const connectionDefaultRole = ref<WorkspaceRole>("admin");
const driverRuntime = ref<DriverRuntimeSummary | undefined>();
const isPolicySaving = ref(false);
const isPolicyDirty = ref(false);
const auditRecordsOpen = ref(false);
let policyLoadRunId = 0;
const principal = computed<WorkspacePrincipal>(() => ({
  id: "local-user",
  role: policy.value.principalRole,
}));
const activeTab = computed(() => queryStore.tabs.find((tab) => tab.id === queryStore.activeTabId));
const activeConnection = computed(() => (activeTab.value ? connectionStore.getConfig(activeTab.value.connectionId) : undefined));
const activeSql = computed(() => activeTab.value?.sql?.trim() || "SELECT 1");
const roleItems: WorkspaceRole[] = ["owner", "admin", "editor", "analyst", "viewer"];

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    isPolicyDirty.value = false;
    void loadPolicy();
    connectionPolicies.value = readConnectionSharePolicies();
    syncConnectionDefaultRole();
    refreshDriverRuntime();
  },
  { immediate: true },
);

watch(activeConnection, syncConnectionDefaultRole);

async function loadPolicy() {
  const runId = ++policyLoadRunId;
  const fallback = readGovernancePolicy();
  if (!isPolicyDirty.value) {
    policy.value = fallback;
  }
  try {
    const settings = await loadDesktopSettings();
    if (runId !== policyLoadRunId || isPolicyDirty.value) return;
    policy.value = normalizeGovernancePolicy(settings.governance_policy || fallback);
  } catch {
    if (runId !== policyLoadRunId || isPolicyDirty.value) return;
    policy.value = fallback;
  }
  syncConnectionDefaultRole();
}

function updatePolicy(patch: Partial<GovernancePolicySettings>) {
  isPolicyDirty.value = true;
  policy.value = normalizeGovernancePolicy({ ...policy.value, ...patch });
  syncConnectionDefaultRole();
}

function updatePrincipalRole(value: unknown) {
  if (typeof value !== "string" || !roleItems.includes(value as WorkspaceRole)) return;
  updatePolicy({ principalRole: value as WorkspaceRole });
}

async function refreshDriverRuntime() {
  try {
    driverRuntime.value = await getDriverRuntimeSummary();
  } catch {
    driverRuntime.value = undefined;
  }
}

function syncConnectionDefaultRole() {
  const connectionId = activeConnection.value?.id;
  const sharePolicy = connectionPolicies.value.find((item) => item.connectionId === connectionId);
  connectionDefaultRole.value = sharePolicy?.defaultRole || policy.value.principalRole;
}

function saveConnectionPolicy() {
  const connectionId = activeConnection.value?.id;
  if (!connectionId) {
    toast(t("governanceCenter.toast.openConnectionFirst"), 2200);
    return;
  }
  connectionPolicies.value = upsertConnectionSharePolicy({
    connectionId,
    defaultRole: connectionDefaultRole.value,
    grants: [{ principalId: principal.value.id, role: connectionDefaultRole.value }],
  });
  toast(t("governanceCenter.toast.connectionPolicySaved"), 1800);
}

const activeSharePolicy = computed(() => connectionPolicies.value.find((item) => item.connectionId === activeConnection.value?.id));

const sqlGovernance = computed(() =>
  evaluateSqlGovernance(activeSql.value, activeConnection.value, {
    principal: principal.value,
    sharePolicy: activeSharePolicy.value,
    requireApprovalForWrites: policy.value.requireApprovalForWrites,
    allowDangerousSql: policy.value.allowDangerousSql,
    allowProductionWrites: policy.value.allowProductionWrites,
  }),
);

const auditRecord = computed(() =>
  createQueryAuditRecord({
    id: "preview",
    connectionId: activeConnection.value?.id || "",
    principalId: principal.value.id,
    sql: activeSql.value,
    decision: sqlGovernance.value,
    createdAt: new Date().toISOString(),
  }),
);
const storedAuditRecords = computed(() => readGovernanceAuditRecords());

const diagnostics = computed(() =>
  buildDiagnosticsSummary({
    connections: connectionStore.connections,
    connectedIds: connectionStore.connectedIds,
    lastErrors: connectionStore.connectionErrors,
    driverRuntime: driverRuntime.value,
  }),
);

const aiPlan = computed(() =>
  planAiGovernance(sqlGovernance.value.sqlDecision, {
    allowWrites: policy.value.aiAllowWrites,
    requireDryRunForWrites: policy.value.aiRequireDryRunForWrites,
  }),
);

function reasonLabel(reason: string) {
  const key = `governanceCenter.reason.${reason}`;
  return te(key) ? t(key) : reason;
}

function reasonText(reasons: string[]) {
  return reasons.map(reasonLabel).join(", ");
}

const sections = computed(
  () =>
    [
      {
        id: "access",
        icon: ShieldCheck,
        title: t("governanceCenter.section.access"),
        severity: sqlGovernance.value.allowed ? "ok" : "critical",
        metric: activeSharePolicy.value?.defaultRole || principal.value.role,
        detail: reasonText(sqlGovernance.value.reasons) || t("governanceCenter.ready"),
      },
      {
        id: "audit",
        icon: ClipboardCheck,
        title: t("governanceCenter.section.audit"),
        severity: auditRecord.value.decision.auditLevel,
        metric: t("governanceCenter.metric.records", { count: storedAuditRecords.value.length }),
        detail: storedAuditRecords.value[0]?.sqlPreview || auditRecord.value.sqlPreview || t("governanceCenter.noActiveSql"),
      },
      {
        id: "diagnostics",
        icon: Activity,
        title: t("governanceCenter.section.diagnostics"),
        severity: diagnostics.value.severity,
        metric: t("governanceCenter.metric.checks", { count: diagnostics.value.checks.length }),
        detail: diagnostics.value.checks[0]?.message || t("governanceCenter.healthy"),
      },
      {
        id: "ai",
        icon: Bot,
        title: t("governanceCenter.section.ai"),
        severity: aiPlan.value.requiresHumanApproval ? "warning" : "ok",
        metric: aiPlan.value.requiresDryRun ? t("governanceCenter.dryRun") : t("governanceCenter.direct"),
        detail: reasonText(aiPlan.value.reasons) || t("governanceCenter.policyReady"),
      },
    ] satisfies Array<{
      id: string;
      icon: unknown;
      title: string;
      severity: GovernanceSeverity;
      metric: string;
      detail: string;
    }>,
);

function severityClass(severity: GovernanceSeverity) {
  if (severity === "critical") return "border-destructive/50 bg-destructive/5 text-destructive";
  if (severity === "warning") return "border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300";
  if (severity === "info") return "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  return "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300";
}

function badgeVariant(severity: GovernanceSeverity) {
  return severity === "critical" ? "destructive" : "secondary";
}

function openSection(sectionId: string) {
  if (sectionId === "audit") {
    auditRecordsOpen.value = true;
  }
}

async function savePolicy() {
  if (isPolicySaving.value) return;
  isPolicySaving.value = true;
  try {
    const normalized = normalizeGovernancePolicy({ ...policy.value });
    const settings = await loadDesktopSettings();
    await saveDesktopSettings({ ...settings, governance_policy: normalized });
    const persistedSettings = await loadDesktopSettings();
    const persisted = normalizeGovernancePolicy(persistedSettings.governance_policy || null);
    if (JSON.stringify(persisted) !== JSON.stringify(normalized)) {
      throw new Error("Governance policy was not persisted to desktop settings");
    }
    saveGovernancePolicy(persisted);
    policy.value = persisted;
    isPolicyDirty.value = false;
    toast(t("governanceCenter.toast.policySaved"), 1800);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast(t("governanceCenter.toast.policySaveFailed", { message }), 4000);
  } finally {
    isPolicySaving.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[86vh] overflow-auto sm:max-w-[900px]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <ShieldCheck class="h-5 w-5" />
          {{ t("governanceCenter.title") }}
        </DialogTitle>
      </DialogHeader>

      <div class="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-[180px_1fr]">
        <div class="grid gap-1">
          <div class="text-xs font-medium text-muted-foreground">
            {{ t("governanceCenter.localRole") }}
          </div>
          <Select :model-value="policy.principalRole" @update:model-value="updatePrincipalRole">
            <SelectTrigger class="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="role in roleItems" :key="role" :value="role">{{ role }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="grid gap-2 sm:grid-cols-3">
          <label class="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-xs">
            <span>{{ t("governanceCenter.approveWrites") }}</span>
            <Switch :model-value="policy.requireApprovalForWrites" @update:model-value="updatePolicy({ requireApprovalForWrites: Boolean($event) })" />
          </label>
          <label class="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-xs">
            <span>{{ t("governanceCenter.productionWrites") }}</span>
            <Switch :model-value="policy.allowProductionWrites" @update:model-value="updatePolicy({ allowProductionWrites: Boolean($event) })" />
          </label>
          <label class="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-xs">
            <span>{{ t("governanceCenter.dangerousSql") }}</span>
            <Switch :model-value="policy.allowDangerousSql" @update:model-value="updatePolicy({ allowDangerousSql: Boolean($event) })" />
          </label>
          <label class="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-xs">
            <span>{{ t("governanceCenter.aiWrites") }}</span>
            <Switch :model-value="policy.aiAllowWrites" @update:model-value="updatePolicy({ aiAllowWrites: Boolean($event) })" />
          </label>
          <label class="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-xs">
            <span>{{ t("governanceCenter.aiDryRun") }}</span>
            <Switch :model-value="policy.aiRequireDryRunForWrites" @update:model-value="updatePolicy({ aiRequireDryRunForWrites: Boolean($event) })" />
          </label>
          <Button size="sm" class="h-8 justify-start gap-2" :disabled="isPolicySaving" @click="savePolicy">
            <Save class="h-3.5 w-3.5" />
            {{ isPolicySaving ? t("common.loading") : t("governanceCenter.savePolicy") }}
          </Button>
        </div>
      </div>

      <div class="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div class="grid gap-1">
          <div class="text-xs font-medium text-muted-foreground">
            {{ t("governanceCenter.activeConnectionAccess") }}
          </div>
          <div class="truncate text-sm font-medium">
            {{ activeConnection?.name || t("governanceCenter.noActiveConnection") }}
          </div>
          <div class="text-xs text-muted-foreground">
            {{ t("governanceCenter.connectionAccessDescription") }}
          </div>
        </div>
        <div class="grid gap-2 sm:grid-cols-[140px_auto]">
          <Select v-model="connectionDefaultRole" :disabled="!activeConnection">
            <SelectTrigger class="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="role in roleItems" :key="role" :value="role">{{ role }}</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" class="h-8 justify-start gap-2" :disabled="!activeConnection" @click="saveConnectionPolicy">
            <ShieldCheck class="h-3.5 w-3.5" />
            {{ t("governanceCenter.saveAccess") }}
          </Button>
        </div>
      </div>

      <div class="grid gap-3 py-2 sm:grid-cols-2">
        <div
          v-for="section in sections"
          :key="section.id"
          class="min-w-0 rounded-md border p-3"
          :class="[severityClass(section.severity), section.id === 'audit' ? 'cursor-pointer transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none' : '']"
          :role="section.id === 'audit' ? 'button' : undefined"
          :tabindex="section.id === 'audit' ? 0 : undefined"
          @click="openSection(section.id)"
          @keydown.enter.prevent="openSection(section.id)"
          @keydown.space.prevent="openSection(section.id)"
        >
          <div class="mb-2 flex min-w-0 items-center justify-between gap-2">
            <div class="flex min-w-0 items-center gap-2">
              <component :is="section.icon" class="h-4 w-4 shrink-0" />
              <div class="truncate text-sm font-medium">{{ section.title }}</div>
            </div>
            <Badge :variant="badgeVariant(section.severity)" class="shrink-0">{{ section.severity }}</Badge>
          </div>
          <div class="truncate text-xs font-medium text-foreground">{{ section.metric }}</div>
          <div class="mt-1 line-clamp-2 text-xs opacity-80">{{ section.detail }}</div>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="auditRecordsOpen">
    <DialogContent class="max-h-[82vh] overflow-auto sm:max-w-[760px]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <ClipboardCheck class="h-5 w-5" />
          {{ t("governanceCenter.auditLog") }}
          <Badge variant="secondary">{{ storedAuditRecords.length }}</Badge>
        </DialogTitle>
      </DialogHeader>

      <div v-if="storedAuditRecords.length" class="grid gap-2">
        <div v-for="record in storedAuditRecords" :key="record.id" class="grid gap-2 rounded-md border bg-muted/20 p-3">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <Badge :variant="record.status === 'error' ? 'destructive' : 'secondary'">{{ record.status }}</Badge>
            <Badge :variant="badgeVariant(record.decision.auditLevel)">{{ record.decision.auditLevel }}</Badge>
            <span class="text-xs text-muted-foreground">{{ record.createdAt }}</span>
            <span v-if="record.executionTimeMs !== undefined" class="text-xs text-muted-foreground">{{ record.executionTimeMs }}ms</span>
          </div>
          <div class="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div class="truncate">{{ record.connectionId || t("governanceCenter.noActiveConnection") }}</div>
            <div class="truncate">{{ record.principalId }}</div>
          </div>
          <pre class="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-xs text-foreground">{{ record.sqlPreview }}</pre>
          <div v-if="record.decision.reasons.length" class="text-xs text-muted-foreground">
            {{ reasonText(record.decision.reasons) }}
          </div>
          <div v-if="record.error" class="rounded bg-destructive/10 p-2 text-xs text-destructive">
            {{ record.error }}
          </div>
        </div>
      </div>
      <div v-else class="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
        {{ t("governanceCenter.noAuditRecords") }}
      </div>
    </DialogContent>
  </Dialog>
</template>
