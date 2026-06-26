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
  [world](../../schemas/world/world.schema.json),
  [story](../../schemas/story/story-arcs.schema.json),
  [quests](../../schemas/quests/quest-ledger.schema.json),
  [threads](../../schemas/threads/thread-templates.schema.json),
  [reactions](../../schemas/reactions/reaction-rules.schema.json),
  [endings](../../schemas/endings/end-conditions.schema.json),
  [guardrails](../../schemas/packages/guardrails.schema.json),
  [assets](../../schemas/packages/assets.schema.json)
- Bundled package records:
  [ashes-of-peace.campaign-package.json](../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json),
  [drowned-constellation.campaign-package.json](../../packages/bundled/glass-harbor/drowned-constellation.campaign-package.json)
- Bundled mission graphs:
  [prelude-a-ship-underway.mission-graph.json](../../packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json),
  [prelude-soundings.mission-graph.json](../../packages/bundled/glass-harbor/mission-graphs/prelude-soundings.mission-graph.json),
  [chapter-1-aster-basin.mission-graph.json](../../packages/bundled/glass-harbor/mission-graphs/chapter-1-aster-basin.mission-graph.json),
  [chapter-2-caligo-sounding.mission-graph.json](../../packages/bundled/glass-harbor/mission-graphs/chapter-2-caligo-sounding.mission-graph.json)
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
endConditions
questTemplates
threadTemplates
reactionRules
directorCards
contextPolicy
guardrails
assets
```

The JSON Schema makes this top-level spine strict. The root schema is intentionally a thin composition wrapper; field-level structure lives in focused domain schema files so the contract can grow without becoming a single massive owner.

Nested payloads are still allowed to evolve during pre-alpha while we refine mission graphs, quest generation, relationship initialization, end-condition records, and package assets.

The `endConditions` root is required. It defines terminal candidates, authored completions, checkpoint replay policy, snapshot-retention expectations, Push On continuation frames, final-band mapping, and player-safe recovery copy. The product behavior is defined in [Campaign End Conditions](../design/CAMPAIGN_END_CONDITIONS.md).

## Bundled Campaign Packages

The primary playable bundled package is:

```text
packages/bundled/breckenridge/ashes-of-peace.campaign-package.json
```

It includes:

- Manifest identity for `directive.campaignPackage`.
- U.S.S. Breckenridge ship baseline.
- Locked senior crew roster, fixed public identity facts, and transfer-cohort structure.
- Package-defined Character Creator context for the locked incoming XO role.
- Ashes of Peace open-world story shell.
- World state, story arc, quest, thread, reaction, and context policy content from the campaign source.
- End-condition records, continuation frames, checkpoint policy, and final-band rules.
- Authored standing quest templates plus dynamic quest constraints.
- Recurring shipboard thread template entries.
- Mission direction, hidden-information, failure, and player-facing guardrails.
- Ending axes, finale/epilogue convergence data, and formal end-condition records.

Known package-development placeholders are kept explicit. Non-draft package manifests must not carry unresolved visual-asset placeholders; draft packages may list unresolved assets, but visible asset paths should point only at files that exist.

The bundled draft package set includes:

```text
packages/bundled/glass-harbor/drowned-constellation.campaign-package.json
packages/bundled/serein/black-current.campaign-package.json
packages/bundled/eudora-vale/broken-accord.campaign-package.json
packages/bundled/aster-vale/unseen-border.campaign-package.json
packages/bundled/celandine/enemys-garden.campaign-package.json
```

The Glass Harbor package remains the most detailed second package example. It includes:

- Manifest identity for `directive.campaignPackage`.
- U.S.S. Glass Harbor ship baseline.
- Package-defined Character Creator context for a newly promoted Commander/XO who becomes Acting Captain after the prelude.
- Drowned Constellation open-world story shell.
- Nerine Reef world state, routes, fronts, factions, actors, story arcs, quest templates, thread templates, reaction rules, Director cards, context policy, guardrails, and assets.
- Draft end-condition records, continuation frames, checkpoint policy, and final-band rules derived from the ending source notes.
- Three baseline tactical mission graphs: Prelude Soundings, Chapter 1 Aster Basin, and Chapter 2 Caligo Sounding.

Known draft placeholders are kept explicit in package-local READMEs and authoring references, including richer crew reveal cards, deeper tactical graph authoring, playtest tuning, and any visual asset gaps before playtest promotion.

## Validation

Run:

```powershell
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\breckenridge\ashes-of-peace.campaign-package.json
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\glass-harbor\drowned-constellation.campaign-package.json
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\serein\black-current.campaign-package.json
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\eudora-vale\broken-accord.campaign-package.json
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\aster-vale\unseen-border.campaign-package.json
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\celandine\enemys-garden.campaign-package.json
node tools\scripts\test-bundled-package-registry.mjs
node tools\scripts\test-campaign-package-importer.mjs
node tools\scripts\test-package-update-diagnostics.mjs
```

The verifier is dependency-free and checks bundled packages against the schema contract. Ashes-specific invariant checks are gated to the Ashes reference package, while Glass Harbor, Serein, Eudora Vale, Aster Vale, and Celandine validate as separate bundled draft packages in the alpha gate. It is not a full JSON Schema implementation. When the repo has a package/runtime toolchain, we can add a full JSON Schema validator such as Ajv and keep this script as a fast product-contract smoke test.

Current product-contract checks include:

- Required top-level package spine.
- Root schema remains a thin split-schema composition wrapper.
- Required split schema files exist, declare `$id`, and have resolvable nested `$ref` targets.
- Manifest kind, schema version, bundled flag, and `.directive-campaign.zip` transport extension.
- Source document paths exist.
- Ship is U.S.S. Breckenridge with opening stardate `53049.2`.
- Bundled hero ship registries are concrete NCC identifiers and align with their initial campaign projections.
- Locked senior crew entries are present with rank, billet, species, status, and non-player public profile data.
- Relationship dimensions include professional confidence, integrity trust, and personal rapport.
- Character Creator is package-defined with the Ashes of Peace locked Commander/XO role, required creator fields, allowed species, career backgrounds, formative experiences, assignment reasons, trait choices, dossier boundaries, generation guardrails, and local fallback templates.
- Ashes of Peace campaign id, theater, story arcs, quest templates, campaign assets, and source-derived starting values.
- Prelude, authored story arcs, standing quests, thread templates, and dynamic quest policy are present.
- Quest template references resolve to known package ids and permitted actors, locations, or factions.
- Mission graph references resolve to known bundled graph ids.
- Quest policy requires state inheritance and outcome persistence.
- Simulation modes are exactly `Exploration` and `Command`.
- Ashes of Peace has required end-condition records, continuation frames, ending axes, and convergence data.
- Draft package/projection/dataset/mission-graph ids align and validate through the same package contract, with package-specific caveats tracked in package READMEs and authoring references.

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
- Deepen end-condition schemas for richer cross-reference validation, runtime diagnostics, and host action metadata.
- Deepen mission graph schemas for competence metadata, state deltas, pressure seeds, Director response packets, fact revelation, and phase advancement.
- Extend runtime package management beyond the current import UI with export, delete, update comparison, and richer trust review.
- Add compressed-ZIP support if needed for imported packages outside the current stored-entry test path.
- Continue deepening the senior crew dataset with B-plot and coalition-rule cards using [Crew Dataset Contract](CREW_DATASET_CONTRACT.md).
- Add a full JSON Schema validator once a JavaScript package/tooling baseline exists.
