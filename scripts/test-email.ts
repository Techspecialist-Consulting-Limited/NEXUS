/**
 * Send one real invitation email, to prove delivery works.
 *
 * Uses the same template and transport the app uses, so a pass here means the
 * feature works rather than that a test harness works.
 *
 * Usage:  node --env-file-if-exists=.env.local scripts/test-email.ts <to>
 */
import { invitationEmail, send, emailConfigured } from "../lib/email.ts";

const to = process.argv[2];
if (!to) {
  console.error("usage: node scripts/test-email.ts <recipient>");
  process.exit(1);
}
if (!emailConfigured()) {
  console.error("RESEND_API_KEY is not set.");
  process.exit(1);
}

const message = invitationEmail({
  orgName: "Techspecialist Consulting Limited",
  inviterName: "NEXUS setup",
  role: "admin",
  departmentName: null,
  link: "http://localhost:3000/onboarding?invite=test-delivery-check",
});

console.log(`from:    ${process.env.EMAIL_FROM ?? "(default)"}`);
console.log(`to:      ${to}`);
console.log(`subject: ${message.subject}\n`);

const result = await send({ to, ...message });

if (result.delivered) {
  console.log(`DELIVERED — Resend id ${result.id}`);
} else {
  console.error(`NOT DELIVERED — ${result.reason}`);
  process.exit(1);
}
