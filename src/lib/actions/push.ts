"use server";

import { requireAuth } from "@/lib/rbac";
import { PushService } from "@/lib/push/service";
import { ok, actionFail } from "@/lib/actions/result";

export async function subscribePushAction(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const session = await requireAuth();
  try {
    await PushService.saveSubscription(session.user.id, sub);
    return ok({ subscribed: true });
  } catch (e) {
    return actionFail(e);
  }
}

export async function unsubscribePushAction(endpoint: string) {
  const session = await requireAuth();
  try {
    await PushService.removeSubscription(endpoint, session.user.id);
    return ok({ unsubscribed: true });
  } catch (e) {
    return actionFail(e);
  }
}

export async function getVapidPublicKeyAction(): Promise<string> {
  const keys = PushService.getVapidKeys();
  return keys.publicKey;
}
