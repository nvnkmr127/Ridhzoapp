// Ridhzo email design system — strictly monochrome (ink / paper / greys), editorial in feel:
// serif display type, monospaced labels, hard square edges, big numerals, ledger rows.
// Table layout + inline styles because email clients ignore <style>/flex/grid. Each helper returns
// trusted HTML — callers escape user data first. Platform mail only (not tenant-to-lead mail).
//
// Tokens (keep to these so dark mode can remap them): ink #0a0a0a · paper #ffffff · tint #f2f2f2 ·
// mute #6b6b6b · line #d9d9d9 · page #ececec · header band #000000.
const LOGO = "/logos/Ridhzo-Logo-Final_Horizontal-Light.png"; // white ink → sits on the black band

// Web fonts load where the client allows it (Apple Mail, iOS, some Android); Gmail/Outlook fall back
// to Helvetica/Arial + Courier, which still suit the design. Swap the three names here to restyle.
const FONTS_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Space+Grotesk:wght@500;700&family=Space+Mono:wght@400;700&display=swap";
const SERIF = "'Space Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif"; // display (name kept: used everywhere)
const MONO = "'Space Mono','SFMono-Regular',Menlo,Consolas,'Courier New',monospace";
const SANS = "Inter,'Helvetica Neue',Helvetica,Arial,sans-serif";

// Dark mode swaps ink and paper. Matched on the inline styles the helpers emit, so the markup stays
// plain inline CSS for clients that ignore <style>. Header band (#000000) is deliberately untouched.
const DARK_CSS = `@media (prefers-color-scheme: dark){
[style*="background:#ececec"]{background:#000000 !important;}
[style*="background:#ffffff"]{background:#111111 !important;}
[style*="background:#f2f2f2"]{background:#1c1c1c !important;}
[style*="background:#0a0a0a"]{background:#f2f2f2 !important;}
[style*="color:#0a0a0a"]{color:#f2f2f2 !important;}
[style*="color:#ffffff"]{color:#0a0a0a !important;}
[style*="color:#6b6b6b"]{color:#a3a3a3 !important;}
[style*="#d9d9d9"]{border-color:#3a3a3a !important;}
[style*="solid #0a0a0a"]{border-color:#f2f2f2 !important;}
[style*="dashed #0a0a0a"]{border-color:#f2f2f2 !important;}
[style*="double #0a0a0a"]{border-color:#f2f2f2 !important;}
}`;

export function brandedHtml(body: string, base: string, preheader = ""): string {
  const hidden = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ececec;">${preheader}${"&nbsp;&zwnj;".repeat(40)}</div>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><link href="${FONTS_URL}" rel="stylesheet"><style>${DARK_CSS}</style></head>
<body style="margin:0;padding:0;background:#ececec;">${hidden}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ececec;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #0a0a0a;font-family:${SANS};color:#0a0a0a;">
<tr><td style="background:#000000;padding:22px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><a href="${base}"><img src="${base}${LOGO}" alt="Ridhzo" height="30" style="display:block;height:30px;width:auto;border:0;"></a></td>
<td align="right" style="font-family:${MONO};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#ffffff;">Leads move faster</td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px 32px;font-size:15px;line-height:1.65;color:#0a0a0a;font-family:${SANS};">${body}</td></tr>
<tr><td style="padding:0 32px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px dashed #0a0a0a;"><tr><td style="padding-top:18px;font-family:${MONO};font-size:11px;line-height:1.7;color:#6b6b6b;">
<span style="color:#0a0a0a;font-weight:700;">RIDHZO</span> — lead management that moves at your speed.<br>
<a href="mailto:hello@ridhzo.com" style="color:#0a0a0a;">hello@ridhzo.com</a> &nbsp;/&nbsp; <a href="https://ridhzo.com" style="color:#0a0a0a;">ridhzo.com</a>
</td></tr></table></td></tr>
</table></td></tr></table></body></html>`;
}

// ── Type ────────────────────────────────────────────────────────────────────────────────────────
export const mh = (t: string) => `<h1 style="margin:0 0 18px;font-family:${SERIF};font-size:32px;line-height:1.15;font-weight:700;letter-spacing:-.5px;color:#0a0a0a;">${t}</h1>`;
export const mp = (t: string) => `<p style="margin:0 0 16px;">${t}</p>`;
export const mfine = (t: string) => `<p style="margin:26px 0 0;font-family:${MONO};font-size:11px;line-height:1.7;color:#6b6b6b;">${t}</p>`;
// Bracketed mono label above a headline: [ OVERDUE ].  (tone kept for call-site compatibility; monochrome now.)
type Tone = "info" | "warn" | "danger" | "ok";
export const mtag = (label: string, _tone: Tone = "info") =>
  `<p style="margin:0 0 14px;font-family:${MONO};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#6b6b6b;">[&nbsp;<span style="color:#0a0a0a;font-weight:700;">${label}</span>&nbsp;]</p>`;

export const mbtn = (label: string, href: string, ghost = false) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;"><tr><td style="${ghost ? "border:1px solid #0a0a0a;" : "background:#0a0a0a;"}"><a href="${href}" style="display:inline-block;padding:14px 26px;font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;color:${ghost ? "#0a0a0a" : "#ffffff"};">${label}&nbsp;&nbsp;→</a></td></tr></table>`;

// Callout: info = ruled note, warn = dashed frame, danger = inverted block, ok = tinted with a tick.
export const mcallout = (html: string, tone: Tone = "info") => {
  const box = {
    info: "background:#f2f2f2;border-left:4px solid #0a0a0a;color:#0a0a0a;",
    ok: "background:#f2f2f2;border:1px solid #d9d9d9;color:#0a0a0a;",
    warn: "border:2px dashed #0a0a0a;color:#0a0a0a;",
    danger: "background:#0a0a0a;color:#ffffff;",
  }[tone];
  return `<div style="margin:0 0 18px;padding:16px 18px;font-size:14px;line-height:1.6;${box}">${tone === "ok" ? "✓&nbsp; " : ""}${html}</div>`;
};

// ── Data ────────────────────────────────────────────────────────────────────────────────────────
// Ledger: mono rows separated by dashed rules, like a till receipt.
export const mfacts = (rows: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border-top:2px solid #0a0a0a;font-size:13px;">${rows
    .map(([k, v]) => `<tr><td style="padding:11px 0;border-bottom:1px dashed #d9d9d9;font-family:${MONO};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6b6b;">${k}</td><td align="right" style="padding:11px 0;border-bottom:1px dashed #d9d9d9;font-family:${MONO};font-weight:700;color:#0a0a0a;">${v}</td></tr>`)
    .join("")}</table>`;

// Big-numeral tiles, two per row, sharing hairline borders.
export const mkpis = (items: { label: string; value: string; sub?: string }[]) => {
  const cell = (k: { label: string; value: string; sub?: string }, i: number) =>
    `<td width="50%" valign="top" style="padding:18px;border:1px solid #d9d9d9;${i % 2 ? "border-left:0;" : ""}"><div style="font-family:${MONO};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6b6b6b;">${k.label}</div><div style="font-family:${SERIF};font-size:34px;line-height:1.1;font-weight:700;margin-top:8px;color:#0a0a0a;">${k.value}</div>${k.sub ? `<div style="font-family:${MONO};font-size:11px;color:#6b6b6b;margin-top:6px;">${k.sub}</div>` : ""}</td>`;
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(`<tr>${cell(items[i], 0)}${items[i + 1] ? cell(items[i + 1], 1) : `<td style="border:1px solid #d9d9d9;border-left:0;"></td>`}</tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${rows.join("")}</table>`;
};

export const mtable = (head: string[], rows: string[][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-top:2px solid #0a0a0a;font-size:13px;text-align:left;"><tr>${head
    .map((h) => `<th style="padding:10px 10px 10px 0;border-bottom:1px solid #0a0a0a;font-family:${MONO};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6b6b6b;font-weight:400;">${h}</th>`)
    .join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td style="padding:12px 10px 12px 0;border-bottom:1px dashed #d9d9d9;vertical-align:top;">${c}</td>`).join("")}</tr>`).join("")}</table>`;

// ── Signature blocks (each email type picks its own) ─────────────────────────────────────────────
// Giant numeral on a solid block: "3", "80%", "₹1,180".
export const mhero = (big: string, caption: string, inverted = true) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;${inverted ? "background:#0a0a0a;" : "border:2px solid #0a0a0a;"}"><tr><td align="center" style="padding:30px 20px;"><div style="font-family:${SERIF};font-size:72px;line-height:1;font-weight:700;letter-spacing:-2px;color:${inverted ? "#ffffff" : "#0a0a0a"};">${big}</div><div style="margin-top:12px;font-family:${MONO};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${inverted ? "#ffffff" : "#6b6b6b"};">${caption}</div></td></tr></table>`;

// Progress meter: filled = ink, remainder = tint. pct 0–100.
export const mbar = (pct: number, left: string, right: string) => {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr>
<td style="font-family:${MONO};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6b6b6b;padding-bottom:8px;">${left}</td><td align="right" style="font-family:${MONO};font-size:11px;font-weight:700;padding-bottom:8px;color:#0a0a0a;">${right}</td></tr>
<tr><td colspan="2"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #0a0a0a;"><tr>${p > 0 ? `<td width="${p}%" style="background:#0a0a0a;height:18px;font-size:0;line-height:0;">&nbsp;</td>` : ""}${p < 100 ? `<td style="background:#f2f2f2;height:18px;font-size:0;line-height:0;">&nbsp;</td>` : ""}</tr></table></td></tr></table>`;
};

// Countdown boxes: [["3","days"],["04","hrs"]…]
export const mcount = (items: [string, string][]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr>${items
    .map(([n, l]) => `<td style="padding:0 10px 0 0;"><table role="presentation" cellpadding="0" cellspacing="0" style="border:2px solid #0a0a0a;"><tr><td align="center" style="padding:14px 22px;"><div style="font-family:${SERIF};font-size:44px;line-height:1;font-weight:700;color:#0a0a0a;">${n}</div><div style="margin-top:6px;font-family:${MONO};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6b6b6b;">${l}</div></td></tr></table></td>`)
    .join("")}</tr></table>`;

// Numbered steps: 01 / 02 / 03 in big serif numerals.
export const msteps = (items: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${items
    .map(([t, d], i) => `<tr><td width="64" valign="top" style="padding:14px 0;border-top:${i ? "1px dashed #d9d9d9" : "2px solid #0a0a0a"};font-family:${SERIF};font-size:34px;line-height:1;font-weight:700;color:#0a0a0a;">0${i + 1}</td><td valign="top" style="padding:14px 0;border-top:${i ? "1px dashed #d9d9d9" : "2px solid #0a0a0a"};"><div style="font-weight:700;">${t}</div><div style="color:#6b6b6b;font-size:14px;">${d}</div></td></tr>`)
    .join("")}</table>`;

// Pass / ticket with a tear line: top label, huge name, small print.
export const mticket = (top: string, big: string, sub: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:2px solid #0a0a0a;"><tr><td style="padding:22px 24px 18px;"><div style="font-family:${MONO};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#6b6b6b;">${top}</div><div style="margin-top:8px;font-family:${SERIF};font-size:34px;line-height:1.1;font-weight:700;color:#0a0a0a;">${big}</div></td></tr><tr><td style="padding:14px 24px;border-top:2px dashed #0a0a0a;font-family:${MONO};font-size:11px;letter-spacing:1px;color:#6b6b6b;">${sub}</td></tr></table>`;

// Solid card, like a membership card: kicker, big plan name, footer line.
export const mcard = (kicker: string, big: string, foot: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:#0a0a0a;"><tr><td style="padding:26px 28px 6px;font-family:${MONO};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#ffffff;">${kicker}</td></tr><tr><td style="padding:0 28px;font-family:${SERIF};font-size:46px;line-height:1.15;font-weight:700;color:#ffffff;">${big}</td></tr><tr><td style="padding:14px 28px 26px;font-family:${MONO};font-size:11px;letter-spacing:1px;color:#ffffff;">${foot}</td></tr></table>`;

// Boxed mono string — a URL or code the reader may need to copy.
export const mkey = (label: string, text: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:1px solid #0a0a0a;"><tr><td style="padding:12px 14px;"><div style="font-family:${MONO};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6b6b6b;">${label}</div><div style="margin-top:6px;font-family:${MONO};font-size:12px;word-break:break-all;color:#0a0a0a;">${text}</div></td></tr></table>`;

// Bordered stamp: PAID / ENDED / NOTICE.
export const mstamp = (text: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="border:3px double #0a0a0a;padding:8px 18px;font-family:${MONO};font-size:16px;font-weight:700;letter-spacing:5px;text-transform:uppercase;color:#0a0a0a;">${text}</td></tr></table>`;

// Before / after: two columns of short lines.
export const mcompare = (a: { title: string; items: string[] }, b: { title: string; items: string[] }) => {
  const col = (c: { title: string; items: string[] }, solid: boolean) =>
    `<td width="50%" valign="top" style="padding:16px;${solid ? "background:#0a0a0a;color:#ffffff;" : "border:1px solid #0a0a0a;color:#0a0a0a;"}"><div style="font-family:${MONO};font-size:10px;letter-spacing:2px;text-transform:uppercase;${solid ? "color:#ffffff;" : "color:#6b6b6b;"}">${c.title}</div>${c.items.map((i) => `<div style="margin-top:8px;font-size:13px;${solid ? "color:#ffffff;" : "color:#0a0a0a;"}">${i}</div>`).join("")}</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr>${col(a, false)}${col(b, true)}</tr></table>`;
};

// Speech-style quote with an oversized mark.
export const mquote = (t: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td width="44" valign="top" style="font-family:${SERIF};font-size:64px;line-height:.8;font-weight:700;color:#0a0a0a;">“</td><td style="padding:4px 0 4px 4px;border-bottom:1px solid #0a0a0a;font-family:${SERIF};font-size:17px;line-height:1.6;white-space:pre-wrap;color:#0a0a0a;">${t}</td></tr></table>`;

// Quick text links row.
export const mlinks = (items: [string, string][]) =>
  `<p style="margin:0 0 8px;font-family:${MONO};font-size:12px;">${items.map(([l, h]) => `<a href="${h}" style="color:#0a0a0a;font-weight:700;text-decoration:underline;">${l}</a>`).join("&nbsp;&nbsp;/&nbsp;&nbsp;")}</p>`;

// Compact alert header: a solid square glyph beside a mono label and the headline.
export const mping = (glyph: string, label: string, headline: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td width="64" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" style="background:#0a0a0a;"><tr><td align="center" width="56" height="56" style="width:56px;height:56px;font-family:${MONO};font-size:26px;font-weight:700;color:#ffffff;">${glyph}</td></tr></table></td><td valign="middle" style="padding-left:14px;"><div style="font-family:${MONO};font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#6b6b6b;">${label}</div><div style="margin-top:4px;font-family:${SERIF};font-size:24px;line-height:1.2;font-weight:700;color:#0a0a0a;">${headline}</div></td></tr></table>`;
