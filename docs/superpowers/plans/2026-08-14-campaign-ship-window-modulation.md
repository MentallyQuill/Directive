# Campaign Ship Window Modulation Implementation Plan

1. Compute the expected decoded-pixel digest by reading the original window-noise asset from commit `973e939ec` and linearly remapping alpha 88–210 to 0–255.
2. Update the visual conformance expectation to require alpha 0–255 and the new digest; run it against the current asset to establish a focused RED failure.
3. Rebuild the production lossless WebP from the original asset using the approved remap, then rerun the focused conformance test to GREEN.
4. Run the adjacent package-hero and orbit tests, capture the animation in Chromium, and quantify the resulting window-brightness range.
5. Run the full test suite and diff checks, review the scoped diff, commit only the mask, test, and design documents, then push and verify `main` at the exact commit.
