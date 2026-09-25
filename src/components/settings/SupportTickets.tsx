"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusMessage, type Status } from "@/components/ui/status-message";
import { useToast } from "@/hooks/use-toast";
import { createSupportTicketAction, replyMySupportTicketAction, type listMySupportTicketsAction } from "@/lib/actions/support";

type Ticket = Awaited<ReturnType<typeof listMySupportTicketsAction>>[number];

const CATEGORIES = [
  { value: "technical", label: "Something isn't working" },
  { value: "billing", label: "Billing or plan" },
  { value: "feature_request", label: "Feature request" },
  { value: "urgent", label: "Urgent — work is blocked" },
] as const;
const STATUS: Record<Ticket["status"], string> = { open: "Waiting for us", in_progress: "In progress", resolved: "Resolved" };

export function SupportTickets({ initial }: { initial: Ticket[] }) {
  const { toast } = useToast();
  const [tickets, setTickets] = React.useState(initial);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]["value"]>("technical");
  const [status, setStatus] = React.useState<Status>(null);
  const [busy, setBusy] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [reply, setReply] = React.useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await createSupportTicketAction({ subject, body, category });
      if (!res.ok) return setStatus({ kind: "error", text: res.message });
      setTickets((t) => [res.data, ...t]);
      setSubject(""); setBody(""); setCategory("technical");
      toast({ title: "Ticket sent", description: "We'll reply here and notify you." });
    } catch {
      setStatus({ kind: "error", text: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(id: string) {
    setBusy(true);
    try {
      const res = await replyMySupportTicketAction(id, reply);
      if (!res.ok) return toast({ variant: "destructive", title: "Couldn't send", description: res.message });
      setTickets((t) => t.map((x) => (x.id === id ? res.data : x)));
      setReply("");
    } catch {
      toast({ variant: "destructive", title: "Couldn't send", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="space-y-3 rounded-2xl border bg-card p-5">
        <h3 className="font-semibold">New request</h3>
        <StatusMessage status={status} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="st-subject">Subject</Label>
            <Input id="st-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="st-category">Type</Label>
            <select id="st-category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="st-body">What do you need help with?</Label>
          <Textarea id="st-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || !subject.trim() || !body.trim()}>{busy ? "Sending…" : "Send request"}</Button>
        </div>
      </form>

      <div className="rounded-2xl border bg-card divide-y">
        {tickets.length === 0 && <p className="p-5 text-sm text-muted-foreground">No requests yet.</p>}
        {tickets.map((t) => (
          <div key={t.id} className="p-4 space-y-3">
            <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpenId(openId === t.id ? null : t.id)} aria-expanded={openId === t.id}>
              <span className="font-medium break-words">{t.subject}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={t.status === "resolved" ? "secondary" : "outline"}>{STATUS[t.status]}</Badge>
                {new Date(t.updatedAt).toLocaleDateString()}
              </span>
            </button>
            {openId === t.id && (
              <div className="space-y-3">
                {t.messages.map((m) => (
                  <div key={m.id} className={`rounded-lg p-3 text-sm ${m.sender === "superadmin" ? "bg-primary/10" : "bg-muted"}`}>
                    <p className="mb-1 text-xs text-muted-foreground">{m.sender === "superadmin" ? "Ridhzo support" : m.senderName} · {new Date(m.createdAt).toLocaleString()}</p>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                ))}
                {t.status !== "resolved" && (
                  <div className="space-y-2">
                    <Label htmlFor={`reply-${t.id}`} className="sr-only">Reply</Label>
                    <Textarea id={`reply-${t.id}`} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Add a reply…" maxLength={5000} />
                    <div className="flex justify-end">
                      <Button size="sm" disabled={busy || !reply.trim()} onClick={() => sendReply(t.id)}>Send reply</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
