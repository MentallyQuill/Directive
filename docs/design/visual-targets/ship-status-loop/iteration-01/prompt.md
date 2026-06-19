# Ship Status Prompt Set

## Shared Prompt Base

Create an original UX-first LCARS-inspired Star Trek command UI concept image for Directive, a starship command RPG extension embedded inside SillyTavern.

Visual Target Unit: Ship route plus the shared Directive shell.
Parent Surface: Directive runtime shell.
Primary User Task: Let the player understand the active starship identity, command structure, current condition, restrictions, and known technical debt without reading raw package IDs.
UX Goal: The player should understand the ship's identity and readiness within a few seconds on desktop and phone.
UX Failure Risks: long condition prose burying the useful state, raw IDs dominating command structure, technical debt as a text wall, oversized generic cards, cutoff text, decorative LCARS panels that look clickable.
Required Information: ship name, class, registry, affiliation, commanding officer, player billet, acting XO before player, current condition, damage, active restrictions, known technical debt.
Required Controls: bottom route navigation, Back, Close Directive. The Ship page itself is read-only in this slice.
Saga Reference Qualities: compact mobile-first flow, bottom route navigation, dense readable rows, stable shell controls, active-state clarity, no desktop-only assumptions.
LCARS Requirements: original LCARS-inspired starship-status layout, dark terminal canvas, curved segmented rails, asymmetrical panel frames, amber/orange/lavender/blue command accents, compact status blocks, structural color blocking, no official logos or direct screenshot copying.
Desktop Constraints: compact top-right SillyTavern panel, bottom route navigation, top-right Back/Close actions, scrollable content, no overlapping bottom route bar.
Phone Constraints: full-height shell, bottom route navigation, smaller modern type, no cutoff labels, no awkward wrapping, ship identity and readiness near the top.
Visual Tone: modern Starfleet operations/status console, operational, calm, readable, compact, not generic sci-fi.
Do Not Include: official logos, screenshots, exact episode displays, hidden campaign facts, raw source IDs, raw provider output, unreadable filler text, decorative fake controls, oversized type.

The concept should show layout, visual hierarchy, density, LCARS panel geometry, and interaction shape. The LCARS treatment must improve ship-status scanning, text fit, and task completion instead of acting as decoration.

## Concept A: Compact Ship Status

Use the shared base. Stay close to the current Directive panel but reorganize Ship into a compact LCARS status console: ship identity band, readiness blocks, command-structure strip, and technical-debt caveats below.

## Concept B: Engineering Readiness Console

Use the shared base. Push the LCARS geometry further with a broad starship identity header, readiness rails, systems-condition blocks, and a technical-debt bay. It should feel like an operations/engineering console while remaining readable.

## Concept C: Mobile-First Ship Status

Use the shared base. Design primarily for phone width: compact ship identity header, class/registry/condition chips, command-structure rows, technical debt as concise caveats, and persistent bottom route tabs. Make text smaller, crisp, and readable; avoid clipped, squished, or oddly wrapped labels.
