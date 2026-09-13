import { Queue, Worker, Job } from "bullmq";
import { createRedis, quietErrors } from "../redis";
import { LeadSourceService } from "@/domains/leads/sourceService";

const connection = createRedis({ maxRetriesPerRequest: null });

export const FACEBOOK_SYNC_QUEUE_NAME = "facebook-sync";
export const facebookSyncQueue = new Queue(FACEBOOK_SYNC_QUEUE_NAME, {
  connection,
  // Historical sync can be long; one attempt (no auto-retry) — the user can re-trigger. Rate limits
  // are already handled inside the Graph client with backoff.
  defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
});

export interface FacebookSyncJobData {
  sourceId: string;
  organizationId: string;
  since?: number;
  until?: number;
}

// Merge a patch into the source's config without clobbering other keys.
async function patchSyncState(sourceId: string, patch: Record<string, unknown>) {
  const source = await LeadSourceService.getSource(sourceId);
  if (!source) return;
  const config = { ...((source.config as Record<string, unknown>) ?? {}), ...patch };
  await LeadSourceService.updateSource(sourceId, { config });
}

export function createFacebookSyncWorker() {
  const worker = new Worker<FacebookSyncJobData>(
    FACEBOOK_SYNC_QUEUE_NAME,
    async (job: Job<FacebookSyncJobData>) => {
      const { sourceId, organizationId, since, until } = job.data;
      const { FacebookSyncService } = await import("@/domains/leads/facebookSyncService");
      const { MetaTokenRefreshService } = await import("@/domains/leads/metaTokenRefreshService");
      try {
        const result = await FacebookSyncService.run(sourceId, organizationId, { since, until });
        await patchSyncState(sourceId, {
          syncStatus: "idle",
          lastSync: { ...result, ok: true, finishedAt: new Date().toISOString() },
        });
        return result;
      } catch (e: any) {
        // A dead token here means the Page needs reconnecting; flag it so the UI can prompt.
        if (MetaTokenRefreshService.isAuthError(e)) {
          await LeadSourceService.markNeedsReconnect(sourceId);
        }
        await patchSyncState(sourceId, {
          syncStatus: "idle",
          lastSync: { ok: false, error: e?.message ?? "Sync failed", finishedAt: new Date().toISOString() },
        });
        throw e;
      }
    },
    { connection, concurrency: 2 },
  );
  quietErrors(worker);
  return worker;
}
