// Ridhzo-branded shell for platform emails (billing, alerts, resets, invites, support). Table layout +
// inline styles because email clients ignore <style>/flex. Not applied to tenant-to-lead mail.
const LOGO = "/logos/Ridhzo-Logo-Final_Horizontal-Dark.png";

export function brandedHtml(body: string, base: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;">
<tr><td style="padding:24px 32px;border-bottom:3px solid #111;"><a href="${base}"><img src="${base}${LOGO}" alt="Ridhzo" height="36" style="display:block;height:36px;width:auto;border:0;"></a></td></tr>
<tr><td style="padding:8px 8px 16px;font-size:15px;line-height:1.6;">${body}</td></tr>
<tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e5e5e5;font-size:12px;line-height:1.5;color:#6b7280;">
<strong style="color:#111;">Ridhzo</strong> — Leads move faster<br>
Questions? Write to <a href="mailto:hello@ridhzo.com" style="color:#111;">hello@ridhzo.com</a> · <a href="https://ridhzo.com" style="color:#111;">ridhzo.com</a>
</td></tr></table></td></tr></table></body></html>`;
}
