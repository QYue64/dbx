import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useConnectionStore } from "@/stores/connectionStore";
import { useToast } from "@/composables/useToast";
import { appendAutomationRunRecord, dueAutomationJobs, readAutomationJobs, runAutomationJob, upsertAutomationJob, type AutomationJob, type AutomationRunRecord } from "@/lib/workspaceAutomation";

const SCAN_INTERVAL_MS = 30_000;

export function useAutomationScheduler(options: { autoStart?: boolean } = {}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const connectionStore = useConnectionStore();
  const runningJobIds = ref(new Set<string>());
  let timer: ReturnType<typeof setInterval> | undefined;

  async function executeJob(job: AutomationJob, notify = true): Promise<AutomationRunRecord> {
    if (runningJobIds.value.has(job.id)) {
      return {
        id: `automation-run-skipped-${Date.now()}`,
        jobId: job.id,
        status: "error",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        error: "job_already_running",
      };
    }

    runningJobIds.value = new Set([...runningJobIds.value, job.id]);
    try {
      const record = await runAutomationJob(job, {
        connectionForId: (id) => (id ? connectionStore.getConfig(id) : undefined),
      });
      appendAutomationRunRecord(record);
      upsertAutomationJob(
        {
          ...job,
          lastRunAt: record.finishedAt || record.startedAt,
        },
        { now: record.finishedAt || new Date().toISOString() },
      );
      if (notify && record.status === "error") {
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
