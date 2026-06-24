# Prelude: Wreckfall

## Purpose

This is the authored tactical companion for `prelude-wreckfall`. The mission graph provides phases and eligible decision pauses while preserving freeform resolution. If the player bypasses a phase, transfer only the functions and facts that can move causally.

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

# Tactical graph phases


## Phase: Recovery Posture

**ID:** `phase.recovery-posture`  
**Location:** `wreckfall-alpha`

The newly promoted XO reviews the Serein's recovery configuration and Captain Lorne's standing priorities during an active Freehold salvage operation.

### Objectives

- Assume XO authority
- Review technical and medical limits
- Set a first-response doctrine

### Pressures

- The player has been aboard only three days
- Freehold crews are already inside the zone
- The Serein cannot tow several major hulls at once

### Retrieved Director cards

- `card.campaign.promise`
- `card.ship.constraints`
- `card.actor.pera-voss`

### Exit behavior

- {"toPhaseId": "phase.triple-emergence", "condition": {"type": "eventOccurred", "eventType": "mission.triple-emergence"}}

## Phase: Three Ships Return

**ID:** `phase.triple-emergence`  
**Location:** `wreckfall-alpha`

A hospital transport, a weapons carrier, and a powered Starfleet hull emerge inside the salvage operation.

### Objectives

- Identify immediate life signs
- Prevent collision and detonation
- Coordinate Starfleet and civilian craft

### Pressures

- Hospital hull breakup
- Unstable torpedoes
- Obsolete Starfleet challenge
- Conflicting claim beacons

### Retrieved Director cards

- `card.director.emergence-causality`
- `card.director.claims-are-multidomain`

### Exit behavior

- {"toPhaseId": "phase.command-impact", "condition": {"type": "eventOccurred", "eventType": "mission.current-surge"}}

## Phase: The Captain Falls

**ID:** `phase.command-impact`  
**Location:** `wreckfall-alpha`

A current surge throws the Serein against a tractored wreck. Lorne is injured and the player must take the conn while the site remains active.

### Objectives

- Stabilize the Serein
- Transfer Lorne to medical care
- Assume emergency command

### Pressures

- Tractor damage
- Lorne's condition
- The three emergencies continue
- The crew is awaiting a clear command intent

### Retrieved Director cards

- `card.command.acting-captain`
- `card.crew.anika-lorne`
- `card.crew.lio-sen`

### Exit behavior

- {"toPhaseId": "phase.triage-the-zone", "condition": {"type": "sceneResolved"}}

## Phase: Triage the Zone

**ID:** `phase.triage-the-zone`  
**Location:** `wreckfall-alpha`

The player allocates the Serein, shuttles, transporters, tractor buoys, and civilian responders across the three wrecks.

### Objectives

- Commit rescue priorities
- Choose what to delegate
- Protect Lydian traffic

### Pressures

- One major tow limit
- Transporter cycling
- Uncertain shielded compartments
- Freehold crews may act independently

### Retrieved Director cards

- `card.command.bearing-moments`
- `card.director.delegation`
- `card.director.failure-forward`

### Exit behavior

- {"toPhaseId": "phase.acting-command", "condition": {"type": "decisionCommitted", "decisionPointId": "decision.opening-doctrine"}}

## Phase: Acting Command

**ID:** `phase.acting-command`  
**Location:** `lydian-anchorage`

With the immediate emergence resolved or abandoned, Starfleet confirms the player as Acting Captain and regional recovery commander.

### Objectives

- Issue standing recovery orders
- Set Lorne's medical-command boundary
- Choose the first open-world priority

### Pressures

- No available order satisfies every faction
- The crew is assessing the new command
- More ships remain inside the current

### Retrieved Director cards

- `card.command.player-agency`
- `card.director.open-world`
- `card.crew.anika-lorne.director`

### Exit behavior

- {"terminal": true, "outcomeEvent": "quest.prelude-wreckfall.resolved"}


# Command decision points


## Decision point: Opening Recovery Doctrine

**ID:** `decision.opening-doctrine`  
**Phase:** `phase.triage-the-zone`  
**Pause type:** commandDecision

How will the Serein allocate rescue, towing, weapons control, and civilian delegation across the three emerging ships?

### Stakes

- Hospital patients
- Possible Starfleet survivors
- Live torpedoes
- Serein condition
- Freehold relations

### Consequence domains

- ship
- crew
- worldState
- commandStyle

The player may answer freeform. Any prewritten options are illustrative only.

## Decision point: Captain Lorne Boundary

**ID:** `decision.lorne-boundary`  
**Phase:** `phase.acting-command`  
**Pause type:** commandDecision

What access, briefing role, and command boundary will apply while Lorne remains in sickbay?

### Stakes

- Medical recovery
- Crew confidence
- Lawful succession

### Consequence domains

- relationships
- commandCulture
- crew

The player may answer freeform. Any prewritten options are illustrative only.


# Graph completion

- Completion event: `quest.prelude-wreckfall.resolved`
- Requires committed outcome: True
- Valid terminal phases: phase.acting-command
- Single failed check cannot end the mission: True
- Refusal and withdrawal remain allowed.
