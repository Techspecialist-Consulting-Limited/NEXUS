# NEXUS Convergence Report

> 21 Aug 2026. A convergence and refinement pass against the queue in
> [current-ui-audit.md](current-ui-audit.md) — not a rebuild.
>
> Backend, database, migrations, RLS, authentication, queries, scoring,
> intelligence logic, AI contracts and tests are untouched.
>
> Validation: build ✅ · typecheck ✅ · lint ✅ · 95 tests ✅ · migrations replay
> ✅ · sweep across every role and route at 360/768/1440 ✅ · inline check-in
> end-to-end ✅ · assistant end-to-end ✅

---

## Fixed

### 1. The glass regression — Critical

**Cause found, and it was not the one assumed.** The audit guessed at declaration
order; the real mechanism is that Lightning CSS (via Tailwind v4) collapses a
prefixed/unprefixed pair and **keeps whichever is written last**. With
`backdrop-filter` first and `-webkit-backdrop-filter` second, only the `-webkit-`
alias survived — and a browser given only the alias computes `none`.

Every `GlassCard` in the product rendered as a flat 4%-white rectangle, in every
browser, with no error anywhere. The `@supports` fallback never fired because
browsers *do* support the feature; they were simply never given the declaration.

Fixed by swapping the order — `-webkit-` first, standard last — for all four
levels plus the skip-link. Verified in a real browser:

| | Before | After |
|---|---|---|
| `.glass-l1` | `none` | `blur(24px) saturate(1.4)` |
| `.glass-l2` | `none` | `blur(40px) saturate(1.5)` |

The visual direction is unchanged. The ordering constraint is now documented in
`globals.css` so it does not get "tidied" back.

**And guarded.** `scripts/smoke.mjs` now asserts a non-`none` computed
`backdropFilter` on every page. This defect was invisible to typecheck, lint,
tests and code review — the source was correct the whole time — so a rendered
computed style is the only place the truth shows up.

### 2. The executive trend axis — Important

Not the axis width. The cause was `margin={{ left: -18 }}` on the `AreaChart`: a
negative left margin pulls the plot area outside the SVG surface and takes the
y-axis labels with it. Nine of thirteen pixels of every tick were clipped.

Someone reclaimed a little whitespace and it cost the chart its scale.

Set to `left: 0`. Measured after: **`0, 20, 40, 60, 80` fully inside the surface
at both 1440px and 390px, zero clipped.** The chart is otherwise unchanged.

### 3. The two check-in paths — Important

Both kept. Both now say what they are.

- **Inline** (`staff/inline-checkin.tsx`) — the quick path. When more than two
  commitments are still open it now offers the guided one, because that is when
  it is the better answer. An always-visible alternative reads as doubt about
  the thing you are standing in.
- **`/check-in`** — retitled from "Check in" to **"Reconcile your week"**, with
  the standfirst *"Go through last week's commitments one at a time, then tell it
  in your own words."*

**Desktop no longer renders a narrow card in a void.** The container went from
`max-w-2xl` (672px) to `max-w-5xl`, and step 1 lays the commitments out in two
columns from `lg`. The writing and confirmation steps constrain themselves to a
readable measure, so the width serves the reconciliation rather than becoming a
dashboard.

Recorded as a product decision in [NEXUS.md](NEXUS.md#two-paths-and-why-both-exist).

### 4. Type system migration — complete

**105 ad-hoc pixel sizes → 0**, across 23 files. Every remaining `text-[…px]` in
the repository is inside an explanatory comment.

Priority files first (`lead/team-board`, `ui/composer`, `ui/evidence-chip`,
`layout/app-nav`, `layout/account-menu` — the shared primitives were why fully
migrated boards still rendered off-scale text), then the rest of the queue.

Also collapsed 3 longhand eyebrow declarations onto the `.eyebrow` role. Named
type roles now appear 66 times.

No visual hierarchy was changed to accommodate a font size. Every value mapped
to its nearest existing step.

### 5. Dead and misleading UI — removed

Verified before deleting, as asked:

| File | Imported by | Verdict |
|---|---|---|
| `employee/my-week-view.tsx` | `my-week/page.tsx` only | dead |
| `employee/sparkline.tsx` | `my-week-view` only | dead |
| `employee/question-card.tsx` | `my-week-view` only | dead |

`/my-week` routes staff, lead and HR to `CopilotHome`; only executive and admin
fell through, and neither has `/my-week` in their navigation. Reaching it by URL
showed them an empty week and a **"Give an update"** button for a workflow the
product deliberately excludes them from.

All three removed. `staff/copilot-home.tsx` untouched.

**A second bug fixed on the way:** the role check sat *after* `weeklyBrief()`, so
the Chairman would have paid a 20–30 second model call before being redirected.
The redirect now runs first, and non-filing roles go to `homeFor(role)`.

### 6. Admin Command at 390px — Important

Reordered and collapsed rather than redesigned.

**Mobile reading order is now:** narrative → reporting pulse → execution scores
→ unit signal → top risks → leadership actions. Achieved with `order-*` classes
inside the existing grid plus `lg:order-none`, so **the desktop layout is
byte-identical to before.**

The two sections nobody acts on directly — the eight-week trend and the roster —
are behind a tap on mobile and always open from `lg`. Each dropped from roughly
225px to 78px.

Not `<details>`: its open state cannot be driven by a breakpoint without
fighting user-agent styles. An explicit toggle with `lg:block` is predictable
everywhere.

### 7. AI communication rules — one gap closed

The audit found `ASSISTANT_SYSTEM`'s *"where the facts support it, say what
could be done"* was read as optional, and the action dropped from roughly half
of all answers. `ai-communication.md` carried the same hedge — *"where it
fits"*.

Replaced with a table stating when each part is required, and a section making
explicit that **context cannot be prompted into existence**: a voice not given
the previous cycle cannot say "for the second week running", however the
instruction is worded.

### 8. A violation this pass introduced, caught by the sweep

The link added in Phase 3 was inline inside a sentence — a 14px tap target. The
sweep flagged it on four role/breakpoint combinations. Restructured so the
sentence carries the reason and a block link carries the 44px target.

---

## Intentionally unchanged

**`command-center.tsx`'s structure.** The setup audit called it near-generic;
looking at it, that was wrong and the correction is recorded. It reads
narrative → scores → reporting → units → ranked risks with reasons → numbered
actions → trend → people ordered by whether we were told. That is the hierarchy
the spec asks for. Only its mobile ordering was touched.

**The course plot itself.** `rejected-patterns.md` rejects decorative analytics,
and this is the product's only chart — but promised-against-delivered over eight
weeks is precisely where a trend changes a decision. It got a readable axis, not
a deletion.

**The `border-l-2` accent** on the narrative and coaching cards. A coloured
side-stripe is a known anti-pattern, but it is not in the audit queue and
removing it is a visual change rather than a convergence one. Flagged below.

**Two designs for the same data** (HR vs everyone else on compliance, executive
vs admin on insights and alerts). Reskinning the old layer is Rework, not this
pass, and the brief scoped this to the queue's top items.

**All backend behaviour.** No schema, migration, RLS, query, scoring,
notification, AI contract or test was modified. The only non-visual change is
the redirect ordering in `my-week/page.tsx`, which removes a wasted model call.

---

## Remaining issues

Carried forward, in the order I would take them.

1. **Pass history to `narrate()`.** The employee's coaching voice receives only
   the current week's counts and therefore *structurally cannot* have
   situational awareness. `personTrend()` already exists — and after this pass
   it is no longer fetched anywhere, since its only consumer was the deleted
   `my-week-view`. Wiring it to the coach is the single highest-value change
   left in the product.

2. **Use `oldest_since` in the blocking finding.** `blockingEdges()` already
   returns it; `insights.ts` never references it. One clause turns *"2
   commitments cannot move"* into *"…and this dependency has been open for three
   weeks"* — the exact difference between *Better* and *Best* in
   `ai-communication.md`.

3. **Tighten `ASSISTANT_SYSTEM`** to match the rule just written: an answer about
   a problem ends in a next step.

4. **Give `tone()` a repeat count**, so a second reminder does not read like a
   first.

5. **Rework `department-view.tsx`** — the Chairman scans Units in the new layer
   and lands in the old one. The most-travelled cross-generation journey.

6. **The remaining Rework items**: `team-manager.tsx`, `compliance-view.tsx`,
   `advice-feed.tsx` + `insight-card.tsx`, `notification-centre.tsx`. All now on
   the type scale, none yet restructured.

7. **`team-board.tsx` still uses a `ProgressRing`** for a single percentage — the
   pattern removed from HR's surfaces. Type migration was this pass's scope; the
   ring is a hierarchy change and was left.

8. **The `border-l-2` side stripes** (2 instances).

9. **Re-run the visual assessments.** Every screenshot in the audit was taken
   with the glass dead. Depth changes how dense a screen feels; some spacing
   judgements may move now that it renders.

---

## Product decisions still required

1. **Should HR and leads have a conversational surface?** Only the Chairman has
   the assistant. HR and leads currently cannot ask a question. This may be
   deliberate exclusivity or an oversight — it is a product call.

2. **Is admin a first-class surface?** Four of five admin screens are the old
   layer. Defensible for an internal maintenance role, but it should be a
   decision rather than an accident.

3. **Build or drop `calibration`.** The table from migration 0005 is never
   written and never read. The "you run 1.4× optimistic on backend work"
   mechanism was designed and never built. It would give coaching real memory —
   but an unfulfilled schema promise is its own debt.

4. **How prominent should the guided check-in be?** It is currently offered when
   more than two commitments are open. That threshold is a guess and should be
   confirmed against how people actually use the two paths.
