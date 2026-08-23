import { asService } from "../db";
import { aiProvider } from "./provider";
import { executiveBrief } from "../insights";
import type { DigestContext, DigestResult } from "./types";

/*
 * The Chairman's weekly briefing.
 *
 * PRD F15 calls this "the single most important output of the system and the
 * requirement against which delivery is judged", and F16 requires it to stand
 * alone in an inbox — he takes his view from the email and signs in only to go
 * further.
 *
 * The same boundary as everywhere else: every figure below is counted by SQL,
 * and the model is handed them as finished facts to explain. It is never asked
 * what the delivery rate was. That is what makes each claim in the email
 * traceable to a row, which is the difference between a briefing an executive
 * acts on and one he spot-checks once and stops trusting.
 */

export type BuiltDigest = {
  cycleId: string;
  cycleLabel: string;
  orgName: string;
  result: DigestResult;
  /** The figures the prose was written from, kept for the evidence trail. */
  metrics: Record<string, unknown>;
  model: string;
  costUsd?: number;
};

/**
 * Gather everything the briefing is written from.
 *
 * Runs as the service role: a digest is produced by a job on nobody's behalf
 * and must see the whole organisation. Note what it does NOT include —
 * reconciliations still inside the employee review window are excluded by the
 * same policies that hide them in the UI, so the Chairman is never briefed on
 * a number its subject has not seen.
 */
export async function buildDigestContext(
  cycleId: string,
  period: "weekly" | "monthly" = "weekly",
): Promise<{ context: DigestContext; profileIdForScope: string } | null> {
  const [meta] = await asService(
    (sql) => sql<{
      org_id: string;
      org_name: string;
      cycle_label: string;
      chairman_id: string | null;
    }>`
      select o.id as org_id, o.name as org_name, cy.label as cycle_label,
             (select p.id from profiles p
               where p.org_id = o.id and p.role = 'executive'
                 and p.status = 'active' limit 1) as chairman_id
      from cycles cy
      join organizations o on o.id = cy.org_id
      where cy.id = ${cycleId}
    `,
  );
  if (!meta?.chairman_id) return null;

  const brief = await executiveBrief(meta.chairman_id, cycleId);

  const withValue = brief.departments.filter((d) => d.delivery_rate !== null);
  const avg = (pick: (d: (typeof brief.departments)[number]) => number | null) => {
    const rows = brief.departments.filter((d) => pick(d) !== null);
    return rows.length
      ? Math.round(rows.reduce((s, d) => s + (pick(d) ?? 0), 0) / rows.length)
      : null;
  };

  const metrics = {
    delivery_rate: avg((d) => d.delivery_rate),
    signal_integrity: avg((d) => d.signal_integrity),
    people_reporting: brief.departments.reduce((s, d) => s + d.people_reporting, 0),
    people_responded: brief.departments.reduce((s, d) => s + d.people_responded, 0),
    silent_drop_count: brief.departments.reduce((s, d) => s + d.silent_drop_count, 0),
    protected_count: brief.departments.reduce((s, d) => s + d.protected_count, 0),
    unplanned_count: brief.departments.reduce((s, d) => s + d.unplanned_count, 0),
    carryover_count: brief.departments.reduce((s, d) => s + d.carryover_count, 0),
    units_reporting: withValue.length,
  };

  /*
   * The previous period, so "what changed" describes movement rather than
   * levels. Without it the model is told plainly that it has no trend to
   * describe, which is better than letting it invent one.
   */
  const [previousCycle] = await asService(
    (sql) => sql<{ id: string }>`
      select prev.id
      from cycles cur
      join cycles prev
        on prev.org_id = cur.org_id and prev.kind = cur.kind
       and prev.starts_on < cur.starts_on
      where cur.id = ${cycleId}
      order by prev.starts_on desc
      limit 1
    `,
  );

  let previous: Record<string, unknown> | undefined;
  if (previousCycle) {
    const prior = await executiveBrief(meta.chairman_id, previousCycle.id);
    const priorWith = prior.departments.filter((d) => d.delivery_rate !== null);
    if (priorWith.length) {
      previous = {
        delivery_rate: Math.round(
          priorWith.reduce((s, d) => s + (d.delivery_rate ?? 0), 0) / priorWith.length,
        ),
        silent_drop_count: prior.departments.reduce((s, d) => s + d.silent_drop_count, 0),
      };
    }
  }

  return {
    profileIdForScope: meta.chairman_id,
    context: {
      orgName: meta.org_name,
      cycleLabel: meta.cycle_label,
      period,
      metrics,
      findings: brief.insights.map((i) => ({
        type: i.type,
        title: i.title,
        summary: i.summary,
        severity: i.severity,
        recommendedAction: i.recommendedAction,
      })),
      departments: brief.departments.map((d) => ({
        name: d.department_name,
        delivery: d.delivery_rate === null ? null : Math.round(d.delivery_rate),
        signal: d.signal_integrity === null ? null : Math.round(d.signal_integrity),
        reported: `${d.people_responded}/${d.people_reporting}`,
      })),
      previous,
    },
  };
}

/** Write the briefing and record it. Returns null if the org has no Chairman. */
export async function generateDigest(
  cycleId: string,
  period: "weekly" | "monthly" = "weekly",
): Promise<BuiltDigest | null> {
  const built = await buildDigestContext(cycleId, period);
  if (!built) return null;

  const { data, usage } = await aiProvider().digest(built.context);

  /*
   * Structured first, rendered second — as migration 0005 says. summary_json
   * is the artifact; the HTML is derived from it, so the same briefing can be
   * shown in the web UI, sent as email, and later pushed to Slack without
   * being regenerated (and without the three drifting apart).
   */
  await asService(
    (sql) => sql`
      insert into digests (org_id, scope, scope_id, period, cycle_id,
                           status, subject, summary_json, model, cost_usd)
      select cy.org_id, 'executive', null, ${period}::digest_period, ${cycleId},
             'generated', ${data.subject},
             /*
              * ::text::jsonb, and the ::text is load-bearing.
              *
              * postgres.js infers a parameter's type from the cast it sees. A
              * bare ::jsonb makes it send the string AS jsonb, so what lands is
              * a JSON string scalar rather than the object — every field then
              * reads back undefined. PGlite parses the same statement
              * correctly, so the whole test suite passes and only the real
              * database is wrong. Casting to text first forces Postgres to do
              * the parsing, which both backends agree on.
              */
             ${JSON.stringify({ ...data, metrics: built.context.metrics })}::text::jsonb,
             ${usage.model}, ${usage.costUsd ?? null}
      from cycles cy where cy.id = ${cycleId}
      on conflict (org_id, scope, scope_id, period, cycle_id) do update
        set subject = excluded.subject,
            summary_json = excluded.summary_json,
            status = 'generated',
            model = excluded.model,
            cost_usd = excluded.cost_usd
    `,
  );

  return {
    cycleId,
    cycleLabel: built.context.cycleLabel,
    orgName: built.context.orgName,
    result: data,
    metrics: built.context.metrics,
    model: usage.model,
    costUsd: usage.costUsd,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the briefing for an inbox.
 *
 * Tables and inline styles, no images, no web fonts. Every fashionable
 * technique in a marketing email is the thing Outlook strips, and this is read
 * on a phone on a Sunday evening by someone who will not open a second app to
 * see it.
 */
export function renderDigestEmail(
  digest: BuiltDigest,
  appUrl: string,
): { subject: string; html: string; text: string } {
  const { orgName, cycleLabel } = digest;

  /*
   * Defend against a stored briefing that predates a schema change.
   *
   * summary_json is written once and read later, possibly by a newer build
   * whose DigestResult has fields the stored row never had. Reading it
   * optimistically crashes the send — and a send that throws leaves the
   * Chairman with no briefing at all, which is a far worse failure than one
   * with an empty section.
   */
  const result = {
    subject: digest.result?.subject ?? `${cycleLabel}: weekly briefing`,
    headline: digest.result?.headline ?? "",
    whatChanged: digest.result?.whatChanged ?? [],
    decisions: digest.result?.decisions ?? [],
    praise: digest.result?.praise ?? [],
  };
  const m = (digest.metrics ?? {}) as Record<string, number | null>;

  const text = [
    result.headline,
    "",
    `${orgName} · ${cycleLabel}`,
    `Delivered ${m.delivery_rate ?? "—"}%   Told in time ${m.signal_integrity ?? "—"}%   ` +
      `Reported ${m.people_responded ?? "—"}/${m.people_reporting ?? "—"}`,
    "",
    ...(result.whatChanged.length
      ? ["WHAT CHANGED", ...result.whatChanged.map((c) => `  - ${c}`), ""]
      : []),
    ...(result.decisions.length
      ? [
          "NEEDS A DECISION",
          ...result.decisions.flatMap((d, i) => [
            `  ${i + 1}. ${d.risk}`,
            `     -> ${d.action}`,
          ]),
          "",
        ]
      : ["Nothing is escalated this period.", ""]),
    ...(result.praise.length ? ["WORTH SAYING", ...result.praise.map((p) => `  - ${p}`), ""] : []),
    `Open the full view: ${appUrl}/dashboard`,
    "",
    "Every figure here is counted from records. Reconciliations still awaiting",
    "an employee's confirmation are not included.",
  ].join("\n");

  const stat = (label: string, value: string) => `
    <td style="padding:0 18px 0 0">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a91a0">${label}</div>
      <div style="font-size:26px;font-weight:600;color:#12151c;margin-top:2px">${value}</div>
    </td>`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#12151c">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e6eb">
    <tr><td style="padding:26px 28px 6px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;font-weight:600">
        NEXUS · ${escapeHtml(orgName)}
      </div>
      <div style="font-size:12px;color:#8a91a0;margin-top:2px">${escapeHtml(cycleLabel)}</div>
    </td></tr>

    <tr><td style="padding:10px 28px 0">
      <p style="margin:0;font-size:17px;line-height:1.5;color:#12151c">${escapeHtml(result.headline)}</p>
    </td></tr>

    <tr><td style="padding:18px 28px 0">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        ${stat("Delivered", m.delivery_rate === null ? "—" : `${m.delivery_rate}%`)}
        ${stat("Told in time", m.signal_integrity === null ? "—" : `${m.signal_integrity}%`)}
        ${stat("Reported", `${m.people_responded ?? "—"}/${m.people_reporting ?? "—"}`)}
      </tr></table>
    </td></tr>

    ${
      result.whatChanged.length
        ? `<tr><td style="padding:22px 28px 0">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a91a0;font-weight:600">What changed</div>
      <ul style="margin:8px 0 0;padding-left:18px;font-size:14px;line-height:1.65;color:#3c4250">
        ${result.whatChanged.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}
      </ul></td></tr>`
        : ""
    }

    ${
      result.decisions.length
        ? `<tr><td style="padding:22px 28px 0">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a91a0;font-weight:600">Needs a decision</div>
      ${result.decisions
        .map(
          (d, i) => `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:10px;background:#f7f8fa;border-radius:8px">
          <tr><td style="padding:12px 14px">
            <div style="font-size:14px;line-height:1.6;color:#12151c">
              <strong style="color:#8a91a0">${i + 1}.</strong> ${escapeHtml(d.risk)}
            </div>
            <div style="font-size:14px;line-height:1.6;color:#1f4fd8;margin-top:6px">
              &rarr; ${escapeHtml(d.action)}
            </div>
          </td></tr>
        </table>`,
        )
        .join("")}
      </td></tr>`
        : `<tr><td style="padding:22px 28px 0">
      <p style="margin:0;font-size:14px;color:#3c4250">Nothing is escalated this period.</p>
      </td></tr>`
    }

    ${
      result.praise.length
        ? `<tr><td style="padding:22px 28px 0">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a91a0;font-weight:600">Worth saying</div>
      <ul style="margin:8px 0 0;padding-left:18px;font-size:14px;line-height:1.65;color:#3c4250">
        ${result.praise.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}
      </ul></td></tr>`
        : ""
    }

    <tr><td style="padding:24px 28px 28px">
      <a href="${escapeHtml(appUrl)}/dashboard"
         style="display:inline-block;padding:11px 20px;background:#3b6cf5;color:#ffffff;
                text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
        Open the full view
      </a>
      <p style="margin:16px 0 0;font-size:11px;line-height:1.6;color:#8a91a0">
        Every figure here is counted from records, not written by a model.
        Reconciliations still awaiting an employee&rsquo;s confirmation are not
        included &mdash; they appear once that person has seen them.
      </p>
    </td></tr>
  </table>
</body></html>`;

  return { subject: result.subject, html, text };
}
