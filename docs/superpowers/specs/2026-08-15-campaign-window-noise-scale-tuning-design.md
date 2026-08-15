# Campaign Window Noise Scale Tuning Design

## Goal

Slow the existing continuous ship-window modulation to a 15-second cycle and make the procedural noise features 25% smaller without changing the window artwork, contrast, blend, ship composition, or other animations.

## Design

- Keep the existing single window image layer at `opacity: .96` with `screen` blending.
- Reduce the repeating mask tile from `256px 256px` to `192px 192px`, which is exactly 75% of the current dimensions and therefore produces noise features that read 25% smaller.
- Move the mask exactly one tile per loop, changing the keyframe endpoint from `-256px -256px` to `-192px -192px`. This preserves a seamless repeat.
- Change the continuous linear traversal from `10s` to `15s`.
- Preserve the quarter-cycle starting phase by changing the negative delay from `-2.5s` to `-3.75s`.

## Constraints

- Do not alter the noise texture or its high-contrast alpha distribution.
- Do not alter the ship image, window image, nacelle treatment, drift, orbit, geometry, composition, or scale.
- Preserve the reduced-motion treatment, which freezes the window mask at `0 0`.
- Extend the existing visual-conformance assertions so the exact duration, delay, tile size, and seamless keyframe travel are regression-protected.

## Verification

- Demonstrate RED by changing the conformance expectations before production CSS.
- Demonstrate GREEN with the focused expanded-interface visual-conformance test.
- Run the complete Directive test gate.
- Verify the installed SillyTavern copy and inspect the live computed animation values at production size.
