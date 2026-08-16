# Campaign Evidence Progression Hardening Design

**Date:** 2026-08-16

**Status:** Approved

## Problem

Directive accepted structurally valid but narratively unsupported evidence from the Utility interpreter. In the active Sam Vickers Prelude, two accepted assistant responses produced fourteen false durable claims, including completed Mission objectives, completed Ship milestones, encounters that never happened, and facts the narration never disclosed. A separate command-handover policy also defined completion too broadly: agreement about authority boundaries counted even though the narration later stated that practical handover work remained and the Hesperus interruption prevented it.

The reducer and Mission page behaved correctly given the accepted evidence. The defect is at the semantic-authority boundary: model-selected candidate IDs are checked for authored identity, source custody, and state eligibility, but the selection does not carry source-grounded evidence and several authored terminal candidates become eligible before their causal story stages.

## Goals

- Make every durable semantic claim demonstrably grounded in its authorized accepted source.
- Fail closed when an interpretation resembles broad candidate over-selection.
- Ensure every Ashes of Peace objective can progress or terminate only through authored causal prerequisites.
- Preserve the single accepted-pair Utility call and deterministic state reduction.
- Repair the active Sam Vickers save without altering its narration or unrelated accepted state.
- Preserve replay, swipe, edit, branch, and accepted-pair authority semantics.

## Non-goals

- A second model review call.
- Model-specific prompts, compatibility tables, or provider exceptions.
- Regex-based narration adjudication.
- A new mutable mission authority or sidecar tracker.
- Retroactively rewriting chat prose.
- Exposing internal evidence excerpts as a new player-facing UI feature.

## Architecture

### 1. Grounded interpretation selections

Every Mission, Ship, and Cohesion selection returned by `acceptedPairMissionEvidence` must include `evidenceQuote`, a verbatim excerpt of 12 through 240 characters from its authorized source slot after whitespace normalization. People events must include the same source grounding because they share the durable interpretation boundary.

The interpreter parser normalizes whitespace only for comparison and rejects a selection when:

- the quote is empty or outside the bounded length;
- the quote does not occur in the selected source text;
- the selected source slot is unauthorized;
- the response exceeds the conservative durable-claim budget.

Accepted evidence retains the bounded quote and a stable quote hash for auditability. The quote is provenance, not a second authority: authored policies and deterministic predicates still decide what the claim can affect.

### 2. Fail-closed interpretation budget

The current maximum of sixteen mission selections allows a malformed response to touch many unrelated progress tracks. A single accepted pair may select at most four durable semantic claims across Mission, Ship, Cohesion, and People observations. More than four selections rejects the interpretation as invalid output before any state is persisted. Time is part of the rejected interpretation and is not committed independently.

Four supports ordinary responses that disclose a fact, record one event or outcome, and capture a bounded People observation while preventing the six- and eight-claim bursts observed in the incident. Campaign fixtures must demonstrate any intentionally dense culmination without weakening this global boundary; if a scene contains more durable changes, later accepted pairs can recognize the remaining state.

### 3. Authored causal progression gates

All thirteen Ashes of Peace mission definitions receive a terminal-authority audit. For every objective:

- `activationWhen` establishes when the objective exists for the player;
- `progressWhen` references evidence that proves actual progress rather than intent or planning;
- each `terminalWhen` disposition references an authored terminal result;
- the terminal result's evidence policy is unavailable until its required prior story stage is already present in accepted state;
- one interpretation cannot invent a prerequisite and consume it as a terminal gate in the same pair.

Atomic outcomes, such as an explicit player decision, do not need artificial multi-step ladders. Causally staged outcomes, including arrival, rescue, investigation, custody, handoff, readiness, and system validation, require prior accepted-stage evidence.

The campaign audit is enforced by a linter rule: every required or conditional objective terminal predicate must trace to at least one evidence policy whose `when` predicate contains a nontrivial causal prerequisite, unless the policy is explicitly classified as an atomic player decision. Definitions that expose terminal assistant outcomes under `when: true` fail certification.

### 4. Prelude corrections

The Prelude receives explicit corrections in addition to the generic contract:

- Command handover completes only after Whitaker explicitly closes the handover or transfers the XO watch/authority. Discussion of boundaries, player agreement, or occupying the XO chair is insufficient.
- Senior-staff readiness derives from accepted readiness/delegation exchanges with the authored senior-staff roles. A single isolated order, report, comm call, or shared bridge scene cannot complete it.
- A Hesperus contact stage must be accepted before rescue-result candidates are exposed.
- Rescue cost is available only after an accepted terminal rescue result and cannot independently imply rescue completion.
- Hesperus record review requires actual maintenance-record evidence, not registry, route, ownership, or general vessel information.

### 5. Evidence acceptance and replay

Candidate creation continues to use the pre-interpretation mission state. Evidence validation evaluates policy eligibility against that same base state for high-impact terminal claims, preventing claims in one proposal from unlocking later terminal claims in the same proposal. Ordinary fact-disclosure chains that are intentionally atomic remain supported only when declared as such in the authored policy.

Replay uses the stored evidence log and deterministic reducer exactly as before. New quote provenance is validated structurally during authority reconstruction. Source-text membership is checked when evidence first crosses the accepted-pair boundary, where the selected source is available.

### 6. Live-save repair

The repair targets only active save `save.1786851317628.1`, campaign `campaign-1786395087827-1`, package `directive:campaign-package:breckenridge-ashes-of-peace` version `0.3.0-pre-alpha.1`, and bound chat `Ashes of Peace - ReadyRoom continuation 3 - Branch #2`.

Before mutation, copy the exact index, manifest, base, referenced segments, bound chat, and timeline-operation journal into one timestamped backup directory. Guard the repair with the expected save ID, player name, package identity, chat binding, contribution IDs, source message hashes, and unsupported claim set.

Remove the unsupported evidence tied to:

- `contribution.v1.eb870bc9` for premature command-handover completion;
- `contribution.v1.f31b2dac` for false staff readiness, Sickbay, poker invitation, and Ship milestone claims;
- `contribution.v1.a8f4f5a6` for false poker, Hesperus records, rescue, undisclosed facts, and Ship milestone claims.

Remove only corresponding Story Settlement effects, rebuild Mission authority from the remaining evidence, and preserve accepted-pair receipts, narration contributions, time evidence, People state, and unrelated effects. Persist through the segmented repository so hashes, revisions, and the index remain valid.

## Error handling

- Missing or mismatched evidence quotes return `invalid-output`; no semantic state is committed.
- Excessive durable claims return `invalid-output`; no partial subset is accepted.
- Invalid campaign progression definitions fail package certification and runtime asset loading.
- A live-repair guard mismatch stops before mutation.
- A write or verification failure leaves the pre-repair backup intact and reports the exact failed artifact.

## Testing

- Parser/schema tests for required quotes, source membership, bounded length, duplicate high-impact quote reuse, and the four-claim budget.
- Evidence-contract tests proving terminal claims use base-state eligibility rather than same-proposal unlocking.
- Exact transcript regressions for the three incident responses; none may complete handover, staff readiness, Hesperus rescue, Sickbay, poker, or Ship work.
- Positive tests for genuine handover closure, staff-readiness completion, Hesperus contact then rescue, and completed Ship validation.
- Linter certification across all thirteen Ashes of Peace mission definitions and all existing authored scenarios.
- Replay, invalidation, swipe, edit, and branch reconstruction tests.
- Active-save validation with `assertV1CampaignState`, Mission authority validation, and `buildV1RuntimePlayerProjection` after repair.
- Installed-source hash parity and a live Mission/Ship projection check after synchronization.

## Release

Commit the design, implementation, campaign-definition audit, tests, and guarded repair tooling in scoped commits. Run focused tests, the full `npm.cmd test` gate, `git diff --check`, installed artifact parity, and active-save projection validation. Push `main` only after all checks pass while leaving unrelated dirty work untouched.
