---
name: nexus-ui
description: Build or change NEXUS interface work. Use for any task that adds, restructures or restyles a screen, component, empty state, or piece of UI copy in this repository. Loads the product spec, visual system, AI voice and rejected patterns, then plans before coding. Not for backend, query, migration or AI-provider work.
---

# NEXUS UI

You are working inside an **existing, working application**. Backend, database,
RLS, AI layer, queries, authentication and tests are implemented and verified.
Preserve them. This skill is about the interface.

---

## Before coding

Read, in this order. Do not skip on the assumption you remember them — the rules
carry reasons, and the reasons are what stop you re-introducing a fixed bug.

1. `CLAUDE.md`
2. `design/NEXUS.md` — what the product is, and what each role needs
3. `design/visual-system.md` — surfaces, type, color, motion, breakpoints
4. `design/ai-communication.md` — if any AI-facing text is involved
5. `design/ui-content.md` — the register to write copy in
6. `design/rejected-patterns.md` — **read this one every time**
7. `design/current-ui-audit.md` — whether this surface is Keep, Rework or Scrap
8. Any relevant images in `design/references/`

Then inspect the code:

- **Look for an existing component before writing one.** `components/ui/` has
  primitives; `components/executive|staff|hr|lead/` has the current board layer.
  `design/current-ui-audit.md` lists what is aligned and what is not.
- Read `app/globals.css` for tokens. The most common mistake in this repo has
  been inventing a value that already had a name.
- Trace which roles reach the surface. `lib/nav.ts` and the page's own role
  branch decide who sees what.

Then answer three questions before writing anything:

- **Who is this for?** staff, lead, hr, executive, admin — and which mode:
  Assist, Coach or Command.
- **What is the one task?** The thing this screen exists to let somebody do.
- **What is the primary information?** The single thing they should see first.

If you cannot answer all three, ask. A screen built without them becomes a
dashboard.

---

## Plan before implementing

Produce a short plan. Not a document — a paragraph or a short list covering:

- **Information hierarchy** — what is first, second, third, and why that order
- **Layout** — bands, columns, what collapses at each breakpoint
- **Interaction** — what the user does here
- **Responsive behaviour** — specifically 360, 768, 1440
- **Components reused**
- **Components created** — and why an existing one did not fit
- **Elements deliberately excluded** — this line is the point of the exercise

The exclusions line is not filler. A screen fails by showing everything it could
rather than the few things that change a decision, and writing down what you
left out is how you notice you left out nothing.

---

## While implementing

Priority order. Do not skip ahead to polish.

1. **Workflow** — can the person do the thing
2. **Hierarchy** — is the right thing first
3. **Content** — real sentences, from `design/ui-content.md`
4. **Responsive** — at all three widths
5. **Visual polish**
6. **Motion** — last, and only where it communicates

### Hard rules

- **Numbers come from SQL. Prose comes from the AI.** Never render a figure a
  model produced. If a number is on screen, trace it to a query.
- **Never invent data the system cannot observe.** No activity tracking exists.
  No per-commitment percentage exists. If a reference implies data that is not
  there, say so instead of fabricating it.
- **Use the type scale and the named roles.** Never an arbitrary pixel value.
- **Import `m`, never `motion`.** ESLint enforces it; the violation only throws
  client-side.
- **44px touch targets.** A static label is a `<span>`, not a disabled
  `<button>`.
- **Status colors have two values** — `tone` for the dot, `text` for the label.
  Four status tokens are white at low alpha and are unreadable as text.
- **Client components are leaves.** Never import `lib/db.ts` into one. Icons
  cross the boundary as string keys, never as components.
- **Do not add UI to fill space.** Do not add a card because a column looks
  short.
- **Do not introduce a library** without saying why nothing present can do it.

---

## After implementing

Verify, do not assume:

```bash
npx tsc --noEmit      # types
npm run lint          # includes the motion import rule
npm run smoke:prod    # every role, every route, 360 / 768 / 1440
```

If the change touches the check-in or the assistant, also run
`npm run smoke:checkin` or `npm run smoke:assistant`. The visual sweep loads
pages but never presses anything — that is how a 500 on every check-in
submission stayed invisible.

**Screenshot the result and look at it.** `.smoke/` holds the sweep's output.
Reading your own diff is not the same as seeing the screen.

Then check:

- mobile, tablet, desktop
- content quality — no placeholder copy, every sentence carries meaning
- visual hierarchy — is the first thing the right thing
- AI tone against `design/ai-communication.md`
- evidence — can a reader check any claim on screen
- accessibility — contrast measured, not assumed
- `design/rejected-patterns.md`, once more, against what you actually built

For substantial UI work, invoke the **nexus-review** skill or the
**nexus-ui-reviewer** agent before calling it done.

---

## Completion

A UI task is not complete because the code builds. It is complete when somebody
using it can do the thing faster or more confidently than before, and nothing on
the screen exists that does not help them.
