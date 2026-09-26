import { randomBytes } from "crypto";
import { db } from "@/db";
import { sharedLinks, sharedLinkViews, leads, users, organizations } from "@/db/schema";
import { and, asc, count, desc, eq, gt, gte, lt, isNull, sql } from "drizzle-orm";
import { NotificationService } from "@/domains/notifications/service";
import { ActivityService } from "@/domains/activities/service";
import { keepAlive } from "@/lib/keepAlive";

export interface SharedPageData {
  title: string;
  targetUrl: string | null;
  bodyText: string | null;
  imageUrl: string | null;
  leadName: string;
  ownerName: string | null;
  orgName: string | null;
}

export interface SharedLinkSummary {
  id: string;
  title: string;
  targetUrl: string | null;
  slug: string;
  viewCount: number;
  lastViewedAt: Date | null;
  createdAt: Date;
}

export class ContentSharingService {
  /**
   * Only http(s) links are shareable — blocks javascript:/data: open-redirects, since the
   * public /s/:slug route redirects to this value. Adds https:// when no scheme is given.
   * Returns null for anything that isn't a valid web URL.
   */
  static normalizeUrl(raw: string): string | null {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(withScheme);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  static async createShare(input: {
    organizationId: string;
    leadId: string;
    ownerId?: string | null;
    title: string;
    targetUrl?: string | null;
    bodyText?: string | null;
    imageUrl?: string | null;
  }): Promise<SharedLinkSummary> {
    const slug = randomBytes(9).toString("base64url"); // 12 url-safe chars
    const [row] = await db
      .insert(sharedLinks)
      .values({
        organizationId: input.organizationId,
        leadId: input.leadId,
        ownerId: input.ownerId ?? null,
        slug,
        title: input.title.slice(0, 255),
        targetUrl: input.targetUrl?.slice(0, 2048) ?? null,
        bodyText: input.bodyText ?? null,
        imageUrl: input.imageUrl?.slice(0, 2048) ?? null,
      })
      .returning();
    return {
      id: row.id,
      title: row.title,
      targetUrl: row.targetUrl,
      slug: row.slug,
      viewCount: row.viewCount,
      lastViewedAt: row.lastViewedAt,
      createdAt: row.createdAt,
    };
  }

  /**
   * Lead IDs in the org that opened shared content within the given window — a live
   * "who's engaging right now" signal for ranking hot leads.
   */
  static async recentlyEngagedLeadIds(organizationId: string, withinMs = 3 * 24 * 60 * 60 * 1000): Promise<Set<string>> {
    const since = new Date(Date.now() - withinMs);
    const rows = await db
      .select({ leadId: sharedLinks.leadId })
      .from(sharedLinks)
      .where(
        and(
          eq(sharedLinks.organizationId, organizationId),
          gt(sharedLinks.viewCount, 0),
          gte(sharedLinks.lastViewedAt, since),
        ),
      );
    return new Set(rows.map((r) => r.leadId));
  }

  /**
   * Content that was shared but never opened, older than the given age — the "who's ignoring
   * you" list for re-engagement. Oldest first.
   */
  static async ignoredShares(organizationId: string, olderThanMs = 24 * 60 * 60 * 1000, enforceOwnerId?: string) {
    const before = new Date(Date.now() - olderThanMs);
    return db
      .select({
        id: sharedLinks.id,
        leadId: sharedLinks.leadId,
        title: sharedLinks.title,
        sentAt: sharedLinks.createdAt,
        leadName: leads.name,
        leadPhone: leads.phone,
      })
      .from(sharedLinks)
      .innerJoin(leads, eq(leads.id, sharedLinks.leadId))
      .where(
        and(
          eq(sharedLinks.organizationId, organizationId),
          isNull(leads.deletedAt),
          ...(enforceOwnerId ? [eq(leads.ownerId, enforceOwnerId)] : []),
          eq(sharedLinks.viewCount, 0),
          lt(sharedLinks.createdAt, before),
        ),
      )
      .orderBy(asc(sharedLinks.createdAt));
  }

  /** Org-level content engagement for the dashboard: opens in the window + currently-ignored count. */
  static async orgEngagementStats(
    organizationId: string,
    windowMs = 7 * 24 * 60 * 60 * 1000,
  ): Promise<{ opensInWindow: number; ignoredCount: number }> {
    const since = new Date(Date.now() - windowMs);
    const ignoredBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [[opens], [ignored]] = await Promise.all([
      db
        .select({ n: count() })
        .from(sharedLinkViews)
        .innerJoin(sharedLinks, eq(sharedLinks.id, sharedLinkViews.sharedLinkId))
        .where(and(eq(sharedLinks.organizationId, organizationId), gte(sharedLinkViews.viewedAt, since))),
      db
        .select({ n: count() })
        .from(sharedLinks)
        .where(
          and(
            eq(sharedLinks.organizationId, organizationId),
            eq(sharedLinks.viewCount, 0),
            lt(sharedLinks.createdAt, ignoredBefore),
          ),
        ),
    ]);
    return { opensInWindow: Number(opens.n), ignoredCount: Number(ignored.n) };
  }

  static async listForLead(leadId: string): Promise<SharedLinkSummary[]> {
    const rows = await db
      .select()
      .from(sharedLinks)
      .where(eq(sharedLinks.leadId, leadId))
      .orderBy(desc(sharedLinks.createdAt));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      targetUrl: r.targetUrl,
      slug: r.slug,
      viewCount: r.viewCount,
      lastViewedAt: r.lastViewedAt,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Records an open of a shared link and returns the data for its branded page.
   * Notifies the link owner and logs an activity so reps see who's actually interested.
   * Returns null if the slug is unknown.
   *
   * Not counted (page still renders): link-preview/scanner bots — WhatsApp fetches the link the
   * moment a rep sends it — the workspace's own team (a rep checking their link), and a refresh
   * within a minute of the last counted open.
   */
  static async openPage(slug: string, userAgent?: string, opts: { viewerOrgId?: string | null } = {}): Promise<SharedPageData | null> {
    const [link] = await db.select().from(sharedLinks).where(eq(sharedLinks.slug, slug)).limit(1);
    if (!link) return null;

    const recentlyCounted = link.lastViewedAt && Date.now() - new Date(link.lastViewedAt).getTime() < 60_000;
    if (isPreviewBot(userAgent) || opts.viewerOrgId === link.organizationId || recentlyCounted) {
      return this.pageData(link);
    }

    await db.insert(sharedLinkViews).values({ sharedLinkId: link.id, userAgent: userAgent?.slice(0, 500) });
    await db
      .update(sharedLinks)
      .set({ viewCount: sql`${sharedLinks.viewCount} + 1`, lastViewedAt: new Date() })
      .where(eq(sharedLinks.id, link.id));

    const nextCount = link.viewCount + 1;
    const page = await this.pageData(link);
    const leadName = page.leadName;
    // Surface the engagement signal: who opened what, and how many times.
    // Not awaited (the lead's page shouldn't wait on it), but kept alive past the response.
    keepAlive(ActivityService.addActivity({
      leadId: link.leadId,
      userId: link.ownerId ?? undefined,
      type: "content_viewed",
      content: `Opened "${link.title}" (view #${nextCount})`,
    }), "content view activity");

    if (link.ownerId) {
      keepAlive(NotificationService.create({
        userId: link.ownerId,
        type: "content_viewed",
        title: `${leadName} opened your content`,
        body: `${leadName} opened "${link.title}"${nextCount > 1 ? ` — ${nextCount} views so far` : ""}.`,
        leadId: link.leadId,
      }), "content view notification");
    }

    return page;
  }

  private static async pageData(link: typeof sharedLinks.$inferSelect): Promise<SharedPageData> {
    const [[lead], [owner], [org]] = await Promise.all([
      db.select({ name: leads.name }).from(leads).where(eq(leads.id, link.leadId)).limit(1),
      link.ownerId
        ? db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, link.ownerId)).limit(1)
        : Promise.resolve([undefined]),
      db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, link.organizationId)).limit(1),
    ]);
    const ownerName = owner ? [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() || null : null;
    return {
      title: link.title,
      targetUrl: link.targetUrl,
      bodyText: link.bodyText,
      imageUrl: link.imageUrl,
      leadName: lead?.name ?? "there",
      ownerName,
      orgName: org?.name ?? null,
    };
  }
}

// Link unfurlers, mail scanners and HTTP clients — they fetch a shared link without a person reading
// it. Kept to fetcher signatures only: in-app browsers (LinkedIn, Outlook, Instagram…) are real people.
const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|facebookcatalog|^whatsapp|whatsapp\/|skypeuripreview|embedly|vkshare|microsoft office existence|google-read-aloud|headlesschrome|python-requests|curl\/|wget\/|go-http-client|okhttp|axios\/|node-fetch|undici|postmanruntime|proofpoint|mimecast|barracuda|safelinks/i;

export function isPreviewBot(userAgent?: string | null) {
  return !userAgent || BOT_UA.test(userAgent);
}
