# Command And Morality Model

## Purpose

This document captures the established command and morality model. Directive should not use a good/evil meter, Paragon/Renegade-style polarity, dialogue-option alignment tags, or a third numeric morality score.

## Established Principles

The player's central fantasy is exercising command. They are not universally competent and do not personally replace their specialists.

Directive separates:

- Command style: how the player influences, coordinates, pressures, delegates, and accepts responsibility.
- Personal values: what the player believes should matter.
- Directives: external obligations such as orders, regulations, classifications, rules of engagement, and promises.
- Consequences: what actually changes because of decisions.

Inspiration and Resolve are independent command-style tracks. They are not opposites. A successful commander may develop both.

## Inspiration

Inspiration represents influence through trust, empathy, transparency, persuasion, coalition-building, shared purpose, and preserving dignity.

Inspiration is not automatically good. It can fail when unsupported by credibility, material interests, evidence, or an executable plan. It can also be manipulative.

## Resolve

Resolve represents influence through authority, decisiveness, credible pressure, deadlines, deterrence, calculated risk, and willingness to accept responsibility.

Resolve is not automatically cruel. It can be ethical, restrained, and necessary. It fails when the player lacks jurisdiction, leverage, capability, or willingness to follow through.

## Values

The player begins with a small number of personal values. Values should be tested by missions and B-plots, not repeated as slogans.

Examples:

- No life is expendable.
- The crew deserves the truth.
- The mission must come before personal loyalty.

A value can be:

- Affirmed.
- Challenged.
- Compromised.
- Reinterpreted.
- Replaced through character development.

The game records whether the commander affirmed, compromised, or challenged a value. It should not reduce that decision to good points or evil points.

## Directives

Directives are external obligations. They may include Starfleet regulations, mission orders, diplomatic restrictions, security classifications, rules of engagement, and promises accepted by the player.

Examples:

- Preserve the neutrality of this sector.
- Do not disclose the listening post's existence.

The strongest missions put a value, a directive, and an urgent practical need in tension.

## Command Decisions

Progression should be awarded through meaningful Command Decisions rather than through selecting labeled options. Side quests should function as episode B-plots, not errands, and may contain one or more concealed Command Decisions.

A Command Decision should require:

- Meaningful stakes.
- A substantively appropriate method.
- Acceptance of some risk, cost, obligation, or compromise.
- A recognizable command style.
- No duplicate reward for the same decision.

The method must actually fit the situation. The player does not earn Inspiration by merely writing "I persuade them", and does not earn Resolve by merely issuing a stern order. The action must engage with the other character's interests, the player's authority, the available facts, and the practical constraints of the scene.

Command progression should be recorded as language-first continuity, not as exposed arithmetic.

Preferred records:

```text
The player earned Resolve by placing the Hesperus owner under formal inquiry while accepting responsibility for the delay.
The player earned Inspiration by protecting displaced passengers' dignity while preserving evidence.
Bronn lost trust in the player when the player dismissed his security warning as obstruction.
Priya gained confidence in the player after they formalized her staffing workaround instead of exploiting it quietly.
```

The UI may show compact labels such as `Earned Resolve`, but the durable state should preserve the reason in prose so future model calls have meaningful continuity to retrieve.

One Command Decision may award both Inspiration and Resolve, but this should be rare. The decision must substantively involve both trust-building or dignity-preserving influence and decisive authority, pressure, risk, or responsibility.

## Progression Use

The active progression model is [Command Bearing System](COMMAND_BEARING_SYSTEM.md).

Command Bearing uses:

- Permanent typed `Command Marks`.
- Independent Inspiration and Resolve `Bearing Ranks`.
- A shared `Command Reserve` capped at two total points.
- Campaign-defined `Recovery` intervals.
- Post-resolution point spends that improve eligible Provisional Outcomes.

Every player character begins with Rank I in both tracks. Rank I represents baseline command training, not a distinctive personal reputation.

Rank thresholds:

| Rank | Title | Cumulative Marks | Track point cap | Primary effect |
|---:|---|---:|---:|---|
| I | Practiced | 0 | 1 | The style is available. |
| II | Established | 2 | 1 | The style becomes a recognized pattern in the commander's record. |
| III | Proven | 5 | 2 | The style may hold two points; the shared reserve expands to two slots if it has not already. |
| IV | Defining | 9 | 2 | The style may shape plausible reputation, expectations, and scene framing. |
| V | Exemplary | 14 | 2 | Recovery can generate one additional point of this style. |

Ranks II and IV are narrative recognition ranks. Rank does not grant a passive outcome-tier increase. Reputation may affect access, credibility, expectations, or initial framing, but the action still resolves normally.

Command Reserve rules:

- Both tracks below Rank III: one total point.
- Either track at Rank III or higher: two total points.
- Absolute maximum: two total points.
- Ranks I-II can hold one point of that style.
- Ranks III-V can hold two points of that style.

At a qualifying Recovery, the player retains unspent points and may gain one point of either style, subject to track and reserve caps. Rank V can generate one additional point of that style, but never beyond the two-point reserve cap.

A point spend happens after the Provisional Outcome is known but before the Final Outcome is committed. One eligible point improves the outcome by two tiers:

| Provisional Outcome | Final Outcome after one point |
|---|---|
| Great Failure | Partial Failure |
| Failure | Partial Success |
| Partial Failure | Success |
| Partial Success | Great Success |

A point cannot be spent on an existing Success or Great Success.

Point spending cannot:

- Make an impossible action possible.
- Bypass missing authority.
- Replace specialist expertise.
- Override an NPC red line, agency, or material interest automatically.
- Change established history, technology, canon constraints, or hidden truth.
- Erase Anchored Consequences such as time already lost, damage already sustained, a promise already broken, or a cost knowingly accepted.
- Stack Inspiration and Resolve on the same action.

The Director should record why the spend applied in language-first continuity, and relevant NPCs should interpret the resulting conduct through their own memory ledgers.

## Adjudication Direction

The preferred posture is deterministic-first. Directive is not D&D. If the player makes good, reasonable choices with adequate authority, knowledge, preparation, and available crew capability, they should generally receive success or partial success.

Uncertainty should come from:

- Incomplete information.
- Hidden actor goals.
- Time pressure.
- Competing constraints.
- System damage or technical debt.
- Credibility, authority, leverage, and preparation.
- Consequences of prior choices.

Any randomness or volatility must be bounded, explainable, and fair. The game must not cheat against the player to create drama.

## Simulation Mode Direction

Directive should use two simulation modes:

- Exploration
- Command

These are the approved public labels. Do not use the earlier `Ensign`, `Lieutenant`, or `Commander` difficulty labels.

Command is the full simulation mode. It uses the Story Director, deterministic adjudication, hidden state, relationship pressure, operational consequences, and fair but serious failure states.

Command mode can include death, but death should be rare and heavily causal. A senior staff death or player death should generally require the player to truly mishandle the situation: ignoring clear warnings, ordering reckless action without mitigation, rejecting available expert advice, escalating beyond authority, or allowing a severe pressure to reach crisis without a credible response.

The player is surrounded by competent Starfleet officers. Their staff and crew should normally make good decisions inside their domains, mitigate obvious danger, and warn the player before disaster where warning is plausible. Injury, incapacitation, being relieved from a situation, or being taken out of action for several days should be much more common than death.

Reassignment or resignation should be less common during a campaign. It should usually require sustained relationship breakdown, repeated ethical breach, formal discipline, or a major story consequence rather than a single borderline decision.

Exploration is the story-forward mode for players who want the campaign experience with softer worst-case outcomes. It should dynamically alter Director and provider prompt structures so complications are softer, recovery paths remain available, and the story still respects causality.

Exploration guardrails:

- Senior staff NPCs cannot die.
- The player character cannot die.
- Senior staff and the player may be injured, incapacitated, relieved, stranded, or otherwise taken out of a fight when causally justified.
- Relationship damage should be more recoverable.
- Severe mission consequences should prefer delay, cost, obligation, injury, loss of advantage, or future pressure over permanent catastrophe.
- The Director should preserve credible off-ramps before committing irreversible outcomes.

Both modes must remain fair. Exploration should not erase causality, and Command should not cheat against the player.

## Unresolved

Do not implement these until clarified:

- Whether there is any randomness, and if so where it enters.
- Which Ashes of Peace B-stories and Command Crucibles can award Command Marks.
- Which Ashes of Peace intervals qualify as Recovery.
- Whether Ashes of Peace starts with an opening point after Character Creator review.
- Exact first Command Bearing intervention UI copy.
- How Command Decisions are detected, awarded, and converted into Command Marks.
- How values are changed or replaced beyond recording affirmed, compromised, or challenged outcomes.
