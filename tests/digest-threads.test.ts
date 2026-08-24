/**
 * The week told as one account rather than one entry per person.
 *
 * The Chairman was getting the organisation summarised and never saw who said
 * what. Listing everyone instead would have produced eighteen entries he
 * skims — and skimming is how the blocked item three entries down gets missed,
 * which is the same failure `rejected-patterns.md` §13 records.
 *
 * So work that belongs together becomes ONE thread naming everyone who touched
 * it. These pin the properties that make that safe:
 *
 *   - shared work is grouped, not repeated
 *   - every thread names somebody, because a thread that names nobody is an
 *     assertion the reader cannot check
 *   - somebody who filed nothing is never described as having done nothing
 */

import { describe, expect, it } from "vitest";
import { MockProvider } from "../lib/ai/mock";
import type { DigestContext } from "../lib/ai/types";

const person = (
  name: string,
  over: Partial<DigestContext["people"][number]> = {},
): DigestContext["people"][number] => ({
  profileId: `id-${name.toLowerCase().replace(/\s+/g, "-")}`,
  name,
  unit: "Techspecialist",
  reported: true,
  delivered: [],
  open: [],
  blocked: [],
  planned: [],
  ...over,
});

function context(people: DigestContext["people"]): DigestContext {
  return {
    orgName: "Techspecialist",
    cycleLabel: "W33",
    period: "weekly",
    metrics: { delivery_rate: 60, silent_drop_count: 0 },
    findings: [],
    departments: [],
    people,
  };
}

describe("digest threads", () => {
  it("groups work two people reported into one thread naming both", async () => {
    const { data } = await new MockProvider().digest(
      context([
        person("Suleman Bello", { delivered: ["Credicorp prototype presentation"] }),
        person("Taofeeq Abbas", { delivered: ["Credicorp prototype presentation"] }),
      ]),
    );

    const credicorp = data.threads.filter((t) =>
      t.headline.toLowerCase().includes("credicorp"),
    );

    // One organisational event, not two updates.
    expect(credicorp).toHaveLength(1);
    expect(credicorp[0].people).toEqual(
      expect.arrayContaining(["Suleman Bello", "Taofeeq Abbas"]),
    );
  });

  it("names everyone a thread was drawn from, so it can be checked", async () => {
    const { data } = await new MockProvider().digest(
      context([
        person("Amara Okonkwo", { delivered: ["Ship the endpoint"] }),
        person("Zainab Yusuf", { open: ["Ship the endpoint"] }),
      ]),
    );

    expect(data.threads.length).toBeGreaterThan(0);
    for (const t of data.threads) expect(t.people.length).toBeGreaterThan(0);
  });

  it("separates work that landed from work still open, within one thread", async () => {
    const { data } = await new MockProvider().digest(
      context([
        person("Amara Okonkwo", { delivered: ["Ship the endpoint"] }),
        person("Zainab Yusuf", { open: ["Ship the endpoint"] }),
      ]),
    );

    const thread = data.threads.find((t) => t.headline === "Ship the endpoint");
    expect(thread?.detail).toContain("Amara Okonkwo completed it");
    expect(thread?.detail).toContain("Zainab Yusuf still has it open");
  });

  it("agrees its verbs with the number of people", async () => {
    const { data } = await new MockProvider().digest(
      context([
        person("A One", { open: ["Shared task"] }),
        person("B Two", { open: ["Shared task"] }),
        person("C Three", { open: ["Solo task"] }),
      ]),
    );

    expect(data.threads.find((t) => t.headline === "Shared task")?.detail).toContain(
      "have it open",
    );
    expect(data.threads.find((t) => t.headline === "Solo task")?.detail).toContain(
      "has it open",
    );
  });

  it("attributes nothing to somebody who filed no report", async () => {
    const { data } = await new MockProvider().digest(
      context([
        person("Reported Person", { delivered: ["Real work"] }),
        // Carries stale commitments but filed nothing this week.
        person("Silent Person", { reported: false, delivered: ["Ghost work"] }),
      ]),
    );

    const named = data.threads.flatMap((t) => t.people);
    expect(named).toContain("Reported Person");
    // Rule 5: silence is not a status, and it is certainly not an achievement.
    expect(named).not.toContain("Silent Person");
    expect(data.threads.map((t) => t.headline)).not.toContain("Ghost work");
  });
});
