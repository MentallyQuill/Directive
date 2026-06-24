# Chapter 1: First Manifest

## Purpose

This is the authored tactical companion for `chapter-1-first-manifest`. The mission graph provides phases and eligible decision pauses while preserving freeform resolution. If the player bypasses a phase, transfer only the functions and facts that can move causally.

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

# Tactical graph phases


## Phase: An Intact Signal

**ID:** `phase.intact-signal`  
**Location:** `sable-verge`

Ternion and Sable Verge receive a current-distorted but valid Starfleet identification from the missing U.S.S. Velorum.

### Objectives

- Verify identity
- Establish approach and quarantine posture
- Prepare for command conflict

### Pressures

- The ship is under power
- Its crew expects current orders to remain valid
- Public traffic is converging on the site

### Retrieved Director cards

- `card.actor.ila-varen`
- `card.director.current-not-time-travel`

### Exit behavior

- {"toPhaseId": "phase.returned-command", "condition": {"type": "sceneResolved"}}

## Phase: Returned Command

**ID:** `phase.returned-command`  
**Location:** `sable-verge`

Commander Varen reports twelve elapsed days and requests operational orders, only to learn that seven months have passed.

### Objectives

- Preserve Varen's agency
- Prevent unsafe independent departure
- Establish temporary authority

### Pressures

- Varen considers the Velorum active
- Successor commands exist outside
- Medical evaluation is incomplete

### Retrieved Director cards

- `card.quest.chapter-1-first-manifest`
- `card.command.player-agency`

### Exit behavior

- {"toPhaseId": "phase.manifest-collision", "condition": {"type": "eventOccurred", "eventType": "mission.outside-records-arrive"}}

## Phase: The First Manifest

**ID:** `phase.manifest-collision`  
**Location:** `sable-verge`

Outside records reveal deaths, remarriages, promotions, benefits, and reassigned commands for the Velorum crew.

### Objectives

- Separate medical, command, family, and property decisions
- Protect private records
- Identify urgent conflicts

### Pressures

- Families are requesting contact
- Ro requests the navigation core
- Varen wants her ship and crew kept together

### Retrieved Director cards

- `card.director.survivor-dignity`
- `card.director.claims-are-multidomain`
- `card.actor.elian-ro`

### Exit behavior

- {"toPhaseId": "phase.provisional-status", "condition": {"type": "decisionCommitted", "decisionPointId": "decision.public-return-status"}}

## Phase: Provisional Status

**ID:** `phase.provisional-status`  
**Location:** `lydian-anchorage`

The player establishes a temporary status for the Velorum, its crew, its command, and its records pending formal review.

### Objectives

- Commit a lawful provisional status
- Preserve an evidence route
- Assign follow-up care and review

### Pressures

- Any choice creates precedent
- Returnees are observing whether they will be treated as persons or property

### Retrieved Director cards

- `card.actor.magistrate-orrel`
- `card.director.survivor-dignity`

### Exit behavior

- {"terminal": true, "outcomeEvent": "quest.chapter-1-first-manifest.resolved"}


# Command decision points


## Decision point: Public Return Status

**ID:** `decision.public-return-status`  
**Phase:** `phase.manifest-collision`  
**Pause type:** commandDecision

What provisional legal and command status will Starfleet recognize for the Velorum and its returned crew?

### Stakes

- Personhood
- Ship command
- Family contact
- Navigation evidence
- Regional precedent

### Consequence domains

- worldState
- relationships
- commandCulture
- knowledge

The player may answer freeform. Any prewritten options are illustrative only.

## Decision point: Navigation Core Custody

**ID:** `decision.navigation-core`  
**Phase:** `phase.provisional-status`  
**Pause type:** commandDecision

Who may access or hold the Velorum navigation core while quarantine and command review continue?

### Stakes

- Mooring evidence
- Crew rights
- Security pressure

### Consequence domains

- knowledge
- factions
- worldState

The player may answer freeform. Any prewritten options are illustrative only.


# Graph completion

- Completion event: `quest.chapter-1-first-manifest.resolved`
- Requires committed outcome: True
- Valid terminal phases: phase.provisional-status
- Single failed check cannot end the mission: True
- Refusal and withdrawal remain allowed.
