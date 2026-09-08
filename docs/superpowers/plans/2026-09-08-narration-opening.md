# Narration preferences and generated openings

> Execute with superpowers:subagent-driven-development. User approved implementation, PR submission and merge without further approval requests.

**Goal:** Apply global PoV/tense preferences to narration and replace canned campaign openings with Director-prepared, character-aware generation.

**Architecture:** A shared narration policy resolves global settings and player identity. Campaign packages own a factual opening premise. A structured Director request chooses supported character references and scene emphasis; the main narration model renders the approved direction with the prose preset. Runtime owns request identity, persistence, retries and chat binding.

**Tech Stack:** Browser JavaScript modules, SillyTavern adapters, Node assertion suites, Playwright.

**Spec:** Approved conversation design, captured below.

## Global constraints

- Default third-person limited, past tense; first/second/third-limited and past/present supported.
- Global preferences affect future narration, including regeneration; never rewrite existing transcripts.
- Limited narration follows the player's available knowledge without inventing player speech, actions, thoughts, feelings or choices.
- Campaign-owned opening premise replaces openingMessage; no canned fallback. Existing saved messages survive.
- Opening scene directions use accepted character background, preserve campaign facts and stop at the package-defined boundary.
- Runtime contains no Ashes-specific scene rules. Structured analysis and factual reports retain their own formats.
- Preserve unrelated checkout changes and running host data.

## Task 1: Shared policy, settings and preset

Files: new src/narration/narration-policy.mjs; settings-store.mjs, host-factory.mjs, preset-manager.mjs, settings-panel.js, certified-settings-view.mjs, preset asset; focused tests.

Interfaces: normalizeNarrationSettings(value) -> {pov, tense}; createNarrationPolicy({settings, player}) -> {kind, pov, tense, playerName, instruction}; host.narration.getSettings()/updateSettings(patch). Runtime public updateNarrationSettings(patch) rebuilds prompt.

- [x] Write/run failing normalization, six-combination policy, persistence and UI interaction tests.
- [x] Implement controls and host adapter; reconcile preset conflicting tense/PoV blocks and version expectations.
- [x] Verify targeted tests and report interfaces to runtime integrator.

## Task 2: Campaign premise and Director opening module

Files: new src/narration/campaign-opening.mjs; campaign package/context validation; generation role registry; focused tests.

Interfaces: campaign.openingPremise contains continuitySummary, firstPlayableScene, requiredContext[], sceneMaterial[], personalization[], forbiddenFacts[], firstSceneGuidance[]. createOpeningDirectorRequest({premise, player, narrationPolicy}) and parseOpeningDirection(output,{request}) validate bounded structured output using indexed premise/background references. createOpeningNarrationRequest({premise, player, narrationPolicy, direction, proseGuidance}) builds narrative request.

- [x] Write/run failing premise validation and two-campaign/two-background Director contract tests.
- [x] Replace canned asset with premise; avoid unrestricted Director inventions by selecting source references and bounded emphasis.
- [x] Add openingSceneDirector reasoning role; prose generation uses current narration model rather than reasoning lane.
- [x] Verify malformed/unsupported references fail closed and selected background reaches narrator.

## Task 3: Runtime lifecycle and native narration

Files: runtime-app.mjs, generation-client.mjs, runtime UI action wiring, host contracts/fakes; runtime opening and lifecycle tests.

- [x] Add failing checks for global prompt policy, opening generation, failure/retry, duplicate starts, chat switch and reload/regeneration.
- [x] Add runtime preferences projection/update; include policy in every campaign prompt.
- [x] Persist opening inputs/direction with a save-scoped record, generate once, recheck chat/save and empty transcript after each await, retry without new campaign creation.
- [x] Use the main host narration path with full prose guidance and captured policy; preserve normal preset lease lifecycle.
- [x] Remove canonical canned-text regeneration dependencies and genericize first-scene guidance.

## Task 4: Verification and integration

- [x] Run focused tests and complete npm test gate; inspect browser Settings and host request behavior.
- [x] Independent code review; fix material findings and rerun affected checks.
- [x] Document settings and campaign author contract; commit only owned changes.
- [ ] Push branch, create PR with evidence, merge and verify remote merge SHA. Current main documentation changes are integrated.

## Progress

- Worktree: .worktrees/narration-opening, branch codex/narration-opening from origin/main c884733f6.
- Baseline gate encountered OS listen EACCES on a browser test; rerun with network permission for browser listeners.

- Tasks 1–3 implemented and independently reviewed; review findings fixed with regression tests.
- Browser proof: all six settings combinations at 1280px and 390px; persistent settings and opening failure/retry verified. Screenshots under ignored artifacts/narration-settings-browser.
- Final combined-head npm test gate passed 174 focused checks, including the added browser check.
- Live host inspection located the current-model raw API, but the local host became unavailable before model generation; no live literary-quality claim.
