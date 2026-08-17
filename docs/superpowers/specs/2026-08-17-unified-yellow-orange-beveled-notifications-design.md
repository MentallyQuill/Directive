# Unified Yellow-Orange Beveled Notifications

## Goal

Make every Directive notification use one LCARS-aligned yellow-orange presentation and move the Directive preset startup reminder from its legacy modal into the existing shared notification stack.

The attached top-bar clipping is not reproducible from the current installed artifact: repository and installed files have exact hash parity, a fresh live SillyTavern page renders the header inside the shell, and the current expanded-interface browser suite passes all 25 route/viewport combinations. Treat the screenshot as stale already-open page state rather than changing healthy header geometry speculatively. Add a direct containment assertion so a future real regression fails visibly.

## Visual Contract

- Every Directive notification card uses the canonical notification yellow-orange `#f2a126` for its leading edge, border, category, title glyph, and action emphasis.
- Mission, People, Ship, activity, and preset cards no longer substitute route-specific peach, lilac, or blue accents.
- Every card has true 4px beveled corners on all four corners.
- The outer accent edge and inner dark surface use matching polygon geometry so the border follows each diagonal rather than leaving rounded or clipped rectangular corners.
- Existing dark surfaces, compact typography, shadows, entry/exit motion, focus visibility, and reduced-motion behavior remain.

## Shared Surface

Extend `directive-notification-surface.js` with a system/preset owner and a dedicated system slot. The stack order is:

1. activity;
2. persistent system/preset notices;
3. timed gameplay notices.

All owners continue to share the existing upper-chat placement, width, dynamic measurement, and SillyTavern native-toast collision avoidance. Releasing one owner must not remove the surface while another owner remains active.

## Preset Update Notice

Replace the full-screen `directive-preset-update-dialog` modal with a persistent notification card managed by a focused preset-notification module.

The card contains:

- category: `Preset update`;
- the reminder title and message supplied by the preset manager;
- bundled preset version metadata;
- primary action: `Open Preset Settings`;
- secondary actions: `Later` and `Stop Reminders`.

The notice does not time out. It remains until the player chooses an action or the reminder is reset. Existing behavior is preserved:

- Open closes the notice and opens Settings at the highlighted preset section;
- Later persists dismissal for the bundled version;
- Stop Reminders disables automatic startup checks through the existing runtime action.

The notice is a polite live-region addition, keyboard reachable, and does not use modal focus capture. Failures in an async action are logged through the existing Directive warning path without leaving duplicate cards.

## Header Regression Guard

Do not alter current top-bar geometry without a reproducible source failure. Extend the browser conformance check to assert that the brand, route path, and close action remain fully inside the shell and top-bar rectangles at every certified viewport. This distinguishes an actual layout regression from stale browser state.

## Testing

Use red-green-refactor for each behavior:

- notification surface accepts and independently releases the system owner;
- system slot participates in shared stacking and collision measurement;
- all notification kinds compute the same yellow-orange accent;
- card corner geometry exposes 4px diagonal bevels on desktop and mobile;
- preset notice renders supplied content and all three actions;
- preset actions preserve open, later, and disable behavior;
- the persistent preset notice does not create a timer;
- reduced motion and focus visibility remain correct;
- expanded-shell brand, path, and close control stay contained at every certified viewport.

Run focused notification, preset, and expanded-interface browser tests, then the full alpha gate. Reload the live installed extension after synchronization and verify real geometry and interactions before pushing `main`.
