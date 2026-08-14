# Static Full-Height Campaign Browser Cover Art

**Status:** Approved design

## Goal

Keep every cover-art hero in the Campaigns browser at the existing expanded height. This applies to selected records under both `Your Stories` and `Campaign Library` on desktop and mobile.

The cover art is presentation rather than an expandable control. The browser no longer renders a full-surface click target, expansion icon, `aria-expanded` state, or height transition for these heroes.

## Composition and Sizing

Campaigns-browser detail heroes use the current expanded responsive dimensions:

- `320px` on desktop; and
- `220px` at phone widths.

Saved-story identity, metadata, and premise remain visible as they are in the current expanded state. Campaign Library title, description, facts, availability treatment, and primary action keep their existing placement and behavior.

The active Campaign dashboard remains on its existing panel-filling hero contract. The Ship route retains the shared responsive-hero expand and collapse interaction.

## Implementation Boundary

Both `appendCampaignDetail` and `appendPackageDetail` mark non-dashboard Campaigns-browser heroes with one browser-specific static class and do not call `bindResponsiveHero` for those heroes. The Campaign panel no longer owns responsive-hero interaction.

CSS assigns that browser-specific class the existing expanded-height variable. Existing phone variable overrides continue to select the approved mobile height without duplicating size values.

The shared `responsive-hero.js` helper and its styles remain available to the Ship route and any unrelated consumers.

## Accessibility and Interaction

- Campaigns-browser artwork is absent from the tab order.
- No expansion control, label, or state is exposed for static artwork.
- Selecting Campaign records and using their actions remains keyboard operable.
- Saved-story copy stays readable without hover or interaction.
- Coming-later artwork retains its grayscale and opacity treatment.

## Verification

Focused DOM coverage must prove that saved-story and Campaign Library heroes:

- carry the static Campaigns-browser hero contract;
- do not use `.directive-responsive-hero`;
- contain no `.directive-responsive-hero-toggle`;
- expose no `aria-expanded` state; and
- keep saved-story secondary copy visible without responsive-helper classes.

Existing responsive-hero unit coverage continues to prove that the shared helper works for the Ship route.

Playwright coverage at representative `1440x900` desktop and `390x844` phone viewports must prove that visible saved-story and Campaign Library heroes:

- use `320px` and `220px` heights respectively;
- have no expansion control or height transition;
- do not change height after click or tap;
- retain cover-art layers and readable copy; and
- introduce no horizontal overflow.

Capture desktop and phone screenshots of the final Campaigns browser. Run the full `npm.cmd test` gate before pushing.

## Non-Goals

This change does not alter the active Campaign dashboard, Ship route, Campaign record selection, mobile accordion behavior, campaign creation, saved-game operations, deletion safeguards, campaign content, or any runtime authority state.
