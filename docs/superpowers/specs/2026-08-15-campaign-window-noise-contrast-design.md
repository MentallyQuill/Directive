# Campaign Window Noise Contrast Design

## Goal

Make individual Breckenridge windows visibly brighten and dim in the complete Campaign composition while retaining continuous, organic procedural motion.

## Approved treatment

- Keep the existing single window cutout layer and `screen` blend at `.96` opacity.
- Keep continuous linear mask travel. Do not use stepped timing, an animated image, a second window layer, or a shared opacity pulse.
- Shorten the mask traversal from 18 seconds to 10 seconds.
- Preserve the existing quarter-cycle starting phase by changing the delay from `-4.5s` to `-2.5s`.
- Rebuild the 256×256 lossless WebP from the original pre-calibration noise source so repeated remapping does not introduce quantization.
- Increase contrast by percentile: map the darkest 35% of source alpha samples to 0, the brightest 35% to 255, and remap the middle 30% through a smoothstep curve. This creates decisive dark and bright fields with feathered transitions rather than hard digital edges.
- Preserve the existing noise pattern, RGB channels, tile size, repeat behavior, and diagonal travel direction.
- Preserve the base ship, nacelle pulse, ship drift, 3D card movement, composition, scale, and all non-window layers.
- Preserve reduced-motion behavior: the window layer remains visible but its mask does not travel.

## Artistic result

The mask should read like irregular pockets of occupied and unoccupied rooms moving through the existing window cutout. Individual windows should cross between noticeably brighter and quieter states without a ship-wide brightness pulse. The overall ship may remain tonally stable; the intended motion is local to individual windows and small window banks.

## Verification

- Establish a focused RED test for the current 18-second timing and current mask digest/distribution.
- Decode the production WebP in Chromium and verify 256×256 dimensions, 0–255 alpha extrema, the expected digest, and the intended strongly bimodal alpha distribution.
- Verify the live computed window layer uses `.96` opacity, `screen` blending, a 10-second linear animation, and a `-2.5s` delay.
- Verify reduced motion still freezes mask travel.
- Capture the complete Campaign composition in the actual SillyTavern host at production display size. Do not use an isolated enlarged GIF as perceptibility proof.
- Confirm over a 6–10-second observation that multiple individual windows or small window banks visibly change brightness while the base ship, nacelles, drift, orbit, scale, and alignment remain unchanged.
- Run the complete Directive test gate before integration.
