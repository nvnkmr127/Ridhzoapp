"use client";

import * as React from "react";
import { MessageSquare, Mail, Paperclip, Clock, UserPlus, CheckCircle2, Users } from "lucide-react";

type FlowStep = {
  stepIndex: number;
  dayOffset: number;
  channel: "whatsapp" | "email";
  body: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  clients: number;
};

// Channel styling as Tailwind utility classes (token-driven, theme-aware) — matches the app's
// existing WhatsApp-green / email-blue usage instead of inline hex/rgb.
const CHANNEL = {
  whatsapp: {
    Icon: MessageSquare,
    label: "WhatsApp",
    chip: "bg-green-500/15 text-green-700 dark:text-green-400",
    border: "border-green-500/40",
    bar: "bg-green-500",
  },
  email: {
    Icon: Mail,
    label: "Email",
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    border: "border-sky-500/40",
    bar: "bg-sky-500",
  },
} as const;

// Dotted connector with glowing dots flowing top→bottom. Pure CSS; respects reduced motion.
function Connector({ active, count }: { active: boolean; count?: number }) {
  return (
    <div className="seqflow-connector" aria-hidden>
      <span className="seqflow-rail" />
      {active && (
        <>
          <span className="seqflow-dot" style={{ animationDelay: "0s" }} />
          <span className="seqflow-dot" style={{ animationDelay: "0.6s" }} />
          <span className="seqflow-dot" style={{ animationDelay: "1.2s" }} />
        </>
      )}
      {active && count ? <span className="seqflow-flowlabel">{count}</span> : null}
    </div>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <div className="text-right shrink-0 pl-2">
      <p className={`text-3xl font-bold tabular-nums leading-none tracking-tight ${n > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>{n}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export function SequenceFlow({ steps, funnel }: { steps: FlowStep[]; funnel: { active: number; completed: number; removed: number } }) {
  const denom = Math.max(funnel.active, 1); // share bars are relative to who's currently enrolled

  return (
    <div className="seqflow space-y-0">
      <style>{`
        .seqflow-node { position: relative; transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
        .seqflow-node:hover { transform: translateY(-1px); box-shadow: 0 6px 20px -8px rgb(0 0 0 / .35); }
        .seqflow-connector { position: relative; height: 40px; width: 2px; margin: 3px auto; }
        .seqflow-rail { position: absolute; inset: 0; border-radius: 2px; background: linear-gradient(to bottom, hsl(var(--border)), hsl(var(--border) / .35)); }
        .seqflow-dot { position: absolute; left: -3px; width: 8px; height: 8px; border-radius: 9999px; background: hsl(var(--primary)); box-shadow: 0 0 10px 1px hsl(var(--primary) / .8); animation: seqflow-fall 1.8s cubic-bezier(.5,0,.5,1) infinite; }
        .seqflow-flowlabel { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 10px; color: hsl(var(--muted-foreground)); white-space: nowrap; display: inline-flex; align-items: center; }
        @keyframes seqflow-fall { 0% { top: -8px; opacity: 0 } 15% { opacity: 1 } 85% { opacity: 1 } 100% { top: 40px; opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { .seqflow-dot { animation: none; top: 16px; opacity: .6 } }
      `}</style>

      {/* Entry */}
      <div className="seqflow-node flex items-center gap-3 rounded-2xl border bg-card p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
          <UserPlus className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">New leads enter here</p>
          <p className="text-xs text-muted-foreground">Enrolled manually or by an automation</p>
        </div>
        <Count n={funnel.active} label="in sequence" />
      </div>

      <Connector active={funnel.active > 0} />

      {/* Steps */}
      {steps.map((s, i) => {
        const ch = CHANNEL[s.channel] ?? CHANNEL.whatsapp;
        const share = Math.round((s.clients / denom) * 100);
        return (
          <React.Fragment key={s.stepIndex}>
            <div className={`seqflow-node rounded-2xl border bg-card p-4 ${s.clients > 0 ? ch.border : ""}`}>
              <div className="flex items-start gap-3">
                {/* Icon + step number badge */}
                <div className="relative shrink-0">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${ch.chip}`}>
                    <ch.Icon className="h-5 w-5" />
                  </div>
                  <span className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background text-[11px] font-bold tabular-nums">
                    {i + 1}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                    Step {i + 1}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ch.chip}`}>
                      {ch.label}
                    </span>
                    {s.dayOffset > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                        <Clock className="h-3 w-3" /> day {s.dayOffset}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{s.body}</p>
                  {s.attachmentUrl && (
                    <a href={s.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-primary hover:bg-accent/50">
                      <Paperclip className="h-3 w-3" /> {s.attachmentName || "Attachment"}
                    </a>
                  )}
                </div>

                <Count n={s.clients} label={s.clients === 1 ? "person here" : "people here"} />
              </div>

              {/* Share bar — this step's portion of everyone currently in the sequence */}
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full transition-all ${ch.bar}`} style={{ width: `${share}%` }} />
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground w-9 text-right">{share}%</span>
              </div>
            </div>

            {i < steps.length - 1 && <Connector active={s.clients > 0} count={s.clients} />}
          </React.Fragment>
        );
      })}

      <Connector active={funnel.completed > 0} />

      {/* Exit */}
      <div className="seqflow-node flex items-center gap-3 rounded-2xl border bg-card p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-500/12 text-green-600 dark:text-green-400 shrink-0">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Finished the sequence</p>
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            {funnel.removed > 0 && (
              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {funnel.removed} removed early</span>
            )}
          </p>
        </div>
        <Count n={funnel.completed} label="completed" />
      </div>
    </div>
  );
}
