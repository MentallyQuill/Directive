# Ashes Of Peace Authoring Reference

Ashes of Peace is the current reference implementation for Directive campaign authoring.

## Runtime Package Files

| File | Purpose |
| --- | --- |
| `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json` | Main schema-valid campaign package record. |
| `packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json` | Initial campaign-state projection for the package. |
| `packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json` | Structured senior staff Director-card dataset. |
| `packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json` | Prelude tactical graph. |
| `packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json` | Chapter 1 tactical graph. |
| `packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json` | Chapter 2 tactical graph. |

## Authoring Source Folders

| Folder | Purpose |
| --- | --- |
| `content/campaigns/breckenridge/campaign` | Campaign-level authoring material. |
| `content/campaigns/breckenridge/crew` | Crew authoring material. |
| `content/campaigns/breckenridge/guardrails` | Guardrails and safety material. |
| `content/campaigns/breckenridge/missions` | Mission authoring material. |
| `content/campaigns/breckenridge/quests` | Quest authoring material. |
| `content/campaigns/breckenridge/side-missions` | Side assignment authoring material. |

## What It Demonstrates

- Package-owned ship baseline: U.S.S. Breckenridge.
- Package-owned player role: incoming Commander/XO.
- Locked campaign frame: Asterion Reach and Pale Lantern pressure.
- Current authored scope: 19 quests, 12 locations, 4 arcs, 14 thread templates, 21 reaction rules, and 45 Director cards.
- Package-driven Character Creator options.
- Senior crew with player-safe and hidden/Director-only separation.
- Open-world region data.
- Main story arcs and Open Orders intervals.
- Quest templates and mission graph references.
- Thread templates for ongoing story, crew, and ship concerns.
- Reaction rules and context policy.
- Guardrails around hidden truth, player agency, and Starfleet command framing.
- Passive package asset references.

## Documentation Pairings

- Read [Ashes Of Peace Campaign](../campaigns/ASHES_OF_PEACE_CAMPAIGN.md) for campaign-facing design.
- Read [Ashes Of Peace Open World](../campaigns/ASHES_OF_PEACE_OPEN_WORLD.md) for open-world implementation shape.
- Read [Campaign Package Schema](../packages/CAMPAIGN_PACKAGE_SCHEMA.md) for validation and importer rules.
- Read [Crew Dataset Contract](../packages/CREW_DATASET_CONTRACT.md) for senior-staff dataset details.
- Read [Prelude Mission Graph](../packages/PRELUDE_MISSION_GRAPH.md) for the first tactical graph reference.

## Runtime Examples

![Ashes of Peace package detail](../../assets/documentation/renders/docs-directive-campaign-library.png)

![Ashes of Peace Character Creator service options](../../assets/documentation/renders/docs-directive-character-creator-service.png)

![Breckenridge crew roster](../../assets/documentation/renders/docs-directive-crew-roster.png)

![Ashes of Peace Open World opportunities](../../assets/documentation/renders/docs-directive-mission-open-world.png)
