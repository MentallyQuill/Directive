# Full-Height Active Campaign Hero

**Status:** Approved design

## Goal

Turn the active Campaign dashboard into a full-height animated ship scene. The scene uses every available pixel between the dashboard header and a bottom action dock, while keeping the full ship legible on desktop and using only a modest punch-in on phones.

The change removes expand/collapse interaction from the active dashboard hero. It preserves the Campaign browser as a separate subview, keeps `Campaigns` in the upper-right dashboard header, and does not change campaign, save, load, or deletion authority.

## Dashboard Composition

The active Campaign dashboard is a three-row grid:

1. A header containing `Current Campaign` and the `Campaigns` control.
2. One animated hero that fills all remaining dashboard height.
3. A bottom action dock containing Continue, Save Game, Load Game, and Delete campaign immediately above Directive's route navigation.

The dashboard itself stays bounded by the Campaign route body. It does not add page content or informational cards below the hero. Campaign identity, player/role/setting metadata, and player-facing premise remain overlaid at the bottom of the scene with the existing protective gradient.

`Campaigns` remains a header action and is not part of the bottom dock. Opening and returning from the Campaign browser keeps the existing focus-handoff behavior.

## Hero Sizing and Cropping

The active dashboard hero uses `minmax(0, 1fr)` and therefore grows or shrinks with the real panel rather than using fixed collapsed and expanded heights.

The layered scene retains separate background, star, glow-star, and foreground ship elements:

- background and star layers continue to cover the complete hero;
- the foreground ship remains a width-based contained image instead of changing to `object-fit: cover`;
- desktop keeps the complete ship silhouette visible with the existing gentle `0.79` to `0.81` drift scale;
- mobile keeps the existing modest `1.035` to `1.045` drift scale and centered portrait composition, cropping only a small amount at the horizontal edges; and
- animation duration, direction, parallax, shimmer, and reduced-motion behavior remain unchanged.

The larger hero must not scale the foreground according to hero height. This prevents a tall phone viewport from turning the ship into a narrow vertical slice.

## Interaction

The active dashboard hero is presentation, not a button. It has no full-surface click target, expand icon, `aria-expanded` state, or expand/collapse height transition.

This removal is scoped to the active Campaign dashboard. Campaign Library detail heroes and the Ship route retain their current responsive-hero interaction and sizing. The shared `responsive-hero.js` helper remains available for those surfaces.

## Action Dock

The action dock is the final dashboard grid row, so it always sits directly below the hero and immediately above route navigation. It uses an opaque Directive surface, a top divider, and safe-area-aware spacing; buttons never float over the ship artwork.

Desktop retains one row in this order:

1. Continue
2. Save Game
3. Load Game
4. Delete campaign

Phone layouts retain the certified two-row contract:

- Continue plus Delete campaign on the first row.
- Equal-width Save Game and Load Game controls on the second row.

Every action remains at least 44 CSS pixels high. The delete control remains a labeled 44-pixel icon button whose typed-confirmation dialog is the destructive authority.

## Responsive and Accessibility Requirements

- The hero fills the available dashboard height at desktop and phone viewports without horizontal overflow.
- The complete desktop ship silhouette stays inside the hero's visible bounds throughout its drift animation.
- Mobile may crop a small horizontal margin but must retain the recognizable bow-to-stern ship composition.
- Identity copy and action controls remain readable without depending on hover.
- Campaign actions remain keyboard operable and preserve their existing labels and focus behavior.
- The hero is absent from the tab order after its expansion control is removed.
- `prefers-reduced-motion: reduce` continues to stop scene animation and show the existing rest scale.

## State and Authority Boundaries

This is a presentation-only change. `renderCampaignPanel` still derives the active campaign from `buildCertifiedCampaignView`. Continue, Save Game, Load Game, Delete campaign, Campaigns, and Back to Current Campaign retain their existing handlers and exact payloads.

No campaign, timeline, checkpoint, browser-mode, ship, mission, or Story Settlement state is added or changed.

## Verification

Focused DOM coverage must prove that the active dashboard:

- renders a full-height dashboard-specific hero;
- does not render the responsive-hero toggle or expanded state;
- keeps Campaigns in the header;
- keeps the four campaign actions in the final dock; and
- leaves Campaign Library heroes on the existing responsive-hero contract.

Playwright coverage must inspect representative `1440x900` desktop and `390x844` phone viewports and prove:

- the dashboard occupies the available Campaign route height;
- the hero consumes the space between header and action dock;
- the action dock is the dashboard's bottom row immediately above route navigation;
- desktop uses one action row and phone uses the intentional two-row action grid;
- all phone actions meet the 44-pixel target;
- the active hero has no expand/collapse control and does not change height after click or tap;
- foreground and background animation layers remain present;
- the desktop ship stays fully visible and mobile retains the broad ship composition;
- there is no horizontal overflow; and
- captured desktop and mobile screenshots show the final composition.

The full `npm.cmd test` gate must pass after focused DOM and Playwright verification.

## Non-Goals

This design does not change Campaign Library layout, new-campaign creation, Ship-route layout, animation artwork, animation timing, campaign content, timeline branching, save serialization, load semantics, or deletion safeguards.
