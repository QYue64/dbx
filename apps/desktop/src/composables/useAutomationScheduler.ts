import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSavedSqlStore } from "@/stores/savedSqlStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToast } from "@/composables/useToast";
import { appendAutomationRunRecord, dueAutomationJobs, readAutomationJobs, runAutomationJob, shouldNotifyAutomationRun, upsertAutomationJob, type AutomationJob, type AutomationRunRecord } from "@/lib/workspaceAutomation";

const SCAN_INTERVAL_MS = 30_000;
const globalRunningJobIds = ref(new Set<string>());

export function useAutomationScheduler(options: { autoStart?: boolean } = {}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const connectionStore = useConnectionStore();
  const savedSqlStore = useSavedSqlStore();
  const settingsStore = useSettingsStore();
  const runningJobIds = globalRunningJobIds;
  let timer: ReturnType<typeof setInterval> | undefined;

  async function executeJob(job: AutomationJob, notify = true): Promise<AutomationRunRecord> {
    if (runningJobIds.value.has(job.id)) {
      const startedAt = new Date().toISOString();
      const record: AutomationRunRecord = {
        id: `automation-run-skipped-${Date.now()}`,
        jobId: job.id,
        status: "error",
        startedAt,
        finishedAt: startedAt,
        error: "job_already_running",
      };
      appendAutomationRunRecord(record);
      if (notify && shouldNotifyAutomationRun(job, record)) {
        toast(t("automationCenter.toast.runFailed", { name: job.name, message: record.error }), 4000);
      }
      return record;
    }

    runningJobIds.value = new Set([...runningJobIds.value, job.id]);
    try {
      const record = await runAutomationJob(job, {
        connectionForId: (id) => (id ? connectionStore.getConfig(id) : undefined),
        editorSettings: () => settingsStore.editorSettings,
        applyWebDavDownload: async (result) => {
          if (result.editorSettings && typeof result.editorSettings === "object") {
            settingsStore.updateEditorSettings(result.editorSettings);
          }
          await settingsStore.updateDesktopSettings(result.desktopSettings);
          await connectionStore.initFromDisk();
          await savedSqlStore.initFromStorage();
        },
        savedSqlEntries: async () => {
          await savedSqlStore.initFromStorage();
          return savedSqlStore.syncEntries();
        },
      });
      appendAutomationRunRecord(record);
      const validationFailed = record.status === "error" && record.attempts === 0;
      upsertAutomationJob(
        {
          ...job,
          enabled: validationFailed ? false : job.enabled,
          lastRunAt: record.finishedAt || record.startedAt,
          nextRunAt: validationFailed ? undefined : job.nextRunAt,
        },
        { now: record.finishedAt || new Date().toISOString() },
      );
      if (notify && shouldNotifyAutomationRun(job, record)) {
        if (record.status === "success") {
          toast(t("automationCenter.toast.runSuccessNamed", { name: job.name }), 2200);
          return record;
        }
        toast(t("automationCenter.toast.runFailed", { name: job.name, message: record.error || "" }), 4000);
      }
      return record;
    } finally {
      const nextRunning = new Set(runningJobIds.value);
      nextRunning.delete(job.id);
      runningJobIds.value = nextRunning;
    }
  }

  function scanDueJobs() {
    const jobs = readAutomationJobs();
    const due = dueAutomationJobs(jobs, new Date().toISOString(), runningJobIds.value);
    for (const job of due) {
      void executeJob(job);
    }
  }

  function start() {
    if (timer) return;
    scanDueJobs();
    timer = setInterval(scanDueJobs, SCAN_INTERVAL_MS);
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = undefined;
  }

  onMounted(() => {
    if (options.autoStart !== false) start();
  });
  onBeforeUnmount(stop);

  return {
    runningJobIds,
    executeJob,
    scanDueJobs,
    start,
    stop,
  };
}
