# Mobile Reactive Hero Orbit Intensity

## Goal

Make deliberate finger-drag orbit input on complete layered Campaign heroes visually unmistakable without changing desktop hover, the idle cruise, normal pre-hold scrolling, or reduced-motion behavior.

The current touch gesture reaches the same restrained maximum frame as desktop hover. Changing only the touch sensitivity would make that maximum arrive sooner but would not address the reported edge-drag result: even at full input, the scene barely moves. Mobile therefore needs its own bounded response profile.

## Approaches considered

1. **Increase sensitivity only.** Reduce the drag distance needed to reach the existing maximum. This improves short drags but leaves a center-to-edge drag just as subtle, so it does not solve the observed problem.
2. **Increase the shared orbit frame.** Raise all existing amplitudes. This is simple but changes untested desktop hover behavior and risks making mouse movement noisy.
3. **Use a mobile touch profile.** Keep the precise-pointer frame unchanged, but give an engaged touch sequence larger repeating-star and ship amplitudes plus earlier saturation. This directly addresses the mobile report while retaining the approved desktop treatment. This is the chosen approach.

## Response model

`computeHeroOrbitFrame` accepts a response profile. Its default remains the exact existing precise-pointer profile, preserving every desktop value and caller that omits the profile.

The `touch` profile uses the same normalized direction and inverse-orbit ordering, with these maximum amplitudes:

- authored background, authored stars, and sunlight: unchanged precise-profile values, including the 0.9% vertical crop-safety bound;
- distant repeating stars: horizontal `clamp(width * 0.030, 12px, 24px)` and vertical `clamp(height * 0.050, 10px, 20px)`;
- near repeating stars: horizontal `clamp(width * 0.065, 22px, 42px)` and vertical `clamp(height * 0.090, 18px, 34px)`;
- ship: horizontal `clamp(width * 0.025, 8px, 16px)`, vertical `clamp(height * 0.035, 7px, 14px)`, and horizontal-input roll up to `0.65deg`.

At a 390x220 Campaign Library cover, full lower-right touch input produces distant stars at `-12px/-11px`, near stars at `-25.35px/-19.8px`, and the ship at `9.75px/7.7px` with `0.65deg` roll. The current frame at that size is approximately `-6px/-4.4px`, `-10px/-6.6px`, and `3px/2.64px` with `0.22deg` roll. This makes depth separation roughly two to three times stronger while leaving the authored image group crop-safe.

Touch reaches the bounded maximum after displacement equal to 22% of hero width horizontally or 28% of hero height vertically, reduced from 30% and 40%. The mapping remains clamped and eased rather than one-to-one, so dragging toward a screen edge is forceful but cannot accumulate unbounded motion.

Pen and mouse retain the precise profile. Only an engaged single-touch sequence uses the stronger frame and shorter saturation distances.

## Interaction and presentation boundaries

- The 240ms hold delay and 10px pre-engagement tolerance do not change.
- Movement before engagement remains available to native scrolling.
- Movement after engagement remains owned by the orbit gesture and prevents native scrolling.
- Release returns all transient values to neutral using the existing easing.
- The far/near cruise, ship drift, and sunlight pulse continue without restart or phase change.
- Campaign Browser covers remain always open and non-interactive.
- `prefers-reduced-motion: reduce` remains completely inert.
- No new class, global listener, dependency, saved state, artwork, scale effect, or device-orientation input is introduced.

## Verification

Automated controller tests will prove the default frame is byte-for-byte unchanged and a 390x220 touch frame produces the exact stronger values above. A real trusted-touch browser proof will move the phone hero far enough to saturate the new profile and assert substantial minimum star, ship, and roll values while retaining native pre-hold scrolling, post-hold custody, compatibility-click suppression, neutral release, no overflow, and continuous idle animation names.

The phone orbit screenshot will be regenerated and inspected for readable copy, intact crop coverage, restrained roll, and a clear camera-depth reaction. The complete repository gate must pass before integration.
