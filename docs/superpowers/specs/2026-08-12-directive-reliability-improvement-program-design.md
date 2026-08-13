# Directive Reliability Improvement Program Design

**Status:** Approved

**Date:** 2026-08-12

## Purpose

Make Directive's existing V1 systems trustworthy before expanding them. The program repairs accepted-pair settlement and time custody, reconciles semantic authority with SillyTavern source history, makes the authored Director routes reachable, corrects model-routing contracts, reduces avoidable model work, and certifies coexistence with the normal SillyTavern narration pipeline.

The program adds no new always-on model sidecars and no net-new per-turn model calls.

## Product Decisions

- Deliver the work as independently landable, dependency-ordered passes.
- Gameplay narration remains owned by SillyTavern's active main model and normal extension prompt pipeline.
- Directive supplies bounded campaign context, constraints, and accepted semantic state; it does not replace host narration.
- The Reasoning lane remains available only for Directive-owned auxiliary work. Character Creator continues to use it.
- The periodic episode evaluator is the only near-term candidate for reassignment from Utility to Reasoning, and only if fixture evaluation demonstrates a material quality improvement.
- Time, mission evidence, Story Settlement, and progression remain deterministic state-owned authority. Model output may make bounded proposals but may not mutate authority directly.
- A failed accepted-pair settlement is retried automatically at most two times after the initial attempt. Completed model output is checkpointed and reused; persistence retries must not repay completed model work.
- If settlement still cannot persist, narration is blocked and Directive presents an actionable manual retry. It may not continue with an unsettled turn.
- Existing V1 new-save-only boundaries remain in force. This program adds no legacy migration or parallel mutable tracker.

## Architectural Invariants

1. One accepted assistant/player pair has one semantic settlement identity.
2. Story Settlement, mission consequences, elapsed time, and Command Bearing become visible together or remain retryable together.
3. Bounded diagnostic or replay storage is never treated as the complete historical authority for an aggregate.
4. A retry resumes from the last durable checkpoint and never repeats a completed provider call.
5. Current visible chat source determines which accepted-pair contributions remain active.
6. The selected assistant swipe is the sole assistant source for a pair.
7. Main narration flows through SillyTavern so other extensions retain their normal prompt participation.
8. Model analysis cannot create facts, effects, time, or progression outside a closed deterministic contract.
9. Provider credentials and transport remain in SillyTavern-native custody.
10. Model-call growth is budgeted: zero net-new per-turn calls in this program.

## Delivery Passes

### Pass 1: Accepted-Pair Transaction and Generation Gate

Create one settlement coordinator around the existing V1 authority operations. The coordinator records a durable pending-settlement checkpoint containing:

- accepted-pair identity and complete source hash;
- bound campaign, save, chat, package, and branch identity;
- expected authority revisions;
- validated Utility proposal or a marker that no provider work was required;
- deterministic time decision and proposed authority effects;
- completion state for each persistence step.

The initial attempt may perform the shared Utility interpretation once. Persistence failures retry automatically up to two times using the checkpointed validated proposal. Retries re-read revisions, detect already-applied idempotency keys, and complete only missing writes.

Narration proceeds only after the settlement coordinator reports a durable committed result. Exhausted retries produce a bounded player-facing error with a manual Retry action. No provider response bodies or credentials appear in diagnostics.

Mutation and replay use the same coordinator semantics. An invalidation cannot remove time while leaving the related Story Settlement contribution active, or vice versa.

### Pass 2: Source Reconciliation and Durable Time

Separate the compact audit window from aggregate time authority. Persist a durable cumulative anchor plus retained reversible entries, or an equivalent representation that can reconstruct elapsed time without assuming the last 128 entries are the whole history. Invalidating any retained pair preserves the pruned historical total. Replaying an already-accounted pair remains idempotent.

Normalize SillyTavern visibility using all host-supported hidden/system markers, including `is_system`. Wire message-update events as well as send, receive, swipe, and delete paths. Reconciliation compares active accepted-pair identities with persisted contributions and invalidates authority that no longer has an active source.

Source hashes and footer extraction operate on complete accepted player and selected-assistant text. Text may be bounded only after identity and footer parsing, for prompt construction.

Prompt injection is cleared on every unbound or stale interceptor path. Correctness does not depend on an optional host filter.

### Pass 3: Authored Director Reachability

Trace each authored campaign route from production events through candidate generation, deterministic validation, settlement, and prompt projection. Every required route receives a production caller and a fixture proving reachability.

This pass covers:

- runtime-produced world facts such as the Hesperus fact;
- required Duty Report preparation and selected-swipe source custody;
- mission-transition packets injected into the next normal SillyTavern narration rather than generated by a Directive narration sidecar;
- non-mission accepted contributions that can create lasting story significance;
- inclusion of the active working capsule in the narrator's bounded prompt projection.

The Director selects or validates authorized beats; the main narrator renders them. No transition-prose generator or narrator-review sidecar is added.

### Pass 4: Model Contracts and Performance

Remove `narration` from Directive's provider-role registry and correct Settings, Runtime Map, and technical documentation. Rename the Reasoning lane description to auxiliary reasoning and authoring so it does not claim ownership of gameplay narration.

For the shared accepted-pair Utility call:

- filter impossible candidates deterministically before serialization;
- retain a closed candidate set and existing post-model validation;
- provide supported native structured schemas rather than relying only on prompt wording;
- enforce actual context and output budgets;
- propagate cancellation through the provider request;
- deduplicate logical host events after alias resolution;
- record privacy-bounded timing and token-envelope diagnostics.

Evaluate the periodic episode evaluator with authored fixtures on both lanes. Reassign it to Reasoning only if the predefined quality rubric improves materially without increasing call frequency. Otherwise it remains Utility. Never call both lanes for one review.

### Pass 5: SillyTavern Compatibility Certification

Certify the real installed interaction path, not only isolated modules:

- SillyTavern's active main model produces narration;
- the Directive preset and campaign packet participate through the canonical host path;
- representative simultaneous extension prompts remain present and correctly ordered;
- accepted-pair settlement completes before narration begins;
- transient persistence failures retry without another provider call;
- exhausted failures block narration and expose manual retry;
- swipe, edit, hide, delete, regeneration, reload, and replay converge on the same authority;
- provider selection changes do not expose secrets or stale prompt packets.

Compatibility fixtures will model Vectfox, Summaryception, Memory Books, and an unknown well-behaved extension prompt. The certification tests assert coexistence contracts rather than depending on private implementation details of those extensions.

## Settlement Data Flow

1. SillyTavern emits a logical player-message event.
2. Directive resolves aliases to one ingress identity and captures the selected accepted pair.
3. Source binding and complete-text identity are validated.
4. Directive loads or creates the pending-settlement checkpoint.
5. If the checkpoint lacks a validated proposal, the one shared Utility call runs and its validated result is durably checkpointed.
6. Deterministic reducers derive time, mission, story, and Command Bearing effects.
7. The coordinator persists missing authority steps with pair-scoped idempotency keys.
8. A read-after-write verification proves all intended roots agree.
9. On transient failure, steps 6-8 retry at most twice without repeating step 5.
10. Only a verified commit releases SillyTavern narration. Exhaustion blocks generation and exposes manual retry.
11. The normal SillyTavern main-model generation runs with all compatible extension prompts.

## Error Handling

Errors are classified as:

- **stale source:** abort without mutation and rebuild from the current selected pair;
- **revision conflict:** reload authority and resume idempotently;
- **transient persistence failure:** retry automatically up to two times;
- **invalid model proposal:** fail closed without applying any proposal;
- **provider unavailable:** block narration with a retryable bounded message;
- **non-retryable invariant violation:** quarantine the pending checkpoint, block narration, and export privacy-safe diagnostics.

Manual Retry resumes the same pending identity. A changed swipe, edited source, different chat binding, or different authority revision invalidates stale provider output and begins a fresh settlement only after source validation.

## Performance Budget

- Normal accepted pair: one Utility call plus one normal SillyTavern narration call.
- Persistence retry: zero additional model calls.
- Episode review: at most the existing periodic call frequency.
- Character Creator: unchanged user-initiated Reasoning workflow.
- No per-turn Reasoning critique, transition generation, duplicate extractor, or parallel story-memory call.
- Candidate prompts include only deterministically reachable items.
- Fixed prompt material receives explicit size and timing regression budgets.

## Test Strategy

Each pass begins with failing regression tests for its demonstrated defects.

### Failure-order matrix

Exercise failure before and after each authority write, including time, mission, Story Settlement, Command Bearing, and checkpoint persistence. For every case assert:

- narration remains blocked until verified completion;
- at most one Utility call occurred;
- automatic retries complete missing work only;
- replay and manual retry converge without double application;
- no authority root advances alone after the operation returns.

### Time reconstruction

Cover more than 128 commits, legacy-free nonzero anchors, zero-time decisions, retained-entry invalidation, pruned-entry policy, replay, and mutation rollback.

### Source lifecycle

Cover selected swipes, edits, `is_system`, hidden rows, deletion, regeneration, event aliases, histories longer than 500 messages, chat switching, and complete-text hashes.

### Director reachability

For every required Ashes route, prove a production event can emit the candidate, validation can accept it, settlement can commit it, and the player-safe prompt projection can expose the intended beat without hidden truth.

### Model budget and compatibility

Assert exact role-to-lane ownership, call counts, candidate-envelope size, schema forwarding, cancellation, prompt clearing, main-model narration ownership, and coexistence with representative extension prompts.

## Landing and Rollback

Each pass lands only after its focused tests and the full alpha gate pass. Passes are merged to `main` and pushed in order. A later pass may depend only on already-landed contracts.

No live save mutation is required for development. Before installed-host certification, back up the exact extension artifact and test save/chat. Deployment verification distinguishes repository source, merged remote state, installed artifact parity, and observed live interaction behavior.

If a pass fails installed certification, revert that pass without reverting earlier independent reliability improvements. Pending-settlement records are additive V1 state and must be safely ignorable by the prior landed version until their consuming pass is deployed.
