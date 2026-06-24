# Drowned Constellation: Open-World Campaign Implementation

## Campaign identity

- Ship: U.S.S. Glass Harbor, Steamrunner-class
- Opening stardate: 50192.6
- Theater: Nerine Reef
- Runtime architecture: `directive.openWorldCampaign.v2`
- Authored scope: 20 quests, 12 locations, 19 routes, 6 factions, 10 recurring regional actors, 5 fronts, 6 arcs, 14 thread templates, 27 reaction rules, and 109 Director cards

## Persistent regional world

The Reef is world data, not a prose-only background. Travel advances stardate. Routes have confidence, condition, and political access. Factions may act while another quest is foregrounded. Location state, chart custody, ship damage, and local relationships persist between assignments.

| Location | Function | Player-facing identity |
| --- | --- | --- |
| Lagrange Gate | regional-entry | The Federation-side entrance to the Nerine Reef, centered on a damaged navigation platform and a congregation of vessels waiting for escort. |
| Kheled Watch | patrol-station | A compact Kheled patrol station controlling the Protectorate’s most reliable approach to the Reef. |
| Quiet Shelf | stable-basin | A relatively stable basin containing a listening array, an agricultural habitat, and enough clear space for sensor calibration and flight training. |
| Aster Basin | civilian-capital | The largest civilian concentration in the Reef and the informal center of the Drift Concord, assembled from habitats, converted freighters, and tethered platforms around a dim brown dwarf. |
| Saint Caligo Wreckfield | wreckfield | Hundreds of wrecks from several conflicts orbit a compact gravitic knot, many stripped, some armed, and a few still sealed. |
| Crown Shoal | raider-haven | A maze of dense fragments and sensor shadows intermittently controlled by the Crown of Embers. |
| Shepherd Node Seven | ancient-installation | A regular asteroid formation suspected to contain a buried gravitic installation. |
| Deep Tide Trench | extreme-hazard | The most unstable mapped region of the Reef, where transit lanes compress, reverse, or disappear. |
| Bellweather Anchorage | mobile-anchorage | A moving congregation of salvage tugs, clinic barges, and trading craft that relocates as routes change. |
| Ossuary Loop | memorial-zone | A slow orbit of exodus wrecks, memorial capsules, and disputed remains near the outer edge of Saint Caligo. |
| Lantern Span | navigation-corridor | A promising corridor between Quiet Shelf and Aster Basin where a buoy chain could create the Reef’s first broadly usable public route. |
| Maintenance Habitat Kappa-4 | hidden-habitat | A concealed pre-Federation maintenance habitat whose location is not known at campaign start. |

## Routes

| Route | From | To | Hours | Starting condition |
| --- | --- | --- | --- | --- |
| Lagrange Gate to Kheled Watch | lagrange-gate | kheled-watch | 2.0 | stable |
| Lagrange Gate to Quiet Shelf | lagrange-gate | quiet-shelf | 2.5 | stable |
| Lagrange Gate to Aster Basin | lagrange-gate | aster-basin | 4.0 | conditional |
| Kheled Watch to Aster Basin | kheled-watch | aster-basin | 2.5 | restricted |
| Quiet Shelf to Aster Basin | quiet-shelf | aster-basin | 2.0 | stable-with-pilot |
| Aster Basin to Saint Caligo Wreckfield | aster-basin | saint-caligo-wreckfield | 2.0 | conditional |
| Aster Basin to Crown Shoal | aster-basin | crown-shoal | 2.5 | conditional |
| Saint Caligo Wreckfield to Shepherd Node Seven | saint-caligo-wreckfield | shepherd-node-seven | 2.0 | conditional |
| Crown Shoal to Shepherd Node Seven | crown-shoal | shepherd-node-seven | 2.0 | secret |
| Crown Shoal to Deep Tide Trench | crown-shoal | deep-tide-trench | 3.5 | hazardous |
| Shepherd Node Seven to Deep Tide Trench | shepherd-node-seven | deep-tide-trench | 2.0 | hazardous |
| Aster Basin to Bellweather Anchorage | aster-basin | bellweather-anchorage | 1.5 | mobile |
| Bellweather Anchorage to Saint Caligo Wreckfield | bellweather-anchorage | saint-caligo-wreckfield | 1.5 | conditional |
| Saint Caligo Wreckfield to Ossuary Loop | saint-caligo-wreckfield | ossuary-loop | 1.0 | restricted |
| Quiet Shelf to Lantern Span | quiet-shelf | lantern-span | 1.5 | stable |
| Lantern Span to Aster Basin | lantern-span | aster-basin | 1.5 | conditional |
| Shepherd Node Seven to Maintenance Habitat Kappa-4 | shepherd-node-seven | maintenance-habitat-kappa-four | 0.75 | secret |
| Ossuary Loop to Maintenance Habitat Kappa-4 | ossuary-loop | maintenance-habitat-kappa-four | 1.25 | secret |
| Deep Tide Trench to Maintenance Habitat Kappa-4 | deep-tide-trench | maintenance-habitat-kappa-four | 1.0 | secret |

## Factions

| Faction | Goals | Player-facing identity |
| --- | --- | --- |
| Starfleet Survey Command | Recover Captain Rhos and the shuttle crew; Produce reliable navigation data; Prevent a border crisis; Preserve Starfleet credibility | The Starfleet authority responsible for route safety, frontier surveys, and the Glass Harbor’s mission. |
| Drift Concord | Protect concealed communities; Keep routes locally usable; Prevent annexation; Maintain mutual aid | A mutual-aid network of refugee habitats, independent settlements, and civilian pilots inside the Reef. |
| Breakwater Guild | Protect salvage livelihoods; Keep the Reef navigable enough for trade; Avoid external seizure of recovered material; Preserve crew autonomy | Salvage captains, tug crews, and wreck divers who maintain much of the Reef’s practical infrastructure. |
| Kheled Protectorate | Control access; Suppress raiding; Protect Kheled commerce; Expand legal jurisdiction | A neighboring state claiming a security interest in the Reef and demanding a formal navigation regime. |
| Crown of Embers | Control profitable routes; Acquire Shepherd leverage; Prevent outside occupation; Bind dependent settlements | A loose confederation of raider captains, protection crews, smugglers, and isolated communities. |
| Shepherd Network | Distribute gravitic load; Prevent cascade formation; Isolate damaged nodes; Require quorum for full control | No recognized political faction; evidence suggests the Reef contains linked ancient machinery. |

## Active fronts

| Front | Start | Max | Visibility | Function |
| --- | --- | --- | --- | --- |
| Reef Instability | 1 | 6 | player | Gravitic stress, damaged nodes, heavy power use, and elapsed time increase the frequency and severity of route inversions. |
| Civilian Strain | 1 | 5 | player | Shortages, medical pressure, habitat failures, and displacement accumulate as routes close or requests go unanswered. |
| Kheled Intervention | 0 | 5 | player | The Protectorate gathers the legal, political, and tactical basis for entering the Reef in force. |
| Raider Consolidation | 1 | 5 | player | The Crown of Embers converts route access, protection contracts, and recovered weapons into coherent regional power. |
| Shepherd Cascade | 1 | 6 | hidden | The fragmented ancient network isolates damage and shifts load toward surviving nodes, increasing the risk of a system-level failure. |

Fronts are independent processes, not dramatic timers attached to the current scene. They advance only when physical processes, actor plans, or elapsed-time rules justify movement.

## State tracks

| Track | Initial | Range | Visibility | Interpretation |
| --- | --- | --- | --- | --- |
| Reef Instability | 2 | 0–8 | hidden | The severity and frequency of gravitic route failures. |
| Chart Exposure | 1 | 0–8 | hidden | How much concealed geography and route data is available to outside actors. |
| Civilian Strain | 2 | 0–8 | hidden | Shortages, medical pressure, habitat failures, and displacement. |
| Kheled Intervention | 1 | 0–8 | hidden | Protectorate readiness and political support for entering the Reef in force. |
| Raider Consolidation | 2 | 0–8 | hidden | The Crown of Embers’ progress toward coherent regional control. |
| Crew Succession Confidence | 2 | 0–6 | hidden | Whether the senior staff accepts the player’s acting command and exercises useful initiative. |

Raw values remain hidden in ordinary play. The player perceives them through route closures, public cooperation, escort requests, shortages, inspections, raider confidence, crew behavior, and command review.

## Story arcs as orientation

| Arc | Kind | Purpose |
| --- | --- | --- |
| The Reef Takes Names | main | Establish acting command, meet the Reef’s principal communities, and learn that navigation itself is a political relationship. |
| Charts and Claims | political | Determine how route knowledge is created, certified, distributed, and revoked. |
| The Sunken Fleet | investigation | Recover lives and evidence from the wreckfields while deciding how dangerous history enters the present. |
| Cities Without Stars | political | Determine whether the Reef’s settlements become a recognized polity, a protected sanctuary network, an administered dependency, or a fragmented frontier. |
| The Shepherds Below | science | Discover the ancient gravitic network, recover or lose Captain Rhos, and decide who may control the Reef’s deepest infrastructure. |
| The Deep Tide | finale | Assemble earned routes, assets, faction relationships, and ship condition into a multi-front regional inversion and its aftermath. |

Arcs do not prescribe scene order. They group facts, fronts, quests, actors, and ending axes so the Director can maintain thematic and causal orientation.

## Quest availability model

- `Prelude: Soundings` begins active.
- Its resolution opens the Reef and allows multiple early assignments.
- Aster Basin, Caligo Sounding, and Terms of Passage can be selected in an order determined by player priorities and current world state.
- The Chartmakers unlocks after sufficient early regional experience rather than one mandatory chapter sequence.
- The Sunken Fleet and Cities Without Stars can proceed before or after one another.
- The Shepherds Below requires enough independent evidence and at least one major supporting line.
- The Deep Tide requires network knowledge plus actual regional preparation; its exact pressures read earned assets, route condition, faction posture, ship damage, and unresolved obligations.
- The epilogue assembles operational, political, truth, crew, and succession outcomes.

## Open Orders model

Designed side assignments remain standing opportunities. They can be pursued, postponed, delegated where permitted, transformed by current state, or ignored. Some are intentionally calm and should not be converted into Shepherd-network clues.

## Finale assembly inputs

The Deep Tide reads:

- functional, damaged, and controlled Shepherd nodes;
- chart regime and map-charter state;
- route confidence and buoy deployment;
- Aster Basin location and exposure status;
- Kheled intervention posture and whether Pel’s conduct is known;
- Crown control key and raider consolidation;
- Breakwater and Drift support;
- ship condition, tractor limits, shuttle availability, and crew fatigue;
- Rhos, Kor, and Sorn status;
- completed, delegated, failed, and ignored side assignments;
- active crew threads and succession confidence.

The finale must not reset these inputs to a fixed branch.
