"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getStatusPlaybooksAction, getTenantStatusSchemaAction, setStatusPlaybooksAction } from "@/lib/actions/customStatuses";
import { PLAYBOOK_MAX_CHARS } from "@/lib/leads/statusPlaybooks";
import { useToast } from "@/hooks/use-toast";

type Status = { key: string; label: string; color: string };

// A few lines per status telling the AI how this team works leads in it. Every lead AI feature
// (recap + suggestions, reply drafts, assistant) follows the playbook of the lead's current status.
export function StatusPlaybooksEditor() {
  const { toast } = useToast();
  const [statuses, setStatuses] = React.useState<Status[]>([]);
  const [books, setBooks] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    Promise.all([getTenantStatusSchemaAction(), getStatusPlaybooksAction()])
      .then(([st, pb]) => {
        setStatuses([...st].sort((a, b) => a.orderIndex - b.orderIndex));
        setBooks(pb);
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await setStatusPlaybooksAction(books);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Playbooks not saved", description: res.message });
        return;
      }
      setBooks(res.data);
      toast({ title: "AI playbooks saved" });
    } catch {
      toast({ variant: "destructive", title: "Playbooks not saved", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  if (statuses.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">AI playbook for each status</h3>
        <p className="text-xs text-muted-foreground">
          How your team handles a lead in each status. The AI follows it for recaps, suggestions, drafted messages and the
          assistant — e.g. “Site visit booked: confirm the day before, send the location pin, ask who is coming.” Leave blank
          for none.
        </p>
      </div>
      <div className="space-y-3">
        {statuses.map((st) => (
          <label key={st.key} className="block space-y-1">
            <span className="flex items-center gap-2 text-xs font-medium">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: st.color }} />
              {st.label}
            </span>
            <Textarea
              value={books[st.key] ?? ""}
              onChange={(e) => setBooks((b) => ({ ...b, [st.key]: e.target.value }))}
              maxLength={PLAYBOOK_MAX_CHARS}
              rows={2}
              placeholder={`What should happen with a lead in “${st.label}”?`}
              className="text-sm"
            />
          </label>
        ))}
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save playbooks"}
        </Button>
      </div>
    </div>
  );
}
