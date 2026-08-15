# Campaign Ship Window Calibration Design

## Goal

Make the Breckenridge Campaign hero windows deliberately easy to see for a live calibration pass. This is an intentional overshoot that the user will evaluate in the installed experience before choosing the final strength.

## Treatment

Keep the existing single window cutout, Screen blend mode, exact ship-card registration, and 18-second deterministic noise movement. Do not add duplicate window layers, blur, bloom, shadows, color shifts, or new motion.

Raise the window overlay opacity from `0.66` to `0.96`. Regenerate the existing seamless noise texture so its alpha spans approximately 78–100% instead of 35–82%. The effective visible range therefore rises from roughly 23–54% to 75–96%, making both the steady illumination and the moving variation unmistakable.

The nacelle treatment, ship drift, card yaw and pitch, scene composition, image scale, and layer geometry remain unchanged.

## Reduced Motion

Reduced-motion mode keeps the stronger window layer static at `0.96` opacity and the authored zero mask position. It does not suppress the illumination itself.

## Verification

Update the visual contract to assert the stronger opacity while retaining the existing checks for one window layer, Screen blending, deterministic 18-second mask motion, exact overlay registration, reduced-motion cancellation, and desktop/mobile geometry. Inspect the live-strength treatment in Playwright before running the complete repository gate.
