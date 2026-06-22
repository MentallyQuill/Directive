# Campaign Package Schema

## Status

Directive now has the first concrete schema process artifacts for bundled campaign packages:

- Root schema: [campaign-package.schema.json](../../schemas/campaign-package.schema.json)
- Split schema domains:
  [common](../../schemas/common/common.schema.json),
  [manifest](../../schemas/packages/manifest.schema.json),
  [ship](../../schemas/packages/ship.schema.json),
  [crew](../../schemas/packages/crew.schema.json),
  [character creation](../../schemas/packages/character-creation.schema.json),
  [director card](../../schemas/packages/director-card.schema.json),
  [crew dataset](../../schemas/packages/crew-dataset.schema.json),
  [mission graph](../../schemas/mission/mission-graph.schema.json),
  [world](../../schemas/world/world-state.schema.json),
  [story](../../schemas/story/story-arc-ledger.schema.json),
  [quests](../../schemas/quests/quest-ledger.schema.json),
  [threads](../../schemas/threads/thread-ledger.schema.json),
  [reactions](../../schemas/reactions/reaction-rules.schema.json),
  [guardrails](../../schemas/packages/guardrails.schema.json),
  [assets](../../schemas/packages/assets.schema.json)
- Bundled package skeleton: [ashes-of-peace.campaign-package.json](../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json)
- Bundled prelude graph: [prelude-a-ship-underway.mission-graph.json](../../packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json)
- Verifier: [validate-campaign-package.mjs](../../tools/scripts/validate-campaign-package.mjs)
- Import normalizer: [campaign-package-importer.mjs](../../src/packages/campaign-package-importer.mjs)
- Package diagnostics: [package-diagnostics.mjs](../../src/packages/package-diagnostics.mjs)

This is schema v2 and the first open-world pre-alpha runtime package path. The goal is to keep bundled packages, imported packages, and future Creator-made packages on the same strict data contract while deeper field schemas continue to evolve.

## Top-Level Spine

Every campaign package must use the approved top-level JSON spine:

```text
manifest
ship
crew
characterCreation
world
storyArcs
questTemplates
threadTemplates
reactionRules
directorCards
contextPolicy
guardrails
assets
```

The JSON Schema makes this top-level spine strict. The root schema is intentionally a thin composition wrapper; field-level structure lives in focused domain schema files so the contract can grow without becoming a single massive owner.

Nested payloads are still allowed to evolve during pre-alpha while we refine mission graphs, quest generation, relationship initialization, and package assets.

## Bundled Campaign Package

The first bundled package is:

```text
packages/bundled/breckenridge/ashes-of-peace.campaign-package.json
```

It includes:

- Manifest identity for `directive.campaignPackage`.
- U.S.S. Breckenridge ship baseline.
- Locked senior crew roster and transfer-cohort structure.
- Package-defined Character Creator context for the locked incoming XO role.
- Ashes of Peace open-world story shell.
- World state, story arc, quest, thread, reaction, and context policy content from the campaign source.
- Authored standing quest templates plus dynamic quest constraints.
- Recurring shipboard thread template entries.
- Mission direction, hidden-information, failure, and player-facing guardrails.

Known pre-alpha placeholders are kept explicit, such as the Breckenridge registry number and Compact Unity opening value.

## Validation

Run:

```powershell
node tools\scripts\validate-campaign-package.mjs
node tools\scripts\test-campaign-package-importer.mjs
node tools\scripts\test-package-update-diagnostics.mjs
```

The verifier is dependency-free and checks the bundled package against the schema contract and Ashes of Peace invariants. It is not a full JSON Schema implementation. When the repo has a package/runtime toolchain, we can add a full JSON Schema validator such as Ajv and keep this script as a fast product-contract smoke test.

Current product-contract checks include:

- Required top-level package spine.
- Root schema remains a thin split-schema composition wrapper.
- Required split schema files exist, declare `$id`, and have resolvable nested `$ref` targets.
- Manifest kind, schema version, bundled flag, and `.directive-campaign.zip` transport extension.
- Source document paths exist.
- Ship is U.S.S. Breckenridge with opening stardate `53049.2`.
- Null pre-alpha registry is tracked as an explicit production decision.
- Locked senior crew entries are present.
- Relationship dimensions include professional confidence, integrity trust, and personal rapport.
- Character Creator is package-defined with the Ashes of Peace locked Commander/XO role, required creator fields, allowed species, career backgrounds, formative experiences, assignment reasons, trait choices, dossier boundaries, generation guardrails, and local fallback templates.
- Ashes of Peace campaign id, theater, story arcs, quest templates, campaign assets, and source-derived starting values.
- Prelude, authored story arcs, standing quests, thread templates, and dynamic quest policy are present.
- Quest template references resolve to known package ids and permitted actors, locations, or factions.
- Mission graph references resolve to known bundled graph ids.
- Quest policy requires state inheritance and outcome persistence.
- Simulation modes are exactly `Exploration` and `Command`.

## Import And Update Diagnostics

The pre-alpha importer accepts `.directive-campaign.zip` transports through `normalizeCampaignPackageZip` and decoded archive entries through `normalizeCampaignPackageArchive`.

Current import rules:

- The transport filename must end in `.directive-campaign.zip`.
- Archive paths must be relative and cannot contain traversal segments.
- Active content is rejected, including scripts, HTML, executable files, scriptable SVG, and WASM.
- The archive must contain exactly one package root JSON payload: either `package.json` or a `.campaign-package.json` file.
- Package JSON must satisfy the top-level spine and manifest invariants.
- Optional expected package id checks reject mismatched package records.

The current ZIP reader intentionally supports stored entries for the pre-alpha test path. Runtime import UI and broader ZIP compression support can be added later without changing the normalized package-record contract.

Package diagnostics are exposed in the Campaign view as package health. They currently report:

- Invalid package spine or manifest identity.
- Projection/package id mismatch.
- Crew dataset/package id mismatch.
- Mission graph/package id mismatch.
- Active campaign package id mismatch.
- Active campaign package-version drift.
- Missing active mission graph id when mission graph records are available.

For alpha package updates, campaign state remains authoritative. Newer package data may be read only when referenced ids still exist; diagnostics report drift instead of mutating saves.

## Competence And Pressure Authoring Notes

Mission graphs may provide `competencePolicy` metadata for consequential decisions. The runtime treats this metadata as package-owned source data and builds a player-safe `competencePacket` from the current scene plus campaign-owned state.

Author competence metadata as separate concerns:

- `routineProcedures`: professional actions the player character would reasonably perform without being told.
- `professionalKnowledge`: routine context the XO should already know.
- `domainReports`: compact officer counsel that can be selected by active phase, decision point, request scope, implicated officers, player input, and active pressure state.
- `commandQuestions`: the actual judgment left to the player.
- `briefFacts`, `briefUncertainties`, and `operationalPressures`: Command Brief inputs, not hidden answer keys.
- `warningRules`, `authorityNotes`, and `anchoredRiskRules`: fair-warning support for serious departures, command boundaries, and risks that survive narration rewrites or Command Bearing spends.

Domain Reports can reference active campaign pressures with fields such as `pressureIds`, `pressureTags`, `pressureCrewIds`, and `pressureSystemIds`. These references should be player-safe. They make current unresolved pressure influence later counsel without turning side-pressure selection into a random mission picker.

Pressure state is campaign-owned. Package data may define pressure ids, side-assignment template matches, chapter/phase links, and authored language, but committed records live in `pressureLedger` and must survive save/load, branch, rerun, and delete through the turn transaction system.

Pressure records should provide:

- Stable `id`, `type`, and `source` values.
- Player-facing summaries written only from facts the player can know.
- Director summaries for private causal tracking.
- Named urgency and escalation bands rather than exposed numeric scores.
- Links to relevant crew, ship systems, facts, future phases, decision points, chapters, and side templates when those links are safe for routing.

Never put director-only truth in player-facing Command Briefs, Domain Reports, Command Log text, or pressure summaries. For Ashes of Peace, that means the Lantern, forged Starfleet-signal mechanism, Compact recovery truth, missing transponder module, and no-pathogen truth stay hidden until the campaign state reveals them.

## Next Schema Work

Next package-schema steps:

- Decide how to represent unresolved pre-alpha placeholders without allowing accidental release as complete data.
- Deepen mission graph schemas for competence metadata, state deltas, pressure seeds, Director response packets, fact revelation, and phase advancement.
- Extend runtime package management beyond the current import UI with export, delete, update comparison, and richer trust review.
- Add compressed-ZIP support if needed for imported packages outside the current stored-entry test path.
- Continue deepening the senior crew dataset with B-plot and coalition-rule cards using [Crew Dataset Contract](CREW_DATASET_CONTRACT.md).
- Add a full JSON Schema validator once a JavaScript package/tooling baseline exists.
