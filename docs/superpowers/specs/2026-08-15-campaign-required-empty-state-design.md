# Campaign-Required Empty State Design

**Date:** 2026-08-15

## Goal

Replace the plain current-chat warning on live Mission, People, and Ship routes with an intentional Directive empty state that teaches the existing navigation model. The user should understand that Campaign is the single place to choose a campaign, open its campaign chat, or load a save.

## Scope

This design applies only when Mission, People, or Ship cannot render live campaign state because the selected host chat is not valid for the current Directive campaign/save context.

It does not change:

- ordinary empty collections or unavailable-data messages inside a valid campaign;
- runtime error presentation;
- Campaign, Settings, creator, Save Game, or Load Game layouts;
- campaign/save authority, chat binding, routing behavior, or persistence;
- the existing Campaign tab click, keyboard, tooltip, or focus behavior.

## Presentation Contract

The affected route body displays one centered, non-interactive status panel in the available space between the route heading and bottom navigation.

The panel contains:

- the existing bundled top-down ship glyph on the left;
- the eyebrow `CAMPAIGN CONNECTION REQUIRED`;
- the primary instruction `Open Campaign below, then choose or load a save to bring this panel online.`;
- concise supporting copy derived from the existing current-chat status when the condition requires more specific guidance or repair language.

On narrow layouts, the glyph and copy may stack if necessary to preserve readable line length and prevent horizontal overflow. The panel remains centered within the route body rather than relative to the full viewport, so it cannot collide with the browser chrome, top bar, LCARS rail, or route navigation.

The panel is not a button, contains no nested action, and does not draw a connector line or arrow to navigation. It must not mimic an alert, modal, developer console message, or disabled control.

## Campaign Navigation Cue

While the campaign-required panel is present, the existing Campaign route control is the only emphasized and actionable destination. It receives a restrained amber internal-light pulse at exactly 0.5 Hz: one complete illumination rise-and-fall every two seconds.

The cue changes internal background illumination, border strength, icon color, and label color without scaling, translating, bouncing, changing geometry, or adding an external neon halo. The control remains visually recognizable as the existing Campaign tab and retains its normal hit target and focus treatment.

The pulse continues only while an affected Mission, People, or Ship route is visibly showing the campaign-required state. It stops as soon as the user opens Campaign, the route changes to a state that does not require Campaign, or a valid campaign chat/save binding becomes active.

Under `prefers-reduced-motion: reduce`, the Campaign tab uses the emphasized steady-state illumination with no animation. The written instruction continues to carry the meaning, so the cue does not rely on motion or color alone.

## Component and State Boundaries

A dedicated current-chat empty-state renderer owns the structured panel. The existing generic `appendEmpty()` helper remains unchanged for ordinary empty collections and errors.

Mission, People, and Ship use the dedicated renderer only when their existing active-package/current-chat guard fails. The renderer marks the route body with presentation state; it does not search for, mutate, or click navigation controls.

After each route render, the runtime shell reads that body state and synchronizes a guidance state onto the shell and Campaign route control. Before a new render, the shell clears the previous guidance state so stale emphasis cannot survive a route change, refresh, render failure, or newly valid binding.

The Campaign control continues through the existing route-selection handler. No alternate save-loading or Campaign-opening pathway is introduced.

## Copy and Error Handling

The primary instruction stays stable so the navigation lesson is consistent. Existing current-chat statuses remain authoritative for any supporting sentence:

- no chat or an unrelated chat instructs the user to open Campaign and choose the appropriate campaign/save;
- a different campaign or save branch explains that the current selection belongs elsewhere and directs the user back through Campaign;
- a missing save or metadata conflict uses concise repair language and directs the user to Campaign Records;
- a host missing the required chat-selection capability explains that live panels are unavailable without implying that a save operation failed.

Unexpected renderer failures continue through the existing runtime error path and do not activate the Campaign guidance cue.

## Accessibility

- The status panel exposes normal readable text and a decorative ship glyph hidden from assistive technology.
- The panel does not steal focus or announce itself repeatedly during refreshes.
- While guidance is active, the Campaign route control is programmatically associated with the instruction using `aria-describedby`; the association is removed with the guidance state.
- Existing tablist roles, `aria-selected`, `aria-current`, keyboard roving focus, tooltips, and visible focus indicators remain authoritative.
- The Campaign tab remains at least its existing 44 px touch target on the certified mobile layout.

## Verification

Focused structural and behavior coverage must prove:

- Mission, People, and Ship render the structured campaign-required state for invalid current-chat/save bindings;
- unrelated empty messages and runtime errors continue using their existing presentation;
- the panel uses the bundled ship glyph, exact primary instruction, and status-appropriate supporting copy;
- the shell adds and removes the Campaign guidance state across route changes, refreshes, valid bindings, and render failures;
- clicking or keyboard-activating the emphasized Campaign tab uses the existing route-selection pathway exactly once;
- the active guidance control is associated with the instruction for assistive technology and the association is cleaned up afterward;
- the pulse duration is exactly two seconds, does not animate transforms or geometry, and becomes static under reduced motion.

Rendered desktop and mobile verification must prove:

- the panel is centered within the available route body and remains clear of the route heading and navigation;
- the glyph-and-copy layout is readable without clipping or horizontal overflow;
- the 0.5 Hz pulse is visibly restrained but perceptible against the existing Campaign tab colors;
- the Campaign control remains clickable, keyboard-focusable, and visually distinct from the currently active Mission, People, or Ship tab;
- no connector line, duplicate Campaign button, or secondary save-loading action appears.

Run the focused current-chat/shell coverage, the existing expanded-interface desktop and certified mobile visual checks, the full `npm.cmd test` gate, `git diff --check`, and a final worktree inspection before publication.
