import { PlatformConfigService } from "./configService";

export interface TenantSecurityPolicy {
  organizationId: string;
  allowedCidrs: string[];
  enforceMfa: boolean;
  sessionMaxAgeHours: number;
  updatedAt?: string;
}

export class SecurityPolicyService {
  private static PREFIX = "sec_policy:";

  static async getPolicy(organizationId: string): Promise<TenantSecurityPolicy> {
    return PlatformConfigService.get<TenantSecurityPolicy>(`${this.PREFIX}${organizationId}`, {
      organizationId,
      allowedCidrs: [],
      enforceMfa: false,
      sessionMaxAgeHours: 8,
    });
  }

  static async setPolicy(
    organizationId: string,
    policy: { allowedCidrs?: string[]; enforceMfa?: boolean; sessionMaxAgeHours?: number }
  ): Promise<TenantSecurityPolicy> {
    const current = await this.getPolicy(organizationId);
    const updated: TenantSecurityPolicy = {
      ...current,
      ...policy,
      organizationId,
      updatedAt: new Date().toISOString(),
    };
    await PlatformConfigService.set(`${this.PREFIX}${organizationId}`, updated);
    return updated;
  }
}
