# The Black Current: Open-World Campaign Implementation

## Campaign identity

- Campaign: The Black Current
- Ship: U.S.S. Serein, Steamrunner-class
- Opening stardate: 53672.1
- Opening year: 2376
- Theater: the Vanta Wake
- Runtime architecture: `directive.openWorldCampaign.v2`

## Open-world engine: recurrent emergence

The Wake is not a random-encounter excuse. The runtime maintains an **emergence queue** whose entries require causal parents. Valid parents include a documented missing vessel, a known battle vector, an anchor pulse, a forecasted current release, elapsed time in an advancing physical front, or a previous player decision that changed current pressure. The Director may improvise particulars only inside that causal envelope.

Each emergence is a persistent object with source record, estimated occupants, ordnance state, structural condition, subjective-duration estimate, claimants, custody status, evidence value, rescue state, current location, and downstream obligations. A wreck may generate several quests over time: rescue today, identity hearing later, component dispute after repair, memorial custody after investigation, and testimony in the finale.

The queue should not saturate every session. Quiet Orbit, shipboard repair, family contact, memorial observance, legal preparation, training, and ordinary crew scenes are part of the campaign's intended rhythm.

## Travel and attention

Major locations are usually one to three hours apart under normal conditions. Travel advances stardate. Towing, current pressure, route degradation, or a disabled relay can increase travel time. The Serein can normally tow one major hull while retaining useful maneuver and cannot be the foreground response at more than one site.

At each operational boundary the player may:

- personally respond with the Serein;
- dispatch a shuttle or recovery team;
- delegate to a crew officer or earned regional asset;
- request another faction to respond under current charter rules;
- delay, decline, or allow a local authority to act independently.

Delegation is stateful. Responders follow their capabilities, trust, legal standing, and prior orders. A Freehold tug recognized as a lawful first responder behaves differently from the same tug treated as contraband salvage. An unearned ally cannot be invoked because a finale needs one.

## Regional locations and route functions

| Location | Open-world function |
| --- | --- |
| Lydian Anchorage | A civilian repair ring and Federation communications platform serving as the Wake's administrative, medical, and legal hub. |
| Quiet Orbit | A low-traffic orbit around uninhabited Halden IV used for calibration, memorial work, crew recovery, and controlled testing. |
| Wreckfall Alpha | The most active emergence zone: a debris cloud around a subspace eddy marked by Starfleet buoys and civilian claim beacons. |
| Freehold Nine | A converted ore station governed by the Free Salvage Coalition, crowded with tugs, divers, independent medics, and improvised repair yards. |
| Cardassian Memorial Field | A broad field of Cardassian military, civilian, and penal transports from the war's final months, treated by many families as a grave site. |
| Ternion Relay | A damaged navigation and communications relay whose sensor baseline is essential for predicting current shifts. |
| Ironside Narrows | A compressed channel where military wrecks and live weapons tend to emerge close together. |
| Sable Exchange | A compact commerce platform used by the Hegg Claims Consortium for title review, insurance settlement, and neutral escrow. |
| Sable Verge | A relatively gentle edge of the Wake where intact vessels sometimes emerge with living crews and severe temporal dislocation. |
| Mooring Grave | Undiscovered at campaign start. |
| Anchor Seventeen | Undiscovered at campaign start. |
| Blackmouth | The deepest and least stable junction in the Wake, where vessels can remain trapped for months before release. |

## Persistent fronts

### Current Convergence

Anchor pulses, elapsed time, tractor events, and damaged channels increase emergence frequency and the probability of Black Tide.

**Goals:** Increase route shear; Queue larger emergences; Force a mass release if unvented

**Stages:** The Wake remains active but established response patterns still work. -> Emergences occur more often and warnings shorten. -> Conditional routes fail without Ternion data or experienced pilots. -> Multiple zones become active at once and towing operations increase pressure. -> Blackmouth begins releasing large coherent wreck groups. -> Anchor Seventeen approaches an uncontrolled vent. -> Black Tide is underway across the corridor.

### Survivor Crisis

Medical capacity, housing, identity records, family conflict, and public legitimacy strain under each new return.

**Goals:** Overload medical and housing capacity; Create identity disputes; Force emergency status decisions

**Stages:** Existing capacity can absorb small arrivals. -> Quarantine and housing queues become visible. -> Families, employers, and courts contest returned identities. -> The Anchorage begins turning survivors away. -> Unhoused returnees organize or leave official custody. -> Mass arrival overwhelms all centralized care.

### Ordnance Drift

Mines, torpedoes, weapons platforms, and unstable reactors move into civilian recovery channels.

**Goals:** Create accidental detonations; Feed black-market salvage; Militarize claim disputes

**Stages:** Known hazards remain isolated. -> Salvagers report missing weapons components. -> Live ordnance appears in civilian docks. -> An automated military system begins active targeting. -> Multiple factions deploy armed recovery teams. -> The Black Tide includes an organized weapons cluster.

### Custody Conflict

Starfleet, Freehold, Cardassian families, commercial claimants, and returned persons compete over rescue authority, evidence, graves, and title.

**Goals:** Fragment response authority; Trigger seizures or strikes; Undermine shared rules

**Stages:** Disputes are handled case by case. -> Claim beacons and evidence seals are routinely challenged. -> Responders begin withholding information from rivals. -> Freehold or Cardassian teams refuse Starfleet access. -> Competing armed custody operations occur. -> No shared authority remains for Black Tide delegation.

### Mooring Evidence Suppression

Security Liaison personnel classify, seize, redirect, or destroy evidence connecting the Wake to Project Mooring.

**Goals:** Control classified wrecks; Prevent public attribution; Secure Anchor Seventeen

**Stages:** Security monitors selected recoveries. -> Compartmented orders redirect teams and records. -> Evidence witnesses face recall or classification pressure. -> A coordinated purge targets Mooring records and components. -> Security attempts exclusive control of Anchor Seventeen. -> Accountability evidence survives only through distributed copies.

### Crew War Strain

Repeated contact with familiar names, returned shipmates, remains, and wartime records accumulates across the Serein.

**Goals:** Reduce recovery endurance; Create errors and conflict; Force command attention to rest and meaning

**Stages:** The crew is tired but functional. -> Personal recognition and sleep disruption become common. -> Departments begin hiding strain to remain useful. -> Errors, arguments, and avoidance affect operations. -> A serious breakdown or refusal becomes likely. -> The ship cannot sustain Black Tide without deliberate relief and delegation.

## State tracks

Raw values remain hidden. The player observes them through field reports, access, shortages, public response, injury load, route forecasts, work stoppages, and crew behavior.

| Track | What it means | Fictional signals |
| --- | --- | --- |
| Current Pressure | The severity and frequency of current shear and emergences. | Communicated through reports, access, capacity, public response, and operational behavior. |
| Survivor Load | Medical, housing, identity, and social strain created by returned survivors. | Communicated through reports, access, capacity, public response, and operational behavior. |
| Ordnance Hazard | The amount of live weapons, unstable reactors, and militarized salvage in circulation. | Communicated through reports, access, capacity, public response, and operational behavior. |
| Claims Legitimacy | Whether the region accepts its rules for rescue, salvage, graves, evidence, and compensation as credible. | Communicated through reports, access, capacity, public response, and operational behavior. |
| Institutional Secrecy | The pressure to conceal Project Mooring and prioritize classified recovery. | Communicated through reports, access, capacity, public response, and operational behavior. |
| Crew War Strain | The Serein crew's accumulated exposure to returning wrecks, familiar names, and unresolved loss. | Communicated through reports, access, capacity, public response, and operational behavior. |

## Clocks

Clocks advance only when their causal process continues. Rest and travel do not automatically advance every clock.

| Clock | Segments | Initial | Trigger basis |
| --- | ---: | ---: | --- |
| Black Tide Convergence | 10 | 1 | Elapsed time, anchor stress, and high-energy operations determine when the mass emergence begins. |
| Captain Lorne Recovery | 8 | 1 | Medical stabilization, rest, setbacks, and command pressure determine Lorne's capacity for limited or full duty. |
| Ternion Degradation | 6 | 1 | The relay loses baseline fidelity and power margin unless repaired or relieved. |
| Freehold Work Stoppage | 6 | 0 | Seizures, uncompensated rescue labor, or denied standing can trigger a coordinated refusal of Freehold support. |
| Ordnance Leakage | 6 | 1 | Ignored sites and weak custody allow weapons components to enter private trade and armed factions. |
| Mooring Evidence Purge | 6 | 1 | Ro's office acts to contain records as the player approaches the truth. |
| Returned Persons Mobilization | 6 | 0 | Legal harms and public treatment determine whether returnees form a cooperative assembly or an oppositional movement. |

## Quest availability and convergence

The prelude begins active. The Living Dead operations open after Wreckfall. Claims operations appear after the player creates at least one survivor or custody precedent. Arsenal operations appear through ordnance pressure, military evidence, or Cardassian wreck investigation. Anchor investigation opens through Mooring-tagged facts or Ternion work. Anchor Seventeen itself requires several independent sources rather than one mandatory quest. Black Tide requires both regional preparation and sufficient truth about the mechanism.

Availability is not chronology. A player may build the recovery charter before completing every survivor case, enter Blackmouth before settling Freehold's legal standing, or destroy dangerous weapons before learning their connection to Mooring. The resulting state changes what later scenes contain.

## Side work and calm continuity

The nine designed assignments are standing opportunities, not mandatory intervals. They may be pursued, postponed, delegated where permitted, transformed by world state, or ignored. Quiet Water should remain a scientific calibration assignment unless prior decisions causally bring danger to Quiet Orbit. The Last Message, the Cardassian Bell, and Deck Nine can provide grief and memory without becoming conspiracy clues.

## Dynamic thread behavior

Thread templates cover command succession, Lorne's recovery, tractor-system debt, forecast confidence, salvage ethics, uncertainty before force, returned-person medicine, pilot judgment, redacted manifests, unidentified remains, recovery-deck fatigue, Freehold standing, the Returned Persons Assembly, and ordinary continuity. A thread requires observable evidence, remains hidden until engaged, and becomes a formal quest only when sustained command action or travel is necessary.

## Offscreen faction turns

At suitable boundaries, each active faction may take one action if it has a goal, knowledge basis, capability, and opportunity. Examples include Pell issuing a centralizing directive after disorder; Brant withholding tugs after seizures; Vek publishing grave interference; Hegg financing a relay in exchange for escrow authority; Ro moving an evidence team after a Mooring fact becomes public; or Lydian authorities limiting docking after survivor capacity is exceeded.

The Director records the causal chain. Factions do not teleport information, know hidden facts merely because the Director knows them, or choose actions solely to frustrate the player.

## Finale assembly

Black Tide reads:

- the active and forecast emergence queue;
- Anchor Seventeen's current disposition;
- Current Pressure, Survivor Load, Ordnance Hazard, Claims Legitimacy, Institutional Secrecy, and Crew War Strain;
- available medical berths, tugs, pilots, identification teams, escrow institutions, forecasts, codes, and evidence packages;
- route status and Ternion reliability;
- faction posture and the recovery charter actually established;
- unresolved quests and uncontained weapons;
- the Serein's condition, tractor limits, shuttle availability, and active crew threads;
- Lorne's medical and command state.

The finale foregrounds one site at a time but resolves several fronts concurrently through delegation and committed campaign assets. Its ending family is an evaluation of accumulated state, not a single final dialogue choice.
