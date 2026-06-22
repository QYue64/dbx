<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Activity, Bot, CalendarClock, Clipboard, ClipboardCheck, FileSearch, GitPullRequest, Play, PlugZap, Save, ShieldCheck, Trash2 } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useConnectionStore } from "@/stores/connectionStore";
import { useQueryStore } from "@/stores/queryStore";
import {
  appendAutomationDraft,
  buildAuditReport,
  buildAutomationPlan,
  buildAutomationRunPlan,
  buildChangeRequestArtifact,
  buildChangeRequestPlan,
  buildDataQualityReport,
  buildDiagnosticsSummary,
  buildGovernanceBundleReport,
  buildDiagnosticsReport,
  buildPluginPublishReport,
  clearGovernanceAuditRecords,
  deleteAutomationDraft,
  createQueryAuditRecord,
  evaluateSqlGovernance,
  planAiGovernance,
  readConnectionSharePolicies,
  profileQueryResultQuality,
  readAutomationDrafts,
  readGovernanceAuditRecords,
  readGovernancePolicy,
  saveGovernancePolicy,
  summarizePluginPublishing,
  topDataQualityFindings,
  upsertConnectionSharePolicy,
  updateAutomationDraft,
  type AutomationDraft,
  type GovernanceSeverity,
  type GovernancePolicySettings,
  type WorkspaceRole,
  type WorkspacePrincipal,
  type ConnectionSharePolicy,
} from "@/lib/workspaceGovernance";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/composables/useToast";
import { getDriverRuntimeSummary, listPlugins, type DriverRuntimeSummary } from "@/lib/api";
import type { InstalledPlugin } from "@/types/database";

const open = defineModel<boolean>("open", { default: false });
const connectionStore = useConnectionStore();
const queryStore = useQueryStore();
const { toast } = useToast();
const { t, te } = useI18n();

const policy = ref<GovernancePolicySettings>(readGovernancePolicy());
const automationDrafts = ref(readAutomationDrafts());
const connectionPolicies = ref<ConnectionSharePolicy[]>(readConnectionSharePolicies());
const connectionDefaultRole = ref<WorkspaceRole>("admin");
const driverRuntime = ref<DriverRuntimeSummary | undefined>();
const installedPlugins = ref<InstalledPlugin[]>([]);
const pluginLoadError = ref("");
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
    policy.value = readGovernancePolicy();
    automationDrafts.value = readAutomationDrafts();
    connectionPolicies.value = readConnectionSharePolicies();
    syncConnectionDefaultRole();
    refreshDriverRuntime();
    refreshPlugins();
  },
  { immediate: true },
);

watch(activeConnection, syncConnectionDefaultRole);

async function refreshDriverRuntime() {
  try {
    driverRuntime.value = await getDriverRuntimeSummary();
  } catch {
    driverRuntime.value = undefined;
  }
}

async function refreshPlugins() {
  try {
    pluginLoadError.value = "";
    installedPlugins.value = await listPlugins();
  } catch (error) {
    installedPlugins.value = [];
    pluginLoadError.value = error instanceof Error ? error.message : String(error);
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

const changePlan = computed(() =>
  buildChangeRequestPlan({
    id: "preview",
    title: activeTab.value?.title || "active query",
    sql: activeSql.value,
    createdAt: new Date().toISOString(),
  }),
);
const changeArtifact = computed(() =>
  buildChangeRequestArtifact({
    id: "preview",
    title: activeTab.value?.title || "active query",
    sql: activeSql.value,
    createdAt: new Date().toISOString(),
  }),
);

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
const automationPlan = computed(() =>
  buildAutomationPlan(
    {
      kind: "sql",
      connectionId: activeConnection.value?.id || "",
      schedule: "manual",
      sql: activeSql.value,
    },
    activeConnection.value,
  ),
);

const qualityProfile = computed(() => {
  const result = activeTab.value?.result;
  return result ? profileQueryResultQuality(result) : undefined;
});

const pluginSummary = computed(() => summarizePluginPublishing(installedPlugins.value));
const pluginSeverity = computed<GovernanceSeverity>(() => {
  if (pluginSummary.value.blocked > 0 || pluginLoadError.value) return "critical";
  if (pluginSummary.value.total === 0) return "warning";
  return "ok";
});
const qualityFindings = computed(() => (qualityProfile.value ? topDataQualityFindings(qualityProfile.value) : []));

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
        id: "change",
        icon: GitPullRequest,
        title: t("governanceCenter.section.change"),
        severity: changePlan.value.requiresApproval ? "warning" : "info",
        metric: changePlan.value.migrationName,
        detail: changePlan.value.rollbackRequired ? t("governanceCenter.rollbackRequired") : t("governanceCenter.noRollbackRequired"),
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
        id: "plugins",
        icon: PlugZap,
        title: t("governanceCenter.section.plugins"),
        severity: pluginSeverity.value,
        metric: t("governanceCenter.metric.publishable", {
          publishable: pluginSummary.value.publishable,
          total: pluginSummary.value.total,
        }),
        detail: pluginLoadError.value || pluginSummary.value.issues[0]?.message || t("governanceCenter.pluginManifestsValid"),
      },
      {
        id: "ai",
        icon: Bot,
        title: t("governanceCenter.section.ai"),
        severity: aiPlan.value.requiresHumanApproval ? "warning" : "ok",
        metric: aiPlan.value.requiresDryRun ? t("governanceCenter.dryRun") : t("governanceCenter.direct"),
        detail: reasonText(aiPlan.value.reasons) || t("governanceCenter.policyReady"),
      },
      {
        id: "automation",
        icon: CalendarClock,
        title: t("governanceCenter.section.automation"),
        severity: automationPlan.value.safety,
        metric: t("governanceCenter.metric.drafts", { count: automationDrafts.value.length }),
        detail: reasonText(automationPlan.value.reasons) || t("governanceCenter.manualScheduleReady"),
      },
      {
        id: "quality",
        icon: FileSearch,
        title: t("governanceCenter.section.quality"),
        severity: qualityProfile.value ? "info" : "warning",
        metric: qualityProfile.value ? t("governanceCenter.metric.rows", { count: qualityProfile.value.rowCount }) : t("governanceCenter.noResult"),
        detail:
          qualityFindings.value
            .map((column) =>
              t("governanceCenter.metric.nullRate", {
                name: column.name,
                rate: Math.round(column.nullRate * 100),
              }),
            )
            .join(" | ") || t("governanceCenter.runQueryToProfile"),
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

function savePolicy() {
  try {
    policy.value = saveGovernancePolicy(policy.value);
    toast(t("governanceCenter.toast.policySaved"), 1800);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast(t("governanceCenter.toast.policySaveFailed", { message }), 4000);
  }
}

function saveActiveSqlAutomation() {
  automationDrafts.value = appendAutomationDraft({
    name: activeTab.value?.title || "Active SQL",
    kind: "sql",
    connectionId: activeConnection.value?.id || "",
    schedule: "manual",
    sql: activeSql.value,
    enabled: false,
  });
  toast(t("governanceCenter.toast.automationSaved"), 1800);
}

function saveAuditAutomation(record: { sqlPreview: string; connectionId: string; id: string }) {
  automationDrafts.value = appendAutomationDraft({
    name: `Audit ${record.id}`,
    kind: "sql",
    connectionId: record.connectionId,
    schedule: "manual",
    sql: record.sqlPreview,
    enabled: false,
  });
  toast(t("governanceCenter.toast.auditSavedAsAutomation"), 1800);
}

function setAutomationEnabled(id: string | undefined, enabled: boolean) {
  if (!id) return;
  automationDrafts.value = updateAutomationDraft(id, { enabled });
}

function removeAutomation(id: string | undefined) {
  if (!id) return;
  automationDrafts.value = deleteAutomationDraft(id);
  toast(t("governanceCenter.toast.automationDeleted"), 1800);
}

function openAutomation(draft: AutomationDraft) {
  const runPlan = buildAutomationRunPlan(draft, connectionStore.getConfig(draft.connectionId));
  if (!runPlan.executableSql?.trim()) {
    toast(t("governanceCenter.toast.automationNoSql"), 2200);
    return;
  }
  const connection = connectionStore.getConfig(draft.connectionId);
  const tabId = queryStore.createTab(draft.connectionId, connection?.database || "", draft.name || t("governanceCenter.section.automation"), "query");
  queryStore.updateSql(tabId, runPlan.executableSql);
  open.value = false;
}

async function copyChangeArtifact(kind: "migration" | "rollback") {
  await copyToClipboard(kind === "migration" ? changeArtifact.value.migrationSql : changeArtifact.value.rollbackSql);
  toast(kind === "migration" ? t("governanceCenter.toast.migrationCopied") : t("governanceCenter.toast.rollbackCopied"), 1800);
}

async function copyAuditSql(sql: string) {
  await copyToClipboard(sql);
  toast(t("governanceCenter.toast.auditSqlCopied"), 1800);
}

async function copyAuditReport() {
  await copyToClipboard(buildAuditReport(storedAuditRecords.value));
  toast(t("governanceCenter.toast.auditReportCopied"), 1800);
}

function clearAudit() {
  clearGovernanceAuditRecords();
  toast(t("governanceCenter.toast.auditCleared"), 1800);
}

async function copyDiagnostics() {
  await copyToClipboard(buildDiagnosticsReport(diagnostics.value));
  toast(t("governanceCenter.toast.diagnosticsCopied"), 1800);
}

async function copyQualityReport() {
  if (!qualityProfile.value) {
    toast(t("governanceCenter.toast.runQueryBeforeQuality"), 2200);
    return;
  }
  await copyToClipboard(buildDataQualityReport(qualityProfile.value));
  toast(t("governanceCenter.toast.qualityCopied"), 1800);
}

async function copyPluginReport() {
  await copyToClipboard(buildPluginPublishReport(pluginSummary.value));
  toast(t("governanceCenter.toast.pluginReportCopied"), 1800);
}

async function copyGovernanceBundle() {
  await copyToClipboard(
    buildGovernanceBundleReport({
      diagnostics: diagnostics.value,
      auditRecords: storedAuditRecords.value,
      automationDrafts: automationDrafts.value,
      qualityProfile: qualityProfile.value,
    }),
  );
  toast(t("governanceCenter.toast.bundleCopied"), 1800);
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
          <Select v-model="policy.principalRole">
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
            <Switch v-model:checked="policy.requireApprovalForWrites" />
          </label>
          <label class="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-xs">
            <span>{{ t("governanceCenter.productionWrites") }}</span>
            <Switch v-model:checked="policy.allowProductionWrites" />
          </label>
          <label class="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-xs">
            <span>{{ t("governanceCenter.dangerousSql") }}</span>
            <Switch v-model:checked="policy.allowDangerousSql" />
          </label>
          <label class="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-xs">
            <span>{{ t("governanceCenter.aiWrites") }}</span>
            <Switch v-model:checked="policy.aiAllowWrites" />
          </label>
          <label class="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-xs">
            <span>{{ t("governanceCenter.aiDryRun") }}</span>
            <Switch v-model:checked="policy.aiRequireDryRunForWrites" />
          </label>
          <Button size="sm" class="h-8 justify-start gap-2" @click="savePolicy">
            <Save class="h-3.5 w-3.5" />
            {{ t("governanceCenter.savePolicy") }}
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
        <div v-for="section in sections" :key="section.id" class="min-w-0 rounded-md border p-3" :class="severityClass(section.severity)">
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

      <Separator />

      <div class="grid gap-2 sm:grid-cols-4">
        <Button variant="outline" size="sm" class="justify-start gap-2" @click="saveActiveSqlAutomation">
          <CalendarClock class="h-3.5 w-3.5" />
          {{ t("governanceCenter.saveAutomation") }}
        </Button>
        <Button variant="outline" size="sm" class="justify-start gap-2" @click="copyDiagnostics">
          <Activity class="h-3.5 w-3.5" />
          {{ t("governanceCenter.copyDiagnostics") }}
        </Button>
        <Button variant="outline" size="sm" class="justify-start gap-2" @click="copyQualityReport">
          <FileSearch class="h-3.5 w-3.5" />
          {{ t("governanceCenter.copyQuality") }}
        </Button>
        <Button variant="outline" size="sm" class="justify-start gap-2" @click="copyGovernanceBundle">
          <Clipboard class="h-3.5 w-3.5" />
          {{ t("governanceCenter.copyBundle") }}
        </Button>
        <Button variant="outline" size="sm" class="justify-start gap-2" @click="copyAuditReport">
          <ClipboardCheck class="h-3.5 w-3.5" />
          {{ t("governanceCenter.copyAudit") }}
        </Button>
        <Button variant="outline" size="sm" class="justify-start gap-2" @click="copyPluginReport">
          <PlugZap class="h-3.5 w-3.5" />
          {{ t("governanceCenter.copyPlugins") }}
        </Button>
      </div>

      <div class="grid gap-3 lg:grid-cols-3">
        <div class="rounded-md border p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <div class="text-sm font-medium">{{ t("governanceCenter.changeArtifact") }}</div>
            <Badge variant="secondary">{{ changeArtifact.requiresApproval ? t("governanceCenter.approval") : t("governanceCenter.ready") }}</Badge>
          </div>
          <div class="truncate text-xs text-muted-foreground">
            {{ changeArtifact.migrationName }}
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" size="sm" class="justify-start gap-2" @click="copyChangeArtifact('migration')">
              <GitPullRequest class="h-3.5 w-3.5" />
              {{ t("governanceCenter.copyMigration") }}
            </Button>
            <Button variant="outline" size="sm" class="justify-start gap-2" @click="copyChangeArtifact('rollback')">
              <Clipboard class="h-3.5 w-3.5" />
              {{ t("governanceCenter.copyRollback") }}
            </Button>
          </div>
        </div>

        <div class="rounded-md border p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <div class="text-sm font-medium">{{ t("governanceCenter.auditLog") }}</div>
            <Badge variant="secondary">{{ storedAuditRecords.length }}</Badge>
          </div>
          <div class="truncate text-xs text-muted-foreground">
            {{ storedAuditRecords[0]?.sqlPreview || t("governanceCenter.noAuditRecords") }}
          </div>
          <Button variant="outline" size="sm" class="mt-3 justify-start gap-2" @click="clearAudit">
            <Trash2 class="h-3.5 w-3.5" />
            {{ t("governanceCenter.clearAudit") }}
          </Button>
        </div>

        <div class="rounded-md border p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <div class="text-sm font-medium">{{ t("governanceCenter.pluginReadiness") }}</div>
            <Badge variant="secondary">{{ t("governanceCenter.metric.blocked", { count: pluginSummary.blocked }) }}</Badge>
          </div>
          <div class="truncate text-xs text-muted-foreground">
            {{ pluginLoadError || pluginSummary.issues[0]?.message || t("governanceCenter.noPluginIssues") }}
          </div>
          <div class="mt-3 text-xs text-muted-foreground">
            {{
              t("governanceCenter.metric.pluginInstalled", {
                publishable: pluginSummary.publishable,
                total: pluginSummary.total,
              })
            }}
          </div>
        </div>
      </div>

      <div class="grid gap-3 lg:grid-cols-2">
        <div class="rounded-md border p-3">
          <div class="mb-3 flex items-center justify-between gap-2">
            <div class="text-sm font-medium">{{ t("governanceCenter.recentAuditRecords") }}</div>
            <Badge variant="secondary">{{ storedAuditRecords.length }}</Badge>
          </div>
          <div v-if="storedAuditRecords.length" class="grid gap-2">
            <div v-for="record in storedAuditRecords.slice(0, 5)" :key="record.id" class="grid gap-2 rounded border bg-muted/20 p-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <div class="min-w-0">
                <div class="truncate text-xs font-medium">{{ record.status }} · {{ record.decision.auditLevel }} · {{ record.createdAt }}</div>
                <div class="truncate text-xs text-muted-foreground">{{ record.sqlPreview }}</div>
              </div>
              <div class="flex items-center gap-2">
                <Button variant="outline" size="icon-sm" @click="copyAuditSql(record.sqlPreview)">
                  <Clipboard class="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon-sm" @click="saveAuditAutomation(record)">
                  <CalendarClock class="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <div v-else class="text-xs text-muted-foreground">
            {{ t("governanceCenter.auditEmptyHint") }}
          </div>
        </div>

        <div class="rounded-md border p-3">
          <div class="mb-3 flex items-center justify-between gap-2">
            <div class="text-sm font-medium">{{ t("governanceCenter.dataQualityFindings") }}</div>
            <Badge variant="secondary">{{ qualityFindings.length }}</Badge>
          </div>
          <div v-if="qualityFindings.length" class="grid gap-2">
            <div v-for="column in qualityFindings" :key="column.name" class="rounded border bg-muted/20 p-2">
              <div class="truncate text-sm font-medium">{{ column.name }}</div>
              <div class="truncate text-xs text-muted-foreground">
                {{
                  t("governanceCenter.qualityFinding", {
                    nulls: column.nullCount,
                    rate: Math.round(column.nullRate * 100),
                    duplicates: column.duplicateCount,
                    distinct: column.distinctCount,
                  })
                }}
              </div>
            </div>
          </div>
          <div v-else class="text-xs text-muted-foreground">
            {{ t("governanceCenter.qualityEmptyHint") }}
          </div>
        </div>
      </div>

      <div class="rounded-md border p-3">
        <div class="mb-3 flex items-center justify-between gap-2">
          <div class="text-sm font-medium">{{ t("governanceCenter.automationDrafts") }}</div>
          <Badge variant="secondary">{{ automationDrafts.length }}</Badge>
        </div>
        <div v-if="automationDrafts.length" class="grid gap-2">
          <div v-for="draft in automationDrafts" :key="draft.id || draft.name" class="grid gap-2 rounded border bg-muted/20 p-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div class="min-w-0">
              <div class="truncate text-sm font-medium">{{ draft.name || draft.kind }}</div>
              <div class="truncate text-xs text-muted-foreground">
                {{ draft.kind }} · {{ draft.schedule }} ·
                {{ draft.sql || draft.target || t("governanceCenter.notConfigured") }}
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Switch :checked="!!draft.enabled" @update:checked="setAutomationEnabled(draft.id, $event)" />
              <Button variant="outline" size="icon-sm" :disabled="!draft.sql" @click="openAutomation(draft)">
                <Play class="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon-sm" @click="removeAutomation(draft.id)">
                <Trash2 class="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <div v-else class="text-xs text-muted-foreground">
          {{ t("governanceCenter.automationEmptyHint") }}
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
