import { NextResponse } from "next/server";
import { z } from "zod";
import { currentIdentity, currentMembership } from "@/lib/auth";
import { homeFor } from "@/lib/nav";
import { acceptInvitation, createOrganization, requestToJoin } from "@/lib/onboarding";

/*
 * The only endpoint that can create a membership.
 *
 * Note what is NOT in the accepted body: a role, for the create and accept
 * paths. Founding gives you admin; an invitation gives you whatever it was
 * issued with. `requestedRole` exists on the join path and is recorded as a
 * request — migration 0008 writes 'staff' regardless of what arrives here, so
 * a hand-crafted POST gains nothing.
 */

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    orgName: z.string().min(2).max(120),
    fullName: z.string().min(1).max(120),
    timezone: z.string().max(60).optional(),
  }),
  z.object({
    action: z.literal("accept"),
    token: z.string().min(10).max(200),
    fullName: z.string().min(1).max(120),
  }),
  z.object({
    action: z.literal("join"),
    orgSlug: z.string().min(1).max(120),
    fullName: z.string().min(1).max(120),
    departmentId: z.string().uuid().nullable().optional(),
    requestedRole: z.enum(["staff", "lead", "hr"]).default("staff"),
  }),
]);

export async function POST(request: Request) {
  const identity = await currentIdentity();
  if (!identity) {
    return NextResponse.json({ error: "You are not signed in." }, { status: 401 });
  }

  // One account, one organisation. Checked here as well as in the database so
  // the caller gets a sentence instead of a constraint violation.
  if (await currentMembership(identity)) {
    return NextResponse.json(
      { error: "This account already belongs to an organisation." },
      { status: 409 },
    );
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That request was not valid." }, { status: 400 });
  }
  const input = parsed.data;

  try {
    if (input.action === "create") {
      await createOrganization(identity, input.orgName, input.fullName, input.timezone);
      /*
       * Straight into the setup checklist, not onto a roster of one.
       *
       * The founder of an empty organisation has nothing to manage yet and
       * seven things to do, and /admin is the page that lists them in order.
       * Landing them on People showed them a table containing themselves.
       */
      return NextResponse.json({ ok: true, redirect: "/admin?welcome=1" });
    }

    if (input.action === "accept") {
      await acceptInvitation(identity, input.token, input.fullName);
      const membership = await currentMembership(identity);
      return NextResponse.json({
        ok: true,
        redirect: membership ? homeFor(membership.role) : "/",
      });
    }

    await requestToJoin(
      identity,
      input.orgSlug,
      input.fullName,
      input.departmentId ?? null,
      input.requestedRole,
    );
    return NextResponse.json({ ok: true, redirect: "/pending" });
  } catch (err) {
    /*
     * The database raises these deliberately and in plain English ("this
     * invitation was issued to a different email address"), so they are safe
     * and useful to show. Anything unexpected is not echoed back.
     */
    const message = err instanceof Error ? err.message : "";
    const known =
      /invitation|organisation|department|email address/i.test(message) && message.length < 200;
    return NextResponse.json(
      { error: known ? message : "That did not work. Please try again." },
      { status: 400 },
    );
  }
}
