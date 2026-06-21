# LCARS Visual Identity

## Status

This file records Directive's UI visual identity target for concept art and runtime implementation.

Directive is pre-alpha. LCARS is the governing visual language for UI concept art, visual comparison, and future runtime styling. Saga remains the interaction-density and mobile-flow reference, but LCARS is the primary art direction. UX remains the acceptance gate.

## Purpose

Directive should feel like a Starfleet command console embedded inside SillyTavern and Lumiverse, not a generic web dashboard with Star Trek labels. Every GPT Image 2 concept prompt for Directive UI work must revolve around an original LCARS-inspired interface system.

The goal is to develop the recognizable LCARS language into a usable modern extension UI:

- Star Trek command-console identity,
- operational density,
- clear hierarchy,
- touch-safe controls,
- readable state,
- mobile compatibility,
- no hidden-state leaks.

Directive must not sacrifice UX for aesthetic. LCARS is not a skin to be shoehorned onto existing screens. It is a visual identity system that must be adapted until it improves navigation, scanability, task completion, and player confidence.

## UX-First Rule

If an LCARS treatment makes the surface harder to use, the treatment is wrong.

Every LCARS decision must serve at least one user-experience purpose:

- clarify hierarchy,
- group related actions,
- separate navigation from page content,
- expose current state,
- support fast scanning,
- preserve touch-safe targets,
- improve responsive behavior,
- reduce cognitive load,
- protect hidden-state boundaries.

Decorative LCARS blocks are acceptable only when they reinforce structure without competing with controls. A concept that looks LCARS-authentic but has unclear navigation, unreadable labels, crowded actions, misleading affordances, or weak mobile behavior should be rejected or revised before implementation.

## Relationship To Saga

Saga is still the reference for:

- compact route drawers and mobile flow,
- a command spine with one active drawer at a time,
- persisted resizable drawer geometry,
- route-local detail patterns,
- settings customization,
- visual smoke expectations,
- dense but readable card and row structure.

LCARS governs:

- shape language,
- color blocking,
- panel structure,
- navigation treatment within the command-spine and drawer model,
- action grouping,
- visual rhythm,
- concept-art prompts,
- final visual comparison.

When Saga and LCARS conflict, preserve Saga's usability pattern and express it through LCARS geometry. When LCARS aesthetics and core usability conflict, usability wins and the LCARS treatment must be redesigned.

## Navigation Decision

Directive's primary SillyTavern route navigation belongs in a persistent left command spine on desktop and tablet. Selecting a route opens one drawer to the right; selecting the active route again collapses it. The drawer is resizable from its bottom-left corner and may enter a temporary full-screen workspace when a dense task requires it.

The drawer header is not a duplicate primary menu. It is reserved for route identity, state/status cues, collapse, and expand/restore actions. Page-local tabs, filters, and segmented controls may live inside drawer content when they make a dense workflow easier to scan. At phone width, the spine yields to the established bottom route bar. Lumiverse retains the compact bottom-navigation shell during its migration phase.

## Core LCARS Principles

Directive's LCARS adaptation should use:

- dark terminal-like negative space,
- rounded rectangular rails,
- thick segmented bars,
- asymmetric panel frames,
- elbow curves and end caps,
- amber, orange, tan, coral, lavender, blue, and muted red command accents,
- high-contrast labels,
- clear route and system status zones,
- compact data rows,
- large touch targets for primary actions,
- decorative blocks that support hierarchy instead of hiding controls,
- visual rhythm that makes the next useful action obvious.

Directive should not use:

- official Star Trek logos,
- official LCARS screenshots,
- exact episode displays,
- decorative panels that look clickable but do nothing,
- tiny unreadable filler labels,
- excessive glow,
- generic sci-fi hologram styling,
- single-hue purple, blue, beige, or orange themes,
- visuals that overpower chat-host usability,
- LCARS shapes that reduce scanability, crowd text, or obscure primary actions.

## Concept Art Rule

Every GPT Image 2 prompt for Directive UI must include an LCARS requirement. The minimum acceptable prompt direction is:

```text
Create an original UX-first LCARS-inspired Star Trek command UI concept for Directive, a starship command RPG extension embedded inside SillyTavern. Use curved segmented rails, dark negative space, asymmetrical panel frames, amber/orange/lavender/blue command accents, dense operational rows, and touch-safe controls. The LCARS styling must improve hierarchy, navigation, scanability, and task completion rather than acting as decoration. Do not include official logos, screenshots, copyrighted interface captures, unreadable filler text, or decorative panels that look like unusable controls.
```

Prompts may adapt the wording, but they must keep these requirements:

- original LCARS-inspired design,
- UX-first interaction structure,
- Directive as an embedded command RPG extension,
- target surface or feature,
- a left command spine and one active route drawer for desktop/tablet runtime-shell surfaces,
- dark terminal canvas,
- segmented rails and curved panel geometry,
- Starfleet command-console tone,
- required controls and state,
- desktop and phone constraints,
- clear navigation, scanability, and touch targets,
- no official logos or direct screen-copy artifacts,
- no invented hidden campaign facts.

## Runtime Translation

Runtime implementation should translate LCARS through CSS and component structure, not through static screenshots of LCARS panels.

Preferred implementation traits:

- CSS variables for LCARS accent families,
- reusable panel, rail, tab, status, and action classes,
- accessible contrast for labels and controls,
- stable dimensions for route tabs and action rows,
- persistent left command-spine navigation with a visibly connected single drawer,
- a bottom-left drawer resize handle with viewport-constrained persisted geometry,
- drawer-header collapse and full-screen workspace actions,
- responsive LCARS rails that yield to bottom navigation on phone width,
- real controls distinguished from decorative structure,
- package imagery integrated inside LCARS frames only when it helps the task.

LCARS styling must not weaken Directive's product rules. Hidden simulation state stays hidden. Player-facing wording stays exact. Controls remain usable before they become decorative.

Runtime styling should be evaluated as interaction design, not as a costume. If the live UI becomes slower to understand after adding LCARS treatment, the implementation should reduce, reshape, or move the LCARS elements until the workflow is clearer than before.

## Visual Acceptance

A UI surface does not meet Directive's visual target unless the runtime screenshot reads as LCARS at a glance.

Acceptance checks:

- The surface is at least as easy to understand and use as the non-LCARS version.
- The page has visible LCARS panel geometry, not only LCARS colors.
- Route navigation and primary actions use LCARS structure.
- The visual hierarchy supports the user's task.
- Text remains readable at desktop and phone width.
- Touch targets are stable and not crowded.
- Decorative bars do not pretend to be unavailable controls.
- The result still works inside SillyTavern and Lumiverse host constraints.
- The surface remains Saga-informed in flow while visually LCARS-led.

The principle is: Saga informs how Directive moves; LCARS defines what Directive looks like; UX decides whether the result is accepted.
