import { db } from "@/db";
import { emailSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret";
import { UserFacingError } from "@/lib/actions/result";

// The whole form. Blank strings arrive as null; `smtpPassword` blank/undefined = keep the stored one.
export interface EmailSettingsInput {
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassword?: string;
  enabled: boolean;
}

// What the settings UI sees — never the password itself, only whether a usable one is stored.
export interface EmailSettingsView {
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  hasPassword: boolean;
  passwordUnreadable: boolean; // stored but can't be decrypted (key rotated) — must be re-entered
  enabled: boolean;
  verifiedAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName: string | null;
  fromEmail: string;
  replyTo: string | null;
}

type Mail = { to: string; subject: string; html: string };
type Row = typeof emailSettings.$inferSelect;

// Port 465 is implicit TLS; everything else (587, 25, 2525) negotiates STARTTLS.
export const isImplicitTls = (port: number) => port === 465;

const REQUIRED = { smtpHost: "Host", smtpPort: "Port", smtpUser: "Username", smtpPassword: "Password", fromEmail: "From email" } as const;

// Which required fields are empty, keyed like the form (for inline errors).
export function missingFields(c: Partial<Record<keyof typeof REQUIRED, unknown>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, label] of Object.entries(REQUIRED)) if (!c[k as keyof typeof REQUIRED]) out[k] = `${label} is required to send.`;
  return out;
}

function missingError(missing: Record<string, string>) {
  const e = new UserFacingError(`Fill in ${Object.keys(missing).map((k) => REQUIRED[k as keyof typeof REQUIRED].toLowerCase()).join(", ")}.`);
  (e as UserFacingError & { fieldErrors: Record<string, string> }).fieldErrors = missing;
  return e;
}

export class EmailSettingsService {
  static async getRaw(organizationId: string): Promise<Row | null> {
    const [row] = await db.select().from(emailSettings).where(eq(emailSettings.organizationId, organizationId)).limit(1);
    return row ?? null;
  }

  static toView(row: Row | null): EmailSettingsView {
    const unreadable = !!row?.smtpPasswordEnc && decryptSecret(row.smtpPasswordEnc) === null;
    return {
      fromName: row?.fromName ?? null,
      fromEmail: row?.fromEmail ?? null,
      replyTo: row?.replyTo ?? null,
      smtpHost: row?.smtpHost ?? null,
      smtpPort: row?.smtpPort ?? null,
      smtpUser: row?.smtpUser ?? null,
      hasPassword: !!row?.smtpPasswordEnc && !unreadable,
      passwordUnreadable: unreadable,
      enabled: row?.enabled === 1,
      verifiedAt: row?.verifiedAt ?? null,
      lastError: row?.lastError ?? null,
      lastErrorAt: row?.lastErrorAt ?? null,
    };
  }

  static async getView(organizationId: string): Promise<EmailSettingsView> {
    return this.toView(await this.getRaw(organizationId));
  }

  // True when saving `input` would change what we connect with / send as — a previous test no longer counts.
  static credentialsChanged(existing: Row | null, input: EmailSettingsInput): boolean {
    if (!existing) return true;
    return (
      !!input.smtpPassword ||
      input.smtpHost !== existing.smtpHost ||
      input.smtpPort !== existing.smtpPort ||
      input.smtpUser !== existing.smtpUser ||
      input.fromEmail !== existing.fromEmail
    );
  }

  // Writes the form as given (blank = cleared), except a blank password keeps the stored one.
  // `verified` marks these exact credentials as tested; otherwise a credential change resets it.
  static async upsert(organizationId: string, input: EmailSettingsInput, opts: { verified?: boolean } = {}) {
    const existing = await this.getRaw(organizationId);
    const changed = this.credentialsChanged(existing, input);
    const values = {
      organizationId,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      replyTo: input.replyTo,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpPort && isImplicitTls(input.smtpPort) ? 1 : 0,
      smtpUser: input.smtpUser,
      smtpPasswordEnc: input.smtpPassword ? encryptSecret(input.smtpPassword) : existing?.smtpPasswordEnc ?? null,
      enabled: input.enabled ? 1 : 0,
      verifiedAt: opts.verified ? new Date() : changed ? null : existing?.verifiedAt ?? null,
      // A fresh test or new credentials supersede the old failure.
      ...(opts.verified || changed ? { lastError: null, lastErrorAt: null } : {}),
      updatedAt: new Date(),
    };
    await db.insert(emailSettings).values(values).onConflictDoUpdate({ target: emailSettings.organizationId, set: values });
    return this.getView(organizationId);
  }

  static async remove(organizationId: string) {
    await db.delete(emailSettings).where(eq(emailSettings.organizationId, organizationId));
  }

  // Form values + the stored password (when the form's is blank) → a complete config, or throws with
  // per-field errors. Lets a test run against UNSAVED edits.
  static async resolveConfig(organizationId: string, input: EmailSettingsInput): Promise<SmtpConfig> {
    let pass = input.smtpPassword || null;
    if (!pass) {
      const enc = (await this.getRaw(organizationId))?.smtpPasswordEnc;
      pass = enc ? decryptSecret(enc) : null;
    }
    const missing = missingFields({ ...input, smtpPassword: pass });
    if (Object.keys(missing).length) throw missingError(missing);
    return {
      host: input.smtpHost!,
      port: input.smtpPort!,
      user: input.smtpUser!,
      pass: pass!,
      fromName: input.fromName,
      fromEmail: input.fromEmail!,
      replyTo: input.replyTo,
    };
  }

  // The one place an SMTP connection is made: SSRF-checked, pinned to the checked IP, with timeouts
  // so a firewalled host fails in seconds instead of hanging for minutes.
  // ponytail: one connection per message; pool per org if sequence batches get large.
  static async deliver(cfg: SmtpConfig, mail: Mail): Promise<void> {
    const { resolvePublicHost } = await import("@/lib/webhooks/ssrf");
    const address = await resolvePublicHost(cfg.host);
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport({
      host: address,
      port: cfg.port,
      secure: isImplicitTls(cfg.port),
      auth: { user: cfg.user, pass: cfg.pass },
      tls: { servername: cfg.host }, // certificate is checked against the hostname, not the IP
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transport.sendMail({
      from: cfg.fromName ? { name: cfg.fromName, address: cfg.fromEmail } : cfg.fromEmail,
      replyTo: cfg.replyTo ?? undefined,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
    });
  }

  static async sendTest(cfg: SmtpConfig, to: string): Promise<void> {
    await this.deliver(cfg, {
      to,
      subject: "Ridhzo SMTP test",
      html: "<p>Your Ridhzo SMTP settings are working. 🎉</p>",
    });
  }

  // Org-scoped send. Returns false when this org hasn't turned its own server on (caller uses the
  // shared transport). When it IS on, failures throw — never silently re-sent from the platform
  // address — and are recorded so the settings page can show them.
  static async sendForOrg(organizationId: string, mail: Mail): Promise<boolean> {
    const row = await this.getRaw(organizationId);
    if (!row || row.enabled !== 1) return false;
    try {
      const pass = row.smtpPasswordEnc ? decryptSecret(row.smtpPasswordEnc) : null;
      if (!pass) throw new Error("the stored SMTP password can't be read — re-enter it in Settings → Email sending");
      const cfg = await this.resolveConfig(organizationId, { ...this.toView(row), smtpPassword: pass });
      await this.deliver(cfg, mail);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "SMTP send failed";
      await db.update(emailSettings).set({ lastError: msg.slice(0, 1000), lastErrorAt: new Date() }).where(eq(emailSettings.organizationId, organizationId));
      throw new UserFacingError(`Your email server couldn't send this: ${msg}`);
    }
    if (row.lastError) {
      await db.update(emailSettings).set({ lastError: null, lastErrorAt: null }).where(eq(emailSettings.organizationId, organizationId));
    }
    return true;
  }
}
