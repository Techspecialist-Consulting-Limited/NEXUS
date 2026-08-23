# NEXUS Organization & Administration Report

> 22 Aug 2026. All seven phases of the organisation, onboarding and
> administration brief. Phases 1 and 2 — the identity model and the
> Administration centre — are below; phases 3 to 7 follow them.
>
> Validation: typecheck ✅ · lint ✅ · **106 tests** ✅ · build ✅ · migrations
> replay ✅ · UI sweep every role and route at 360/768/1440 ✅ · check-in
> end-to-end ✅ · assistant end-to-end ✅

---

## The screenshot, explained

An administrator signed in to a real organisation and got:

> No settled weeks yet. Reconciliations appear here once employees have
> confirmed them.

That sentence is true and it is a dead end. It does not say why there is
nothing, what would change it, or where to go — and it was the entire product
for that person, because **the Administrator had no personal workspace at all.**

`tabsFor("admin")` returned Command, People, Units, Insights, Alerts. No
`/my-week`. No `/check-in`. Both routes actively redirected them away.
`runPrompt` opened a check-in for staff, leads and HR and not for them. The view
counting who is expected to report excluded them. An administrator configured a
reporting rhythm they were structurally exempt from, and then landed on a
command view with nothing in it.

---

## One person. One identity. Capabilities on top.

`lib/capabilities.ts` is the rule now:

| Stored role | Base | Capability |
|---|---|---|
| `staff` | Staff | — |
| `lead` | Staff | Department Lead |
| `hr` | Staff | HR Management |
| `admin` | Staff | Organization Admin (+ People, Departments, Reporting) |
| `executive` | Executive | Executive Access |

Everybody but the Chairman is a staff member with a week to report. The Chairman
is the one genuinely different experience: he consumes organisational
intelligence and does not file a standup.

### Why it is derived rather than stored separately

`role` is what row-level security keys on — `current_org_role()` appears in
29 policies, and it is the only thing standing between a lead and another
unit's reconciliations. A second, parallel privilege column would either
duplicate that, or grant capability the database does not enforce.

**A permission the database does not enforce is decoration, and worse than
none.** So `role` stays as the one capability the database understands, and
`capabilities.ts` is the vocabulary the interface speaks. Nothing in it is a
security boundary; every page checks again on the server.

### The limit, stated rather than hidden

One capability per person. Somebody cannot be both Organization Admin and HR
Management. Supporting that honestly means teaching RLS about a set rather than
a single value — a rewrite of every policy — and until then a multi-select
would be writing a promise the database does not keep.

The Permissions page says this out loud rather than implying an editor that
does not exist. `capabilitiesOf()` returns an array specifically so that
becoming a set later is a change in one function.

---

## What changed, and what it cost

### Everybody reports except the Chairman

Four places encoded "who is expected to report" as `role in ('staff','lead','hr')`
— a list, and a list is a seat waiting to be forgotten. That is exactly how HR
was left out once and the Administrator twice. All four are now
`role <> 'executive'`:

- `lib/schedule.ts` — opens the check-in
- `lib/ai/coordinator.ts` — chases the people who have not answered
- `lib/team.ts` — the compliance roster
- `department_cycle_health` — migration **0015**

Migration 0015 changes one view definition and nothing else. No table, column,
policy or row is touched, and no reconciliation is recomputed.

### The Administrator has a workspace

`/my-week` and `/check-in` stopped redirecting them. The rail is now built from
capability rather than from a hard-coded role, in three groups:

```
Personal          My week · Tasks · Check in · Coaching · Alerts
Administration    Organization · People · Departments · Permissions ·
                  Reporting · Audit log
```

The personal group is deliberately unlabelled — it is not a section somebody
navigates to, it is where they are.

**The phone bar carries the personal group alone.** Eleven destinations in a
360px pill is a row of unreadable glyphs. Administration is reached by tapping
your own organisation in the mobile header, which is the right gesture for it,
and every Administration page lists the others at its foot.

---

## Administration

Six pages, deliberately plainer than the rest of NEXUS — borders and spacing
rather than glass and depth. Same type scale, same colours, same tokens, doing a
different job. Configuration pages are read carefully and rarely, and clarity
beats atmosphere.

### Organization — the home

It answers one question: **is this organisation configured correctly?** Not a
dashboard. No KPI grid, no charts, no staff performance figures.

A seven-step readiness checklist, every step a boolean derived from a row count,
headlined **"6 of 7 done"** rather than a percentage. A progress bar that moves
because the page wanted to feel encouraging is the fastest way to lose an
administrator who then discovers nothing works. Each step's reason is the
consequence of leaving it undone — *"A lead is who NEXUS points at when their
unit is blocked. Without one, a finding has nobody to reach."* — and is shown
only while the step is open.

It collapses to a single line once everything is done.

The organisation profile sits on the same page: name and timezone as columns
because the whole product reads them; industry, country and working days in the
existing `settings` jsonb, because adding three columns for three strings
nothing joins on is how a schema starts drifting.

### People

The roster, invitations, placement and capability — the page `/team` already
was, moved where an administrator looks for it. The existing manager is reused
rather than rebuilt. `/team` redirects, because it is in bookmarks and in the
onboarding email.

### Departments

Create, rename, assign a lead, archive.

**There is no delete, and the interface says why.** A unit that has existed for
a quarter is referenced by every commitment, reconciliation, dependency edge and
finding produced in that time. Deleting it either cascades and takes the history
or nulls the keys and orphans it — either way the organisation permanently loses
the ability to answer "how did Creative Hub do in March" because somebody tidied
up. Migration **0017** adds `archived_at`; the confirmation states plainly that
the history stays.

Archiving does not move anybody out. Fourteen people relocated by a click nobody
thought was a relocation is how administrators stop trusting a settings page.

**0017 also removes the Chairman's department write access.** 0006 granted
`departments_write` to `admin` and `executive`; PRD F17 says his view "is
read-only and carries no administrative capability". That grant disagreed with
the product silently, for as long as no interface offered him the control.

### Permissions

Explanation, not a matrix. A grid of ticks says which boxes are on; it does not
say what happens when you turn one on, which is the only question anybody opens
the page with. Each capability lists what it unlocks, what it can read, and
whether it can change data — and who currently holds it, counted from the
roster.

### Reporting

**This page only shows controls that do something.**

In this first pass that meant it had none. The obvious version has six time
pickers, and every one would have been a lie: NEXUS did not schedule itself,
something outside it called `POST /api/cron/tick`. A picker storing "Thursday
8am" into a column nothing reads is a control that appears to work and does not.

So the rhythm was described and the trigger named exactly. **Phase 4 below then
made the pickers real**, by gating each job on those values rather than by
building a scheduler — see "The reporting rhythm became real".

### Audit log

Migration **0016**. Four columns of substance: actor, action, target, time —
plus the rendered sentence the page shows, because what an audit log is for is
answering "who gave that person access?" months later, to somebody who was not
there.

**Read-only by construction.** There is a select policy and an insert policy and
none for update or delete; RLS denies what it does not permit, so an audit row
cannot be edited or removed through the application by anybody, including the
administrator.

The insert policy requires `actor_id = current_profile_id()`. Without that
clause an administrator could write history attributing an action to a
colleague, and **a forgeable record is one people trust and should not.**

Read is Administrator only — not HR, not the Chairman. PRD F17 keeps his view
free of administrative capability; showing him who granted whom what would make
him a participant in decisions the product says he does not make.

---

## Five defects found while building

**1. The local demo database was silently a version behind.** It was built once
and never migrated, so every migration added afterwards left it stale — and the
symptom was a 500 reading `column d.archived_at does not exist` on a page that
worked perfectly in a fresh checkout. `lib/db.ts` now keeps a migration ledger
and rebuilds when it drifts. A demo fixture is regenerable by definition;
applying only the difference sounds tidier and is not, because a migration that
runs against a schema its author never saw is how a local database ends up in a
state no deployment will ever be in.

**2. `/check-in` still bounced the Administrator** after `/my-week` was fixed.
Caught by the sweep, once the sweep was taught that an admin has personal
routes — which it could not have caught before, because it never loaded the
page an admin actually lands on.

**3. A server module reached a client component.** `organization-form.tsx`
imported one constant from `lib/organization.ts`, which imports `asActor`, and
the build failed with `Module not found: Can't resolve 'fs'`. Split into
`lib/org-vocabulary.ts`, the same way `roles.ts` is split from `auth.ts` — and
for the same reason.

**4. A 16px tap target** on the "Show archived units" toggle. Caught by the
sweep on all three breakpoints.

**5. A stale test.** `coordinator.test.ts` asserted reminders reach only staff
and leads — and passed for the wrong reason, since the coordinator already
chased HR and the seeded HR person happened to have responded. Rewritten as an
exclusion, which cannot go stale the next time a role is added.

---

## Verified, not assumed

Beyond the sweeps, the write paths and their boundaries were exercised
end-to-end against a running server:

| | |
|---|---|
| Create, rename, archive a unit | 200 · audit row written for each |
| Update the organisation profile | 200 · audit row names what changed |
| **A lead** creating a unit | **403** |
| **A lead** editing the organisation | **403** |
| **A lead** opening `/admin/audit` | redirected to `/my-week` |

And five new RLS tests assert the boundary the database enforces, from the seat
of a real unprivileged user — because a route check is a courtesy that produces
a good error message, not the boundary:

- only the Administrator reads the audit log (a lead, a staff member and the
  Chairman each see zero rows)
- an audit row attributed to somebody else is refused
- audit rows cannot be updated or deleted at all
- a lead cannot rename a unit or the organisation
- **neither can the Chairman**

---

## Phases 3 to 7

Done in a second pass. Validation after it: typecheck OK, lint OK, **105 tests**
OK, build OK, migrations replay OK, sweep every role and route at 360/768/1440
OK, check-in and assistant end-to-end OK.

---

### Profile & Settings (Phase 5)

`/settings`, and deliberately NOT under `/admin`: Administration configures the
organisation, this configures the person, and every member has one whether or
not they administer anything.

**Every control on it is read by something.** Quiet hours and the four
notification switches are checked by `enqueue_notification` in migration 0005
*before* anything is sent; the timezone decides what "today" means for the daily
budget. That was the bar for including a field.

What is absent, and why: no avatar upload (no file storage is configured, and a
picker that cannot keep the file is worse than none), no language (the product
is English), no "sign out everywhere" or password controls (identity belongs to
the provider, and NEXUS cannot end a session it does not hold).

Department and lead are shown and not editable. A dropdown there would let
anybody reassign themselves out from under their lead; leaving it off entirely
makes the page look like it forgot, because "who is my lead" is a question
people genuinely have.

**The privacy section is generated from the real policies**, not written as
copy. Six sentences, each mapping to a row filter in 0006 or 0008 — the value of
a privacy section is entirely in whether it is true.

### The reporting rhythm became real (Phase 4)

Last pass this page described the rhythm and offered no controls, because NEXUS
did not decide its own timing: something outside it called the tick and every
job ran. A time picker then would have stored a preference nothing read.

`lib/rhythm.ts` adds a **gate**, not a scheduler. The tick fires hourly; each
job runs only once that organisation's configured moment has arrived, in that
organisation's own timezone.

That works because **every job was already idempotent by construction** —
per-cycle uniqueness on notifications, a unique key on digests, a `sent_at`
check on delivery. So "run when we are past the time" needs no run ledger, no
lock and no catch-up logic. It is a comparison.

Three decisions worth naming:

- **At-or-after, not at-exactly.** A scheduler that misses its window — host
  down, cron late — must not mean the week is never opened. A late tick catches
  up rather than skipping.
- **`narrate` and `coordinate` are never gated.** They produce a cached readout
  and a set of findings that nobody receives. Holding them back schedules
  nothing and only means somebody opens their week and waits on a model.
- **A named `?job=` ignores the gate.** That is the manual run, and a "send it
  now" that silently declined because it was Tuesday would be the worst button
  in the product.

The gate lives inside `currentCycles()` because that is the only place a job
knows which organisation it is about to act on — gating at the tick would be
all-or-nothing across tenants, and two organisations in different timezones
would share one schedule.

Five tests cover it, including that junk in the settings column falls back
rather than taking the rhythm down.

### Onboarding (Phase 3)

Migration **0018** adds `profiles.welcomed_at`. A timestamp rather than a
boolean in `notification_prefs`, because "has seen the introduction" is a fact
with a time and support's actual question is *when*. Existing people are
backfilled to their join date — showing everybody a "welcome to NEXUS" panel
because a migration ran would be the worst possible introduction.

**The founder now lands on `/admin?welcome=1`**, not on a roster containing only
themselves. They have nothing to manage and seven things to do, and that is the
page listing them in order.

**The first-run introduction** is three cards and about forty seconds: telling
it is easy, it remembers, and you see it before anyone else. Those are the three
things somebody has to believe for the rest to work.

It is not a product tour, and **it does not block** — it sits above the week
rather than in front of it, so somebody who wants to get on with their work can.
Dismissing hides it immediately and records afterwards: making somebody watch a
spinner to close a welcome screen is a bad first thirty seconds, and the worst
case of a failed write is seeing it once more.

Replayable from Settings, which clears the timestamp rather than adding a second
flag that could disagree with the first.

### Integrations & security (Phase 6)

`/admin/integrations`, and **every line on it is observed rather than
configured**. Sign-in methods come from Supabase's own `/auth/v1/settings`; the
model tier, the mail sender and the scheduler secret from whether they are
present in the environment. Each row also carries how many people in *this*
organisation actually signed in that way — "Microsoft is enabled" and "fourteen
people use it" are different facts, and the second is the one an administrator
decides anything with.

There is no reconnect button, because there is no connection NEXUS holds. There
is no session list, device history or password policy, because NEXUS holds none
of them — **a security page listing controls that do nothing is the fastest way
to stop being believed on the ones that work.**

When the deployment has no auth provider at all, the page says so at the top in
as many words.

### Navigation (Phase 7)

The rail is now four groups: personal, team, Administration, and an unlabelled
account group carrying Settings — a heading reading "You" above one row is a
title longer than its section, so the separator does the work.

The phone bar still carries the personal group alone. Administration and
Settings are reached from the mobile header, which links to `/admin` for anybody
who can administer.

### Two defects found in this pass

**A translucent sticky save bar.** The settings page is long enough to need one,
and at 88% opacity the section headings showed through it — a bar that
half-reveals what it is covering reads as a rendering fault rather than as a
control. Made opaque.

**"Joined: Unknown"** beside somebody who had been reporting for two months.
`joined_at` is null for seeded and imported people while `created_at` is not;
the query now falls back.

---

## Deploying it, and two things that only showed up there

The first deploy to a real Supabase failed with `column p.welcomed_at does not
exist`, thrown from `lib/auth.ts` on every page. The database was four
migrations behind the code.

**Ordering matters more here than usual.** `currentMembership` selects
`welcomed_at` on every request, so a schema one version behind does not degrade
a new feature — it takes the whole application down through the shell. Migrations
go on before the new code serves traffic. Recorded in GUIDE.md's verification
table.

**The error was accurate and useless**, naming a symptom in a file that is not
the cause. `lib/db.ts` now catches the three Postgres codes that mean schema
drift — `42703` undefined_column, `42P01` undefined_table, `42883`
undefined_function — on the remote driver and rethrows with the fix in the
message, keeping the original as `cause`. The local driver does not need it: it
detects drift at boot and rebuilds.

### A missing grant that a local database could never have caught

`audit_events` was created with RLS policies and no `GRANT`. A policy decides
which ROWS you may touch; a grant decides whether you may touch the table at
all — so it would have failed with `permission denied for table` before RLS was
ever consulted, and the policies would never have run.

The local demo database survives without it because its bootstrap grants on ALL
tables after every migration. A real Postgres does not. Both 0015 (the view,
whose grants `DROP VIEW` had taken) and 0016 now grant explicitly, guarded on
the role existing so they still replay against a bare Postgres.

Verified by replaying every migration into a database where `authenticated`
existed beforehand and no blanket grant ran after: the privileges come from the
migrations themselves.

### TRUNCATE, and a claim that was not quite true

Verifying the live database after the migration showed `authenticated` holding
SELECT, INSERT, **UPDATE, DELETE, TRUNCATE**, REFERENCES and TRIGGER on
`audit_events` — because Supabase configures `ALTER DEFAULT PRIVILEGES` to grant
everything on anything created in `public`. The explicit grant was additive on
top of a blanket default.

For UPDATE and DELETE that changes nothing: with RLS on and no policy permitting
them, they match zero rows. **TRUNCATE is different — it is not row-level.** RLS
never sees it; Postgres checks the privilege and empties the table. A role
holding it can erase the entire administrative history in one statement,
whatever the policies say.

Not reachable today — PostgREST does not expose TRUNCATE and the application
only issues the statements it was written with — but *"unreachable through the
doors we happen to have built"* is a different claim from *"cannot happen"*, and
the audit log is exactly the table whose value rests on the stronger one.

Migration **0019** revokes everything and grants back SELECT and INSERT, for
`authenticated` and `anon`. Starting from nothing rather than revoking three
named privileges, so a future default privilege does not silently reappear.
A test now asserts the administrator's own `TRUNCATE audit_events` is refused —
**the one thing no policy could have prevented.**

---

## Not in this pass

Stated plainly rather than left to be discovered.

1. **Multiple capabilities per person.** Needs row-level security to understand
   a set rather than a single value — a rewrite of every policy. Until then the
   interface will not offer something the database does not enforce, and the
   Permissions page says so out loud.

2. **Direct manager relationships** beyond department lead. `profiles` has no
   manager column and the intelligence layer never asks for one; adding both is
   a larger change than a settings page.

3. **Microsoft department mapping is a choice, not an inference.** Somebody
   signing up through a published domain picks their unit and lands `pending`
   for an administrator to confirm. NEXUS does not read a department out of the
   Microsoft profile — the brief was explicit that an organisation name from an
   identity provider is not a reliable internal unit, and guessing wrong places
   somebody in a team whose lead then owns their week.

4. **Avatars.** No file storage is configured. `profiles.avatar_url` exists and
   nothing writes it.

5. **`calibration` is still built and never used** — carried from the
   intelligence pass. Build it or drop the table.
