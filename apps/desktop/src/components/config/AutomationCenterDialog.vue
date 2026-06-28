<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Copy, Play, Plus, Trash2, Workflow } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useConnectionStore } from "@/stores/connectionStore";
import { useToast } from "@/composables/useToast";
import { useAutomationScheduler } from "@/composables/useAutomationScheduler";
import { buildAutomationRunPlan, computeNextAutomationRunAt, deleteAutomationJob, readAutomationJobs, readAutomationRunRecords, upsertAutomationJob, type AutomationJob, type AutomationJobKind, type AutomationRunRecord, type AutomationSchedule } from "@/lib/workspaceAutomation";

const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{
  activeSql?: string;
  activeConnectionId?: string;
  activeDatabase?: string;
  activeSchema?: string;
}>();

const { t, te } = useI18n();
const { toast } = useToast();
const connectionStore = useConnectionStore();
const scheduler = useAutomationScheduler({ autoStart: false });

const jobs = ref<AutomationJob[]>([]);
const records = ref<AutomationRunRecord[]>([]);
const selectedJobId = ref("");
const draft = ref<AutomationJob>(newJob("sql"));
const scheduleType = ref<AutomationSchedule["type"]>("manual");
const intervalMinutes = ref(30);
const dailyTime = ref("09:00");
const payloadText = ref("{}");
const payloadError = ref("");

const selectedJob = computed(() => jobs.value.find((job) => job.id === selectedJobId.value));
const selectedConnection = computed(() => connectionStore.getConfig(payloadValue("connectionId")));
const plan = computed(() => buildAutomationRunPlan(draft.value, selectedConnection.value));
const selectedRecords = computed(() => records.value.filter((record) => record.jobId === draft.value.id).slice(0, 20));
const kindItems: AutomationJobKind[] = ["sql", "export", "sync", "quality-check"];

watch(
  open,
  (isOpen) => {
    if (isOpen) refresh();
  },
  { immediate: true },
);

watch(selectedJob, (job) => {
  if (!job) return;
  loadDraft(job);
});

function refresh() {
  jobs.value = readAutomationJobs();
  records.value = readAutomationRunRecords();
  const next = jobs.value.find((job) => job.id === selectedJobId.value) ?? jobs.value[0];
  if (next) {
    selectedJobId.value = next.id;
    loadDraft(next);
  } else {
    loadDraft(newJob("sql"));
  }
}

function newJob(kind: AutomationJobKind): AutomationJob {
  const now = new Date().toISOString();
  return {
    id: "",
    name: "",
    kind,
    enabled: false,
    schedule: { type: "manual" },
    payload: {
      connectionId: props.activeConnectionId || "",
      database: props.activeDatabase || "",
      schema: props.activeSchema || "",
      sql: props.activeSql || "select 1",
      format: "csv",
      outputPath: "",
      syncMode: "",
    },
    createdAt: now,
    updatedAt: now,
  };
}

function loadDraft(job: AutomationJob) {
  draft.value = structuredClone(job);
  scheduleType.value = job.schedule.type;
  intervalMinutes.value = job.schedule.type === "intervalMinutes" ? job.schedule.intervalMinutes : 30;
  dailyTime.value = job.schedule.type === "dailyTime" ? job.schedule.dailyTime : "09:00";
  payloadText.value = JSON.stringify(job.payload, null, 2);
  payloadError.value = "";
}

function payloadValue(key: string): string {
  const payload = draft.value.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function updatePayload(key: string, value: string) {
  const next = { ...(draft.value.payload as Record<string, unknown>), [key]: value };
  draft.value = { ...draft.value, payload: next };
  payloadText.value = JSON.stringify(next, null, 2);
  payloadError.value = "";
}

function updateSchedule() {
  let schedule: AutomationSchedule = { type: "manual" };
  if (scheduleType.value === "intervalMinutes") {
    schedule = { type: "intervalMinutes", intervalMinutes: Math.max(1, Number(intervalMinutes.value) || 1) };
  } else if (scheduleType.value === "dailyTime") {
    schedule = { type: "dailyTime", dailyTime: dailyTime.value || "09:00" };
  }
  draft.value = {
    ...draft.value,
    schedule,
    nextRunAt: draft.value.enabled ? computeNextAutomationRunAt(schedule) : undefined,
  };
}

function onPayloadTextInput(value: string) {
  payloadText.value = value;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("payload must be an object");
    draft.value = { ...draft.value, payload: parsed };
    payloadError.value = "";
  } catch (error) {
    payloadError.value = error instanceof Error ? error.message : String(error);
  }
}

function createJob(kind: AutomationJobKind = "sql") {
  selectedJobId.value = "";
  loadDraft(newJob(kind));
}

function createFromCurrentSql() {
  const job = newJob("sql");
  job.name = t("automationCenter.currentSqlJobName");
  job.payload = {
    connectionId: props.activeConnectionId || "",
    database: props.activeDatabase || "",
    schema: props.activeSchema || "",
    sql: props.activeSql || "",
  };
  loadDraft(job);
}

function saveJob() {
  if (payloadError.value) {
    toast(t("automationCenter.toast.fixPayload"), 2200);
    return;
  }
  updateSchedule();
  jobs.value = upsertAutomationJob(draft.value);
  selectedJobId.value = jobs.value[0]?.id || "";
  refresh();
  toast(t("automationCenter.toast.saved"), 1800);
}

function duplicateJob() {
  const copy = structuredClone(draft.value);
  copy.id = "";
  copy.name = `${copy.name || kindLabel(copy.kind)} copy`;
  copy.enabled = false;
  loadDraft(copy);
}

function removeJob() {
  if (!draft.value.id) return;
  jobs.value = deleteAutomationJob(draft.value.id);
  selectedJobId.value = jobs.value[0]?.id || "";
  refresh();
}

function toggleEnabled(value: boolean) {
  draft.value = { ...draft.value, enabled: value };
  updateSchedule();
}

async function runNow() {
  if (!draft.value.id) saveJob();
  const job = readAutomationJobs().find((item) => item.id === selectedJobId.value) || draft.value;
  const record = await scheduler.executeJob(job, false);
  refresh();
  toast(record.status === "success" ? t("automationCenter.toast.runSuccess") : t("automationCenter.toast.runFailed", { name: job.name, message: record.error || "" }), record.status === "success" ? 1800 : 4200);
}

function kindLabel(kind: string) {
  const key = `automationCenter.kind.${kind}`;
  return te(key) ? t(key) : kind;
}

function reasonLabel(reason: string) {
  const key = `automationCenter.reason.${reason}`;
  return te(key) ? t(key) : reason;
}

function formatTime(value?: string) {
  if (!value) return t("automationCenter.notScheduled");
  return new Date(value).toLocaleString();
}

function lastRecord(jobId: string) {
  return records.value.find((record) => record.jobId === jobId);
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex h-[86vh] max-h-[860px] w-[min(96vw,1180px)] max-w-none flex-col overflow-hidden p-0">
      <DialogHeader class="border-b px-5 py-4">
        <DialogTitle class="flex items-center gap-2">
          <Workflow class="h-5 w-5" />
          {{ t("automationCenter.title") }}
        </DialogTitle>
      </DialogHeader>

      <div class="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
        <aside class="flex min-h-0 flex-col border-r">
          <div class="flex items-center gap-2 border-b p-3">
            <Button size="sm" class="gap-2" @click="createJob()"><Plus class="h-4 w-4" />{{ t("automationCenter.newJob") }}</Button>
            <Button size="sm" variant="outline" @click="createFromCurrentSql">{{ t("automationCenter.fromCurrentSql") }}</Button>
          </div>
          <div class="min-h-0 flex-1 overflow-auto p-2">
            <button v-for="job in jobs" :key="job.id" type="button" class="mb-2 w-full rounded-md border p-3 text-left hover:bg-accent" :class="{ 'border-primary bg-accent': job.id === draft.id }" @click="selectedJobId = job.id">
              <div class="flex items-center justify-between gap-2">
                <div class="truncate text-sm font-medium">{{ job.name }}</div>
                <Badge :variant="job.enabled ? 'default' : 'secondary'">{{ job.enabled ? t("automationCenter.enabled") : t("automationCenter.disabled") }}</Badge>
              </div>
              <div class="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{{ kindLabel(job.kind) }}</span>
                <span>{{ formatTime(job.nextRunAt) }}</span>
              </div>
              <div class="mt-2 text-xs" :class="lastRecord(job.id)?.status === 'error' ? 'text-destructive' : 'text-muted-foreground'">
                {{ lastRecord(job.id)?.message || lastRecord(job.id)?.error || t("automationCenter.noRuns") }}
              </div>
            </button>
            <div v-if="!jobs.length" class="p-6 text-center text-sm text-muted-foreground">{{ t("automationCenter.empty") }}</div>
          </div>
        </aside>

        <main class="flex min-h-0 flex-col">
          <div class="grid gap-4 overflow-auto p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section class="space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <label class="space-y-1 text-sm">
                  <span class="text-muted-foreground">{{ t("automationCenter.name") }}</span>
                  <Input v-model="draft.name" />
                </label>
                <label class="space-y-1 text-sm">
                  <span class="text-muted-foreground">{{ t("automationCenter.kindLabel") }}</span>
                  <Select v-model="draft.kind">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="kind in kindItems" :key="kind" :value="kind">{{ kindLabel(kind) }}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <div class="grid grid-cols-3 gap-3">
                <label class="space-y-1 text-sm">
                  <span class="text-muted-foreground">{{ t("automationCenter.schedule") }}</span>
                  <Select v-model="scheduleType" @update:model-value="updateSchedule">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">{{ t("automationCenter.scheduleManual") }}</SelectItem>
                      <SelectItem value="intervalMinutes">{{ t("automationCenter.scheduleInterval") }}</SelectItem>
                      <SelectItem value="dailyTime">{{ t("automationCenter.scheduleDaily") }}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label class="space-y-1 text-sm">
                  <span class="text-muted-foreground">{{ t("automationCenter.intervalMinutes") }}</span>
                  <Input v-model.number="intervalMinutes" type="number" min="1" :disabled="scheduleType !== 'intervalMinutes'" @input="updateSchedule" />
                </label>
                <label class="space-y-1 text-sm">
                  <span class="text-muted-foreground">{{ t("automationCenter.dailyTime") }}</span>
                  <Input v-model="dailyTime" type="time" :disabled="scheduleType !== 'dailyTime'" @input="updateSchedule" />
                </label>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <label class="space-y-1 text-sm">
                  <span class="text-muted-foreground">{{ t("automationCenter.connection") }}</span>
                  <Select :model-value="payloadValue('connectionId')" @update:model-value="(value) => updatePayload('connectionId', String(value))">
                    <SelectTrigger><SelectValue :placeholder="t('automationCenter.selectConnection')" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="connection in connectionStore.connections" :key="connection.id" :value="connection.id">{{ connection.name }}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label class="space-y-1 text-sm">
                  <span class="text-muted-foreground">{{ t("automationCenter.database") }}</span>
                  <Input :model-value="payloadValue('database')" @update:model-value="(value) => updatePayload('database', String(value))" />
                </label>
              </div>

              <label class="block space-y-1 text-sm">
                <span class="text-muted-foreground">{{ t("automationCenter.sql") }}</span>
                <textarea class="h-36 w-full resize-none rounded-md border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring" :value="payloadValue('sql')" @input="(event) => updatePayload('sql', (event.target as HTMLTextAreaElement).value)" />
              </label>

              <div class="grid grid-cols-2 gap-3">
                <label class="space-y-1 text-sm">
                  <span class="text-muted-foreground">{{ t("automationCenter.outputPath") }}</span>
                  <Input :model-value="payloadValue('outputPath')" @update:model-value="(value) => updatePayload('outputPath', String(value))" />
                </label>
                <label class="space-y-1 text-sm">
                  <span class="text-muted-foreground">{{ t("automationCenter.syncMode") }}</span>
                  <Input :model-value="payloadValue('syncMode')" placeholder="webdav-upload / saved-sql-directory / data-compare" @update:model-value="(value) => updatePayload('syncMode', String(value))" />
                </label>
              </div>

              <label class="block space-y-1 text-sm">
                <span class="text-muted-foreground">{{ t("automationCenter.payloadJson") }}</span>
                <textarea class="h-40 w-full resize-none rounded-md border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring" :value="payloadText" @input="(event) => onPayloadTextInput((event.target as HTMLTextAreaElement).value)" />
                <span v-if="payloadError" class="text-xs text-destructive">{{ payloadError }}</span>
              </label>
            </section>

            <aside class="space-y-4">
              <div class="rounded-md border p-4">
                <div class="mb-3 flex items-center justify-between">
                  <span class="text-sm font-medium">{{ t("automationCenter.enabled") }}</span>
                  <Switch :model-value="draft.enabled" @update:model-value="(value: boolean) => toggleEnabled(value)" />
                </div>
                <div class="space-y-2 text-sm text-muted-foreground">
                  <div>{{ t("automationCenter.nextRun") }}: {{ formatTime(draft.nextRunAt) }}</div>
                  <div>{{ t("automationCenter.lastRun") }}: {{ formatTime(draft.lastRunAt) }}</div>
                </div>
              </div>

              <div class="rounded-md border p-4">
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-sm font-medium">{{ t("automationCenter.riskCheck") }}</span>
                  <Badge :variant="plan.safety === 'critical' ? 'destructive' : plan.safety === 'ok' ? 'default' : 'secondary'">{{ plan.safety }}</Badge>
                </div>
                <div class="text-sm text-muted-foreground">{{ plan.reasons.length ? plan.reasons.map(reasonLabel).join(", ") : t("automationCenter.ready") }}</div>
              </div>

              <div class="flex flex-wrap gap-2">
                <Button class="gap-2" @click="saveJob">{{ t("automationCenter.save") }}</Button>
                <Button variant="outline" class="gap-2" @click="runNow"><Play class="h-4 w-4" />{{ t("automationCenter.runNow") }}</Button>
                <Button variant="outline" size="icon" :title="t('automationCenter.duplicate')" @click="duplicateJob"><Copy class="h-4 w-4" /></Button>
                <Button variant="destructive" size="icon" :disabled="!draft.id" :title="t('automationCenter.delete')" @click="removeJob"><Trash2 class="h-4 w-4" /></Button>
              </div>
            </aside>
          </div>

          <section class="min-h-[170px] border-t p-4">
            <div class="mb-3 text-sm font-medium">{{ t("automationCenter.runHistory") }}</div>
            <div class="max-h-36 overflow-auto rounded-md border">
              <div v-for="record in selectedRecords" :key="record.id" class="grid grid-cols-[120px_180px_1fr] gap-3 border-b p-2 text-xs last:border-b-0">
                <span :class="record.status === 'error' ? 'text-destructive' : 'text-emerald-600'">{{ record.status }}</span>
                <span class="text-muted-foreground">{{ formatTime(record.finishedAt || record.startedAt) }}</span>
                <span class="truncate"
                  >{{ record.message || record.error }}<template v-if="record.qualityProfile"> · {{ t("automationCenter.qualityRows", { count: record.qualityProfile.rowCount }) }}</template></span
                >
              </div>
              <div v-if="!selectedRecords.length" class="p-4 text-center text-sm text-muted-foreground">{{ t("automationCenter.noRuns") }}</div>
            </div>
          </section>
        </main>
      </div>
    </DialogContent>
  </Dialog>
</template>
