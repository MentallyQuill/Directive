# Campaign Package Model

## Core Decision

Directive should revolve around campaign packages. The Breckenridge and its crew are the first playable package, not the entire product model.

A campaign package is a campaign-capable content bundle containing the information Directive needs to run a ship-centered command RPG experience. Each campaign package contains its own open-world story arc, quest templates, thread seeds, reaction rules, and director guidance. Runtime quests inherit the persistent world, ship, crew, relationship, knowledge, thread, and event state of the current playthrough.

## Bundled Package Examples

The primary bundled package is the U.S.S. Breckenridge and its main campaign, Ashes of Peace:

- Intrepid-class Starfleet vessel.
- Registry `NCC-74638`.
- Voyager-era, opening on stardate `53049.2`.
- Campaign theater: Asterion Reach.
- Campaign threat: Pale Lantern.
- Federation space and nearby operational regions.
- Player role: Commander/XO and principal mission commander.
- Captain Whitaker retains final legal command.
- Established senior crew as approved in the design baseline.
- Initial state: the reconstituted crew has been underway for twenty-five days before the player arrives.

The bundled draft package set now includes U.S.S. Glass Harbor and four additional campaign frames. Glass Harbor's Drowned Constellation package is the most detailed second example:

- Steamrunner-class Starfleet survey and route-security vessel.
- Registry `NCC-52247`.
- Opening on stardate `50192.6`.
- Campaign theater: Nerine Reef.
- Campaign theme: chart custody, sanctuary, sovereignty, rescue, and route safety.
- Player role: newly promoted Commander/XO and, after the prelude, Acting Captain.
- Captain Rhos remains a continuing succession and rescue pressure after the opening inversion.
- Authored open-world scope: 20 quests, 12 locations, 19 routes, 6 factions, 5 fronts, 6 arcs, 14 thread templates, 27 reaction rules, and 109 Director cards.
- Current status: bundled and runtime-registered, but still `draft` until crew cards, tactical graphs, and playtest tuning receive a deeper pass.

Additional bundled draft package examples cover Serein/Black Current (`NCC-52814`), Eudora Vale/Broken Accord (`NCC-74593`), Aster Vale/Unseen Border (`NCC-65488`), and Celandine/Enemy's Garden (`NCC-64941`). These packages exercise the same schema-v2 package boundary across different ships, theaters, session lengths, campaign tracks, end-condition sets, crew datasets, passive assets, and tactical graph fixtures.

## Package Responsibilities

A package should be able to define:

- Starship identity, class, registry, mission profile, and history.
- Command structure and player billet.
- Senior crew and recurring supporting crew.
- Crew relationships and starting command culture.
- Ship systems, capabilities, constraints, and known technical debt.
- Campaign frame, era, region, and local political context.
- Character-creation context: player-role mode, allowed species, career backgrounds, formative experiences, assignment reasons, and continuity guardrails.
- Open-world story-arc structure.
- End conditions, checkpoint policies, continuation frames, and final outcome band rules.
- Mission categories the ship is built to support.
- Starter missions, story arcs, quest templates, thread templates, and generation constraints.
- Recurring factions, villains, allies, rivals, and mission-specific character templates.
- Values, directives, and command pressures relevant to the package.
- Canon or setting guardrails.
- Passive assets such as banners, portraits, ship images, and icons.
- Package-local prompt guidance and voice rules.

## Initial Package Spine

Campaign packages use this top-level JSON spine:

```text
manifest
ship
crew
characterCreation
world
storyArcs
endConditions
questTemplates
threadTemplates
reactionRules
directorCards
contextPolicy
guardrails
assets
```

This is now the working package structure. Field-level schemas will continue to deepen during pre-alpha, but implementation should not invent a different top-level model without updating this document first.

The `characterCreation` domain is package-owned so the runtime Character Creator can be package-driven instead of hardcoded for Ashes of Peace. It defines role mode, role copy, allowed species, career backgrounds, formative experiences, assignment reasons, trait options, dossier generation limits, continuity guardrails, and local fallback text.

The `endConditions` domain is package-owned. It defines authored completions, terminal candidates, checkpoint policy, continuation frames, final outcome band rules, and player-safe recovery copy. The runtime treats terminal outcomes as checkpoint decisions with Replay, Push On, Keep Ending, and Save Branch behavior instead of hidden hard stops.

## Schema Process Artifacts

The first concrete schema artifacts are:

- [Campaign Package Schema](CAMPAIGN_PACKAGE_SCHEMA.md)
- [campaign-package.schema.json](../../schemas/campaign-package.schema.json)
- [ashes-of-peace.campaign-package.json](../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json)
- [drowned-constellation.campaign-package.json](../../packages/bundled/glass-harbor/drowned-constellation.campaign-package.json)
- [black-current.campaign-package.json](../../packages/bundled/serein/black-current.campaign-package.json)
- [broken-accord.campaign-package.json](../../packages/bundled/eudora-vale/broken-accord.campaign-package.json)
- [unseen-border.campaign-package.json](../../packages/bundled/aster-vale/unseen-border.campaign-package.json)
- [enemys-garden.campaign-package.json](../../packages/bundled/celandine/enemys-garden.campaign-package.json)
- [validate-campaign-package.mjs](../../tools/scripts/validate-campaign-package.mjs)

The bundled Ashes of Peace package is schema-valid pre-alpha open-world content. The five additional bundled packages are schema-valid draft open-world content. Together they establish stable identity, world structure, story arcs, quest templates, thread templates, reaction rules, crew roster, end-condition roots, guardrails, passive assets, projections, crew datasets, and tactical graph fixtures before deeper runtime systems continue evolving.

## Creator Compatibility

Future Starship Creator work should output this same package model. Bundled packages, imported packages, and player-created packages should normalize through the same validation path.

Future Mission Creator work should output mission graph data compatible with a campaign package. It should not rely on fixed scene scripts or package-private runtime hacks.

## Package And Campaign Boundary

The package is reusable content. The campaign is a specific playthrough.

Package-owned data:

- Crew templates.
- Ship template.
- Story-arc templates.
- End-condition templates and continuation-frame guidance.
- Quest templates and mission graph references.
- Thread, reaction, and generation constraints.
- Canon guardrails.
- Faction templates.
- Starting relationship seeds.

Campaign-owned data:

- Player character.
- Current ship state.
- Story arc, quest, and thread progress.
- Generated dynamic quest catalog, active quest state, delegation state, and quest outcomes.
- Relationship evolution.
- Mission outcomes.
- World state, actor/front/clock state.
- Known and hidden facts revealed during play.
- Command Log and turn ledger.
- Campaign divergences.

## Data And Transport Direction

Saga's Loredeck package and storage work is a reference, but Directive packages need their own schema and names. Do not reuse Saga identifiers or storage prefixes.

The approved campaign package transport extension is `.directive-campaign.zip`.

Finalized package content should still normalize to loadable JSON payloads. Bundled packages should be represented as schema-valid JSON packages, not as runtime hardcoded data, so bundled packages, imported packages, and future Starship Creator output follow the same validation path.

The zip transport is for share/import/export cases where a package may carry one or more JSON payloads plus passive assets. Local bundled packages and installed package records should remain modular JSON records where possible.

The current pre-alpha importer normalizes `.directive-campaign.zip` transports into JSON package records through `src/packages/campaign-package-importer.mjs`. It validates the transport extension, rejects unsafe paths and active content, finds exactly one package root JSON payload, checks package identity, and attaches diagnostics. The first ZIP reader supports stored entries for the local alpha gate; decoded archive-entry imports use the same normalization path.

## Security Direction

Packages should be data-only. Import should reject active file types and unsafe paths. Passive images may be allowed under strict type and size rules. Scripts, HTML, executable content, and scriptable SVG should be rejected.

This is now enforced by the pre-alpha importer. Package health diagnostics are surfaced in **Campaign > Library & Import** and include package spine errors, package/projection/dataset/mission-graph id mismatches, package-version drift for active campaigns, and missing active mission graph ids.

## Open Package Questions

- How much package content is bundled versus installed into user storage after import?
- Can a package depend on shared canon packs later?
- What diagnostics and eventual updater behavior are needed when package updates change ids or fields used by an in-progress campaign?
- Should packages include LLM-authored development docs for internal reference?
- What draft storage is needed for future Starship Creator projects?
- Can Mission Creator projects target multiple campaign packages, or exactly one?
- How should side mission pressure triggers, campaign beats, cooldowns, and escalation timing be expressed in package data?
- How much `Push On` continuation framing should be authored by packages versus synthesized by the Director from committed campaign state?
- Should generated side missions come from authored templates, provider-assisted generation under package constraints, or both?
