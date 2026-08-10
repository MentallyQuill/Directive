# Runtime Overlay Body Host Design

## Goal

Keep the complete Directive shell inside the visual viewport in SillyTavern, including its top edge, at every supported desktop and mobile size.

## Root Cause

Directive currently configures its general overlay root to prefer SillyTavern's `#sheld` element. `#sheld` begins below SillyTavern's top bar and establishes an overflow-clipping boundary. The Directive runtime overlay is viewport-fixed, but because it is a descendant of `#sheld`, the portion above that host boundary is clipped. The creator-assist modal does not exhibit this problem because its modal root is appended directly to `document.body`.

## Design

The shared Directive overlay root will prefer `document.body`, then `document.documentElement`, and use `#sheld` or the chat parent only as last-resort fallbacks for incomplete test or host documents. SillyTavern bootstrap will configure only the active document and will no longer override the host resolver to select `#sheld`.

The shell's existing size, centering, backdrop, route layout, and mobile rules remain unchanged. This fixes the containing and clipping boundary rather than compensating with route-specific top padding or offsets.

## Alternatives Rejected

- Adding a top offset to the shell would depend on SillyTavern's current top-bar height and remain vulnerable to zoom, mobile safe areas, and host theme changes.
- Moving only the runtime panel to the modal root would duplicate portal ownership and split general Directive overlays across two roots without need.

## Verification

The runtime overlay host regression will construct a document containing `#sheld` and assert that the overlay root and runtime overlay still mount directly under `document.body`. Existing shell, focus, modal, and browser layout checks must continue to pass, followed by the complete alpha gate.
