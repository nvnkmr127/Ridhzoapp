"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export type Status = { kind: "error" | "success" | "info"; text: string } | null;

const ICONS = { error: AlertCircle, success: CheckCircle2, info: Info };
const VARIANTS = { error: "destructive", success: "success", info: "default" } as const;

// Form-level outcome message, meant to sit at the TOP of a form. Every time a new status is set (even
// the same text again) it re-mounts to replay a short flash and scrolls itself into view, so the
// result is never missed — e.g. on a phone after tapping a submit button at the bottom of the form.
// Errors announce assertively (role="alert"); success/info politely (role="status").
export function StatusMessage({ status, className }: { status: Status; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    if (status) setShown((n) => n + 1);
  }, [status]);
  React.useEffect(() => {
    if (shown) ref.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [shown]);
  if (!status) return null;
  const Icon = ICONS[status.kind];
  return (
    <Alert
      key={shown}
      ref={ref}
      variant={VARIANTS[status.kind]}
      role={status.kind === "error" ? "alert" : "status"}
      aria-live={status.kind === "error" ? "assertive" : "polite"}
      className={cn("status-flash scroll-mt-4", className)}
    >
      <Icon className="h-4 w-4" />
      <AlertDescription>{status.text}</AlertDescription>
    </Alert>
  );
}

// react-hook-form's onInvalid handler → one top-of-form summary of what's wrong. Field-level messages
// still render under each field; this makes sure the user sees there IS a problem without scrolling.
export function summarizeFieldErrors(errors: Record<string, { message?: unknown } | undefined>, labels: Record<string, string>): string {
  const problems = Object.entries(errors)
    .filter(([, e]) => e?.message)
    .map(([field, e]) => `${labels[field] ?? field}: ${String(e!.message)}`);
  return problems.length === 1 ? problems[0] : `Please fix ${problems.length} fields — ${problems.join(" · ")}`;
}
