# Aster Vale Authoring Reference

Unseen Border is the bundled draft implementation for U.S.S. Aster Vale campaign authoring. Use it as a schema-v2 reference for importing a full open-world campaign into the current package, projection, crew dataset, mission graph, and End Conditions contracts.

## Package Files

| File | Purpose |
| --- | --- |
| `packages/bundled/aster-vale/unseen-border.campaign-package.json` | Main schema-valid draft campaign package record. |
| `packages/bundled/aster-vale/unseen-border.campaign-projection.json` | Initial campaign-state projection for the package. |
| `packages/bundled/aster-vale/aster-vale-senior-staff.crew-dataset.json` | Structured senior staff Director-card dataset. |
| `packages/bundled/aster-vale/mission-graphs/prelude-the-blank-route.mission-graph.json` | Prelude tactical graph. |
| `packages/bundled/aster-vale/mission-graphs/chapter-1-the-missing-colony.mission-graph.json` | Chapter 1 tactical graph. |
| `packages/bundled/aster-vale/mission-graphs/chapter-2-haldens-shuttle.mission-graph.json` | Chapter 2 tactical graph. |

## Source Folders

| Folder | Purpose |
| --- | --- |
| `content/campaigns/aster-vale/campaign` | Campaign-level source, open-world implementation notes, endings, visibility system, and Director reference. |
| `content/campaigns/aster-vale/crew` | Senior staff source. |
| `content/campaigns/aster-vale/guardrails` | Campaign guardrails and safety material. |
| `content/campaigns/aster-vale/missions` | Prelude, Chapter 1, and Chapter 2 mission source. |
| `content/campaigns/aster-vale/quests` | Main quest source. |
| `content/campaigns/aster-vale/side-missions` | Designed side assignments. |
| `content/campaigns/aster-vale/world` | Lacuna March gazetteer and border-regime reference source. |

## Authoring Notes

- Campaign title: Unseen Border.
- Package-owned ship baseline: U.S.S. Aster Vale, NCC-65488.
- Campaign theater: The Lacuna March.
- Player role: newly promoted Commander/XO and Acting Captain while Captain Idris Kellan is ashore under inquiry.
- Package state tracks: `chart-restoration`, `refugee-pressure`, `civil-war-spillover`, `criminal-exploitation`, `institutional-scrutiny`, `halden-trail`, `crew-trust`, and `regional-legitimacy`.
- End Conditions source: `content/campaigns/aster-vale/campaign/ENDINGS_AND_EPILOGUE.md`.

Aster Vale is useful as a full-campaign import reference because it arrived with current handoff-shaped package, projection, crew, mission graph, and End Conditions records, then was tightened to this repo's runtime predicate contract and bundled metadata standard.

## Validation

```powershell
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\aster-vale\unseen-border.campaign-package.json
node tools\scripts\validate-campaign-projection.mjs packages\bundled\aster-vale\unseen-border.campaign-projection.json packages\bundled\aster-vale\unseen-border.campaign-package.json
node tools\scripts\validate-crew-dataset.mjs schemas\packages\crew-dataset.schema.json packages\bundled\aster-vale\unseen-border.campaign-package.json packages\bundled\aster-vale\aster-vale-senior-staff.crew-dataset.json
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\aster-vale\unseen-border.campaign-package.json packages\bundled\aster-vale\aster-vale-senior-staff.crew-dataset.json packages\bundled\aster-vale\mission-graphs\prelude-the-blank-route.mission-graph.json
node tools\scripts\test-unseen-border-end-conditions.mjs
```

## Related Docs

- [Aster Vale / Unseen Border](../campaigns/ASTER_VALE_UNSEEN_BORDER.md)
- [Campaign End Conditions](../design/CAMPAIGN_END_CONDITIONS.md)
