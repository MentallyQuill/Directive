# Black Current Main Quests

## Use

These quest records are authored opportunity structures, not a linear episode list. Availability predicates and campaign facts determine when work appears. Multiple quests may coexist; only one foreground scene is narrated at a time. Every quest inherits the current ship, crew, route, faction, actor, front, clock, and knowledge state.

## Progression overview

- **Wreckfall** establishes acting command and the first persistent wreck objects.
- **Living Dead work** can proceed in any order through First Manifest, Forty-Seven Hours Late, and The Hospital Hull.
- **Claims work** becomes available after at least one identity, rescue, or custody precedent.
- **Arsenal work** opens through ordnance pressure, military evidence, or memorial-field investigation.
- **Anchor investigation** can be built through Ternion, Mooring Grave, Blackmouth, Security records, Varen's testimony, or recovered components.
- **Black Tide** is a convergence condition, not a fixed chapter date.
- **The Names Returned** evaluates all ending axes and carries forward unresolved state.

## Wreckfall

**ID:** `prelude-wreckfall`  
**Kind:** onboarding  
**Typical duration:** two to four sessions  
**Priority:** 100  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

At Wreckfall Alpha, three ships emerge inside an active civilian salvage operation. Captain Anika Lorne is injured as the Serein is thrown against a tractored wreck, forcing the new XO to assume the conn and choose what can be saved.

### Director purpose

The opening establishes rescue doctrine, acting command, towing limits, Freehold relations, and the causal nature of the Wake. The Starfleet challenge ship, torpedo carrier, and hospital transport all preserve alternate evidence routes.

### Dramatic question

What does command save first when every visible choice leaves someone in danger?

### Anchors

- Locations: wreckfall-alpha, lydian-anchorage
- Actors: pera-voss, nara-pell
- Factions: starfleet-recovery-bureau, free-salvage-coalition

### Objectives

- Assume XO authority and review the Serein's recovery limits during the opening watch.
- Stabilize the hospital transport, weapons carrier, and powered Starfleet hull as far as resources permit.
- Prevent the emergence zone from cascading into Lydian traffic.
- Coordinate or contest Freehold responders already inside the debris field.
- Take acting command after Lorne's injury and establish the first standing recovery orders.

### Active pressures

- The hospital transport is breaking apart under gravitic stress.
- The weapons carrier contains unstable torpedoes and an intermittent reactor.
- A Starfleet hull broadcasts an obsolete challenge and may contain people behind shielded compartments.
- The Serein can hold one major tow while preserving maneuver, not all three.
- Lorne is conscious only briefly after the impact and cannot continue command.

### Required revelations

- The three ships entered the current at different wartime locations but emerged within the same minute.
- The hospital hull contains living patients and unlisted caretakers.
- The obsolete Starfleet challenge includes a routing checksum absent from public records.
- Starfleet confirms the player as Acting Captain and regional recovery commander after Lorne enters surgery.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Prioritize the hospital hull and delegate weapons control to Freehold tugs.
- Use tractor buoys, shuttle teams, transporters, or controlled hull separation in any workable combination.
- Destroy or jettison torpedoes at the cost of evidence and salvage.
- Board the powered Starfleet hull before it drifts, or isolate it for later recovery.
- Withdraw the Serein to protect Lydian traffic and accept losses inside Wreckfall Alpha.

### Outcome families

#### balanced-recovery

Most living survivors are recovered, the weapons threat is contained, and enough evidence remains to support several investigations.

  - `adjustTrack`: trackId=survivor-load, amount=1
  - `adjustTrack`: trackId=ordnance-hazard, amount=-1
  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustClock`: clockId=clock.lorne-recovery, amount=1
  - `setFlag`: flagId=player-acting-captain, value=True
  - `revealFact`: factId=fact.opening-common-emergence, summary=Three unrelated wartime vessels emerged from the same current geometry within one minute., tags=['wake', 'mooring']
  - `grantAsset`: assetId=asset.freehold-opening-cooperation, title=Freehold Opening Cooperation, summary=Freehold responders will answer one early delegated emergency without requiring a formal charter.

#### hospital-first

The hospital transport is saved decisively, but the weapons carrier or Starfleet hull is lost, dispersed, or seized by another faction.

  - `adjustTrack`: trackId=survivor-load, amount=0
  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustTrack`: trackId=ordnance-hazard, amount=1
  - `adjustClock`: clockId=clock.lorne-recovery, amount=1
  - `setFlag`: flagId=player-acting-captain, value=True
  - `grantAsset`: assetId=asset.emergency-medical-berths, title=Emergency Medical Berths, summary=Surviving hospital modules expand regional medical capacity if their caretakers receive standing.

#### ordnance-first

The weapons carrier is secured or destroyed before detonation, while the hospital hull suffers greater loss and public anger.

  - `adjustTrack`: trackId=ordnance-hazard, amount=-2
  - `adjustTrack`: trackId=survivor-load, amount=2
  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `adjustClock`: clockId=clock.lorne-recovery, amount=1
  - `setFlag`: flagId=player-acting-captain, value=True
  - `revealFact`: factId=fact.weapons-routing-checksum, summary=Recovered weapons logs contain a classified routing checksum tied to wartime subspace control., tags=['military-wreck', 'mooring']

#### costly-hold

The Serein remains inside the surge too long, saving lives and data at the price of significant tractor damage, injuries, and delayed traffic protection.

  - `adjustTrack`: trackId=current-pressure, amount=1
  - `adjustTrack`: trackId=crew-war-strain, amount=1
  - `adjustTrack`: trackId=survivor-load, amount=1
  - `setFlag`: flagId=serein-opening-tractor-damage, value=True
  - `adjustClock`: clockId=clock.lorne-recovery, amount=0
  - `setFlag`: flagId=player-acting-captain, value=True

#### withdrawal

The Serein preserves the ship and Lydian traffic but abandons much of the emergence to local responders and uncontrolled drift.

  - `adjustTrack`: trackId=ordnance-hazard, amount=2
  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `adjustTrack`: trackId=survivor-load, amount=2
  - `advanceFront`: frontId=front.custody-conflict, amount=1
  - `setFlag`: flagId=player-acting-captain, value=True

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## First Manifest

**ID:** `chapter-1-first-manifest`  
**Kind:** main  
**Typical duration:** two to three sessions  
**Priority:** 96  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

An intact Starfleet ship, the U.S.S. Velorum, emerges at Sable Verge. Its crew experienced twelve days while seven months passed outside, and many have been declared dead, replaced, promoted over, or legally dispossessed.

### Director purpose

The quest introduces Commander Ila Varen and the recurring question of restoration versus survival. The Velorum carries routing observations that can reveal engineered current behavior through testimony, logs, or sensor residue.

### Dramatic question

When a dead crew returns, which parts of their former life can command restore without taking rights from the living?

### Anchors

- Locations: sable-verge, lydian-anchorage
- Actors: ila-varen, magistrate-orrel, maia-rinn
- Factions: starfleet-recovery-bureau, lydian-civil-authority

### Objectives

- Establish safe contact and verify the Velorum crew without presuming fraud or contamination.
- Stabilize the vessel and transfer urgent patients without seizing its command systems by default.
- Determine temporary command, pay, identity, and family-contact status.
- Preserve or lawfully obtain the ship's route observations.
- Set an initial precedent for returned Starfleet personnel.

### Active pressures

- Varen considers herself the lawful captain of an active Starfleet ship.
- Starfleet has assigned successors to several billets and paid death benefits to families.
- Public disclosure will bring families, press craft, and claimants before quarantine is complete.
- Ro requests immediate classified custody of the Velorum navigation core.

### Required revelations

- The crew experienced uneven but continuous subjective time, not temporal displacement.
- The Velorum observed structured Starfleet-origin beacons inside the current.
- At least one crew member's former spouse has remarried and refuses immediate contact.
- Varen's original orders were superseded, but her commission and personhood were not extinguished by a death declaration.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Recognize Varen's limited command pending formal review.
- Place the Velorum under protective Starfleet custody while preserving crew rights.
- Use a joint medical-legal board with returned-person representation.
- Seal the arrival temporarily to protect patients, accepting later accusations of concealment.
- Allow Varen and crew to decline Starfleet service while retaining identity claims.

### Outcome families

#### protected-restoration

The crew receives legal personhood, medical protection, and a staged command review without automatic restoration of every prior entitlement.

  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustTrack`: trackId=survivor-load, amount=1
  - `adjustClock`: clockId=clock.returned-persons-mobilization, amount=1
  - `setFlag`: flagId=returned-persons-recognized, value=True
  - `revealFact`: factId=fact.velorum-structured-beacons, summary=The Velorum encountered structured Starfleet-origin routing beacons inside the current., tags=['mooring', 'testimony']
  - `grantAsset`: assetId=asset.velorum-testimony, title=Velorum Testimony, summary=A coherent crew record of current conditions and internal routing signals.

#### full-restoration

Starfleet provisionally restores Varen and key crew to their former positions, creating immediate conflict with successors and families.

  - `adjustTrack`: trackId=claims-legitimacy, amount=0
  - `adjustTrack`: trackId=survivor-load, amount=1
  - `adjustTrack`: trackId=crew-war-strain, amount=1
  - `setFlag`: flagId=varen-command-restored, value=True
  - `revealFact`: factId=fact.velorum-structured-beacons, summary=The Velorum encountered structured Starfleet-origin routing beacons inside the current., tags=['mooring', 'testimony']

#### protective-custody

The crew is treated lawfully as persons but the ship and records remain under centralized Starfleet custody.

  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `adjustTrack`: trackId=institutional-secrecy, amount=1
  - `adjustClock`: clockId=clock.returned-persons-mobilization, amount=2
  - `setFlag`: flagId=returned-persons-controlled, value=True
  - `grantAsset`: assetId=asset.velorum-core, title=Velorum Navigation Core, summary=Starfleet holds a complete but politically contested route record.

#### autonomous-returnees

Varen and much of the crew refuse immediate Starfleet control and organize with civilian returnees at Sable Verge.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustClock`: clockId=clock.returned-persons-mobilization, amount=3
  - `setFlag`: flagId=returned-persons-autonomous, value=True
  - `grantAsset`: assetId=asset.returned-persons-network, title=Returned Persons Network, summary=Returnees share testimony, family contacts, and inside-current observations outside Starfleet custody.

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## Forty-Seven Hours Late

**ID:** `chapter-2-forty-seven-hours-late`  
**Kind:** main  
**Typical duration:** two to three sessions  
**Priority:** 95  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

A civilian transport emerges after experiencing forty-seven hours inside the Wake. Outside, seven months passed and its destination colony has undergone a coup, redistributed property, and declared several passengers enemies of the state.

### Director purpose

This quest tests political asylum, contact with a changed home, and whether transport logs become intelligence. It can reveal that current compression correlates with specific anchor pulse intervals.

### Dramatic question

Who decides whether returning passengers go home when home now treats their survival as a threat?

### Anchors

- Locations: sable-verge, lydian-anchorage, ternion-relay
- Actors: maia-rinn, davi-leth, magistrate-orrel
- Factions: lydian-civil-authority, starfleet-recovery-bureau

### Objectives

- Stabilize the transport and verify the passengers' subjective timeline.
- Contact or withhold contact from the destination colony under lawful criteria.
- Determine asylum, return, or onward travel options.
- Protect passengers from forced intelligence interviews while preserving relevant navigation evidence.
- Resolve immediate ownership of cargo and property claimed by the post-coup government.

### Active pressures

- The new colonial government demands extradition of the former governor aboard the transport.
- Passengers have family and property claims but no safe housing in the Wake.
- Cargo includes medical supplies now considered state property by both old and new authorities.
- Ternion can compare the transport's logs only if the relay receives immediate access.

### Required revelations

- The transport's subjective duration matches a repeating anchor pulse interval.
- The passengers are internally continuous and medically ordinary apart from confinement effects.
- The coup government has legitimate public support as well as coercive methods.
- Some passengers want to return, others seek asylum, and no collective disposition respects all of them.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Recognize individual asylum claims and reject a single disposition for the whole passenger list.
- Negotiate monitored return with guarantees and observers.
- Divert the transport to Lydian housing while a civil court hears claims.
- Transfer cargo under escrow while preserving personal property rights.
- Refuse colony contact temporarily to protect passengers, accepting diplomatic consequences.

### Outcome families

#### individual-status

Passengers receive individual status review, housing, and voluntary contact options; the cargo enters neutral escrow.

  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustTrack`: trackId=survivor-load, amount=1
  - `adjustClock`: clockId=clock.returned-persons-mobilization, amount=1
  - `revealFact`: factId=fact.anchor-pulse-interval, summary=A returned transport's subjective duration matches a repeating artificial pulse interval in the Wake., tags=['mooring', 'technical']
  - `grantAsset`: assetId=asset.returnee-case-law, title=Returned-Person Case Law, summary=A durable precedent for individualized status and consent.

#### monitored-return

Most passengers return under negotiated guarantees, but dissidents and former officials remain at Lydian Anchorage.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustTrack`: trackId=survivor-load, amount=0
  - `adjustTrack`: trackId=institutional-secrecy, amount=0
  - `revealFact`: factId=fact.anchor-pulse-interval, summary=A returned transport's subjective duration matches a repeating artificial pulse interval in the Wake., tags=['mooring', 'technical']

#### state-transfer

The transport and cargo are transferred to the new government in exchange for formal assurances; several passengers contest coercion.

  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `adjustTrack`: trackId=survivor-load, amount=-1
  - `adjustClock`: clockId=clock.returned-persons-mobilization, amount=2
  - `setFlag`: flagId=returnees-distrust-state-disposition, value=True

#### protective-isolation

Starfleet holds the transport and passengers under emergency protection, preventing extradition but deepening centralized custody and local strain.

  - `adjustTrack`: trackId=survivor-load, amount=2
  - `adjustTrack`: trackId=institutional-secrecy, amount=1
  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `grantAsset`: assetId=asset.transport-medical-cargo, title=Transport Medical Cargo, summary=Medical supplies remain available under Starfleet custody.

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## The Hospital Hull

**ID:** `chapter-3-the-hospital-hull`  
**Kind:** main  
**Typical duration:** two to four sessions  
**Priority:** 94  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

A civilian hospital transport emerges with damaged records, hundreds of patients, and a functioning care system maintained by people who were never listed as crew.

### Director purpose

The unlisted caretakers are former patients, refugees, and conscripted service staff who kept the vessel alive. Its medical capacity can become a regional asset if command recognizes their authority rather than treating them as trespassers.

### Dramatic question

Who owns a hospital kept alive by people the manifest never admitted were responsible for it?

### Anchors

- Locations: wreckfall-alpha, lydian-anchorage, freehold-nine
- Actors: davi-leth, magistrate-orrel, luma-brant
- Factions: lydian-civil-authority, free-salvage-coalition, starfleet-recovery-bureau

### Objectives

- Prevent the hospital hull from breaking apart or losing life support.
- Establish a patient and caretaker record without coercive interrogation.
- Determine who may command, move, or repurpose the hospital vessel.
- Integrate or relocate its medical capacity before the next emergence.
- Recover technical data from the ship's prolonged current exposure.

### Active pressures

- The original medical command staff are dead or incapacitated.
- Lydian Anchorage lacks enough berths for all patients.
- The hull's registered owner claims abandonment and wants commercial salvage compensation.
- The caretakers distrust Starfleet records because the original manifest erased them.

### Required revelations

- The hospital survived because unlisted caretakers rewrote command and maintenance permissions.
- Its current path contains the same artificial pulse structure seen in other arrivals.
- Some patients cannot be moved safely for weeks.
- The vessel can expand regional medical capacity if its legal command is recognized and repairs are funded.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Recognize a caretaker council as temporary vessel authority.
- Place the hospital under Starfleet medical custody while preserving caretaker roles.
- Tow it to Freehold for repair and independent operation.
- Evacuate patients in stages and salvage the hull.
- Negotiate a joint Lydian-Freehold medical trust.

### Outcome families

#### caretaker-hospital

The caretakers gain legal standing and the hospital becomes a semi-autonomous regional medical asset.

  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustTrack`: trackId=survivor-load, amount=-2
  - `grantAsset`: assetId=asset.hospital-hull, title=Hospital Hull, summary=A mobile hospital and quarantine platform operated by its caretaker council.
  - `setFlag`: flagId=hospital-caretakers-recognized, value=True
  - `revealFact`: factId=fact.hospital-pulse-record, summary=The hospital hull recorded repeating artificial pressure pulses during confinement., tags=['mooring', 'technical']

#### starfleet-medical-custody

Starfleet stabilizes and staffs the vessel, expanding care while placing its caretakers under formal supervision.

  - `adjustTrack`: trackId=survivor-load, amount=-2
  - `adjustTrack`: trackId=claims-legitimacy, amount=0
  - `adjustTrack`: trackId=institutional-secrecy, amount=1
  - `grantAsset`: assetId=asset.starfleet-medical-berths, title=Starfleet Medical Berths, summary=A controlled expansion of quarantine and trauma capacity.

#### freehold-repair-trust

Freehold repairs the hull under a joint trust and gains a recognized medical role.

  - `adjustTrack`: trackId=survivor-load, amount=-1
  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustClock`: clockId=clock.freehold-strike, amount=-1
  - `grantAsset`: assetId=asset.freehold-medical-network, title=Freehold Medical Network, summary=Independent medics and the hospital hull can accept delegated casualties.

#### evacuate-and-strip

Patients are relocated at high cost and the hull is dismantled for parts, preserving lives but losing a durable institution and much evidence.

  - `adjustTrack`: trackId=survivor-load, amount=1
  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `adjustTrack`: trackId=crew-war-strain, amount=1
  - `grantAsset`: assetId=asset.recovery-spares, title=Recovery Spares, summary=Hull components reduce Serein technical debt or repair another rescue vessel.

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## The Law of First Hands

**ID:** `chapter-4-law-of-first-hands`  
**Kind:** main  
**Typical duration:** two to four sessions  
**Priority:** 93  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

The region demands a provisional recovery charter defining who may answer an emergence, claim a hull, move remains, secure weapons, and hold evidence.

### Director purpose

This is not a single conference scene. The player can build the charter through field rulings, bilateral agreements, formal negotiation, imposed Starfleet orders, or a coalition of responders.

### Dramatic question

What authority does rescue create, and where must that authority stop?

### Anchors

- Locations: lydian-anchorage, freehold-nine, sable-exchange
- Actors: nara-pell, luma-brant, serat-vek, broker-hegg, magistrate-orrel
- Factions: starfleet-recovery-bureau, free-salvage-coalition, cardassian-remembrance-commission, hegg-claims-consortium, lydian-civil-authority

### Objectives

- Define emergency rescue authority and after-action accountability.
- Define evidence, grave, salvage, and survivor custody boundaries.
- Establish compensation or support for responders who cannot wait for warrants.
- Determine who authenticates claims and publishes emergence warnings.
- Create a delegation structure usable during simultaneous crises.

### Active pressures

- Pell wants one chain of custody under Starfleet.
- Brant refuses to criminalize crews who acted before formal authority existed.
- Vek demands enforceable Cardassian grave and archive rights.
- Hegg offers financing in exchange for a major arbitration role.
- Another emergence may occur before negotiations finish.

### Required revelations

- No existing jurisdiction covers every category of person, wreck, weapon, and record in the Wake.
- Freehold rescue capacity exceeds Starfleet's local towing capacity.
- Cardassian forensic teams can resolve identities Starfleet cannot.
- A charter without compensation will fail operationally even if legally elegant.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Create a multi-party recovery compact with separate rescue, grave, evidence, and claims authorities.
- Impose Starfleet emergency administration with review and sunset provisions.
- Recognize Freehold first-response authority and retain Starfleet weapons control.
- Use Hegg escrow and neutral magistrates for title while excluding them from survivor status.
- Decline a comprehensive charter and negotiate case by case.

### Outcome families

#### shared-recovery-compact

A multi-party compact recognizes first responders, grave rights, neutral evidence custody, and returned-person standing.

  - `adjustTrack`: trackId=claims-legitimacy, amount=3
  - `adjustClock`: clockId=clock.freehold-strike, amount=-2
  - `setFlag`: flagId=shared-recovery-compact, value=True
  - `grantAsset`: assetId=asset.recovery-compact, title=Shared Recovery Compact, summary=A lawful delegation and custody framework for simultaneous emergences.

#### starfleet-administration

Starfleet imposes centralized recovery authority with clear safety rules but limited local standing.

  - `adjustTrack`: trackId=claims-legitimacy, amount=0
  - `adjustTrack`: trackId=institutional-secrecy, amount=1
  - `adjustClock`: clockId=clock.freehold-strike, amount=2
  - `setFlag`: flagId=starfleet-recovery-administration, value=True
  - `grantAsset`: assetId=asset.starfleet-seizure-teams, title=Starfleet Seizure Teams, summary=Additional security and evidence teams answer classified and ordnance events.

#### first-hands-charter

Freehold responders gain broad first-response and salvage standing, while Starfleet retains limited weapons and quarantine authority.

  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustTrack`: trackId=ordnance-hazard, amount=1
  - `adjustClock`: clockId=clock.freehold-strike, amount=-3
  - `setFlag`: flagId=first-hands-charter, value=True
  - `grantAsset`: assetId=asset.freehold-tugs, title=Freehold Tugs, summary=Multiple tug crews can be delegated to independent recovery sites.

#### commercial-arbitration

Hegg escrow and title review become the region's procedural center, financing infrastructure but embedding debt into recovery.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustTrack`: trackId=survivor-load, amount=-1
  - `setFlag`: flagId=commercial-claims-regime, value=True
  - `grantAsset`: assetId=asset.neutral-escrow, title=Neutral Escrow, summary=Claims and evidence can be held outside direct faction control.

#### no-common-charter

The parties retain separate authorities and respond through ad hoc agreements.

  - `adjustTrack`: trackId=claims-legitimacy, amount=-2
  - `advanceFront`: frontId=front.custody-conflict, amount=1
  - `adjustClock`: clockId=clock.freehold-strike, amount=1
  - `setFlag`: flagId=no-common-recovery-charter, value=True

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## Graves and Evidence

**ID:** `chapter-5-graves-and-evidence`  
**Kind:** main  
**Typical duration:** two to three sessions  
**Priority:** 92  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

At the Cardassian Memorial Field, families begin a formal memorial recovery while Starfleet Security identifies several hulls as evidence sites and a live reactor threatens the field.

### Director purpose

The quest balances grave rights, urgent safety, intelligence custody, and Cardassian participation. Mooring evidence can survive through joint forensic work, covert seizure, distributed copies, or recovered engineering marks.

### Dramatic question

Can a wreck remain a grave when it also contains evidence and a threat to the living?

### Anchors

- Locations: cardassian-memorial-field, lydian-anchorage
- Actors: serat-vek, dr-kera-taan, elian-ro
- Factions: cardassian-remembrance-commission, starfleet-security-liaison, starfleet-recovery-bureau

### Objectives

- Prevent the unstable reactor or ordnance from damaging the memorial field.
- Establish access rules for families, forensic teams, and security personnel.
- Identify remains and preserve culturally meaningful custody.
- Resolve Security's demand for classified scans and hardware.
- Determine what evidence enters public, shared, or sealed archives.

### Active pressures

- A reactor pulse threatens memorial craft and nearby hulls.
- Ro holds a classification order broad enough to cover entire wrecks.
- Families will leave if Starfleet treats the field as a military evidence lot.
- Taan needs time and intact structures to identify the missing.

### Required revelations

- Several wrecks contain joint Starfleet-Cardassian subspace-control components.
- One hull's engineering log references an operation named Mooring.
- Security has preselected components for seizure before the reactor crisis.
- Cardassian archives can authenticate evidence independently of Starfleet records.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Create concentric grave, safety, and evidence zones under joint custody.
- Permit a narrow covert scan while requiring an auditable evidence copy.
- Recognize Cardassian primary custody and negotiate Starfleet access.
- Seize the dangerous hulls under emergency authority.
- Destroy the reactor section and accept evidence loss to protect the field.

### Outcome families

#### joint-forensic-custody

Families retain grave rights while a joint forensic team secures hazards and preserves authenticated Mooring evidence.

  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustTrack`: trackId=ordnance-hazard, amount=-1
  - `adjustTrack`: trackId=institutional-secrecy, amount=-1
  - `revealFact`: factId=fact.mooring-engineering-mark, summary=Joint Starfleet-Cardassian subspace-control components are marked for Project Mooring., tags=['mooring', 'documentary']
  - `grantAsset`: assetId=asset.cardassian-forensic-team, title=Cardassian Forensic Team, summary=Archivists and recovery specialists can identify remains and authenticate records.

#### cardassian-primary-custody

The Commission controls the field and grants limited Starfleet access, improving family trust while slowing classified recovery.

  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustTrack`: trackId=institutional-secrecy, amount=-1
  - `adjustClock`: clockId=clock.mooring-purge, amount=1
  - `grantAsset`: assetId=asset.memorial-field-access, title=Memorial Field Access, summary=Cardassian authorities will admit Serein teams under agreed grave protocols.

#### security-seizure

Starfleet secures the hazardous and classified hulls quickly but alienates families and narrows independent evidence routes.

  - `adjustTrack`: trackId=ordnance-hazard, amount=-2
  - `adjustTrack`: trackId=claims-legitimacy, amount=-2
  - `adjustTrack`: trackId=institutional-secrecy, amount=2
  - `grantAsset`: assetId=asset.classified-mooring-component, title=Classified Mooring Component, summary=Security custody contains a technically valuable anchor component.

#### destroyed-to-protect

The unstable section is destroyed before it can cascade, preserving the field but losing key records and remains.

  - `adjustTrack`: trackId=ordnance-hazard, amount=-2
  - `adjustTrack`: trackId=crew-war-strain, amount=1
  - `adjustTrack`: trackId=institutional-secrecy, amount=1
  - `setFlag`: flagId=memorial-evidence-destroyed, value=True

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## The Price of Return

**ID:** `chapter-6-price-of-return`  
**Kind:** main  
**Typical duration:** two to three sessions  
**Priority:** 90  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Claims from returned ships, families, insurers, colonies, and salvagers threaten to freeze every recovered asset. Broker Hegg offers a financed escrow system that can keep rescue work moving while redistributing risk and debt.

### Director purpose

This quest defines the economic side of recovery. Hegg is useful, not benign; Starfleet can fund a public alternative, Freehold can mutualize risk, or claimants can remain exposed.

### Dramatic question

Who pays for rescue when every returned ship already belongs to someone who believed it was gone?

### Anchors

- Locations: sable-exchange, lydian-anchorage, freehold-nine
- Actors: broker-hegg, luma-brant, davi-leth, magistrate-orrel
- Factions: hegg-claims-consortium, free-salvage-coalition, lydian-civil-authority, starfleet-recovery-bureau

### Objectives

- Prevent competing claims from immobilizing active rescue assets.
- Create a funding path for tugs, medical berths, and forensic work.
- Protect survivors from automatic debt or asset seizure.
- Resolve ownership of at least one disputed returned vessel.
- Set audit and appeal rules for future claims.

### Active pressures

- Freehold crews will not continue uncompensated high-risk work indefinitely.
- Lydian authorities cannot finance regional recovery alone.
- Hegg holds valid purchased rights that courts cannot simply ignore.
- Starfleet funds are available only under tighter central control.

### Required revelations

- Many claimants sold rights under wartime distress but not fraud.
- A neutral escrow can separate immediate rescue funding from final title.
- Some insurers knew unusual routing losses were concentrated in the Wake.
- Economic records provide another documentary path toward classified wartime experimentation.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Use Hegg escrow with survivor exemptions, transparent rates, and public audit.
- Establish a Starfleet-funded public recovery trust.
- Recognize a Freehold mutual-aid pool and collective lien system.
- Freeze claims under emergency authority and accept delayed recovery work.
- Resolve only critical assets and leave the broader market unsettled.

### Outcome families

#### regulated-neutral-escrow

A regulated neutral escrow funds rescue while excluding personal survival, remains, and essential medical property from automatic claims.

  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustTrack`: trackId=survivor-load, amount=-1
  - `grantAsset`: assetId=asset.neutral-escrow, title=Neutral Escrow, summary=Disputed ships and records can be held without immediate seizure.
  - `revealFact`: factId=fact.insurer-routing-pattern, summary=Prewar and wartime insurers recorded concentrated losses along a route later used by Project Mooring., tags=['mooring', 'documentary']

#### public-recovery-trust

Starfleet and Lydian funds create a public trust, improving access but centralizing accounting and oversight.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustTrack`: trackId=survivor-load, amount=-1
  - `adjustTrack`: trackId=institutional-secrecy, amount=1
  - `grantAsset`: assetId=asset.public-recovery-fund, title=Public Recovery Fund, summary=Emergency repair, housing, and responder costs can be paid without commercial title transfer.

#### freehold-mutual-aid

Recovery crews mutualize costs and liens through Freehold, strengthening local autonomy with uneven accountability.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustClock`: clockId=clock.freehold-strike, amount=-2
  - `adjustTrack`: trackId=ordnance-hazard, amount=1
  - `grantAsset`: assetId=asset.freehold-mutual-aid, title=Freehold Mutual Aid, summary=Local responders can finance one major delegated operation.

#### claims-freeze

Emergency authority freezes title disputes, protecting people but starving recovery work of parts, credit, and labor.

  - `adjustTrack`: trackId=claims-legitimacy, amount=0
  - `adjustTrack`: trackId=survivor-load, amount=1
  - `adjustClock`: clockId=clock.freehold-strike, amount=2
  - `setFlag`: flagId=claims-frozen, value=True

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## Mine Control

**ID:** `chapter-7-mine-control`  
**Kind:** main  
**Typical duration:** two to three sessions  
**Priority:** 89  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

A damaged mine-control vessel emerges in Ironside Narrows and begins reactivating dormant mines according to wartime identification codes.

### Director purpose

The vessel contains both an immediate weapons threat and telemetry from Project Mooring routing commands. Disarmament, destruction, capture, or reprogramming are all viable and carry different evidence and proliferation consequences.

### Dramatic question

How much evidence justifies leaving a live weapons system intact?

### Anchors

- Locations: ironside-narrows, freehold-nine
- Actors: elian-ro, pera-voss
- Factions: starfleet-security-liaison, free-salvage-coalition, starfleet-recovery-bureau

### Objectives

- Prevent the mine network from reaching civilian routes.
- Determine whether living crew or shielded compartments remain aboard.
- Secure, disable, or destroy the control system.
- Preserve relevant routing telemetry if possible.
- Establish custody of recovered mines and control codes.

### Active pressures

- The vessel issues valid wartime challenge codes and treats Freehold tugs as hostile.
- Several mines are already drifting toward the Memorial Field route.
- Ro wants the control core intact and classified.
- Marr recommends destruction before a full internal search.

### Required revelations

- The mine-control vessel received vector changes from a Starfleet-origin subspace anchor.
- At least one shielded compartment may contain stasis survivors or remains.
- The mines can be rekeyed for disposal, defense, or illegal resale.
- Project Mooring used military identification networks to clear diverted routes.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Destroy the control vessel and then sweep the mines conventionally.
- Board and isolate the command core under cover from the Serein.
- Use captured challenge codes to place mines in safe mode.
- Coordinate Freehold tugs and Cardassian technicians for a distributed disarmament.
- Tow the vessel into a controlled disposal corridor.

### Outcome families

#### disarmed-and-documented

The network is placed in safe mode, survivors are searched for, and Mooring telemetry is preserved under auditable custody.

  - `adjustTrack`: trackId=ordnance-hazard, amount=-2
  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustTrack`: trackId=institutional-secrecy, amount=-1
  - `revealFact`: factId=fact.mine-network-mooring-vector, summary=The mine-control vessel received vector updates from a Starfleet-origin Mooring anchor., tags=['mooring', 'military-wreck']
  - `grantAsset`: assetId=asset.mine-disposal-codes, title=Mine Disposal Codes, summary=Automated mines can be neutralized during later emergences.

#### destroyed-before-search

The immediate threat is eliminated, but shielded compartments and much telemetry are lost.

  - `adjustTrack`: trackId=ordnance-hazard, amount=-3
  - `adjustTrack`: trackId=crew-war-strain, amount=1
  - `adjustTrack`: trackId=institutional-secrecy, amount=1
  - `setFlag`: flagId=mine-vessel-destroyed, value=True

#### security-capture

Security takes the control core and weapons network intact, reducing local hazard while narrowing public evidence.

  - `adjustTrack`: trackId=ordnance-hazard, amount=-2
  - `adjustTrack`: trackId=institutional-secrecy, amount=2
  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `grantAsset`: assetId=asset.security-mine-control, title=Security Mine Control, summary=A classified team can neutralize or redirect one weapons cluster in the finale.

#### distributed-disarmament

Freehold and Cardassian teams dismantle the network across several sites, improving cooperation but leaving some components outside Starfleet control.

  - `adjustTrack`: trackId=ordnance-hazard, amount=-1
  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustClock`: clockId=clock.ordnance-leak, amount=1
  - `grantAsset`: assetId=asset.distributed-disposal-teams, title=Distributed Disposal Teams, summary=Multiple allied teams can handle separated weapons sites.

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## Open Magazine

**ID:** `chapter-8-open-magazine`  
**Kind:** main  
**Typical duration:** one to three sessions  
**Priority:** 88  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Freehold crews recover a torpedo magazine from a wreck and claim it as lawful salvage just as buyers, Security officers, and frightened settlements arrive.

### Director purpose

The magazine contains both dangerous weapons and spare components valuable for defense or disposal. The quest is about custody, compensation, and proliferation, not a simple pirate raid.

### Dramatic question

Can a legitimate salvage claim include weapons that could destabilize the entire corridor?

### Anchors

- Locations: freehold-nine, ironside-narrows, sable-exchange
- Actors: luma-brant, broker-hegg, elian-ro
- Factions: free-salvage-coalition, hegg-claims-consortium, starfleet-security-liaison

### Objectives

- Secure the torpedo magazine against accident or theft.
- Determine the validity and limits of the Freehold salvage claim.
- Compensate or otherwise recognize recovery labor.
- Decide the disposition of warheads, guidance systems, and non-weapon components.
- Prevent the dispute from fracturing the recovery coalition.

### Active pressures

- Freehold recovered the magazine at significant cost before Starfleet arrived.
- Security asserts automatic classified custody.
- Several settlements want weapons for self-defense during emergences.
- Hegg holds purchased salvage rights from the wreck's insurer.

### Required revelations

- Not every component is a weapon; guidance and containment systems can support disposal work.
- One torpedo casing contains a Mooring authentication relay rather than a warhead.
- Freehold concealed two missing components to preserve bargaining power.
- A complete confiscation would likely trigger a work stoppage.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Pay or credit Freehold for recovery while Starfleet destroys the warheads.
- Create joint custody with serial tracking and distributed disposal.
- Recognize a limited defensive allocation to vulnerable settlements.
- Seize the entire magazine under emergency authority.
- Use Hegg escrow to separate title from immediate safety disposition.

### Outcome families

#### compensated-disposal

Freehold receives recognized compensation; warheads are destroyed; useful guidance and containment systems become shared disposal assets.

  - `adjustTrack`: trackId=ordnance-hazard, amount=-2
  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustClock`: clockId=clock.freehold-strike, amount=-1
  - `grantAsset`: assetId=asset.ordnance-guidance-kits, title=Ordnance Guidance Kits, summary=Reusable guidance and containment hardware improves later disposal operations.
  - `revealFact`: factId=fact.torpedo-mooring-relay, summary=A torpedo casing contains a Mooring authentication relay used for route clearance., tags=['mooring', 'military-wreck']

#### joint-magazine-custody

Starfleet and Freehold jointly secure the magazine, retaining some weapons for emergency defense under strict codes.

  - `adjustTrack`: trackId=ordnance-hazard, amount=-1
  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustClock`: clockId=clock.ordnance-leak, amount=1
  - `grantAsset`: assetId=asset.joint-defense-magazine, title=Joint Defense Magazine, summary=A limited weapons reserve can protect a finale recovery zone.

#### full-seizure

Starfleet secures all components quickly but treats Freehold labor as subordinate and increases local resistance.

  - `adjustTrack`: trackId=ordnance-hazard, amount=-2
  - `adjustTrack`: trackId=claims-legitimacy, amount=-2
  - `adjustClock`: clockId=clock.freehold-strike, amount=2
  - `adjustTrack`: trackId=institutional-secrecy, amount=1

#### weapons-dispersed

The dispute ends without secure custody and components spread among claimants and settlements.

  - `adjustTrack`: trackId=ordnance-hazard, amount=2
  - `adjustClock`: clockId=clock.ordnance-leak, amount=2
  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `setFlag`: flagId=weapons-dispersed, value=True

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## The Iron Witness

**ID:** `chapter-9-the-iron-witness`  
**Kind:** main  
**Typical duration:** two to three sessions  
**Priority:** 91  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

An automated weapons platform emerges intact, still following wartime identification codes and carrying a complete sensor record of a major current diversion.

### Director purpose

The platform can provide decisive Mooring evidence, defensive capability, or catastrophic escalation. Its target logic is understandable and bounded, not sentient by default.

### Dramatic question

Can Starfleet preserve a dangerous witness without allowing the witness to keep firing?

### Anchors

- Locations: ironside-narrows, ternion-relay
- Actors: elian-ro, tmeru, hesh-marr
- Factions: starfleet-security-liaison, starfleet-recovery-bureau

### Objectives

- Prevent the platform from engaging civilian or allied vessels.
- Determine whether its command logic can be isolated from weapons control.
- Recover the sensor record of the wartime diversion.
- Resolve custody of the platform and its data.
- Keep the platform from becoming a prize for armed claimants.

### Active pressures

- The platform recognizes some Starfleet codes and rejects others.
- Its weapons can clear a major debris corridor or destroy several rescue craft.
- Security orders the Serein to preserve it intact and secret.
- Ternion relay authentication could neutralize it but expose the relay to attack.

### Required revelations

- The platform recorded four coordinated anchor pulses bending a natural subspace fault.
- Only one anchor continued transmitting after the wartime operation.
- Its target logic can be separated from the sensor archive.
- Security knew enough to request this specific platform before its emergence was public.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Blind and board the platform while preserving its core.
- Use Ternion to issue a valid shutdown or maintenance command.
- Destroy weapons while towing the archive section away.
- Exploit the platform as temporary defense under restrictive control.
- Destroy the entire platform if control cannot be guaranteed.

### Outcome families

#### archive-preserved-weapons-disabled

The weapons are irreversibly disabled and the sensor archive enters shared, auditable custody.

  - `adjustTrack`: trackId=ordnance-hazard, amount=-2
  - `adjustTrack`: trackId=institutional-secrecy, amount=-2
  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `revealFact`: factId=fact.four-anchor-record, summary=An automated platform recorded four coordinated anchors bending a natural subspace fault; one remained active., tags=['mooring', 'technical']
  - `grantAsset`: assetId=asset.iron-witness-archive, title=Iron Witness Archive, summary=A complete sensor record of the original Mooring diversion.

#### security-platform

Security retains the platform and archive under classification, gaining a powerful finale asset at the cost of independent accountability.

  - `adjustTrack`: trackId=ordnance-hazard, amount=-1
  - `adjustTrack`: trackId=institutional-secrecy, amount=2
  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `grantAsset`: assetId=asset.security-defense-platform, title=Security Defense Platform, summary=A controlled weapons platform can defend one Black Tide site.

#### temporary-defense

The platform is repurposed as a regional defensive asset under shared control, with a continuing proliferation risk.

  - `adjustTrack`: trackId=ordnance-hazard, amount=0
  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustClock`: clockId=clock.ordnance-leak, amount=1
  - `grantAsset`: assetId=asset.shared-defense-platform, title=Shared Defense Platform, summary=A high-risk shared asset can clear or defend a route during the finale.

#### destroyed-witness

The platform is destroyed to protect lives; fragments preserve only partial evidence.

  - `adjustTrack`: trackId=ordnance-hazard, amount=-3
  - `adjustTrack`: trackId=institutional-secrecy, amount=1
  - `revealFact`: factId=fact.partial-anchor-record, summary=Fragments show multiple artificial anchor pulses but not the complete command chain., tags=['mooring', 'technical']

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## Ternion Baseline

**ID:** `chapter-10-ternion-baseline`  
**Kind:** main  
**Typical duration:** one to three sessions  
**Priority:** 87  
**Calm content:** No  
**Delegation:** Allowed

### Player-facing premise

Ternion Relay is losing the sensor baselines needed to forecast emergences. Repair requires access agreements, scarce components, and a decision about who receives warnings first.

### Director purpose

This infrastructure quest can occur early or late. It is a primary route to Anchor Seventeen and a crucial finale asset, but the relay should remain useful even if no conspiracy evidence is found.

### Dramatic question

Who gets to know where danger will appear when warning itself is strategic power?

### Anchors

- Locations: ternion-relay, freehold-nine, lydian-anchorage
- Actors: tmeru, luma-brant, nara-pell, serat-vek
- Factions: starfleet-recovery-bureau, free-salvage-coalition, cardassian-remembrance-commission

### Objectives

- Stabilize Ternion power, sensors, and timing reference.
- Establish access and authentication rules for emergence warnings.
- Calibrate the relay against current data from at least two factions.
- Determine whether hidden structured pulses are present.
- Preserve a fallback if the relay fails during Black Tide.

### Active pressures

- The relay will lose regional fidelity if repairs are delayed.
- Pell wants Starfleet priority access.
- Freehold will not supply local baselines without reciprocal warning rights.
- Cardassian archives can improve calibration but require grave and data protections.

### Required revelations

- Ternion can predict emergence windows by comparing several independent baselines.
- A repeating hidden pulse originates beyond ordinary mapped routes.
- Warning priority changes which faction can claim or rescue a wreck first.
- The hidden pulse can be triangulated toward Anchor Seventeen with one additional evidence source.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Create a federated warning network with shared authentication.
- Keep Starfleet control while publishing equal-delay public warnings.
- Give Freehold operational priority in exchange for full baseline data.
- Use Cardassian and commercial relays as redundant independent checks.
- Repair only the hardware and postpone governance, accepting future conflict.

### Outcome families

#### federated-forecast

Ternion becomes a shared warning network with redundant baselines and auditable access.

  - `adjustClock`: clockId=clock.ternion-degradation, amount=-3
  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustTrack`: trackId=current-pressure, amount=-1
  - `revealFact`: factId=fact.hidden-anchor-pulse, summary=Ternion isolates a repeating artificial pulse from an unmapped control source., tags=['mooring', 'technical']
  - `grantAsset`: assetId=asset.ternion-forecast, title=Ternion Forecast Access, summary=Reliable advance warning and route prediction for multiple emergence zones.

#### starfleet-priority-relay

The relay is repaired under Starfleet control with public delayed warnings and stronger security.

  - `adjustClock`: clockId=clock.ternion-degradation, amount=-3
  - `adjustTrack`: trackId=institutional-secrecy, amount=1
  - `adjustTrack`: trackId=claims-legitimacy, amount=0
  - `revealFact`: factId=fact.hidden-anchor-pulse, summary=Ternion isolates a repeating artificial pulse from an unmapped control source., tags=['mooring', 'technical']
  - `grantAsset`: assetId=asset.starfleet-ternion-control, title=Starfleet Ternion Control, summary=The Serein receives the best available forecast, but partners may receive delayed data.

#### local-warning-network

Freehold and Cardassian operators control a distributed warning network with limited Starfleet priority.

  - `adjustClock`: clockId=clock.ternion-degradation, amount=-2
  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustTrack`: trackId=institutional-secrecy, amount=-1
  - `grantAsset`: assetId=asset.local-warning-network, title=Local Warning Network, summary=Allied responders can self-deploy to emergences without waiting for Starfleet.

#### partial-repair

The relay remains functional but fragile; warnings are local, contested, and vulnerable to failure.

  - `adjustClock`: clockId=clock.ternion-degradation, amount=-1
  - `adjustTrack`: trackId=current-pressure, amount=0
  - `setFlag`: flagId=ternion-fragile, value=True

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## The Mooring Grave

**ID:** `chapter-11-the-mooring-grave`  
**Kind:** main  
**Typical duration:** two to three sessions  
**Priority:** 90  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Independent evidence points to a phasing debris pocket near the Memorial Field. Inside are the remains of a destroyed subspace anchor and fragments from ships torn apart when it failed.

### Director purpose

This is a technical and memorial investigation, not merely a secret base. The anchor debris intersects Cardassian dead, Starfleet records, dangerous phasing, and Ro's evidence purge.

### Dramatic question

How should command investigate a machine whose wreckage is entangled with the people it killed?

### Anchors

- Locations: mooring-grave, cardassian-memorial-field
- Actors: dr-kera-taan, serat-vek, elian-ro, tmeru
- Factions: cardassian-remembrance-commission, starfleet-security-liaison, project-mooring

### Objectives

- Locate and safely enter the phasing debris pocket.
- Separate anchor components from remains and ordinary wreckage.
- Recover design, command, or shutdown evidence.
- Prevent an evidence seizure or destructive phase collapse.
- Determine custody of the site and recovered materials.

### Active pressures

- The pocket phases unpredictably and high-power scans can collapse it.
- Cardassian remains are physically fused with anchor debris.
- Security deploys a classified retrieval team.
- The Serein can hold the pocket open only briefly without increasing Current Pressure.

### Required revelations

- The debris is one of four Project Mooring anchors.
- The anchor failed after the command network fractured, not because of enemy sabotage.
- Anchor Seventeen remained the surviving control source.
- A partial vent sequence can reduce pressure without releasing every trapped path at once.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Use low-power shuttles and Cardassian forensic teams for a gradual recovery.
- Hold the pocket open with the Serein and accept current strain.
- Allow Security to extract technical cores under shared recording.
- Collapse the pocket after recovering only remains or only critical data.
- Mark the site as a protected grave and defer intrusive recovery.

### Outcome families

#### joint-grave-recovery

Remains and technical evidence are separated under joint custody; the vent sequence survives in distributed copies.

  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustTrack`: trackId=institutional-secrecy, amount=-2
  - `adjustTrack`: trackId=current-pressure, amount=0
  - `revealFact`: factId=fact.four-mooring-anchors, summary=Project Mooring used four anchors; three failed or were destroyed, leaving Anchor Seventeen in control., tags=['mooring', 'documentary']
  - `grantAsset`: assetId=asset.partial-vent-sequence, title=Partial Vent Sequence, summary=A tested sequence can reduce Black Tide pressure without a full uncontrolled release.

#### security-core-recovery

Security extracts the intact technical core, preserving control data while limiting independent evidence.

  - `adjustTrack`: trackId=institutional-secrecy, amount=2
  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `revealFact`: factId=fact.anchor-seventeen-survives, summary=Recovered core records identify Anchor Seventeen as the surviving control platform., tags=['mooring', 'technical']
  - `grantAsset`: assetId=asset.anchor-control-fragment, title=Anchor Control Fragment, summary=A hardware fragment can authenticate against Anchor Seventeen.

#### memorial-preservation

The site is protected as a grave and only nonintrusive data is taken, preserving dignity but leaving limited technical access.

  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustTrack`: trackId=institutional-secrecy, amount=0
  - `adjustTrack`: trackId=current-pressure, amount=1
  - `revealFact`: factId=fact.anchor-grave-identity, summary=Nonintrusive scans confirm the site is a destroyed Project Mooring anchor., tags=['mooring', 'technical']

#### phase-collapse

The pocket collapses during extraction, destroying much of the site and increasing current instability.

  - `adjustTrack`: trackId=current-pressure, amount=2
  - `adjustTrack`: trackId=crew-war-strain, amount=1
  - `adjustTrack`: trackId=institutional-secrecy, amount=1
  - `setFlag`: flagId=mooring-grave-collapsed, value=True

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## Into Blackmouth

**ID:** `chapter-12-into-blackmouth`  
**Kind:** main  
**Typical duration:** two to four sessions  
**Priority:** 89  
**Calm content:** No  
**Delegation:** Allowed

### Player-facing premise

The Serein or a delegated expedition enters the deepest current junction to recover trapped signals, map compressed paths, and determine what Black Tide will release.

### Director purpose

This is an optional high-risk expedition that can provide warning, rescue Niko Saren, or worsen the finale. It should not be mandatory if other evidence routes locate Anchor Seventeen.

### Dramatic question

How much present risk is justified to learn what the future emergency will contain?

### Anchors

- Locations: blackmouth, ternion-relay, sable-verge
- Actors: niko-saren, tmeru, nira-zhren
- Factions: project-mooring, starfleet-recovery-bureau

### Objectives

- Enter and exit Blackmouth with a viable abandonment plan.
- Map at least one compressed path or identify a major queued emergence.
- Investigate a recurring Starfleet distress signal.
- Avoid triggering an uncontrolled anchor pulse.
- Return warning data or survivors to the regional network.

### Active pressures

- Normal navigation and transporter locks degrade rapidly.
- A tractored object can drag the Serein deeper into the current.
- The distress signal may originate from a Mooring support vessel.
- Every high-energy maneuver advances the Black Tide clock.

### Required revelations

- Blackmouth stores compressed paths rather than moving vessels through time.
- A large multi-ship emergence is already cohering.
- Commander Niko Saren knows a partial Anchor Seventeen shutdown sequence.
- The composition of Black Tide can be forecast from surviving convoy and battle records.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Send a shuttle or probe expedition rather than the Serein.
- Use Ternion forecasts and zh'Ren's pilot judgment for a brief crewed entry.
- Commit the Serein to recover Saren's support vessel.
- Mark and stabilize a path with tractor buoys.
- Withdraw after obtaining warning data without attempting rescue.

### Outcome families

#### warning-and-rescue

The expedition recovers Saren and a coherent Black Tide forecast while preserving a return route.

  - `adjustTrack`: trackId=current-pressure, amount=1
  - `adjustClock`: clockId=clock.black-tide, amount=1
  - `adjustTrack`: trackId=crew-war-strain, amount=1
  - `revealFact`: factId=fact.blackmouth-compressed-paths, summary=The Wake traps ships in compressed subspace paths with uneven subjective duration; it is not time travel., tags=['mooring', 'technical']
  - `revealFact`: factId=fact.saren-shutdown-sequence, summary=Former Mooring engineer Niko Saren knows a partial Anchor Seventeen shutdown sequence., tags=['mooring', 'testimony']
  - `grantAsset`: assetId=asset.black-tide-forecast, title=Black Tide Forecast, summary=The likely emergence zones and major wreck clusters are known in advance.

#### warning-only

The expedition maps the mass emergence but leaves the distress source behind.

  - `adjustTrack`: trackId=current-pressure, amount=0
  - `adjustClock`: clockId=clock.black-tide, amount=0
  - `adjustTrack`: trackId=crew-war-strain, amount=1
  - `revealFact`: factId=fact.blackmouth-compressed-paths, summary=The Wake traps ships in compressed subspace paths with uneven subjective duration; it is not time travel., tags=['mooring', 'technical']
  - `grantAsset`: assetId=asset.black-tide-forecast, title=Black Tide Forecast, summary=The likely emergence zones and major wreck clusters are known in advance.

#### stabilized-channel

A marked path provides future access but the tractor work advances current pressure.

  - `adjustTrack`: trackId=current-pressure, amount=2
  - `adjustClock`: clockId=clock.black-tide, amount=1
  - `grantAsset`: assetId=asset.blackmouth-marked-channel, title=Blackmouth Marked Channel, summary=A known route can support one rescue or anchor approach during the finale.

#### costly-extraction

The Serein escapes with partial data after severe damage or lost craft, shortening the remaining time before Black Tide.

  - `adjustTrack`: trackId=current-pressure, amount=2
  - `adjustClock`: clockId=clock.black-tide, amount=2
  - `adjustTrack`: trackId=crew-war-strain, amount=2
  - `setFlag`: flagId=serein-blackmouth-damage, value=True
  - `revealFact`: factId=fact.partial-black-tide-forecast, summary=Partial data confirms a large coherent emergence is forming at Blackmouth., tags=['mooring', 'technical']

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## Anchor Seventeen

**ID:** `chapter-13-anchor-seventeen`  
**Kind:** main  
**Typical duration:** three to five sessions  
**Priority:** 98  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

The Serein locates the surviving Project Mooring control platform embedded in a planetoid. Its damaged automation is still holding and releasing compressed routes according to fractured wartime logic.

### Director purpose

The platform is not a single switch. It can be shut down, repaired, partially vented, destroyed, or placed under shared control. The choice changes Current Pressure, warning time, evidence, and finale composition.

### Dramatic question

Who should control a machine that can save the corridor only by deciding what returns and when?

### Anchors

- Locations: anchor-seventeen, ternion-relay, blackmouth
- Actors: elian-ro, niko-saren, nara-pell, luma-brant, serat-vek
- Factions: project-mooring, starfleet-security-liaison, starfleet-recovery-bureau, free-salvage-coalition, cardassian-remembrance-commission

### Objectives

- Reach and authenticate against Anchor Seventeen.
- Prevent an uncontrolled vent or Security seizure.
- Determine the platform's current load and queued paths.
- Choose a shutdown, repair, vent, destruction, or custody plan.
- Preserve or distribute evidence sufficient for later accountability.

### Active pressures

- The platform is failing and will vent eventually even if no one intervenes.
- Ro presents sealed orders for exclusive Starfleet Security control.
- The recovery coalition cannot agree on who should operate the system.
- Every technical option sacrifices warning time, evidence, trapped ships, or long-term stability.

### Required revelations

- Project Mooring deliberately bent a natural fault to divert Dominion reinforcement routes.
- The project succeeded once, then continued operating after its network fractured.
- Security prioritized classified wrecks because Mooring records could expose unauthorized rescue tradeoffs.
- No option can return every trapped path safely; the platform must sequence, vent, abandon, or destroy some of them.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Repair the platform and place it under shared multi-key custody.
- Transfer control to Starfleet with external audit and sunset provisions.
- Use a partial vent sequence to lower pressure, then disable the platform.
- Destroy the platform and prepare for an immediate uncontrolled release.
- Leave the platform operating while improving warning and local response capacity.

### Outcome families

#### shared-multikey-control

Anchor Seventeen is stabilized under shared custody with separate operational, forensic, and emergency keys.

  - `adjustTrack`: trackId=current-pressure, amount=-2
  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustTrack`: trackId=institutional-secrecy, amount=-2
  - `setFlag`: flagId=anchor-shared-control, value=True
  - `grantAsset`: assetId=asset.anchor-control-codes, title=Anchor Control Codes, summary=Shared keys can sequence and redirect portions of Black Tide.
  - `revealFact`: factId=fact.project-mooring-full-truth, summary=Project Mooring bent a natural fault with four anchors; fractured shutdown and concealment created the postwar Wake., tags=['mooring', 'accountability']

#### audited-starfleet-control

Starfleet controls the platform under documented review, reducing immediate danger while preserving central authority.

  - `adjustTrack`: trackId=current-pressure, amount=-2
  - `adjustTrack`: trackId=claims-legitimacy, amount=0
  - `adjustTrack`: trackId=institutional-secrecy, amount=1
  - `setFlag`: flagId=anchor-starfleet-control, value=True
  - `grantAsset`: assetId=asset.starfleet-anchor-control, title=Starfleet Anchor Control, summary=The Serein can request sequenced releases and route stabilization.

#### partial-vent-and-disable

A controlled vent reduces stored pressure and the platform is then disabled, preserving no long-term control system.

  - `adjustTrack`: trackId=current-pressure, amount=-1
  - `adjustClock`: clockId=clock.black-tide, amount=1
  - `adjustTrack`: trackId=institutional-secrecy, amount=-1
  - `setFlag`: flagId=anchor-disabled-after-vent, value=True
  - `grantAsset`: assetId=asset.vent-warning, title=Vent Warning, summary=The timing and first zones of Black Tide are known.

#### platform-destroyed

The platform is destroyed to prevent future control, triggering an immediate and less predictable mass release.

  - `adjustTrack`: trackId=current-pressure, amount=2
  - `adjustClock`: clockId=clock.black-tide, amount=3
  - `adjustTrack`: trackId=institutional-secrecy, amount=1
  - `setFlag`: flagId=anchor-destroyed, value=True

#### platform-left-operating

The player refuses irreversible intervention and leaves the damaged platform running while building external response capacity.

  - `adjustTrack`: trackId=current-pressure, amount=0
  - `adjustClock`: clockId=clock.black-tide, amount=1
  - `setFlag`: flagId=anchor-left-operating, value=True
  - `grantAsset`: assetId=asset.anchor-observation-feed, title=Anchor Observation Feed, summary=Ternion receives limited telemetry but no command authority.

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## Black Tide

**ID:** `chapter-14-black-tide`  
**Kind:** finale  
**Typical duration:** three to six sessions  
**Priority:** 100  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

A mass emergence unfolds across the Vanta Wake: survivor ships, military wrecks, blocked routes, claim fleets, and failing anchor systems appear at several locations at once.

### Director purpose

Assemble the finale from actual unresolved state. The player cannot personally command every site; delegated allies act according to earned assets, trust, charter rules, and capacity. Do not spawn pressures that have no causal parent.

### Dramatic question

Can the region cooperate when every system rewards taking control of the crisis alone?

### Anchors

- Locations: blackmouth, wreckfall-alpha, lydian-anchorage, freehold-nine, cardassian-memorial-field, ternion-relay, ironside-narrows
- Actors: nara-pell, luma-brant, serat-vek, broker-hegg, elian-ro, ila-varen, maia-rinn, pera-voss
- Factions: starfleet-recovery-bureau, free-salvage-coalition, cardassian-remembrance-commission, hegg-claims-consortium, starfleet-security-liaison, lydian-civil-authority

### Objectives

- Protect inhabited facilities and civilian routes from the mass emergence.
- Triage and distribute survivor recovery across available medical and housing assets.
- Secure or neutralize actual unresolved weapons clusters.
- Use, protect, or abandon Anchor Seventeen according to its established disposition.
- Preserve enough evidence and public communication for legitimate post-crisis settlement.
- Bring the Serein and its crew through the operation or conduct an orderly sacrifice and evacuation.

### Active pressures

- Several emergence zones activate simultaneously.
- The Serein can tow one major hull and directly command one foreground site.
- Allied responders follow the charter, relationships, and capabilities established earlier.
- Lydian Anchorage or Freehold Nine may become a direct impact zone depending on unresolved routes.
- Security may attempt exclusive control of Mooring evidence or Anchor Seventeen.
- Crew fatigue and Lorne's medical status affect command continuity.

### Required revelations

- The final emergence composition is the accumulated result of documented missing ships, anchor state, and earlier ordnance choices.
- No single tactical victory resolves the humanitarian, legal, and institutional fronts.
- Delegated actors can succeed independently if they possess earned authority and assets.
- The public record of Project Mooring depends on evidence that survives outside one institution.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Command from the Serein while delegating zones through the recovery compact.
- Use Anchor Seventeen to sequence releases toward prepared sites.
- Sacrifice or cut loose tractored wrecks to answer larger distress calls.
- Prioritize inhabited facilities, survivor vessels, ordnance, or evidence according to command doctrine.
- Withdraw from untenable zones and preserve a coherent evacuation corridor.

### Outcome families

#### safe-channel

The mass emergence is contained, survivor care remains functional, the current reaches a stable state, and a legitimate recovery compact survives with evidence of Project Mooring.

  - `adjustTrack`: trackId=current-pressure, amount=-3
  - `adjustTrack`: trackId=survivor-load, amount=-2
  - `adjustTrack`: trackId=ordnance-hazard, amount=-2
  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `adjustTrack`: trackId=institutional-secrecy, amount=-2
  - `setFlag`: flagId=ending.safe-channel, value=True
  - `grantAsset`: assetId=asset.black-tide-survivor-record, title=Black Tide Survivor Record, summary=A distributed public and forensic record of the final emergence.

#### recovery-state

Starfleet stabilizes the Wake and secures major hazards, but centralized custody marginalizes local responders and returned persons.

  - `adjustTrack`: trackId=current-pressure, amount=-2
  - `adjustTrack`: trackId=ordnance-hazard, amount=-2
  - `adjustTrack`: trackId=claims-legitimacy, amount=-2
  - `adjustTrack`: trackId=institutional-secrecy, amount=2
  - `setFlag`: flagId=ending.recovery-state, value=True

#### free-wake

Local actors govern recovery and resist institutional seizure, but weapons, claims, or unstable current infrastructure remain incompletely controlled.

  - `adjustTrack`: trackId=current-pressure, amount=-1
  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustTrack`: trackId=ordnance-hazard, amount=1
  - `adjustTrack`: trackId=institutional-secrecy, amount=-2
  - `setFlag`: flagId=ending.free-wake, value=True

#### cleared-by-fire

Wrecks and anchor systems are destroyed to prevent catastrophic impact; immediate casualties may be limited, but survivors, evidence, remains, and technical knowledge are lost.

  - `adjustTrack`: trackId=current-pressure, amount=-2
  - `adjustTrack`: trackId=ordnance-hazard, amount=-3
  - `adjustTrack`: trackId=crew-war-strain, amount=2
  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `setFlag`: flagId=ending.cleared-by-fire, value=True

#### black-tide-failure

The mass emergence overwhelms the regional system, destroying or forcing evacuation of a major hub and leaving significant rescue zones abandoned.

  - `adjustTrack`: trackId=survivor-load, amount=3
  - `adjustTrack`: trackId=ordnance-hazard, amount=2
  - `adjustTrack`: trackId=claims-legitimacy, amount=-3
  - `adjustTrack`: trackId=crew-war-strain, amount=2
  - `setFlag`: flagId=ending.black-tide, value=True

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## The Names Returned

**ID:** `epilogue-the-names-returned`  
**Kind:** epilogue  
**Typical duration:** one to three sessions  
**Priority:** 97  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

After Black Tide, the Serein participates in survivor accounting, legal settlement, Project Mooring review, memorial custody, and a final command determination for Captain Lorne and the player.

### Director purpose

The epilogue assembles actual campaign state rather than choosing a fixed branch. Public narrative depends on surviving evidence; command status follows medical reality, lawful conduct, crew confidence, and Starfleet review.

### Dramatic question

What does restoration require when survival has changed every claim to the past?

### Anchors

- Locations: lydian-anchorage, quiet-orbit, freehold-nine, cardassian-memorial-field
- Actors: nara-pell, luma-brant, serat-vek, broker-hegg, elian-ro, ila-varen, maia-rinn, magistrate-orrel
- Factions: starfleet-recovery-bureau, free-salvage-coalition, cardassian-remembrance-commission, hegg-claims-consortium, lydian-civil-authority

### Objectives

- Publish or seal a final survivor and casualty accounting.
- Resolve the long-term recovery charter and returned-person standing.
- Determine the public and institutional account of Project Mooring.
- Set memorial and evidence custody for unresolved wrecks.
- Complete Lorne's medical and command review and the player's assignment outcome.
- Record persistent assets, obligations, injuries, and relationships for future play.

### Active pressures

- Different factions want incompatible public narratives.
- Some survivors need privacy while accountability requires evidence.
- Starfleet may prefer a narrow technical failure account.
- Lorne's identity as captain and the player's operational authority can no longer remain provisional.

### Required revelations

- No ending restores the pre-Wake legal and emotional order exactly.
- A stable recovery regime depends on participation, not only efficient operations.
- Project Mooring culpability includes emergency authorization, poor shutdown planning, and later concealment rather than a single villain.
- The crew's command culture has been shaped by how it treated lives, records, and limits.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Support a public multi-party inquiry and distributed archive.
- Accept a limited classified settlement to preserve operational stability.
- Center survivor privacy and local autonomy over institutional disclosure.
- Negotiate Lorne's return, retirement, advisory role, or shared transition.
- Accept or contest the player's confirmation, reassignment, or inquiry outcome.

### Outcome families

#### accountable-settlement

A broad settlement preserves survivor rights, a workable recovery compact, and a credible public Mooring record.

  - `setFlag`: flagId=black-current-complete, value=True
  - `setFlag`: flagId=ending.accountable-settlement, value=True
  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustTrack`: trackId=institutional-secrecy, amount=-2

#### security-settlement

The corridor stabilizes under Starfleet authority while much Mooring evidence remains classified and local standing narrows.

  - `setFlag`: flagId=black-current-complete, value=True
  - `setFlag`: flagId=ending.security-settlement, value=True
  - `adjustTrack`: trackId=institutional-secrecy, amount=2

#### autonomy-settlement

Local responders, returned persons, and Cardassian families retain broad control, with uneven Federation oversight and continuing risk.

  - `setFlag`: flagId=black-current-complete, value=True
  - `setFlag`: flagId=ending.autonomy-settlement, value=True
  - `adjustTrack`: trackId=claims-legitimacy, amount=1

#### fractured-accounting

The parties preserve separate records and institutions; the crisis ends operationally without a shared account of responsibility.

  - `setFlag`: flagId=black-current-complete, value=True
  - `setFlag`: flagId=ending.fractured-accounting, value=True
  - `adjustTrack`: trackId=claims-legitimacy, amount=-1

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.
