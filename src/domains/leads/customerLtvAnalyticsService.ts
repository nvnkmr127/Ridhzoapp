import { db } from "@/db";
import { leads } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface VipCustomerSummary {
  clientName: string;
  phone: string | null;
  email: string | null;
  totalWonDeals: number;
  totalLtv: number;
}

export interface CustomerLtvAnalytics {
  totalUniqueCustomers: number;
  repeatCustomerCount: number;
  repeatRatePercentage: number;
  avgCustomerLtv: number;
  topVipCustomers: VipCustomerSummary[];
}

export class CustomerLtvAnalyticsService {
  /**
   * Calculates Customer Lifetime Value (LTV), repeat deal frequency, and VIP client rankings.
   */
  static async getLtvAnalytics(
    organizationId: string,
    preloadedLeads?: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      status: string;
      expectedValue: string | null;
    }[]
  ): Promise<CustomerLtvAnalytics> {
    const wonLeads = preloadedLeads
      ? preloadedLeads.filter((l) => l.status === "won")
      : await db
          .select({
            id: leads.id,
            name: leads.name,
            phone: leads.phone,
            email: leads.email,
            expectedValue: leads.expectedValue,
          })
          .from(leads)
          .where(and(eq(leads.organizationId, organizationId), eq(leads.status, "won")));

    if (wonLeads.length === 0) {
      return {
        totalUniqueCustomers: 0,
        repeatCustomerCount: 0,
        repeatRatePercentage: 0,
        avgCustomerLtv: 0,
        topVipCustomers: [],
      };
    }

    const customerMap: Record<
      string,
      { name: string; phone: string | null; email: string | null; deals: number; ltv: number }
    > = {};

    for (const lead of wonLeads) {
      const key = (lead.phone || lead.email || lead.id).trim().toLowerCase();
      if (!customerMap[key]) {
        customerMap[key] = {
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          deals: 0,
          ltv: 0,
        };
      }

      customerMap[key].deals += 1;
      const val = Number(lead.expectedValue ?? 0);
      customerMap[key].ltv += isNaN(val) ? 0 : val;
    }

    const customers = Object.values(customerMap);
    const totalUniqueCustomers = customers.length;
    let repeatCustomerCount = 0;
    let totalLtvSum = 0;

    const vipSummaries: VipCustomerSummary[] = [];

    for (const c of customers) {
      if (c.deals > 1) repeatCustomerCount++;
      totalLtvSum += c.ltv;

      vipSummaries.push({
        clientName: c.name,
        phone: c.phone,
        email: c.email,
        totalWonDeals: c.deals,
        totalLtv: Math.round(c.ltv * 100) / 100,
      });
    }

    const repeatRatePercentage =
      totalUniqueCustomers > 0 ? Math.round((repeatCustomerCount / totalUniqueCustomers) * 1000) / 10 : 0;

    const avgCustomerLtv =
      totalUniqueCustomers > 0 ? Math.round((totalLtvSum / totalUniqueCustomers) * 100) / 100 : 0;

    vipSummaries.sort((a, b) => b.totalLtv - a.totalLtv || b.totalWonDeals - a.totalWonDeals);

    return {
      totalUniqueCustomers,
      repeatCustomerCount,
      repeatRatePercentage,
      avgCustomerLtv,
      topVipCustomers: vipSummaries.slice(0, 10),
    };
  }
}
