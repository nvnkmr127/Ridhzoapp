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
}

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

export function enqueueOfflineLead(payload: OfflineLeadPayload, orgId?: string): OfflineLeadItem {
  const current = getOfflineOutbox(orgId);
  const newItem: OfflineLeadItem = {
    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    payload,
    organizationId: orgId,
    createdAt: Date.now(),
    attempts: 0,
  };
  const updated = [newItem, ...current];
  try {
    localStorage.setItem(getOfflineOutboxStorageKey(orgId), JSON.stringify(updated));
    notifyOutboxChange(orgId);
  } catch (err) {
    console.error("[OfflineOutbox] failed to save lead offline", err);
  }
  return newItem;
}

export function removeOfflineLead(id: string, orgId?: string): void {
  const current = getOfflineOutbox(orgId);
  const filtered = current.filter((item) => item.id !== id);
  try {
    localStorage.setItem(getOfflineOutboxStorageKey(orgId), JSON.stringify(filtered));
    notifyOutboxChange(orgId);
  } catch (err) {
    console.error("[OfflineOutbox] failed to remove lead", err);
  }
}

export function clearOfflineOutbox(orgId?: string): void {
  try {
    localStorage.removeItem(getOfflineOutboxStorageKey(orgId));
    notifyOutboxChange(orgId);
  } catch (err) {
    console.error("[OfflineOutbox] failed to clear outbox", err);
  }
}

function updateOfflineLead(item: OfflineLeadItem, orgId?: string): void {
  const current = getOfflineOutbox(orgId);
  const updated = current.map((i) => (i.id === item.id ? item : i));
  try {
    localStorage.setItem(getOfflineOutboxStorageKey(orgId), JSON.stringify(updated));
    notifyOutboxChange(orgId);
  } catch (err) {
    console.error("[OfflineOutbox] failed to update lead", err);
  }
}

export interface SyncResults {
  synced: number;
  failed: number;
  duplicates: { name: string; message: string }[];
  items: { id: string; success: boolean; error?: string }[];
}

export async function flushOfflineOutbox(
  onLeadSynced?: (lead: OfflineLeadItem) => void,
  orgId?: string,
): Promise<SyncResults> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { synced: 0, failed: 0, duplicates: [], items: [] };
  }

  const items = getOfflineOutbox(orgId);
  if (items.length === 0) {
    return { synced: 0, failed: 0, duplicates: [], items: [] };
  }

  let synced = 0;
  let failed = 0;
  const duplicates: { name: string; message: string }[] = [];
  const itemResults: { id: string; success: boolean; error?: string }[] = [];

  for (const item of items) {
    try {
      const res = await createLeadAction(item.payload);
      if (res.ok) {
        removeOfflineLead(item.id, orgId);
        synced++;
        itemResults.push({ id: item.id, success: true });
        onLeadSynced?.(item);
      } else {
        // If it was rejected as a duplicate, drop it so it does not block the queue. Match on the
        // CONFLICT code — the server phrases duplicates several ways ("Duplicate phone number:
        // already used by lead X", "...already exists"), so a message-substring check misses most
        // of them and leaves the older of two same-contact offline leads stuck forever.
        const isDuplicate = res.code === "CONFLICT" || res.message?.toLowerCase().includes("already exists");
        if (isDuplicate) {
          removeOfflineLead(item.id, orgId);
          duplicates.push({ name: item.payload.name, message: res.message });
          itemResults.push({ id: item.id, success: true });
        } else {
          failed++;
          itemResults.push({ id: item.id, success: false, error: res.message });
          const attempts = (item.attempts || 0) + 1;
          if (attempts >= 5) {
            removeOfflineLead(item.id, orgId);
          } else {
            updateOfflineLead({ ...item, attempts, lastError: res.message }, orgId);
          }
        }
      }
    } catch (err: any) {
      failed++;
      itemResults.push({ id: item.id, success: false, error: err?.message || "Sync network error" });
      const attempts = (item.attempts || 0) + 1;
      if (attempts >= 5) {
        removeOfflineLead(item.id, orgId);
      } else {
        updateOfflineLead({ ...item, attempts, lastError: err?.message || "Sync network error" }, orgId);
      }
    }
  }

  return { synced, failed, duplicates, items: itemResults };
}
