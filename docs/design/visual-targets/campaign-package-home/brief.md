# Campaign Package Home Brief

## Visual Target Unit

Campaign package/home surface plus the shared Directive shell.

## Parent Surface

Directive runtime shell in SillyTavern and Lumiverse.

## Primary User Task

Let the player understand which starship package is available, whether it is healthy, and what the next safe action is: start a campaign, resume a draft, load a save, or import a package.

## UX Goal

A first-time player should understand the available package, its campaign premise, package health, and primary action within a few seconds without reading every diagnostic row.

## UX Failure Risks

- LCARS paneling could make decorative shapes look like unavailable controls.
- Dense status rows could hide the primary action.
- Import, start, resume, and load actions could compete visually.
- Bottom navigation could become cramped or unreadable.
- Package health could read as developer diagnostics instead of player-safe readiness.

## Required Information

- Package title.
- Ship name and class.
- Campaign title.
- Player role.
- Package source.
- Runtime asset readiness.
- Package health and issue count.
- Draft and save counts.
- Import status.
- Active route and shell actions.

## Required Controls

- Route navigation for Campaign, Mission, Crew, Ship, Log, and Settings.
- Close Directive.
- Back when route history exists.
- Import Package.
- Start Campaign.
- Resume Draft when available.
- Load Save when available.

## Saga Reference Qualities

- Compact bottom route navigation.
- One dominant next action per surface.
- Clear active state.
- Touch-safe action rows.
- Dense but readable data blocks.
- Settings/theme compatibility through existing Directive tokens.

## LCARS Requirements

- Original LCARS-inspired Starfleet command-console structure.
- Dark terminal canvas.
- Curved segmented route rail.
- Asymmetric panel frame around the shell.
- Amber, orange, lavender, blue, and muted red command accents.
- Package readiness shown as structural LCARS status blocks.
- Primary action framed as the obvious command action, not hidden in a row.
- Decorative LCARS blocks must not look clickable unless they are real controls.

## Desktop Constraints

- Runtime shell remains top anchored and compact inside SillyTavern.
- Header keeps title/status and explicit shell actions, while route navigation stays in the bottom bar.
- Bottom navigation remains visible and touch-safe.
- Campaign content must fit inside the existing scroll pane.
- Text must fit without viewport-scaled font tricks.

## Phone Constraints

- Phone-width shell fills the viewport.
- Bottom route navigation remains touch-safe.
- Content scroll remains route-local.
- Primary package action must appear before secondary diagnostics.
- Labels must not overlap or truncate critical action meaning.

## Player Safety

- Do not expose hidden relationship values, unrevealed campaign truth, or raw simulation internals.
- Package health can expose player-safe readiness and issue counts only.
- Import diagnostics should stay passive and bounded.

## Must Not Change

- Route ids and runtime shell ownership.
- Package/campaign/save authority.
- Host-neutral SillyTavern and Lumiverse behavior.
- Existing start, resume, load, and import action semantics.
- Existing hidden-state boundaries.
