# Ashes V1: Chapter 8 Migration Plan

> Status: approved implementation plan. This slice ends before narrator-prompt or player-facing UI changes.

**Goal:** Make `chapter-8-the-last-directive` the twelfth V1-native Ashes journey entry and a genuinely open-order finale: the player issues an executable response, delegates across simultaneous fronts, can solve the crisis through varied prose and strategies, receives credit for partial and costly success, and reaches the epilogue under one of the source-authored broad outcomes without accumulating low-value per-order, per-node, per-officer, or per-alert trackers.

**Identity:** Bind the mission to package version `0.3.0-pre-alpha.1`, the exact Open Orders III transition target, and the exact existing package epilogue `epilogue-the-terms-we-keep`. Keep the legacy Chapter 8 quest as migration input with an empty `missionGraph`; V1 remains the only active mission authority.

## Opening and Spoiler Boundary

Initially show only what Nightfall makes immediately apparent:

- several regional actors have received simultaneous, mutually incompatible but credible instructions;
- automated movement, defense, communications, and evacuation systems can no longer be trusted as a single source of truth;
- Whitaker has placed the player in operational command of a distributed response;
- five major responsibilities are active and may be pursued in any order: regional command legitimacy, a trusted command mesh, the Orison weapons grid, the Lantern coordination path, and civilian evacuation/medical response.

Do not initially reveal:

- the exact three-node quorum or the current identity of every node;
- an expected order for the five fronts;
- a required officer assignment, canonical resolution strategy, or single correct chain of command;
- that one failed front ends the mission;
- the final outcome label, epilogue politics, or which faction should govern;
- an invented countdown, generic urgency row, hidden objective, or percentage-complete fiction.

The five fronts are parallel major responsibilities, not `A > B > C > D > E`. The projection may list all five together; objective completion order has no semantic meaning.

## Minimal Finale Authority

Use five required objectives because each is a source-authored major player responsibility whose success, cost, or failure materially changes the campaign ending:

1. **Issue and sustain an executable regional response.** A vague desire to stop Pale Lantern is not enough. The player must establish concrete priorities, trusted pathways, rules of engagement, movement authority, delegated responsibilities, and conditions for unilateral action. Store only that a sufficiently executable plan was issued; preserve its free-form specifics in Story Settlement and accepted prose rather than multiplying mission fields.
2. **Keep a trusted command mesh functioning.** Settle from one aggregate command-mesh report.
3. **Contain the Orison weapons grid.** Settle from one aggregate weapons report.
4. **Break Nightfall's coordination path.** Settle from one aggregate core-path report after the three-node quorum becomes player-known.
5. **Protect civilian evacuation and medical response.** Settle from one aggregate humanitarian report.

Command legitimacy is folded into the first objective rather than added as a sixth tracker. Exact officer assignments remain free-form story facts. The mission records whether the resulting command structure remained shared, contested, imposed, or fractured, not a row for every officer.

Each front settles as completed or completed with cost. Broad systemic losses do not use `failedAfterInformedAction`, because collapse, sustained fire, an escaping core, or severe civilian loss may occur despite a defensible player decision; assigning informed blame would be unfair without a separately proven harmful act. The terminal mission outcome still distinguishes fracture and Ashes. A costly front is terminal for that objective but does not close the campaign early; the remaining fronts continue.

## Aggregate Reports and Two-Stage Custody

Use one required Duty Report route per front. Accepted story prose first establishes the completed front event and bounded world result. That committed event makes exactly one aggregate Duty Report eligible for the next Directive-owned report opportunity; the delivered report establishes player knowledge. The objective is gated by both the world result and the delivered player-known fact. This two-stage boundary is required by the existing custody architecture: a valid report manifest cannot be prepared before its aggregate event exists. It prevents hidden results from closing an objective and prevents generic narration from smuggling a result into player authority.

The reports cover:

- command architecture and legitimacy;
- trusted mesh continuity and gaps;
- weapons control, fire, damage, and remaining exposure;
- the three-node quorum and what was neutralized, secured, or escaped;
- evacuation, triage, casualties, and safe-haven continuity.

Reports must not create separate mission records for every false order, platform, ship, officer assignment, casualty, node candidate, alert, authentication failure, or local rescue. Those remain evidence inside the aggregate result and Story Settlement unless they become a later authored mission boundary.

## Free-Form Command and Strategy

The executable-plan evidence policy accepts the player's own prose only when it contains actionable command content. It does not require particular phrasing, named officers, or one canonical doctrine. The interpretation guidance must explicitly reject:

- generic intent such as `stop the network`;
- discussion, brainstorming, or a request for recommendations;
- an assistant-authored plan the player has not adopted;
- one local order presented as the whole distributed response.

Do not encode destruction, segmentation, transparent authentication reset, predictive disruption, controlled deception, or a hybrid as mutually exclusive mission tracks. They are supported approaches, not rails. The actual core, legitimacy, and front results preserve their consequences. A novel strategy remains valid when the story establishes a bounded result.

## Entry Capabilities

Consume proven prior outcomes through the generic immutable mission-entry receipt. Capabilities alter available methods or likely costs; none auto-completes an objective or guarantees the best outcome.

Carry the following only when their exact source outcome was archived:

- Helix Yard Support - Open Orders I / Long Repair `asset-earned`;
- Civilian Rescue Wing - Open Orders I / Borrowed Wings `asset-earned`;
- Quiet Channels Network - Open Orders I / Quiet Channels `asset-earned`;
- Orison Defense Codes - Open Orders II / Last Watch `asset-earned`;
- Asterion Medical Cooperative - Open Orders II / Second Opinion `asset-earned`;
- Regional Sensor Baseline - Open Orders II / Unwelcome Result `asset-earned`;
- Breckenridge Memorial Goodwill - Open Orders III / Name `asset-earned`;
- Long-Range Relay Window - Open Orders III / Signal `asset-earned`;
- Cross Isolation Protocol - Open Orders III / Signatures `asset-earned`;
- Preserved Hecate Relay - Chapter 3 relay `preserved-isolated` or `controlled-observation`;
- Demeris Archive - Chapter 4 interface record retained under accountable custody or destruction-with-record;
- Farwatch Evidence Package - Chapter 6 evidence `farwatch-evidence-package`;
- Provisional Regional Accord - Chapter 7 settlement `provisional-accord` or `armed-stand-down`;
- Distributed Command Readiness - Open Orders III load `normal-two`, `broad-delegated-coverage`, or `overextended-direct`.

Do not invent the Cardassian Logistics Index. The source names its finale effect but supplies no authoritative earning event, and the current V1 missions do not record Administrator Prel's contribution as a bounded outcome. Record this as a source-data gap for later story revision rather than silently awarding it, mapping it to an unrelated dimension, or making it always available.

Capability player text describes the concrete option or cost reduction without exposing source run IDs, hidden dimensions, or audit metadata. Capability predicates may support later narrator/UI cutover, but this slice does not change either consumer.

## Front Results

Use bounded world-owned results:

- **Command/legitimacy:** shared authority; contested but functional authority; Starfleet-imposed order; Compact-imposed order; fractured authority.
- **Command mesh:** trusted shared mesh; manual mesh with gaps; isolated alliances; collapsed mesh.
- **Weapons:** weapons freeze; manual control with damage; fire contained after exchange; sustained exchange.
- **Core:** all known nodes secured or destroyed; quorum broken; local containment with a surviving core; Nightfall still coordinating.
- **Civilians:** evacuation protected; protected with casualties or displacement; severe losses.

The player cannot self-certify these results. Assistant/runtime/adjudicator evidence may establish them only after the corresponding aggregate front event is depicted. A report may describe a failure without converting it into mission-level punishment for an unknown secret; the opening crisis and known operational consequences provide the informed basis.

## Overall Outcomes and Failure Forward

Derive five terminal dispositions in strict priority:

1. **Ashes** - sustained weapons exchange and severe civilian losses.
2. **Fractured survival** - mass loss is avoided, but Nightfall or regional authority remains materially fractured.
3. **Imposed order** - Starfleet or Compact contains the crisis through coercive control.
4. **Peace at a cost** - Nightfall is stopped or locally contained after material casualties, fire, infrastructure loss, or trust fracture.
5. **Lantern extinguished** - Nightfall is stopped, the known coordination path is neutralized, civilians avoid severe loss, and shared or functional authority survives.

Priority prevents a technically successful core action from erasing sustained fire or severe civilian loss. It also prevents one costly front from incorrectly upgrading to total failure when the source explicitly supports peace at a cost.

No clock is authored. The chapter has intense causal pressure, but the source does not give a fair player-known duration. Escalation follows unresolved front evidence rather than a synthetic timer.

## Epilogue Transition

Every terminal disposition targets `epilogue-the-terms-we-keep`. Carry only:

- the actual five front results and objective dispositions;
- the overall outcome;
- available prior capabilities without claiming they were used;
- significant costs, casualties, lost authority, surviving nodes, unresolved obligations, and preserved evidence actually established in accepted story state.

The transition opens on the immediate quiet after the crisis and Whitaker asking for status, casualties, and the next obligation. It must not announce a correct solution, settle the political order, erase coercion or casualties, claim every known node was destroyed when only the quorum broke, or manufacture use of an available asset.

## Robustness Scenarios

Fixtures and runtime proof must cover:

- all five front reports in multiple non-linear orders;
- an executable free-form plan with varied prose and a vague-plan rejection;
- all five broad overall outcomes;
- one failed front followed by continued progress on the others;
- quorum broken without all nodes secured;
- local containment with a surviving core;
- severe civilian loss without immediate game over;
- no asset history and several different earned-asset combinations;
- earned capability receipt tamper rejection and source-edit recomputation;
- capabilities changing no objective by themselves;
- aggregate front event and result accepted together, followed by exactly one custody-owned disclosure report;
- narrator inability to claim the player-issued command plan;
- player inability to self-certify a front result;
- stale revision, wrong swipe, hallucinated policy, and missing report custody rejection;
- one incidental alert detail producing no new objective, fact, event, outcome, clock, or legacy tracker;
- reload, idempotency, journey activation, epilogue pending state, source invalidation, restoration epoch, and exact twelve-entry contribution identity.

## Implementation Tasks

### Task 1: RED contract

- [ ] Create `tests/fixtures/mission/v1/chapter-8-last-directive-scenarios.fixture.json`.
- [ ] Create and register `tools/scripts/test-ashes-v1-chapter-8-mission.mjs`.
- [ ] Assert identity, spoiler boundary, five parallel objectives/reports, no clock, aggregate tracking, outcome priority, free-form plan evidence, capability declarations, source-gap handling, and hostile evidence cases.

### Task 2: Definition and validator

- [ ] Create `packages/bundled/breckenridge/v1/chapter-8-the-last-directive.mission-v1.json`.
- [ ] Add the five objectives, five aggregate facts, five hidden report events, six bounded outcomes, five dimensions, sixteen evidence policies, five report routes, five terminal dispositions, one epilogue transition, and fourteen entry capabilities.
- [ ] Create and register `tools/scripts/validate-ashes-v1-chapter-8.mjs` with cross-definition source validation.

### Task 3: Registry, runtime, and journey

- [ ] Register Chapter 8 after Open Orders III without activating the legacy quest graph.
- [ ] Prove exact Open Orders III activation, entry receipts, reload, idempotency, report custody, non-linear completion, V1-only identity, legacy-root isolation, and epilogue pending state.
- [ ] Extend the Ashes journey handoff proof through Chapter 8 and its twelve-entry contribution identity.
- [ ] Prove source mutation recomputes entry capability receipts and prunes Chapter 8 descendants.

### Task 4: Adversarial review and readiness

- [ ] Challenge objective railroading, free-form plan brittleness, result-before-report closure, capability-as-auto-win, orphan asset invention, node spam, per-officer spam, alert spam, synthetic urgency, front-failure game-over, outcome-priority erasure, transition overclaim, package drift, and live semantic uncertainty.
- [ ] Fix all Critical or Important non-UI findings, run focused and full deterministic gates, then create the Chapter 8 readiness record and update the documentation index, migration plan, predecessor/successor status, and this plan.

## Explicit Non-Goals and Stop Boundary

- No player-facing UI, notification, countdown, urgency styling, or objective-order redesign.
- No narrator prompt or generation-context change.
- No separate tracker for every alert, order, node, platform, officer assignment, casualty, rescue, ship system, relationship beat, or asset mention.
- No global inventory, mutable asset ledger, automatic asset use, or automatic win.
- No canonical officer assignments or mandatory resolution strategy.
- No Command Bearing award or spend in this slice.
- No invented Cardassian Logistics Index authority.
- Stop only before an actual player-facing UI or narrator-prompt change.
