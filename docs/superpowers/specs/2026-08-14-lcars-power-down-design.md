# LCARS Relay Power-Down Prelude

## Goal

Make each ambient LCARS relay event more striking by showing the selected panel lose its backlight before the existing illumination appears. The panel should read as a physical translucent control going dark, waiting briefly, and then switching on from within.

This remains presentation-only. It does not change navigation, route state, shell geometry, campaign state, persistence, prompt behavior, or package data.

## Visual states

The rail keeps its existing five illuminated face colors during normal idle operation. A selected panel passes through three material states:

1. **Powered down:** a dark, slightly desaturated version of the same hue covers the face.
2. **Illuminated:** the existing warm internal light field appears unchanged.
3. **Idle:** the panel returns to its existing flat LCARS face color.

The powered-down palette is exact:

| Rail panel | Powered-down color |
| --- | --- |
| Yellow / amber | `#5d442e` |
| Purple / lilac | `#504359` |
| Blue | `#3d4c63` |
| Purple / violet | `#504359` |
| Peach / salmon | `#633c38` |

The dark face must remain flat and matte. It has no outer glow, drop shadow, black flash, glossy streak, saturation pulse, bevel, translation, scale, or other geometry change. Route-code labels stay above both visual layers.

## Choreography

The existing illuminated event is authoritative and remains unchanged: the same 32-second cycle, per-panel start times, 160ms bright attack, approximately 1.6-second illuminated hold, approximately 480ms release, and one brief nonadjacent two-panel overlap.

Each powered-down prelude begins exactly 2.5 seconds before its existing illumination start:

- approximately 256ms to dim from the idle face into the powered-down color;
- approximately 2.24 seconds fully powered down;
- at the existing illumination start, approximately 160ms of direct crossfade from the dark face into the established warm light field.

The bright layer therefore reaches its existing peak at the same time it does now. The prelude adds anticipation without slowing, extending, or rescheduling the illuminated hold.

## CSS architecture

The existing `.directive-lcars-rail-segment` remains the base colored face. Its existing pointer-inert `::after` pseudo-element remains the illuminated layer without changes to its color, opacity, keyframes, duration, or effective start time.

A new pointer-inert `::before` pseudo-element supplies the powered-down face. It:

- covers the segment with `inset: 0` and inherits its corner geometry;
- paints the panel-specific `--directive-relay-off-color` as a flat fill;
- uses no shadow or filter;
- animates only opacity;
- shares the 32-second cycle;
- starts 2.5 seconds before that panel's existing light delay;
- fades away while the illuminated `::after` attacks;
- remains below the route-code text in the existing isolated stacking context.

The per-panel delay becomes a shared custom property consumed by both pseudo-elements. No JavaScript timer, runtime randomness, event listener, new DOM node, image, canvas, or persistent state is added.

## Responsive behavior

Desktop and mobile use the same powered-down colors and prelude timing. The existing mobile-only illumination strength remains unchanged. Rail dimensions, gaps, labels, corner radii, safe-area behavior, route controls, and the rest of the responsive shell remain unchanged.

## Reduced motion and accessibility

Under `prefers-reduced-motion: reduce`, both pseudo-element animations are disabled and both overlays remain transparent. The existing flat rail stays visible.

Both layers are decorative, pointer-inert, absent from the accessibility tree, and unable to affect focus, hit targets, semantics, or announcements.

## Performance and containment

Only opacity is animated on five bounded pseudo-element layers. Both dark and illuminated fields remain clipped by the existing segment overflow and never paint outside the rail. The change causes no layout, scrolling, or runtime JavaScript work.

## Verification

Rendered browser tests must prove:

- all five exact powered-down colors appear on the corresponding panels;
- every dark layer is flat, inset, pointer-inert, filter-free, and clipped;
- each panel has one 32-second dark animation and one existing 32-second light animation;
- every dark start precedes its corresponding light start by exactly 2.5 seconds;
- the dark keyframes provide the approved dim, hold, and crossfade phases;
- at a sampled powered-down moment the dark layer is opaque and the light layer is transparent;
- at the existing illuminated peak the dark layer is transparent and the light layer retains its current desktop and mobile strength;
- the existing illuminated keyframe offsets, start delays, hold, pair overlap, and maximum of two lit panels do not change;
- reduced motion disables and clears both layers.

Natural-time browser verification at 390x844 must capture the installed UI passing from idle to the dark face and then into the bright face. The panel must be noticeably non-illuminated for a few seconds, the transition must still feel like a physical backlit prop, labels must remain recognizable, and neither state may create an outer halo or browser error.
