# Mobile Hero Orbit Alignment

## Goal

Make touch-driven layered heroes read like the desktop camera orbit: the environment carries the visible parallax while the ship remains visually anchored and never receives reactive roll.

This is a presentation-only correction everywhere a complete layered hero appears. It does not change the idle cruise, gesture custody, touch sensitivity, reduced-motion behavior, artwork, Campaign data, saves, or runtime authority.

## Root cause

The controller deliberately gives `response: 'touch'` a different foreground profile from precise input. At a 390x220 hero, full touch input moves the ship `9.75px / 7.7px` and rolls it `0.65deg`. The same size under the desktop formula would move only `0.5px / 0.25px` with `0deg` roll.

The mobile environment already has the stronger response needed to make finger input obvious: the authored background moves `3px / 1.98px`, far stars move `12px / 11px`, and near stars move `25.35px / 19.8px`. The foreground-specific touch multiplier is therefore the source of the card-like motion and unwanted rotation.

## Approaches considered

1. **Use the complete precise profile on touch.** This exactly shares desktop behavior, but it would shrink the mobile environment back to roughly `1.5px`, `3px`, and `5px` horizontally and recreate the earlier “barely working” feedback.
2. **Keep the current touch profile and remove only roll.** This removes the visibly strange rotation but leaves the ship moving almost ten pixels, so the composition still reads as foreground translation.
3. **Keep strong touch parallax and share the desktop ship formula.** Preserve the current touch background, far-star, and near-star values, but calculate touch ship displacement with the precise ship formula and force reactive roll to zero. This is the chosen approach because it retains obvious mobile response while aligning the layer balance to desktop.

## Response contract

`computeHeroOrbitFrame` keeps the existing `precise` and `touch` response names. The touch response continues to use its current background and repeating-star amplitudes and its current 22% horizontal / 28% vertical drag saturation distances.

Both response profiles use the same anchored ship formula:

- horizontal: `clamp(width * 0.0015, 1px, 2px) * 0.5`;
- vertical: `clamp(height * 0.002, 0.5px, 1px) * 0.5`;
- reactive roll: exactly `0deg`.

At a 390x220 hero, full lower-right touch input becomes:

- authored background: `-3px / -1.98px`;
- far stars: `-12px / -11px`;
- near stars: `-25.35px / -19.8px`;
- ship: `0.5px / 0.25px`, `0deg` roll.

At a 1440x500 desktop hero, the existing full precise frame remains unchanged: background `-3.5px / -2.25px`, far stars `-6px / -4px`, near stars `-10px / -6px`, and ship `1px / 0.5px` with `0deg` roll.

## Interaction and composition boundaries

- A one-finger drag still engages after the existing 6px threshold and immediately owns the gesture.
- Mobile remains intentionally more sensitive than mouse input and keeps its stronger environmental parallax.
- Touch keeps the current 90ms engaged transition so the environment follows the finger without desktop-style lag.
- Mouse keeps the current 360ms engaged easing; pen keeps the precise response.
- Release, cancellation, multi-touch cancellation, compatibility-click suppression, and listener lifetime remain unchanged.
- Idle ship drift may retain its authored subtle rotation. Only input-driven `--directive-hero-orbit-ship-roll` is fixed at zero.
- Layer order, crop bleed, brightness scrim, star cruise, sunlight pulse, copy, actions, and static hero behavior remain unchanged.

## Verification

Controller coverage must fail against the old touch foreground profile and then prove the exact 390x220 values above. The touch binding test must prove a saturating edgeward drag writes `0.5px / 0.25px / 0deg` for the ship while preserving the strong far/near values.

Existing precise-frame, drag custody, scrolling, click suppression, reduced-motion, and neutral-release assertions must remain green. Visual conformance must confirm the complete phone hero still has no overflow or clipped layer edges. The full repository gate and an installed live mobile interaction check must pass before publication.
