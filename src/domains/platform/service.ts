import { db } from "@/db";
import { organizations, users, leads, webhookDeliveries, roles, activities, auditLogs, apiKeys } from "@/db/schema";
import { count, desc, eq, isNull, isNotNull, and, or, ilike, like, sql } from "drizzle-orm";
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

  static async setPlan(organizationId: string, plan: string) {
    const [row] = await db
      .update(organizations)
      .set({ plan, planStatus: "active", updatedAt: new Date() })
      .where(eq(organizations.id, organizationId))
      .returning({ id: organizations.id });
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
}


