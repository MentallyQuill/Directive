# Ashes objective audit

The matrix covers all 13 authored missions and 50 objectives. The controlled corpus runs 56 cases and 166 accepted-state steps through the production predicate evaluator. This is authored-rule review and deterministic predicate verification, not semantic model evaluation, correction-runtime verification, or live play validation.

Run from the repository root:

```powershell
node tools/scripts/test-objective-support-matrix.mjs
```

The checker verifies complete source coverage, CRLF-to-LF normalized source hashes, snapshot fields, objective identities, pattern/case links, activation, availability, visibility, progress and ordered terminal predicates, negative and accumulated positive steps, and fixture serialization. Source drift fails rather than silently replacing reviewed annotations. The previous inventory hashes differed from this checkout; every snapshotted authored field compared equal before the CRLF-to-LF normalized source hashes were refreshed. The prior hashes remain recorded. No campaign definitions changed.

## Reviewed semantics

- Prelude event objectives resolve on the settled handover/readiness event. Rescue failure additionally requires the authored informed-risk facts and decision; omitted-report failure maps to handoff. Final readiness requires both readiness and arrival. Rhee custody requires independent evidence, a custody disposition, and the executed custody event.
- Chapters 1 and 2 primarily use outcome-valued alternatives. Their optional shared-record/framework objectives award Command Bearing but do not gate closure. Starting relief, preserving one baseline, or stating a plan is partial evidence.
- Chapter 3 distinguishes accumulated disclosures from relay/archive custody. Its informed failure gate includes prior knowledge and a decision; ordinary adverse results do not by themselves establish informed failure.
- Chapters 4 and 5 combine several operational results with disclosure/evidence-route objectives. Broad cost fallbacks overlap successful routes: first authored match must win. Completing one operational front must not close its compound objective.
- Chapter 6 requires both Farwatch disclosures and three evidence/authority/information results. The network value `handedOff` deliberately maps to `completed`; value names are not generic dispositions.
- Chapter 7 settlement is compound: agreement, an implementation mechanism, annex control, and coalition posture. Agreement alone is not implementation.
- Chapter 8's five fronts each require an accepted account and its result. Report events establish progress, not necessarily resolution. Closure requires all five objectives, including degraded authored dispositions.
- Epilogue position statements require the shared settlement account. A stated position alone cannot resolve authority/accountability; aftermath and command review are disclosure objectives.
- Open Orders 1 and 2 require explicit declined engagement plus conclusion to resolve an unpursued opportunity as declined. Open Orders 3 deliberately also permits pending engagement at departure when the result remains pending. Their optional rewards do not gate closure. Open Orders 2 and 3 transitions additionally require the credential-path/distributed-readiness fact respectively.

## Dependency and implementation concerns

The matrix records direct closure requirements and exact award IDs per objective. It also records conservative shared-reference candidates through evidence policies, outcome dimensions, reports, terminal dispositions, and transitions. A shared reference is a review lead, not permission to delete every shared fact: other objectives may legitimately use the same accepted evidence.

Correction reconciliation must preserve valid partial progress, retract only attributed effects, and re-evaluate closure, pending transitions, reports and dimensions. Outcome-driven dimensions can survive a checkbox-only correction incorrectly. Player-selected resolution should establish the authored disposition without inventing detailed outcome events to make a predicate true.

Conditional visibility is distinct from terminal truth. The corpus now checks all four lifecycle predicates after every step; gated objectives include blocked and prerequisite-established states. These checks do not prove the UI hides controls or that correction commands enforce visibility. Likewise, JSON roundtrip proves fixture serializability only, not checkpoint/reload precedence. The correction, storage, notification, stale-response and host-lifecycle suites must supply that evidence. Rewards, optional closure behavior and transition effects remain classification-only. The terminalMatch field reports ordered predicate matching, not an executed reducer transition.

The corpus deliberately labels synthetic prose and accepted deltas separately. Its negative examples assume no accepted claim for a plan, question, negation or temporary stabilization. A provider's ability to make that distinction remains unmeasured. Generated positive witnesses cover each objective's completed route; five additional reviewed cases cover informed failure, handoff, later-chapter authored mapping, cost-fallback precedence and unengaged departure. The corpus does not exhaust every allowed outcome value or every non-success route.

Regenerate snapshots with node tools/scripts/generate-objective-support-matrix.mjs. This preserves annotations and case expectations, marks changed mission sources pending review, and leaves stale corpus hashes to fail the checker.
