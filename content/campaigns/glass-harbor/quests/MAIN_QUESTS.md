# Main Questline

The following quest templates define situations, pressures, truths, approaches, and outcome families. They do not prescribe a mandatory scene sequence.


## Soundings

**ID:** `prelude-soundings`  
**Kind:** onboarding  
**Typical duration:** two to four sessions  
**Priority:** 100  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Join the U.S.S. Glass Harbor as its newly promoted Executive Officer, establish a working command rhythm, and take the conn when a convoy rescue and gravitic inversion strand Captain Amina Rhos beyond contact.

### Dramatic question

What kind of acting captain takes command when loyalty, rescue, and incomplete information collide?

### Anchors

- Locations: lagrange-gate, quiet-shelf
- Actors: lysa-mbeki, amina-rhos
- Factions: starfleet-survey-command

### Objectives

- Complete the command handover with Captain Rhos and review the Glass Harbor’s known limitations.
- Set priorities for convoy assistance, sensor calibration, and survey-buoy custody.
- Respond when the lane inversion separates Rhos’s shuttle and destabilizes the civilian convoy.
- Complete the rescue or withdrawal with an explicit search posture for the missing shuttle.
- Accept or contest Starfleet confirmation as Acting Captain and reach a stable anchorage.

### Active pressures

- The civilian convoy will enter lethal shear before a prolonged shuttle search can be completed.
- The Glass Harbor’s replacement gravimetric pallet produces contradictory readings under rapidly changing shear.
- The tractor emitters can hold a corridor or stabilize a transport, but prolonged use overheats the port power trunks.
- The senior staff has established routines under Rhos and is now evaluating the player’s judgment under genuine uncertainty.

### Required revelations

- The Glass Harbor can save the convoy, preserve the ship, and conduct a limited search, but cannot maximize all three without cost.
- The lane inversion is a real regional phenomenon, not sabotage or a Crown attack.
- Rhos’s shuttle transmitted a low-power course correction toward the Reef interior before contact failed.
- The acting command is legally temporary but operationally complete until Rhos returns or Starfleet installs a replacement.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Prioritize convoy stabilization and delegate the shuttle search to probes or a local craft.
- Commit the Glass Harbor to a short, high-risk search before withdrawing to complete the rescue.
- Use tractor control, transporter relays, shuttlecraft, or coordinated civilian maneuvers in any workable combination.
- Request Kheled or civilian assistance and accept the political obligations that follow.
- Refuse immediate acting command and require Starfleet to clarify legal authority while the crew continues emergency operations.

### Outcome families

### balanced-command

Most civilians survive, the ship reaches anchorage with manageable damage, and a disciplined search record preserves multiple routes to Rhos.

  - `adjustTrack`: trackId=crew-succession-confidence, amount=1
  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `adjustClock`: clockId=clock.rhos-survival, amount=1
  - `setFlag`: flagId=player-acting-captain, value=True
### captain-first

The search gains strong evidence or narrows Rhos’s path, but the convoy suffers avoidable losses or dispersal.

  - `adjustTrack`: trackId=crew-succession-confidence, amount=0
  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `adjustClock`: clockId=clock.rhos-survival, amount=2
  - `revealFact`: factId=fact.rhos-course-correction, summary=Rhos’s shuttle corrected toward an unknown stable volume inside the Reef., tags=['rhos', 'search']
  - `setFlag`: flagId=player-acting-captain, value=True
### rescue-first

The convoy is saved decisively, but the missing shuttle trail degrades and the crew must accept a slower search.

  - `adjustTrack`: trackId=civilian-strain, amount=-2
  - `adjustTrack`: trackId=crew-succession-confidence, amount=1
  - `adjustClock`: clockId=clock.rhos-survival, amount=-1
  - `setFlag`: flagId=player-acting-captain, value=True
### costly-hold

The ship remains in the inversion too long, saving some lives and data at the price of damage, fatigue, and a harder opening position.

  - `adjustTrack`: trackId=reef-instability, amount=1
  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `adjustTrack`: trackId=crew-succession-confidence, amount=-1
  - `setFlag`: flagId=glass-harbor-opening-damage, value=True
  - `setFlag`: flagId=player-acting-captain, value=True

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## Aster Basin

**ID:** `chapter-1-aster-basin`  
**Kind:** main  
**Typical duration:** three to five sessions  
**Priority:** 94  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Make first sustained contact with the Drift Concord while a failing habitat tether, undocumented refugee traffic, and the risk of exposing a hidden civilian capital compete for command attention.

### Dramatic question

Can Starfleet help a concealed community without turning recognition into surveillance?

### Anchors

- Locations: quiet-shelf, aster-basin, lantern-span
- Actors: lira-quell, senn-arv
- Factions: drift-concord, starfleet-survey-command

### Objectives

- Reach Aster Basin without disclosing its coordinates to unauthorized traffic.
- Stabilize or evacuate the failing habitat tether.
- Establish terms for medical access, route exchange, and Starfleet presence.
- Determine how refugee and asylum traffic will be documented, if at all.
- Leave Aster Basin with an explicit relationship and chart-custody posture.

### Active pressures

- The habitat tether will fail whether or not political talks are complete.
- Starfleet Survey Command expects usable positional data and a verified population estimate.
- The Drift Concord has reason to fear Kheled inspection, Crown predation, and Federation administrative exposure.
- The Glass Harbor cannot remain indefinitely without neglecting other Reef pressures.

### Required revelations

- Aster Basin’s secrecy is not merely criminal evasion; it protects refugees and politically unrecognized communities.
- Local pilots maintain route knowledge through distributed embodied practice that cannot be reduced to one static chart.
- Rhos sent a narrowband contact request to Aster shortly before the inversion but did not transmit the basin’s coordinates.
- The failing tether can be repaired, replaced, cut, or evacuated through several viable approaches with different exposure costs.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Negotiate a protected survey compact with local custody of exact coordinates.
- Record full Starfleet charts under sealed or compartmented access.
- Use local pilots and temporary buoy keys without retaining a complete route.
- Prioritize engineering rescue and postpone political recognition.
- Treat Aster as an unregistered hazard zone and insist on formal inspection, accepting resistance or withdrawal.

### Outcome families

### recognized-sanctuary

Aster gains provisional recognition, retains route custody, and accepts defined Starfleet humanitarian access.

  - `adjustTrack`: trackId=chart-exposure, amount=-1
  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `adjustTrack`: trackId=crew-succession-confidence, amount=1
  - `grantAsset`: assetId=drift-pilots, title=Drift Pilot Network, playerSummary=Trusted local pilots can guide missions and validate route changes.
  - `revealFact`: factId=fact.rhos-contacted-aster, summary=Rhos contacted Aster Basin shortly before disappearing but withheld its coordinates., tags=['rhos', 'aster']
### monitored-access

Aster accepts Starfleet support under a monitored-access agreement, improving rescue capacity while leaving deep mistrust.

  - `adjustTrack`: trackId=chart-exposure, amount=1
  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `grantAsset`: assetId=aster-medical-relay, title=Aster Medical Relay, playerSummary=Aster’s clinic network can coordinate civilian triage and evacuation.
  - `revealFact`: factId=fact.rhos-contacted-aster, summary=Rhos contacted Aster Basin shortly before disappearing but withheld its coordinates., tags=['rhos', 'aster']
### coordinates-recorded

Starfleet obtains a complete chart and population record; immediate rescue improves, but Aster becomes vulnerable to external reach.

  - `adjustTrack`: trackId=chart-exposure, amount=2
  - `adjustTrack`: trackId=civilian-strain, amount=-2
  - `adjustTrack`: trackId=kheled-intervention, amount=1
  - `setFlag`: flagId=aster-full-chart-starfleet, value=True
### confrontation

The emergency is only partly contained and first contact ends in withdrawal, coercion, or damaged trust.

  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `adjustTrack`: trackId=crew-succession-confidence, amount=-1
  - `setFlag`: flagId=aster-contact-damaged, value=True

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## The Caligo Sounding

**ID:** `chapter-2-caligo-sounding`  
**Kind:** main  
**Typical duration:** three to five sessions  
**Priority:** 93  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Enter Saint Caligo Wreckfield to recover a trapped survey team, secure unstable ordnance, and determine why wrecks from unrelated eras have migrated into the same gravitic pattern.

### Dramatic question

Who owns evidence and dangerous salvage when rescue, history, and security cannot be separated?

### Anchors

- Locations: saint-caligo-wreckfield, bellweather-anchorage, ossuary-loop
- Actors: bram-ochoa, nema-voss
- Factions: breakwater-guild, starfleet-survey-command

### Objectives

- Locate and recover the trapped survey team or establish a credible alternate rescue plan.
- Prevent unstable weapons or reactors from threatening inhabited routes.
- Negotiate evidence and salvage custody with Breakwater crews and memorial authorities.
- Compare wreck trajectories from several historical periods.
- Leave the field with an explicit policy for future recovery operations.

### Active pressures

- The trapped team’s life support is failing while several wrecks continue to migrate.
- A damaged torpedo magazine can be neutralized, towed, or abandoned, each with different costs.
- Breakwater crews have legal and practical claims to recovered material but incomplete safety data.
- The field contains culturally protected remains and classified military evidence in overlapping hulls.

### Required revelations

- Wrecks from different eras share a repeating drift vector inconsistent with natural capture alone.
- Breakwater recovered a gravitic coupler from a buried structure and connected it to a salvage power rig.
- The coupler’s surges correlate with lane inversions elsewhere in the Reef.
- The missing shuttle’s transponder briefly appeared in archival noise near the field before moving toward an uncharted volume.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Lead a direct rescue and defer salvage or evidence collection.
- Coordinate Breakwater tugs, Starfleet teams, and memorial custodians under a temporary recovery charter.
- Use remote drones, transporter tags, controlled detonation, towing, or engineering isolation.
- Seize dangerous material under Starfleet emergency authority and accept political consequences.
- Withdraw after saving lives and preserve the wreckfield as an unresolved hazard.

### Outcome families

### rescue-and-evidence

The team survives, the gravitic pattern is documented, and custody arrangements preserve both evidence and cultural claims.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `adjustTrack`: trackId=reef-instability, amount=-1
  - `grantAsset`: assetId=verified-wreck-registry, title=Verified Wreck Registry, playerSummary=Cross-faction records improve identification, evidence custody, and safe salvage.
  - `revealFact`: factId=fact.repeating-wreck-vector, summary=Wrecks from unrelated eras are being drawn by the same repeating gravitic pattern., tags=['shepherd', 'caligo']
  - `revealFact`: factId=fact.breakwater-overloaded-coupler, summary=A salvaged ancient coupler is overloading an unknown field-control system., tags=['shepherd', 'breakwater']
### negotiated-salvage

The rescue succeeds and Breakwater retains broad salvage rights under improved safety rules, but some evidence remains privately held.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `grantAsset`: assetId=breakwater-tug-group, title=Breakwater Tug Group, playerSummary=Guild tugs can support towing, salvage, and evacuation operations.
  - `revealFact`: factId=fact.repeating-wreck-vector, summary=Wrecks from unrelated eras are being drawn by the same repeating gravitic pattern., tags=['shepherd', 'caligo']
### ordnance-first

Weapons hazards are contained and strategic material secured, but survivor or cultural priorities suffer.

  - `adjustTrack`: trackId=raider-consolidation, amount=-1
  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `setFlag`: flagId=caligo-starfleet-seizure, value=True
  - `revealFact`: factId=fact.breakwater-overloaded-coupler, summary=A salvaged ancient coupler is overloading an unknown field-control system., tags=['shepherd', 'breakwater']
### costly-extraction

Some lives and evidence are saved, but the field worsens, a major wreck is lost, or the Glass Harbor incurs significant damage.

  - `adjustTrack`: trackId=reef-instability, amount=1
  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `setFlag`: flagId=caligo-recovery-incomplete, value=True
  - `revealFact`: factId=fact.repeating-wreck-vector, summary=Wrecks from unrelated eras are being drawn by the same repeating gravitic pattern., tags=['shepherd', 'caligo']

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## Terms of Passage

**ID:** `chapter-3-terms-of-passage`  
**Kind:** main  
**Typical duration:** three to five sessions  
**Priority:** 92  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Resolve a transit crisis at Lagrange Gate as Kheled escorts demand inspection rights, civilian ships refuse to surrender route data, and the Reef closes around vessels waiting for lawful passage.

### Dramatic question

What makes a navigation regime legitimate when every safety rule also grants political access?

### Anchors

- Locations: lagrange-gate, kheled-watch, quiet-shelf
- Actors: tal-oren, jorad-pel, lysa-mbeki
- Factions: kheled-protectorate, starfleet-survey-command, drift-concord

### Objectives

- Prevent the transit queue from becoming a humanitarian or security collapse.
- Determine who may inspect vessels, authenticate route keys, and issue escort orders.
- Investigate conflicting reports of a raider passage through Kheled-controlled space.
- Create a provisional passage arrangement that can function after the Glass Harbor departs.
- Preserve evidence concerning any manipulated inspections or route leaks.

### Active pressures

- Waiting vessels are exhausting medical and life-support reserves.
- Kheled patrol craft can impose order but their access may expose hidden communities.
- Civilian captains distrust both Starfleet delays and Kheled registration requirements.
- Subprefect Pel is quietly steering incidents toward a mandate for intervention.

### Required revelations

- Several apparent raider movements used route data recently held by Kheled patrol intelligence.
- Prefect Oren did not authorize the suspect disclosures and can be separated from Pel’s agenda.
- A joint verification process can protect identities while proving vessel safety, but requires shared institutional trust.
- The Glass Harbor’s own survey data can solve the immediate queue while creating a precedent for central control.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Negotiate a joint Starfleet-Kheled-civilian passage board.
- Accept a temporary Kheled escort regime with explicit sunset and oversight terms.
- Establish a Starfleet-managed corridor and assume the resulting logistical burden.
- Use local pilots and distributed authentication to bypass formal inspection.
- Expose Pel publicly, privately confront him, or use the evidence to reshape the agreement.

### Outcome families

### joint-passage-charter

A shared passage charter reduces immediate strain and constrains unilateral inspection authority.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `adjustTrack`: trackId=kheled-intervention, amount=-1
  - `grantAsset`: assetId=kheled-patrol-codes, title=Kheled Patrol Codes, playerSummary=Verified patrol identifiers and limited escort access improve coordination.
  - `revealFact`: factId=fact.pel-route-leaks, summary=Subprefect Pel leaked selected route information to manufacture pressure for intervention., tags=['kheled', 'accountability']
### kheled-escort-regime

The queue clears under Kheled protection, improving order while expanding Protectorate access and leverage.

  - `adjustTrack`: trackId=civilian-strain, amount=-2
  - `adjustTrack`: trackId=kheled-intervention, amount=2
  - `grantAsset`: assetId=kheled-patrol-codes, title=Kheled Patrol Codes, playerSummary=Verified patrol identifiers and limited escort access improve coordination.
### starfleet-corridor

Starfleet assumes passage control, limiting Kheled access but creating a centralized dependency on the Glass Harbor and its successors.

  - `adjustTrack`: trackId=chart-exposure, amount=1
  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `setFlag`: flagId=starfleet-corridor-authority, value=True
### fractured-gate

The immediate crisis is contained without a durable regime; independent convoys and patrols begin taking unilateral action.

  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `adjustTrack`: trackId=kheled-intervention, amount=1
  - `advanceFront`: frontId=front.kheled-intervention, amount=1

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## The Chartmakers

**ID:** `chapter-4-the-chartmakers`  
**Kind:** main  
**Typical duration:** four to six sessions  
**Priority:** 90  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Build or reject a durable navigation regime by deciding how public buoys, local pilots, Starfleet survey records, and foreign access will interact across the Reef.

### Dramatic question

Who may convert knowledge of survival into governing power?

### Anchors

- Locations: lantern-span, quiet-shelf, aster-basin, kheled-watch
- Actors: lira-quell, senn-arv, tal-oren, lysa-mbeki
- Factions: drift-concord, kheled-protectorate, starfleet-survey-command, breakwater-guild

### Objectives

- Choose a technical and legal model for route certification.
- Deploy, withhold, recover, or locally key a buoy chain through Lantern Span.
- Define who can update routes and invalidate dangerous data.
- Resolve disputes over pilot licensing and inspection access.
- Publish, seal, partition, or distribute the resulting navigation records.

### Active pressures

- Every public beacon improves rescue while increasing Chart Exposure.
- Static Starfleet charts can become dangerously stale faster than normal doctrine expects.
- Local pilot knowledge is effective but difficult for external institutions to audit.
- Kheled and Crown actors will exploit any single point of control they can reach.

### Required revelations

- A reliable regime requires both instrument data and locally maintained revision authority.
- Route publication changes faction movement, encounter frequency, trade, and the security of hidden communities.
- The thirty-two dedicated buoys are insufficient for every desired corridor without recovery, fabrication, or outside support.
- The Shepherd field periodically invalidates routes in coordinated patterns, suggesting a system rather than random weather.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Create a federated key system with local update authority and shared verification.
- Publish an open navigational atlas with strong warnings and rapid revision channels.
- Retain restricted Starfleet charts and issue escorted access case by case.
- Recognize local pilot sovereignty and provide technical support without centralizing routes.
- Refuse to create a regional system and focus only on emergency corridors.

### Outcome families

### federated-keys

A multilateral navigation authority distributes route keys and revision power among Starfleet, local pilots, and participating governments.

  - `adjustTrack`: trackId=chart-exposure, amount=0
  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `grantAsset`: assetId=distributed-route-keys, title=Distributed Route Keys, playerSummary=Multiple trusted authorities can verify safe passage without one complete public chart.
  - `grantAsset`: assetId=stable-buoy-chain, title=Stable Buoy Chain, playerSummary=A maintained beacon corridor improves movement through Lantern Span.
### open-atlas

Routes become broadly available, sharply improving commerce and rescue while exposing concealed basins to every capable actor.

  - `adjustTrack`: trackId=chart-exposure, amount=3
  - `adjustTrack`: trackId=civilian-strain, amount=-2
  - `adjustTrack`: trackId=raider-consolidation, amount=1
  - `grantAsset`: assetId=open-reef-atlas, title=Open Reef Atlas, playerSummary=Broadly accessible charts improve travel and large-scale coordination.
### restricted-starfleet

Starfleet controls the best charts and escort priorities, improving operational reliability at the cost of local dependency and scrutiny.

  - `adjustTrack`: trackId=chart-exposure, amount=1
  - `adjustTrack`: trackId=crew-succession-confidence, amount=1
  - `setFlag`: flagId=starfleet-chart-monopoly, value=True
  - `grantAsset`: assetId=starfleet-route-control, title=Starfleet Route Control, playerSummary=Glass Harbor can prioritize and authenticate movement along restricted surveyed corridors.
### local-pilot-sovereignty

The Reef remains dependent on local routekeepers, preserving concealment and autonomy while accepting slower, less scalable access.

  - `adjustTrack`: trackId=chart-exposure, amount=-2
  - `adjustTrack`: trackId=civilian-strain, amount=0
  - `grantAsset`: assetId=drift-pilots, title=Drift Pilot Network, playerSummary=Trusted local pilots can guide missions and validate route changes.

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## The Sunken Fleet

**ID:** `chapter-5-the-sunken-fleet`  
**Kind:** main  
**Typical duration:** four to six sessions  
**Priority:** 89  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Recover survivors, remains, weapons, and records from a migrating cluster of wrecks whose history could expose Kheled misconduct, Crown predation, and an earlier civilian exodus.

### Dramatic question

What does accountability require when every recovered truth is also strategic leverage?

### Anchors

- Locations: saint-caligo-wreckfield, ossuary-loop, crown-shoal
- Actors: bram-ochoa, nema-voss, tal-oren, veyra-ninth
- Factions: breakwater-guild, kheled-protectorate, crown-of-embers, drift-concord

### Objectives

- Reach the buried Kheled cruiser and exodus wrecks before the drift pattern closes.
- Recover living survivors or preserved neural and biological evidence where possible.
- Secure or neutralize weapons capable of changing the regional balance.
- Establish custody for remains, logs, salvage, and classified records.
- Decide what enters the public record and what protections accompany disclosure.

### Active pressures

- The wreck cluster separates rescue targets faster than all can be reached.
- Weapons disposal may destroy evidence; preservation may arm raiders or states.
- Kheled officers demand sovereign custody over the cruiser while memorial authorities contest removal of civilian remains.
- The Crown offers route access and hostages in exchange for recognized salvage shares.

### Required revelations

- A Kheled patrol diverted civilian ships into the Reef during an earlier border emergency and falsified the official loss record.
- Crown predecessors rescued some exodus survivors while also stripping vessels and binding families into protection contracts.
- One wreck contains a maintenance key compatible with Shepherd Node Seven.
- Rhos’s shuttle used the migrating wreck cluster as cover before reaching a hidden maintenance route.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Prioritize living survivors and accept loss of strategic evidence.
- Conduct a joint recovery with memorial, Breakwater, Kheled, and Crown representatives.
- Seize the field under Starfleet hazard authority.
- Trade access, limited amnesty, or salvage shares for Crown cooperation.
- Publish evidence immediately, place it under independent seal, or negotiate protected disclosure.

### Outcome families

### public-record-with-protections

Survivors and remains receive priority, core evidence enters a protected public record, and strategic material is controlled through joint custody.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `adjustTrack`: trackId=kheled-intervention, amount=-1
  - `grantAsset`: assetId=node-seven-access, title=Node Seven Access Key, playerSummary=A recovered maintenance key grants controlled access to Node Seven.
  - `revealFact`: factId=fact.kheled-exodus-diversion, summary=A Kheled patrol diverted civilian ships into the Reef and falsified the loss record., tags=['accountability', 'sunken-fleet']
  - `revealFact`: factId=fact.rhos-used-maintenance-route, summary=Rhos’s shuttle crossed the migrating wreck cluster toward a hidden maintenance route., tags=['rhos', 'shepherd']
### sealed-evidence

Evidence and weapons remain secure under restricted custody, reducing immediate conflict while delaying accountability.

  - `adjustTrack`: trackId=kheled-intervention, amount=0
  - `adjustTrack`: trackId=raider-consolidation, amount=-1
  - `grantAsset`: assetId=node-seven-access, title=Node Seven Access Key, playerSummary=A recovered maintenance key grants controlled access to Node Seven.
  - `setFlag`: flagId=sunken-fleet-evidence-sealed, value=True
### salvage-settlement

A negotiated division of salvage wins broad operational cooperation but leaves accountability partial and some weapons outside public control.

  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `adjustTrack`: trackId=raider-consolidation, amount=1
  - `grantAsset`: assetId=breakwater-tug-group, title=Breakwater Tug Group, playerSummary=Guild tugs can support towing, salvage, and evacuation operations.
  - `revealFact`: factId=fact.rhos-used-maintenance-route, summary=Rhos’s shuttle crossed the migrating wreck cluster toward a hidden maintenance route., tags=['rhos', 'shepherd']
### shattered-recovery

The cluster disperses after a battle, reactor event, or failed coordination; some lives and truths survive, but dangerous material remains unaccounted for.

  - `adjustTrack`: trackId=reef-instability, amount=1
  - `adjustTrack`: trackId=raider-consolidation, amount=2
  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `setFlag`: flagId=sunken-fleet-unrecovered-weapons, value=True

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## Cities Without Stars

**ID:** `chapter-6-cities-without-stars`  
**Kind:** main  
**Typical duration:** four to six sessions  
**Priority:** 88  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Address linked settlement crises across Aster Basin and Crown-controlled routes while determining whether the Drift Concord will become a recognized government, remain a sanctuary network, or fragment under outside protection.

### Dramatic question

What political authority has survival created, and who has the right to recognize or replace it?

### Anchors

- Locations: aster-basin, bellweather-anchorage, crown-shoal, lantern-span
- Actors: lira-quell, senn-arv, bram-ochoa, veyra-ninth
- Factions: drift-concord, breakwater-guild, crown-of-embers, kheled-protectorate

### Objectives

- Stabilize at least two urgent settlement systems without treating all communities as one administrative unit.
- Resolve a raider protection contract affecting relief or water distribution.
- Define lawful representation for mobile habitats, undocumented residents, and salvage families.
- Negotiate relations among the Drift Concord, Breakwater Guild, Crown communities, Kheled, and Starfleet.
- Leave the region with a governance model capable of making decisions during a Reef-wide emergency.

### Active pressures

- Habitat failures and resource disputes continue while constitutional talks occur.
- Some Crown protection crews provide real rescue and security services that no recognized authority has replaced.
- Aster leaders disagree over whether formal recognition protects or exposes them.
- Outside authorities prefer one accountable counterpart even when the population relies on distributed decision-making.

### Required revelations

- The Drift Concord already exercises government functions through mutual aid, route custody, and distributed councils.
- Several communities under Crown protection would defect if reliable rescue and arbitration replace coercive services.
- Kheled recognition is possible without annexation if inspection and security powers are bounded.
- The final inversion will require a legitimate emergency quorum capable of issuing accepted movement orders.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Support a formal Concord charter with elected and mobile representation.
- Preserve a decentralized sanctuary network and negotiate external recognition of its limited institutions.
- Integrate settlements under Federation or Kheled administration with local guarantees.
- Recognize reformed Crown captains as accountable local security providers.
- Decline to impose a settlement and focus on practical agreements among communities.

### Outcome families

### concord-charter

The Drift Concord becomes a recognized regional government with distributed representation and bounded security powers.

  - `adjustTrack`: trackId=civilian-strain, amount=-2
  - `adjustTrack`: trackId=raider-consolidation, amount=-1
  - `grantAsset`: assetId=civilian-evacuation-flotilla, title=Civilian Evacuation Flotilla, playerSummary=Concord vessels can coordinate large-scale evacuation and relief movement.
  - `revealFact`: factId=fact.regional-emergency-quorum, summary=The Reef possesses a legitimate emergency quorum recognized by major civilian communities., tags=['governance', 'finale']
### sanctuary-network

Communities retain distributed autonomy and concealment while adopting limited shared rescue and arbitration institutions.

  - `adjustTrack`: trackId=chart-exposure, amount=-1
  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `grantAsset`: assetId=civilian-evacuation-flotilla, title=Civilian Evacuation Flotilla, playerSummary=Concord vessels can coordinate large-scale evacuation and relief movement.
  - `grantAsset`: assetId=distributed-route-keys, title=Distributed Route Keys, playerSummary=Multiple trusted authorities can verify safe passage without one complete public chart.
### external-administration

Federation or Kheled institutions assume major governance functions, improving logistics while weakening local autonomy.

  - `adjustTrack`: trackId=civilian-strain, amount=-2
  - `adjustTrack`: trackId=kheled-intervention, amount=2
  - `adjustTrack`: trackId=chart-exposure, amount=1
  - `setFlag`: flagId=reef-external-administration, value=True
### fragmented-survival

Immediate crises are partly addressed, but no durable political settlement emerges and communities make competing emergency arrangements.

  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `adjustTrack`: trackId=raider-consolidation, amount=1
  - `advanceFront`: frontId=front.civilian-strain, amount=1

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## The Shepherds Below

**ID:** `chapter-7-the-shepherds-below`  
**Kind:** main  
**Typical duration:** five to seven sessions  
**Priority:** 91  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Enter and repair, disable, or redistribute control of Shepherd Node Seven while rival factions seek the first strategic command point over the Reef’s gravitic geometry.

### Dramatic question

Can infrastructure powerful enough to govern movement be made safe without becoming an instrument of rule?

### Anchors

- Locations: shepherd-node-seven, saint-caligo-wreckfield, kheled-watch, crown-shoal, maintenance-habitat-kappa-four
- Actors: tal-oren, veyra-ninth, bram-ochoa, amina-rhos
- Factions: shepherd-network, kheled-protectorate, crown-of-embers, starfleet-survey-command, drift-concord

### Objectives

- Reach Node Seven with sufficient power, expertise, and access to survive entry.
- Determine the node’s actual function and its relationship to other Reef anomalies.
- Stop unsafe salvage feedback or external seizure attempts.
- Select a custody and control model for the node.
- Use node records to assess the approaching Deep Tide and the missing captain’s route.

### Active pressures

- Powering the node leaves the Glass Harbor tactically vulnerable and strains already damaged systems.
- The Crown possesses a partial control key; Kheled archives contain partial maintenance protocols.
- The network rejects unsafe single-point commands and may close routes to isolate perceived damage.
- Disabling Node Seven reduces immediate strategic risk but may accelerate regional instability.

### Required revelations

- The Reef contains thirteen Shepherd nodes: seven functional, three damaged, two inert, and one overloaded through modern salvage activity.
- The network distributes gravitic stress and requires a quorum for safe large-scale control.
- One hidden maintenance habitat remains habitable and contains Rhos, Ensign Kor, Mavek Sorn, and partial records.
- Rhos survived and deliberately withheld complete chart transmission after realizing that publication would expose Aster Basin.
- The Crown’s partial key can force local field changes but cannot safely command the full network.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Repair the node and establish distributed custody among multiple parties.
- Place the node under Starfleet or Kheled technical control with external oversight.
- Disable the node and rely on evacuation and local navigation.
- Negotiate with Veyra for the partial key or seize it through tactical action.
- Use Node Seven to reach Kappa-4 and recover Rhos before completing the technical settlement.

### Outcome families

### distributed-custody

Node Seven is repaired under a multi-key quorum that prevents unilateral command and enables regional stabilization.

  - `adjustTrack`: trackId=reef-instability, amount=-2
  - `adjustTrack`: trackId=kheled-intervention, amount=-1
  - `adjustTrack`: trackId=raider-consolidation, amount=-1
  - `grantAsset`: assetId=node-seven-access, title=Node Seven Access, playerSummary=Node Seven can provide controlled field stabilization during the finale.
  - `grantAsset`: assetId=maintenance-habitat-archive, title=Maintenance Habitat Archive, playerSummary=Ancient records reveal node status, quorum requirements, and repair limits.
  - `revealFact`: factId=fact.thirteen-shepherd-nodes, summary=The Reef contains thirteen linked Shepherd nodes with varied operational states., tags=['shepherd', 'architecture']
  - `revealFact`: factId=fact.rhos-survived-kappa-four, summary=Captain Rhos survived at Maintenance Habitat Kappa-4 with Ensign Kor and Mavek Sorn., tags=['rhos', 'shepherd']
  - `grantAsset`: assetId=rhos-testimony, title=Rhos Testimony, playerSummary=Captain Rhos can provide first-hand evidence, command counsel, and a revised chart doctrine.
### starfleet-control

Starfleet secures and repairs the node, improving operational control while concentrating authority and outside suspicion.

  - `adjustTrack`: trackId=reef-instability, amount=-2
  - `adjustTrack`: trackId=chart-exposure, amount=2
  - `adjustTrack`: trackId=crew-succession-confidence, amount=1
  - `grantAsset`: assetId=node-seven-access, title=Node Seven Access, playerSummary=Node Seven can provide controlled field stabilization during the finale.
  - `revealFact`: factId=fact.thirteen-shepherd-nodes, summary=The Reef contains thirteen linked Shepherd nodes with varied operational states., tags=['shepherd', 'architecture']
### kheled-control

Kheled technical teams assume node custody under negotiated or coercive terms, reducing instability while expanding Protectorate power.

  - `adjustTrack`: trackId=reef-instability, amount=-2
  - `adjustTrack`: trackId=kheled-intervention, amount=3
  - `grantAsset`: assetId=node-seven-access, title=Node Seven Access, playerSummary=Node Seven can provide controlled field stabilization during the finale.
  - `revealFact`: factId=fact.thirteen-shepherd-nodes, summary=The Reef contains thirteen linked Shepherd nodes with varied operational states., tags=['shepherd', 'architecture']
### disable-network

Node Seven is disabled or isolated, denying immediate control while removing a major stabilization tool.

  - `adjustTrack`: trackId=raider-consolidation, amount=-1
  - `adjustTrack`: trackId=kheled-intervention, amount=-1
  - `adjustTrack`: trackId=reef-instability, amount=2
  - `setFlag`: flagId=node-seven-disabled, value=True
  - `revealFact`: factId=fact.thirteen-shepherd-nodes, summary=The Reef contains thirteen linked Shepherd nodes with varied operational states., tags=['shepherd', 'architecture']
### partial-repair

The node becomes usable only in limited bursts; Rhos or key records may be recovered, but the custody dispute remains unresolved.

  - `adjustTrack`: trackId=reef-instability, amount=-1
  - `adjustTrack`: trackId=crew-succession-confidence, amount=1
  - `grantAsset`: assetId=node-seven-access, title=Limited Node Seven Access, playerSummary=Node Seven can support one high-risk stabilization action before overheating.
  - `revealFact`: factId=fact.rhos-survived-kappa-four, summary=Captain Rhos survived at Maintenance Habitat Kappa-4 with Ensign Kor and Mavek Sorn., tags=['rhos', 'shepherd']

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## The Deep Tide

**ID:** `chapter-8-the-deep-tide`  
**Kind:** finale  
**Typical duration:** five to eight sessions  
**Priority:** 99  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Command a multi-front regional inversion in which routes collapse, Aster Basin loses station-keeping, fleets enter concealed space, wrecks migrate, and every earned alliance or technical asset must be assigned under changing geometry.

### Dramatic question

Can the Reef survive stabilization without surrendering its future to the faction best positioned to command the crisis?

### Anchors

- Locations: deep-tide-trench, aster-basin, saint-caligo-wreckfield, shepherd-node-seven, lagrange-gate, kheled-watch, crown-shoal
- Actors: lira-quell, bram-ochoa, tal-oren, veyra-ninth, lysa-mbeki, amina-rhos
- Factions: starfleet-survey-command, drift-concord, breakwater-guild, kheled-protectorate, crown-of-embers, shepherd-network

### Objectives

- Establish a command and communications structure that participating factions will follow under degraded conditions.
- Preserve or evacuate Aster Basin and other exposed communities.
- Contain the Deep Tide inversion through Shepherd control, distributed field work, route closure, evacuation, or a mixed solution.
- Prevent any faction from exploiting the crisis to seize unilateral regional control unless the player knowingly accepts that outcome.
- Bring the Glass Harbor and its crew through the operation with a record sufficient for the epilogue and command review.

### Active pressures

- The Glass Harbor cannot personally lead every rescue, node action, tow, and security engagement.
- Port power trunks may fail if the main tractors are used continuously to hold Aster or a corridor.
- Kheled intervention forces, Crown ships, and civilian flotillas act according to current posture and earned agreements.
- Exposed routes allow rapid assistance and rapid conquest in equal measure.
- The Shepherd network will reject unsafe commands and may sacrifice one basin to protect the wider geometry.

### Required revelations

- The Deep Tide is a network-wide redistribution event accelerated by the overloaded salvage node and accumulated modern high-energy traffic.
- No single node can safely stabilize the Reef; a quorum or carefully timed distributed intervention is required.
- Finale options are determined by actual routes, assets, faction postures, ship condition, and delegated missions rather than a fixed branch.
- Rhos’s command status and testimony can support the player, challenge policy, or remain unavailable depending on prior state.
- A survivable outcome can include evacuation, reduced navigability, or political compromise; perfect restoration is not required.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Use distributed Node Seven control, route keys, pilots, and allied ships to build a safe stabilization quorum.
- Centralize command under Starfleet or Kheled authority for speed and accept the political result.
- Abandon full stabilization and concentrate on evacuation and preservation of hidden communities.
- Negotiate a temporary operational compact with Crown captains in exchange for bounded legitimacy or amnesty.
- Withdraw the Glass Harbor from an impossible front, preserve surviving assets, and accept severe regional loss.

### Outcome families

### distributed-stabilization

The inversion is contained through legitimate multi-party control; several routes and communities survive without one faction holding the Reef.

  - `setFrontStage`: frontId=front.reef-instability, stage=0, reason=Deep Tide contained through distributed stabilization
  - `setFrontStage`: frontId=front.shepherd-cascade, stage=0, reason=Shepherd quorum restored
  - `adjustTrack`: trackId=civilian-strain, amount=-2
  - `setFlag`: flagId=ending-open-sea-eligible, value=True
  - `revealFact`: factId=fact.deep-tide-outcome, summary=The Deep Tide was contained through distributed regional action., tags=['ending', 'deep-tide']
### centralized-stabilization

The Reef remains navigable and mass casualties are avoided, but Starfleet or Kheled emerges with decisive control over charts and nodes.

  - `setFrontStage`: frontId=front.reef-instability, stage=0, reason=Deep Tide contained through centralized command
  - `setFrontStage`: frontId=front.shepherd-cascade, stage=0, reason=Shepherd network placed under central control
  - `adjustTrack`: trackId=chart-exposure, amount=3
  - `setFlag`: flagId=ending-charted-and-conquered-eligible, value=True
  - `revealFact`: factId=fact.deep-tide-outcome, summary=The Deep Tide was contained under centralized command authority., tags=['ending', 'deep-tide']
### evacuation-preserved

Hidden communities and most lives survive through evacuation and route denial, but the Reef remains unstable and infrastructure is lost.

  - `setFrontStage`: frontId=front.reef-instability, stage=3, reason=Deep Tide survived through evacuation rather than full stabilization
  - `adjustTrack`: trackId=chart-exposure, amount=-2
  - `adjustTrack`: trackId=civilian-strain, amount=0
  - `setFlag`: flagId=ending-sanctuary-of-shadows-eligible, value=True
  - `revealFact`: factId=fact.deep-tide-outcome, summary=The region survived primarily through evacuation and preserved concealment., tags=['ending', 'deep-tide']
### crown-dominance

The inversion is partly contained, but Crown vessels retain enough routes, weapons, and node leverage to become the de facto regional power.

  - `setFrontStage`: frontId=front.reef-instability, stage=2, reason=Deep Tide partly contained
  - `setFrontStage`: frontId=front.raider-consolidation, stage=5, reason=Crown controls surviving route network
  - `setFlag`: flagId=ending-crown-in-the-deep, value=True
  - `revealFact`: factId=fact.deep-tide-outcome, summary=The Crown of Embers emerged as the principal power after the Deep Tide., tags=['ending', 'deep-tide']
### cascade-loss

Multiple nodes fail, Aster is lost or catastrophically evacuated, and most of the Reef becomes impassable, though survivors and evidence remain for an honest accounting.

  - `setFrontStage`: frontId=front.reef-instability, stage=6, reason=Regional gravitic cascade
  - `setFrontStage`: frontId=front.shepherd-cascade, stage=6, reason=Shepherd network failure
  - `adjustTrack`: trackId=civilian-strain, amount=3
  - `setFlag`: flagId=ending-drowned-constellation, value=True
  - `revealFact`: factId=fact.deep-tide-outcome, summary=The Reef suffered a catastrophic gravitic cascade and mass displacement., tags=['ending', 'deep-tide']

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.


## What the Map Remembers

**ID:** `epilogue-what-the-map-remembers`  
**Kind:** epilogue  
**Typical duration:** two to four sessions  
**Priority:** 95  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Resolve the public record, navigation governance, salvage law, hidden-community status, Captain Rhos’s future, and the player’s command standing after the Deep Tide.

### Dramatic question

What must be remembered, withheld, repaired, or relinquished after survival?

### Anchors

- Locations: lagrange-gate, aster-basin, quiet-shelf
- Actors: lysa-mbeki, lira-quell, tal-oren, bram-ochoa, veyra-ninth, amina-rhos
- Factions: starfleet-survey-command, drift-concord, breakwater-guild, kheled-protectorate, crown-of-embers

### Objectives

- Compile an operational and casualty record without exposing protected information by default.
- Settle or explicitly defer navigation governance and node custody.
- Resolve major salvage, memorial, and accountability claims.
- Determine Captain Rhos’s status and the player’s ongoing billet.
- Record unresolved obligations and assets for future campaigns.

### Active pressures

- Starfleet, Kheled, local communities, and survivors want incompatible public narratives.
- Complete disclosure can enable accountability and renewed predation at the same time.
- The command succession cannot be resolved by a hidden morality score or automatic restoration of Rhos.
- Some severe losses cannot be repaired within the epilogue and require acknowledgement rather than false closure.

### Required revelations

- The campaign’s regional ending derives from mobility, sovereignty, governance, accountability, and continuity rather than one binary success state.
- Rhos’s recommendation depends on her recovery, health, disagreement with policy, and assessment of the player’s command record.
- The surviving map is a political institution as much as a navigation product.
- Unresolved routes, claims, and faction relationships remain valid future campaign material.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Negotiate a multilateral settlement and public record.
- Submit an unvarnished Starfleet report while protecting only narrowly defined sanctuary data.
- Accept inquiry, censure, transfer, or continued acting command as consequences of prior conduct.
- Support Rhos’s return, continued medical leave, retirement, or a restructured command relationship.
- Leave contested issues explicitly unresolved when no legitimate settlement exists.

### Outcome families

### accountable-settlement

The record preserves essential truth, protected communities retain standing, and command succession is resolved through transparent lawful process.

  - `setFlag`: flagId=drowned-constellation-complete, value=True
  - `setFlag`: flagId=ending-accountable-settlement, value=True
### security-settlement

Operational stability and restricted records take priority over broad disclosure; the region survives under concentrated oversight.

  - `setFlag`: flagId=drowned-constellation-complete, value=True
  - `setFlag`: flagId=ending-security-settlement, value=True
### sanctuary-settlement

The public record remains incomplete to protect vulnerable communities, preserving autonomy while leaving accountability and access contested.

  - `setFlag`: flagId=drowned-constellation-complete, value=True
  - `setFlag`: flagId=ending-sanctuary-settlement, value=True
### fractured-accounting

No common settlement is possible; surviving factions retain incompatible records and the Glass Harbor departs with unresolved obligations.

  - `setFlag`: flagId=drowned-constellation-complete, value=True
  - `setFlag`: flagId=ending-fractured-accounting, value=True

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.
