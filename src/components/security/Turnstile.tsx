"use client";

import * as React from "react";

declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void } } }

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// Renders the Cloudflare Turnstile challenge (nothing when no site key is configured) and, off-screen,
// the honeypot input. `onToken` receives the challenge token; `onHoneypot` any value typed into the trap.
export function BotShield({ onToken, onHoneypot }: { onToken: (t: string) => void; onHoneypot: (v: string) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    const mount = () => window.turnstile?.render(ref.current!, { sitekey: SITE_KEY, callback: onToken, "expired-callback": () => onToken("") });
    if (window.turnstile) { mount(); return; }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = mount;
    document.head.appendChild(s);
  }, [onToken]);
  return (
    <>
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>Leave this empty<input type="text" name="website_url" tabIndex={-1} autoComplete="off" onChange={(e) => onHoneypot(e.target.value)} /></label>
      </div>
      {SITE_KEY && <div ref={ref} />}
    </>
  );
}
