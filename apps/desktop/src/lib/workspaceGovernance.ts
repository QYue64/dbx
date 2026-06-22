import { classifyAiSqlExecution, classifyConnectionEnvironment, stripAiSqlComments, type AiSqlExecutionDecision } from "@/lib/aiSqlExecutionPolicy";
import type { ConnectionConfig, InstalledPlugin, PluginManifest, QueryResult } from "@/types/database";

export type WorkspaceRole = "owner" | "admin" | "editor" | "analyst" | "viewer";
export type WorkspacePermission = "connection:manage" | "connection:read" | "query:read" | "query:write" | "query:dangerous" | "audit:read" | "automation:manage";
export type GovernanceSeverity = "ok" | "info" | "warning" | "critical";

export interface WorkspacePrincipal {
  id: string;
  role: WorkspaceRole;
}

export interface ConnectionGrant {
  principalId: string;
  role: WorkspaceRole;
}

export interface ConnectionSharePolicy {
  connectionId: string;
  defaultRole?: WorkspaceRole;
  grants: ConnectionGrant[];
}

export interface SqlGovernanceOptions {
  principal: WorkspacePrincipal;
  sharePolicy?: ConnectionSharePolicy;
  allowProductionWrites?: boolean;
  allowDangerousSql?: boolean;
  requireApprovalForWrites?: boolean;
}

export interface SqlGovernanceDecision {
  allowed: boolean;
  requiresApproval: boolean;
  auditLevel: GovernanceSeverity;
  sqlDecision: AiSqlExecutionDecision;
  reasons: string[];
}

export interface QueryAuditRecord {
  id: string;
  connectionId: string;
  principalId: string;
  sqlPreview: string;
  decision: SqlGovernanceDecision;
  createdAt: string;
}

export interface StoredQueryAuditRecord extends QueryAuditRecord {
  status: "success" | "error";
  executionTimeMs?: number;
  error?: string;
}

export interface GovernanceAuditStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface GovernancePolicySettings {
  principalRole: WorkspaceRole;
  requireApprovalForWrites: boolean;
  allowProductionWrites: boolean;
  allowDangerousSql: boolean;
  aiAllowWrites: boolean;
  aiRequireDryRunForWrites: boolean;
}

export interface ChangeRequestPlan {
  id: string;
  migrationName: string;
  requiresApproval: boolean;
  rollbackRequired: boolean;
  reasons: string[];
}

export interface ChangeRequestArtifact extends ChangeRequestPlan {
  migrationSql: string;
  rollbackSql: string;
}

export interface DiagnosticsInput {
  connections: ConnectionConfig[];
  connectedIds: Iterable<string>;
  lastErrors?: Record<string, string | undefined>;
  driverRuntime?: {
    health?: GovernanceSeverity | string;
    running_count?: number;
    last_error?: string | null;
  };
}

export interface DiagnosticsSummary {
  severity: GovernanceSeverity;
  checks: { id: string; severity: GovernanceSeverity; message: string }[];
}

export interface PluginValidationResult {
  publishable: boolean;
  issues: { severity: "warning" | "error"; message: string }[];
}

export interface AiGovernancePolicy {
  allowAutoExecute?: boolean;
  requireDryRunForWrites?: boolean;
  allowWrites?: boolean;
}

export interface AiGovernancePlan {
  canAutoExecute: boolean;
  requiresDryRun: boolean;
  requiresHumanApproval: boolean;
  reasons: string[];
}

export type AutomationKind = "sql" | "export" | "sync" | "quality-check";

export interface AutomationDraft {
  id?: string;
  name?: string;
  kind: AutomationKind;
  connectionId: string;
  schedule: string;
  sql?: string;
  target?: string;
  enabled?: boolean;
}

export interface AutomationPlan {
  valid: boolean;
  safety: GovernanceSeverity;
  reasons: string[];
}

export interface AutomationRunPlan extends AutomationPlan {
  executableSql?: string;
  description: string;
}

export interface DataQualityProfile {
  rowCount: number;
  columnProfiles: {
    name: string;
    nullCount: number;
    nullRate: number;
    distinctCount: number;
    duplicateCount: number;
    min?: number;
    max?: number;
  }[];
}

export interface GovernanceReportInput {
  diagnostics: DiagnosticsSummary;
  auditRecords: StoredQueryAuditRecord[];
  automationDrafts: AutomationDraft[];
  qualityProfile?: DataQualityProfile;
}

export interface PluginPublishSummary {
  total: number;
  publishable: number;
  blocked: number;
  issues: { pluginId: string; severity: "warning" | "error"; message: string }[];
}

const ROLE_PERMISSIONS: Record<WorkspaceRole, WorkspacePermission[]> = {
  owner: ["connection:manage", "connection:read", "query:read", "query:write", "query:dangerous", "audit:read", "automation:manage"],
  admin: ["connection:manage", "connection:read", "query:read", "query:write", "audit:read", "automation:manage"],
  editor: ["connection:read", "query:read", "query:write"],
  analyst: ["connection:read", "query:read"],
  viewer: ["connection:read"],
};

const WRITE_RE = /^(INSERT|UPDATE|DELETE|MERGE|REPLACE|CREATE)\b/i;
const DANGEROUS_RE = /^(DROP|TRUNCATE|ALTER|RENAME)\b/i;
export const GOVERNANCE_AUDIT_STORAGE_KEY = "dbx-governance-audit-log";
export const GOVERNANCE_POLICY_STORAGE_KEY = "dbx-governance-policy";
export const GOVERNANCE_AUTOMATION_STORAGE_KEY = "dbx-governance-automation-drafts";
export const GOVERNANCE_CONNECTION_POLICY_STORAGE_KEY = "dbx-governance-connection-policies";

export const DEFAULT_GOVERNANCE_POLICY: GovernancePolicySettings = {
  principalRole: "admin",
  requireApprovalForWrites: true,
  allowProductionWrites: false,
  allowDangerousSql: false,
  aiAllowWrites: true,
  aiRequireDryRunForWrites: true,
};

export function normalizeGovernancePolicy(policy: Partial<GovernancePolicySettings> | null | undefined): GovernancePolicySettings {
  return {
    principalRole: policy?.principalRole && ROLE_PERMISSIONS[policy.principalRole] ? policy.principalRole : DEFAULT_GOVERNANCE_POLICY.principalRole,
    requireApprovalForWrites: typeof policy?.requireApprovalForWrites === "boolean" ? policy.requireApprovalForWrites : DEFAULT_GOVERNANCE_POLICY.requireApprovalForWrites,
    allowProductionWrites: typeof policy?.allowProductionWrites === "boolean" ? policy.allowProductionWrites : DEFAULT_GOVERNANCE_POLICY.allowProductionWrites,
    allowDangerousSql: typeof policy?.allowDangerousSql === "boolean" ? policy.allowDangerousSql : DEFAULT_GOVERNANCE_POLICY.allowDangerousSql,
    aiAllowWrites: typeof policy?.aiAllowWrites === "boolean" ? policy.aiAllowWrites : DEFAULT_GOVERNANCE_POLICY.aiAllowWrites,
    aiRequireDryRunForWrites: typeof policy?.aiRequireDryRunForWrites === "boolean" ? policy.aiRequireDryRunForWrites : DEFAULT_GOVERNANCE_POLICY.aiRequireDryRunForWrites,
  };
}

export function permissionsForRole(role: WorkspaceRole): Set<WorkspacePermission> {
  return new Set(ROLE_PERMISSIONS[role]);
}

export function effectiveConnectionRole(principal: WorkspacePrincipal, policy?: ConnectionSharePolicy): WorkspaceRole {
  const grant = policy?.grants.find((item) => item.principalId === principal.id);
  return grant?.role ?? policy?.defaultRole ?? principal.role;
}

export function canUseConnection(principal: WorkspacePrincipal, policy?: ConnectionSharePolicy): boolean {
  return permissionsForRole(effectiveConnectionRole(principal, policy)).has("connection:read");
}

export function readConnectionSharePolicies(storage: GovernanceAuditStorage | undefined = defaultAuditStorage()): ConnectionSharePolicy[] {
  return readJsonArray<ConnectionSharePolicy>(GOVERNANCE_CONNECTION_POLICY_STORAGE_KEY, storage).filter((item) => item && typeof item.connectionId === "string");
}

export function saveConnectionSharePolicies(policies: ConnectionSharePolicy[], storage: GovernanceAuditStorage | undefined = defaultAuditStorage()): ConnectionSharePolicy[] {
  const normalized = policies.slice(0, 200).map((policy) => ({
    connectionId: policy.connectionId,
    defaultRole: policy.defaultRole,
    grants: Array.isArray(policy.grants) ? policy.grants : [],
  }));
  storage?.setItem(GOVERNANCE_CONNECTION_POLICY_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function upsertConnectionSharePolicy(policy: ConnectionSharePolicy, storage: GovernanceAuditStorage | undefined = defaultAuditStorage()): ConnectionSharePolicy[] {
  const policies = readConnectionSharePolicies(storage).filter((item) => item.connectionId !== policy.connectionId);
  return saveConnectionSharePolicies([policy, ...policies], storage);
}

export function findConnectionSharePolicy(connectionId: string | undefined, storage: GovernanceAuditStorage | undefined = defaultAuditStorage()): ConnectionSharePolicy | undefined {
  if (!connectionId) return undefined;
  return readConnectionSharePolicies(storage).find((policy) => policy.connectionId === connectionId);
}

export function evaluateSqlGovernance(sql: string, connection: ConnectionConfig | undefined, options: SqlGovernanceOptions): SqlGovernanceDecision {
  const sqlDecision = classifyAiSqlExecution(sql, connection);
  const role = effectiveConnectionRole(options.principal, options.sharePolicy);
  const permissions = permissionsForRole(role);
  const reasons = [...sqlDecision.reasons];
  let allowed = canUseConnection(options.principal, options.sharePolicy);
  let requiresApproval = sqlDecision.action === "confirm";

  if (!allowed) reasons.push("connection_not_granted");
  if (sqlDecision.action === "block" && !options.allowDangerousSql) {
    allowed = false;
    reasons.push("sql_policy_blocked");
  } else if (sqlDecision.action === "block") {
    requiresApproval = true;
    reasons.push("dangerous_sql_requires_approval");
  }
  if (sqlDecision.category !== "read" && !permissions.has("query:write")) {
    allowed = false;
    reasons.push("write_permission_required");
  }
  if (sqlDecision.category === "dangerous" && !options.allowDangerousSql) {
    allowed = false;
    reasons.push("dangerous_sql_disabled");
  }
  if (sqlDecision.environment === "production" && sqlDecision.category !== "read" && !options.allowProductionWrites) {
    requiresApproval = true;
    reasons.push("production_write_requires_approval");
  }
  if (options.requireApprovalForWrites && sqlDecision.category !== "read") {
    requiresApproval = true;
    reasons.push("workspace_write_approval_required");
  }

  const auditLevel: GovernanceSeverity = !allowed || sqlDecision.category === "dangerous" ? "critical" : requiresApproval ? "warning" : sqlDecision.category === "read" ? "info" : "warning";
  return {
    allowed,
    requiresApproval,
    auditLevel,
    sqlDecision,
    reasons: Array.from(new Set(reasons)),
  };
}

export function createQueryAuditRecord(input: { id: string; connectionId: string; principalId: string; sql: string; decision: SqlGovernanceDecision; createdAt: string }): QueryAuditRecord {
  return {
    id: input.id,
    connectionId: input.connectionId,
    principalId: input.principalId,
    sqlPreview: stripAiSqlComments(input.sql).trim().slice(0, 500),
    decision: input.decision,
    createdAt: input.createdAt,
  };
}

export function buildAuditReport(records: StoredQueryAuditRecord[]): string {
  const success = records.filter((record) => record.status === "success").length;
  const failed = records.filter((record) => record.status === "error").length;
  const critical = records.filter((record) => record.decision.auditLevel === "critical").length;
  const lines = ["DBX Audit Report", `Records: ${records.length}`, `Success: ${success}`, `Failed: ${failed}`, `Critical: ${critical}`, ""];
  for (const record of records.slice(0, 20)) {
    lines.push(`- [${record.status}/${record.decision.auditLevel}] ${record.createdAt} ${record.connectionId}: ${record.sqlPreview}`);
  }
  if (!records.length) lines.push("- No audit records.");
  return lines.join("\n");
}

function defaultAuditStorage(): GovernanceAuditStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function readJsonArray<T>(key: string, storage: GovernanceAuditStorage | undefined): T[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readJsonObject<T extends object>(key: string, fallback: T, storage: GovernanceAuditStorage | undefined): T {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

export function readGovernanceAuditRecords(storage: GovernanceAuditStorage | undefined = defaultAuditStorage()): StoredQueryAuditRecord[] {
  return readJsonArray<StoredQueryAuditRecord>(GOVERNANCE_AUDIT_STORAGE_KEY, storage).filter((item) => item && typeof item.id === "string");
}

export function appendGovernanceAuditRecord(record: StoredQueryAuditRecord, options: { limit?: number; storage?: GovernanceAuditStorage } = {}): StoredQueryAuditRecord[] {
  const storage = options.storage ?? defaultAuditStorage();
  const limit = Math.max(1, options.limit ?? 200);
  const records = [record, ...readGovernanceAuditRecords(storage)].slice(0, limit);
  storage?.setItem(GOVERNANCE_AUDIT_STORAGE_KEY, JSON.stringify(records));
  return records;
}

export function clearGovernanceAuditRecords(storage: GovernanceAuditStorage | undefined = defaultAuditStorage()): StoredQueryAuditRecord[] {
  storage?.setItem(GOVERNANCE_AUDIT_STORAGE_KEY, JSON.stringify([]));
  return [];
}

export function readGovernancePolicy(storage: GovernanceAuditStorage | undefined = defaultAuditStorage()): GovernancePolicySettings {
  return normalizeGovernancePolicy(readJsonObject(GOVERNANCE_POLICY_STORAGE_KEY, DEFAULT_GOVERNANCE_POLICY, storage));
}

export function saveGovernancePolicy(policy: GovernancePolicySettings, storage: GovernanceAuditStorage | undefined = defaultAuditStorage()): GovernancePolicySettings {
  if (!storage) throw new Error("Governance policy storage is unavailable");
  const normalized = normalizeGovernancePolicy(policy);
  storage.setItem(GOVERNANCE_POLICY_STORAGE_KEY, JSON.stringify(normalized));
  const persisted = readGovernancePolicy(storage);
  if (JSON.stringify(persisted) !== JSON.stringify(normalized)) {
    throw new Error("Governance policy was not persisted");
  }
  return persisted;
}

export function readAutomationDrafts(storage: GovernanceAuditStorage | undefined = defaultAuditStorage()): AutomationDraft[] {
  return readJsonArray<AutomationDraft>(GOVERNANCE_AUTOMATION_STORAGE_KEY, storage).filter((item) => item && typeof item.kind === "string");
}

export function saveAutomationDrafts(drafts: AutomationDraft[], storage: GovernanceAuditStorage | undefined = defaultAuditStorage()): AutomationDraft[] {
  const normalized = drafts.slice(0, 100).map((draft, index) => ({
    ...draft,
    id: draft.id || `draft-${index + 1}`,
    name: draft.name || `${draft.kind} automation`,
    enabled: draft.enabled ?? false,
  }));
  storage?.setItem(GOVERNANCE_AUTOMATION_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function appendAutomationDraft(draft: AutomationDraft, options: { storage?: GovernanceAuditStorage; limit?: number } = {}): AutomationDraft[] {
  const storage = options.storage ?? defaultAuditStorage();
  const limit = Math.max(1, options.limit ?? 100);
  const next = [{ ...draft, id: draft.id || `automation-${Date.now()}`, enabled: draft.enabled ?? false }, ...readAutomationDrafts(storage)].slice(0, limit);
  return saveAutomationDrafts(next, storage);
}

export function updateAutomationDraft(id: string, patch: Partial<AutomationDraft>, storage: GovernanceAuditStorage | undefined = defaultAuditStorage()): AutomationDraft[] {
  return saveAutomationDrafts(
    readAutomationDrafts(storage).map((draft) => (draft.id === id ? { ...draft, ...patch, id } : draft)),
    storage,
  );
}

export function deleteAutomationDraft(id: string, storage: GovernanceAuditStorage | undefined = defaultAuditStorage()): AutomationDraft[] {
  return saveAutomationDrafts(
    readAutomationDrafts(storage).filter((draft) => draft.id !== id),
    storage,
  );
}

export function buildChangeRequestPlan(input: { id: string; sql: string; title: string; createdAt: string }): ChangeRequestPlan {
  const normalizedTitle =
    input.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "database_change";
  const sqlText = stripAiSqlComments(input.sql).trim();
  const statements = sqlText
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  const hasDangerous = statements.some((statement) => DANGEROUS_RE.test(statement));
  const hasWrite = statements.some((statement) => WRITE_RE.test(statement) || DANGEROUS_RE.test(statement));
  const date = input.createdAt.slice(0, 10).replace(/-/g, "");
  const reasons = [];
  if (hasDangerous) reasons.push("destructive_or_schema_change");
  if (statements.length > 1) reasons.push("multi_statement_change");
  if (!hasWrite) reasons.push("read_only_change");

  return {
    id: input.id,
    migrationName: `${date}_${normalizedTitle}.sql`,
    requiresApproval: hasWrite,
    rollbackRequired: hasWrite,
    reasons,
  };
}

export function buildChangeRequestArtifact(input: { id: string; sql: string; title: string; createdAt: string }): ChangeRequestArtifact {
  const plan = buildChangeRequestPlan(input);
  const sql = stripAiSqlComments(input.sql).trim();
  const migrationSql = [`-- Migration: ${plan.migrationName}`, "-- Review before applying to production.", sql.endsWith(";") ? sql : `${sql};`].join("\n");
  const rollbackSql = plan.rollbackRequired
    ? [`-- Rollback placeholder for: ${plan.migrationName}`, "-- DBX cannot infer a safe rollback for arbitrary SQL.", "-- Add explicit compensating statements before approval."].join("\n")
    : `-- No rollback required for read-only change: ${plan.migrationName}`;
  return { ...plan, migrationSql, rollbackSql };
}

export function buildDiagnosticsSummary(input: DiagnosticsInput): DiagnosticsSummary {
  const connected = new Set(input.connectedIds);
  const checks: DiagnosticsSummary["checks"] = [];
  if (!input.connections.length)
    checks.push({
      id: "connections.empty",
      severity: "warning",
      message: "No saved database connections.",
    });
  for (const connection of input.connections) {
    const error = input.lastErrors?.[connection.id];
    if (error)
      checks.push({
        id: `connection.${connection.id}.error`,
        severity: "critical",
        message: `${connection.name}: ${error}`,
      });
    else if (!connected.has(connection.id))
      checks.push({
        id: `connection.${connection.id}.offline`,
        severity: "info",
        message: `${connection.name} is not connected.`,
      });
  }
  if (input.driverRuntime?.last_error) {
    checks.push({
      id: "driver-runtime.error",
      severity: "critical",
      message: input.driverRuntime.last_error,
    });
  }
  if (typeof input.driverRuntime?.running_count === "number") {
    checks.push({
      id: "driver-runtime.count",
      severity: "info",
      message: `${input.driverRuntime.running_count} driver runtimes are running.`,
    });
  }
  const severity = checks.some((check) => check.severity === "critical") ? "critical" : checks.some((check) => check.severity === "warning") ? "warning" : "ok";
  return { severity, checks };
}

export function buildDiagnosticsReport(summary: DiagnosticsSummary): string {
  const lines = [`DBX Diagnostics Report`, `Severity: ${summary.severity}`, `Checks: ${summary.checks.length}`, ""];
  for (const check of summary.checks) {
    lines.push(`- [${check.severity}] ${check.id}: ${check.message}`);
  }
  if (!summary.checks.length) lines.push("- [ok] diagnostics.clean: No diagnostic findings.");
  return lines.join("\n");
}

export function validatePluginForPublishing(plugin: InstalledPlugin | PluginManifest): PluginValidationResult {
  const manifest = "manifest" in plugin ? plugin.manifest : plugin;
  const issues: PluginValidationResult["issues"] = [];
  if (!manifest.id?.trim()) issues.push({ severity: "error", message: "Plugin id is required." });
  if (!manifest.name?.trim()) issues.push({ severity: "error", message: "Plugin name is required." });
  if (!manifest.version) issues.push({ severity: "warning", message: "Plugin version is recommended." });
  if (!manifest.drivers?.length) issues.push({ severity: "error", message: "At least one driver must be declared." });
  for (const driver of manifest.drivers ?? []) {
    if (!driver.id || !driver.label || !driver.kind) {
      issues.push({ severity: "error", message: "Each driver needs id, label, and kind." });
    }
  }
  return { publishable: !issues.some((issue) => issue.severity === "error"), issues };
}

export function summarizePluginPublishing(plugins: (InstalledPlugin | PluginManifest)[]): PluginPublishSummary {
  const issues: PluginPublishSummary["issues"] = [];
  let publishable = 0;
  for (const plugin of plugins) {
    const manifest = "manifest" in plugin ? plugin.manifest : plugin;
    const result = validatePluginForPublishing(plugin);
    if (result.publishable) publishable += 1;
    for (const issue of result.issues) {
      issues.push({
        pluginId: manifest.id || "unknown-plugin",
        severity: issue.severity,
        message: issue.message,
      });
    }
  }
  return {
    total: plugins.length,
    publishable,
    blocked: plugins.length - publishable,
    issues,
  };
}

export function buildPluginPublishReport(summary: PluginPublishSummary): string {
  const lines = ["DBX Plugin Publish Report", `Plugins: ${summary.total}`, `Publishable: ${summary.publishable}`, `Blocked: ${summary.blocked}`, ""];
  for (const issue of summary.issues.slice(0, 50)) {
    lines.push(`- [${issue.severity}] ${issue.pluginId}: ${issue.message}`);
  }
  if (!summary.issues.length) lines.push("- No plugin publish issues.");
  return lines.join("\n");
}

export function planAiGovernance(sqlDecision: AiSqlExecutionDecision, policy: AiGovernancePolicy = {}): AiGovernancePlan {
  const reasons: string[] = [];
  const isWrite = sqlDecision.category !== "read";
  if (policy.allowAutoExecute === false) reasons.push("ai_auto_execute_disabled");
  if (isWrite && policy.allowWrites === false) reasons.push("ai_writes_disabled");
  if (isWrite && policy.requireDryRunForWrites !== false) reasons.push("ai_write_dry_run_required");

  return {
    canAutoExecute: sqlDecision.action === "auto_execute" && policy.allowAutoExecute !== false && !(isWrite && policy.allowWrites === false),
    requiresDryRun: isWrite && policy.requireDryRunForWrites !== false,
    requiresHumanApproval: sqlDecision.action !== "auto_execute" || (isWrite && policy.allowWrites === false),
    reasons,
  };
}

export function buildAutomationPlan(draft: AutomationDraft, connection?: ConnectionConfig): AutomationPlan {
  const reasons: string[] = [];
  if (!draft.connectionId) reasons.push("connection_required");
  if (!draft.schedule.trim()) reasons.push("schedule_required");
  if ((draft.kind === "sql" || draft.kind === "quality-check") && !draft.sql?.trim()) reasons.push("sql_required");
  if ((draft.kind === "export" || draft.kind === "sync") && !draft.target?.trim()) reasons.push("target_required");

  const sqlDecision = draft.sql ? classifyAiSqlExecution(draft.sql, connection) : undefined;
  if (sqlDecision?.action === "block") reasons.push("unsafe_sql");
  if (sqlDecision && sqlDecision.category !== "read" && classifyConnectionEnvironment(connection) === "production") reasons.push("production_write_automation");

  const safety: GovernanceSeverity = reasons.includes("unsafe_sql") || reasons.includes("production_write_automation") ? "critical" : reasons.length ? "warning" : "ok";
  return { valid: reasons.length === 0, safety, reasons };
}

export function buildAutomationRunPlan(draft: AutomationDraft, connection?: ConnectionConfig): AutomationRunPlan {
  const plan = buildAutomationPlan(draft, connection);
  if (draft.kind === "sql" || draft.kind === "quality-check") {
    return {
      ...plan,
      executableSql: draft.sql?.trim(),
      description: draft.enabled ? "Ready to open in a query tab." : "Draft is disabled; open manually to review before running.",
    };
  }
  return {
    ...plan,
    description: draft.kind === "export" ? "Export automation requires a target path and an export surface." : "Sync automation requires a target and a sync implementation.",
  };
}

export function profileQueryResultQuality(result: QueryResult): DataQualityProfile {
  const rowCount = result.rows.length;
  const columnProfiles = result.columns.map((name, index) => {
    const values = result.rows.map((row) => row[index]);
    const nullCount = values.filter((value) => value === null || value === "").length;
    const distinct = new Set(values.map((value) => String(value)));
    const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return {
      name,
      nullCount,
      nullRate: rowCount ? nullCount / rowCount : 0,
      distinctCount: distinct.size,
      duplicateCount: Math.max(0, rowCount - distinct.size),
      min: numbers.length ? Math.min(...numbers) : undefined,
      max: numbers.length ? Math.max(...numbers) : undefined,
    };
  });
  return { rowCount, columnProfiles };
}

export function buildDataQualityReport(profile: DataQualityProfile): string {
  const lines = [`DBX Data Quality Report`, `Rows: ${profile.rowCount}`, `Columns: ${profile.columnProfiles.length}`, ""];
  for (const column of profile.columnProfiles) {
    const range = column.min === undefined || column.max === undefined ? "" : `, range=${column.min}..${column.max}`;
    lines.push(`- ${column.name}: nulls=${column.nullCount} (${Math.round(column.nullRate * 100)}%), distinct=${column.distinctCount}, duplicates=${column.duplicateCount}${range}`);
  }
  return lines.join("\n");
}

export function topDataQualityFindings(profile: DataQualityProfile, limit = 5): DataQualityProfile["columnProfiles"] {
  return [...profile.columnProfiles]
    .sort((a, b) => b.nullRate - a.nullRate || b.duplicateCount - a.duplicateCount || a.name.localeCompare(b.name))
    .filter((column) => column.nullCount > 0 || column.duplicateCount > 0)
    .slice(0, limit);
}

export function buildGovernanceBundleReport(input: GovernanceReportInput): string {
  const lines = [
    "DBX Governance Bundle",
    `Generated: ${new Date().toISOString()}`,
    "",
    buildDiagnosticsReport(input.diagnostics),
    "",
    "Audit",
    `Records: ${input.auditRecords.length}`,
    ...input.auditRecords.slice(0, 20).map((record) => `- [${record.status}] ${record.createdAt} ${record.sqlPreview}`),
    "",
    "Automation Drafts",
    `Drafts: ${input.automationDrafts.length}`,
    ...input.automationDrafts.slice(0, 20).map((draft) => `- [${draft.enabled ? "enabled" : "disabled"}] ${draft.name || draft.kind}: ${draft.schedule}`),
  ];
  if (input.qualityProfile) {
    lines.push("", buildDataQualityReport(input.qualityProfile));
  }
  return lines.join("\n");
}
