"use client";

import * as React from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { draftLeadReplyAction } from "@/lib/actions/ai";
import { useToast } from "@/hooks/use-toast";

const TONES = [
  { key: "friendly", label: "Friendly" },
  { key: "professional", label: "Professional" },
  { key: "short", label: "Short" },
] as const;
const LANGUAGES = ["auto", "English", "Hindi", "Hinglish", "Tamil", "Telugu", "Kannada", "Malayalam", "Marathi", "Bengali", "Gujarati", "Arabic"];
const PREFS_KEY = "ridhzo_ai_draft_prefs";

type Tone = (typeof TONES)[number]["key"];

// "Draft with AI" + tone/language, shared by the WhatsApp and Email tabs. The rep's tone/language
// choice is remembered per browser. After a draft, the button becomes "Regenerate".
export function AiDraftControls({
  leadId,
  channel,
  onDraft,
  disabled,
}: {
  leadId: string;
  channel: "whatsapp" | "email";
  onDraft: (d: { draft: string; subject?: string }) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [tone, setTone] = React.useState<Tone>("friendly");
  const [language, setLanguage] = React.useState("auto");
  const [drafting, setDrafting] = React.useState(false);
  const [drafted, setDrafted] = React.useState(false);

  React.useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      if (TONES.some((t) => t.key === p.tone)) setTone(p.tone);
      if (LANGUAGES.includes(p.language)) setLanguage(p.language);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const remember = (next: { tone?: Tone; language?: string }) => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ tone, language, ...next }));
    } catch {
      /* storage unavailable */
    }
  };

  async function draft() {
    setDrafting(true);
    try {
      const res = await draftLeadReplyAction({ leadId, channel, tone, language });
      onDraft(res);
      setDrafted(true);
      toast({
        title: res.ai ? "AI draft ready" : "Draft ready",
        description: res.ai ? "Based on their answers and your conversation — review before sending." : "AI isn't set up, so this is a standard template. Edit before sending.",
      });
    } catch {
      toast({ variant: "destructive", title: "Couldn't draft a message", description: "Please try again." });
    } finally {
      setDrafting(false);
    }
  }

  const selectCls = "h-9 rounded-md border border-input bg-background px-2 text-xs";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" onClick={draft} disabled={drafting || disabled} className="gap-2">
        {drafted ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        {drafting ? "Drafting…" : drafted ? "Regenerate" : "Draft with AI"}
      </Button>
      <select
        aria-label="Tone"
        className={selectCls}
        value={tone}
        onChange={(e) => {
          setTone(e.target.value as Tone);
          remember({ tone: e.target.value as Tone });
        }}
      >
        {TONES.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Language"
        className={selectCls}
        value={language}
        onChange={(e) => {
          setLanguage(e.target.value);
          remember({ language: e.target.value });
        }}
      >
        {LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {l === "auto" ? "Match lead's language" : l}
          </option>
        ))}
      </select>
    </div>
  );
}
