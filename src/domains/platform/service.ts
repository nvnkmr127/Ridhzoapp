import { db } from "@/db";
import { forgetRole } from "@/lib/rbac/roleCache";
import {
  organizations,
  users,
  leads,
  webhookDeliveries,
  roles,
  activities,
  auditLogs,
  apiKeys,
  followUps,
  reminders,
  leadAttachments,
  whatsappMessages,
  leadTags,
  leadStatusHistory,
  leadSources,
  assignmentRules,
  leadDistributionRules,
  leadDistributionDeliveries,
  automations,
  sequences,
  savedViews,
  customFieldDefs,
  invitations,
  emailSettings,
  googleCredentials,
  teams,
  webhookEndpoints,
  tenantIntegrationSettings,
  webhookEvents,
  notifications,
  pushSubscriptions,
  sharedLinks,
  tags,
  messageTemplates,
  leadPipelines,
  leadPipelineStages,
  leadCounters,
  customStatusConfigs,
} from "@/db/schema";
import { count, desc, eq, isNull, isNotNull, and, or, ilike, like, sql, gte, inArray } from "drizzle-orm";
import { redisConfigured } from "@/lib/jobs/redis";
import { PlatformConfigService, type BroadcastConfig } from "./configService";
import { LeadService } from "@/domains/leads/service";
import { WebhookDlqService } from "@/domains/leads/webhookDlqService";

// Cross-tenant operations for the platform super-admin. NOT org-scoped by design — every caller
// must be gated by requireSuperAdmin() first.
export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  planStatus: string;
  suspended: boolean;
  userCount: number;
  leadCount: number;
  customSeats?: number | null;
  attribution?: import("./attributionService").TenantAttribution | null;
  trialEndsAt?: string | null;
  createdAt: string;
}

export interface QueueMetrics {
  ingestion: { waiting: number; active: number; failed: number };
  automation: { waiting: number; active: number; failed: number };
  webhooks: { waiting: number; active: number; failed: number };
}

export interface StorageMetrics {
  leadsCount: number;
  activitiesCount: number;
  auditLogsCount: number;
  webhookDeliveriesCount: number;
  recycleBinCount: number;
}

export interface PlatformMetrics {
  totalOrgs: number;
  totalUsers: number;
  totalLeads: number;
  activeEscalations: number;
  failedDeliveries: number;
  dbHealthy: boolean;
  redisConfigured: boolean;
  queues?: QueueMetrics;
  storage?: StorageMetrics;
}

export interface GlobalUserSummary {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  roleName: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
}

export interface EscalatedLeadSummary {
  id: string;
  name: string;
  orgName: string;
  orgId: string;
  status: string;
  escalatedAt: string;
}

export interface FailedDeliverySummary {
  id: string;
  orgName: string;
  orgId: string;
  event: string;
  url: string;
  errorReason: string | null;
  failedAt: string;
}

export interface FleetApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scope: string;
  orgId: string;
  orgName: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface TenantAuditSummary {
  id: string;
  action: string;
  actorName: string | null;
  actorEmail: string | null;
  entityType: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PlatformActivitySummary {
  id: string;
  action: string;
  actorName: string | null;
  actorEmail: string | null;
  entityType: string | null;
  orgId: string;
  orgName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface FoundOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  matchedReason?: string | null;
}

export interface TenantUserSummary {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  roleName: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
}

export interface TenantLeadSourceSummary {
  id: string;
  name: string;
  type: string | null;
  isActive: boolean;
  pageId?: string | null;
  needsReconnect?: boolean;
  tokenExpiresAt?: string | null;
  tokenStatus: "healthy" | "expiring_soon" | "expired" | "dead" | "not_applicable";
  tokenDaysRemaining?: number | null;
  authErrorMessage?: string | null;
  authFailedEventsCount?: number;
  createdAt: string;
}

export interface TenantIntegrationSummary {
  sources: TenantLeadSourceSummary[];
  endpoints: {
    id: string;
    url: string;
    events: string[];
    isActive: boolean;
    createdAt: string;
  }[];
  settings: {
    enrichmentEnabled: boolean;
    inboundEmailEnabled: boolean;
    capiEnabled: boolean;
    capiPixelId?: string | null;
  } | null;
  metaTokenDeadCount: number;
}

export interface Tenant360Data {
  org: typeof organizations.$inferSelect;
  health: import("./revops").TenantHealthSummary | null;
  billing: import("@/domains/billing/lifecycleService").TenantBillingInfo | null;
  invoices: import("@/domains/billing/invoiceService").TaxInvoice[];
  tickets: import("./supportService").SupportTicket[];
  users: TenantUserSummary[];
  leadsStats: {
    total: number;
    byStatus: Record<string, number>;
    createdLast30d: number;
    lastLeadActivityAt: string | null;
  };
  integrations: TenantIntegrationSummary;
  auditLogs: TenantAuditSummary[];
  failedDeliveries: FailedDeliverySummary[];
  apiKeys: FleetApiKeySummary[];
  anomalies: import("./anomalyDetectionService").SecurityAnomaly[];
  customSeats: number | null;
}

export interface TenantDossier {
  standard: string;
  exportedAt: string;
  organization: typeof organizations.$inferSelect;
  users: unknown[];
  leads: unknown[];
  activities: unknown[];
  followUps: unknown[];
  invoices: unknown[];
  supportTickets: unknown[];
  apiKeys: unknown[];
  auditLogs: unknown[];
  /** True when a section hit DOSSIER_ROW_CAP — the export is partial and says so. */
  truncated: boolean;
}

// Per-section row cap for the JSON dossier, so one huge tenant can't exhaust server memory.
// ponytail: fixed cap; stream NDJSON per table if a full export of bigger tenants is needed.
const DOSSIER_ROW_CAP = 20_000;

// Calendar months, clamped to the month's last day (Jan 31 + 1 month = Feb 28/29).
function addMonths(d: Date, months: number) {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + months);
  r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return r;
}

export class PlatformService {
  static async listOrganizations(): Promise<OrgSummary[]> {
    const orgs = await db.select().from(organizations).orderBy(desc(organizations.createdAt));
    const userCounts = await db
      .select({ orgId: users.organizationId, c: count() })
      .from(users)
      .where(isNull(users.deletedAt))
      .groupBy(users.organizationId);
    const leadCounts = await db
      .select({ orgId: leads.organizationId, c: count() })
      .from(leads)
      .where(isNull(leads.deletedAt))
      .groupBy(leads.organizationId);

    const [overrides, attributions] = await Promise.all([
      PlatformConfigService.get<Record<string, number>>("seat_overrides", {}),
      PlatformConfigService.get<Record<string, import("./attributionService").TenantAttribution>>("tenant_attributions", {}),
    ]);

    const u = new Map(userCounts.map((r) => [r.orgId, Number(r.c)]));
    const l = new Map(leadCounts.map((r) => [r.orgId, Number(r.c)]));

    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      plan: o.plan ?? "free",
      planStatus: o.planStatus ?? "active",
      suspended: !!o.suspendedAt,
      userCount: u.get(o.id) ?? 0,
      leadCount: l.get(o.id) ?? 0,
      customSeats: overrides[o.id] ?? null,
      attribution: attributions[o.id] ?? null,
      trialEndsAt: o.trialEndsAt ? new Date(o.trialEndsAt).toISOString() : null,
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  // Every headline count in ONE round trip. A failure is reported as dbHealthy=false (the console
  // shows "DB unreachable"), never as a fleet of zeros that looks like real data.
  static async getPlatformMetrics(): Promise<PlatformMetrics> {
    let counts: Record<string, number> | null = null;
    try {
      const rows = (await db.execute(sql`
        SELECT
          (SELECT count(*) FROM organizations)::int                                         AS orgs,
          (SELECT count(*) FROM users WHERE deleted_at IS NULL)::int                        AS users,
          (SELECT count(*) FROM leads WHERE deleted_at IS NULL)::int                        AS leads,
          (SELECT count(*) FROM leads WHERE deleted_at IS NOT NULL)::int                    AS recycle_bin,
          (SELECT count(*) FROM leads WHERE escalated_at IS NOT NULL AND deleted_at IS NULL)::int AS escalations,
          (SELECT count(*) FROM webhook_deliveries WHERE status = 'failed')::int            AS failed_deliveries,
          (SELECT count(*) FROM webhook_deliveries)::int                                    AS deliveries,
          (SELECT count(*) FROM activities)::int                                            AS activities,
          (SELECT count(*) FROM audit_logs)::int                                            AS audit_logs
      `)) as unknown as Record<string, number>[];
      counts = rows[0] ?? null;
    } catch (e) {
      console.error("[platform] metrics query failed", e);
    }
    const n = (k: string) => Number(counts?.[k] ?? 0);
    const storage: StorageMetrics = {
      leadsCount: n("leads"),
      activitiesCount: n("activities"),
      auditLogsCount: n("audit_logs"),
      webhookDeliveriesCount: n("deliveries"),
      recycleBinCount: n("recycle_bin"),
    };

    let queues: QueueMetrics | undefined;
    if (redisConfigured()) {
      try {
        const [{ ingestionQueue }, { automationQueue }, { webhookDeliveryQueue }] = await Promise.all([
          import("@/lib/jobs/workers/ingestionWorker"),
          import("@/lib/jobs/workers/automationWorker"),
          import("@/lib/jobs/workers/webhookRetryWorker"),
        ]);

        const [ingCounts, autoCounts, whCounts] = await Promise.all([
          ingestionQueue.getJobCounts("waiting", "active", "failed").catch(() => ({ waiting: 0, active: 0, failed: 0 })),
          automationQueue.getJobCounts("waiting", "active", "failed").catch(() => ({ waiting: 0, active: 0, failed: 0 })),
          webhookDeliveryQueue.getJobCounts("waiting", "active", "failed").catch(() => ({ waiting: 0, active: 0, failed: 0 })),
        ]);

        queues = {
          ingestion: { waiting: ingCounts.waiting ?? 0, active: ingCounts.active ?? 0, failed: ingCounts.failed ?? 0 },
          automation: { waiting: autoCounts.waiting ?? 0, active: autoCounts.active ?? 0, failed: autoCounts.failed ?? 0 },
          webhooks: { waiting: whCounts.waiting ?? 0, active: whCounts.active ?? 0, failed: whCounts.failed ?? 0 },
        };
      } catch {
        // BullMQ/ioredis offline or not connecting
      }
    }

    return {
      totalOrgs: n("orgs"),
      totalUsers: n("users"),
      totalLeads: n("leads"),
      activeEscalations: n("escalations"),
      failedDeliveries: n("failed_deliveries"),
      dbHealthy: counts !== null,
      redisConfigured: redisConfigured(),
      queues,
      storage,
    };
  }

  static async searchUsers(query?: string, limit = 50): Promise<GlobalUserSummary[]> {
    const conditions = [isNull(users.deletedAt)];
    if (query && query.trim()) {
      const q = `%${query.trim().toLowerCase()}%`;
      conditions.push(
        or(
          ilike(users.email, q),
          ilike(users.firstName, q),
          ilike(users.lastName, q),
          ilike(organizations.name, q)
        )!
      );
    }

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        organizationId: users.organizationId,
        organizationName: organizations.name,
        roleName: roles.name,
        isActive: users.isActive,
        isSuperAdmin: users.isSuperAdmin,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(organizations, eq(users.organizationId, organizations.id))
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .catch(() => []);

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      roleName: r.roleName,
      isActive: r.isActive,
      isSuperAdmin: r.isSuperAdmin,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  static async setUserActive(userId: string, isActive: boolean) {
    const [row] = await db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id, organizationId: users.organizationId, email: users.email });
    return row ?? null;
  }

  static async setSuperAdmin(userId: string, isSuperAdmin: boolean) {
    const [row] = await db
      .update(users)
      .set({ isSuperAdmin, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id, email: users.email, organizationId: users.organizationId });
    return row ?? null;
  }

  // Active super-admins — the last one can't be demoted.
  static async countSuperAdmins(): Promise<number> {
    const [row] = await db
      .select({ c: count() })
      .from(users)
      .where(and(eq(users.isSuperAdmin, true), eq(users.isActive, true), isNull(users.deletedAt)));
    return Number(row?.c ?? 0);
  }

  static async setSeatOverride(organizationId: string, seats: number | null) {
    const next = await PlatformConfigService.update<Record<string, number>>("seat_overrides", {}, (current) => {
      if (seats == null || seats <= 0) delete current[organizationId];
      else current[organizationId] = seats;
      return current;
    });
    return { organizationId, seats: next[organizationId] ?? null };
  }

  static async getBroadcast(): Promise<BroadcastConfig | null> {
    return PlatformConfigService.get<BroadcastConfig | null>("broadcast", null);
  }

  static async setBroadcast(broadcast: BroadcastConfig) {
    await PlatformConfigService.set("broadcast", broadcast);
    return broadcast;
  }

  static async purgeRecycleBin(): Promise<{ purgedCount: number }> {
    return LeadService.purgeExpired(0);
  }

  static async retryAllFailedDeliveries(): Promise<{ retried: number }> {
    const failed = await db
      .select({ id: webhookDeliveries.id, organizationId: webhookDeliveries.organizationId })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.status, "failed"))
      .limit(100);

    let retried = 0;
    for (const item of failed) {
      try {
        await WebhookDlqService.retryDlqJob(item.id, item.organizationId);
        retried++;
      } catch {
        // ignore single retry failure
      }
    }
    return { retried };
  }

  static async getEscalatedLeads(limit = 20): Promise<EscalatedLeadSummary[]> {
    const rows = await db
      .select({
        id: leads.id,
        name: leads.name,
        orgId: leads.organizationId,
        orgName: organizations.name,
        status: leads.status,
        escalatedAt: leads.escalatedAt,
      })
      .from(leads)
      .innerJoin(organizations, eq(leads.organizationId, organizations.id))
      .where(and(isNotNull(leads.escalatedAt), isNull(leads.deletedAt)))
      .orderBy(desc(leads.escalatedAt))
      .limit(limit)
      .catch(() => []);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      orgId: r.orgId,
      orgName: r.orgName,
      status: r.status,
      escalatedAt: r.escalatedAt ? new Date(r.escalatedAt).toISOString() : new Date().toISOString(),
    }));
  }

  static async getFailedDeliveries(limit = 20): Promise<FailedDeliverySummary[]> {
    const rows = await db
      .select({
        id: webhookDeliveries.id,
        orgId: webhookDeliveries.organizationId,
        orgName: organizations.name,
        event: webhookDeliveries.event,
        url: webhookDeliveries.url,
        errorReason: webhookDeliveries.errorReason,
        failedAt: webhookDeliveries.updatedAt,
      })
      .from(webhookDeliveries)
      .innerJoin(organizations, eq(webhookDeliveries.organizationId, organizations.id))
      .where(eq(webhookDeliveries.status, "failed"))
      .orderBy(desc(webhookDeliveries.updatedAt))
      .limit(limit)
      .catch(() => []);

    return rows.map((r) => ({
      id: r.id,
      orgId: r.orgId,
      orgName: r.orgName,
      event: r.event,
      url: r.url,
      errorReason: r.errorReason,
      failedAt: r.failedAt ? new Date(r.failedAt).toISOString() : new Date().toISOString(),
    }));
  }

  // Admin plan change. Three cases:
  //  - Free: back to free, nothing complimentary.
  //  - trialDays: a timed trial (auto-reverts to Free).
  //  - otherwise a paid plan with no payment = COMPLIMENTARY (e.g. agency clients): not billed, not
  //    counted as revenue, optionally until a date (months), with a note saying why.
  // A client who was paying is taken off Razorpay first, so they aren't charged for a free plan.
  static async setPlan(
    organizationId: string,
    plan: string,
    trialDays?: number | null,
    comp: { months?: number | null; note?: string | null } = {},
  ) {
    const trialEndsAt = trialDays && trialDays > 0 ? new Date(Date.now() + trialDays * 86_400_000) : null;
    const complimentary = plan !== "free" && !trialEndsAt;
    const complimentaryUntil = complimentary && comp.months ? addMonths(new Date(), comp.months) : null;

    const [before] = await db
      .select({ subscriptionId: organizations.razorpaySubscriptionId })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (!before) return null;
    if (before.subscriptionId) {
      const razorpay = await import("@/lib/billing/razorpay");
      if (razorpay.isConfigured()) {
        await razorpay.cancelSubscription(before.subscriptionId).catch((e) =>
          console.error(`[platform] could not cancel Razorpay subscription ${before.subscriptionId} for ${organizationId}`, e),
        );
      }
    }

    const [row] = await db
      .update(organizations)
      .set({
        plan,
        planStatus: "active",
        trialEndsAt,
        razorpaySubscriptionId: null,
        cancelAtPeriodEnd: 0,
        currentPeriodEnd: null,
        complimentary: complimentary ? 1 : 0,
        complimentaryUntil,
        complimentaryNote: complimentary ? comp.note?.trim() || null : null,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId))
      .returning({
        id: organizations.id,
        plan: organizations.plan,
        trialEndsAt: organizations.trialEndsAt,
        complimentary: organizations.complimentary,
        complimentaryUntil: organizations.complimentaryUntil,
        complimentaryNote: organizations.complimentaryNote,
      });
    return row ?? null;
  }

  static async setSuspended(organizationId: string, suspended: boolean) {
    const [row] = await db
      .update(organizations)
      .set({ suspendedAt: suspended ? new Date() : null })
      .where(eq(organizations.id, organizationId))
      .returning({ id: organizations.id });
    return row ?? null;
  }

  static async getOrg(organizationId: string) {
    const [row] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    return row ?? null;
  }

  static async getTenantAuditLogs(organizationId: string, limit = 50): Promise<TenantAuditSummary[]> {
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorName: auditLogs.actorName,
        actorEmail: auditLogs.actorEmail,
        entityType: auditLogs.entityType,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, organizationId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorName: r.actorName,
      actorEmail: r.actorEmail,
      entityType: r.entityType,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  static async listFleetApiKeys(limit = 100): Promise<FleetApiKeySummary[]> {
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        scope: apiKeys.scope,
        orgId: apiKeys.organizationId,
        orgName: organizations.name,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .leftJoin(organizations, eq(apiKeys.organizationId, organizations.id))
      .orderBy(desc(apiKeys.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      scope: r.scope,
      orgId: r.orgId,
      orgName: r.orgName,
      lastUsedAt: r.lastUsedAt ? new Date(r.lastUsedAt).toISOString() : null,
      revokedAt: r.revokedAt ? new Date(r.revokedAt).toISOString() : null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  static async revokeFleetApiKey(id: string): Promise<{ organizationId: string; name: string } | null> {
    const [row] = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning({ organizationId: apiKeys.organizationId, name: apiKeys.name });
    return row ?? null;
  }

  static async getPlatformActivity(limit = 50): Promise<PlatformActivitySummary[]> {
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorName: auditLogs.actorName,
        actorEmail: auditLogs.actorEmail,
        entityType: auditLogs.entityType,
        orgId: auditLogs.organizationId,
        orgName: organizations.name,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(organizations, eq(auditLogs.organizationId, organizations.id))
      .where(like(auditLogs.action, "platform.%"))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorName: r.actorName,
      actorEmail: r.actorEmail,
      entityType: r.entityType,
      orgId: r.orgId,
      orgName: r.orgName,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  static async findOrg(query: string, limit = 8): Promise<FoundOrg[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const like = `%${q}%`;

    const rows = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        matchedUserEmail: users.email,
        matchedUserName: sql<string>`concat_ws(' ', ${users.firstName}, ${users.lastName})`,
      })
      .from(organizations)
      .leftJoin(users, and(eq(users.organizationId, organizations.id), isNull(users.deletedAt)))
      .where(
        or(
          ilike(organizations.name, like),
          ilike(organizations.slug, like),
          ilike(organizations.website, like),
          ilike(users.email, like),
          ilike(users.firstName, like),
          ilike(users.lastName, like),
          ilike(sql<string>`concat_ws(' ', ${users.firstName}, ${users.lastName})`, like)
        )
      )
      .limit(limit * 3);

    const seen = new Map<string, FoundOrg>();
    for (const r of rows) {
      if (!seen.has(r.id)) {
        let matchedReason: string | null = null;
        if (r.matchedUserEmail && r.matchedUserEmail.toLowerCase().includes(q.toLowerCase())) {
          matchedReason = `Member: ${r.matchedUserEmail}`;
        } else if (r.matchedUserName && r.matchedUserName.toLowerCase().includes(q.toLowerCase())) {
          matchedReason = `Member: ${r.matchedUserName.trim()}`;
        }
        seen.set(r.id, {
          id: r.id,
          name: r.name,
          slug: r.slug,
          plan: r.plan,
          matchedReason,
        });
      }
      if (seen.size >= limit) break;
    }

    return Array.from(seen.values());
  }

  static async getTenant360(organizationId: string): Promise<Tenant360Data | null> {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) return null;

    const [
      tenantHealthList,
      billingStatus,
      allInvoices,
      allTickets,
      orgUsers,
      leadCountsByStatus,
      recentLeads,
      auditLogsList,
      failedDlqList,
      orgApiKeys,
      allAnomalies,
      seatOverrides,
      rawSources,
      rawEndpoints,
      rawSettings,
      rawFailedEvents,
    ] = await Promise.all([
      import("./revops").then((m) => m.RevOpsService.listTenantHealth(500)).catch(() => []),
      import("@/domains/billing/lifecycleService").then((m) => m.BillingLifecycleService.getTenantBillingStatus(organizationId)).catch(() => null),
      import("@/domains/billing/invoiceService").then((m) => m.InvoiceService.listInvoices(500)).catch(() => []),
      import("./supportService").then((m) => m.SupportTicketService.listTickets("all")).catch(() => []),
      db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          roleName: roles.name,
          isActive: users.isActive,
          isSuperAdmin: users.isSuperAdmin,
          createdAt: users.createdAt,
        })
        .from(users)
        .leftJoin(roles, eq(users.roleId, roles.id))
        .where(and(eq(users.organizationId, organizationId), isNull(users.deletedAt)))
        .orderBy(desc(users.createdAt))
        .catch(() => []),
      db
        .select({
          status: leads.status,
          c: count(),
        })
        .from(leads)
        .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt)))
        .groupBy(leads.status)
        .catch(() => []),
      db
        .select({
          c: count(),
        })
        .from(leads)
        .where(
          and(
            eq(leads.organizationId, organizationId),
            isNull(leads.deletedAt),
            gte(leads.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
          )
        )
        .catch(() => [{ c: 0 }]),
      this.getTenantAuditLogs(organizationId, 50),
      db
        .select({
          id: webhookDeliveries.id,
          orgId: webhookDeliveries.organizationId,
          event: webhookDeliveries.event,
          url: webhookDeliveries.url,
          errorReason: webhookDeliveries.errorReason,
          failedAt: webhookDeliveries.updatedAt,
        })
        .from(webhookDeliveries)
        .where(and(eq(webhookDeliveries.organizationId, organizationId), eq(webhookDeliveries.status, "failed")))
        .orderBy(desc(webhookDeliveries.updatedAt))
        .limit(20)
        .catch(() => []),
      db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          prefix: apiKeys.prefix,
          scope: apiKeys.scope,
          orgId: apiKeys.organizationId,
          lastUsedAt: apiKeys.lastUsedAt,
          revokedAt: apiKeys.revokedAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.organizationId, organizationId))
        .orderBy(desc(apiKeys.createdAt))
        .catch(() => []),
      import("./anomalyDetectionService").then((m) => m.AnomalyDetectionService.getCachedAnomalies()).catch(() => []),
      PlatformConfigService.get<Record<string, number>>("seat_overrides", {}),
      db
        .select({
          id: leadSources.id,
          name: leadSources.name,
          type: leadSources.type,
          isActive: leadSources.isActive,
          config: leadSources.config,
          createdAt: leadSources.createdAt,
        })
        .from(leadSources)
        .where(eq(leadSources.organizationId, organizationId))
        .catch(() => []),
      db
        .select({
          id: webhookEndpoints.id,
          url: webhookEndpoints.url,
          events: webhookEndpoints.events,
          isActive: webhookEndpoints.isActive,
          createdAt: webhookEndpoints.createdAt,
        })
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.organizationId, organizationId))
        .catch(() => []),
      db
        .select({
          enrichmentEnabled: tenantIntegrationSettings.enrichmentEnabled,
          inboundEmailEnabled: tenantIntegrationSettings.inboundEmailEnabled,
          capiEnabled: tenantIntegrationSettings.capiEnabled,
          capiPixelId: tenantIntegrationSettings.capiPixelId,
        })
        .from(tenantIntegrationSettings)
        .where(eq(tenantIntegrationSettings.organizationId, organizationId))
        .limit(1)
        .catch(() => []),
      db
        .select({
          pageId: sql<string>`${webhookEvents.payload}->>'page_id'`,
          c: count(),
          lastMessage: sql<string>`${webhookEvents.errorLog}->>'message'`,
        })
        .from(webhookEvents)
        .where(
          and(
            eq(webhookEvents.provider, "facebook"),
            eq(webhookEvents.status, "failed"),
            sql`${webhookEvents.errorLog}->>'reason' = 'auth_error_needs_reconnect'`,
          )
        )
        .groupBy(sql`${webhookEvents.payload}->>'page_id'`, sql`${webhookEvents.errorLog}->>'message'`)
        .catch(() => []),
    ]);

    const health = tenantHealthList.find((h) => h.id === organizationId) ?? null;
    const invoices = allInvoices.filter((inv) => inv.orgId === organizationId);
    const tickets = allTickets.filter((t) => t.orgId === organizationId);
    const anomalies = allAnomalies.filter((a) => a.organizationId === organizationId);

    const byStatus: Record<string, number> = {};
    let totalLeads = 0;
    for (const row of leadCountsByStatus) {
      const c = Number(row.c);
      byStatus[row.status] = c;
      totalLeads += c;
    }

    const authFailedMap = new Map(
      (rawFailedEvents ?? []).map((r) => [String(r.pageId), { count: Number(r.c), message: r.lastMessage }])
    );

    let metaTokenDeadCount = 0;
    const sourcesSummary: TenantLeadSourceSummary[] = (rawSources ?? []).map((s) => {
      const cfg = (s.config as Record<string, any>) ?? {};
      const pageId = cfg.pageId ? String(cfg.pageId) : null;
      const isFb = s.type === "facebook_lead_ads" || !!pageId;
      const failedAuth = pageId ? authFailedMap.get(pageId) : undefined;
      const failedEventsCount = failedAuth?.count ?? 0;
      const needsReconnect = Boolean(cfg.needsReconnect) || failedEventsCount > 0;
      const expiresAt = cfg.expiresAt ? new Date(cfg.expiresAt) : null;

      let tokenStatus: "healthy" | "expiring_soon" | "expired" | "dead" | "not_applicable" = "not_applicable";
      let tokenDaysRemaining: number | null = null;
      let authErrorMessage: string | null = null;

      if (isFb) {
        if (needsReconnect) {
          tokenStatus = "dead";
          authErrorMessage =
            failedAuth?.message ||
            "OAuthException (Code 190): Access token is expired, revoked, or invalidated. Reconnect required.";
          metaTokenDeadCount++;
        } else if (expiresAt) {
          const diffMs = expiresAt.getTime() - Date.now();
          tokenDaysRemaining = Math.round(diffMs / (1000 * 60 * 60 * 24));
          if (diffMs <= 0) {
            tokenStatus = "expired";
            authErrorMessage = `Page token expired on ${expiresAt.toLocaleDateString()}.`;
            metaTokenDeadCount++;
          } else if (diffMs <= 7 * 24 * 60 * 60 * 1000) {
            tokenStatus = "expiring_soon";
          } else {
            tokenStatus = "healthy";
          }
        } else if (!cfg.pageAccessToken) {
          tokenStatus = "dead";
          authErrorMessage = "Missing Facebook Page Access Token.";
          metaTokenDeadCount++;
        } else {
          tokenStatus = "healthy";
        }
      }

      return {
        id: s.id,
        name: s.name,
        type: s.type,
        isActive: s.isActive === 1,
        pageId,
        needsReconnect,
        tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
        tokenStatus,
        tokenDaysRemaining,
        authErrorMessage,
        authFailedEventsCount: failedEventsCount,
        createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
      };
    });

    return {
      org,
      health,
      billing: billingStatus,
      invoices,
      tickets,
      users: orgUsers.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        roleName: u.roleName,
        isActive: u.isActive,
        isSuperAdmin: u.isSuperAdmin,
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
      })),
      leadsStats: {
        total: totalLeads,
        byStatus,
        createdLast30d: Number(recentLeads[0]?.c ?? 0),
        lastLeadActivityAt: health?.lastActiveAt ?? null,
      },
      integrations: {
        sources: sourcesSummary,
        endpoints: (rawEndpoints ?? []).map((e) => ({
          id: e.id,
          url: e.url,
          events: (e.events as string[]) ?? [],
          isActive: e.isActive === 1,
          createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : new Date().toISOString(),
        })),
        settings: rawSettings?.[0]
          ? {
              enrichmentEnabled: rawSettings[0].enrichmentEnabled === 1,
              inboundEmailEnabled: rawSettings[0].inboundEmailEnabled === 1,
              capiEnabled: rawSettings[0].capiEnabled === 1,
              capiPixelId: rawSettings[0].capiPixelId ?? null,
            }
          : null,
        metaTokenDeadCount,
      },
      auditLogs: auditLogsList,
      failedDeliveries: failedDlqList.map((d) => ({
        id: d.id,
        orgId: d.orgId,
        orgName: org.name,
        event: d.event,
        url: d.url,
        errorReason: d.errorReason,
        failedAt: d.failedAt ? new Date(d.failedAt).toISOString() : new Date().toISOString(),
      })),
      apiKeys: orgApiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        scope: k.scope,
        orgId: k.orgId,
        orgName: org.name,
        lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : null,
        revokedAt: k.revokedAt ? new Date(k.revokedAt).toISOString() : null,
        createdAt: k.createdAt ? new Date(k.createdAt).toISOString() : new Date().toISOString(),
      })),
      anomalies,
      customSeats: seatOverrides[organizationId] ?? null,
    };
  }

  static async exportTenantDossier(organizationId: string): Promise<TenantDossier | null> {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) return null;

    const [
      orgUsers,
      orgLeads,
      allInvoices,
      allTickets,
      orgApiKeys,
      orgAuditLogs,
    ] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          phone: users.phone,
          firstName: users.firstName,
          lastName: users.lastName,
          roleId: users.roleId,
          teamId: users.teamId,
          isActive: users.isActive,
          isSuperAdmin: users.isSuperAdmin,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.organizationId, organizationId)),
      db
        .select()
        .from(leads)
        .where(eq(leads.organizationId, organizationId))
        .limit(DOSSIER_ROW_CAP + 1),
      import("@/domains/billing/invoiceService").then((m) => m.InvoiceService.listForOrg(organizationId)),
      import("./supportService").then((m) => m.SupportTicketService.listTickets("all")).then((all) => all.filter((t) => t.orgId === organizationId)),
      db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          prefix: apiKeys.prefix,
          scope: apiKeys.scope,
          lastUsedAt: apiKeys.lastUsedAt,
          revokedAt: apiKeys.revokedAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.organizationId, organizationId)),
      this.getTenantAuditLogs(organizationId, 500),
    ]);

    // Filter by the org in SQL (a subquery), not by passing every lead id back in.
    const orgLeadIds = db.select({ id: leads.id }).from(leads).where(eq(leads.organizationId, organizationId));
    const [orgActivities, orgFollowUps] = await Promise.all([
      db.select().from(activities).where(inArray(activities.leadId, orgLeadIds)).limit(DOSSIER_ROW_CAP + 1),
      db.select().from(followUps).where(inArray(followUps.leadId, orgLeadIds)).limit(DOSSIER_ROW_CAP + 1),
    ]);
    const capped = <T,>(rows: T[]) => rows.slice(0, DOSSIER_ROW_CAP);
    const truncated = [orgLeads, orgActivities, orgFollowUps].some((r) => r.length > DOSSIER_ROW_CAP);

    // ponytail: JSON dossier bundle instead of multi-file zip to avoid unneeded zip archiving dependencies; add archiver/jszip if multi-file archive is required.
    return {
      standard: "DPDP 2023 / GDPR Article 20 - Data Portability & Offboarding Dossier",
      exportedAt: new Date().toISOString(),
      organization: org,
      users: orgUsers,
      leads: capped(orgLeads),
      activities: capped(orgActivities),
      followUps: capped(orgFollowUps),
      invoices: allInvoices,
      supportTickets: allTickets,
      apiKeys: orgApiKeys,
      auditLogs: orgAuditLogs,
      truncated,
    };
  }

  static async hardDeleteTenant(
    organizationId: string,
    confirmation: string,
    superAdminId?: string
  ): Promise<{ success: boolean; message?: string }> {
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      return { success: false, message: "Organization not found." };
    }

    const conf = confirmation.trim().toLowerCase();
    if (conf !== org.slug.toLowerCase() && conf !== org.name.toLowerCase()) {
      return {
        success: false,
        message: `Confirmation mismatch. You typed "${confirmation}", but must type the workspace slug ("${org.slug}") or name ("${org.name}").`,
      };
    }

    // Attachment files live outside Postgres (R2/local) — note them now, delete after the wipe commits.
    const orgFiles = await db.select({ ref: leadAttachments.fileUrl }).from(leadAttachments).where(eq(leadAttachments.organizationId, organizationId));

    // Step 1: Wipe all relational tenant records in a strict transaction. Every table whose FK to
    // organizations / users / leads is NO ACTION must be listed here (children before parents) or the
    // whole wipe rolls back — tenantOffboarding.test.ts fails if a new such table isn't covered.
    await db.transaction(async (tx) => {
      const orgUserIds = (await tx.select({ id: users.id }).from(users).where(eq(users.organizationId, organizationId))).map((u) => u.id);
      // Per-user rows with NO ACTION FKs (they'd block deleting the users / leads below).
      if (orgUserIds.length > 0) {
        await tx.delete(notifications).where(inArray(notifications.userId, orgUserIds));
        await tx.delete(pushSubscriptions).where(inArray(pushSubscriptions.userId, orgUserIds));
        await tx.delete(sharedLinks).where(inArray(sharedLinks.ownerId, orgUserIds));
        // Keep other orgs' audit trails intact if they ever reference one of these users.
        await tx.update(auditLogs).set({ userId: null }).where(inArray(auditLogs.userId, orgUserIds));
      }

      const orgLeads = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.organizationId, organizationId));
      const leadIds = orgLeads.map((l) => l.id);

      if (leadIds.length > 0) {
        const orgFollowUps = await tx
          .select({ id: followUps.id })
          .from(followUps)
          .where(inArray(followUps.leadId, leadIds));
        const followUpIds = orgFollowUps.map((f) => f.id);
        if (followUpIds.length > 0) {
          await tx.delete(reminders).where(inArray(reminders.followUpId, followUpIds));
        }
        await tx.delete(followUps).where(inArray(followUps.leadId, leadIds));
        await tx.delete(activities).where(inArray(activities.leadId, leadIds));
        await tx.delete(leadAttachments).where(eq(leadAttachments.organizationId, organizationId));
        await tx.delete(whatsappMessages).where(inArray(whatsappMessages.leadId, leadIds));
        await tx.delete(leadTags).where(inArray(leadTags.leadId, leadIds));
        await tx.delete(leadStatusHistory).where(inArray(leadStatusHistory.leadId, leadIds));
        await tx.delete(notifications).where(inArray(notifications.leadId, leadIds));
        await tx.delete(leads).where(eq(leads.organizationId, organizationId));
      }

      // Lead-side config (leads referencing these are gone now).
      await tx.delete(tags).where(eq(tags.organizationId, organizationId));
      await tx.delete(leadPipelineStages).where(eq(leadPipelineStages.organizationId, organizationId));
      await tx.delete(leadPipelines).where(eq(leadPipelines.organizationId, organizationId));
      await tx.delete(leadCounters).where(eq(leadCounters.organizationId, organizationId));
      await tx.delete(customStatusConfigs).where(eq(customStatusConfigs.organizationId, organizationId));
      await tx.delete(messageTemplates).where(eq(messageTemplates.organizationId, organizationId));

      // 2. Sources, Assignment & lead alerts (alert rules reference sources and the org, NO ACTION FKs)
      await tx.delete(leadDistributionDeliveries).where(eq(leadDistributionDeliveries.organizationId, organizationId));
      await tx.delete(leadDistributionRules).where(eq(leadDistributionRules.organizationId, organizationId));
      const sources = await tx
        .select({ id: leadSources.id })
        .from(leadSources)
        .where(eq(leadSources.organizationId, organizationId));
      const sourceIds = sources.map((s) => s.id);
      if (sourceIds.length > 0) {
        await tx.delete(assignmentRules).where(inArray(assignmentRules.sourceId, sourceIds));
        await tx.delete(leadSources).where(eq(leadSources.organizationId, organizationId));
      }

      // 3. Automations & sequences
      await tx.delete(automations).where(eq(automations.organizationId, organizationId));
      await tx.delete(sequences).where(eq(sequences.organizationId, organizationId));

      // 4. Integrations & configs
      await tx.delete(savedViews).where(eq(savedViews.organizationId, organizationId));
      await tx.delete(customFieldDefs).where(eq(customFieldDefs.organizationId, organizationId));
      await tx.delete(apiKeys).where(eq(apiKeys.organizationId, organizationId));
      await tx.delete(invitations).where(eq(invitations.organizationId, organizationId));
      await tx.delete(emailSettings).where(eq(emailSettings.organizationId, organizationId));
      await tx.delete(webhookDeliveries).where(eq(webhookDeliveries.organizationId, organizationId));
      await tx.delete(webhookEndpoints).where(eq(webhookEndpoints.organizationId, organizationId));
      await tx.delete(auditLogs).where(eq(auditLogs.organizationId, organizationId));

      // 5. Users & credentials
      // Assignment rules not tied to a source still point at this org's users/teams.
      const orgTeamIds = (await tx.select({ id: teams.id }).from(teams).where(eq(teams.organizationId, organizationId))).map((t) => t.id);
      if (orgUserIds.length > 0 || orgTeamIds.length > 0) {
        await tx.delete(assignmentRules).where(or(
          orgUserIds.length ? inArray(assignmentRules.userId, orgUserIds) : sql`false`,
          orgUserIds.length ? inArray(assignmentRules.lastAssignedUserId, orgUserIds) : sql`false`,
          orgTeamIds.length ? inArray(assignmentRules.teamId, orgTeamIds) : sql`false`,
        ));
      }
      if (orgUserIds.length > 0) {
        await tx.delete(googleCredentials).where(inArray(googleCredentials.userId, orgUserIds));
        await tx.delete(savedViews).where(inArray(savedViews.userId, orgUserIds));
      }
      await tx.delete(users).where(eq(users.organizationId, organizationId));

      // 6. Teams & Roles
      await tx.delete(teams).where(eq(teams.organizationId, organizationId));
      await tx.delete(roles).where(eq(roles.organizationId, organizationId));
      forgetRole();

      // 7. Organization primary row
      await tx.delete(organizations).where(eq(organizations.id, organizationId));
    });

    // The wipe committed — now remove the stored attachment files (best-effort, never blocks).
    if (orgFiles.length) {
      const { deleteAttachment } = await import("@/lib/storage/attachments");
      await Promise.all(orgFiles.map((f) => deleteAttachment(f.ref)));
    }

    // Step 2: Clean up platform configuration maps (locked, so other tenants' entries are never lost).
    try {
      await PlatformConfigService.update<Record<string, unknown>>("seat_overrides", {}, (m) => { delete m[organizationId]; return m; });
      await PlatformConfigService.update<Record<string, unknown>>("tenant_attributions", {}, (m) => { delete m[organizationId]; return m; });
      await PlatformConfigService.set(`billing_lifecycle:${organizationId}`, {});
      await PlatformConfigService.set(`retention_state:${organizationId}`, {});
      await PlatformConfigService.set(`revoked_org:${organizationId}`, new Date().toISOString());
    } catch (e) {
      console.error(`[platform] hard delete ${organizationId}: config cleanup failed (data already erased)`, e);
    }

    // Step 3: Audit log & Ops Alert
    try {
      const { AuditService } = await import("@/domains/audit/service");
      await AuditService.log({
        organizationId: "00000000-0000-0000-0000-000000000000",
        userId: superAdminId,
        action: "compliance.tenant_hard_delete",
        entityType: "organization",
        entityId: organizationId,
        metadata: {
          orgName: org.name,
          slug: org.slug,
          standard: "DPDP 2023 / GDPR Right to Erasure",
        },
      });

      const { OpsAlertService } = await import("./opsAlertService");
      await OpsAlertService.dispatchAlert(
        "compliance.tenant_hard_deleted",
        "Tenant Permanently Erased (GDPR/DPDP)",
        `Tenant "${org.name}" (${org.slug}) and all associated records were permanently purged by operator.`
      );
    } catch {
      // non-blocking
    }

    return { success: true };
  }
}


