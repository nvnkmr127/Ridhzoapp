// Ridhzo-branded shell + small building blocks for platform emails (billing, alerts, resets, invites,
// support). Table layout + inline styles because email clients ignore <style>/flex. Not applied to
// tenant-to-lead mail. Helpers take trusted HTML — callers escape user data first.
const LOGO = "/logos/Ridhzo-Logo-Final_Horizontal-Dark.png"; // dark ink, for light mode
const LOGO_DARK = "/logos/Ridhzo-Logo-Final_Horizontal-Light.png"; // white ink, for dark mode

// Dark mode: matched on the inline styles the helpers emit (attribute selectors), so helper markup
// stays plain inline CSS for clients that ignore <style>. Apple Mail/iOS/Gmail apps honour it.
const DARK_CSS = `.lg-d{display:none;}
@media (prefers-color-scheme: dark){
.lg-l{display:none !important;}.lg-d{display:block !important;}
[style*="background:#f4f4f5"]{background:#0b0b0c !important;}
[style*="background:#ffffff"]{background:#17171a !important;}
[style*="background:#fafafa"]{background:#1f1f22 !important;}
[style*="background:#f0f0f2"]{background:#26262a !important;}
[style*="background:#fffbeb"]{background:#2a2410 !important;}
[style*="background:#fef2f2"]{background:#2c1414 !important;}
[style*="background:#f0fdf4"]{background:#10241a !important;}
[style*="color:#111"]{color:#f4f4f5 !important;}
[style*="color:#333"]{color:#d4d4d8 !important;}
[style*="border-bottom:3px solid #111"]{border-bottom-color:#f4f4f5 !important;}
[style*="#e5e5e5"]{border-color:#2e2e33 !important;}
[style*="background:#111"]{background:#f4f4f5 !important;}
[style*="background:#111"] a{color:#111 !important;}
}`;

export function brandedHtml(body: string, base: string, preheader = ""): string {
  const hidden = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f5;">${preheader}${"&nbsp;&zwnj;".repeat(40)}</div>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>${DARK_CSS}</style></head>
<body style="margin:0;padding:0;background:#f4f4f5;">${hidden}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;">
<tr><td style="padding:24px 32px;border-bottom:3px solid #111;"><a href="${base}"><img class="lg-l" src="${base}${LOGO}" alt="Ridhzo" height="36" style="display:block;height:36px;width:auto;border:0;"><img class="lg-d" src="${base}${LOGO_DARK}" alt="" height="36" style="height:36px;width:auto;border:0;"></a></td></tr>
<tr><td style="padding:32px;font-size:15px;line-height:1.6;color:#111;">${body}</td></tr>
<tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e5e5e5;font-size:12px;line-height:1.6;color:#6b7280;">
<strong style="color:#111;">Ridhzo</strong> — Leads move faster<br>
Questions? Write to <a href="mailto:hello@ridhzo.com" style="color:#111;">hello@ridhzo.com</a> · <a href="https://ridhzo.com" style="color:#111;">ridhzo.com</a>
</td></tr></table></td></tr></table></body></html>`;
}

export const mh = (t: string) => `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:#111;">${t}</h1>`;
export const mp = (t: string) => `<p style="margin:0 0 16px;">${t}</p>`;
export const mfine = (t: string) => `<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">${t}</p>`;
export const mbtn = (label: string, href: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#111;border-radius:8px;"><a href="${href}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;">${label}</a></td></tr></table>`;

const TONES = { info: ["#f0f0f2", "#111"], warn: ["#fffbeb", "#f59e0b"], danger: ["#fef2f2", "#dc2626"], ok: ["#f0fdf4", "#16a34a"] } as const;
export const mcallout = (html: string, tone: keyof typeof TONES = "info") =>
  `<div style="margin:0 0 16px;padding:14px 16px;background:${TONES[tone][0]};border-left:4px solid ${TONES[tone][1]};border-radius:6px;font-size:14px;line-height:1.5;">${html}</div>`;

export const mfacts = (rows: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border:1px solid #e5e5e5;border-radius:8px;font-size:14px;">${rows
    .map(([k, v], i) => `<tr><td style="padding:10px 14px;color:#6b7280;${i ? "border-top:1px solid #e5e5e5;" : ""}">${k}</td><td align="right" style="padding:10px 14px;font-weight:600;${i ? "border-top:1px solid #e5e5e5;" : ""}">${v}</td></tr>`)
    .join("")}</table>`;

export const mquote = (t: string) => `<blockquote style="margin:0 0 16px;padding:8px 0 8px 14px;border-left:3px solid #d4d4d8;white-space:pre-wrap;color:#333;">${t}</blockquote>`;

// Small coloured label above a heading ("OVERDUE", "NEW LEAD"…).
export const mtag = (label: string, tone: keyof typeof TONES = "info") =>
  `<div style="margin:0 0 12px;"><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${TONES[tone][0]};border:1px solid ${TONES[tone][1]};color:#111;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">${label}</span></div>`;

// Two-column KPI tiles (table, not CSS grid — Gmail/Outlook drop grid). Values are trusted HTML.
export const mkpis = (items: { label: string; value: string; sub?: string }[]) => {
  const cell = (k: { label: string; value: string; sub?: string }) =>
    `<td width="50%" valign="top" style="padding:6px;"><div style="background:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:14px;"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;">${k.label}</div><div style="font-size:22px;font-weight:800;color:#111;margin-top:4px;">${k.value}</div>${k.sub ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${k.sub}</div>` : ""}</div></td>`;
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(`<tr>${cell(items[i])}${items[i + 1] ? cell(items[i + 1]) : "<td></td>"}</tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px 16px;width:calc(100% + 12px);">${rows.join("")}</table>`;
};

export const mtable = (head: string[], rows: string[][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e5e5;border-radius:8px;font-size:13px;text-align:left;"><tr>${head
    .map((h) => `<th style="padding:8px 12px;background:#fafafa;font-size:11px;text-transform:uppercase;color:#6b7280;">${h}</th>`)
    .join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td style="padding:10px 12px;border-top:1px solid #e5e5e5;">${c}</td>`).join("")}</tr>`).join("")}</table>`;

// Row of quick text links (call / WhatsApp). Links are trusted (built by the caller).
export const mlinks = (items: [string, string][]) =>
  `<p style="margin:0 0 8px;font-size:14px;">${items.map(([l, h]) => `<a href="${h}" style="color:#111;font-weight:600;text-decoration:underline;">${l}</a>`).join("&nbsp;&nbsp;·&nbsp;&nbsp;")}</p>`;
