# Reliable, Correctable Objective Progress

Status: implemented for controlled verification and draft review. All Ashes objectives are mechanically classified; live-model accuracy and player correction burden remain unvalidated. See the [audit](../testing/OBJECTIVE_PROGRESS_AUDIT.md) and [verification record](../testing/OBJECTIVE_PROGRESS_VALIDATION.md).

This document is the acceptance contract for a general Directive feature. The companion [Ashes objective inventory](../testing/ashes-objective-support-matrix.json) captures the current authored definitions for later classification and executable tests. Neither document is runtime authority.

## Product intent

Directive performs bookkeeping automatically. Cooperative players can correct its judgment without arguing with the narrator, repeating completed scenes, or fighting automatic reversals. Success means both fewer false resolutions and fewer missed legitimate resolutions, with occasional rather than routine player intervention.

This is not an anti-cheating system. Player decisions made through objective controls are authoritative. Ordinary player prose remains contextual evidence, not an unconditional command to mark success.

## Scope and explicit boundaries

- Apply to whichever mission occurrence is currently active, across all chapters and conforming campaigns.
- Use campaign-authored objective dispositions; do not hardcode Hesperus, rescue outcomes, or prelude identifiers in production logic.
- Support visible objectives only through player controls. Do not reveal hidden objectives or hidden outcome routes.
- Introduce a clean state contract. No old-save migration, compatibility adapter, automatic historical reassessment, or legacy preservation work is required.
- Direct adjustments cover the current mission. Earlier missions are corrected through checkpoint recovery, not cross-chapter rewriting.
- Preserve automatic tracking and its ordinary one-interpretation-call budget. No mandatory second-model verifier or pre-narration outcome adjudicator is part of this feature.
- General director planning, campaign-wide retrieval, and replacement People extraction are separate features.

## Decision semantics

The persisted decision must identify campaign/branch, mission occurrence, objective, disposition, origin, tracking policy, source evidence/proposal identity, and revision. Exact field names and schema version are implementation decisions; these semantics are required.

| Action | Required result |
| --- | --- |
| Automatic supported resolution | Resolve through canonical progression and publish evidence-backed feedback. |
| Player selects a resolution | Persist that authored disposition as player-set. Automatic interpretation cannot replace or reopen it. |
| Player selects Still underway | Retract the mistaken resolution and its dependent effects. Preserve valid partial progress. Require confirmation for later completion proposals. |
| Same rejected evidence reappears | Do not repropose, resolve, or notify again. Paraphrasing the same event is not new evidence. |
| Materially new evidence follows reopening | Offer one nonblocking resolution proposal. Keep current status until the player accepts. |
| Player resumes automatic tracking | Restore normal tracking prospectively. Do not immediately recycle previously rejected evidence. |
| Player dismisses notification | Dismiss presentation only; do not change objective state or accept a proposal. |

Reconstruction and reload must preserve these decisions. Late model responses must revalidate against current decision/state revisions before applying. Decisions belong to a mission occurrence, not globally to an objective ID. A branch inherits only the decisions present at its fork/checkpoint.

Manual resolution establishes the selected disposition; it must not fabricate detailed historical actions, NPC dialogue, or unrelated facts to justify it.

## UI contract

- Mission objective cards provide Adjust progress, applicable player-safe resolutions, and Resume automatic tracking.
- Player-set resolution shows Set by you. A reopened objective explains that completion needs confirmation.
- Automatically resolved objectives expose a collapsed explanation and supporting accepted-message reference where supported by the host.
- Automatic completion notifications offer Still underway for an exact objective. Grouped notifications offer Review objectives instead of ambiguously changing several objectives.
- Corrections retire obsolete notifications. Relevant new proposals after correction may emit one quiet Review notification; the proposal remains on the Mission card.
- Confirmation is inline and nonblocking. No confidence scores, recurring modals, or questions after every turn.
- Notification and Mission actions invoke the same runtime command. Pending and failed persistence states must be visible; do not show success before commit.
- Controls must remain usable by keyboard and on narrow/mobile layouts, with focus restored after dialogs and no dependency on hover.

## Required integration boundaries

| Boundary | Acceptance obligation |
| --- | --- |
| Interpreter and candidate selection | Receive correction context; distinguish attempt, partial result, settled result, and genuinely new evidence. |
| State spine, reducer, mutation gateway | Commit decisions and derived changes consistently; preserve precedence on replay; reject stale actions. |
| Mission and Campaign projections | Agree on disposition, pending proposals, and progress without independent status stores. |
| Rewards / Command Bearing | Award once; reconcile attributable effects without duplicate awards on reopen/recomplete. |
| Mission journey / conclusion / duty reports | Prevent unsupported pending transitions and downstream reports; enforce current-mission correction scope. |
| Narration packet / story summaries | Supply corrected state; prevent retracted completion from continuing as authoritative story context. |
| Ship and People | Reconcile only effects dependent on the corrected result; retain unrelated established progress. |
| Storage / checkpoints / branches | Persist decisions and rejected proposals and restore the selected timeline consistently. |
| SillyTavern lifecycle | Cover edits, swipes, duplicate events, chat changes, reloads, and in-flight model responses. |
| Notifications | Deduplicate by decision/proposal identity, honor preferences, retire obsolete actions. |
| Diagnostics | Explain origin, evidence, correction, revision, and resulting effects without leaking hidden facts. |

Before implementation, specify handling for a spent reward and a transition that becomes active while a correction dialog is open. Never silently create a negative balance, rewind later play, or merely change a UI checkbox. Revalidate scope at commit time. These are unresolved design cases, not implicitly supported behaviors.

## Ashes audit procedure

1. Regenerate the structural inventory from every bundled `.mission-v1.json` file, recording source hashes and repository revision.
2. Classify every objective by predicate behavior, not only narrative labels such as rescue or investigation.
3. Review each unusual structure and each objective referenced by mission closure, rewards, or transitions. Inspect indirect dependencies through events, outcomes, and outcome dimensions as well as direct objective references.
4. Review interpretation guidance against terminal requirements. Flag missing, ambiguous, contradictory, or overly narrow completion criteria.
5. Select real examples from early and later chapters for each distinct structure. Include an independent campaign fixture with different identifiers.
6. Attach controlled positive/negative sequences and reviewed expected outcomes. Every objective must map to a supported pattern; every pattern must map to executable cases.

Initial classification vocabulary: single-event resolution; outcome-valued resolution; compound requirements; accumulated evidence; multiple dispositions; conditional activation/visibility; optional objective; objective dependency; reward dependency; mission closure/transition dependency. Extend only when the actual definitions require it. Structural detection does not prove semantic coverage.

## Machine-readable corpus contract

`docs/testing/ashes-objective-support-matrix.json` is an initial source inventory, not a completed support declaration. Its objective definitions and associated mission rules are source snapshots; campaign files remain the source of truth.

Each mission records path, SHA-256 of UTF-8 source text with CRLF normalized to LF, definition identity/version, and authored evidence, reward, closure, outcome-dimension, and transition rules. Each objective records its exact definition, predicate operators, structural tags, and an explicitly pending review disposition.

During review, populate each objective's `review` with semantic findings, supported pattern IDs, case IDs, and dependency findings. Populate top-level `patterns` and `cases` with reviewed definitions and expectations. Do not mark coverage complete merely because inventory extraction succeeded.

Each eventual test case must identify: stable case ID; source mission/objective and definition hash; initial accepted state; ordered transcript/action steps; provider fixture when applicable; expected and forbidden changes after each step; correction precedence; notification expectations; and persistence/reload expectations. Synthetic language must be labeled synthetic. Preserve the distinction between mechanical tests and semantic model evaluations.

Source hash drift requires regeneration and review of affected mappings. Keep generated snapshots separable from reviewed annotations so regeneration cannot silently discard review work. The generator and support-matrix check verify source coverage, hashes, identifiers, pattern mappings, and executable case references. See the verification record for the distinction between predicate coverage and semantic evaluation.

## Acceptance scenarios

| ID | Required behavior |
| --- | --- |
| RP-01 | Plans, orders, questions, negation, predicted success, and temporary stabilization do not count as settled resolution. Include authentic quotes supporting the wrong conclusion. |
| RP-02 | Legitimate completion, failure, and handoff resolve correctly using authored options, including evidence spanning turns. |
| RP-03 | Reopen an incorrect resolution; preserve partial progress and reconcile dependent pending effects. |
| RP-04 | Repeated discussion, paraphrases, duplicate events, reload, and replay cannot restore rejected completion or repeat its notification. |
| RP-05 | Materially new evidence after reopening creates one confirmation proposal; ignoring it leaves status unchanged. |
| RP-06 | Explicit player completion survives later interpretation, reload, and reconstruction without invented supporting history. |
| RP-07 | Accept a later proposal; rewards and transitions occur exactly once, including after retry. |
| RP-08 | A correction made during an outstanding model call wins over its stale response. |
| RP-09 | Swipes, edits, chat switches, and checkpoints respect source and branch identity. |
| RP-10 | Optional/conditional objectives and non-success dispositions preserve player-safe visibility and campaign rules. |
| RP-11 | Transition into a later chapter and repeat the controls successfully; reject stale correction of the prior mission. |
| RP-12 | Independent campaign identifiers and structures use the same production pipeline without campaign-specific branches. |
| RP-13 | Notification and Mission actions produce identical canonical results; grouped notices target objectives unambiguously. |
| RP-14 | Persistence failure shows recoverable feedback and never claims an uncommitted correction succeeded. |

## Verification stages and cost boundary

Development: deterministic fixtures, reviewed transcript cases, mocked provider results, and controlled Playwright tests for UI, saved state, reloads, races, and notifications. No paid live-model calls are authorized by this document.

Dedicated live stage: after development is sufficiently mature, the user configures providers/models and explicitly authorizes live testing. Exercise the actual installed SillyTavern extension with a separate soak campaign/player. Capture accepted transcript, relevant state, browser trace, and timing; classify failures and convert them to regression cases. A model evaluator alone is not ground truth.

Measure false resolutions, missed legitimate resolutions, correction frequency, repeated mistakes after correction, proposal frequency, send-to-first-visible-narration latency, and calls/tokens per turn. Numeric release thresholds require an observed baseline and explicit selection; no unmeasured accuracy or latency claims.

Completion labels must distinguish structural inventory captured, semantic corpus reviewed, controlled implementation verified, and live-model play validated.

Codex operating constraint: retain at least 75% remaining usage; stop starting new segments at 80% remaining to leave a handoff buffer. Check shared account usage between segments. This is a best-effort operating rule, not an enforced account cap. Do not redeem reset credits.

## Implementation readiness checklist

- [x] Every Ashes objective classified and unusual dependencies reviewed.
- [x] Pattern/case mappings populated, including later chapters and an independent campaign.
- [x] Spent rewards, pending transitions, stale dialogs, and tracking-mode changes have explicit semantics.
- [x] Exact new state contract and corpus schema selected without backward compatibility.
- [x] Controlled verification plan covers all integration boundaries above.
- [x] Implementation delivery boundary agreed; this specification does not authorize merging, deployment, or live model spend.
