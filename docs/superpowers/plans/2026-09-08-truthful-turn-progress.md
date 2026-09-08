# Truthful turn progress implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the runtime task and independent review. The main agent owns the UI integration.

**Goal:** Replace opaque waiting with observed operation status, elapsed time, and an expandable observed history.
**Architecture:** Runtime operations publish safe start/update/finish events through an app-owned progress reporter. The host bridge connects these to the existing activity card. Operation IDs preserve overlapping work; lifecycle cleanup rejects stale completions. Host stream events report receipt, never rendering or provider internals.
**Tech Stack:** JavaScript modules, Node assertions, Playwright.
**Spec:** Approved conversation design, 2026-09-08: only actual operations; no timer-generated stages or fictional percentages.

## Global constraints
- No prompts, response contents, story secrets, or provider reasoning in progress events.
- Cached/skipped work produces no model stage. Failures cannot be recorded as successful completion.
- Elapsed time measures waiting only. Preserve continuous notification bevel and keyboard accessibility.
- Do not modify the installed SillyTavern host. Submit and merge after verification; no additional approval requests.

## Task 1: Runtime event ownership and real operation instrumentation
Files: new src/runtime/turn-progress.mjs; runtime-app.mjs; v1-mission-runtime.mjs; generation call adapters as needed; new tools/scripts/test-turn-progress-runtime.mjs.
Interface: app.subscribeTurnProgress(listener) returns unsubscribe; app.resetTurnProgress() invalidates old events. Events are {type:'start'|'update'|'finish'|'reset', operationId, stage, startedAt, endedAt?, outcome?:'complete'|'failed'|'canceled', attempt?}. stage allowlist: reviewing-events, reviewing-episode, updating-characters, saving, preparing. Timestamps are performance.now() milliseconds. Subscribers cannot break operations. Subscribe replays active operations.
- [x] Add deferred-operation tests proving actual starts, concurrent ownership, failures, reset/stale completion, and skipped/cached calls.
- [x] Run the new test and confirm failure before implementation.
- [x] Wrap actual interpretation, conditional dossier authoring, episode evaluation, gateway persistence, and prompt preparation. Return values and errors must remain unchanged. Pass explicit progress callbacks through model-call options for actual retry attempts; do not infer retries.
- [x] Run focused runtime tests and report exact commands/results.

## Task 2: Activity presentation and host lifecycle
Files: turn-activity-indicator.js, runtime-bridge.mjs, shell-events.js, generation-client.mjs (coordinate ownership), styles/directive.css; lifecycle and visual tests.
- [x] Test real event-to-label mapping before implementing; verify unknown stages ignored, overlaps, history privacy, no premature expiry, stream receipt, and stop/chat/disable cleanup.
- [x] Subscribe the bridge to the app reporter, with replacement/unsubscribe cleanup. Attach operation starts to existing activity session; never resurrect an ended session from a late update/finish.
- [x] Show the current operation, elapsed stage and total time, plus native details/summary for observed history and concurrent operations. Update timer text separately from the polite live region. Never display future stages or percent complete.
- [x] Preserve neutral host handoff wording. Switch to receiving only on STREAM_TOKEN_RECEIVED for a handed-off narration, excluding Directive-owned calls. Ignore owned background generation end events.
- [x] Verify desktop/mobile geometry, expanded history, reduced motion, and cleanup with Playwright.

## Task 3: Review and integration
- [x] Register the new tests in run-alpha-gate.mjs. Run npm.cmd test.
- [x] Independent correctness review, including stale operations and truthful copy; fix substantive findings.
- [ ] Stage only scoped files, commit, push, create PR, inspect checks and merge the reviewed head.

## Decisions and evidence
- Host GENERATION_STARTED precedes interceptors and prompt assembly; it is not evidence of a provider request being sent.
- STREAM_TOKEN_RECEIVED proves data receipt, not text already rendered.
- Preserve unrelated primary checkout work; implementation lives in .worktrees/turn-progress.

## Verification record
- Runtime, UI, and full app-to-bridge regressions cover real pending prompt installation, conditional/cached model work, durable saving, invalid output, concurrent work, actual retries, and old queued work after reset.
- Browser checks cover desktop, 390px and 320px layouts, keyboard disclosure/focus retention, reduced motion, stream receipt, and lifecycle cleanup. Screenshots are local verification artifacts under artifacts/turn-progress.
- Independent review identified and verified fixes for attempts reported before transport validation and stale queued-edit scopes. Final review has no blocking findings.
- Neutral host waiting copy does not claim the remote provider has begun generating. Host stream events establish receipt only.
- Tests use controlled providers and host fixtures; the installed SillyTavern instance is unchanged.

- Final full gate: npm.cmd test passed all 178 focused checks. Existing persistence-adapter compatibility regression was fixed without changing its rollback-conflict test.
