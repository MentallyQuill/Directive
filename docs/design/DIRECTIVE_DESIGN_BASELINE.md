# Directive Design Baseline

## Status

This file records decisions already established by the project briefs and follow-up direction. It is not a place to invent new mechanics. If a gameplay or mechanics point is unresolved, add it to [../planning/CLARIFYING_QUESTIONS.md](../planning/CLARIFYING_QUESTIONS.md).

## Product Statement

Directive is a persistent, freeform Star Trek command RPG for SillyTavern. The player writes ordinary natural-language roleplay, while the extension enforces established facts, Starfleet authority, character competence, technological limits, and persistent consequences.

The game should feel permissive in expression, strict in causality, episodic in structure, persistent in consequence, and recognizably grounded in Star Trek.

## Locked Direction

- Extension title: `Directive`
- Extension key and runtime namespace: `directive`
- Initial version target: `0.1.0-pre-alpha.1`
- Platform: SillyTavern extension
- First supported role: Starfleet Commander by rank, Executive Officer by billet
- First starship package: U.S.S. Breckenridge, Intrepid-class
- First campaign period: just after the Voyager episode "Message in a Bottle", after stardate `51462.0`; exact opening stardate remains open
- Narration: handled by the active SillyTavern chat model
- Directive provider roles: structure, parsing, adjudication, mission/story director support, summaries, and diagnostics
- Canon packs: deferred for now; use lightweight guardrails for the first slice
- Raw simulation values: hidden from the player except in debug or developer surfaces

## First Campaign Premise

The first package centers on the Breckenridge and its original senior crew. The player arrives as the new long-term XO. The previous XO was a temporary stand-in who received their own command and served on the Breckenridge until a permanent XO could be secured.

The ship is relatively new as an ensemble. The crew has completed only a few missions together, enough for basic working impressions but not enough for deep trust, settled command culture, or mature relationship arcs.

## Product Boundaries

Directive should not become:

- A dialogue tree.
- A visual novel with one correct scene order.
- A random mission generator without authored causal structure.
- An unrestricted fanfiction narrator that accepts every assertion.
- A combat-first tactical simulator.
- A starship spreadsheet that overwhelms roleplay.
- A Voyager retelling with the serial numbers changed.
- A binary morality system.
- A captain fantasy where every subordinate validates the player.

## UI Direction

Directive remains chat-first. The extension UI supports orientation, state inspection, campaign/package management, and debugging.

Initial tabs:

1. Starships
2. Mission
3. Crew
4. Ship
5. Log
6. Settings

The Starships tab is the package and campaign entry point. It should let players load, inspect, and later swap starship packages. The Mission, Crew, Ship, and Log tabs reflect the active package and campaign state.

## First Vertical Slice Intent

The first playable slice should prove the command experience, not the breadth of Star Trek.

It should include:

- The Breckenridge package.
- The approved senior crew.
- A player-created Commander/XO.
- One mundane or modest authored mission.
- A stronger B-plot or relationship focus than A-plot spectacle.
- At least two active pressures or fronts.
- One meaningful ship-system or operational tradeoff.
- One moment where officers provide conflicting but valid professional advice.
- One unanticipated player solution resolved through general rules.
- A debrief that records relationships, consequences, and future hooks.

The first mission is not selected yet. Do not implement mission mechanics until the first mission premise and foregrounded relationship are clarified.
