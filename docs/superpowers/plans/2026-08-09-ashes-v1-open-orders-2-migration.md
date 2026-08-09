# Ashes V1: Open Orders II Migration Plan

> Status: approved implementation work under the standing V1 architecture scope. This plan covers non-UI content and deterministic authority only; it does not authorize UI or narrator-prompt changes.

**Goal:** Make `open-orders-2-what-survives` the eighth V1-native Ashes journey entry and preserve the source-authored repair/review interval instead of skipping from Old Lessons directly to Chapter 6.

**Identity:** Open Orders II has no legacy quest-template row. Its stable V1-only identity comes from the source heading `Open Orders II: What Survives` and the exact Old Lessons transition. Do not create a legacy row. Its successor is the existing package quest `chapter-6-the-cost-of-knowing`.

**Architecture:** Use one required interval-conclusion objective and three visible optional assignment opportunities: The Last Watch, Second Opinion, and An Unwelcome Result. Normally two are completed. A third may be delegated, with the actual result reflecting available partnerships and assets. The assignment arrays are not the campaign-critical gate.

**Critical background authority:** The source says that regardless of selected assignments, Priya and Rowan establish a current Starfleet Intelligence credential path in the Hecate records, Tolland orders classified transmission, Rourke requests boarding, and Kessler learns Starfleet may have withheld knowledge. The legacy package incorrectly grants `fact.current-starfleet-credentials` immediately when Old Lessons resolves. V1 must move that discovery into this interval as one required aggregate Duty Report before conclusion can activate Chapter 6. The player is not asked to guess or select a hidden background task.

## Player-Safe Opening

Initially show:

- repairs and review after the Orison crisis;
- three optional opportunities with concise non-spoiler premises;
- the expectation that two assignments are a normal workload and a third requires delegation or an accepted overextension cost.

Do not initially reveal:

- Tonn's concealed targeting fault;
- coercive treatment consent;
- contamination in Rowan's model;
- current Starfleet Intelligence credentials;
- Rourke's boarding request or Farwatch's role;
- a hidden assignment, progress percentage, or countdown.

## Optional Assignments

### The Last Watch

Assessment report: Tonn is acting from genuine security conviction rather than Holt alignment, but one platform has a concealed targeting fault. Player-owned engagement may be direct, delegated, or declined. Results may earn Orison Defense Codes through a defensible safety/authority transition, resolve without the asset, fail after informed action, or remain declined.

### Second Opinion

Assessment report: the trauma therapy has real variable benefits and risks, while employment pressure compromises meaningful consent. Medical truth, consent, fitness, labor needs, and access remain distinct. Results may earn the Asterion Medical Cooperative through protected voluntary access, resolve without the asset, fail after informed action, or remain declined.

### An Unwelcome Result

Assessment report: Rowan's long-term biosphere warning is directionally correct, while Pale Lantern noise contaminates one reference and overstates short-term collapse. Results may earn the Regional Sensor Baseline through corrected transparent science, resolve without the asset, fail after informed action, or remain declined.

## Workload, Delegation, and Closure

Reuse the proven Open Orders I interval mechanics rather than inventing a new scheduler:

- each engagement choice is user-owned and reversible from decline until interval conclusion;
- assessment reports are crew-led and required before actual assignment success/failure settles;
- selection or delegation is not success;
- two resolved assignments are normal coverage;
- three direct assignments record overextension;
- delegated third coverage is allowed, while the observed result carries any missing-asset cost;
- early departure remains an explicit player choice and continues forward;
- optional assignment dispositions do not directly participate in `closeWhen`.

The required conclusion decision may settle only after the current-credential report is known. This protects the Chapter 6 transition without turning the report into a visible fourth assignment.

## Aggregate Projection

Player-facing state remains:

- one required interval conclusion;
- three optional assignment opportunities;
- four aggregate reports: one per assessment plus the campaign-critical credential-path report;
- assignment result dimensions and one workload/conclusion dimension;
- no clock.

Quiet repair scenes, meals, Bronn review, Kieran consequences, Imani's technical-debt register, crew exhaustion, and Rowan's broader suspicions remain Story Settlement material unless they produce an authored lasting effect. They do not become mention-level trackers.

## Fairness and Command Bearing

Hidden faults, coercion, contamination, and credentials are never graded before their reports. A player who declines or departs without a report cannot be blamed for failing to act on it. Actual informed failure requires the relevant assessment plus an explicit engagement and adverse observed result.

No Command Bearing award or spend is added in this slice. The earlier Inspiration/Resolve copy is source intent only; the unified neutral reserve requires a separately authored award/spend contract.

## Implementation Tasks

### Task 1: RED contract

- [ ] Create `tests/fixtures/mission/v1/open-orders-2-scenarios.fixture.json`.
- [ ] Create `tools/scripts/test-ashes-v1-open-orders-2-mission.mjs` and register it in the alpha gate.
- [ ] Assert V1-only identity, exact Old Lessons predecessor, no duplicate package quest, exact Chapter 6 target, spoiler-safe opening, four objectives, four reports, no clock, normal two-assignment load, delegated third, overextension, decline/reconsider, early departure, background discovery, and hostile source/revision cases.

### Task 2: Definition and validator

- [ ] Create `packages/bundled/breckenridge/v1/open-orders-2-what-survives.mission-v1.json`.
- [ ] Add three assessment facts/reports and one required current-credential fact/report.
- [ ] Add player-owned engagement/conclusion choices, observed assignment results, workload dimensions, mixed terminal dispositions, and exact Chapter 6 transition.
- [ ] Create `tools/scripts/validate-ashes-v1-open-orders-2.mjs` and register it in the alpha gate.

### Task 3: Registry, runtime, and journey

- [ ] Register the V1-only interval after Old Lessons without adding a quest row.
- [ ] Prove exact activation, reload, idempotency, legacy-root isolation, Chapter 6 pending state, and source-mutation descendant pruning.
- [ ] Create `tools/scripts/test-ashes-v1-open-orders-2-runtime.mjs` for accepted-pair, report custody, anti-spam, batching, invalidation, and restoration proof.

### Task 4: Adversarial review and certification

- [ ] Challenge hidden background gating, assignment spam, asset assumptions, decline permanence, workload railroading, false urgency, medical coercion, scientific uncertainty, platform morality, report custody, terminal priority, legacy reaction conflict, V1-only identity, and live semantic uncertainty.
- [ ] Fix every Critical or Important non-UI finding, run focused and full gates, then create the readiness record and update the documentation index and Ashes migration plan.

## Explicit Non-Goals and Stop Boundary

- No UI, narrator prompt, notification, urgency, or chat-presentation changes.
- No legacy quest row for Open Orders II.
- No early current-credential disclosure from the legacy Old Lessons reaction.
- No requirement to complete all three assignments personally.
- No automatic success from selection, delegation, or exact player wording.
- No timer without an authored player-known deadline.
- No Command Bearing mechanics in this slice.
- Stop only before an actual player-facing UI change.
