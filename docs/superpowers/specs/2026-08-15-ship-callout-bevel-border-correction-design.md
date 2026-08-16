# Ship Callout Bevel Border Correction

**Date:** 2026-08-15

## Goal

Correct the floating desktop Ship callouts so their 4px bevels have continuous painted edges instead of visibly clipped rectangular borders. Make Ship leader lines solid at 1.5px normally and 2px when highlighted.

## Root Cause

The current button paints a rectangular CSS border and then clips the entire result with an eight-point polygon. `clip-path` cuts the rectangular border but does not repaint a stroke along the new diagonal edges. The horizontal and vertical strokes therefore stop at each corner. Android Chrome desktop-site mode scales the approximately 980px CSS viewport down to the phone display, making those missing one-pixel joins especially visible.

## Corrected Desktop Callout Contract

The floating desktop callout retains its approved 4px silhouette, intrinsic 120-205px width, `L${task.level}` label, category symbol, title, reward row, and current colors.

The button itself becomes the outer beveled edge layer. A 1px-inset pseudo-element paints the inner dark surface with a parallel 3px bevel, producing a continuous one-pixel edge along all eight sides. A second pseudo-element restores the existing 3px violet left accent inside the clipped silhouette. Hover and selected states change the outer edge, left accent, and inner surface through shared custom properties so no rectangular border is involved.

At the existing `max-width: 820px` breakpoint, the pseudo-element bevel layers are disabled and the current rectangular accordion border, left accent, rounded corners, width, and background are restored. Mobile badges and accordion composition remain unchanged.

## Leader Contract

All `.ship-task-leader` routes become solid. Default stroke width changes from `1` to `1.5`; active preview/selection width changes from `1.5` to `2`. Geometry, endpoints, colors, routing, and pointer/selection behavior remain unchanged.

## Verification

Browser coverage must fail against the clipped-border implementation and then prove:

- desktop callouts use a zero-width rectangular border plus visible outer/inner polygon layers;
- the inner layer is inset one pixel and uses a 3px bevel;
- the left accent layer is 3px wide;
- responsive accordion buttons disable both polygon layers and retain their existing rectangular border;
- every leader is solid and computes to 1.5px, while the active leader computes to 2px;
- callouts remain intrinsically sized, in bounds, non-overlapping, and connected without crossings.

Rendered inspection covers 1440x900, 1024x768, and the Android desktop-site 980x720 CSS viewport, plus existing mobile viewports. The full repository gate and exact remote ancestry check are required before publication.
