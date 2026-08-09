# Ashes V1: The Cost of Knowing Migration Plan

> Status: approved implementation work under the standing V1 architecture scope. This plan covers non-UI content and deterministic authority only; it does not authorize UI or narrator-prompt changes.

**Goal:** Make `chapter-6-the-cost-of-knowing` the ninth V1-native Ashes journey entry while preserving the chapter's operational, evidentiary, legal, and institutional ambiguity without reproducing its five percentage objectives or eight separate revelations as trackers.

**Identity:** Bind the V1 definition to the existing package quest `chapter-6-the-cost-of-knowing`, its empty legacy mission graph, the exact Open Orders II transition target, and package version `0.3.0-pre-alpha.1`. Its exact successor is the existing package quest `chapter-7-a-peace-of-their-own`.

**Legacy availability conflict:** The legacy quest requires Old Lessons plus `fact.current-starfleet-credentials`. The V1 journey reaches Chapter 6 only through terminal Open Orders II, whose required aggregate report establishes the more precise V1 credential-path fact. Do not copy the premature legacy fact or evaluate the legacy availability rule as parallel authority.

## Player-Safe Opening

Initially show:

- Rourke's authentic classified orders and the scope he requests;
- Tolland's confirmation that the orders are authentic while she lacks full operational scope;
- Rourke's serious counterintelligence argument;
- the proposed Lacuna operation to retrieve the archive, sever the link, protect unrelated personnel, and destroy the platform if necessary;
- three responsibilities: maintain command/network safety, establish Farwatch's actual conduct and remaining risk, and resolve evidence/disclosure/operative authority.

Do not initially reveal:

- that Farwatch found the node eighty-three days earlier;
- that it deliberately left the node active;
- warrantless local monitoring;
- current codes introduced through the controlled interface;
- Rourke's warnings or his superior's decision;
- the false recall/purge sequence;
- defense and evacuation integration;
- the Nightfall model;
- a hidden objective count, progress percentage, or countdown.

## Minimal Mission Authority

Use three required objectives:

1. **Command and network safety** — keep the Breckenridge coherent and establish the actual operational result of the Lacuna crisis.
2. **Farwatch truth** — establish the aggregate operational history and the remaining authenticated-path/Nightfall risk through two reports.
3. **Evidence and authority** — resolve actual archive custody, regional information, and Rourke's operative status.

The five legacy checklist rows collapse into these responsibilities. Rourke's orders are opening context, not a separate objective. The eight required revelations collapse into two aggregate reports. Every archive partition, order, rumor, officer reaction, and disclosure recipient must not become its own tracker.

## Aggregate Truth and Alternate Routes

### Farwatch operational account

One required Duty Report establishes that Farwatch found and deliberately retained the node, used it against real weapons traffic, introduced current codes, monitored local actors without recognized local authority, received Rourke's warnings, continued under superior authority, and materially enabled Nightfall without any one officer intending or understanding the full result.

The account may be established through:

- the Lacuna archive;
- Rourke testimony corroborated by Hecate and operational logs;
- external or Inspector General records.

### Authenticated pathway and Nightfall risk

One required Duty Report establishes that Pale Lantern can exploit authenticated pathways to spread false orders, has reached toward regional defense and evacuation systems, and remains on a Nightfall trajectory even if the Lacuna node is destroyed.

The risk may be established through:

- Lacuna telemetry;
- cross-system corroboration;
- a defensible operational reconstruction after partial or destroyed evidence.

No archive, actor, or one surviving partition is a single point of failure for campaign truth.

## Choices, Results, and Fairness

Record only high-value choices:

- the player's explicit operational response to the false emergency sequence;
- the player's current boundary on Rourke's authority;
- the player's informed evidence/disclosure disposition after the Farwatch account is known.

Choices remain distinct from observed results. Actual network state, archive custody, Rourke status, and what Kessler/the region actually learn are assistant/world-owned outcomes. The model may classify an early archive loss before the player knows its meaning; deterministic authority records cost, not moral failure. Destruction, secrecy, controlled review, joint custody, restricted cooperation, public disclosure, or handoff are not automatically good or bad.

Rowan's evidentiary discipline, Whitaker's confidence, Kieran's recall judgment, Bronn's anger, Miriam's consent argument, and Imani's engineering-boundary critique remain Story Settlement/People material when they become significant. They do not each become mission outcomes merely because they appear in a briefing.

## Projection and Closure

Expose four aggregate dimensions only:

- command/network result;
- evidence custody and Farwatch Evidence Package status;
- regional information/disclosure mode;
- Rourke/operative authority status.

Close only when all three required responsibilities have actual terminal dispositions. A choice, report, archive copy, public statement, or platform destruction alone cannot close the mission.

Use failure-forward terminal dispositions grounded in the source resolution states:

- accountable preservation;
- controlled secrecy;
- public rupture;
- evidence lost forward;
- operational rupture forward;
- responsible handoff for mixed states not captured above.

All transition to Chapter 7 with their exact costs. No terminal priority may hide a worse network rupture behind a politically attractive disclosure label.

## Time, Command Bearing, and Anti-Spam

Chapter 6 defines no mission clock. The active crisis creates causal pressure, but the source provides no exact player-known deadline, advancement authority, or deterministic consequence schedule. The thirty-six-hour task-group deadline belongs to Chapter 7 and must not leak backward.

No Command Bearing award or spend is added in this slice. The source's Inspiration/Resolve examples are intent, not a complete neutral-reserve award contract.

The accepted-pair runtime must prove that incidental secure-room lighting, a rumor, or one archive partition does not create a ship issue, relationship moment, thread, quest, or extra mission tracker.

## Implementation Tasks

### Task 1: RED contract

- [ ] Create `tests/fixtures/mission/v1/chapter-6-cost-of-knowing-scenarios.fixture.json`.
- [ ] Create `tools/scripts/test-ashes-v1-chapter-6-mission.mjs` and register it in the alpha gate.
- [ ] Assert exact package/Open Orders II identity, empty legacy graph, exact Chapter 7 target, spoiler-safe opening, three objectives, two reports, four dimensions, no clock, direct and alternate truth routes, early loss fairness, non-linear play, mixed outcomes, and hostile source/revision cases.

### Task 2: Definition and validator

- [ ] Create `packages/bundled/breckenridge/v1/chapter-6-the-cost-of-knowing.mission-v1.json`.
- [ ] Add one known opening fact, two discoverable aggregate facts, one false-emergency event, player-owned operational/Rourke/evidence choices, world-owned network/evidence/Rourke/information results, and route evidence.
- [ ] Add three required objectives, four dimensions, six terminal dispositions, no clock, and the exact Chapter 7 transition.
- [ ] Create `tools/scripts/validate-ashes-v1-chapter-6.mjs` and register it in the alpha gate.

### Task 3: Registry, runtime, and journey

- [ ] Register Chapter 6 after Open Orders II without importing its empty legacy graph or legacy availability fact.
- [ ] Prove exact activation, reload, idempotency, legacy-root isolation, Chapter 7 pending state, journey-wide source identity, and source-mutation descendant pruning.
- [ ] Create `tools/scripts/test-ashes-v1-chapter-6-runtime.mjs` for accepted-pair batching, report custody, early-loss fairness, anti-spam, invalidation, and restoration proof.

### Task 4: Adversarial review and certification

- [ ] Challenge initial spoilers, authentic-authority caricature, Rourke villainization, secrecy/disclosure moral railroading, archive single points of failure, choice-as-result, early evidence loss blame, Nightfall single-node closure, report spam, false urgency, persistent-consequence bloat, terminal priority, package drift, and live semantic uncertainty.
- [ ] Fix every Critical or Important non-UI finding, run focused and full gates, then create the readiness record and update the documentation index and Ashes migration plan.

## Explicit Non-Goals and Stop Boundary

- No UI, narrator prompt, notification, urgency, or chat-presentation changes.
- No legacy quest rewrite or mission graph.
- No premature use of `fact.current-starfleet-credentials` as V1 authority.
- No requirement to preserve the physical Lacuna archive as the only truth route.
- No automatic success from compliance, disclosure, detention, destruction, or exact player wording.
- No automatic failure from secrecy, evidence loss, or a reasonable action taken before hidden facts are known.
- No timer without an authored player-known deadline.
- No Command Bearing mechanics in this slice.
- Stop only before an actual player-facing UI change.
