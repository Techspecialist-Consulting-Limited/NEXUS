# NEXUS — Visual System

> Owns every visual decision: surfaces, typography, color, spacing, motion.
>
> The tokens described here are **already implemented** in `app/globals.css`.
> Read that file before adding anything; the most common mistake in this
> codebase has been inventing a value that already had a name.

---

## Mood

**Calm · intelligent · precise · premium · trustworthy · institutional · alive.**

Not: loud, cluttered, gamified, generic SaaS, decorative sci-fi.

The premium feel comes from restraint and typography, not from effects.

---

## Liquid glass is a material, not the identity

NEXUS uses a dark-first liquid glass language. Glass is **supporting material**.

Use glass when it genuinely improves hierarchy, depth, focus or layering. Do not
use glass because an element happens to be a card.

| Level | Use | Style |
|---|---|---|
| **L1** | Cards, panels | `bg-white/[0.04] backdrop-blur-xl border-white/[0.08]` |
| **L2** | Elevated content, nav | `bg-white/[0.06] backdrop-blur-2xl border-white/[0.12]` + shadow |
| **L3** | Modals, sheets | `bg-white/[0.08] backdrop-blur-3xl border-white/[0.15]` |
| **L4** | Toasts, tooltips | `bg-white/[0.12] backdrop-blur-3xl border-white/[0.20]` |

The product uses L1 and L2 almost exclusively. That is correct.

**Never:**

- glass inside glass
- excessive blur or shine
- glowing borders
- decorative orbs, blobs or bokeh
- gradients that carry no meaning

**Always:**

- borders are `white/opacity`, never `gray-*` — gray on dark reads muddy
- the diagonal sheen is barely perceptible; if you can see it clearly, it is too strong
- `rounded-lg` for cards, `rounded-xl` for modals and sheets

---

## Visual hierarchy, in priority order

1. **Typography**
2. **Spacing**
3. **Grouping**
4. **Contrast**
5. **Restrained color**
6. **Surfaces**
7. **Motion**

**Do not solve every layout problem with a card.** Reach for spacing and type
weight first. A card is a container of last resort — it says "this is a separate
thing", and most things on a page are not.

---

## Typography

**Inter** for body and interface. **JetBrains Mono** for every figure.
A **display face** carries titles, used with restraint — see the rule below.

### The scale — use it, never an arbitrary value

```css
--text-2xs: 0.6875rem;  /* 11px — labels, timestamps, counts */
--text-xs:  0.75rem;
--text-sm:  0.875rem;
--text-base: 1rem;
--text-lg:  1.125rem;
--text-xl:  1.25rem;
--text-2xl: 1.5rem;
--text-3xl: 2rem;
--text-4xl: 2.5rem;
```

Ad-hoc pixel values are not a scale — they are one decision per use, and they
drift by a pixel or two between components that should match. This has already
happened once here: twelve sizes across a handful of new files, seven of them
arbitrary.

**`--text-2xs` must stay inside the `@theme` block in `app/globals.css`, not in
`:root` with the others.** It is the one step Tailwind does not ship, and
Tailwind v4 generates a `text-*` utility only for a variable it can see inside
`@theme`. Declared in `:root` alone, the variable exists — `.eyebrow` and
`.note` resolve it perfectly well — but the class `text-2xs` compiles to no rule
at all. That is what happened: 111 usages across 32 files silently inherited
their parent's size, and the phone's bottom navigation drew 16px labels inside a
pill built for 11. Nothing errors; a missing utility is simply absent, which is
why `scripts/smoke.mjs` now measures a rendered `.text-2xs` on every page.

### Named roles

Defined in `app/globals.css`. Use these instead of repeating four declarations
at each call site.

| Class | Role |
|---|---|
| `.page-title` | One per page. 24px, 32px from `md`. |
| `.standfirst` | The sentence under a page title. Capped at 68ch. |
| `.card-title` | A card or band heading. |
| `.eyebrow` | The label above a section. Structure, not content. |
| `.body-sm` | Body copy inside a card. |
| `.note` | Provenance, timestamps, counts. |
| `.metric` | **Every number.** Mono, tabular figures so columns do not wobble. |

### Rules

1. Headings are `font-medium` (500), never `font-bold`.
2. Never tighter than `-0.02em` on a title; never negative on body text.
3. **Color carries hierarchy, not weight.** `--text-primary` (0.9),
   `--text-secondary` (0.6), `--text-tertiary` (0.55).
   `--text-quaternary` (0.3) is **decoration only, never text.**
4. `text-wrap: balance` on titles, `pretty` on prose.
5. Body copy caps at 65–75ch.

### The display face

Reopened deliberately on 2026-08-31. This document previously said "do not
introduce a new font, the typography system is settled", and Inter everywhere
was the right call while the product was finding its shape: it is invisible,
it never fights the content, and it let every other decision be made without
typography arguing back.

It is also why every screen reads as competent and none reads as *this
product*. Inter is the single most-used interface face on the web; a page set
entirely in it announces nothing about what it is. NEXUS is a record of what an
organisation promised and what it did — that has a voice, and the titles are
where it should be audible.

**Three faces, three jobs, and no more:**

| Role | Face | Where |
|---|---|---|
| Display | the chosen display face | page titles and card headings only |
| Body | Inter | everything a person reads |
| Figures | JetBrains Mono | every number, tabular |

**The restraint is the whole point.** A display face on body copy is a costume;
on a title it is a voice. It appears at `.page-title` and `.card-title` and
nowhere else. Rules 1–5 below still hold: medium weight, never bolder.

Nothing else joins them. Three faces is a system; four is a collection.

---

## Color

Retain these. Do not introduce arbitrary new colors.

### Department identity

```css
--dept-techspecialist: #5B8CFF;   /* engineering */
--dept-media-hub:      #F2789F;   /* production */
--dept-creative-hub:   #F5B942;   /* brand */
--dept-operations:     #48C9A9;   /* delivery */
--dept-growth:         #B18CF5;   /* revenue */
```

### Status — and the trap inside it

```css
--color-promised:    rgba(255,255,255,0.55);
--color-in-progress: #5B8CFF;
--color-delivered:   #48C9A9;
--color-partial:     #F5B942;
--color-deferred:    rgba(255,255,255,0.38);
--color-blocked:     #F2789F;
--color-dropped:     rgba(255,255,255,0.22);
--color-superseded:  rgba(255,255,255,0.30);
```

**Four of these are white at low alpha. They are fill colors, not text colors.**

A 6px dot at 0.22 alpha is perfectly legible. The word "Dropped" in that same
value lands around 2:1 against the surface — below every contrast floor there
is, on the one status a person most needs to notice about their own week.

So every status carries **two** colors:

- `tone` paints the dot or fill
- `text` paints the label — achromatic statuses map to `--text-secondary`

### Signal

```css
--color-healthy:  #48C9A9;
--color-warning:  #F5B942;
--color-critical: #F2789F;
--color-neutral:  rgba(255,255,255,0.4);
```

**Color carries severity. The icon carries kind.** Deriving both from severity
made a cross-team bottleneck and a dropped commitment arrive as identical amber
rockets — which makes a scannable row unscannable. And a rocket on "commitments
went quiet" reads as good news at a glance, exactly the wrong first impression
for the finding this product exists to surface.

---

## Spacing

A 4pt grid, already defined as `--space-1` through `--space-20`. Use it. Do not
scatter arbitrary values through new components.

Vary spacing for rhythm — even spacing everywhere reads as a wireframe.

---

## Motion

Motion communicates **change, state, orientation, feedback**. If removing an
animation leaves the interface just as clear, remove it.

Motion must not exist because a screen feels empty. **Do not animate every card
automatically** — the uniform entrance reflex applied to every section is the
tell, not motion itself.

Shared springs live in `lib/motion-tokens.ts`:

| Token | Config | Use |
|---|---|---|
| `springDefault` | 350 / 30 | Almost everything |
| `springGentle` | 200 / 25 | Page transitions, large areas |
| `springSnappy` | 500 / 35 | Button feedback |
| `springBouncy` | 300 / 15 | Drag-to-dismiss only |

Non-spring work uses `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`.

| Element | Duration |
|---|---|
| Button press | 100–160ms |
| Tooltip, popover | 125–200ms |
| Card expand/collapse | 200–300ms |
| Modal, sheet | 200–400ms |
| Page transition | 200–300ms |
| Stagger between items | 30–80ms |
| Ambient drift | 30–60s |

**UI animation stays under 300ms.** A 180ms dropdown feels more responsive than
a 400ms one.

### Hard rules

- **Only animate `transform` and `opacity`.** Never `width`, `height`,
  `margin`, `padding`, `top`, `left`.
- **Never `ease-in` on UI.** It starts slow, and the first moment is what the
  user watches.
- **Never `scale(0)` for entry.** Start at `scale(0.95)` + `opacity: 0`.
- **Import `m`, never `motion`.** `LazyMotion` runs in `strict` mode; there is
  an ESLint rule enforcing it, because the violation only throws client-side and
  survives build, typecheck and HTML inspection.
- **Never opacity-fade the LCP element.**
- Reduced motion is handled globally by `MotionConfig reducedMotion="user"`.
  Keep opacity fades; drop movement.

---

## Layout and responsiveness

Three breakpoints, verified on every route by `npm run smoke:prod`:

| Width | What it catches |
|---|---|
| **360px** | The narrowest phone worth supporting |
| **768px** | Where a rail and content start to collide |
| **1440px** | The desktop the Chairman actually uses |

- **Phone:** single column, floating glass bottom nav, primary action in the
  thumb zone. `main` carries `pb-28` to clear the fixed nav.
- **Tablet (`md`):** icon rail at 76px.
- **Desktop (`lg`):** full sidebar at 244px.

### The launcher in the middle of the phone bar

A raised 48px circle between the tabs, and the only way NEXUS is spoken to. It
is an **action, not a destination** — no label, no `aria-current`, never takes
the sliding indicator.

What it opens follows what the role does. Anybody who files a week gets the
quick voice check-in on their own home screen; the Chairman gets the assistant.
Both arrive with the microphone already listening, and the `?ask=1` that carried
the instruction is cleared in the same pass so a refresh does not reopen it.

**It replaces a tab rather than joining them.** For filers it takes the place of
"Check in": two entry points to the same act, one of them four times the size,
is a question the interface should not be asking. The tab stays in the desktop
sidebar, where there is no launcher.

The admin has none. They neither file nor carry the assistant, so a microphone
in the middle of their bar would open nothing — and a prominent button that does
nothing is worse than five plain tabs.

**Mobile-first does not mean every screen looks like a stretched phone app.** It
means the employee's phone workflow is designed and validated first, then
desktop uses the larger space properly. The executive view is a command room,
not a centred phone column.

No horizontal scrolling anywhere. Wide content scrolls inside its own container.

---

## Touch targets

44px minimum. No exceptions.

- A control that opens something gets the target.
- A static label is a `<span>`, not a `<button>`.
- A **disabled button that does nothing** is worse than either — it sits in the
  tab order and the accessibility tree and fails a check it can never pass.

---

## Accessibility

- Body text ≥ 4.5:1 against the glass **and** the background behind it. Measure
  the rendered DOM; do not assume from the token.
- Visible focus ring on every interactive element.
- Decorative elements are `aria-hidden`, including any element whose state is
  already stated in words beside it.
- Never signal state by color alone.
