# Prelude/Hesperus V1 Data Readiness

## Status

The package-owned Prelude/Hesperus mission definition, deterministic mission mechanics, Duty Report selection, scenario fixtures, and data-only player projection are ready to serve as the authority for the next runtime-cutover slice.

This is a data-and-mechanics certification, not a live-gameplay certification. Directive does not yet interpret accepted free-form chat into these claims, deliver Duty Reports through SillyTavern, project this state into the player UI, or disable the legacy writers.

## Certified Authority

- `packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json` owns the V1 Prelude definition and is pinned to the exact Ashes package ID, package version, and source ID.
- `packages/bundled/breckenridge/v1/prelude-hesperus-migration-map.json` accounts for 54 reviewed legacy identities without making their row shapes part of V1.
- Mission state records its package binding. A resumed state whose definition, package version, or source changes fails with `DIRECTIVE_MISSION_DEFINITION_MIGRATION_REQUIRED` instead of being silently reinterpreted or reset.
- World truth, player knowledge, events, observed outcomes, decisions, intent, and time remain separate typed claims.
- Every accepted external claim names an authored evidence policy. Policy identity, target, claim type, source role, preconditions, accepted source pair, and source revision are validated before reduction.
- Assistant prose cannot establish world truth or advance authoritative time. Disclosure cannot manufacture truth.
- Claims reduce in a fixed causal order, independent of model output order.

## Certified Mission Shape

Prelude contains four high-value primary objectives and one conditional optional objective:

1. complete the command handover with Whitaker;
2. establish senior-staff delegation and readiness;
3. resolve the Hesperus rescue responsibility after distress becomes active;
4. complete final readiness review and arrival;
5. optionally address Hesperus accountability after confirmed falsification becomes known.

The first two objectives can resolve in either order. Hesperus activates from authored state rather than array position. Optional accountability is absent while undiscovered, never enters the primary completion denominator, and cannot block mission closure.

There is no percentage progress. Objective state is derived from predicates over accepted evidence. The canonical scenarios prove primary success, success with cost, prudent handoff, proportionate accountability, knowing inaction, informed rescue failure, omitted-report failure-forward, reversed objective order, unsupported self-declared success, and stale, wrong-swipe, and hallucinated-policy rejection.

## Fair Discovery and Mixed Outcomes

Hesperus discovery is a ladder rather than a pre-announced fraud objective:

1. observable distress;
2. passenger risk;
3. injector limits;
4. record inconsistency;
5. material discrepancy;
6. confirmed falsification;
7. supported owner attribution.

The player may rescue the crew and complete the mission without discovering misconduct. A known discrepancy may be handed off prudently. Confirmed falsification makes accountability available as an optional opportunity. Consequences apply to choices made with player-known information; an omitted material report produces a limited failure-forward disposition instead of pretending the player knowingly failed.

Duty Reports select a preferred capable officer, another capable officer, or an explicit fallback using authored routes. The planner returns one player-safe disclosure packet. It does not narrate, mutate state, expose hidden text, decide for the player, or mark a report delivered.

## Player-Safe Projection

The data-only projection exposes only:

- visible objectives;
- separate required and optional counts;
- player-known visible facts;
- visible authored clocks with a known basis and consequence;
- materialized outcome dimensions;
- a terminal transition summary.

It omits world facts, hidden IDs and counts, predicates, evidence policies, report routes, spoiler guards, and diagnostics. The initial projection contains no Hesperus fraud language. The Hesperus clock is hidden until its passenger-risk basis is known. Revealing optional accountability does not change the current primary denominator.

No UI files or player-facing renderer were changed by this slice.

## Robustness Challenge

### What is robust now

- **Non-linear play:** state predicates, not step order, own activation and completion.
- **Model-order variation:** causal sorting makes equivalent claim sets reduce identically.
- **Hallucination containment:** unknown policies and mismatched target/type pairs are rejected.
- **Source mutation:** stale revisions and wrong swipe identities are rejected; accepted-source identity remains part of settlement provenance.
- **Hidden-information fairness:** undiscovered optional content is absent rather than failed, and only known information may support an informed-choice consequence.
- **Package drift:** an existing state cannot silently adopt a changed mission definition.
- **Tracking restraint:** one accepted scene may supply multiple evidence claims, but the mission definition derives high-value state instead of creating one tracker per mention.

### What is deliberately not claimed

- **Varied prose compatibility is not yet proven.** The deterministic core consumes semantic claims, not raw roleplay. A bounded provider interpreter must map free-form prose to authored policy candidates, and abstain when evidence is insufficient.
- **Duty Report delivery is not implemented.** Selection is proven; narration, scheduling, delivery acknowledgement, deduplication, and source settlement are not.
- **Accepted-pair activation is not implemented.** V1 must settle only the assistant response the player accepts by sending the next user message, with edits, swipes, deletes, and restore handled by source identity.
- **Aggregate domain projections are not implemented.** Ship, people, and story views must derive concise high-value summaries from the same settlement rather than reintroduce separate semantic writers.
- **Legacy writer retirement has not begun.** Current quest, phase, thread, technical-debt, and relationship writers remain active outside the future V1-native boundary.
- **The actual Mission UI has not been changed.** Wiring the approved projection to player-visible components requires the explicit UI approval gate.
- **Live SillyTavern behavior is not certified.** Provider interpretation, host lifecycle, report delivery, persistence, recovery, and prompt effects require rehearsal in isolated Directive soak profiles.
- **Only Prelude/Hesperus is V1-native.** The remaining Ashes missions still require conversion and campaign-level transition certification.

## Verification Evidence

The focused certification passed:

- Ashes migration inventory test and canonical `--check`: 54 reviewed mappings;
- V1 mission contracts, evidence policies, reducer, and state-spine runtime;
- Duty Report planner;
- Ashes Prelude 12-scenario matrix;
- player-safe mission projection;
- mission package linter;
- canonical Ashes Prelude validator: 5 objectives, 24 evidence policies, and 7 Duty Report routes.

The complete repository gate passed **248 checks** on 2026-08-09 in 191 seconds.

## Runtime-Cutover Entry Criteria

The next slice may consume these contracts only if it preserves the following boundaries:

1. interpret only an accepted assistant/user source pair and bind every proposal to its exact source revision;
2. give the interpreter only eligible authored policy candidates and require policy IDs in structured output;
3. allow abstention and treat model output as an untrusted proposal;
4. validate and reduce deterministically before any durable projection;
5. schedule and deduplicate Duty Reports without marking knowledge until an accepted delivery is settled;
6. derive one Story Settlement and concise domain aggregates instead of parallel per-mention trackers;
7. shadow-compare the V1 result before disabling legacy writers for V1-native scope;
8. stop at the UI approval gate before changing player-facing rendering;
9. prove source mutation and recovery, then rehearse and certify in isolated live-host profiles.

Until those gates pass, this slice is the authoritative V1 mission-data foundation, not the active live runtime.
