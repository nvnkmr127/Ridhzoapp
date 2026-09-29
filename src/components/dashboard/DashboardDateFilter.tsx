"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_DASHBOARD_RANGE as DEFAULT_RANGE } from "@/lib/analytics/ranges";

const RANGES = [
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
  { label: "All Time", value: "all" },
];

type Option = { id: string; name: string };

export function DashboardDateFilter({ owners = [], teams = [] }: { owners?: Option[]; teams?: Option[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentRange = searchParams.get("range") || DEFAULT_RANGE;

  const set = (key: string, val: string, dflt: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (val === dflt) params.delete(key);
    else params.set(key, val);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {RANGES.map((r) => (
        <Button key={r.value} variant={currentRange === r.value ? "default" : "outline"} size="sm" onClick={() => set("range", r.value, DEFAULT_RANGE)}>
          {r.label}
        </Button>
      ))}
      {owners.length > 1 && (
        <Select value={searchParams.get("ownerId") ?? "all"} onValueChange={(v) => set("ownerId", v, "all")}>
          <SelectTrigger className="h-9 w-40 text-sm" aria-label="Filter by owner"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {owners.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {teams.length > 0 && (
        <Select value={searchParams.get("teamId") ?? "all"} onValueChange={(v) => set("teamId", v, "all")}>
          <SelectTrigger className="h-9 w-40 text-sm" aria-label="Filter by team"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
