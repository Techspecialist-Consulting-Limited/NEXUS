/**
 * Where somebody lands after confirming their email.
 *
 * An invited colleague set a password, confirmed their address, and was then
 * shown "create an organisation" — on an invitation to an organisation that
 * already existed. Pressing Back revealed the right screen, because the URL
 * before the callback still carried the invite token and the one after it did
 * not.
 *
 * The callback wrapped `next` as `/onboarding?next=<next>`, which is correct
 * for an ordinary sign-in and destroys an invitation: there, `next` is already
 * `/onboarding?invite=abc`, and wrapping hid the token from the only page that
 * reads it.
 *
 * It survived every test of the invitation flow because it only happens when
 * the project requires email confirmation. Without that, signUp returns a
 * session immediately and the browser never passes through the callback.
 */

import { describe, expect, it } from "vitest";
import { onboardingDestination } from "../lib/onboarding";

describe("onboardingDestination", () => {
  it("keeps an invitation token instead of burying it in ?next=", () => {
    // The exact value sign-in-panel puts in `target` for an invited person.
    const next = "/onboarding?invite=abc123";
    const to = onboardingDestination(next);

    expect(to).toBe("/onboarding?invite=abc123");
    // The regression, stated as the thing that must not come back.
    expect(to).not.toContain("next=");
    expect(new URLSearchParams(to.split("?")[1]).get("invite")).toBe("abc123");
  });

  it("still routes an ordinary sign-in through onboarding", () => {
    // Authenticated but possibly unplaced: onboarding decides and forwards on.
    expect(onboardingDestination("/dashboard")).toBe(
      "/onboarding?next=%2Fdashboard",
    );
  });

  it("does not double-wrap a bare onboarding path", () => {
    expect(onboardingDestination("/onboarding")).toBe("/onboarding");
  });

  it("refuses an absolute next, which would make this an open redirect", () => {
    for (const hostile of [
      "https://evil.example.com/steal",
      "//evil.example.com/steal",
      "javascript:alert(1)",
    ]) {
      const to = onboardingDestination(hostile);
      expect(to).toBe("/onboarding?next=%2F");
      expect(to).not.toContain("evil.example.com");
    }
  });

  it("handles a missing next", () => {
    expect(onboardingDestination(null)).toBe("/onboarding?next=%2F");
  });
});
