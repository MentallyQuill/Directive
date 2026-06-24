# Serein Authoring Reference

The Black Current is the bundled draft implementation for U.S.S. Serein campaign authoring. Use it as a schema-v2 reference for importing a full open-world campaign into the current package, projection, crew dataset, mission graph, and End Conditions contracts.

## Package Files

| File | Purpose |
| --- | --- |
| `packages/bundled/serein/black-current.campaign-package.json` | Main schema-valid draft campaign package record. |
| `packages/bundled/serein/black-current.campaign-projection.json` | Initial campaign-state projection for the package. |
| `packages/bundled/serein/serein-senior-staff.crew-dataset.json` | Structured senior staff Director-card dataset. |
| `packages/bundled/serein/mission-graphs/prelude-wreckfall.mission-graph.json` | Prelude tactical graph. |
| `packages/bundled/serein/mission-graphs/chapter-1-first-manifest.mission-graph.json` | Chapter 1 tactical graph. |
| `packages/bundled/serein/mission-graphs/chapter-2-forty-seven-hours-late.mission-graph.json` | Chapter 2 tactical graph. |

## Source Folders

| Folder | Purpose |
| --- | --- |
| `content/campaigns/serein/campaign` | Campaign-level source, open-world implementation notes, endings, emergence system, and Director reference. |
| `content/campaigns/serein/crew` | Senior staff source. |
| `content/campaigns/serein/guardrails` | Campaign guardrails and safety material. |
| `content/campaigns/serein/missions` | Prelude, Chapter 1, and Chapter 2 mission source. |
| `content/campaigns/serein/quests` | Main quest source. |
| `content/campaigns/serein/side-missions` | Designed side assignments. |
| `content/campaigns/serein/world` | Vanta Wake gazetteer and recovery charter source. |

## Authoring Notes

- Campaign title: The Black Current.
- Package-owned ship baseline: U.S.S. Serein.
- Campaign theater: The Vanta Wake.
- Player role: newly promoted Commander/XO and Acting Captain after Wreckfall.
- Package state tracks: `current-pressure`, `survivor-load`, `ordnance-hazard`, `claims-legitimacy`, `institutional-secrecy`, and `crew-war-strain`.
- End Conditions source: `content/campaigns/serein/campaign/ENDINGS_AND_EPILOGUE.md`.

Serein is useful as a full-campaign import reference because it arrived with older draft shapes and has been normalized to the current Directive standard rather than adding compatibility branches. It remains a draft package until registry, ship hero, portrait assets, richer crew cards, and deeper tactical graph authoring are completed.

## Validation

```powershell
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\serein\black-current.campaign-package.json
node tools\scripts\validate-campaign-projection.mjs packages\bundled\serein\black-current.campaign-projection.json packages\bundled\serein\black-current.campaign-package.json
node tools\scripts\validate-crew-dataset.mjs schemas\packages\crew-dataset.schema.json packages\bundled\serein\black-current.campaign-package.json packages\bundled\serein\serein-senior-staff.crew-dataset.json
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\serein\black-current.campaign-package.json packages\bundled\serein\serein-senior-staff.crew-dataset.json packages\bundled\serein\mission-graphs\prelude-wreckfall.mission-graph.json
node tools\scripts\test-black-current-end-conditions.mjs
```

## Related Docs

- [Serein / The Black Current](../campaigns/SEREIN_BLACK_CURRENT.md)
- [Campaign End Conditions](../design/CAMPAIGN_END_CONDITIONS.md)
