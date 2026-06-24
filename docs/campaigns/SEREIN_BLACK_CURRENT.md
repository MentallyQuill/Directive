# Serein / Black Current

Black Current is the bundled draft campaign package for the U.S.S. Serein. It is runtime-registered as package id `directive:campaign-package:serein-black-current` and uses the schema-v2 open-world architecture.

This document is release-facing orientation for operators, authors, and implementers. The full source material under `content/campaigns/serein/` contains spoilers and should be treated as authoring source, not player-safe documentation.

## Status

- Package status: `draft`.
- Runtime package: `packages/bundled/serein/black-current.campaign-package.json`.
- Campaign projection: `packages/bundled/serein/black-current.campaign-projection.json`.
- Crew dataset: `packages/bundled/serein/serein-senior-staff.crew-dataset.json`.
- Tactical graphs:
  - `packages/bundled/serein/mission-graphs/prelude-wreckfall.mission-graph.json`
  - `packages/bundled/serein/mission-graphs/chapter-1-first-manifest.mission-graph.json`
  - `packages/bundled/serein/mission-graphs/chapter-2-forty-seven-hours-late.mission-graph.json`

Serein is bundled and validated by the alpha gate, but remains `draft`: its starship registry and crew portrait assets are unresolved, and later playtest passes should deepen the generated crew cards and tactical graph data.

## Campaign Identity

- Ship: U.S.S. Serein, Steamrunner-class.
- Opening stardate: `53672.1`.
- Opening year: 2376.
- Theater: The Vanta Wake.
- Campaign title: Black Current.
- Player role: newly promoted Commander/XO, then Acting Captain and regional recovery commander after Wreckfall.
- Expected campaign length: 35-55 sessions.

The campaign promise is that the player takes acting command after Captain Anika Lorne is injured during a triple wreck emergence. The Serein must lead hazardous recovery through a corridor where ships, graves, ordnance, records, and people return to a world that has already moved on.

## End Conditions

The package includes a current `endConditions` root. It covers:

- authored completion through `epilogue-the-names-returned`;
- terminal candidates for player death, command removal, Serein loss, Black Tide catastrophe, survivor-system collapse, ordnance catastrophe, custody-legitimacy collapse, Mooring accountability loss, and player exit;
- Push On frames for inquiry, relief, Serein-loss survivor play, allied recovery command, aftermath accounting, medical command gaps, and testimony;
- final-band mapping for Safe Channel, Recovery State, Free Wake, Cleared by Fire, Black Tide, and default settlement outcomes.

## Source Map

| Source | Purpose |
| --- | --- |
| `content/campaigns/serein/campaign/THE_BLACK_CURRENT_CAMPAIGN.md` | Spoiler baseline, campaign promise, structure, truths, endings, and failure policy. |
| `content/campaigns/serein/campaign/THE_BLACK_CURRENT_OPEN_WORLD.md` | Open-world implementation: locations, routes, factions, fronts, tracks, arcs, quests, and finale inputs. |
| `content/campaigns/serein/campaign/ENDINGS_AND_EPILOGUE.md` | Ending axes, ending families, epilogue accounting, and command succession outcomes. |
| `content/campaigns/serein/campaign/DIRECTOR_REFERENCE.md` | Director-facing faction, actor, emergence, evidence, and hidden-knowledge reference. |
| `content/campaigns/serein/campaign/EMERGENCE_AND_RECOVERY_SYSTEM.md` | Recurrent emergence, recovery phase, custody, and failure-transformation rules. |
| `content/campaigns/serein/crew/SEREIN_SENIOR_STAFF_CHARACTER_BIBLE.md` | Senior staff authoring source. |
| `content/campaigns/serein/missions/` | Prelude, Chapter 1, and Chapter 2 mission source. |
| `content/campaigns/serein/quests/MAIN_QUESTS.md` | Main quest source. |
| `content/campaigns/serein/side-missions/DESIGNED_SIDE_ASSIGNMENTS.md` | Side assignment source. |
| `content/campaigns/serein/world/VANTA_WAKE_GAZETTEER.md` | Region, route, and map source. |

## Related Docs

- [Serein Authoring Reference](../authoring/SEREIN_AUTHORING_REFERENCE.md)
- [Campaign End Conditions](../design/CAMPAIGN_END_CONDITIONS.md)
