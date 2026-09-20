import { PlatformConfigService } from "./configService";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AuditService } from "@/domains/audit/service";

export interface CustomDomainRecord {
  id: string;
  orgId: string;
  orgName: string;
  domain: string;
  cnameTarget: string;
  sslStatus: "active" | "pending" | "failed";
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

const CONFIG_KEY = "tenant_custom_domains";
const DEFAULT_CNAME_TARGET = "cname.ridhzo.com";

export class CustomDomainService {
  static async listDomains(): Promise<CustomDomainRecord[]> {
    return PlatformConfigService.get<CustomDomainRecord[]>(CONFIG_KEY, []);
  }

  static async registerDomain(orgId: string, domain: string): Promise<CustomDomainRecord> {
    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!cleanDomain || !cleanDomain.includes(".")) {
      throw new Error("Enter a valid Fully Qualified Domain Name (e.g. crm.yourcompany.com).");
    }

    const list = await this.listDomains();
    if (list.some((d) => d.domain === cleanDomain && d.orgId !== orgId)) {
      throw new Error(`Domain "${cleanDomain}" is already registered to another organization.`);
    }

    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)).limit(1);

    const existingIdx = list.findIndex((d) => d.orgId === orgId && d.domain === cleanDomain);
    const now = new Date().toISOString();

    const record: CustomDomainRecord = {
      id: existingIdx >= 0 ? list[existingIdx].id : `dom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      orgId,
      orgName: org?.name ?? "Unknown Organization",
      domain: cleanDomain,
      cnameTarget: DEFAULT_CNAME_TARGET,
      sslStatus: "pending",
      verified: false,
      createdAt: existingIdx >= 0 ? list[existingIdx].createdAt : now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      list[existingIdx] = record;
    } else {
      list.unshift(record);
    }

    await PlatformConfigService.set(CONFIG_KEY, list);

    await AuditService.log({
      organizationId: orgId,
      action: "platform.custom_domain_registered",
      entityType: "organization",
      entityId: orgId,
      metadata: { domain: cleanDomain },
    });

    return record;
  }

  static async verifyDomain(id: string): Promise<CustomDomainRecord | null> {
    const list = await this.listDomains();
    const record = list.find((d) => d.id === id);
    if (!record) return null;

    // Simulate DNS CNAME lookup / SSL provisioning
    record.verified = true;
    record.sslStatus = "active";
    record.updatedAt = new Date().toISOString();

    await PlatformConfigService.set(CONFIG_KEY, list);
    return record;
  }

  static async removeDomain(id: string): Promise<boolean> {
    const list = await this.listDomains();
    const filtered = list.filter((d) => d.id !== id);
    await PlatformConfigService.set(CONFIG_KEY, filtered);
    return filtered.length < list.length;
  }

  static async resolveDomain(domain: string): Promise<string | null> {
    const clean = domain.trim().toLowerCase();
    const list = await this.listDomains();
    const match = list.find((d) => d.domain === clean && d.verified);
    return match ? match.orgId : null;
  }
}
