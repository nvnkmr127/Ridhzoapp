"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, CheckCircle2, AlertTriangle, Copy, FlaskConical, Play } from "lucide-react";
import { listSourcesAction } from "@/lib/actions/sources";
import { listUsersAction } from "@/lib/actions/users";
import { parseImportCsvAction, simulateImportAction, commitImportAction, listImportFieldsAction } from "@/lib/actions/import";
import { validateCsvFile } from "@/lib/csvFile";

type ImportField = { key: string; label: string; required: boolean; custom: boolean };

// Client-safe copy of the fixed lead fields (the server module can't be imported here — it pulls in
// db). Org custom fields are fetched at open and appended, so they can be mapped and imported too.
const STATIC_FIELDS: ImportField[] = [
  { key: "name", label: "Name", required: true, custom: false },
  { key: "email", label: "Email", required: false, custom: false },
  { key: "phone", label: "Phone", required: false, custom: false },
  { key: "company", label: "Company", required: false, custom: false },
  { key: "status", label: "Status", required: false, custom: false },
  { key: "expectedValue", label: "Expected value", required: false, custom: false },
];

const STATUSES = ["new", "active", "won", "lost", "unqualified"];

type Row = Record<string, string>;
type Analysis = {
  total: number; newCount: number; duplicateCount: number; errorCount: number;
  rows: { index: number; valid: boolean; duplicate: boolean; reason?: string }[];
};

const NONE = "__none__";
const emptyRow = (fields: ImportField[]): Row => Object.fromEntries(fields.map((f) => [f.key, ""]));

function downloadSample(fields: ImportField[]) {
  // Fixed columns get realistic examples; custom columns are left blank in the example rows so the
  // header shows their exact key (that's what the mapping matches on).
  const header = fields.map((f) => f.key).join(",");
  const base = [
    { name: "Alice Tan", email: "alice@example.com", phone: "+6591234567", company: "Acme Pte Ltd", status: "new", expectedValue: "5000" },
    { name: "Bob Rivera", email: "bob@example.com", phone: "+6598765432", company: "Rivera Realty", status: "active", expectedValue: "12000" },
    { name: "Priya Nair", email: "priya@example.com", phone: "+919812345678", company: "", status: "new", expectedValue: "" },
  ];
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const examples = base.map((ex) => fields.map((f) => esc((ex as Record<string, string>)[f.key] ?? "")).join(","));
  const csv = [header, ...examples].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "sample-leads.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Split a flat wizard row into the shape the server expects: fixed lead fields at the top level,
// everything else nested under customData (keyed by custom-field key).
function toImportRow(row: Row, customKeys: string[]) {
  const customData: Record<string, string> = {};
  for (const k of customKeys) if (row[k] != null && row[k] !== "") customData[k] = row[k];
  return {
    name: row.name, email: row.email, phone: row.phone,
    company: row.company, status: row.status, expectedValue: row.expectedValue,
    customData,
  };
}

export function LeadImportWizard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);

  const [sources, setSources] = React.useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = React.useState<{ id: string; name: string }[]>([]);
  const [fields, setFields] = React.useState<ImportField[]>(STATIC_FIELDS);
  const customKeys = React.useMemo(() => fields.filter((f) => f.custom).map((f) => f.key), [fields]);

  const [step, setStep] = React.useState<"setup" | "review">("setup");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rawRows, setRawRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [rows, setRows] = React.useState<Row[]>([]);
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
  const [simResult, setSimResult] = React.useState<string | null>(null);

  const [sourceId, setSourceId] = React.useState<string>("");
  const [ownerId, setOwnerId] = React.useState<string>("");
  const [fallbackStatus, setFallbackStatus] = React.useState<string>("new");

  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    listSourcesAction().then((r) => setSources(r as any)).catch(() => {});
    listUsersAction().then((r) => setUsers(r as any)).catch(() => {});
    listImportFieldsAction()
      .then((r) => { if (r.ok) setFields(r.data as ImportField[]); })
      .catch(() => {});
  }, [open]);

  function reset() {
    setStep("setup"); setHeaders([]); setRawRows([]); setMapping({}); setRows([]);
    setAnalysis(null); setSimResult(null); setSourceId(""); setOwnerId(""); setFallbackStatus("new");
  }

  // Rebuild the mapped rows from the raw upload + current field→header mapping.
  const buildRows = React.useCallback((raw: Record<string, string>[], map: Record<string, string>): Row[] =>
    raw.map((rec) => {
      const r = emptyRow(fields);
      for (const f of fields) {
        const h = map[f.key];
        if (h && rec[h] != null) r[f.key] = String(rec[h]);
      }
      return r;
    }), [fields]);

  async function onFile(file: File) {
    const problem = validateCsvFile(file);
    if (problem) {
      toast({ variant: "destructive", title: "Can't import this file", description: problem });
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const res = await parseImportCsvAction(text);
      if (!res.ok) { toast({ variant: "destructive", title: "Couldn't read file", description: res.message }); return; }
      const { headers, rows: raw, mapping } = res.data;
      if (raw.length === 0) { toast({ variant: "destructive", title: "No rows found in that file" }); return; }
      setHeaders(headers); setRawRows(raw); setMapping(mapping);
      const built = buildRows(raw, mapping);
      setRows(built);
      await runSimulate(built, false);
      setStep("review");
    } catch {
      toast({ variant: "destructive", title: "Couldn't read file", description: "We couldn't read this file. Make sure it's a valid CSV and try again." });
    } finally {
      setBusy(false);
    }
  }

  function remap(fieldKey: string, header: string) {
    const map = { ...mapping, [fieldKey]: header === NONE ? "" : header };
    setMapping(map);
    const built = buildRows(rawRows, map);
    setRows(built);
    runSimulate(built, false);
  }

  function editCell(rowIdx: number, key: string, value: string) {
    setRows((cur) => cur.map((r, i) => (i === rowIdx ? { ...r, [key]: value } : r)));
  }

  async function runSimulate(theRows: Row[], announce: boolean) {
    try {
      const res = await simulateImportAction({ rows: theRows.map((r) => toImportRow(r, customKeys)) });
      if (!res.ok) { toast({ variant: "destructive", title: "Simulation failed", description: res.message }); return; }
      const analysis = res.data as Analysis;
      setAnalysis(analysis);
      if (announce) {
        setSimResult(`${analysis.newCount} will import · ${analysis.duplicateCount} duplicates skipped · ${analysis.errorCount} rows with errors.`);
      }
    } catch {
      toast({ variant: "destructive", title: "Simulation failed", description: "We couldn't reach the server. Please try again." });
    }
  }

  async function doImport() {
    setBusy(true);
    try {
      const res = await commitImportAction({
        rows: rows.map((r) => toImportRow(r, customKeys)),
        config: { sourceId: sourceId || null, ownerId: ownerId || null, fallbackStatus },
      });
      if (!res.ok) { toast({ variant: "destructive", title: "Import failed", description: res.message }); return; }
      const { imported, skipped } = res.data;
      toast({ title: `Imported ${imported} leads`, description: skipped ? `${skipped} skipped (duplicates or errors).` : undefined });
      setOpen(false); reset();
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Import failed", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const flagFor = (i: number) => analysis?.rows.find((r) => r.index === i);

  // Export the rows that won't import (invalid or duplicate) as CSV, with a reason column,
  // so the user can fix them and re-upload.
  function downloadFailedRows() {
    if (!analysis) return;
    const failed = analysis.rows.filter((r) => !r.valid || r.duplicate);
    if (failed.length === 0) return;
    const cols = fields.map((f) => f.key);
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const header = [...fields.map((f) => f.label), "Reason"].join(",");
    const lines = failed.map((f) => {
      const row = rows[f.index] ?? ({} as Row);
      const reason = f.reason || (f.duplicate ? "Duplicate of an existing or earlier row" : "Invalid row");
      return [...cols.map((c) => esc(row[c] ?? "")), esc(reason)].join(",");
    });
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", `import_failed_rows_${Date.now()}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import leads</DialogTitle>
          <DialogDescription>
            {step === "setup" ? "Review the supported columns, grab a sample, then upload your file." : "Map columns, fix any issues, configure, then import."}
          </DialogDescription>
        </DialogHeader>

        {step === "setup" && (
          <div className="space-y-5">
            {/* 1. Available headers */}
            <div>
              <p className="mb-2 text-sm font-medium">Supported columns</p>
              <div className="flex flex-wrap gap-2">
                {fields.map((f) => (
                  <Badge
                    key={f.key}
                    variant={f.required ? "default" : f.custom ? "outline" : "secondary"}
                    className="font-normal"
                  >
                    {f.key}{f.required ? " *" : ""}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                * required. All other columns are optional.
                {customKeys.length > 0 && " Outlined columns are your custom fields."}
              </p>
            </div>

            {/* 2. Download sample */}
            <Button variant="outline" onClick={() => downloadSample(fields)} className="gap-2">
              <Download className="h-4 w-4" /> Download sample lead file
            </Button>

            {/* 3. Upload */}
            <div className="rounded-xl border border-dashed p-6 text-center">
              <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <p className="mb-3 text-sm text-muted-foreground">Upload your CSV file to continue.</p>
              <input
                type="file" accept=".csv,text/csv" disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
              />
            </div>
          </div>
        )}

        {step === "review" && analysis && (
          <div className="space-y-5">
            {/* 4. Duplicate detection summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border p-3 text-center">
                <p className="text-2xl font-bold text-emerald-500 tabular-nums">{analysis.newCount}</p>
                <p className="text-xs text-muted-foreground">New / unique</p>
              </div>
              <div className="rounded-xl border p-3 text-center">
                <p className="text-2xl font-bold text-amber-500 tabular-nums">{analysis.duplicateCount}</p>
                <p className="text-xs text-muted-foreground">Duplicates</p>
              </div>
              <div className="rounded-xl border p-3 text-center">
                <p className="text-2xl font-bold text-rose-500 tabular-nums">{analysis.errorCount}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
            </div>

            {analysis.errorCount + analysis.duplicateCount > 0 && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={downloadFailedRows} className="gap-2">
                  <Download className="h-4 w-4" /> Download failed rows ({analysis.errorCount + analysis.duplicateCount})
                </Button>
              </div>
            )}

            {/* Column mapping */}
            <div>
              <p className="mb-2 text-sm font-medium">Map your columns</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs text-muted-foreground">{f.label}{f.required ? " *" : ""}</label>
                    <Select value={mapping[f.key] || NONE} onValueChange={(v) => remap(f.key, v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— none —</SelectItem>
                        {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Preview & edit */}
            <div>
              <p className="mb-2 text-sm font-medium">Preview &amp; edit ({rows.length} rows)</p>
              <div className="max-h-64 overflow-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="p-2 text-left font-medium">Status</th>
                      {fields.map((f) => <th key={f.key} className="p-2 text-left font-medium">{f.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 200).map((row, i) => {
                      const flag = flagFor(i);
                      const bad = flag && !flag.valid;
                      const dup = flag?.duplicate;
                      return (
                        <tr key={i} className={`border-t ${bad ? "bg-rose-500/5" : dup ? "bg-amber-500/5" : ""}`}>
                          <td className="p-1.5 whitespace-nowrap">
                            {bad ? <span className="flex items-center gap-1 text-rose-500"><AlertTriangle className="h-3 w-3" /> {flag?.reason}</span>
                              : dup ? <span className="flex items-center gap-1 text-amber-500"><Copy className="h-3 w-3" /> dup</span>
                              : <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3 w-3" /> ok</span>}
                          </td>
                          {fields.map((f) => (
                            <td key={f.key} className="p-1">
                              <Input
                                value={row[f.key] ?? ""}
                                onChange={(e) => editCell(i, f.key, e.target.value)}
                                onBlur={() => runSimulate(rows, false)}
                                className={`h-7 text-xs ${f.required && !(row[f.key] ?? "").trim() ? "border-rose-500" : ""}`}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length > 200 && <p className="mt-1 text-xs text-muted-foreground">Showing first 200 rows; all {rows.length} will be imported.</p>}
            </div>

            {/* 6. Lead configuration */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Source</label>
                <Select value={sourceId || NONE} onValueChange={(v) => setSourceId(v === NONE ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— none —</SelectItem>
                    {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Responsible (assignee)</label>
                <Select value={ownerId || NONE} onValueChange={(v) => setOwnerId(v === NONE ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Me" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— me —</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Status (fallback)</label>
                <Select value={fallbackStatus} onValueChange={setFallbackStatus}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {simResult && <p className="rounded-lg bg-muted p-2 text-xs">{simResult}</p>}

            {/* 7. Actions */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={() => setStep("setup")} disabled={busy}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => runSimulate(rows, true)} disabled={busy} className="gap-2">
                  <FlaskConical className="h-4 w-4" /> Simulate import
                </Button>
                <Button onClick={doImport} disabled={busy || analysis.newCount === 0} className="gap-2">
                  <Play className="h-4 w-4" /> Import {analysis.newCount} leads
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
