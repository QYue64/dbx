import assert from "node:assert/strict";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, test, vi } from "vitest";
import { useAutomationScheduler } from "../../apps/desktop/src/composables/useAutomationScheduler.ts";
import { readAutomationJobs, readAutomationRunRecords, saveAutomationJobs, type AutomationJob } from "../../apps/desktop/src/lib/workspaceAutomation.ts";

const { executeMultiMock, toastMock, initSavedSqlMock, syncEntriesMock, reloadSavedSqlMock, updateEditorSettingsMock, updateDesktopSettingsMock } = vi.hoisted(() => ({
  executeMultiMock: vi.fn(),
  toastMock: vi.fn(),
  initSavedSqlMock: vi.fn(),
  syncEntriesMock: vi.fn(),
  reloadSavedSqlMock: vi.fn(),
  updateEditorSettingsMock: vi.fn(),
  updateDesktopSettingsMock: vi.fn(),
}));

vi.mock("vue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue")>();
  return {
    ...actual,
    onMounted: (hook: () => void) => hook(),
    onBeforeUnmount: vi.fn(),
  };
});

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock("@/stores/connectionStore", () => ({
  useConnectionStore: () => ({
    getConfig: (id?: string) =>
      id === "conn-1"
        ? {
            id: "conn-1",
            name: "Local",
            db_type: "postgres",
            host: "localhost",
            port: 5432,
            username: "user",
            password: "",
            database: "main",
            ssl: false,
          }
        : undefined,
  }),
}));

vi.mock("@/stores/savedSqlStore", () => ({
  useSavedSqlStore: () => ({
    initFromStorage: initSavedSqlMock,
    syncEntries: syncEntriesMock,
    reloadFromStorage: reloadSavedSqlMock,
  }),
}));

vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: () => ({
    editorSettings: { theme: "app" },
    updateEditorSettings: updateEditorSettingsMock,
    updateDesktopSettings: updateDesktopSettingsMock,
  }),
}));

vi.mock("@/lib/backend/api", () => ({
  executeMulti: executeMultiMock,
}));

function installLocalStorage() {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
      clear: () => data.clear(),
    },
  });
  return () => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  };
}

function baseJob(patch: Partial<AutomationJob> = {}): AutomationJob {
  return {
    id: "job-1",
    name: "Scheduled SQL",
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
    nextRunAt: "2026-06-28T10:00:00.000Z",
    ...patch,
  };
}

let restoreLocalStorage: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-28T10:00:00.000Z"));
  setActivePinia(createPinia());
  restoreLocalStorage = installLocalStorage();
  executeMultiMock.mockResolvedValue({ columns: [], rows: [], affected_rows: 1, execution_time_ms: 5 });
  initSavedSqlMock.mockResolvedValue(undefined);
  syncEntriesMock.mockResolvedValue([]);
  reloadSavedSqlMock.mockResolvedValue(undefined);
  updateDesktopSettingsMock.mockResolvedValue(undefined);
});

afterEach(() => {
  useAutomationScheduler({ autoStart: false }).runningJobIds.value = new Set();
  restoreLocalStorage?.();
  restoreLocalStorage = undefined;
  vi.useRealTimers();
  vi.clearAllMocks();
});

test("executes a due job, records the run, and schedules the next run", async () => {
  saveAutomationJobs([baseJob()]);
  const scheduler = useAutomationScheduler({ autoStart: false });

  const record = await scheduler.executeJob(readAutomationJobs()[0], false);

  assert.equal(record.status, "success");
  assert.equal(executeMultiMock.mock.calls.length, 1);
  assert.equal(readAutomationRunRecords().length, 1);
  const [updatedJob] = readAutomationJobs();
  assert.equal(updatedJob.lastRunAt, record.finishedAt);
  assert.equal(updatedJob.nextRunAt, "2026-06-28T10:15:00.000Z");
});

test("does not scan on mount when autoStart is disabled", async () => {
  saveAutomationJobs([baseJob()]);

  useAutomationScheduler({ autoStart: false });
  await vi.runAllTimersAsync();

  assert.equal(executeMultiMock.mock.calls.length, 0);
  assert.equal(readAutomationRunRecords().length, 0);
});

test("scanDueJobs skips jobs that are already running", async () => {
  saveAutomationJobs([baseJob()]);
  const scheduler = useAutomationScheduler({ autoStart: false });
  scheduler.runningJobIds.value = new Set(["job-1"]);

  scheduler.scanDueJobs();
  await vi.runAllTimersAsync();

  assert.equal(executeMultiMock.mock.calls.length, 0);
  assert.equal(readAutomationRunRecords().length, 0);
});

test("manual duplicate runs are recorded as failures", async () => {
  saveAutomationJobs([baseJob()]);
  const scheduler = useAutomationScheduler({ autoStart: false });
  scheduler.runningJobIds.value = new Set(["job-1"]);

  const record = await scheduler.executeJob(readAutomationJobs()[0], true);

  assert.equal(record.status, "error");
  assert.equal(record.error, "job_already_running");
  assert.equal(readAutomationRunRecords()[0]?.error, "job_already_running");
  assert.equal(toastMock.mock.calls.length, 1);
  assert.equal(executeMultiMock.mock.calls.length, 0);
});

test("shares running job locks across scheduler instances", async () => {
  saveAutomationJobs([baseJob()]);
  const schedulerA = useAutomationScheduler({ autoStart: false });
  const schedulerB = useAutomationScheduler({ autoStart: false });
  schedulerA.runningJobIds.value = new Set(["job-1"]);

  const record = await schedulerB.executeJob(readAutomationJobs()[0], false);

  assert.equal(record.status, "error");
  assert.equal(record.error, "job_already_running");
  assert.equal(executeMultiMock.mock.calls.length, 0);
});

test("scanDueJobs runs due jobs and leaves future jobs alone", async () => {
  saveAutomationJobs([baseJob(), baseJob({ id: "future", nextRunAt: "2026-06-28T10:30:00.000Z" })]);
  const scheduler = useAutomationScheduler({ autoStart: false });

  scheduler.scanDueJobs();
  await vi.runAllTimersAsync();

  assert.equal(executeMultiMock.mock.calls.length, 1);
  assert.equal(readAutomationRunRecords()[0]?.jobId, "job-1");
});

test("validation failures disable scheduled jobs after recording the failure", async () => {
  saveAutomationJobs([baseJob({ payload: { connectionId: "conn-1", database: "main", sql: "" } })]);
  const scheduler = useAutomationScheduler({ autoStart: false });

  const record = await scheduler.executeJob(readAutomationJobs()[0], false);

  assert.equal(record.status, "error");
  assert.equal(record.attempts, 0);
  assert.equal(readAutomationRunRecords()[0]?.error, "sql_required");
  const [updatedJob] = readAutomationJobs();
  assert.equal(updatedJob.enabled, false);
  assert.equal(updatedJob.nextRunAt, undefined);
});
