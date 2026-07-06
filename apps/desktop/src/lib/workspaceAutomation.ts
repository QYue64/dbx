import * as api from "@/lib/backend/api";
import { classifyAiSqlExecution, classifyConnectionEnvironment } from "@/lib/ai/aiSqlExecutionPolicy";
import { usesAgentCursorForQuery } from "@/lib/database/databaseDriverManifest";
import { effectiveDatabaseTypeForConnection } from "@/lib/database/jdbcDialect";
import { queryTimeoutSecsForConnection } from "@/lib/sql/queryTimeout";
import { appendGovernanceAuditRecord, createQueryAuditRecord, evaluateSqlGovernance, findConnectionSharePolicy, profileQueryResultQuality, readGovernancePolicy, type DataQualityProfile, type GovernanceSeverity } from "@/lib/workspaceGovernance";
import type { DataCompareFromTablesOptions, DataCompareFromTablesPreparation, DataCompareSyncPlan } from "@/lib/dataGrid/dataCompare";
import type { SavedSqlSyncEntry, WebDavConfig } from "@/lib/backend/tauri";
import type { ConnectionConfig, QueryResult } from "@/types/database";

export type AutomationJobKind = "sql" | "export" | "sync" | "quality-check";

export type AutomationSchedule = { type: "manual" } | { type: "intervalMinutes"; intervalMinutes: number } | { type: "dailyTime"; dailyTime: string } | { type: "weekly"; daysOfWeek: number[]; dailyTime: string } | { type: "monthly"; dayOfMonth: number; dailyTime: string };

export interface AutomationJob {
  id: string;
  name: string;
  kind: AutomationJobKind;
  enabled: boolean;
  schedule: AutomationSchedule;
  execution?: AutomationExecutionOptions;
  payload: AutomationJobPayload;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

export type AutomationNotifyPolicy = "never" | "failure" | "always";

export interface AutomationExecutionOptions {
  timeoutSeconds?: number;
  retryCount?: number;
  retryDelaySeconds?: number;
  notifyOn?: AutomationNotifyPolicy;
}

export type AutomationJobPayload = SqlAutomationPayload | ExportAutomationPayload | SyncAutomationPayload | QualityCheckAutomationPayload | Record<string, unknown>;

export interface SqlAutomationPayload {
  connectionId?: string;
  database?: string;
  schema?: string;
  sql?: string;
}

export interface ExportAutomationPayload extends SqlAutomationPayload {
  exportMode?: "query" | "table";
  format?: "csv" | "xlsx" | "json" | "markdown" | "sql";
  outputPath?: string;
  table?: string;
}

export type SyncAutomationPayload = WebDavSyncAutomationPayload | SavedSqlDirectorySyncAutomationPayload | DataCompareSyncAutomationPayload | Record<string, unknown>;

export interface WebDavSyncAutomationPayload {
  syncMode: "webdav-upload" | "webdav-download";
  webDavConfig?: WebDavConfig;
  editorSettings?: unknown;
  secretsPassphrase?: string;
}

export interface SavedSqlDirectorySyncAutomationPayload {
  syncMode: "saved-sql-directory";
  targetDir?: string;
  entries?: SavedSqlSyncEntry[];
}

export interface DataCompareSyncAutomationPayload extends Partial<DataCompareFromTablesOptions> {
  syncMode: "data-compare";
  syncExecutionMode?: "preview" | "execute";
}

export interface QualityCheckAutomationPayload extends SqlAutomationPayload {}

export interface AutomationRunRecord {
  id: string;
  jobId: string;
  status: "success" | "error";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  attempts?: number;
  message?: string;
  error?: string;
  auditLevel?: GovernanceSeverity;
  qualityProfile?: DataQualityProfile;
  syncPlan?: AutomationSyncPlanSummary;
}

export interface AutomationSyncPlanSummary {
  statementCount: number;
  syncSqlPreview: string;
}

export interface AutomationRunPlan {
  valid: boolean;
  safety: GovernanceSeverity;
  reasons: string[];
  execution: Required<AutomationExecutionOptions>;
  executableSql?: string;
  description: string;
}

export interface AutomationRunPlanContext {
  sourceConnection?: ConnectionConfig;
  targetConnection?: ConnectionConfig;
}

export interface AutomationStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface AutomationStorageOptions {
  storage?: AutomationStorage;
  now?: string;
}

export interface AutomationBundle {
  version: 1;
  exportedAt: string;
  jobs: AutomationJob[];
  records?: AutomationRunRecord[];
}

export interface AutomationBundleExportOptions {
  jobs?: AutomationJob[];
  records?: AutomationRunRecord[];
  includeHistory?: boolean;
  now?: string;
}

export interface AutomationBundleImportOptions extends AutomationStorageOptions {
  mode?: "merge" | "replace";
  includeHistory?: boolean;
}

export interface AutomationRuntime {
  now?: () => string;
  connectionForId?: (id: string | undefined) => ConnectionConfig | undefined;
  executeMulti?: (connectionId: string, database: string, sql: string, schema?: string) => Promise<QueryResult | QueryResult[]>;
  prepareDataCompareFromTables?: (options: DataCompareFromTablesOptions) => Promise<DataCompareFromTablesPreparation>;
  buildDataCompareSyncPlan?: (options: { tables: unknown[] }) => Promise<DataCompareSyncPlan>;
  editorSettings?: () => unknown;
  applyWebDavDownload?: (result: Awaited<ReturnType<typeof api.webdavSyncDownload>>) => Promise<void> | void;
  webdavSyncUpload?: typeof api.webdavSyncUpload;
  webdavSyncDownload?: typeof api.webdavSyncDownload;
  savedSqlEntries?: () => Promise<SavedSqlSyncEntry[]>;
  syncSavedSqlDirectory?: typeof api.syncSavedSqlDirectory;
  startTableExport?: typeof api.startTableExport;
  startQueryResultExport?: typeof api.startQueryResultExport;
  exportQueryResultCsv?: typeof api.exportQueryResultCsv;
  exportQueryResultXlsx?: typeof api.exportQueryResultXlsx;
  exportQueryResultJson?: typeof api.exportQueryResultJson;
  exportQueryResultMarkdown?: typeof api.exportQueryResultMarkdown;
}

export const AUTOMATION_JOBS_STORAGE_KEY = "dbx-workspace-automation-jobs";
export const AUTOMATION_RUN_RECORDS_STORAGE_KEY = "dbx-workspace-automation-run-records";
const RUN_RECORD_LIMIT = 200;
const EXPORT_MODES = new Set(["query", "table"]);
const QUERY_EXPORT_FORMATS = new Set(["csv", "xlsx", "json", "markdown"]);
const TABLE_EXPORT_FORMATS = new Set(["csv", "xlsx", "json", "markdown", "sql"]);
const SYNC_EXECUTION_MODES = new Set(["execute", "preview"]);

function defaultAutomationStorage(): AutomationStorage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

function readJsonArray<T>(key: string, storage: AutomationStorage | undefined): T[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(key: string, items: T[], storage: AutomationStorage | undefined): T[] {
  storage?.setItem(key, JSON.stringify(items));
  return items;
}

function timestamp(): string {
  return new Date().toISOString();
}

function automationId(now: string): string {
  return `automation-${now.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
}

function runRecordId(now: string): string {
  return `automation-run-${now.replace(/\D/g, "")}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function payloadString(payload: AutomationJobPayload, key: string): string {
  const value = isPlainObject(payload) ? payload[key] : undefined;
  return typeof value === "string" ? value : "";
}

function payloadArray(payload: AutomationJobPayload, key: string): unknown[] {
  const value = isPlainObject(payload) ? payload[key] : undefined;
  return Array.isArray(value) ? value : [];
}

function payloadObject(payload: AutomationJobPayload, key: string): Record<string, unknown> | undefined {
  const value = isPlainObject(payload) ? payload[key] : undefined;
  return isPlainObject(value) ? value : undefined;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeAutomationPayloadForStorage(payload: AutomationJobPayload): AutomationJobPayload {
  const next = cloneJson(payload) as Record<string, unknown>;
  const webDavConfig = next.webDavConfig;
  if (isPlainObject(webDavConfig)) {
    delete webDavConfig.password;
    next.webDavConfig = webDavConfig;
  }
  delete next.secretsPassphrase;
  return next as AutomationJobPayload;
}

function sanitizeAutomationJobForStorage(job: AutomationJob): AutomationJob {
  return {
    ...cloneJson(job),
    payload: sanitizeAutomationPayloadForStorage(job.payload),
  };
}

function defaultJobName(kind: AutomationJobKind): string {
  if (kind === "export") return "Export automation";
  if (kind === "sync") return "Sync automation";
  if (kind === "quality-check") return "Quality check automation";
  return "SQL automation";
}

export function normalizeAutomationExecutionOptions(options: AutomationExecutionOptions | undefined): Required<AutomationExecutionOptions> {
  return {
    timeoutSeconds: Math.max(0, Number(options?.timeoutSeconds ?? 0) || 0),
    retryCount: Math.max(0, Math.min(10, Math.floor(Number(options?.retryCount ?? 0) || 0))),
    retryDelaySeconds: Math.max(0, Number(options?.retryDelaySeconds ?? 0) || 0),
    notifyOn: options?.notifyOn === "never" || options?.notifyOn === "always" ? options.notifyOn : "failure",
  };
}

export function shouldNotifyAutomationRun(job: AutomationJob, record: AutomationRunRecord): boolean {
  const notifyOn = normalizeAutomationExecutionOptions(job.execution).notifyOn;
  if (notifyOn === "always") return true;
  if (notifyOn === "failure") return record.status === "error";
  return false;
}

export function computeNextAutomationRunAt(schedule: AutomationSchedule, nowInput: Date | string = new Date()): string | undefined {
  const now = typeof nowInput === "string" ? new Date(nowInput) : new Date(nowInput);
  if (Number.isNaN(now.getTime())) return undefined;
  if (schedule.type === "manual") return undefined;
  if (schedule.type === "intervalMinutes") {
    const minutes = Math.max(1, Math.floor(schedule.intervalMinutes || 0));
    return new Date(now.getTime() + minutes * 60_000).toISOString();
  }
  const time = parseAutomationDailyTime(schedule.dailyTime);
  if (!time) return undefined;
  if (schedule.type === "dailyTime") {
    const next = automationDateAtTime(now, time.hour, time.minute);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }
  if (schedule.type === "weekly") {
    const days = [...new Set(schedule.daysOfWeek.map((day) => Math.floor(Number(day))).filter((day) => day >= 0 && day <= 6))].sort((a, b) => a - b);
    if (!days.length) return undefined;
    for (let offset = 0; offset <= 7; offset += 1) {
      const next = automationDateAtTime(now, time.hour, time.minute);
      next.setDate(now.getDate() + offset);
      if (days.includes(next.getDay()) && next.getTime() > now.getTime()) return next.toISOString();
    }
    return undefined;
  }
  if (schedule.type === "monthly") {
    const dayOfMonth = Math.max(1, Math.min(31, Math.floor(Number(schedule.dayOfMonth) || 1)));
    for (let offset = 0; offset <= 12; offset += 1) {
      const next = automationDateAtTime(now, time.hour, time.minute);
      next.setDate(1);
      next.setMonth(now.getMonth() + offset);
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(dayOfMonth, lastDay));
      if (next.getTime() > now.getTime()) return next.toISOString();
    }
  }
  return undefined;
}

function parseAutomationDailyTime(value: string): { hour: number; minute: number } | undefined {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return { hour, minute };
}

function automationDateAtTime(now: Date, hour: number, minute: number): Date {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  return next;
}

export function readAutomationJobs(storage: AutomationStorage | undefined = defaultAutomationStorage()): AutomationJob[] {
  return readJsonArray<AutomationJob>(AUTOMATION_JOBS_STORAGE_KEY, storage).filter((job) => job && typeof job.id === "string");
}

export function saveAutomationJobs(jobs: AutomationJob[], storage: AutomationStorage | undefined = defaultAutomationStorage()): AutomationJob[] {
  return writeJsonArray(AUTOMATION_JOBS_STORAGE_KEY, jobs.map(sanitizeAutomationJobForStorage), storage);
}

export function upsertAutomationJob(job: AutomationJob, options: AutomationStorageOptions = {}): AutomationJob[] {
  const storage = options.storage ?? defaultAutomationStorage();
  const now = options.now ?? timestamp();
  const existingJobs = readAutomationJobs(storage);
  const existing = existingJobs.find((item) => item.id === job.id);
  const normalized: AutomationJob = sanitizeAutomationJobForStorage({
    ...job,
    id: job.id || automationId(now),
    name: job.name.trim() || defaultJobName(job.kind),
    enabled: Boolean(job.enabled),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    nextRunAt: job.enabled ? computeNextAutomationRunAt(job.schedule, now) : undefined,
  });
  return saveAutomationJobs([normalized, ...existingJobs.filter((item) => item.id !== normalized.id)], storage);
}

export function deleteAutomationJob(id: string, storage: AutomationStorage | undefined = defaultAutomationStorage()): AutomationJob[] {
  return saveAutomationJobs(
    readAutomationJobs(storage).filter((job) => job.id !== id),
    storage,
  );
}

export function readAutomationRunRecords(storage: AutomationStorage | undefined = defaultAutomationStorage()): AutomationRunRecord[] {
  return readJsonArray<AutomationRunRecord>(AUTOMATION_RUN_RECORDS_STORAGE_KEY, storage).filter((record) => record && typeof record.id === "string");
}

export function appendAutomationRunRecord(record: AutomationRunRecord, options: { storage?: AutomationStorage } = {}): AutomationRunRecord[] {
  const storage = options.storage ?? defaultAutomationStorage();
  return writeJsonArray(AUTOMATION_RUN_RECORDS_STORAGE_KEY, [record, ...readAutomationRunRecords(storage)].slice(0, RUN_RECORD_LIMIT), storage);
}

export function clearAutomationRunRecords(options: { jobId?: string; storage?: AutomationStorage } = {}): AutomationRunRecord[] {
  const storage = options.storage ?? defaultAutomationStorage();
  const next = options.jobId ? readAutomationRunRecords(storage).filter((record) => record.jobId !== options.jobId) : [];
  return writeJsonArray(AUTOMATION_RUN_RECORDS_STORAGE_KEY, next, storage);
}

export function exportAutomationBundle(options: AutomationBundleExportOptions = {}): AutomationBundle {
  const jobs = (options.jobs ?? readAutomationJobs()).map(sanitizeAutomationJobForStorage);
  const records = options.includeHistory ? (options.records ?? readAutomationRunRecords()).map(cloneJson) : undefined;
  return {
    version: 1,
    exportedAt: options.now ?? timestamp(),
    jobs,
    records,
  };
}

export function importAutomationBundle(input: AutomationBundle | string, options: AutomationBundleImportOptions = {}): { jobs: AutomationJob[]; records: AutomationRunRecord[] } {
  const storage = options.storage ?? defaultAutomationStorage();
  const now = options.now ?? timestamp();
  const bundle = typeof input === "string" ? (JSON.parse(input) as AutomationBundle) : input;
  if (!bundle || bundle.version !== 1 || !Array.isArray(bundle.jobs)) throw new Error("automation_bundle_invalid");
  const importedJobs = bundle.jobs
    .filter((job) => job && typeof job.id === "string")
    .map((job) =>
      sanitizeAutomationJobForStorage({
        ...job,
        name: job.name?.trim() || defaultJobName(job.kind),
        createdAt: job.createdAt || now,
        updatedAt: now,
        nextRunAt: job.enabled ? computeNextAutomationRunAt(job.schedule, now) : undefined,
      }),
    );
  const existingJobs = options.mode === "replace" ? [] : readAutomationJobs(storage);
  const existingById = new Map(existingJobs.map((job) => [job.id, job]));
  for (const job of importedJobs) existingById.set(job.id, job);
  const jobs = saveAutomationJobs([...existingById.values()], storage);

  const importedRecords = options.includeHistory === false ? [] : (bundle.records ?? []).filter((record) => record && typeof record.id === "string").map(cloneJson);
  const existingRecords = options.mode === "replace" ? [] : readAutomationRunRecords(storage);
  const recordById = new Map(existingRecords.map((record) => [record.id, record]));
  for (const record of importedRecords) recordById.set(record.id, record);
  const records = writeJsonArray(AUTOMATION_RUN_RECORDS_STORAGE_KEY, [...recordById.values()].slice(0, RUN_RECORD_LIMIT), storage);
  return { jobs, records };
}

export function dueAutomationJobs(jobs: AutomationJob[], now: string = timestamp(), runningJobIds: Set<string> = new Set()): AutomationJob[] {
  const nowTime = new Date(now).getTime();
  return jobs.filter((job) => job.enabled && !!job.nextRunAt && new Date(job.nextRunAt).getTime() <= nowTime && !runningJobIds.has(job.id));
}

export function buildAutomationRunPlan(job: AutomationJob, connection?: ConnectionConfig, context: AutomationRunPlanContext = {}): AutomationRunPlan {
  const reasons: string[] = [];
  const connectionId = payloadString(job.payload, "connectionId");
  const sql = payloadString(job.payload, "sql").trim();
  const outputPath = payloadString(job.payload, "outputPath").trim();
  const syncMode = payloadString(job.payload, "syncMode");
  const exportMode = payloadString(job.payload, "exportMode") || "query";
  const exportFormat = payloadString(job.payload, "format") || "csv";
  const syncExecutionMode = payloadString(job.payload, "syncExecutionMode") || "execute";
  const targetConnectionId = payloadString(job.payload, "targetConnectionId");
  const sourceConnectionId = payloadString(job.payload, "sourceConnectionId");
  const riskConnection = context.targetConnection ?? connection;
  const webDavConfig = payloadObject(job.payload, "webDavConfig");

  if (!isValidAutomationSchedule(job.schedule)) reasons.push("schedule_invalid");
  if (job.kind === "export" && !EXPORT_MODES.has(exportMode)) reasons.push("export_mode_invalid");
  if (job.kind === "export" && exportMode === "query" && !QUERY_EXPORT_FORMATS.has(exportFormat)) reasons.push("format_invalid");
  if (job.kind === "export" && exportMode === "table" && !TABLE_EXPORT_FORMATS.has(exportFormat)) reasons.push("format_invalid");
  if (job.kind === "sync" && syncMode === "data-compare" && !SYNC_EXECUTION_MODES.has(syncExecutionMode)) reasons.push("sync_execution_mode_invalid");
  if ((job.kind === "sql" || job.kind === "export" || job.kind === "quality-check") && !connectionId) reasons.push("connection_required");
  if ((job.kind === "sql" || job.kind === "export" || job.kind === "quality-check") && connectionId && !riskConnection) reasons.push("connection_not_found");
  if ((job.kind === "sql" || job.kind === "quality-check" || (job.kind === "export" && exportMode !== "table")) && !sql) reasons.push("sql_required");
  if (job.kind === "export" && !outputPath) reasons.push("path_required");
  if (job.kind === "export" && exportMode === "table" && !payloadString(job.payload, "table")) reasons.push("table_required");
  if (job.kind === "sync" && !syncMode) reasons.push("sync_mode_required");
  if (job.kind === "sync" && (syncMode === "webdav-upload" || syncMode === "webdav-download") && !webDavConfig) reasons.push("webdav_config_required");
  if (job.kind === "sync" && (syncMode === "webdav-upload" || syncMode === "webdav-download") && webDavConfig && (typeof webDavConfig.endpoint !== "string" || !webDavConfig.endpoint.trim())) reasons.push("webdav_endpoint_required");
  if (job.kind === "sync" && syncMode === "saved-sql-directory" && !payloadString(job.payload, "targetDir")) reasons.push("target_required");
  if (job.kind === "sync" && syncMode === "data-compare") {
    for (const key of ["sourceConnectionId", "sourceDatabase", "sourceSchema", "sourceTable", "targetConnectionId", "targetDatabase", "targetSchema", "targetTable"]) {
      if (!payloadString(job.payload, key)) reasons.push(`${key}_required`);
    }
    if (sourceConnectionId && "sourceConnection" in context && !context.sourceConnection) reasons.push("source_connection_not_found");
    if (targetConnectionId && !riskConnection) reasons.push("target_connection_not_found");
    if (!payloadArray(job.payload, "columns").length) reasons.push("columns_required");
    if (!payloadArray(job.payload, "keyColumns").length) reasons.push("key_columns_required");
  }

  const sqlDecision = sql ? classifyAiSqlExecution(sql, riskConnection) : undefined;
  if (sqlDecision?.action === "block") reasons.push("unsafe_sql");
  if (sqlDecision && sqlDecision.category !== "read" && classifyConnectionEnvironment(riskConnection) === "production") reasons.push("production_write_automation");
  if (job.kind === "sync" && syncMode === "data-compare" && syncExecutionMode !== "preview" && classifyConnectionEnvironment(riskConnection) === "production") {
    reasons.push("production_write_automation");
  }

  const safety: GovernanceSeverity = reasons.includes("unsafe_sql") || reasons.includes("production_write_automation") ? "critical" : reasons.length ? "warning" : "ok";
  return {
    valid: reasons.length === 0,
    safety,
    reasons,
    execution: normalizeAutomationExecutionOptions(job.execution),
    executableSql: sql || undefined,
    description: job.enabled ? "Automation job is ready to run." : "Automation job is disabled.",
  };
}

function isValidAutomationSchedule(schedule: AutomationSchedule): boolean {
  if (schedule.type === "manual") return true;
  if (schedule.type === "intervalMinutes") return Number.isFinite(schedule.intervalMinutes) && schedule.intervalMinutes > 0;
  if (schedule.type === "dailyTime") return !!parseAutomationDailyTime(schedule.dailyTime);
  if (schedule.type === "weekly") return !!parseAutomationDailyTime(schedule.dailyTime) && Array.isArray(schedule.daysOfWeek) && schedule.daysOfWeek.some((day) => Number.isFinite(day) && day >= 0 && day <= 6);
  if (schedule.type === "monthly") return !!parseAutomationDailyTime(schedule.dailyTime) && Number.isFinite(schedule.dayOfMonth) && schedule.dayOfMonth >= 1 && schedule.dayOfMonth <= 31;
  return false;
}

export async function runAutomationJob(job: AutomationJob, runtime: AutomationRuntime = {}): Promise<AutomationRunRecord> {
  const startedAt = runtime.now?.() ?? timestamp();
  const connection = runtime.connectionForId?.(riskConnectionIdForJob(job));
  const plan = buildAutomationRunPlan(job, connection, automationRunPlanContext(job, runtime));
  const baseRecord = {
    id: runRecordId(startedAt),
    jobId: job.id,
    startedAt,
    auditLevel: plan.safety,
  };
  if (!plan.valid) {
    const finishedAt = runtime.now?.() ?? timestamp();
    appendJobPayloadAutomationAudit(job, connection, "error", startedAt, finishedAt, plan.reasons.join(", "));
    return { ...baseRecord, status: "error", finishedAt, durationMs: automationDurationMs(startedAt, finishedAt), attempts: 0, error: plan.reasons.join(", ") };
  }

  let attempts = 0;
  let lastError: unknown;
  let lastSyncPlan: AutomationSyncPlanSummary | undefined;
  const maxAttempts = plan.execution.retryCount + 1;
  try {
    let result: AutomationExecutionResult | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attempts = attempt;
      try {
        result = await withAutomationTimeout(executeAutomation(job, runtime, plan, startedAt), plan.execution.timeoutSeconds);
        lastSyncPlan = result.syncPlan;
        break;
      } catch (error) {
        if (error instanceof AutomationRunError) lastSyncPlan = error.syncPlan;
        lastError = error;
        if (attempt >= maxAttempts) throw error;
        await delaySeconds(plan.execution.retryDelaySeconds);
      }
    }
    const finishedAt = runtime.now?.() ?? timestamp();
    appendJobPayloadAutomationAudit(job, connection, "success", startedAt, finishedAt);
    appendResultAutomationAudit(job, runtime, result, "success", startedAt, finishedAt);
    return {
      ...baseRecord,
      status: "success",
      finishedAt,
      durationMs: automationDurationMs(startedAt, finishedAt),
      attempts,
      message: result?.message || "Automation completed",
      qualityProfile: result?.qualityProfile,
      syncPlan: result?.syncPlan,
    };
  } catch (error) {
    const finishedAt = runtime.now?.() ?? timestamp();
    const errorMessage = errorMessageFromUnknown(error ?? lastError);
    appendJobPayloadAutomationAudit(job, connection, "error", startedAt, finishedAt, errorMessage);
    if (error instanceof AutomationRunError) appendRunErrorAutomationAudit(job, runtime, error, startedAt, finishedAt);
    return {
      ...baseRecord,
      status: "error",
      finishedAt,
      durationMs: automationDurationMs(startedAt, finishedAt),
      attempts,
      error: errorMessage,
      syncPlan: error instanceof AutomationRunError ? error.syncPlan : lastSyncPlan,
    };
  }
}

function automationRunPlanContext(job: AutomationJob, runtime: AutomationRuntime): AutomationRunPlanContext {
  if (job.kind !== "sync" || payloadString(job.payload, "syncMode") !== "data-compare" || !runtime.connectionForId) return {};
  const sourceConnectionId = payloadString(job.payload, "sourceConnectionId");
  const targetConnectionId = payloadString(job.payload, "targetConnectionId");
  return {
    sourceConnection: sourceConnectionId ? runtime.connectionForId(sourceConnectionId) : undefined,
    targetConnection: targetConnectionId ? runtime.connectionForId(targetConnectionId) : undefined,
  };
}

function riskConnectionIdForJob(job: AutomationJob): string | undefined {
  if (job.kind === "sync" && payloadString(job.payload, "syncMode") === "data-compare") {
    return payloadString(job.payload, "targetConnectionId") || undefined;
  }
  return payloadString(job.payload, "connectionId") || undefined;
}

class AutomationRunError extends Error {
  constructor(
    message: string,
    readonly syncPlan?: AutomationSyncPlanSummary,
    readonly auditSql?: string,
    readonly auditConnectionId?: string,
  ) {
    super(message);
  }
}

function automationDurationMs(startedAt: string, finishedAt: string): number | undefined {
  const started = new Date(startedAt).getTime();
  const finished = new Date(finishedAt).getTime();
  return Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : undefined;
}

function errorMessageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delaySeconds(seconds: number): Promise<void> {
  if (seconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function withAutomationTimeout<T>(promise: Promise<T>, timeoutSeconds: number): Promise<T> {
  if (timeoutSeconds <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("automation_timeout")), timeoutSeconds * 1000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function appendJobPayloadAutomationAudit(job: AutomationJob, connection: ConnectionConfig | undefined, status: "success" | "error", startedAt: string, finishedAt: string, error?: string) {
  if (job.kind !== "sql" && job.kind !== "export" && job.kind !== "quality-check") return;
  const sql = payloadString(job.payload, "sql").trim();
  if (!sql) return;
  appendAutomationSqlAudit(job, connection, sql, status, startedAt, finishedAt, error, "payload");
}

function appendResultAutomationAudit(job: AutomationJob, runtime: AutomationRuntime, result: AutomationExecutionResult | undefined, status: "success" | "error", startedAt: string, finishedAt: string, error?: string) {
  if (!result?.auditSql?.trim()) return;
  const connection = runtime.connectionForId?.(result.auditConnectionId);
  appendAutomationSqlAudit(job, connection, result.auditSql, status, startedAt, finishedAt, error, "generated");
}

function appendRunErrorAutomationAudit(job: AutomationJob, runtime: AutomationRuntime, error: AutomationRunError, startedAt: string, finishedAt: string) {
  if (!error.auditSql?.trim()) return;
  const connection = runtime.connectionForId?.(error.auditConnectionId);
  appendAutomationSqlAudit(job, connection, error.auditSql, "error", startedAt, finishedAt, error.message, "generated");
}

function appendAutomationSqlAudit(job: AutomationJob, connection: ConnectionConfig | undefined, sql: string, status: "success" | "error", startedAt: string, finishedAt: string, error: string | undefined, source: "payload" | "generated") {
  const policy = readGovernancePolicy();
  const principal = { id: "automation", role: policy.principalRole };
  const decision = evaluateSqlGovernance(sql, connection, {
    principal,
    sharePolicy: findConnectionSharePolicy(connection?.id),
    requireApprovalForWrites: policy.requireApprovalForWrites,
    allowDangerousSql: policy.allowDangerousSql,
    allowProductionWrites: policy.allowProductionWrites,
  });
  const started = new Date(startedAt).getTime();
  const finished = new Date(finishedAt).getTime();
  appendGovernanceAuditRecord({
    ...createQueryAuditRecord({
      id: `automation-audit-${job.id}-${source}-${startedAt.replace(/\D/g, "")}`,
      connectionId: connection?.id || payloadString(job.payload, "connectionId") || payloadString(job.payload, "targetConnectionId"),
      principalId: principal.id,
      sql,
      decision,
      createdAt: startedAt,
    }),
    status,
    executionTimeMs: Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : undefined,
    error,
  });
}

interface AutomationExecutionResult {
  message: string;
  qualityProfile?: DataQualityProfile;
  syncPlan?: AutomationSyncPlanSummary;
  auditSql?: string;
  auditConnectionId?: string;
}

async function executeAutomation(job: AutomationJob, runtime: AutomationRuntime, plan: AutomationRunPlan, startedAt: string): Promise<AutomationExecutionResult> {
  if (job.kind === "sync") return executeSyncAutomation(job, runtime);

  if (job.kind === "export" && payloadString(job.payload, "exportMode") === "table") {
    return exportAutomationTable(job, runtime, startedAt);
  }

  if (job.kind === "export" && canStreamQueryExport(job)) {
    const streamed = await exportAutomationQueryViaBackend(job, runtime, plan, startedAt);
    if (streamed) return streamed;
  }

  const connectionId = payloadString(job.payload, "connectionId");
  const database = payloadString(job.payload, "database");
  const schema = payloadString(job.payload, "schema") || undefined;
  const sql = plan.executableSql || "";
  const executeMulti = runtime.executeMulti ?? api.executeMulti;
  const result = firstQueryResult(await executeMulti(connectionId, database, sql, schema));

  if (job.kind === "quality-check") {
    const qualityProfile = profileQueryResultQuality(result);
    return { message: `Quality check finished for ${qualityProfile.rowCount} rows`, qualityProfile };
  }
  if (job.kind === "export") {
    await exportAutomationResult(job, runtime, result);
    return { message: `Export completed: ${result.rows.length} rows` };
  }
  return { message: "SQL executed" };
}

function canStreamQueryExport(job: AutomationJob): boolean {
  const exportMode = payloadString(job.payload, "exportMode") || "query";
  const format = payloadString(job.payload, "format") || "csv";
  return exportMode === "query" && (format === "csv" || format === "xlsx");
}

async function exportAutomationQueryViaBackend(job: AutomationJob, runtime: AutomationRuntime, plan: AutomationRunPlan, startedAt: string): Promise<AutomationExecutionResult | undefined> {
  const connectionId = payloadString(job.payload, "connectionId");
  const connection = runtime.connectionForId?.(connectionId);
  const databaseType = effectiveDatabaseTypeForConnection(connection);
  if (!databaseType) return undefined;
  const editorSettings = runtime.editorSettings?.();
  const format = (payloadString(job.payload, "format") || "csv") as "csv" | "xlsx";
  const exportId = `automation-query-export-${job.id}-${startedAt.replace(/\D/g, "")}`;
  const progress = await (runtime.startQueryResultExport ?? api.startQueryResultExport)(
    {
      exportId,
      connectionId,
      database: payloadString(job.payload, "database"),
      schema: payloadString(job.payload, "schema") || undefined,
      sql: plan.executableSql || "",
      queryBaseSql: plan.executableSql || "",
      databaseType,
      useAgentCursor: usesAgentCursorForQuery(connection?.db_type),
      filePath: payloadString(job.payload, "outputPath"),
      format,
      pageSize: automationEditorSettingNumber(editorSettings, "exportBatchSize", 2000),
      rowLimit: automationEditorSettingBoolean(editorSettings, "exportRowLimitEnabled", false) ? automationEditorSettingNumber(editorSettings, "exportRowLimit", 100000) : null,
      totalRows: null,
      timeoutSecs: queryTimeoutSecsForConnection(connection),
      keysetOptimizationEnabled: automationEditorSettingBoolean(editorSettings, "queryExportKeysetOptimizationEnabled", true),
      clientSessionId: `automation:${job.id}:export`,
      executionId: `${exportId}-execution`,
    },
    () => {},
  );
  return { message: `Query export completed: ${progress.rowsExported} rows` };
}

function automationEditorSettingNumber(settings: unknown, key: string, fallback: number): number {
  const value = isPlainObject(settings) ? settings[key] : undefined;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function automationEditorSettingBoolean(settings: unknown, key: string, fallback: boolean): boolean {
  const value = isPlainObject(settings) ? settings[key] : undefined;
  return typeof value === "boolean" ? value : fallback;
}

async function exportAutomationTable(job: AutomationJob, runtime: AutomationRuntime, startedAt: string): Promise<AutomationExecutionResult> {
  const request = {
    exportId: `automation-export-${job.id}-${startedAt.replace(/\D/g, "")}`,
    connectionId: payloadString(job.payload, "connectionId"),
    database: payloadString(job.payload, "database"),
    schema: payloadString(job.payload, "schema") || undefined,
    tableName: payloadString(job.payload, "table"),
    filePath: payloadString(job.payload, "outputPath"),
    format: (payloadString(job.payload, "format") || "csv") as "csv" | "xlsx" | "json" | "markdown" | "sql",
  };
  const progress = await (runtime.startTableExport ?? api.startTableExport)(request, () => {});
  return { message: `Table export completed: ${progress.rowsExported} rows` };
}

async function exportAutomationResult(job: AutomationJob, runtime: AutomationRuntime, result: QueryResult): Promise<void> {
  const outputPath = payloadString(job.payload, "outputPath");
  const format = payloadString(job.payload, "format") || "csv";
  if (format === "xlsx") {
    await (runtime.exportQueryResultXlsx ?? api.exportQueryResultXlsx)(outputPath, "DBX", result.columns, result.rows);
  } else if (format === "json") {
    await (runtime.exportQueryResultJson ?? api.exportQueryResultJson)(outputPath, result.columns, result.rows);
  } else if (format === "markdown") {
    await (runtime.exportQueryResultMarkdown ?? api.exportQueryResultMarkdown)(outputPath, result.columns, result.rows);
  } else {
    await (runtime.exportQueryResultCsv ?? api.exportQueryResultCsv)(outputPath, result.columns, result.rows);
  }
}

function firstQueryResult(result: QueryResult | QueryResult[]): QueryResult {
  return Array.isArray(result) ? (result[0] ?? { columns: [], rows: [], affected_rows: 0, execution_time_ms: 0 }) : result;
}

async function executeSyncAutomation(job: AutomationJob, runtime: AutomationRuntime): Promise<AutomationExecutionResult> {
  const syncMode = payloadString(job.payload, "syncMode");
  if (syncMode === "webdav-upload") {
    const payload = job.payload as WebDavSyncAutomationPayload;
    if (!payload.webDavConfig) throw new Error("webdav_config_required");
    await (runtime.webdavSyncUpload ?? api.webdavSyncUpload)(payload.webDavConfig, payload.editorSettings ?? runtime.editorSettings?.(), payload.secretsPassphrase);
    return { message: "WebDAV upload completed" };
  }
  if (syncMode === "webdav-download") {
    const payload = job.payload as WebDavSyncAutomationPayload;
    if (!payload.webDavConfig) throw new Error("webdav_config_required");
    const result = await (runtime.webdavSyncDownload ?? api.webdavSyncDownload)(payload.webDavConfig, payload.secretsPassphrase);
    await runtime.applyWebDavDownload?.(result);
    return { message: "WebDAV download completed" };
  }
  if (syncMode === "saved-sql-directory") {
    const payload = job.payload as SavedSqlDirectorySyncAutomationPayload;
    if (!payload.targetDir) throw new Error("target_required");
    const entries = payload.entries ?? (runtime.savedSqlEntries ? await runtime.savedSqlEntries() : []);
    await (runtime.syncSavedSqlDirectory ?? api.syncSavedSqlDirectory)({ targetDir: payload.targetDir, entries });
    return { message: "Saved SQL directory synced" };
  }
  if (syncMode === "data-compare") {
    return executeDataCompareSync(job.payload as DataCompareSyncAutomationPayload, runtime);
  }
  throw new Error("sync_mode_required");
}

async function executeDataCompareSync(payload: DataCompareSyncAutomationPayload, runtime: AutomationRuntime): Promise<AutomationExecutionResult> {
  const options = dataCompareOptions(payload);
  const preparation = await (runtime.prepareDataCompareFromTables ?? api.prepareDataCompareFromTables)(options);
  const plan = await (runtime.buildDataCompareSyncPlan ?? api.buildDataCompareSyncPlan)({
    tables: [
      {
        tableName: options.targetTable,
        schema: options.targetSchema,
        columns: options.columns,
        keyColumns: options.keyColumns,
        diff: preparation.result,
        preSyncStatements: preparation.preSyncStatements,
      },
    ],
  });
  const statements = plan.syncStatements.length ? plan.syncStatements : preparation.syncStatements;
  const sql = statements.join("\n");
  const syncPlan = {
    statementCount: statements.length,
    syncSqlPreview: sql.trim().slice(0, 2000),
  };
  if (payload.syncExecutionMode === "preview") {
    return {
      message: `Data sync preview generated ${statements.length} statements`,
      syncPlan,
    };
  }
  const targetConnection = runtime.connectionForId?.(options.targetConnectionId);
  const syncDecision = sql.trim() ? classifyAiSqlExecution(sql, targetConnection) : undefined;
  if (syncDecision?.action === "block") throw new AutomationRunError("unsafe_sql", syncPlan, sql, options.targetConnectionId);
  if (syncDecision && syncDecision.category !== "read" && classifyConnectionEnvironment(targetConnection) === "production") {
    throw new AutomationRunError("production_write_automation", syncPlan, sql, options.targetConnectionId);
  }
  if (sql.trim()) {
    try {
      await (runtime.executeMulti ?? api.executeMulti)(options.targetConnectionId, options.targetDatabase, sql);
    } catch (error) {
      throw new AutomationRunError(errorMessageFromUnknown(error), syncPlan, sql, options.targetConnectionId);
    }
  }
  return {
    message: `Data sync executed ${statements.length} statements`,
    syncPlan,
    auditSql: sql,
    auditConnectionId: options.targetConnectionId,
  };
}

function dataCompareOptions(payload: DataCompareSyncAutomationPayload): DataCompareFromTablesOptions {
  const required = ["sourceConnectionId", "sourceDatabase", "sourceSchema", "sourceTable", "targetConnectionId", "targetDatabase", "targetSchema", "targetTable"] as const;
  for (const key of required) {
    if (!payload[key]) throw new Error(`${key}_required`);
  }
  if (!payload.columns?.length) throw new Error("columns_required");
  if (!payload.keyColumns?.length) throw new Error("key_columns_required");
  return {
    sourceConnectionId: payload.sourceConnectionId!,
    sourceDatabase: payload.sourceDatabase!,
    sourceSchema: payload.sourceSchema!,
    sourceTable: payload.sourceTable!,
    targetConnectionId: payload.targetConnectionId!,
    targetDatabase: payload.targetDatabase!,
    targetSchema: payload.targetSchema!,
    targetTable: payload.targetTable!,
    columns: payload.columns,
    keyColumns: payload.keyColumns,
    fetchBatchSize: payload.fetchBatchSize,
  };
}
