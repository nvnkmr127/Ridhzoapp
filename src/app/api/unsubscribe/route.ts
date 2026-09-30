import { NextRequest } from "next/server";
import { appUrl } from "@/lib/mail/mailer";
import { brandedHtml, mh, mp, mbtn, mfine, mtag } from "@/lib/mail/layout";
import { applyUnsubscribe, unsubscribeLabel, verifyUnsubscribe } from "@/lib/mail/unsubscribe";

// Public (outside the auth middleware matcher). GET shows a confirm page — never unsubscribes on GET,
// because mail scanners prefetch links. POST applies it: from that page's form, or as the
// List-Unsubscribe-Post one-click request mail apps send with the same query string.
export const dynamic = "force-dynamic";

const page = (body: string, status = 200) =>
  new Response(brandedHtml(body, appUrl("").replace(/\/$/, "")), { status, headers: { "content-type": "text/html; charset=utf-8" } });

function params(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  return { e: q.get("e") ?? "", c: q.get("c") ?? "", t: q.get("t") ?? "" };
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(req: NextRequest) {
  const { e, c, t } = params(req);
  if (!verifyUnsubscribe(e, c, t)) return page(mtag("Link expired") + mh("That link isn't valid.") + mp("It may have been copied incorrectly. Use the link in your most recent email, or write to hello@ridhzo.com."), 400);
  return page(
    mtag("Email preferences") +
      mh("Stop these emails?") +
      mp(`You'll no longer get <strong>${unsubscribeLabel(c)}</strong> at <strong>${esc(e)}</strong>.`) +
      `<form method="post" action="${esc(req.nextUrl.pathname + req.nextUrl.search)}"><button type="submit" style="background:#0a0a0a;color:#ffffff;border:0;padding:14px 26px;font:700 12px 'Space Mono',Menlo,monospace;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">Confirm unsubscribe&nbsp;&nbsp;→</button></form>` +
      mfine("Changed your mind? Simply close this page — nothing has changed yet."),
  );
}

export async function POST(req: NextRequest) {
  const { e, c, t } = params(req);
  if (!verifyUnsubscribe(e, c, t)) return new Response("Invalid link", { status: 400 });
  await applyUnsubscribe(e, c);
  if (req.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
    return page(mtag("Done") + mh("You're unsubscribed.") + mp(`We've stopped <strong>${unsubscribeLabel(c)}</strong> for <strong>${esc(e)}</strong>. Important account emails (billing, security) will still reach you.`) + mbtn("Back to Ridhzo", appUrl("/")));
  }
  return new Response("ok"); // one-click from a mail app
}
