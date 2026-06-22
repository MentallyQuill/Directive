# Command Shelf Redesign

## Status

This document defines the target visual redesign for Directive's primary command shelf.

Directive is pre-alpha, so the redesign should update the current shelf in place rather than preserve the old shelf styling as a legacy mode. Existing route order, shell ownership, drawer behavior, keyboard semantics, and mobile fallback remain product contracts unless this document explicitly changes them.

## Purpose

The current command spine already provides the right interaction model: a persistent route shelf, one active drawer, route icons, optional expanded labels, and a phone-width bottom route bar. The redesign changes how that model reads visually.

The target is a modern LCARS drawer shelf:

- inactive shelf buttons are dark, nearly black control tiles;
- each route has a stable LCARS accent color;
- inactive route icons use the route accent color;
- selected routes become filled LCARS color panels;
- selected icon, index, and label treatment switches to dark ink for contrast;
- the shelf edge rail is segmented by route and visibly changes with route state;
- the active drawer visually inherits the selected route color.

The result should feel like a physical command shelf: each route is a drawer control with its own color identity, and the selected drawer visually plugs into the open workspace.

## Product Scope

The redesign applies to both shelf orientations:

- desktop and tablet: the left vertical command spine;
- phone width: the bottom route shelf.

Lumiverse can temporarily retain its compact shell until the host bridge migrates, but its eventual shelf treatment should use the same state model and route color language.

## Interaction Model

The redesign does not change navigation behavior.

- Campaign, Mission, Crew, Ship, Log, and Settings remain the six primary routes.
- Selecting a route makes that route the selected shelf item.
- Selecting a route opens that route drawer when the shell is in desktop/tablet mode.
- Selecting the selected route again may collapse the drawer, but the route remains selected.
- Only one drawer is active at a time.
- The drawer remains resizable and may enter temporary full-screen workspace mode.
- At phone width, the left spine is hidden and the bottom route shelf remains the primary route control.

The visual distinction is:

- **selected** means "this is the current route";
- **active/open** means "this selected route is physically connected to the visible drawer."

That distinction lets the selected route stay color-filled even when the drawer is collapsed, while the active connector and drawer hinge appear only when a drawer is open.

## Route Color System

Each route should expose a reusable accent token pair:

| Route | Accent Role | Suggested Family |
| --- | --- | --- |
| Campaign | package, records, launch | amber/orange |
| Mission | command intent, active turn | lavender/violet |
| Crew | personnel, roster | blue |
| Ship | vessel systems | violet/lavender |
| Log | records, recall | blue/cyan |
| Settings | utilities, diagnostics | coral/red |

Implementation should keep these as CSS variables derived from route metadata or `[data-route-tone]` selectors. The same route token should drive:

- inactive icon color;
- inactive command rail segment;
- selected shelf background;
- selected label/index/icon contrast;
- active shelf-to-drawer connector;
- drawer hinge and route-colored drawer accents.

Color must not be the only state indicator. Selected state also needs shape, fill, `aria-current`, and contrast changes.

## Desktop And Tablet Layout

### Vertical Shelf

The desktop/tablet shelf remains a left-side vertical command spine. The words and icons stay upright. The shelf is not literally rotated; only the visual idea from the concept art is translated into a vertical layout.

Each route button is a stacked drawer tile:

- dark black-blue inactive tile background;
- centered route icon in that route's LCARS accent;
- optional route number/index kept small and secondary;
- optional expanded label shown upright when the shelf is expanded;
- a right-edge command rail segment tied to the route accent;
- rounded LCARS geometry that preserves the existing left-spine silhouette.

The right-edge rail is the vertical equivalent of the yellow command bar in the concept reference. It should sit on the drawer-facing side of the shelf because the drawer opens to the right.

### Selected Route

The selected route button becomes a filled LCARS panel:

- background uses the route accent gradient;
- icon, number, and label switch to dark ink;
- right-edge rail uses the same route accent and becomes visually continuous with the button body;
- the selected shape is stronger than hover or focus;
- selected state remains visible even when the drawer is collapsed.

### Active Drawer Connection

When the selected route drawer is open:

- the route gets an active connector extending toward the drawer;
- the connector uses the selected route accent;
- the drawer left border, hinge, or header accent inherits the selected route accent;
- the connection should read as a physical drawer relationship, not a floating gap highlight.

The active connector should not obscure labels, icons, resize handles, or drawer controls.

### Inactive Routes

Inactive route buttons should feel like available controls, not disabled buttons.

- background stays near-black;
- icon carries the route accent;
- label copy, when visible, is low-contrast but readable;
- route rail segment uses the route accent;
- hover/focus can brighten the icon, border, or rail, but should not look selected.

### Shelf Controls

Density and Close controls at the bottom of the spine should align with the same visual language:

- dark inactive button body;
- amber or neutral LCARS control color;
- filled accent on hover/focus;
- no route-specific color unless the control directly acts on the selected route.

## Mobile Layout

Phone width keeps the bottom route shelf. It should express the same visual state model in a horizontal orientation.

### Horizontal Shelf

Each bottom route tab becomes a compact drawer tile:

- dark inactive tile background;
- icon uses that route's accent;
- label remains upright and readable;
- selected tab fills with the route accent;
- selected icon and label switch to dark ink;
- a route-colored command rail appears along the top edge of each tab.

The top-edge rail is the mobile equivalent of the desktop right-edge rail. It matches the concept reference's horizontal shelf orientation while preserving touch-safe bottom navigation.

### Mobile Selected State

The active phone route should be obvious without relying on color alone:

- filled route-accent panel;
- dark selected icon and label;
- stronger top rail or lower active lip;
- `aria-current` and `aria-selected` remain synchronized.

### Mobile Constraints

The redesign must preserve:

- six route tabs visible at 390-430 px phone width;
- no clipped Campaign or Settings labels;
- no route text overlap;
- minimum practical touch targets;
- bottom safe-area padding;
- content body padding so the bottom shelf never covers the final control.

If the full labels become too tight, mobile may use `shortLabel` text, but the accessible label should still expose the full route label.

## Implementation Plan

### Component Markup

Update the shelf components only where the current markup lacks state hooks.

- `src/ui/directive-command-spine-shell.js`
  - Keep `data-route-tone` on desktop route buttons.
  - Add `data-route-tone` to mobile route buttons.
  - Preserve `data-route-id`, `data-route-index`, `aria-selected`, `aria-expanded`, and `aria-current`.
  - Do not add duplicate route navigation inside drawer headers.

No new runtime state is required for route selection. `src/runtime/runtime-shell.js` already publishes `data-active-route` on the panel and toggles selected/active route classes.

### CSS Tokens And Selectors

Update `styles/directive.css` under the command-spine shell block.

Recommended token pattern:

```css
.directive-command-spine-shell .directive-spine-route {
  --directive-route-accent: var(--directive-amber);
  --directive-route-accent-end: var(--directive-orange);
}
```

Use route selectors such as:

```css
.directive-command-spine-shell .directive-spine-route[data-route-tone="mission"] {
  --directive-route-accent: var(--directive-lavender);
  --directive-route-accent-end: var(--directive-violet);
}
```

Add panel-level active route selectors when drawer chrome needs to inherit the current route color:

```css
.directive-command-spine-shell[data-active-route="mission"] {
  --directive-active-route-accent: var(--directive-lavender);
  --directive-active-route-accent-end: var(--directive-violet);
}
```

Then use those active tokens for drawer hinge, drawer border, header accent, and active connector.

### Desktop CSS Changes

Change the desktop command spine rules so:

- `.directive-spine-route` defaults to dark inactive tile styling;
- route icon color uses `--directive-route-accent`;
- route rail segment is implemented with `::before` or a real child element;
- `.directive-spine-route-selected` fills with the route accent;
- `.directive-spine-route-active::after` becomes the shelf-to-drawer connector;
- `.directive-command-spine::before` is removed or reduced so it does not compete with per-route rail segments;
- expanded shelf labels inherit the correct inactive and selected contrast.

If the rail makes the compact shelf too tight, update `DIRECTIVE_SPINE_WIDTH_COMPACT`, `DIRECTIVE_SPINE_WIDTH_EXPANDED`, and the corresponding layout tests in place.

### Mobile CSS Changes

Update the bottom route shelf so:

- `.directive-mobile-bottom-tab` defaults to a dark inactive tile;
- mobile route buttons receive the same route tone mapping as desktop;
- `.directive-mobile-bottom-icon` uses `--directive-route-accent`;
- a top rail segment uses `--directive-route-accent`;
- `.directive-mobile-bottom-tab-active` fills with the route accent and switches to dark ink;
- phone media rules keep labels readable and touch targets stable.

The mobile shelf should not become a separate visual language. It is the same drawer shelf rotated back into a horizontal bottom navigation form.

### Tests

Update focused tests to prove the new contract.

- `tools/scripts/test-extension-shell.mjs`
  - route buttons still render for all six routes;
  - mobile route buttons include route tone metadata;
  - selected and active state classes remain synchronized.

- `tools/scripts/test-visual-system-foundation.mjs`
  - command spine has inactive dark route tiles;
  - route tone selectors drive route accent variables;
  - selected route styling fills with route accent;
  - active route selector drives drawer hinge or drawer border color;
  - mobile bottom tabs use the same inactive/selected visual state model.

- `tools/scripts/test-command-spine-layout.mjs`
  - update only if shelf width constants change.

Visual smoke should include at least:

- compact desktop shelf, drawer collapsed;
- compact desktop shelf, drawer open on one non-amber route;
- expanded desktop shelf with labels visible;
- phone-width bottom shelf with a selected non-amber route.

## Acceptance Criteria

The redesign is accepted when:

- inactive shelf buttons are clearly dark control tiles;
- inactive route icons use their route accent color;
- selected route buttons are filled LCARS panels;
- selected icons and labels have dark high-contrast treatment;
- the vertical shelf has a right-edge command rail tied to route accents;
- the phone shelf has a top-edge command rail tied to route accents;
- drawer hinge/connector color matches the selected route;
- selected and active/open states are visually distinct;
- all six routes remain readable and touch-safe on phone width;
- keyboard focus remains visible;
- no decorative shelf element looks like a disabled or fake control;
- deterministic tests and the alpha gate pass after implementation.

## Non-Goals

This redesign does not:

- change route order;
- add new routes;
- add route navigation to the drawer header;
- remove drawer resizing or full-screen workspace behavior;
- change campaign, mission, or storage state;
- introduce official Star Trek logos, official LCARS screenshots, or copied interface assets;
- preserve the current filled-inactive shelf style as a legacy mode.

## Source Ownership

Primary implementation files:

- `src/ui/directive-command-spine-shell.js`
- `src/runtime/runtime-shell.js`
- `src/ui/directive-shell-layout.mjs`
- `styles/directive.css`

Primary verification files:

- `tools/scripts/test-extension-shell.mjs`
- `tools/scripts/test-visual-system-foundation.mjs`
- `tools/scripts/test-command-spine-layout.mjs`
- `tools/scripts/run-alpha-gate.mjs`

Primary design docs to keep aligned:

- `docs/design/LCARS_VISUAL_IDENTITY.md`
- `docs/design/DIRECTIVE_INTERFACE_DESIGN_BIBLE.md`
- `docs/user/DIRECTIVE_OPERATOR_MANUAL.md`
- `docs/testing/TESTING_STRATEGY.md`
