import { PlatformConfigService } from "./configService";
import { PlatformService, PlatformMetrics } from "./service";
import { RevOpsService, RevOpsMetrics, TenantHealthSummary } from "./revops";
import { SupportTicketService } from "./supportService";
import { sendEmail } from "@/lib/mail/mailer";
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

    const atRiskRows = data.atRiskTenants
      .map(
        (t) => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 12px; font-weight: 600; color: #111827;">${t.name}</td>
          <td style="padding: 10px 12px; color: #4b5563; text-transform: uppercase; font-size: 11px;">${t.plan}</td>
          <td style="padding: 10px 12px; color: #6b7280;">${t.daysInactive} days</td>
          <td style="padding: 10px 12px;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; text-transform: uppercase; background-color: ${
              t.health === "critical" ? "#fee2e2; color: #991b1b;" : "#fef3c7; color: #92400e;"
            }">${t.health}</span>
          </td>
        </tr>`
      )
      .join("");

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ridhzo Platform Executive Digest</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; color: #111827;">
  <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    
    <!-- Header -->
    <div style="background-color: #0f172a; padding: 24px 28px; color: #ffffff;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 600;">Executive Platform Briefing (${data.frequency})</div>
      <h1 style="margin: 6px 0 0 0; font-size: 22px; font-weight: 700; color: #ffffff;">Ridhzo Multi-Tenant Overview</h1>
      <div style="margin-top: 4px; font-size: 12px; color: #cbd5e1;">Generated on ${dateFormatted}</div>
    </div>

    <div style="padding: 24px 28px;">
      <!-- KPI Grid -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b;">Annual Run Rate (ARR)</div>
          <div style="font-size: 24px; font-weight: 800; color: #0f172a; margin-top: 4px;">$${data.revops.arr.toLocaleString()}</div>
          <div style="font-size: 12px; color: #059669; margin-top: 2px;">MRR: $${data.revops.mrr.toLocaleString()} • ARPU: $${data.revops.arpu}</div>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b;">Active Tenants Fleet</div>
          <div style="font-size: 24px; font-weight: 800; color: #0f172a; margin-top: 4px;">${data.metrics.totalOrgs}</div>
          <div style="font-size: 12px; color: #475569; margin-top: 2px;">${data.revops.paidAccounts} Paid • ${data.revops.freeAccounts} Free Tiers</div>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b;">Total Leads Ingested</div>
          <div style="font-size: 24px; font-weight: 800; color: #0f172a; margin-top: 4px;">${data.metrics.totalLeads.toLocaleString()}</div>
          <div style="font-size: 12px; color: #475569; margin-top: 2px;">${data.metrics.totalUsers} Active Team Users</div>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b;">Ops &amp; Support Status</div>
          <div style="font-size: 24px; font-weight: 800; color: ${data.metrics.dbHealthy ? "#059669" : "#dc2626"}; margin-top: 4px;">
            ${data.metrics.dbHealthy ? "Healthy" : "Degraded"}
          </div>
          <div style="font-size: 12px; color: #475569; margin-top: 2px;">${data.openTicketsCount} Open Tickets • ${data.metrics.failedDeliveries} DLQ Failures</div>
        </div>
      </div>

      <!-- At Risk Tenants Warning -->
      ${
        data.atRiskTenants.length > 0
          ? `
      <div style="margin-top: 24px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 14px; font-weight: 700; color: #991b1b;">⚠️ Retention &amp; Churn Watchlist (${data.atRiskTenants.length})</h3>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
              <th style="padding: 8px 12px; font-weight: 600; color: #4b5563;">Tenant</th>
              <th style="padding: 8px 12px; font-weight: 600; color: #4b5563;">Plan</th>
              <th style="padding: 8px 12px; font-weight: 600; color: #4b5563;">Inactivity</th>
              <th style="padding: 8px 12px; font-weight: 600; color: #4b5563;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${atRiskRows}
          </tbody>
        </table>
      </div>`
          : `
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12px; color: #166534;">
        ✓ Zero critical churn risks detected across active tenant fleet.
      </div>`
      }

      <!-- Action Button -->
      <div style="margin-top: 28px; text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://app.ridhzo.com"}/admin" 
           style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 13px;">
          Open SuperAdmin Operations Console →
        </a>
      </div>

    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; border-top: 1px solid #e5e7eb; padding: 16px 28px; text-align: center; font-size: 11px; color: #64748b;">
      Ridhzo Multi-Tenant Platform Engine • Automated Executive Digest
    </div>
  </div>
</body>
</html>
`;
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
      recipients = superadmins.map((u) => u.email).filter(Boolean);
    }

    if (recipients.length === 0) {
      throw new Error("No executive digest recipients configured.");
    }

    const data = await this.buildDigestData();
    const html = this.renderDigestHtml(data);
    const subject = `[Ridhzo Executive] ${config.frequency.toUpperCase()} Briefing: $${data.revops.arr.toLocaleString()} ARR • ${data.metrics.totalOrgs} Tenants`;

    let successCount = 0;
    for (const to of recipients) {
      try {
        await sendEmail({ to, subject, html });
        successCount++;
      } catch (err) {
        console.error(`[ExecutiveDigest] Failed to send digest to ${to}:`, err);
      }
    }

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

  static async sendTestDigest(targetEmail: string): Promise<boolean> {
    if (!targetEmail.trim()) throw new Error("Target email required for test dispatch.");
    const data = await this.buildDigestData();
    const html = this.renderDigestHtml(data);
    const subject = `[TEST] Ridhzo Platform Executive Digest Preview`;

    await sendEmail({ to: targetEmail.trim(), subject, html });
    return true;
  }
}
