# Responsive Cohesion Ring Segments Design

**Status:** Approved

**Date:** 2026-08-13

## Problem

The Ship Cohesion ring currently draws each segment as a thick open SVG arc with a round line cap. At desktop sizes the responsive stroke reaches 32 CSS pixels while mobile uses 15 CSS pixels. The desktop ring therefore reads as a set of oversized pills, and its visual language differs materially from mobile.

## Approved Visual Contract

- Render each Cohesion unit as an annular sector: a portion of a circle with a concentric circular cutout and a narrow radial cut between neighboring segments.
- Use flat radial faces instead of round line caps.
- Soften the four corners only enough to avoid visibly jagged antialiasing. The optical target is approximately a 2 CSS pixel radius.
- Give desktop and mobile the same perceived band thickness, corner treatment, segment span, and gap proportion. They may use separately calibrated SVG geometry to achieve that result.
- Reduce the large-desktop band to approximately half its current maximum thickness, targeting about 15-16 CSS pixels rather than 32 CSS pixels.
- Preserve all 20 logical segments, their order, accessibility labels, task bindings, state colors, preview behavior, glow, reduced-motion behavior, and the existing split that places half the ring behind the ship and half in front.

## Selected Construction

Replace each stroked centerline arc with one logical SVG segment group containing a closed, filled annular-sector path. The path follows an outer circular arc, turns across a short radial face, returns along the inner circular arc, and closes across the opposite radial face. Small curve transitions at the four joins produce the near-sharp 2-pixel optical radius without relying on `stroke-linecap`.

The renderer will derive desktop and mobile path variants from one geometry helper and one shared set of proportions. Only one variant is visible at a time. The two variants compensate for the different rendered ring diameters so that the band and corner softening stay visually equivalent instead of merely sharing identical view-box numbers.

The logical segment group, rather than either responsive shape, retains the `ship-cohesion-segment` class, state classes, task data, list-item role, and accessible label. This keeps interaction code and semantic segment counts stable while allowing responsive geometry underneath it.

## Visual State Treatment

- Ready segments remain blue.
- Cohesion debt remains muted burgundy.
- Reward previews remain amber with the existing glow emphasis.
- Queued debt remains visually distinguishable through the existing reduced-opacity treatment and a shape-appropriate inset or boundary treatment; it must not reintroduce pill caps.
- Color and preview classes apply to the logical segment and are inherited by its visible shape.

## Responsive Geometry

- Use the existing 100 by 100 SVG coordinate system, center point, ring placement, and front/back layer order.
- Preserve 20 equal angular slots.
- Replace the current large open gaps with narrow radial cuts so the result reads as one machined ring divided into LED-like sections.
- Calibrate a desktop geometry for the ring's capped desktop diameter and a mobile geometry for the smaller responsive diameter.
- Target approximately 15-16 CSS pixels of visible band thickness and approximately 2 CSS pixels of optical corner softening at the primary 1440 by 900 and 390 by 844 reference viewports.
- At intermediate and compact sizes, retain the same silhouette and avoid abrupt optical changes at the 820-pixel breakpoint.

## Verification

Update the fake-DOM coverage to prove there are still exactly 20 logical, accessible segments and that every visible shape uses a closed annular path with both outer and inner circular arcs. Update the Playwright visual certification to reject round-capped stroke segments and measure the visible band, responsive variant selection, ring/ship centering, layer synchronization, and horizontal overflow at 1440 by 900, 1024 by 768, 390 by 844, and 360 by 500.

Capture fresh screenshots for all certified viewports and visually compare desktop and mobile for the approved shared silhouette. Run the focused Ship DOM and visual scripts, then run the full repository gate before pushing to `main`.

## Out of Scope

- Changing Cohesion rules, segment count, task rewards, or task selection.
- Reframing or resizing the ship artwork or ring orbit.
- Changing task cards, detail panels, navigation, or mobile accordion behavior.
- Redesigning state colors or glow intensity beyond what is necessary to apply them to filled shapes.
