# Celandine / Enemy's Garden

Enemy's Garden is the bundled draft campaign package for the U.S.S. Celandine. It is runtime-registered as package id `directive:campaign-package:celandine-enemys-garden` and uses the schema-v2 open-world architecture.

This document is release-facing orientation for operators, authors, and implementers. The full source material under `content/campaigns/celandine/` contains spoilers and should be treated as authoring source, not player-safe documentation.

## Status

- Package status: `draft`.
- Runtime package: `packages/bundled/celandine/enemys-garden.campaign-package.json`.
- Campaign projection: `packages/bundled/celandine/enemys-garden.campaign-projection.json`.
- Crew dataset: `packages/bundled/celandine/celandine-senior-staff.crew-dataset.json`.
- Tactical graphs:
  - `packages/bundled/celandine/mission-graphs/prelude-the-first-harvest.mission-graph.json`
  - `packages/bundled/celandine/mission-graphs/chapter-1-the-old-seed.mission-graph.json`
  - `packages/bundled/celandine/mission-graphs/chapter-2-a-marker-in-the-blood.mission-graph.json`

Celandine is bundled and validated by the alpha gate, but remains `draft`: its senior-staff bible and crew dataset now include rich voice capsules, a reframed player authority boundary, and strengthened six-card character payloads, while later playtest and tactical graph tuning remain unresolved.

## Campaign Identity

- Ship: U.S.S. Celandine, Norway-class, NCC-64941.
- Opening stardate: `53944.1`.
- Opening year: 2376.
- Theater: The Cyradon Relief Cluster.
- Campaign title: Enemy's Garden.
- Player role: newly assigned Commander/XO and Acting Captain after Captain Maia Dorel is quarantined by a Dominion control-spore exposure.
- Expected campaign length: 28-42 sessions.

The campaign promise is that the player takes acting command of a compact relief ship after the war, with four agricultural worlds dependent on Dominion-engineered K-17 crops. Play centers on preventing famine while dismantling biological dependency, orbital marking, seed custody, ecological debt, emergency authority, and the political power created by whoever controls the next planting.

## End Conditions

The package includes a current `endConditions` root. It covers:

- authored completion through `epilogue-what-we-plant-next`;
- terminal candidates for player death, command removal, Celandine loss, mass famine, control-bloom catastrophe, ecological collapse, transition-capacity collapse, public legitimacy collapse, captured seed authority, player exit, and player-chosen conclusion;
- Push On frames for inquiry, advisory play, Celandine survivor play, allied relief command, aftermath rescue and food accounting, medical command gaps, and retired testimony;
- final-band mapping for Enemy's Garden, Clean Fields / Empty Stores, Managed Garden, Thousand Private Gardens, Two Harvests More, and Free Harvest.

## Source Map

| Source | Purpose |
| --- | --- |
| `content/campaigns/celandine/campaign/THE_ENEMYS_GARDEN_CAMPAIGN.md` | Spoiler baseline, campaign promise, structure, truths, and failure policy. |
| `content/campaigns/celandine/campaign/THE_ENEMYS_GARDEN_OPEN_WORLD.md` | Open-world implementation: locations, routes, factions, fronts, tracks, arcs, quests, and finale inputs. |
| `content/campaigns/celandine/campaign/ENDINGS_AND_EPILOGUE.md` | Ending axes, ending families, epilogue accounting, and command outcomes. |
| `content/campaigns/celandine/campaign/DIRECTOR_REFERENCE.md` | Director-facing faction, actor, evidence, and hidden-knowledge reference. |
| `content/campaigns/celandine/campaign/FOOD_SEED_AND_TRANSITION_SYSTEM.md` | Seed custody, crop transition, sovereignty, and public-accounting rules. |
| `content/campaigns/celandine/crew/CELANDINE_SENIOR_STAFF_CHARACTER_BIBLE.md` | Senior staff authoring source. |
| `content/campaigns/celandine/missions/` | Prelude, Chapter 1, and Chapter 2 mission source. |
| `content/campaigns/celandine/quests/MAIN_QUESTS.md` | Main quest source. |
| `content/campaigns/celandine/side-missions/DESIGNED_SIDE_ASSIGNMENTS.md` | Designed side assignment source. |
| `content/campaigns/celandine/world/CYRADON_CLUSTER_GAZETTEER.md` | Region, route, and map source. |

## Related Docs

- [Celandine Authoring Reference](../authoring/CELANDINE_AUTHORING_REFERENCE.md)
- [Campaign End Conditions](../design/CAMPAIGN_END_CONDITIONS.md)
