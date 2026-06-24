# Unseen Border: Open-World Campaign Implementation

## Campaign identity

- Campaign: Unseen Border
- Ship: U.S.S. Aster Vale, New Orleans-class, NCC-65488
- Opening stardate: 48612.3
- Opening year: 2371
- Theater: the Lacuna March
- Runtime architecture: `directive.openWorldCampaign.v2`
- Authored scope: 25 quests, 12 locations, 20 routes, 5 arcs, 14 thread templates, 38 reaction rules, and 216 Director cards.

## Persistent-world contract

The Lacuna March is not a mission backdrop. Every route, settlement, faction, witness, archive, patrol, custody arrangement, and promise can persist after its foreground scene. Travel consumes time. Actors move and act between missions. Fronts advance only when their causal prerequisites are present. Side work can change finale readiness without becoming subordinate steps in the main investigation.

The foreground quest is a camera position, not the only active process. The Director should regularly ask what the player left unattended, who learned of the last decision, which route became easier or harder to use, and whether the current custodian has the capacity and legitimacy to maintain it.

## Regional map

Player-safe map: `assets/maps/lacuna-march-player-map.png`  
Director map: `assets/maps/lacuna-march-director-map.png`

## Locations

| Location | Function | Opening visibility | Player-safe summary |
| --- | --- | --- | --- |
| U.S.S. Aster Vale | mobile-operational-base | known | A New Orleans-class frontier frigate serving as patrol ship, charting platform, diplomatic venue, and temporary refuge. |
| Meridian Beacon | regional-hub | known | A Starfleet traffic-control platform marking the official western entrance to the Lacuna March. |
| Meridian Refugee Annex | administrative-subhub | known | A converted cargo spindle used for temporary shelter, interviews, medical screening, and asylum review. |
| Halloway Colony | federation-colony | known | A prosperous Federation agricultural colony whose exports depend on predictable routes and reliable inspection rules. |
| Gravesend Veil | hazardous-navigation-zone | known | A sensor-distorting nebular fold used for concealed crossings between Meridian, Sable, and protected settlements. |
| Sable Crossing | civic-market-hub | known | A cluster of habitats and cargo platforms where official and concealed routes meet. |
| Nysa's Lantern | concealed-sanctuary | concealed | A hidden habitat built from a disabled survey station and linked refugee transports. |
| Varin's Rest | neutral-sanctuary | known | A small moon settlement centered on a monastery, clinic, and memorial field for travelers who died unnamed. |
| Kestrel System | debris-and-cache-system | known | A nominally empty system containing an abandoned listening array, hidden fuel caches, and a dense debris field. |
| Kestrel Homesteads | erased-settlement | concealed | A dispersed settlement network omitted from current charts but still paying Federation taxes through Halloway intermediaries. |
| Far Lantern | archive-beacon | concealed | An old navigation beacon beyond the recognized border, maintained by rotating civilian crews. |
| Hadran Perimeter | contested-border-zone | known | A patrol and inspection zone controlled by the Hadran Transitional Authority near the eastern edge of the March. |

## Routes

Travel time is baseline. Physical condition, confidence, visibility, access, and custody may change independently.

| Route | Travel | Status | Confidence | Visibility | Opening risks |
| --- | --- | --- | --- | --- | --- |
| meridian-beacon to meridian-refugee-annex | 0.25 h | public | verified | player | administrative delay |
| meridian-beacon to halloway-colony | 2 h | public | verified | player | commercial congestion |
| halloway-colony to sable-crossing | 2 h | public | provisional | player | inspection disputes |
| meridian-beacon to gravesend-veil | 2.5 h | restricted | provisional | player | sensor distortion, legacy mines |
| gravesend-veil to sable-crossing | 2 h | private | local-only | player | pilot dependence, false returns |
| gravesend-veil to nysas-lantern | 2.5 h | unknown | unverified | director | route exposure, radiation pockets |
| sable-crossing to nysas-lantern | 2.5 h | private | local-only | director | sanctuary exposure, traffic tailing |
| sable-crossing to varins-rest | 2 h | conditional | provisional | player | medical priority traffic |
| halloway-colony to varins-rest | 3 h | conditional | provisional | player | sparse rescue coverage |
| varins-rest to kestrel-system | 2 h | conditional | provisional | player | debris drift |
| nysas-lantern to kestrel-system | 2 h | private | local-only | director | Black Ledger observation |
| kestrel-system to kestrel-homesteads | 0.75 h | private | local-only | director | unlit traffic, homestead beacons |
| kestrel-system to far-lantern | 2 h | unknown | unverified | director | archive pursuit, debris shear |
| varins-rest to far-lantern | 2.5 h | private | provisional | director | weak beacon coverage |
| sable-crossing to hadran-perimeter | 2.5 h | contested | verified | player | armed inspection, warrant seizure |
| nysas-lantern to hadran-perimeter | 3 h | unknown | unverified | director | extraction teams, route compromise |
| kestrel-system to hadran-perimeter | 1.5 h | private | unverified | director | weapons traffic, covert patrols |
| far-lantern to hadran-perimeter | 2 h | unknown | unverified | director | long-range interception |
| halloway-colony to gravesend-veil | 2.25 h | restricted | local-only | director | agricultural back-haul traffic |
| sable-crossing to far-lantern | 3.25 h | unknown | unverified | director | no reliable rescue coverage |

## Factions

| Faction | Initial posture | Goals |
| --- | --- | --- |
| Starfleet Border Service | supportive-but-centralizing | Restore reliable charts, Protect Federation traffic, Prevent unauthorized foreign access, Maintain accountable command |
| Hadran Transitional Authority | formal-and-testing | Recover wanted persons, Prevent weapons reaching rivals, Control cross-border movement, Avoid an open conflict with Starfleet |
| Ilyran Colonial Council | cooperative-with-private-exposure | Restore commerce, Protect colonial autonomy, Avoid labor scandal, Expand patrol coverage |
| Free Passage Network | guarded-and-essential | Keep sanctuary routes open, Protect identities, Move patients and families, Resist centralized custody |
| Black Ledger Syndicate | transactional-and-predatory | Control scarce transport, Destroy incriminating records, Preserve useful sanctuary opacity, Co-opt or divide local authorities |
| Sable Civic Assembly | open-but-fragile | Create fair customs, Preserve local autonomy, Keep commerce moving, Gain recognized appeal authority |
| Nysa's Lantern Council | cautious-and-divided | Protect residents, Secure durable status, Control disclosure of identity and location, Avoid dependence on one outside protector |
| Lacuna Protocol Network | fragmented-and-compromised | Prevent purges and attacks, Preserve compartmentation, Avoid exposure of participants, Keep routes useful without one complete owner |

## Regional actors

| Actor | Affiliation | Opening location | Posture | Player-safe role |
| --- | --- | --- | --- | --- |
| Rear Admiral Caris Holt | starfleet-border-service | meridian-beacon | supportive-but-demanding | A rigorous border commander who considers undocumented corridors an unacceptable command vulnerability. |
| Commander Senka Halden | starfleet-border-service | nysas-lantern | hidden-and-active | The missing former XO: meticulous, forceful, and known for challenging incomplete orders. |
| Colonel Varek Sorn | hadran-transitional-authority | hadran-perimeter | formal-and-testing | A disciplined patrol commander willing to negotiate practical limits while defending his government's jurisdiction. |
| Major Kael Renn | hadran-transitional-authority | hadran-perimeter | polite-and-coercive | An internal-security officer who presents data demands as routine citizenship enforcement. |
| Governor Lise Talar | ilyran-colonial-council | halloway-colony | cooperative-and-defensive | A capable colonial governor publicly demanding reliable charts and privately managing the consequences of years of informal protection. |
| Lio Marek | free-passage-network | sable-crossing | guarded-and-pragmatic | A respected courier captain who can arrange access and cooperation but does not control the entire network. |
| Nyra Voss | black-ledger-syndicate | sable-crossing | transactional-and-predatory | A polished logistics broker who sometimes provides real rescue capacity and always turns scarcity into leverage. |
| Magistrate Rina Esh | sable-civic-assembly | sable-crossing | open-and-overloaded | A practical local magistrate trying to make law usable for people whose citizenship is disputed. |
| Councilor Eme Saar | nysas-lantern-council | nysas-lantern | cautious-and-representative | The elected speaker of Nysa's Lantern, responsible to residents who disagree about recognition, secrecy, and return. |
| Prior Ael Varin | free-passage-network | varins-rest | neutral-and-firm | A clinician and monastic administrator whose sanctuary is respected by custom rather than treaty. |
| Keeper Jalen Or | lacuna-protocol-network | far-lantern | protective-and-exhausted | A weary beacon keeper responsible for an archive capable of exposing nearly every actor in the March. |
| Captain Jori Ven | free-passage-network | meridian-refugee-annex | frightened-but-professional | The captain of the tender that opens the campaign, carrying passengers claimed by Hadran authorities and an authentic Halden code. |

## Active fronts

| Front | Visibility | Opening stage | Process |
| --- | --- | --- | --- |
| Chart Exposure | player | front.chart-exposure.stage.1 | Surveys, restored beacons, reports, and data transfers make routes safer and more available to rescuers, patrols, extractive authorities, and traffickers. |
| Refugee Surge | player | front.refugee-surge.stage.1 | Fighting, route closures, delayed resettlement, and family movement increase pressure on Nysa, Varin, Meridian, and the Aster Vale. |
| Civil-War Spillover | player | front.hadran-incursion.stage.1 | Hadran patrols, covert teams, defectors, and weapons movement push the civil war into the March. |
| Black Ledger Consolidation | player | front.black-ledger-consolidation.stage.2 | Debt bondage, forged records, weapons transport, and protection contracts expand where lawful movement and rescue alternatives fail. |
| Protocol Inquiry | mixed | front.protocol-inquiry.stage.1 | Starfleet review, press attention, legal challenges, and internal evidence control determine whether the Lacuna Protocol is reformed, exposed, or buried. |
| Halden Audit | mixed | front.halden-audit.stage.1 | Halden continues testing compromised routes, contacting witnesses, and altering records while Starfleet, Black Ledger, and Hadran actors search for her. |

## Clocks

| Clock | Visibility | Initial | Range | Threshold fiction |
| --- | --- | --- | --- | --- |
| Nysa Capacity | hidden | 2 | 0–8 | 3: Temporary classrooms and workshops become sleeping quarters.; 5: Medical and life-support rationing begin.; 7: The council must turn away ships or expose another site.; 8: A capacity emergency forces evacuation, disclosure, or mass transfer. |
| Hadran Task Group | hidden | 1 | 0–10 | 3: Additional patrol craft arrive at the Perimeter.; 6: A task-group command ship begins inspection preparations.; 8: The group moves toward a suspected sanctuary route.; 10: A major armed incursion begins unless restrained or deterred. |
| Black Ledger Purge | hidden | 1 | 0–8 | 3: Debt records and identity shops relocate.; 5: Witnesses disappear and captives are moved.; 7: Nyra Voss evacuates evidence and armed assets.; 8: The syndicate destroys its central ledgers and disperses captives. |
| Far Lantern Archive Exposure | hidden | 1 | 0–8 | 3: The beacon emits corrupted historical traffic fragments.; 5: Multiple actors can triangulate the archive.; 7: A broad automatic restoration cycle begins.; 8: Unfiltered records broadcast unless custody is established. |
| Halloway Port Closure | playerFacing | 1 | 0–6 | 3: The colony imposes enhanced inspection and berth limits.; 5: Halloway refuses undocumented passenger transfer.; 6: The colony closes its ports except to escorted Federation traffic. |
| Kellan Inquiry | hidden | 1 | 0–8 | 2: Kellan remains ashore for further deposition.; 4: Starfleet restricts his access to selected records.; 6: Temporary relief or formal hearing becomes likely.; 8: A command-status decision cannot be postponed. |
| Gravesend Instability | playerFacing | 1 | 0–8 | 3: Known marker sequences drift and rescue times increase.; 5: One protected route requires immediate recalibration.; 7: Multiple crossings become physically compromised.; 8: The Veil closes to routine traffic until a major survey or repair. |
| Halden Exposure | hidden | 1 | 0–8 | 3: Black Ledger identifies one of Halden's relay habits.; 5: Hadran intelligence narrows her operating area.; 7: A hostile team moves against her or her witnesses.; 8: Halden is forced into direct contact, flight, or capture. |

## State tracks

| Track | Visibility | Initial | Range | How players perceive it |
| --- | --- | --- | --- | --- |
| Chart Restoration | hidden | 2 | 0–10 | Observed through route reliability, beacon use, traffic density, rescue times, and who can obtain coordinates. |
| Refugee Pressure | hidden | 3 | 0–10 | Observed through passenger load, housing queues, medical strain, family separation, and ships without destinations. |
| Civil-War Spillover | hidden | 2 | 0–10 | Observed through patrol activity, warrants, covert teams, weapons movement, and armed contact. |
| Criminal Exploitation | hidden | 4 | 0–10 | Observed through transport prices, forged records, coercive debts, disappearances, and who controls scarce berths. |
| Institutional Scrutiny | hidden | 3 | 0–10 | Observed through reporting demands, legal review, access restrictions, protected evidence, and public attention. |
| Halden Trail | hidden | 1 | 0–8 | Observed through corroborated telemetry, code fragments, witnesses, relay interventions, and physical evidence. |
| Crew Trust | hidden | 4 | 0–10 | Observed through initiative, candor, willingness to accept risk, private challenge, and the quality of delegated work. |
| Regional Legitimacy | hidden | 2 | 0–10 | Observed through whether routes, inspections, sanctuary decisions, and appeals are accepted by people who lose a case. |

## Story availability and convergence

Quests become available through state-derived convergence. The following profiles are enabling rules, not a mandatory play order:

| Profile | Condition | Effect |
| --- | --- | --- |
| convergence.open-march | All of: quest prelude-the-blank-route is resolved | make available: chapter-1-the-missing-colony, side-the-schoolship, side-beacon-for-no-one, standing-march-patrol, standing-route-review |
| convergence.open-halden | All of: quest chapter-1-the-missing-colony is resolved | make available: chapter-2-haldens-shuttle, side-the-long-way-home, side-customs-without-a-port |
| convergence.open-middle | All of: quest chapter-2-haldens-shuttle is resolved | make available: chapter-3-the-halloway-ledger, chapter-4-routes-without-records, side-the-hadran-funeral |
| convergence.open-pressure | Any of: quest chapter-3-the-halloway-ledger is resolved; criminal-exploitation gte 5 | make available: chapter-5-the-price-of-passage, side-the-unclaimed-dead |
| convergence.open-people | Any of: quest chapter-4-routes-without-records is resolved; refugee-pressure gte 6 | make available: chapter-6-the-people-between-maps, side-the-quiet-census, side-kestrel-homesteads, side-the-missing-sensor-pod |
| convergence.open-halden-contact | All of: halden-trail gte 4; quest chapter-3-the-halloway-ledger is resolved | make available: chapter-7-the-officer-in-the-veil |
| convergence.open-archive | Any of: quest chapter-7-the-officer-in-the-veil is resolved; chart-restoration gte 6 | make available: chapter-8-far-lantern |
| convergence.open-command-crisis | All of: quest chapter-8-far-lantern is resolved | make available: chapter-9-border-without-witnesses |
| convergence.open-finale | All of: quest chapter-9-border-without-witnesses is resolved; at least 4 known fact(s) tagged protocol | make available: finale-draw-the-border |
| convergence.open-epilogue | All of: quest finale-draw-the-border is resolved | make available: epilogue-the-lines-we-keep |

## Main questline as a network

The prelude and first Halloway contact establish the campaign contract. After Halden’s shuttle, the player can prioritize the ledger, routes, passage, people, Halden, Far Lantern, or regional side work according to current facts and pressures. The Director may offer several simultaneous opportunities and allow postponement. The next foreground operation should follow the player’s declared priorities, public deadlines, and active causal pressure.

## Designed side assignments

- **The Schoolship** — Can schooling remain ordinary when every safe route is also a political statement?
- **Customs Without a Port** — Can a mobile institution be accountable without becoming easy to seize?
- **Beacon for No One** — What is a beacon for after the people it named have gone?
- **The Quiet Census** — How can a community count what it must sustain without making every person legible to power?
- **The Long Way Home** — What is a homeward route worth when each checkpoint recognizes a different family?
- **Maps for Smugglers** — Can a useful route remain lawful when the person who knows it is not?
- **The Hadran Funeral** — Can enemies carry their dead across a border without claiming the living?
- **The Missing Sensor Pod** — How much should command risk to recover a machine that remembers where everyone went?
- **A Name at Halloway** — Does family connection create a right to be found?
- **The Unclaimed Dead** — Who may name the dead when every surviving record has a different answer?
- **Kestrel Homesteads** — What does formal recognition owe communities that built survival from systems nobody acknowledged?

Side assignments inherit current route state, faction posture, passenger load, ship condition, and known facts. They may be delegated when the template permits. Their outcomes can create rescue craft, local trust, protected identity practice, maintenance support, custody precedents, or new obligations that appear in the finale.

## Standing activities

- **March Patrol** — Conduct route checks, escort work, beacon repair, distress response, and limited inspections across the Lacuna March.
- **Route Review** — Review a route after new evidence, political change, infrastructure damage, or a request from affected communities.

These are repeatable frameworks rather than identical repeatable missions. Each instance must have a causal local problem and write back a specific route, actor, faction, ship, or crew consequence.

## Dynamic B-stories

Thread templates support command succession, professional resentment, chart ethics, witness protection, frontier fatigue, family continuity, scientific curiosity, and ordinary shipboard life. A latent thread becomes visible only through observable evidence. Most threads should remain conversations, callbacks, vignettes, or short shipboard scenes; promotion into a formal assignment requires sustained command action or travel.

## Reaction system

The package contains 38 bounded reaction rules. They listen for quest resolutions, route changes, time boundaries, front stages, and material campaign flags. Deterministic effects update state; narration then presents the visible consequence. Rules should not fire merely to oppose the player, and cooldowns prevent every event from producing immediate counteraction.

## Finale assembly

Draw the Border reads the actual world: route condition and custody, sanctuary capacity, Hadran posture, Black Ledger leverage, local legitimacy, evidence custody, Far Lantern status, Kellan and Halden status, ship condition, crew readiness, passenger load, protected commitments, and unresolved side work. The final operation may be a negotiation under pressure, a coordinated rescue and enforcement action, an archive transfer, a border compact, a tactical withdrawal, an evacuation, or several simultaneous fronts.

The finale must not invent unearned allies or erase prior losses. Assets and institutions operate where their earlier fiction and current capacity allow. The Aster Vale can anchor one decisive front and coordinate others, but cannot personally cover every route.

## Persistence rules

- Advance stardate by travel and consequential elapsed time.
- Move actors only through plausible travel, communication, custody, or delegation.
- Do not restore a route merely because a quest ended; apply the selected outcome effect.
- A player-safe chart may show a route as absent, uncertain, restricted, or available without exposing the hidden custodian or protected destination.
- World state is authoritative over narration and Command Log prose.
- A calm assignment remains calm unless existing state gives it a causal connection to larger pressure.
