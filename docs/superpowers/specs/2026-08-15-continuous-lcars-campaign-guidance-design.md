# Continuous LCARS Campaign Guidance Design

**Date:** 2026-08-15

## Goal

Replace the campaign-required notification's disconnected decorative rails, conventional dark copy card, and filled D-shaped icon pod with a structurally authentic LCARS composition: one continuous hollow left elbow feeding horizontal segmented rails around an open black information field.

## Composition Contract

The centered notification remains one non-interactive guidance surface. Its visual structure consists of two layers:

1. A decorative frame layer contains one amber hollow left elbow plus upper and lower horizontal rails. The upper rail continues directly from the elbow and uses amber, lilac, and blue segments. The lower rail continues directly from the elbow and uses violet, salmon, and amber segments. Short black separators divide secondary segments, while the elbow and the first upper amber segment touch without a gap.
2. A content layer sits over the open black field. The bundled top-down ship glyph occupies the black interior of the elbow. The eyebrow, instruction, and supporting detail sit directly on the surrounding black field to its right.

The elbow is a thick C-shaped structural band made from amber top, left, and bottom borders with no right border. This produces genuine outer and inner radii around a transparent center, exposing the route's actual black field instead of painting a lookalike cutout. It is not a filled semicircle, capsule, bevel, icon background, or independent pod.

The copy field has no card background, gradient, border, rounded rectangle, outline, inset stripe, or shadow. The shell's existing black surface is the information field. The rails remain visibly separate color blocks but read as one structural path because their ends align and physically meet the elbow.

## Responsive Geometry

The composition remains centered within the route body at desktop, `390 x 844`, and `360 x 780`. The elbow compresses from approximately 84 px to 66 px wide on mobile while retaining a 12-14 px structural band. The ship glyph remains inside the elbow's black cutout and the copy begins at or to the right of the elbow's open edge.

The rails never overlap the copy, route heading, bottom navigation, browser chrome, or existing left route rail. The panel introduces no horizontal viewport overflow.

## Behavior and Accessibility

Existing copy, current-chat status handling, route guards, body marker, Campaign synchronization, `aria-describedby`, click behavior, keyboard behavior, and reduced-motion behavior remain unchanged. The frame and its segments are decorative and hidden from assistive technology. The ship glyph remains decorative.

The Campaign control retains the approved 2.4-second bridge-panel cadence: 0.2 seconds ramp on, 1 second fully lit, 0.2 seconds ramp off, and 1 second dark. This redesign does not alter that animation.

## Verification

Structural tests must prove that the renderer creates one decorative frame, one elbow, two rails, six ordered theme-tone segments, one open icon field, and no icon pod. Source-contract assertions must reject the old `62px 0 0 62px` filled-pod geometry, require a transparent three-sided elbow border, and require the copy field to remain transparent and shadowless.

Rendered tests must prove at every certified viewport and affected route that the elbow touches both rails, the ship glyph is contained by the elbow's black interior, the copy starts outside the elbow, and the copy field computes to a transparent background with no shadow or rounded-card corners. Existing centering, overflow, navigation clearance, Campaign activation, pulse timing, and reduced-motion assertions remain in force.

Final browser inspection must compare desktop and certified-mobile screenshots and confirm that the geometry reads as a continuous LCARS elbow framing negative space rather than a card decorated with LCARS colors.
