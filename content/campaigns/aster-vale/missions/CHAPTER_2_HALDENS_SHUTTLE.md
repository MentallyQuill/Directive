# Chapter 2: Halden's Shuttle

## Function

Recover a contested shuttle scene, establish Halden's survival through resilient evidence, and introduce the Gravesend open-world hazard.

**Dramatic question:** Who may be endangered in order to learn what happened to a missing Starfleet officer?

**Start:** Stardate 48612.3 at gravesend-veil  
**Baseline end:** 48612.5  
**Transition target:** `chapter-3-the-halloway-ledger`

## Failure policy

Campaign must continue: `true`.

- Forbidden outcome: end Unseen Border from a single failed check
- Forbidden outcome: remove player agency from command decisions
- Forbidden outcome: reveal complete hidden truth without evidence

## Phase structure

### Contact in the Veil

A civilian distress trace leads the Aster Vale to Halden's damaged shuttle amid shifting markers and several unacknowledged vessels.

**Type:** arrival  
**Location:** `gravesend-veil`  
**Director purpose:** A civilian distress trace leads the Aster Vale to Halden's damaged shuttle amid shifting markers and several unacknowledged vessels.

**Objectives**

- Stabilize the local route
- Identify life signs and immediate hazards
- Control approach without escalating every contact

**Pressures**

- The Veil is drifting
- Civilian craft are already near the shuttle
- At least one observer refuses identification

**Exits**

- to `phase.rescue-before-evidence` when sceneResolved ()

### Rescue Before Evidence

Residual life-support, medical traces, and testimony indicate occupants survived long enough for civilian rescue.

**Type:** containedMission  
**Location:** `gravesend-veil`  
**Director purpose:** Residual life-support, medical traces, and testimony indicate occupants survived long enough for civilian rescue.

**Objectives**

- Search for survivors and rescuers
- Separate life safety from evidence custody
- Protect civilian witnesses

**Pressures**

- The shuttle may break apart during towing
- Witnesses fear Hadran and Black Ledger retaliation
- A covert team is moving closer

**Decision points**

- `decision.shuttle-priority`

**Exits**

- to `phase.contested-custody` when decisionCommitted (decisionPointId=decision.shuttle-priority)

### Contested Custody

Starfleet, Hadran, local rescuers, and a covert boarding team each create competing claims over the shuttle and its data.

**Type:** containedMission  
**Location:** `gravesend-veil`  
**Director purpose:** Starfleet, Hadran, local rescuers, and a covert boarding team each create competing claims over the shuttle and its data.

**Objectives**

- Prevent seizure or destruction
- Establish a defensible custody arrangement
- Keep the Veil route usable for rescue

**Pressures**

- Armed contact is possible
- Joint custody may expose witnesses
- Exclusive custody may require force or sacrifice

**Exits**

- to `phase.audit-cache` when sceneResolved ()

### The Distributed Audit

The surviving cache reveals that Halden carried only one fragment of a wider route audit and deliberately separated evidence from witness identities.

**Type:** review  
**Location:** `gravesend-veil`  
**Director purpose:** The surviving cache reveals that Halden carried only one fragment of a wider route audit and deliberately separated evidence from witness identities.

**Objectives**

- Reconstruct what the cache can prove
- Avoid treating missing fields as proof of guilt
- Choose what to report and whom to alert

**Pressures**

- The cache points toward protected contacts
- Starfleet requests immediate upload
- Hostile actors may infer the same next step

**Decision points**

- `decision.halden-custody`

**Exits**

- to `phase.halden-alive-record` when decisionCommitted (decisionPointId=decision.halden-custody)

### Halden Was Alive

The mission closes with a credible living trail, a transformed evidence scene, and consequences for witnesses, custody, and the Veil.

**Type:** transition  
**Location:** `sable-crossing`  
**Director purpose:** The mission closes with a credible living trail, a transformed evidence scene, and consequences for witnesses, custody, and the Veil.

**Objectives**

- Commit the evidence and witness status
- Record ship, route, and faction consequences
- Choose the next investigation or regional priority

**Pressures**

- Evidence is incomplete but sufficient to continue
- Witness protection creates ongoing obligations
- The campaign now has multiple simultaneous leads

**Exits**

- terminal: `quest.chapter-2-haldens-shuttle.resolved`

## Decision points

### Rescue and Evidence Priority

Rescue and Evidence Priority

**Stakes:** Survivors; witnesses; shuttle integrity; route safety

**Options policy:** Freeform command intent; any listed approaches are examples only.

**Consequence domains:** ship, worldState, knowledgeLedger, relationships

### Halden Evidence Custody

Halden Evidence Custody

**Stakes:** Witness exposure; Starfleet review; hostile pursuit; investigation resilience

**Options policy:** Freeform command intent; any listed approaches are examples only.

**Consequence domains:** knowledgeLedger, campaignTracks, worldState, commandLog

## Command Bearing moments

### Rescue and Evidence Priority



**Eligible pause:** `command`  
**Freeform:** `true`

### Halden Evidence Custody



**Eligible pause:** `command`  
**Freeform:** `true`

## Facts

| ID | Visibility | Summary |
| --- | --- | --- |
| `phase.veil-contact.card.location.gravesend-veil` | discoverable | Director card card.location.gravesend-veil is relevant during Contact in the Veil. |
| `phase.veil-contact.card.crew.sima-taren` | discoverable | Director card card.crew.sima-taren is relevant during Contact in the Veil. |
| `phase.veil-contact.card.crew.ilan-korev` | discoverable | Director card card.crew.ilan-korev is relevant during Contact in the Veil. |
| `phase.rescue-before-evidence.card.quest.chapter-2-haldens-shuttle` | discoverable | Director card card.quest.chapter-2-haldens-shuttle is relevant during Rescue Before Evidence. |
| `phase.rescue-before-evidence.card.director.failure-forward` | directorOnly | Director card card.director.failure-forward is relevant during Rescue Before Evidence. |
| `phase.rescue-before-evidence.card.crew.tavra-nesh` | discoverable | Director card card.crew.tavra-nesh is relevant during Rescue Before Evidence. |
| `phase.contested-custody.card.quest.chapter-2-haldens-shuttle.director` | directorOnly | Director card card.quest.chapter-2-haldens-shuttle.director is relevant during Contested Custody. |
| `phase.contested-custody.card.actor.major-kael-renn` | discoverable | Director card card.actor.major-kael-renn is relevant during Contested Custody. |
| `phase.contested-custody.card.actor.nyra-voss.director` | directorOnly | Director card card.actor.nyra-voss.director is relevant during Contested Custody. |
| `phase.contested-custody.card.crew.neral-thzor` | discoverable | Director card card.crew.neral-thzor is relevant during Contested Custody. |
| `phase.audit-cache.card.director.knowledge-boundaries` | directorOnly | Director card card.director.knowledge-boundaries is relevant during The Distributed Audit. |
| `phase.audit-cache.card.crew.ilan-korev.director` | directorOnly | Director card card.crew.ilan-korev.director is relevant during The Distributed Audit. |
| `phase.audit-cache.card.director.fixed-truths` | directorOnly | Director card card.director.fixed-truths is relevant during The Distributed Audit. |
| `phase.halden-alive-record.card.director.open-world` | directorOnly | Director card card.director.open-world is relevant during Halden Was Alive. |
| `phase.halden-alive-record.card.quest.chapter-2-haldens-shuttle.bearing` | discoverable | Director card card.quest.chapter-2-haldens-shuttle.bearing is relevant during Halden Was Alive. |
| `phase.halden-alive-record.card.front.front.halden-audit` | discoverable | Director card card.front.front.halden-audit is relevant during Halden Was Alive. |

## Pressures and clocks

| ID | Phase | Summary |
| --- | --- | --- |
| `chapter-2-haldens-shuttle.pressure.1` | phase.veil-contact | The Veil is drifting |
| `chapter-2-haldens-shuttle.pressure.2` | phase.rescue-before-evidence | The shuttle may break apart during towing |
| `chapter-2-haldens-shuttle.pressure.3` | phase.contested-custody | Armed contact is possible |
| `chapter-2-haldens-shuttle.pressure.4` | phase.audit-cache | The cache points toward protected contacts |
| `chapter-2-haldens-shuttle.pressure.5` | phase.halden-alive-record | Evidence is incomplete but sufficient to continue |

| Clock | Initial | Range | Visibility |
| --- | --- | --- | --- |
| `chapter-2-haldens-shuttle.mission-pressure` | 0 | 0–6 | hidden |

## End states

### chapter-2-haldens-shuttle.resolved



**Trigger:** Always available when the Director can causally frame it.

## Director execution rules

- Apply routine Starfleet competence before asking for a Command Bearing decision.
- Never convert an omitted routine procedure into a gotcha failure.
- Preserve alternate clue routes when a planned scene is bypassed or evidence is lost.
- Commit state before narration; narration reports, but does not create, outcomes.
- The player may choose an approach not represented in the graph. Adjudicate it from the situation and current state.
