"use client"
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { navRoutes, navGroups, superAdminRoutes } from "./nav";

export function Sidebar({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = pathname === "/admin" ? (searchParams.get("tab") || "tenants") : null;

  // Hidden on mobile — the Header's hamburger opens the same nav as an overlay drawer there.
  return (
    <aside className="hidden md:flex flex-col h-full w-64 flex-shrink-0 border-r border-border bg-card">
      <div className="h-14 flex items-center px-6 border-b border-border">
        <span className="text-base font-semibold tracking-tight">Ridhzo</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        {navGroups.map((group) => (
          <div key={group} className="space-y-1">
            <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {group}
            </p>
            {navRoutes.filter((r) => r.group === group).map((route) => {
              const active = pathname === route.href;
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  prefetch={true}
                  className={cn(
                    "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                >
                  <route.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                  {route.label}
                </Link>
              );
            })}
          </div>
        ))}

        {isSuperAdmin && (
          <div className="space-y-1 pt-2 border-t border-border">
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
              SuperAdmin Fleet Ops
            </p>
            {superAdminRoutes.map((route) => {
              const active = pathname === "/admin" && currentTab === route.tab;
              return (
                <Link
                  key={route.tab}
                  href={route.href}
                  prefetch={true}
                  className={cn(
                    "group flex items-center gap-3 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                >
                  <route.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span>{route.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </nav>
    </aside>
  );
}
