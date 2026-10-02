import "server-only";

// Platform maintenance mode (set from the super-admin console). The dashboard layout shows the lock screen;
// this is the SAME switch enforced where changes actually happen — server actions and /api/v1 writes — so
// "maintenance" can't be bypassed by a stale tab, the mobile app or an API client.
export async function maintenanceMessage(): Promise<string | null> {
  try {
    const { PlatformConfigService } = await import("@/domains/platform/configService");
    const m = await PlatformConfigService.getGlobalCached<{ enabled: boolean; message: string }>("maintenance_mode", { enabled: false, message: "" });
    return m.enabled ? m.message || "Ridhzo is undergoing maintenance. Please try again shortly." : null;
  } catch {
    return null; // never lock tenants out because the config read failed
  }
}
