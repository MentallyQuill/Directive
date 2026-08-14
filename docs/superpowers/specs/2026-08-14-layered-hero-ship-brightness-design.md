# Layered Hero Ship Brightness Correction

## Goal

Preserve the authored brightness and color of the foreground ship everywhere a complete layered Campaign hero appears, while retaining readable Campaign identity copy over the space background.

This is presentation-only. It does not change the hero artwork, cruise animation, orbit response, package data, Campaign state, or fallback media.

## Root cause

The foreground ship renders correctly at full opacity with no filter. The sunlight pass above it uses `screen`, so it only brightens the composite. The dimming comes from the Campaign hero's full-height `::after` readability gradient. That pseudo-element sits above the foreground and sunlight at `z-index: 6`, uses normal blending, and rises from transparent at 20% to 94% near-black at the bottom. Most of the ship therefore receives a substantial black overlay.

## Approaches considered

1. **Remove the readability gradient.** This restores the ship but can leave the Campaign title and metadata unreadable against bright stars.
2. **Shrink the existing topmost gradient.** This reduces the affected area but still darkens any ship pixels behind the copy.
3. **Move a localized copy scrim below the ship.** Render a bottom-left scrim inside the layered scene below the foreground, remove the topmost gradient only for layered Campaign heroes, and reinforce the copy with a restrained text shadow. This is the chosen approach because it preserves every foreground pixel while maintaining readable copy.

## Layering contract

For layered Campaign heroes:

- background and authored stars remain at `z-index: 0-1`;
- repeating far and near stars remain at `z-index: 2-3`;
- the localized copy scrim is a decorative pseudo-element inside `.directive-hero-scene`, positioned at the bottom left at `z-index: 3`;
- the foreground ship remains at `z-index: 4`, fully opaque, unfiltered, and above the scrim;
- the sunlight pass remains at `z-index: 5` with `screen` blending;
- Campaign copy remains above the scene and receives only a text shadow;
- the former parent-level full-height dark overlay is disabled only when the Campaign hero contains a layered scene.

The scrim uses a localized bottom-left gradient rather than a full-width or full-height wash. It may darken background and star pixels behind the copy, but it must not composite over the ship.

Static and incomplete fallback Campaign heroes keep the existing parent-level readability gradient because they do not expose separately stackable foreground artwork.

## Responsive and accessibility behavior

The same stacking contract applies to active Campaign and Campaign Library presentations on desktop and mobile. The scrim may expand proportionally with the copy region at narrow widths, but its stacking order remains below the foreground.

No semantic, focus, pointer, animation, or reduced-motion behavior changes. The decorative scrim adds no DOM node and remains part of the existing image presentation.

## Verification

Automated style and browser coverage will prove:

- layered Campaign heroes disable the parent-level topmost dark gradient;
- their localized scrim is inside the scene below the `z-index: 4` foreground;
- the ship remains at opacity `1`, filter `none`, and normal blending;
- sunlight remains `screen` blended and above the ship;
- static fallback Campaign heroes retain their existing readability gradient;
- Campaign copy stays readable at desktop and mobile viewports;
- screenshots show authored ship brightness with no new edge exposure, clipping, overflow, or interaction regression;
- the complete repository gate remains green.
