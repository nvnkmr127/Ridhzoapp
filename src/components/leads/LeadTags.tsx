"use client"
import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { X } from "lucide-react"
import { listTagsAction, addTagAction, removeTagAction } from "@/lib/actions/tags"

type Tag = { id: string; name: string };

export function LeadTags({ leadId, initialTags }: { leadId: string; initialTags: Tag[] }) {
  const { toast } = useToast();
  const [tags, setTags] = React.useState<Tag[]>(initialTags);
  const [all, setAll] = React.useState<Tag[]>([]);
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [hasFetchedAll, setHasFetchedAll] = React.useState(false);

  const ensureAllTags = React.useCallback(() => {
    if (hasFetchedAll) return;
    setHasFetchedAll(true);
    listTagsAction().then((r) => setAll(r as Tag[])).catch(() => {});
  }, [hasFetchedAll]);

  async function add() {
    const name = value.trim();
    if (!name || busy) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) { setValue(""); return; }
    setBusy(true);
    try {
      const tag = await addTagAction(leadId, name);
      setTags((t) => [...t, tag]);
      setValue("");
    } catch {
      toast({ variant: "destructive", title: "Could not add tag" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const prev = tags;
    setTags((t) => t.filter((x) => x.id !== id));
    try {
      await removeTagAction(leadId, id);
    } catch {
      setTags(prev);
      toast({ variant: "destructive", title: "Could not remove tag" });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && <span className="text-muted-foreground text-xs">No tags</span>}
        {tags.map((t) => (
          <Badge key={t.id} variant="secondary" className="gap-0.5 py-0.5 pr-0.5">
            {t.name}
            {/* Padded hit area — the bare 12px × was too small to tap on a phone. */}
            <button onClick={() => remove(t.id)} aria-label={`Remove ${t.name}`} className="-my-1 rounded-full p-1.5 hover:bg-muted hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </Badge>
        ))}
      </div>
      {/* Phone keyboards show "Go", not "Enter" — so there's a visible Add button too. */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
      <Input
        value={value}
        list="tag-suggestions"
        placeholder="Add a tag, e.g. Hot, Site visit done"
        enterKeyHint="done"
        onFocus={ensureAllTags}
        onChange={(e) => {
          ensureAllTags();
          setValue(e.target.value);
        }}
        className="h-9 text-sm"
      />
        <Button type="submit" variant="outline" size="sm" className="h-9 shrink-0" disabled={!value.trim()}>
          Add
        </Button>
      </form>
      <datalist id="tag-suggestions">
        {all.map((t) => <option key={t.id} value={t.name} />)}
      </datalist>
    </div>
  );
}
