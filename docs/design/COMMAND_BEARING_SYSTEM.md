# Command Bearing System

## Purpose

Command Bearing is Directive's leadership-progression and limited narrative-intervention system.

It records how the player resolves meaningful command situations and converts that history into a small reserve of typed points that can improve consequential outcomes.

Command Bearing has two parallel tracks:

- `Inspiration`: leadership through trust, shared purpose, transparency, dignity, mentorship, and voluntary cooperation.
- `Resolve`: leadership through commitment, discipline, credible authority, preparedness, boundaries, and accepted responsibility.

Command Bearing is not morality, alignment, charisma, luck, or a universal success button. Neither Inspiration nor Resolve is inherently ethical or unethical. The player's actual conduct and consequences still drive relationships, reputation, Values, Directives, mission results, and Command Log continuity.

## Terminology

| Term | Meaning |
|---|---|
| Command Bearing | The complete progression and intervention system. |
| Inspiration | The trust- and cooperation-oriented track. |
| Resolve | The commitment- and authority-oriented track. |
| Command Mark | Permanent progression earned in one track. |
| Bearing Rank | Permanent rank reached independently in Inspiration or Resolve. |
| Command Reserve | Shared bank containing temporary Inspiration and Resolve Points. |
| Inspiration Point | Temporary point used when Inspiration is causally relevant. |
| Resolve Point | Temporary point used when Resolve is causally relevant. |
| Recovery | A qualifying rest, duty-cycle reset, downtime interval, or chapter transition that replenishes the reserve. |
| Command Decision | A consequential situation eligible to demonstrate a command style. |
| Command Crucible | A major main-story decision that may award a Command Mark. |
| Provisional Outcome | The result determined before a Command Bearing intervention. |
| Final Outcome | The result after any valid point spend is applied. |
| Anchored Consequence | A cost or fact already established that a point cannot erase. |

Command Marks and Points are typed. Authoritative state records whether they belong to Inspiration or Resolve.

## Inspiration

Inspiration represents command through voluntary alignment. The commander succeeds because people understand the purpose, trust the commander, recognize shared interests, or feel empowered to contribute.

Common Inspiration methods:

- Building trust over time.
- Disclosing material risks honestly.
- Appealing to a genuinely shared value.
- Preserving another party's dignity.
- Creating a face-saving path toward cooperation.
- Delegating meaningful responsibility.
- Mentoring or encouraging initiative.
- Reconciling competing interests.
- Leading through personal example.
- Forming coalitions.
- Inviting expertise and dissent.
- Demonstrating appropriate vulnerability.

Inspiration is not kindness, politeness, passivity, or unlimited compromise. A pleasant but manipulative approach may be ineligible. A difficult truth delivered transparently may be strongly Inspiration-aligned.

## Resolve

Resolve represents command through commitment and credible boundaries. The commander succeeds because the objective is clear, preparation is real, authority is legitimate, consequences are credible, and the commander accepts responsibility for enforcing the decision.

Common Resolve methods:

- Issuing a clear and lawful order.
- Establishing a credible deadline or boundary.
- Holding position under pressure.
- Committing meaningful resources.
- Preparing contingencies.
- Accepting personal or political cost.
- Demonstrating courage under immediate danger.
- Enforcing standards consistently.
- Using legitimate authority decisively.
- Presenting credible deterrence.
- Taking public responsibility for a difficult course.
- Refusing to abandon a necessary objective.

Resolve is not hostility, cruelty, shouting, or intimidation. An empty threat is not Resolve. A calm, precisely defined boundary backed by real capability is.

## Mixed Approaches

Many strong command decisions use both styles.

Example:

```text
The commander explains the reactor risk truthfully, asks the colonists to evacuate voluntarily, gives them a reasonable deadline, and accepts responsibility for ordering emergency transport if they refuse.
```

This contains Inspiration through transparency and voluntary cooperation, and Resolve through the deadline and accepted responsibility.

When both styles are eligible, the player may choose which available point to invoke. The selected style determines what becomes decisive in the final narration. The action itself is not rewritten into a different approach.

## Progression Loop

1. The player undertakes a crew B-story, side assignment, personal-story chapter, or designated Command Crucible.
2. The player resolves it through freeform roleplay and ordinary mission actions.
3. Directive evaluates the decisive actions at the story's conclusion.
4. If award conditions are satisfied, the player earns one typed Command Mark.
5. Accumulated Marks raise the relevant Bearing Rank.
6. Ranks improve reserve flexibility and, at the highest rank, Recovery output.

Ordinary mandatory mission progression should not continuously grant Marks. Otherwise, advancement becomes automatic rather than expressive.

## Intervention Loop

1. The player attempts a consequential action.
2. Directive interprets intent and validates authority, capability, resources, time, and setting constraints.
3. The resolver produces a Provisional Outcome on the six-tier ladder.
4. The style evaluator checks Inspiration and Resolve eligibility.
5. If a valid point is available, Directive presents a compact intervention prompt.
6. The player spends one point or accepts the outcome.
7. Anchored Consequences remain in force.
8. Directive creates the Final Outcome packet and narrates the scene.
9. The spend and state changes are committed transactionally.

The style evaluator never decides the base outcome. It only determines whether a stored point has a credible way to influence that outcome.

## Starting State

Every player character begins with access to both styles:

```text
inspiration:
  rank: 1
  marks: 0
  points: 0

resolve:
  rank: 1
  marks: 0
  points: 0

commandReserve:
  capacity: 1
  absoluteCapacity: 2
  lastRecoveryId: null
```

Beginning at Rank I reflects baseline command training. It does not mean the player has already established a distinctive reputation.

A campaign may optionally begin after a qualifying Recovery and allow the player to select one opening point. This affects only the initial reserve; it does not classify the character's personality.

## Bearing Ranks

Each track advances independently.

| Rank | Title | Cumulative Marks | Track point cap | Primary effect |
|---:|---|---:|---:|---|
| I | Practiced | 0 | 1 | The style is available. |
| II | Established | 2 | 1 | The style becomes a recognized pattern in the commander's record. |
| III | Proven | 5 | 2 | The style may hold two points; the shared reserve expands to two slots if it has not already. |
| IV | Defining | 9 | 2 | The style may shape plausible reputation, expectations, and scene framing. |
| V | Exemplary | 14 | 2 | Recovery can generate one additional point of this style. |

Ranks II and IV are deliberately narrative recognition ranks. They do not grant another numeric power increase. Reputation may establish access, credibility, or initial position, but the action must still be resolved normally.

Rank never grants an automatic outcome-tier increase.

## Command Marks

A story or Command Decision qualifies for a Mark only when all three conditions are satisfied:

- `Agency`: the player selected, developed, or meaningfully altered the approach.
- `Commitment`: the player accepted a genuine risk, cost, obligation, boundary, or responsibility.
- `Causality`: the player's method materially shaped the resolution.

A B-story must reach a durable resolution, transition, or meaningful closure. It does not need a perfect result. A Partial Success, costly compromise, or principled setback may still demonstrate a clear command style.

No Mark is awarded for:

- Abandoning the story without resolution.
- Repeating the same argument until the model concedes.
- Routine politeness or routine firmness.
- Trivial errands without meaningful stakes.
- Claiming a reward in player-authored prose.
- Replaying an already rewarded branch.
- Swiping narration until an award appears.
- Creating disposable side tasks solely to farm Marks.

Default award:

```text
1 Command Mark in one track
```

A long, multi-chapter personal arc may award two Marks in total, normally at separate milestones. A single scene should never award multiple Marks merely because several style indicators are present.

## Determining Awarded Style

Directive evaluates decisive actions rather than isolated words.

Award Inspiration when resolution materially depends on trust, transparency, voluntary alignment, dignity, mentorship, or shared purpose.

Award Resolve when resolution materially depends on commitment, preparation, legitimate authority, boundaries, deterrence, discipline, or accepted responsibility.

If both appear, award the style that ultimately made the resolution possible.

A story may award one Mark in each track only when it contains two distinct, consequential Command Decisions and each independently satisfies Agency, Commitment, and Causality. This should be uncommon.

## Command Reserve

Inspiration and Resolve Points are typed, but they occupy one shared reserve. This prevents dual-track advancement from multiplying total interventions.

| Condition | Shared reserve capacity |
|---|---:|
| Both tracks below Rank III | 1 total point |
| Either track reaches Rank III | 2 total points |
| Absolute maximum | 2 total points |

Each track also has an individual storage cap:

- Ranks I-II: one point of that style.
- Ranks III-V: two points of that style.

Points persist until spent, but the reserve cannot exceed its cap. A Recovery while the reserve is full produces no additional benefit.

## Recovery

Directive should not hard-code fantasy terminology such as `long rest`. Each campaign defines qualifying Recovery intervals.

Typical Starfleet examples:

- A completed off-duty sleep period under normal conditions.
- The start of a new duty cycle.
- A substantial period of safe transit.
- Shore leave or scheduled downtime.
- A chapter or episode transition.
- Completion of emergency stand-down procedures.

Recovery normally does not occur when:

- The ship remains at battle stations.
- An immediate crisis is still active.
- The commander takes a brief nap during the same emergency.
- The player advances time solely to refresh points.
- The crew technically sleeps while the mission remains in uninterrupted crisis time.

Every qualifying Recovery receives a unique `recoveryId`. The same interval cannot refresh the reserve twice.

At each qualifying Recovery:

1. Retain unspent points already in the reserve.
2. Gain one base point of either Inspiration or Resolve, chosen by the player, subject to reserve and track caps.
3. If either track is Rank V, gain one additional point of a Rank V style, subject to all caps.
4. If both tracks are Rank V, the player chooses the style of the additional point.
5. Never exceed two total points.

Rank V does not increase absolute reserve capacity. It improves the speed with which an empty or partially empty reserve refills.

## Outcome Ladder

Directive resolves consequential actions on this ladder:

| Tier | Definition |
|---|---|
| Great Success | The objective is achieved and produces one significant additional advantage. |
| Success | The objective is achieved substantially as intended. |
| Partial Success | The objective is achieved with meaningful cost, reduced effect, complication, or obligation. |
| Partial Failure | The objective is not achieved, but the player gains progress, information, positioning, or protection from the worst consequence. |
| Failure | The objective is not achieved and a meaningful consequence follows. |
| Great Failure | The action produces a severe reversal, lasting consequence, or materially worsened position. |

Great Failure must arise from established risk. It should never introduce arbitrary catastrophe unrelated to the action.

Partial Failure must move the story forward.

## Spending Points

Spending one eligible point improves the Provisional Outcome by two tiers:

| Provisional Outcome | Final Outcome after one point |
|---|---|
| Great Failure | Partial Failure |
| Failure | Partial Success |
| Partial Failure | Success |
| Partial Success | Great Success |

A point cannot be spent on an existing Success or Great Success.

Core rules:

- Only one Command Bearing Point may affect a single resolved action.
- Inspiration and Resolve cannot be stacked on the same action.
- The point is spent after the Provisional Outcome is known but before consequences are narrated and committed.
- The chosen style must be causally eligible.
- An impossible action remains impossible.
- The spend improves one resolution node, not an entire scene, mission, or faction conflict.
- The spend cannot change established history, available technology, canon constraints, or hidden mission truth.
- The spend cannot automatically override an NPC's immutable red line, free will, or independent material interests.
- A point may improve a delegated crew action when the player's leadership materially prepared, enabled, or supported it.
- A failed generation or transactional commit refunds the point. An ordinary unfavorable story consequence does not.

Restricting spends to Partial Success or worse makes the system an intervention resource rather than a method for stacking extra rewards onto actions that already worked.

## Eligibility

Inspiration is eligible when plausible improvement depends materially on one or more of:

- A relationship the player has built.
- Trust earned through prior conduct.
- A sincere appeal to a shared value.
- Transparent disclosure of risk or intent.
- Voluntary cooperation.
- Preservation of dignity.
- Empowering a subordinate or ally.
- Coordinating people around a shared purpose.
- Reconciliation or mutual understanding.

Resolve is eligible when plausible improvement depends materially on one or more of:

- Legitimate authority.
- A credible boundary or deadline.
- Prepared contingencies.
- Accepted responsibility.
- Public commitment.
- Disciplined execution.
- Deterrence backed by real capability.
- Willingness to absorb political, personal, or operational cost.
- Refusal to abandon a necessary objective.

No style is eligible when the player's method does not actually use it. Writing `I persuade them` is not enough for Inspiration. Writing `I order it` is not enough for Resolve.

## Anchored Consequences

A Command Bearing Point improves the action's result. It does not erase terms already established before the intervention window.

Anchored Consequences may include:

- Damage already sustained.
- Time already lost.
- Resources already expended.
- A promise already broken.
- A legal violation inherent in the chosen method.
- A technical cost knowingly accepted.
- Harm that occurred before the resolved action.
- Another character's knowledge of what the player attempted.
- Exposure created by choosing a particular route.

Example:

```text
Imani explains that a warp-field maneuver will permanently damage the secondary power grid. The player accepts the cost and orders the maneuver. A Resolve Point may improve whether the maneuver escapes the anomaly, but it cannot preserve the secondary power grid.
```

## Great Success Boundaries

Because a Partial Success can become a Great Success, the additional advantage must remain bounded.

A Great Success may provide one significant extra benefit:

- Time saved.
- A resource preserved.
- Additional actionable information.
- Reduced exposure.
- A temporary positional advantage.
- Improved cooperation.
- A future favor.
- A cleaner transition into the next scene.
- A minor opportunity that would otherwise be unavailable.

Style shapes the benefit:

- Inspiration: trust, disclosure, reconciliation, voluntary assistance, or a durable relationship opening.
- Resolve: initiative, containment, time, deterrence, preserved capability, or disciplined execution.

A Great Success must not resolve an entire mission, create permanent loyalty, produce major new technology, remove all future opposition, reveal every hidden fact, erase a faction's established goals, or provide an unlimited advantage.

## Relationship And Reputation Interaction

Command Bearing progression is separate from NPC relationship state.

Spending Inspiration does not automatically increase rapport. Spending Resolve does not automatically reduce it. Officers react to the player's actual conduct and resulting consequences.

The final narrated action is recorded in each relevant NPC's memory ledger and interpreted through that character's values.

## Player Interface

Compact display:

```text
Command Bearing
Inspiration III  [1]
Resolve II       [0]
Reserve: 1 / 2
```

Expanded view may show:

- Current Marks and next-rank threshold.
- Rank title and description.
- Recovery rules for the current campaign.
- Recent Mark awards.
- Recent point spends.
- Why the reserve is currently capped.

Intervention prompt appears only when:

- The action has a spendable Provisional Outcome.
- At least one style is eligible.
- The player has a corresponding point.

Example:

```text
Provisional Outcome: Partial Failure

Inspiration is eligible:
Your earlier transparency secured the council's trust.

Spend 1 Inspiration:
Partial Failure -> Success

Anchored Consequence:
The evacuation has already consumed six hours.

[Invoke Inspiration] [Accept Outcome]
```

If both styles qualify:

```text
[Invoke Inspiration] [Invoke Resolve] [Accept Outcome]
```

This is an intervention choice, not a replacement for freeform roleplay. The player's action has already been written.

## Transaction And Exploit Protections

Directive must enforce:

- One award per unique story or Command Decision id.
- One spend per unique resolution id.
- Assistant swipes retain the same mechanical result and spend state.
- Editing the player's action restores the prior snapshot and resolves again.
- Deleting or branching before a spend restores the point on the active branch.
- Inactive branches cannot duplicate Marks or Recovery.
- Every Recovery uses a unique in-world interval id.
- Player-authored claims about points, ranks, or awards are ignored by authoritative state.
- Repeated time-skipping cannot trigger Recovery unless campaign state marks the interval as qualifying.
- The point is committed to the Final Outcome packet before prose generation.
- Regenerating prose does not reroll the action or consume another point.
- Provider failure before commit refunds the point.
- Provider failure after a confirmed state commit retries narration from the same packet.
- Mark awards are based on summarized decisive actions, not assistant praise or keyword frequency.

## Data Model Direction

Campaign state should use this shape:

```text
commandBearing:
  version: 1

  tracks:
    inspiration:
      rank: 1
      marks: 0
      points: 0
    resolve:
      rank: 1
      marks: 0
      points: 0

  reserve:
    capacity: 1
    absoluteCapacity: 2
    lastRecoveryId: null

  thresholds:
    1: 0
    2: 2
    3: 5
    4: 9
    5: 14

  awardedSources: {}
  spendLedger: {}
  recoveryLedger: {}
```

Command Bearing is now the authoritative state model. Pre-alpha saves that still contain older progression data should be updated in place to `commandBearing`; the runtime does not preserve older compatibility roots.

## MVP Scope

The first implementation should include:

- Two independent tracks with Marks and five ranks.
- Shared reserve with one- or two-point capacity.
- Campaign-defined Recovery events.
- Six-tier outcome ladder.
- Two-tier point intervention.
- Inspiration and Resolve eligibility evaluation.
- Anchored Consequence handling.
- One-award-per-source protection.
- Transactional spend and branch rollback.
- Compact HUD, intervention prompt, award notice, and Recovery prompt.
- Expandable rationale and audit log.

Deferred features may include campaign-specific rank titles, long-term service-record summaries, crew commentary on emerging command reputation, analytics, and authoring tools for tagging B-stories and Command Crucibles.

No deferred feature should introduce direct passive bonuses without separate balance review.

## Acceptance Criteria

The system is ready for initial campaign testing when:

- A player can earn a typed Mark from a resolved B-story.
- Rank advancement occurs at the correct threshold and cannot duplicate.
- Reserve capacity changes correctly at Rank III.
- Recovery respects track caps, reserve caps, and unique interval ids.
- A valid point can improve a Provisional Outcome by exactly two tiers.
- A point cannot improve Success, exceed Great Success, or make an impossible action possible.
- Anchored Consequences survive the intervention.
- Inspiration and Resolve produce different causal narration from the same mixed approach.
- Swiping narration does not reroll or consume another point.
- Editing the initiating player action rolls back the spend and resolves anew.
- NPC relationship changes derive from conduct and consequences rather than point type alone.
- The player can understand why a point was available or unavailable from the displayed rationale.
