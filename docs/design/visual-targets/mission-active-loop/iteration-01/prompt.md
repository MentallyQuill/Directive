# Mission Active Loop Prompt Set

## Shared Prompt Base

Create an original UX-first LCARS-inspired Star Trek command UI concept image for Directive, a starship command RPG extension embedded inside SillyTavern.

Visual Target Unit: Mission active loop page plus the shared Directive shell.
Parent Surface: Directive runtime shell.
Primary User Task: Let the player understand the current mission, enter an XO action, preview or accept an outcome, and manage immediate recovery/save work.
UX Goal: The player should know the mission state and next command within a few seconds, with Player Action or pending outcome controls visible early on desktop and phone.
UX Failure Risks: oversized generic cards, raw IDs dominating the page, cutoff text, weirdly squished or wrapped text, buried action input, decorative LCARS panels that look clickable, hidden-state leaks.
Required Information: mission title, player rank/name, ship, campaign, phase, stardate, simulation mode, narration status, autosave status, last outcome summary/status, formal objectives, active directives, optional active pressures and side work.
Required Controls: bottom route navigation, Back, Close Directive, Save Game, Save As, Player Action input, Preview Outcome, Accept Outcome, Discard Preview, Rewrite Narration, Rerun Outcome, Delete Outcome, optional Schedule/Defer/Open/Advance/Resolve/Delegate controls.
Current State Variants: active campaign with no pending preview; pending provisional outcome; narration recovery; post-Chapter-1 follow-up or Open Orders state.
Saga Reference Qualities: compact mobile-first flow, bottom route navigation, dense readable rows, stable touch targets, active-state clarity, no desktop-only assumptions.
LCARS Requirements: original LCARS-inspired command-console layout, dark terminal canvas, curved segmented rails, asymmetrical panel frames, amber/orange/lavender/blue command accents, compact status blocks, structural color blocking, no official logos or direct screenshot copying.
Desktop Constraints: compact top-right SillyTavern panel, bottom route navigation, top-right Back/Close actions, scrollable content, no overlapping bottom route bar.
Phone Constraints: full-height shell, bottom route navigation, smaller modern type, no cutoff labels, no awkward wrapping, primary command/input zone near the top.
Visual Tone: modern Starfleet command console, operational, calm, readable, compact, not generic sci-fi.
Do Not Include: official logos, screenshots, exact episode displays, hidden campaign facts, raw relationship values, raw provider output, unreadable filler text, decorative fake controls, oversized type.

The concept should show layout, visual hierarchy, density, LCARS panel geometry, and interaction shape. The LCARS treatment must improve navigation, scanability, affordance clarity, text fit, and task completion instead of acting as decoration.

## Concept A: Conservative Mission Console

Use the shared base. Stay close to the current Directive panel but reorganize the Mission page into a compact LCARS mission console: small status strip, mission identity band, primary Player Action command block, secondary save/recovery controls, and objectives/directives below. Keep type small and modern, with no awkward wrapping.

## Concept B: Rich Command Bridge

Use the shared base. Push the LCARS geometry further with an asymmetric left/top mission rail, status capsules, a prominent command-entry bay, and clearly separated outcome review/recovery areas. The page should feel like a bridge officer console while preserving clear web-app controls.

## Concept C: Mobile-First Mission Loop

Use the shared base. Design primarily for phone width: top mission status bar, compact current-state blocks, dominant action-input or outcome-review control, side-work drawer/cards below, and persistent bottom route tabs. Make text smaller, crisp, and readable; avoid clipped, squished, or oddly wrapped labels.
