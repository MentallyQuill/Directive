# Crew Dataset Contract

## Purpose

The crew dataset contract defines how prose character bibles become structured, retrievable package data for Directive.

The starship package `crew` field remains the compact roster and relationship-model declaration. A crew dataset is the richer Director-facing layer: officer profiles, reveal gates, voice guidance, relationship dynamics, development axes, B-plots, and coalition rules.

This keeps the package roster small while giving Directors precise data to retrieve without injecting the whole character bible into prompts.

## Artifacts

- Crew dataset schema: [crew-dataset.schema.json](../../schemas/packages/crew-dataset.schema.json)
- Reusable Director card schema: [director-card.schema.json](../../schemas/packages/director-card.schema.json)
- Bundled crew dataset: [breckinridge-senior-staff.crew-dataset.json](../../packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json)
- Crew dataset validator: [validate-crew-dataset.mjs](../../tools/scripts/validate-crew-dataset.mjs)
- Retrieval fixture test runner: [test-crew-retrieval-fixture.mjs](../../tools/scripts/test-crew-retrieval-fixture.mjs)
- Source bible: [Directive Breckinridge Senior Staff Character Bible](../source/Directive_Breckinridge_Senior_Staff_Character_Bible.md)
- Retrieval architecture: [Director Retrieval And Context Orchestration](../architecture/DIRECTOR_RETRIEVAL_AND_CONTEXT_ORCHESTRATION.md)
- Crew development model: [Crew Development And Experience Model](../design/CREW_DEVELOPMENT_AND_EXPERIENCE_MODEL.md)

## Boundary

Package-owned crew dataset data includes:

- Officer baseline cards.
- Voice and portrayal rules.
- Reveal-gated history.
- Relationship and crew-to-crew dynamics.
- Development axes and moment definitions.
- B-plot hooks.
- Coalition and objection rules.
- Retrieval metadata and indexes.

Campaign-owned state includes:

- Relationship values.
- Development progress.
- Revealed card ids.
- Player-known fact ids.
- Private disclosures earned in this playthrough.
- Cards blocked, retired, superseded, or contradicted by campaign events.
- Retrieval run journals.

Package cards are templates. They are never mutated by play.

## Top-Level Shape

A crew dataset uses this top-level shape:

```text
manifest
sources
officers
relationshipDimensions
developmentDimensions
cards
indexes
```

The dataset may be package-adjacent JSON, such as:

```text
packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json
```

The bundled Breckinridge dataset currently lives at that path as package-adjacent JSON.

## Manifest

The manifest identifies the dataset and the package it belongs to.

Required fields:

- `kind`: must be `directive.crewDataset`.
- `schemaVersion`: starts at `1`.
- `id`: stable dataset id.
- `packageId`: owning starship package id.
- `title`: display title for diagnostics and authoring tools.
- `version`: package-compatible version.
- `status`: `draft`, `pre-alpha`, `playtest`, or `stable`.

## Sources

Sources preserve provenance. The first required source is the senior staff character bible.

Each source entry should include:

- `title`
- `path`
- `version`
- `role`

Director cards should cite source sections through their own `source.refs` fields.

## Officers

The `officers` list declares which senior staff members the dataset covers and which card types each officer must eventually provide.

Crew card types:

```text
crew.profile
crew.voice
crew.relationship
crew.reveal
crew.bplot
crew.coalitionRule
crew.development
command.styleReaction
```

The current Breckinridge pre-alpha dataset requires the six foundational types per senior officer: `crew.profile`, `crew.voice`, `crew.relationship`, `crew.reveal`, `crew.development`, and `command.styleReaction`. `crew.bplot` and `crew.coalitionRule` remain contract types for the next expansion pass.

## Relationship Dimensions

Relationship dimensions mirror the roster-level relationship model:

- `professionalTrust`
- `confidenceInJudgment`
- `personalRapport`

They remain hidden raw values. Crew cards may reference these dimensions in gates, but narrator packets must not expose the raw numbers.

## Development Dimensions

Development dimensions express officer growth separately from relationship approval.

Initial shared dimensions:

- `operationalExperience`
- `playerMentorship`
- `personalArcProgress`
- `commandConfidence`
- `professionalStrain`

Officer-specific dimensions may be added later when converting the bible.

## Director Cards

Crew datasets use the reusable Director card contract.

Required card fields:

- `id`
- `type`
- `title`
- `datasetId`
- `source`
- `visibility`
- `audiences`
- `scope`
- `gates`
- `retrieval`
- `payload`

Cards are small and retrievable. A card should carry one usable fact, rule, reveal, relationship dynamic, development pressure, voice constraint, or scene hook.

## Crew Card Types

### `crew.profile`

Baseline officer identity and stable professional context.

Use for service-record-safe facts, billet, broad role, professional strengths, and known background.

### `crew.voice`

Voice and portrayal guidance.

Use for sentence rhythm, stress behavior, humor, what to avoid, and narrator-safe dialogue constraints.

### `crew.relationship`

Relationship dynamics involving the player or other crew.

Use for starting impressions, trust pressures, crew-to-crew dynamics, and situational response patterns.

### `crew.reveal`

Trust-ladder and hidden-history material.

Use for service-record, professional-conversation, high-trust, crisis-disclosure, or revealed knowledge gates.

### `crew.bplot`

Recurring personal or professional arc hooks.

Use for Open Orders scenes, private follow-ups, offscreen growth, and personal arc progression.

### `crew.coalitionRule`

Situational briefing and disagreement behavior.

Use for who objects, supports, contributes facts, remains silent, or asks for private follow-up in specific classes of scene.

### `crew.development`

Crew Development System data.

Use for Development Moments, operational experience triggers, mentorship conditions, professional strain, command-confidence changes, and unlocks.

### `command.styleReaction`

Officer reaction to Inspiration, Resolve, Values, and Directives.

Use when the command system needs to determine whether a player method is substantively appropriate for this officer and situation.

## Visibility

Visibility controls whether a card can appear in player-facing packets.

Allowed values:

- `publicPackage`: safe for package detail UI.
- `playerKnown`: known by the player in the current campaign.
- `playerDiscoverable`: not known yet, but may be revealed when gates are met.
- `directorOnly`: usable for Director reasoning but not narrator-safe by default.
- `lockedHidden`: locked until a reveal, mission, relationship, or development gate opens.

Visibility is not the same as audience. A card can be useful to Crew Director and unsafe for the narrator.

## Audiences

Allowed audiences:

- `missionDirector`
- `crewDirector`
- `shipDirector`
- `commandDirector`
- `narrator`
- `commandLog`

The packet builder must enforce audience separation. Hidden cards cannot enter narrator or Command Log packets just because they were relevant to a Director.

## Gates

Crew cards should use gates to prevent early disclosure or irrelevant retrieval.

Initial gate fields:

- `playerKnowledge`
- `relationshipMin`
- `developmentMin`
- `requiresRevealedFactIds`
- `blocksUntilFactIds`
- `requiresOutcomeIds`

Initial `playerKnowledge` values:

- `none`
- `serviceRecord`
- `professionalConversation`
- `highTrust`
- `crisisDisclosure`
- `revealed`

The senior staff bible's reveal ladder maps directly to these gates.

## Retrieval

Retrieval metadata defines how the card can be found.

Initial fields:

- `lanes`
- `keywords`
- `priority`
- `cooldown`

Useful crew lanes:

- `present_character`
- `department_constraint`
- `relationship_pressure`
- `development_moment`
- `voice_guidance`
- `bplot_hook`
- `coalition_rule`
- `command_style`
- `reveal_gate`

## Payload

Payload carries the usable content.

Initial fields:

- `summary`
- `constraints`
- `narratorSafe`
- `stateRefs`
- `effects`

Payload may grow by card type, but it should remain concise. Do not paste whole bible sections into a card.

## Indexes

Indexes are package-owned lookup aids.

Required indexes:

- `byOfficer`
- `byType`
- `byAudience`
- `byRevealGate`

Indexes should reference card ids. They exist so the runtime can quickly build candidate pools without scanning every card for every turn.

## Validation Expectations

First validator requirements:

- Dataset manifest kind and schema version are correct.
- Dataset package id matches the owning starship package.
- All source paths exist.
- All officer ids exist in the package crew roster.
- Relationship dimensions include the roster relationship dimensions.
- Development dimensions include the shared development model dimensions.
- Card ids are unique.
- Card `datasetId` matches the dataset manifest id.
- Card officer scopes reference known officers.
- `narrator` audience is blocked for `lockedHidden` cards.
- `crew.reveal` cards include a non-`none` player knowledge gate.
- Indexes only reference existing card ids.

## Current Bundle Coverage

The bundled Breckinridge dataset now covers all seven non-player senior officers.

Each officer currently has:

- one `crew.profile` card
- one `crew.voice` card
- one `crew.relationship` card for the player/XO relationship
- one `crew.reveal` card that remains locked
- one `crew.development` card for the officer's first growth pressure
- one `command.styleReaction` card for that officer's response to Inspiration, Resolve, and command pressure

This is enough to prove:

- narrator-safe voice guidance works without biography dumping.
- Crew Director receives relationship and development context.
- Mission Director receives mission-relevant profile, voice, relationship, and command-style context.
- High-trust material stays out of narrator packets.
- indexes and source refs are usable.

Run:

```powershell
node tools\scripts\validate-crew-dataset.mjs
node tools\scripts\test-crew-retrieval-fixture.mjs
```

The retrieval fixture runner loads all `tests/fixtures/retrieval/*.fixture.json` files by default, including the Whitaker ready-room scene and the full senior-staff briefing scene.

## Open Questions

- Should every officer eventually require `crew.bplot` and `crew.coalitionRule`, or should some card types remain optional by billet?
- Should relationship and development gates use numeric thresholds, named stages, or both?
- Should crew datasets be embedded in the starship package ZIP manifest or listed as package-adjacent payload files?
- Should Creator tools generate indexes automatically from cards?
- How strict should pre-alpha validation be before B-plot and coalition-rule cards exist for every officer?
