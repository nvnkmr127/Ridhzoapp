import Link from "next/link";
import { Flame, AlertTriangle, UserPlus, Snowflake } from "lucide-react";
import { requireOrg } from "@/lib/rbac";
import { SmartSegmentationService, type SmartSegmentKey } from "@/domains/leads/smartSegmentationService";

// Dynamic lead segments as one-tap chips. Links to the closest existing filtered view.
const META: Record<SmartSegmentKey, { icon: typeof Flame; href: string }> = {
  hot_leads: { icon: Flame, href: "/leads/hot" },
  high_value_at_risk: { icon: AlertTriangle, href: "/leads" },
  unassigned_new: { icon: UserPlus, href: "/leads?status=new" },
  stale_high_priority: { icon: Snowflake, href: "/leads/cold" },
};

export async function SmartSegments() {
  const { organizationId } = await requireOrg();
  const { hasPermission } = await import("@/lib/rbac");
  const isAdmin = await hasPermission("settings.manage");
  const segments = (await SmartSegmentationService.getSmartSegments(organizationId)).filter(
    (s) => s.count > 0 && (isAdmin || s.key !== "unassigned_new")
  );
  if (segments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {segments.map((s) => {
        const m = META[s.key];
        const Icon = m?.icon ?? Flame;
        return (
          <Link
            key={s.key}
            href={m?.href ?? "/leads"}
            title={s.description}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-foreground/30 hover:bg-muted/50"
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{s.title}</span>
            <span className="rounded-full bg-muted px-1.5 text-xs font-semibold tabular-nums">{s.count}</span>
          </Link>
        );
      })}
    </div>
  );
}
