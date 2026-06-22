# Command Spine Migration

## Status

Phase 1 is implemented for the shared SillyTavern and Lumiverse runtime shell.

Directive now opens as a persistent left-side LCARS command spine with one route drawer at a time. The drawer is resizable from its bottom-left handle, its geometry is remembered locally, and dense workflows can enter a full-screen workspace without making full screen the normal operating mode.

The Lumiverse frontend now mounts the same `runtime-shell.js` command-spine contract through a Spindle app overlay. The drawer tab is only a launcher/reopen affordance, not the primary UI surface.

## Shell Contract

Desktop and tablet behavior:

- Directive opens as a narrow command spine fixed to the left side of the viewport.
- The default spine is compact. It can be expanded to show route labels.
- The six primary routes are Campaign, Mission, Crew, Ship, Log, and Settings.
- Selecting a route opens one drawer to the right of the spine.
- Selecting the active route again collapses the drawer.
- Selecting another route reuses the same drawer; route drawers do not stack.
- The default open footprint targets about 47 percent of the viewport width, including the spine and gap.
- The default drawer height is compact and capped at 700 pixels.
- Paired bottom resize handles change drawer width and height. The resulting size and spine density are stored in local UI layout state.
- Escape restores a manually expanded workspace or collapses the active drawer.
- Closing Directive hides the entire spine and drawer.

Phone-width behavior:

- At 680 pixels or less, Directive uses the established full-screen mobile shell.
- The command spine is hidden and route navigation moves to the bottom route bar.
- Drawer resizing is disabled.
- The header Close action closes Directive.

## Full-Screen Workspaces

Full screen is an escalation path, not the default shell.

- Every drawer has an explicit expand/restore control.
- Manual full screen is temporary and is not persisted across sessions.
- Character Creator automatically enters a required full-screen workspace because its multi-step form is not reliable at compact drawer widths.
- Leaving Character Creator restores the resizable drawer.
- Future dense editors should opt into the same required-workspace contract instead of implementing separate modal shells.

## Layout Persistence

`src/ui/directive-shell-layout.mjs` owns host-local shell geometry:

- active route,
- drawer open state,
- drawer width,
- drawer height,
- compact or expanded spine mode.

The storage key is `directive.runtime.commandSpine.layout.v1`. Full-screen state is intentionally excluded from persistence. Campaign saves do not own UI geometry.

## Source Ownership

- `src/ui/directive-command-spine-shell.js` builds the spine, drawer header, mobile fallback, and resize handles.
- `src/ui/directive-shell-layout.mjs` owns default geometry, viewport constraints, and local persistence.
- `src/runtime/runtime-shell.js` owns route selection, single-drawer behavior, resizing, full-screen escalation, keyboard handling, panel rendering, and the host-provided mount root used by Lumiverse.
- Route panels remain focused renderers and do not own primary navigation or shell geometry.
- `styles/directive.css` contains the final command-spine cascade and compact drawer adaptations.

## LCARS Rules

The command spine must read as an LCARS control object rather than a generic sidebar:

- thick asymmetrical route segments,
- a continuous dark spine,
- route-specific accent blocks,
- an active segment that visibly bridges into the drawer,
- rounded elbows, caps, and hinge geometry,
- amber for primary command actions,
- lavender and blue for secondary/data surfaces,
- green only for ready/healthy state,
- coral only for warning or recovery state.

The shelf may show only player-safe status. Hidden relationship values, Director facts, raw pressure scores, unrevealed mission state, and internal simulation flags remain excluded.

## Phase 1 Acceptance

Phase 1 is complete when deterministic tests prove:

- the SillyTavern and Lumiverse runtimes mount the command-spine shell,
- the initial surface is the collapsed compact spine,
- only one route drawer is active,
- the default open footprint is approximately half the display,
- drawer geometry is constrained and persisted,
- the resize handles are present at the drawer's bottom corners,
- manual and required full-screen modes restore correctly,
- phone width retains full-screen bottom navigation,
- the existing route panels and Character Creator flow remain functional,
- the full alpha gate remains green.

## Remaining Work

- Run a live SillyTavern visual smoke against the new desktop shell and capture route screenshots at compact, resized, and full-screen sizes.
- Tune individual route panels from live screenshots, especially Mission, Crew, and Settings at minimum drawer width.
- Run a live Lumiverse browser smoke against the app-overlay command-spine shell and capture parity screenshots once local credentials and browser control are available.
- Run the updated command-spine geometry assertions against a real SillyTavern browser session and retain the phone-width checks as part of release validation.
