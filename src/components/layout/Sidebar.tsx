"use client"
import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { visibleRoutes, navGroups, superAdminRoutes } from "./nav";

function SuperAdminNavLinks({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams();
  const currentTab = pathname === "/admin" ? (searchParams.get("tab") || "tenants") : null;

  return (
    <>
      {superAdminRoutes.map((route) => {
        const active = pathname === "/admin" && currentTab === route.tab;
        return (
          <Link
            key={route.tab}
            href={route.href}
            prefetch={false}
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
    </>
  );
}


export function Sidebar({
  isSuperAdmin = false,
  plan,
  allowed = [],
}: {
  isSuperAdmin?: boolean;
  plan?: string;
  /** Permissions the user holds that gate nav items (see nav.ts `permission`). */
  allowed?: string[];
}) {
  const pathname = usePathname();

  // Hidden on mobile — the Header's hamburger opens the same nav as an overlay drawer there.
  return (
    <aside className="hidden md:flex flex-col h-full w-64 flex-shrink-0 border-r border-border bg-card">
      <div className="h-14 flex items-center justify-between px-5 border-b border-border">
        <Link href="/leads" className="flex items-center gap-2">
          {plan === "starter" ? (
            <Image
              src="/logos/Ridhzo-Logo-Final_Horizontal-Light-Starter.png"
              alt="Ridhzo Starter"
              width={125}
              height={30}
              className="h-6 w-auto object-contain"
              priority
            />
          ) : plan === "unlimited" || plan === "business" ? (
            <Image
              src="/logos/Ridhzo-Logo-Final_Horizontal-Light-Unlimited.png"
              alt="Ridhzo Unlimited"
              width={135}
              height={30}
              className="h-6 w-auto object-contain"
              priority
            />
          ) : (
            <Image
              src="/logos/Ridhzo-Logo-Final_Horizontal-Light.png"
              alt="Ridhzo"
              width={100}
              height={30}
              className="h-6 w-auto object-contain"
              priority
            />
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        {navGroups.map((group) => (
          <div key={group} className="space-y-1">
            <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {group}
            </p>
            {visibleRoutes(allowed, isSuperAdmin).filter((r) => r.group === group).map((route) => {
              const active = pathname === route.href;
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  prefetch={false}
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
            <React.Suspense fallback={null}>
              <SuperAdminNavLinks pathname={pathname} />
            </React.Suspense>
          </div>
        )}
      </nav>

      {plan !== "unlimited" && plan !== "business" && (
        <div className="p-3 border-t border-border">
          <Link href="/settings/billing" className="block w-full transition-transform hover:scale-[1.02]">
            <Image 
              src="/Plan_Card.svg" 
              alt="Upgrade to Unlimited Plan"
              width={250}
              height={140}
              className="w-full h-auto"
            />
          </Link>
        </div>
      )}
    </aside>
  );
}
