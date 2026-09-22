"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitPublicLeadAction } from "@/lib/actions/publicLead";
import { DEFAULT_FORM_FIELDS, groupIntoSteps, type FormField } from "@/lib/leads/formFields";

export function PublicLeadForm({
  sourceId,
  title,
  fields = DEFAULT_FORM_FIELDS,
}: {
  sourceId: string;
  title: string;
  fields?: FormField[];
}) {
  const steps = React.useMemo(() => groupIntoSteps(fields), [fields]);
  const [step, setStep] = React.useState(0);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const isLast = step >= steps.length - 1;
  const hasContact = fields.some((f) => f.key === "email" || f.key === "phone");

  // Validate the current step's required fields before advancing/submitting.
  function validateStep(): boolean {
    for (const f of steps[step] ?? []) {
      if (f.required && !(values[f.key] ?? "").trim()) {
        setError(`${f.label} is required.`);
        return false;
      }
    }
    return true;
  }

  async function submit() {
    if (hasContact && !(values.email ?? "").trim() && !(values.phone ?? "").trim()) {
      setError("Please provide an email or phone number.");
      return;
    }
    setSaving(true);
    try {
      const res = await submitPublicLeadAction(sourceId, values);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setDone(true);
    } catch {
      setError("We couldn't reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function next(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validateStep()) return;
    if (isLast) void submit();
    else setStep((s) => s + 1);
  }

  if (done) {
    const firstName = (values.name ?? "").split(" ")[0] || "there";
    return (
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">Thanks, {firstName}!</h1>
        <p className="text-sm text-muted-foreground">We&apos;ve received your details and will be in touch shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={next} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {steps.length > 1 ? (
          <p className="text-sm text-muted-foreground">Step {step + 1} of {steps.length}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Leave your details and we&apos;ll get back to you.</p>
        )}
      </div>

      {steps.length > 1 && (
        <div className="flex gap-1" aria-hidden>
          {steps.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      )}

      {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}

      {(steps[step] ?? []).map((f) => {
        const label = f.required ? `${f.label} *` : f.label;
        if (f.type === "textarea") {
          return <Textarea key={f.key} placeholder={label} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />;
        }
        if (f.type === "select") {
          return (
            <div key={f.key} className="space-y-1">
              <label className="text-sm text-muted-foreground">{label}</label>
              <select
                value={values[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          );
        }
        if (f.type === "date") {
          return (
            <div key={f.key} className="space-y-1">
              <label className="text-sm text-muted-foreground">{label}</label>
              <Input type="date" value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
            </div>
          );
        }
        return <Input key={f.key} type={f.type} placeholder={label} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />;
      })}

      <div className="flex gap-2">
        {step > 0 && (
          <Button type="button" variant="outline" className="flex-1" onClick={() => { setError(null); setStep((s) => s - 1); }} disabled={saving}>
            Back
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving ? "Sending…" : isLast ? "Submit" : "Next"}
        </Button>
      </div>
    </form>
  );
}
