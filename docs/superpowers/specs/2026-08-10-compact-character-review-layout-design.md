# Compact Character Review Layout Design

## Goal

Keep the desktop and tablet Character Creator Review step fully visible above the fixed route navigation without turning the route body into a scrolling document.

## Problem

The Review step currently places two tall difficulty cards beside the selected-mode summary. Combined with the commissioning controls and two dossier text areas, that content exceeds the expanded shell's route body. The creator form is a shrinkable flex item with decorative `overflow: hidden`, so its grid tracks compress and overlap instead of creating a useful layout. The result is clipped biography and reputation fields plus a squashed command area.

## Approved Layout

The Campaign Difficulty panel uses two tiers:

1. A compact top row places the Campaign Difficulty heading and lead copy on the left. The Exploration and Command radio buttons sit side-by-side on the right.
2. The Selected Mode Summary spans the full panel width beneath that row.

Each mode button keeps its mode name and its short style badge (`Story-forward` or `Full Simulation`). The fatality-policy line is removed from the button because the full policy remains available in the selected-mode summary.

At desktop and tablet widths, the two mode buttons remain on the same line. At mobile widths, the heading and button group retain the existing stacked responsive composition, with the two buttons still sharing their own row where width allows.

## Dossier Text Fields

Brief Biography and Public Reputation remain side-by-side at desktop and tablet widths. Their text areas have a fixed visual height, disable manual resizing, and use internal vertical scrolling when entered text exceeds the available space. Mobile retains the existing one-column field layout.

## Scrolling and Sizing Contract

At the representative `1200 x 1050` CSS-pixel desktop viewport, which gives the expanded shell its maximum `900px` height:

- The expanded-shell route body does not require vertical scrolling on the Review step.
- The creator form's visible content remains within the route body's bottom edge.
- Commissioning step buttons retain at least `40px` height.
- The creator command bar does not overlap the commissioning controls.
- The fixed route navigation remains outside and below the route body.

The mobile shell may retain its existing route-body scrolling because its fields are intentionally stacked; this change does not redesign the mobile composition.

## Implementation Boundaries

- Update the difficulty selector markup only enough to create a top-row grouping and remove the redundant option-policy nodes.
- Update the relevant Character Creator CSS without changing simulation-mode data, selection behavior, accessibility roles, or summary content.
- Extend the existing Playwright layout test so it recreates the real expanded-shell flex nesting and asserts observable geometry and scrolling behavior.
- Do not redesign other Character Creator steps or Directive routes.

## Verification

The focused Playwright layout test must first fail against the current layout, then pass after the implementation. The full alpha gate must remain green. A rendered desktop screenshot will be inspected to confirm the hierarchy, fixed route navigation, readable controls, and unclipped dossier fields.
