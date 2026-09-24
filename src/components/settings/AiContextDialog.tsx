"use client";

import * as React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePlan } from "@/components/billing/PlanGate";
import { Sparkles, Upload, FileText, Loader2 } from "lucide-react";
import { extractDocTextAction, improveAiContextAction, saveAiContextAction } from "@/lib/actions/aiContext";

// A ready-to-edit template so a tenant knows what "good" looks like. Pure client — no AI call.
const SAMPLE = `We are [Business Name], a [industry, e.g. driving school] serving [who your customers are, e.g. new drivers in Austin, TX].

What we offer:
- [Product/service 1 — what it is and who it's for]
- [Product/service 2]
- [Product/service 3]

What makes us different: [your main value proposition in one sentence].

Tone: [e.g. friendly and no-pressure]. Always focus on how we help the customer; never overpromise or invent details.`;

async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  return dataUrl.split(",")[1] ?? "";
}

export function AiContextDialog({
  initial,
  onSaved,
  children,
}: {
  initial: string;
  onSaved: (text: string) => void;
  children: React.ReactNode;
}) {
  const { toast } = useToast();
  const { openUpgrade } = usePlan();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(initial);
  const [busy, setBusy] = React.useState<null | "upload" | "improve" | "save">(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Re-sync the buffer whenever the popup reopens with a (possibly newer) saved value.
  React.useEffect(() => {
    if (open) setText(initial);
  }, [open, initial]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: "destructive", title: "File too large", description: "Max 10 MB." });
      return;
    }
    setBusy("upload");
    try {
      const base64 = await fileToBase64(file);
      const res = await extractDocTextAction({ base64, fileName: file.name });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't read file", description: res.message });
        return;
      }
      setText((t) => (t.trim() ? `${t.trim()}\n\n${res.data.text}` : res.data.text));
      toast({ title: "Text extracted", description: `Pulled ${res.data.text.length} characters from ${file.name}.` });
    } catch {
      toast({ variant: "destructive", title: "Couldn't read file", description: "Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function improve() {
    if (!text.trim()) return;
    setBusy("improve");
    try {
      const res = await improveAiContextAction({ draft: text });
      if (!res.ok) {
        if (res.code === "LIMIT") return openUpgrade(res.message);
        toast({ variant: "destructive", title: "Improve failed", description: res.message });
        return;
      }
      setText(res.data.improved);
      toast({ title: "Improved with AI", description: "Review the rewrite, then Save." });
    } catch {
      toast({ variant: "destructive", title: "Improve failed", description: "Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    try {
      const res = await saveAiContextAction({ text });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't save", description: res.message });
        return;
      }
      onSaved(res.data.text);
      toast({ title: "Business context saved" });
      setOpen(false);
    } catch {
      toast({ variant: "destructive", title: "Couldn't save", description: "Please try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Business context for AI</DialogTitle>
          <DialogDescription>
            Describe what your business sells so AI drafts, recaps, and sequences speak as you — instead of guessing from the lead. Upload a document, paste text, or start from a sample.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={onFile} />
          <Button type="button" variant="outline" size="sm" className="gap-2" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload PDF / DOCX / TXT
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" disabled={!!busy} onClick={() => setText(SAMPLE)}>
            <FileText className="h-4 w-4" /> Sample format
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" disabled={!!busy || !text.trim()} onClick={improve}>
            {busy === "improve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Improve with AI
          </Button>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          maxLength={4000}
          placeholder="Describe your business, products/services, customers, and tone…"
        />
        <p className="text-xs text-muted-foreground text-right">{text.length}/4000</p>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={!!busy}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={!!busy}>
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
