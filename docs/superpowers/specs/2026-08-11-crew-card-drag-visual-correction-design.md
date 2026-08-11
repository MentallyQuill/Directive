# Crew Card Drag Visual Correction Design

## Status

Approved on 2026-08-11 after direct browser inspection of the shipped interaction. This document narrows and corrects the rendering details in `2026-08-10-crew-card-drag-animation-design.md`; activation, ordering, persistence, keyboard behavior, touch timing, and cancellation remain unchanged.

## Proven Defects

- The body-level drag layer renders at `z-index: 9998`, below the Directive runtime shell at `100050`, so the lifted card is hidden while the empty slot moves.
- The ghost copies every computed CSS property inline. In the inspected desktop card that produced `6,171` inline declarations across `11` nodes and overrode the intended blue border, raised background, and `1.015` lift scale.
- The clone retains the source card's `active` class, leaving the selection-only blue inset on its left edge instead of a complete held-card outline.
- Pointer movement writes `top` directly rather than using a compositor transform, diverging from the Saga Loredeck Library interaction that inspired the design.
- Existing browser assertions prove DOM presence and geometry but do not prove that the held card is visibly above the shell with the approved presentation.

## Corrected Ghost Architecture

- Keep the ghost in a body-level `.directive-drag-layer`, but place that layer above the runtime shell with `z-index: 100100`.
- Clone the rendered card structure without copying computed declarations. Copy only inherited CSS custom properties from the source shell/card onto the drag layer so existing `.directive-expanded-shell` descendant rules render the clone normally.
- Remove transient source-only classes including `active`, `is-dragging`, `is-drop-before`, and `is-drop-target` from the clone.
- Preserve explicit ghost width and height, accessibility cleanup, pointer offset, vertical track lock, opacity, elevated shadow, and full People-blue border/background.
- The active People ghost must compute to a solid blue border on all four sides, the raised People background, `0.96` opacity, and a visible `1.015` scale.

## Motion

- Anchor the fixed ghost at `left: 0; top: 0` and move it with `translate3d(x, y, 0) scale(1.015)`.
- Coalesce raw pointer movement into at most one visual transform write per animation frame while hit testing and slot selection continue to use the latest pointer coordinates.
- Dock with a transform-only Web Animation from the current translated position and scale into the slot's translated position at scale `1` over the existing `160ms` easing.
- Reduced motion keeps the visible ghost and slot while completing movement/docking immediately.

## Verification

- The active drag layer's computed z-index must exceed the runtime shell's computed z-index.
- The held card must have four solid border sides, a non-transparent background, `matrix(...1.015...)` or equivalent scale, no `active` class, and fewer than `100` total inline declarations across its subtree.
- A screenshot captured while the pointer is still down must visibly show the complete card over the interface and the exact destination slot beneath it.
- Moving the pointer horizontally must not move a vertically locked People ghost; moving vertically must update through `translate3d`.
- Docking, cancellation, mobile hold, edge scroll, category drag, and the full alpha gate must remain green.
