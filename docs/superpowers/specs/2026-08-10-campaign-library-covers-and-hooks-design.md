# Campaign Library Covers and Hooks Design

## Goal

Make every card on **Campaign / Choose a campaign** use the same bounded cover-image shape, and replace each one-line teaser with spoiler-free back-cover copy of four sentences. The change must preserve the existing two-column desktop library, locked-preview treatment, campaign availability rules, and mobile stacking.

## Current problem

Five campaign card assets are 960x540, while the Ashes of Peace card asset is 640x640. The campaign media wrapper currently has only a minimum height, so each image's intrinsic aspect ratio can determine the rendered media height. Ashes therefore renders substantially taller than the other cards.

The six teaser summaries are also only one sentence each. At the current inherited body size, that leaves most of each card's copy region unused and does not communicate enough of the campaign fantasy.

## Considered approaches

1. **Shared CSS frame and source copy update — recommended.** Give the existing campaign media wrapper a 16:9 aspect ratio and let its existing `object-fit: cover` crop every source consistently. Expand the six registry summaries and apply a smaller type size only to campaign-card hooks. This is the smallest change and keeps source assets, rendering architecture, and runtime behavior intact.
2. **Regenerate the Ashes card asset at 960x540.** This would remove the one source-ratio outlier, but it would not guarantee consistent future cards and would introduce a new derived binary asset for a layout concern CSS can enforce.
3. **Use a fixed pixel media height.** This guarantees identical height at one viewport but scales poorly across the desktop, tablet, and mobile layouts and can distort the intended proportions.

## Approved design

### Cover frame

The existing `.directive-v1-campaign-media` wrapper will own a 16:9 aspect ratio and a consistent width. The image will continue to fill that frame with `object-fit: cover`, so the square Ashes source is cropped rather than stretched. The rule applies equally to playable and unavailable cards and remains responsive without introducing per-campaign exceptions.

### Hook copy

Each entry in `V1_CAMPAIGN_LIBRARY_TEASERS` will receive exactly four complete, spoiler-free sentences. The copy will establish the player's role, the campaign's initiating situation, its central command tension, and the kind of consequential choice it promises. It will use only player-facing premise material from the campaign sources and will not expose hidden truths, solutions, endings, or future reversals.

The hook paragraph will receive a campaign-card-specific class so its typography can be adjusted without changing active campaign summaries or unrelated paragraphs. It will use `0.82rem` type with a `1.4` line height, wrap naturally, and remain unclamped.

### Card behavior

Buttons, availability labels, disabled-state grayscale/opacity, package IDs, and campaign-start behavior remain unchanged. Copy areas may grow vertically when needed, but all cover frames in the same grid retain the same aspect ratio. No campaign asset files or package schemas change.

## Verification

- Add registry assertions that all six hooks contain four sentences and retain non-empty teaser metadata.
- Add/extend a structural style assertion that the campaign media wrapper uses 16:9 sizing, images use cover cropping, and the hook has its scoped compact typography.
- Run the focused tests, then the full alpha gate.
- Render or inspect the campaign chooser at desktop and mobile widths to confirm equal cover frames, readable four-sentence hooks, intact buttons, and no overflow.

## Non-goals

- Rewriting campaign titles, status labels, or button copy.
- Making preview campaigns playable.
- Reframing or regenerating the underlying ship artwork.
- Changing the active-campaign/save cards above the story library.
