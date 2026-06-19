# Command Log Prompt Set

## Shared Prompt Base

Create an original UX-first LCARS-inspired Star Trek command UI concept image for Directive, a starship command RPG extension embedded inside SillyTavern.

Visual Target Unit: Log route plus the shared Directive shell.
Parent Surface: Directive runtime shell.
Primary User Task: Let the player review recent committed command outcomes, assisted summaries, committed inputs, and visible consequences without reading raw JSON or long source IDs.
UX Goal: The player should understand what happened recently and what mattered within a few seconds on desktop and phone.
UX Failure Risks: raw JSON displayed as player-facing text, long source IDs dominating entries, generic metadata cards, text walls, cutoff text, decorative LCARS panels that look clickable, hidden-state leaks.
Required Information: command-log entry count, latest stardate, assisted-summary status, entry title/type, summary, highlights, committed inputs, visible consequences.
Required Controls: bottom route navigation, Back, Close Directive. The Log page itself is read-only in this slice.
Saga Reference Qualities: compact mobile-first flow, bottom route navigation, dense readable rows, stable shell controls, active-state clarity, no desktop-only assumptions.
LCARS Requirements: original LCARS-inspired command-history timeline, dark terminal canvas, curved segmented rails, asymmetrical panel frames, amber/orange/lavender/blue command accents, compact status blocks, structural color blocking, no official logos or direct screenshot copying.
Desktop Constraints: compact top-right SillyTavern panel, bottom route navigation, top-right Back/Close actions, scrollable content, no overlapping bottom route bar.
Phone Constraints: full-height shell, bottom route navigation, smaller modern type, no cutoff labels, no awkward wrapping, latest entry summary near the top.
Visual Tone: modern Starfleet command-history console, operational, calm, readable, compact, not generic sci-fi.
Do Not Include: official logos, screenshots, exact episode displays, hidden campaign facts, raw source IDs, raw provider output, unreadable filler text, decorative fake controls, oversized type.

The concept should show layout, visual hierarchy, density, LCARS panel geometry, and interaction shape. The LCARS treatment must improve timeline scanning, summary comprehension, text fit, and task completion instead of acting as decoration.

## Concept A: Compact Command Timeline

Use the shared base. Stay close to the current Directive panel but replace generic cards with a compact LCARS timeline: status strip, latest entry summary, highlights, committed inputs, visible consequences, and technical source state de-emphasized.

## Concept B: Bridge Log Console

Use the shared base. Push LCARS geometry further with an asymmetric timeline rail, stardate/status blocks, summary capsule, and consequence bay. It should feel like a bridge command log while preserving clear web-app readability.

## Concept C: Mobile-First Log Review

Use the shared base. Design primarily for phone width: top log summary bar, dense latest-entry card, assisted summary first, compact highlights/consequences rows, and persistent bottom route tabs. Make text smaller, crisp, and readable; avoid clipped, squished, or oddly wrapped labels.
