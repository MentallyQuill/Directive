# Campaign Ship Emissive Layers Design

## Goal

Add package-authored nacelle and window illumination to the Breckenridge Campaign hero without changing the ship's approved position, scale, composition, drift, or hover-orbit amplitudes.

## Composition

The foreground ship and its emissive overlays form one transformed ship-card group. The existing foreground image is the base. The supplied window cutout is one Screen-blended image whose visibility is modulated by a slow deterministic soft-noise mask. The supplied nacelle cutout is one Screen-blended image with a shallow 0.5 Hz opacity/brightness pulse. The existing sunlight remains above the ship group.

All three ship images use the same 1672 by 941 source canvas and therefore require no independent positioning. Transform, drift, scale, pitch, and yaw belong only to the group container.

## Package Contract

`ship.hero.layers.emissive` is optional and all-or-nothing. It contains `windows`, `nacelles`, and `windowNoise`. If any path is missing, the resolver omits emissive behavior and renders the existing foreground scene unchanged.

## Motion

- Nacelles pulse on a two-second ease-in-out loop with restrained opacity and brightness changes.
- A seamless authored alpha-noise texture moves exactly one tile over an 18-second deterministic loop and masks the single window overlay.
- No runtime randomness, particles, canvas, video, or WebGL are introduced.
- Reduced-motion mode stops both effects at readable static values.

## Verification

Resolver and renderer tests prove the optional all-or-nothing contract and grouped DOM. Playwright proves exact layer registration, Screen blending, animation timing, hover-orbit preservation, reduced-motion behavior, image loading, and desktop/mobile geometry without overflow.
