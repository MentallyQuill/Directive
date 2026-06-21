# Directive Vector Glyphs v1

Original LCARS-inspired vector glyphs for Directive's left command spine and single-drawer shell.

## Contents

- Six primary route glyphs: Starships, Mission, Crew, Ship, Log, Settings.
- Nine shell glyphs: collapse, expand, full screen, restore, compact shelf, expanded shelf, close, refresh, and resize.
- Individual SVG files rendered through the runtime mask pipeline. The primary
  route and drawer-state replacements are normalized to 128 x 128 output with
  their original vector `viewBox`; smaller utility glyphs remain on the original
  32 x 32 grid.
- `directive-glyphs.svg`, an external SVG symbol sprite.
- `directive-glyphs.css`, a CSS-mask utility for state-aware coloring.
- `directive-glyphs.mjs`, a small semantic registry.
- `preview.svg`, `preview.png`, and `preview.html`.

## Intended rendering

The geometry is optimized for 18-32 px display sizes after CSS mask scaling. Use
the glyph itself as a monochrome silhouette in runtime chrome and let the
surrounding LCARS route block or drawer control supply color, hover, selected,
and disabled states.

Recommended shelf sizes:

- Compact route glyph: 24 px.
- Expanded route glyph: 26 px.
- Drawer title glyph: 22-24 px.
- Shell action glyph: 18-20 px.

## Inline sprite example

```html
<svg class="directive-route-glyph" aria-hidden="true" viewBox="0 0 32 32">
  <use href="./directive-glyphs.svg#directive-route-mission"></use>
</svg>
```

## CSS-mask example

```html
<span class="directive-vector-glyph" data-glyph="route-mission" aria-hidden="true"></span>
```

The mask method is recommended for Directive because it preserves `currentColor` across the amber route blocks, black drawer controls, route titles, hover states, and disabled states.

## Design constraints

- No official Starfleet delta, communicator badge, registry mark, or copied LCARS graphic.
- No text or micro-detail inside the icon.
- One dominant silhouette with restrained telemetry details.
- Shared square icon canvas and rounded terminal geometry.
- Directional bias toward the right, matching the shelf drawer movement.
