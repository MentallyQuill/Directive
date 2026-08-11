# Crew Card Drag Animation Design

## Status

Approved on 2026-08-10. This design supersedes only the People-card pointer-drag behavior in `2026-08-10-person-card-handle-design.md`. The approved person handle, category drag behavior, keyboard ordering, campaign-scoped presentation persistence, and player-safe story boundaries remain unchanged.

## Goal

Make crew-card organization feel like lifting a physical dossier from a vertical tray: the card undocks under the pointer, remains horizontally aligned with the roster, opens an exact landing slot as it moves, and docks with a short magnetic snap.

## Activation

- A primary mouse or trackpad press starts only from the dedicated person-card handle and lifts immediately.
- Touch and pen may start anywhere on a mobile person card after a `175ms` hold.
- Motion beyond `8px` before the hold completes cancels drag arming and preserves ordinary vertical scrolling.
- A quick mobile tap remains the existing expand/select gesture.
- Drag activation captures the pointer, suppresses selection and clicks only for the active drag, and requests a guarded `10ms` vibration when supported.

## Lifted Card

- The real source row is removed from layout and replaced by an exact-size drop slot.
- A body-level clone preserves the card's rendered width, height, theme, and the pointer-to-card offset at pickup.
- The clone stays locked to the roster's original horizontal coordinate. Pointer `x` movement neither moves the clone nor changes the vertical target; hit testing uses the roster track.
- The lifted clone uses the People blue border, near-solid opacity, a soft elevated shadow, and a restrained `1.015` scale.

## Live Landing Slot

- The slot has the source card's exact border-box height and margins.
- It uses a solid blue outline, matching radius, and faint translucent fill so it represents the complete final card rectangle rather than a line between cards.
- Crossing a peer card's vertical midpoint relocates the slot before or after that card.
- Moving into an expanded peer category relocates the same slot into that category; empty lists accept it as their first position.
- Existing rows displaced by a slot move use FLIP-style `transform` animation for `170ms` with `cubic-bezier(.2,.8,.2,1)`, including rapid direction changes without a visual jump.
- The nearest vertical roster scroller auto-scrolls inside a `52px` edge zone, ramping toward a maximum `16px` step.

## Drop, Cancel, And Cleanup

- Releasing on a valid slot animates the clone into the slot for `160ms`, reduces its scale and shadow, then commits and rerenders exactly once.
- The slot brightens during docking, disappears when replaced by the real row, and requests a guarded `8ms` completion vibration.
- `Escape`, `pointercancel`, window blur, or release outside a valid vertical roster target moves the slot back to its origin, animates the clone home, and persists nothing.
- Every terminal path removes pointer/key/blur listeners, pointer capture, animations, transient classes, ghost layers, and auto-scroll state.
- The moved card's handle regains focus after a committed rerender. Cancel leaves ordering unchanged.

## Accessibility And Motion

- Dedicated handles retain their accessible `Reorder <name>` names and keyboard focus treatment.
- Existing Arrow-key ordering within and across categories remains equivalent and presentation-only.
- `prefers-reduced-motion: reduce` retains the ghost and exact slot but makes list displacement and docking effectively immediate.
- Category dragging retains its current shared behavior and is not restyled as a People-card drag.

## Component Boundary

- `src/ui/expanded-interface-reorder.js` owns reusable pointer lifecycle, vertical locking, live-slot movement, FLIP displacement, docking, cancellation, and cleanup behind opt-in options.
- `src/ui/people-journal.js` opts only person records into the new behavior and supplies the whole mobile record as the touch/pen activation surface.
- `styles/directive.css` owns People-specific slot, lifted-card, docking, and reduced-motion presentation.
- `docs/design/mockups/directive-expanded-interface.html` and `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md` are updated so the certified reference no longer describes the superseded no-reflow behavior.

## Verification

- The real desktop fixture must show one exact-height People drop slot, a detached ghost whose `x` coordinate remains fixed, and displaced rows before pointer-up.
- Pointer-up must expose a docking phase and then persist the correct cross-category order once.
- A real mobile fixture must arm from the card body, remain unlifted before `175ms`, lift after the delay, and keep quick tap/scroll cancellation intact.
- Pointer cancellation and Escape must restore the original order and remove every transient drag artifact.
- Reduced-motion emulation must retain a visible slot while removing meaningful animation duration.
- The focused People interaction test, certified authority checks, visual conformance suite, and complete 95-check alpha gate must pass.
