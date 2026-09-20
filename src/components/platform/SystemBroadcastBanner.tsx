import { PlatformConfigService, type BroadcastConfig } from "@/domains/platform/configService";
import { AlertTriangle, Info, AlertCircle } from "lucide-react";

export async function SystemBroadcastBanner() {
  const broadcast = await PlatformConfigService.get<BroadcastConfig | null>("broadcast", null);
  if (!broadcast || !broadcast.active || !broadcast.message?.trim()) return null;

  const bg =
    broadcast.level === "destructive"
      ? "bg-destructive text-destructive-foreground"
      : broadcast.level === "warning"
      ? "bg-amber-500 text-black font-medium"
      : "bg-primary text-primary-foreground";

  return (
    <div className={`flex items-center justify-center gap-2 px-4 py-1.5 text-center text-xs sm:text-sm ${bg}`}>
      {broadcast.level === "destructive" ? (
        <AlertCircle className="h-4 w-4 shrink-0" />
      ) : broadcast.level === "warning" ? (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      ) : (
        <Info className="h-4 w-4 shrink-0" />
      )}
      <span>{broadcast.message}</span>
    </div>
  );
}
