---
name: nexus-review
description: Review NEXUS interface work against the product spec, visual system, AI voice and rejected patterns. Use after building or changing UI, or when asked to critique a screen. Produces findings ranked Critical / Important / Polish, biased toward removing rather than adding.
---

# NEXUS UI Review

Review what is actually on screen, not what the diff intended.

**Look at the interface before reading the code.** Run the sweeps and open the
screenshots in `.smoke/`. A review conducted purely by reading a diff finds
naming problems and misses the fact that the first thing on the page is the
wrong thing.

```bash
npm run smoke:prod        # every role, every route, 360 / 768 / 1440
npm run smoke:checkin     # if the check-in changed
npm run smoke:assistant   # if the assistant changed
```

---

## Review against

1. **Product purpose** — `design/NEXUS.md`. Does this screen answer one of the
   seven questions? Which one?
2. **Role** — is this the right altitude for whoever reaches it? A page that
   reads as surveillance to an employee and as noise to an executive has failed
   both.
3. **User flow** — where did they come from, where do they go, does the screen
   carry them.
4. **Design system** — `design/visual-system.md`. Type scale, named roles,
   spacing, surfaces, motion.
5. **Rejected patterns** — `design/rejected-patterns.md`, item by item.
6. **AI tone** — `design/ai-communication.md`, if any generated or AI-facing
   text appears.
7. **Content** — `design/ui-content.md`. Real language, no placeholders.
8. **Responsive** — genuinely adapted, or a desktop layout stacked.

---

## Rank every finding

### Critical

Broken or fundamentally wrong UX. The user cannot do the task, is misled, or is
shown something they should not see.

Examples that have occurred here: a submit path returning 500 on every attempt;
sign-out rendering below the viewport; a status label at 2:1 contrast; an empty
briefing reporting itself as delivered; HR nagged for a check-in they never file.

### Important

Significant hierarchy, layout, content or visual problems. The task is possible
but the screen fights the user.

Examples: fifteen pills to say "these people are fine"; three near-identical
finding cards; the wrong thing first; a chart nobody acts on.

### Polish

Minor refinement. Spacing, a wrapped label, an icon that could be better.

**Do not pad a review with Polish findings.** Three real Critical or Important
findings are worth more than fifteen items about spacing.

---

## The order of preference

Always in this order:

```text
remove  →  simplify  →  restructure  →  improve  →  add
```

**Reach for `remove` first.** The question is not "what would make this better",
it is "what is here that does not need to be". An executive dashboard fails by
showing everything it could rather than the few things that change a decision,
and the same is true of every other surface.

**Never recommend adding an element to make a page look more complete.** A short
column is not a problem. Empty space is not a defect. If a section is mostly
empty, the section is the problem — not the space around it.

---

## Questions to ask of every screen

**Product.** What is this trying to accomplish? Can you say it in one sentence?

**Hierarchy.** What is the first thing the eye lands on? Is it the right thing?

**Visual.** Does this feel like NEXUS, or like a generic SaaS dashboard? Could
you tell which product this is with the logo removed?

**Content.** Does every sentence carry meaning? Is there a single word of
placeholder copy?

**AI.** Does it sound helpful and observant, or robotic and judgmental? Does it
expose an individual unnecessarily? Does it state a number a model produced?

**Evidence.** Can a reader check any claim on the screen?

**Responsive.** Is the mobile experience adapted, or squeezed?

**Restraint.** What can be removed? Answer this one properly — there is almost
always something.

---

## Verify before reporting

Do not report a finding you have not confirmed. Specifically:

- **Contrast:** measure it from the rendered DOM. Tokens lie — four status
  values are white at low alpha and read fine as dots.
- **Reachability:** trace `lib/nav.ts` and the page's role branch before saying
  a role sees something. A component can be routed to and still be unreachable.
- **"It looks broken":** check whether it is the data. A duplicated row was a
  seed-generator bug, not a rendering one.

---

## Output

Findings ranked, most severe first. For each:

- what is wrong
- where — file and line
- **why it matters to the person using it**, not why it violates a rule
- the smallest change that fixes it

If nothing survives verification, say that plainly. A review that manufactures
findings to look thorough is worth less than one that says the screen is fine.
