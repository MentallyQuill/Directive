# Structural pacing implementation plan

**Goal:** Protect playable scenes throughout Ashes of Peace using the existing accepted-pair Utility call, with no additional model calls.

**Architecture:** Campaign objectives own participation requirements. The existing Utility interpretation observes the accepted assistant/player pair and proposes scene focus, participation, unresolved matters, and departure intent. Source-bound accepted-pair receipts retain these observations. Local gates derive permissions for the next narration, objective evidence, reports, and transitions. Missing or uncertain pacing observations keep the scene open. This is structural enforcement, not a pre-display semantic review of generated prose.

**Constraints:** Preserve native SillyTavern narration and provider ownership. Do not add a generation role or call. Do not mutate default-user chats, saves, or the running installation. Preserve replay, swipes, branch identity, and player-set objective corrections. Minimum participation is a guard only; it never automatically closes a scene. Explicit player departure, delegation, refusal, and compression remain available. Existing completed evidence is not erased on upgrade.

## Tasks

- [x] Author and validate participation requirements for all 50 objectives, with separate phase gates for the opening disturbance.
- [x] Build pure pacing observation validation and source-bound receipt reduction. Test ordinary conversation, evidence quotes, malformed output, departure, delegation, completion, and replay.
- [x] Extend the existing Utility request/schema with bounded pacing observations. Reuse its call budget, cancellation, parsing, and persistence retry paths.
- [x] Enforce pacing against objective evidence and mission departure; persist observations with accepted-pair receipts and invalidate dependent observations when sources change.
- [x] Project one current scene into the narrator prompt and gate pending reports/transitions. Keep hidden objective information out of the prompt.
- [x] Verify the actual runtime path with scripted Utility outputs and exact call-count assertions, then run the repository gate and review the combined diff.

## Acceptance

The first reply to Whitaker does not release Hesperus. Broad orders do not create participation or complete substantial objectives. A supported resolution may complete an objective while the scene remains open for aftermath. Explicit player departure can release the scene without falsely completing unfinished objectives. Future plot reports cannot displace an open scene merely because they are urgent. Reload/retry/replay does not duplicate participation or calls. No new model role or automatic semantic review loop is introduced.

## Implemented contract

Each of the 50 objectives has two authored participation requirements. The existing Utility response identifies the current objective, relevant quotations from both speakers, unresolved discussion, and explicit player intent. Two distinct accepted player messages are a minimum guard; satisfying that guard does not automatically resolve the objective. A source-backed choice to resolve, delegate, or compress authorizes a subsequent supported result. Refusal and responsible withdrawal retain their authored dispositions.

The three overarching Open Orders conclusions remain exclusively player-owned decisions. Their existing policies already require completed assignment work or an explicit early departure with its costs. This preserves the ability to decline local work or conclude an interval; each individual assignment still has its own participation gate.

Findings and completion are separate. All 84 report routes name the scenes to which they belong, including findings that introduce an optional investigation before its objective unlocks. Runtime-only authorization outcomes gate objective completion without withholding the evidence needed for discussion. Authorization can be revoked; repeated authorization changes have distinct source identities. Objective correction owns the authorization evidence and starts a new participation history.

Completed objectives can remain in conversation. Scene departure and mission departure are separate player intents, and both transition preparation and activation respect the mission boundary. The first accepted pair activates the new internal authority fields; existing completed evidence replays without retrospective pacing requirements. Source edits retract dependent authorizations, completion, and later mission transitions.

Pacing adds bounded input/output to the existing Utility call and local state bookkeeping. It adds no generation role or model call. Its bookkeeping is excluded from the conversation counter that schedules existing episode reviews, so it does not accelerate that review cadence.

## Verification and limits

Six new pacing test scripts cover all authored objectives and report memberships, the full accepted-pair runtime, exact call counts, post-completion conversation, explicit transition and successor narration, source invalidation across a transition, saved-state authority, reopen/resume, and delegation/revocation/redelegation. Existing historical repair and plumbing tests use explicit unpaced fixtures; the campaign's original lifecycle predicates and controlled-corpus expectations remain unchanged.

The 181-check repository gate passed, including browser checks and 300 authored campaign scenarios. Code review findings on report deadlocks, withdrawn permissions, objective corrections, transition source identity, and save compatibility were addressed with regressions. The final review-cadence adjustment also has a dedicated runtime assertion.

Final-tree verification passed all 181 checks across the gate run and continuation: the expanded-interface visual-conformance test hit its pre-existing intermittent timeout at line 1810, then passed its isolated retry (25 route/viewports and the approved modal). The other 180 checks passed without a failure on the final implementation.

These are deterministic and scripted-provider checks. The Utility model still judges the meaning of quoted dialogue, and generated narration is not semantically screened before display. The gates constrain accepted progression and future direction; they cannot promise that every generated sentence will have good pacing. No live installation, default-user save, or chat was changed.
