import { db } from "@/db";
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
  automations,
  sequences,
  savedViews,
  customFieldDefs,
  invitations,
  emailSettings,
  googleCredentials,
  teams,
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

  static async getStorageMetrics(): Promise<StorageMetrics> {
    const [l, a, au, wh, rb] = await Promise.all([
      db.select({ c: count() }).from(leads).where(isNull(leads.deletedAt)).catch(() => [{ c: 0 }]),
      db.select({ c: count() }).from(activities).catch(() => [{ c: 0 }]),
      db.select({ c: count() }).from(auditLogs).catch(() => [{ c: 0 }]),
      db.select({ c: count() }).from(webhookDeliveries).catch(() => [{ c: 0 }]),
      db.select({ c: count() }).from(leads).where(isNotNull(leads.deletedAt)).catch(() => [{ c: 0 }]),
    ]);

    return {
      leadsCount: Number(l[0]?.c ?? 0),
      activitiesCount: Number(a[0]?.c ?? 0),
      auditLogsCount: Number(au[0]?.c ?? 0),
      webhookDeliveriesCount: Number(wh[0]?.c ?? 0),
      recycleBinCount: Number(rb[0]?.c ?? 0),
    };
  }

  static async getPlatformMetrics(): Promise<PlatformMetrics> {
    let dbHealthy = false;
    try {
      await db.execute(sql`SELECT 1`);
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }

    const [escCount] = await db
      .select({ c: count() })
      .from(leads)
      .where(and(isNotNull(leads.escalatedAt), isNull(leads.deletedAt)))
      .catch(() => [{ c: 0 }]);

    const [failedCount] = await db
      .select({ c: count() })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.status, "failed"))
      .catch(() => [{ c: 0 }]);

    const [userCount] = await db
      .select({ c: count() })
      .from(users)
      .where(isNull(users.deletedAt))
      .catch(() => [{ c: 0 }]);

    const [leadCount] = await db
      .select({ c: count() })
      .from(leads)
      .where(isNull(leads.deletedAt))
      .catch(() => [{ c: 0 }]);

    const [orgCount] = await db
      .select({ c: count() })
      .from(organizations)
      .catch(() => [{ c: 0 }]);

    const storage = await this.getStorageMetrics();

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
      totalOrgs: Number(orgCount?.c ?? 0),
      totalUsers: Number(userCount?.c ?? 0),
      totalLeads: Number(leadCount?.c ?? 0),
      activeEscalations: Number(escCount?.c ?? 0),
      failedDeliveries: Number(failedCount?.c ?? 0),
      dbHealthy,
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
      .returning({ id: users.id, email: users.email });
    return row ?? null;
  }

  static async setSeatOverride(organizationId: string, seats: number | null) {
    const current = await PlatformConfigService.get<Record<string, number>>("seat_overrides", {});
    if (seats == null || seats <= 0) {
      delete current[organizationId];
    } else {
      current[organizationId] = seats;
    }
    await PlatformConfigService.set("seat_overrides", current);
    return { organizationId, seats: current[organizationId] ?? null };
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

  static async setPlan(organizationId: string, plan: string, trialDays?: number | null) {
    const trialEndsAt =
      trialDays && trialDays > 0
        ? new Date(Date.now() + trialDays * 86_400_000)
        : null;

    const [row] = await db
      .update(organizations)
      .set({
        plan,
        planStatus: "active",
        trialEndsAt,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId))
      .returning({
        id: organizations.id,
        plan: organizations.plan,
        trialEndsAt: organizations.trialEndsAt,
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

  static async revokeFleetApiKey(id: string): Promise<boolean> {
    const [row] = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning({ id: apiKeys.id });
    return !!row;
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
        .where(eq(users.organizationId, organizationId))
        .catch(() => []),
      db
        .select()
        .from(leads)
        .where(eq(leads.organizationId, organizationId))
        .catch(() => []),
      import("@/domains/billing/invoiceService").then((m) => m.InvoiceService.listInvoices(1000)).catch(() => []),
      import("./supportService").then((m) => m.SupportTicketService.listTickets("all")).catch(() => []),
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
        .where(eq(apiKeys.organizationId, organizationId))
        .catch(() => []),
      this.getTenantAuditLogs(organizationId, 500),
    ]);

    const leadIds = orgLeads.map((l) => l.id);
    const [orgActivities, orgFollowUps] = await Promise.all([
      leadIds.length > 0
        ? db.select().from(activities).where(inArray(activities.leadId, leadIds)).catch(() => [])
        : [],
      leadIds.length > 0
        ? db.select().from(followUps).where(inArray(followUps.leadId, leadIds)).catch(() => [])
        : [],
    ]);

    // ponytail: JSON dossier bundle instead of multi-file zip to avoid unneeded zip archiving dependencies; add archiver/jszip if multi-file archive is required.
    return {
      standard: "DPDP 2023 / GDPR Article 20 - Data Portability & Offboarding Dossier",
      exportedAt: new Date().toISOString(),
      organization: org,
      users: orgUsers,
      leads: orgLeads,
      activities: orgActivities,
      followUps: orgFollowUps,
      invoices: allInvoices.filter((i) => i.orgId === organizationId),
      supportTickets: allTickets.filter((t) => t.orgId === organizationId),
      apiKeys: orgApiKeys,
      auditLogs: orgAuditLogs,
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
        message: `Confirmation mismatch. You typed "${confirmation}", but must type "${org.slug}".`,
      };
    }

    // Step 1: Wipe all relational tenant records in a strict transaction
    await db.transaction(async (tx) => {
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
        await tx.delete(leads).where(eq(leads.organizationId, organizationId));
      }

      // 2. Sources & Assignment
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
      await tx.delete(auditLogs).where(eq(auditLogs.organizationId, organizationId));

      // 5. Users & credentials
      const orgUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.organizationId, organizationId));
      const userIds = orgUsers.map((u) => u.id);
      if (userIds.length > 0) {
        await tx.delete(googleCredentials).where(inArray(googleCredentials.userId, userIds));
      }
      await tx.delete(users).where(eq(users.organizationId, organizationId));

      // 6. Teams & Roles
      await tx.delete(teams).where(eq(teams.organizationId, organizationId));
      await tx.delete(roles).where(eq(roles.organizationId, organizationId));

      // 7. Organization primary row
      await tx.delete(organizations).where(eq(organizations.id, organizationId));
    });

    // Step 2: Clean up platform configuration maps
    try {
      const [overrides, credits] = await Promise.all([
        PlatformConfigService.get<Record<string, number>>("seat_overrides", {}),
        PlatformConfigService.get<Record<string, any>>("tenant_credits", {}),
      ]);
      delete overrides[organizationId];
      delete credits[organizationId];
      await Promise.all([
        PlatformConfigService.set("seat_overrides", overrides),
        PlatformConfigService.set("tenant_credits", credits),
        PlatformConfigService.set(`billing_lifecycle:${organizationId}`, {}),
        PlatformConfigService.set(`revoked_org:${organizationId}`, new Date().toISOString()),
      ]);
    } catch {
      // ignore config cleanup error
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


