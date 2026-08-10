# Runtime Shell Safe Insets Implementation Plan

**Goal:** Prevent browser or host scaling from pushing any Directive shell edge outside the viewport.

**Architecture:** Replace transform-based desktop centering with four-edge safe insets, bounded dimensions, and auto margins. Preserve the existing full-viewport mobile composition.

- [x] Reproduce the clipping with a 125% scaled desktop layout.
- [x] Add a browser regression that asserts all four shell edges remain visible.
- [x] Replace transform centering with 16px safe insets and auto margins.
- [x] Update static shell contract checks for the new geometry.
- [x] Run the complete alpha gate.
