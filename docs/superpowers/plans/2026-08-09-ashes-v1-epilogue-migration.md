# Ashes V1 Epilogue Migration Plan

> **Status:** Implemented and deterministically certified for the non-UI boundary. This is the final mission-definition migration for the V1-native Ashes journey; player-facing UI and narrator-prompt changes remain outside this slice.

**Goal:** Make `epilogue-the-terms-we-keep` the thirteenth and final V1-native Ashes mission entry. The epilogue must turn the established Nightfall aftermath and the player's settlement choices into bounded, durable campaign dimensions without turning every political axis, witness, officer, or conversation into a visible tracker.

**Identity:** Bind to package `directive:campaign-package:breckenridge-ashes-of-peace` version `0.3.0-pre-alpha.1`, the exact Chapter 8 transition target, and source Section 23. Keep the legacy epilogue quest and its empty `missionGraph` as migration input only.

## Product Contract

The player sees four parallel responsibilities:

1. establish the operational and humanitarian aftermath;
2. set terms for regional authority and defense;
3. set terms for evidence, custody, and accountability;
4. complete the command review and name what continues.

These are responsibilities, not a prescribed scene order. The private Whitaker review may occur before or after the formal settlement. Authority and accountability positions may be expressed across several turns and in any prose style. The settlement account is eligible only after both positions are explicit and the player knows the aftermath.

The mission does not display or create a row for every:

- Compact participant, witness, officer, casualty, or damaged site;
- proposed charter clause, legal theory, or public statement;
- crew member's personal resolution;
- exchange during the settlement conference.

High-value individual crew moments belong to Story Settlement character effects. The mission retains only one aggregate command-review result.

## Proven Entry Context

Declare one always-earned `Nightfall Aftermath Record` capability sourced from all five Chapter 8 outcome dimensions. Its immutable receipt carries the exact command, mesh, weapons, coordination, and civilian results without duplicating them into five epilogue trackers.

Declare two conditional prior advantages only where earlier V1 outcomes actually earned them:

- the authenticated Farwatch evidence package from Chapter 6;
- the provisional regional accord from Chapter 7.

These are available evidence or institutional starting points. They do not choose settlement terms, auto-complete an objective, or imply that the player used them.

## Aggregate Custody

Use three one-shot world events and three discoverable aggregate facts:

- `aftermath-report-complete` -> the Nightfall aftermath record is communicated;
- `settlement-record-complete` -> the implemented settlement across the independent axes is communicated;
- `command-review-complete` -> Whitaker's assessment and the command consequence are communicated.

Each event is world-owned and can settle once. Each typed result remains `pending` until its corresponding event exists and can also settle once. Each fact becomes player-known only through one required Duty Report route. Repeated narration must be rejected rather than rewriting a settled axis or creating a duplicate record.

## Player Agency and Fairness

Record two player-owned markers:

- a sufficiently concrete authority-and-defense position;
- a sufficiently concrete evidence-custody-and-accountability position.

These markers confirm that the player took responsibility; they do not force a menu choice or claim that the player's recommendation was implemented. Exact language and nuance remain in the accepted source and its Story Settlement episode. The world-owned aggregate settlement records what was actually adopted.

Objective completion means that the responsibility was addressed and its result was reported. It does not grade one governance, custody, transparency, or Cardassian-participation choice as morally correct. Mixed, coercive, classified, or fractured results remain visible through terminal disposition and outcome dimensions.

No hidden discovery can make the player fail. No prior casualty, network collapse, surviving Nightfall path, or institutional refusal is reclassified as an informed player failure merely because it enters the settlement.

## Persistent Settlement Axes

The settlement account records six independent world results:

- Compact status;
- defense control;
- Farwatch accountability;
- Pale Lantern custody;
- Cardassian participation;
- public narrative.

The command review records one command-future result. These seven outcome dimensions are the epilogue's durable contribution. Individual relationship and crew consequences remain bounded Story Settlement effects.

## Closure and Campaign Boundary

The mission closes only when all four visible responsibilities are complete. It has three settlement-quality dispositions:

- `accountablePeace` when a credible accountability process, secured Lantern disposition, and non-fragmented regional settlement coexist;
- `contestedAftermath` when the adopted settlement leaves divided governance, missing Lantern material, or an explicitly contested public account;
- `managedSettlement` as the mixed or limited fallback.

These describe the settlement, not a universal moral score and not the complete campaign band. Chapter 8's archived operational dimensions remain authoritative alongside the epilogue dimensions.

The terminal transition targets a typed campaign-conclusion phase, `ashes-authored-conclusion`. Until the separate V1 phase/conclusion receipt is implemented, the mission transition must remain durably pending rather than mutating legacy quest or phase roots.

## No Synthetic Urgency

The source places the epilogue days or weeks after Nightfall and gives no deadline. Author no clock and expose no urgency panel. Report-route urgency is routine or material delivery priority, not elapsed time.

## Adversarial Fixtures

At minimum prove:

- accountable, managed, and contested settlements;
- authority and accountability positions in either order and across non-linear scene order;
- command review before formal settlement;
- neither player position alone closes its objective or the mission;
- assistant prose cannot invent a player position;
- user prose cannot self-certify world settlement or command assessment;
- settlement cannot occur before the known aftermath and both positions;
- settlement and command results cannot be rewritten by repeated narration;
- entry capabilities do not auto-complete the mission;
- no legacy mission graph, percentage progress, synthetic clock, or per-crew objective returns;
- stale, wrong-swipe, hallucinated-policy, reload, idempotency, source mutation, descendant pruning, and exact thirteen-entry journey identity.

## Implementation Tasks

- [x] Add the epilogue contract test, scenario fixture, and validator before the definition.
- [x] Add the V1 definition with four objectives, three aggregate facts, three hidden report events, nine outcomes, fifteen evidence policies, three report routes, seven dimensions, three dispositions, no clock, and three proven entry capabilities.
- [x] Register the definition after Chapter 8 without modifying the legacy quest.
- [x] Add accepted-pair runtime coverage and extend the full Ashes handoff to thirteen entries.
- [x] Prove the terminal campaign-phase target remains deterministic and non-legacy.
- [x] Update migration and architecture documentation only after deterministic gates pass.
