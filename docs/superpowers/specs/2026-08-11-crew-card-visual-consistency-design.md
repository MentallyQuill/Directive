# Crew Card Visual Consistency Design

## Context

The player-character fallback emblem is rendered by the shared media placeholder. Its generic `100px` minimum height overflows the `48px` roster thumbnail, so the emblem is centered in a larger clipped box instead of the visible thumbnail. During reorder, the real roster card has square corners while the destination outline inherits the generic drag placeholder's `5px` radius.

## Approved Visual Contract

- In a desktop Crew roster thumbnail with no uploaded player portrait, the fallback emblem is centered horizontally and vertically inside the visible `48px` frame.
- The compact roster fallback shows only the emblem; the initials label remains available on larger portrait placeholders.
- The held desktop person card retains the roster's square outer corners.
- The person-card destination outline uses the same square corner geometry as the held card through hover and docking.
- Package portraits, uploaded player portraits, larger detail placeholders, category dragging, mobile card rounding, drag timing, and reorder behavior remain unchanged.

## Implementation

Add narrowly scoped CSS beneath the existing Crew roster media and drop-slot rules:

- Reset the compact player placeholder's minimum height and gap, and hide its label only inside `.people-row-image.directive-player-portrait-frame`.
- Override `border-radius` to `0` only for `.people-card-drop-slot`.

No JavaScript or asset changes are required.

## Verification

Extend the real expanded-interface browser test to assert:

- the fallback emblem and its `48px` frame share the same center within a one-pixel tolerance;
- the compact fallback label is not displayed;
- the lifted person-card ghost and destination slot both compute to `0px` corner radii.

Run the focused visual-conformance test, inspect a desktop screenshot during active drag, then run the complete `npm.cmd test` gate.
