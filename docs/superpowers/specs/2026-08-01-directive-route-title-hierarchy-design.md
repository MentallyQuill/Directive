# Directive Route Title Hierarchy

## Goal

Make the expanded Directive shell read as one application surface rather than a page containing another page. The shell topbar and route path remain the sole page identity; route content starts directly beneath them.

## Current problem

Each route currently renders three identity layers:

1. the expanded-shell topbar and route path;
2. the colored `directive-route-heading` strip;
3. a route-panel `directive-runtime-section-title` heading inserted by each renderer.

This repeats labels such as Campaign and Settings and creates a nested-page visual hierarchy.

## Design

- Remove the `directive-route-heading` element from `createDirectiveExpandedShell`.
- Keep the topbar brand and route path, which already communicate the active route and sub-area.
- Remove route-level `appendSectionTitle()` calls from Campaign, Character Creator, Mission, Crew, Ship, and Settings renderers. Keep the helper available for non-route/fallback surfaces.
- Preserve all meaningful content headings inside the route surfaces: card titles, settings disclosure summaries, campaign detail labels, mission/crew/ship section labels, and saved-game headings.
- Keep route navigation, focus behavior, route path updates, and `data-route-view` contracts unchanged.
- Remove obsolete route-heading CSS and update mobile rules so no blank spacing remains where the strip used to be.

## Accessibility and behavior

- The shell retains its existing `aria-label` and route tab semantics.
- The topbar route path remains visible text for the active route.
- No route actions, persistence, data loading, or panel state behavior changes.

## Verification

- Add a deterministic shell contract that rejects `directive-route-heading` markup.
- Add a route-render contract that verifies route panels do not emit `directive-runtime-section-title` as their first child.
- Run focused UI contracts and the full alpha gate.
- Run the live player-facing Playwright smoke against a dedicated soak user and inspect all five routes at desktop, tablet, and phone widths.
