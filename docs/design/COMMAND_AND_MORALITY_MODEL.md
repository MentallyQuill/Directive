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

## Command Moments

Progression should be awarded through meaningful Command Moments rather than through selecting labeled options. Side quests should function as episode B-plots, not errands, and may contain one or more concealed Command Moments.

A Command Moment should require:

- Meaningful stakes.
- A substantively appropriate method.
- Acceptance of some risk, cost, obligation, or compromise.
- A recognizable command style.
- No duplicate reward for the same moment.

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

One Command Moment may award both Inspiration and Resolve, but this should be rare. The decision must substantively involve both trust-building or dignity-preserving influence and decisive authority, pressure, risk, or responsibility.

## Progression Use

Inspiration and Resolve should unlock techniques or provide modifiers. They should not generate automatic victories.

High Resolve cannot intimidate someone when the commander has no jurisdiction, force, information, or credible leverage. High Inspiration cannot persuade someone with an argument that ignores their interests or the material situation.

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

Exploration is the story-forward mode for players who want the campaign experience with softer worst-case outcomes. It should adjust Director and narration prompts to curb severe results, preserve more off-ramps, and avoid outcomes such as crew death or permanent relationship failure unless the player has clearly chosen that level of risk.

Both modes must remain fair. Exploration should not erase causality, and Command should not cheat against the player.

## Unresolved

Do not implement these until clarified:

- Exact Inspiration/Resolve progression economy, thresholds, and technique list.
- Whether there is any randomness, and if so where it enters.
- Exact mechanical guardrails for Exploration mode.
- How Command Moments are detected and awarded.
- How values are changed or replaced beyond recording affirmed, compromised, or challenged outcomes.
