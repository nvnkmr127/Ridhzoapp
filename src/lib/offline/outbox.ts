import { createLeadAction } from "@/lib/actions/leads";

export const OFFLINE_OUTBOX_STORAGE_KEY = "ridhzo_offline_leads_outbox";
export const OFFLINE_OUTBOX_EVENT = "ridhzo_offline_outbox_change";

export function getOfflineOutboxStorageKey(orgId?: string): string {
  return orgId ? `ridhzo_offline_leads_outbox_${orgId}` : OFFLINE_OUTBOX_STORAGE_KEY;
}

export interface OfflineLeadPayload {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  ownerId?: string;
  customData?: Record<string, unknown>;
}

export interface OfflineLeadItem {
  id: string;
  payload: OfflineLeadPayload;
  organizationId?: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /** Sent with every attempt, so a retry of a lead that already reached the server doesn't create it twice. */
  idempotencyKey?: string;
  /** Gave up retrying automatically (rejected by the server, or 5 failed attempts). Kept until the user retries or discards it. */
  failed?: boolean;
}

export const MAX_ATTEMPTS = 5;

/** A request that never got an answer (offline, DNS, connection reset) — the only case worth queueing. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError; // fetch() rejects with TypeError when the request can't complete
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// Items queued before keys existed have ids like "offline_<ts>_<rand>" — derive a valid key from it.
const keyOf = (item: OfflineLeadItem) => item.idempotencyKey ?? item.id.replace(/_/g, "-");

function notifyOutboxChange(orgId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OFFLINE_OUTBOX_EVENT, { detail: { organizationId: orgId } }));
}

export function getOfflineOutbox(orgId?: string): OfflineLeadItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getOfflineOutboxStorageKey(orgId));
    if (!raw) return [];
    return JSON.parse(raw) as OfflineLeadItem[];
  } catch {
    return [];
  }
}

function saveOutbox(items: OfflineLeadItem[], orgId?: string) {
  try {
    localStorage.setItem(getOfflineOutboxStorageKey(orgId), JSON.stringify(items));
    notifyOutboxChange(orgId);
  } catch (err) {
    console.error("[OfflineOutbox] failed to save outbox", err);
  }
}

/** Queue a lead. Pass the idempotency key the online attempt already used, if there was one. */
export function enqueueOfflineLead(payload: OfflineLeadPayload, orgId?: string, idempotencyKey: string = newKey()): OfflineLeadItem {
  const newItem: OfflineLeadItem = {
    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    payload,
    organizationId: orgId,
    createdAt: Date.now(),
    attempts: 0,
    idempotencyKey,
  };
  saveOutbox([newItem, ...getOfflineOutbox(orgId)], orgId);
  return newItem;
}

export function newOfflineIdempotencyKey(): string {
  return newKey();
}

export function removeOfflineLead(id: string, orgId?: string): void {
  saveOutbox(getOfflineOutbox(orgId).filter((item) => item.id !== id), orgId);
}

export function clearOfflineOutbox(orgId?: string): void {
  try {
    localStorage.removeItem(getOfflineOutboxStorageKey(orgId));
    notifyOutboxChange(orgId);
  } catch (err) {
    console.error("[OfflineOutbox] failed to clear outbox", err);
  }
}

/** Put failed items back in the automatic queue (the user pressed Retry). */
export function retryFailedOfflineLeads(orgId?: string): void {
  saveOutbox(getOfflineOutbox(orgId).map((i) => (i.failed ? { ...i, failed: false, attempts: 0 } : i)), orgId);
}

/** Drop the items the user chose to discard after they failed. */
export function discardFailedOfflineLeads(orgId?: string): void {
  saveOutbox(getOfflineOutbox(orgId).filter((i) => !i.failed), orgId);
}

function updateOfflineLead(item: OfflineLeadItem, orgId?: string): void {
  saveOutbox(getOfflineOutbox(orgId).map((i) => (i.id === item.id ? item : i)), orgId);
}

export interface SyncResults {
  synced: number;
  failed: number;
  /** Items that stopped retrying on this run and now need the user (Retry / Discard). */
  gaveUp: number;
  duplicates: { name: string; message: string }[];
  items: { id: string; success: boolean; error?: string }[];
}

const EMPTY: SyncResults = { synced: 0, failed: 0, gaveUp: 0, duplicates: [], items: [] };

// One tab at a time: every open tab hears "online", and without a lock each would replay the same queue.
async function withOutboxLock(orgId: string | undefined, fn: () => Promise<SyncResults>): Promise<SyncResults> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks?.request) return fn();
  let out: SyncResults = EMPTY;
  await locks.request(`ridhzo-offline-outbox-${orgId ?? "default"}`, { ifAvailable: true }, async (lock) => {
    if (lock) out = await fn(); // null lock: another tab is already flushing this queue
  });
  return out;
}

export async function flushOfflineOutbox(
  onLeadSynced?: (lead: OfflineLeadItem) => void,
  orgId?: string,
): Promise<SyncResults> {
  if (typeof window === "undefined" || !navigator.onLine) return EMPTY;
  return withOutboxLock(orgId, () => flush(onLeadSynced, orgId));
}

async function flush(onLeadSynced: ((lead: OfflineLeadItem) => void) | undefined, orgId?: string): Promise<SyncResults> {
  const items = getOfflineOutbox(orgId).filter((i) => !i.failed);
  if (items.length === 0) return EMPTY;

  const res: SyncResults = { synced: 0, failed: 0, gaveUp: 0, duplicates: [], items: [] };
  const failAttempt = (item: OfflineLeadItem, error: string, permanent: boolean) => {
    res.failed++;
    res.items.push({ id: item.id, success: false, error });
    const attempts = (item.attempts || 0) + 1;
    const failed = permanent || attempts >= MAX_ATTEMPTS;
    if (failed) res.gaveUp++;
    // Never dropped silently: a lead that stops retrying stays queued, marked failed, for the user.
    updateOfflineLead({ ...item, attempts, lastError: error, failed }, orgId);
  };

  for (const item of items) {
    try {
      const r = await createLeadAction(item.payload, { idempotencyKey: keyOf(item) });
      if (r.ok) {
        removeOfflineLead(item.id, orgId);
        res.synced++;
        res.items.push({ id: item.id, success: true });
        onLeadSynced?.(item);
        continue;
      }
      // Rejected as a duplicate: drop it so it doesn't block the queue. Match on the CONFLICT code —
      // the server phrases duplicates several ways ("Duplicate phone number: already used by lead X",
      // "...already exists"), so a message-substring check misses most of them.
      if (r.code === "CONFLICT" || r.message?.toLowerCase().includes("already exists")) {
        removeOfflineLead(item.id, orgId);
        res.duplicates.push({ name: item.payload.name, message: r.message });
        res.items.push({ id: item.id, success: true });
        continue;
      }
      // Validation / permission / plan-limit answers won't change by retrying.
      failAttempt(item, r.message, ["VALIDATION", "FORBIDDEN", "LIMIT", "UNAUTHENTICATED"].includes(r.code));
    } catch (err: any) {
      failAttempt(item, err?.message || "Sync network error", false);
      if (isNetworkError(err)) break; // offline again — stop, the rest would fail the same way
    }
  }

  return res;
}
