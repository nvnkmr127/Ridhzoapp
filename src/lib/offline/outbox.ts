import { createLeadAction } from "@/lib/actions/leads";

export const OFFLINE_OUTBOX_STORAGE_KEY = "ridhzo_offline_leads_outbox";
export const OFFLINE_OUTBOX_EVENT = "ridhzo_offline_outbox_change";

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
  createdAt: number;
  attempts: number;
  lastError?: string;
}

function notifyOutboxChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OFFLINE_OUTBOX_EVENT));
}

export function getOfflineOutbox(): OfflineLeadItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineLeadItem[];
  } catch {
    return [];
  }
}

export function enqueueOfflineLead(payload: OfflineLeadPayload): OfflineLeadItem {
  const current = getOfflineOutbox();
  const newItem: OfflineLeadItem = {
    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  };
  const updated = [newItem, ...current];
  try {
    localStorage.setItem(OFFLINE_OUTBOX_STORAGE_KEY, JSON.stringify(updated));
    notifyOutboxChange();
  } catch (err) {
    console.error("[OfflineOutbox] failed to save lead offline", err);
  }
  return newItem;
}

export function removeOfflineLead(id: string): void {
  const current = getOfflineOutbox();
  const filtered = current.filter((item) => item.id !== id);
  try {
    localStorage.setItem(OFFLINE_OUTBOX_STORAGE_KEY, JSON.stringify(filtered));
    notifyOutboxChange();
  } catch (err) {
    console.error("[OfflineOutbox] failed to remove lead", err);
  }
}

export function clearOfflineOutbox(): void {
  try {
    localStorage.removeItem(OFFLINE_OUTBOX_STORAGE_KEY);
    notifyOutboxChange();
  } catch (err) {
    console.error("[OfflineOutbox] failed to clear outbox", err);
  }
}

export interface SyncResults {
  synced: number;
  failed: number;
  items: { id: string; success: boolean; error?: string }[];
}

export async function flushOfflineOutbox(
  onLeadSynced?: (lead: OfflineLeadItem) => void,
): Promise<SyncResults> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { synced: 0, failed: 0, items: [] };
  }

  const items = getOfflineOutbox();
  if (items.length === 0) {
    return { synced: 0, failed: 0, items: [] };
  }

  let synced = 0;
  let failed = 0;
  const itemResults: { id: string; success: boolean; error?: string }[] = [];

  for (const item of items) {
    try {
      const res = await createLeadAction(item.payload);
      if (res.ok) {
        removeOfflineLead(item.id);
        synced++;
        itemResults.push({ id: item.id, success: true });
        onLeadSynced?.(item);
      } else {
        // If it was rejected because lead already exists, drop it so it does not block the queue
        const isDuplicate = res.message?.toLowerCase().includes("already exists");
        if (isDuplicate) {
          removeOfflineLead(item.id);
          synced++;
          itemResults.push({ id: item.id, success: true });
        } else {
          failed++;
          itemResults.push({ id: item.id, success: false, error: res.message });
        }
      }
    } catch (err: any) {
      failed++;
      itemResults.push({ id: item.id, success: false, error: err?.message || "Sync network error" });
    }
  }

  return { synced, failed, items: itemResults };
}
