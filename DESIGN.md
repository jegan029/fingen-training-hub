---
name: FinGen Training Hub
description: Onboarding console for L2 support engineers; a learning path that draws itself as progress is made.
colors:
  canvas: "#f6f7fb"
  canvas-dark: "#0b1020"
  surface: "#ffffff"
  surface-dark: "#131a2e"
  surface-tint: "#eef0f7"
  surface-tint-dark: "#1b2340"
  border: "#d4d8e5"
  border-dark: "#2c3658"
  border-strong: "#9aa1b8"
  border-strong-dark: "#56618a"
  ink: "#0f1733"
  ink-dark: "#e6e9f5"
  ink-muted: "#4d5673"
  ink-muted-dark: "#a8b0cc"
  heading-navy: "#020b5b"
  heading-dark: "#f1f3fb"
  electric-blue: "#001aff"
  electric-blue-deep: "#0014cc"
  periwinkle: "#8c9bff"
  periwinkle-light: "#a9b4ff"
  on-accent: "#ffffff"
  on-accent-dark: "#0b1020"
  accent-soft: "#e6e9ff"
  accent-soft-dark: "#1e2656"
  success: "#13723a"
  success-dark: "#5fd08d"
  success-soft: "#e3f4e9"
  success-soft-dark: "#123322"
  warning: "#8a5300"
  warning-dark: "#f2b456"
  warning-soft: "#fdf1dc"
  warning-soft-dark: "#3a2a10"
  danger: "#b42318"
  danger-dark: "#ff8a80"
  danger-soft: "#fdecea"
  danger-soft-dark: "#3a1616"
  roadmap-line: "#3b5bff"
  roadmap-line-muted: "#aab4e8"
  roadmap-line-muted-dark: "#4a5588"
  roadmap-sub-border: "#b9bfd3"
  roadmap-sub-border-dark: "#3c4775"
  code-block: "#0f172a"
  code-text: "#e2e8f0"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 1.1
  headline:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.2
  headline-sm:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  section:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  button:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.2
  label:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.08em"
  numeric:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Arial, sans-serif"
    fontWeight: 700
    fontFeature: "tnum"
  mono:
    fontFamily: "Cascadia Code, Fira Code, ui-monospace, monospace"
    fontSize: "0.82em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "14px"
  full: "999px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "24px"
  space-6: "32px"
  space-7: "48px"
  space-8: "64px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-hover:
    textColor: "{colors.electric-blue}"
  button-primary:
    backgroundColor: "{colors.electric-blue}"
    textColor: "{colors.on-accent}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.electric-blue-deep}"
  button-small:
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "32px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "24px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  badge:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.electric-blue}"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
    height: "32px"
  chip-selected:
    backgroundColor: "{colors.electric-blue}"
    textColor: "{colors.on-accent}"
  progress-bar:
    backgroundColor: "{colors.surface-tint}"
    rounded: "{rounded.full}"
    height: "6px"
  roadmap-topic:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.heading-navy}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  roadmap-topic-done:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.heading-navy}"
  roadmap-subtopic:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "4px 12px"
  drawer:
    backgroundColor: "{colors.surface}"
    width: "440px"
    padding: "24px"
---

# Design System: FinGen Training Hub

## Overview

**Creative North Star: "The Lit Spine"**

The Training Hub is a quiet, cool-paper console in navy and one electric blue, with a serif voice for headings and a plain sans for everything a learner operates. Its signature is the roadmap: a vertical spine of topics with subtopics branching off it. Progress is the only thing that moves. The spine draws itself in, a finished topic lights the connector below it in success green, and the topic it unlocks answers with a ring. Everywhere else the system stays still and legible.

Density is moderate and desk oriented: content columns of 780 to 1080px, cards with 24px insides, a 4px spacing scale. Depth is mostly borders and tonal surfaces with soft navy-tinted shadows; nothing floats without a reason. Both a light and a dark theme are maintained from one token file, and status or classification is never carried by colour alone.

This file records what ships. A corporate brand guide applies to future work but **has not been supplied** (see PRODUCT.md). Nothing here is a brand rule from that guide; when it arrives, reconcile this record against it rather than the other way round. The FinGen mark (`components/Logo.tsx`) is the only binding identity asset.

**Key Characteristics:**
- Cool off-white canvas, white surfaces, deep navy headings, a single saturated electric blue accent.
- Playfair Display (700) for page and panel titles; Inter for UI, body and data.
- Root font size is 18px, so every rem value in this file is relative to 18px.
- Borders first, soft shadows second; 8px corners as the default.
- Motion only for state and progress, composited (transform and opacity), with a full reduced motion fallback.

## Colors

A cool, low-chroma neutral field carrying one loud blue, with green, amber and red kept for feedback. Each light role has a dark theme counterpart (the `-dark` keys), switched by `prefers-color-scheme` or `<html data-theme>`.

### Primary
- **Electric Blue** (`electric-blue`, dark theme `periwinkle`): the one accent. Primary buttons, links, selected chips, the in progress outline, progress fills, focus rings, the first analytics ring. Hover deepens it (`electric-blue-deep`) in light and lightens it (`periwinkle-light`) in dark.
- **Blue Wash** (`accent-soft` / `accent-soft-dark`): resting fill of roadmap topics, accent badges, the icon disc in empty states.
- **On Accent** (`on-accent` / `on-accent-dark`): text on a solid accent fill; white in light, canvas navy in dark.

### Secondary
- **Ledger Green** (`success` / `success-dark`, wash `success-soft`): done status, the lit spine, the completion ring, public classification, good scores.

### Tertiary
- **Amber** (`warning`, wash `warning-soft`): confidential classification, the stale sync banner, fair scores.
- **Signal Red** (`danger`, wash `danger-soft`): errors, restricted classification, poor scores.

### Neutral
- **Cool Paper** (`canvas` / `canvas-dark`): page background.
- **White Sheet** (`surface` / `surface-dark`): cards, drawer, inputs, buttons at rest.
- **Tint** (`surface-tint` / `surface-tint-dark`): tracks of bars and rings, locked topics, skeleton blocks, table headers.
- **Hairline** (`border`) and **Rule** (`border-strong`): card edges and dividers; button and input strokes.
- **Ink** (`ink`) and **Muted Ink** (`ink-muted`): body text and secondary text. Both meet 4.5:1 on canvas and surface in both themes (stated in `tokens.css`).
- **Heading Navy** (`heading-navy` / `heading-dark`): titles, numbers in rings, legend titles. In light theme the same navy is the fixed dark band behind the footer, home hero art, home call to action and login screen, which stays navy in both themes.
- **Roadmap lines** (`roadmap-line`, `roadmap-line-muted`, `roadmap-sub-border`): the spine stroke, the dashed subtopic branches, subtopic outlines. In dark theme the spine uses `periwinkle`.
- **Code Night** (`code-block`, `code-text`): code blocks stay dark in both themes.

### Named Rules
**The One Blue Rule.** There is one accent hue. Tints of it (via `color-mix` against surface, as in the analytics rings) extend it; no second accent hue is introduced.

**The Never Colour Alone Rule.** Status and classification always pair colour with an icon and text: topic status uses icon plus border style (dashed when locked, outlined when in progress), and the classification badge always carries text and an icon.

**The Token Only Rule.** Components read colour from `tokens.css` custom properties, never raw hex, so both themes switch in one place. Print styles that pin the light values (the certificate) are the sanctioned exception.

## Typography

**Display Font:** Playfair Display (with Georgia, serif), weights 700 and 900, plus 700 italic for the certificate.
**Body Font:** Inter (with system-ui, -apple-system, Segoe UI, Arial, sans-serif), weights 300, 400, 600, 700.
**Label/Mono Font:** Cascadia Code (with Fira Code, ui-monospace) for inline code and demo emails.

All faces are self-hosted through `@fontsource` (the page CSP is self-only).

**Character:** a bookish serif for the names of things (paths, topics, pages) against a neutral, highly legible sans for everything a learner reads or operates.

### Hierarchy
- **Display** (Playfair 700, 2.5rem, 1.1): the home hero only.
- **Headline** (Playfair 700, 2rem, 1.2; 1.6rem below 600px): page titles through the shared page title.
- **Headline Small** (Playfair 700, 1.75rem, 1.2): the roadmap path title and similar secondary pages.
- **Title** (Playfair 700, 1.25rem, 1.3): drawer titles and panel titles such as the onboarding glance.
- **Section** (Inter 700, 1.25rem, 1.3): section headings inside a page, empty state titles.
- **Body** (Inter 400, 1rem, 1.55, max 68ch): lead paragraphs. Lesson markdown runs at 0.9rem with 1.7 line height.
- **Body Small** (Inter 400, 0.875rem, 1.5): inputs, banners, legends, most supporting text.
- **Button** (Inter 600, 0.875rem, 1.2).
- **Label** (Inter 700, 0.75rem, 0.08em tracking, uppercase): block labels inside the topic drawer and the section markers on the roadmap spine.
- **Numeric** (Inter 700, tabular figures): ring values, bar values, counters.

### Named Rules
**The Serif Names Things Rule.** Playfair is for titles only; any text a user reads at length or operates is Inter.

**The Steady Figures Rule.** Numbers that count up or sit in columns use tabular figures so they do not jitter.

## Layout

A centred single column. Shared pages are 1080px wide (780px for the narrow reading variant) with 32px top, 16px side and 48px bottom padding; the app shell (topbar, footer) runs to 1280px. The roadmap header is 880px; the drawer is 440px wide on the right.

Spacing follows a 4px scale (`space-1` 4px through `space-8` 64px). Cards use 24px insides (16px below 600px), stacked cards are 16px apart, action rows sit 24px below content with 8px gaps.

Breakpoints in use: 767px (topbar nav moves to its own scrolling row; the roadmap canvas becomes a list and the drawer becomes a bottom sheet), 760px (analytics glance stacks), 600px (page padding and title shrink), plus legacy 900px and 640px grids.

## Elevation & Depth

A hybrid: surfaces separate by hairline borders and tonal fills first, and carry soft navy-tinted shadows that grow with the element's distance from the page. Dark theme swaps the tint for black at higher opacity.

### Shadow Vocabulary
- **Rest** (`--shadow-sm`, `0 1px 2px rgba(15, 23, 51, 0.08)`): cards, panels, roadmap topics.
- **Lift** (`--shadow-md`, `0 4px 14px rgba(15, 23, 51, 0.1)`): hover on roadmap topics and legacy cards.
- **Overlay** (`--shadow-lg`, `0 16px 40px rgba(15, 23, 51, 0.18)`): the topic drawer.
- **Selection ring** (`0 0 0 3px` accent): the selected roadmap topic.

### Named Rules
**The Earned Lift Rule.** Shadows step up only for hover or for something that overlays the page; a resting card never sits above Rest.

**The Visible Focus Rule.** Every focusable element shows a 3px solid focus colour outline offset 2px (`:focus-visible`), in both themes.

## Shapes

Gently rounded. 8px (`md`) is the default for cards, buttons, inputs, roadmap topics and the drawer close button. Pills (`full`) are for badges, filter chips, progress tracks and spine section markers. 4px (`sm`) is for small inline things: roadmap subtopics, banners. 14px (`lg`) is for large soft containers: empty and error states (dashed border), the onboarding glance panel, the top corners of the mobile bottom sheet. Strokes are 1px, or 1.5 to 2px where they mean something (roadmap topics, status buttons).

## Components

### Buttons
Calm and outlined at rest; colour arrives on hover.
- **Shape:** gently rounded (8px), 40px minimum height, 32px for the small size.
- **Default:** white sheet with a Rule border and Ink text; hover turns border and text Electric Blue.
- **Primary:** solid Electric Blue with On Accent text; hover deepens the fill.
- **Disabled:** 50% opacity, hover suppressed.
- **Transitions:** background, border and colour on `--motion-fast` with `--ease-out`.

### Chips
- **Style:** pill, 32px tall, white with a hairline border, 0.75rem semibold text, optional count at 80% opacity.
- **State:** hover borders in blue; pressed (`aria-pressed`) fills solid Electric Blue.

### Badges
Pill, 0.75rem bold, tinted wash with matching text (neutral, accent, success, warning, danger). Classification badges add a currentColor border and always an icon plus text.

### Cards / Containers
- **Corner Style:** 8px; 14px for feature panels.
- **Background:** White Sheet on Cool Paper.
- **Shadow Strategy:** Rest.
- **Border:** 1px Hairline.
- **Internal Padding:** 24px (16px on small screens).

### Inputs / Fields
- **Style:** 1px Rule stroke, white sheet, 8px corners, 8px by 12px padding, Body Small text; label above in Inter 600.
- **Focus:** border turns Electric Blue plus the global focus outline.

### Navigation
A white sticky topbar, 64px tall, with a bottom hairline. Links are Inter 600 in Heading Navy; hover and active add a 3px Electric Blue underline bar and blue text. On phones the nav moves to a horizontally scrolling 44px row. The topbar has its own view transition name, so it holds still while pages change.

### Progress
- **Bars:** 6px (8px on the roadmap header and analytics) pill tracks in Tint; the fill is a full-width pill moved with `translateX` (the shared meter), so its rounded end stays round.
- **Ring:** 4px stroke ring with Tint track and accent (or success) arc; tabular value in the centre.

### Empty and Error States
Centred block with a dashed Rule border, 14px corners, a 48px Blue Wash icon disc (red wash for errors), Section title and 52ch text. Loading uses skeleton blocks with a sweeping sheen.

### Roadmap (signature)
- **Spine:** 3px `roadmap-line` stroke; solid where a topic requires its predecessor, dotted (2 7) where it does not. Subtopic branches are 2px dashed (5 5) in `roadmap-line-muted`.
- **Topics:** Blue Wash fill, 2px blue border, 8px corners, Inter 700 0.95rem, Rest shadow; hover lifts 1px with Lift shadow. Done turns to Success wash and border; in progress gets a 3px accent outline; locked is dashed on Tint with muted text; skipped is at 55% opacity. Every status also has its icon.
- **Subtopics:** white, 1.5px `roadmap-sub-border`, 4px corners, Inter 500 0.8rem, clamped to two lines.
- **Section markers:** uppercase Label pills sitting on the spine over the canvas colour.
- **Drawer:** 440px right sheet with Overlay shadow over a dimmed backdrop; a bottom sheet below 768px. Focus trapped, with keyboard shortcuts.

### Motion
**Tokens:** `--motion-instant` 100ms, `--motion-fast` 150ms (hover and state), `--motion-base` 250ms (fades, drawer, page in), `--motion-slow` 450ms (rises, pops, lit connector, title morph), `--motion-draw` 700ms (spine draw, meters, rings, completion ring), `--stagger-step` 60ms. Easings: `--ease-out` cubic-bezier(0.2, 0.8, 0.2, 1) for almost everything, `--ease-in-out` cubic-bezier(0.65, 0, 0.35, 1) for the spine curtain and loops, `--ease-emphasis` cubic-bezier(0.16, 1, 0.3, 1) for things that arrive or finish.

**Shared classes** (`styles/motion.css`, exposed as `motion` in `lib/motion.ts`): fade in, rise (8px), from end (12px), pop (from 0.85 scale), sheen (skeleton) and meter (progress fill). They are staggered with `--i` (`staggerStyle`) or `--delay`, and fill backwards only so hover transitions keep working afterwards.

**Page change:** in browsers with View Transitions, `navigateWithTransition` / `TransitionLink` cross fade the page (old out over `--motion-fast`, new in over `--motion-base`, rising 6px). The topic title in the drawer and the lesson heading share a `view-transition-name` (`sharedTitle`), so the title morphs from one to the other over `--motion-slow`; the transition waits up to 300ms for the new heading. Without the API, or under reduced motion, navigation is instant.

**Roadmap draw in:** a mask curtain slides down the spine over `--motion-draw`; each topic rises, and each section marker and subtopic fades in, at its share of that duration (`--at`), so topics arrive as the line reaches them.

**Completion moment:** marking a topic done lights the spine below it (a success fill scaling down from the top over `--motion-slow`), a success ring spreads once from the topic (opacity out, scale 0.97 to 1.1, over `--motion-draw`), and each topic it unlocked answers with an accent ring after `--motion-slow`, when the light reaches it. The drawer backdrop clears while this plays. The unlock is announced to screen readers.

**Elsewhere:** chat messages arrive from the reading end, a three dot typing indicator bobs, analytics counters count up (ease out cubic, 700ms) when in view, scores pop.

### Named Rules
**The State Only Motion Rule.** Motion shows a change of state or progress, never decoration. Nothing animates on idle except loading indicators.

**The Composited Motion Rule.** Entrances, draws and celebrations animate only `transform` and `opacity`. The single exception is `stroke-dashoffset` on progress arcs: the progress ring and the analytics completion rings, which fill one after another (120ms apart, outer first). Hover and state changes on colour, border and shadow may transition on `--motion-fast`.

**The Still By Request Rule.** Under `prefers-reduced-motion: reduce` everything lands on its final state at once: a global rule in `tokens.css` cuts animation and transition durations to 0.01ms, every motion class and component keyframe sets `animation: none`, the skeleton sheen is hidden, typing dots stay still at 70% opacity, counters jump to their value, and View Transitions are skipped in both script and CSS.

## Do's and Don'ts

### Do:
- **Do** take every colour, space, radius, shadow and duration from `styles/tokens.css`; add new values there, for both themes.
- **Do** build pages from the shared page pieces (`styles/page.module.css`) and `components/ui/` before writing new CSS.
- **Do** pair every status or classification colour with an icon and text.
- **Do** use Playfair Display 700 only for titles, and Inter for everything operated or read at length.
- **Do** animate with the shared motion classes and tokens, compose them into module classes, and give every new animation a reduced motion state.
- **Do** keep page changes on `navigateWithTransition` or `TransitionLink`, and share a `view-transition-name` only between elements that are truly the same thing on both pages.
- **Do** check both light and dark themes and the 767px layout for any new surface.

### Don't:
- **Don't** add a second accent hue; use tints of Electric Blue or the feedback colours.
- **Don't** animate layout properties (width, height, top, left, margin) or add decorative idle motion; progress arcs are the only `stroke-dashoffset` users.
- **Don't** write raw hex in a component module outside print styles.
- **Don't** add new classes to the legacy global stylesheet or new uses of the `--ss-*` aliases; they exist only for the remaining topbar, footer and legacy page classes.
- **Don't** lift resting cards above the Rest shadow.
- **Don't** reintroduce the former client's name, logo or copyright, or invent rules for the pending brand guide.
