# Chapter 2: Forty-Seven Hours Late

## Purpose

This is the authored tactical companion for `chapter-2-forty-seven-hours-late`. The mission graph provides phases and eligible decision pauses while preserving freeform resolution. If the player bypasses a phase, transfer only the functions and facts that can move causally.

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

# Tactical graph phases


## Phase: Forty-Seven Hours

**ID:** `phase.civilian-emergence`  
**Location:** `sable-verge`

A civilian transport emerges believing it is less than two days late and requesting clearance to continue to its destination colony.

### Objectives

- Stabilize the transport
- Verify elapsed time
- Establish contact protocol

### Pressures

- Passengers expect ordinary arrival
- The destination government has changed
- Cargo is medically urgent

### Retrieved Director cards

- `card.quest.chapter-2-forty-seven-hours-late`
- `card.director.survivor-dignity`

### Exit behavior

- {"toPhaseId": "phase.changed-home", "condition": {"type": "sceneResolved"}}

## Phase: A Changed Home

**ID:** `phase.changed-home`  
**Location:** `sable-verge`

The destination colony confirms a coup, new law, and extradition demands for several passengers.

### Objectives

- Separate passenger wishes
- Assess extradition and asylum claims
- Protect sensitive contact

### Pressures

- The new government has legitimate support
- The former governor is aboard
- Families on the colony are requesting contact

### Retrieved Director cards

- `card.director.claims-are-multidomain`
- `card.actor.maia-rinn`

### Exit behavior

- {"toPhaseId": "phase.cargo-and-evidence", "condition": {"type": "decisionCommitted", "decisionPointId": "decision.colony-contact"}}

## Phase: Cargo and Evidence

**ID:** `phase.cargo-and-evidence`  
**Location:** `lydian-anchorage`

The transport's medical cargo, passenger property, and current logs become separate contested objects.

### Objectives

- Secure medical cargo
- Preserve passenger property
- Compare current logs through Ternion

### Pressures

- Both old and new authorities claim cargo
- Ternion access is time-sensitive
- Housing remains limited

### Retrieved Director cards

- `card.location.ternion-relay`
- `card.actor.magistrate-orrel`

### Exit behavior

- {"toPhaseId": "phase.individual-dispositions", "condition": {"type": "sceneResolved"}}

## Phase: Individual Dispositions

**ID:** `phase.individual-dispositions`  
**Location:** `lydian-anchorage`

Command commits return, asylum, housing, cargo, and evidence arrangements without treating the passenger list as one legal object.

### Objectives

- Commit status arrangements
- Protect dissenting passengers
- Record the anchor pulse interval

### Pressures

- No disposition satisfies every passenger
- The colony wants immediate transfer
- The Anchorage is strained

### Retrieved Director cards

- `card.command.player-agency`
- `card.director.failure-forward`

### Exit behavior

- {"terminal": true, "outcomeEvent": "quest.chapter-2-forty-seven-hours-late.resolved"}


# Command decision points


## Decision point: Colony Contact

**ID:** `decision.colony-contact`  
**Phase:** `phase.changed-home`  
**Pause type:** commandDecision

How will the Serein contact the changed colony and protect passengers who do not consent to disclosure or return?

### Stakes

- Asylum
- Family contact
- Diplomatic relations
- Passenger safety

### Consequence domains

- worldState
- relationships
- commandCulture

The player may answer freeform. Any prewritten options are illustrative only.

## Decision point: Cargo Status

**ID:** `decision.cargo-status`  
**Phase:** `phase.cargo-and-evidence`  
**Pause type:** commandDecision

What temporary custody applies to the medical cargo and property while passenger status remains divided?

### Stakes

- Medical relief
- Property rights
- Claims legitimacy

### Consequence domains

- worldState
- factions
- assets

The player may answer freeform. Any prewritten options are illustrative only.


# Graph completion

- Completion event: `quest.chapter-2-forty-seven-hours-late.resolved`
- Requires committed outcome: True
- Valid terminal phases: phase.individual-dispositions
- Single failed check cannot end the mission: True
- Refusal and withdrawal remain allowed.
