import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnomalyDetectionService } from "./anomalyDetectionService";
import { PlatformConfigService } from "./configService";
import { SessionService } from "./sessionService";
import { db } from "@/db";

vi.mock("./configService", () => ({
  PlatformConfigService: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("./sessionService", () => ({
  SessionService: {
    revokeOrgSessions: vi.fn().mockResolvedValue("2026-09-20T10:00:00.000Z"),
  },
}));

vi.mock("@/domains/audit/service", () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/db", () => {
  return {
    db: {
      select: vi.fn(),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
  };
});

describe("AnomalyDetectionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects mass lead export surge exceeding threshold", async () => {
    vi.mocked(PlatformConfigService.get).mockImplementation(async (key) => {
      if (key === "anomaly_thresholds") return { exportLimit24h: 3, webhookFailures24h: 20, leadSurgeLimit24h: 100 };
      if (key === "anomaly_resolutions") return {};
      return null;
    });

    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // orgRows
        return {
          from: vi.fn().mockResolvedValue([{ id: "org_1", name: "Apex Ltd", suspendedAt: null }]),
        } as any;
      }
      if (callCount === 2) {
        // exportLogs
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue([{ orgId: "org_1", c: 8 }]),
            }),
          }),
        } as any;
      }
      // other scans (webhooks, leads, suspended)
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any;
    });

    const anomalies = await AnomalyDetectionService.scanAnomalies();
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].category).toBe("data_exfiltration");
    expect(anomalies[0].organizationName).toBe("Apex Ltd");
    expect(anomalies[0].severity).toBe("critical");
    expect(anomalies[0].suggestedAction).toBe("terminate_sessions");
  });

  it("executes remediation by revoking tenant sessions", async () => {
    vi.mocked(PlatformConfigService.get).mockImplementation(async (key) => {
      if (key === "anomaly_thresholds") return { exportLimit24h: 2, webhookFailures24h: 20, leadSurgeLimit24h: 100 };
      if (key === "anomaly_resolutions") return {};
      return {};
    });

    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount++;
      if (callCount % 2 === 1) {
        return {
          from: vi.fn().mockResolvedValue([{ id: "org_9", name: "Initech", suspendedAt: null }]),
        } as any;
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([{ orgId: "org_9", c: 5 }]),
          }),
        }),
      } as any;
    });

    const res = await AnomalyDetectionService.executeRemediation("anom_export_org_9", "super_1");
    expect(res.success).toBe(true);
    expect(SessionService.revokeOrgSessions).toHaveBeenCalledWith("org_9", "super_1");
    expect(PlatformConfigService.set).toHaveBeenCalled();
  });

  it("reads cached anomalies when available, avoiding live scan", async () => {
    const cachedSample = [
      {
        id: "anom_cached_1",
        severity: "medium" as const,
        category: "ingestion_spike" as const,
        organizationId: "org_c",
        organizationName: "Cached Org",
        title: "Cached Anomaly",
        description: "Cached",
        detectedAt: "2026-09-20T10:00:00.000Z",
        metric: { name: "Leads", current: 10, threshold: 5 },
        suggestedAction: "suspend_org" as const,
        status: "active" as const,
      },
    ];

    vi.mocked(PlatformConfigService.get).mockImplementation(async (key) => {
      if (key === "cached_anomalies") return cachedSample;
      return null;
    });

    const res = await AnomalyDetectionService.getCachedAnomalies();
    expect(res).toEqual(cachedSample);
    expect(db.select).not.toHaveBeenCalled();
  });
});
