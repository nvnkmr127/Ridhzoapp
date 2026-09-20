import { PlatformService } from "./service";
import { RevOpsService } from "./revops";
import { InvoiceService } from "@/domains/billing/invoiceService";

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const s = String(val).replace(/"/g, '""');
  return `"${s}"`;
}

export class PlatformExportService {
  static async exportTenantsDirectoryCsv(): Promise<string> {
    const orgs = await PlatformService.listOrganizations();
    const headers = ["ID", "Organization Name", "Slug", "Plan", "Plan Status", "Suspended", "Users", "Leads", "Created At"];
    const rows = orgs.map((o) => [
      escapeCsv(o.id),
      escapeCsv(o.name),
      escapeCsv(o.slug),
      escapeCsv(o.plan),
      escapeCsv(o.planStatus),
      escapeCsv(o.suspended ? "Yes" : "No"),
      escapeCsv(o.userCount),
      escapeCsv(o.leadCount),
      escapeCsv(o.createdAt),
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }

  static async exportFinancialLedgerCsv(): Promise<string> {
    const invoices = await InvoiceService.listInvoices(500);
    const headers = ["Invoice Number", "Organization Name", "Plan", "Base Amount (INR)", "Tax Rate (%)", "Tax Amount (INR)", "Total (INR)", "Status", "Issued At", "Paid At"];
    const rows = invoices.map((i) => [
      escapeCsv(i.invoiceNumber),
      escapeCsv(i.orgName),
      escapeCsv(i.plan),
      escapeCsv(i.amount),
      escapeCsv(i.taxRate),
      escapeCsv(i.taxAmount),
      escapeCsv(i.totalAmount),
      escapeCsv(i.status),
      escapeCsv(i.issuedAt),
      escapeCsv(i.paidAt ?? "—"),
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }

  static async exportChurnRiskCsv(): Promise<string> {
    const list = await RevOpsService.listTenantHealth(200);
    const headers = ["Organization", "Slug", "Plan", "Health Status", "Days Inactive", "Leads", "Users", "AI Credits", "WhatsApp Credits"];
    const rows = list.map((t) => [
      escapeCsv(t.name),
      escapeCsv(t.slug),
      escapeCsv(t.plan),
      escapeCsv(t.health),
      escapeCsv(t.daysInactive),
      escapeCsv(t.leadCount),
      escapeCsv(t.userCount),
      escapeCsv(t.aiCredits),
      escapeCsv(t.whatsappCredits),
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }
}
