# Prelude: The Blank Route

## Function

Open the campaign, establish acting command, and make route custody the first consequential command problem.

**Dramatic question:** What does the new Executive Officer treat as authoritative when the chart and the inhabited universe disagree?

**Start:** Stardate 48612.3 at aster-vale  
**Baseline end:** 48612.5  
**Transition target:** `chapter-1-the-missing-colony`

## Failure policy

Campaign must continue: `true`.

- Forbidden outcome: end Unseen Border from a single failed check
- Forbidden outcome: remove player agency from command decisions
- Forbidden outcome: reveal complete hidden truth without evidence

## Phase structure

### Delegated Command

The player assumes acting command as the Aster Vale departs Meridian without Captain Kellan, while the crew tests new reporting and delegation routines.

**Type:** handover  
**Location:** `aster-vale`  
**Director purpose:** The player assumes acting command as the Aster Vale departs Meridian without Captain Kellan, while the crew tests new reporting and delegation routines.

**Objectives**

- Assume acting command
- Review ship and mission-pod limits
- Set reporting and delegation expectations

**Pressures**

- Kellan remains ashore under inquiry
- Chen has already run the ship for six weeks
- Halden's former procedures remain embedded in routine

**Exits**

- to `phase.route-conflict` when eventOccurred (eventType=mission.route-conflict)

### The Blank Route

The official route to Halloway terminates in empty space while civilian transponder traces continue across the blank area.

**Type:** containedMission  
**Location:** `meridian-beacon`  
**Director purpose:** The official route to Halloway terminates in empty space while civilian transponder traces continue across the blank area.

**Objectives**

- Prevent following traffic from entering uncertainty
- Compare chart layers and local traffic
- Decide whether to proceed

**Pressures**

- Three valid chart layers disagree
- Civilian pilots treat the route as ordinary
- Any warning may expose the corridor

**Decision points**

- `decision.opening-route-doctrine`

**Exits**

- to `phase.crossing-or-closure` when decisionCommitted (decisionPointId=decision.opening-route-doctrine)

### Crossing or Closure

The player commits a route doctrine through direct crossing, local pilotage, probe work, temporary closure, or withdrawal.

**Type:** containedMission  
**Location:** `meridian-beacon`  
**Director purpose:** The player commits a route doctrine through direct crossing, local pilotage, probe work, temporary closure, or withdrawal.

**Objectives**

- Execute the route decision
- Protect civilian traffic
- Preserve a record of what was observed

**Pressures**

- Sensor confidence changes during the crossing
- A school transport approaches from Halloway
- The ship cannot verify every branch simultaneously

**Exits**

- to `phase.halden-checksum` when sceneResolved ()

### A Valid Signature

The route discrepancy yields a recent checksum tied to Halden's emergency credentials and evidence of a maintained civilian marker chain.

**Type:** review  
**Location:** `halloway-colony`  
**Director purpose:** The route discrepancy yields a recent checksum tied to Halden's emergency credentials and evidence of a maintained civilian marker chain.

**Objectives**

- Separate what is known from inference
- Secure evidence without exposing the route
- Set immediate follow-up priorities

**Pressures**

- Starfleet requests a formal report
- Halloway traffic asks for reassurance
- The checksum may be a clue, authorization, or bait

**Decision points**

- `decision.first-report`

**Exits**

- to `phase.first-command-record` when decisionCommitted (decisionPointId=decision.first-report)

### The First Command Record

The player commits a report, route status, and standing order that define the opening doctrine of the campaign.

**Type:** transition  
**Location:** `aster-vale`  
**Director purpose:** The player commits a report, route status, and standing order that define the opening doctrine of the campaign.

**Objectives**

- Commit route status and access
- Record known facts and protected details
- Choose the first open-world priority

**Pressures**

- Every report creates access for someone
- The crew is judging how command describes uncertainty
- Kellan will eventually read the record

**Exits**

- terminal: `quest.prelude-the-blank-route.resolved`

## Decision points

### Opening Route Doctrine

Opening Route Doctrine

**Stakes:** Civilian safety; route exposure; Starfleet authority; first crew confidence

**Options policy:** Freeform command intent; any listed approaches are examples only.

**Consequence domains:** ship, worldState, campaignTracks, commandStyle

### The First Report

The First Report

**Stakes:** Evidence custody; local trust; institutional scrutiny; Halden trail

**Options policy:** Freeform command intent; any listed approaches are examples only.

**Consequence domains:** knowledgeLedger, worldState, campaignTracks, commandLog

## Command Bearing moments

### Opening Route Doctrine



**Eligible pause:** `command`  
**Freeform:** `true`

### The First Report



**Eligible pause:** `command`  
**Freeform:** `true`

## Facts

| ID | Visibility | Summary |
| --- | --- | --- |
| `phase.delegated-command.card.campaign.promise` | discoverable | Director card card.campaign.promise is relevant during Delegated Command. |
| `phase.delegated-command.card.command.acting-captain` | discoverable | Director card card.command.acting-captain is relevant during Delegated Command. |
| `phase.delegated-command.card.crew.lyra-chen` | discoverable | Director card card.crew.lyra-chen is relevant during Delegated Command. |
| `phase.delegated-command.card.ship.constraints` | discoverable | Director card card.ship.constraints is relevant during Delegated Command. |
| `phase.route-conflict.card.director.route-custody` | directorOnly | Director card card.director.route-custody is relevant during The Blank Route. |
| `phase.route-conflict.card.crew.sima-taren` | discoverable | Director card card.crew.sima-taren is relevant during The Blank Route. |
| `phase.route-conflict.card.crew.ilan-korev` | discoverable | Director card card.crew.ilan-korev is relevant during The Blank Route. |
| `phase.route-conflict.card.quest.prelude-the-blank-route` | discoverable | Director card card.quest.prelude-the-blank-route is relevant during The Blank Route. |
| `phase.crossing-or-closure.card.director.failure-forward` | directorOnly | Director card card.director.failure-forward is relevant during Crossing or Closure. |
| `phase.crossing-or-closure.card.quest.prelude-the-blank-route.director` | directorOnly | Director card card.quest.prelude-the-blank-route.director is relevant during Crossing or Closure. |
| `phase.crossing-or-closure.card.quest.prelude-the-blank-route.bearing` | discoverable | Director card card.quest.prelude-the-blank-route.bearing is relevant during Crossing or Closure. |
| `phase.halden-checksum.card.director.knowledge-boundaries` | directorOnly | Director card card.director.knowledge-boundaries is relevant during A Valid Signature. |
| `phase.halden-checksum.card.crew.ilan-korev.director` | directorOnly | Director card card.crew.ilan-korev.director is relevant during A Valid Signature. |
| `phase.halden-checksum.card.actor.rear-admiral-caris-holt` | discoverable | Director card card.actor.rear-admiral-caris-holt is relevant during A Valid Signature. |
| `phase.first-command-record.card.director.command-briefings` | directorOnly | Director card card.director.command-briefings is relevant during The First Command Record. |
| `phase.first-command-record.card.command.kellan-boundary` | discoverable | Director card card.command.kellan-boundary is relevant during The First Command Record. |
| `phase.first-command-record.card.director.open-world` | directorOnly | Director card card.director.open-world is relevant during The First Command Record. |

## Pressures and clocks

| ID | Phase | Summary |
| --- | --- | --- |
| `prelude-the-blank-route.pressure.1` | phase.delegated-command | Kellan remains ashore under inquiry |
| `prelude-the-blank-route.pressure.2` | phase.route-conflict | Three valid chart layers disagree |
| `prelude-the-blank-route.pressure.3` | phase.crossing-or-closure | Sensor confidence changes during the crossing |
| `prelude-the-blank-route.pressure.4` | phase.halden-checksum | Starfleet requests a formal report |
| `prelude-the-blank-route.pressure.5` | phase.first-command-record | Every report creates access for someone |

| Clock | Initial | Range | Visibility |
| --- | --- | --- | --- |
| `prelude-the-blank-route.mission-pressure` | 0 | 0–6 | hidden |

## End states

### prelude-the-blank-route.resolved



**Trigger:** Always available when the Director can causally frame it.

## Director execution rules

- Apply routine Starfleet competence before asking for a Command Bearing decision.
- Never convert an omitted routine procedure into a gotcha failure.
- Preserve alternate clue routes when a planned scene is bypassed or evidence is lost.
- Commit state before narration; narration reports, but does not create, outcomes.
- The player may choose an approach not represented in the graph. Adjudicate it from the situation and current state.
