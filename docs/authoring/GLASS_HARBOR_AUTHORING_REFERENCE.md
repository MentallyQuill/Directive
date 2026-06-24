# Glass Harbor Authoring Reference

The Drowned Constellation is the bundled draft implementation for U.S.S. Glass Harbor campaign authoring. Use it as a second schema-v2 reference beside Ashes of Peace when validating that Directive is package-shaped rather than Breckenridge-shaped.

## Runtime Package Files

| File | Purpose |
| --- | --- |
| `packages/bundled/glass-harbor/drowned-constellation.campaign-package.json` | Main schema-valid draft campaign package record. |
| `packages/bundled/glass-harbor/drowned-constellation.campaign-projection.json` | Initial campaign-state projection for the package. |
| `packages/bundled/glass-harbor/glass-harbor-senior-staff.crew-dataset.json` | Structured senior staff Director-card dataset. |
| `packages/bundled/glass-harbor/mission-graphs/prelude-soundings.mission-graph.json` | Prelude tactical graph. |
| `packages/bundled/glass-harbor/mission-graphs/chapter-1-aster-basin.mission-graph.json` | Chapter 1 tactical graph. |
| `packages/bundled/glass-harbor/mission-graphs/chapter-2-caligo-sounding.mission-graph.json` | Chapter 2 tactical graph. |

## Authoring Source Folders

| Folder | Purpose |
| --- | --- |
| `content/campaigns/glass-harbor/campaign` | Campaign-level source, open-world implementation notes, endings, and Director reference. |
| `content/campaigns/glass-harbor/crew` | Senior staff source. |
| `content/campaigns/glass-harbor/guardrails` | Campaign guardrails and safety material. |
| `content/campaigns/glass-harbor/missions` | Prelude, Chapter 1, and Chapter 2 mission source. |
| `content/campaigns/glass-harbor/quests` | Main quest source. |
| `content/campaigns/glass-harbor/side-missions` | Designed side assignments. |
| `content/campaigns/glass-harbor/world` | Nerine Reef gazetteer and map notes. |

## What It Demonstrates

- A second bundled campaign package registered by the runtime.
- Package-owned ship baseline: U.S.S. Glass Harbor.
- Package-owned player role: newly promoted Commander/XO who becomes Acting Captain after the prelude.
- Persistent regional world: Nerine Reef.
- Route custody, sanctuary, sovereignty, salvage, and chart-authority pressures.
- Open-world scope larger than the current Ashes package: 20 quests, 12 locations, 19 routes, 6 factions, 5 fronts, 6 arcs, 14 thread templates, 27 reaction rules, and 109 Director cards.
- Required `endConditions` root with authored terminal candidates, named finale-band rules, checkpoint policy, `Push On` frames, terminal branches, final outcome bands, and ending axes.
- Three baseline tactical mission graphs.
- Package-driven Character Creator context that should not reuse Breckenridge-specific assumptions.

## Draft Caveats

Glass Harbor is useful as a schema and package-shape reference, but it is not yet a playtest-ready campaign.

Before promotion, deepen:

- crew reveal cards, indexes, relationship detail, and B-plot cards;
- mission graph facts, clocks, pressures, decision points, Command Decision outcomes, and retrieval hooks;
- ship registry and operational art;
- crew portrait assets;
- player-safe map presentation versus Director-only map data.

## Validation Commands

Run focused checks:

```powershell
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json packages\bundled\glass-harbor\drowned-constellation.campaign-package.json
node tools\scripts\validate-campaign-projection.mjs packages\bundled\glass-harbor\drowned-constellation.campaign-projection.json packages\bundled\glass-harbor\drowned-constellation.campaign-package.json
node tools\scripts\validate-crew-dataset.mjs schemas\packages\crew-dataset.schema.json packages\bundled\glass-harbor\drowned-constellation.campaign-package.json packages\bundled\glass-harbor\glass-harbor-senior-staff.crew-dataset.json
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\glass-harbor\drowned-constellation.campaign-package.json packages\bundled\glass-harbor\glass-harbor-senior-staff.crew-dataset.json packages\bundled\glass-harbor\mission-graphs\prelude-soundings.mission-graph.json
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\glass-harbor\drowned-constellation.campaign-package.json packages\bundled\glass-harbor\glass-harbor-senior-staff.crew-dataset.json packages\bundled\glass-harbor\mission-graphs\chapter-1-aster-basin.mission-graph.json
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\glass-harbor\drowned-constellation.campaign-package.json packages\bundled\glass-harbor\glass-harbor-senior-staff.crew-dataset.json packages\bundled\glass-harbor\mission-graphs\chapter-2-caligo-sounding.mission-graph.json
```

Run the full gate before promoting changes:

```powershell
node tools\scripts\run-alpha-gate.mjs
```

## Render Slots

<!-- directive-render id="docs-directive-glass-harbor-authoring-library" status="needed" source="fixture" asset="assets/documentation/renders/docs-directive-glass-harbor-authoring-library.png" tracking="../testing/DOCUMENTATION_RENDER_TRACKING.md" -->
Render needed: Glass Harbor package detail in Campaign Library for authoring docs.

<!-- directive-render id="docs-directive-glass-harbor-authoring-creator" status="needed" source="fixture" asset="assets/documentation/renders/docs-directive-glass-harbor-authoring-creator.png" tracking="../testing/DOCUMENTATION_RENDER_TRACKING.md" -->
Render needed: Glass Harbor Character Creator review state with Acting Captain role copy.

<!-- directive-render id="docs-directive-glass-harbor-authoring-map" status="needed" source="static-or-fixture" asset="assets/documentation/renders/docs-directive-glass-harbor-authoring-map.png" tracking="../testing/DOCUMENTATION_RENDER_TRACKING.md" -->
Render needed: player-safe Nerine Reef map or runtime map/fallback example that excludes Director-only hidden locations.

## Related Docs

- [Glass Harbor / The Drowned Constellation](../campaigns/GLASS_HARBOR_DROWNED_CONSTELLATION.md)
- [Campaign Authoring Guide](CAMPAIGN_AUTHORING_GUIDE.md)
- [Campaign Package Structure](CAMPAIGN_PACKAGE_STRUCTURE.md)
- [Campaign Schema Reference](CAMPAIGN_SCHEMA_REFERENCE.md)
- [Campaign End Conditions](../design/CAMPAIGN_END_CONDITIONS.md)
