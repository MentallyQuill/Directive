# Directive Story-Authority Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended; or superpowers:executing-plans) to implement this plan task-by-task. Steps use checkbox syntax (- [ ]) for tracking.

**Goal:** Make one Ashes of Peace opening path feel like an authored open-world game: the player can explore freely, but deterministic beat eligibility, pressure resurfacing, reducer-backed state changes, and claim authority prevent the Director from silently accepting invented story facts.

**Architecture:** Extend the story context index with the current player action, recent transcript, authored obligations, prerequisites, evidence gates, timing, and pressure state. Derive eligible candidates deterministically; the model may select only from that set. Normalize the model's state proposal into the existing open-world reducer bundle and apply it during commitDirectorTurn. Add a general claim-authority pass before host-native narration so unsupported player/generated assertions are quarantined, rewritten as uncertainty, or routed to verification.

**Tech Stack:** src/story/story-context-index.mjs, src/directors/mission-director-story-graph-spine.mjs, src/directors/mission-director-model-spine.mjs, src/directors/open-world-event-reducers.mjs, src/campaign/transaction-state.mjs, src/runtime/director-turn-runtime.mjs, src/continuity/claim-quarantine.mjs, src/runtime/source-reconciliation-engine.mjs, Node deterministic scripts, Ashes live transcript/save/event-ledger checks.

## Global Constraints

- Preserve open-world agency: do not impose a fixed scene order or teleport the player to an authored scene.
- Every candidate must carry deterministic eligibility reasons, obligations, prerequisites/evidence gates, timing window, pressure, consequence of delay, allowed approaches, resolution bands, and required follow-up when the package supplies them.
- Unknown graph nodes must not default to available solely because they are present in the graph.
- The story-positioner receives playerInput and recentTranscript as actual context, not only an opaque source-frame reference.
- Model output is advisory until source hash, candidate ids, forbidden assertions, state-operation roots, and reducer validation pass.
- The state proposal must have a live reducer consumer. Keeping modelStateProposal in a packet without applying it is a failure.
- Authored facts, committed observations, player claims, generated claims, supported hypotheses, and unresolved hypotheses remain distinct in state and narration.
- Existing campaign-specific guardrails remain useful, but they call the general authority contract instead of being the only defense.

## Files and interfaces

- Modify src/story/story-context-index.mjs.
  - Extend buildStoryContextIndex({ ..., playerInput, recentTranscript }) with turn.playerInput, bounded turn.recentTranscript, obligations, pressures, and normalized graph edge/prerequisite data.
  - Add deriveStoryEligibility({ node, storyContextIndex }) returning { ok, reasons, prerequisites, evidenceGates, timing, pressure, consequenceOfDelay }.
  - Make deriveStoryPositionCandidates() include only nodes whose deterministic status/eligibility is ok or explicitly active/mandatory-to-surface; include eligibility in every candidate.
- Modify src/directors/mission-director-story-graph-spine.mjs.
  - Extend buildMissionStoryGraphContext() and runMissionDirectorStoryPositionSelection() with playerInput and recentTranscript.
  - Include turn context and eligibility reasons in the JSON prompt context.
  - Validate secondary candidates against the same eligible candidate id set.
- Modify src/directors/mission-director-model-spine.mjs.
  - Pass options.playerInput and options.recentTranscript into story-position selection.
  - Carry selected-candidate eligibility and authority constraints into outcome planning and narration constraints.
- Modify src/directors/mission-director-model-contracts.mjs if needed to reject state operations outside allowed reducer roots and preserve unsupported-claim diagnostics.
- Modify src/directors/open-world-event-reducers.mjs.
  - Add modelStateProposalToReducerBundle(proposal, metadata) that validates allowed roots and translates accepted proposal operations into directive.openWorldReducerBundle.v1 operations.
  - Reject unknown roots, forbidden keys, malformed paths, and operations without source/outcome metadata.
- Modify src/campaign/transaction-state.mjs.
  - In applyOpenWorldDelta(), consume a validated modelStateProposal by converting it to a reducer bundle and applying it through applyOpenWorldReducerBundle(); prefer an explicit reducer bundle when already present.
- Modify src/runtime/director-turn-runtime.mjs.
  - Ensure buildTurnPacketFromOutcomePlan() preserves the normalized state proposal and authority diagnostics.
  - Add reducer metadata needed by commitDirectorTurn() and story-event append so applied state and ledger reference the same outcome/turn/source frame.
- Modify src/continuity/claim-quarantine.mjs or add src/continuity/claim-authority.mjs.
  - Export classifyPlayerClaims(), classifyGeneratedClaims(), and resolveClaimDisposition() with explicit categories: authored fact, committed observation, player claim, generated claim, supported hypothesis, unresolved hypothesis.
  - Return commit, acknowledge-uncertainty, quarantine, or verification-required dispositions with evidence refs.
- Modify src/runtime/source-reconciliation-engine.mjs and the host-native narration review path to run claim authority after contradiction review and before prose acceptance.
- Keep src/mission/ashes-of-peace/host-continuation-guardrails.mjs as a specialization invoked through the general authority result.
- Update tools/scripts/test-story-context-index.mjs, test-mission-director-story-graph-spine.mjs, test-mission-director-model-spine.mjs, test-runtime-director-turn.mjs, and test-continuity-contradiction-guard.mjs; add tools/scripts/test-claim-authority.mjs and test-ashes-story-authority-vertical.mjs.

## Implementation tasks

### 1. Write red tests for the story spine and authority boundary

- [ ] Extend tools/scripts/test-story-context-index.mjs with an authored graph fixture containing a mandatory opening obligation, a prerequisite-gated future node, an optional diversion, an urgency window, and a pressure consequence. Assert the future node is not eligible without its edge/evidence gate and the mandatory obligation remains eligible after a diversion.
- [ ] Extend tools/scripts/test-mission-director-story-graph-spine.mjs with a generation-router capture. Assert prompt context contains exact playerInput, bounded recent transcript, eligible candidate ids, and eligibility reasons; assert the router cannot select a non-eligible id.
- [ ] Extend tools/scripts/test-runtime-director-turn.mjs with a state proposal containing one allowed operation. Assert committed campaign state changes through the reducer and turn ledger/event references share turn/outcome/source metadata. Assert a forbidden-root proposal pauses/rejects without state mutation.
- [ ] Create tools/scripts/test-claim-authority.mjs. Assert authored facts and committed observations commit; unsupported player/generated claims become uncertainty or quarantine; a claim with an evidence ref can become a supported hypothesis but not an authored fact without explicit Director commit; crew narration does not confirm quarantined claims.
- [ ] Create tools/scripts/test-ashes-story-authority-vertical.mjs for the cargo-ship-shaped scenario: player proposes an abandoned-ship fact during an off-thread turn, active authored obligation remains present, unsupported fact is not committed, and a later approved evidence event can commit it.
- [ ] Run:

      node tools/scripts/test-story-context-index.mjs
      node tools/scripts/test-mission-director-story-graph-spine.mjs
      node tools/scripts/test-runtime-director-turn.mjs
      node tools/scripts/test-claim-authority.mjs
      node tools/scripts/test-ashes-story-authority-vertical.mjs

  Expected result: current story context lacks player input/eligibility, state proposals are not consumed by the open-world reducer, and generic claim authority is absent or too narrow.

### 2. Build deterministic eligibility and pressure context

- [ ] Add normalized turn, obligations, and pressures fields to buildStoryContextIndex() without exposing hidden source text to the player-facing prompt.
- [ ] Implement deriveStoryEligibility() using node status, graph edges, prerequisites, known facts, active phase/location, timing, and authored mandatory/optional classification.
- [ ] Change unknown-node fallback from unconditional available to a deterministic ineligible result with a reason such as missing-prerequisite, no-edge, or outside-window.
- [ ] Ensure active mandatory obligations remain surfaced after unrelated exploration, with a pressure/consequence descriptor the Director can express diegetically.
- [ ] Keep candidates stable and hashable so source/candidate validation remains deterministic.

### 3. Route player input through the Mission Director

- [ ] Extend story graph context and selection signatures with playerInput and recentTranscript.
- [ ] Pass those values from runMissionDirectorModelSpine() and cap transcript length/field sizes before hashing/prompting.
- [ ] Add prompt instructions that the model may choose only candidateIds, must preserve eligibility, and must treat player factual assertions as claims unless evidence/authority says otherwise.
- [ ] Preserve JSON-only generation, source hashes, selection hashes, reviewer fail-closed behavior, and existing route semantics.

### 4. Apply accepted state proposals through the reducer

- [ ] Implement modelStateProposalToReducerBundle() beside applyOpenWorldReducerBundle() with the same forbidden-key/root validation used by deterministic open-world events.
- [ ] Wire applyOpenWorldDelta() in src/campaign/transaction-state.mjs to convert and apply stateDelta.openWorld.modelStateProposal when no explicit reducer bundle is present.
- [ ] Ensure commitDirectorTurn() appends reviewed story events and pressure updates after the reducer has applied the accepted proposal.
- [ ] Ensure rejected/paused proposals do not partially mutate campaign state, turn ledger, or event ledger.
- [ ] Add diagnostics showing proposal hash, reducer bundle hash, applied roots, and rejection reason.

### 5. Add general claim authority and narration constraints

- [ ] Implement claim extraction/classification with explicit authority categories and evidence references; keep the existing narrow contradiction guard as one signal rather than the whole decision.
- [ ] Run the authority pass in source-reconciliation-engine.mjs after contradiction findings and before host-native prose is accepted.
- [ ] For unsupported consequential claims, choose one deterministic disposition: quarantine from committed state, rewrite as uncertainty/rumor, or require a verification/recovery response.
- [ ] Add narration constraints so crew can acknowledge, question, hedge, or request evidence but cannot confirm a quarantined claim as established fact.
- [ ] Keep Ashes-specific Hesperus guardrails active through the general authority result and include their finding ids in diagnostics.

### 6. Run focused deterministic verification

- [ ] Run:

      node tools/scripts/test-story-context-index.mjs
      node tools/scripts/test-story-position-contracts.mjs
      node tools/scripts/test-mission-director-story-graph-spine.mjs
      node tools/scripts/test-mission-director-model-contracts.mjs
      node tools/scripts/test-mission-director-model-spine.mjs
      node tools/scripts/test-open-world-event-reducers.mjs
      node tools/scripts/test-runtime-director-turn.mjs
      node tools/scripts/test-continuity-contradiction-guard.mjs
      node tools/scripts/test-claim-authority.mjs
      node tools/scripts/test-ashes-story-authority-vertical.mjs

- [ ] Run git diff --check and inspect that all accepted state changes have a reducer consumer.

### 7. Prove the Ashes vertical path in the installed host

- [ ] Start a fresh Ashes of Peace campaign through the Slice B browser and record opening save id, chat id, package id, and source hash.
- [ ] Play the authored opening beat, then take a fun off-thread exploration action for at least one turn. Verify the transcript shows pressure/obligation resurfacing without a forced teleport.
- [ ] Enter an unsupported cargo/conspiracy-style claim. Verify saved campaign state and story event ledger do not contain it as an authored/committed fact; narration uses uncertainty or requests evidence.
- [ ] Follow the approved evidence/Director path and verify the supported discovery commits once, with matching chat transcript, save state, and event ledger.
- [ ] Store transcript, save, and event-ledger artifacts under artifacts/directive-recovery/story-authority/.
- [ ] If the installed host or provider cannot run the path, record the blocker and leave Slice C uncertified.

### 8. Commit the slice

- [ ] Run git status --short --branch and confirm only story-authority files/tests are changed.
- [ ] Commit with feat(director): enforce elastic story authority.
- [ ] Record commit SHA and transcript/save/event artifacts for the unified recovery pass.

## Exit evidence

- [ ] Deterministic eligibility, player-input context, reducer application, and claim-authority tests pass.
- [ ] An authored opening obligation cannot be silently bypassed by a diversion.
- [ ] Unsupported claims remain claims/hypotheses and do not become crew-confirmed facts.
- [ ] A supported discovery commits only through the approved evidence/Director path.
- [ ] Installed chat, campaign save, and runtime event ledger agree.
- [ ] Human reviewer approves the vertical transcript and state artifacts against the approved recovery design.
