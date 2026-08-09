# V1 Mission Transition Readiness

Status: **deterministic non-UI transition authority ready; Ashes successor content, visible presentation, narrator installation, and live certification remain incomplete**

Date: 2026-08-09

## Certified Scope

Directive now has one deterministic path from accepted mission evidence to a terminal receipt, one exact successor activation, and causal recovery after a source edit, delete, swipe, or branch exclusion.

The implemented state boundary is intentionally small:

- `mission.v1` is the one current mission state;
- `mission.v1History` contains terminal archived mission states only;
- `mission.v1Journey` owns the branch-local journey revision and active run identity;
- the terminal mission's transition receipt is the sole target authority;
- Story Settlement remains the sole semantic story authority;
- legacy mission graphs, quest rows, thread rows, ship issues, relationship moments, Command Log entries, and Command Bearing do not become parallel transition authorities.

When a terminal receipt names exactly one valid V1 mission definition in the same package version, State Delta Gateway performs one atomic transaction that archives the terminal source, creates a fresh target state, advances the journey, updates the compatibility active-mission pointer, and seals the source Story episode. A missing, ambiguous, unsupported, cross-package, self-referential, or phase target remains durably pending. The runtime never guesses from the legacy mission graph.

An internal pure diagnostic can inspect a pending transition, and an explicit internal recovery method can activate it when the exact target definition later becomes available. Neither method calls a model. Recovery activation replaces mission fields rather than deep-merging a terminal source into a fresh target.

Source mutation crosses the same authority boundary. Directive locates an archived owner by exact contribution identity, rebuilds it from surviving accepted evidence without a model, preserves earlier journey history, removes descendant mission runs and current Story material, and either reopens the source or creates one fresh successor activation epoch. A Story-only source with no mission evidence repairs Story Settlement without rolling progression back.

The transition narration seam is also implemented but inert. It can prepare a bounded player-safe packet, strict candidate and review contracts, one-retry policy, and deterministic authored fallback. It does not call a narrator, install a prompt, post a message, schedule a transition, or mutate state.

## State and Control Flow

```text
accepted evidence
    -> deterministic reducer selects terminal disposition and authored receipt
    -> exact target resolver
        -> exact V1 mission available: archive source + activate fresh target atomically
        -> unavailable/invalid/phase target: preserve terminal source as pending
    -> optional internal narration preparation from committed player-safe state

source mutation
    -> resolve exact contribution owner across current and archived runs
    -> rebuild owner from surviving evidence
    -> prune descendant mission runs and Story material atomically
    -> reopen source, preserve pending closure, or activate one fresh successor epoch
```

## Evidence and Robustness Matrix

| Risk | Implemented boundary | Verification |
| --- | --- | --- |
| Narration chooses progression | Only the deterministic reducer creates a terminal receipt; only exact authored target resolution activates a successor. | `test-v1-mission-reducer.mjs`, `test-v1-mission-runtime.mjs` |
| Duplicate activation | Run identity is deterministic and branch/package/definition/revision bound. Replay sees the new active mission and cannot archive the source twice. | `test-v1-mission-journey.mjs`, `test-v1-mission-runtime.mjs`, `test-v1-mission-transition-runtime.mjs` |
| Stale source fields bleed into target | Activation uses whole-field State Delta Gateway `set` operations, not recursive object merge. Fresh target authority is revalidated after persistence and restart. | `test-v1-mission-transition-runtime.mjs` |
| Missing or malformed target | Missing, ambiguous, self, cross-package, phase, and unsupported targets return bounded pending reason codes. No legacy fallback or invented state is allowed. | `test-v1-mission-journey.mjs`, `test-v1-mission-transition-runtime.mjs` |
| Package or definition drift | Current and archived states require exact package ID/version and definition ID/version. Missing archived definitions fail before mutation. | `test-v1-mission-journey.mjs`, `test-v1-mission-journey-rebuild.mjs` |
| Save/reload drift | Journey, archive, transition receipt, run lineage, and repaired state validate after JSON round trip. | `test-v1-mission-journey.mjs`, `test-v1-mission-transition-runtime.mjs`, `test-v1-mission-journey-rebuild.mjs` |
| Edit/delete/swipe after closure | Historic contribution custody rebuilds the affected archived run and prunes every descendant mission run in one transaction. | `test-v1-mission-journey-rebuild.mjs`, `test-message-reconciler-source-mutation.mjs` |
| Story remains ahead of mission | Causal Story rollback preserves earlier material, scrubs the affected cutoff and descendants, removes them from player and prompt projections, and records compact invalidation receipts. | `test-v1-story-supersession.mjs`, `test-v1-mission-journey-rebuild.mjs`, `test-v1-projection-rebuild.mjs` |
| Unrelated story edit rewinds campaign | A contribution with no mission evidence repairs Story Settlement only. | `test-v1-mission-journey-rebuild.mjs`, `test-v1-source-mutation-runtime.mjs` |
| Restored source mistaken for duplicate | Invalidated mission and Story receipt custody advances the contribution epoch before a restored source can settle again. | `test-v1-source-mutation-runtime.mjs` |
| Persistence conflict | Ordinary persistence failure restores prior state. Concurrent rollback conflict returns indeterminate, reconciliation-required status rather than claiming success. | `test-v1-mission-transition-runtime.mjs`, `test-state-delta-gateway.mjs` |
| Hidden-state leakage into narrator | Preparation includes only committed player-known summaries, visible typed effects with player-safe summaries, authored next setup, and explicit narrator guardrails. It excludes evidence logs, raw transcript, hashes, manifests, provider diagnostics, inactive objectives, and legacy trackers. | `test-v1-mission-transition-narration.mjs` |
| Narrator alters outcome or target | Candidate JSON is bounded to transition identity and prose. Structured review can accept, reject, or request one retry; all non-accepted terminal paths use the authored fallback. | `test-v1-mission-transition-narration.mjs` |
| Tracking spam | Transition, recovery, and narration preparation do not create ship, relationship, quest, thread, Command Log, or Command Bearing entries. | `test-v1-mission-runtime.mjs`, `test-v1-mission-journey-rebuild.mjs` |

## Adversarial Review Findings

Two Important issues were found and fixed before this certification:

1. A normal state patch recursively merged a fresh successor over a terminal source. Source-only nested values could survive into the target. Successor activation now uses explicit whole-field replacement operations.
2. Mission run identity initially used a 32-bit digest. Authoritative run and activation-epoch identities now use a 96-bit SHA-256-derived key and include the source mission revision.

The review also challenged duplicate activation, pending-target recovery, missing archived definitions, self and cross-package targets, phase targets, restart, persistence rollback, historic edits before and after closure, same-mission Story ordering, descendant pruning, branch isolation, narrator failure, hidden leakage, and unrelated tracking roots. No unresolved Critical or Important non-UI finding remains in this slice.

## Verification Record

The final post-hardening complete alpha gate passed:

```text
node tools/scripts/run-alpha-gate.mjs
Exit code: 0
270 checks
188.7 seconds
```

Focused journey, mission runtime, transition recovery, historic rebuild, source mutation, narration packet, Story supersession, projection, host injection, message reconciler, and State Delta Gateway suites also passed during implementation and adversarial review.

## Ashes Migration Boundary

The canonical Prelude transition already names `chapter-1-the-empty-convoy`, but only Prelude/Hesperus currently has a V1 mission definition. The existing Chapter 1 mission graph, campaign projection, quest records, and legacy package content are migration inputs, not a valid V1 target.

Therefore a completed Prelude remains durably pending until `chapter-1-the-empty-convoy` receives a complete V1 definition and package registration. The runtime must not activate the legacy graph, copy its objective rows into `mission.v1`, or weaken exact target validation to make the transition appear complete.

The next content slice must migrate `chapter-1-the-empty-convoy` against the proven contracts: spoiler-safe player text, non-linear objectives, evidence policies, fair knowledge routes, clocks if genuinely authored, mixed terminal dispositions, exact transition targets, narration guardrails, mutation fixtures, and save/reload proof.

## Deliberate Non-Claims and Residual Risks

- No visible Mission-page transition, completion treatment, campaign notification, or chat narration has been implemented.
- No transition narration is generated, reviewed, delivered, or marked consumed. The preparation contract is diagnostic-only; delivery custody and scheduling belong to the later prompt-authority cutover.
- Archived V1 definitions must remain available at their pinned versions for journey validation and historic reconstruction. Package cleanup cannot delete them while saves can reference them.
- V1 intentionally forbids activating the same definition twice in one journey. Reusable procedural missions require a future explicit instance/template contract.
- Phase targets remain pending until a typed, versioned V1 phase-state contract exists.
- Prelude's authored successor is not yet V1-native, so Ashes does not yet provide a complete V1 mission-to-mission play path.
- The legacy Mission Director and graph writers are not retired by this slice. Prompt-authority and exact-scope legacy retirement remain separate cutover work.
- Deterministic gates do not replace the isolated 20-turn strict rehearsal or the 25-turn/five-user certification. Overall V1 completion remains blocked on content migration, approved UI integration, legacy cutover, and those live runs.

## Explicit UI Approval Boundary

This readiness work does not authorize visible UI changes. The following remain stopped pending the user's explicit UI approval:

- present completed, pending, or newly activated mission states on the Mission page;
- decide how completed objectives, optional outcomes, mixed dispositions, or unavailable successors appear;
- render transition narration or fallback prose in chat;
- add notifications, badges, progress bars, completion popups, or acceptance controls;
- alter the five-route information ownership or duplicate transition information across pages;
- change mobile or desktop layouts.
