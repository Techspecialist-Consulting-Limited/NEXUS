import { asActor } from "./db";

/*
 * Administrative history.
 *
 * Written through asActor, never as the service role. That is not a stylistic
 * choice: the insert policy requires `actor_id = current_profile_id()`, so the
 * database itself refuses a row attributed to somebody who did not write it.
 * Recording history as the service role would hand the application the ability
 * to forge it, and a forgeable audit log is one people trust and should not.
 *
 * RECORDING NEVER FAILS THE ACTION.
 *
 * If the log write fails, the thing that just happened still happened. An
 * invitation that was sent, a capability that was granted — refusing to
 * acknowledge those because a history row could not be stored would be a
 * worse outcome than a gap in the history. So `record` swallows its own
 * errors, loudly, and returns nothing.
 */

export type AuditAction =
  | "org.profile_updated"
  | "member.invited"
  | "member.invitation_revoked"
  | "member.role_changed"
  | "member.department_changed"
  | "member.status_changed"
  | "department.created"
  | "department.renamed"
  | "department.archived"
  | "department.lead_assigned";

export type AuditEvent = {
  id: string;
  actor_name: string;
  action: AuditAction;
  target_kind: string | null;
  target_name: string | null;
  summary: string;
  created_at: string;
};

/**
 * Record one administrative action.
 *
 * `summary` is the sentence the page shows, so write it in the past tense and
 * name both sides: "Abbas granted Ibrahim Department Lead", not "role
 * changed". Months later the summary is the only part anybody reads.
 */
export async function record(
  actor: string,
  actorName: string,
  action: AuditAction,
  summary: string,
  target?: { kind: string; id?: string | null; name?: string | null },
): Promise<void> {
  try {
    await asActor(
      actor,
      (sql) => sql`
        insert into audit_events
          (org_id, actor_id, actor_name, action, target_kind, target_id,
           target_name, summary)
        values (
          (select org_id from profiles where id = ${actor}),
          ${actor},
          ${actorName},
          ${action},
          ${target?.kind ?? null},
          ${target?.id ?? null},
          ${target?.name ?? null},
          ${summary}
        )
      `,
    );
  } catch (error) {
    // A gap in the history is better than refusing an action that succeeded.
    console.warn("[nexus:audit] could not record", action, error);
  }
}

export async function listAuditEvents(
  actor: string,
  limit = 100,
): Promise<AuditEvent[]> {
  return asActor(
    actor,
    (sql) => sql<AuditEvent>`
      select id, actor_name, action, target_kind, target_name, summary, created_at
      from audit_events
      where org_id = (select org_id from profiles where id = ${actor})
      order by created_at desc
      limit ${limit}
    `,
  );
}
