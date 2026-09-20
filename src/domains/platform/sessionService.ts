import { PlatformConfigService } from "./configService";
import { AuditService } from "@/domains/audit/service";

export class SessionService {
  static async revokeUserSessions(userId: string, superAdminId?: string): Promise<string> {
    const revokedAt = new Date().toISOString();
    await PlatformConfigService.set(`revoked_user:${userId}`, revokedAt);

    await AuditService.log({
      organizationId: "00000000-0000-0000-0000-000000000000",
      userId: superAdminId,
      action: "security.user_sessions_revoked",
      entityType: "user",
      entityId: userId,
      metadata: { revokedAt },
    });

    return revokedAt;
  }

  static async revokeOrgSessions(orgId: string, superAdminId?: string): Promise<string> {
    const revokedAt = new Date().toISOString();
    await PlatformConfigService.set(`revoked_org:${orgId}`, revokedAt);

    await AuditService.log({
      organizationId: orgId,
      userId: superAdminId,
      action: "security.org_sessions_revoked",
      entityType: "organization",
      entityId: orgId,
      metadata: { revokedAt },
    });

    return revokedAt;
  }

  static async isRevoked(userId: string, orgId?: string, tokenIssuedAtMs?: number): Promise<boolean> {
    if (!tokenIssuedAtMs) return false;

    const userRevoked = await PlatformConfigService.get<string | null>(`revoked_user:${userId}`, null);
    if (userRevoked && new Date(userRevoked).getTime() > tokenIssuedAtMs) {
      return true;
    }

    if (orgId) {
      const orgRevoked = await PlatformConfigService.get<string | null>(`revoked_org:${orgId}`, null);
      if (orgRevoked && new Date(orgRevoked).getTime() > tokenIssuedAtMs) {
        return true;
      }
    }

    return false;
  }
}
