# Visual references

> **Reference images describe visual intent. They do not replace product
> requirements.**

A reference shows a direction — structure, density, how much breathing room a
section gets. It does not override [NEXUS.md](../NEXUS.md),
[visual-system.md](../visual-system.md), or
[rejected-patterns.md](../rejected-patterns.md).

Where a reference and a product rule disagree, the product rule wins and the
disagreement gets stated out loud. This has already happened more than once and
both times the reference was right about the *shape* and wrong about the
*content*:

- A staff mock showed a coach reporting *"you've been focused for 3.5 hrs this
  morning"*. The layout was adopted; the metric was not, because NEXUS has no
  activity tracking and the number could only have been invented.
- The same mock put a percentage on every node of a commitment tree. The tree
  structure was adopted; leaf percentages were not, because a single commitment
  has a status and no percent-complete anywhere in the schema.

So: **take the structure from the reference, take the facts from the data.** If
a reference implies data that does not exist, say so rather than fabricating it.

---

## Layout

```text
references/
├── executive/    Command, Units, Insights, Alerts
├── employee/     My Co-Pilot, Tasks, Coaching
├── check-in/     Capture, AI review, confirmation
└── shared/       Navigation, empty states, primitives, mobile
```

## Adding a reference

1. Drop the image into the folder for the surface it describes.
2. Name it for what it shows, not where it came from:
   `executive-command-desktop.png`, not `Screenshot 2026-08-21.png`.
3. If the intent is not obvious from the image, add a sibling `.md` with a few
   lines on what to take from it — and, more usefully, what to ignore.

Screenshots of the current build belong in `.smoke/`, which the verification
sweeps write to. This folder is for **intent**, not for a record of what exists.
