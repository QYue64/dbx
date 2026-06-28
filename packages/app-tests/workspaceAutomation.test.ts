import assert from "node:assert/strict";
import { test } from "vitest";
import {
  appendAutomationRunRecord,
  buildAutomationRunPlan,
  computeNextAutomationRunAt,
  deleteAutomationJob,
  dueAutomationJobs,
  readAutomationJobs,
  readAutomationRunRecords,
  runAutomationJob,
  saveAutomationJobs,
  upsertAutomationJob,
  type AutomationJob,
} from "../../apps/desktop/src/lib/workspaceAutomation.ts";
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
  const now = new Date("2026-06-28T10:05:00.000Z");

  assert.equal(computeNextAutomationRunAt({ type: "manual" }, now), undefined);
  assert.equal(computeNextAutomationRunAt({ type: "intervalMinutes", intervalMinutes: 15 }, now), "2026-06-28T10:20:00.000Z");
  assert.equal(computeNextAutomationRunAt({ type: "dailyTime", dailyTime: "10:30" }, now), "2026-06-28T10:30:00.000Z");
  assert.equal(computeNextAutomationRunAt({ type: "dailyTime", dailyTime: "09:30" }, now), "2026-06-29T09:30:00.000Z");
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

  const productionWrite = buildAutomationRunPlan(
    baseJob({ payload: { connectionId: "conn-1", database: "main", sql: "update users set active = false" } }),
    { ...connection, name: "prod" },
  );
  assert.equal(productionWrite.valid, false);
  assert.equal(productionWrite.safety, "critical");
  assert.ok(productionWrite.reasons.includes("production_write_automation"));
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
  assert.deepEqual(calls, ["target:db2:update users set name = 'A' where id = 1;"]);
});
