# The Vanta Wake Gazetteer

## Region overview

The Vanta Wake is a postwar recovery corridor near former Dominion battle lines. A natural subspace fault, altered by wartime engineering, compresses and later releases ships and debris along several emergence zones. The region is compact enough for recurring travel, but no single vessel can cover every event.

The map is schematic. Coordinates, confidence, and access are campaign state. Solid routes are generally safe outside an emergence event. Dashed routes cross active current, restricted space, low-confidence baselines, or hidden Project Mooring channels. A major tow increases travel time and consumes the Serein's primary recovery capacity.

- Player map: `assets/maps/vanta-wake-player-map.png`
- Director map: `assets/maps/vanta-wake-director-map.png`

## Route table

| Route | From | To | Baseline hours | Opening state | Confidence |
| --- | --- | --- | ---: | --- | --- |
| Lydian Anchorage to Wreckfall Alpha | Lydian Anchorage | Wreckfall Alpha | 2.0 | conditional | provisional |
| Lydian Anchorage to Freehold Nine | Lydian Anchorage | Freehold Nine | 2.5 | stable | established |
| Lydian Anchorage to Quiet Orbit | Lydian Anchorage | Quiet Orbit | 1.5 | stable | established |
| Lydian Anchorage to Sable Exchange | Lydian Anchorage | Sable Exchange | 1.0 | stable | established |
| Wreckfall Alpha to Freehold Nine | Wreckfall Alpha | Freehold Nine | 1.5 | conditional | provisional |
| Wreckfall Alpha to Cardassian Memorial Field | Wreckfall Alpha | Cardassian Memorial Field | 2.5 | hazardous | provisional |
| Freehold Nine to Ternion Relay | Freehold Nine | Ternion Relay | 2.0 | stable | established |
| Freehold Nine to Ironside Narrows | Freehold Nine | Ironside Narrows | 1.5 | conditional | provisional |
| Freehold Nine to Sable Exchange | Freehold Nine | Sable Exchange | 1.5 | stable | established |
| Quiet Orbit to Sable Verge | Quiet Orbit | Sable Verge | 1.5 | conditional | provisional |
| Sable Verge to Ternion Relay | Sable Verge | Ternion Relay | 2.5 | conditional | provisional |
| Cardassian Memorial Field to Ironside Narrows | Cardassian Memorial Field | Ironside Narrows | 1.25 | conditional | provisional |
| Ternion Relay to Blackmouth | Ternion Relay | Blackmouth | 3.5 | hazardous | provisional |
| Ironside Narrows to Blackmouth | Ironside Narrows | Blackmouth | 2.75 | hazardous | provisional |
| Cardassian Memorial Field to Anchor Seventeen | Cardassian Memorial Field | Anchor Seventeen | 2.0 | secret | provisional |
| Ternion Relay to Anchor Seventeen | Ternion Relay | Anchor Seventeen | 2.0 | secret | provisional |
| Anchor Seventeen to Blackmouth | Anchor Seventeen | Blackmouth | 2.5 | hazardous | provisional |
| Cardassian Memorial Field to Mooring Grave | Cardassian Memorial Field | Mooring Grave | 1.5 | secret | provisional |
| Mooring Grave to Anchor Seventeen | Mooring Grave | Anchor Seventeen | 1.0 | secret | provisional |

## Locations


## Lydian Anchorage

**ID:** `lydian-anchorage`  
**Kind:** regional-hub  
**Initially known:** Yes  
**Tags:** hub, medical, legal, starfleet, civilian

### Player-facing identity

A civilian repair ring and Federation communications platform serving as the Wake's administrative, medical, and legal hub.

### Director function

The safest place to transfer patients, hold hearings, and reach Starfleet. It has too little housing, too many offices, and no privacy once an arrival becomes public.

### Everyday life

Families queue at identification desks, tug crews barter docking time, and temporary courts share rooms with relief agencies and repair supervisors.

### Connected routes

- Wreckfall Alpha: 2.0 hours baseline, conditional, confidence provisional
- Freehold Nine: 2.5 hours baseline, stable, confidence established
- Quiet Orbit: 1.5 hours baseline, stable, confidence established
- Sable Exchange: 1.0 hours baseline, stable, confidence established

### Repeatable scene families

- Emergence forecast, traffic control, rescue, towing, forensics, claim hearing, repair, memorial work, crew recovery, or local transport appropriate to current state.
- A calm scene grounded in ordinary work or community continuity where the location supports it.
- An offscreen faction action only when actor, knowledge, capability, and opportunity are established.

## Quiet Orbit

**ID:** `quiet-orbit`  
**Kind:** calm-science-zone  
**Initially known:** Yes  
**Tags:** calm, science, crew, memorial

### Player-facing identity

A low-traffic orbit around uninhabited Halden IV used for calibration, memorial work, crew recovery, and controlled testing.

### Director function

Preserve this as a low-pressure location unless prior decisions create a direct consequence. It supports calm science, maintenance, counseling, and private command scenes.

### Everyday life

The Serein rotates departments through maintenance drills, memorial observances, and uninterrupted sleep cycles while instruments watch the distant current.

### Connected routes

- Lydian Anchorage: 1.5 hours baseline, stable, confidence established
- Sable Verge: 1.5 hours baseline, conditional, confidence provisional

### Repeatable scene families

- Emergence forecast, traffic control, rescue, towing, forensics, claim hearing, repair, memorial work, crew recovery, or local transport appropriate to current state.
- A calm scene grounded in ordinary work or community continuity where the location supports it.
- An offscreen faction action only when actor, knowledge, capability, and opportunity are established.

## Wreckfall Alpha

**ID:** `wreckfall-alpha`  
**Kind:** emergence-zone  
**Initially known:** Yes  
**Tags:** emergence, rescue, salvage, hazard

### Player-facing identity

The most active emergence zone: a debris cloud around a subspace eddy marked by Starfleet buoys and civilian claim beacons.

### Director function

The opening triple emergence occurs here. Cleared lanes, memorial markers, and claim boundaries can all be rewritten by later arrivals.

### Everyday life

Freehold crews hold hot standby, recovery drones circle at low power, and every ship keeps escape vectors plotted before it begins work.

### Connected routes

- Lydian Anchorage: 2.0 hours baseline, conditional, confidence provisional
- Freehold Nine: 1.5 hours baseline, conditional, confidence provisional
- Cardassian Memorial Field: 2.5 hours baseline, hazardous, confidence provisional

### Repeatable scene families

- Emergence forecast, traffic control, rescue, towing, forensics, claim hearing, repair, memorial work, crew recovery, or local transport appropriate to current state.
- A calm scene grounded in ordinary work or community continuity where the location supports it.
- An offscreen faction action only when actor, knowledge, capability, and opportunity are established.

## Freehold Nine

**ID:** `freehold-nine`  
**Kind:** salvage-station  
**Initially known:** Yes  
**Tags:** salvage, local, repair, refuge

### Player-facing identity

A converted ore station governed by the Free Salvage Coalition, crowded with tugs, divers, independent medics, and improvised repair yards.

### Director function

Freehold can become the strongest response partner, an adversarial sanctuary, or the center of an independent recovery regime. Its manifests are deliberately incomplete.

### Everyday life

Crews eat in shifts beside pressure-suit lockers, rescued people sleep in former ore galleries, and disputes are settled at dock meetings before formal law arrives.

### Connected routes

- Lydian Anchorage: 2.5 hours baseline, stable, confidence established
- Wreckfall Alpha: 1.5 hours baseline, conditional, confidence provisional
- Ternion Relay: 2.0 hours baseline, stable, confidence established
- Ironside Narrows: 1.5 hours baseline, conditional, confidence provisional
- Sable Exchange: 1.5 hours baseline, stable, confidence established

### Repeatable scene families

- Emergence forecast, traffic control, rescue, towing, forensics, claim hearing, repair, memorial work, crew recovery, or local transport appropriate to current state.
- A calm scene grounded in ordinary work or community continuity where the location supports it.
- An offscreen faction action only when actor, knowledge, capability, and opportunity are established.

## Cardassian Memorial Field

**ID:** `cardassian-memorial-field`  
**Kind:** wreckfield-memorial  
**Initially known:** Yes  
**Tags:** cardassian, memorial, evidence, wreckfield

### Player-facing identity

A broad field of Cardassian military, civilian, and penal transports from the war's final months, treated by many families as a grave site.

### Director function

Supports forensic, memorial, diplomatic, and evidence-custody work. Starfleet Security sees some hulls as classified evidence, creating recurring jurisdiction pressure.

### Everyday life

Family craft maintain memorial lights, archivists scan hull markings, and recovery teams move quietly even when ordnance alarms sound.

### Connected routes

- Wreckfall Alpha: 2.5 hours baseline, hazardous, confidence provisional
- Ironside Narrows: 1.25 hours baseline, conditional, confidence provisional
- Anchor Seventeen: 2.0 hours baseline, secret, confidence provisional
- Mooring Grave: 1.5 hours baseline, secret, confidence provisional

### Repeatable scene families

- Emergence forecast, traffic control, rescue, towing, forensics, claim hearing, repair, memorial work, crew recovery, or local transport appropriate to current state.
- A calm scene grounded in ordinary work or community continuity where the location supports it.
- An offscreen faction action only when actor, knowledge, capability, and opportunity are established.

## Ternion Relay

**ID:** `ternion-relay`  
**Kind:** navigation-relay  
**Initially known:** Yes  
**Tags:** infrastructure, forecast, communications, neutral

### Player-facing identity

A damaged navigation and communications relay whose sensor baseline is essential for predicting current shifts.

### Director function

The best neutral site for shared emergence warnings. Its authentication and access policy can favor Starfleet, Freehold, Cardassian authorities, or commercial claimants.

### Everyday life

Technicians live in rotating pressure modules, repair arrays between pulses, and argue over whose clocks define an official warning.

### Connected routes

- Freehold Nine: 2.0 hours baseline, stable, confidence established
- Sable Verge: 2.5 hours baseline, conditional, confidence provisional
- Blackmouth: 3.5 hours baseline, hazardous, confidence provisional
- Anchor Seventeen: 2.0 hours baseline, secret, confidence provisional

### Repeatable scene families

- Emergence forecast, traffic control, rescue, towing, forensics, claim hearing, repair, memorial work, crew recovery, or local transport appropriate to current state.
- A calm scene grounded in ordinary work or community continuity where the location supports it.
- An offscreen faction action only when actor, knowledge, capability, and opportunity are established.

## Ironside Narrows

**ID:** `ironside-narrows`  
**Kind:** ordnance-zone  
**Initially known:** Yes  
**Tags:** ordnance, military, hazard, evidence

### Player-facing identity

A compressed channel where military wrecks and live weapons tend to emerge close together.

### Director function

The Arsenal Below arc concentrates here. Strong tactical action can make it safer while destroying Project Mooring telemetry embedded in weapons-control records.

### Everyday life

No one lives here. Disposal crews stage behind armored buoys, and salvagers watch from the edge for anything valuable enough to justify the risk.

### Connected routes

- Freehold Nine: 1.5 hours baseline, conditional, confidence provisional
- Cardassian Memorial Field: 1.25 hours baseline, conditional, confidence provisional
- Blackmouth: 2.75 hours baseline, hazardous, confidence provisional

### Repeatable scene families

- Emergence forecast, traffic control, rescue, towing, forensics, claim hearing, repair, memorial work, crew recovery, or local transport appropriate to current state.
- A calm scene grounded in ordinary work or community continuity where the location supports it.
- An offscreen faction action only when actor, knowledge, capability, and opportunity are established.

## Sable Exchange

**ID:** `sable-exchange`  
**Kind:** commercial-escrow  
**Initially known:** Yes  
**Tags:** commerce, claims, legal, ferengi

### Player-facing identity

A compact commerce platform used by the Hegg Claims Consortium for title review, insurance settlement, and neutral escrow.

### Director function

It can finance recovery infrastructure and provide transparent custody, or convert every return into debt-backed property. It is orderly, public, and legally aggressive.

### Everyday life

Claimants wait in quiet offices while appraisers inspect fragments, family advocates challenge contracts, and Ferengi clerks track every minute of berth time.

### Connected routes

- Lydian Anchorage: 1.0 hours baseline, stable, confidence established
- Freehold Nine: 1.5 hours baseline, stable, confidence established

### Repeatable scene families

- Emergence forecast, traffic control, rescue, towing, forensics, claim hearing, repair, memorial work, crew recovery, or local transport appropriate to current state.
- A calm scene grounded in ordinary work or community continuity where the location supports it.
- An offscreen faction action only when actor, knowledge, capability, and opportunity are established.

## Sable Verge

**ID:** `sable-verge`  
**Kind:** low-shear-emergence-zone  
**Initially known:** No  
**Tags:** survivors, identity, emergence, medical

### Player-facing identity

A relatively gentle edge of the Wake where intact vessels sometimes emerge with living crews and severe temporal dislocation.

### Director function

The Velorum and other survivor-heavy arrivals can occur here. It becomes a site for identity hearings, quarantine, and the political organization of returned persons.

### Everyday life

Once discovered, temporary habitats, family shuttles, press craft, and medical observation platforms gather around the quiet eddy.

### Connected routes

- Quiet Orbit: 1.5 hours baseline, conditional, confidence provisional
- Ternion Relay: 2.5 hours baseline, conditional, confidence provisional

### Repeatable scene families

- Emergence forecast, traffic control, rescue, towing, forensics, claim hearing, repair, memorial work, crew recovery, or local transport appropriate to current state.
- A calm scene grounded in ordinary work or community continuity where the location supports it.
- An offscreen faction action only when actor, knowledge, capability, and opportunity are established.

## Mooring Grave

**ID:** `mooring-grave`  
**Kind:** hidden-anchor-debris  
**Initially known:** No  
**Tags:** hidden, project-mooring, evidence, hazard

### Player-facing identity

Undiscovered at campaign start.

### Director function

The embedded remains of a destroyed Project Mooring anchor. It contains alloy, command fragments, and evidence that the Wake's present behavior is engineered.

### Everyday life

None. Debris periodically phases into normal space and is mistaken for unrelated wreckage.

### Connected routes

- Cardassian Memorial Field: 1.5 hours baseline, secret, confidence provisional
- Anchor Seventeen: 1.0 hours baseline, secret, confidence provisional

### Repeatable scene families

- Emergence forecast, traffic control, rescue, towing, forensics, claim hearing, repair, memorial work, crew recovery, or local transport appropriate to current state.
- A calm scene grounded in ordinary work or community continuity where the location supports it.
- An offscreen faction action only when actor, knowledge, capability, and opportunity are established.

## Anchor Seventeen

**ID:** `anchor-seventeen`  
**Kind:** hidden-control-platform  
**Initially known:** No  
**Tags:** hidden, project-mooring, control, finale

### Player-facing identity

Undiscovered at campaign start.

### Director function

The surviving Project Mooring control platform embedded in a planetoid. It can vent, redirect, stabilize, or catastrophically release accumulated current paths.

### Everyday life

None at opening. If occupied, it becomes a dangerous command post requiring constant repair and multi-party custody.

### Connected routes

- Cardassian Memorial Field: 2.0 hours baseline, secret, confidence provisional
- Ternion Relay: 2.0 hours baseline, secret, confidence provisional
- Blackmouth: 2.5 hours baseline, hazardous, confidence provisional
- Mooring Grave: 1.0 hours baseline, secret, confidence provisional

### Repeatable scene families

- Emergence forecast, traffic control, rescue, towing, forensics, claim hearing, repair, memorial work, crew recovery, or local transport appropriate to current state.
- A calm scene grounded in ordinary work or community continuity where the location supports it.
- An offscreen faction action only when actor, knowledge, capability, and opportunity are established.

## Blackmouth

**ID:** `blackmouth`  
**Kind:** deep-current-junction  
**Initially known:** Yes  
**Tags:** deep-current, finale, hazard, exploration

### Player-facing identity

The deepest and least stable junction in the Wake, where vessels can remain trapped for months before release.

### Director function

The final mass emergence originates here. Earlier expeditions can gain evidence and warning or worsen the Black Tide through damage and high-energy operations.

### Everyday life

There is no permanent settlement. Beacons fail quickly, crews work in short watches, and every approach includes an explicit abandonment vector.

### Connected routes

- Ternion Relay: 3.5 hours baseline, hazardous, confidence provisional
- Ironside Narrows: 2.75 hours baseline, hazardous, confidence provisional
- Anchor Seventeen: 2.5 hours baseline, hazardous, confidence provisional

### Repeatable scene families

- Emergence forecast, traffic control, rescue, towing, forensics, claim hearing, repair, memorial work, crew recovery, or local transport appropriate to current state.
- A calm scene grounded in ordinary work or community continuity where the location supports it.
- An offscreen faction action only when actor, knowledge, capability, and opportunity are established.


# Regional factions


## Starfleet Recovery Bureau

**ID:** `starfleet-recovery-bureau`  
**Initial posture:** supportive-but-centralizing  
**Visibility:** player

### Player-facing identity

The Starfleet authority responsible for rescue coordination, evidence custody, and reopening the Vanta corridor.

### Director purpose

Competent but politically exposed. It prefers centralized custody and rapid metrics, and knows Project Mooring existed without understanding the present scale.

### Goals

- Save survivors
- Secure dangerous technology
- Reopen the corridor
- Preserve Starfleet legitimacy

### Methods

- Formal orders
- Logistics support
- Temporary courts
- Command review

## Free Salvage Coalition

**ID:** `free-salvage-coalition`  
**Initial posture:** wary-but-open  
**Visibility:** player

### Player-facing identity

A federation of tug captains, divers, station crews, and independent medics who kept the Wake's rescue network alive before Starfleet arrived in force.

### Director purpose

Operationally indispensable and legally exposed. Members alter manifests to avoid seizure, but many records also conceal profiteering or unsafe work.

### Goals

- Protect rescue labor
- Retain local autonomy
- Keep Freehold open
- Gain lawful standing

### Methods

- Rapid response
- Collective bargaining
- Manifest control
- Mutual aid

## Cardassian Remembrance Commission

**ID:** `cardassian-remembrance-commission`  
**Initial posture:** demanding-but-cooperative  
**Visibility:** player

### Player-facing identity

Families, archivists, and reconstruction officials seeking identification, grave protection, and control over Cardassian remains and records.

### Director purpose

Will cooperate on safety and forensics but publicly challenge secret Starfleet seizures. Internal members disagree over military evidence and family privacy.

### Goals

- Identify the missing
- Protect graves
- Recover family records
- Prevent Federation spoil-taking

### Methods

- Forensic teams
- Public advocacy
- Diplomatic protest
- Archive comparison

## Hegg Claims Consortium

**ID:** `hegg-claims-consortium`  
**Initial posture:** opportunistic  
**Visibility:** player

### Player-facing identity

A Ferengi-backed legal and salvage enterprise purchasing insurance rights, debts, and abandoned-title certificates.

### Director purpose

Can fund infrastructure and provide neutral escrow, or exploit desperation and turn survival into property. Its contracts are meticulous rather than fraudulent by default.

### Goals

- Acquire valuable claims
- Become indispensable to arbitration
- Finance recoverable infrastructure
- Avoid Starfleet seizure

### Methods

- Escrow
- Debt purchase
- Insurance law
- Private appraisers

## Starfleet Security Liaison Office

**ID:** `starfleet-security-liaison`  
**Initial posture:** courteous-and-compartmented  
**Visibility:** player

### Player-facing identity

A security office tasked with recovering classified technology and preventing wartime systems from entering civilian or hostile hands.

### Director purpose

Holds the most complete Mooring records and quietly prioritizes classified wrecks over civilian rescue. Its orders are often lawful in form but broader than its actual mandate.

### Goals

- Recover classified systems
- Suppress dangerous details
- Control Mooring evidence
- Prevent weapons proliferation

### Methods

- Compartmented orders
- Seizure teams
- Classification
- Pressure on records officers

## Lydian Civil Authority

**ID:** `lydian-civil-authority`  
**Initial posture:** strained-neutral  
**Visibility:** player

### Player-facing identity

The civilian administration hosting the Anchorage, courts, shelters, and traffic services on which the region depends.

### Director purpose

Wants safety and predictable law but cannot absorb unlimited survivors. It will support whichever regime keeps traffic moving without making Lydian space a permanent camp.

### Goals

- Protect local residents
- Keep the Anchorage functional
- Avoid military occupation
- Secure outside funding

### Methods

- Berth control
- Civil hearings
- Housing rules
- Public communications

## Project Mooring

**ID:** `project-mooring`  
**Initial posture:** hidden-legacy  
**Visibility:** director

### Player-facing identity

Unknown at campaign start.

### Director purpose

A dissolved wartime Starfleet-Cardassian program that bent a natural subspace fault with four anchors. Surviving records, officers, and automated protocols still shape events.

### Goals

- Complete wartime routing logic
- Protect command secrecy
- Prevent uncontrolled anchor access

### Methods

- Legacy automation
- Compartmented records
- Authentication locks
- Institutional concealment


# Key regional characters


## Commissioner Nara Pell — Director, Starfleet Recovery Bureau Vanta Office

- ID: `nara-pell`
- Species: Human
- Faction: `starfleet-recovery-bureau`
- Opening location: `lydian-anchorage`
- Initial posture: supportive-but-centralizing

### Player-facing identity

A capable recovery commissioner under pressure to reopen the corridor and demonstrate orderly Starfleet control.

### Director handling

Knows Project Mooring existed, not that Anchor Seventeen is still operating. She can authorize broad discretion if the player supplies a defensible alternative to centralization.

### Knowledge boundary

- Knows wartime experiments affected the corridor
- Knows current Recovery Bureau orders
- Does not know the full anchor network or Ro's private priorities

### Performance note

Keep speech consistent with the actor's public role, posture, and current leverage; do not use dialogue to leak Director-only knowledge.

## Luma Brant — Elected Dockmaster of Freehold Nine

- ID: `luma-brant`
- Species: Human
- Faction: `free-salvage-coalition`
- Opening location: `freehold-nine`
- Initial posture: wary-and-pragmatic

### Player-facing identity

A sharp, charismatic organizer who refuses to let Starfleet redefine years of unsanctioned rescue as theft.

### Director handling

Can build the strongest local response network. She also protects altered manifests and people who crossed legal lines while rescuing others.

### Knowledge boundary

- Knows Freehold routes and responder history
- Knows some anchor-like components were salvaged
- Does not know Project Mooring's full purpose

### Performance note

Keep speech consistent with the actor's public role, posture, and current leverage; do not use dialogue to leak Director-only knowledge.

## Advocate Serat Vek — Senior Advocate, Cardassian Remembrance Commission

- ID: `serat-vek`
- Species: Cardassian
- Faction: `cardassian-remembrance-commission`
- Opening location: `cardassian-memorial-field`
- Initial posture: formal-and-demanding

### Player-facing identity

A disciplined advocate demanding that Cardassian wrecks and remains not be treated as Federation spoils.

### Director handling

Will cooperate on identification and ordnance removal but publicly challenge secret evidence seizures. He is willing to accept shared custody if families retain enforceable rights.

### Knowledge boundary

- Knows family and military archive records
- Suspects joint wartime engineering
- Does not know Anchor Seventeen coordinates

### Performance note

Keep speech consistent with the actor's public role, posture, and current leverage; do not use dialogue to leak Director-only knowledge.

## Broker Hegg — Managing Partner, Hegg Claims Consortium

- ID: `broker-hegg`
- Species: Ferengi
- Faction: `hegg-claims-consortium`
- Opening location: `sable-exchange`
- Initial posture: meticulous-and-opportunistic

### Player-facing identity

A meticulous claims broker who can make complex ownership disputes legible, for a price.

### Director handling

Not comic relief. Hegg values enforceable process and predictable returns. A transparent escrow compact can make the Consortium useful without giving it sovereign authority.

### Knowledge boundary

- Knows insurance and title chains
- Knows which claimants sold rights under duress
- Does not know classified Mooring details

### Performance note

Keep speech consistent with the actor's public role, posture, and current leverage; do not use dialogue to leak Director-only knowledge.

## Commander Elian Ro — Starfleet Security Liaison

- ID: `elian-ro`
- Species: Bajoran
- Faction: `starfleet-security-liaison`
- Opening location: `lydian-anchorage`
- Initial posture: courteous-and-compartmented

### Player-facing identity

A polished security officer responsible for classified recovery and weapons control.

### Director handling

Holds the most complete Mooring record and has ordered covert priority for several classified wrecks. He believes disclosure could destabilize the corridor and ruin Starfleet reconstruction.

### Knowledge boundary

- Knows all four Mooring anchors and the surviving control platform
- Knows classified wreck priorities
- Does not know exact current occupancy or every civilian emergence

### Performance note

Keep speech consistent with the actor's public role, posture, and current leverage; do not use dialogue to leak Director-only knowledge.

## Commander Ila Varen — Commanding Officer, U.S.S. Velorum

- ID: `ila-varen`
- Species: Human
- Faction: `starfleet-recovery-bureau`
- Opening location: `sable-verge`
- Initial posture: disoriented-but-commanding

### Player-facing identity

A Starfleet commander returned alive after seven outside months and only twelve subjective days.

### Director handling

Expects her ship, orders, billet, and family relationships to remain intact. She becomes a recurring test of whether return means restoration or merely survival.

### Knowledge boundary

- Knows her last orders and crew experience
- Observed unusual Starfleet routing beacons inside the current
- Does not know the outside legal consequences

### Performance note

Keep speech consistent with the actor's public role, posture, and current leverage; do not use dialogue to leak Director-only knowledge.

## Administrator Davi Leth — Chief Administrator, Lydian Anchorage

- ID: `davi-leth`
- Species: Lydian
- Faction: `lydian-civil-authority`
- Opening location: `lydian-anchorage`
- Initial posture: strained-and-practical

### Player-facing identity

The civilian administrator responsible for berths, shelters, traffic, and public order at the Anchorage.

### Director handling

Wants humane policy but cannot let the Anchorage become an unlimited holding facility. Will support distributed capacity if Starfleet helps build it.

### Knowledge boundary

- Knows local capacity and public mood
- Knows which agencies are concealing numbers
- Does not know current engineering

### Performance note

Keep speech consistent with the actor's public role, posture, and current leverage; do not use dialogue to leak Director-only knowledge.

## Doctor Kera Taan — Lead Forensic Archivist, Cardassian Remembrance Commission

- ID: `dr-kera-taan`
- Species: Cardassian
- Faction: `cardassian-remembrance-commission`
- Opening location: `cardassian-memorial-field`
- Initial posture: reserved-and-rigorous

### Player-facing identity

A forensic archivist capable of matching remains, hull fragments, and damaged records across incompatible databases.

### Director handling

Provides one of the best evidence routes to Mooring through Cardassian engineering logs. She protects family privacy and rejects intelligence fishing.

### Knowledge boundary

- Knows Cardassian convoy records
- Can recognize joint Starfleet-Cardassian components
- Does not know Ro's surviving archive

### Performance note

Keep speech consistent with the actor's public role, posture, and current leverage; do not use dialogue to leak Director-only knowledge.

## Captain Pera Voss — Master of the recovery tug Long Hand

- ID: `pera-voss`
- Species: Tellarite
- Faction: `free-salvage-coalition`
- Opening location: `wreckfall-alpha`
- Initial posture: blunt-and-reliable

### Player-facing identity

A Freehold tug captain whose crew is often first into active emergence zones.

### Director handling

Can become a trusted delegated responder. Voss will disobey a slow order to save visible lives and accept review afterward.

### Knowledge boundary

- Knows practical current behavior
- Knows Freehold claim history
- Does not know Mooring design

### Performance note

Keep speech consistent with the actor's public role, posture, and current leverage; do not use dialogue to leak Director-only knowledge.

## Magistrate Tava Orrel — Federation Emergency Claims Magistrate

- ID: `magistrate-orrel`
- Species: Betazoid
- Faction: `starfleet-recovery-bureau`
- Opening location: `lydian-anchorage`
- Initial posture: procedural-and-adaptive

### Player-facing identity

A temporary magistrate trying to build precedent faster than the Wake produces new cases.

### Director handling

Can convert command decisions into durable regional law, but refuses secret evidence and coerced survivor testimony.

### Knowledge boundary

- Knows Federation salvage and identity law
- Knows public case records
- Does not know Director-only Mooring facts

### Performance note

Keep speech consistent with the actor's public role, posture, and current leverage; do not use dialogue to leak Director-only knowledge.

## Commander Niko Saren — Former Project Mooring Systems Engineer

- ID: `niko-saren`
- Species: Human
- Faction: `project-mooring`
- Opening location: `blackmouth`
- Initial posture: injured-and-defensive

### Player-facing identity

Unknown at campaign start.

### Director handling

A Mooring engineer trapped aboard a support vessel in the current. Saren can explain the platform but minimizes culpability and fears Security retaliation.

### Knowledge boundary

- Knows anchor design and emergency venting
- Knows one shutdown sequence
- Does not know the full present regional state

### Performance note

Keep speech consistent with the actor's public role, posture, and current leverage; do not use dialogue to leak Director-only knowledge.

## Maia Rinn — Organizer, Returned Persons Assembly

- ID: `maia-rinn`
- Species: Bolian
- Faction: `lydian-civil-authority`
- Opening location: `sable-verge`
- Initial posture: guarded-and-organizing

### Player-facing identity

A civilian transport supervisor who becomes a public advocate for people returned from the Wake.

### Director handling

Forms the Returned Persons Assembly after enough survivors face legal dispossession. She can become a legitimate partner or radicalize against imposed custody.

### Knowledge boundary

- Knows survivor needs and legal harms
- Knows transport experiences inside the Wake
- Does not know Project Mooring

### Performance note

Keep speech consistent with the actor's public role, posture, and current leverage; do not use dialogue to leak Director-only knowledge.


# Regional texture

- Lydian schedules are posted on public boards because subspace notices often arrive late or contradict one another.
- Freehold tugs paint rescue marks separately from salvage marks; confusing the two is a serious accusation.
- Cardassian memorial teams use family-supplied tones and registry fragments to identify hulls whose transponders were destroyed.
- Returned persons often carry obsolete uniforms, currency, access codes, medical implants, and expectations about a war the outside world has already concluded.
- Hegg claim clerks treat provenance as engineering: a document without an auditable chain is a failed component.
- Serein recovery crews maintain a physical wall of unidentified tags because network records change ownership, classification, or legal status too easily.
