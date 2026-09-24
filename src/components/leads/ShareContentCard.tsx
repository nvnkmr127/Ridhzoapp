"use client";

import * as React from "react";
import { Send, Link2, Check, Eye, MessageCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SectionCard } from "./SectionCard";
import { createShareAction } from "@/lib/actions/sharedContent";
import type { SharedLinkSummary } from "@/domains/leads/contentSharingService";
import { formatDistanceToNow } from "date-fns";

function shareUrl(slug: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/s/${slug}`;
}

export function ShareContentCard({
  leadId,
  leadPhone,
  initialShares,
}: {
  leadId: string;
  leadPhone: string | null;
  initialShares: SharedLinkSummary[];
}) {
  const { toast } = useToast();
  const [shares, setShares] = React.useState<SharedLinkSummary[]>(initialShares);
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  // Collapsed by default: three empty fields used to take a whole phone screen on every lead.
  const [formOpen, setFormOpen] = React.useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || (!url.trim() && !message.trim())) return;
    setBusy(true);
    try {
      const res = await createShareAction({
        leadId,
        title: title.trim(),
        targetUrl: url.trim() || undefined,
        bodyText: message.trim() || undefined,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't create link", description: res.message });
        return;
      }
      setShares((s) => [res.data, ...s]);
      setTitle("");
      setUrl("");
      setMessage("");
      setFormOpen(false);
      toast({ title: "Share link ready", description: "Copy it into WhatsApp — you'll be alerted when they open it." });
    } catch {
      toast({ variant: "destructive", title: "Couldn't create link", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function copy(slug: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(slug));
      setCopied(slug);
      setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1500);
    } catch {
      toast({ variant: "destructive", title: "Copy failed" });
    }
  }

  function whatsapp(share: SharedLinkSummary) {
    const digits = (leadPhone ?? "").replace(/[^0-9]/g, "");
    const text = encodeURIComponent(`${share.title}: ${shareUrl(share.slug)}`);
    const href = digits.length >= 6 ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <SectionCard
      icon={Send}
      title="Share a brochure"
      description="Send a link and get alerted the moment they open it."
    >
      <div className="space-y-4">
      {!formOpen ? (
        <Button type="button" variant="outline" size="sm" className="h-9 w-full gap-1.5" onClick={() => setFormOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New share link
        </Button>
      ) : (
      <form onSubmit={create} className="space-y-2">
        <Input
          placeholder="What is it? (e.g. Pricing brochure)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          className="h-9 text-sm"
        />
        <Input
          placeholder="Paste a link (https://…) — optional"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          className="h-9 text-sm"
        />
        <textarea
          placeholder="Or write a personal message to show on the page — optional"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={busy}
          rows={2}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
        <Button
          type="submit"
          size="sm"
          disabled={busy || !title.trim() || (!url.trim() && !message.trim())}
          className="h-9 w-full"
        >
          {busy ? "Creating…" : "Create share link"}
        </Button>
        <button type="button" onClick={() => setFormOpen(false)} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </form>
      )}

      {shares.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          {shares.map((share) => (
            <div key={share.id} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{share.title}</span>
                {share.viewCount > 0 ? (
                  <Badge variant="default" className="shrink-0 gap-1 font-normal">
                    <Eye className="h-3 w-3" /> Opened {share.viewCount}×
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="shrink-0 font-normal">Not opened yet</Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => copy(share.slug)}>
                  {copied === share.slug ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
                  {copied === share.slug ? "Copied" : "Copy link"}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => whatsapp(share)}>
                  <MessageCircle className="h-3 w-3" /> WhatsApp
                </Button>
                {share.lastViewedAt && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(share.lastViewedAt), { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </SectionCard>
  );
}
