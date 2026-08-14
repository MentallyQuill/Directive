# Reactive Layered Hero Orbit

## Goal

Keep the current seamless ship cruise as the layered Campaign hero's idle state and add a restrained camera-orbit illusion driven by pointer position. On touch devices, the same effect activates only after a deliberate press-and-hold and follows the subsequent finger drag.

The treatment applies everywhere Directive renders a complete package-authored layered cruise hero, including Campaign Library previews and active Campaign views. It is presentation-only and does not change package, campaign, mission, save, prompt, or Ship authority.

## Chosen motion model

The interaction simulates orbit rather than panning a flat image. The environment moves opposite the input while the ship remains comparatively anchored and shifts slightly with the input:

- the authored nebula background, authored stars, and aligned sunlight pass move together by the smallest inverse offset;
- distant repeating stars move farther in the inverse direction;
- near repeating stars move farthest in the inverse direction;
- the ship moves a small amount with the input and gains a very small input-linked roll;
- the readability gradient, Campaign identity copy, and controls remain fixed.

This opposing motion is intentionally subtle because the ship artwork has a fixed painted perspective. The effect must suggest volume without exposing the scene as separate flat layers. It adds no perspective warp, 3D mesh, pointer-linked scale, or new artwork.

## Composition with the idle cruise

The existing cruise remains authoritative idle motion:

- far and near star tiles continue their seamless up-left travel;
- the ship continues its existing slow drift;
- the sunlight continues its restrained pulse.

Reactive offsets compose additively with those animations rather than replacing, pausing, restarting, or seeking them. CSS individual `translate` and `rotate` properties carry the temporary orbit response while the existing `transform` keyframes continue uninterrupted. Releasing or leaving the hero eases only the reactive offsets back to zero, revealing the cruise at its current continuous phase.

The maximum response is derived from the rendered hero and clamped so compact phone heroes remain responsive while expanded desktop heroes do not become excessive:

- background, authored stars, and sunlight: horizontal amplitude `clamp(width * 0.006, 3px, 7px)` and vertical amplitude `min(clamp(height * 0.012, 2px, 5px), height * 0.009)`;
- distant repeating stars: horizontal amplitude `clamp(width * 0.010, 6px, 12px)` and vertical amplitude `clamp(height * 0.020, 4px, 8px)`;
- near repeating stars: horizontal amplitude `clamp(width * 0.018, 10px, 20px)` and vertical amplitude `clamp(height * 0.030, 6px, 12px)`;
- ship: horizontal amplitude `clamp(width * 0.0065, 3px, 8px)`, vertical amplitude `clamp(height * 0.012, 2px, 5px)`, and horizontal-input roll up to `0.22deg`.

Near-star response remains greater than distant-star response, which remains greater than the authored background response. Ship response stays lower than near-star response and travels in the opposing direction. The authored background group uses at most 0.9% vertical travel against its 1% layer bleed, preserving a 0.1% coverage guard at compact and expanded hero heights.

## Interaction ownership

A focused UI controller binds to the Campaign hero container and activates only when that container includes `.directive-hero-scene-has-cruise`. The controller writes transient presentation variables to that scene; it does not mutate package data or retain state across renders.

### Mouse and precise pointers

Hovering anywhere over the hero activates the response. Pointer position is normalized around the hero center and clamped independently on each axis. Moving toward an edge smoothly approaches the bounded maximum. `pointerleave`, `pointercancel`, route removal, or loss of a usable scene returns the offsets to neutral.

The controller coalesces high-frequency pointer movement through `requestAnimationFrame`. No JavaScript loop runs while the hero is idle.

### Touch and coarse pointers

A touch or pen must remain within a `10px` movement tolerance for `240ms` before Directive claims the gesture. Before that threshold, normal page scrolling and a normal tap remain available. Moving beyond the tolerance before activation cancels the pending hold.

After activation:

- the hero retains custody of the originating single-touch sequence, while pen input uses pointer capture;
- finger displacement from the activation point drives the bounded orbit response, reaching full horizontal response at 30% of hero width and full vertical response at 40% of hero height;
- subsequent movement is treated as the camera gesture rather than page scrolling;
- release or cancellation returns the scene to idle;
- the resulting synthetic click is suppressed so a long-press orbit does not also activate the cover surface or a future nested action;
- the context menu is suppressed only for an engaged orbit gesture.

A short tap remains a normal unclaimed tap; Campaign Browser covers retain their always-open static presentation. Vertical page scrolling that begins before the hold threshold remains page scrolling. Multi-touch does not activate the effect.

## Easing and state

Pointer movement should feel responsive but not mechanically locked to every noisy sample. Active input uses a `90ms ease-out` transition to retarget layer offsets. Return to idle uses `420ms cubic-bezier(.2, .8, .2, 1)` with no overshoot. The controller marks the hero as bound for diagnostics and exposes one transient engaged class; pending and neutral states add no visual class.

There is no saved orbit position. Re-rendering the Campaign panel, changing routes, or replacing the hero always begins at neutral reactive offsets while the CSS idle animation uses its normal phase.

## Accessibility and fallbacks

Under `prefers-reduced-motion: reduce`, the controller does not activate and all reactive offsets remain neutral. The existing reduced-motion static composition remains unchanged.

The interaction adds no focusable element, instruction that must be announced, or semantic content. Campaign Browser covers remain non-interactive, decorative layers remain `aria-hidden`, and the composed scene retains its single accessible label.

Packages without a complete cruise scene retain the existing layered or static fallback with no pointer listeners, gesture custody, or reactive styles. Unsupported precise-pointer APIs fail locally to the current idle presentation. Touch input uses a non-passive move listener only after a single touch begins; it calls `preventDefault` only after the hold has engaged, preserving ordinary scroll before engagement without requiring `touch-action: none`.

## Boundaries

The controller is separate from package resolution and scene rendering. The renderer continues to certify and construct visual layers; the controller only interprets input for an already-rendered cruise scene. Campaign Browser covers remain always open and static; mobile gesture arbitration prevents an engaged orbit's compatibility click from reaching the cover while leaving a fresh short tap unclaimed.

No global listeners, runtime randomness, device-orientation access, persistent settings, canvas, video, or new dependency are introduced.

## Verification

Automated and real-browser coverage will prove:

- every Campaign context containing the complete layered cruise hero receives the same orbit binding;
- legacy layered and static heroes receive no binding and preserve their fallback behavior;
- precise-pointer movement normalizes and clamps input, moves environment layers opposite the pointer, moves the ship with the pointer, and preserves the required depth ordering;
- existing star-cruise and ship-drift animation names and phases are not replaced during interaction;
- leaving or cancelling returns every reactive value to neutral;
- touch movement before the hold tolerance leaves scrolling/tapping unclaimed;
- a completed hold retains one touch sequence, finger drag changes the scene, release resets it, and the following click is suppressed;
- a short tap remains unclaimed and the always-open Campaign cover retains its fixed height;
- reduced-motion mode keeps the controller inert;
- the scene's accessible name and non-interactive Campaign cover semantics remain intact;
- desktop and phone interaction screenshots show restrained depth with no exposed layer edge, image gap, text drift, clipping, overflow, or obvious flat-card sliding;
- the full repository gate remains green.
