import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared shell for the lead-detail section cards. One home for the card look so it stays
// consistent instead of the wrapper markup being copy-pasted at every call site.
// Monochrome/dark-first: depth comes from a lighter top catch-light hairline (a drop shadow
// is invisible on the near-black page), and the icon sits in a neutral chip — no color.
export function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  className,
  children,
}: {
  icon?: LucideIcon;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode; // right-aligned header control (e.g. an "Add" button)
  className?: string; // override border/bg for accent variants (e.g. priority cards)
  children?: React.ReactNode;
}) {
  const hasHeader = Boolean(Icon || title || action);
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.05)]",
        className,
      )}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                <Icon className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {title}
                </h3>
              )}
            </div>
          </div>
          {action}
        </div>
      )}
      {/* Full width under the title row — beside an action button it got squeezed into a thin column on phones. */}
      {description && <p className="mt-2 text-xs text-muted-foreground">{description}</p>}
      {children && <div className={cn((hasHeader || description) && "mt-4")}>{children}</div>}
    </section>
  );
}
