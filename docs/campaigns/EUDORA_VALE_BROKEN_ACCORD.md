# Eudora Vale / Broken Accord

Broken Accord is the bundled draft campaign package for the U.S.S. Eudora Vale. It is runtime-registered as package id `directive:campaign-package:eudora-vale-broken-accord` and uses the schema-v2 open-world architecture.

This document is release-facing orientation for operators, authors, and implementers. The full source material under `content/campaigns/eudora-vale/` contains spoilers and should be treated as authoring source, not player-safe documentation.

## Status

- Package status: `draft`.
- Runtime package: `packages/bundled/eudora-vale/broken-accord.campaign-package.json`.
- Campaign projection: `packages/bundled/eudora-vale/broken-accord.campaign-projection.json`.
- Crew dataset: `packages/bundled/eudora-vale/eudora-vale-senior-staff.crew-dataset.json`.
- Tactical graphs:
  - `packages/bundled/eudora-vale/mission-graphs/prelude-the-captains-chair.mission-graph.json`
  - `packages/bundled/eudora-vale/mission-graphs/chapter-1-bread-and-weather.mission-graph.json`
  - `packages/bundled/eudora-vale/mission-graphs/chapter-2-the-weight-of-water.mission-graph.json`

Eudora Vale is bundled and validated by the alpha gate, but remains `draft`: its registry, ship hero, crew portrait assets, generated crew cards, and tactical graphs need deeper authored passes before playtest promotion.

## Campaign Identity

- Ship: U.S.S. Eudora Vale, Intrepid-class.
- Opening stardate: `55291.4`.
- Opening year: 2378.
- Theater: The Ilyra System.
- Campaign title: Broken Accord.
- Player role: established Commander/XO and Acting Captain after Captain Nasrin Rhee dies during the opening lattice surge.

The campaign promise is that the player inherits command over a five-world terraforming lattice whose shared prosperity has hidden one world's sacrifice. Play centers on emergency survival, consent, public telemetry, technical conscience, and who is allowed to govern the burdens that keep the system alive.

## End Conditions

The package includes a current `endConditions` root. It covers:

- authored completion through `epilogue-weather-we-share`;
- terminal candidates for player death, command removal, Eudora Vale loss, lattice collapse, Nacre collapse, resource collapse, legitimacy collapse, ecological collapse, and player exit;
- Push On frames for inquiry, advisory play, Eudora Vale survivor play, allied system command, aftermath relief, medical command gaps, and testimony;
- final-band mapping for A Common Climate, Reformed Accord, Five Separate Skies, Peace by Allocation, The Fifth World Falls, and Broken Worlds.

## Source Map

| Source | Purpose |
| --- | --- |
| `content/campaigns/eudora-vale/campaign/THE_BROKEN_ACCORD_CAMPAIGN.md` | Spoiler baseline, campaign promise, structure, truths, and failure policy. |
| `content/campaigns/eudora-vale/campaign/THE_BROKEN_ACCORD_OPEN_WORLD.md` | Open-world implementation: locations, routes, factions, fronts, tracks, arcs, quests, and finale inputs. |
| `content/campaigns/eudora-vale/campaign/ENDINGS_AND_EPILOGUE.md` | Ending axes, ending families, epilogue accounting, and command outcomes. |
| `content/campaigns/eudora-vale/campaign/DIRECTOR_REFERENCE.md` | Director-facing faction, actor, evidence, and hidden-knowledge reference. |
| `content/campaigns/eudora-vale/campaign/LATTICE_ALLOCATION_SYSTEM.md` | Lattice load, allocation, fairness, and consequence model. |
| `content/campaigns/eudora-vale/crew/EUDORA_VALE_SENIOR_STAFF_CHARACTER_BIBLE.md` | Senior staff authoring source. |
| `content/campaigns/eudora-vale/missions/` | Prelude, Chapter 1, and Chapter 2 mission source. |
| `content/campaigns/eudora-vale/quests/MAIN_QUESTS.md` | Main quest source. |
| `content/campaigns/eudora-vale/side-missions/DESIGNED_SIDE_ASSIGNMENTS.md` | Designed side assignment source. |
| `content/campaigns/eudora-vale/world/ILYRA_SYSTEM_GAZETTEER.md` | Region, route, and map source. |

## Related Docs

- [Eudora Vale Authoring Reference](../authoring/EUDORA_VALE_AUTHORING_REFERENCE.md)
- [Campaign End Conditions](../design/CAMPAIGN_END_CONDITIONS.md)
