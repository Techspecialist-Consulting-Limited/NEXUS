# NEXUS Current UI Audit

> Audited 21 Aug 2026 against the running application, not against the source.
>
> Method: built the app, captured 34 full-page screenshots across five roles at
> 1440px and 390px, then measured the rendered DOM for the things screenshots
> cannot show — contrast, clipping, glass nesting, computed styles. Findings that
> could be confirmed by measurement were confirmed; the two I could not confirm
> are marked as such.
>
> **No production code was changed.** This is a state record and a queue.
>
> Reference: [NEXUS.md](NEXUS.md) · [visual-system.md](visual-system.md) ·
> [rejected-patterns.md](rejected-patterns.md) ·
> [ai-communication.md](ai-communication.md)

---

## The headline finding

**The liquid glass is not rendering. Anywhere. In any browser.**

`app/globals.css` declares each level correctly:

```css
.glass-l1 {
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
}
```

What ships is:

```css
.glass-l1{-webkit-backdrop-filter:blur(24px)saturate(140%);background-color:#ffffff0a;border:1px solid #ffffff14}
```

The unprefixed declaration is gone. The minifier treats the two as the same
property and keeps the last one written — which is the `-webkit-` alias.

Reproduced in isolation:

| Declared | Computed `backdropFilter` |
|---|---|
| `-webkit-backdrop-filter` only | `none` |
| both | `blur(24px)` |

All four levels ship prefix-only. Tailwind's own `.backdrop-blur-xl/2xl/3xl`
ship correctly, so the regression is specific to the hand-written classes.

**Why nobody caught it:** the source is correct, so code review passes. The
`@supports not (backdrop-filter: blur(1px))` fallback never fires either —
browsers *do* support the feature, they simply were not given the declaration.
So there is no opaque fallback and no error. Every `GlassCard` in the product is
a flat `rgba(255,255,255,0.04)` rectangle with a hairline border.

Everything I have reviewed in screenshots all session has been this flat
rendering. It is not ugly — the void background is nearly flat, so blur has
little to sample — but the stated identity in `visual-system.md`, depth through
translucency, is absent from the product.

**Fix:** swap the declaration order so the standard property is written last,
or configure the minifier to preserve both. One line in `globals.css`. Verify by
asserting `getComputedStyle(card).backdropFilter !== "none"` in the sweep, since
this is invisible to every other check.

**Severity: Critical.** It is the product's visual identity, it affects every
screen and every role, and it is a one-line fix.

---

## Keep

Working, aligned with the documentation, no action needed.

| Surface | Component | Why it holds up |
|---|---|---|
| Command (Chairman) | `dashboard/executive-home.tsx` | Four bands, conclusion-first. Assistant is the lede, not a widget. |
| Command (admin) | `dashboard/command-center.tsx` | See correction below — this is a good executive view. |
| Assistant | `assistant/voice-console.tsx` | Spoken and written answers generated separately. Typing always present. |
| Units | `executive/unit-board.tsx` | Ordering is the argument. Bars earn their place here. |
| Insights | `executive/insight-board.tsx` | Ranked, each finding carries its evidence. |
| Alerts | `executive/alert-board.tsx` | Split once, by whether the reader must act. |
| My Co-Pilot | `staff/copilot-home.tsx` | Tally, tree, inline check-in, coach. |
| Inline check-in | `staff/inline-checkin.tsx` | Capture → sort → confirm → save. Only the last step writes. |
| Tasks | `staff/task-board.tsx` | Open work first, `source_quote` on every row. |
| Coaching | `staff/coach-board.tsx` | Second person, no comparison to colleagues. |
| Reporting | `hr/reporting-board.tsx` | Structured by what HR does. Envelope only, never `raw_text`. |
| Shell | `layout/app-nav.tsx`, `account-menu.tsx` | Genuinely device-aware. Menu opens upward. |

### Correction to the setup audit

The setup pass called `command-center.tsx` "close to the generic-dashboard
shape". **Looking at it, that was wrong**, and I am recording the correction
rather than quietly dropping it.

It is not a KPI grid. It reads: two scores with a plain-English gloss → a
narrative paragraph of what actually happened → reporting status → a unit strip
with per-unit warning counts → numbered top risks with reasons → numbered
leadership actions → an eight-week promised-vs-delivered trend → people worth a
conversation, *ordered by whether we were told rather than by output* → a
footnote explaining why the numbers can be trusted.

That is the hierarchy `NEXUS.md` asks for. It has real problems (below), but the
structure is not one of them.

### Glass and card usage — measured, and better than expected

Measured in the DOM across seven surfaces: **11 glass surfaces on the densest
page, zero nesting, maximum depth 0.** Only L1 and L2 are used anywhere.

No glass-in-glass exists in this product. The `rejected-patterns.md` entries for
excessive glass and card nesting are currently clean. The one place cards sit
inside cards is a `GlassCard` containing `Link` rows that navigate — a distinct
interactive target, which is the documented exception.

---

## Rework

### 1. The chart's y-axis is clipped — `dashboard/course-plot.tsx`

**Measured:** the "80" tick spans x=284–297. Its clipping `<svg>` surface starts
at x=293. **Nine of thirteen pixels of every y-axis label are cut off.**

I first read this from the screenshot as the digit "3" repeated down the axis.
It is actually `0, 20, 40, 60, 80` with most of each label outside the surface.

Cause: `width={compact ? 30 : 44}` on `<YAxis>` reserves less room than the
mono tick font needs at 11px.

**Intended experience:** an executive glances at the trend and reads the scale.
Right now the line has no readable magnitude, which makes it decorative — and
`rejected-patterns.md` rejects decorative analytics. This chart is *not*
decorative; promised-against-delivered over eight weeks is the one view where a
trend changes what leadership does. It deserves an axis you can read.

**Severity: Important.** Widen the axis, or drop the axis and label the
endpoints.

### 2. `/check-in` on desktop is mostly empty — `checkin/check-in-flow.tsx`

At 1440px the page is a ~670px centred column holding one short card, with
roughly 700px of dead space beneath it. This is `rejected-patterns.md` #6, empty
luxury, and the inverse of #8 — a phone layout stretched across a desktop.

**Worse, the product now has two check-in paths and explains neither.** The
inline card on `/my-week` files a complete check-in. `/check-in` is in every
filing role's navigation. A person is shown both and told nothing about why.

**Intended experience:** inline is the quick path — speak, confirm, done.
`/check-in` is the deliberate path — last week's commitments resolved one at a
time, then this week, then next. Both should say which they are, and the desktop
layout should use the width for the commitments it is resolving.

**Decided 21 Aug 2026** — recorded in [NEXUS.md](NEXUS.md#two-paths-and-why-both-exist).
Inline is the quick path ("just tell NEXUS what happened", ~30s, voice-first);
`/check-in` is the deliberate reconciliation ("let's properly reconcile your
week"). Both surfaces must now say which they are, and the desktop layout should
use its width for the commitments it is resolving.

**Severity: Important.** No longer ambiguous — it is implementation work.

### 3. `lead/team-board.tsx` — new layer, never migrated

The lead's board was built in the same batch as the other boards but **missed the
type-scale migration**: 9 ad-hoc pixel sizes, 1 named role. It also still uses a
`ProgressRing` for a single percentage — the exact pattern removed from HR's two
surfaces on the grounds that a ring encodes one scalar as an arc beside the
numbers that produce it.

The result is that leads see a delivery figure drawn one way and HR sees the same
figure drawn another.

**Severity: Important.** This one is my own inconsistency, not inherited.

### 4. Shared primitives are unmigrated, so the good boards inherit drift

`ui/composer.tsx` (3), `ui/evidence-chip.tsx` (1), `layout/app-nav.tsx` (2),
`layout/account-menu.tsx` (2) all use ad-hoc sizes. Because they are shared, a
board that is otherwise fully on the scale still renders off-scale text inside
them.

**Severity: Important** — small edit, disproportionate reach.

### 5. Admin's Command view does not adapt to mobile

At 390px `command-center.tsx` is a **2,292px stack**: eight full-width sections
in the desktop order, nothing collapsed, nothing summarised. That is
`rejected-patterns.md` #8 exactly.

It is admin-only, which lowers the priority but does not change the diagnosis.

**Intended experience:** the same content, but the trend chart and the unit strip
collapse to summaries with a tap to expand, and the narrative leads.

### 6. Auth panels are off-system — `auth/sign-in-panel.tsx` (5), `auth/onboarding-panel.tsx` (4)

The first screens anyone sees, and the only ones a prospective customer sees
before signing in. Nine ad-hoc sizes between them and no named roles.

### 7. Two designs for the same data

| Data | HR sees | Everyone else sees |
|---|---|---|
| Reporting compliance | `hr/reporting-board.tsx` | `team/compliance-view.tsx` |
| Org findings | `executive/insight-board.tsx` | `advice/advice-feed.tsx` + `insight-card.tsx` |
| Alerts | `executive/alert-board.tsx` | `layout/notification-centre.tsx` |
| Unit health | `executive/unit-board.tsx` | `dashboard/unit-list.tsx` |

Each pair renders the same query in two visual languages. Defensible as a
migration in progress; a problem if it settles.

### 8. `dashboard/department-view.tsx` — the seam in the main journey

The Chairman scans Units in the new layer and lands here, in the old one. Seven
ad-hoc sizes. This is the most-travelled cross-generation journey in the product.

### 9. `team/team-manager.tsx` — 464 lines, 13 ad-hoc sizes

The roster and the only invitation surface. Works; predates the system.

---

## Scrap

### `employee/my-week-view.tsx` — dead **and** misleading

Traced and then confirmed by loading it: `/my-week` routes staff, lead and HR to
`CopilotHome`. Only `executive` and `admin` fall through — and **neither has
`/my-week` in their navigation**.

Loading it as admin renders *"Nothing recorded for this week yet — once you send
your first update, your delivery, signal and commitments appear here"* above a
**"Give an update"** button. Admin and the Chairman do not file check-ins. The
screen invites a role into a workflow the product deliberately excludes them
from.

So it is not merely unreachable — if anyone does reach it, it is wrong.

**Before deleting:** confirm `employee/sparkline.tsx` and
`employee/question-card.tsx` are not used elsewhere.

### The 105 ad-hoc type sizes

Not a component — a distributed defect across 21 files.

| File | Ad-hoc | Named roles |
|---|---|---|
| `command-center.tsx` | 21 | 0 |
| `team-manager.tsx` | 13 | 3 |
| `team-board.tsx` | 9 | 1 |
| `my-week-view.tsx` | 8 | 0 |
| `department-view.tsx` | 7 | 0 |
| `insight-card.tsx` | 7 | 0 |
| `sign-in-panel.tsx` | 5 | 0 |
| `onboarding-panel.tsx`, `compliance-view.tsx`, `commitment-list.tsx`, `unit-list.tsx` | 4 each | 0 |
| `check-in-flow.tsx`, `notification-centre.tsx`, `composer.tsx` | 3 each | 0–1 |
| six others | 1–2 each | 0 |

The board layer is fully migrated and uses the named roles. These 21 files are
the same defect the migration fixed, in the half that was not touched.

---

## Focus-area summary

| Area | State |
|---|---|
| **Executive command center** | Both implementations are structurally sound. Chairman's is clean; admin's has a clipped chart axis and no mobile adaptation. |
| **Employee workspace** | `CopilotHome` is the strongest surface in the product. `my-week-view` is dead and misleading. |
| **Check-in** | Two paths, neither explained. Desktop layout wastes its width. |
| **AI interactions** | Grounding holds — no model-produced figure on any screen. Tone is *safe* but mostly lacks situational awareness; graded against the standard in `ai-communication.md` it does not pass. See [ai-personality-audit.md](ai-personality-audit.md). Also: **only the Chairman has a conversational surface** — HR and leads cannot ask a question. |
| **Navigation** | Genuinely device-aware and role-correct. No findings. |
| **Glass usage** | Zero nesting, only L1/L2 — but **not rendering at all**. See headline. |
| **Card usage** | No nesting violations. Cards are load-bearing, not reflexive. |
| **Typography** | Two populations: the board layer on the scale, 21 files off it. |
| **Spacing** | No violations found. The 4pt grid holds across both layers. |
| **Information hierarchy** | Strong in the boards. Weakest on `/check-in` desktop, where the hierarchy is one card in a void. |
| **Mobile** | Good on the boards. `command-center` is a 2,292px stack. |
| **Desktop** | Good throughout except `/check-in`. |
| **AI communication tone** | Safety floor holds: no accusatory language, no invented figures, no characterisation of individuals. **But "nothing to correct" was wrong** — that graded compliance, not quality. See [ai-personality-audit.md](ai-personality-audit.md). |

---

## Highest priority

1. **The glass regression.** One line, product-wide, restores the stated visual
   identity. Everything else is cosmetic by comparison.

2. **Decide what `/check-in` is for.** The only finding that confuses a user
   rather than merely looking inconsistent. A product decision, so it needs the
   owner rather than a reviewer.

3. **The clipped chart axis.** A chart nobody can read a value from is one the
   rules say to delete — and this one should be kept, so fix it.

4. **Migrate `team-board.tsx` and the four shared primitives.** Small, and the
   primitives are the reason the migrated boards still show drift.

5. **Delete `my-week-view.tsx`** once its two children are confirmed unused.

---

## Correction — the AI tone line was wrong

This audit originally recorded *"AI communication tone — nothing to correct"*.
That was graded against a compliance checklist (no blame, no invented numbers,
evidence present) rather than against the standard `ai-communication.md`
actually sets: Observation → Context → Implication → Action.

Against that standard most of the product's voice does **not** pass. The full
finding, with the structural cause, is in
[ai-personality-audit.md](ai-personality-audit.md).

Short version: the gap is data plumbing, not wording. Every voice that sounds
like a chief-of-staff has history available; every voice that sounds like a
status reporter does not.

---

## Notes and open questions

**Two things I could not confirm.** Whether the missing conversational surface
for HR and leads is deliberate — the Chairman's assistant may be intentionally
exclusive, and that is a product call, not a defect. And whether admin is meant
to be a first-class product surface at all; four of five admin screens are the
old layer, which is defensible for an internal maintenance role but should be a
decision rather than an accident.

**The old layer is not bad code.** It is tested and RLS-correct, and it carries
logic that must survive any restyle: `command-center.tsx` renders the product's
only chart, `team-manager.tsx` is the sole invitation surface. Rework means
reskinning against the design system, not rewriting behaviour.

**A contradiction worth keeping visible.** `rejected-patterns.md` rejects
decorative analytics, and the only chart in the product lives in
`command-center.tsx`. That chart is not decorative — promised against delivered
over eight weeks is precisely where a trend changes a decision. The rejection
stands, the chart stays, and it gets a readable axis. Noted so a future pass does
not delete it by rule-matching.

**Screenshots understate the design.** Because of the glass regression, every
capture in `.smoke/` shows flat cards. Once the blur is restored, the visual
assessments above should be re-run — depth changes how dense a screen feels, and
some of the spacing judgements may move.
