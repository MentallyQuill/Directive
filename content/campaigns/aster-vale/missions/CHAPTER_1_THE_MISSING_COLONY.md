# Chapter 1: The Missing Colony

## Function

Establish Halloway as an inhabited political community and force the first distinction between recognition and exposure.

**Dramatic question:** Can Starfleet restore a community to the map without turning recognition into exposure?

**Start:** Stardate 48612.3 at halloway-colony  
**Baseline end:** 48612.5  
**Transition target:** `chapter-2-haldens-shuttle`

## Failure policy

Campaign must continue: `true`.

- Forbidden outcome: end Unseen Border from a single failed check
- Forbidden outcome: remove player agency from command decisions
- Forbidden outcome: reveal complete hidden truth without evidence

## Phase structure

### An Inhabited Absence

The Aster Vale approaches a working colony whose formal civil status is evacuated and dormant.

**Type:** arrival  
**Location:** `halloway-colony`  
**Director purpose:** The Aster Vale approaches a working colony whose formal civil status is evacuated and dormant.

**Objectives**

- Establish contact
- Verify immediate safety
- Avoid treating the colony as an illegal object

**Pressures**

- Halloway controls docking access
- Residents fear a complete scan and census
- Hadran observers are monitoring Starfleet traffic

**Exits**

- to `phase.colony-status` when sceneResolved ()

### Recognition Has Consequences

Talar and resident representatives explain that recognition would unlock aid while exposing taxes, warrants, route detail, and private economies.

**Type:** briefing  
**Location:** `halloway-colony`  
**Director purpose:** Talar and resident representatives explain that recognition would unlock aid while exposing taxes, warrants, route detail, and private economies.

**Objectives**

- Separate recognition, aid, security, and criminal questions
- Hear resident and council positions
- Set temporary Starfleet conduct

**Pressures**

- Residents disagree among themselves
- A relief shipment is waiting on status
- Starfleet requests verified population data

**Decision points**

- `decision.halloway-interim-status`

**Exits**

- to `phase.evacuated-record` when decisionCommitted (decisionPointId=decision.halloway-interim-status)

### The Evacuation That Wasn't

Records, testimony, and physical infrastructure establish that the evacuation completed on paper after most residents remained.

**Type:** containedMission  
**Location:** `halloway-colony`  
**Director purpose:** Records, testimony, and physical infrastructure establish that the evacuation completed on paper after most residents remained.

**Objectives**

- Verify the record through more than one source
- Protect witnesses and current residents
- Identify immediate legal and safety effects

**Pressures**

- Some records are protected for valid reasons
- Others conceal exploitation
- A complete data transfer would expose both

**Exits**

- to `phase.public-or-protected` when sceneResolved ()

### Public or Protected

The player chooses full restoration, protected recognition, continued obscurity, or withdrawal while defining what Starfleet will record.

**Type:** review  
**Location:** `halloway-colony`  
**Director purpose:** The player chooses full restoration, protected recognition, continued obscurity, or withdrawal while defining what Starfleet will record.

**Objectives**

- Set Halloway's interim status
- Define record access and review
- Establish transport and aid terms

**Pressures**

- No status satisfies every resident
- Hadran attention increases with public recognition
- Continued absence preserves abuse as well as safety

**Decision points**

- `decision.halloway-record`

**Exits**

- to `phase.halloway-record` when decisionCommitted (decisionPointId=decision.halloway-record)

### A Colony Returns Differently

The chosen status is implemented and Halloway becomes a continuing location, ally, adversary, or closed port in the open world.

**Type:** transition  
**Location:** `halloway-colony`  
**Director purpose:** The chosen status is implemented and Halloway becomes a continuing location, ally, adversary, or closed port in the open world.

**Objectives**

- Commit the status and immediate effects
- Record dissent and appeal routes
- Identify the next Halden or chart lead

**Pressures**

- Implementation matters more than the wording
- Local and Starfleet expectations diverge
- The colony remains part of the March after the mission

**Exits**

- terminal: `quest.chapter-1-the-missing-colony.resolved`

## Decision points

### Halloway Interim Status

Halloway Interim Status

**Stakes:** Aid; access; resident consent; legal exposure

**Options policy:** Freeform command intent; any listed approaches are examples only.

**Consequence domains:** worldState, campaignTracks, relationships, commandLog

### What Enters the Record

What Enters the Record

**Stakes:** Recognition; privacy; enforcement; route exposure

**Options policy:** Freeform command intent; any listed approaches are examples only.

**Consequence domains:** knowledgeLedger, worldState, campaignTracks, campaignAssets

## Command Bearing moments

### Halloway Interim Status



**Eligible pause:** `command`  
**Freeform:** `true`

### What Enters the Record



**Eligible pause:** `command`  
**Freeform:** `true`

## Facts

| ID | Visibility | Summary |
| --- | --- | --- |
| `phase.halloway-approach.card.location.halloway-colony` | discoverable | Director card card.location.halloway-colony is relevant during An Inhabited Absence. |
| `phase.halloway-approach.card.actor.governor-lise-talar` | discoverable | Director card card.actor.governor-lise-talar is relevant during An Inhabited Absence. |
| `phase.halloway-approach.card.crew.neral-thzor` | discoverable | Director card card.crew.neral-thzor is relevant during An Inhabited Absence. |
| `phase.colony-status.card.quest.chapter-1-the-missing-colony` | discoverable | Director card card.quest.chapter-1-the-missing-colony is relevant during Recognition Has Consequences. |
| `phase.colony-status.card.director.erasure-distinctions` | directorOnly | Director card card.director.erasure-distinctions is relevant during Recognition Has Consequences. |
| `phase.colony-status.card.crew.tavra-nesh` | discoverable | Director card card.crew.tavra-nesh is relevant during Recognition Has Consequences. |
| `phase.evacuated-record.card.quest.chapter-1-the-missing-colony.director` | directorOnly | Director card card.quest.chapter-1-the-missing-colony.director is relevant during The Evacuation That Wasn't. |
| `phase.evacuated-record.card.director.knowledge-boundaries` | directorOnly | Director card card.director.knowledge-boundaries is relevant during The Evacuation That Wasn't. |
| `phase.evacuated-record.card.actor.rear-admiral-caris-holt` | discoverable | Director card card.actor.rear-admiral-caris-holt is relevant during The Evacuation That Wasn't. |
| `phase.public-or-protected.card.quest.chapter-1-the-missing-colony.bearing` | discoverable | Director card card.quest.chapter-1-the-missing-colony.bearing is relevant during Public or Protected. |
| `phase.public-or-protected.card.director.route-custody` | directorOnly | Director card card.director.route-custody is relevant during Public or Protected. |
| `phase.public-or-protected.card.actor.governor-lise-talar` | discoverable | Director card card.actor.governor-lise-talar is relevant during Public or Protected. |
| `phase.halloway-record.card.director.open-world` | directorOnly | Director card card.director.open-world is relevant during A Colony Returns Differently. |
| `phase.halloway-record.card.front.front.chart-exposure` | discoverable | Director card card.front.front.chart-exposure is relevant during A Colony Returns Differently. |
| `phase.halloway-record.card.front.front.refugee-surge` | discoverable | Director card card.front.front.refugee-surge is relevant during A Colony Returns Differently. |

## Pressures and clocks

| ID | Phase | Summary |
| --- | --- | --- |
| `chapter-1-the-missing-colony.pressure.1` | phase.halloway-approach | Halloway controls docking access |
| `chapter-1-the-missing-colony.pressure.2` | phase.colony-status | Residents disagree among themselves |
| `chapter-1-the-missing-colony.pressure.3` | phase.evacuated-record | Some records are protected for valid reasons |
| `chapter-1-the-missing-colony.pressure.4` | phase.public-or-protected | No status satisfies every resident |
| `chapter-1-the-missing-colony.pressure.5` | phase.halloway-record | Implementation matters more than the wording |

| Clock | Initial | Range | Visibility |
| --- | --- | --- | --- |
| `chapter-1-the-missing-colony.mission-pressure` | 0 | 0–6 | hidden |

## End states

### chapter-1-the-missing-colony.resolved



**Trigger:** Always available when the Director can causally frame it.

## Director execution rules

- Apply routine Starfleet competence before asking for a Command Bearing decision.
- Never convert an omitted routine procedure into a gotcha failure.
- Preserve alternate clue routes when a planned scene is bypassed or evidence is lost.
- Commit state before narration; narration reports, but does not create, outcomes.
- The player may choose an approach not represented in the graph. Adjudicate it from the situation and current state.
