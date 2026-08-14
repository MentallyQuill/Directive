# LCARS Relay Backlight

## Goal

Make the five colored segments in the expanded Directive interface's left LCARS rail feel like physical, backlit bridge panels that quietly respond to unseen console activity. The effect should occasionally suggest that one panel, or rarely two panels, has been activated without turning the rail into navigation feedback, a scanner, or an RGB light show.

This is presentation-only. It does not change route selection, shell structure, campaign state, save authority, prompt behavior, or package data.

## Visual material

Each segment remains a flat colored LCARS face. Illumination must resemble light passing through a translucent prop panel rather than a glossy digital button:

- preserve the segment's existing amber, lilac, blue, violet, or salmon hue;
- add approximately 20-28% pale warmth to the overlay color, then temper it through overlay opacity so the base hue remains recognizable;
- keep the illuminated field broad and nearly uniform, with the edges approximately 8 percentage points dimmer than the center;
- contain every light cue inside the segment boundary;
- use at most a faint one-pixel inset highlight and a restrained internal light field;
- do not add an outer shadow, drop shadow, bloom, white hotspot, glossy streak, strong saturation change, or visible bevel.

The segment does not translate, scale, depress, or otherwise change geometry. The impression of activation comes from its discrete change in internal luminance and the console-like timing of that change.

The illuminated state must also clear a perceptibility floor. After overlay opacity is composited against the segment face, the center of every desktop segment must gain at least 14 relative sRGB luminance levels on a 0-255 scale and no more than 30. Because the narrow phone rail is harder to notice in peripheral vision, every phone segment must gain 18-36 levels. This keeps the state readable without turning it into a white flash.

## Animation choreography

The five segments share a deterministic 32-second choreography. Most activations occur alone. One scheduled event overlaps two nonadjacent segments by a fraction of a second, and no event illuminates more than two segments at once.

Each activation has three phases:

1. A quick approximately 160ms switch-on.
2. An illuminated hold lasting approximately 1.5-1.7 seconds.
3. A softer approximately 450-500ms release.

The individual event starts are spaced approximately 5-8 seconds apart, apart from the intentional paired overlap. The long quiet intervals matter more than exact timing: the rail should be easy to ignore, but an activation should remain visible long enough to register when it catches the eye.

The sequence is ambient and decorative. It does not follow the active route, clicks, loading state, model activity, mission state, or any other application event. Reconstructing the shell may restart the deterministic sequence without persisting animation state.

## CSS architecture

The existing `.directive-lcars-rail-segment` remains the colored face and continues to own its route-specific `--directive-rail-color`. A pointer-inert `::after` pseudo-element supplies the light field so the underlying segment background, route codes, layout, and DOM remain unchanged.

The pseudo-element:

- covers the segment with `inset: 0` and inherits its corner geometry;
- paints a broad, nearly uniform gradient derived from `--directive-rail-color` and a pale warm tint;
- uses only inset shadows for the restrained edge response;
- starts fully transparent;
- animates opacity through one shared relay keyframe;
- uses per-segment positive delays to place each segment in the shared choreography;
- remains below the route code text through an explicit stacking boundary.

No JavaScript timer, runtime randomness, event listener, canvas, image asset, or new DOM node is added.

## Responsive behavior

Desktop retains its 20-28% warm light field and `.90` peak opacity. At the narrow mobile rail width, the pseudo-element uses a 23-32% warm light field and `.96` peak opacity, increasing effective light contribution by approximately one third without changing the animation timing. Segment dimensions, gaps, labels, corner radii, shell insets, safe-area handling, and route controls remain unchanged.

## Reduced motion and accessibility

Under `prefers-reduced-motion: reduce`, the relay animation is disabled and every illumination overlay remains transparent. The existing colored rail stays visible.

The pseudo-element is decorative, pointer-inert, absent from the accessibility tree, and cannot change focus, hit targets, semantics, route announcements, or contrast of the dark route codes beyond the restrained illuminated state.

## Performance and containment

The implementation animates only pseudo-element opacity. The five bounded layers are compositable and require no per-frame JavaScript. The effect must not create overflow, change layout, alter scroll ownership, or paint outside the clipped rail segments.

## Verification

Focused source tests will prove:

- every rail segment establishes the required contained stacking boundary;
- the light field is an inset, pointer-inert `::after` overlay with inherited geometry;
- the overlay derives its fill from `--directive-rail-color` and contains no external shadow or filter;
- all five segments use the shared 32-second relay animation with explicit delays;
- the shared keyframe has a quick attack, bounded hold, softer release, and a transparent idle state;
- the composited center luminance clears the desktop and phone perceptibility floors without exceeding the upper bound;
- mobile lowers the illumination strength without changing rail geometry;
- reduced-motion mode disables the animation and holds the overlays transparent;
- no JavaScript or DOM change is needed for the effect.

Browser verification at desktop and phone dimensions will confirm that the rail reads as a restrained backlit prop panel, that the paired event never resembles a route selection or warning state, and that no illumination escapes the segment edges. The full repository test gate must remain green.
