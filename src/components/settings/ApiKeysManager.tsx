"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { API_SCOPES } from "@/lib/apiScopes";
import { useToast } from "@/hooks/use-toast";
import { createApiKeyAction, revokeApiKeyAction, deleteApiKeyAction } from "@/lib/actions/apiKeys";
import { Key, Plus, Copy, Trash2 } from "lucide-react";

type ApiKey = { id: string; name: string; prefix: string; scope?: string; scopes?: string[] | null; expiresAt?: Date | string | null; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date | string };

export function ApiKeysManager({ initial }: { initial: ApiKey[] }) {
  const { toast } = useToast();
  const [keys, setKeys] = React.useState<ApiKey[]>(initial);
  const [name, setName] = React.useState("");
  const [readOnly, setReadOnly] = React.useState(false);
  const [limitScopes, setLimitScopes] = React.useState(false);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [expiry, setExpiry] = React.useState<"30" | "90" | "365" | "never">("365");
  const [saving, setSaving] = React.useState(false);
  const [newKey, setNewKey] = React.useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    if (limitScopes && picked.length === 0) { toast({ variant: "destructive", title: "Pick at least one permission", description: "Or untick “Limit to specific permissions”." }); return; }
    setSaving(true);
    try {
      const scope: "full" | "read_only" = readOnly ? "read_only" : "full";
      const res = await createApiKeyAction(name.trim(), scope, expiry === "never" ? null : (Number(expiry) as 30 | 90 | 365), limitScopes ? picked : null);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not create key", description: res.message });
        return;
      }
      const created = res.data;
      setNewKey(created.key);
      setKeys((prev) => [{ id: created.id, name: created.name, prefix: created.prefix, scope: created.scope ?? scope, scopes: created.scopes ?? null, expiresAt: created.expiresAt ?? null, lastUsedAt: null, revokedAt: null, createdAt: new Date() }, ...prev]);
      setName("");
      setReadOnly(false);
    } catch {
      toast({ variant: "destructive", title: "Could not create key", description: "Something went wrong. Check your connection, or you may not have permission for this, then try again." });
    } finally {
      setSaving(false);
    }
  }

  async function revoke(k: ApiKey) {
    if (!confirm(`Revoke "${k.name}"? Apps using it will stop working immediately.`)) return;
    try {
      const res = await revokeApiKeyAction(k.id);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not revoke", description: res.message });
        return;
      }
      setKeys((prev) => prev.map((x) => (x.id === k.id ? { ...x, revokedAt: new Date() } : x)));
    } catch {
      toast({ variant: "destructive", title: "Could not revoke", description: "Something went wrong. Check your connection, or you may not have permission for this, then try again." });
    }
  }

  async function remove(k: ApiKey) {
    if (!confirm(`Delete "${k.name}"? This removes it permanently. Any app still using it will stop working.`)) return;
    const prev = keys;
    setKeys((p) => p.filter((x) => x.id !== k.id));
    try {
      const res = await deleteApiKeyAction(k.id);
      if (!res.ok) {
        setKeys(prev);
        toast({ variant: "destructive", title: "Could not delete", description: res.message });
        return;
      }
      toast({ title: "API key deleted" });
    } catch {
      setKeys(prev);
      toast({ variant: "destructive", title: "Could not delete", description: "Something went wrong. Check your connection, or you may not have permission for this, then try again." });
    }
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-2xl p-6 bg-card space-y-3">
        <div className="flex items-center gap-2"><Key className="h-5 w-5 text-muted-foreground" /><h3 className="font-semibold">API Keys</h3></div>
        <p className="text-sm text-muted-foreground">
          Authenticate with <code className="text-xs bg-muted px-1 rounded">Authorization: Bearer &lt;key&gt;</code> against
          {" "}<code className="text-xs bg-muted px-1 rounded">/api/v1/leads</code>.
        </p>
        <div className="flex gap-2 max-w-md">
          <Input placeholder="Key name (e.g. Zapier)" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }} />
          <Button variant="outline" onClick={create} disabled={saving || !name.trim()} className="gap-1"><Plus className="h-4 w-4" /> Create</Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground select-none">
          <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} className="h-4 w-4" />
          Read-only (GET requests only — can’t create, edit, or delete)
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground select-none">
          <input type="checkbox" checked={limitScopes} onChange={(e) => setLimitScopes(e.target.checked)} className="h-4 w-4" />
          Limit to specific permissions
        </label>
        {limitScopes && (
          <div className="grid gap-1 sm:grid-cols-2">
            {API_SCOPES.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm text-muted-foreground select-none">
                <input type="checkbox" className="h-4 w-4" checked={picked.includes(s.key)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.key] : p.filter((x) => x !== s.key)))} />
                {s.label}
              </label>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Expires
          <select value={expiry} onChange={(e) => setExpiry(e.target.value as typeof expiry)} className="rounded-md border border-input bg-background px-2 py-1 text-sm">
            <option value="30">in 30 days</option>
            <option value="90">in 90 days</option>
            <option value="365">in 1 year</option>
            <option value="never">never</option>
          </select>
        </label>

        {newKey && (
          <div className="rounded-lg border border-border bg-muted p-3 space-y-2">
            <div className="text-sm font-medium text-foreground">Copy your key now — it won’t be shown again.</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-card border rounded px-2 py-1.5 break-all">{newKey}</code>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => { navigator.clipboard?.writeText(newKey); toast({ title: "Copied" }); }}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </div>
            <button className="text-xs text-muted-foreground underline" onClick={() => setNewKey(null)}>Done</button>
          </div>
        )}
      </div>

      <div className="border rounded-2xl bg-card divide-y">
        {keys.length === 0 && <div className="p-6 text-sm text-muted-foreground">No API keys yet.</div>}
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium">{k.name}</span>
              <code className="text-xs text-muted-foreground">{k.prefix}…</code>
              {k.scope === "read_only" && <Badge variant="outline">Read-only</Badge>}
              {k.scopes && <Badge variant="outline" title={k.scopes.join(", ")}>{k.scopes.length} permission{k.scopes.length === 1 ? "" : "s"}</Badge>}
              {k.expiresAt && <Badge variant="outline">{new Date(k.expiresAt).getTime() < Date.now() ? "Expired" : `Expires ${new Date(k.expiresAt).toLocaleDateString()}`}</Badge>}
              {k.revokedAt ? <Badge variant="secondary">Revoked</Badge> : <Badge>Active</Badge>}
              {k.lastUsedAt && <span className="text-xs text-muted-foreground">last used {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
            </div>
            <div className="flex items-center gap-2">
              {!k.revokedAt && <Button size="sm" variant="outline" onClick={() => revoke(k)}>Revoke</Button>}
              <Button size="icon" variant="ghost" onClick={() => remove(k)} title="Delete API key">
                <Trash2 className="h-4 w-4 text-white" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
