# Layered Animated Campaign and Ship Hero Scenes

## Goal

Replace the Breckenridge's static Campaign and Ship hero image with a subtle three-layer animated scene while eliminating hover-driven layout movement. The banner remains compact by default, expands or collapses only when intentionally clicked, and animates continuously in both states.

## Scope

The layered scene appears anywhere the Campaign route renders the selected package's large hero and on the Ship route's large hero. Campaign list thumbnails and other small package images remain static. Packages without a complete layered scene continue to use their existing static hero image.

This is presentation-only. It does not change campaign state, Ship authority, route scroll ownership, Campaign Library facts, or global Directive shortcuts.

## Supplied layers

The Breckenridge scene uses three aligned `1672x941` sources:

1. `Breckenridge_ship.png` as the transparent foreground.
2. `Breckenridge_stars.png` as the transparent emissive middle layer.
3. `Breckenridge_bg.png` as the opaque background.

Production derivatives live with the existing package-owned Breckenridge imagery. They use WebP to reduce shipped size while preserving alpha on Ship and Stars. The existing static `uss-breckenridge.hero.webp` remains available as the fallback.

The `ship.hero` package image record gains an explicit `layers` object with `background`, `stars`, and `foreground` paths. A dedicated resolver accepts the scene only when the exact package image record and all three paths are present; it never substitutes another subject or variant for a missing layer.

## Scene composition

The DOM layer order from bottom to top is:

1. Background image.
2. Stars image.
3. Ship image.
4. Existing readability gradient.
5. Existing Campaign or Ship identity copy.
6. Full-banner toggle control.

All three images share the same inset, sizing, focal point, and `object-fit: cover`, so their authored alignment survives responsive cropping. The new sources have no baked-in side border, removing the dark bars visible in the prior square composite.

Only one accessible description is exposed for the composed scene. Individual visual layers are decorative and do not produce repeated screen-reader announcements.

## Motion

Motion runs continuously while the banner is compact and expanded. Changing height does not restart an animation.

- Background remains static. A tiny fixed overscan prevents subpixel seams at the hero edge.
- Ship follows a roughly 40-second alternating transform: less than one percent translation, approximately one-half percent scale variation, and no more than `0.2deg` total rotation. It should read as slow drift rather than bobbing.
- Stars use `mix-blend-mode: plus-lighter` in the bundled Chromium runtime, with `screen` as the declared fallback. A stable base layer preserves the field while a very low-opacity duplicate varies brightness and opacity through irregular, slow keyframes. The effect is noise-like shimmer, not rhythmic flashing.
- Mobile/coarse-pointer amplitudes are reduced by approximately half.
- Under `prefers-reduced-motion: reduce`, all scene animations stop at their neutral frame while the layered composition remains visible.

No JavaScript animation loop, canvas, WebGL, random timer, or video is introduced. CSS transforms, opacity, and filters keep the work composited and bounded.

## Interaction

Campaign and Ship use the same click-only behavior on every input type:

- Each route render starts compact.
- Clicking anywhere inside the banner toggles expanded/collapsed state.
- Clicking outside the banner does nothing.
- Hover never changes banner geometry.
- There is no pinned mode beyond the current rendered route instance.
- Leaving and returning to the route creates a fresh compact banner.
- No `Escape` handler is registered.
- The full-banner control is a native button, so Enter and Space work automatically and `aria-expanded` remains accurate.

The existing shared heights remain unchanged: `140px` compact and `280px` expanded above `640px`; `112px` compact and `220px` expanded at `640px` and below.

Because hover no longer changes height, approaching Continue from above cannot move it. Continue moves only after an intentional click on the banner itself.

## Fallback and failure behavior

- A complete layer set renders the animated scene.
- An absent or incomplete layer set renders the existing static package hero.
- A failed individual network decode leaves the background color and remaining loaded layers bounded inside the hero; it does not remove Campaign or Ship identity copy or controls.
- Coming-later Campaign presentation retains its existing grayscale/dim treatment across all scene layers.

## Verification

Automated coverage will prove:

- The Breckenridge package exposes three exact package-owned layer paths and each derivative exists.
- The scene resolver rejects incomplete and subject-fallback layer sets.
- Campaign and Ship render layers in Background, Stars, Ship order.
- Static packages keep the existing single-image fallback.
- Both heroes begin compact and toggle only on click/keyboard activation.
- Hover leaves hero height and the Continue button position unchanged.
- A click outside an expanded hero does not collapse it.
- Route re-entry starts compact.
- Compact and expanded Campaign/Ship heights still match at desktop and mobile widths.
- Stars compute an additive blend mode in Chromium.
- Ship and Stars animations are active in both sizes, use reduced mobile amplitudes, and stop under reduced motion.
- Campaign facts remain below the hero and Ship retains its internal scroll owner.
- Browser screenshots at desktop and mobile widths show aligned layers without dark side bars or horizontal overflow.
