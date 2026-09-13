"use server";

import { z } from "zod";
import { requireOrg } from "@/lib/rbac";
import { ingestionQueue } from "@/lib/jobs/workers/ingestionWorker";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { parse } from "csv-parse/sync";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { ok, fail, actionFail } from "@/lib/actions/result";

// Roughly the 1MB Server Action body limit — reject early with a clear message.
const MAX_CSV_BYTES = 1_000_000;

const uploadCsvSchema = z.object({
  sourceId: z.string(),
  csvContent: z.string(),
  teamId: z.string().optional(),
  ownerId: z.string().optional(),
});

export async function uploadCsvAction(input: z.infer<typeof uploadCsvSchema>) {
  const { organizationId } = await requireOrg();

  const parsed = uploadCsvSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please select a source and a CSV file, then try again.");
  }

  const { sourceId, csvContent, teamId, ownerId } = parsed.data;

  if (!csvContent.trim()) {
    return fail("VALIDATION", "This file is empty. Please choose a CSV with a header row and at least one lead.");
  }
  if (csvContent.length > MAX_CSV_BYTES) {
    return fail("VALIDATION", "This file is too large (over ~1 MB). Split it into smaller batches and try again.");
  }

  // Validate Source ownership
  const source = await LeadSourceService.getSource(sourceId);
  if (!source || source.organizationId !== organizationId) {
    return fail("NOT_FOUND", "That lead source is invalid or no longer available. Pick another and try again.");
  }

  // 1. Parse CSV
  let records: Record<string, any>[];
  try {
    records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    return fail("VALIDATION", "We couldn't read this CSV. Make sure it's valid, comma-separated, and UTF-8 encoded.");
  }

  if (!records || records.length === 0) {
    return fail("VALIDATION", "No rows found. The file needs a header row and at least one lead.");
  }

  if (records.length > 5000) {
    return fail("VALIDATION", "Too many rows — a maximum of 5,000 leads can be imported at once.");
  }

  // Verify headers contain at least a name column or identifiable contact fields
  const firstRow = records[0];
  const keys = Object.keys(firstRow).map((k) => k.toLowerCase().trim());
  const hasName = keys.some((k) => k.includes("name") || k.includes("contact") || k.includes("lead"));
  if (!hasName) {
    return fail("VALIDATION", "The CSV must include a 'name' (or 'lead name') column header.");
  }

  try {
    // 2. Queue each row as a webhook event payload in batch chunks
    const batchJobs: { id: string }[] = [];
    const CHUNK_SIZE = 250;

    await db.transaction(async (tx) => {
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const inserted = await tx.insert(webhookEvents).values(
          chunk.map((record) => ({
            provider: "generic_webhook",
            payload: {
              ...record,
              sourceId,
              organizationId,
              teamId,
              ownerId,
            },
          }))
        ).returning({ id: webhookEvents.id });

        batchJobs.push(...inserted);
      }
    });

    // 3. Offload to BullMQ using addBulk
    const queueJobs = batchJobs.map((job) => ({
      name: `ingest-${job.id}`,
      data: { webhookEventId: job.id },
    }));

    if (queueJobs.length > 0) {
      // Fail fast instead of hanging the request if Redis is unreachable (the queue connection
      // buffers commands indefinitely otherwise). The event rows are already persisted, so an admin
      // can retry the import once background processing is back.
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Background import is temporarily unavailable — please try again shortly.")), 8000),
      );
      await Promise.race([ingestionQueue.addBulk(queueJobs), timeout]);
    }

    return ok({ count: batchJobs.length });
  } catch (e) {
    return actionFail(e);
  }
}
