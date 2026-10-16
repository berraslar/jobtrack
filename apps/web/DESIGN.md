---
name: JobTrack
description: A sunlit pastel studio for one person's job search.
colors:
  canvas: '#fdf8f6'
  surface: '#ffffff'
  surface-muted: '#f7f4fb'
  ink: '#2a2140'
  ink-muted: '#635a78'
  line: '#ece6f3'
  line-strong: '#d9d0e8'
  control: '#8a80a0'
  brand: '#ffd23f'
  brand-strong: '#ffc61a'
  on-brand: '#2a2140'
  signal: '#b3361f'
  focus: '#6d5ce8'
  danger: '#c0263f'
  warning: '#8a5a00'
  success: '#1f7a4d'
  series-1: '#8b7cf6'
  grid: '#efeaf5'
  sky: '#dff0ff'
  sky-solid: '#5aa9e6'
  lilac: '#ebe5ff'
  lilac-solid: '#8b7cf6'
  peach: '#ffe6da'
  peach-solid: '#f4895f'
  butter: '#fff3c4'
  butter-solid: '#eeb300'
  mint: '#dcf5e8'
  mint-solid: '#3fb67f'
  rose: '#ffe0e6'
  rose-solid: '#e5597a'
  mist: '#eeecf3'
  mist-solid: '#a49cb5'
  glow-peach: '#ffd9c7'
  glow-lilac: '#dcd3ff'
  glow-sky: '#c9e8ff'
  canvas-dark: '#16121f'
  surface-dark: '#201a2c'
  surface-muted-dark: '#2a2338'
  ink-dark: '#f4effc'
  ink-muted-dark: '#b9b0cc'
  line-dark: '#352d45'
  line-strong-dark: '#4a4060'
  control-dark: '#7d7394'
  brand-dark: '#ffd54d'
  brand-strong-dark: '#ffe07a'
  on-brand-dark: '#241c33'
  signal-dark: '#ff9b85'
  focus-dark: '#b2a6ff'
  danger-dark: '#ff8597'
  warning-dark: '#f5c44e'
  success-dark: '#6fdca4'
  series-1-dark: '#b2a6ff'
  grid-dark: '#2f2840'
  sky-dark: 'color-mix(in oklab, #8cc8f5 24%, #201a2c)'
  sky-solid-dark: '#8cc8f5'
  lilac-dark: 'color-mix(in oklab, #b2a6ff 24%, #201a2c)'
  lilac-solid-dark: '#b2a6ff'
  peach-dark: 'color-mix(in oklab, #ffab88 24%, #201a2c)'
  peach-solid-dark: '#ffab88'
  butter-dark: '#493f1d'
  butter-solid-dark: '#ffd54d'
  mint-dark: 'color-mix(in oklab, #74d9a6 24%, #201a2c)'
  mint-solid-dark: '#74d9a6'
  rose-dark: 'color-mix(in oklab, #ff8ea6 24%, #201a2c)'
  rose-solid-dark: '#ff8ea6'
  mist-dark: 'color-mix(in oklab, #8f87a3 14%, #201a2c)'
  mist-solid-dark: '#8f87a3'
  glow-peach-dark: '#4a2a35'
  glow-lilac-dark: '#34285c'
  glow-sky-dark: '#1d3550'
typography:
  display:
    fontFamily: "'Bricolage Grotesque Variable', 'Figtree Variable', system-ui, sans-serif"
    fontSize: '4.5rem'
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: '-0.04em'
  headline:
    fontFamily: "'Bricolage Grotesque Variable', 'Figtree Variable', system-ui, sans-serif"
    fontSize: '2.625rem'
    fontWeight: 700
    lineHeight: 1
    letterSpacing: '-0.035em'
  stat:
    fontFamily: "'Bricolage Grotesque Variable', 'Figtree Variable', system-ui, sans-serif"
    fontSize: '3rem'
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: '-0.04em'
    fontFeature: 'tnum'
  title:
    fontFamily: "'Bricolage Grotesque Variable', 'Figtree Variable', system-ui, sans-serif"
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '-0.02em'
  body:
    fontFamily: "'Figtree Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: 'tnum'
  label:
    fontFamily: "'Figtree Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: '0.8125rem'
    fontWeight: 600
    lineHeight: 1.4
    fontFeature: 'tnum'
rounded:
  xs: '6px'
  sm: '10px'
  md: '14px'
  lg: '20px'
  xl: '28px'
  full: '9999px'
spacing:
  control-height: '40px'
  sheet-pad: '20px'
  sheet-pad-wide: '28px'
  gap: '12px'
  gap-wide: '16px'
  content-max: '72rem'
components:
  button-primary:
    backgroundColor: '{colors.brand}'
    textColor: '{colors.on-brand}'
    typography: '{typography.label}'
    rounded: '{rounded.full}'
    padding: '0 20px'
    height: '40px'
  button-primary-hover:
    backgroundColor: '{colors.brand-strong}'
    textColor: '{colors.on-brand}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.full}'
    padding: '0 20px'
    height: '40px'
  button-secondary-hover:
    backgroundColor: '{colors.surface-muted}'
  button-danger:
    backgroundColor: '{colors.danger}'
    textColor: '{colors.surface}'
    rounded: '{rounded.full}'
    padding: '0 20px'
    height: '40px'
  button-danger-quiet:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.danger}'
    rounded: '{rounded.full}'
    padding: '0 20px'
    height: '40px'
  button-danger-quiet-hover:
    backgroundColor: '{colors.rose}'
  button-ghost:
    textColor: '{colors.ink-muted}'
    rounded: '{rounded.full}'
    padding: '0 20px'
    height: '40px'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.sm}'
    padding: '0 12px'
    height: '40px'
  sheet:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.xl}'
    padding: '28px'
  stage-chip:
    backgroundColor: '{colors.lilac}'
    textColor: '{colors.ink}'
    typography: '{typography.label}'
    rounded: '{rounded.full}'
    padding: '2px 10px 2px 8px'
  follow-up-chip:
    textColor: '{colors.signal}'
    rounded: '{rounded.full}'
    padding: '2px 10px 2px 8px'
  count-pill:
    backgroundColor: '{colors.lilac}'
    textColor: '{colors.ink}'
    rounded: '{rounded.full}'
    padding: '2px 10px'
  nav-item-active:
    backgroundColor: '{colors.lilac}'
    textColor: '{colors.ink}'
    rounded: '{rounded.full}'
    height: '40px'
  kanban-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.lg}'
    padding: '14px'
---

# Design System: JobTrack

## Overview

**Creative North Star: "The Sunlit Pastel Studio"**

JobTrack is one person's job search laid out in a bright, calm workroom. Soft peach, lilac and sky light drifts slowly across a warm off-white ground, and the work itself sits on white sheets with generous rounded corners and long, soft, plum-tinted shadows. Every application is a rounded card you can pick up and move; every stage owns one fixed pastel that follows it everywhere it appears, always next to the stage's name.

The density is that of a daily working tool, not a poster: 40px controls, 15px tabular body text, tables and boards in separate sheets set directly on the ground. Color is generous in fills (chips, lane heads, stat tiles, the today band) and restrained in ink: one deep aubergine for text, one butter-yellow pill for the primary action, one brick-red signal for "needs you". Motion is noticeable but never in the way: the ground drifts, the active navigation pill slides, lists rise once, bars grow, and the stage path glides to its new position.

The world explicitly replaces the previous hairline "Ruled Ledger" look and rejects the category default of a gray admin panel with a blue primary.

**Key Characteristics:**

- Drifting three-blob aurora ground (peach, lilac, sky) behind everything; paused under reduced motion.
- White sheets with 28px corners and soft plum-tinted shadows; sheets never nest.
- Pill-shaped buttons and navigation; butter-yellow primary with aubergine ink.
- A fixed pastel per stage, used only beside the stage's name.
- Bricolage Grotesque for headings, Figtree for UI and body, tabular figures throughout.
- Dark theme is a plum night with dimmed glows and lifted pastels, not an inversion.

## Colors

A warm-white and aubergine base carrying a family of seven pastel stage hues, each in a light fill and a solid tone, with a single butter accent for action.

### Primary

- **Butter Pill** (brand): the background of the primary action only (save, "Yeni başvuru", landing CTA). Text on it is always aubergine (on-brand), never white. Hover deepens to brand-strong.

### Secondary

- **Brick Signal** (signal): "deal with this" — the follow-up flag text and its 10% tint chip, and the today band's due state. Measured 6.06:1 on white and 5.17:1 on its own 10% tint.
- **Lilac Focus** (focus): the keyboard focus outline and caret everywhere (4.83:1 on white). Lilac also carries selection (lilac-solid at 30%), link underlines, and the active navigation pill (lilac fill).

### Tertiary: stage hues

Seven families, each a light **fill** (chips, Kanban lane heads, stat tiles, monograms) and a **solid** (the stage path fill and marker, chip dot, timeline dot):

- **Sky** — saved. **Lilac** — applied, screening. **Peach** — technical, assignment. **Butter** — final. **Mint** — offer, accepted. **Rose** — rejected. **Mist** — no response, withdrawn.
- Dark-theme fills are not darkened pastels: each is `color-mix(in oklab, <solid> 24%, #201a2c)` (mist uses 14%), so they read as glowing tints on plum rather than going brown or murky green. Butter is the one exception: yellow mixed into plum turns taupe at any ratio, so its dark fill is a hand-picked dim gold, `#493f1d` (dark muted ink on it: 5.04:1).

### Neutral

- **Warm Paper** (canvas): the page ground under the aurora.
- **White Sheet** (surface) and **Lilac Shade** (surface-muted): content sheets, and hover/alternate rows inside them.
- **Aubergine Ink** (ink) and **Muted Plum** (ink-muted): all text; ink-muted measures 6.43:1 on white and 8.14:1 on the dark surface.
- **Soft Rule** (line, line-strong): sheet rings, table dividers, secondary-button hairlines, dashed empty-state borders.
- **Control Edge** (control): form-field borders, kept at 3.70:1 against the sheet (WCAG 1.4.11).
- **Status** (danger, warning, success): always paired with text. Danger on rose measures 4.75:1.
- **Chart** (series-1, grid): the single lilac data series and its gridlines.
- **Glows** (glow-peach, glow-lilac, glow-sky): only the aurora blobs and the landing hero wash.

### Named Rules

**The Hue Has a Name Rule.** A stage hue never appears without the stage's name beside it: chip, lane head, stage path next to its chip, timeline dot next to its label. Color is never the only carrier of stage.

**The One Series Rule.** Charts use a single lilac series (series-1). The pastel stage hues were tested as categorical chart colors and failed a palette validator; they stay out of plotted data, and stage is conveyed by the axis label.

**The Ink-on-Butter Rule.** The butter primary always carries aubergine text. Butter is for the one primary action in view (and the butter stage family); it is not a decorative highlight.

## Typography

**Display Font:** Bricolage Grotesque Variable (with Figtree, system-ui fallback), self-hosted via @fontsource-variable
**Body Font:** Figtree Variable (with system-ui, -apple-system, Segoe UI fallback), self-hosted via @fontsource-variable

**Character:** Bricolage brings a friendly, slightly quirky grotesque voice to headings with tight negative tracking; Figtree is a clean geometric sans that keeps dense UI legible. Both cover Turkish fully. Body sets `font-variant-numeric: tabular-nums`, so dates, counts and percentages align in every table and tile.

### Hierarchy

- **Display** (800, 2.75rem → 3.75rem at sm → 4.5rem at lg, line-height 0.98, -0.04em): the landing hero headline only. Landing section headings use the same voice at 2.25–3.25rem.
- **Headline** (700, 2.125rem → 2.625rem at sm, line-height 1, -0.035em): the page title in the app, set directly on the ground, optionally followed by the lilac count pill.
- **Stat** (Bricolage 700, 3rem, line-height 0.95, -0.04em, tabular): dashboard stat tiles.
- **Title** (Bricolage 600, 1.125rem): sheet (Card) titles; dialog titles at 1.25rem; Kanban card titles in Bricolage 600 at body size.
- **Body** (Figtree 400, 0.9375rem, line-height 1.5): everything else; prose capped at 44–65ch.
- **Label** (Figtree 600, 0.8125rem): field labels and stage chips. Hints and table heads at 0.75rem.

All h1–h3 use Bricolage with `text-wrap: balance` and -0.02em base tracking.

### Named Rules

**The Two Voices Rule.** Bricolage for headings, the wordmark and stat numerals; Figtree for everything you read or operate. The company Monogram is Figtree extrabold, not Bricolage.

**The Tabular Rule.** Numerals are tabular everywhere; never switch a table or tile back to proportional figures.

## Layout

The app shell is a two-column grid at lg: a 17rem floating white rail (sticky, full height, inset 16px from the viewport edges, 28px corners) and a main column capped at 72rem with 40px side padding. Below lg the rail becomes a top sheet with a wrapping pill menu; main padding drops to 12–24px. Nothing scrolls horizontally at 360px except the Kanban board, which scrolls inside its own container.

Pages stack separate sheets on the ground: page header (on the ground) → today band (pastel tiles) → filter sheet → list or board sheet. Sheets pad 20px, 28px from sm. Gaps between sibling cards and tiles are 12–16px. Kanban lanes are 16rem wide. Auth screens center one 27rem sheet. The landing uses a 76rem shell with a two-column hero (copy left, live mini-board right) over a peach-to-sky wash whose bottom edge is a wide elliptical curve.

**The No Nested Sheets Rule.** A sheet never sits inside a sheet. Filters, tables and boards are siblings on the ground; inside a sheet, grouping uses surface-muted rows, rules or pastel fills.

## Elevation & Depth

Depth is soft and ambient: three long, negative-spread shadows tinted with the aubergine ink (pure black in dark mode), plus a 1px ring of line at 70% on every sheet so edges hold on the pale ground. The aurora sits beneath everything at z-index -1.

### Shadow Vocabulary

- **Sheet** (`0 1px 2px rgb(42 33 64 / 0.04), 0 30px 60px -30px rgb(42 33 64 / 0.22)`): every white sheet and the rail.
- **Soft** (`0 1px 2px rgb(42 33 64 / 0.05), 0 8px 24px -12px rgb(42 33 64 / 0.16)`): primary buttons at rest, Kanban cards, the stage-path marker.
- **Lift** (`0 2px 4px rgb(42 33 64 / 0.06), 0 20px 40px -16px rgb(42 33 64 / 0.28)`): hover on primary buttons and Kanban cards, dialogs, tooltips, the skip link.

### Named Rules

**The Shadow-Only Lift Rule.** Hover raises an element by deepening its shadow (soft → lift), never by translating it. Moving hit targets on hover caused edge jitter; the pointer must never chase the target.

## Shapes

Everything is rounded, and roundness scales with size: 6px for focus-ringed inline links, 10px for inputs and tooltips, 14px for monograms and alerts, 20px for Kanban cards and lane heads, 28px for sheets, stat tiles, feature tiles and dialogs. Every button, chip, count, navigation item and the stage path is a full pill. Avatars, the stage marker and step icons are circles. The brand mark is three overlapping circles (peach, lilac, sky). Empty states use a 2px dashed line-strong border on a 28px corner.

## Components

### Buttons

Soft, confident pills that press down.

- **Shape:** full pill, 40px tall (48px on landing CTAs), 20px side padding, 14px semibold.
- **Primary:** butter fill, aubergine text, soft shadow; hover deepens to brand-strong and lifts the shadow.
- **Secondary:** white with a line-strong hairline; hover darkens the hairline and tints the fill surface-muted.
- **Danger-quiet:** white with a 40% danger hairline and danger text, rose fill on hover; used on pages. The solid **Danger** button appears only as the final confirm inside the dialog.
- **Ghost:** muted text, surface-muted on hover.
- **Press / Focus:** `active:scale(0.97)`; 200ms transitions; 2px lilac focus outline at 2px offset.
- Links styled as actions (PRIMARY_LINK, SECONDARY_LINK) share these exact looks.

### Chips

- **Stage chip:** pill in the stage's light fill, aubergine 13px semibold label, 8px solid-tone dot leading.
- **Follow-up chip:** signal at 10% tint, signal text, bold 12px, a dot whose ping ring pulses three times (2.4s) then rests.
- **Count pill:** lilac fill beside the page title.

### Cards / Containers

- **Sheet / Card:** white, 28px corners, sheet shadow, 1px line ring at 70%; title left and actions right on one row, 20px gap to content.
- **Stat tile:** stage-hue fill, 28px corners, muted label above a 3rem Bricolage numeral.
- **Today band:** pastel tiles (butter for follow-ups, rose when any are due; sky for the next interview).

### Inputs / Fields

- **Style:** 40px, white, 10px corners, control border at 70%, 12px side padding; label above in 13px semibold, hint and error below in 12px, all wired with aria-describedby.
- **Hover:** border darkens toward ink.
- **Focus:** border turns focus lilac with a 4px focus halo at 18%; no outline.
- **Error / Disabled:** danger border via aria-invalid; 60% opacity disabled.

### Navigation

A floating white rail with the wordmark (three-blob mark plus Bricolage extrabold name) at top, pill links with 20px stroke icons, and language, theme and sign-out at the foot. The active item is bold ink on a lilac pill with a faint inset lilac ring and a lilac-solid icon; the pill slides between items on route change (view transition `nav-pill`, 380ms expo-out). Inactive items are muted and tint surface-muted on hover. On mobile the same sheet sits on top and the pills wrap.

### Stage Path (signature)

A 120×8px pill track in grid color with faint stop notches. Its fill scales from the left in the stage's solid tone (open stages fill proportionally; closed stages fill completely), and a 14px marker with a 3px surface border and soft shadow rides its leading edge. On stage change the fill and marker glide over 420ms `cubic-bezier(0.16, 1, 0.3, 1)`, transform only. It is hidden from assistive tech because the adjacent stage chip carries the information.

### Kanban

Lanes are 16rem columns with a 20px-cornered head in the stage's light fill (solid dot, name, white count pill). Cards are white, 20px corners, soft shadow, line ring; hover lifts the shadow only. A dropped card plays `land` (scale 0.94 and -6px up to rest, 420ms). Each card also carries an accessible stage select, so moving never depends on dragging.

### Monogram

A company's initial in Figtree extrabold on a 14px-cornered tile whose pastel is derived deterministically from the name (peach, lilac, sky, mint, butter, rose).

### Dialog

Native `<dialog>`, white, 28px corners, lift shadow, aubergine backdrop at 30% with a 2px blur; opens from scale 0.95 and 8px down over 300ms expo-out. Cancel (secondary, autofocused) sits before the danger confirm.

### Motion

One easing, `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out), for all entrances. Aurora blobs drift 38–52s alternate. Page change: old view fades up 6px over 160ms, new view rises 14px over 420ms. Lists `rise` 12px over 560ms, staggered 45ms and capped at 10 items. Scroll sections `reveal` (36px, scale 0.98) where scroll timelines are supported. Dashboard bars `grow-x` / `grow-y` from their base over 900ms. The landing demo card `float`s. Under `prefers-reduced-motion` all of it collapses to an instant end state and the aurora stops.

**The Transform-Only Entrance Rule.** Entrance and reveal animations (rise, reveal, land, grow) animate transform only, never opacity or blur: content is legible and contrast-checkable from the first frame. The route cross-fade is the single exception, handled by the view-transition snapshot.

## Do's and Don'ts

### Do:

- **Do** put the stage's name beside every stage hue: chip, lane head, stage path with its chip, timeline dot with its label.
- **Do** plot charts in the single lilac series (series-1) on grid-colored rules.
- **Do** use the butter pill with aubergine text for the one primary action in view.
- **Do** set content on separate white sheets (28px, sheet shadow, line ring) directly on the aurora ground.
- **Do** express hover lift by moving from the soft to the lift shadow, and press with `scale(0.97)`.
- **Do** animate entrances with transform only and the expo-out curve, and honor reduced motion.
- **Do** build dark fills as `color-mix(in oklab, <solid> 24%, #201a2c)` (mist 14%; butter is the hand-picked dim gold `#493f1d`).
- **Do** keep form-field borders at the control token so they hold 3:1 against the sheet.

### Don't:

- **Don't** use the pastel stage hues as categorical chart colors; they failed palette validation for that role.
- **Don't** translate a hit target on hover; it caused edge jitter.
- **Don't** animate opacity or blur on entrance or reveal.
- **Don't** nest a sheet inside a sheet.
- **Don't** put white text on the butter primary or use butter as a decorative highlight.
- **Don't** return to hairline-ledger rules or a gray admin panel with a blue primary.
- **Don't** load fonts or assets from third parties; fonts are self-hosted under a strict CSP.
