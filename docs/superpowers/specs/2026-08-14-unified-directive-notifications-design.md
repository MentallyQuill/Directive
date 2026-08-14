# Unified Directive Notifications Design

**Status:** Approved

**Date:** 2026-08-14

## Purpose

Directive will present every transient player-facing notification through one upper-chat notification surface. Per-turn activity such as `Directive is reading your post...` will use the same card grammar, icon system, stack, spacing, and animation as authoritative Mission, People, and Ship updates.

The unified surface will coexist with SillyTavern's native toastr notifications. SillyTavern keeps priority in its configured notification lane; Directive measures the visible native toast cards and moves its own stack only when the two rendered regions would intersect.

## Product Contract

- All Directive notifications appear in one compact vertical stack near the top center of the active SillyTavern chat panel, below the SillyTavern top bar.
- Directive activity and gameplay notifications may be visible at the same time and stack without replacing one another.
- Native SillyTavern notifications never overlap visible Directive notifications.
- SillyTavern notification placement remains user-controlled. Directive does not mutate toastr options, classes, cards, timing, or container ownership.
- Native notifications win collision priority. Directive moves around them and returns to its normal chat-panel anchor when the collision clears.
- Activity cards remain lifecycle-controlled and non-dismissible. They do not acquire a six-second timeout or a View action.
- Gameplay cards retain their current six-second active display time, hover/focus pause, body dismissal, accessible View action, grouping, queue, and committed-state authority.
- The surface remains presentation-only and never delays generation, accepted-pair settlement, persistence, or SillyTavern notification delivery.
- Notifications make no sound and do not create persistent history, unread state, or settings.

## Approved Approach

Directive will keep an owned notification surface rather than rendering custom cards inside SillyTavern's toastr container.

The surface derives its base geometry from the current `#sheld` chat panel and `#top-bar`, then observes the actual visible rectangles of `#toast-container > .toast` cards. If a native toast rectangle intersects the Directive lane, Directive shifts below the native stack with a small fixed gap. A toast positioned elsewhere leaves Directive at its normal anchor when the rendered rectangles do not intersect.

This preserves Directive's interaction and visual contracts while respecting all supported SillyTavern toast positions. A fixed offset was rejected because native toast position and height are configurable. Reusing toastr was rejected because it would surrender Directive's upper-chat placement, card actions, queue semantics, and lifecycle ownership.

## Information Hierarchy and Icons

Every Directive card uses the same two-part heading hierarchy:

1. a compact uppercase category label; and
2. a title row with a local SVG glyph immediately to the left of the title.

The approved existing-asset mapping is:

| Notification | Category | Title glyph | Accent |
| --- | --- | --- | --- |
| Turn activity | `Directive` or `SillyTavern` during handoff | `route-campaign.svg` | salmon |
| Mission update | `Mission update` | `route-mission.svg` | amber |
| People update | `People update` | `route-crew.svg` | lilac |
| Ship update | `Ship update` | `route-ship.svg` | blue |
| View action | route-specific accessible label | `action-view.svg` | card accent |

The route glyphs are decorative in the cards and use the existing mask-based `.directive-vector-glyph` mechanism so currentColor controls their rendered color. The activity glyph represents the Directive campaign runtime even during the brief SillyTavern generation handoff. Upload, remove, drag, delete, comm-badge, and cohesion-category SVGs remain scoped to their existing product meanings and are not repurposed.

## Card Behavior

### Activity card

The existing turn-activity token model remains authoritative. The first active token creates one activity card at the top of the Directive stack after the existing `350ms` reveal delay. Newer active tokens determine its displayed phase and label. Removing the last token removes the card.

The reading phase renders category `Directive` and title `Reading your post...`. The existing generation handoff updates the same card to category `SillyTavern` and title `Writing...`, then clears it after the existing `150ms` handoff delay. This is a presentation rewrite of the current complete labels, not a new generation lifecycle.

The activity card uses `role="status"` and polite live behavior, accepts no pointer interaction, never enters the gameplay queue, and never consumes one of the three gameplay-card slots.

### Gameplay cards

Mission, People, and Ship records keep their existing committed projection-delta contract. Their category label, title, and optional summary remain unchanged except for the new route glyph beside the title. View remains a separate sibling control with the existing search glyph.

The gameplay queue continues to show at most three cards. The activity card occupies a dedicated stack slot above those cards. Gameplay priority and insertion order remain unchanged.

## Shared Notification Surface

A focused UI module owns only shared presentation infrastructure:

- one notification host and list inside Directive's overlay root;
- chat-panel anchoring;
- activity and gameplay slots;
- shared card classes and title-row structure;
- native-toast collision observation;
- geometry refresh on relevant DOM, size, and viewport changes; and
- teardown when no Directive notifications remain or the extension is disposed.

The gameplay notification center continues to own validation, deduplication, queue admission, timers, dismissal, and View navigation. The turn-activity module continues to own activity tokens, reveal delay, phase updates, handoff, and cancellation. Neither feature owns native SillyTavern elements.

## Placement and Native-Toast Coexistence

The base Directive anchor is horizontally centered within the rendered `#sheld` rectangle and placed a small gap below the larger of the chat-panel top and the rendered `#top-bar` bottom. This keeps the cards in the chat panel rather than above the SillyTavern bar, including when chat width or font scaling changes.

While Directive notifications are mounted, the surface refreshes geometry when any of the following changes:

- the viewport size;
- `#sheld` or `#top-bar` size, style, or class;
- creation, removal, class changes, style changes, or child changes involving `#toast-container`;
- size changes to the visible Directive stack; or
- size changes to visible native toast cards.

Collision checks use the rectangles of visible native toast children rather than the container's nominal full-width box. Directive shifts only when a card rectangle intersects its rendered lane. The shift uses the native stack's bottom edge plus a `6px` gap for top-positioned collisions. Once no visible native card intersects, the stack returns to its base anchor.

If required host geometry is temporarily unavailable, Directive falls back to the chat panel's last valid geometry and then to the current safe upper-center viewport placement. Collision-observer failure must not remove notifications or alter SillyTavern.

## Visual Design

The current gameplay card is the visual authority:

- width `min(340px, calc(100vw - 24px))`, additionally constrained to the rendered chat-panel width;
- dark raised surface;
- restrained accent wash and border;
- four-pixel left LCARS rail;
- five-pixel radius;
- compact Roboto Condensed category and title typography;
- Segoe UI/system summary typography;
- six-pixel inter-card spacing; and
- the existing short enter and exit motion.

The activity card adopts that surface, rail, typography, width, and entry motion. It does not show the old pill background or circular spinner. Its route-campaign glyph uses a restrained opacity pulse; reduced-motion mode leaves the glyph static. Gameplay cards gain the same 15px decorative title glyph without changing their text truncation or summary clamp.

All cards remain readable at the `360.5px` mobile boundary. The View label remains icon-only at that boundary while retaining its accessible name and tooltip.

## Accessibility

- The shared host is labelled `Directive notifications`.
- Gameplay additions remain in a polite live region and do not move focus.
- The activity card remains a polite status and announces phase text without being focusable.
- Decorative title glyphs use `aria-hidden="true"`.
- View retains a route-specific accessible name such as `View Mission`.
- Gameplay body and View controls remain sibling buttons; no interactive elements are nested.
- Focus-visible treatment and timer pause behavior remain unchanged.
- Reduced-motion mode removes transform animation and keeps state changes legible.

## Lifecycle and Cleanup

- Startup, load, chat change, branch/replay/recovery, invalidation, and extension disable continue to reset gameplay notification history as already specified.
- Turn-activity cancellation removes its dedicated card without clearing gameplay cards.
- Gameplay reset removes queued and visible gameplay cards without canceling current turn activity.
- Shared observers remain active only while the surface contains a Directive card.
- Removing the last Directive card disconnects observers, removes listeners, and removes the shared host.
- Extension disposal removes both activity and gameplay content and all notification-surface resources.

## Error Handling

- Missing or malformed gameplay records remain ignored by the gameplay center.
- Missing route glyphs degrade to title text without blocking the card.
- A missing `#toast-container` means there is no native collision to avoid.
- A native toast disappearing during measurement triggers a normal geometry refresh.
- ResizeObserver or MutationObserver absence falls back to window resize plus refreshes caused by Directive mount/update/removal.
- Geometry or navigation errors are diagnostic-only and never affect campaign state, settlement, persistence, or generation.

## Testing and Verification

The feature requires:

- focused DOM tests proving activity and gameplay cards share one host and stack without consuming each other's slots;
- tests proving activity remains non-dismissible and lifecycle-controlled while gameplay timers and View behavior remain unchanged;
- title-glyph mapping tests for activity, Mission, People, Ship, and View;
- geometry tests for chat-panel centering below `#top-bar`;
- collision tests for top-center, top-left, top-right, bottom, absent, removed, and resized native toast cards;
- teardown tests for observers, listeners, separate activity/gameplay resets, and extension disposal;
- browser visual checks at desktop and `360.5px`-class mobile widths with activity plus three gameplay cards;
- browser checks showing a native SillyTavern-style toast and Directive stack simultaneously with non-intersecting rectangles;
- reduced-motion and accessibility checks;
- the focused notification and turn-activity tests;
- the complete `npm.cmd test` gate; and
- installed SillyTavern verification of upper-chat placement, native-toast coexistence, activity handoff, story-card interaction, and zero new console errors.

## Out of Scope

- replacing or restyling SillyTavern's native notifications;
- changing the user's configured toastr position;
- routing Directive records through toastr;
- changing authoritative gameplay-notification eligibility or timing;
- adding new notification types, sounds, persistence, unread counts, or settings;
- deep-linking View to a specific record;
- changing turn-generation orchestration; and
- introducing new SVG artwork when an approved local route glyph already exists.
