# Reactive Hero Input Correction

## Goal

Make the layered hero respond to a natural mobile touch-and-drag, reduce the complete desktop reactive frame to half its current motion, and remove the aggressive desktop entry snap by easing mouse response at one quarter of the current rate.

The idle cruise remains the hero's neutral state. This change applies everywhere the complete layered hero appears and remains presentation-only.

## Root causes

Mobile currently requires a finger to stay within 10px for 240ms before it can engage. A normal drag crosses 10px before the timer fires, so the controller cancels its touch state and removes the move listener. The stronger mobile frame therefore exists but is unreachable through the natural gesture the player uses.

Desktop currently moves the environment at its original amplitudes and changes active transition duration from 420ms to 90ms on the first pointer sample. Entering the hero near an edge applies most of the frame in 90ms, which reads as a snap even after the ship itself was anchored.

## Approaches considered

### Mobile

1. Keep the hold and enlarge its movement tolerance. This remains timing-dependent and still fails a normal immediate drag.
2. Use device orientation. This adds permissions, calibration, and persistent noise without fixing touch ownership.
3. Engage after drag intent. Track one touch immediately and claim it after 6px of movement. This is the chosen approach because it directly matches the requested gesture.

### Desktop

1. Halve only the ship again. The environment would still move too much and the 90ms entry snap would remain.
2. Add a JavaScript animation loop. This duplicates native transition interpolation and adds idle/runtime complexity.
3. Halve the complete precise frame and slow mouse transitions to 360ms. This is the chosen approach because it preserves the existing frame function and CSS composition while matching the requested half motion and 25% rate.

## Mobile interaction contract

A single `touchstart` begins a pending drag with no timer. Movement under 6px remains unclaimed so a tap and small finger wobble keep their normal behavior. Once displacement reaches 6px:

- the hero engages immediately;
- the original touch point remains the orbit origin;
- the same move is prevented and rendered, so no input sample is lost;
- subsequent moves remain owned by the orbit until release or cancellation;
- release returns to idle and suppresses the resulting compatibility click;
- multi-touch cancels the pending or engaged gesture;
- reduced-motion mode remains inert.

A drag beginning on the hero belongs to the orbit, including a vertical drag. Native page scrolling remains available when the gesture begins outside the hero. This explicit ownership is necessary because waiting to distinguish a scroll after substantial movement is exactly what made the interaction feel broken.

The existing strong `touch` frame and its 22%/28% saturation distances remain unchanged.

## Desktop response contract

Every `precise` response value becomes exactly half of the current post-rebalance frame. At a 1440x500 hero, full normalized input becomes:

- background: `-3.5px / -2.25px`;
- distant stars: `-6px / -4px`;
- near stars: `-10px / -6px`;
- ship: `1px / 0.5px`;
- ship roll: `0deg`.

Touch values remain unchanged.

Mouse input receives a dedicated transient class while engaged. Its layer transition duration is 360ms with the existing ease-out curve, four times the current 90ms duration. Touch and pen keep the current 90ms engaged response. Leaving or cancelling the mouse removes the mouse class and uses the existing 420ms neutral return.

## Boundaries

- Do not change idle star travel, ship drift, sunlight pulse, layer order, crop bleed, or authored artwork.
- Do not add global listeners, device-orientation access, persistence, dependencies, or a JavaScript animation loop.
- Do not change Campaign copy, controls, package data, saves, prompts, or runtime authority.
- Keep one non-passive touchmove listener only for the active single-touch sequence.
- Keep keyboard activation and ordinary taps unsuppressed.

## Verification

Controller tests will prove a natural immediate 6px-plus drag engages and renders on its first move, sub-threshold wobble remains unclaimed, touch release resets and suppresses only its compatibility click, the precise frame is exactly halved, and mouse state owns a dedicated easing class.

Trusted browser input will remove the artificial 260ms wait from the phone proof, assert the first immediate move is trusted and engaged, verify mobile strength and touch custody, and confirm release neutrality. Desktop browser coverage will assert the exact half-depth bounds and 360ms mouse transition while touch retains 90ms. The full repository gate and live installed mobile/desktop paths must pass before publication.
