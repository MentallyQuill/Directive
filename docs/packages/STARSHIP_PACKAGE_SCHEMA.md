# Starship Package Schema

## Status

Directive now has the first concrete schema process artifacts for bundled starship packages:

- Root schema: [starship-package.schema.json](../../schemas/starship-package.schema.json)
- Split schema domains:
  [common](../../schemas/common/common.schema.json),
  [manifest](../../schemas/packages/manifest.schema.json),
  [ship](../../schemas/packages/ship.schema.json),
  [crew](../../schemas/packages/crew.schema.json),
  [director card](../../schemas/packages/director-card.schema.json),
  [crew dataset](../../schemas/packages/crew-dataset.schema.json),
  [mission graph](../../schemas/mission/mission-graph.schema.json),
  [main campaign](../../schemas/campaign/main-campaign.schema.json),
  [side mission rules](../../schemas/packages/side-mission-rules.schema.json),
  [mission templates](../../schemas/mission/mission-templates.schema.json),
  [guardrails](../../schemas/packages/guardrails.schema.json),
  [assets](../../schemas/packages/assets.schema.json)
- Bundled package skeleton: [ashes-of-peace.starship-package.json](../../packages/bundled/breckinridge/ashes-of-peace.starship-package.json)
- Bundled prelude graph: [prelude-a-ship-underway.mission-graph.json](../../packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json)
- Verifier: [validate-starship-package.mjs](../../tools/scripts/validate-starship-package.mjs)

This is schema v1, not the final runtime package loader. The goal is to establish a stable data contract before implementing package import, campaign creation, or Mission Director runtime behavior.

## Top-Level Spine

Every starship package must use the approved top-level JSON spine:

```text
manifest
ship
crew
mainCampaign
sideMissionRules
missionTemplates
guardrails
assets
```

The JSON Schema makes this top-level spine strict. The root schema is intentionally a thin composition wrapper; field-level structure lives in focused domain schema files so the contract can grow without becoming a single massive owner.

Nested payloads are still allowed to evolve during pre-alpha while we refine mission graphs, side mission generation, relationship initialization, and package assets.

## Bundled Campaign Package

The first bundled package is:

```text
packages/bundled/breckinridge/ashes-of-peace.starship-package.json
```

It includes:

- Manifest identity for `directive.starshipPackage`.
- U.S.S. Breckinridge ship baseline.
- Locked senior crew roster and transfer-cohort structure.
- Ashes of Peace campaign shell.
- Campaign state tracks and starting values from the campaign source.
- Three Open Orders intervals.
- Nine designed side assignment templates.
- Recurring shipboard B-plot template entries.
- Mission direction, hidden-information, failure, and player-facing guardrails.

Known pre-alpha placeholders are kept explicit, such as the Breckinridge registry number and Compact Unity opening value.

## Validation

Run:

```powershell
node tools\scripts\validate-starship-package.mjs
```

The verifier is dependency-free and checks the bundled package against the schema contract and Ashes of Peace invariants. It is not a full JSON Schema implementation. When the repo has a package/runtime toolchain, we can add a full JSON Schema validator such as Ajv and keep this script as a fast product-contract smoke test.

Current product-contract checks include:

- Required top-level package spine.
- Root schema remains a thin split-schema composition wrapper.
- Required split schema files exist, declare `$id`, and have resolvable nested `$ref` targets.
- Manifest kind, schema version, bundled flag, and `.directive-starship.zip` transport extension.
- Source document paths exist.
- Ship is U.S.S. Breckinridge with opening stardate `53049.2`.
- Null pre-alpha registry is tracked as an explicit production decision.
- Locked senior crew entries are present.
- Relationship dimensions include professional trust, confidence in judgment, and personal rapport.
- Ashes of Peace campaign id, theater, state tracks, campaign assets, and source-derived starting values.
- Prelude, chapters, Open Orders intervals, finale, and epilogue are present.
- Three Open Orders intervals contain three designed side assignments each.
- Open Orders chapter and side-assignment references resolve to known package ids.
- Main chapter templates resolve to known mission template ids.
- Side mission policy requires state inheritance and outcome persistence.
- Simulation modes are exactly `Exploration` and `Command`.

## Next Schema Work

Next package-schema steps:

- Decide how to represent unresolved pre-alpha placeholders without allowing accidental release as complete data.
- Deepen mission graph schemas for state deltas, Director response packets, fact revelation, and phase advancement.
- Continue deepening the senior crew dataset with B-plot and coalition-rule cards using [Crew Dataset Contract](CREW_DATASET_CONTRACT.md).
- Add a full JSON Schema validator once a JavaScript package/tooling baseline exists.
