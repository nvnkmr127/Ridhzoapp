"use client";

import * as React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { usePlan } from "@/components/billing/PlanGate";
import { Sparkles, Upload, Globe, Loader2, Trash2, AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import {
  extractDocTextAction, improveAiContextAction, saveAiContextAction, importWebsiteAction, previewAiReplyAction,
  listAiKnowledgeAction, addAiKnowledgeAction, deleteAiKnowledgeAction, listSourceAiContextAction, saveSourceAiContextAction,
} from "@/lib/actions/aiContext";
import {
  PROFILE_FIELDS, TONES, FIELD_MAX, NOTES_MAX, missingFields, normalizeProfile, profileText, type AiProfile, type ProfileTone,
} from "@/lib/ai/businessProfile";

export type AiContextVersion = { at: string; by: string | null; profile: Record<string, unknown>; notes: string | null };
type Known = { name: string; industry?: string | null; city?: string | null; phone?: string | null; website?: string | null; currency?: string | null };
type Doc = { id: string; title: string; chars: number; createdAt: string };
type SourceCtx = { id: string; name: string; aiContext: string };

const SAMPLE_MESSAGE = "Hi, I saw your ad. Can you tell me more and what's the price?";
const LANGUAGES = ["English", "Hindi", "Telugu", "Tamil", "Kannada", "Marathi", "Bengali", "Gujarati", "Malayalam"];

async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  return dataUrl.split(",")[1] ?? "";
}

const when = (iso: string) =>
  new Date(iso).getTime() === 0 ? "Before version history" : new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function AiContextDialog({
  known,
  initialProfile,
  initialNotes,
  initialHistory,
  onSaved,
  children,
}: {
  known: Known;
  initialProfile: unknown;
  initialNotes: string;
  initialHistory: AiContextVersion[];
  onSaved: (saved: { profile: AiProfile; notes: string; history: AiContextVersion[] }, updatedAt: string | null) => void;
  children: React.ReactNode;
}) {
  const { toast } = useToast();
  const { openUpgrade } = usePlan();
  const [open, setOpen] = React.useState(false);
  const [profile, setProfile] = React.useState<AiProfile>(() => normalizeProfile(initialProfile));
  const [notes, setNotes] = React.useState(initialNotes);
  const [busy, setBusy] = React.useState<null | string>(null);
  const [docs, setDocs] = React.useState<Doc[] | null>(null);
  const [sources, setSources] = React.useState<SourceCtx[] | null>(null);
  const [sample, setSample] = React.useState(SAMPLE_MESSAGE);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [newDoc, setNewDoc] = React.useState({ title: "", content: "" });
  const notesFile = React.useRef<HTMLInputElement>(null);
  const docFile = React.useRef<HTMLInputElement>(null);

  // Re-sync whenever the popup reopens with a (possibly newer) saved value; load the side lists once.
  React.useEffect(() => {
    if (!open) return;
    setProfile(normalizeProfile(initialProfile));
    setNotes(initialNotes);
    setPreview(null);
    listAiKnowledgeAction().then((r) => r.ok && setDocs(r.data)).catch(() => setDocs([]));
    listSourceAiContextAction().then((r) => r.ok && setSources(r.data)).catch(() => setSources([]));
  }, [open, initialProfile, initialNotes]);

  const setField = (key: keyof AiProfile, value: unknown) => setProfile((p) => ({ ...p, [key]: value === "" ? undefined : value }));
  const missing = missingFields(profile);

  // Runs one async step with a busy label; failures become a toast instead of a stuck button.
  async function step(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
    } catch {
      toast({ variant: "destructive", title: "Something went wrong", description: "Please try again." });
    } finally {
      setBusy(null);
    }
  }

  const failed = (title: string, res: { code: string; message: string }) =>
    res.code === "LIMIT" ? openUpgrade(res.message) : toast({ variant: "destructive", title, description: res.message });

  // Adds text to "Other notes" without silently losing any: whatever doesn't fit is reported.
  function appendNotes(text: string, from: string) {
    const merged = notes.trim() ? `${notes.trim()}\n\n${text}` : text;
    setNotes(merged.slice(0, NOTES_MAX));
    if (merged.length > NOTES_MAX) {
      toast({
        variant: "destructive",
        title: `Only part of ${from} fit`,
        description: `Other notes hold ${NOTES_MAX} characters. Use "Sort with AI" to condense it, or add the full document under Knowledge.`,
      });
    } else {
      toast({ title: "Text added to Other notes", description: `From ${from}. Use "Sort with AI" to fill the fields.` });
    }
  }

  const onNotesFile = (e: React.ChangeEvent<HTMLInputElement>) => readFile(e, (text, name) => appendNotes(text, name));
  const onDocFile = (e: React.ChangeEvent<HTMLInputElement>) =>
    readFile(e, (text, name, truncated) => {
      setNewDoc({ title: name.replace(/\.[^.]+$/, ""), content: text });
      if (truncated) toast({ variant: "destructive", title: "Document was cut short", description: "Only the first 50,000 characters were read. Split it into two documents." });
    });

  function readFile(e: React.ChangeEvent<HTMLInputElement>, done: (text: string, name: string, truncated: boolean) => void) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast({ variant: "destructive", title: "File too large", description: "Max 10 MB." });
    return step("upload", async () => {
      const res = await extractDocTextAction({ base64: await fileToBase64(file), fileName: file.name });
      if (!res.ok) return failed("Couldn't read file", res);
      done(res.data.text, file.name, res.data.truncated);
    });
  }

  const importWebsite = () =>
    step("website", async () => {
      const res = await importWebsiteAction({ url: known.website ?? "" });
      if (!res.ok) return failed("Couldn't import website", res);
      appendNotes(res.data.text, "your website");
    });

  const improve = () =>
    step("improve", async () => {
      const res = await improveAiContextAction({ profile, notes });
      if (!res.ok) return failed("Couldn't sort with AI", res);
      setProfile(res.data.profile);
      setNotes(res.data.notes);
      toast({ title: "Sorted into fields", description: "Check each field, then Save." });
    });

  const save = () =>
    step("save", async () => {
      const res = await saveAiContextAction({ profile, notes });
      if (!res.ok) return failed("Couldn't save", res);
      onSaved({ profile: res.data.profile, notes: res.data.notes, history: res.data.history }, res.data.updatedAt);
      toast({ title: "Business context saved" });
      setOpen(false);
    });

  const runPreview = () =>
    step("preview", async () => {
      const res = await previewAiReplyAction({ profile, notes, message: sample });
      if (!res.ok) return failed("Couldn't draft a reply", res);
      setPreview(res.data.reply);
    });

  const addDoc = () =>
    step("doc", async () => {
      const res = await addAiKnowledgeAction(newDoc);
      if (!res.ok) return failed("Couldn't add document", res);
      setDocs((d) => [res.data, ...(d ?? [])]);
      setNewDoc({ title: "", content: "" });
    });

  const removeDoc = (id: string) =>
    step(`del-${id}`, async () => {
      const res = await deleteAiKnowledgeAction(id);
      if (!res.ok) return failed("Couldn't remove document", res);
      setDocs((d) => (d ?? []).filter((x) => x.id !== id));
    });

  const saveSource = (s: SourceCtx) =>
    step(`src-${s.id}`, async () => {
      const res = await saveSourceAiContextAction({ id: s.id, text: s.aiContext });
      if (!res.ok) return failed("Couldn't save", res);
      toast({ title: `Saved for ${s.name}` });
    });

  const knownFacts = [
    known.name,
    known.industry,
    known.city,
    known.phone && `phone ${known.phone}`,
    known.website,
    known.currency && `prices in ${known.currency}`,
  ].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Business context for AI</DialogTitle>
          <DialogDescription>
            What AI knows about your business when it drafts replies, sums up leads and writes follow-ups.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          AI already knows from General settings: <span className="text-foreground">{knownFacts}</span>
        </div>
        {missing.length > 0 ? (
          <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Missing: {missing.join(", ")}. Replies will sound generic until these are filled.
          </p>
        ) : (
          <p className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> The key details are filled in.
          </p>
        )}

        <Tabs defaultValue="business">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="business">Business</TabsTrigger>
            <TabsTrigger value="voice">Voice &amp; rules</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
            <TabsTrigger value="sources">By lead source</TabsTrigger>
            <TabsTrigger value="test">Test</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="business" className="space-y-4 pt-2">
            <div className="flex flex-wrap gap-2">
              <input ref={notesFile} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={onNotesFile} />
              <Button type="button" variant="outline" size="sm" className="gap-2" disabled={!!busy} onClick={() => notesFile.current?.click()}>
                {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload brochure
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-2" disabled={!!busy || !known.website} onClick={importWebsite}
                title={known.website ? `Read ${known.website}` : "Add your website in General settings first"}>
                {busy === "website" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Import from website
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-2" disabled={!!busy} onClick={improve}>
                {busy === "improve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Sort with AI
              </Button>
            </div>
            {PROFILE_FIELDS.filter((f) => f.key !== "never").map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`ai-${f.key}`}>{f.label}{"required" in f && f.required ? "" : <span className="text-muted-foreground font-normal"> (optional)</span>}</Label>
                <Textarea id={`ai-${f.key}`} rows={f.key === "faqs" ? 4 : 2} maxLength={FIELD_MAX} placeholder={f.placeholder}
                  value={profile[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="ai-notes">Other notes <span className="text-muted-foreground font-normal">(uploads and website text land here)</span></Label>
              <Textarea id="ai-notes" rows={5} maxLength={NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <p className="text-xs text-muted-foreground text-right">{notes.length}/{NOTES_MAX}</p>
            </div>
          </TabsContent>

          <TabsContent value="voice" className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ai-tone">Tone</Label>
                <select id="ai-tone" value={profile.tone ?? ""} onChange={(e) => setField("tone", e.target.value as ProfileTone)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Let AI decide</option>
                  {(Object.keys(TONES) as ProfileTone[]).map((t) => <option key={t} value={t}>{TONES[t]}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ai-emoji">Emojis in messages</Label>
                <select id="ai-emoji" value={profile.emoji === undefined ? "" : profile.emoji ? "yes" : "no"}
                  onChange={(e) => setField("emoji", e.target.value === "" ? undefined : e.target.value === "yes")}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Only when natural</option>
                  <option value="yes">Yes, a few</option>
                  <option value="no">Never</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ai-lang">Default reply language</Label>
                <Input id="ai-lang" list="ai-lang-list" maxLength={40} value={profile.replyLanguage ?? ""} placeholder="Match the lead (English if unsure)"
                  onChange={(e) => setField("replyLanguage", e.target.value)} />
                <datalist id="ai-lang-list">{LANGUAGES.map((l) => <option key={l} value={l} />)}</datalist>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ai-signoff">Sign off as</Label>
                <Input id="ai-signoff" maxLength={80} value={profile.signoff ?? ""} placeholder={`e.g. Team ${known.name}`} onChange={(e) => setField("signoff", e.target.value)} />
              </div>
            </div>
            {PROFILE_FIELDS.filter((f) => f.key === "never").map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor="ai-never">{f.label}</Label>
                <Textarea id="ai-never" rows={4} maxLength={FIELD_MAX} placeholder={f.placeholder} value={profile.never ?? ""} onChange={(e) => setField("never", e.target.value)} />
                <p className="text-xs text-muted-foreground">AI treats these as hard rules, even if a lead asks otherwise.</p>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="knowledge" className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Price lists, FAQs and brochures too long for the fields. For each lead or question, AI reads only the most relevant parts. Up to 20 documents. These save straight away.
            </p>
            {docs === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : docs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border text-sm">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="truncate">{d.title} <span className="text-xs text-muted-foreground">· {d.chars.toLocaleString("en-IN")} characters</span></span>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${d.title}`} disabled={!!busy} onClick={() => removeDoc(d.id)}>
                      {busy === `del-${d.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">Add a document</span>
                <input ref={docFile} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={onDocFile} />
                <Button type="button" variant="outline" size="sm" className="gap-2" disabled={!!busy} onClick={() => docFile.current?.click()}>
                  {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload PDF / DOCX / TXT
                </Button>
              </div>
              <Input aria-label="Document name" placeholder="Name, e.g. Price list 2026" maxLength={255} value={newDoc.title} onChange={(e) => setNewDoc((d) => ({ ...d, title: e.target.value }))} />
              <Textarea aria-label="Document text" rows={5} placeholder="…or paste the text here" value={newDoc.content} onChange={(e) => setNewDoc((d) => ({ ...d, content: e.target.value }))} />
              <div className="flex justify-end">
                <Button type="button" size="sm" disabled={!!busy || !newDoc.title.trim() || !newDoc.content.trim()} onClick={addDoc}>
                  {busy === "doc" ? "Adding…" : "Add document"}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sources" className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Extra details for leads from one source, e.g. which course or offer that ad was for. Added on top of the business context. Each saves on its own.
            </p>
            {sources === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active lead sources yet.</p>
            ) : (
              sources.map((s) => (
                <div key={s.id} className="space-y-1">
                  <Label htmlFor={`src-${s.id}`}>{s.name}</Label>
                  <div className="flex gap-2">
                    <Textarea id={`src-${s.id}`} rows={2} maxLength={FIELD_MAX} value={s.aiContext} placeholder="e.g. This ad is for the weekend car course, ₹6,000"
                      onChange={(e) => setSources((all) => (all ?? []).map((x) => (x.id === s.id ? { ...x, aiContext: e.target.value } : x)))} />
                    <Button type="button" variant="outline" size="sm" className="shrink-0 self-start" disabled={!!busy} onClick={() => saveSource(s)}>
                      {busy === `src-${s.id}` ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="test" className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">See how AI would reply using what&apos;s on screen now, before you save. Uses 1 AI credit.</p>
            <Label htmlFor="ai-sample">A message from a lead</Label>
            <Textarea id="ai-sample" rows={2} maxLength={500} value={sample} onChange={(e) => setSample(e.target.value)} />
            <Button type="button" variant="outline" size="sm" className="gap-2" disabled={!!busy || !sample.trim()} onClick={runPreview}>
              {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Draft a reply
            </Button>
            {preview && <div className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{preview}</div>}
          </TabsContent>

          <TabsContent value="history" className="space-y-2 pt-2">
            {initialHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved versions yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border text-sm">
                {initialHistory.map((v, i) => (
                  <li key={`${v.at}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium">{when(v.at)}{i === 0 ? " · current" : ""}{v.by ? ` · ${v.by}` : ""}</div>
                      <p className="line-clamp-2 text-xs text-muted-foreground whitespace-pre-wrap">{profileText(normalizeProfile(v.profile), v.notes) || "Empty"}</p>
                    </div>
                    {i > 0 && (
                      <Button type="button" variant="outline" size="sm" className="gap-1 shrink-0" disabled={!!busy}
                        onClick={() => {
                          setProfile(normalizeProfile(v.profile));
                          setNotes(v.notes ?? "");
                          toast({ title: "Version loaded", description: "Check it, then Save to make it current." });
                        }}>
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={!!busy}>Cancel</Button>
          <Button type="button" onClick={save} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
