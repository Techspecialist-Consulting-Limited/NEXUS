@AGENTS.md

# NEXUS

An AI-powered organizational reporting and execution system for Techspecialist
Consulting Limited.

It connects: **employee updates → commitments → reconciliation → blockers →
managerial support → executive intelligence.**

---

## Current project state

**This is an existing, working application.** Backend, database, migrations,
RLS, AI layer, queries, authentication, business logic and tests are implemented
and verified.

Preserve them. Do not rebuild a functioning system without explicit instruction.
When new documentation uses different terminology from the code, map the
documentation to the implementation — do not rename working code to match a
document.

---

## Sources of truth

| Topic | File |
|---|---|
| Product, roles, experience | `design/NEXUS.md` |
| Surfaces, typography, color, motion | `design/visual-system.md` |
| How the AI speaks | `design/ai-communication.md` |
| Realistic UI copy | `design/ui-content.md` |
| What we do not build | `design/rejected-patterns.md` |
| Current UI state and queue | `design/current-ui-audit.md` |
| Architecture, data model, security, verification | `GUIDE.md` |
| Visual intent | `design/references/` |

For **UI work**, read the first five, then the relevant references.
For **engineering work**, read `GUIDE.md`.

---

## UI principles

Prioritise clarity, usefulness, information hierarchy, decision support,
restraint, trust, role-specific experience, and mobile usability.

- **Do not create generic SaaS dashboard patterns.** A KPI grid stacked on
  another KPI grid shows everything and decides nothing.
- **Do not add UI to make a screen look fuller.** A short column is not a
  defect.
- **Do not use decoration where information would help.** Every visible element
  supports a decision or a workflow; if removing it changes nothing about what
  the reader does next, remove it.

Each of the three modes has a different altitude — Assist (employee), Coach
(manager), Command (executive). Never serve one dashboard to all three.

---

## Implementation

Respect the existing architecture. Next.js App Router, React 19, TypeScript
strict, Tailwind v4, Postgres via Supabase, PGlite locally.

- **Inspect existing components before creating one.** `components/ui/` holds
  primitives; the board layer in `components/executive|staff|hr|lead/` is the
  current visual standard.
- **Read `app/globals.css` before adding a value.** The most common mistake here
  has been inventing something that already had a token.
- Client components are leaves, never layouts. Never import `lib/db.ts` into
  one.
- Do not add a library without saying why nothing already present can do it.

Security is enforced by row-level security, not by React conditions. Every read
goes through `asActor()`.

---

## AI

- **Numbers come from application data. Prose comes from the AI.** Never render
  a figure a model produced. A model that computes gets caught being wrong
  exactly once.
- AI interpretation stays visually distinguishable from fact, and confidence is
  stated rather than implied.
- AI communication is supportive, contextual, concise and evidence-based. It
  never blames a person, and it never characterises effort or reliability —
  the system cannot observe either.
- **"I do not have that" must be a reachable answer.** An assistant that cannot
  say it will invent.

---

## Completion

A UI task is not complete because the code builds.

Before calling it done, evaluate: information hierarchy, user flow, responsive
behaviour at 360 / 768 / 1440, visual consistency, unnecessary elements, AI
tone, accessibility, and the rules above.

Verify rather than assume:

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run smoke:prod
```

The visual sweep loads pages but never presses anything — use
`npm run smoke:checkin` and `npm run smoke:assistant` when those flows change.

**Look at the screenshots in `.smoke/`.** Reading a diff is not seeing a screen.

For substantial UI work, use the `nexus-ui` skill, then the `nexus-review` skill
or the `nexus-ui-reviewer` agent.
