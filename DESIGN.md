---
version: alpha
name: Directive Modern LCARS
description: A Voyager-era LCARS command archive reinterpreted as a premium contemporary console game menu.
colors:
  background: "#05070b"
  background-raised: "#0b0e18"
  surface: "#0d1018"
  surface-high: "#14121c"
  on-surface: "#f8efe0"
  on-surface-muted: "rgba(248, 239, 224, 0.68)"
  outline: "rgba(255, 159, 74, 0.34)"
  outline-strong: "rgba(255, 199, 102, 0.72)"
  primary: "#ff9f4a"
  on-primary: "#05070b"
  focus: "#ffe58f"
  warning: "#ffc766"
  danger: "#ff6b6b"
  success: "#95d2b3"
  route-campaign: "#ff9f4a"
  route-mission: "#b78ad7"
  route-crew: "#77a7ef"
  route-ship: "#9b82cf"
  route-settings: "#ef7f72"
  division-command: "#a60400"
  division-operations: "#dd8a12"
  division-science: "#004880"
typography:
  display:
    fontFamily: "Roboto Condensed, Arial Narrow, sans-serif"
    fontSize: 32px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: 0em
  headline:
    fontFamily: "Roboto Condensed, Arial Narrow, sans-serif"
    fontSize: 22px
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: 0em
  title:
    fontFamily: "Roboto Condensed, Arial Narrow, sans-serif"
    fontSize: 18px
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: 0em
  body:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
  body-small:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0em
  label-large:
    fontFamily: "Roboto Condensed, Arial Narrow, sans-serif"
    fontSize: 14px
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: 0em
  label-small:
    fontFamily: "Roboto Condensed, Arial Narrow, sans-serif"
    fontSize: 12px
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: 0em
  metadata:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: 0em
rounded:
  none: 0px
  small: 4px
  medium: 6px
  large: 8px
  lcars-elbow: 16px
spacing:
  unit: 4px
  micro: 4px
  small: 8px
  compact: 12px
  medium: 16px
  large: 24px
  section: 32px
  content-gutter-desktop: 16px
  content-gutter-mobile: 8px
  lcars-rail-desktop: 40px
  lcars-rail-mobile: 24px
  minimum-control: 44px
  route-bar: 68px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-large}"
    rounded: "{rounded.medium}"
    height: "{spacing.minimum-control}"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.surface-high}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-large}"
    rounded: "{rounded.medium}"
    height: "{spacing.minimum-control}"
    padding: "0 16px"
  content-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.large}"
    padding: "{spacing.medium}"
  route-control:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label-large}"
    rounded: "{rounded.medium}"
    height: "{spacing.route-bar}"
    padding: "8px"
  input-field:
    backgroundColor: "{colors.background-raised}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.medium}"
    height: "{spacing.minimum-control}"
    padding: "12px"
  structural-rule:
    backgroundColor: "{colors.outline-strong}"
    height: "2px"
  focus-ring:
    backgroundColor: "{colors.focus}"
    rounded: "{rounded.medium}"
  alert-warning:
    backgroundColor: "{colors.surface-high}"
    textColor: "{colors.warning}"
    typography: "{typography.body-small}"
    rounded: "{rounded.medium}"
    padding: "12px"
  alert-danger:
    backgroundColor: "{colors.surface-high}"
    textColor: "{colors.danger}"
    typography: "{typography.body-small}"
    rounded: "{rounded.medium}"
    padding: "12px"
  status-success:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.success}"
    typography: "{typography.label-small}"
    rounded: "{rounded.small}"
    padding: "4px 8px"
  route-campaign-selected:
    backgroundColor: "{colors.route-campaign}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-large}"
    rounded: "{rounded.medium}"
  route-mission-selected:
    backgroundColor: "{colors.route-mission}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-large}"
    rounded: "{rounded.medium}"
  route-crew-selected:
    backgroundColor: "{colors.route-crew}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-large}"
    rounded: "{rounded.medium}"
  route-ship-selected:
    backgroundColor: "{colors.route-ship}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-large}"
    rounded: "{rounded.medium}"
  route-settings-selected:
    backgroundColor: "{colors.route-settings}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-large}"
    rounded: "{rounded.medium}"
  division-command-marker:
    backgroundColor: "{colors.division-command}"
    width: "4px"
  division-operations-marker:
    backgroundColor: "{colors.division-operations}"
    width: "4px"
  division-science-marker:
    backgroundColor: "{colors.division-science}"
    width: "4px"
---

## Overview

Directive is the game screen around a freeform Star Trek command roleplay. Chat remains the primary play surface. Opening Directive should feel like opening a field guide, quest journal, ship archive, and command dossier: the player pauses to remember what matters, inspects constraints and relationships, chooses what to focus on, and returns to play.

The visual reference is:

> A late-24th-century Starfleet mission archive presented as a premium contemporary console game menu: Voyager-era LCARS structure, restrained cinematic imagery, and game-grade scanability.

Directive is not a literal recreation of a television prop. LCARS supplies its geometry, segmentation, color blocking, and Starfleet character. Modern game UI supplies its navigation predictability, focus behavior, readability, responsive layout, accessibility, and progressive disclosure.

The target player-facing shell is a full-screen menu with exactly five routes: Campaign, Mission, Crew, Ship, and Settings. The full-screen treatment is a presentation metaphor; opening it does not pause, advance, or otherwise modify simulation state.

This file is the normative visual and interaction design contract for new Directive player-facing UI. The approved [Player-Facing Information Architecture](docs/superpowers/specs/2026-07-20-player-facing-information-architecture-design.md) remains authoritative for information ownership and behavior. Runtime, persistence, and simulation documents remain authoritative for game state. Older shelf, drawer, six-route, Log-route, and route-subtab visual directions are superseded where they conflict with this contract.

## Colors

Directive uses a near-black canvas with restrained tonal surfaces. LCARS colors are semantic signals, not general decoration.

- **Background** is the deepest canvas. It should remain a hair lighter than pure black so the shell retains visible depth.
- **Surface** and **Surface High** separate content through tonal layering. They replace heavy shadows, glass effects, and excessive borders.
- **Primary Amber** identifies global primary actions, key structural lines, and the current focal command when no route-specific color is more appropriate.
- **Focus Gold** is reserved for keyboard/controller focus and must remain visible against every route color.
- **Route colors** identify destinations: Campaign amber, Mission lilac, Crew blue, Ship violet, and Settings salmon. Their location and meaning remain stable.
- **Warning, Danger, and Success** are status colors. Status always includes text or iconography; color alone never carries meaning.
- **Personnel division colors** retain their existing Voyager-era contract and do not expand into general route or status colors.

Use full-strength color sparingly. Inactive structures use muted or translucent color. The selected route, primary action, current objective, or actionable warning may receive full-strength color. A first viewport should not contain several equally dominant accents.

Do not introduce additional route colors, campaign-specific chrome colors, one-off gradients, or decorative status colors. Package art may have its own palette inside media apertures; it does not recolor the global shell.

## Typography

Typography has four jobs: identify the destination, establish the selected record, present readable information, and label controls.

- **Display** is reserved for the selected campaign, quest, person, or ship when that identity is the screen's focal point.
- **Headline and Title** identify routes, content groups, and selected records.
- **Body** carries objectives, facts, descriptions, relationship history, and technical explanations.
- **Labels** identify routes, statuses, compact commands, and category markers. Route labels must remain comfortably readable; do not shrink them to make decorative geometry fit.
- **Metadata** carries dates, categories, secondary status, and player-safe identifiers only when useful.

Use a condensed display face where available and a highly readable system sans-serif for body content. Do not scale typography with viewport width. Letter spacing is zero. Uppercase is limited to concise route, status, and command labels; body content uses sentence case.

Do not use more than three visibly competing type sizes inside a compact content region. Do not use oversized marketing-page headlines. Do not render objectives or other decision-critical text as metadata.

## Layout

Directive uses a full-viewport game-menu layout with one stable scroll owner. The outer shell never resizes when the player selects a different record.

### Global shell

- A compact segmented LCARS rail runs down the left edge as a structural signature.
- The rail is approximately `40px` on desktop and `24px` on phone layouts. It is not an interaction target and must not consume substantial content width.
- The rail may connect visually to thin title or route-bar rules, but it must not grow into a large decorative command spine.
- Product and route identity occupy the upper-left content header.
- Back and Close occupy stable upper-right positions using familiar icons, accessible names, and at least `44px` targets.
- The five route controls occupy a stable bottom bar. Their hit areas and order never move, even when the selected route receives stronger visual emphasis.
- Route controls use the authored Directive vector glyphs plus visible labels.

### Content

- The first viewport has one dominant task or record.
- Cinematic package imagery may create the main visual anchor when a real relevant asset exists.
- Desktop may use list/detail, roster/detail, or media/detail splits.
- Phone uses one content column and one clear scroll owner.
- Internal groups follow a `4px` base rhythm, with tight spacing inside a concept and wider spacing between concepts.
- Fixed-format elements use stable dimensions, grid tracks, aspect ratios, or min/max constraints so dynamic content does not shift the shell.

Whitespace is useful when it isolates a meaningful image or decision. It is not a substitute for hierarchy, and it must not result from permanent empty panels. When data is sparse, strengthen composition through imagery, scale, and framing rather than invented fields.

## Elevation & Depth

Directive uses tonal layering and structural rules, not glassmorphism or card shadows.

1. **Canvas:** near-black global background.
2. **Surface:** low-contrast content regions and inactive navigation.
3. **Surface High:** selected details, active tools, and modal content.
4. **Media:** ship and character imagery integrated as full-bleed apertures with a restrained readability overlay.

Use one-pixel borders only when tonal separation is insufficient or when an interactive boundary must be explicit. Use thin LCARS color rules to establish direction and grouping. Avoid ambient glow except for a restrained focus treatment when required for accessibility.

Do not stack cards inside cards. Do not turn every section into a floating panel. Large page sections remain unframed; cards are reserved for repeated records, modals, and genuinely bounded tools.

## Shapes

Directive's interior shape language is modern, compact, and engineered.

- Ordinary controls and surfaces use `4px` to `8px` radii.
- Asymmetric corners are acceptable when they establish direction or selection.
- Large LCARS curves are reserved for outer rail elbows, media apertures, and structural terminations.
- Pills are reserved for compact statuses, not general buttons or navigation.
- Circles are reserved for status lamps, portrait crops that require them, and familiar circular controls.

Do not mix several unrelated radii in one view. LCARS geometry must frame and orient content; it must not force text into narrow shapes or make decoration resemble a disabled control.

## Components

### Route controls

The route bar is a modern game navigation control expressed through LCARS color and iconography.

- Order is always Campaign, Mission, Crew, Ship, Settings.
- Every control includes its authored icon and visible text label.
- The selected route uses its route color, a shape change or structural rule, and `aria-current` or equivalent selected state.
- Inactive routes remain legible and visually quiet.
- Selection never moves neighboring hit targets or changes game state.
- Labels remain at least the `label-large` role on desktop and do not fall below a readable mobile label size.

### Buttons

Use icons for familiar commands such as Back, Close, Refresh, Save, and Expand. Add visible text when the command is not universally recognizable or when space permits. Tooltips name unfamiliar icon-only controls.

Primary actions use amber unless a route-specific action is clearer in its route color. Destructive actions use explicit danger styling and confirmation proportional to consequence. Disabled controls must explain why they are unavailable or remain absent; they must not exist solely to announce missing functionality.

### Lists and selection

Lists are the default pattern for quests, people, saves, and technical records. Rows use alignment, spacing, a restrained marker, and tonal selection rather than independent decorative cards. Selected rows expose `aria-selected` where appropriate. Completed and stale groups remain collapsed or visually quiet.

### Status and alerts

Clean states are concise. Warnings and required actions receive space. Permanent readiness strips, zero-count cards, and repeated Loaded, Ready, Current, Online, Idle, or None indicators are prohibited unless they explain a consequence or provide an action.

### Empty and loading states

Empty states state what is absent and provide the next valid action when one exists. They do not display empty consoles, placeholder metrics, or disabled button collections. Loading uses stable skeleton geometry or a compact progress state that does not resize the page.

### Interaction states

Every interactive component defines default, hover, focus-visible, pressed, selected, disabled, loading, and error states where applicable. Hover is supplementary; all functionality works with keyboard, controller-style directional focus, and touch.

## Imagery And Iconography

Directive uses its existing authored package assets and vector glyphs.

- Ship hero art establishes campaign or mission place when the ship is genuinely relevant.
- Character profile renders appear when a person is explicitly linked to the selected quest, crew record, or consequential event.
- Images must come through package asset records in the runtime. Do not hardcode package filesystem paths in UI renderers.
- Images use intentional aspect ratios and focal positioning. Do not use dark, blurred, atmospheric crops when the player needs to identify the subject.
- Route and shell controls use the Directive vector glyph pack. Familiar fallback icons are acceptable only where no authored glyph exists.

Do not infer character involvement by parsing objective prose. Do not add portraits merely to fill space. Do not invent maps, telemetry, countdowns, contacts, or decorative records that the runtime does not track.

## Information Architecture

The five routes have distinct ownership:

- **Campaign:** continue, create, import, load, branch, and manage campaigns and saves.
- **Mission:** unified quest journal containing objectives, actionable urgency, known facts, evidence, discoveries, messages, relevant people and locations, and quest history.
- **Crew:** people, roles, availability, player-facing standing, statements, relationship history, and current involvement.
- **Ship:** identity, capability, condition, restrictions, resources, technical discoveries, and consequential history.
- **Settings:** player preferences first; provider setup under Advanced; diagnostics and repair under Developer & Troubleshooting or contextual fault recovery.

Mission is the default route for an active campaign. Campaign is the default when no campaign is active. There is no top-level Log, Intel, Inventory, Map, Open Threads, Components, Recovery, or diagnostics route.

Selecting a quest or record changes presentation only. It does not change the authoritative mission, prompt context, tracking priority, time, narration, simulation state, or campaign revision.

The UI shows information only when it changes a decision, explains a constraint, represents a usable resource, records a meaningful consequence, or exposes a necessary command. One fact has one natural home. Cross-links may navigate to that home; they do not justify duplicate panels.

## Motion

Motion is quick, mechanical, and subordinate to input.

- Hover, focus, press, and selection feedback complete within `120ms`.
- Route or content transitions complete within `200ms` and never exceed `250ms`.
- Use opacity, small tonal changes, and short segment or rule transitions.
- Nothing bounces, overshoots, floats continuously, or delays control availability.
- `prefers-reduced-motion` collapses nonessential motion to zero.

Audio and haptic feedback are optional host capabilities. They must be subtle, user-controllable, and never required to understand state.

## Responsive Behavior

### Desktop and tablet

- Use the full-screen menu composition.
- Preserve the compact left LCARS rail and bottom route bar.
- Prefer two-column list/detail layouts when they reduce navigation and scrolling.
- Keep the primary media anchor visible without pushing all useful content below the first viewport.

### Phone

- Reduce the decorative rail to approximately `24px` or omit its labels.
- Preserve all five bottom route targets with icons and readable labels.
- Stack list then detail in one content column.
- Respect safe areas and keep route controls above the viewport inset.
- Do not create competing nested scroll regions.

The required proof viewports are `390x845`, `720x900`, `1280x900`, and `1440x1000`.

## Accessibility

- Normal text meets WCAG AA contrast against its rendered surface.
- Interactive controls use at least `44px` touch targets.
- Focus-visible treatment remains clear against every route color.
- Route controls expose accessible names and selected state.
- List rows and disclosures are keyboard operable.
- Status never relies on color alone.
- Text reflows without overlapping controls or adjacent content.
- Dynamic content does not steal focus or unexpectedly move the active control.
- Reduced-motion preferences are honored.

## Do's And Don'ts

### Do

- Do make the active quest, selected person, ship condition, or campaign action obvious within two seconds.
- Do use real ship art, character renders, and authored icons when they clarify the selected record.
- Do let LCARS geometry connect and orient major regions without consuming useful space.
- Do keep route order and hit areas stable.
- Do use progressive disclosure for history, evidence, advanced setup, and troubleshooting.
- Do make warnings and changes more visually prominent than clean or unchanged state.
- Do use player-facing language rather than implementation vocabulary.
- Do test every route with sparse, typical, dense, empty, loading, warning, and error data.

### Don't

- Don't reproduce a television LCARS prop literally.
- Don't build a generic dashboard and decorate it with Star Trek labels.
- Don't restore the persistent floating shelf or route drawer as the target player-facing shell.
- Don't add fake telemetry, meaningless serial numbers, decorative countdowns, or invented mission facts.
- Don't use large non-interactive gutters or command spines.
- Don't use glassmorphism, ornamental glow, gradient orbs, bokeh, or ambient decoration.
- Don't add panels merely to avoid empty space.
- Don't repeat the same fact across overview cards, status strips, and detail panels.
- Don't expose raw ids, prompt revisions, save internals, model diagnostics, tracking counters, or recovery controls in normal player views.
- Don't let record selection change simulation state.

## Visual Acceptance

A Directive surface is acceptable only when all of the following are true:

1. It reads as modern LCARS at a glance without resembling a fan-made television prop reproduction.
2. It functions like a familiar contemporary game menu without looking like a generic web dashboard.
3. The first viewport has one dominant task or selected record.
4. The five routes are stable, readable, keyboard operable, and touch safe.
5. LCARS structure improves hierarchy and consumes little non-interactive space.
6. Every visible fact comes from a supported player-facing projection or real package asset.
7. Sparse data produces a composed screen without invented filler.
8. Dense data remains scannable through grouping and progressive disclosure.
9. Desktop and phone Playwright captures show no overlap, clipping, blank media, or competing scroll owners.
10. Focus, selected, loading, empty, warning, error, and reduced-motion states are visibly verified.
