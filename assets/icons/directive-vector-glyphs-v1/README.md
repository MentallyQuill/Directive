# Directive Vector Glyphs v1

Original LCARS-inspired vector glyphs for Directive's five V1 routes and composer launcher.

## Contents

- Five route glyphs: Campaign, Mission, People, Ship, and Settings.
- Individual SVG files rendered through the runtime mask pipeline.
- `preview.png`, retained as a static visual reference.

## Intended rendering

The geometry is optimized for 18-32 px display sizes after CSS mask scaling. Use
the glyph itself as a monochrome silhouette in runtime chrome and let the
surrounding LCARS route block or drawer control supply color, hover, selected,
and disabled states.

Recommended sizes:

- Route glyph: 20-26 px.
- Composer launcher glyph: 18-22 px.

## CSS-mask example

```html
<span class="directive-vector-glyph" data-glyph="route-mission" aria-hidden="true"></span>
```

The mask method preserves `currentColor` across route controls, the launcher, hover states, and disabled states.

## Design constraints

- No official Starfleet delta, communicator badge, registry mark, or copied LCARS graphic.
- No text or micro-detail inside the icon.
- One dominant silhouette with restrained telemetry details.
- Shared square icon canvas and rounded terminal geometry.
- Clear silhouettes at compact touch-control sizes.
