import { strict as assert } from "node:assert";
import { test } from "vitest";
import { classifyAiSqlExecution } from "../../apps/desktop/src/lib/aiSqlExecutionPolicy.ts";
import {
  appendAutomationDraft,
  buildAuditReport,
  buildAutomationPlan,
  buildAutomationRunPlan,
  buildChangeRequestArtifact,
  buildChangeRequestPlan,
  buildDataQualityReport,
  buildDiagnosticsSummary,
  buildDiagnosticsReport,
  buildGovernanceBundleReport,
  buildPluginPublishReport,
  canUseConnection,
  appendGovernanceAuditRecord,
  clearGovernanceAuditRecords,
  deleteAutomationDraft,
  createQueryAuditRecord,
  effectiveConnectionRole,
  evaluateSqlGovernance,
  findConnectionSharePolicy,
  readGovernanceAuditRecords,
  readAutomationDrafts,
  readConnectionSharePolicies,
  readGovernancePolicy,
  permissionsForRole,
  planAiGovernance,
  profileQueryResultQuality,
  saveGovernancePolicy,
  summarizePluginPublishing,
  topDataQualityFindings,
  upsertConnectionSharePolicy,
  updateAutomationDraft,
  validatePluginForPublishing,
  type WorkspacePrincipal,
} from "../../apps/desktop/src/lib/workspaceGovernance.ts";
import type { ConnectionConfig, PluginManifest, QueryResult } from "../../apps/desktop/src/types/database.ts";

function conn(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    id: "c1",
    name: "prod-db",
    db_type: "postgres",
    host: "10.0.0.5",
    port: 5432,
    username: "postgres",
    password: "",
    database: "app",
    ...overrides,
  };
}

const analyst: WorkspacePrincipal = { id: "u1", role: "analyst" };
const editor: WorkspacePrincipal = { id: "u2", role: "editor" };

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  };
}

test("workspace roles expose predictable permissions", () => {
  assert.equal(permissionsForRole("viewer").has("query:read"), false);
  assert.equal(permissionsForRole("analyst").has("query:read"), true);
  assert.equal(permissionsForRole("analyst").has("query:write"), false);
  assert.equal(permissionsForRole("admin").has("automation:manage"), true);
});

test("connection share policy overrides the workspace role", () => {
  const policy = { connectionId: "c1", defaultRole: "viewer" as const, grants: [{ principalId: "u1", role: "editor" as const }] };
  assert.equal(effectiveConnectionRole(analyst, policy), "editor");
  assert.equal(canUseConnection(analyst, policy), true);
});

test("connection share policies persist per connection", () => {
  const storage = memoryStorage();
  upsertConnectionSharePolicy({ connectionId: "c1", defaultRole: "viewer", grants: [] }, storage);
  upsertConnectionSharePolicy({ connectionId: "c2", defaultRole: "editor", grants: [{ principalId: "u1", role: "analyst" }] }, storage);

  assert.equal(readConnectionSharePolicies(storage).length, 2);
  assert.equal(findConnectionSharePolicy("c1", storage)?.defaultRole, "viewer");
  assert.equal(findConnectionSharePolicy("c2", storage)?.grants[0].role, "analyst");
});

test("SQL governance blocks writes for analysts and requires approval for production writes", () => {
  const analystDecision = evaluateSqlGovernance("UPDATE users SET name='a' WHERE id=1", conn(), { principal: analyst });
  assert.equal(analystDecision.allowed, false);
  assert.equal(analystDecision.reasons.includes("write_permission_required"), true);

  const editorDecision = evaluateSqlGovernance("UPDATE users SET name='a' WHERE id=1", conn(), { principal: editor });
  assert.equal(editorDecision.allowed, true);
  assert.equal(editorDecision.requiresApproval, true);
  assert.equal(editorDecision.reasons.includes("production_write_requires_approval"), true);
});

test("query audit records keep redacted, bounded SQL previews", () => {
  const decision = evaluateSqlGovernance("-- comment\nSELECT * FROM users", conn({ name: "local", host: "127.0.0.1" }), { principal: analyst });
  const audit = createQueryAuditRecord({
    id: "a1",
    connectionId: "c1",
    principalId: "u1",
    sql: "-- comment\nSELECT * FROM users",
    decision,
    createdAt: "2026-06-20T10:00:00.000Z",
  });
  assert.equal(audit.sqlPreview, "SELECT * FROM users");
  assert.equal(audit.decision.auditLevel, "info");
});

test("governance audit storage keeps newest records with a limit", () => {
  const storage = memoryStorage();
  const decision = evaluateSqlGovernance("SELECT 1", conn({ name: "local", host: "127.0.0.1" }), { principal: analyst });
  const first = createQueryAuditRecord({
    id: "a1",
    connectionId: "c1",
    principalId: "u1",
    sql: "SELECT 1",
    decision,
    createdAt: "2026-06-20T10:00:00.000Z",
  });
  const second = createQueryAuditRecord({
    id: "a2",
    connectionId: "c1",
    principalId: "u1",
    sql: "SELECT 2",
    decision,
    createdAt: "2026-06-20T10:01:00.000Z",
  });

  appendGovernanceAuditRecord({ ...first, status: "success", executionTimeMs: 1 }, { storage, limit: 1 });
  appendGovernanceAuditRecord({ ...second, status: "error", error: "failed" }, { storage, limit: 1 });
  const records = readGovernanceAuditRecords(storage);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, "a2");
  assert.equal(records[0].status, "error");
  assert.equal(clearGovernanceAuditRecords(storage).length, 0);
  assert.equal(readGovernanceAuditRecords(storage).length, 0);
});

test("audit reports summarize status and critical records", () => {
  const decision = evaluateSqlGovernance("DROP TABLE users", conn(), { principal: editor });
  const report = buildAuditReport([
    {
      ...createQueryAuditRecord({
        id: "a1",
        connectionId: "c1",
        principalId: "u2",
        sql: "DROP TABLE users",
        decision,
        createdAt: "2026-06-20T10:00:00.000Z",
      }),
      status: "error",
      error: "blocked",
    },
  ]);
  assert.match(report, /DBX Audit Report/);
  assert.match(report, /Critical: 1/);
});

test("change request plans generate migration names and require rollback for DDL", () => {
  const plan = buildChangeRequestPlan({
    id: "cr1",
    title: "Add billing table",
    sql: "CREATE TABLE billing(id int);",
    createdAt: "2026-06-20T10:00:00.000Z",
  });
  assert.equal(plan.migrationName, "20260620_add_billing_table.sql");
  assert.equal(plan.requiresApproval, true);
  assert.equal(plan.rollbackRequired, true);
  const artifact = buildChangeRequestArtifact({
    id: "cr1",
    title: "Add billing table",
    sql: "CREATE TABLE billing(id int);",
    createdAt: "2026-06-20T10:00:00.000Z",
  });
  assert.match(artifact.migrationSql, /CREATE TABLE billing/);
  assert.match(artifact.rollbackSql, /Rollback placeholder/);
});

test("diagnostics summary escalates connection and runtime errors", () => {
  const summary = buildDiagnosticsSummary({
    connections: [conn()],
    connectedIds: [],
    lastErrors: { c1: "password authentication failed" },
    driverRuntime: { running_count: 2, last_error: "agent crashed" },
  });
  assert.equal(summary.severity, "critical");
  assert.equal(summary.checks.some((check) => check.id === "driver-runtime.error"), true);
});

test("plugin publishing validation catches incomplete manifests", () => {
  const manifest: PluginManifest = {
    id: "sample",
    name: "Sample",
    drivers: [{ id: "sample-driver", label: "", kind: "external" }],
  };
  const result = validatePluginForPublishing(manifest);
  assert.equal(result.publishable, false);
  assert.equal(result.issues.some((issue) => issue.severity === "error"), true);
});

test("plugin publish summaries report blocked plugin manifests", () => {
  const valid: PluginManifest = {
    id: "good",
    name: "Good",
    version: "1.0.0",
    drivers: [{ id: "good-driver", label: "Good", kind: "external" }],
  };
  const invalid: PluginManifest = {
    id: "",
    name: "",
    drivers: [],
  };
  const summary = summarizePluginPublishing([valid, invalid]);
  const report = buildPluginPublishReport(summary);
  assert.equal(summary.total, 2);
  assert.equal(summary.publishable, 1);
  assert.equal(summary.blocked, 1);
  assert.match(report, /DBX Plugin Publish Report/);
});

test("AI governance requires dry run and approval when writes are disabled", () => {
  const sqlDecision = classifyAiSqlExecution("INSERT INTO users(name) VALUES ('a')", conn({ name: "local", host: "127.0.0.1" }));
  const plan = planAiGovernance(sqlDecision, { allowWrites: false });
  assert.equal(plan.canAutoExecute, false);
  assert.equal(plan.requiresDryRun, true);
  assert.equal(plan.requiresHumanApproval, true);
});

test("automation plans reject dangerous or incomplete schedules", () => {
  const dangerous = buildAutomationPlan({ kind: "sql", connectionId: "c1", schedule: "0 0 * * *", sql: "DROP TABLE users" }, conn());
  assert.equal(dangerous.valid, false);
  assert.equal(dangerous.safety, "critical");

  const missingTarget = buildAutomationPlan({ kind: "export", connectionId: "c1", schedule: "0 0 * * *" }, conn());
  assert.equal(missingTarget.reasons.includes("target_required"), true);
});

test("governance policy and automation drafts persist through injected storage", () => {
  const storage = memoryStorage();
  const policy = saveGovernancePolicy(
    {
      principalRole: "editor",
      requireApprovalForWrites: false,
      allowProductionWrites: true,
      allowDangerousSql: false,
      aiAllowWrites: false,
      aiRequireDryRunForWrites: true,
    },
    storage,
  );
  assert.equal(policy.principalRole, "editor");
  assert.deepEqual(readGovernancePolicy(storage), {
    principalRole: "editor",
    requireApprovalForWrites: false,
    allowProductionWrites: true,
    allowDangerousSql: false,
    aiAllowWrites: false,
    aiRequireDryRunForWrites: true,
  });

  appendAutomationDraft(
    {
      id: "job1",
      name: "Daily count",
      kind: "sql",
      connectionId: "c1",
      schedule: "0 8 * * *",
      sql: "SELECT count(*) FROM users",
    },
    { storage },
  );
  const drafts = readAutomationDrafts(storage);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].enabled, false);
  assert.equal(drafts[0].name, "Daily count");

  updateAutomationDraft("job1", { enabled: true }, storage);
  assert.equal(readAutomationDrafts(storage)[0].enabled, true);
  deleteAutomationDraft("job1", storage);
  assert.equal(readAutomationDrafts(storage).length, 0);
});

test("governance policy save fails when storage is unavailable", () => {
  assert.throws(
    () =>
      saveGovernancePolicy(
        {
          principalRole: "admin",
          requireApprovalForWrites: true,
          allowProductionWrites: false,
          allowDangerousSql: false,
          aiAllowWrites: true,
          aiRequireDryRunForWrites: true,
        },
        undefined,
      ),
    /storage is unavailable/,
  );
});

test("automation run plans expose executable SQL for manual review", () => {
  const draft = {
    id: "job1",
    name: "Daily count",
    kind: "sql" as const,
    connectionId: "c1",
    schedule: "manual",
    sql: "SELECT count(*) FROM users",
    enabled: true,
  };
  const plan = buildAutomationRunPlan(draft, conn({ name: "local", host: "127.0.0.1" }));
  assert.equal(plan.valid, true);
  assert.equal(plan.executableSql, "SELECT count(*) FROM users");
  assert.match(plan.description, /Ready/);
});

test("data quality profile reports nulls, duplicates, and numeric ranges", () => {
  const result: QueryResult = {
    columns: ["id", "score", "email"],
    rows: [
      [1, 10, "a@example.com"],
      [2, 20, ""],
      [2, 30, null],
    ],
    affected_rows: 0,
    execution_time_ms: 1,
  };
  const profile = profileQueryResultQuality(result);
  assert.equal(profile.rowCount, 3);
  assert.equal(profile.columnProfiles[0].duplicateCount, 1);
  assert.equal(profile.columnProfiles[1].min, 10);
  assert.equal(profile.columnProfiles[1].max, 30);
  assert.equal(profile.columnProfiles[2].nullCount, 2);
  assert.equal(topDataQualityFindings(profile)[0].name, "email");
});

test("governance reports include diagnostics, automation, audit, and quality sections", () => {
  const diagnostics = buildDiagnosticsSummary({
    connections: [conn({ name: "local", host: "127.0.0.1" })],
    connectedIds: ["c1"],
  });
  const quality = profileQueryResultQuality({
    columns: ["id"],
    rows: [[1]],
    affected_rows: 0,
    execution_time_ms: 1,
  });
  const diagnosticsReport = buildDiagnosticsReport(diagnostics);
  const qualityReport = buildDataQualityReport(quality);
  const bundle = buildGovernanceBundleReport({
    diagnostics,
    auditRecords: [],
    automationDrafts: [{ name: "Manual check", kind: "quality-check", connectionId: "c1", schedule: "manual", sql: "SELECT 1" }],
    qualityProfile: quality,
  });

  assert.match(diagnosticsReport, /DBX Diagnostics Report/);
  assert.match(qualityReport, /DBX Data Quality Report/);
  assert.match(bundle, /Automation Drafts/);
  assert.match(bundle, /Manual check/);
});
