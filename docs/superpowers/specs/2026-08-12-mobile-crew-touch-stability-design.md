# Mobile Crew Touch Stability Design

## Status

Approved on 2026-08-12. This design supersedes only the whole-card mobile hold activation in `2026-08-10-crew-card-drag-animation-design.md`. The lifted-card presentation, exact landing slot, reflow, docking, category movement, keyboard ordering, and presentation-only persistence contracts remain unchanged.

## Problem

The mobile Crew list currently attaches the person-card reorder controller to both the dedicated handle and the complete card. A real Chromium touch sequence at `390x844` can hold long enough to lift the card, but the first vertical move is still governed by native `pan-y` gesture arbitration. Chromium emits one `pointermove`, then `pointercancel`, and the drag controller docks the card back to its origin. Rapid up/down movement therefore feels like the card hits a notch or elastic stop.

The existing browser coverage dispatches synthetic pointer and touch events independently. Those events verify internal lifecycle behavior but do not exercise browser touch-action arbitration, so they cannot catch this failure.

## Decision

- Touch and pen person-card dragging starts only from the visible dedicated `Reorder <name>` handle.
- The rest of the mobile card remains ordinary native vertical scroll and accordion-selection territory; holding the card body never lifts or suppresses its click.
- The handle retains `touch-action: none`, the `175ms` touch/pen hold, the `8px` pre-lift cancellation threshold, guarded haptics, pointer capture, vertical locking, and the existing drag visuals.
- Mouse and trackpad pickup remains handle-only and immediate.
- Keyboard Arrow ordering remains available from the focused handle.

This accepts an explicit drag affordance instead of trying to combine mutually competing native scrolling and delayed whole-card pointer custody. Applying `touch-action: none` to the complete card is rejected because it would make ordinary mobile roster scrolling unreliable.

## Component Changes

- `src/ui/people-journal.js` stops passing the mobile card as `touchTarget` when it binds the person reorder handle.
- `src/ui/expanded-interface-reorder.js` remains reusable for other consumers; its optional `touchTarget` support is not removed.
- `tools/scripts/test-expanded-interface-visual-conformance.mjs` replaces the synthetic whole-card lift contract with a real mobile Chromium touch regression and preserves the existing scroll-cancellation coverage.
- `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md` and the earlier drag design state that mobile person pickup is handle-only.

## Verification

- A held mobile card body does not create a drag ghost and remains clickable/scrollable.
- A real touch starting on the mobile handle lifts after `175ms`, survives rapid vertical reversals without `pointercancel`, keeps one exact landing slot, and remains active until release.
- The same gesture still docks and preserves every person record.
- Desktop mouse dragging, keyboard reordering, expanded mobile card dragging from the handle, reduced motion, edge scrolling, category dragging, and scroll-owner identity remain green.
- The focused visual conformance test and complete alpha gate pass.
