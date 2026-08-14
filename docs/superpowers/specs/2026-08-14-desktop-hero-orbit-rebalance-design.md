# Desktop Reactive Hero Orbit Rebalance

## Goal

Keep the layered hero's desktop mouse response, but make it read as camera depth rather than a foreground ship card sliding and rotating over a background. The ship must remain visually anchored while the environment supplies the orbit cue.

This is a presentation-only correction everywhere a complete layered hero appears. It does not change the idle cruise, touch response, gesture custody, Campaign data, saves, or runtime authority.

## Approaches considered

1. **Remove desktop reactivity.** This eliminates the bad foreground motion but also removes the approved mouse response.
2. **Increase background travel.** This improves relative depth but risks exposing authored image edges and makes the whole scene more restless.
3. **Anchor the desktop ship and retain environmental parallax.** Keep the current crop-safe background and star amplitudes, reduce precise-pointer ship travel to a 1-2px positional breath, and remove precise-pointer roll. This is the chosen approach because it fixes the offending layer without destabilizing the successful environment or touch profiles.

## Response model

The existing `precise` response remains the desktop mouse and pen profile. At full normalized input:

- authored background, authored stars, and sunlight retain X `clamp(width * 0.006, 3px, 7px)` and the existing crop-safe Y bound;
- distant repeating stars retain X `clamp(width * 0.010, 6px, 12px)` and Y `clamp(height * 0.020, 4px, 8px)`;
- near repeating stars retain X `clamp(width * 0.018, 10px, 20px)` and Y `clamp(height * 0.030, 6px, 12px)`;
- the ship changes to X `clamp(width * 0.0015, 1px, 2px)`, Y `clamp(height * 0.002, 0.5px, 1px)`, and exactly `0deg` reactive roll.

At the certified 1440x500 desktop hero this changes the ship from `8px/5px` with `0.22deg` roll to `2px/1px` with no roll. The background remains `-7px/-4.5px`, distant stars `-12px/-8px`, and near stars `-20px/-12px`. The ship still moves slightly with pointer input, but the environment now carries nearly all visible depth.

The `touch` profile remains byte-for-byte unchanged, including its stronger ship displacement and `0.65deg` roll. This correction responds specifically to desktop feedback without weakening mobile intensity.

## Composition and interaction boundaries

- Existing far/near star cruise, ship drift, and sunlight pulse continue without restart or retiming.
- Only transient reactive variables change; Campaign copy and actions remain fixed.
- Mouse hover, pen hold, neutral release, reduced-motion behavior, and frame coalescing remain unchanged.
- No crop, layer order, CSS transition, listener, gesture threshold, artwork, dependency, or persistent state changes.
- Static and incomplete layered heroes remain unbound exactly as before.

## Verification

Controller tests will use literal full-input values to prove the desktop ship is capped at `2px/1px` with `0deg` roll and that the touch frame remains unchanged. Trusted desktop browser coverage will assert that the environment keeps its inverse depth ordering, the ship remains within the new positional bounds, and reactive roll is zero while idle animations, geometry, coverage, and neutral release remain intact.

The desktop orbit screenshot will be regenerated and visually inspected for an anchored ship, readable depth, continuous idle motion, intact edges, and fixed copy/actions. The full repository gate must pass before integration.
