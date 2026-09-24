"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { runAgentAction } from "@/lib/actions/agent";
import { usePlan } from "@/components/billing/PlanGate";
import { sendWhatsAppAction, sendEmailAction } from "@/lib/actions/messaging";
import { Bot, User, Send, Check, X, Loader2, Sparkles, History, Plus, MessageSquare, Trash2 } from "lucide-react";
import type { AgentProposal } from "@/lib/ai/agent";
import { flattenTurn } from "@/lib/ai/history";

type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; proposals: AgentProposal[] };

interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  turns: Turn[];
  // The lead this chat was started on (pathname-derived at creation). Persisted so reopening the
  // chat later — possibly from a different page — keeps acting on the ORIGINAL lead, not wherever
  // the user happens to be now. undefined = chat had no lead context.
  leadId?: string;
}

// Domain-smart starter prompts — one tap sends them. Keeps users from facing a blank box.
const SUGGESTIONS = [
  "What should I focus on today?",
  "Show hot leads that have gone cold",
  "Which leads haven't been contacted in 7 days?",
  "Draft a follow-up for my newest lead",
];
// When opened on a lead page, the agent already knows the lead — offer actions about "this lead".
const LEAD_SUGGESTIONS = [
  "Draft a follow-up message for this lead",
  "What's the next best action for this lead?",
  "Summarize this lead's activity",
  "Set a reminder to follow up in 3 days",
];

// History lives in localStorage (per-browser). The key is scoped per user so a shared browser never
// shows one account's chats (with lead names/phones/drafts) to the next account that logs in.
// ponytail: no table/migration needed for recent chats; upgrade to a DB-backed store if history
// must sync across devices or a team.
const CONV_KEY_BASE = "assistant-conversations";
const MAX_CONVERSATIONS = 50;

function convKeyFor(storageKey?: string): string {
  return storageKey ? `${CONV_KEY_BASE}:${storageKey}` : CONV_KEY_BASE;
}
function loadConversations(key: string): Conversation[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  } catch {
    return [];
  }
}
function saveConversations(key: string, list: Conversation[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_CONVERSATIONS)));
  } catch {
    /* storage unavailable — history just won't persist */
  }
}

function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { dateStyle: "medium" });
}
function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + Math.random().toString(36).slice(2);
  }
}

export function AiAssistant({ currentLeadId, storageKey }: { currentLeadId?: string; storageKey?: string } = {}) {
  const { toast } = useToast();
  const { openUpgrade } = usePlan();
  const suggestions = currentLeadId ? LEAD_SUGGESTIONS : SUGGESTIONS;
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [aiOff, setAiOff] = React.useState(false);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  // Lead bound to the currently-open saved chat; undefined once activeId is set means "no lead".
  // While the chat is still unsaved (activeId === null) we follow the live pathname (currentLeadId).
  const [activeLeadId, setActiveLeadId] = React.useState<string | undefined>(undefined);
  const [showHistory, setShowHistory] = React.useState(false);
  const scroller = React.useRef<HTMLDivElement>(null);

  const convKey = convKeyFor(storageKey);
  React.useEffect(() => {
    setConversations(loadConversations(convKey));
  }, [convKey]);

  React.useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  // The lead a new turn should act on: a saved chat keeps its original lead; an unsaved chat
  // follows the page the user is on.
  const activeIdRef = React.useRef<string | null>(null);
  activeIdRef.current = activeId;
  const activeLeadIdRef = React.useRef<string | undefined>(undefined);
  activeLeadIdRef.current = activeLeadId;
  function effectiveLeadId(): string | undefined {
    return activeIdRef.current ? activeLeadIdRef.current : currentLeadId;
  }

  // Upsert the current chat into history (creates an id + binds the lead on first save).
  function persist(nextTurns: Turn[], leadId: string | undefined) {
    if (nextTurns.length === 0) return;
    let id = activeIdRef.current;
    if (!id) {
      id = newId();
      setActiveId(id);
      setActiveLeadId(leadId);
    }
    const title = (nextTurns.find((t) => t.role === "user")?.content ?? "New chat").slice(0, 60);
    const conv: Conversation = { id, title, updatedAt: Date.now(), turns: nextTurns, leadId };
    setConversations((prev) => {
      const next = [conv, ...prev.filter((c) => c.id !== id)];
      saveConversations(convKey, next);
      return next;
    });
  }

  // Synchronous re-entrancy guard: a fast double-Enter fires two keydowns before React re-renders
  // `busy`, so both would pass the state check and double-submit. The ref closes that window.
  const sendingRef = React.useRef(false);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || busy || sendingRef.current) return;
    sendingRef.current = true;
    setInput("");
    setBusy(true);
    const leadId = effectiveLeadId();
    const history = turns.map((t) => flattenTurn(t.role, t.content, t.role === "assistant" ? t.proposals : []));
    const withUser: Turn[] = [...turns, { role: "user", content: msg }];
    setTurns(withUser);
    try {
      const res = await runAgentAction(msg, history, leadId);
      if (res.outOfCredits) {
        // Put the question back so it isn't lost, and offer the upgrade.
        setTurns(turns);
        setInput(msg);
        openUpgrade();
        return;
      }
      if (!res.enabled) setAiOff(true);
      const withReply: Turn[] = [...withUser, { role: "assistant", content: res.text || "(no reply)", proposals: res.proposals }];
      setTurns(withReply);
      persist(withReply, leadId);
    } catch {
      toast({ variant: "destructive", title: "Assistant failed", description: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(false);
      sendingRef.current = false;
    }
  }

  async function approve(turnIdx: number, propIdx: number, p: AgentProposal) {
    const res =
      p.channel === "whatsapp"
        ? await sendWhatsAppAction({ leadId: p.leadId, body: p.body })
        : await sendEmailAction({ leadId: p.leadId, subject: `Message for ${p.leadName ?? "you"}`, body: p.body });
    const okResult = res && "ok" in res && res.ok;
    if (okResult) {
      toast({ title: `Sent to ${p.leadName ?? "lead"}` });
      dismiss(turnIdx, propIdx);
    } else {
      toast({ variant: "destructive", title: "Send failed", description: (res as { message?: string })?.message ?? "Unknown error" });
    }
  }

  function dismiss(turnIdx: number, propIdx: number) {
    setTurns((prev) => {
      const next = prev.map((t, i) =>
        i === turnIdx && t.role === "assistant" ? { ...t, proposals: t.proposals.filter((_, j) => j !== propIdx) } : t,
      );
      persist(next, effectiveLeadId());
      return next;
    });
  }

  function newChat() {
    setTurns([]);
    setActiveId(null);
    setActiveLeadId(undefined);
    setInput("");
    setShowHistory(false);
  }

  function openConversation(id: string) {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setTurns(conv.turns);
    setActiveId(id);
    setActiveLeadId(conv.leadId);
    setShowHistory(false);
  }

  function deleteConversation(id: string) {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversations(convKey, next);
      return next;
    });
    if (activeId === id) newChat();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls: history + new chat */}
      <div className="flex items-center justify-between border-b pb-2.5 mb-2">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors ${
            showHistory ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <History className="h-3.5 w-3.5" /> History
        </button>
        <button
          onClick={newChat}
          className="flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 text-muted-foreground hover:bg-muted transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> New chat
        </button>
      </div>

      {showHistory ? (
        <div className="flex-1 overflow-y-auto space-y-2">
          {conversations.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-16">No saved conversations yet.</div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => openConversation(c.id)}
                className="group flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-muted cursor-pointer transition-colors"
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {relativeTime(c.updatedAt)} · {c.turns.filter((t) => t.role === "user").length} message
                    {c.turns.filter((t) => t.role === "user").length === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(c.id);
                  }}
                  aria-label="Delete conversation"
                  className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          <div ref={scroller} className="flex-1 overflow-y-auto space-y-4 pb-4">
            {turns.length === 0 && (
              <div className="py-10 space-y-4">
                <div className="text-center text-sm text-muted-foreground space-y-1.5">
                  <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/60" />
                  <p className="font-medium text-foreground">Your CRM assistant</p>
                  <p>Triage, tag, remind, or draft outreach across your leads.</p>
                </div>
                {!aiOff && (
                  <div className="flex flex-col gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-left text-sm rounded-xl border border-border bg-card px-3.5 py-2.5 hover:bg-muted transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {turns.map((t, i) => (
              <div key={i} className={`flex gap-3 ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                {t.role === "assistant" && (
                  <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className={`max-w-[80%] space-y-3 ${t.role === "user" ? "order-1" : ""}`}>
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                      t.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    {t.content}
                  </div>

                  {t.role === "assistant" &&
                    t.proposals.map((p, j) => (
                      <div key={j} className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                          Draft {p.channel} → {p.leadName ?? "lead"} · needs your approval
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{p.body}</p>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => approve(i, j, p)}>
                            <Check className="h-3.5 w-3.5 mr-1" /> Approve &amp; send
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => dismiss(i, j)}>
                            <X className="h-3.5 w-3.5 mr-1" /> Dismiss
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
                {t.role === "user" && (
                  <div className="h-8 w-8 shrink-0 rounded-full bg-secondary flex items-center justify-center order-2">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div className="flex gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="rounded-2xl px-4 py-2.5 bg-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {aiOff && (
            <div className="border-t pt-3 text-center text-xs text-muted-foreground">
              The assistant isn&apos;t configured on this workspace yet.
            </div>
          )}
          <div className="border-t pt-4 flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={aiOff ? "Assistant unavailable" : "Ask about your leads…"}
              disabled={aiOff}
              className="resize-none min-h-[44px] max-h-32"
              rows={1}
            />
            <Button onClick={() => send()} disabled={busy || aiOff || !input.trim()} size="icon" aria-label="Send message" className="h-11 w-11 shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
