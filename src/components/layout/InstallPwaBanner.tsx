"use client";

import * as React from "react";
import Image from "next/image";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_STORAGE_KEY = "ridhzo_pwa_install_dismissed_until";
const DISMISS_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function InstallPwaBanner() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [isIosSafari, setIsIosSafari] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if app is already running in standalone PWA mode
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    // Check if dismissed recently
    const dismissedUntil = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (dismissedUntil && Number(dismissedUntil) > Date.now()) return;

    // Detect iOS Safari
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);

    if (isIos && isSafari) {
      setIsIosSafari(true);
      setIsVisible(true);
      return;
    }

    // Android / Chromium beforeinstallprompt handler
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    const handleAppInstalled = () => {
      setIsVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const dismiss = () => {
    setIsVisible(false);
    const expireAt = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, String(expireAt));
    } catch {
      /* ignore storage errors */
    }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsVisible(false);
      }
    } catch (err) {
      console.error("[PWA] install prompt error", err);
    } finally {
      setDeferredPrompt(null);
    }
  };

  if (!isVisible) return null;

  return (
    <aside
      aria-label="Install App Banner"
      className="border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-foreground transition-all sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-sm">
            <Image
              src="/logos/Ridhzo-Logo-Final_AppIcon-Dark.png"
              alt="Ridhzo App Icon"
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="text-xs sm:text-sm">
            <span className="font-semibold text-foreground">Install Ridhzo Mobile App</span>
            <span className="hidden text-muted-foreground sm:inline">
              {" "}
              — Add to home screen for instant lead alerts & 1-tap WhatsApp.
            </span>
            {isIosSafari && (
              <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                Tap <Share className="inline h-3.5 w-3.5" /> then &ldquo;Add to Home Screen&rdquo;.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {deferredPrompt && (
            <Button
              size="sm"
              onClick={handleInstallClick}
              className="h-8 gap-1.5 bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500"
            >
              <Download className="h-3.5 w-3.5" />
              Install App
            </Button>
          )}

          {isIosSafari && (
            <div className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <span>Tap</span>
              <Share className="h-3.5 w-3.5 text-foreground" />
              <span>&rarr; Add to Home Screen</span>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={dismiss}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss install banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
