# Campaign Authoring Guide

This guide explains how to build a Directive campaign package. It is the author-facing counterpart to the Operator's Manual and the Technical Manual.

Directive campaign packages are data-only campaign engines: they define the ship or station, crew, player role, region, story arcs, quests, end conditions, threads, reaction rules, Director cards, context policy, guardrails, and assets that the runtime uses to run a persistent command RPG.

Runtime examples in this guide use the final SillyTavern-hosted documentation renders under `assets/documentation/renders/`.

## What A Campaign Package Is

A Directive campaign package is reusable source data. It is not a save, not a transcript, and not a one-off prompt.

The package defines what can exist at campaign start and what the runtime can draw from. The campaign save records what happened in a specific playthrough.

## Bundled Reference Packages

The primary playable reference package is Ashes of Peace:

- package JSON: `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`
- campaign projection: `packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json`
- crew dataset: `packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json`
- mission graphs:
  - `packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json`
  - `packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json`
  - `packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json`
- authoring source folders:
  - `content/campaigns/breckenridge/campaign`
  - `content/campaigns/breckenridge/crew`
  - `content/campaigns/breckenridge/guardrails`
  - `content/campaigns/breckenridge/missions`
  - `content/campaigns/breckenridge/quests`
  - `content/campaigns/breckenridge/side-missions`

The second bundled draft package is Drowned Constellation:

- package JSON: `packages/bundled/glass-harbor/drowned-constellation.campaign-package.json`
- campaign projection: `packages/bundled/glass-harbor/drowned-constellation.campaign-projection.json`
- crew dataset: `packages/bundled/glass-harbor/glass-harbor-senior-staff.crew-dataset.json`
- mission graphs:
  - `packages/bundled/glass-harbor/mission-graphs/prelude-soundings.mission-graph.json`
  - `packages/bundled/glass-harbor/mission-graphs/chapter-1-aster-basin.mission-graph.json`
  - `packages/bundled/glass-harbor/mission-graphs/chapter-2-caligo-sounding.mission-graph.json`
- authoring source folders:
  - `content/campaigns/glass-harbor/campaign`
  - `content/campaigns/glass-harbor/crew`
  - `content/campaigns/glass-harbor/guardrails`
  - `content/campaigns/glass-harbor/missions`
  - `content/campaigns/glass-harbor/quests`
  - `content/campaigns/glass-harbor/side-missions`
  - `content/campaigns/glass-harbor/world`

Glass Harbor is bundled and runtime-registered, but it remains `draft`: its senior-staff bible and crew dataset now use the rich six-card character structure, while mission graphs and playtest tuning still need promotion work. Its End Conditions root has been updated to the current checkpoint, Push On, and final-band contract.

The third bundled draft package is Black Current:

- package JSON: `packages/bundled/serein/black-current.campaign-package.json`
- campaign projection: `packages/bundled/serein/black-current.campaign-projection.json`
- crew dataset: `packages/bundled/serein/serein-senior-staff.crew-dataset.json`
- mission graphs:
  - `packages/bundled/serein/mission-graphs/prelude-wreckfall.mission-graph.json`
  - `packages/bundled/serein/mission-graphs/chapter-1-first-manifest.mission-graph.json`
  - `packages/bundled/serein/mission-graphs/chapter-2-forty-seven-hours-late.mission-graph.json`
- authoring source folders:
  - `content/campaigns/serein/campaign`
  - `content/campaigns/serein/crew`
  - `content/campaigns/serein/guardrails`
  - `content/campaigns/serein/missions`
  - `content/campaigns/serein/quests`
  - `content/campaigns/serein/side-missions`
  - `content/campaigns/serein/world`

Serein is bundled and runtime-registered, but it remains `draft`: its senior-staff bible and crew dataset now use the rich six-card character structure, while tactical graphs and playtest tuning still need promotion work. Its End Conditions root has been updated to the current checkpoint, Push On, and final-band contract.

The fourth bundled draft package is Broken Accord:

- package JSON: `packages/bundled/eudora-vale/broken-accord.campaign-package.json`
- campaign projection: `packages/bundled/eudora-vale/broken-accord.campaign-projection.json`
- crew dataset: `packages/bundled/eudora-vale/eudora-vale-senior-staff.crew-dataset.json`
- mission graphs:
  - `packages/bundled/eudora-vale/mission-graphs/prelude-the-captains-chair.mission-graph.json`
  - `packages/bundled/eudora-vale/mission-graphs/chapter-1-bread-and-weather.mission-graph.json`
  - `packages/bundled/eudora-vale/mission-graphs/chapter-2-the-weight-of-water.mission-graph.json`
- authoring source folders:
  - `content/campaigns/eudora-vale/campaign`
  - `content/campaigns/eudora-vale/crew`
  - `content/campaigns/eudora-vale/guardrails`
  - `content/campaigns/eudora-vale/missions`
  - `content/campaigns/eudora-vale/quests`
  - `content/campaigns/eudora-vale/side-missions`
  - `content/campaigns/eudora-vale/world`

Eudora Vale is bundled and runtime-registered, but it remains `draft`: its senior-staff bible and crew dataset now use the rich six-card character structure, while known-crew continuity playtesting, tactical graphs, and pacing still need promotion work. Its End Conditions root has been updated to the current checkpoint, Push On, and final-band contract.

The fifth bundled draft package is Unseen Border:

- package JSON: `packages/bundled/aster-vale/unseen-border.campaign-package.json`
- campaign projection: `packages/bundled/aster-vale/unseen-border.campaign-projection.json`
- crew dataset: `packages/bundled/aster-vale/aster-vale-senior-staff.crew-dataset.json`
- mission graphs:
  - `packages/bundled/aster-vale/mission-graphs/prelude-the-blank-route.mission-graph.json`
  - `packages/bundled/aster-vale/mission-graphs/chapter-1-the-missing-colony.mission-graph.json`
  - `packages/bundled/aster-vale/mission-graphs/chapter-2-haldens-shuttle.mission-graph.json`
- authoring source folders:
  - `content/campaigns/aster-vale/campaign`
  - `content/campaigns/aster-vale/crew`
  - `content/campaigns/aster-vale/guardrails`
  - `content/campaigns/aster-vale/missions`
  - `content/campaigns/aster-vale/quests`
  - `content/campaigns/aster-vale/side-missions`
  - `content/campaigns/aster-vale/world`

Aster Vale is bundled and runtime-registered, but it remains `draft`: its senior-staff bible and crew dataset now include rich voice capsules and strengthened six-card character payloads, while playtest and tactical graph tuning remain open. Its End Conditions root has been updated to the current checkpoint, Push On, and final-band contract.

The sixth bundled draft package is Enemy's Garden:

- package JSON: `packages/bundled/celandine/enemys-garden.campaign-package.json`
- campaign projection: `packages/bundled/celandine/enemys-garden.campaign-projection.json`
- crew dataset: `packages/bundled/celandine/celandine-senior-staff.crew-dataset.json`
- mission graphs:
  - `packages/bundled/celandine/mission-graphs/prelude-the-first-harvest.mission-graph.json`
  - `packages/bundled/celandine/mission-graphs/chapter-1-the-old-seed.mission-graph.json`
  - `packages/bundled/celandine/mission-graphs/chapter-2-a-marker-in-the-blood.mission-graph.json`
- authoring source folders:
  - `content/campaigns/celandine/campaign`
  - `content/campaigns/celandine/crew`
  - `content/campaigns/celandine/guardrails`
  - `content/campaigns/celandine/missions`
  - `content/campaigns/celandine/quests`
  - `content/campaigns/celandine/side-missions`
  - `content/campaigns/celandine/world`

Celandine is bundled and runtime-registered, but it remains `draft`: its senior-staff bible and crew dataset now include rich voice capsules, a player authority boundary, and strengthened six-card character payloads, while playtest and tactical graph tuning remain open. Its End Conditions root has been updated to the current checkpoint, Push On, and final-band contract.

Authoring example:

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-campaign-library.png" alt="Ashes of Peace package detail in Campaign Library">
</p>

## Authoring Workflow

### 1. Define The Campaign Promise

Write the campaign in one sentence:

- who the player is;
- what command responsibility they carry;
- what vessel/station/operational base anchors play;
- what region or crisis frames the campaign;
- what kind of pressure the campaign repeatedly tests.

Ashes of Peace promise: the player is the incoming Commander/XO of the U.S.S. Breckenridge in the Asterion Reach, dealing with a humanitarian and political crisis around the Pale Lantern.

### 2. Define The Player Role

Directive needs a command role that preserves player agency. The package should specify:

- billet;
- authority;
- reporting line;
- why the role matters;
- what the model must never write for the player;
- what routine competence the character can assume.

For Ashes of Peace, the player is the incoming Commander/XO and principal mission commander. Captain Whitaker remains legal captain.

### 3. Define The Ship Or Station

Author:

- id, name, class, registry if known;
- affiliation and era;
- mission profile;
- key systems;
- capabilities;
- constraints;
- known damage or technical debt;
- player-safe summary;
- image asset references.

Ship data is package-owned at start. Damage, repairs, restrictions, and technical debt become campaign-owned once play begins.

### 4. Define Senior Crew

Crew records should support play, not just biography. Author:

- rank, billet, division, public role;
- player-safe summary;
- private Director notes when needed;
- voice;
- relationship dimensions;
- reveal gates;
- development dimensions;
- pressure hooks;
- portrait asset references.

Do not expose raw relationship numbers or hidden backstory in player-facing fields.

Authoring example:

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-crew-roster.png" alt="Crew roster and selected officer dossier from package data">
</p>

### 5. Define Character Creator Context

The `characterCreation` root drives the player officer setup. Include:

- role mode;
- role copy;
- allowed species;
- career backgrounds;
- formative experiences;
- assignment reasons;
- trait choices;
- flaw options;
- dossier field boundaries;
- generation guardrails;
- local fallback text.

Authoring examples:

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-character-creator-identity.png" alt="Character Creator identity options">
</p>

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-character-creator-service.png" alt="Character Creator service options">
</p>

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-character-creator-personality.png" alt="Character Creator personality options">
</p>

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-character-creator-review.png" alt="Character Creator review dossier">
</p>

### 6. Define The World

The `world` root should define:

- region id and title;
- opening location;
- locations and routes;
- factions;
- actors;
- fronts;
- clocks;
- state tracks;
- everyday life and local texture.

Each item needs player-safe summaries and hidden/Director-only fields only where the schema allows them.

### 7. Define Story Arcs

Story arcs describe large campaign movements. They should provide:

- stable ids;
- labels and summaries;
- phase/chapter relationships;
- reveal and progression rules;
- stakes;
- linked quests, threads, fronts, and actors.

Story arcs are not rails. They orient Director behavior and package context.

### 8. Define End Conditions

End conditions describe when a campaign branch could conclude, fail, transform, or move into checkpoint replay. They should not be hardcoded traps.

Author:

- authored completion paths;
- terminal candidate families;
- fair-warning requirements;
- checkpoint policy with preferred source, fallback sources, and snapshot-retention expectations;
- push-on policy;
- continuation frames;
- final outcome band rules;
- ending-axis effects;
- player-safe recovery copy;
- Director-only edge-case notes.

End conditions should answer:

- what could make this branch feel over;
- whether the event is truly terminal or only a severe transformation;
- what checkpoint should be offered;
- how long the replay snapshot should be retained;
- whether the player can push on;
- what playable frame remains if they push on;
- how the final result maps to the six outcome bands.

Use the required `endConditions` package root for this material. The root must define the result bands, default checkpoint policy, continuation frames, and condition records the runtime can evaluate after committed turns.

Use the [Campaign End Conditions](../design/CAMPAIGN_END_CONDITIONS.md) contract for terminal outcomes, checkpoint replay, `Push On`, final outcome bands, and Ashes of Peace examples.

### 9. Define Quest Templates

Quest templates are reusable or authored mission structures. They should specify:

- id, title, summary;
- scope and type;
- starting predicates;
- objectives;
- participant constraints;
- location/faction/actor links;
- possible outcomes;
- state inheritance rules;
- mission graph references when available.

Open-world quests should inherit current campaign state rather than creating isolated mission bubbles.

Authoring example:

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-mission-open-world.png" alt="Mission Open World authored opportunities">
</p>

### 10. Define Thread Templates

Thread templates support ongoing concerns, crew threads, ship threads, story concerns, and potential future quests.

Author:

- shape;
- title;
- source conditions;
- visibility policy;
- engagement triggers;
- promotion rules;
- related crew, ship systems, facts, locations, and arcs.

Hidden or latent thread material must not appear in player-facing Open Threads until activated or engaged.

Authoring example:

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-mission-open-threads.png" alt="Mission Open Threads from authored thread templates">
</p>

### 11. Define Reaction Rules

Reaction rules let the world respond to events. They should be deterministic where possible and bounded where model-assisted.

Author:

- trigger events;
- predicates;
- effects;
- cooldowns or limits;
- player-safe outputs;
- hidden state effects only where authorized.

### 12. Define Director Cards

Director cards provide compact, retrievable guidance. They can include mission, crew, ship, command, narrator, and log guidance.

Good Director cards are:

- scoped;
- tagged;
- audience-labeled;
- visibility-aware;
- concise enough to retrieve;
- linked to package ids;
- explicit about what not to reveal.

### 13. Define Context Policy

Context policy decides how package data becomes prompt context.

Define:

- what belongs in contract blocks;
- what belongs in immediate scene blocks;
- what belongs in continuity blocks;
- what belongs in regional context;
- token budget rules;
- hidden-state exclusion rules.

### 14. Define Guardrails

Guardrails should cover:

- player agency;
- command authority;
- setting/canon constraints;
- hidden truth;
- safety boundaries;
- failure-forward behavior;
- tone;
- narration constraints.

Guardrails are not just prose. They should be usable by runtime prompt context, Director packets, and package diagnostics.

### 15. Define Assets

Assets may include:

- campaign banners;
- package cards;
- ship images;
- crew portraits;
- icons;
- documentation images.

Use passive assets only. Package import rejects active content such as scripts, HTML, executables, scriptable SVG, and WASM.

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-package-asset-fallback.png" alt="package asset manifest examples and missing-runtime-image fallback behavior">
</p>

### 16. Validate And Import

Run:

```powershell
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\breckenridge\ashes-of-peace.campaign-package.json
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\glass-harbor\drowned-constellation.campaign-package.json
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\serein\black-current.campaign-package.json
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\eudora-vale\broken-accord.campaign-package.json
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\aster-vale\unseen-border.campaign-package.json
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\celandine\enemys-garden.campaign-package.json
node tools\scripts\validate-campaign-projection.mjs packages\bundled\breckenridge\ashes-of-peace.campaign-projection.json packages\bundled\breckenridge\ashes-of-peace.campaign-package.json
node tools\scripts\validate-campaign-projection.mjs packages\bundled\glass-harbor\drowned-constellation.campaign-projection.json packages\bundled\glass-harbor\drowned-constellation.campaign-package.json
node tools\scripts\validate-campaign-projection.mjs packages\bundled\eudora-vale\broken-accord.campaign-projection.json packages\bundled\eudora-vale\broken-accord.campaign-package.json
node tools\scripts\validate-campaign-projection.mjs packages\bundled\aster-vale\unseen-border.campaign-projection.json packages\bundled\aster-vale\unseen-border.campaign-package.json
node tools\scripts\validate-campaign-projection.mjs packages\bundled\celandine\enemys-garden.campaign-projection.json packages\bundled\celandine\enemys-garden.campaign-package.json
node tools\scripts\validate-crew-dataset.mjs schemas\packages\crew-dataset.schema.json packages\bundled\breckenridge\ashes-of-peace.campaign-package.json packages\bundled\breckenridge\breckenridge-senior-staff.crew-dataset.json
node tools\scripts\validate-crew-dataset.mjs schemas\packages\crew-dataset.schema.json packages\bundled\glass-harbor\drowned-constellation.campaign-package.json packages\bundled\glass-harbor\glass-harbor-senior-staff.crew-dataset.json
node tools\scripts\validate-crew-dataset.mjs schemas\packages\crew-dataset.schema.json packages\bundled\eudora-vale\broken-accord.campaign-package.json packages\bundled\eudora-vale\eudora-vale-senior-staff.crew-dataset.json
node tools\scripts\validate-crew-dataset.mjs schemas\packages\crew-dataset.schema.json packages\bundled\aster-vale\unseen-border.campaign-package.json packages\bundled\aster-vale\aster-vale-senior-staff.crew-dataset.json
node tools\scripts\validate-crew-dataset.mjs schemas\packages\crew-dataset.schema.json packages\bundled\celandine\enemys-garden.campaign-package.json packages\bundled\celandine\celandine-senior-staff.crew-dataset.json
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\breckenridge\ashes-of-peace.campaign-package.json packages\bundled\breckenridge\breckenridge-senior-staff.crew-dataset.json packages\bundled\breckenridge\prelude-a-ship-underway.mission-graph.json
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\glass-harbor\drowned-constellation.campaign-package.json packages\bundled\glass-harbor\glass-harbor-senior-staff.crew-dataset.json packages\bundled\glass-harbor\mission-graphs\prelude-soundings.mission-graph.json
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\eudora-vale\broken-accord.campaign-package.json packages\bundled\eudora-vale\eudora-vale-senior-staff.crew-dataset.json packages\bundled\eudora-vale\mission-graphs\prelude-the-captains-chair.mission-graph.json
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\aster-vale\unseen-border.campaign-package.json packages\bundled\aster-vale\aster-vale-senior-staff.crew-dataset.json packages\bundled\aster-vale\mission-graphs\prelude-the-blank-route.mission-graph.json
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\celandine\enemys-garden.campaign-package.json packages\bundled\celandine\celandine-senior-staff.crew-dataset.json packages\bundled\celandine\mission-graphs\prelude-the-first-harvest.mission-graph.json
node tools\scripts\test-campaign-package-importer.mjs
node tools\scripts\test-package-update-diagnostics.mjs
```

A shareable package should use `.directive-campaign.zip` and contain exactly one package root JSON payload: either `package.json` or a `.campaign-package.json` file.

## Authoring Checklist

- Package has all required top-level roots.
- Manifest uses `directive.campaignPackage`, schema version `2`, and `.directive-campaign.zip`.
- Player role is explicit and agency-safe.
- Ship/station baseline is complete enough for status and prompt context.
- Crew records include player-safe public material and hidden material only where intended.
- Character Creator choices are package-owned.
- World has locations, routes, factions, actors, fronts, clocks, and state tracks.
- Story arcs are orienting structure, not rigid rails.
- End conditions define authored completion, terminal candidates, checkpoint replay, Push On rules, and ending-axis effects.
- Quest templates inherit campaign state.
- Thread templates define visibility and engagement rules.
- Reaction rules are bounded and testable.
- Director cards are audience- and visibility-aware.
- Context policy excludes hidden state from player-facing prompt blocks.
- Guardrails are explicit about hidden truth and no-player-writing.
- Assets are passive and path-safe.
- Validation passes.

## Related Docs

- [Campaign Package Structure](CAMPAIGN_PACKAGE_STRUCTURE.md)
- [Campaign Schema Reference](CAMPAIGN_SCHEMA_REFERENCE.md)
- [LLM Campaign Authoring Guide](LLM_CAMPAIGN_AUTHORING_GUIDE.md)
- [Ashes Of Peace Authoring Reference](ASHES_OF_PEACE_AUTHORING_REFERENCE.md)
- [Glass Harbor Authoring Reference](GLASS_HARBOR_AUTHORING_REFERENCE.md)
- [Serein Authoring Reference](SEREIN_AUTHORING_REFERENCE.md)
- [Eudora Vale Authoring Reference](EUDORA_VALE_AUTHORING_REFERENCE.md)
- [Aster Vale Authoring Reference](ASTER_VALE_AUTHORING_REFERENCE.md)
- [Campaign End Conditions](../design/CAMPAIGN_END_CONDITIONS.md)
- [Campaign Package Model](../packages/CAMPAIGN_PACKAGE_MODEL.md)
- [Campaign Package Schema](../packages/CAMPAIGN_PACKAGE_SCHEMA.md)
