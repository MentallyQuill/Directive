# Celandine Authoring Reference

Enemy's Garden is the bundled draft implementation for U.S.S. Celandine campaign authoring. Use it as a schema-v2 reference for importing a full open-world campaign into the current package, projection, crew dataset, mission graph, and End Conditions contracts.

## Package Files

| File | Purpose |
| --- | --- |
| `packages/bundled/celandine/enemys-garden.campaign-package.json` | Main schema-valid draft campaign package record. |
| `packages/bundled/celandine/enemys-garden.campaign-projection.json` | Initial campaign-state projection for the package. |
| `packages/bundled/celandine/celandine-senior-staff.crew-dataset.json` | Structured senior staff Director-card dataset. |
| `packages/bundled/celandine/mission-graphs/prelude-the-first-harvest.mission-graph.json` | Prelude tactical graph. |
| `packages/bundled/celandine/mission-graphs/chapter-1-the-old-seed.mission-graph.json` | Chapter 1 tactical graph. |
| `packages/bundled/celandine/mission-graphs/chapter-2-a-marker-in-the-blood.mission-graph.json` | Chapter 2 tactical graph. |

## Source Folders

| Folder | Purpose |
| --- | --- |
| `content/campaigns/celandine/campaign` | Campaign-level source, open-world implementation notes, endings, seed-law system, and Director reference. |
| `content/campaigns/celandine/crew` | Senior staff source. |
| `content/campaigns/celandine/guardrails` | Campaign guardrails and safety material. |
| `content/campaigns/celandine/missions` | Prelude, Chapter 1, and Chapter 2 mission source. |
| `content/campaigns/celandine/quests` | Main quest source. |
| `content/campaigns/celandine/side-missions` | Designed side assignments. |
| `content/campaigns/celandine/world` | Cyradon Relief Cluster gazetteer and agricultural-transition source. |

## Authoring Notes

- Campaign title: Enemy's Garden.
- Package-owned ship baseline: U.S.S. Celandine.
- Campaign theater: The Cyradon Relief Cluster.
- Player role: newly assigned Commander/XO and Acting Captain after Captain Maia Dorel is quarantined.
- Expected campaign length: 28-42 sessions.
- Package state tracks: `famine-pressure`, `biomarker-spread`, `alternative-readiness`, `seed-sovereignty`, `sabotage-retaliation`, `public-trust`, `ecological-health`, `crew-command-confidence`, `starfleet-scrutiny`, and `captain-condition`.
- End Conditions source: `content/campaigns/celandine/campaign/ENDINGS_AND_EPILOGUE.md`.

Celandine is useful as a full-campaign import reference because it arrived with current handoff-shaped package, projection, crew, mission graph, and End Conditions records, then was tightened to this repo's runtime predicate contract and bundled metadata standard.

## Validation

```powershell
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\celandine\enemys-garden.campaign-package.json
node tools\scripts\validate-campaign-projection.mjs packages\bundled\celandine\enemys-garden.campaign-projection.json packages\bundled\celandine\enemys-garden.campaign-package.json
node tools\scripts\validate-crew-dataset.mjs schemas\packages\crew-dataset.schema.json packages\bundled\celandine\enemys-garden.campaign-package.json packages\bundled\celandine\celandine-senior-staff.crew-dataset.json
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\celandine\enemys-garden.campaign-package.json packages\bundled\celandine\celandine-senior-staff.crew-dataset.json packages\bundled\celandine\mission-graphs\prelude-the-first-harvest.mission-graph.json
node tools\scripts\test-enemys-garden-end-conditions.mjs
```

## Related Docs

- [Celandine / Enemy's Garden](../campaigns/CELANDINE_ENEMYS_GARDEN.md)
- [Campaign End Conditions](../design/CAMPAIGN_END_CONDITIONS.md)
