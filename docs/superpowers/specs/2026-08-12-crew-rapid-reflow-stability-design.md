# Crew Rapid Reflow Stability Design

## Status

Approved on 2026-08-12 under the existing Crew drag contract and the user's standing authorization to complete the mobile animation fix without further approval pauses. This design changes only interrupted sibling reflow; pickup, midpoint selection, slot placement, ordering, docking, keyboard control, and persistence remain unchanged.

## Proven Defect

Each placeholder crossing currently captures every sibling's presentation rectangle, cancels every running sibling animation, and starts a new `170ms` FLIP animation for every sibling that is still visually offset. A rapid monotonic swipe therefore restarts successive rows in a `4/3/2/1` staircase, while a rapid down-and-up reversal restarts them `8/7/6/5` times. The destination slot moves immediately, but the repeatedly reset rows trail it on different easing clocks and produce the visible notch or fighting wave.

Only one Web Animation is live on a given row in the normal single-pointer path; the defect is repeated replacement across rows, not unbounded animation objects on one row.

## Decision

- Reflow animation ownership becomes per real row instead of one globally canceled set.
- Before moving the slot, the controller records each visible row's current presentation top and transform-independent layout top.
- After moving the slot, a row whose layout top did not change keeps its existing animation and easing clock.
- A row whose layout top changed cancels only its own prior animation and begins one replacement trajectory from its exact pre-move presentation top to its new layout top. This preserves continuity during a true direction reversal.
- Animation completion removes an entry only when that entry is still the row's current animation, so a canceled animation cannot delete its replacement during promise cleanup.
- Reduced motion and terminal cleanup still cancel every animation immediately.
- Pointer hit-testing remains synchronous. Frame throttling is unnecessary once unchanged rows retain their animations, and delaying target updates would weaken exact release and edge-scroll behavior.

Layout change detection uses the row's offset-parent layout chain rather than its transformed `getBoundingClientRect()`. That keeps animation transforms and scroll movement out of endpoint comparison while retaining the current FLIP presentation measurement.

## Verification

- In real Chromium, rapidly crossing three rows must start each displaced row once; crossing later rows must not replace an earlier row's running animation.
- Reversing across one row may replace that row's animation, but rows whose endpoints remain unchanged keep their animation identities.
- A replacement animation's first keyframe must reconstruct the row's pre-cancel presentation top within one pixel.
- A single reorder controller owns at most one running reflow animation per row.
- The existing stationary slot, `170ms cubic-bezier(.2,.8,.2,1)` sibling motion, `160ms` docking, real-touch custody, reduced-motion behavior, category movement, and concurrent-controller lifecycle remain green.
- A `390x844` real-touch fast down-and-up visual probe must no longer show the restart staircase and must settle without a row notch.
- The focused visual conformance test and complete alpha gate pass before integration to `main`.
