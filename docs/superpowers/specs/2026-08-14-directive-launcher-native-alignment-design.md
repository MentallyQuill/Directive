# Directive Launcher Native Alignment

## Goal

Make the Open Directive launcher in SillyTavern's message composer read as a native peer of the Extensions wand: the same resting color, no button box, and a ship glyph with comparable visual height.

This is a presentation-only V1 correction. The launcher remains an accessible button, keeps its current label, tooltip, placement, click action, focus restoration, and lifecycle. No right-click menu or extension enable/disable control is included.

## Root cause

Directive creates a semantic `button`, but SillyTavern's composer normalization and `opacity: 0.7` rule targets direct `div` children of `#leftSendForm`. Directive also assigns the generic `menu_button` class, which adds a tinted background, border, rounded corners, grayscale filter, and full opacity.

At a live 390x844 viewport, the native wand is a transparent, borderless 34.5px control at `opacity: 0.7` with a 28.5px icon. The Directive launcher is a 34px control at `opacity: 1` with an opaque background, border, grayscale filter, and a 28.5px mask whose artwork occupies only about 78% of its vertical view box.

## Approaches considered

1. **Change the launcher to a native-style `div`.** SillyTavern's existing selectors would style it automatically, but Directive would give up native button semantics and keyboard behavior.
2. **Change or crop the shared ship SVG.** This could enlarge the visible silhouette everywhere, but it would alter route and Ship surfaces outside the reported composer control.
3. **Keep the button and apply a launcher-scoped native-composer reset.** Remove `menu_button`, explicitly mirror the wand's composer geometry and states, and enlarge only the launcher glyph. This is the chosen approach because it fixes the mismatch at its integration boundary without weakening semantics or changing shared artwork.

## Visual and interaction contract

The launcher remains a `button[type="button"]` with `interactable` and `directive-launcher-button` classes. It no longer receives `menu_button`.

Launcher-scoped CSS will:

- use `var(--bottomFormBlockSize)` for the control width, height, and fixed flex basis;
- remove native and generic button appearance, background, border, radius, shadow, margin, and extra padding;
- inherit the composer foreground and font context;
- use `opacity: 0.7` at rest, matching the wand;
- use `opacity: 1` and `brightness(1.2)` on hover, matching the wand;
- retain SillyTavern's existing `interactable:focus-visible` outline;
- preserve the existing pointer cursor, order immediately after the wand, and centered layout;
- size the launcher-only ship mask to `calc(var(--bottomFormIconSize) * 1.25)` so it scales with SillyTavern and its visible artwork is approximately the wand's height (35.625px and about 28px of visible artwork under the measured 28.5px host icon setting).

The glyph continues to use `currentColor`; no hard-coded white or theme color is introduced. Click, keyboard activation, tooltip behavior, runtime opening, and focus return are unchanged.

## Scope boundaries

- Do not add context-menu, right-click, long-press, or extension-toggle behavior.
- Do not change SillyTavern source files or depend on a new host API.
- Do not modify the shared `route-ship.svg` asset or other Directive icons.
- Do not alter composer layout, textarea width policy, send controls, runtime state, saves, or gameplay behavior.
- Preserve unrelated working-tree changes and live SillyTavern data.

## Verification

A launcher regression test must fail against the current `menu_button` class and then prove the semantic button, accessibility attributes, unchanged click/focus behavior, and the launcher-specific visual contract.

Focused tests must pass before the full repository gate. The installed extension must then be checked at a real 390x844 viewport: computed styles must show a transparent background, no border, no grayscale filter, inherited foreground, `opacity: 0.7`, host-sized control geometry, and a 1.25x launcher mask. A screenshot must confirm the box is absent and the ship's perceived size and resting brightness align with the wand without clipping or disturbing the composer.
