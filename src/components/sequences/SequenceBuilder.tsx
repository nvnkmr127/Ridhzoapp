"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePlan } from "@/components/billing/PlanGate";
import { generateSequenceAction, type GeneratedSequenceStep } from "@/lib/actions/ai";
import { createSequenceAction, updateSequenceAction } from "@/lib/actions/sequences";

type Step = GeneratedSequenceStep & { attachmentUrl?: string | null; attachmentName?: string | null };

const BLANK: Step = { dayOffset: 0, channel: "whatsapp", body: "", attachmentUrl: "", attachmentName: "" };

export function SequenceBuilder({ initial }: { initial?: { id: string; name: string; description?: string; steps: Step[] } }) {
  const router = useRouter();
  const { toast } = useToast();
  const { aiAllowed, openUpgrade } = usePlan();
  const [name, setName] = React.useState(initial?.name ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [goal, setGoal] = React.useState("");
  const [steps, setSteps] = React.useState<Step[]>(initial?.steps?.length ? initial.steps : [{ ...BLANK }]);
  const [generating, setGenerating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  function setStep(i: number, patch: Partial<Step>) {
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  }

  async function generate() {
    if (!aiAllowed) return openUpgrade();
    const cleanGoal = goal.trim();
    if (!cleanGoal) {
      toast({
        variant: "destructive",
        title: "Please describe your goal first",
        description: "Enter what you want this sequence to achieve (e.g. 'Follow up after product demo').",
      });
      return;
    }

    setGenerating(true);
    try {
      const { steps: gen, ai } = await generateSequenceAction(cleanGoal);
      if (gen && gen.length > 0) {
        setSteps(gen);
        if (!name.trim()) setName(cleanGoal.slice(0, 60));
        toast({
          title: ai ? "AI drafted your sequence" : "Sequence drafted from your goal",
          description: `${gen.length} steps created. You can customize them below before saving.`,
        });
      }
    } catch {
      toast({ variant: "destructive", title: "Couldn't generate", description: "Please try again." });
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    const clean = steps.filter((s) => s.body.trim());
    if (!name.trim() || clean.length === 0) {
      toast({ variant: "destructive", title: "Name and at least one step with text are required" });
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), description: description.trim() || null, steps: clean };
      const res = initial?.id
        ? await updateSequenceAction(initial.id, payload)
        : await createSequenceAction(payload);
      if (!res.ok) {
        if (res.code === "LIMIT") return openUpgrade(res.message);
        toast({ variant: "destructive", title: "Couldn't save", description: res.message });
        return;
      }
      if (initial?.id) {
        toast({ title: "Sequence updated" });
        router.push("/sequences");
      } else {
        toast({ title: "Sequence saved" });
        setName(""); setGoal(""); setDescription(""); setSteps([{ ...BLANK }]);
        router.refresh();
      }
    } catch {
      toast({ variant: "destructive", title: "Couldn't save", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <h3 className="text-lg font-medium">{initial?.id ? "Edit sequence" : "New sequence"}</h3>

      <div className="space-y-2">
        <Label htmlFor="seq-name">Name</Label>
        <Input id="seq-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New lead nurture" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="seq-desc">Description (optional)</Label>
        <Input id="seq-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this sequence is for" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="seq-goal">Describe the goal (AI will draft the steps)</Label>
        <div className="flex gap-2">
          <Input id="seq-goal" value={goal} onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Nurture a new insurance lead over a week toward a call" />
          <Button type="button" variant="outline" onClick={generate} disabled={generating} className="gap-2 shrink-0">
            <Sparkles className="h-4 w-4" /> {generating ? "Drafting…" : "Generate"}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <Label>Steps</Label>
        {steps.some((s) => s.channel === "whatsapp") && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            WhatsApp steps require the WhatsApp Business API. In personal mode they&apos;re logged as manual reminders instead of auto-sent.
          </p>
        )}
        {steps.map((s, i) => (
          <div key={i} className="rounded-2xl border p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Day</span>
              <Input type="number" min={0} value={s.dayOffset}
                onChange={(e) => setStep(i, { dayOffset: Math.max(0, Number(e.target.value) || 0) })}
                className="w-20" />
              <Select value={s.channel} onValueChange={(v) => setStep(i, { channel: v === "email" ? "email" : "whatsapp" })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
              {steps.length > 1 && (
                <Button type="button" variant="ghost" size="icon" aria-label="Remove step" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => setSteps((st) => st.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Textarea value={s.body} onChange={(e) => setStep(i, { body: e.target.value })}
              placeholder="Message… {{first_name}} is filled in automatically." className="min-h-[70px]" />
            <div className="flex flex-col sm:flex-row gap-2">
              <Input value={s.attachmentName ?? ""} onChange={(e) => setStep(i, { attachmentName: e.target.value })}
                placeholder="Attachment label (e.g. Brochure)" className="sm:w-56" />
              <Input value={s.attachmentUrl ?? ""} onChange={(e) => setStep(i, { attachmentUrl: e.target.value })}
                placeholder="Attachment link (https://…)" className="flex-1" />
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setSteps((s) => [...s, { ...BLANK, dayOffset: (s.at(-1)?.dayOffset ?? 0) + 2 }])} className="gap-2">
          <Plus className="h-4 w-4" /> Add step
        </Button>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "Saving…" : initial?.id ? "Update sequence" : "Save sequence"}
        </Button>
      </div>
    </div>
  );
}
