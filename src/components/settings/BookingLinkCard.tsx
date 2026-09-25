"use client";

import * as React from "react";
import { Copy, ExternalLink, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// The public booking link with copy / open / share-on-WhatsApp. Origin is read after mount so the
// link matches whatever domain the app is on.
export function BookingLinkCard({ slug }: { slug: string }) {
  const { toast } = useToast();
  const [url, setUrl] = React.useState("");
  React.useEffect(() => setUrl(`${window.location.origin}/book/${slug}`), [slug]);
  if (!url) return null;

  const copy = () =>
    navigator.clipboard?.writeText(url).then(
      () => toast({ title: "Booking link copied" }),
      () => toast({ variant: "destructive", title: "Copy failed" }),
    );

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
      <code className="block truncate text-sm">{url}</code>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copy}><Copy className="h-3.5 w-3.5" /> Copy</Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open</a>
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href={`https://wa.me/?text=${encodeURIComponent(`Book a time with us here: ${url}`)}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-3.5 w-3.5" /> Share on WhatsApp
          </a>
        </Button>
      </div>
    </div>
  );
}
