# Ship Callout True Bevel Correction Design

## Problem

The desktop Ship callouts currently use an eight-point `clip-path` on both the card and its inset surface. That treatment cuts off the corners and produces a chamfer. The browser test requires that polygon clipping, so it certifies the incorrect geometry.

## Approved visual contract

Only the desktop callouts positioned beside the ship graphic change.

- Keep the compact, title-sized card widths and the existing `L{n}` label placement.
- Keep all four corners intact. Desktop callouts must compute `clip-path: none`.
- Render a shallow 3px bevel as edge planes: the top and left edges are lighter, while the bottom and right edges are darker.
- Preserve the dark card surface, violet normal state, orange selected/hover state, and existing shadow.
- Preserve solid leader lines at 1.5px normally and 2px when highlighted.
- Do not change the mobile badges, mobile accordion rows, or desktop accordion rows.

## Implementation

Replace the polygon shell and inset polygon with a rectangular 3px border whose four colors create the bevel. The normal state uses a restrained violet highlight and a dark violet shadow. The selected and hover states use an orange highlight and a darker burnt-orange shadow. The existing responsive rule at 820px and below continues to restore the unchanged 1px rectangular accordion border and 3px left accent.

No markup, layout geometry, task data, interaction behavior, or leader routing changes are required.

## Verification

The Playwright visual contract will reject any desktop `clip-path`, require 3px desktop borders, and verify that the light top/left edge colors differ from the dark bottom/right edge colors. It will continue to require the existing responsive 1px border treatment below 821px and the approved solid leader weights at every certified viewport.

Generated screenshots will be inspected at 1440x900, 1024x768, 980x720 Android desktop-site, 390x844, and 360x500. The focused Ship checks and full repository gate must pass before publication.
