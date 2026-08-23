import { Resend } from "resend";

/*
 * Outbound email.
 *
 * Two transports behind one function:
 *
 *   resend   real delivery, when RESEND_API_KEY is set
 *   console  logs the message and reports itself as undelivered
 *
 * The console transport is not a stub to be replaced later — it is how the
 * product behaves honestly with no mail configured. An invitation that
 * silently vanishes into an unconfigured transport is worse than one that
 * plainly says "not sent, here is the link": the first looks like it worked.
 * So `send` always reports whether it actually delivered, and callers surface
 * that rather than assuming.
 */

export type SendResult =
  | { delivered: true; id: string }
  | { delivered: false; reason: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/*
 * Reserved top-level domains that can never resolve.
 *
 * RFC 2606 and RFC 6761 set these aside precisely so software can use them
 * without touching the real internet, and `.demo` is where the seeded
 * organisation lives so that eighteen fake logins cannot mail eighteen real
 * strangers.
 *
 * Mail addressed to them does not bounce quietly. Every attempt is a hard
 * bounce recorded against the SENDING domain, and enough of them get
 * nexus.techspecialistlimited.com throttled or suspended by Resend — so the
 * scheduler running every hour against seeded data would slowly destroy the
 * deliverability of the real Chairman's briefing. Refusing them locally costs
 * nothing and is the difference between a demo dataset and a liability.
 */
const UNROUTABLE_TLDS = new Set([
  "demo",
  "test",
  "example",
  "invalid",
  "local",
  "localhost",
]);

/**
 * A single inbox that all mail is diverted to, when set.
 *
 * Seeded identities live on a reserved TLD so they cannot mail real people,
 * which is right — and it also means you can never SEE what the product
 * actually sends. NEXUS_MAIL_REDIRECT resolves both: every message is composed
 * exactly as it would be in production, addressed to whoever it is really for,
 * and then handed to one inbox with a banner naming the intended recipients.
 *
 * Deliberately not a code branch inside each caller. A redirect implemented
 * per-feature is one somebody forgets, and the failure mode of forgetting is
 * mailing a stranger from a demo dataset.
 */
export function mailRedirect(): string | null {
  const raw = process.env.NEXUS_MAIL_REDIRECT?.trim();
  return raw ? raw : null;
}

/** Whether an address can be delivered to at all, before spending a send on it. */
export function isDeliverable(address: string): boolean {
  const at = address.lastIndexOf("@");
  if (at < 1 || at === address.length - 1) return false;
  const domain = address.slice(at + 1).toLowerCase();
  if (!domain.includes(".")) return false;
  return !UNROUTABLE_TLDS.has(domain.slice(domain.lastIndexOf(".") + 1));
}

/**
 * Who mail comes from.
 *
 * Resend only accepts a verified domain, with one exception:
 * onboarding@resend.dev, which can send ONLY to the address that owns the
 * Resend account. That is enough to test an invitation to yourself and not
 * enough to invite a colleague — a distinction worth knowing before you
 * conclude the feature is broken.
 */
const DEFAULT_FROM = "NEXUS <onboarding@resend.dev>";

function fromAddress(): string | { invalid: string } {
  const raw = process.env.EMAIL_FROM?.trim();
  if (!raw) return DEFAULT_FROM;

  /*
   * A bare domain here is an easy mistake — Resend shows you the domain, so
   * that is what gets pasted. It fails with a generic validation error that
   * says nothing about which variable is wrong, so it is caught here instead
   * and named.
   */
  const address = raw.match(/<([^>]+)>/)?.[1] ?? raw;
  if (!address.includes("@")) {
    return {
      invalid:
        `EMAIL_FROM is "${raw}", which is a domain rather than an address. ` +
        `Use a full address, e.g. NEXUS <nexus@${address}>.`,
    };
  }
  return raw;
}

export async function send(message: {
  /** One address, or several — passed to Resend as a list, never comma-joined. */
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const to = (Array.isArray(message.to) ? message.to : [message.to])
    .map((a) => a.trim())
    .filter(Boolean);

  if (to.length === 0) {
    return { delivered: false, reason: "No recipient address." };
  }

  /*
   * Divert before the routability check, not after: the whole point is to see
   * mail addressed to seeded identities that could never receive it.
   */
  const redirect = mailRedirect();
  const intendedFor = redirect ? to.slice() : [];
  const to2 = redirect ? [redirect] : to;

  const undeliverable = to2.filter((a) => !isDeliverable(a));
  if (undeliverable.length > 0) {
    /*
     * Named rather than swallowed. On seeded data this fires constantly and
     * means "working as intended"; on real data it means somebody has a typo
     * in a profile, and that is worth being able to read in a log.
     */
    return {
      delivered: false,
      reason: `Not a routable address: ${undeliverable.join(", ")}.`,
    };
  }

  const banner = redirect
    ? {
        text:
          `[NEXUS test delivery] Intended for ${intendedFor.join(", ")}.` +
          `
Diverted here by NEXUS_MAIL_REDIRECT. Unset it to send for real.

`,
        html:
          `<div style="margin:0 0 16px;padding:10px 14px;background:#fff6e5;` +
          `border:1px solid #f0c674;border-radius:8px;font:13px/1.5 ` +
          `-apple-system,Segoe UI,sans-serif;color:#6b4b00">` +
          `<strong>Test delivery.</strong> Intended for ` +
          `${escapeHtml(intendedFor.join(", "))}. Diverted here by ` +
          `NEXUS_MAIL_REDIRECT.</div>`,
      }
    : { text: "", html: "" };

  const subject = redirect ? `[test] ${message.subject}` : message.subject;
  const text = banner.text + message.text;
  const html = banner.html + message.html;

  if (!emailConfigured()) {
    console.info(
      `[nexus:email] not sent (RESEND_API_KEY unset)\n` +
        `  to:      ${to2.join(", ")}\n` +
        `  subject: ${subject}\n` +
        `  ${text.split("\n").join("\n  ")}`,
    );
    return { delivered: false, reason: "Email is not configured on this server." };
  }

  const from = fromAddress();
  if (typeof from !== "string") {
    return { delivered: false, reason: from.invalid };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from,
      to: to2,
      subject,
      html,
      text,
    });

    if (error) {
      // Resend's own wording is specific and useful ("domain is not verified",
      // "you can only send to your own address"), so it is passed through
      // rather than flattened into "could not send".
      return { delivered: false, reason: error.message };
    }
    return { delivered: true, id: data?.id ?? "" };
  } catch (err) {
    return {
      delivered: false,
      reason: err instanceof Error ? err.message : "Unknown mail error.",
    };
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const ROLE_SENTENCE: Record<string, string> = {
  staff: "You will file a short standup each week and see your own progress.",
  lead: "You will file a standup and see how your unit is doing.",
  hr: "You will see who has reported across the organisation, and who has not.",
  executive: "You will receive the weekly brief and can drill into any unit.",
  admin: "You will manage accounts, units and invitations.",
};

function shell(bodyHtml: string): string {
  /*
   * Deliberately plain: tables, inline styles, no images, no web fonts.
   * Every fashionable technique in a marketing email is the thing Outlook
   * strips, and this message only has to survive long enough to be clicked.
   */
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#12151c">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e6eb">
    <tr><td style="padding:28px 28px 8px">
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;font-weight:600">NEXUS</div>
    </td></tr>
    <tr><td style="padding:0 28px 28px">${bodyHtml}</td></tr>
  </table>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#8a91a0;text-align:center">
    You received this because someone at your organisation invited you to NEXUS.
    If you were not expecting it, you can ignore this message.
  </p>
</body></html>`;
}

export function invitationEmail(input: {
  orgName: string;
  inviterName: string | null;
  role: string;
  departmentName: string | null;
  link: string;
}) {
  const { orgName, inviterName, role, departmentName, link } = input;
  const who = inviterName ? `${inviterName} has invited you` : "You have been invited";
  const roleLine = ROLE_SENTENCE[role] ?? "";
  const unit = departmentName ? ` on the ${departmentName} team` : "";

  const subject = `${who.replace("You have been", "You are")} to NEXUS — ${orgName}`;

  const text = [
    `${who} to join ${orgName} on NEXUS.`,
    "",
    `Your role: ${role}${unit}.`,
    roleLine,
    "",
    "NEXUS collects a short weekly standup and sends the organisation's progress",
    "to leadership automatically, so nobody has to compile it by hand.",
    "",
    "Accept your invitation:",
    link,
    "",
    "This link is for you alone and expires in 14 days.",
  ].join("\n");

  const html = shell(`
    <h1 style="margin:12px 0 8px;font-size:22px;font-weight:600;line-height:1.3">
      ${who} to ${escapeHtml(orgName)}
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3c4250">
      NEXUS collects a short weekly standup and sends the organisation&rsquo;s
      progress to leadership automatically, so nobody has to compile it by hand.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f7f8fa;border-radius:8px;width:100%">
      <tr><td style="padding:14px 16px;font-size:14px;line-height:1.6;color:#3c4250">
        <strong style="color:#12151c">Your role:</strong> ${escapeHtml(role)}${escapeHtml(unit)}<br>
        <span style="color:#6b7280">${escapeHtml(roleLine)}</span>
      </td></tr>
    </table>
    <a href="${escapeAttr(link)}"
       style="display:inline-block;padding:12px 22px;background:#3b6cf5;color:#ffffff;
              text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">
      Accept invitation
    </a>
    <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#8a91a0">
      This link is for you alone and expires in 14 days. If the button does not
      work, paste this into your browser:<br>
      <span style="color:#5b6272;word-break:break-all">${escapeHtml(link)}</span>
    </p>
  `);

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Attribute context needs single quotes escaped too. */
function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
