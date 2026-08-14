# Seamless Parallax Hero Cruise

## Goal

Make the package-authored Campaign and Ship hero scenes read as a starship cruising steadily forward. Preserve the Breckenridge artwork and its restrained tone while replacing reversible star drift with continuous, seamless parallax. Increase mobile ship motion to the desktop magnitude without changing its frequency.

This is presentation-only. It does not change campaign, mission, Ship, save, prompt, or package authority.

## Scope

The enhanced treatment applies wherever a complete package-authored layered `ship.hero` scene is rendered, currently the active Campaign hero and Ship hero. Packages without the complete optional cruise-effect assets retain the existing layered or static fallback.

The enhancement adds no particles, dust, streaks, canvas, video, runtime randomness, or JavaScript animation loop.

## Scene composition

The Breckenridge scene renders in this order:

1. Static opaque nebula background.
2. Existing transparent authored Stars layer, held static as atmospheric highlight artwork.
3. Fine distant-star seamless tile.
4. Brighter near-star seamless tile.
5. Transparent ship foreground.
6. Transparent sunlight pass aligned to the painted sun.
7. Existing readability gradient.
8. Existing Campaign or Ship identity copy.

The two moving star layers contain only point-shaped stars. They have no sun, nebula, dust, or streaks. Their opacity and visual scale remain constant during motion. The distant field contains many fine, low-contrast stars and moves slowly. The near field contains fewer, slightly larger and brighter stars and moves approximately twice as fast.

The existing authored Stars image remains static because its large nebular highlights and sun are composition-specific and cannot tile without visible repetition.

## Package contract and fallback

The existing exact `ship.hero` image record continues to own `background`, `stars`, and `foreground`. It gains one optional, all-or-nothing `cruise` object with package-owned paths for:

- `farStars`
- `nearStars`
- `sunlight`

The scene resolver exposes cruise effects only when all three paths are non-empty on the exact requested image record. An incomplete `cruise` object is ignored as a unit. The complete base layer set still renders normally, and static package-image fallback behavior remains unchanged.

This keeps failure local: a package can omit the enhancement without changing its hero, and a missing optional field cannot produce a near-only starfield or misaligned light treatment.

## Seamless star assets

Both star textures are transparent, package-owned, rectangular 8:5 tiles. Their star distributions are deterministic and toroidally seamless: any mark crossing one edge is repeated at the corresponding opposite edge. The checked-in assets, not runtime code, own the distribution.

The fields use distinct distributions, point sizes, brightness ranges, and displayed tile scales. Large tile areas and unrelated cycle durations keep recognizable alignments rare. Neither field changes scale during animation.

Each field is painted as the repeating background of an oversized, clipped layer. The layer overscans the hero by at least one complete tile on every side and translates up-left by exactly one displayed tile width and height. Because the background repeats and the terminal translation is exactly one tile, the animation reset is pixel-equivalent to its starting position and produces no visible cut.

The star planes animate with compositor-friendly `transform`, `linear` timing, and infinite repetition. They do not animate `background-position`, opacity, filter, or blend mode. Initial tuning targets are:

- distant field: approximately `1344px x 840px`, one-tile travel in approximately `240s`;
- near field: approximately `960px x 600px`, one-tile travel in approximately `90s`.

Both move in the same up-left direction, opposite the ship's down-right visual heading. Final values may be adjusted within the same slow-cruise character during measured visual verification, but the near field must remain between 1.8 and 2.4 times the distant field's screen-space velocity.

## Sunlight pass

The sunlight pass is a transparent asset with the same `1672x941` source coordinate system as the authored background and ship layers. It contains a broad warm radial light treatment centered on the existing painted sun, plus a restrained directional wash extending across the ship. It contains no second sun disc and no star texture.

It uses the same `object-fit`, `object-position`, and responsive crop geometry as the authored images. This keeps the glow registered to the painted sun on desktop, compact mobile, and expanded mobile layouts; a container-positioned CSS radial gradient would not provide that guarantee under `object-fit: cover` cropping.

The light pass renders above the ship but below the readability gradient and interface copy. `screen` is the declared blend mode; `plus-lighter` may be used where supported only if visual verification shows no clipping or washout. A slow asymmetric keyframe changes only opacity/brightness within a narrow initial range of approximately `.10` to `.14`. It does not scale or move. The pulse should be barely perceptible and must not look rhythmic.

## Ship motion and mobile behavior

The ship keeps its existing `30s` alternating drift frequency and framing. Desktop translation, scale delta, and rotation remain the baseline.

The coarse/mobile override stops halving motion magnitude:

- horizontal and vertical translation use the desktop amplitude;
- rotation uses the desktop amplitude;
- the mobile-specific ship scale remains centered on its current framing value, while its scale delta doubles from the current half-amplitude to the desktop delta.

Starfield screen-space speed and sunlight pulse timing remain consistent across desktop and mobile rather than being reduced for coarse pointers.

## Reduced motion

Under `prefers-reduced-motion: reduce`:

- both repeating star layers stop at deterministic neutral offsets;
- the ship uses its existing rest transform;
- the sunlight pass holds a fixed midpoint opacity and no filter animation;
- the complete layered composition remains visible.

## Performance and containment

The implementation uses CSS transform animations on three bounded visual layers: far stars, near stars, and ship. The sunlight pass animates only restrained opacity/brightness. No per-frame JavaScript runs.

All effect layers are decorative, pointer-inert, clipped by the hero, and hidden from assistive technology. The composed hero retains one accessible description. Campaign controls, Ship scroll ownership, hero sizing, text readability, and route interaction behavior remain unchanged.

## Verification

Automated and browser coverage will prove:

- the Breckenridge package exposes the exact three cruise-effect paths and every asset exists;
- the resolver accepts only a complete cruise set on the exact requested image record and ignores partial or fallback-subject effects;
- the render order is Background, authored Stars, Far Stars, Near Stars, Ship, Sunlight;
- individual decorative layers remain hidden from assistive technology and the composed hero keeps one label;
- packages without cruise effects preserve the existing layered/static fallback;
- both star fields use repeating backgrounds, constant opacity/scale, linear transform animation, distinct tile sizes, and the required velocity relationship;
- their transform endpoints equal one complete displayed tile in both axes, establishing a pixel-equivalent loop boundary;
- the sunlight pass shares the authored image geometry, stays below readability treatment and copy, and pulses only within the restrained range;
- mobile ship translation, rotation, and scale delta are approximately double the prior mobile magnitude while frequency stays unchanged;
- reduced-motion mode stops star, ship, and sunlight animation at deterministic static states;
- desktop and phone screenshots show a restrained cruise effect with no exposed tile edge, dark bar, clipping, text washout, horizontal overflow, or obvious screensaver-like density;
- Campaign controls and Ship content geometry remain unchanged;
- the full repository gate remains green.
