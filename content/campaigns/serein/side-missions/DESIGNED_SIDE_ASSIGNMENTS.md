# The Black Current Designed Side Assignments

## Use

These assignments deepen the open world, create assets and precedents, and give the crew and region room to exist outside the Mooring investigation. They are not mandatory intervals. Calm assignments should remain calm unless an established consequence reaches them.

Delegated assignments resolve from the assigned responder's capability, authority, trust, and instructions. Delegation should produce a narrower independent record rather than generic success or failure.

## Hull 9-Delta

**ID:** `side-hull-9-delta`  
**Kind:** side  
**Typical duration:** one to two sessions  
**Priority:** 64  
**Calm content:** No  
**Delegation:** Allowed

### Player-facing premise

A composite wreck formed from sections of three ships emerges with different owners, memorial claims, and evidence histories fused into one unstable hull.

### Director purpose

The assignment is a compact expression of the campaign: rescue, identity, title, remains, and technical reality cannot be separated cleanly.

### Dramatic question

Can command divide a wreck without pretending its histories were ever separate?

### Anchors

- Locations: wreckfall-alpha, sable-exchange
- Actors: broker-hegg, dr-kera-taan
- Factions: hegg-claims-consortium, cardassian-remembrance-commission

### Objectives

- Stabilize the composite hull.
- Identify the three source vessels.
- Resolve remains and evidence custody.
- Set a practical title disposition.

### Active pressures

- Cutting one section may destabilize the others.
- Each claimant wants priority access.
- One section contains a possible survivor space.
- The composite structure confuses registries and automated claims.

### Required revelations

- The current can fuse adjacent compressed paths during release.
- Each source vessel retains distinct legal and memorial history.
- One source section carries a useful Mooring-era alloy trace.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Separate the sections physically.
- Treat the composite as a new jointly held object.
- Prioritize survivor access, then defer title.
- Place the whole wreck in neutral escrow.

### Outcome families

#### joint-composite-custody

The wreck is stabilized under joint custody with separate records for each source vessel.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `grantAsset`: assetId=asset.composite-hull-method, title=Composite Hull Method, summary=A forensic procedure for future fused wrecks.

#### divided-hull

The sections are physically separated with some damage and evidence loss.

  - `adjustTrack`: trackId=claims-legitimacy, amount=0
  - `adjustTrack`: trackId=crew-war-strain, amount=1

#### priority-claim

One claimant receives the whole wreck under a defensible legal theory, alienating the others.

  - `adjustTrack`: trackId=claims-legitimacy, amount=-1

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## Dead Man's Pay

**ID:** `side-dead-mans-pay`  
**Kind:** side  
**Typical duration:** one session  
**Priority:** 57  
**Calm content:** Yes  
**Delegation:** Allowed

### Player-facing premise

A returned convoy crew learns that its wartime hazard compensation was paid to families and spent on a colony relief fund. Restoring the money would bankrupt the fund.

### Director purpose

This is a legal, economic, and personal problem rather than fraud. It should remain calm unless prior public strain directly creates confrontation.

### Dramatic question

Can a benefit paid for death be owed again when the dead return alive?

### Anchors

- Locations: lydian-anchorage, sable-exchange
- Actors: magistrate-orrel, maia-rinn, broker-hegg
- Factions: lydian-civil-authority, hegg-claims-consortium

### Objectives

- Verify the compensation and spending records.
- Protect crew and recipient families from coercion.
- Create a repayment, replacement, or nonfinancial remedy.
- Set precedent for future returned benefits.

### Active pressures

- The convoy crew urgently needs housing and pay.
- Recipient families acted in good faith.
- The colony fund supports vulnerable residents.
- A simple clawback is lawful but destructive.

### Required revelations

- No party committed fraud.
- Starfleet regulations did not anticipate return after valid death certification.
- Service credit and housing may matter more than immediate cash to some crew.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Create new compensation without clawback.
- Offer service credit, housing, and staged payment.
- Use public recovery funds or Hegg financing.
- Enforce strict repayment and accept consequences.

### Outcome families

#### replacement-benefit

Returnees receive new benefits while prior good-faith payments remain intact.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustTrack`: trackId=survivor-load, amount=-1
  - `grantAsset`: assetId=asset.returnee-benefit-precedent, title=Returnee Benefit Precedent, summary=Future pay and death-benefit cases resolve faster.

#### staged-settlement

A mixed settlement preserves the fund but delays full compensation.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1

#### clawback

The original payments are recovered, satisfying formal accounting while damaging public trust.

  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `adjustClock`: clockId=clock.returned-persons-mobilization, amount=1

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## The Last Message

**ID:** `side-the-last-message`  
**Kind:** side  
**Typical duration:** one session  
**Priority:** 56  
**Calm content:** Yes  
**Delegation:** Allowed

### Player-facing premise

A damaged recorder can be stabilized long enough to transmit only one data block at a time: personal messages, navigation evidence, casualty records, or technical logs.

### Director purpose

The assignment should focus on prioritization and consent. Multiple data blocks can sometimes be recovered through ingenuity, but not without cost or uncertainty.

### Dramatic question

What should be heard first when every message was written as if it might be the last?

### Anchors

- Locations: quiet-orbit, wreckfall-alpha
- Actors: cpo-vek, tmeru
- Factions: starfleet-recovery-bureau

### Objectives

- Stabilize the recorder.
- Identify available data blocks and affected people.
- Choose or expand the recovery sequence.
- Deliver recovered messages responsibly.

### Active pressures

- Each activation degrades the recorder.
- Families, investigators, and engineers request different priorities.
- Some messages contain private or potentially compromising material.

### Required revelations

- The recorder contains no campaign-critical unique clue.
- Personal messages can materially change survivor and family relationships.
- Technical logs may improve current forecasting or recovery safety.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Prioritize personal messages.
- Prioritize safety or navigation data.
- Attempt parallel recovery with increased loss risk.
- Let affected families or crew representatives choose.

### Outcome families

#### messages-first

Personal transmissions are recovered and delivered with consent safeguards.

  - `adjustTrack`: trackId=crew-war-strain, amount=-1
  - `grantAsset`: assetId=asset.family-goodwill, title=Family Goodwill, summary=Families cooperate with later identification work.

#### technical-first

Operational data improves safety while some personal messages are lost.

  - `adjustTrack`: trackId=current-pressure, amount=-1
  - `adjustTrack`: trackId=crew-war-strain, amount=1

#### partial-mosaic

A risky parallel recovery preserves fragments of several blocks with ambiguity.

  - `grantAsset`: assetId=asset.recorder-mosaic, title=Recorder Mosaic, summary=Partial personal and technical records can support later scenes.

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## Children of the Convoy

**ID:** `side-children-of-the-convoy`  
**Kind:** side  
**Typical duration:** one to two sessions  
**Priority:** 62  
**Calm content:** Yes  
**Delegation:** Player-led

### Player-facing premise

Several adolescents born aboard a transport trapped in the Wake have no recognized citizenship, planetary records, or lawful guardians outside the ship.

### Director purpose

Treat the adolescents as people with views and relationships, not merely legal puzzles. The quest can establish returned-person citizenship and education infrastructure.

### Dramatic question

What does belonging mean for people born in a place the law says never existed?

### Anchors

- Locations: sable-verge, lydian-anchorage
- Actors: maia-rinn, magistrate-orrel, davi-leth
- Factions: lydian-civil-authority, starfleet-recovery-bureau

### Objectives

- Establish immediate protection and guardianship.
- Record identity without erasing shipboard family structures.
- Determine citizenship or residency options.
- Provide education and medical continuity.

### Active pressures

- Several governments claim or reject responsibility.
- The adolescents disagree about where they belong.
- Media attention threatens privacy.
- Shipboard guardians lack formal recognition.

### Required revelations

- Their births and development are medically ordinary and internally documented.
- Citizenship law can recognize shipboard birth or parental status through several routes.
- Some want Starfleet careers; others distrust all outside authority.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Recognize shipboard birth registration.
- Grant Federation protected-person status.
- Offer Lydian residency with later choice.
- Let the adolescents form individual petitions with independent advocates.

### Outcome families

#### recognized-shipboard-citizenship

Shipboard records and family structures receive legal recognition with later individual choice.

  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `setFlag`: flagId=returned-persons-recognized, value=True
  - `grantAsset`: assetId=asset.returnee-education-network, title=Returnee Education Network, summary=Education and guardianship support reduces survivor strain.

#### protected-person-status

The adolescents receive Federation protection but remain in a temporary legal category.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustTrack`: trackId=survivor-load, amount=-1

#### fragmented-placement

They are distributed among several jurisdictions, meeting immediate needs while breaking shipboard community ties.

  - `adjustTrack`: trackId=survivor-load, amount=-1
  - `adjustTrack`: trackId=crew-war-strain, amount=1
  - `adjustClock`: clockId=clock.returned-persons-mobilization, amount=1

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## No Clean Salvage

**ID:** `side-no-clean-salvage`  
**Kind:** side  
**Typical duration:** one to two sessions  
**Priority:** 65  
**Calm content:** Yes  
**Delegation:** Player-led

### Player-facing premise

Enor needs a recovered power core to repair the Serein, but removing it will erase evidence from a disputed wreck and compromise a memorial claim.

### Director purpose

A ship technical-debt assignment with no perfect answer. Alternative repairs should exist but consume time, favors, or capability.

### Dramatic question

What may the living take from the dead when the ship must remain able to save others?

### Anchors

- Locations: cardassian-memorial-field, quiet-orbit
- Actors: ral-enor, dr-kera-taan
- Factions: cardassian-remembrance-commission

### Objectives

- Assess the Serein repair need.
- Determine evidentiary and memorial cost of removal.
- Find, negotiate, or fabricate alternatives.
- Commit the repair and custody record.

### Active pressures

- Tractor reliability will worsen without the core.
- The wreck contains unresolved remains and engineering evidence.
- Fabricating a replacement will consume scarce feedstock and time.
- Enor believes future rescues justify the salvage.

### Required revelations

- The core is replaceable, but not quickly.
- Removing it will destroy some contextual evidence, not all identity evidence.
- A partial salvage can preserve more of the site at reduced repair value.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Take the core under joint documentation.
- Fabricate a replacement at Quiet Orbit.
- Trade for a Freehold or Hegg component.
- Accept restricted tractor capability until later.

### Outcome families

#### documented-partial-salvage

A limited removal repairs the worst tractor fault while preserving most evidence and memorial context.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `setFlag`: flagId=serein-tractor-repair-partial, value=True
  - `grantAsset`: assetId=asset.tractor-reliability, title=Improved Tractor Reliability, summary=One major tow can be sustained with lower failure risk.

#### full-core-salvage

The Serein receives a complete repair at the cost of evidence and family anger.

  - `setFlag`: flagId=serein-tractor-repair-full, value=True
  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `adjustTrack`: trackId=institutional-secrecy, amount=1

#### fabricated-replacement

The ship preserves the wreck but spends feedstock and time on a replacement.

  - `setFlag`: flagId=serein-tractor-repair-full, value=True
  - `adjustClock`: clockId=clock.black-tide, amount=1
  - `grantAsset`: assetId=asset.memorial-goodwill, title=Memorial Goodwill, summary=Cardassian families support later joint recovery.

#### repair-deferred

The evidence remains intact, but the Serein enters later operations with tractor restrictions.

  - `setFlag`: flagId=serein-tractor-restricted, value=True
  - `adjustTrack`: trackId=current-pressure, amount=0

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## The Cardassian Bell

**ID:** `side-the-cardassian-bell`  
**Kind:** side  
**Typical duration:** one session  
**Priority:** 58  
**Calm content:** Yes  
**Delegation:** Allowed

### Player-facing premise

Families ask Starfleet to help build a memorial buoy that will sound a subspace tone when identified Cardassian wrecks pass through the current. Security requests a covert scan of the same hulls.

### Director purpose

A memorial assignment with a real custody conflict. It should not secretly reveal a superweapon; the point is whether memorial infrastructure can coexist with transparent forensic access.

### Dramatic question

Can a memorial remain a memorial when another institution treats it as a sensor platform?

### Anchors

- Locations: cardassian-memorial-field, ternion-relay
- Actors: serat-vek, dr-kera-taan, elian-ro
- Factions: cardassian-remembrance-commission, starfleet-security-liaison

### Objectives

- Construct and calibrate the memorial buoy.
- Set privacy and scan boundaries.
- Identify initial hulls for the memorial registry.
- Resolve or refuse Security's covert request.

### Active pressures

- Families require trust in the buoy's purpose.
- Security cites legitimate weapons risk.
- Ternion access can make the memorial more effective and more surveillant.

### Required revelations

- The buoy can distinguish identity markers without recording full tactical data.
- A covert scan is unnecessary if Security states specific hazard criteria.
- The memorial network can support later identification during Black Tide.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Build a privacy-preserving memorial sensor.
- Permit a disclosed limited hazard scan.
- Allow covert Security access.
- Keep the buoy purely ceremonial.

### Outcome families

#### protected-memorial-network

The buoy identifies wrecks and remains under enforceable privacy rules.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `grantAsset`: assetId=asset.cardassian-bell-network, title=Cardassian Bell Network, summary=Memorial buoys identify Cardassian hulls during mass emergence.

#### transparent-dual-use

The buoy provides disclosed hazard data and memorial identification under joint oversight.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `adjustTrack`: trackId=ordnance-hazard, amount=-1
  - `grantAsset`: assetId=asset.memorial-hazard-network, title=Memorial Hazard Network, summary=Identification and limited hazard data support recovery.

#### covert-security-access

Security gains hidden sensor access; the memorial works until the covert function is exposed or remains undiscovered.

  - `adjustTrack`: trackId=institutional-secrecy, amount=2
  - `adjustTrack`: trackId=claims-legitimacy, amount=-1

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## A Captain Out of Time

**ID:** `side-a-captain-out-of-time`  
**Kind:** personal  
**Typical duration:** one to two sessions  
**Priority:** 63  
**Calm content:** Yes  
**Delegation:** Player-led

### Player-facing premise

Commander Ila Varen seeks restoration of the Velorum, her billet, and command authority after Starfleet has already appointed successors and reassigned the ship's registry.

### Director purpose

This is a recurring command and identity assignment. It can be resolved through reinstatement, new command, advisory authority, retirement, or continued dispute; Varen retains agency.

### Dramatic question

Does surviving preserve command, or only the right to be heard when command has moved on?

### Anchors

- Locations: sable-verge, lydian-anchorage, quiet-orbit
- Actors: ila-varen, nara-pell, magistrate-orrel
- Factions: starfleet-recovery-bureau

### Objectives

- Review Varen's commission, orders, medical state, and crew wishes.
- Assess the Velorum's condition and registry status.
- Protect current successors from summary displacement.
- Establish a lawful command outcome.

### Active pressures

- Varen is medically fit and experienced.
- The Velorum crew expects continuity.
- Current successors acted lawfully in her absence.
- Starfleet fears precedent across many returned officers.

### Required revelations

- A death declaration ended pay and assignment administration, not personhood or commission automatically.
- Varen can accept a different command without conceding that she was never captain.
- Some Velorum crew do not want to resume Starfleet service.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Restore Varen after a staged review.
- Give Varen a new recovery command.
- Offer advisory or temporary joint authority.
- Deny restoration with appeal rights.
- Support retirement or civilian leadership if Varen chooses it.

### Outcome families

#### new-recovery-command

Varen receives command of a recovery flotilla rather than displacing an existing captain.

  - `adjustTrack`: trackId=claims-legitimacy, amount=2
  - `grantAsset`: assetId=asset.velorum-recovery-flotilla, title=Velorum Recovery Flotilla, summary=Varen and selected crew can command a delegated finale zone.

#### velorum-restored

Varen regains the Velorum after formal review, creating a strong Starfleet asset and difficult successor consequences.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `grantAsset`: assetId=asset.uss-velorum, title=U.S.S. Velorum, summary=A returned Starfleet ship can support recovery and command coordination.

#### advisory-transition

Varen accepts limited authority and a staged future assignment while remaining a public returnee advocate.

  - `adjustTrack`: trackId=claims-legitimacy, amount=1
  - `grantAsset`: assetId=asset.varen-advisory, title=Varen Advisory Authority, summary=Varen can coordinate returned Starfleet crews without full ship command.

#### restoration-denied

Starfleet denies restoration; Varen pursues appeal or joins the Returned Persons Assembly.

  - `adjustTrack`: trackId=claims-legitimacy, amount=-1
  - `adjustClock`: clockId=clock.returned-persons-mobilization, amount=2

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## Quiet Water

**ID:** `side-quiet-water`  
**Kind:** side  
**Typical duration:** one session  
**Priority:** 55  
**Calm content:** Yes  
**Delegation:** Allowed

### Player-facing premise

At Quiet Orbit, the Serein conducts controlled current measurements, calibrates equipment, and gives the crew a rare period of ordinary scientific and maintenance work.

### Director purpose

This assignment should remain calm unless earlier committed damage, a known infiltrator, or a direct current consequence makes danger causal. Do not convert it into a surprise Mooring attack.

### Dramatic question

What does responsible command preserve when there is no immediate emergency?

### Anchors

- Locations: quiet-orbit
- Actors: tmeru, nira-zhren, ral-enor, cpo-vek
- Factions: starfleet-recovery-bureau

### Objectives

- Calibrate sensors and pilot models.
- Repair or inspect recovery equipment.
- Rest departments and review workload.
- Record a clean scientific baseline.

### Active pressures

- Every hour spent here is an hour not spent at another request.
- Some officers resist rest while the Wake remains active.
- The player must decide what work may be deferred.

### Required revelations

- A calm baseline improves later forecasts.
- Crew strain is operational state, not flavor.
- No campaign-secret revelation is required.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Conduct a full stand-down and maintenance period.
- Rotate departments through rest and calibration.
- Delegate routine measurements while handling shipboard conversations.
- Cut the assignment short to answer another request.

### Outcome families

#### full-calibration-and-rest

The ship gains a clean baseline, reduced fatigue, and improved technical reliability.

  - `adjustTrack`: trackId=crew-war-strain, amount=-2
  - `adjustTrack`: trackId=current-pressure, amount=-1
  - `grantAsset`: assetId=asset.quiet-water-baseline, title=Quiet Water Baseline, summary=A clean comparison improves future current forecasts.

#### rotating-standdown

Most departments receive meaningful rest while essential patrol work continues.

  - `adjustTrack`: trackId=crew-war-strain, amount=-1
  - `grantAsset`: assetId=asset.maintained-recovery-gear, title=Maintained Recovery Gear, summary=Recovery shuttles and tractor buoys begin the next operation ready.

#### abbreviated-calibration

The Serein gains partial data and little rest before returning to active work.

  - `grantAsset`: assetId=asset.partial-quiet-baseline, title=Partial Quiet Baseline, summary=A limited calibration can support one later technical inference.

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.

## Deck Nine

**ID:** `side-deck-nine`  
**Kind:** personal  
**Typical duration:** one to two sessions  
**Priority:** 60  
**Calm content:** Yes  
**Delegation:** Player-led

### Player-facing premise

A section of a wartime ship once crewed by several Serein personnel emerges, forcing private memory and formal evidence duty into the same recovery operation.

### Director purpose

Use actual established crew histories and do not invent surprise relatives without groundwork. The wreck can matter even if it contains no secret Mooring clue.

### Dramatic question

Can officers investigate their own dead without pretending they are unaffected or incapable?

### Anchors

- Locations: wreckfall-alpha, quiet-orbit
- Actors: cpo-vek, samir-holt, anika-lorne
- Factions: starfleet-recovery-bureau

### Objectives

- Identify the wreck section and affected crew.
- Choose assignments and support without stripping officers of agency.
- Recover remains, records, or personal effects.
- Preserve an auditable evidence chain.

### Active pressures

- Affected officers may be uniquely qualified to recognize the site.
- Removing them can feel protective or punitive.
- Operational urgency limits private processing.
- Some records may implicate wartime routing decisions.

### Required revelations

- Several Serein officers served with people aboard the wreck.
- Holt recognizes a redacted convoy routing signature.
- Lorne made a difficult rescue decision connected to the ship, if prior reveal gates support it.

Each revelation permits alternate causal routes. No anticipated scene is mandatory if the player obtains the fact through another established source.

### Valid approaches

- Reassign affected officers with consent.
- Retain them with explicit support and review.
- Delegate the physical recovery while they advise remotely.
- Defer nonurgent evidence work for a memorial period.

### Outcome families

#### supported-recovery

Affected crew participate under a deliberate support and rotation plan; records and remains are preserved.

  - `adjustTrack`: trackId=crew-war-strain, amount=-1
  - `revealFact`: factId=fact.holt-redacted-routing, summary=Holt recognizes a classified convoy routing signature connected to later Mooring records., tags=['mooring', 'documentary']

#### protective-reassignment

Command removes affected officers from the scene, preserving immediate function but leaving mixed feelings and some lost recognition.

  - `adjustTrack`: trackId=crew-war-strain, amount=0
  - `setFlag`: flagId=deck-nine-reassigned, value=True

#### mission-before-memory

The operation proceeds at maximum speed with little accommodation, gaining evidence at the cost of crew strain.

  - `adjustTrack`: trackId=crew-war-strain, amount=2
  - `revealFact`: factId=fact.holt-redacted-routing, summary=Holt recognizes a classified convoy routing signature connected to later Mooring records., tags=['mooring', 'documentary']

### Failure-forward handling

A failed action changes capacity, elapsed time, custody, evidence quality, route access, injuries, ship strain, faction leverage, or the shape of the next choice. It never erases the only route to a campaign-critical fact. Refusal, delay, delegation, withdrawal, and abandonment remain consequential command acts.
