import * as api from "@/lib/api";
import { classifyAiSqlExecution, classifyConnectionEnvironment } from "@/lib/aiSqlExecutionPolicy";
import { appendGovernanceAuditRecord, createQueryAuditRecord, evaluateSqlGovernance, findConnectionSharePolicy, profileQueryResultQuality, readGovernancePolicy, type DataQualityProfile, type GovernanceSeverity } from "@/lib/workspaceGovernance";
import type { DataCompareFromTablesOptions, DataCompareFromTablesPreparation, DataCompareSyncPlan } from "@/lib/dataCompare";
import type { WebDavConfig } from "@/lib/tauri";
import type { ConnectionConfig, QueryResult } from "@/types/database";

export type AutomationJobKind = "sql" | "export" | "sync" | "quality-check";

export type AutomationSchedule = { type: "manual" } | { type: "intervalMinutes"; intervalMinutes: number } | { type: "dailyTime"; dailyTime: string };

export interface AutomationJob {
  id: string;
  name: string;
  kind: AutomationJobKind;
  enabled: boolean;
  schedule: AutomationSchedule;
  payload: AutomationJobPayload;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
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
  format?: "csv" | "xlsx" | "json" | "markdown";
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
  entries?: unknown[];
}

export interface DataCompareSyncAutomationPayload extends Partial<DataCompareFromTablesOptions> {
  syncMode: "data-compare";
}

export interface QualityCheckAutomationPayload extends SqlAutomationPayload {}

export interface AutomationRunRecord {
  id: string;
  jobId: string;
  status: "success" | "error";
  startedAt: string;
  finishedAt?: string;
  message?: string;
  error?: string;
  auditLevel?: GovernanceSeverity;
  qualityProfile?: DataQualityProfile;
}

export interface AutomationRunPlan {
  valid: boolean;
  safety: GovernanceSeverity;
  reasons: string[];
  executableSql?: string;
  description: string;
}

export interface AutomationStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface AutomationStorageOptions {
  storage?: AutomationStorage;
  now?: string;
}

export interface AutomationRuntime {
  now?: () => string;
  connectionForId?: (id: string | undefined) => ConnectionConfig | undefined;
  executeMulti?: (connectionId: string, database: string, sql: string, schema?: string) => Promise<QueryResult | QueryResult[]>;
  prepareDataCompareFromTables?: (options: DataCompareFromTablesOptions) => Promise<DataCompareFromTablesPreparation>;
  buildDataCompareSyncPlan?: (options: { tables: unknown[] }) => Promise<DataCompareSyncPlan>;
  webdavSyncUpload?: typeof api.webdavSyncUpload;
  webdavSyncDownload?: typeof api.webdavSyncDownload;
  syncSavedSqlDirectory?: typeof api.syncSavedSqlDirectory;
  exportQueryResultCsv?: typeof api.exportQueryResultCsv;
  exportQueryResultXlsx?: typeof api.exportQueryResultXlsx;
  exportQueryResultJson?: typeof api.exportQueryResultJson;
  exportQueryResultMarkdown?: typeof api.exportQueryResultMarkdown;
}

export const AUTOMATION_JOBS_STORAGE_KEY = "dbx-workspace-automation-jobs";
export const AUTOMATION_RUN_RECORDS_STORAGE_KEY = "dbx-workspace-automation-run-records";
const RUN_RECORD_LIMIT = 200;

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

function defaultJobName(kind: AutomationJobKind): string {
  if (kind === "export") return "Export automation";
  if (kind === "sync") return "Sync automation";
  if (kind === "quality-check") return "Quality check automation";
  return "SQL automation";
}

export function computeNextAutomationRunAt(schedule: AutomationSchedule, nowInput: Date | string = new Date()): string | undefined {
  const now = typeof nowInput === "string" ? new Date(nowInput) : new Date(nowInput);
  if (Number.isNaN(now.getTime())) return undefined;
  if (schedule.type === "manual") return undefined;
  if (schedule.type === "intervalMinutes") {
    const minutes = Math.max(1, Math.floor(schedule.intervalMinutes || 0));
    return new Date(now.getTime() + minutes * 60_000).toISOString();
  }
  const match = schedule.dailyTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const next = new Date(now);
  next.setUTCHours(Number(match[1]), Number(match[2]), 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

export function readAutomationJobs(storage: AutomationStorage | undefined = defaultAutomationStorage()): AutomationJob[] {
  return readJsonArray<AutomationJob>(AUTOMATION_JOBS_STORAGE_KEY, storage).filter((job) => job && typeof job.id === "string");
}

export function saveAutomationJobs(jobs: AutomationJob[], storage: AutomationStorage | undefined = defaultAutomationStorage()): AutomationJob[] {
  return writeJsonArray(AUTOMATION_JOBS_STORAGE_KEY, jobs, storage);
}

export function upsertAutomationJob(job: AutomationJob, options: AutomationStorageOptions = {}): AutomationJob[] {
  const storage = options.storage ?? defaultAutomationStorage();
  const now = options.now ?? timestamp();
  const existingJobs = readAutomationJobs(storage);
  const existing = existingJobs.find((item) => item.id === job.id);
  const normalized: AutomationJob = {
    ...job,
    id: job.id || automationId(now),
    name: job.name.trim() || defaultJobName(job.kind),
    enabled: Boolean(job.enabled),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    nextRunAt: job.enabled ? computeNextAutomationRunAt(job.schedule, now) : undefined,
  };
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

export function dueAutomationJobs(jobs: AutomationJob[], now: string = timestamp(), runningJobIds: Set<string> = new Set()): AutomationJob[] {
  const nowTime = new Date(now).getTime();
  return jobs.filter((job) => job.enabled && !!job.nextRunAt && new Date(job.nextRunAt).getTime() <= nowTime && !runningJobIds.has(job.id));
}

export function buildAutomationRunPlan(job: AutomationJob, connection?: ConnectionConfig): AutomationRunPlan {
  const reasons: string[] = [];
  const connectionId = payloadString(job.payload, "connectionId");
  const sql = payloadString(job.payload, "sql").trim();
  const outputPath = payloadString(job.payload, "outputPath").trim();
  const syncMode = payloadString(job.payload, "syncMode");

  if ((job.kind === "sql" || job.kind === "export" || job.kind === "quality-check") && !connectionId) reasons.push("connection_required");
  if ((job.kind === "sql" || job.kind === "export" || job.kind === "quality-check") && !sql && payloadString(job.payload, "exportMode") !== "table") reasons.push("sql_required");
  if (job.kind === "export" && !outputPath) reasons.push("path_required");
  if (job.kind === "sync" && !syncMode) reasons.push("sync_mode_required");

  const sqlDecision = sql ? classifyAiSqlExecution(sql, connection) : undefined;
  if (sqlDecision?.action === "block") reasons.push("unsafe_sql");
  if (sqlDecision && sqlDecision.category !== "read" && classifyConnectionEnvironment(connection) === "production") reasons.push("production_write_automation");

  const safety: GovernanceSeverity = reasons.includes("unsafe_sql") || reasons.includes("production_write_automation") ? "critical" : reasons.length ? "warning" : "ok";
  return {
    valid: reasons.length === 0,
    safety,
    reasons,
    executableSql: sql || undefined,
    description: job.enabled ? "Automation job is ready to run." : "Automation job is disabled.",
  };
}

export async function runAutomationJob(job: AutomationJob, runtime: AutomationRuntime = {}): Promise<AutomationRunRecord> {
  const startedAt = runtime.now?.() ?? timestamp();
  const connection = runtime.connectionForId?.(payloadString(job.payload, "connectionId"));
  const plan = buildAutomationRunPlan(job, connection);
  const baseRecord = {
    id: runRecordId(startedAt),
    jobId: job.id,
    startedAt,
    auditLevel: plan.safety,
  };
  if (!plan.valid) {
    const finishedAt = runtime.now?.() ?? timestamp();
    appendSqlAutomationAudit(job, connection, "error", startedAt, finishedAt, plan.reasons.join(", "));
    return { ...baseRecord, status: "error", finishedAt, error: plan.reasons.join(", ") };
  }

  try {
    const result = await executeAutomation(job, runtime, plan);
    const finishedAt = runtime.now?.() ?? timestamp();
    appendSqlAutomationAudit(job, connection, "success", startedAt, finishedAt);
    return {
      ...baseRecord,
      status: "success",
      finishedAt,
      message: result.message,
      qualityProfile: result.qualityProfile,
    };
  } catch (error) {
    const finishedAt = runtime.now?.() ?? timestamp();
    const errorMessage = error instanceof Error ? error.message : String(error);
    appendSqlAutomationAudit(job, connection, "error", startedAt, finishedAt, errorMessage);
    return {
      ...baseRecord,
      status: "error",
      finishedAt,
      error: errorMessage,
    };
  }
}

function appendSqlAutomationAudit(job: AutomationJob, connection: ConnectionConfig | undefined, status: "success" | "error", startedAt: string, finishedAt: string, error?: string) {
  if (job.kind !== "sql" && job.kind !== "export" && job.kind !== "quality-check") return;
  const sql = payloadString(job.payload, "sql").trim();
  if (!sql) return;
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
      id: `automation-audit-${job.id}-${startedAt.replace(/\D/g, "")}`,
      connectionId: connection?.id || payloadString(job.payload, "connectionId"),
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

async function executeAutomation(job: AutomationJob, runtime: AutomationRuntime, plan: AutomationRunPlan): Promise<{ message: string; qualityProfile?: DataQualityProfile }> {
  if (job.kind === "sync") return executeSyncAutomation(job, runtime);

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
    return { message: "Export completed" };
  }
  return { message: "SQL executed" };
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

async function executeSyncAutomation(job: AutomationJob, runtime: AutomationRuntime): Promise<{ message: string }> {
  const syncMode = payloadString(job.payload, "syncMode");
  if (syncMode === "webdav-upload") {
    const payload = job.payload as WebDavSyncAutomationPayload;
    if (!payload.webDavConfig) throw new Error("webdav_config_required");
    await (runtime.webdavSyncUpload ?? api.webdavSyncUpload)(payload.webDavConfig, payload.editorSettings, payload.secretsPassphrase);
    return { message: "WebDAV upload completed" };
  }
  if (syncMode === "webdav-download") {
    const payload = job.payload as WebDavSyncAutomationPayload;
    if (!payload.webDavConfig) throw new Error("webdav_config_required");
    await (runtime.webdavSyncDownload ?? api.webdavSyncDownload)(payload.webDavConfig, payload.secretsPassphrase);
    return { message: "WebDAV download completed" };
  }
  if (syncMode === "saved-sql-directory") {
    const payload = job.payload as SavedSqlDirectorySyncAutomationPayload;
    if (!payload.targetDir) throw new Error("target_required");
    await (runtime.syncSavedSqlDirectory ?? api.syncSavedSqlDirectory)({ targetDir: payload.targetDir, entries: (payload.entries ?? []) as never[] });
    return { message: "Saved SQL directory synced" };
  }
  if (syncMode === "data-compare") {
    return executeDataCompareSync(job.payload as DataCompareSyncAutomationPayload, runtime);
  }
  throw new Error("sync_mode_required");
}

async function executeDataCompareSync(payload: DataCompareSyncAutomationPayload, runtime: AutomationRuntime): Promise<{ message: string }> {
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
  if (sql.trim()) {
    await (runtime.executeMulti ?? api.executeMulti)(options.targetConnectionId, options.targetDatabase, sql);
  }
  return { message: `Data sync executed ${statements.length} statements` };
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
