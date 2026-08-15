# Campaign Ship Window Modulation Design

## Goal

Make the existing Breckenridge window overlay visibly animate while preserving the ship's current composition, scale, drift, 3D rotation, and nacelle pulse.

## Approved treatment

- Keep one window cutout layer composited over the base ship with `screen` blending.
- Keep the window layer opacity at `.96`.
- Keep the existing deterministic 18-second mask travel and phase offset.
- Expand the procedural mask from its current high floor to the full alpha range, 0–255.
- Preserve the original noise pattern and remap its original 88–210 alpha range linearly to 0–255.
- Treat zero mask alpha as removal of only the added Screen brightness; the base ship image continues to provide the underlying windows.
- Do not change the nacelle layer, ship geometry, position, scale, drift, yaw, pitch, or reduced-motion behavior.

## Verification

- The visual conformance test must decode the production WebP and prove a 256×256 mask with alpha extrema 0 and 255 and the expected pixel digest.
- Existing tests must continue to prove one window overlay, `.96` opacity, 18-second motion, and the reduced-motion resting state.
- A controlled animation capture must show a materially larger window-brightness range than the previous 1.669/255 mean-luminance range.
- Browser inspection must confirm that the ship remains aligned and that the modulation is visible without affecting other animation layers.

## Measured result

The controlled 18-frame cycle sampled the observed browser mask positions across one 18-second traversal, composited the production window cutout over the base ship with the production Screen equation at `.96` opacity, and measured Rec. 709 luminance only at nontransparent window pixels.

- Previous 199–255 mask: 1.669/255 frame-mean luminance range; 5.143 median pixel range; 3.376% of window pixels changed by more than 10 luminance points.
- Full 0–255 mask: 7.582/255 frame-mean luminance range; 23.409 median pixel range; 77.869% of window pixels changed by more than 10 luminance points.
- The full-range mask therefore produces 4.54× the previous frame-mean modulation while preserving the existing `.96` overlay opacity and 18-second timing.

Chromium inspection additionally observed the live mask moving from approximately `-125px` to `-193px` between sampled phases with `mix-blend-mode: screen`; the ship remained aligned and its base, nacelle, drift, and orbit layers were unchanged.
