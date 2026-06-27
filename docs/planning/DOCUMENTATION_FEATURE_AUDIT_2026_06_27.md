# Documentation Feature Audit 2026-06-27

Status: active documentation update baseline; Stage 1-4 documentation wiring started
Primary baseline: `67ef1704` (`Document continuity projection and fact-checking updates`) through `2b818c46` (`Add provider fallback progress to character creator assist`)  
Broader cross-check: repository changes since the June 23 documentation expansion pass

This audit records implementation and tooling changes that should be promoted into the README, Operator Manual, Technical Manual, Campaign Authoring Guide, render tracking, and release-verification docs. Rows in the update matrix describe the drift found at the start of the pass; the progress section records follow-up edits made from that audit.

## Summary

The docs are broadly wired, but several features are now more implemented than their release-facing documentation implies. The largest gaps are:

- Mission Components are implemented beyond the design note and need operator, technical, model-call, state, and render coverage.
- Time adjudication is implemented for deterministic cases with Utility fallback, while some docs still frame it as future work.
- Character Creator section assist now has provider progress, retry, Utility fallback, local fallback, previews, and apply/regenerate/dismiss microstates that should be documented as a concrete workflow.
- Crew and player-character surfaces now expose richer biography disclosure, Service Record, Command Bearing, Mark Reviews, relationship perceptions, and portrait controls; the operator guide should show the current player-character tab shape.
- Rich crew datasets and voice capsules now exist across bundled packages and need stronger authoring guidance, technical hydration explanation, and a visual data-flow diagram.
- Continuity Projection Matrix (CPM) live certification has grown into prompt/source proof, factual-grounding audit, five-user readiness, and sidecar-settled pacing; testing docs are detailed, but release-facing summaries need a clearer path.

## 2026-06-27 Documentation Pass Progress

Initial updates applied from this audit:

- README now names Mission Components, implemented timekeeping/adjudication, rich crew runtime data, and live soak verification.
- Operator Manual now documents Mission Components, the Components subtab, Character Creator section-assist create/refine/fallback behavior, current Player Character tab density, and time-boundary behavior.
- Technical Manual now includes Mission Components, rich crew hydration, and current time adjudication.
- Model Calls now lists `timeAdvanceAdjudicator`, `factualGroundingReviewer`, `storyQualityReviewer`, and Mission Components' `utilityJson` proposal flow.
- Player Turn Sequence now includes time adjudication before classification and selected assistant-variant source truth.
- State Transactions now covers Mission Components, the time ledger, and swipe/edit/delete source-truth recovery.
- Campaign Authoring Guide now explains the character bible -> six-card dataset -> voice capsule -> hydration workflow and rich-crew validation commands.
- Testing Strategy now includes a release verification map and the new Mission Components/time-adjudication test coverage.
- Documentation Render Tracking now registers the new render-needed placeholders.
- Current release notes now mention Mission Components, Character Creator assist fallback, CPM/factual grounding, time adjudication, rich crew runtime data, and the verification split.

## Documentation Update Matrix

| Feature area | Current evidence | Current doc state | Needed docs update | Visual value |
| --- | --- | --- | --- | --- |
| Mission Components | `src/runtime/mission-components.mjs`, `src/hosts/sillytavern/mission-components-capture.js`, `src/ui/mission-components-panel.js`, `tools/scripts/test-mission-components*.mjs` | Design doc exists; index lists it as design. Operator/Technical docs do not yet teach the shipped workflow. | Add a user workflow to Operator Manual, add technical state/source anchoring section, mention `utilityJson` proposal flow in Model Calls, add `missionComponents` state/revision notes in State Transactions, add README feature row if release-facing. | High. Capture lifecycle and Mission tab screenshots/infographics will make the feature understandable quickly. |
| Time adjudication | `src/time/time-advance-adjudicator.mjs`, `src/time/campaign-time-state.mjs`, `tools/scripts/test-time-advance-adjudicator.mjs`, `src/generation/generation-roles.mjs` | Timekeeping System is current; README roadmap and Technical Manual reading map still imply planned/future layer. Model Calls lacks a `timeAdvanceAdjudicator` row. | Update README roadmap/key feature language, Technical Manual reading map and Timekeeping Boundary, Player Turn Sequence after Scene Handshake, Model Calls role group/authority table, State Transactions time-ledger section. | High. A clock-boundary infographic should show deterministic parser, Utility proposal, validator, state commit, prompt rebuild, and reply header. |
| Character Creator section assist | `src/creators/character-creator-assist.mjs`, `src/ui/character-creator-panel.js`, `src/runtime/creator-runtime-service.mjs`, `tools/scripts/test-character-creator-assist.mjs` | Operator Manual and Model Calls have initial wording. Need verify against current progress/fallback behavior and renders. | Tighten Operator Manual around create/refine modes, preview/apply/regenerate/dismiss, Reasoning retry, Utility fallback, local fallback, and provider-progress copy. Add Technical Manual note for creator draft authority. | Medium-high. A fallback ladder infographic is more useful than another static creator screenshot. |
| Player Character / Crew surface | `src/ui/crew-panel.js`, `src/runtime/runtime-app.mjs`, `tools/scripts/test-runtime-shell-creator-flow.mjs` | Operator Manual mentions biography, service record, portrait controls, and Command Bearing, but the new tab density is not fully represented. | Refresh Operator Manual Crew section with Player Character tab fields, collapsed Service Record, Command Bearing cards, evidence/reviews/history, relationship perceptions, and biography disclosure. Consider README mention only if not too detailed. | Medium. A render of the player-character tab with Command Bearing and Service Record would help operators. |
| Rich crew datasets and voice capsules | `src/generation/crew-voice-capsules.mjs`, `src/retrieval/card-hydration.mjs`, `packages/bundled/*/*.crew-dataset.json`, `tools/scripts/test-rich-crew-*.mjs` | Package design docs exist; Campaign Authoring Guide only lightly integrates the new workflow. | Add a worked authoring path from bible to six-card dataset to voice capsule to prompt hydration. Link Character Bible Shaping Guide and Crew Dataset Rich Character Design from main authoring stages. Add Technical Manual section for hydration audiences and prompt-budget limits. | High. Bible -> dataset -> hydration -> Director/narrator packet is a prime infographic. |
| CPM live certification | `src/continuity/*`, `tools/scripts/run-continuity-matrix-five-user-soak.mjs`, `tools/scripts/lib/factual-grounding-*.mjs`, soak schema updates | CPM technical doc and soak plan are detailed. README/release-facing verification could better explain what proof exists and what remains opt-in. | Add concise release-facing summary of deterministic tests versus opt-in five-user live certification. Keep deep evidence in Testing Strategy/Soak docs. | Medium-high. The certification pipeline can be a compact release-verification infographic. |
| Runtime persistence, committed outcome recovery, and selected host state | `src/runtime/runtime-app.mjs`, `src/runtime/message-reconciler.mjs`, `src/runtime/chat-turn-orchestrator.mjs`, `docs/architecture/CHAT_NATIVE_RUNTIME.md` | Technical docs cover many pieces but are fragmented. | Refresh State Transactions and Player Turn Sequence with committed outcome restore, response variants/swipes, edit/delete recovery, current selected text as continuity source, and branch-safe save behavior. | Medium. A recovery decision tree would reduce operator confusion. |
| Sidecar-settled live soak pacing and readiness | `tools/scripts/soak-sillytavern-campaign-live.mjs`, `tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs`, `docs/testing/LIVE_CAMPAIGN_SOAK_TEST_PLAN.md` | Soak plan is comprehensive but dense. | Add a short release-verification "how to read this" section in Testing Strategy and possibly README. Keep operational detail in the soak plan. | Medium. Five-lane artifact pipeline infographic would help release review. |
| Factual grounding and contradiction focus checks | `tools/scripts/lib/factual-grounding-evaluator.mjs`, `src/continuity/contradiction-guard.mjs`, `tools/scripts/test-factual-grounding-matrix-prompt-proof.mjs` | CPM technical/testing docs cover this, but naming is not obvious to a release reader. | Add glossary-style explanation: prompt-availability proof, generated-output fact check, contradiction guard, quarantine, and stop/fail criteria. | Medium. Could fold into CPM certification infographic. |
| Bundled campaign richness pass | `content/campaigns/*/crew/*_CHARACTER_BIBLE.md`, `packages/bundled/*/*.crew-dataset.json`, `docs/planning/CAMPAIGN_CHARACTER_RICHNESS_EXPANSION_PLAN.md` | Campaign docs mention richer data in places. | Ensure each bundled campaign reference states current rich-character status, remaining draft caveats, and expected validation command. | Low-medium. Package authoring diagrams should cover the common pipeline instead of per-campaign visuals. |

## Infographic Backlog

### P0

1. **Mission Components Capture Lifecycle**  
   Show selected chat text -> ship capture button -> Utility proposal -> player review/edit -> saved component -> Mission Components tab -> future CPM source evidence.

2. **Time Adjudication And Reply Header Boundary**  
   Show player/accepted scene movement -> deterministic parser -> Utility fallback proposal -> deterministic validator -> `timeAdvanceBoundary` commit -> time ledger/prompt rebuild -> next reply header.

3. **Rich Crew Data Hydration**  
   Show character bible -> six-card crew dataset -> `voiceCapsule`/line shapes -> `hydrateDirectorCards` audience filtering -> narrator/crew/director prompt packets.

### P1

4. **Character Creator Assist Fallback Ladder**  
   Show section wand create/refine -> Reasoning attempt -> Reasoning retry -> Utility fallback -> local fallback -> preview -> apply/regenerate/dismiss.

5. **Turn Sequence With Scene Handshake, Time, CPM, And Sidecars**  
   Extend the existing player-turn flow to show accepted prior scene settlement, possible time boundary, continuity prompt lanes, mechanics commit, narration, autosave, and sidecar demotion.

6. **Message Recovery And Selected Variant Source Truth**  
   Show player edit/delete/swipe/selected response variant -> ingress/response ledgers -> snapshot restore or review-required -> prompt rebuild. This should distinguish visible `mesid`, selected swipe text, and raw chat rows.

7. **CPM Live Certification Pipeline**  
   Show prompt-availability audit -> source-id proof -> generation factual-grounding check -> contradiction guard/quarantine -> five-user coordinator aggregation.

8. **Command Bearing Lifecycle**  
   Show evidence -> closure -> Mark Review -> point bank -> ready/cancel/spend -> deterministic two-band improvement -> relationship perception/player-safe projection.

### P2

9. **Five-Lane Live Soak Artifact Pipeline**  
   Show five non-human SillyTavern users, sidecar-settled pacing, live logs, screenshots, fact checks, prompt inspection, state snapshots, and summary/report schema.

10. **Campaign Authoring Build Pipeline**  
   Show source brief -> campaign promise -> package roots -> crew bibles/datasets -> validation -> import -> playtest loop.

## Render Needed Stand-Ins

Use centered native-resolution images only; do not scale documentation images above their native dimensions.

- Tracked render stand-in: `assets/documentation/renders/docs-directive-mission-components-capture.png`
- Tracked render stand-in: `assets/documentation/renders/docs-directive-mission-components-review.png`
- Tracked render stand-in: `assets/documentation/renders/docs-directive-mission-components-tab.png`
- Tracked render stand-in: `assets/documentation/renders/docs-directive-mission-components-lifecycle.png`
- Tracked render stand-in: `assets/documentation/renders/docs-directive-time-adjudication-flow.png`
- Tracked render stand-in: `assets/documentation/renders/docs-directive-rich-crew-hydration.png`
- Tracked render stand-in: `assets/documentation/renders/docs-directive-rich-crew-authoring-pipeline.png`
- Tracked render stand-in: `assets/documentation/renders/docs-directive-creator-assist-fallback-ladder.png`
- Tracked render stand-in: `assets/documentation/renders/docs-directive-character-command-bearing.png`
- Tracked render stand-in: `assets/documentation/renders/docs-directive-message-recovery-swipes.png`
- Tracked render stand-in: `assets/documentation/renders/docs-directive-cpm-live-certification.png`
- Tracked render stand-in: `assets/documentation/renders/docs-directive-live-soak-artifact-pipeline.png`

## Recommended Documentation Stages

### Stage 1: Correct Release-Facing Drift

- Update README key features and roadmap for implemented time adjudication and Mission Components.
- Add concise Mission Components and Player Character/Crew updates to the Operator Manual.
- Update Model Calls for `timeAdvanceAdjudicator`, `factualGroundingReviewer`, `storyQualityReviewer`, and Mission Components' `utilityJson` proposal flow.
- Replace outdated time-adjudication phrasing where implementation now exists.

### Stage 2: Expand Deep Manuals

- Add Mission Components to the Technical Manual and State Transactions.
- Add time adjudication to Player Turn Sequence and State Transactions.
- Add rich crew hydration to the Technical Manual.
- Add selected-swipe/source-truth recovery language to State Transactions.

### Stage 3: Authoring Pass

- Expand Campaign Authoring Guide with a worked rich-character authoring path.
- Cross-link Character Bible Shaping Guide, Crew Dataset Contract, and Crew Dataset Rich Character Design from the main authoring stages.
- Add package validation commands for rich crew voice capsule checks.

### Stage 4: Visuals And Renders

- Add P0 infographics first: Mission Components, Time Adjudication, Rich Crew Hydration.
- Then add P1 technical diagrams where they replace confusing prose: Character Creator fallback ladder, recovery/selected variant source truth, CPM certification.
- Update Documentation Render Tracking with each final asset path after the renders exist.

### Stage 5: Verification And Release Notes

- Update Testing Strategy with a short readable map from deterministic tests to opt-in live certification.
- Keep Live Campaign Soak Test Plan as the exhaustive operator contract.
- Update release notes only after the user-facing manuals and technical references agree with current runtime behavior.
