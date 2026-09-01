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

**Inter** for everything. **JetBrains Mono** for every figure.

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

Do not introduce a new font. The typography system is settled.

---

## Color

Two themes, one family. The light theme is a warm cream ground with brown ink
and a single deep teal; the dark theme is the same browns driven down in
lightness with the teal lifted to match. Both live in `app/globals.css` — the
dark values in `:root`, the light ones in `[data-theme="white"] .theme-surface`.
That attribute value is historical: it is stamped before first paint and sits in
every existing browser's storage, so it was not worth a rename.

```css
/* Ground and ink — light */
--nx-bg:      #F4EFE6;   /* cream */
--nx-sidebar: #EDE7DE;   /* warm sand */
--nx-surface: #FCFAF6;   /* the sheet a card is */
--text-primary:   #2E2420;  /* 13.20:1 */
--text-secondary: #6E5E57;  /*  5.39:1 */
--text-tertiary:  #7A6862;  /*  4.60:1 */
--text-quaternary:#9C8A84;  /*  2.87:1 — decoration only, NEVER text */

/* The one structural accent */
--nx-primary: #1A7A6D;   /* 4.53:1 on cream; #4FBFA8 on the dark ground */
--on-accent:  #FCFAF6;   /* 4.98:1 on the teal fill */
```

### The rule that keeps this from looking machine-made

Cream with a terracotta accent is the most recognisable AI-generated look on the
web. This palette contains both, so the rust is on a leash:

**Rust appears only where the product is reporting that something is wrong.**
Never as decoration, never on a heading, never a border flourish, never a
gradient. Teal carries every structural job — navigation, links, delivered,
focus. A screen with nothing wrong on it has no orange anywhere.

If you are reaching for `--color-critical` to make something look considered,
you have found the rule you are about to break.

### Department identity

```css
--dept-techspecialist: #2E2420;
--dept-media-hub:      #6E5E57;
--dept-creative-hub:   #9C8A84;
--dept-operations:     #4A3C36;
--dept-growth:         #B8A79E;
```

Warm neutrals, deliberately **not** the signal hues. A unit is an identity, not
a state — give one the teal that means "delivered" and a roster reads as a
verdict. They separate from each other by lightness.

**Known gap:** departments also carry a `color` column, set per organisation,
and a stored value overrides these tokens at render time. The seeded demo org
has coloured units for that reason. Whether departments should carry colour at
all is an open product question.

### Status — and the trap inside it

```css
--color-promised:    rgba(46,36,32,0.50);
--color-in-progress: #6E5E57;
--color-delivered:   #1A7A6D;
--color-partial:     #8A6410;
--color-deferred:    rgba(46,36,32,0.36);
--color-blocked:     #D35E37;
--color-dropped:     rgba(46,36,32,0.24);
--color-superseded:  rgba(46,36,32,0.30);
```

**Four of these are ink at low alpha. They are fill colors, not text colors.**

A 6px dot at 0.24 alpha is perfectly legible. The word "Dropped" in that same
value lands around 2:1 against the surface — below every contrast floor there
is, on the one status a person most needs to notice about their own week.

So every status carries **two** colors:

- `tone` paints the dot or fill
- `text` paints the label — achromatic statuses map to `--text-secondary`

**Blocked is the case that proves it.** `#D35E37` is the hottest mark in the
palette and the right dot for the worst state, and at 3.38:1 on cream it is not
allowed to set a word. Its label takes `#8E3E1B` at 6.42:1.

### Signal

```css
--color-healthy:  #1A7A6D;   /* teal   — fine */
--color-warning:  #8A6410;   /* bronze — slipping */
--color-critical: #8E3E1B;   /* burnt  — stuck */
--color-neutral:  rgba(46,36,32,0.40);
```

One warm ramp. The three separate by **hue**, not only lightness, so they
survive both themes and a greyscale print.

**Color carries severity. The icon carries kind.** Deriving both from severity
made a cross-team bottleneck and a dropped commitment arrive as identical amber
rockets — which makes a scannable row unscannable. And a rocket on "commitments
went quiet" reads as good news at a glance, exactly the wrong first impression
for the finding this product exists to surface.

### Measure it

Every value above was computed against its own ground, not chosen by eye. Two
of the supplied swatches failed and were demoted rather than used anyway:
`#9C8A84` (2.87:1) is decoration, `#D35E37` (3.38:1) paints but never writes.
If you add a color, compute its ratio before you commit it.

Shadows are tinted with the palette's brown (`rgba(20,14,12,α)`), never pure
black. A neutral shade over a warm ground desaturates it and drags the cream
towards putty.

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
