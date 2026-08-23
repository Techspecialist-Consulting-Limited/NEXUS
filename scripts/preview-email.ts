/**
 * Render the invitation email to .smoke/ so it can be read before sending.
 *
 * Email is the one surface with no dev server, no hot reload and no way to
 * check a change except by sending a real message to a real person. Writing
 * the rendered output to a file makes it reviewable like anything else.
 *
 * Usage:  node scripts/preview-email.ts
 */
import { writeFile, mkdir } from "node:fs/promises";
import { invitationEmail } from "../lib/email.ts";

const message = invitationEmail({
  orgName: "Techspecialist Consulting Limited",
  inviterName: "Tolu Adebayo",
  role: "lead",
  departmentName: "Techspecialist",
  link: "http://localhost:3000/onboarding?invite=9288a612547c717be4774eb1e860c3ac",
});

await mkdir(".smoke", { recursive: true });
await writeFile(".smoke/invitation-email.html", message.html, "utf8");

console.log(`subject: ${message.subject}`);
console.log(`html:    ${message.html.length} bytes -> .smoke/invitation-email.html`);
console.log("\n--- plain text part ---");
console.log(message.text);
