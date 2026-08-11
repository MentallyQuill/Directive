# Mobile Panel Continuity Design

## Goal

Restore the certified Directive composition on narrow and short mobile viewports without reintroducing full-page scrolling. Campaign, Mission, and People must keep their master and detail panels adjacent, and each designated panel must remain independently scrollable when its contents exceed its assigned space.

## Evidence and Root Cause

The real-phone captures and the existing 360 by 800 conformance artifacts show the same failure: a large empty band separates the upper master panel from the lower detail panel.

Campaign, Mission, and People switch from two desktop columns to one mobile column but do not define mobile grid rows. The browser therefore creates two implicit rows and stretches them across the route height. A `max-height` on the first grid item makes the item smaller without making its implicit row smaller, leaving the unused portion of that row as visible dead space. A keyboard-reduced visual viewport further starves the detail row.

Ship already avoids this problem with explicit bounded rows. Settings uses an auto navigation row followed by a flexible content row.

The runtime overlay also restores focus when it closes but does not move focus into the modal when it opens. If a browser or host text field was focused, the on-screen keyboard can remain open and reduce the visual viewport unnecessarily.

## Design

At mobile widths, Campaign, Mission, and People will each define two explicit rows:

- a bounded first row sized for the route's compact master panel;
- a flexible `minmax(0, 1fr)` detail row that consumes the remaining route height.

The first-panel `max-height` constraints will be removed because the grid track becomes the authoritative size. The existing master/detail elements remain the scroll owners, so long campaign libraries, mission collections, rosters, and detail records stay accessible without making the shell or route page scroll.

The layouts keep the current certified structure and content hierarchy. There is no mobile-only navigation mode, collapsing behavior, or runtime data change.

When the Directive overlay opens, focus will move to its close control after the route has rendered. Closing will continue to restore focus to the opener. This gives the fixed overlay correct modal focus behavior and releases any previously focused browser or host text input.

## Rejected Alternatives

- Content-sized first rows (`auto 1fr`) can let a long library or roster consume the viewport and leave too little detail space.
- A route-level scroll container would restore full-page content scrolling, contrary to the certified interaction model.
- A mobile master/detail navigation mode would be a larger redesign and would hide context that is currently visible in the approved stacked composition.

## Verification

The visual conformance runner will cover both 360 by 800 and a keyboard-reduced 360 by 500 viewport. For Campaign, Mission, and People it will assert that:

- the detail panel begins at the declared grid gap immediately after the master panel;
- both rows have usable height;
- the first detail heading is present inside the visible detail panel;
- the body and route remain non-scrolling while the designated panels remain the only scroll owners.

The overlay host test will assert focus enters the close control on open and returns to the opener on close. The complete alpha gate, production-only installed-copy hash comparison, and live browser screenshots will remain release requirements.
