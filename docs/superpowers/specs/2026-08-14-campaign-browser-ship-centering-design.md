# Campaign Browser Ship Centering

**Status:** Approved design

## Goal

Center the foreground ship vertically inside cover-art heroes on the Campaigns selection screen. The adjustment applies to selected records under both `Your Stories` and `Campaign Library` on desktop and mobile.

The active Campaign dashboard remains unchanged.

## Composition

Campaigns-browser cover art uses a neutral `50%` vertical anchor for the foreground ship:

- desktop moves from `calc(50% + 20px)` to `50%`, raising the ship by 20 pixels; and
- mobile moves from `calc(50% - 20px)` to `50%`, lowering the ship by 20 pixels.

This centers the ship silhouette without changing its scale, horizontal position, drift animation, artwork, background layers, hero height, title treatment, or description placement.

## Implementation Boundary

A selector scoped through `.campaign-browser-hero` overrides the shared foreground-layer `top` value after the phone-specific shared rule. The selector must win at both desktop and phone widths while leaving `.campaign-dashboard-hero`, Ship-route heroes, and all other layered scenes on their current composition.

No JavaScript state, package metadata, or per-campaign art offsets are added.

## Verification

Playwright coverage must inspect the Ashes of Peace cover in the Campaigns browser at `1440x900` and `390x844` and prove:

- the visible browser foreground is anchored at the vertical center of its hero;
- desktop no longer uses the shared 20-pixel downward offset;
- phone no longer uses the shared 20-pixel upward offset;
- the active Campaign dashboard retains its current desktop and phone foreground offsets;
- the foreground scale and layered-scene structure remain unchanged; and
- no horizontal overflow is introduced.

Capture fresh desktop and phone screenshots after selecting Ashes of Peace. Visual inspection must consider the complete ship silhouette, including bow, stern, nacelles, and breathing room against the cover frame rather than relying only on hero height or computed CSS.

Run the focused Campaign panel, shared responsive-hero, expanded-interface visual conformance, and full `npm.cmd test` gates before pushing.

## Non-Goals

This change does not alter hero height, expand/collapse behavior, the active Campaign dashboard, Ship route, campaign content, artwork files, animation timing, Campaign Library hierarchy, selection behavior, or runtime authority state.
