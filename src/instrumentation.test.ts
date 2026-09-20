import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/events/handlers", () => ({}));
vi.mock("@/lib/jobs/workers/reminderWorker", () => ({ reminderWorker: {} }));
vi.mock("@/lib/jobs/workers/automationWorker", () => ({ automationWorker: {} }));
vi.mock("@/lib/jobs/workers/ingestionWorker", () => ({ ingestionWorker: {} }));
vi.mock("@/lib/jobs/workers/escalationWorker", () => ({
  createEscalationWorker: vi.fn(),
  scheduleEscalationScan: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/jobs/workers/scoreDecayWorker", () => ({
  createScoreDecayWorker: vi.fn(),
  scheduleScoreDecayScan: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/jobs/workers/followUpReminderWorker", () => ({
  createFollowUpReminderWorker: vi.fn(),
  scheduleFollowUpReminderScan: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/jobs/workers/sequenceWorker", () => ({
  createSequenceWorker: vi.fn(),
  scheduleSequenceScan: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/jobs/workers/recycleBinWorker", () => ({
  createRecycleBinWorker: vi.fn(),
  scheduleRecycleBinScan: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/jobs/workers/anomalyWorker", () => ({
  createAnomalyWorker: vi.fn(),
  scheduleAnomalyScan: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/jobs/workers/webhookRetryWorker", () => ({
  createWebhookRetryWorker: vi.fn(),
}));
vi.mock("@/lib/jobs/workers/enrichmentWorker", () => ({
  createEnrichmentWorker: vi.fn(),
}));

describe("Instrumentation worker registration", () => {
  beforeEach(() => {
    process.env.NEXT_RUNTIME = "nodejs";
    // register() now validates required env at boot — provide them so the test exercises
    // worker registration, not env validation (which has its own coverage).
    process.env.DATABASE_URL ||= "postgres://test";
    process.env.NEXTAUTH_SECRET ||= "test-secret";
    process.env.REDIS_URL = "redis://localhost:6379"; // workers require a configured Redis
    vi.clearAllMocks();
  });

  it("should register background workers and repeatable job schedulers in nodejs runtime", async () => {
    const { register } = await import("./instrumentation");
    const { createEscalationWorker, scheduleEscalationScan } = await import("@/lib/jobs/workers/escalationWorker");
    const { createScoreDecayWorker, scheduleScoreDecayScan } = await import("@/lib/jobs/workers/scoreDecayWorker");

    await register();

    expect(createEscalationWorker).toHaveBeenCalledTimes(1);
    expect(scheduleEscalationScan).toHaveBeenCalledTimes(1);
    expect(createScoreDecayWorker).toHaveBeenCalledTimes(1);
    expect(scheduleScoreDecayScan).toHaveBeenCalledTimes(1);
  });

  it("should skip workers when REDIS_URL is not configured (e.g. serverless)", async () => {
    delete process.env.REDIS_URL;
    const { register } = await import("./instrumentation");
    const { createEscalationWorker } = await import("@/lib/jobs/workers/escalationWorker");

    await register();

    expect(createEscalationWorker).not.toHaveBeenCalled();
  });

  it("should skip worker registration if not nodejs runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { register } = await import("./instrumentation");
    const { createEscalationWorker } = await import("@/lib/jobs/workers/escalationWorker");

    await register();

    expect(createEscalationWorker).not.toHaveBeenCalled();
  });
});
