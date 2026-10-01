import { PlatformConfigService } from "./configService";
import { PlatformService, PlatformMetrics } from "./service";
import { RevOpsService, RevOpsMetrics, TenantHealthSummary } from "./revops";
import { SupportTicketService } from "./supportService";
import { sendEmail } from "@/lib/mail/mailer";
import { escapeHtml } from "@/lib/utils";
import { mh, mp, mbtn, mtag, mkpis, mtable, mcallout } from "@/lib/mail/layout";
import { AuditService } from "@/domains/audit/service";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, isNull, and } from "drizzle-orm";

export interface ExecutiveDigestConfig {
  enabled: boolean;
  frequency: "daily" | "weekly";
  recipients: string[];
  lastSentAt: string | null;
}

export interface ExecutiveDigestData {
  generatedAt: string;
  frequency: string;
  metrics: PlatformMetrics;
  revops: RevOpsMetrics;
  openTicketsCount: number;
  atRiskTenants: TenantHealthSummary[];
}

const CONFIG_KEY = "executive_digest_config";

const DEFAULT_CONFIG: ExecutiveDigestConfig = {
  enabled: false,
  frequency: "weekly",
  recipients: [],
  lastSentAt: null,
};

export class ExecutiveDigestService {
  static async getConfig(): Promise<ExecutiveDigestConfig> {
    return PlatformConfigService.get<ExecutiveDigestConfig>(CONFIG_KEY, DEFAULT_CONFIG);
  }

  static async saveConfig(config: Partial<ExecutiveDigestConfig>): Promise<ExecutiveDigestConfig> {
    const current = await this.getConfig();
    const updated: ExecutiveDigestConfig = {
      ...current,
      ...config,
      recipients: Array.isArray(config.recipients) ? config.recipients.map((r) => r.trim()).filter(Boolean) : current.recipients,
    };
    await PlatformConfigService.set(CONFIG_KEY, updated);
    return updated;
  }

  static async buildDigestData(): Promise<ExecutiveDigestData> {
    const [metrics, revops, allTickets, healthList, config] = await Promise.all([
      PlatformService.getPlatformMetrics(),
      RevOpsService.getMetrics(),
      SupportTicketService.listTickets("all"),
      RevOpsService.listTenantHealth(20),
      this.getConfig(),
    ]);

    const openTicketsCount = allTickets.filter((t) => t.status === "open").length;
    const atRiskTenants = healthList.filter((t) => t.health === "at_risk" || t.health === "critical");

    return {
      generatedAt: new Date().toISOString(),
      frequency: config.frequency,
      metrics,
      revops,
      openTicketsCount,
      atRiskTenants,
    };
  }

  static renderDigestHtml(data: ExecutiveDigestData): string {
    const dateFormatted = new Date(data.generatedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const badge = (h: string) =>
      `<span style="display:inline-block;padding:2px 8px;font-size:10px;letter-spacing:1px;font-weight:700;text-transform:uppercase;${h === "critical" ? "background:#0a0a0a;color:#ffffff;" : "border:1px solid #0a0a0a;color:#0a0a0a;"}">${escapeHtml(h)}</span>`;
    const appBase = process.env.NEXT_PUBLIC_APP_URL || "https://app.ridhzo.com";

    return (
      mtag(`Executive briefing · ${escapeHtml(data.frequency)}`) +
      mh("The platform,<br>at a glance.") +
      mp(`Generated on ${dateFormatted}.`) +
      mkpis([
        { label: "Annual run rate (ARR)", value: `₹${data.revops.arr.toLocaleString()}`, sub: `MRR ₹${data.revops.mrr.toLocaleString()} · ARPU ₹${data.revops.arpu}` },
        { label: "Active tenants", value: String(data.metrics.totalOrgs), sub: `${data.revops.paidAccounts} paid · ${data.revops.freeAccounts} free` },
        { label: "Total leads ingested", value: data.metrics.totalLeads.toLocaleString(), sub: `${data.metrics.totalUsers} active users` },
        { label: "Ops & support", value: data.metrics.dbHealthy ? "Healthy" : "Degraded", sub: `${data.openTicketsCount} open tickets · ${data.metrics.failedDeliveries} DLQ failures` },
      ]) +
      (data.atRiskTenants.length > 0
        ? `<p style="margin:8px 0;font-weight:700;">Retention &amp; churn watchlist (${data.atRiskTenants.length})</p>` +
          mtable(["Tenant", "Plan", "Inactive", "Status"], data.atRiskTenants.map((t) => [`<strong>${escapeHtml(t.name)}</strong>`, escapeHtml(t.plan).toUpperCase(), `${t.daysInactive} days`, badge(t.health)]))
        : mcallout("Zero critical churn risks detected across the active tenant fleet.", "ok")) +
      mbtn("Open SuperAdmin console", `${appBase}/admin`)
    );
  }

  static async sendDigest(customRecipients?: string[]): Promise<{ count: number; recipients: string[] }> {
    const config = await this.getConfig();
    let recipients = customRecipients && customRecipients.length > 0 ? customRecipients : config.recipients;

    // Fallback: If no recipients configured, query superadmins
    if (recipients.length === 0) {
      const superadmins = await db
        .select({ email: users.email })
        .from(users)
        .where(and(eq(users.isSuperAdmin, true), isNull(users.deletedAt)))
        .catch(() => []);
      recipients = superadmins.map((u) => u.email).filter((e): e is string => !!e);
    }

    if (recipients.length === 0) {
      throw new Error("No executive digest recipients configured.");
    }

    const data = await this.buildDigestData();
    const html = this.renderDigestHtml(data);
    const subject = `[Ridhzo Executive] ${config.frequency.toUpperCase()} Briefing: ₹${data.revops.arr.toLocaleString()} ARR • ${data.metrics.totalOrgs} Tenants`;

    let successCount = 0;
    for (const to of recipients) {
      try {
        await sendEmail({ from: "notifications", to, subject, html });
        successCount++;
      } catch (err) {
        console.error(`[ExecutiveDigest] Failed to send digest to ${to}:`, err);
      }
    }

    if (successCount === 0) throw new Error("The digest could not be delivered to any recipient.");
    const now = new Date().toISOString();
    await this.saveConfig({ lastSentAt: now });

    await AuditService.log({
      organizationId: "00000000-0000-0000-0000-000000000000",
      action: "platform.executive_digest_sent",
      entityType: "system",
      metadata: { recipientsCount: successCount, frequency: config.frequency },
    });

    return { count: successCount, recipients };
  }

  // Called by the hourly worker: sends when the schedule is on and the last send is a full period old.
  static async sendDigestIfDue(now = Date.now()): Promise<boolean> {
    const config = await this.getConfig();
    if (!config.enabled) return false;
    const periodMs = (config.frequency === "daily" ? 1 : 7) * 86_400_000;
    // 1h slack so an hourly tick that lands a few minutes early doesn't skip a whole extra period.
    if (config.lastSentAt && now - new Date(config.lastSentAt).getTime() < periodMs - 3_600_000) return false;
    await this.sendDigest();
    return true;
  }

  static async sendTestDigest(targetEmail: string): Promise<boolean> {
    if (!targetEmail.trim()) throw new Error("Target email required for test dispatch.");
    const data = await this.buildDigestData();
    const html = this.renderDigestHtml(data);
    const subject = `[TEST] Ridhzo Platform Executive Digest Preview`;

    await sendEmail({ from: "notifications", to: targetEmail.trim(), subject, html });
    return true;
  }
}
