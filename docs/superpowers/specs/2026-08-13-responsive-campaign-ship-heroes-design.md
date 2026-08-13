# Responsive Campaign and Ship Heroes

## Goal

Reclaim vertical space on the Campaign and Ship routes without losing their large package artwork. Both routes start with a compact hero, temporarily expand the same amount in response to the interaction appropriate to the input device, and always use identical collapsed and expanded image heights.

## Scope

This change affects the large Campaign detail/dashboard hero and the Ship operational hero. It does not change campaign data, Ship state, route ownership, scrolling authority, Campaign Library hierarchy, or Directive's global keyboard shortcuts.

## Shared height contract

Campaign and Ship consume one shared set of responsive CSS custom properties:

| Viewport | Collapsed | Expanded |
| --- | ---: | ---: |
| Desktop, above 640px | 140px | 280px |
| Mobile, 640px and below | 112px | 220px |

The properties are defined once within the Directive shell. Route-specific rules reference them rather than repeating numeric values.

## Desktop interaction

On devices that report both `hover: hover` and `pointer: fine`, a hero expands only while the pointer is over it. Pointer exit returns it to the collapsed height. Clicking does nothing and creates no pinned state.

The height transition is brief and uses the existing interface motion language. Under `prefers-reduced-motion: reduce`, the height changes without animation.

## Mobile and coarse-pointer interaction

Each hero contains a mobile-only control covering the image interaction area. Its accessible label identifies whether tapping will expand or collapse the Campaign or Ship image, and `aria-expanded` reflects the current state.

- First tap expands the hero.
- A second tap on the same hero collapses it.
- A tap outside the expanded hero collapses it.
- Rendering or re-entering either route starts collapsed.
- No state is stored outside the rendered hero.

The feature does not register an `Escape` handler because Escape remains Directive's global close shortcut.

## Content behavior

Collapsed heroes preserve the primary identity visible over the image. Secondary overlay copy that does not fit the compact presentation may be hidden until expansion. Campaign descriptions and facts already placed below the Campaign Library hero remain below it and are not moved into the image.

The Ship operational board keeps its existing internal scroll ownership. Replacing its percentage-based hero row with the shared explicit height gives the board the reclaimed space while the hero is collapsed.

## Implementation boundaries

A small shared UI helper owns only coarse-pointer tap state, outside-tap cleanup, accessible state, and listener disposal. Desktop hover behavior and all height values remain CSS-owned. Campaign and Ship creation functions opt their heroes into the helper through the same class/data contract.

The helper must not introduce document-listener leaks when Campaign details are re-rendered. Outside-tap listeners are tied to the rendered hero and removed when it disconnects or is replaced.

## Verification

Automated coverage will prove:

- Campaign and Ship render the shared responsive-hero contract.
- Heroes begin collapsed on every render.
- Mobile tap toggles expansion and updates `aria-expanded`.
- A mobile tap outside collapses an expanded hero.
- Desktop click does not create persistent state.
- Campaign and Ship computed heights are identical in both collapsed and expanded states at representative desktop and mobile widths.
- Desktop hover expansion collapses after pointer exit.
- Campaign Library description/fact hierarchy and Ship internal scrolling remain intact.
- Reduced-motion styling removes the transition.

Focused tests run before the repository's broader UI and alpha gates. Browser geometry checks validate both responsive breakpoints and the actual interaction path.
