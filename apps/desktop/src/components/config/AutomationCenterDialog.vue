<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Copy, Download, FolderOpen, Play, Plus, Trash2, Upload, Workflow } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import * as api from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import { useConnectionStore } from "@/stores/connectionStore";
import { useToast } from "@/composables/useToast";
import { useAutomationScheduler } from "@/composables/useAutomationScheduler";
import {
  buildAutomationRunPlan,
  clearAutomationRunRecords,
  computeNextAutomationRunAt,
  deleteAutomationJob,
  exportAutomationBundle,
  importAutomationBundle,
  normalizeAutomationExecutionOptions,
  readAutomationJobs,
  readAutomationRunRecords,
  upsertAutomationJob,
  type AutomationJob,
  type AutomationJobKind,
  type AutomationNotifyPolicy,
  type AutomationRunRecord,
  type AutomationSchedule,
} from "@/lib/workspaceAutomation";
import type { WebDavConfig } from "@/lib/tauri";

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
const weeklyDaysText = ref("1,2,3,4,5");
const monthlyDay = ref(1);
const payloadText = ref("{}");
const payloadError = ref("");
const webDavPassword = ref("");
const webDavHasSavedPassword = ref(false);
const webDavStatusBusy = ref(false);
const webDavBusy = ref<"" | "test" | "save-password">("");
const bundleBusy = ref<"" | "import" | "export">("");
const importMode = ref<"merge" | "replace">("merge");
const historyStatus = ref<"all" | "success" | "error">("all");
const expandedRunRecordId = ref("");
const weekdayItems = [0, 1, 2, 3, 4, 5, 6];

const selectedJob = computed(() => jobs.value.find((job) => job.id === selectedJobId.value));
const selectedConnection = computed(() => {
  if (draft.value.kind === "sync" && payloadValue("syncMode") === "data-compare") {
    return connectionStore.getConfig(payloadValue("targetConnectionId"));
  }
  return connectionStore.getConfig(payloadValue("connectionId"));
});
const selectedSourceConnection = computed(() => connectionStore.getConfig(payloadValue("sourceConnectionId")));
const plan = computed(() =>
  buildAutomationRunPlan(
    draft.value,
    selectedConnection.value,
    draft.value.kind === "sync" && payloadValue("syncMode") === "data-compare"
      ? {
          sourceConnection: selectedSourceConnection.value,
          targetConnection: selectedConnection.value,
        }
      : {},
  ),
);
const selectedRecords = computed(() =>
  records.value
    .filter((record) => record.jobId === draft.value.id)
    .filter((record) => historyStatus.value === "all" || record.status === historyStatus.value)
    .slice(0, 20),
);
const selectedJobRecordCount = computed(() => records.value.filter((record) => record.jobId === draft.value.id).length);
const draftRunning = computed(() => !!draft.value.id && scheduler.runningJobIds.value.has(draft.value.id));
const kindItems: AutomationJobKind[] = ["sql", "export", "sync", "quality-check"];
const notifyItems: AutomationNotifyPolicy[] = ["failure", "always", "never"];
const exportModeItems = ["query", "table"];
const queryExportFormatItems = ["csv", "xlsx", "json", "markdown"];
const tableExportFormatItems = ["csv", "xlsx", "json", "markdown", "sql"];
const syncModeItems = ["webdav-upload", "webdav-download", "saved-sql-directory", "data-compare"];
const syncExecutionModeItems = ["execute", "preview"];
const templateItems = ["current-sql", "daily-export", "quality-check", "webdav-upload", "saved-sql-directory", "data-compare-preview"] as const;
type AutomationTemplateId = (typeof templateItems)[number];
const selectedTemplateId = ref<AutomationTemplateId>("current-sql");
const webDavStatusKey = computed(() => {
  if (draft.value.kind !== "sync" || (payloadValue("syncMode") !== "webdav-upload" && payloadValue("syncMode") !== "webdav-download")) return "";
  const config = currentWebDavConfig();
  if (!config?.endpoint) return "";
  return `${config.endpoint}|${config.username || ""}|${config.remotePath || ""}`;
});

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

watch(webDavStatusKey, () => {
  void refreshWebDavPasswordStatus();
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
    execution: {
      timeoutSeconds: 0,
      retryCount: 0,
      retryDelaySeconds: 0,
      notifyOn: "failure",
    },
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

function applyTemplate(templateId: AutomationTemplateId) {
  const job = newJob("sql");
  if (templateId === "current-sql") {
    job.name = t("automationCenter.template.current-sql.name");
    job.payload = {
      connectionId: props.activeConnectionId || "",
      database: props.activeDatabase || "",
      schema: props.activeSchema || "",
      sql: props.activeSql || "select 1",
    };
  } else if (templateId === "daily-export") {
    job.kind = "export";
    job.name = t("automationCenter.template.daily-export.name");
    job.schedule = { type: "dailyTime", dailyTime: "09:00" };
    job.payload = {
      connectionId: props.activeConnectionId || "",
      database: props.activeDatabase || "",
      schema: props.activeSchema || "",
      sql: props.activeSql || "select 1",
      exportMode: "query",
      format: "csv",
      outputPath: "",
    };
  } else if (templateId === "quality-check") {
    job.kind = "quality-check";
    job.name = t("automationCenter.template.quality-check.name");
    job.schedule = { type: "dailyTime", dailyTime: "09:00" };
    job.payload = {
      connectionId: props.activeConnectionId || "",
      database: props.activeDatabase || "",
      schema: props.activeSchema || "",
      sql: props.activeSql || "select 1",
    };
  } else if (templateId === "webdav-upload") {
    job.kind = "sync";
    job.name = t("automationCenter.template.webdav-upload.name");
    job.schedule = { type: "dailyTime", dailyTime: "09:00" };
    job.payload = {
      syncMode: "webdav-upload",
      webDavConfig: {
        endpoint: "",
        username: "",
        remotePath: "DBX/sync",
      },
    };
  } else if (templateId === "saved-sql-directory") {
    job.kind = "sync";
    job.name = t("automationCenter.template.saved-sql-directory.name");
    job.schedule = { type: "dailyTime", dailyTime: "09:00" };
    job.payload = {
      syncMode: "saved-sql-directory",
      targetDir: "",
    };
  } else if (templateId === "data-compare-preview") {
    job.kind = "sync";
    job.name = t("automationCenter.template.data-compare-preview.name");
    job.payload = {
      syncMode: "data-compare",
      syncExecutionMode: "preview",
      sourceConnectionId: "",
      sourceDatabase: "",
      sourceSchema: "",
      sourceTable: "",
      targetConnectionId: "",
      targetDatabase: "",
      targetSchema: "",
      targetTable: "",
      columns: [],
      keyColumns: [],
    };
  }
  selectedJobId.value = "";
  loadDraft(job);
}

function applySelectedTemplate() {
  applyTemplate(selectedTemplateId.value);
}

function loadDraft(job: AutomationJob) {
  draft.value = {
    ...cloneAutomationJob(job),
    execution: normalizeAutomationExecutionOptions(job.execution),
  };
  scheduleType.value = job.schedule.type;
  intervalMinutes.value = job.schedule.type === "intervalMinutes" ? job.schedule.intervalMinutes : 30;
  dailyTime.value = job.schedule.type === "dailyTime" || job.schedule.type === "weekly" || job.schedule.type === "monthly" ? job.schedule.dailyTime : "09:00";
  weeklyDaysText.value = job.schedule.type === "weekly" ? job.schedule.daysOfWeek.join(",") : "1,2,3,4,5";
  monthlyDay.value = job.schedule.type === "monthly" ? job.schedule.dayOfMonth : 1;
  payloadText.value = JSON.stringify(job.payload, null, 2);
  payloadError.value = "";
  webDavPassword.value = "";
  webDavHasSavedPassword.value = false;
  expandedRunRecordId.value = "";
  void refreshWebDavPasswordStatus();
}

function executionNumber(key: "timeoutSeconds" | "retryCount" | "retryDelaySeconds"): number {
  return normalizeAutomationExecutionOptions(draft.value.execution)[key];
}

function updateExecutionNumber(key: "timeoutSeconds" | "retryCount" | "retryDelaySeconds", value: string | number) {
  const numericValue = Math.max(0, Number(value) || 0);
  draft.value = {
    ...draft.value,
    execution: normalizeAutomationExecutionOptions({
      ...draft.value.execution,
      [key]: key === "retryCount" ? Math.floor(numericValue) : numericValue,
    }),
  };
}

function updateNotifyPolicy(value: unknown) {
  if (value !== "never" && value !== "failure" && value !== "always") return;
  draft.value = {
    ...draft.value,
    execution: normalizeAutomationExecutionOptions({
      ...draft.value.execution,
      notifyOn: value,
    }),
  };
}

function exportFormatItems() {
  return (payloadValue("exportMode") || "query") === "table" ? tableExportFormatItems : queryExportFormatItems;
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

function payloadArrayText(key: string): string {
  const payload = draft.value.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const value = (payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.join(", ") : "";
}

function updatePayloadArray(key: string, value: string) {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const next = { ...(draft.value.payload as Record<string, unknown>), [key]: items };
  draft.value = { ...draft.value, payload: next };
  payloadText.value = JSON.stringify(next, null, 2);
  payloadError.value = "";
}

function updatePayloadObject(key: string, value: string) {
  try {
    const parsed = value.trim() ? JSON.parse(value) : undefined;
    if (parsed !== undefined && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) throw new Error("object required");
    const next = { ...(draft.value.payload as Record<string, unknown>) };
    if (parsed === undefined) delete next[key];
    else next[key] = parsed;
    draft.value = { ...draft.value, payload: next };
    payloadText.value = JSON.stringify(next, null, 2);
    payloadError.value = "";
  } catch (error) {
    payloadError.value = error instanceof Error ? error.message : String(error);
  }
}

function webDavValue(key: keyof WebDavConfig): string {
  const value = currentWebDavConfig()?.[key];
  return typeof value === "string" ? value : "";
}

function updateWebDavConfig(key: keyof WebDavConfig, value: string) {
  const nextConfig = {
    endpoint: "",
    remotePath: "DBX/sync",
    ...currentWebDavConfig(),
    [key]: value,
  };
  updatePayloadObject("webDavConfig", JSON.stringify(nextConfig, null, 2));
}

function updateSchedule() {
  let schedule: AutomationSchedule = { type: "manual" };
  if (scheduleType.value === "intervalMinutes") {
    schedule = { type: "intervalMinutes", intervalMinutes: Math.max(1, Number(intervalMinutes.value) || 1) };
  } else if (scheduleType.value === "dailyTime") {
    schedule = { type: "dailyTime", dailyTime: dailyTime.value || "09:00" };
  } else if (scheduleType.value === "weekly") {
    schedule = {
      type: "weekly",
      daysOfWeek: weeklyDaysText.value
        .split(",")
        .map((day) => Math.floor(Number(day.trim())))
        .filter((day) => day >= 0 && day <= 6),
      dailyTime: dailyTime.value || "09:00",
    };
  } else if (scheduleType.value === "monthly") {
    schedule = {
      type: "monthly",
      dayOfMonth: Math.max(1, Math.min(31, Math.floor(Number(monthlyDay.value) || 1))),
      dailyTime: dailyTime.value || "09:00",
    };
  }
  draft.value = {
    ...draft.value,
    schedule,
    nextRunAt: draft.value.enabled ? computeNextAutomationRunAt(schedule) : undefined,
  };
}

function weekdayLabel(day: number) {
  return t(`automationCenter.weekday.${day}`);
}

function selectedWeekdays(): number[] {
  return weeklyDaysText.value
    .split(",")
    .map((day) => Math.floor(Number(day.trim())))
    .filter((day) => day >= 0 && day <= 6)
    .filter((day, index, days) => days.indexOf(day) === index)
    .sort((a, b) => a - b);
}

function toggleWeekday(day: number) {
  const days = new Set(selectedWeekdays());
  if (days.has(day)) days.delete(day);
  else days.add(day);
  weeklyDaysText.value = Array.from(days)
    .sort((a, b) => a - b)
    .join(",");
  updateSchedule();
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

function persistDraft(showSavedToast = true): AutomationJob | undefined {
  if (payloadError.value) {
    toast(t("automationCenter.toast.fixPayload"), 2200);
    return undefined;
  }
  updateSchedule();
  if (draft.value.enabled && !plan.value.valid) {
    toast(t("automationCenter.toast.fixPlan"), 2600);
    return undefined;
  }
  jobs.value = upsertAutomationJob(cloneAutomationJob(draft.value));
  const savedJob = jobs.value[0];
  selectedJobId.value = savedJob?.id || "";
  refresh();
  if (showSavedToast) toast(t("automationCenter.toast.saved"), 1800);
  return savedJob;
}

function saveJob() {
  persistDraft(true);
}

function duplicateJob() {
  const copy = cloneAutomationJob(draft.value);
  copy.id = "";
  copy.name = `${copy.name || kindLabel(copy.kind)} copy`;
  copy.enabled = false;
  loadDraft(copy);
}

function cloneAutomationJob(job: AutomationJob): AutomationJob {
  return JSON.parse(JSON.stringify(job)) as AutomationJob;
}

function removeJob() {
  if (!draft.value.id) return;
  jobs.value = deleteAutomationJob(draft.value.id);
  selectedJobId.value = jobs.value[0]?.id || "";
  refresh();
}

function clearCurrentHistory() {
  if (!draft.value.id) return;
  clearAutomationRunRecords({ jobId: draft.value.id });
  refresh();
  toast(t("automationCenter.toast.historyCleared"), 1600);
}

function clearAllHistory() {
  clearAutomationRunRecords();
  refresh();
  toast(t("automationCenter.toast.historyCleared"), 1600);
}

function toggleEnabled(value: boolean) {
  draft.value = { ...draft.value, enabled: value };
  updateSchedule();
}

async function runNow() {
  updateSchedule();
  if (!plan.value.valid) {
    toast(t("automationCenter.toast.fixRunPlan"), 2600);
    return;
  }
  const savedJob = persistDraft(false);
  if (!savedJob) return;
  const job = readAutomationJobs().find((item) => item.id === selectedJobId.value) || savedJob;
  const record = await scheduler.executeJob(job, false);
  refresh();
  toast(record.status === "success" ? t("automationCenter.toast.runSuccess") : t("automationCenter.toast.runFailed", { name: job.name, message: record.error || "" }), record.status === "success" ? 1800 : 4200);
}

async function exportBundle() {
  bundleBusy.value = "export";
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const filePath = await save({
      defaultPath: `dbx-automation-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!filePath) return;
    const bundle = exportAutomationBundle({ includeHistory: true });
    await writeTextFile(filePath, JSON.stringify(bundle, null, 2));
    toast(t("automationCenter.toast.exported"), 1800);
  } catch (error) {
    toast(t("automationCenter.toast.exportFailed", { message: errorMessage(error) }), 4200);
  } finally {
    bundleBusy.value = "";
  }
}

async function importBundle() {
  bundleBusy.value = "import";
  try {
    const { open: openFile } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const filePath = await openFile({
      multiple: false,
      directory: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!filePath || Array.isArray(filePath)) return;
    const text = await readTextFile(filePath);
    importAutomationBundle(text, { mode: importMode.value });
    refresh();
    toast(t("automationCenter.toast.imported"), 1800);
  } catch (error) {
    toast(t("automationCenter.toast.importFailed", { message: errorMessage(error) }), 4200);
  } finally {
    bundleBusy.value = "";
  }
}

async function chooseOutputPath() {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const format = payloadValue("format") || "csv";
    const filePath = await save({
      defaultPath: `dbx-export.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (filePath) updatePayload("outputPath", filePath);
  } catch (error) {
    toast(t("automationCenter.toast.pathSelectFailed", { message: errorMessage(error) }), 4200);
  }
}

async function chooseTargetDir() {
  try {
    const { open: openPath } = await import("@tauri-apps/plugin-dialog");
    const dir = await openPath({ directory: true, multiple: false });
    if (dir && !Array.isArray(dir)) updatePayload("targetDir", dir);
  } catch (error) {
    toast(t("automationCenter.toast.pathSelectFailed", { message: errorMessage(error) }), 4200);
  }
}

function currentWebDavConfig(): WebDavConfig | undefined {
  const payload = draft.value.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const value = (payload as Record<string, unknown>).webDavConfig;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as WebDavConfig;
}

async function testWebDavConfig() {
  const config = currentWebDavConfig();
  if (!config) {
    toast(reasonLabel("webdav_config_required"), 2200);
    return;
  }
  webDavBusy.value = "test";
  try {
    await api.webdavSyncTest({ ...config, password: webDavPassword.value || config.password });
    toast(t("automationCenter.toast.webdavTestSuccess"), 1800);
  } catch (error) {
    toast(t("automationCenter.toast.webdavTestFailed", { message: errorMessage(error) }), 4200);
  } finally {
    webDavBusy.value = "";
  }
}

async function saveWebDavPassword() {
  const config = currentWebDavConfig();
  if (!config || !webDavPassword.value) {
    toast(t("automationCenter.toast.webdavPasswordRequired"), 2200);
    return;
  }
  webDavBusy.value = "save-password";
  try {
    await api.saveWebdavSavedPassword(config, webDavPassword.value);
    const { password: _password, ...nextConfig } = config;
    updatePayloadObject("webDavConfig", JSON.stringify(nextConfig, null, 2));
    webDavHasSavedPassword.value = true;
    webDavPassword.value = "";
    toast(t("automationCenter.toast.webdavPasswordSaved"), 1800);
  } catch (error) {
    toast(t("automationCenter.toast.webdavPasswordFailed", { message: errorMessage(error) }), 4200);
  } finally {
    webDavBusy.value = "";
  }
}

function kindLabel(kind: string) {
  const key = `automationCenter.kind.${kind}`;
  return te(key) ? t(key) : kind;
}

function reasonLabel(reason: string) {
  const key = `automationCenter.reason.${reason}`;
  return te(key) ? t(key) : reason;
}

function reasonFixLabel(reason: string) {
  const key = `automationCenter.reasonFix.${reason}`;
  return te(key) ? t(key) : t("automationCenter.reasonFix.default");
}

function canQuickFixReason(reason: string) {
  return (reason === "connection_required" && connectionStore.connections.length > 0) || (reason === "sql_required" && !!props.activeSql) || reason === "sync_execution_mode_invalid" || reason === "production_write_automation" || reason === "format_invalid" || reason === "export_mode_invalid";
}

function quickFixReason(reason: string) {
  if (reason === "connection_required") updatePayload("connectionId", connectionStore.connections[0]?.id || "");
  if (reason === "sql_required") updatePayload("sql", props.activeSql || "select 1");
  if (reason === "sync_execution_mode_invalid" || reason === "production_write_automation") updatePayload("syncExecutionMode", "preview");
  if (reason === "format_invalid") updatePayload("format", "csv");
  if (reason === "export_mode_invalid") updatePayload("exportMode", "query");
  updateSchedule();
}

function scheduleSummary() {
  if (draft.value.schedule.type === "manual") return t("automationCenter.scheduleSummary.manual");
  if (draft.value.schedule.type === "intervalMinutes") return t("automationCenter.scheduleSummary.interval", { count: draft.value.schedule.intervalMinutes });
  if (draft.value.schedule.type === "dailyTime") return t("automationCenter.scheduleSummary.daily", { time: draft.value.schedule.dailyTime });
  if (draft.value.schedule.type === "weekly") return t("automationCenter.scheduleSummary.weekly", { days: draft.value.schedule.daysOfWeek.map(weekdayLabel).join(", "), time: draft.value.schedule.dailyTime });
  return t("automationCenter.scheduleSummary.monthly", { day: draft.value.schedule.dayOfMonth, time: draft.value.schedule.dailyTime });
}

function formatTime(value?: string) {
  if (!value) return t("automationCenter.notScheduled");
  return new Date(value).toLocaleString();
}

function formatDuration(durationMs?: number) {
  if (durationMs === undefined) return "";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

function lastRecord(jobId: string) {
  return records.value.find((record) => record.jobId === jobId);
}

function syncSqlPreview(record: AutomationRunRecord): string {
  return record.syncPlan?.syncSqlPreview.trim().replace(/\s+/g, " ").slice(0, 180) || "";
}

function qualitySummary(record: AutomationRunRecord): string {
  const profile = record.qualityProfile;
  if (!profile) return "";
  const findings = profile.columnProfiles
    .filter((column) => column.nullCount > 0 || column.duplicateCount > 0)
    .sort((a, b) => b.nullRate - a.nullRate || b.duplicateCount - a.duplicateCount || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((column) => `${column.name}: ${Math.round(column.nullRate * 100)}% null, ${column.duplicateCount} dup`);
  return findings.length ? findings.join("; ") : t("automationCenter.qualityNoFindings");
}

function toggleRunRecord(recordId: string) {
  expandedRunRecordId.value = expandedRunRecordId.value === recordId ? "" : recordId;
}

async function copyRunRecordDetails(record: AutomationRunRecord) {
  const parts = [
    `status: ${record.status}`,
    `startedAt: ${record.startedAt}`,
    record.finishedAt ? `finishedAt: ${record.finishedAt}` : "",
    record.durationMs !== undefined ? `durationMs: ${record.durationMs}` : "",
    record.message ? `message: ${record.message}` : "",
    record.error ? `error: ${record.error}` : "",
    record.syncPlan?.syncSqlPreview ? `syncSql:\n${record.syncPlan.syncSqlPreview}` : "",
    record.qualityProfile ? `quality:\n${qualitySummary(record)}` : "",
  ].filter(Boolean);
  await copyToClipboard(parts.join("\n\n"));
  toast(t("automationCenter.toast.copied"), 1600);
}

async function refreshWebDavPasswordStatus() {
  const config = currentWebDavConfig();
  if (!config?.endpoint || draft.value.kind !== "sync" || (payloadValue("syncMode") !== "webdav-upload" && payloadValue("syncMode") !== "webdav-download")) {
    webDavHasSavedPassword.value = false;
    return;
  }
  webDavStatusBusy.value = true;
  try {
    const status = await api.webdavPasswordStatus(config);
    webDavHasSavedPassword.value = status.hasSavedPassword;
  } catch {
    webDavHasSavedPassword.value = false;
  } finally {
    webDavStatusBusy.value = false;
  }
}

async function forgetWebDavPassword() {
  const config = currentWebDavConfig();
  if (!config) return;
  webDavBusy.value = "save-password";
  try {
    await api.forgetWebdavSavedPassword(config);
    webDavHasSavedPassword.value = false;
    webDavPassword.value = "";
    toast(t("automationCenter.toast.webdavPasswordForgotten"), 1800);
  } catch (error) {
    toast(t("automationCenter.toast.webdavPasswordFailed", { message: errorMessage(error) }), 4200);
  } finally {
    webDavBusy.value = "";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex h-[88vh] max-h-[900px] w-[min(96vw,1240px)] !max-w-[min(96vw,1240px)] flex-col overflow-hidden p-0 sm:!max-w-[min(96vw,1240px)]">
      <DialogHeader class="border-b bg-muted/20 px-5 py-4">
        <div class="flex flex-col gap-3 pr-8 sm:flex-row sm:items-center sm:justify-between">
          <DialogTitle class="flex items-center gap-2 text-lg">
            <Workflow class="h-5 w-5" />
            {{ t("automationCenter.title") }}
          </DialogTitle>
          <div class="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button size="sm" variant="outline" class="h-8" @click="createFromCurrentSql">{{ t("automationCenter.fromCurrentSqlShort") }}</Button>
            <Button size="sm" class="h-8 gap-2" @click="createJob()"><Plus class="h-4 w-4" />{{ t("automationCenter.newJob") }}</Button>
          </div>
        </div>
      </DialogHeader>

      <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside class="flex min-h-0 flex-col border-r bg-muted/10">
          <div class="border-b px-4 py-3">
            <div class="text-xs font-medium uppercase text-muted-foreground">{{ t("automationCenter.jobs") }}</div>
          </div>
          <div class="min-h-0 flex-1 overflow-auto p-3">
            <button v-for="job in jobs" :key="job.id" type="button" class="mb-2 w-full rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/60" :class="{ 'border-primary bg-accent shadow-sm': job.id === draft.id }" @click="selectedJobId = job.id">
              <div class="flex items-center justify-between gap-2">
                <div class="truncate text-sm font-medium">{{ job.name }}</div>
                <Badge :variant="job.enabled ? 'default' : 'secondary'">{{ job.enabled ? t("automationCenter.enabled") : t("automationCenter.disabled") }}</Badge>
              </div>
              <div class="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{{ kindLabel(job.kind) }}</span>
                <span class="truncate">{{ formatTime(job.nextRunAt) }}</span>
              </div>
              <div class="mt-2 truncate text-xs" :class="lastRecord(job.id)?.status === 'error' ? 'text-destructive' : 'text-muted-foreground'">
                {{ lastRecord(job.id)?.message || lastRecord(job.id)?.error || t("automationCenter.noRuns") }}
              </div>
            </button>
            <div v-if="!jobs.length" class="p-6 text-center text-sm text-muted-foreground">{{ t("automationCenter.empty") }}</div>
          </div>
        </aside>

        <main class="flex min-h-0 flex-col overflow-auto bg-background xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:overflow-hidden">
          <section class="shrink-0 p-5 xl:min-h-0 xl:shrink xl:overflow-auto">
            <div class="mx-auto max-w-[760px] space-y-5">
              <section class="space-y-3 rounded-md border bg-muted/10 p-3">
                <div class="flex items-center justify-between border-b pb-2">
                  <h3 class="text-sm font-semibold">{{ t("automationCenter.templateTitle") }}</h3>
                  <span class="text-xs text-muted-foreground">{{ t("automationCenter.templateHint") }}</span>
                </div>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div class="space-y-1">
                    <Select v-model="selectedTemplateId">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="template in templateItems" :key="template" :value="template">{{ t(`automationCenter.template.${template}.name`) }}</SelectItem>
                      </SelectContent>
                    </Select>
                    <div class="text-xs leading-5 text-muted-foreground">{{ t(`automationCenter.template.${selectedTemplateId}.description`) }}</div>
                  </div>
                  <Button type="button" class="md:self-start" @click="applySelectedTemplate">{{ t("automationCenter.useTemplate") }}</Button>
                </div>
              </section>

              <section class="space-y-3">
                <div class="flex items-center justify-between border-b pb-2">
                  <h3 class="text-sm font-semibold">{{ t("automationCenter.sectionBasic") }}</h3>
                  <Badge :variant="draft.enabled ? 'default' : 'secondary'">{{ draft.enabled ? t("automationCenter.enabled") : t("automationCenter.disabled") }}</Badge>
                </div>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                  <label class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.name") }}</span>
                    <Input v-model="draft.name" />
                  </label>
                  <label class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.kindLabel") }}</span>
                    <Select v-model="draft.kind">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="kind in kindItems" :key="kind" :value="kind">{{ kindLabel(kind) }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.schedule") }}</span>
                    <Select v-model="scheduleType" @update:model-value="updateSchedule">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">{{ t("automationCenter.scheduleManual") }}</SelectItem>
                        <SelectItem value="intervalMinutes">{{ t("automationCenter.scheduleInterval") }}</SelectItem>
                        <SelectItem value="dailyTime">{{ t("automationCenter.scheduleDaily") }}</SelectItem>
                        <SelectItem value="weekly">{{ t("automationCenter.scheduleWeekly") }}</SelectItem>
                        <SelectItem value="monthly">{{ t("automationCenter.scheduleMonthly") }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label v-if="scheduleType === 'intervalMinutes'" class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.intervalMinutes") }}</span>
                    <Input v-model.number="intervalMinutes" type="number" min="1" @input="updateSchedule" />
                  </label>
                  <label v-if="scheduleType === 'dailyTime' || scheduleType === 'weekly' || scheduleType === 'monthly'" class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.dailyTime") }}</span>
                    <Input v-model="dailyTime" type="time" @input="updateSchedule" />
                  </label>
                </div>
                <div v-if="scheduleType === 'weekly' || scheduleType === 'monthly'" class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div v-if="scheduleType === 'weekly'" class="space-y-2 text-sm md:col-span-2">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.weeklyDays") }}</span>
                    <div class="grid grid-cols-7 gap-2">
                      <Button v-for="day in weekdayItems" :key="day" type="button" size="sm" :variant="selectedWeekdays().includes(day) ? 'default' : 'outline'" class="h-8 px-0 text-xs" @click="toggleWeekday(day)">
                        {{ weekdayLabel(day) }}
                      </Button>
                    </div>
                  </div>
                  <label v-if="scheduleType === 'monthly'" class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.monthlyDay") }}</span>
                    <Input v-model.number="monthlyDay" type="number" min="1" max="31" @input="updateSchedule" />
                  </label>
                </div>
              </section>

              <section class="space-y-3">
                <div class="border-b pb-2">
                  <h3 class="text-sm font-semibold">{{ t("automationCenter.sectionTarget") }}</h3>
                </div>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label v-if="draft.kind !== 'sync' || payloadValue('syncMode') !== 'data-compare'" class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.connection") }}</span>
                    <Select :model-value="payloadValue('connectionId')" @update:model-value="(value) => updatePayload('connectionId', String(value))">
                      <SelectTrigger><SelectValue :placeholder="t('automationCenter.selectConnection')" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="connection in connectionStore.connections" :key="connection.id" :value="connection.id">{{ connection.name }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.database") }}</span>
                    <Input :model-value="payloadValue('database')" @update:model-value="(value) => updatePayload('database', String(value))" />
                  </label>
                  <label v-if="draft.kind === 'export'" class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.exportMode") }}</span>
                    <Select :model-value="payloadValue('exportMode') || 'query'" @update:model-value="(value) => updatePayload('exportMode', String(value))">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="item in exportModeItems" :key="item" :value="item">{{ t(`automationCenter.exportModeOption.${item}`) }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label v-if="draft.kind === 'export'" class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.format") }}</span>
                    <Select :model-value="payloadValue('format') || 'csv'" @update:model-value="(value) => updatePayload('format', String(value))">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="item in exportFormatItems()" :key="item" :value="item">{{ item.toUpperCase() }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label v-if="draft.kind === 'export' && (payloadValue('exportMode') || 'query') === 'table'" class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.table") }}</span>
                    <Input :model-value="payloadValue('table')" @update:model-value="(value) => updatePayload('table', String(value))" />
                  </label>
                  <label v-if="draft.kind === 'export'" class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.outputPath") }}</span>
                    <div class="flex gap-2">
                      <Input :model-value="payloadValue('outputPath')" @update:model-value="(value) => updatePayload('outputPath', String(value))" />
                      <Button type="button" variant="outline" size="icon" :title="t('automationCenter.choosePath')" @click="chooseOutputPath"><FolderOpen class="h-4 w-4" /></Button>
                    </div>
                  </label>
                  <label v-if="draft.kind === 'sync'" class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.syncMode") }}</span>
                    <Select :model-value="payloadValue('syncMode')" @update:model-value="(value) => updatePayload('syncMode', String(value))">
                      <SelectTrigger><SelectValue :placeholder="t('automationCenter.syncMode')" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="item in syncModeItems" :key="item" :value="item">{{ t(`automationCenter.syncModeOption.${item}`) }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label v-if="draft.kind === 'sync' && (payloadValue('syncMode') === 'webdav-upload' || payloadValue('syncMode') === 'webdav-download')" class="space-y-1 text-sm md:col-span-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="text-xs text-muted-foreground">{{ t("automationCenter.webDavConfig") }}</span>
                      <Badge :variant="webDavHasSavedPassword ? 'default' : 'secondary'">
                        {{ webDavStatusBusy ? t("automationCenter.webDavPasswordChecking") : webDavHasSavedPassword ? t("automationCenter.webDavPasswordSavedStatus") : t("automationCenter.webDavPasswordNotSaved") }}
                      </Badge>
                    </div>
                    <div class="grid grid-cols-1 gap-2 rounded-md border bg-muted/10 p-3 md:grid-cols-2">
                      <label class="space-y-1">
                        <span class="text-xs text-muted-foreground">{{ t("automationCenter.webDavEndpoint") }}</span>
                        <Input :model-value="webDavValue('endpoint')" placeholder="https://example.com/webdav" @update:model-value="(value) => updateWebDavConfig('endpoint', String(value))" />
                      </label>
                      <label class="space-y-1">
                        <span class="text-xs text-muted-foreground">{{ t("automationCenter.webDavUsername") }}</span>
                        <Input :model-value="webDavValue('username')" @update:model-value="(value) => updateWebDavConfig('username', String(value))" />
                      </label>
                      <label class="space-y-1 md:col-span-2">
                        <span class="text-xs text-muted-foreground">{{ t("automationCenter.webDavRemotePath") }}</span>
                        <Input :model-value="webDavValue('remotePath')" placeholder="DBX/sync" @update:model-value="(value) => updateWebDavConfig('remotePath', String(value))" />
                      </label>
                    </div>
                    <div class="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <Input v-model="webDavPassword" type="password" :placeholder="t('automationCenter.webDavPasswordPlaceholder')" />
                      <Button type="button" variant="outline" :disabled="webDavBusy === 'test'" @click="testWebDavConfig">{{ t("automationCenter.testWebDav") }}</Button>
                      <Button type="button" variant="outline" :disabled="webDavBusy === 'save-password'" @click="saveWebDavPassword">{{ t("automationCenter.saveWebDavPassword") }}</Button>
                      <Button v-if="webDavHasSavedPassword" type="button" variant="outline" class="md:col-start-2 md:col-span-2" :disabled="webDavBusy === 'save-password'" @click="forgetWebDavPassword">{{ t("automationCenter.forgetWebDavPassword") }}</Button>
                    </div>
                  </label>
                  <label v-if="draft.kind === 'sync' && payloadValue('syncMode') === 'saved-sql-directory'" class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.targetDir") }}</span>
                    <div class="flex gap-2">
                      <Input :model-value="payloadValue('targetDir')" @update:model-value="(value) => updatePayload('targetDir', String(value))" />
                      <Button type="button" variant="outline" size="icon" :title="t('automationCenter.choosePath')" @click="chooseTargetDir"><FolderOpen class="h-4 w-4" /></Button>
                    </div>
                  </label>
                </div>
                <div v-if="draft.kind === 'sync' && payloadValue('syncMode') === 'data-compare'" class="grid grid-cols-1 gap-3 rounded-md border bg-muted/10 p-3 md:grid-cols-2">
                  <label class="space-y-1 text-sm md:col-span-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="text-xs text-muted-foreground">{{ t("automationCenter.syncExecutionMode") }}</span>
                      <span class="text-xs text-muted-foreground">{{ t("automationCenter.dataCompareHint") }}</span>
                    </div>
                    <Select :model-value="payloadValue('syncExecutionMode') || 'execute'" @update:model-value="(value) => updatePayload('syncExecutionMode', String(value))">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="item in syncExecutionModeItems" :key="item" :value="item">{{ t(`automationCenter.syncExecutionModeOption.${item}`) }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.sourceConnection") }}</span>
                    <Select :model-value="payloadValue('sourceConnectionId')" @update:model-value="(value) => updatePayload('sourceConnectionId', String(value))">
                      <SelectTrigger><SelectValue :placeholder="t('automationCenter.selectConnection')" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="connection in connectionStore.connections" :key="connection.id" :value="connection.id">{{ connection.name }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.targetConnection") }}</span>
                    <Select :model-value="payloadValue('targetConnectionId')" @update:model-value="(value) => updatePayload('targetConnectionId', String(value))">
                      <SelectTrigger><SelectValue :placeholder="t('automationCenter.selectConnection')" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="connection in connectionStore.connections" :key="connection.id" :value="connection.id">{{ connection.name }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label v-for="key in ['sourceDatabase', 'sourceSchema', 'sourceTable', 'targetDatabase', 'targetSchema', 'targetTable']" :key="key" class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t(`automationCenter.dataCompare.${key}`) }}</span>
                    <Input :model-value="payloadValue(key)" @update:model-value="(value) => updatePayload(key, String(value))" />
                  </label>
                  <label class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.columns") }}</span>
                    <Input :model-value="payloadArrayText('columns')" placeholder="id, name, email" @update:model-value="(value) => updatePayloadArray('columns', String(value))" />
                  </label>
                  <label class="space-y-1 text-sm">
                    <span class="text-xs text-muted-foreground">{{ t("automationCenter.keyColumns") }}</span>
                    <Input :model-value="payloadArrayText('keyColumns')" placeholder="id" @update:model-value="(value) => updatePayloadArray('keyColumns', String(value))" />
                  </label>
                </div>
              </section>

              <section v-if="draft.kind !== 'sync' && (draft.kind !== 'export' || (payloadValue('exportMode') || 'query') !== 'table')" class="space-y-3">
                <div class="border-b pb-2">
                  <h3 class="text-sm font-semibold">{{ t("automationCenter.sql") }}</h3>
                </div>
                <textarea class="h-44 w-full resize-none rounded-md border bg-muted/20 p-3 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-ring" :value="payloadValue('sql')" @input="(event) => updatePayload('sql', (event.target as HTMLTextAreaElement).value)" />
              </section>

              <details class="rounded-md border bg-muted/10 p-3">
                <summary class="cursor-pointer text-sm font-semibold">{{ t("automationCenter.advancedConfig") }}</summary>
                <div class="mt-3 space-y-4">
                  <div class="space-y-2">
                    <div class="text-xs font-medium text-muted-foreground">{{ t("automationCenter.bundleActions") }}</div>
                    <div class="grid grid-cols-1 gap-2 sm:grid-cols-[140px_auto_auto]">
                      <Select v-model="importMode">
                        <SelectTrigger class="h-8" :title="t('automationCenter.importMode')"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="merge">{{ t("automationCenter.importMerge") }}</SelectItem>
                          <SelectItem value="replace">{{ t("automationCenter.importReplace") }}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" class="h-8 gap-2" :title="t('automationCenter.importBundle')" :disabled="bundleBusy === 'import'" @click="importBundle"><Upload class="h-4 w-4" />{{ t("automationCenter.importBundle") }}</Button>
                      <Button size="sm" variant="outline" class="h-8 gap-2" :title="t('automationCenter.exportBundle')" :disabled="bundleBusy === 'export'" @click="exportBundle"><Download class="h-4 w-4" />{{ t("automationCenter.exportBundle") }}</Button>
                    </div>
                  </div>
                  <div class="space-y-2">
                    <div class="text-xs font-medium text-muted-foreground">{{ t("automationCenter.payloadJson") }}</div>
                    <div class="text-xs text-muted-foreground">{{ t("automationCenter.payloadJsonHint") }}</div>
                    <textarea class="h-32 w-full resize-none rounded-md border bg-muted/20 p-3 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-ring" :value="payloadText" @input="(event) => onPayloadTextInput((event.target as HTMLTextAreaElement).value)" />
                    <span v-if="payloadError" class="text-xs text-destructive">{{ payloadError }}</span>
                  </div>
                </div>
              </details>
            </div>
          </section>

          <aside class="shrink-0 border-t bg-muted/10 p-4 xl:min-h-0 xl:shrink xl:overflow-auto xl:border-l xl:border-t-0">
            <div class="space-y-4">
              <section class="rounded-md border bg-background p-4 shadow-sm">
                <div class="mb-3 flex items-center justify-between">
                  <span class="text-sm font-medium">{{ t("automationCenter.enabled") }}</span>
                  <Switch :model-value="draft.enabled" @update:model-value="(value: boolean) => toggleEnabled(value)" />
                </div>
                <div class="space-y-2 text-sm text-muted-foreground">
                  <div>{{ t("automationCenter.scheduleReadable") }}: {{ scheduleSummary() }}</div>
                  <div>{{ t("automationCenter.nextRun") }}: {{ formatTime(draft.nextRunAt) }}</div>
                  <div>{{ t("automationCenter.lastRun") }}: {{ formatTime(draft.lastRunAt) }}</div>
                </div>
              </section>

              <section class="rounded-md border bg-background p-4 shadow-sm">
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-sm font-medium">{{ t("automationCenter.riskCheck") }}</span>
                  <Badge :variant="plan.safety === 'critical' ? 'destructive' : plan.safety === 'ok' ? 'default' : 'secondary'">{{ plan.safety }}</Badge>
                </div>
                <div v-if="!plan.reasons.length" class="text-sm text-muted-foreground">{{ t("automationCenter.ready") }}</div>
                <div v-else class="space-y-2">
                  <div v-for="reason in plan.reasons" :key="reason" class="rounded-md bg-muted/40 p-2 text-xs leading-5">
                    <div class="flex items-start justify-between gap-2">
                      <div class="font-medium text-foreground">{{ reasonLabel(reason) }}</div>
                      <Button v-if="canQuickFixReason(reason)" type="button" size="sm" variant="outline" class="h-6 px-2 text-[11px]" @click="quickFixReason(reason)">
                        {{ t("automationCenter.quickFix") }}
                      </Button>
                    </div>
                    <div class="text-muted-foreground">{{ reasonFixLabel(reason) }}</div>
                  </div>
                </div>
              </section>

              <section class="rounded-md border bg-background p-3 shadow-sm">
                <div class="grid grid-cols-2 gap-2">
                  <Button class="gap-2" @click="saveJob">{{ t("automationCenter.save") }}</Button>
                  <Button variant="outline" class="gap-2" :disabled="draftRunning" @click="runNow"><Play class="h-4 w-4" />{{ draftRunning ? t("automationCenter.running") : t("automationCenter.runNow") }}</Button>
                </div>
                <details class="mt-3 text-sm">
                  <summary class="cursor-pointer text-xs font-medium text-muted-foreground">{{ t("automationCenter.moreActions") }}</summary>
                  <div class="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="outline" class="gap-2" @click="duplicateJob"><Copy class="h-4 w-4" />{{ t("automationCenter.duplicate") }}</Button>
                    <Button variant="destructive" class="gap-2" :disabled="!draft.id" @click="removeJob"><Trash2 class="h-4 w-4" />{{ t("automationCenter.delete") }}</Button>
                  </div>
                </details>
              </section>

              <details class="rounded-md border bg-background p-4 shadow-sm">
                <summary class="cursor-pointer text-sm font-medium">{{ t("automationCenter.executionOptions") }}</summary>
                <div class="mt-3 grid grid-cols-2 gap-3">
                  <label class="space-y-1 text-xs">
                    <span class="text-muted-foreground">{{ t("automationCenter.timeoutSeconds") }}</span>
                    <Input :model-value="executionNumber('timeoutSeconds')" type="number" min="0" @update:model-value="(value) => updateExecutionNumber('timeoutSeconds', String(value))" />
                  </label>
                  <label class="space-y-1 text-xs">
                    <span class="text-muted-foreground">{{ t("automationCenter.retryCount") }}</span>
                    <Input :model-value="executionNumber('retryCount')" type="number" min="0" max="10" @update:model-value="(value) => updateExecutionNumber('retryCount', String(value))" />
                  </label>
                  <label class="space-y-1 text-xs">
                    <span class="text-muted-foreground">{{ t("automationCenter.retryDelaySeconds") }}</span>
                    <Input :model-value="executionNumber('retryDelaySeconds')" type="number" min="0" @update:model-value="(value) => updateExecutionNumber('retryDelaySeconds', String(value))" />
                  </label>
                  <label class="space-y-1 text-xs">
                    <span class="text-muted-foreground">{{ t("automationCenter.notifyOn") }}</span>
                    <Select :model-value="normalizeAutomationExecutionOptions(draft.execution).notifyOn" @update:model-value="updateNotifyPolicy">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="item in notifyItems" :key="item" :value="item">{{ t(`automationCenter.notify.${item}`) }}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
              </details>

              <details class="rounded-md border bg-background p-4 shadow-sm">
                <summary class="cursor-pointer text-sm font-medium">{{ t("automationCenter.runHistory") }}</summary>
                <div class="mt-3 space-y-3">
                  <div class="grid grid-cols-2 gap-2">
                    <Select v-model="historyStatus">
                      <SelectTrigger class="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{{ t("automationCenter.historyAll") }}</SelectItem>
                        <SelectItem value="success">{{ t("automationCenter.historySuccess") }}</SelectItem>
                        <SelectItem value="error">{{ t("automationCenter.historyError") }}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" class="h-8" :disabled="!selectedJobRecordCount" @click="clearCurrentHistory">{{ t("automationCenter.clearCurrentHistory") }}</Button>
                    <Button size="sm" variant="outline" class="col-span-2 h-8" :disabled="!records.length" @click="clearAllHistory">{{ t("automationCenter.clearAllHistory") }}</Button>
                  </div>
                  <div class="max-h-44 overflow-auto rounded-md border">
                    <div v-for="record in selectedRecords" :key="record.id" class="space-y-2 border-b p-2 text-xs last:border-b-0">
                      <button type="button" class="flex w-full items-center justify-between gap-2 text-left" @click="toggleRunRecord(record.id)">
                        <span :class="record.status === 'error' ? 'text-destructive' : 'text-emerald-600'">{{ record.status }}</span>
                        <span class="truncate text-muted-foreground">{{ formatTime(record.finishedAt || record.startedAt) }}</span>
                      </button>
                      <div class="truncate text-muted-foreground">
                        <template v-if="record.attempts">{{ t("automationCenter.attempts", { count: record.attempts }) }} · </template>
                        <template v-if="record.durationMs !== undefined">{{ formatDuration(record.durationMs) }} · </template>
                        <template v-if="record.syncPlan">{{ t("automationCenter.syncStatements", { count: record.syncPlan.statementCount }) }} · </template>
                        {{ record.message || record.error }}
                        <template v-if="record.qualityProfile"> · {{ t("automationCenter.qualityRows", { count: record.qualityProfile.rowCount }) }}</template>
                      </div>
                      <div v-if="syncSqlPreview(record)" class="line-clamp-2 rounded bg-muted/50 px-2 py-1 font-mono text-[11px] leading-4 text-muted-foreground">
                        {{ syncSqlPreview(record) }}
                      </div>
                      <div v-if="qualitySummary(record)" class="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                        {{ qualitySummary(record) }}
                      </div>
                      <div v-if="expandedRunRecordId === record.id" class="space-y-2 rounded-md bg-muted/40 p-2">
                        <div class="flex justify-end">
                          <Button type="button" size="sm" variant="outline" class="h-7 gap-1 px-2 text-[11px]" @click="copyRunRecordDetails(record)"><Copy class="h-3.5 w-3.5" />{{ t("automationCenter.copyRunDetails") }}</Button>
                        </div>
                        <div v-if="record.error" class="break-words text-destructive">{{ record.error }}</div>
                        <div v-if="record.message" class="break-words text-muted-foreground">{{ record.message }}</div>
                        <pre v-if="record.syncPlan?.syncSqlPreview" class="max-h-28 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] leading-4">{{ record.syncPlan.syncSqlPreview }}</pre>
                        <pre v-if="record.qualityProfile" class="max-h-28 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] leading-4">{{ qualitySummary(record) }}</pre>
                      </div>
                    </div>
                    <div v-if="!selectedRecords.length" class="p-4 text-center text-sm text-muted-foreground">{{ t("automationCenter.noRuns") }}</div>
                  </div>
                </div>
              </details>
            </div>
          </aside>
        </main>
      </div>
    </DialogContent>
  </Dialog>
</template>
