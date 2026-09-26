import { db } from "@/db";
import { organizations, auditLogs, webhookDeliveries, leads } from "@/db/schema";
import { count, eq, and, gt, sql, inArray } from "drizzle-orm";
import { PlatformConfigService } from "./configService";
import { SessionService } from "./sessionService";
import { AuditService } from "@/domains/audit/service";

export interface SecurityAnomaly {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  category: "data_exfiltration" | "webhook_flood" | "ingestion_spike" | "dormant_key" | "suspended_access";
  organizationId: string;
  organizationName: string;
  title: string;
  description: string;
  detectedAt: string;
  metric: {
    name: string;
    current: number;
    threshold: number;
  };
  suggestedAction: "terminate_sessions" | "revoke_api_key" | "suspend_org" | "inspect_dlq";
  status: "active" | "resolved" | "dismissed";
}

export interface AnomalyThresholds {
  exportLimit24h: number;
  webhookFailures24h: number;
  leadSurgeLimit24h: number;
}

const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  exportLimit24h: 5,
  webhookFailures24h: 20,
  leadSurgeLimit24h: 200,
};

const THRESHOLDS_CONFIG_KEY = "anomaly_thresholds";
const RESOLUTIONS_CONFIG_KEY = "anomaly_resolutions";
const CACHED_ANOMALIES_KEY = "cached_anomalies";

export class AnomalyDetectionService {
  static async getThresholds(): Promise<AnomalyThresholds> {
    return PlatformConfigService.get<AnomalyThresholds>(THRESHOLDS_CONFIG_KEY, DEFAULT_THRESHOLDS);
  }

  static async saveThresholds(thresholds: Partial<AnomalyThresholds>): Promise<AnomalyThresholds> {
    const current = await this.getThresholds();
    const updated = { ...current, ...thresholds };
    await PlatformConfigService.set(THRESHOLDS_CONFIG_KEY, updated);
    return updated;
  }

  static async scanAndCacheAnomalies(): Promise<SecurityAnomaly[]> {
    const anomalies = await this.scanAnomalies();
    await PlatformConfigService.set(CACHED_ANOMALIES_KEY, anomalies);
    return anomalies;
  }

  static async getCachedAnomalies(): Promise<SecurityAnomaly[]> {
    const cached = await PlatformConfigService.get<SecurityAnomaly[] | null>(
      CACHED_ANOMALIES_KEY,
      null
    );
    if (Array.isArray(cached)) return cached;
    // ponytail: live N+1 scan fallback when cache cold, worker cron refreshes periodically
    return this.scanAndCacheAnomalies();
  }

  static async scanAnomalies(): Promise<SecurityAnomaly[]> {
    const thresholds = await this.getThresholds();
    const resolutions = await PlatformConfigService.get<Record<string, "resolved" | "dismissed">>(
      RESOLUTIONS_CONFIG_KEY,
      {}
    );

    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const anomalies: SecurityAnomaly[] = [];

    // Query org map for quick name lookups
    const orgRows = await db.select({ id: organizations.id, name: organizations.name, suspendedAt: organizations.suspendedAt }).from(organizations);
    const orgMap = new Map<string, { name: string; suspended: boolean }>();
    for (const o of orgRows) {
      orgMap.set(o.id, { name: o.name, suspended: !!o.suspendedAt });
    }

    // 1. Data Exfiltration / Mass Lead Export Detection
    try {
      const exportLogs = await db
        .select({
          orgId: auditLogs.organizationId,
          c: count(),
        })
        .from(auditLogs)
        .where(
          and(
            gt(auditLogs.createdAt, oneDayAgo),
            sql`${auditLogs.action} ILIKE '%export%'`
          )
        )
        .groupBy(auditLogs.organizationId);

      for (const row of exportLogs) {
        const countVal = Number(row.c);
        if (countVal >= thresholds.exportLimit24h) {
          const org = orgMap.get(row.orgId);
          const id = `anom_export_${row.orgId}`;
          anomalies.push({
            id,
            severity: countVal > thresholds.exportLimit24h * 2 ? "critical" : "high",
            category: "data_exfiltration",
            organizationId: row.orgId,
            organizationName: org?.name ?? "Unknown Organization",
            title: "Rapid Lead Export Surge",
            description: `Detected ${countVal} export operations within 24 hours (threshold: ${thresholds.exportLimit24h}). High risk of lead scraping or rogue actor.`,
            detectedAt: new Date().toISOString(),
            metric: { name: "Exports (24h)", current: countVal, threshold: thresholds.exportLimit24h },
            suggestedAction: "terminate_sessions",
            status: resolutions[id] ?? "active",
          });
        }
      }
    } catch (e) {
      console.warn("[AnomalyDetection] Failed export scan", e);
    }

    // 2. Webhook Flooding & Failure Spikes
    try {
      const failedWebhooks = await db
        .select({
          orgId: webhookDeliveries.organizationId,
          c: count(),
        })
        .from(webhookDeliveries)
        .where(
          and(
            eq(webhookDeliveries.status, "failed"),
            gt(webhookDeliveries.createdAt, oneDayAgo)
          )
        )
        .groupBy(webhookDeliveries.organizationId);

      for (const row of failedWebhooks) {
        const countVal = Number(row.c);
        if (countVal >= thresholds.webhookFailures24h) {
          const org = orgMap.get(row.orgId);
          const id = `anom_wh_${row.orgId}`;
          anomalies.push({
            id,
            severity: "high",
            category: "webhook_flood",
            organizationId: row.orgId,
            organizationName: org?.name ?? "Unknown Organization",
            title: "Webhook Failure Storm",
            description: `${countVal} webhook delivery failures recorded in 24 hours. Likely endpoint outage, bad signature, or unhandled 5xx errors.`,
            detectedAt: new Date().toISOString(),
            metric: { name: "Failed Deliveries", current: countVal, threshold: thresholds.webhookFailures24h },
            suggestedAction: "inspect_dlq",
            status: resolutions[id] ?? "active",
          });
        }
      }
    } catch (e) {
      console.warn("[AnomalyDetection] Failed webhook scan", e);
    }

    // 3. Lead Ingestion Spikes (Potential Bot Spam or Form Flooding)
    try {
      const leadSpikes = await db
        .select({
          orgId: leads.organizationId,
          c: count(),
        })
        .from(leads)
        .where(gt(leads.createdAt, oneDayAgo))
        .groupBy(leads.organizationId);

      for (const row of leadSpikes) {
        const countVal = Number(row.c);
        if (countVal >= thresholds.leadSurgeLimit24h) {
          const org = orgMap.get(row.orgId);
          const id = `anom_surge_${row.orgId}`;
          anomalies.push({
            id,
            severity: "medium",
            category: "ingestion_spike",
            organizationId: row.orgId,
            organizationName: org?.name ?? "Unknown Organization",
            title: "Anomalous Lead Ingestion Spike",
            description: `${countVal} leads ingested in 24 hours (threshold: ${thresholds.leadSurgeLimit24h}). Check for form abuse or automated spam bots.`,
            detectedAt: new Date().toISOString(),
            metric: { name: "Leads Ingested (24h)", current: countVal, threshold: thresholds.leadSurgeLimit24h },
            suggestedAction: "suspend_org",
            status: resolutions[id] ?? "active",
          });
        }
      }
    } catch (e) {
      console.warn("[AnomalyDetection] Failed lead surge scan", e);
    }

    // 4. Suspended Tenant Activity Check
    try {
      const suspendedOrgs = orgRows.filter((o) => !!o.suspendedAt);
      if (suspendedOrgs.length > 0) {
        const suspendedIds = suspendedOrgs.map((o) => o.id);
        const suspiciousActivity = await db
          .select({
            orgId: auditLogs.organizationId,
            c: count(),
          })
          .from(auditLogs)
          .where(
            and(
              inArray(auditLogs.organizationId, suspendedIds),
              gt(auditLogs.createdAt, oneDayAgo)
            )
          )
          .groupBy(auditLogs.organizationId);

        for (const row of suspiciousActivity) {
          const countVal = Number(row.c);
          if (countVal > 0) {
            const org = orgMap.get(row.orgId);
            const id = `anom_suspended_${row.orgId}`;
            anomalies.push({
              id,
              severity: "critical",
              category: "suspended_access",
              organizationId: row.orgId,
              organizationName: org?.name ?? "Suspended Tenant",
              title: "Suspended Tenant Activity Detected",
              description: `Recorded ${countVal} actions from suspended tenant within the last 24h. Active sessions or API keys must be immediately terminated.`,
              detectedAt: new Date().toISOString(),
              metric: { name: "Actions Post-Suspension", current: countVal, threshold: 0 },
              suggestedAction: "terminate_sessions",
              status: resolutions[id] ?? "active",
            });
          }
        }
      }
    } catch (e) {
      console.warn("[AnomalyDetection] Failed suspended check", e);
    }

    return anomalies;
  }

  static async resolveAnomaly(id: string, action: "resolve" | "dismiss", superAdminId?: string): Promise<void> {
    const status = action === "resolve" ? ("resolved" as const) : ("dismissed" as const);
    await PlatformConfigService.update<Record<string, "resolved" | "dismissed">>(RESOLUTIONS_CONFIG_KEY, {}, (r) => ({ ...r, [id]: status }));
    await PlatformConfigService.update<SecurityAnomaly[]>(CACHED_ANOMALIES_KEY, [], (cached) =>
      (Array.isArray(cached) ? cached : []).map((a) => (a.id === id ? { ...a, status } : a)),
    );

    await AuditService.log({
      organizationId: "00000000-0000-0000-0000-000000000000",
      userId: superAdminId,
      action: `platform.anomaly_${action}d`,
      entityType: "security_anomaly",
      metadata: { anomalyId: id, action },
    });
  }

  // Applies the anomaly's suggested action. Suspension goes through the same audited path as a manual
  // suspend (logged against the tenant, with the operator), not a bare UPDATE.
  static async executeRemediation(anomalyId: string, superAdminId?: string): Promise<{ success: boolean; message: string }> {
    const anomalies = await this.getCachedAnomalies();
    const target = anomalies.find((a) => a.id === anomalyId);
    if (!target) {
      throw new Error(`Anomaly "${anomalyId}" not found or already mitigated.`);
    }

    let message = "";
    if (target.suggestedAction === "terminate_sessions") {
      await SessionService.revokeOrgSessions(target.organizationId, superAdminId);
      message = `Terminated all active sessions for organization ${target.organizationName}.`;
    } else if (target.suggestedAction === "suspend_org") {
      await db.update(organizations).set({ suspendedAt: new Date() }).where(eq(organizations.id, target.organizationId));
      await AuditService.log({
        organizationId: target.organizationId,
        userId: superAdminId,
        action: "platform.suspend",
        entityType: "organization",
        entityId: target.organizationId,
        metadata: { by: "super_admin", reason: `anomaly remediation: ${target.title ?? target.id}`, anomalyId },
      });
      message = `Suspended organization ${target.organizationName}.`;
    } else if (target.suggestedAction === "inspect_dlq") {
      message = `DLQ inspection flagged for organization ${target.organizationName}.`;
    } else {
      message = `Mitigation completed for ${target.organizationName}.`;
    }

    await this.resolveAnomaly(anomalyId, "resolve", superAdminId);
    return { success: true, message };
  }
}
