# Directive

Directive is a pre-alpha SillyTavern extension project for a persistent, freeform Star Trek command RPG.

The first supported campaign package centers on the player as the new Starfleet Commander and Executive Officer aboard the Intrepid-class U.S.S. Breckenridge. The extension itself is not hardcoded to one ship: Directive is intended to revolve around loadable starship packages containing the ship, crew, campaign frame, mission types, local worldbuilding, and package-specific guardrails.

## Current Status

- Extension key and runtime namespace target: `directive`
- Initial version target: `0.1.0-pre-alpha.1`
- Platform target: SillyTavern extension
- Development state: pre-alpha design and architecture scaffolding
- Donor reference: Saga `refactor` branch, used as a reference for platform integration, storage, provider, UI, documentation, and testing patterns

## Core Direction

Directive is chat-first. The player acts through ordinary roleplay prose, while the extension maintains authoritative structured state behind the scenes. Player prose declares intent and attempted action; it does not directly rewrite reality.

Directive should support:

- Authored mission and campaign structure.
- Adaptive AI direction.
- Deterministic-first adjudication.
- Persistent crew, ship, campaign, faction, and relationship state.
- Hidden simulation values surfaced through consequences, debriefs, and character behavior.
- A Command Log that helps the player understand what changed without turning every scene into a rules readout.
- Starship packages, beginning with the Breckenridge package.
- Simulation modes named `Exploration` and `Command`.

## Documentation

Start with [docs/DOCUMENTATION_INDEX.md](docs/DOCUMENTATION_INDEX.md).

The initial documentation set records decisions already established by the project briefs and user direction. It intentionally leaves gameplay and mechanics questions unresolved where they require product decisions.

## Source Material

The initial docs were derived from repo-local copies of the source briefs:

- [Directive Game Design Document](docs/source/Directive_Game_Design_Document.md)
- [Star Trek Command RPG Extension Project Brief](docs/source/Star_Trek_Command_RPG_Extension_Project_Brief.md)
- Current review of `F:/git/Saga` on the `refactor` branch
