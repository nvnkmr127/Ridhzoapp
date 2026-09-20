"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { searchUniversalAction, UniversalSearchResults } from "@/lib/actions/search";
import { Search, Users, LayoutGrid, CalendarClock, Settings, User, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Kanban", href: "/leads/kanban", icon: LayoutGrid },
  { label: "Follow-ups", href: "/follow-ups", icon: CalendarClock },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<UniversalSearchResults>({ leads: [], users: [] });
  const [loading, setLoading] = React.useState(false);

  // Debounced universal search (leads and team members).
  React.useEffect(() => {
    if (query.trim().length < 2) { setResults({ leads: [], users: [] }); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try { setResults(await searchUniversalAction(query)); } catch { setResults({ leads: [], users: [] }); }
      finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  function go(href: string) {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      {/* shouldFilter=false: results come from the server, not cmdk's local fuzzy match. */}
      <CommandInput placeholder="Search leads, team members, or jump to…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{loading ? "Searching…" : "No results."}</CommandEmpty>
        {results.organizations && results.organizations.length > 0 && (
          <CommandGroup heading="Organizations (Platform)">
            {results.organizations.map((org) => (
              <CommandItem
                key={org.id}
                value={`org-${org.id}-${org.name}`}
                onSelect={() => go(`/admin?tab=tenants&q=${encodeURIComponent(org.slug)}`)}
              >
                <Building2 className="mr-2 h-4 w-4 text-primary" />
                <span className="font-medium">{org.name}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">({org.slug})</span>
                <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                  {org.plan}
                </Badge>
                {org.matchedReason && (
                  <span className="ml-auto text-[11px] text-muted-foreground">{org.matchedReason}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.leads.length > 0 && (
          <CommandGroup heading="Leads">
            {results.leads.map((l) => (
              <CommandItem key={l.id} value={`lead-${l.id}`} onSelect={() => go(`/leads/${l.id}`)}>
                <Search className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{l.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{l.email || l.phone || l.company}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.users.length > 0 && (
          <CommandGroup heading="Team Members">
            {results.users.map((u) => (
              <CommandItem key={u.id} value={`user-${u.id}`} onSelect={() => go(`/leads?owner=${u.id}`)}>
                <User className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{u.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {u.roleName ? `${u.roleName} • ${u.email}` : u.email}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          {NAV.map((n) => (
            <CommandItem key={n.href} value={`nav ${n.label}`} onSelect={() => go(n.href)}>
              <n.icon className="mr-2 h-4 w-4 text-muted-foreground" />{n.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
