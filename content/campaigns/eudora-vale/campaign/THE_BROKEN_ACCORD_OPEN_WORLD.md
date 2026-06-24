# The Broken Accord: Open-World Campaign Implementation

## Campaign identity

- Campaign: The Broken Accord
- Ship: U.S.S. Eudora Vale, Intrepid-class
- Opening stardate: 55291.4
- Theater: The Ilyra System
- Runtime architecture: `directive.openWorldCampaign.v2`
- Authored scope: 26 quests, 14 locations, 18 routes, 10 factions, 14 regional actors, 8 fronts, and 8 clocks.

## Open-world contract

The Ilyra System is not a sequence of mission sets. The Eudora Vale can travel among worlds, accept or refuse requests, delegate assignments, conduct shipboard work, and revisit consequences. Main quests establish large movements; side assignments, fronts, clocks, routes, assets, and thread templates maintain continuity between them.

A foreground quest controls the current scene, not the existence of the rest of the world. Travel advances stardate. Actors continue pursuing goals. Weather and industrial consequences arrive after delays. A solved crisis can create load elsewhere, and a postponed crisis can change category before the ship returns.

## Regional topology

The Harmonic Spindle is the central high-energy transfer and synchronization site. Crown Station is the public administrative and traffic hub. Umbra Manifold is the oldest maintenance and archival layer. Each world has a local sublocation that supports repeat play, and Habitat Six is a permanent orbital community excluded from the original Accord.

| Location | Function | Everyday pressure |
|---|---|---|
| U.S.S. Eudora Vale | The Intrepid-class ship assigned to review the Ilyra Accord, coordinate emergency response, and provide independent scientific and diplomatic support. | Crew move around a sealed captain's ready room, environmental specialists maintain rolling load plots in astrometrics, and the industrial replicator ledger is read at every senior briefing. |
| Crown Station | The Accord's public control center and diplomatic hub, positioned between Aurelia and Pelagos. | School groups watch weather maps in the public gallery, engineers pass through access gates beneath political banners, and every delegation maintains a separate room full of private calculations. |
| Aurelia | The Accord's temperate political and agricultural center, with the system's largest population and most visible public institutions. | Weather bulletins are civic ritual, market prices respond to humidity forecasts, and children are taught that every loaf of bread is a gift from five worlds. |
| Solis Terraces | A continent-scale agricultural district on Aurelia whose climate towers feed much of the Ilyra System. | Cooperative crews ride maintenance skiffs between climate towers, harvest forecasts are announced like election results, and emergency shelters double as seed banks. |
| Pelagos | An ocean world of floating cities, desalination platforms, and deep-water ecosystems that supplies water vapor and biological catalysts to the lattice. | Communities move with storm lanes, public assemblies meet on linked flotillas, and families track water-export quotas beside tide predictions. |
| Caldera Array | A deep-water desalination and vapor-transfer complex that controls a large share of Pelagos' contribution to the lattice. | Divers work in rotating pressure teams, shift changes are marked by sonar chimes, and civic observers can watch every export valve from a glass control gallery. |
| Viridia | A forested world with exceptional biodiversity and a small population that supplies much of the lattice's biological processing capacity. | Settlements are built around migration corridors, local weather reports include pollinator counts, and visitors are expected to justify every sealed road and cleared landing area. |
| Oros Valley Reserve | A protected Viridian valley containing rare biomes used as a reference baseline for the entire planet. | Field stations operate on minimal power, research crews travel on elevated paths, and conservation votes are held beside long-term species maps rather than in administrative halls. |
| Ferrum | A cold, metal-rich industrial world that receives heat and oxygen in exchange for components needed across the system. | Shift assemblies are broadcast from factory floors, heat credits appear on household accounts, and every civic building contains an emergency oxygen room. |
| Khepri City | Ferrum's largest enclosed city and fabrication center, dependent on lattice heat and oxygen exchange. | Residents carry compact respirators, children learn pressure-door drills, and union notices share walls with production targets and memorial plaques. |
| Nacre | A clouded world of sealed cities, corrosive rain, and expanding toxic seas whose maintenance culture keeps difficult environmental systems operating. | Children identify rain chemistry by sound on shield roofs, public art is etched into replaceable corrosion panels, and maintenance shifts are treated as civic service. |
| Harmonic Spindle | The primary energy and atmospheric-distribution node linking Viridia, Ferrum, and Nacre. | Multiplanet crews work in mixed teams, every control surface displays three competing safety margins, and access corridors are lined with the names of technicians killed keeping the node online. |
| Umbra Manifold | A deep-orbit complex near Nacre that compresses toxic compounds and exports stabilized material. | Crews sleep in rotating clean rooms, labels are engraved rather than printed, and maintenance apprentices memorize evacuation routes before they learn the control software. |
| Ilyra Habitat Six | A growing orbital settlement outside the five-world Accord that becomes an emergency transfer and fabrication point. | Residents reuse construction modules as homes, communal kitchens face the system map, and every civic debate begins with whether temporary people are allowed permanent rights. |

## Routes and travel

| Route | From | To | Hours | Status | Hazards |
|---|---|---:|---:|---|---|
| Crown Station to Aurelia | Crown Station | Aurelia | 1.0 | stable | None at opening |
| Crown Station to Pelagos | Crown Station | Pelagos | 1.0 | stable | heavy-civilian-traffic |
| Aurelia to Pelagos | Aurelia | Pelagos | 2.2 | stable | None at opening |
| Crown Station to Viridia | Crown Station | Viridia | 1.0 | stable | None at opening |
| Crown Station to Ferrum | Crown Station | Ferrum | 1.2 | stable | industrial-traffic |
| Viridia to Harmonic Spindle | Viridia | Harmonic Spindle | 1.0 | stable | lattice-shear |
| Ferrum to Harmonic Spindle | Ferrum | Harmonic Spindle | 1.0 | stable | freighter-traffic |
| Harmonic Spindle to Nacre | Harmonic Spindle | Nacre | 1.3 | conditional | corrosive-debris, protest-traffic |
| Harmonic Spindle to Umbra Manifold | Harmonic Spindle | Umbra Manifold | 1.2 | conditional | lattice-shear |
| Nacre to Umbra Manifold | Nacre | Umbra Manifold | 0.8 | conditional | toxic-particle-stream |
| Aurelia Orbit to Solis Terraces | Aurelia | Solis Terraces | 0.2 | stable | None at opening |
| Pelagos Orbit to Caldera Array | Pelagos | Caldera Array | 0.25 | conditional | storm-lanes |
| Viridia Orbit to Oros Valley | Viridia | Oros Valley Reserve | 0.3 | stable | restricted-overflight |
| Ferrum Orbit to Khepri City | Ferrum | Khepri City | 0.2 | stable | industrial-plume |
| Crown Station to Habitat Six | Crown Station | Ilyra Habitat Six | 0.8 | conditional | unregistered-traffic |
| Habitat Six to Harmonic Spindle | Ilyra Habitat Six | Harmonic Spindle | 1.0 | conditional | construction-debris |
| Pelagos to Habitat Six | Pelagos | Ilyra Habitat Six | 0.9 | conditional | storm-evacuation-traffic |
| Eudora Vale to Crown Station Approach | U.S.S. Eudora Vale | Crown Station | 0.1 | stable | None at opening |

Route status affects more than travel time. Conditional routes may require local pilots, reduced lattice load, a specific node window, Union cooperation, or an escort. A hazardous route can remain usable with risk. Route failure should create detours, delayed help, isolation, or changed political leverage rather than arbitrary lockout.

## Factions

### Starfleet Ilyra Review Mission

**Initial posture:** `supportive-but-watchful`

The Starfleet command responsible for the Eudora Vale's technical review, emergency response, and liaison with Federation authorities.

**Director use:** Rear Admiral Osei wants no mass-casualty event, no occupation, and a settlement that survives review. Starfleet is willing to grant discretion when the player documents risks, but worries that unilateral recognition or disclosure will create precedents elsewhere.

**Goals:** Prevent mass casualties, Maintain freedom of navigation, Produce an independent technical record, Avoid Federation occupation

**Methods:** Mission orders, Technical support, Command review, Emergency legal authority
### Ilyra Accord Secretariat

**Initial posture:** `cooperative-and-controlling`

The interworld institution that administers the terraforming lattice and represents continuity of the five-world Accord.

**Director use:** The Secretariat contains competent administrators, frightened continuity advocates, and officials who knowingly maintain curated telemetry. Vorr did not create the original fraud, but he chose to preserve concealment after learning enough to understand its political purpose.

**Goals:** Keep the lattice operating, Preserve five-world unity, Prevent panic, Retain central authority

**Methods:** Allocation orders, Public telemetry, Emergency regulations, Diplomatic procedure
### Nacre Assembly

**Initial posture:** `exhausted-and-demanding`

Nacre's elected coalition seeking medical support, control over local nodes, public recognition of environmental harm, and a binding role in any successor system.

**Director use:** The Assembly includes staged reformers, immediate secessionists, labor delegates, public-health advocates, and families who have stopped believing promises. It can cooperate if authority is real rather than consultative.

**Goals:** End permanent burden, Gain node authority, Secure reparations, Protect Nacre lives

**Methods:** Assembly resolutions, Labor action, Public testimony, Node control
### Lattice Engineers' Union

**Initial posture:** `cautious-and-essential`

The cross-world union whose technicians possess the practical knowledge required to operate, repair, or redesign the lattice.

**Director use:** The Union is the system's most credible cross-world institution but has been used as a politically neutral instrument. Its strike threat is both labor action and a claim that no allocation is legitimate without the people who execute it.

**Goals:** Protect workers, Secure technical honesty, Gain governance rights, Keep essential systems alive

**Methods:** Work rules, Coordinated maintenance, Certification refusal, Strike action
### Pelagic Council

**Initial posture:** `wary-and-procedural`

Pelagos' elected interflotilla council, focused on water sovereignty and protection against becoming the next environmental sink.

**Director use:** The Council supports Nacre's claim in principle while using procedure to extract enforceable caps. It is internally divided between mobile communities, array operators, and city blocs.

**Goals:** Protect water reserves, Correct population records, Limit open-ended export duties, Preserve Pelagic autonomy

**Methods:** Quota negotiation, Export throttling, Census challenges, Coalition politics
### Ferrum Combine

**Initial posture:** `pragmatic-and-suspicious`

A federation of worker councils and industrial cooperatives capable of supplying much of the hardware needed for lattice reconstruction.

**Director use:** The Combine can mobilize fabrication or a system-wide stoppage. It will cooperate when treated as a governing partner and resist when labor is requisitioned as if it were Starfleet inventory.

**Goals:** Keep Ferrum habitable, Protect labor rights, Secure allocation guarantees, Control industrial priorities

**Methods:** Fabrication schedules, Worker councils, Collective bargaining, Production stoppage
### Viridian Conservancy

**Initial posture:** `supportive-but-defensive`

The scientific and civic coalition responsible for protecting Viridia's biodiversity and biological processing reserve.

**Director use:** The Conservancy supports equity but rejects fixes that make Viridia a less visible sacrifice. A radical minority will damage industrial projects it believes threaten irreversible ecological loss.

**Goals:** Preserve biodiversity, Limit chemical pulses, Require ecological accounting, Prevent industrial capture

**Methods:** Scientific review, Protected zones, Public injunctions, Direct action by a minority
### Accord Security Service

**Initial posture:** `formal-and-escalating`

The interworld security organization responsible for node protection, traffic control, and investigation of sabotage.

**Director use:** Most officers are legitimate public-safety personnel. Director Orin and a small continuity cell stage one false-flag incident to justify emergency control. The Service can fracture, reform, or become an enforcement arm depending on how evidence is handled.

**Goals:** Prevent node seizure, Preserve public order, Maintain access control, Protect the Secretariat

**Methods:** Security cordons, Investigations, Traffic restrictions, Emergency warrants
### Helioform Consortium

**Initial posture:** `helpful-and-opportunistic`

A private climate-engineering consortium offering rapid orbital processors, financing, and maintenance contracts.

**Director use:** Helioform can deliver real short-term capacity. Its price is long-term control of processing infrastructure, proprietary telemetry, and priority repayment clauses that favor politically stable worlds.

**Goals:** Win the processor concession, Control proprietary telemetry, Secure long-term maintenance rights, Avoid liability

**Methods:** Technical demonstrations, Credit guarantees, Lobbying, Exclusive contracts
### Unburdened Network

**Initial posture:** `fragmented-and-escalating`

A loose Nacre direct-action network demanding immediate transfer of node control and an end to unconsented load imports.

**Director use:** Some cells sabotage relays; others protect protesters, leak records, or maintain essential systems during seizures. They do not share one leader or complete system knowledge. Treating every cell as terrorist organization strengthens the most reckless wing.

**Goals:** End imported burden immediately, Force recognition, Protect Nacre technicians, Break Secretariat control

**Methods:** Leaks, Occupations, Relay sabotage, Mutual aid


## Regional actors

No actor begins with complete truth. Actor knowledge belongs to world state and changes only through access, evidence, testimony, public disclosure, or direct participation.

- **Rear Admiral Celeste Osei**, Director, Starfleet Regional Response - The admiral overseeing the Ilyra review. She supports documented extraordinary action but has little tolerance for unilateral occupation or avoidable public chaos. Initial location: Crown Station.
- **First Minister Elian Vorr**, First Minister of the Ilyra Accord - Aurelia's senior statesman and public face of the Accord, intelligent and convinced that continuity must survive long enough for reform to work. Initial location: Crown Station.
- **Speaker Mara Senn**, Speaker of the Nacre Assembly - A former maintenance engineer whose patience with promises is exhausted. She can support staged reform only if Nacre receives real authority and enforceable limits. Initial location: Nacre.
- **Convenor Kesh Var**, Convenor, Lattice Engineers' Union - A veteran systems engineer who insists technicians are political actors whenever they are ordered to decide who receives air, water, or heat. Initial location: Harmonic Spindle.
- **Councillor Rian Oso**, Senior Delegate, Pelagic Council - A patient negotiator who supports Nacre's case but refuses open-ended water obligations or formulas based on populations Pelagos knows are undercounted. Initial location: Pelagos.
- **Foreperson Dela Marr**, First Convenor, Ferrum Combine - A worker-council leader who can mobilize fabrication capacity or a system-wide stoppage and judges outsiders by whether they treat labor as partners. Initial location: Khepri City.
- **Ecologist Sorel Thann**, Senior Ecologist, Viridian Conservancy - A systems ecologist who argues that a mathematically equal allocation can still be ecologically suicidal. Initial location: Oros Valley Reserve.
- **Director Cael Orin**, Director, Accord Security Service - The professional head of Accord Security, requesting Starfleet support against sabotage while insisting local civil authority remain intact. Initial location: Crown Station.
- **Doctor Lyra Veen**, Director, Nacre Public Health Registry - A public-health physician maintaining incomplete but devastating records of chronic illness across Nacre's sealed cities. Initial location: Nacre.
- **Avar Jess**, Nodekeeper and Unburdened Organizer - A Nacre nodekeeper associated with direct-action organizers who argue that continued unconsented operation is itself violence. Initial location: Nacre.
- **Alix Meral**, Special Projects Director, Helioform Consortium - A persuasive climate engineer offering rapid orbital processors, financing, and a complete maintenance package. Initial location: Crown Station.
- **Coordinator Nia Tess**, Civic Coordinator, Ilyra Habitat Six - The elected coordinator of an orbital settlement excluded from the Accord despite becoming essential to construction and evacuation. Initial location: Ilyra Habitat Six.
- **Ines Quill**, Retired Lattice Auditor - A retired auditor who remained near Umbra Manifold after leaving the Secretariat under disputed circumstances. Initial location: Umbra Manifold.
- **Minister Talia Iven**, Aurelian Minister for Food and Climate - The official responsible for food security on Aurelia, under intense pressure to prevent crop loss and public panic. Initial location: Solis Terraces.

## Active fronts

Fronts are independent regional processes. They can advance through elapsed time and reaction rules even when their related quest is not foregrounded.

### Lattice Cascade

Accumulated damage, delayed loads, high-energy synchronization, and incompatible local interventions increase the chance of linked node failure.

- Initial stage: 1 of 6
- Goals: Shorten safe allocation windows, Create simultaneous crises, Force a final configuration
- Time advances: 24h, 60h, 108h, 168h, 240h
- Stage cues:
- 0: The lattice is strained but normal emergency procedures still work.
- 1: Allocation delays create visible weather and supply anomalies.
- 2: Two worlds experience linked emergencies and node margins narrow.
- 3: Conditional routes and processing nodes require active protection.
- 4: Several governments impose unilateral controls and the Spindle becomes contested.
- 5: A system-wide cascade is imminent; only distributed preparation can prevent catastrophic loss.
- 6: A Common Climate is underway across all five worlds.
### Nacre Secession

Delay, coercion, untreated illness, and concealed data push Nacre from reform demands toward unilateral node control and withdrawal.

- Initial stage: 2 of 6
- Goals: End unconsented load, Seize local nodes, Build independent authority
- Time advances: 36h, 84h, 144h, 216h
- Stage cues:
- 0: The Assembly demands a timetable and independent data access.
- 1: Public demonstrations and work-to-rule actions spread.
- 2: Direct-action cells interfere with relays and access controls.
- 3: Nodekeepers seize local operations while maintaining essential services.
- 4: The Assembly prepares a secession declaration and rejects Secretariat warrants.
- 5: Nacre begins unilateral shutdown or independent allocation.
- 6: Accord authority no longer operates on Nacre.
### Public Legitimacy Crisis

Conflicting telemetry, curated statements, visible sacrifice, and Starfleet intervention determine whether populations see decisions as lawful and intelligible.

- Initial stage: 1 of 6
- Goals: Expose contradictions, Create parallel narratives, Force public accountability
- Time advances: 48h, 96h, 156h, 228h
- Stage cues:
- 0: Most residents still trust the Accord while asking difficult questions.
- 1: Independent data challenges official briefings.
- 2: Public hearings become confrontational and local governments issue separate forecasts.
- 3: One or more worlds reject Crown Station telemetry.
- 4: Emergency orders lack broad compliance and protests disrupt traffic.
- 5: Parallel authorities claim lawful control.
- 6: No shared public account of the crisis remains.
### Engineers' Mobilization

The Lattice Engineers' Union moves from protected technical dissent toward coordinated certification refusal and strike action.

- Initial stage: 1 of 6
- Goals: Protect technicians, Gain governance rights, Stop unsafe or deceptive orders
- Time advances: 72h, 144h, 216h
- Stage cues:
- 0: Union delegates demand protected review and honest telemetry.
- 1: Work rules slow nonessential maintenance.
- 2: Certification refusals delay new allocations.
- 3: Minimum-safety staffing replaces normal operations.
- 4: A system-wide strike begins outside immediate life support.
- 5: Local governments attempt requisition or replacement labor.
- 6: The lattice loses cross-world technical coordination.
### Resource Scarcity

Fabrication feedstock, water buffers, medical supplies, emergency power, and shuttle capacity are consumed faster than ordinary replenishment.

- Initial stage: 1 of 6
- Goals: Force prioritization, Create dependency on local partners, Make relief decisions persistent
- Time advances: 48h, 96h, 168h, 240h
- Stage cues:
- 0: The Eudora Vale and local governments retain workable reserves.
- 1: Several planned repairs compete for the same material.
- 2: Worlds begin withholding reserves for domestic use.
- 3: Medical, habitat, and processor needs cannot all be met.
- 4: Emergency rationing and contract offers reshape alliances.
- 5: At least one world loses a critical buffer.
- 6: The finale begins with severe material shortages.
### Security Escalation

Sabotage, false attribution, node occupations, and traffic restrictions normalize coercive control around the lattice.

- Initial stage: 0 of 6
- Goals: Expand emergency powers, Militarize node control, Turn political conflict into security categories
- Time advances: 84h, 156h, 228h
- Stage cues:
- 0: Security incidents remain isolated and locally managed.
- 1: Access checks and patrols increase around major nodes.
- 2: Sabotage claims outpace verified evidence.
- 3: Traffic cordons and mass detentions become politically plausible.
- 4: Armed forces contest node access and protect rival authorities.
- 5: The Harmonic Spindle is treated as strategic territory.
- 6: Violence determines allocation unless interrupted.
### Ecological Overshoot

Chemical pulses, simplified bioprocessing, storm shifts, and concentrated load push living systems toward irreversible thresholds.

- Initial stage: 1 of 6
- Goals: Make delayed ecological costs visible, Constrain purely technical optimization, Create nonhuman stakes
- Time advances: 60h, 120h, 192h, 264h
- Stage cues:
- 0: Ecological systems remain strained but recoverable.
- 1: Localized die-offs and chemical blooms appear.
- 2: Viridia and Pelagos lose important biological buffers.
- 3: Emergency interventions simplify ecosystems faster than they recover.
- 4: At least one world approaches an irreversible threshold.
- 5: The final stabilization will permanently damage a major ecosystem unless alternatives exist.
- 6: Ecological collapse becomes part of the post-campaign reality.
### Captaincy Review

Ship condition, candor, legal judgment, crew confidence, and political controversy determine whether Starfleet confirms the player's first command.

- Initial stage: 0 of 5
- Goals: Assess command continuity, Trigger outside intervention if needed, Shape the epilogue
- Time advances: 96h, 192h, 288h
- Stage cues:
- 0: The player holds ordinary acting authority after lawful succession.
- 1: Starfleet requests more frequent command reports.
- 2: A formal field-confirmation review begins.
- 3: A replacement captain is made available or inquiry conditions are imposed.
- 4: The player's authority is contested before the finale.
- 5: Final command disposition awaits the campaign outcome.


## Clocks

- **Next Lattice Surge** (`clock.next-surge`), 2/8: Elapsed time, high-energy intervention, and unresolved load determine the next major surge.
- **Nacre Node Seizure** (`clock.nacre-node-seizure`), 2/6: Delay, coercion, and untreated harm move direct-action organizers toward taking local control.
- **Engineers' Strike Vote** (`clock.union-strike`), 1/6: The Union moves toward certification refusal and protected strike action.
- **Aurelia Crop Window** (`clock.aurelia-crop-window`), 2/6: Solis Terraces will suffer a major harvest loss if humidity and heat remain outside tolerance.
- **Ferrum Heat Reserve** (`clock.ferrum-heat-reserve`), 2/6: Khepri City's stored thermal capacity falls as allocations fluctuate.
- **Pelagos Storm Season** (`clock.pelagos-storm-season`), 1/6: Sea-level manipulation and natural storm cycles converge around floating settlements.
- **Viridia Chemical Pulse** (`clock.viridia-chemical-pulse`), 1/6: Delayed atmospheric compounds accumulate before entering Viridia's biological processing network.
- **Replacement Captain Availability** (`clock.replacement-captain`), 0/6: Starfleet scrutiny, ship damage, and political controversy determine when Osei offers or orders a replacement.

Clocks are not universal countdowns. They represent specific physical or institutional processes. They advance only when causal conditions continue. Repairs, agreements, transparency, changed load, local action, or direct command may reduce or transform them.

## Standing activity loops

### Planetary response

Scan, consult local authorities, define jurisdiction, assign ship and local resources, execute rescue or repair, record externalized cost, and establish follow-up. A successful local response may still worsen another location if the load transfer is not addressed.

### Lattice analysis

Collect raw data, compare categories, establish confidence, identify omitted populations or ecological functions, test models at limited power, and decide custody and publication. Science reveals constraints; command determines action.

### Diplomacy and governance

Identify who can lawfully speak, who carries implementation, and who is absent. Agreements need operating authority, review, limits, and exit mechanisms. A summit without technicians or excluded communities may produce text that no node obeys.

### Shipboard command

Maintain the deflector, fabrication ledger, shuttle readiness, crew grief, Acting XO authority, evidence custody, and reporting to Starfleet. Shipboard work is campaign work rather than filler.

### Delegation

Delegation requires a capable actor or asset, access to the location, authority to act, a defined objective, and accepted risk. The result is committed state. A delegated assignment can succeed with cost, transform, stall, or return a harder command decision.

## Quest availability

Quest predicates are state gates rather than prescribed chapter order. The four early world cases can be undertaken in varied order. The model investigation requires enough comparative evidence, but evidence may come from main or side routes. Nacre work can become urgent through political pressure even before every formal investigation completes. The finale requires actual convergence, not completion of every quest.

## Dynamic B-stories

Thread templates cover command succession, Acting XO authority, scientific candor, medical independence, civil order, pilot grief, crew continuity, technical debt, scarcity, and command review. A dynamic thread must cite observable evidence and remains hidden until engagement or promotion. Most threads resolve as scenes, callbacks, or shipboard assignments rather than becoming full travel quests.

## Finale assembly

A Common Climate reads:

- Current lattice and ecological fronts.
- Known facts and surviving evidence chains.
- Successor authority and faction posture.
- Nacre node status and public legitimacy.
- Available processors, fabrication, water buffers, shield capacity, medical and evacuation assets.
- Ship deflector margin, damage, shuttle availability, and technical debt.
- Crew readiness and delegated assignments.
- Resolved, ignored, failed, or transformed side work.
- Route access and local partners.

The Director selects only active fronts. For example, a protected Oros Valley should not suffer the same finale die-off as an ignored one; a trusted Pelagic ledger should improve water coordination; an excluded Habitat Six may withhold capacity or demand recognition during the cascade.
