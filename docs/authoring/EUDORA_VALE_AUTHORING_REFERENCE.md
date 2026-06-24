# Eudora Vale Authoring Reference

Broken Accord is the bundled draft implementation for U.S.S. Eudora Vale campaign authoring. Use it as a schema-v2 reference for importing a full open-world campaign into the current package, projection, crew dataset, mission graph, and End Conditions contracts.

## Package Files

| File | Purpose |
| --- | --- |
| `packages/bundled/eudora-vale/broken-accord.campaign-package.json` | Main schema-valid draft campaign package record. |
| `packages/bundled/eudora-vale/broken-accord.campaign-projection.json` | Initial campaign-state projection for the package. |
| `packages/bundled/eudora-vale/eudora-vale-senior-staff.crew-dataset.json` | Structured senior staff Director-card dataset. |
| `packages/bundled/eudora-vale/mission-graphs/prelude-the-captains-chair.mission-graph.json` | Prelude tactical graph. |
| `packages/bundled/eudora-vale/mission-graphs/chapter-1-bread-and-weather.mission-graph.json` | Chapter 1 tactical graph. |
| `packages/bundled/eudora-vale/mission-graphs/chapter-2-the-weight-of-water.mission-graph.json` | Chapter 2 tactical graph. |

## Source Folders

| Folder | Purpose |
| --- | --- |
| `content/campaigns/eudora-vale/campaign` | Campaign-level source, open-world implementation notes, endings, lattice allocation system, and Director reference. |
| `content/campaigns/eudora-vale/crew` | Senior staff source. |
| `content/campaigns/eudora-vale/guardrails` | Campaign guardrails and safety material. |
| `content/campaigns/eudora-vale/missions` | Prelude, Chapter 1, and Chapter 2 mission source. |
| `content/campaigns/eudora-vale/quests` | Main quest source. |
| `content/campaigns/eudora-vale/side-missions` | Designed side assignments. |
| `content/campaigns/eudora-vale/world` | Ilyra System gazetteer and Accord reference source. |

## Authoring Notes

- Campaign title: Broken Accord.
- Package-owned ship baseline: U.S.S. Eudora Vale.
- Campaign theater: The Ilyra System.
- Player role: established Commander/XO and Acting Captain after Captain Nasrin Rhee dies in the opening lattice surge.
- Package state tracks: `lattice-integrity`, `distribution-equity`, `public-legitimacy`, `nacre-secession-pressure`, `resource-reserves`, `crew-command-confidence`, `starfleet-scrutiny`, and `ecological-continuity`.
- End Conditions source: `content/campaigns/eudora-vale/campaign/ENDINGS_AND_EPILOGUE.md`.

Eudora Vale is useful as a full-campaign import reference because it arrived with older draft shapes and has been normalized to the current Directive standard rather than adding compatibility branches. It remains a draft package until registry, ship hero, richer crew cards, and deeper tactical graph authoring are completed.

## Validation

```powershell
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\eudora-vale\broken-accord.campaign-package.json
node tools\scripts\validate-campaign-projection.mjs packages\bundled\eudora-vale\broken-accord.campaign-projection.json packages\bundled\eudora-vale\broken-accord.campaign-package.json
node tools\scripts\validate-crew-dataset.mjs schemas\packages\crew-dataset.schema.json packages\bundled\eudora-vale\broken-accord.campaign-package.json packages\bundled\eudora-vale\eudora-vale-senior-staff.crew-dataset.json
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\eudora-vale\broken-accord.campaign-package.json packages\bundled\eudora-vale\eudora-vale-senior-staff.crew-dataset.json packages\bundled\eudora-vale\mission-graphs\prelude-the-captains-chair.mission-graph.json
node tools\scripts\test-broken-accord-end-conditions.mjs
```

## Related Docs

- [Eudora Vale / Broken Accord](../campaigns/EUDORA_VALE_BROKEN_ACCORD.md)
- [Campaign End Conditions](../design/CAMPAIGN_END_CONDITIONS.md)
