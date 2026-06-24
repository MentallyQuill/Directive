# Campaign State Projection

## Purpose

Campaign-state projection defines how a reusable campaign package becomes one specific playthrough save.

A campaign package is template data. A campaign save is authoritative state. Projection is the boundary between them.

## Artifacts

- Projection schema: [campaign-state-projection.schema.json](../../schemas/campaign/campaign-state-projection.schema.json)
- Ashes projection: [ashes-of-peace.campaign-projection.json](../../packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json)
- Glass Harbor projection: [drowned-constellation.campaign-projection.json](../../packages/bundled/glass-harbor/drowned-constellation.campaign-projection.json)
- Prelude graph: [prelude-a-ship-underway.mission-graph.json](../../packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json)
- Projection verifier: [validate-campaign-projection.mjs](../../tools/scripts/validate-campaign-projection.mjs)

## Boundary Rules

- Package templates are immutable during play.
- Campaign saves pin the package id and package version used at creation.
- Package-authored templates may be copied, referenced, generated, or derived into campaign-owned state.
- Structured campaign state is authoritative over narration.
- Hidden simulation values stay available to Director and adjudication logic but are not exposed in normal UI.

## Initial State Domains

The first projection initializes these top-level domains:

```text
campaign
activeCampaignPackage
player
crew
ship
mission
worldState
storyArcLedger
questLedger
dynamicQuestCatalog
knowledgeLedger
threadLedger
eventLedger
attentionState
runtimeTracking
relationships
commandCulture
commandStyle
values
directives
canon
campaignTracks
campaignAssets
turnLedger
commandLog
ui
settings
```

These domains match the open-world persistence model so the runtime can create bundled open-world campaigns without hardcoding package-specific state into UI code.

## Ashes Of Peace Projection

The current projection starts the campaign at stardate `53049.2` with the player slot requiring character creation. It initializes:

- The active package reference and pinned version.
- Breckenridge ship condition and unresolved technical debt.
- Senior crew ids and relationship dimensions.
- The prelude mission `prelude-a-ship-underway`.
- The active prelude graph `breckenridge.ashes-of-peace.prelude-a-ship-underway`.
- The starting phase `shuttle-rendezvous`.
- The active decision point `decision.arrival-tone`.
- Prelude outcome flags at graph default values.
- Prelude clocks at graph initial values.
- Ashes of Peace directives.
- Hidden campaign tracks using package starting values.
- Command Bearing starting state: Inspiration Rank I, Resolve Rank I, no Marks, no points, one-point reserve, rank thresholds, and empty award/spend/recovery ledgers.
- Campaign assets in the `unearned` state.
- Empty turn ledger and Command Log records.
- Simulation modes `Exploration` and `Command`.

## Glass Harbor Projection

The Glass Harbor projection starts Drowned Constellation at stardate `50192.6` with the player slot requiring character creation. It initializes:

- The active Glass Harbor package reference and pinned draft version.
- The U.S.S. Glass Harbor ship baseline and known constraints.
- Senior crew ids and relationship dimensions.
- The prelude mission `prelude-soundings`.
- The active prelude graph `glass-harbor.drowned-constellation.prelude-soundings`.
- Nerine Reef world state, route data, fronts, story arcs, quest ledger, knowledge ledger, and thread ledger.
- Campaign directives around civilian life, route safety, concealed settlements, lawful cooperation, navigation infrastructure, Captain Rhos, and evidence preservation.
- Empty turn ledger and Command Log records.
- Simulation modes `Exploration` and `Command`.

## Validation

Run:

```powershell
node tools\scripts\validate-campaign-projection.mjs packages\bundled\breckenridge\ashes-of-peace.campaign-projection.json packages\bundled\breckenridge\ashes-of-peace.campaign-package.json
node tools\scripts\validate-campaign-projection.mjs packages\bundled\glass-harbor\drowned-constellation.campaign-projection.json packages\bundled\glass-harbor\drowned-constellation.campaign-package.json
```

The verifier checks the projection against the bundled package and the active mission graph, then enforces the package/campaign boundary. It is intentionally dependency-free until the repo has a package manager and full JSON Schema validator.
