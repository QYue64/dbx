import assert from "node:assert/strict";
import { test } from "vitest";
import {
  appendAutomationRunRecord,
  buildAutomationRunPlan,
  computeNextAutomationRunAt,
  clearAutomationRunRecords,
  deleteAutomationJob,
  dueAutomationJobs,
  exportAutomationBundle,
  importAutomationBundle,
  readAutomationJobs,
  readAutomationRunRecords,
  runAutomationJob,
  saveAutomationJobs,
  upsertAutomationJob,
  type AutomationJob,
} from "../../apps/desktop/src/lib/workspaceAutomation.ts";
import { readGovernanceAuditRecords } from "../../apps/desktop/src/lib/workspaceGovernance.ts";
import type { ConnectionConfig } from "../../apps/desktop/src/types/database.ts";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

async function withLocalStorage<T>(run: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = memoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      ...storage,
      removeItem: () => {},
      clear: () => {},
    },
  });
  try {
    return await run();
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

function baseJob(patch: Partial<AutomationJob> = {}): AutomationJob {
  return {
    id: "job-1",
    name: "Daily report",
    kind: "sql",
    enabled: true,
    schedule: { type: "intervalMinutes", intervalMinutes: 15 },
    payload: {
      connectionId: "conn-1",
      database: "main",
      sql: "select 1",
    },
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
    ...patch,
  };
}

const connection: ConnectionConfig = {
  id: "conn-1",
  name: "Local",
  db_type: "postgres",
  host: "localhost",
  port: 5432,
  username: "user",
  password: "",
  database: "main",
  ssl: false,
};

test("computes manual, interval, and daily next run times", () => {
  const now = new Date(2026, 5, 28, 10, 5, 0, 0);

  assert.equal(computeNextAutomationRunAt({ type: "manual" }, now), undefined);
  assert.equal(computeNextAutomationRunAt({ type: "intervalMinutes", intervalMinutes: 15 }, now), new Date(now.getTime() + 15 * 60_000).toISOString());

  const sameDayDaily = new Date(computeNextAutomationRunAt({ type: "dailyTime", dailyTime: "10:30" }, now)!);
  assert.equal(sameDayDaily.getFullYear(), 2026);
  assert.equal(sameDayDaily.getMonth(), 5);
  assert.equal(sameDayDaily.getDate(), 28);
  assert.equal(sameDayDaily.getHours(), 10);
  assert.equal(sameDayDaily.getMinutes(), 30);

  const nextDayDaily = new Date(computeNextAutomationRunAt({ type: "dailyTime", dailyTime: "09:30" }, now)!);
  assert.equal(nextDayDaily.getFullYear(), 2026);
  assert.equal(nextDayDaily.getMonth(), 5);
  assert.equal(nextDayDaily.getDate(), 29);
  assert.equal(nextDayDaily.getHours(), 9);
  assert.equal(nextDayDaily.getMinutes(), 30);

  const weekly = new Date(computeNextAutomationRunAt({ type: "weekly", daysOfWeek: [1, 3], dailyTime: "08:15" }, now)!);
  assert.equal(weekly.getDay(), 1);
  assert.equal(weekly.getHours(), 8);
  assert.equal(weekly.getMinutes(), 15);

  const monthly = new Date(computeNextAutomationRunAt({ type: "monthly", dayOfMonth: 1, dailyTime: "07:05" }, now)!);
  assert.equal(monthly.getMonth(), 6);
  assert.equal(monthly.getDate(), 1);
  assert.equal(monthly.getHours(), 7);
  assert.equal(monthly.getMinutes(), 5);
});

test("validates malformed automation schedules", () => {
  const invalidInterval = buildAutomationRunPlan(baseJob({ schedule: { type: "intervalMinutes", intervalMinutes: 0 } }), connection);
  assert.equal(invalidInterval.valid, false);
  assert.ok(invalidInterval.reasons.includes("schedule_invalid"));

  const invalidDaily = buildAutomationRunPlan(baseJob({ schedule: { type: "dailyTime", dailyTime: "25:99" } }), connection);
  assert.equal(invalidDaily.valid, false);
  assert.ok(invalidDaily.reasons.includes("schedule_invalid"));
});

test("persists jobs, updates timestamps, and deletes jobs", () => {
  const storage = memoryStorage();
  const saved = upsertAutomationJob(baseJob({ id: "", name: "" }), { storage, now: "2026-06-28T01:00:00.000Z" });

  assert.equal(saved.length, 1);
  assert.match(saved[0].id, /^automation-/);
  assert.equal(saved[0].name, "SQL automation");
  assert.equal(saved[0].createdAt, "2026-06-28T01:00:00.000Z");
  assert.equal(saved[0].nextRunAt, "2026-06-28T01:15:00.000Z");

  const updated = upsertAutomationJob({ ...saved[0], name: "Renamed" }, { storage, now: "2026-06-28T02:00:00.000Z" });
  assert.equal(updated[0].name, "Renamed");
  assert.equal(updated[0].createdAt, "2026-06-28T01:00:00.000Z");
  assert.equal(updated[0].updatedAt, "2026-06-28T02:00:00.000Z");

  assert.equal(readAutomationJobs(storage).length, 1);
  assert.equal(deleteAutomationJob(updated[0].id, storage).length, 0);
});

test("keeps the newest 200 run records", () => {
  const storage = memoryStorage();
  for (let index = 0; index < 205; index += 1) {
    appendAutomationRunRecord(
      {
        id: `run-${index}`,
        jobId: "job-1",
        status: "success",
        startedAt: `2026-06-28T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
        finishedAt: `2026-06-28T00:${String(index % 60).padStart(2, "0")}:01.000Z`,
      },
      { storage },
    );
  }

  const records = readAutomationRunRecords(storage);
  assert.equal(records.length, 200);
  assert.equal(records[0].id, "run-204");
  assert.equal(records.at(-1)?.id, "run-5");
});

test("clears run records globally or for a single job", () => {
  const storage = memoryStorage();
  appendAutomationRunRecord({ id: "run-1", jobId: "job-1", status: "success", startedAt: "2026-06-28T00:00:00.000Z" }, { storage });
  appendAutomationRunRecord({ id: "run-2", jobId: "job-2", status: "error", startedAt: "2026-06-28T00:01:00.000Z" }, { storage });

  assert.equal(clearAutomationRunRecords({ jobId: "job-1", storage }).length, 1);
  assert.equal(readAutomationRunRecords(storage)[0].jobId, "job-2");
  assert.equal(clearAutomationRunRecords({ storage }).length, 0);
});

test("redacts WebDAV secrets when persisting and exporting jobs", () => {
  const storage = memoryStorage();
  const [saved] = upsertAutomationJob(
    baseJob({
      kind: "sync",
      payload: {
        syncMode: "webdav-upload",
        webDavConfig: {
          endpoint: "https://dav.example.test",
          username: "user",
          password: "secret",
          remotePath: "DBX/sync",
        },
        secretsPassphrase: "phrase",
      },
    }),
    { storage, now: "2026-06-28T00:00:00.000Z" },
  );

  const savedPayload = saved.payload as any;
  assert.equal(savedPayload.webDavConfig.password, undefined);
  assert.equal(savedPayload.secretsPassphrase, undefined);

  const bundle = exportAutomationBundle({ jobs: readAutomationJobs(storage), records: [], includeHistory: true });
  assert.equal(JSON.stringify(bundle).includes("secret"), false);
  assert.equal(JSON.stringify(bundle).includes("phrase"), false);
});

test("exports and imports automation bundles with merge and replace modes", () => {
  const storage = memoryStorage();
  const bundle = exportAutomationBundle({
    jobs: [baseJob({ id: "job-1", name: "Original" })],
    records: [{ id: "run-1", jobId: "job-1", status: "success", startedAt: "2026-06-28T00:00:00.000Z" }],
    includeHistory: true,
  });

  importAutomationBundle(bundle, { storage, mode: "merge", now: "2026-06-28T00:00:00.000Z" });
  assert.equal(readAutomationJobs(storage).length, 1);
  assert.equal(readAutomationRunRecords(storage).length, 1);

  const replaceBundle = exportAutomationBundle({
    jobs: [baseJob({ id: "job-2", name: "Replacement" })],
    records: [],
    includeHistory: false,
  });
  importAutomationBundle(replaceBundle, { storage, mode: "replace", now: "2026-06-28T00:01:00.000Z" });
  assert.deepEqual(
    readAutomationJobs(storage).map((job) => job.id),
    ["job-2"],
  );
  assert.equal(readAutomationRunRecords(storage).length, 0);
});

test("finds only enabled due jobs and ignores running jobs", () => {
  const now = "2026-06-28T10:00:00.000Z";
  const due = baseJob({ id: "due", nextRunAt: now });
  const disabled = baseJob({ id: "disabled", enabled: false, nextRunAt: now });
  const future = baseJob({ id: "future", nextRunAt: "2026-06-28T10:01:00.000Z" });
  const manual = baseJob({ id: "manual", schedule: { type: "manual" }, nextRunAt: undefined });

  assert.deepEqual(
    dueAutomationJobs([due, disabled, future, manual], now, new Set(["due"])).map((job) => job.id),
    [],
  );
  assert.deepEqual(
    dueAutomationJobs([due, disabled, future, manual], now, new Set()).map((job) => job.id),
    ["due"],
  );
});

test("validates SQL and production write automation jobs", () => {
  const missingSql = buildAutomationRunPlan(baseJob({ payload: { connectionId: "conn-1", database: "main", sql: "" } }), connection);
  assert.equal(missingSql.valid, false);
  assert.ok(missingSql.reasons.includes("sql_required"));

  const missingConnection = buildAutomationRunPlan(baseJob({ payload: { connectionId: "missing", database: "main", sql: "select 1" } }), undefined);
  assert.equal(missingConnection.valid, false);
  assert.ok(missingConnection.reasons.includes("connection_not_found"));

  const productionWrite = buildAutomationRunPlan(baseJob({ payload: { connectionId: "conn-1", database: "main", sql: "update users set active = false" } }), { ...connection, name: "prod" });
  assert.equal(productionWrite.valid, false);
  assert.equal(productionWrite.safety, "critical");
  assert.ok(productionWrite.reasons.includes("production_write_automation"));
});

test("validates export and sync payloads before execution", () => {
  const invalidExportMode = buildAutomationRunPlan(
    baseJob({
      kind: "export",
      payload: { connectionId: "conn-1", database: "main", exportMode: "archive", sql: "select 1", outputPath: "/tmp/users.csv" },
    }),
    connection,
  );
  assert.equal(invalidExportMode.valid, false);
  assert.ok(invalidExportMode.reasons.includes("export_mode_invalid"));

  const tableExport = buildAutomationRunPlan(
    baseJob({
      kind: "export",
      payload: { connectionId: "conn-1", database: "main", exportMode: "table", outputPath: "/tmp/users.csv" },
    }),
    connection,
  );
  assert.equal(tableExport.valid, false);
  assert.ok(tableExport.reasons.includes("table_required"));

  const querySqlExport = buildAutomationRunPlan(
    baseJob({
      kind: "export",
      payload: { connectionId: "conn-1", database: "main", exportMode: "query", sql: "select 1", outputPath: "/tmp/users.sql", format: "sql" },
    }),
    connection,
  );
  assert.equal(querySqlExport.valid, false);
  assert.ok(querySqlExport.reasons.includes("format_invalid"));

  const tableXmlExport = buildAutomationRunPlan(
    baseJob({
      kind: "export",
      payload: { connectionId: "conn-1", database: "main", exportMode: "table", table: "users", outputPath: "/tmp/users.xml", format: "xml" },
    }),
    connection,
  );
  assert.equal(tableXmlExport.valid, false);
  assert.ok(tableXmlExport.reasons.includes("format_invalid"));

  const webdavUpload = buildAutomationRunPlan(baseJob({ kind: "sync", payload: { syncMode: "webdav-upload" } }), connection);
  assert.equal(webdavUpload.valid, false);
  assert.ok(webdavUpload.reasons.includes("webdav_config_required"));

  const webdavMissingEndpoint = buildAutomationRunPlan(baseJob({ kind: "sync", payload: { syncMode: "webdav-upload", webDavConfig: {} } }), connection);
  assert.equal(webdavMissingEndpoint.valid, false);
  assert.ok(webdavMissingEndpoint.reasons.includes("webdav_endpoint_required"));

  const savedSqlSync = buildAutomationRunPlan(baseJob({ kind: "sync", payload: { syncMode: "saved-sql-directory" } }), connection);
  assert.equal(savedSqlSync.valid, false);
  assert.ok(savedSqlSync.reasons.includes("target_required"));

  const dataCompare = buildAutomationRunPlan(
    baseJob({
      kind: "sync",
      payload: {
        syncMode: "data-compare",
        sourceConnectionId: "source",
        sourceDatabase: "db1",
        sourceSchema: "public",
        sourceTable: "users",
        targetConnectionId: "target",
        targetDatabase: "db2",
        targetSchema: "public",
        targetTable: "users",
        columns: ["id", "name"],
      },
    }),
    connection,
  );
  assert.equal(dataCompare.valid, false);
  assert.ok(dataCompare.reasons.includes("key_columns_required"));

  const invalidSyncExecutionMode = buildAutomationRunPlan(
    baseJob({
      kind: "sync",
      payload: {
        syncMode: "data-compare",
        syncExecutionMode: "apply",
        sourceConnectionId: "source",
        sourceDatabase: "db1",
        sourceSchema: "public",
        sourceTable: "users",
        targetConnectionId: "target",
        targetDatabase: "db2",
        targetSchema: "public",
        targetTable: "users",
        columns: ["id", "name"],
        keyColumns: ["id"],
      },
    }),
    connection,
  );
  assert.equal(invalidSyncExecutionMode.valid, false);
  assert.ok(invalidSyncExecutionMode.reasons.includes("sync_execution_mode_invalid"));
});

test("blocks executable data sync plans against production targets before running", () => {
  const payload = {
    syncMode: "data-compare" as const,
    sourceConnectionId: "source",
    sourceDatabase: "db1",
    sourceSchema: "public",
    sourceTable: "users",
    targetConnectionId: "target",
    targetDatabase: "db2",
    targetSchema: "public",
    targetTable: "users",
    columns: ["id", "name"],
    keyColumns: ["id"],
  };
  const productionTarget = { ...connection, id: "target", name: "Production" };

  const executePlan = buildAutomationRunPlan(baseJob({ kind: "sync", payload }), productionTarget);
  assert.equal(executePlan.valid, false);
  assert.equal(executePlan.safety, "critical");
  assert.ok(executePlan.reasons.includes("production_write_automation"));

  const previewPlan = buildAutomationRunPlan(baseJob({ kind: "sync", payload: { ...payload, syncExecutionMode: "preview" } }), productionTarget);
  assert.equal(previewPlan.valid, true);
  assert.equal(previewPlan.safety, "ok");

  const missingTarget = buildAutomationRunPlan(baseJob({ kind: "sync", payload }), undefined);
  assert.equal(missingTarget.valid, false);
  assert.ok(missingTarget.reasons.includes("target_connection_not_found"));

  const missingSource = buildAutomationRunPlan(baseJob({ kind: "sync", payload }), productionTarget, {
    sourceConnection: undefined,
    targetConnection: productionTarget,
  });
  assert.equal(missingSource.valid, false);
  assert.ok(missingSource.reasons.includes("source_connection_not_found"));
});

test("runs data sync by preparing a compare plan and executing target SQL", async () => {
  const calls: string[] = [];
  const result = await runAutomationJob(
    baseJob({
      kind: "sync",
      payload: {
        syncMode: "data-compare",
        sourceConnectionId: "source",
        sourceDatabase: "db1",
        sourceSchema: "public",
        sourceTable: "users",
        targetConnectionId: "target",
        targetDatabase: "db2",
        targetSchema: "public",
        targetTable: "users",
        columns: ["id", "name"],
        keyColumns: ["id"],
      },
    }),
    {
      now: () => "2026-06-28T10:00:00.000Z",
      connectionForId: (id) => ({ ...connection, id }),
      prepareDataCompareFromTables: async () => ({
        result: { added: [], removed: [], modified: [] },
        syncStatements: ["update users set name = 'A' where id = 1;"],
        syncSql: "update users set name = 'A' where id = 1;",
        preSyncStatements: [],
        sourceRowCount: 1,
        targetRowCount: 1,
        sourceTruncated: false,
        targetTruncated: false,
      }),
      buildDataCompareSyncPlan: async () => ({
        insertCount: 0,
        updateCount: 1,
        deleteCount: 0,
        statementCount: 1,
        syncStatements: ["update users set name = 'A' where id = 1;"],
        syncSql: "update users set name = 'A' where id = 1;",
      }),
      executeMulti: async (connectionId, database, sql) => {
        calls.push(`${connectionId}:${database}:${sql}`);
        return { columns: [], rows: [], affected_rows: 1, execution_time_ms: 5 };
      },
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.message, "Data sync executed 1 statements");
  assert.equal(result.syncPlan?.statementCount, 1);
  assert.equal(result.syncPlan?.syncSqlPreview, "update users set name = 'A' where id = 1;");
  assert.deepEqual(calls, ["target:db2:update users set name = 'A' where id = 1;"]);
});

test("audits generated data sync SQL on successful execution", async () => {
  await withLocalStorage(async () => {
    const result = await runAutomationJob(
      baseJob({
        kind: "sync",
        payload: {
          syncMode: "data-compare",
          sourceConnectionId: "source",
          sourceDatabase: "db1",
          sourceSchema: "public",
          sourceTable: "users",
          targetConnectionId: "target",
          targetDatabase: "db2",
          targetSchema: "public",
          targetTable: "users",
          columns: ["id", "name"],
          keyColumns: ["id"],
        },
      }),
      {
        now: () => "2026-06-28T10:00:00.000Z",
        connectionForId: (id) => ({ ...connection, id }),
        prepareDataCompareFromTables: async () => ({
          result: { added: [], removed: [], modified: [] },
          syncStatements: ["update users set name = 'A' where id = 1;"],
          syncSql: "update users set name = 'A' where id = 1;",
          preSyncStatements: [],
          sourceRowCount: 1,
          targetRowCount: 1,
          sourceTruncated: false,
          targetTruncated: false,
        }),
        buildDataCompareSyncPlan: async () => ({
          insertCount: 0,
          updateCount: 1,
          deleteCount: 0,
          statementCount: 1,
          syncStatements: ["update users set name = 'A' where id = 1;"],
          syncSql: "update users set name = 'A' where id = 1;",
        }),
        executeMulti: async () => ({ columns: [], rows: [], affected_rows: 1, execution_time_ms: 5 }),
      },
    );

    assert.equal(result.status, "success");
    const records = readGovernanceAuditRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0].status, "success");
    assert.equal(records[0].connectionId, "target");
    assert.equal(records[0].sqlPreview, "update users set name = 'A' where id = 1;");
  });
});

test("runs table export jobs with the streaming table export API", async () => {
  const requests: unknown[] = [];
  const result = await runAutomationJob(
    baseJob({
      kind: "export",
      payload: {
        connectionId: "conn-1",
        database: "main",
        schema: "public",
        exportMode: "table",
        table: "users",
        outputPath: "/tmp/users.csv",
        format: "csv",
      },
    }),
    {
      now: () => "2026-06-28T10:00:00.000Z",
      connectionForId: () => connection,
      startTableExport: async (request) => {
        requests.push(request);
        return {
          exportId: request.exportId,
          tableName: request.tableName,
          rowsExported: 12,
          totalRows: 12,
          status: "Done",
        };
      },
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.message, "Table export completed: 12 rows");
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    exportId: "automation-export-job-1-20260628100000000",
    connectionId: "conn-1",
    database: "main",
    schema: "public",
    tableName: "users",
    filePath: "/tmp/users.csv",
    format: "csv",
  });
});

test("runs SQL table export jobs with the streaming table export API", async () => {
  const requests: unknown[] = [];
  const result = await runAutomationJob(
    baseJob({
      kind: "export",
      payload: {
        connectionId: "conn-1",
        database: "main",
        schema: "public",
        exportMode: "table",
        table: "users",
        outputPath: "/tmp/users.sql",
        format: "sql",
      },
    }),
    {
      now: () => "2026-06-28T10:00:00.000Z",
      connectionForId: () => connection,
      startTableExport: async (request) => {
        requests.push(request);
        return {
          exportId: request.exportId,
          tableName: request.tableName,
          rowsExported: 12,
          totalRows: 12,
          status: "Done",
        };
      },
    },
  );

  assert.equal(result.status, "success");
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    exportId: "automation-export-job-1-20260628100000000",
    connectionId: "conn-1",
    database: "main",
    schema: "public",
    tableName: "users",
    filePath: "/tmp/users.sql",
    format: "sql",
  });
});

test("runs CSV query export jobs with the streaming query export API", async () => {
  const requests: unknown[] = [];
  let executed = false;
  const result = await runAutomationJob(
    baseJob({
      kind: "export",
      payload: {
        connectionId: "conn-1",
        database: "main",
        schema: "public",
        exportMode: "query",
        sql: "select * from users",
        outputPath: "/tmp/users.csv",
        format: "csv",
      },
    }),
    {
      now: () => "2026-06-28T10:00:00.000Z",
      connectionForId: () => connection,
      editorSettings: () => ({
        exportBatchSize: 5000,
        exportRowLimitEnabled: true,
        exportRowLimit: 10000,
        queryExportKeysetOptimizationEnabled: false,
      }),
      startQueryResultExport: async (request) => {
        requests.push(request);
        return {
          exportId: request.exportId,
          tableName: "",
          rowsExported: 25,
          totalRows: null,
          status: "Done",
        };
      },
      executeMulti: async () => {
        executed = true;
        return { columns: [], rows: [], affected_rows: 0, execution_time_ms: 0 };
      },
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.message, "Query export completed: 25 rows");
  assert.equal(executed, false);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    exportId: "automation-query-export-job-1-20260628100000000",
    connectionId: "conn-1",
    database: "main",
    schema: "public",
    sql: "select * from users",
    queryBaseSql: "select * from users",
    databaseType: "postgres",
    useAgentCursor: false,
    filePath: "/tmp/users.csv",
    format: "csv",
    pageSize: 5000,
    rowLimit: 10000,
    totalRows: null,
    timeoutSecs: 30,
    keysetOptimizationEnabled: false,
    clientSessionId: "automation:job-1:export",
    executionId: "automation-query-export-job-1-20260628100000000-execution",
  });
});

test("runs JSON query export jobs with row-count run messages", async () => {
  const calls: unknown[][] = [];
  const result = await runAutomationJob(
    baseJob({
      kind: "export",
      payload: {
        connectionId: "conn-1",
        database: "main",
        exportMode: "query",
        sql: "select * from users",
        outputPath: "/tmp/users.json",
        format: "json",
      },
    }),
    {
      now: () => "2026-06-28T10:00:00.000Z",
      connectionForId: () => connection,
      executeMulti: async () => ({
        columns: ["id"],
        rows: [[1], [2]],
        affected_rows: 0,
        execution_time_ms: 5,
      }),
      exportQueryResultJson: async (...args) => {
        calls.push(args);
      },
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.message, "Export completed: 2 rows");
  assert.deepEqual(calls, [["/tmp/users.json", ["id"], [[1], [2]]]]);
});

test("can preview data sync without executing target SQL", async () => {
  let executed = false;
  const result = await runAutomationJob(
    baseJob({
      kind: "sync",
      payload: {
        syncMode: "data-compare",
        syncExecutionMode: "preview",
        sourceConnectionId: "source",
        sourceDatabase: "db1",
        sourceSchema: "public",
        sourceTable: "users",
        targetConnectionId: "target",
        targetDatabase: "db2",
        targetSchema: "public",
        targetTable: "users",
        columns: ["id", "name"],
        keyColumns: ["id"],
      },
    }),
    {
      now: () => "2026-06-28T10:00:00.000Z",
      connectionForId: (id) => ({ ...connection, id }),
      prepareDataCompareFromTables: async () => ({
        result: { added: [], removed: [], modified: [] },
        syncStatements: ["update users set name = 'A' where id = 1;"],
        syncSql: "update users set name = 'A' where id = 1;",
        preSyncStatements: [],
        sourceRowCount: 1,
        targetRowCount: 1,
        sourceTruncated: false,
        targetTruncated: false,
      }),
      buildDataCompareSyncPlan: async () => ({
        insertCount: 0,
        updateCount: 1,
        deleteCount: 0,
        statementCount: 1,
        syncStatements: ["update users set name = 'A' where id = 1;"],
        syncSql: "update users set name = 'A' where id = 1;",
      }),
      executeMulti: async () => {
        executed = true;
        return { columns: [], rows: [], affected_rows: 1, execution_time_ms: 5 };
      },
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.message, "Data sync preview generated 1 statements");
  assert.equal(result.syncPlan?.statementCount, 1);
  assert.equal(executed, false);
});

test("runs saved SQL directory sync with current library entries", async () => {
  const requests: unknown[] = [];
  const result = await runAutomationJob(
    baseJob({
      kind: "sync",
      payload: {
        syncMode: "saved-sql-directory",
        targetDir: "/tmp/sql-library",
      },
    }),
    {
      now: () => "2026-06-28T10:00:00.000Z",
      savedSqlEntries: async () => [{ folderName: "Reports", fileName: "daily.sql", sql: "select 1" }],
      syncSavedSqlDirectory: async (request) => {
        requests.push(request);
      },
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.message, "Saved SQL directory synced");
  assert.deepEqual(requests, [
    {
      targetDir: "/tmp/sql-library",
      entries: [{ folderName: "Reports", fileName: "daily.sql", sql: "select 1" }],
    },
  ]);
});

test("runs WebDAV upload jobs with current editor settings by default", async () => {
  const calls: unknown[][] = [];
  const webDavConfig = { endpoint: "https://example.test/webdav", username: "u", password: "p", remotePath: "DBX/sync" };
  const editorSettings = { theme: "dark", pageSize: 1000 };
  const result = await runAutomationJob(
    baseJob({
      kind: "sync",
      payload: {
        syncMode: "webdav-upload",
        webDavConfig,
        secretsPassphrase: "secret",
      },
    }),
    {
      now: () => "2026-06-28T10:00:00.000Z",
      editorSettings: () => editorSettings,
      webdavSyncUpload: async (...args) => {
        calls.push(args);
        return { remotePath: "DBX/sync/snapshot.json", bytes: 42, exportedAt: "2026-06-28T10:00:00.000Z" };
      },
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.message, "WebDAV upload completed");
  assert.deepEqual(calls, [[webDavConfig, editorSettings, "secret"]]);
});

test("applies WebDAV download results through the runtime hook", async () => {
  const applied: unknown[] = [];
  const webDavConfig = { endpoint: "https://example.test/webdav", username: "u", password: "p", remotePath: "DBX/sync" };
  const downloadResult = {
    summary: { remotePath: "DBX/sync/snapshot.json", bytes: 42, exportedAt: "2026-06-28T10:00:00.000Z" },
    editorSettings: { theme: "light" },
    desktopSettings: { debug_logging_enabled: true },
    applySummary: { encryptedSecretsPresent: false, secretsApplied: false },
  };
  const result = await runAutomationJob(
    baseJob({
      kind: "sync",
      payload: {
        syncMode: "webdav-download",
        webDavConfig,
        secretsPassphrase: "secret",
      },
    }),
    {
      now: () => "2026-06-28T10:00:00.000Z",
      webdavSyncDownload: async (config, passphrase) => {
        assert.deepEqual(config, webDavConfig);
        assert.equal(passphrase, "secret");
        return downloadResult;
      },
      applyWebDavDownload: async (download) => {
        applied.push(download);
      },
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.message, "WebDAV download completed");
  assert.deepEqual(applied, [downloadResult]);
});

test("blocks generated data sync SQL against production targets", async () => {
  let targetLookups = 0;
  const result = await runAutomationJob(
    baseJob({
      kind: "sync",
      payload: {
        syncMode: "data-compare",
        sourceConnectionId: "source",
        sourceDatabase: "db1",
        sourceSchema: "public",
        sourceTable: "users",
        targetConnectionId: "target",
        targetDatabase: "db2",
        targetSchema: "public",
        targetTable: "users",
        columns: ["id", "name"],
        keyColumns: ["id"],
      },
    }),
    {
      now: () => "2026-06-28T10:00:00.000Z",
      connectionForId: (id) => {
        if (id === "target") {
          targetLookups += 1;
          return { ...connection, id, name: targetLookups <= 2 ? "Local" : "prod" };
        }
        return { ...connection, id, name: "Local" };
      },
      prepareDataCompareFromTables: async () => ({
        result: { added: [], removed: [], modified: [] },
        syncStatements: ["update users set name = 'A' where id = 1;"],
        syncSql: "update users set name = 'A' where id = 1;",
        preSyncStatements: [],
        sourceRowCount: 1,
        targetRowCount: 1,
        sourceTruncated: false,
        targetTruncated: false,
      }),
      buildDataCompareSyncPlan: async () => ({
        insertCount: 0,
        updateCount: 1,
        deleteCount: 0,
        statementCount: 1,
        syncStatements: ["update users set name = 'A' where id = 1;"],
        syncSql: "update users set name = 'A' where id = 1;",
      }),
      executeMulti: async () => {
        throw new Error("should not execute");
      },
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.error, "production_write_automation");
  assert.equal(result.syncPlan?.statementCount, 1);
});

test("audits generated data sync SQL when policy blocks execution", async () => {
  await withLocalStorage(async () => {
    let targetLookups = 0;
    const result = await runAutomationJob(
      baseJob({
        kind: "sync",
        payload: {
          syncMode: "data-compare",
          sourceConnectionId: "source",
          sourceDatabase: "db1",
          sourceSchema: "public",
          sourceTable: "users",
          targetConnectionId: "target",
          targetDatabase: "db2",
          targetSchema: "public",
          targetTable: "users",
          columns: ["id", "name"],
          keyColumns: ["id"],
        },
      }),
      {
        now: () => "2026-06-28T10:00:00.000Z",
        connectionForId: (id) => {
          if (id === "target") {
            targetLookups += 1;
            return { ...connection, id, name: targetLookups <= 2 ? "Local" : "prod" };
          }
          return { ...connection, id, name: "Local" };
        },
        prepareDataCompareFromTables: async () => ({
          result: { added: [], removed: [], modified: [] },
          syncStatements: ["update users set name = 'A' where id = 1;"],
          syncSql: "update users set name = 'A' where id = 1;",
          preSyncStatements: [],
          sourceRowCount: 1,
          targetRowCount: 1,
          sourceTruncated: false,
          targetTruncated: false,
        }),
        buildDataCompareSyncPlan: async () => ({
          insertCount: 0,
          updateCount: 1,
          deleteCount: 0,
          statementCount: 1,
          syncStatements: ["update users set name = 'A' where id = 1;"],
          syncSql: "update users set name = 'A' where id = 1;",
        }),
      },
    );

    assert.equal(result.status, "error");
    assert.equal(result.error, "production_write_automation");
    const records = readGovernanceAuditRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0].status, "error");
    assert.equal(records[0].connectionId, "target");
    assert.equal(records[0].error, "production_write_automation");
    assert.equal(records[0].sqlPreview, "update users set name = 'A' where id = 1;");
  });
});

test("retries failed automation runs according to execution options", async () => {
  let attempts = 0;
  const result = await runAutomationJob(
    baseJob({
      execution: { retryCount: 2, retryDelaySeconds: 0, timeoutSeconds: 5, notifyOn: "always" },
    }),
    {
      now: () => "2026-06-28T10:00:00.000Z",
      connectionForId: () => connection,
      executeMulti: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary failure");
        return { columns: [], rows: [], affected_rows: 1, execution_time_ms: 5 };
      },
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.attempts, 2);
  assert.equal(attempts, 2);
});

test("records timeout failures for long running automation attempts", async () => {
  const result = await runAutomationJob(
    baseJob({
      execution: { timeoutSeconds: 0.001, retryCount: 0, notifyOn: "failure" },
    }),
    {
      now: () => "2026-06-28T10:00:00.000Z",
      connectionForId: () => connection,
      executeMulti: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { columns: [], rows: [], affected_rows: 1, execution_time_ms: 20 };
      },
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.error, "automation_timeout");
  assert.equal(result.attempts, 1);
});

test("records automation run duration in milliseconds", async () => {
  const times = ["2026-06-28T10:00:00.000Z", "2026-06-28T10:00:02.500Z"];
  const result = await runAutomationJob(baseJob(), {
    now: () => times.shift() || "2026-06-28T10:00:02.500Z",
    connectionForId: () => connection,
    executeMulti: async () => ({ columns: [], rows: [], affected_rows: 1, execution_time_ms: 5 }),
  });

  assert.equal(result.status, "success");
  assert.equal(result.durationMs, 2500);
});
