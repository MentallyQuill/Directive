# Starship Package Model

## Core Decision

Directive should revolve around starship packages. The Breckenridge and its crew are the first package, not the entire product model.

A starship package is a campaign-capable content bundle containing the information Directive needs to run a ship-centered command RPG experience.

## First Package

The first bundled package is the U.S.S. Breckenridge:

- Intrepid-class Starfleet vessel.
- Voyager-era, just after "Message in a Bottle" and after stardate `51462.0`.
- Federation space and nearby operational regions.
- Player role: Commander/XO and principal mission commander.
- Captain Whitaker retains final legal command.
- Original senior crew as approved in the design baseline.
- Initial state: ship has completed a few missions together before the player arrives.

## Package Responsibilities

A package should be able to define:

- Starship identity, class, registry, mission profile, and history.
- Command structure and player billet.
- Senior crew and recurring supporting crew.
- Crew relationships and starting command culture.
- Ship systems, capabilities, constraints, and known technical debt.
- Campaign frame, era, region, and local political context.
- Mission categories the ship is built to support.
- Starter missions and campaign arcs.
- Recurring factions, villains, allies, rivals, and mission-specific character templates.
- Values, directives, and command pressures relevant to the package.
- Canon or setting guardrails.
- Passive assets such as banners, portraits, ship images, and icons.
- Package-local prompt guidance and voice rules.

## Creator Compatibility

Future Starship Creator work should output this same package model. Bundled packages, imported packages, and player-created packages should normalize through the same validation path.

Future Mission Creator work should output mission graph data compatible with a starship package. It should not rely on fixed scene scripts or package-private runtime hacks.

## Package And Campaign Boundary

The package is reusable content. The campaign is a specific playthrough.

Package-owned data:

- Crew templates.
- Ship template.
- Mission templates.
- Canon guardrails.
- Faction templates.
- Starting relationship seeds.

Campaign-owned data:

- Player character.
- Current ship state.
- Relationship evolution.
- Mission outcomes.
- Actor/front/clocks state.
- Known and hidden facts revealed during play.
- Command Log and turn ledger.
- Campaign divergences.

## Data And Transport Direction

Saga's Loredeck package and storage work is a reference, but Directive packages need their own schema and names. Do not reuse Saga identifiers or storage prefixes.

The approved starship package transport extension is `.directive-starship.zip`.

Finalized package content should still normalize to loadable JSON payloads. The bundled Breckenridge package should be represented as a schema-valid JSON package, not as runtime hardcoded data, so bundled packages, imported packages, and future Starship Creator output follow the same validation path.

The zip transport is for share/import/export cases where a package may carry one or more JSON payloads plus passive assets. Local bundled packages and installed package records should remain modular JSON records where possible.

## Security Direction

Packages should be data-only. Import should reject active file types and unsafe paths. Passive images may be allowed under strict type and size rules. Scripts, HTML, executable content, and scriptable SVG should be rejected.

## Open Package Questions

- Should a package include multiple playable campaign starts, or exactly one default start?
- How much package content is bundled versus installed into user storage after import?
- Can a package depend on shared canon packs later?
- How are package updates applied to an existing campaign without overwriting campaign state?
- Should packages include LLM-authored development docs for internal reference?
- What draft storage is needed for future Starship Creator projects?
- Can Mission Creator projects target multiple starship packages, or exactly one?
