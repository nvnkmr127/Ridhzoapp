import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react";
import { LocalTime } from "@/components/LocalTime";

type Message = {
  id: string;
  direction: string;
  body: string | null;
  status: string;
  createdAt: Date;
  userId?: string | null;
};

// Read receipt tick, matching WhatsApp's own semantics.
function StatusTick({ status }: { status: string }) {
  if (status === "failed") return <AlertCircle className="h-3 w-3 text-foreground" />;
  if (status === "read") return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  if (status === "sent") return <Check className="h-3 w-3 text-muted-foreground" />;
  return <Clock className="h-3 w-3 text-muted-foreground" />; // queued
}

export function WhatsAppThread({ messages, userNames = {} }: { messages: Message[]; userNames?: Record<string, string> }) {
  if (messages.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No WhatsApp messages yet.</div>;
  }
  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto rounded-lg bg-muted p-3">
      {messages.map((m) => {
        const outbound = m.direction === "outbound";
        return (
          <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
              outbound ? "bg-muted text-foreground" : "bg-card border text-foreground"
            }`}>
              <div className="whitespace-pre-wrap">{m.body}</div>
              <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                {outbound && <span>{m.userId ? userNames[m.userId] ?? "Team" : "Automation"} ·</span>}
                <LocalTime iso={m.createdAt} mode="time" />
                {outbound && <StatusTick status={m.status} />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
