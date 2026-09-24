"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MEETING_MODES } from "@/domains/meetings/format";

// Mode + attendee filters for the Meetings page, kept in the URL so views are shareable.
export function MeetingsFilters({ users }: { users: { id: string; name: string }[] | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={params.get("mode") ?? "all"} onValueChange={(v) => setParam("mode", v)}>
        <SelectTrigger className="h-9 w-[170px] text-sm" aria-label="Meeting type"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {Object.entries(MEETING_MODES).map(([k, label]) => (
            <SelectItem key={k} value={k}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {users && (
        <Select value={params.get("assignee") ?? "all"} onValueChange={(v) => setParam("assignee", v)}>
          <SelectTrigger className="h-9 w-[170px] text-sm" aria-label="Attendee"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
