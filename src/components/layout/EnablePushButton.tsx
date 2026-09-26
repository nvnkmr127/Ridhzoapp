"use client"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Bell, BellOff } from "lucide-react"
import {
  subscribePushAction,
  unsubscribePushAction,
  getVapidPublicKeyAction,
  sendTestPushAction,
} from "@/lib/actions/push";
import { Send, CheckCircle2 } from "lucide-react";

// VAPID public key is base64url; PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

interface EnablePushButtonProps {
  mode?: "icon" | "button" | "banner";
  allowTest?: boolean;
}

export function EnablePushButton({ mode = "icon", allowTest = false }: EnablePushButtonProps) {
  const { toast } = useToast();
  const [supported, setSupported] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  React.useEffect(() => {
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(ok);
    if (ok) {
      navigator.serviceWorker.getRegistration().then((reg) =>
        reg?.pushManager.getSubscription().then((s) => setEnabled(!!s)),
      ).catch(() => {});
    }
  }, []);

  async function enable() {
    setBusy(true);
    try {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        throw new Error("Push notifications require a secure connection (HTTPS).");
      }
      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        toast({
          variant: "destructive",
          title: "Notifications blocked",
          description: "Notifications are blocked in your browser settings. Please allow notifications for this site to receive alerts.",
        });
        return;
      }
      let key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        key = await getVapidPublicKeyAction();
      }
      key = key?.replace(/^["']|["']$/g, "").trim();
      if (!key) throw new Error("Push notifications are not configured on this server (missing VAPID public key).");

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast({
          variant: "destructive",
          title: "Permission not granted",
          description: "Notification permission was dismissed or blocked.",
        });
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await subscribePushAction({ endpoint: json.endpoint, keys: json.keys });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not enable push", description: res.message });
        return;
      }
      setEnabled(true);
      toast({ title: "Push notifications enabled", description: "You will now receive alerts for new leads." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not enable push", description: e?.message || "Failed to subscribe." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const res = await unsubscribePushAction(sub.endpoint);
        if (!res.ok) {
          toast({ variant: "destructive", title: "Could not turn off push", description: res.message });
          return;
        }
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast({ title: "Push notifications turned off" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not turn off push", description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await sendTestPushAction();
      if (res.ok) {
        toast({
          title: "Test lead alert sent! ⚡",
          description: "Check your device screen for the Jane Doe alert notification.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Could not send test push",
          description: res.message || "Failed to trigger test push.",
        });
      }
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Test push error",
        description: e?.message || "Failed to trigger test push.",
      });
    } finally {
      setTesting(false);
    }
  }

  if (!supported) return null;

  if (mode === "banner") {
    if (enabled) return null;
    return (
      <div className="bg-primary/10 text-primary px-4 py-2 flex items-center justify-center gap-3 text-sm">
        <Bell className="h-4 w-4" />
        <span>Never miss alerts and new leads.</span>
        <Button size="sm" onClick={enable} disabled={busy} className="h-7 text-xs">
          Enable Push Notifications
        </Button>
      </div>
    );
  }

  if (mode === "button") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={enabled ? "outline" : "default"}
          size="sm"
          onClick={enabled ? disable : enable}
          disabled={busy}
          className="gap-1.5"
        >
          {enabled ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Notifications Active (Click to Turn Off)
            </>
          ) : (
            <>
              <Bell className="h-4 w-4" />
              Enable Notifications
            </>
          )}
        </Button>
        {enabled && allowTest && (
          <Button
            variant="secondary"
            size="sm"
            onClick={sendTest}
            disabled={testing}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            {testing ? "Sending..." : "Send Test Alert"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={enabled ? disable : enable}
      disabled={busy}
      title={enabled ? "Push on — click to turn off" : "Enable push notifications"}
    >
      {enabled ? <Bell className="h-5 w-5 text-emerald-500" /> : <BellOff className="h-5 w-5" />}
      <span className="sr-only">{enabled ? "Disable push" : "Enable push"}</span>
    </Button>
  );
}
