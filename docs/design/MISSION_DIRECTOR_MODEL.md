# Mission Director Model

## Purpose

The Mission Director is the behind-the-scenes situation manager for Directive missions. It should preserve Star Trek mission structure without turning play into a fixed scene script.

The Mission Director protects the mission's dramatic question, causal integrity, and persistent consequences. It does not protect a required scene order.

## Core Rule

The Mission Director manages situations, not plots.

It tracks:

- What the mission is really about.
- What Starfleet ordered.
- What the Captain expects.
- What the player and crew currently know.
- What hidden truths exist.
- What actors want.
- Which fronts and clocks are advancing.
- What locations, resources, constraints, and hazards matter.
- What happens if the player investigates, delays, escalates, reroutes, ignores, or abandons the situation.

The player can steer the story, but cannot steer reality without authority, evidence, capability, and consequence.

## Command Competence Handoff

The Mission Director should use the [Command Competence Layer](COMMAND_COMPETENCE_LAYER.md) between player intent parsing and final adjudication.

This handoff keeps the Director focused on causal simulation while the competence layer handles professional context:

- Routine procedures the player character would know and execute.
- Professional facts the player character should understand before deciding.
- Specialist Domain Reports from relevant officers.
- Authority Notes when chain-of-command or jurisdiction matters.
- Procedural Warnings before serious foreseeable consequences.
- Anchored Risks when the player knowingly accepts a cost.

The handoff must not turn into a hidden answer key. The competence layer supplies context and routine execution; the Mission Director still resolves judgment, uncertainty, capability, pressure response, and consequence.

For example, Chapter 1 should not punish the player for failing to say "log the distress packet and authenticate the signal." That is routine professional procedure. It may punish, reward, complicate, or reshape the story based on the posture the player chooses once the false quarantine order, rescue pressure, evidence risk, and authority problem are made legible.

## Campaign Simulation Model

Directive campaigns should be simulated through immutable facts and active pressures, not precomputed branch trees.

Package-authored story material should define:

- Immutable past facts: what already happened before play began.
- Actor agendas: what each person, faction, system, or threat wants.
- Active pressures: what keeps pushing if the player does nothing.
- Fronts and clocks: how those pressures advance, stall, redirect, or expire.
- Resources and constraints: what actors can actually do.
- Revelation pools: truths that can surface through different routes.
- Pressure packages: prepared situations that can enter play when the current state makes them relevant.

The Director should not maintain a fragile list of alternate chapters for every possible player disruption. It should maintain the world state and ask what pressures still exist.

If an enemy dies, defects, is arrested, loses access, or otherwise stops being able to act, that pressure changes or disappears. The story keeps going because other facts, actors, obligations, and consequences remain active. The Director should not resurrect a pressure just because a prewritten chapter expected it.

Prewritten campaign material is therefore a supply of simulated pressures, not destiny. The model may use a chapter's prepared material when it still fits, alter it when the state has changed, skip it when its pressure is gone, or let a different pressure surface next.

## Pacing And Action Timing

The difficult part of a simulated campaign is not only deciding what pressures exist. It is deciding when they can plausibly act.

The Director should treat actor goals as intentions, not immediate actions. NPCs, factions, ship systems, and threats may all want things, but they cannot all move at once. An actor may act only when their intention becomes actionable inside the current fiction.

The pacing layer should ask:

```text
What changed?
Who notices?
Who cares?
Who can act?
How soon could they act?
Would acting improve or endanger their goal?
Would acting expose them too soon?
Is this the right dramatic focus for the current scene?
```

### Actor Intentions

Each significant actor or faction should have one or more current intentions.

Examples:

- Conceal the Lantern.
- Discredit the Breckinridge.
- Protect a refugee convoy.
- Pressure Starfleet into a public position.
- Test the new XO's judgment.
- Keep a secret from Captain Whitaker.
- Preserve the crew's cohesion during a diplomatic crisis.

Intentions explain what an actor wants, but they do not grant instant action. The Director still needs readiness, opportunity, and timing.

### Readiness Gates

Before a pressure acts or surfaces, the Director should check whether the responsible actor has enough of the following:

- Motive: the action advances a goal, prevents loss, protects a value, or answers a threat.
- Information: the actor knows enough to choose this action.
- Opportunity: the actor has access to the person, place, system, channel, or moment required.
- Resources: the actor has the tools, authority, crew, leverage, cover, time, or political capital required.
- Risk tolerance: the actor would accept the exposure, delay, damage, or escalation the action might cause.
- Timing: the action fits the current phase, deadline, travel interval, duty shift, briefing, vote, analysis result, or prior setup.

If a readiness gate fails, the pressure can remain latent, gather resources, seek information, choose a weaker action, or wait for a better window.

### Action Windows

Prepared pressures should define plausible timing windows rather than fixed trigger scenes.

Useful fields include:

```text
earliestPlausibleAction
preferredDramaticWindow
latestUsefulAction
cooldownAfterAction
setupRequired
expiresWhen
```

Example:

```text
earliestPlausibleAction: after the Breckinridge enters range of the border relay
preferredDramaticWindow: after the first senior staff briefing, before the Captain makes a formal report
latestUsefulAction: before Starfleet receives verified signal forensics
cooldownAfterAction: one major scene or one operational interval
setupRequired: forged signal anomaly must be noticed or transmitted
expiresWhen: the signal source is exposed, destroyed, or publicly authenticated as false
```

The Director may choose any viable point inside the action window. The player can shorten, extend, collapse, or redirect that window by changing the state.

### Pressure Cadence

Most pressures should advance through visible and hidden stages instead of jumping from dormant to catastrophic.

Default cadence:

```text
Latent -> Signal -> Escalation -> Crisis -> Consequence
```

Definitions:

- `Latent`: the pressure exists but has not surfaced to the player.
- `Signal`: the player, crew, or another actor receives an ambiguous warning, clue, behavior change, or weak symptom.
- `Escalation`: the pressure acts in a way that changes the situation and demands attention.
- `Crisis`: the pressure becomes urgent enough that delay or weak action creates serious cost.
- `Consequence`: the pressure resolves, transforms, or leaves durable aftermath.

Example:

```text
Latent: forged Starfleet traffic exists.
Signal: Ops notices timestamp drift in a routine relay packet.
Escalation: a nearby vessel follows a false order.
Crisis: the Breckinridge is blamed for violating a neutrality agreement.
Consequence: the player proves interference, accepts a diplomatic penalty, exposes a conspirator, or fails to prevent local fallout.
```

Stages are not mandatory scenes. They are pacing states. A strong player action may expose a latent pressure early, prevent escalation, or skip straight to crisis by creating a public confrontation.

### Director Focus Budget

The Director should limit how many pressures actively surface in one scene or turn.

Default scene budget:

- One primary pressure may take center stage.
- One secondary pressure may advance quietly.
- One crew, relationship, or Values beat may surface when relevant.
- Other active pressures may update internally, but should not demand attention unless their clock reaches a crisis threshold.

This budget is not a hard rule for emergencies, but it should be the default. It keeps a simulated world from becoming unreadable.

The Director should choose focus by weighing:

- Causal urgency.
- Current mission phase.
- Player intent.
- Actor readiness.
- Clock thresholds.
- Relationship or crew relevance.
- Recent scene focus, to avoid repeating the same pressure too often.
- Whether surfacing this pressure creates a playable decision rather than mere noise.

### Diegetic Pacing Tools

Directive should use Star Trek fiction to pace the simulation naturally.

Common timing constraints include:

- Travel time.
- Duty shifts.
- Sensor analysis time.
- Medical analysis time.
- Engineering repair windows.
- Command briefings.
- Starfleet reporting requirements.
- Diplomatic protocol.
- Subspace delay.
- Clearance and jurisdiction limits.
- Crew fatigue.
- Ship readiness.
- Captain approval.
- Available evidence.

These should not be arbitrary delays. They are in-world reasons why actors need time, why evidence arrives later, why a Captain pauses for a briefing, or why a faction waits before escalating.

### Player Disruption And Pacing

When the player does something unexpected, the Director should update timing rather than force the old schedule.

Examples:

- If the player exposes the forged signal early, conspirators may accelerate, flee, deny, sacrifice a lesser asset, or lose the pressure entirely.
- If the player leaves the mission area with Captain approval, the original pressure keeps moving in the ship's absence.
- If the player earns a crew member's trust before a crisis, that crew member may volunteer information or support earlier than expected.
- If the player kills, arrests, or persuades a major antagonist, that actor's personal pressure ends, but their allies, victims, secrets, debts, and aftermath may remain.

The Director should not preserve a planned reveal if the state no longer supports it. It should preserve causality.

## Mission Definition

A mission should be authored as a flexible causal structure with at least these concepts:

```text
missionPremise
initialOrders
captainIntent
knownObjectives
hiddenTruth
missionArea
actors
actorIntentions
fronts
clocks
readinessGates
actionWindows
pressureCadence
revelations
constraints
escalationRules
directorFocusRules
possibleEndStates
aftermathRules
```

The exact schema is still to be designed, but mission implementation should not assume fixed scene order as the primary structure.

## Director State

Runtime Director state should track the evolving situation:

- Current mission phase or beat.
- Active objective and current operational frame.
- Current scene focus and recently surfaced pressures.
- Known facts and hidden facts.
- Revealed and unrevealed revelations.
- Actor goals, leverage, pressure, and current posture.
- Actor readiness, information, resources, access, and cooldowns.
- Front and clock progress.
- Pressure cadence stages and viable action windows.
- Mission area status.
- Captain intent and current tolerance for deviation.
- Crew advice already offered.
- Player commitments, promises, and accepted obligations.
- Valid end states still reachable.
- Consequences already committed.

This state is authoritative structure. The active SillyTavern narrator uses it for prose but does not own it.

## Turn Flow

For each consequential player action, the Mission Director participates in the turn transaction:

```text
parse player intent
check authority and capability
compare against objectives, directives, Captain intent, and hidden truth
classify the action's relationship to the mission frame
update actor information, opportunity, resources, and readiness
select actors, fronts, clocks, and constraints that respond
choose which pressures can surface within the current focus budget
produce or review the mission-facing part of the outcome packet
apply validated state deltas
update pressure cadence, revelations, clocks, action windows, and possible end states
prepare narration context for SillyTavern
record Command Log inputs
```

The Director should commit structured consequences before narration. A narration swipe may change prose but must not reroll Director state.

## Action Classification

Unexpected player actions should be classified before they are accepted, redirected, or refused.

### Valid Within Mission Bounds

The action is unusual but still fits the mission's current operational frame.

Example: the player bypasses the expected interview by assigning Ops to correlate maintenance logs and transporter activity.

Response: resolve normally, advance appropriate clocks, and reveal facts if justified.

### Mission-Relevant Lateral Move

The action avoids the expected route but still engages the core problem.

Example: the player suspects the distress call is bait and starts with sensor triangulation, command consultation, and traffic analysis instead of sending an away team.

Response: adapt the mission around the new approach. Preserve the hidden truth and causal pressures, not the expected scene.

### Mission-Abandoning Move

The action leaves the operational frame, ignores orders, or redirects the ship away from the assignment.

Example: the player orders the Breckinridge to leave the mission area.

Response: check authority, evidence, Captain intent, directives, risk, and cost. This can become a major command decision rather than a hard denial.

### Impossible Or Unsupported Move

The player lacks the authority, capability, time, information, access, or physical possibility required.

Example: the player orders a classified Starfleet asset to obey them without jurisdiction, proof, or communication access.

Response: refuse through the world model. Explain constraints through character response, ship state, or Command Log summary where appropriate.

## Leaving The Mission Area

Flying out of the mission area is not automatically forbidden. It is a mission-abandoning move by default, and must be adjudicated as a command decision.

The Director should ask:

- Does the player have command authority right now?
- Is Captain Whitaker present, available, or monitoring?
- Does leaving violate Starfleet orders, mission directives, or promises?
- Is there credible evidence of a more urgent threat?
- Is delay acceptable?
- What is the cost of leaving?
- What does the original mission do while the ship is gone?
- Would the Captain agree, refuse, countermand, defer, or demand justification?

If the player has no sufficient reason, the Captain can keep the mission on track. That is not railroading; it is command structure.

If the player presents a compelling reason, the Captain should be persuadable or at least forced to make a serious command call. The mission then changes shape.

## Captain As Constraint

Captain Whitaker is a legitimate command authority, not a plot wall.

She should have:

- Standing orders from Starfleet.
- Her own mission intent.
- A risk tolerance.
- Trust or skepticism toward the new XO based on current relationship state.
- Duties to the ship, crew, civilians, Starfleet, and law.
- Limits on what she will approve without evidence.

Whitaker's command posture should be explicit hidden state. Recommended captain-specific fields:

| Field | Initial Ashes direction | Use |
|---|---|---|
| `delegationScope` | 58 | How much authority the XO may exercise without requesting confirmation. |
| `commandReadiness` | 42 | Assessment of the XO's readiness for independent command. |
| `publicBacking` | 62 | Willingness to defend the XO's decisions before the crew or Starfleet. |
| `oversightPressure` | 40 | How closely the Captain monitors and requests reports. |
| `mentorshipInvestment` | 72 | How actively the Captain develops the XO. |
| `institutionalFaith` | 82 | Confidence in Starfleet systems, rules, and corrective processes. |
| `defianceReadiness` | 18 | Willingness to resist or disobey higher authority. |
| `shipAttachment` | 88 | Emotional identification with the vessel and its legacy. |

These fields should be represented in player-safe language when surfaced through conversation. The player can ask Whitaker about her expectations, risk posture, or command philosophy, but raw values remain hidden.

Whitaker's permanent profile:

```text
coreValues:
- Debate should remain open until a decision is made.
- Starfleet authority must remain worthy of public trust.
- Command must personally own the consequences of its decisions.

pressurePoint:
She places too much confidence in proper procedure eventually correcting institutional failure.

redLines:
- Concealing shipwide risk from command.
- Scapegoating a subordinate for a command decision.
- Humiliating personnel to reinforce authority.
- Using civilians as disposable leverage.

socialStyle:
Measured, attentive, and professionally warm, with occasional dry humor.

conflictStyle:
Asks exact questions, invites contrary recommendations, and closes debate firmly once a decision is made.

privateWant:
To turn the reconstructed Breckinridge crew into a cohesive ship rather than a collection of transferred officers.

privateFear:
That she may be defending institutions which have already failed the people they claim to protect.
```

Whitaker should not begin suspicious of the player. Starfleet assigned a commander to serve as her XO, and she respects that process. Credentials are not the same as firsthand confidence.

She may refuse a weak deviation:

```text
No. We have our orders, Commander. Bring me evidence that changes the risk picture.
```

She may approve a strong deviation with conditions:

```text
You have made your case. Set course, but log my order: we return the moment that threat is contained, and you will brief Starfleet on why this could not wait.
```

Approval should not mean no cost. It means the player's case was strong enough to change the command decision.

## Compelling Deviation

A compelling reason to leave or reframe the mission should usually include several of these:

- New evidence.
- Credible source.
- Imminent harm.
- Legal or ethical obligation.
- Time sensitivity.
- A feasible plan.
- Acknowledged cost.
- Clear relationship to Starfleet duties or the ship's mission.

When accepted, the Director should convert the deviation into consequences instead of blocking it.

Possible consequences:

- The original mission clock advances.
- A third party feels abandoned.
- Starfleet questions the deviation.
- The ship arrives at the new target under time pressure.
- A hidden actor exploits the absence.
- A relationship changes because the Captain, crew, or affected party agrees or disagrees.
- The player's Values or Directives are affirmed, challenged, or compromised.
- A Command Decision may be awarded if the requirements are met.

## Flexibility Requirements

Each authored mission should define a pressure package rather than a branch table.

Useful pressure-package fields include:

- Immutable facts.
- Active actors and what they can still do.
- Actor intentions and current priorities.
- Readiness gates for major pressure actions.
- Action windows, cooldowns, setup requirements, and expiry conditions.
- Current pressures and what makes them advance, stall, redirect, or end.
- Pressure cadence stages.
- Relevant clocks.
- Revelation routes.
- Valid authority and capability constraints.
- Scene focus and pressure budget guidance.
- Consequence rules.

The Director should preserve:

- Hidden truth.
- Actor goals.
- Clocks and consequences.
- Authority and capability limits.
- Mission directives.
- Character relationships.
- End-state logic.

The Director should not preserve:

- Required scene order.
- Required NPC conversation.
- A single clue path.
- A single correct technical solution.
- A single moral reading of the situation.

## Director And Narrator Boundary

Directive uses the active SillyTavern model for narration. The Mission Director supplies structured context and outcome constraints.

The narrator may:

- Present scene prose.
- Voice NPCs according to committed state.
- Describe consequences already approved by the transaction.
- Surface uncertainty in character.

The narrator may not:

- Decide hidden truth.
- Override committed Director state.
- Kill, injure, repair, reveal, promote, exonerate, or condemn without a valid outcome packet.
- Resolve mission end states without Director approval.
- Turn a failed or partial action into full success through prose.

## Simulation Modes

Command mode uses the full Mission Director model. Clocks, consequences, relationship pressure, ship damage, and serious failure states can all apply if causally justified.

Command mode can include death, but only as a real consequence of severe causal failure. Senior staff competence should absorb many ordinary mistakes through warnings, mitigation, or partial recovery. Injury, incapacitation, or being taken out of action for several days should be much more common than death. Reassignment and resignation should generally require sustained pressure, repeated breach, or a major story consequence.

Exploration mode uses the same causal state but softer Director and narration guardrails. It should curb the worst outcomes, preserve more off-ramps, avoid senior staff or player-character death, and make relationship development more forgiving.

Exploration mode should soften consequence severity, not erase causality. Command mode should preserve serious consequences, not cheat against the player.

## Side Missions

Generated side missions use the same Director principles as main campaign missions.

They must:

- Inherit current ship, crew, relationship, obligation, and campaign state.
- Respect the active starship package's side mission rules.
- Include at least one meaningful B-plot or character pressure when appropriate.
- Commit outcomes back into campaign continuity.
- Avoid becoming disconnected errands.

Side mission generation may be more flexible than main campaign structure, but it still needs hidden truth, actors, constraints, clocks or pressure, and end-state logic.

## Implementation Boundaries

The Mission Director should not be a single monolithic module.

Expected ownership:

- `mission/director.js`: mission-frame classification, Director state transitions, pressure selection, and mission end-state coordination.
- `mission/pacing.js`: actor readiness checks, action-window selection, cooldowns, and scene focus budget.
- `mission/fronts.js`: front state and escalation behavior.
- `mission/clocks.js`: clock definitions, triggers, and advancement.
- `mission/revelations.js`: known/hidden fact reveal logic.
- `mission/end-states.js`: valid mission outcomes and aftermath rules.
- `adjudication/capability-validator.js`: authority, access, capability, and feasibility checks.
- `adjudication/action-resolver.js`: action result bands and causal outcome construction.
- `adjudication/outcome-packet.js`: structured result format.
- `adjudication/state-delta-validator.js`: guardrail against invalid state mutation.

The Director asks what responds and how the mission changes. Adjudication decides whether the player action can work and what the immediate result band is.

## Anti-Patterns

Avoid:

- Scene-order railroading.
- Captain veto as a generic plot lock.
- Hidden truth changing only to preserve the expected path.
- Ignoring a valid player plan because it skips content.
- Letting narration invent mission outcomes.
- Letting provider improvisation mutate authoritative state without validation.
- Side missions that do not affect or reflect persistent continuity.
- Failure states that appear without warning, cause, or recoverable context.
- Branch tables that try to prewrite every possible future.
- Resurrecting a removed pressure because the authored chapter expected it.
- Advancing every actor and every pressure every turn.
- Letting a pressure act before it has motive, information, opportunity, resources, and timing.
- Treating a clock threshold as an automatic public event when no actor can plausibly surface it.
- Using artificial delays when in-world timing constraints would be more coherent.

## Open Questions

- What exact starting values and update rules should Whitaker's hidden command-posture fields use in the Ashes projection?
- Should every mission define a `missionArea`, or can some missions be shipboard, diplomatic, or social without a geographic area?
- How should mission-abandoning moves be surfaced in the Command Log?
- How strict should Exploration mode be when the player repeatedly ignores mission obligations?
- Should mission side effects use separate aftermath rules for Starfleet standing, local factions, crew trust, and package-level campaign arcs?
- How explicit should the scene focus budget be in package data versus Director defaults?
- Should action windows be stored as structured fields, authored prose, or both?
