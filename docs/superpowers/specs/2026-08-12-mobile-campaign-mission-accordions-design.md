# Mobile Campaign and Mission Accordions Design

## Problem

At phone widths, Campaign and Mission currently reuse the desktop master/detail composition as two stacked, independently scrolling panes. Campaign reserves 36% of the route for its record index and Mission reserves 32%, leaving both the index and detail too short to read comfortably. The shell also repeats the active route in an intermediate colored heading, and the Campaign and Mission indexes repeat it again in large headers even though the selected bottom navigation tab already establishes location.

The selected bottom-navigation button also retains border, outline, and inset-ring treatments that conflict with the approved solid-color LCARS presentation.

## Scope

This feature applies only at phone widths of `640px` or less.

Desktop and tablet widths above `640px` retain the current DOM behavior, two-column master/detail presentation, route-heading strip, Campaign and Mission index headers, scroll ownership, and bottom-navigation styling.

The phone changes apply as follows:

- Hide the intermediate colored route-heading strip on all five routes.
- Keep the `DIRECTIVE` brand, breadcrumb, close control, LCARS rail, and bottom navigation.
- Replace only Campaign and Mission's stacked master/detail panes with single-column disclosure lists.
- Remove the redundant `Your Stories / Campaigns` and `Active Record / Mission` title blocks from the phone disclosure lists.
- Render selected and focused phone navigation buttons with solid route colors and no outline, border ring, or inset ring.

## Approved interaction

### Campaign

Campaign renders one phone list containing saved/current Campaign records followed by a compact `Campaign Library` separator and the library records. `Your Stories` is retained only as a compact section separator when saved/current records exist; it is not paired with another `Campaigns` title.

Each record row is a button with `aria-expanded` and `aria-controls`. Its existing detail content renders immediately below that row when expanded. The detail preserves the current Campaign hero, commands, saved games, package description, player-safe facts, playable state, and coming-later treatment.

The initially expanded record is the last-played Campaign. Selection priority is:

1. `campaignIndex.selectedCampaignId` when it identifies a rendered Campaign;
2. the rendered Campaign with the greatest valid `lastPlayedAt` value;
3. the active rendered Campaign;
4. the first playable package when no Campaign exists.

Opening a closed row closes the previously open row. Tapping the open row closes it and leaves every row collapsed. Collapsing does not discard the selected desktop record. A phone selection synchronizes the hidden desktop master/detail selection so resizing above `640px` does not reveal stale content.

### Mission

Mission renders its mission records as the same controlled phone disclosure pattern, without the redundant `Active Record / Mission` title block. The active/selected mission is expanded initially. Opening a different record closes the previous one, and tapping the open record collapses all. Although V1 currently exposes one mission record, the structure supports multiple records without another responsive redesign.

The expanded content preserves the current mission hero, terminal outcome, objectives, clocks, known information, and available support.

### Scroll and focus behavior

Each phone route has exactly one visible declared scroll owner: the Campaign or Mission disclosure list. Hidden desktop master/detail panes do not own visible overflow at phone widths. Expanding or collapsing a row updates disclosure nodes in place rather than replacing the route body or list, preserving the list's scroll offset and the activating button's focus.

## Structure

Campaign and Mission keep their existing desktop compositions and add phone-only disclosure compositions in the same panel renderer. CSS determines which composition is visible at the `640px` breakpoint. This avoids viewport JavaScript and keeps responsive resizing deterministic.

The phone disclosure controller is a small shared UI helper. It owns one open key, updates button `aria-expanded` values and panel hidden state in place, supports collapse-all, and calls a route-specific selection synchronizer when a new key opens. Campaign and Mission remain responsible for constructing their own record summaries and existing detail content.

## Accessibility

- Every disclosure trigger is a native `button`.
- Every trigger has `aria-expanded` and `aria-controls`.
- Every detail has a stable matching `id` and is hidden when collapsed.
- Only one detail is visible at a time.
- Focus remains on the activating trigger during disclosure changes.
- Phone bottom-navigation keyboard focus remains visible through a solid route-color state rather than an outline.
- Existing tab roles, labels, and roving keyboard focus remain unchanged.

## Verification

DOM regressions must prove:

- Campaign and Mission render both their unchanged desktop composition and a phone disclosure composition.
- Default Campaign and Mission disclosures follow the approved priorities.
- Opening one record closes the previous record; tapping it again collapses all.
- Disclosure does not replace the list or route body and preserves focus.
- Campaign phone selection synchronizes the desktop selected row and detail.
- Disclosure controls and panels have correct accessible relationships.

Browser regressions at `390x844`, `360x800`, and `360x500` must prove:

- The route-heading strip and redundant index title blocks are not visible.
- Campaign and Mission each have exactly one visible scroll owner.
- The expanded detail receives the available route width and remains reachable in the same scrolling surface as its row.
- Disclosure preserves the list node and scroll offset.
- Bottom navigation selected and focused controls have no outline or inset ring and use a solid route-color fill.
- The document does not overflow either axis.

Desktop regression checks at `1024x768` and `1440x900` must prove the route-heading strip, two-column Campaign/Mission master-detail composition, two visible scroll owners, index headers, and existing navigation treatment remain present.

The complete `npm.cmd test` gate must pass before commit and push.
