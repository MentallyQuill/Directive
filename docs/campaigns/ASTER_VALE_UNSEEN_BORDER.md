# Aster Vale / Unseen Border

Unseen Border is the bundled draft campaign package for the U.S.S. Aster Vale. It is runtime-registered as package id `directive:campaign-package:aster-vale-unseen-border` and uses the schema-v2 open-world architecture.

This document is release-facing orientation for operators, authors, and implementers. The full source material under `content/campaigns/aster-vale/` contains spoilers and should be treated as authoring source, not player-safe documentation.

## Status

- Package status: `draft`.
- Runtime package: `packages/bundled/aster-vale/unseen-border.campaign-package.json`.
- Campaign projection: `packages/bundled/aster-vale/unseen-border.campaign-projection.json`.
- Crew dataset: `packages/bundled/aster-vale/aster-vale-senior-staff.crew-dataset.json`.
- Tactical graphs:
  - `packages/bundled/aster-vale/mission-graphs/prelude-the-blank-route.mission-graph.json`
  - `packages/bundled/aster-vale/mission-graphs/chapter-1-the-missing-colony.mission-graph.json`
  - `packages/bundled/aster-vale/mission-graphs/chapter-2-haldens-shuttle.mission-graph.json`

Aster Vale is bundled and validated by the alpha gate, but remains `draft`: its registry, ship hero, crew portrait assets, and later playtest tuning are unresolved.

## Campaign Identity

- Ship: U.S.S. Aster Vale, New Orleans-class.
- Opening stardate: `48612.3`.
- Opening year: 2371.
- Theater: The Lacuna March.
- Campaign title: Unseen Border.
- Player role: newly promoted Commander/XO and Acting Captain while Captain Idris Kellan is ashore under inquiry and Commander Senka Halden is missing.

The campaign promise is that the player takes acting command of a frontier patrol where whole communities, routes, and people have been deliberately removed from Federation records. Play centers on safe passage, asylum, record custody, Hadran civil-war spillover, criminal exploitation, and the ethics of making hidden sanctuary visible.

## End Conditions

The package includes a current `endConditions` root. It covers:

- authored completion through `epilogue-the-lines-we-keep`;
- terminal candidates for player death, command removal, Aster Vale loss, line-of-fire catastrophe, sanctuary collapse, buried accountability, Black Ledger disappearance, border-regime collapse, and player exit;
- Push On frames for inquiry, advisory play, Aster Vale survivor play, allied Sable command, aftermath exodus, medical command gaps, and protected-witness play;
- final-band mapping for A Border Seen Clearly, Durable Passage, The Protected March, The Restored Border, A Line of Fire, and Unseen Border.

## Source Map

| Source | Purpose |
| --- | --- |
| `content/campaigns/aster-vale/campaign/THE_UNSEEN_BORDER_CAMPAIGN.md` | Spoiler baseline, campaign promise, structure, truths, and failure policy. |
| `content/campaigns/aster-vale/campaign/THE_UNSEEN_BORDER_OPEN_WORLD.md` | Open-world implementation: locations, routes, factions, fronts, tracks, arcs, quests, and finale inputs. |
| `content/campaigns/aster-vale/campaign/ENDINGS_AND_EPILOGUE.md` | Ending axes, ending families, epilogue accounting, and command outcomes. |
| `content/campaigns/aster-vale/campaign/DIRECTOR_REFERENCE.md` | Director-facing faction, actor, evidence, and hidden-knowledge reference. |
| `content/campaigns/aster-vale/campaign/VISIBILITY_AND_ROUTE_CUSTODY_SYSTEM.md` | Route custody, protected visibility, evidence, and map-restoration rules. |
| `content/campaigns/aster-vale/crew/ASTER_VALE_SENIOR_STAFF_CHARACTER_BIBLE.md` | Senior staff authoring source. |
| `content/campaigns/aster-vale/missions/` | Prelude, Chapter 1, and Chapter 2 mission source. |
| `content/campaigns/aster-vale/quests/MAIN_QUESTS.md` | Main quest source. |
| `content/campaigns/aster-vale/side-missions/DESIGNED_SIDE_ASSIGNMENTS.md` | Designed side assignment source. |
| `content/campaigns/aster-vale/world/LACUNA_MARCH_GAZETTEER.md` | Region, route, and map source. |

## Related Docs

- [Aster Vale Authoring Reference](../authoring/ASTER_VALE_AUTHORING_REFERENCE.md)
- [Campaign End Conditions](../design/CAMPAIGN_END_CONDITIONS.md)
