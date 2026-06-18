# Directive

Directive is a pre-alpha SillyTavern extension project for a persistent, freeform Star Trek command RPG.

The first supported campaign package is **Ashes of Peace**, centered on the player as the new Starfleet Commander and Executive Officer aboard the Intrepid-class U.S.S. Breckinridge. The extension itself is not hardcoded to one ship: Directive is intended to revolve around loadable starship packages containing the ship, crew, campaign frame, mission types, local worldbuilding, and package-specific guardrails.

## Current Status

- Extension key and runtime namespace target: `directive`
- Initial version target: `0.1.0-pre-alpha.1`
- Platform target: SillyTavern extension
- Development state: pre-alpha design and architecture scaffolding
- First campaign start: stardate `53049.2`
- First campaign: `Ashes of Peace`
- First campaign theater: Asterion Reach
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
- Starship packages, beginning with the Breckinridge package, each carrying its own main campaign or questline.
- Starship package JSON spine: `manifest`, `ship`, `crew`, `mainCampaign`, `sideMissionRules`, `missionTemplates`, `guardrails`, `assets`.
- Generated side missions that inherit and update persistent ship, crew, relationship, and campaign state.
- Simulation modes named `Exploration` and `Command`.
- Independent Inspiration and Resolve command-style tracks, with Values and Directives carrying moral pressure.

## Documentation

Start with [docs/DOCUMENTATION_INDEX.md](docs/DOCUMENTATION_INDEX.md).

The initial documentation set records decisions already established by the project briefs and user direction. It intentionally leaves gameplay and mechanics questions unresolved where they require product decisions.

## Package Schema Smoke

Run:

```powershell
node tools\scripts\validate-starship-package.mjs
node tools\scripts\validate-campaign-projection.mjs
node tools\scripts\validate-crew-dataset.mjs
node tools\scripts\test-crew-retrieval-fixture.mjs
node tools\scripts\validate-mission-graph.mjs
node tools\scripts\test-mission-graph-fixture.mjs
node tools\scripts\validate-mission-director-contract.mjs
node tools\scripts\verify-repo-structure.mjs
```

This validates the bundled Ashes of Peace package skeleton, validates its campaign-state projection, validates the senior staff crew dataset, tests crew retrieval fixtures, validates the prelude mission graph, tests the Hesperus Command Moment fixture, validates the first Mission Director turn fixture, and verifies the anticipated repo scaffold.

## Source Material

The initial docs were derived from repo-local copies of the source briefs:

- [Directive Game Design Document](docs/source/Directive_Game_Design_Document.md)
- [Star Trek Command RPG Extension Project Brief](docs/source/Star_Trek_Command_RPG_Extension_Project_Brief.md)
- [Directive Ashes of Peace Campaign v0.2](docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md)
- [Directive Breckinridge Senior Staff Character Bible](docs/source/Directive_Breckinridge_Senior_Staff_Character_Bible.md)
- Current review of `F:/git/Saga` on the `refactor` branch
