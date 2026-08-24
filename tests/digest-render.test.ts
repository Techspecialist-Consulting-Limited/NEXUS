/**
 * What the Chairman is allowed to receive.
 *
 * A stored briefing is written by one build and rendered by another, so the
 * renderer has to survive a summary_json that is missing fields it expects.
 * It already tolerated that — and tolerated it badly: the stat block tested
 * `=== null`, a MISSING metrics object yields `undefined`, and the difference
 * went out as "undefined%" above an otherwise correct briefing.
 *
 * `null` and `undefined` reach that code by completely different routes —
 * null is what SQL returns for a week with nothing to average, undefined is
 * what a missing key returns — which is why guarding one is not guarding the
 * other.
 *
 * The rule these pin: a figure the renderer cannot vouch for prints as an em
 * dash. It never prints a JavaScript value name, and it never invents a zero,
 * because "0%" is a claim about the week and "—" is an admission about the
 * record.
 */

import { describe, expect, it } from "vitest";
import { renderDigestEmail, type BuiltDigest } from "../lib/ai/executive-digest";

const RESULT: BuiltDigest["result"] = {
  subject: "A subject line",
  headline: "The week in one sentence, long enough to pass the schema.",
  whatChanged: ["Something moved."],
  decisions: [{ risk: "A risk", action: "An action" }],
  praise: [],
  threads: [
    { headline: "A piece of work", detail: "What happened to it.", people: ["Amara Okonkwo"] },
  ],
};

function render(metrics: Record<string, unknown> | undefined) {
  return renderDigestEmail(
    {
      cycleId: "c1",
      cycleLabel: "W33",
      orgName: "Techspecialist",
      result: RESULT,
      metrics: metrics as BuiltDigest["metrics"],
      silent: [],
      model: "test",
    },
    "https://example.com",
  );
}

describe("digest email figures", () => {
  it("never renders a JavaScript value name, whatever is stored", () => {
    for (const metrics of [
      undefined,                                   // no metrics key at all
      {},                                          // present but empty
      { delivery_rate: null, signal_integrity: null },  // SQL's "nothing to average"
      { delivery_rate: NaN },                      // an average over zero rows
      { delivery_rate: "57" },                     // survived a JSON round trip
    ]) {
      const { html, text } = render(metrics);
      for (const body of [html, text]) {
        expect(body).not.toContain("undefined");
        expect(body).not.toContain("NaN");
        expect(body).not.toContain("null%");
      }
    }
  });

  it("shows an em dash rather than inventing a zero", () => {
    const { html } = render({});
    // "0/0" would be a claim about the week; the dash is honest about the record.
    expect(html).not.toContain("0/0");
    expect(html).toContain("—");
  });

  it("reports how many people filed, which is a count and not a score", () => {
    const { html, text } = render({ people_responded: 14, people_reporting: 16 });
    expect(html).toContain("14/16");
    expect(text).toContain("14/16");
  });

  /*
   * Delivery and told-in-time are computed and still drive reconciliation.
   * They are deliberately not shown: two percentages at the top of a briefing
   * frame everything under them, and this briefing is framed around what
   * people reported. Pinned so they cannot drift back in unnoticed.
   */
  it("puts no delivery or told-in-time score in front of the Chairman", () => {
    const { html, text } = render({
      delivery_rate: 57,
      signal_integrity: 81,
      people_responded: 14,
      people_reporting: 16,
    });
    for (const body of [html, text]) {
      expect(body).not.toContain("57%");
      expect(body).not.toContain("81%");
      expect(body).not.toMatch(/Told in time/i);
    }
    // ...and the participation count still arrives.
    expect(html).toContain("14/16");
  });

  it("renders the brief without a metrics object at all", () => {
    const { html, subject } = render(undefined);
    expect(subject).toBe("A subject line");
    // The prose still has to arrive — the figures being absent is not a reason
    // to lose the briefing.
    expect(html).toContain("A piece of work");
    expect(html).toContain("Amara Okonkwo");
  });
});
