# Crew Roster Prompt Set

## Shared Prompt Base

Create an original UX-first LCARS-inspired Star Trek command UI concept image for Directive, a starship command RPG extension embedded inside SillyTavern.

Visual Target Unit: Crew route plus the shared Directive shell.
Parent Surface: Directive runtime shell.
Primary User Task: Let the player scan the active senior crew, understand each officer's rank, billet, and role, and confirm that crew continuity is tracked without exposing hidden relationship values.
UX Goal: The player should understand the command roster and crew continuity state within a few seconds on desktop and phone.
UX Failure Risks: tall raw metadata cards, repeated labels overpowering useful text, cutoff text, weirdly squished or wrapped names, decorative LCARS panels that look clickable, hidden relationship leaks, phone layout showing too few officers.
Required Information: senior crew count, continuity status, casualty count, reassignment count, officer name, rank, billet, species, package role, player-character continuity marker, tracked-continuity marker.
Required Controls: bottom route navigation, Back, Close Directive. The Crew page itself is read-only in this slice.
Saga Reference Qualities: compact mobile-first flow, bottom route navigation, dense readable rows, stable shell controls, active-state clarity, no desktop-only assumptions.
LCARS Requirements: original LCARS-inspired personnel-manifest layout, dark terminal canvas, curved segmented rails, asymmetrical panel frames, amber/orange/lavender/blue command accents, compact status blocks, structural color blocking, no official logos or direct screenshot copying.
Desktop Constraints: compact top-right SillyTavern panel, bottom route navigation, top-right Back/Close actions, scrollable content, no overlapping bottom route bar.
Phone Constraints: full-height shell, bottom route navigation, smaller modern type, no cutoff labels, no awkward wrapping, show multiple crew records near the top.
Visual Tone: modern Starfleet personnel console, operational, calm, readable, compact, not generic sci-fi.
Do Not Include: official logos, screenshots, exact episode displays, hidden campaign facts, raw relationship values, raw provider output, unreadable filler text, decorative fake controls, oversized type.

The concept should show layout, visual hierarchy, density, LCARS panel geometry, and interaction shape. The LCARS treatment must improve roster scanning, affordance clarity, text fit, and task completion instead of acting as decoration.

## Concept A: Compact Personnel Manifest

Use the shared base. Stay close to the existing Directive panel but replace tall cards with compact LCARS officer rows, a small crew-readiness status strip, and a final continuity summary. Prioritize clean text fit and phone-density.

## Concept B: Bridge Duty Console

Use the shared base. Push the LCARS geometry further with a command-chain rail, highlighted Captain/XO rows, officer duty bands, and segmented readiness blocks. It should feel like a bridge duty-status console while remaining a readable web-app roster.

## Concept C: Mobile-First Crew Roster

Use the shared base. Design primarily for phone width: top crew readiness bar, dense officer rows with small rank/billet/species chips, short role text, a compact continuity footer, and persistent bottom route tabs. Make text smaller, crisp, and readable; avoid clipped, squished, or oddly wrapped labels.
