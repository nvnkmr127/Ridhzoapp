"use client"
import { useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";
import { visibleRoutes, navGroups, superAdminRoutes } from "./nav";
import { useT } from "@/components/LanguageProvider";

function MobileSuperAdminNavLinks({
  pathname,
  onClose,
}: {
  pathname: string;
  onClose: () => void;
}) {
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
            onClick={onClose}
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

// Hamburger + slide-in nav drawer for mobile. Hidden on md+ (the fixed Sidebar takes over there).
export function MobileSidebar({ isSuperAdmin = false, plan, allowed = [] }: { isSuperAdmin?: boolean; plan?: string; allowed?: string[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const t = useT();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="md:hidden -ml-1 flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-accent"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/70 animate-in fade-in-0" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-border bg-card animate-in slide-in-from-left duration-200">
            <div className="flex h-14 items-center justify-between px-6 border-b border-border">
              <Link href="/leads" onClick={() => setOpen(false)} className="flex items-center">
                {plan === "starter" ? (
                  <Image
                    src="/logos/Ridhzo-Logo-Final_Horizontal-Light-Starter.png"
                    alt="Ridhzo Starter"
                    width={130}
                    height={32}
                    className="h-7 w-auto object-contain"
                    priority
                  />
                ) : plan === "unlimited" || plan === "business" ? (
                  <Image
                    src="/logos/Ridhzo-Logo-Final_Horizontal-Light-Unlimited.png"
                    alt="Ridhzo Unlimited"
                    width={140}
                    height={32}
                    className="h-7 w-auto object-contain"
                    priority
                  />
                ) : (
                  <Image
                    src="/logos/Ridhzo-Logo-Final_Horizontal-Light.png"
                    alt="Ridhzo"
                    width={110}
                    height={32}
                    className="h-7 w-auto object-contain"
                    priority
                  />
                )}
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
              {navGroups.map((group) => (
                <div key={group} className="space-y-1">
                  <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    {t(group)}
                  </p>
                  {visibleRoutes(allowed, isSuperAdmin).filter((r) => r.group === group).map((route) => {
                    const active = pathname === route.href;
                    return (
                      <Link
                        key={route.href}
                        href={route.href}
                        prefetch={false}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                        )}
                      >
                        <route.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                        {t(route.label)}
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
                  <Suspense fallback={null}>
                    <MobileSuperAdminNavLinks pathname={pathname} onClose={() => setOpen(false)} />
                  </Suspense>
                </div>
              )}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
