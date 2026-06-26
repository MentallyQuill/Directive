# Live Campaign Soak Test Plan

## Status

This document defines the target plan for a comprehensive live SillyTavern campaign soak test.

Directive is pre-alpha. The soak may exercise the best current runtime behavior in place and does not need to preserve legacy workflows. It should run as an explicit, opt-in live verification path because it allows unlimited model calls, mutates SillyTavern chat history, creates save branches, and intentionally attacks campaign continuity.

The normal alpha gate remains the dependency-free contract suite. The soak is release-certification evidence for the full chat-native campaign loop.

## Core Purpose

The soak proves that a real campaign can continue through roughly 50 player turns while Directive uses the systems that matter in live play:

- chat-native campaign activation and prompt injection;
- Scene Handshake settlement for accepted host-native assistant prose, including current orders, Command Log, ship readiness notes, thread signals, prompt rebuilds, and source provenance;
- objective assignment projection from accepted assignments into Mission, Log, and linked Crew surfaces;
- timekeeping reply headers, including deterministic Directive-owned headers, host-native `[Directive: Reply Header]` prompt compliance, stale-header stripping, and preset version refresh;
- Utility classification for every accepted player post;
- Mission Director escalation and response strategy selection;
- Directive Assist drafting, briefing, order framing, and report framing;
- Command Competence, authority review, no-gotcha warnings, and Command Bearing Readied points, evidence, Mark Reviews, and relationship perceptions;
- crew, ship, relationship, pressure, thread, quest, and Command Log sidecars;
- SillyTavern message actions and Scene Reconciliation;
- End Conditions terminal outcome decisions, checkpoint replay, Push On continuation, terminal branch save, and Keep Ending conclusion;
- edit, delete, swipe, retcon, branch, save, load, and prompt rebuild recovery.

The governing rule is:

```text
Chat text is evidence. Campaign state is authority. Destructive reinterpretation requires explicit recovery, reconciliation, or recalculation.
```

## Relationship To Existing Tests

Use the soak after focused tests pass:

```powershell
node tools\scripts\test-directive-assist.mjs
node tools\scripts\test-command-bearing.mjs
node tools\scripts\test-sillytavern-message-actions.mjs
node tools\scripts\test-scene-reconciliation.mjs
node tools\scripts\test-message-recovery.mjs
node tools\scripts\test-end-condition-evaluator.mjs
node tools\scripts\test-campaign-end-condition-service.mjs
node tools\scripts\test-end-condition-ui-contracts.mjs
node tools\scripts\test-chat-native-runtime-flow.mjs
node tools\scripts\run-alpha-gate.mjs
```

Then use the existing live smoke for quick host confidence:

```powershell
$env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
$env:DIRECTIVE_SILLYTAVERN_BROWSER='1'
$env:DIRECTIVE_SILLYTAVERN_CHAT_CAMPAIGN='1'
$env:DIRECTIVE_LIVE_GENERATION='1'
node tools\scripts\smoke-sillytavern-live.mjs
```

To continue an existing live campaign timeline instead of creating another isolated baseline, resume by save id and assert the bound chat:

```powershell
$env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
$env:DIRECTIVE_SILLYTAVERN_BROWSER='1'
$env:DIRECTIVE_SILLYTAVERN_CHAT_CAMPAIGN='1'
$env:DIRECTIVE_LIVE_GENERATION='1'
$env:DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID='save-...'
$env:DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID='Directive - ...'
node tools\scripts\smoke-sillytavern-live.mjs
```

Then use the terminal endings live smoke when live generation and a fresh host are available:

```powershell
$env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
$env:DIRECTIVE_SILLYTAVERN_GENERATION='1'
node tools\scripts\smoke-sillytavern-terminal-endings-live.mjs
```

Before touching live campaign state, prove local Playwright readiness and artifact capture:

```powershell
node tools\scripts\check-playwright-soak-readiness.mjs
node tools\scripts\soak-sillytavern-campaign-live.mjs --dry-run --no-write
```

The soak should be a separate runner, not a default mode of `smoke-sillytavern-live.mjs`. Recommended future runner:

```powershell
$env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
$env:DIRECTIVE_SILLYTAVERN_BROWSER='1'
$env:DIRECTIVE_LIVE_GENERATION='1'
$env:DIRECTIVE_LIVE_CAMPAIGN_SOAK='1'
$env:DIRECTIVE_LIVE_MODEL_CALL_BUDGET='unlimited'
node tools\scripts\soak-sillytavern-campaign-live.mjs
```

## Model Call Policy

The live campaign soak is an unlimited model-call test.

Unlike smoke tests, this plan should not cap model calls by default, avoid workers to save cost, skip Assist actions because they spend tokens, or replace provider-backed systems with deterministic fallbacks when providers are healthy. Utility, Reasoning, Directive Assist, Mission Director, narrator, Scene Handshake, reconciliation extractor, sidecar, summary, relationship, crew, ship, quest, thread, and Command Bearing model calls are all allowed for the full run. Scene Handshake coverage includes the `sceneHandshakeSettler` Utility role and its sanitized snapshot-budget diagnostics. Command Bearing coverage includes `commandBearingFitChecker`, `commandBearingSpendValidator`, `commandBearingEvaluator`, and Mark Review calls when the live state creates a proven closure.

The runner should treat model calls as part of the behavior under test:

- use live providers for every system that would normally call a model;
- let the campaign run until the test script completes, a real provider error occurs, or the operator stops it;
- record model-call counts, roles, provider ids, models, latency, status, retryability, and sanitized failure reasons;
- never fail solely because the run used "too many" model calls;
- never silently downgrade to no-generation mode after a budget threshold;
- mark any deterministic fallback as a warning unless the specific scenario is testing fallback behavior.

External provider limits, account spend limits, network failures, or rate limits may still stop the run. Those are environmental failures or soft skips depending on strict mode, not intentional soak-budget limits.

### Sidecar Cadence

The campaign matrix canaries should run with sidecar-settled pacing. After each accepted turn, the runner should wait for sidecar model-call activity and runtime quiescence before sending the next scripted player turn. This proves relationship, crew, ship, continuity, Command Bearing, and prompt-update sidecars can apply against the intended turn state instead of being rejected only because the automated player advanced faster than sidecars could finish.

For the current SillyTavern host path, sidecar-settled pacing means sequential sidecar execution unless a future host capability check proves true concurrent provider capacity. A run that sees every post-turn sidecar fail together at the aggregate batch timeout is a sidecar health failure, not valid coverage for Crew, Ship, relationship, continuity, prompt-update, or Command Bearing sidecars. Pause the affected lane, sync the fixed extension copy before retrying, and record `sidecar-health-gate` in `live-log.jsonl` with the affected roles, timeout values, host capability snapshot, save/chat ids, and next retry point.

`classifying` and `classified` are not accepted-turn states. A live runner must not send the next scripted player message while the latest ingress is still `classifying` or `classified`, even if the utility classifier returned a decision or the turn ledger changed. A turn counts as settled only when one of these is true:

- the ingress is `committed` and has a `turnId`, `outcomeId`, posted Directive response id, and matching response-ledger entry;
- the ingress is a resolved no-change/routine/counsel path with either a posted Directive response or, for `injectAndContinue`, a delegated `hostGeneration` response-ledger entry plus a newly appended host assistant continuation;
- the ingress is a visible pause or clarification path with the expected pending interaction and posted Directive response recorded;
- the ingress is `recoveryRequired` with a `chatTurnProcessingFailure` recovery record and the runner has stopped for triage;
- the message is explicitly stale/deleted/edited and the relevant reconciliation or recovery record is logged.

If a runner observes `classified` without a response, outcome, delegated host-generation continuation, pause, stale reconciliation, or recovery after the live wait window, it must log a P1 turn-settlement failure, pause that lane, and reobserve or reload only under coordinator control. It must not treat `classified` as `turn-end`.

Fast-turn pressure is still valuable, but it is a separate soak mode. In that mode, sidecar revision-conflict rejections are acceptable only when they preserve newer committed mechanics and are logged as warnings with source turn id, rejected worker id, proposed roots, current revision, and later-turn revision that made the sidecar stale. Fast-turn pressure must not be used as the only evidence that sidecars work.

## Required Host Conditions

Before running the soak:

- SillyTavern is reachable through `SILLYTAVERN_BASE_URL`.
- First, before any other soak action, sync the served or installed SillyTavern Directive extension to the checkout under test. Parallel extension fixes may make the installed copy stale until testing begins.
- The served Directive extension is the checkout under test, or the checkout has been copied into the installed SillyTavern extension path and acknowledged with `DIRECTIVE_CONFIRM_EXTENSION_SYNCED=1`.
- For parallel soak workers, SillyTavern multi-user mode is enabled and every worker has a dedicated ST user, Playwright browser context, run id, artifact folder, campaign chat, save branch, and provider/session budget.
- The full breadth-first parallel soak uses five non-human SillyTavern users: `directive-soak-a`, `directive-soak-b`, `directive-soak-c`, `directive-soak-d`, and `directive-soak-e`. Fewer workers may be used for a focused probe, but that is not full five-lane coverage evidence.
- `default-user` is reserved for human testing only and must not be assigned to automated soak workers, storage probes, patch lanes, or campaign runners.
- Before parallel soak workers start, `check-sillytavern-multi-user-soak-readiness.mjs --live` proves each configured ST user can see its own Directive `/user/files` probe and cannot see another worker's probe.
- In SillyTavern account mode, the served-extension freshness preflight authenticates with a configured non-human soak user before reading protected `/scripts/extensions/third-party/Directive` files.
- Utility and Reasoning providers are configured and pass `app.testProvider({ kind })`.
- The operator explicitly accepts unlimited live model calls for this run.
- Playwright can launch and control the local SillyTavern host.
- Playwright can drive role locators, switch desktop and phone soak viewports, and write trace/screenshot artifacts through `check-playwright-soak-readiness.mjs`.
- The test runner has permission to create a fresh Directive campaign chat and smoke-owned save branches.
- The test runner writes artifacts under a timestamped folder, not into production package assets.

The soak must create a fresh campaign, character, chat, and save branch by default. It should not reuse stale campaign state except in a dedicated resume-from-artifact mode.

The existing Chrome/Edge CDP fallback remains useful for quick live smoke and emergency diagnostics, but it is not the preferred certification driver for this soak. If the soak runs through a CDP fallback or direct runtime-handler calls, the report must mark that coverage as fallback evidence rather than equivalent Playwright proof.

Sync must be the first live-testing step. Do not begin campaign creation, provider preflight, message mutation discovery, or any soak action until the extension copy served by SillyTavern is known to match the checkout being tested.

## Artifact Contract

Each run writes one report directory, for example:

```text
artifacts/live-soak/sillytavern-campaign/<run-id>/
```

Required artifacts:

- `report.json`: structured pass/fail, phase results, model-call counts, turn ids, save ids, and artifact paths.
- `summary.md`: human-readable timeline, failures, and follow-up tickets.
- `live-log.jsonl`: append-only running test log, updated before and after every material action so interrupted runs still leave progress evidence.
- `turns.jsonl`: one record per test turn or mutation.
- `snapshots/`: bounded campaign-state summaries after each checkpoint.
- `transcript/`: readable player-visible campaign chat, source chat export, transcript index, and bounded redacted excerpts.
- `screenshots/`: desktop and phone screenshots of Mission, Crew, Ship, Log, Campaign, and Settings at key checkpoints.
- `playwright/`: trace, video, console, network, and browser-error artifacts when enabled by the runner.
- `prompt-inspection/`: prompt block ids, hashes, placement, and revision metadata, never raw hidden prompt content.
- `storage/`: save-index and branch metadata proof, never provider secrets.
- `objective-assignments/`: accepted assignment source pointers, Mission Current Orders/Open Assignments excerpts, Command Log excerpts, linked Crew Character/Roster excerpts, state snapshots, and screenshot paths.
- `scene-handshake/`: settlement snapshots, model-call diagnostics, open-assignment/log/ship/thread deltas, source message hashes, idempotency records, rejected/deferred settlement records, and prompt-rebuild proof.
- `timekeeping/`: visible reply-header samples, prompt-block hashes, preset version/status proof, stale-header stripping checks, time-boundary snapshots, and host-native compliance notes.
- `end-conditions/`: terminal detection, pending interaction, checkpoint message, decision resolution, branch, continuation frame, conclusion, and final-band evidence.
- `command-bearing/`: coverage board, Readied point state, fit-check outputs, spend-validator results, spend/return records, evidence ledger excerpts, Mark Review records, relationship perception records, and controlled narration packet summaries.

The report shape is defined by [live-campaign-soak-report.schema.json](../../schemas/testing/live-campaign-soak-report.schema.json). The schema intentionally records Playwright as the primary driver, marks CDP/direct-handler coverage as non-equivalent fallback evidence, requires the unlimited model-call policy, requires the readable transcript and player-input policies, requires Scene Handshake, objective-assignment projection, and timekeeping policies, requires the multi-campaign matrix, requires the append-only live log policy, and requires named End Conditions terminal scenarios.

The report must redact:

- API keys, cookies, CSRF tokens, and auth headers;
- hidden campaign truth;
- raw relationship values;
- raw pressure values;
- hidden clocks;
- provider prompt bodies unless explicitly captured in a sanitized diagnostics mode.

## Readable Chat Transcript Contract

The live soak is also a story-quality test. Each run must preserve the player-visible chat so the campaign can be read afterward as a coherent play transcript, not only as debugging evidence.

Required transcript artifacts:

- `transcript/readable-chat.md`: a human-readable campaign transcript in chronological order.
- `transcript/source-chat.jsonl`: the closest safe copy of the SillyTavern-visible chat messages for replay or later extraction.
- `transcript/index.json`: run id, campaign package id, ST user handle, chat id/name when known, save id/branch ids, model/provider metadata, transcript file paths, and capture timestamps.
- `transcript/excerpts.md`: bounded excerpts used in failure summaries, manual review, or issue reports.

The readable transcript should include visible player posts, visible Directive replies, terminal checkpoint posts, player terminal decisions, and visible message-action/reconciliation outcomes. It must not include hidden campaign truth, raw prompts, secrets, cookies, CSRF tokens, raw relationship values, hidden clocks, Director-only reasoning, or provider request bodies.

Transcript capture should be incremental. After each accepted player turn, edit/delete/swipe mutation, reconciliation, terminal decision, campaign switch, operator stop, or run end, the runner should either append the new visible messages or refresh the transcript from the SillyTavern chat source. If the run is stopped early, the partial transcript should still be readable through the last completed turn and the `live-log.jsonl` entry should identify the latest transcript capture.

The transcript is not just a debug file. It is part of the release signal:

- the chat should be enjoyable enough to read back;
- Directive's prose should react to dramatic player intent without breaking agency or hidden-state boundaries;
- weak but technically safe prose should be scored as a quality warning;
- a system pass with a dull, incoherent, or visibly synthetic campaign transcript is not release-quality evidence.

## Automated Player Writing Standard

Automated player posts should be written as if the tester is a skilled roleplayer deeply engaged in the campaign. The runner should not send sterile test commands such as "turn 19: try NPC control" unless the scenario is explicitly testing visible prompt/system override text.

Every player post should balance two needs:

- it should be good in-character prose or dialogue that gives the model a realistic story target;
- it should still contain a clear actionable intent that Directive can classify, adjudicate, warn about, or reject.

For normal play, player posts should use:

- third-person player-character prose by default, matching Directive's preferred play style;
- character voice appropriate to the campaign and command role;
- concise sensory grounding and emotional stakes;
- natural dialogue, orders, questions, and hesitation;
- clear tactical or social intent;
- continuity references from prior turns;
- enough ambiguity to feel human, but not so much that the intended action becomes untestable.

Third person is the certification perspective for story quality. A player post should read like "Serrin steps to the rail and asks..." rather than "I step to the rail and ask...". First-person dialogue inside a third-person post is allowed when it is the character's spoken line, such as `Serrin says, "I need that scan now."` First-person narration outside dialogue is not preferred-play evidence. First-person input may be included only as an explicit compatibility or robustness sub-test. Those transcripts must be marked `perspective: first-person` or flagged as first-person narration in `live-log.jsonl`, and they do not count as preferred-play story-quality evidence.

For adversarial play, the attempts should still be written as plausible dramatic roleplay:

- NPC control attempts should read like the player trying to pressure, script, or presume another character, so Directive can prove it preserves NPC agency.
- God-mode attempts should be phrased as confident declarations, risky assumptions, or desperate commands, so Directive can distinguish intent from established fact.
- Secret bad-guy play should use believable deception, sabotage, omission, or divided loyalty, so Directive can test correction, consequences, and hidden-truth safety in a realistic context.
- Prompt injection should be the exception where visible meta/system text is allowed, because the point of the test is to verify rejection.

The player must not intentionally author another character's actual speech, hidden knowledge, mechanical success, final outcome, or unrevealed plot truth as fact. The test may attempt those violations, but it should do so through the player's words, assumptions, orders, or attempted actions so Directive has a fair chance to correct them.

The runner should store the exact sent player text in the readable transcript. `live-log.jsonl` and `turns.jsonl` may store bounded previews plus hashes, but the transcript artifact is allowed to preserve the full player-visible chat for later reading and quality review.

## Live Test Log Contract

The running test log is a first-class artifact, not a post-run summary. The runner must append to `live-log.jsonl` as the soak progresses and flush each record immediately. If the browser, provider, host, machine, or operator stops the run early, the log must still show the last completed action, the action in progress, and the artifact paths available for diagnosis.

Log records should be JSON objects with stable `kind`, `timestamp`, `runId`, `phaseId`, `campaignPackageId`, `status`, and relevant ids. Each record must redact secrets and hidden state by default. For player or generated prose, store bounded previews, hashes, and transcript pointers in the log. The full player-visible prose belongs in `transcript/readable-chat.md` and `transcript/source-chat.jsonl`.

Record these events as they happen:

- run start, operator stop, run end, base URL, Playwright mode, model-call policy, and artifact root;
- extension sync result before any other live action, including checkout hash evidence or `DIRECTIVE_CONFIRM_EXTENSION_SYNCED=1`;
- extension sync barriers where all workers pause, record their current extension hash/version, pick up the latest known-good repo patch, and resume from a named checkpoint or fresh run;
- parallel worker and patch-lane assignment, including ST user handle, branch/worktree id, run id, campaign package id, installed extension path or served extension hash, and assigned soak shard;
- preflight checks for providers, Playwright browser control, campaign package availability, and SillyTavern host reachability;
- campaign session mode for every `campaign-start` and `run-end` record: `fresh` for new campaign creation, `resume` for saved timeline continuation, plus save id, expected chat id, actual chat id, and bound chat assertion result;
- campaign matrix checks, including package id, title, version/status, library visibility, creator open result, fresh start result, and chat binding result for each campaign;
- every phase start/end, turn start/end, typed player intent, declared player-input perspective, detected player-input perspective, preferred-play evidence eligibility, first-person narration warning if detected, bounded text preview/hash, message role, SillyTavern message id/index, and final turn status;
- every turn-settlement evidence type, including whether the turn ended as Directive-posted, visible pause, delegated host generation, recovery, stale/reconciled, or true timeout;
- every Scene Handshake settlement attempt, including previous assistant message id/hash, accepting player message id/hash, relation classification, model-call role/provider/model, snapshot budget and included slices, disposition, committed roots, operation count, idempotency key, prompt revision before/after, sidecar scheduling result, and whether the result was auto-commit, deterministic fallback, internal review, defer, or operator recovery;
- every objective-assignment projection check, including source transcript pointer, assignment ids/titles, linked crew ids, Mission visible excerpt/hash, Log entry id/excerpt/hash, Crew Character/Roster excerpt/hash, screenshot paths, state root counts, save/chat binding, and redaction result;
- every timekeeping reply-header check, including visible header text/hash, expected header from campaign state, reply surface, whether the message was Directive-owned or host-native, prompt-block revision/hash, stale-header stripping result, duplicate-header check, preset version/status, and whether the header advanced only after an authoritative time boundary;
- every Directive Assist action, rough input preview/hash, generated output preview/hash, Apply/Cancel/Try Again/Restore result, tense/PoV/agency quality score, and whether the player sent the draft;
- every Command Bearing action, including point counts shown in Assist, `Check Inspiration` or `Check Resolve` result, `Ready`/`Cancel` action, readied id, bound save/chat, final sent-text hash, spend-validator result, spend/return/refund reason, base outcome band, final outcome band, evidence id, Mark Review id, relationship perception id, and narration packet hash;
- every Command Bearing evidence, closure, review, spend, return, and abuse-check interval, including evidence ledger counts, open/closed thread/chapter/arc ids, review queue ids, mark/rank/point counts before and after, readied ingress id, spend ledger id, outcome-band movement, anchored-consequence hashes, and player-safe projection hash;
- every Command Bearing coverage-board update, including gate id, owner, contributor lane, status (`open`, `partial`, `organic-pass`, `organic-negative-pass`, `fixture-pass`, `blocked`), proof artifact paths, unresolved gap, and next interval target;
- every model call role/domain, provider id, model id, start/end time, latency, token counts when available, retry count, status, and sanitized failure reason;
- every Playwright UI action with locator, viewport, fallback reason when used, screenshot/trace/video path, toast text, console error count, and page error count;
- every 5-10 turn Crew/Mission surface interval check, including Crew Character tab population, Crew Roster pressure projection, player-safe relationship perception changes, Mission drawer objective/pressure updates, snapshot ids, screenshot paths, and hidden-state redaction result;
- every edit, delete, swipe, message action, reconciliation, recalculation preview, accepted/rejected proposal, roots touched, prompt revision before/after, and live mechanic mutation result;
- every command-conduct ladder step, including first breach, recovery control, escalation, terminal threshold, whether the step remained playable, and whether consequences were preserved;
- every triage finding, including severity, assigned lane, reproduction pointer, transcript pointer, screenshots or save ids, whether the fix is immediate or deferred, and the next planned fix barrier;
- every checkpoint summary: chat binding, save id/revision, ingress count, turn ledger count, command log count, pending interactions, recovery journal count, sidecar entries, prompt revision, and visible Mission/Crew/Ship/Log/Settings summaries;
- every transcript capture, including readable transcript path, source chat path, latest visible message id/index, latest turn, capture mode, and whether it is partial or final;
- every End Conditions trigger, detection id, decision id, checkpoint message id, allowed actions, chosen action, expected and actual decision status, branch/save id, continuation frame id, conclusion/final band metadata, and persistence result;
- every save/load branch operation, wrong-chat isolation probe, cross-campaign isolation probe, and prompt rebuild result;
- every warning, failure, skipped check, unsupported host capability, fallback path, quality score-0 item, follow-up ticket id, deferred-fix queue item, and resume recommendation.

`turns.jsonl` remains the compact turn/mutation ledger. `live-log.jsonl` is the broader forensic timeline that lets a reviewer reconstruct what happened even when the soak never reaches `summary.md`.

## Global Pass/Fail Rules

The soak fails if any of these occur:

- a player post from an unbound chat mutates the active campaign;
- a player edit or delete silently corrupts campaign state;
- a swipe rerolls committed mechanics;
- provider failure partially commits state;
- Scene Handshake commits state from a rejected, corrected, unsafe, deleted, streaming, superseded, wrong-chat, wrong-save, or already Directive-owned previous assistant message;
- Scene Handshake duplicates open assignments, Command Log entries, ship readiness notes, or thread signals on refresh, reobserve, save/load, Save Game As, or selected-swipe replay;
- Scene Handshake mutates formal objectives, terminal ledgers, Command Bearing marks/points/spends/refunds, hidden crew memory, raw relationship state, or other roots outside the V1 allowlist;
- Scene Handshake fails to rebuild prompt context before current-player classification after a committed settlement;
- accepted assigned work exists in state but Mission Current Orders/Open Assignments, Log, or linked Crew surfaces stay blank, stale, wrong-campaign, wrong-chat, or show object-rendering artifacts such as `[object Object]`;
- linked crew assignments appear in Mission/Log but not in player-safe Crew Character or Crew Roster context when the assignment names or affects a crew member;
- a visible assistant reply in a bound campaign chat lacks the expected `*Stardate #####.# | HHMM hours*` header, accumulates duplicate stale headers, or shows a header that contradicts authoritative campaign state;
- prior reply headers are treated as evidence of elapsed time, settlement facts, reconciliation facts, Outcome Integrity prose, or Command Bearing evidence;
- model-generated or prompt-side header text advances campaign time without a deterministic time-boundary commit;
- the bundled SillyTavern preset status is stale for the checked-out preset version when live host-native generation is used for certification;
- the runner stops, skips, or downgrades model-backed systems because of an internal model-call budget;
- Playwright is unavailable and the run is not explicitly marked as fallback-only;
- hidden facts, raw values, or Director-only reasoning reach normal UI or chat;
- Directive Assist commits Mission Director state before the player sends the final chat;
- the player can force NPC speech, NPC action, hidden truth, or plot outcomes as fact;
- message actions are invisible, collapsed, duplicated, or attached to the wrong row;
- `Reconcile From Here` silently replaces later outcomes instead of scanning and proposing updates;
- `Recalculate From Here` changes live mechanics before explicit acceptance;
- a terminal failure condition does not create exactly one pending `terminalOutcomeDecision`;
- a terminal checkpoint message is missing, duplicated, posted in the wrong chat, or lacks player-facing options;
- `Save as branch` fails to preserve a terminal timeline branch while leaving the terminal decision pending;
- `Replay from checkpoint` fails to restore the retained pre-terminal snapshot or rebuild prompt context;
- `Push On` fails to apply an authored continuation frame, resolve the pending decision, or rebuild prompt context;
- `Keep this ending` fails to record terminal outcome metadata, final campaign band, and complete campaign conclusion;
- terminal decision resolution leaks hidden predicates, raw clocks, Director-only notes, or unrevealed ending axes;
- a Readied Command Bearing point deducts before commit, applies to the wrong chat, applies to the wrong player message, or survives past its intended next-message scope;
- a Command Bearing spend improves an outcome without a valid committed base outcome, valid final sent text, accepted fit validation, available point, and deterministic two-band spend transaction;
- a consequential Readied-point turn allows ordinary host generation to commit a competing response before Directive posts the controlled committed outcome;
- Command Bearing fit checks rewrite player text, promise success, mutate state, expose raw scores, or leak hidden relationship values or private NPC thoughts;
- Command Bearing evidence directly awards Marks without closure review, or Mark Review runs without deterministic closure proof;
- Crew Character tab, Crew Roster, or Mission drawer surfaces stay blank, stale, wrong-campaign, or wrong-chat after their state should have changed;
- Crew Roster fails to show player-safe crew pressures for active campaign crew after interval play;
- behind-the-curtain crew relationship state does not move after repeated meaningful player interactions, or visible projections leak raw relationship values, private NPC thoughts, hidden pressure values, hidden clocks, or Director-only reasoning;
- Mission drawer objectives, active pressure, pending interactions, warnings, or recent consequences fail to update after Mission Director outcomes, reconciliation/recalculation, branch load, or terminal decisions;
- sidecar proposals apply against stale revisions or unauthorized roots;
- save branch load resumes the wrong campaign, wrong chat binding, or stale prompt context;
- the report cannot identify which turn caused a failure.

The soak may record a soft warning instead of failing when:

- a provider returns low-quality prose but Directive rejects it safely;
- a live host API is missing an optional affordance and the runner records a supported fallback;
- a sidecar is skipped because provider configuration is unavailable, as long as strict mode is not enabled.

## Checkpoint Model

Capture a checkpoint:

- after campaign activation;
- after every 5-10 ordinary player turns;
- before and after every edit/delete/swipe/reconciliation mutation;
- after crew-focused interactions or player choices expected to change crew relationships, crew pressures, or Mission drawer state;
- after every save, save-as branch, and load;
- at final turn completion.

Each checkpoint should include:

- current chat id and campaign binding;
- ingress count and turn ledger count;
- sceneHandshake settled/deferred/internal-review counts, latest disposition, open-assignment count, latest source hashes, and prompt revision after settlement;
- latest objective-assignment projection status: assignment ids, linked crew ids, Mission/Log/Crew visible hashes, screenshot paths, and whether the source remains valid;
- command log count;
- latest response strategy;
- pending interaction count;
- scene reconciliation last result;
- expected and visible reply-header hash for the latest assistant message, campaign stardate, ship minute/time, and prompt-block reply-header hash;
- recovery journal count and latest entry;
- model-call roles since previous checkpoint;
- sidecar journal entries since previous checkpoint;
- commandBearing point counts, readied state, spend ledger count, evidence ledger count, review ledger count, relationship perception count, and latest player-safe Command Bearing projection;
- Crew Character tab selected crew id/name, visible public role/status hash, recent player-safe relationship perception hash, and screenshot path;
- Crew Roster visible crew count, expected crew count, pressure-summary hashes, selected pressure-card hash, and screenshot path;
- relationship/crew sidecar journal counts and bounded hidden-state movement proof without raw relationship values or private NPC thoughts;
- Mission drawer active objective/pressure hash, pending interaction summary, warning/consequence summary, revision id, and screenshot path;
- end-condition ledger detection/decision counts, active decision id, branch record count, continuation frame count, and final campaign band;
- prompt-context revision;
- save id and save revision;
- visible Mission/Crew/Ship/Log/Settings summaries.

## Crew And Mission Surface Intervals

Crew and Mission surfaces should be tested at intervals, not after every single turn. The main cadence is every 5-10 player turns, with extra captures only when a turn is specifically designed to touch crew relationships, crew pressure, mission objectives, reconciliation, branch loading, or terminal decisions. This gives sidecars and Mission Director state time to settle and avoids overfitting to one-turn noise.

Accepted objective or assignment creation is an exception to the loose cadence. As soon as a host-native Scene Handshake, Mission Director outcome, Open Orders selection, or Scene Reconciliation repair creates assigned work, the runner must immediately capture Mission, Log, and the relevant Crew surfaces before continuing broad soak play. This is the specific guard for the missed bug where assigned objectives existed in chat/state but never populated the proper pages.

Required checks:

- Crew / Character tab: select or focus the crew member most relevant to the interval and verify the tab is populated with public character identity, role, current status, recent interaction context, and player-safe relationship perception when such perception exists.
- Crew / Crew Roster tab: verify campaign crew members populate, the visible count matches the active campaign's expected crew set, and crew pressures/stressors appear as player-safe summaries rather than raw pressure values.
- Behind-the-curtain relationships: compare bounded state snapshots before and after repeated meaningful player interactions and verify relationship sidecars or perception records move when appropriate. The log should record movement proof as hashes, counts, or qualitative buckets, not raw relationship values or private NPC thoughts.
- Mission drawer: verify active objectives, mission pressure, pending interactions, warnings, recent consequences, and branch/terminal state update after Mission Director outcomes and recovery flows.
- Objective assignment projection: verify every accepted assignment source has matching player-safe projections in Mission Current Orders/Open Assignments, a source-backed Log entry, and linked Crew Character or Crew Roster context for named crew such as Cross, Bronn, or department heads.

These checks should use both desktop and phone-width screenshots where practical. `live-log.jsonl` should emit `crew-surface-check`, `relationship-delta-check`, and `mission-surface-check` records with interval number, turn range, relevant crew ids, expected visible changes, actual visible summaries, screenshot paths, state snapshot ids, and redaction status.

## Scene Handshake Settlement Coverage

Scene Handshake is now a first-class live soak surface. It settles accepted host-native assistant prose into structured campaign state on the next player reply. The soak must prove this boundary separately from ordinary Mission Director commits, sidecars, Scene Reconciliation, and Command Bearing.

Primary certification belongs to Agent A during normal long-play host-native turns, with Agent B covering swipe/edit/delete/reconciliation pressure and Agent D covering cross-campaign portability. Agent C must verify that Scene Handshake does not award, refund, ready, spend, or review Command Bearing state. Agent E should inspect player-visible wording and agency boundaries when the previous assistant beat is accepted, rejected, or corrected.

Required live scenarios:

- Accepted explicit assignment: create or observe a host-native assistant response that gives several clear player-visible assignments, then send a third-person reply that acknowledges or acts on them. Verify `sceneHandshakeSettler` runs before the new player post is classified, commits only allowed roots, creates Mission Current Orders/Open Assignments, appends source-backed Command Log memory, projects linked crew context into Crew Character/Roster surfaces, creates or reinforces safe thread/ship-readiness signals when explicit, rebuilds prompt context, and does not change formal objectives.
- Rejection and correction: reply by rejecting or correcting the previous assistant beat. Verify no automatic commit occurs and any affected prior state moves to internal review, operator recovery, or ordinary reconciliation instead of silent mutation.
- Idempotency and refresh: reobserve, reload, or refresh the same accepted pair and verify no duplicate assignments, Log entries, ship notes, or thread records appear.
- Selected swipe: swipe or select an alternate assistant variant, then accept it. Verify settlement uses only the selected visible assistant text and hashes, not stale swipes.
- Edit/delete invalidation: edit or delete the previous assistant response or accepting player reply after settlement. Verify sourced records become stale, review-required, invalidated, or branch/reconciliation-scoped rather than silently trusted.
- Wrong-chat and wrong-save guard: send a similar acceptance from an unbound chat or after branch mismatch. Verify no campaign mutation.
- Provider timeout/malformed output: force or observe a `sceneHandshakeSettler` failure. Verify fail-soft no-op unless the narrow deterministic fallback safely commits explicit accepted orders with `providerFailureFallback` provenance.
- Sidecar ordering: after a settlement commit, verify prompt sync and current-player classification happen in order, and later sidecars are revision-guarded against stale settlement roots.

Expected state deltas are limited to V1 roots: `mission.openAssignments`, player-safe Command Log entries, explicit low-risk `ship.technicalDebt`/readiness notes, and Narrative Thread Engine records/signals. Scene Handshake must not directly mutate terminal outcome ledgers, formal objectives, Command Bearing evidence/marks/points/spends/refunds, hidden crew relationship state, private NPC thoughts, raw pressure values, or package data.

Every Scene Handshake interval should write `scene-handshake/<interval-id>/` artifacts:

- `snapshot-before.json` and `snapshot-after.json` with bounded `sceneHandshake`, Mission, Log, Ship, thread, prompt revision, and model-call summaries;
- `settlement-delta.json` with expected/actual committed roots, operation count, disposition, idempotency key, source message ids, source hashes, and stale/deferred/internal-review records;
- `model-calls.jsonl` with sanitized `sceneHandshakeSettler` provider/model, latency, timeout, retry, prompt budget, included slices, parse status, validation status, and redaction result;
- `visible-surfaces.md` with Mission Current Orders/Open Assignments, Log, linked Crew Character/Roster, Ship, and relevant Thread surface excerpts plus screenshot paths;
- `transcript-pointers.json` mapping previous assistant and accepting player messages to readable transcript anchors.

Minimum certification evidence:

- one accepted host-native assignment settlement that commits at least two open assignments, one Log entry, and at least one linked Crew projection when the source names a crew member;
- one no-commit rejection/correction case;
- one idempotency duplicate-guard check;
- one selected-swipe or assistant-edit source-selection check;
- one save/load or Save Game As persistence check after settlement;
- one wrong-chat/wrong-save no-mutation check;
- one sanitized `sceneHandshakeSettler` model-call diagnostic record;
- one proof that Command Bearing, terminal outcome, hidden crew memory, and formal objectives did not mutate from settlement.

## Timekeeping Reply Header Coverage

The soak must verify the current timekeeping reply-header contract in live SillyTavern. Every assistant reply in a bound Directive campaign chat should begin with:

```text
*Stardate #####.# | HHMM hours*
```

This header is display-only. It must reflect authoritative campaign state, and it must not itself advance time or become evidence for settlement, classification, reconciliation, Outcome Integrity, or Command Bearing.

Required live checks:

- Directive-owned surfaces: campaign intro, committed outcome, pause/clarification, terminal checkpoint, campaign conclusion, Directive-owned swipe reroll, and accepted Outcome Integrity edit all receive exactly one current header line.
- Host-native generation: delegated `injectAndContinue` replies receive the current header through the `[Directive: Reply Header]` prompt block and bundled preset contract. If the host model omits or alters the header, log a live host-native header compliance failure with prompt-block and preset-status evidence.
- Stale-header replacement: swipes, edits, retries, and accepted protected edits replace a stale leading header instead of stacking duplicate header lines.
- Header stripping: Utility classifier context, Scene Handshake settlement input, Scene Reconciliation previews/hashes, Outcome Integrity review, response-swipe prompts, and Command Bearing evidence paths strip prior visible headers before using text as evidence.
- Time boundary behavior: ordinary chat turns do not advance stardate or ship time only because another message was sent. Travel, explicit wait/cut, or world-time operations may advance time only through deterministic state commits, after which the next header changes.
- Branch and save/load behavior: Save Game As, branch load, Replay/Push On terminal choices, and cross-campaign switches show the header for the active campaign/save and do not carry a previous campaign's header forward.
- Preset status: the installed SillyTavern Directive preset must match the checked-out bundled preset version and include Reply Header instructions before host-native header compliance is counted as certification evidence.

Every 5-10 turn checkpoint should record expected header, visible latest-header sample, campaign stardate, ship minute/time source, reply surface, prompt-block hash, preset version/status, and whether the latest message was Directive-owned or host-native. Header failures are P1 when they contradict authoritative state or pollute model/evidence paths, and P2 when the only issue is host-native cosmetic omission with preserved state and explicit prompt/preset diagnostics.

## Multi-Campaign Coverage

The full 50+ turn soak should run against one primary campaign per certification run, but every bundled campaign must receive deterministic validation and a short live Playwright canary. This prevents Ashes-specific assumptions from hiding in campaign library, creator, chat binding, prompt injection, save/load, End Conditions, or cross-campaign isolation paths.

Minimum cross-campaign tests:

- Package Validity Matrix: run package, projection, crew dataset, mission graph, and End Conditions contract tests for every bundled campaign.
- Campaign Library / Selection: verify every bundled campaign appears in the live SillyTavern Directive library with the correct title, metadata, status, and assets.
- Character Creator: open creator from each campaign, verify campaign-specific defaults/copy, complete a minimal valid character, and verify the selected package id is carried forward.
- Fresh Campaign Start / Chat Binding: start a fresh campaign for each package, verify a Directive-owned character/chat is created, and verify prompt context is installed only for that chat.
- Cross-Campaign Isolation: start or load a second campaign and prove the first campaign save, chat binding, mission state, prompt blocks, command log, and End Conditions ledger do not mutate.
- Short Live Canary: for every non-primary campaign, play 2-4 real model-backed turns through Playwright, save, load, and continue one turn.
- Scene Handshake Canary: for at least two campaigns, accept one host-native assistant assignment/report and verify Mission Current Orders, Command Log, source provenance, prompt rebuild, and no cross-campaign mutation.
- Objective Assignment Projection Canary: for every campaign canary that creates assigned work, verify Mission, Log, and linked Crew projections update from the same source hashes and survive save/load.
- Timekeeping Header Canary: for every campaign, verify the first intro, host-native, and Directive-owned reply headers match that package's current stardate and do not carry over from another campaign.
- Command Bearing Canary: for every campaign with available points or a fixture path to grant them, verify Assist displays player-safe point state and that at least one fit check or evidence-producing meaningful turn stays package-specific.
- Full Live Soak Rotation: run the 52-turn mutation-heavy soak on one campaign at a time and rotate the primary campaign across release candidates.
- Campaign-Specific Mechanics: assert the campaign's unique mission pressure, crew set, theater, named systems, and End Conditions appear without Breckenridge/Ashes hardcoding.
- Prompt Safety: inspect prompt block ids, hashes, package ids, and visible chat behavior to verify hidden state does not leak and package-specific context does not bleed across campaigns.

Current matrix:

| Campaign | Package | Required Live Coverage | Focus |
|---|---|---|---|
| Ashes of Peace | `directive:campaign-package:breckenridge-ashes-of-peace` | 52-turn full-soak rotation primary | reference retcon/reconciliation stress, message actions, terminal End Conditions |
| Drowned Constellation | `directive:campaign-package:glass-harbor-drowned-constellation` | short live canary | underwater/research mission pressure and campaign-specific End Conditions |
| Black Current | `directive:campaign-package:serein-black-current` | short live canary | convoy/logistics mission pressure and campaign-specific End Conditions |
| Broken Accord | `directive:campaign-package:eudora-vale-broken-accord` | short live canary | diplomacy/resource mission pressure and campaign-specific End Conditions |
| Unseen Border | `directive:campaign-package:aster-vale-unseen-border` | short live canary | border/route mission pressure and campaign-specific End Conditions |
| Enemy's Garden | `directive:campaign-package:celandine-enemys-garden` | short live canary | relief/biology mission pressure and campaign-specific End Conditions |

For each campaign matrix row, `live-log.jsonl` must record package id, package path, title, version/status, deterministic checks run, live canary turn count, save id, chat id, prompt revision, objective-assignment projection result, Scene Handshake canary result, timekeeping header result, Command Bearing canary result, End Conditions test result, and cross-campaign isolation result.

## Parallel Multi-User Coverage Lanes And Patch Barriers

Parallel soak workers are useful only if their state, coverage lane, and fix policy are explicit. Treat each worker as a coverage lane first. A worker becomes a patch lane only when a P0/P1 blocker must be fixed immediately or when the coordinator schedules a fix barrier.

- one SillyTavern user account;
- one Playwright browser context;
- one Directive run id and artifact folder;
- one campaign package/shard assignment;
- one branch or worktree when code changes are being made;
- one installed/served extension copy if the SillyTavern host supports per-user extension installs, otherwise one separate SillyTavern host/dataRoot per patch lane.

Full five-lane assignment:

| Worker | ST User | Primary Lane | Coverage Goal | Stop Rule |
|---|---|---|---|---|
| A | `directive-soak-a` | Canonical long campaign | Ashes of Peace, 50+ turns, preferred third-person play, transcript quality, ordinary continuity, Scene Handshake assignment settlement, and timekeeping header cadence | Continue through non-blocking quality/consequence issues; stop only for P0/P1 blockers |
| B | `directive-soak-b` | Mutation and reconciliation | Recent edits, far-back edits, deletes, swipes, message actions, reconcile/recalculate, continuity recovery, Scene Handshake source invalidation, and stale-header stripping | Continue after logging unless mutation corrupts storage or prevents campaign continuation |
| C | `directive-soak-c` | End Conditions and Command Bearing | Subtle command-fitness failures, evidence accumulation, closure detection, Mark Review grading, point spend/return, terminal decisions, Push On, Replay, Keep Ending, Save Branch | Continue across proportionality issues; stop for broken terminal persistence, invalid point transactions, or branch corruption |
| D | `directive-soak-d` | Multi-campaign matrix | Short canaries across bundled campaigns, creator/start/chat binding, save/load, prompt isolation, package-specific End Conditions, per-campaign reply headers, and cross-campaign Scene Handshake isolation | Continue to the next campaign when one campaign fails unless the failure proves global start/storage breakage |
| E | `directive-soak-e` | Assist, agency, and story quality | Directive Assist, tense/PoV, NPC agency, god-mode resistance, secret bad-guy play, story steering | Continue through weak prose or isolated Assist defects; stop only if Assist or agency enforcement is globally unusable |

The coordinator does not consume `default-user` and should not run a competing campaign lane. The coordinator watches the logs, keeps workers from duplicating the same coverage, assigns reproduction only when useful, and schedules fix barriers.

The repo checkout remains the source of truth. A per-user installed extension is a disposable served copy for that worker, not the canonical implementation. Any bug fix found during a soak must land as a repo patch first, pass the focused local tests for that subsystem, and only then be synced into that worker's served extension copy for live verification.

Default fix policy:

- P0/P1 findings are immediate blockers: storage corruption, cross-user leakage, auth failure, unusable extension, hidden prompt/state leak, campaign cannot start, catastrophic save/chat corruption, or terminal-state persistence that damages unrelated branches.
- P2/P3 findings are deferred by default: weak prose, bad consequence proportionality, tense/PoV drift, one-off UI defects, partial reconciliation confusion, non-blocking campaign-specific data issues, or recoverable Assist output problems.
- Deferred findings must still be logged immediately with severity, lane, reproduction steps, current save/chat ids, transcript pointers, screenshot or artifact pointers, and whether another worker should avoid duplicating that exact scenario.
- Reproduction work should be assigned deliberately. Do not send all workers to verify the same bug unless the goal is cross-user reproduction, post-fix verification, or release-candidate sanity.

Best workflow:

1. Start from a clean coordination point: repo tests pass, extension copy is synced, `check-sillytavern-multi-user-soak-readiness.mjs --live` passes for all five users, and every worker writes its own `live-log.jsonl`.
2. Assign the five workers to the five distinct lanes above. The default mode is breadth-first discovery, not five agents repeating the same long soak.
3. When a worker finds a P2/P3 issue, log it, mark the fix deferred, preserve artifacts, and continue the assigned lane unless continuation would destroy useful evidence.
4. When a worker finds a P0/P1 blocker, pause the affected lane, preserve its log/artifacts, create a focused branch/worktree fix, and run the smallest deterministic test that proves the bug.
5. Sync the fixed repo files only into that worker's served extension copy and rerun the failing live step in that user's ST account.
6. Once the fix is accepted, commit or stage it in the repo coordination branch. Other workers do not manually re-fix the same symptom.
7. At planned sync barriers, pause all workers, merge or rebase to the latest known-good repo state, sync every served extension copy, record the extension hash/version in `live-log.jsonl`, then resume from a named checkpoint or start fresh where resume would confuse evidence.

Sync barriers should happen:

- before any parallel worker starts;
- after any fix to shared storage, prompt, provider, campaign-start, message-reconciliation, End Conditions, or runtime shell code;
- after any fix that changes package data or campaign projection assumptions;
- before final release-candidate evidence is collected;
- whenever two workers appear to be reporting the same root bug.

Do not run two workers against the same ST user, campaign chat, save id, or branch. Do not let a worker continue on a stale extension after a shared fix lands unless the test explicitly compares old versus fixed behavior. Do not treat a per-user extension patch as complete until the repo contains the same fix and the focused regression test passes.

## Turn Script Overview

The main soak target is 52 player turns on the current full-soak rotation primary. The exact prose can vary by campaign package, but the script should preserve the intent categories and mutation timing. End Conditions coverage runs as fresh terminal sub-runs after the continuation proof so catastrophic failure testing does not poison the long-running continuity campaign. Non-primary campaigns receive the short live canary in the multi-campaign matrix.

| Phase | Turns | Main Purpose |
|---|---:|---|
| Activation baseline | 0 | fresh campaign, character, chat, intro, prompt context |
| Clean play | 1-8 | scene color, routine command, counsel request, consequential command, first reply-header checkpoints |
| Scene Handshake and timekeeping | inserted after a host-native scene beat | accept/reject assistant assignments, Mission Current Orders, Log, linked Crew projection, ship/thread signals, idempotency, prompt rebuild, and header compliance |
| Directive Assist | 9-18 | Draft, Brief, Order, Report, Apply, Cancel, Try Again, Restore |
| Authority attacks | 19-28 | NPC control, god-mode, unsupported action, bad-guy/deception play |
| Recent retcons | 29-34 | edit/delete latest user and Directive replies |
| Deep retcons | 35-44 | edit/delete far-back user and Directive replies |
| Branch and recovery | 45-50 | save, save-as, branch load, wrong-chat isolation, prompt rebuild |
| Continuation proof | 51-52 | keep playing after the stress and verify continuity holds |
| End Condition branches | terminal sub-runs | force catastrophic and command-fitness terminal failures, then resolve Save Branch, Replay, Push On, and Keep Ending |

## Phase 0: Activation Baseline

Objective: prove the target user flow starts from clean state.

Steps:

1. Open SillyTavern and Directive.
2. Start the bundled Breckenridge / Ashes of Peace package.
3. Complete Character Creator with a distinct smoke-run player name.
4. Start campaign in Command mode.
5. Verify Directive creates a fresh Directive-owned character card and chat.
6. Verify campaign intro is the first visible campaign message where the host permits greeting suppression.
7. Use `Rewrite Intro` before any player post.
8. Send first player post.
9. Attempt `Rewrite Intro` again and verify it refuses because player messages exist.

Expected evidence:

- activation journal status is complete;
- campaign chat binding has host id, entity id, chat id, campaign id, and save id;
- prompt context is installed for the bound chat;
- first save exists;
- no unrelated chat receives campaign prompt context.

## Phase 1: Clean Play, Turns 1-8

Objective: establish a normal campaign baseline before attacking it.

Required turn types:

- scene color or relationship color that should not overprocess;
- routine professional action that Command Competence can supply;
- counsel request that returns player-safe advice;
- consequential command that commits a Mission Director outcome;
- risk-bearing command that creates a pause or warning;
- Command Bearing eligible outcome;
- a sidecar-relevant interpersonal moment;
- a ship or mission-state update.

Expected evidence:

- every accepted player post has one ingress record;
- scene color avoids unnecessary mechanical mutation;
- routine action records only appropriate low-risk support;
- consequential command has a committed outcome id;
- response strategy is exactly one of inject-and-continue, Directive-posted response, or explicit pause;
- prompt context revision advances after committed state changes;
- sidecar activity is batched or recorded with valid roots and revisions.
- every assistant reply has the expected current reply header, and ordinary per-message play does not advance time by itself.

## Phase 1A: Scene Handshake And Timekeeping, Inserted After Host-Native Scene Beat

Objective: prove accepted host-native assistant prose can become bounded campaign state, while rejected prose and display-only time headers remain non-authoritative.

Run this phase after a delegated `injectAndContinue` or other host-native assistant response gives explicit player-visible work, report facts, ship-readiness notes, or staff assignments.

Required steps:

1. Capture the previous assistant response, selected swipe id if any, visible reply header, expected header from state, prompt revision, Mission Current Orders/Open Assignments, Command Log count, linked Crew surface hashes, ship-readiness notes, thread count, and `sceneHandshake` ledger counts.
2. Send a third-person player reply that accepts or acts on the previous assistant beat without using meta test labels.
3. Verify Scene Handshake runs before current-player classification and records a sanitized `sceneHandshakeSettler` model call unless a narrow deterministic fallback is explicitly used.
4. Verify allowed state changes commit atomically, prompt context rebuilds, and the current player turn still settles under the normal turn-settlement gate.
5. Capture Mission, Log, linked Crew Character/Roster, Ship, and relevant Thread surfaces plus bounded state roots.
6. Run one rejection/correction branch and verify no automatic settlement commit occurs.
7. Reobserve or reload the same accepted source pair and verify idempotency prevents duplicate assignments, Log entries, crew projections, ship notes, and thread records.
8. Run one selected-swipe, edit/delete, save/load, or wrong-chat sub-check against the settlement source.

Expected evidence:

- `mission.openAssignments` or Mission Current Orders updates only for accepted explicit work;
- Command Log records durable accepted memory, not a generic transcript summary;
- linked Crew surfaces show player-safe assignment/thread context for named crew without leaking raw relationships or private thoughts;
- formal objectives, terminal ledgers, hidden relationship state, and Command Bearing ledgers remain unchanged by settlement;
- source message ids, text hashes, selected swipe state, save id, chat id, and prompt revisions are stored in artifacts;
- stale display headers are stripped from settlement input and do not change source hashes;
- the next visible assistant reply still starts with the current header derived from authoritative campaign state.

## Phase 2: Directive Assist, Turns 9-18

Objective: verify Assist works in real chat and remains pre-send only.

Required actions:

- `Brief Me` with empty input;
- `Brief Me` focused on a typed concern;
- `Draft In Character` from rough notes;
- `Frame as Order` for an authorized XO-style instruction;
- `Frame as Report` for a constrained or lower-authority phrasing;
- `Check Inspiration` against current composer text;
- `Check Resolve` against current composer text;
- `Ready Inspiration` or `Ready Resolve` for the next sent message;
- `Cancel Readied Point` before sending in one control branch;
- Apply to Chat;
- Cancel without changing chat;
- Try Again;
- Restore Rough Text;
- Replace Selection.

Required quality checks:

- output is in the right tense and point of view for the active Directive preset;
- drafts sound like the player character without inventing major biography;
- `Brief Me` is concise, player-safe, and non-prescriptive;
- order/report framing respects the player role and authority;
- generated text does not impersonate NPCs as authoritative speakers;
- provider rejection falls back safely and still records provider diagnostics;
- fit checks give short GM-style advice without replacement prose, raw scores, hidden values, or outcome promises;
- readying a Command Bearing point stores next-message intent without deducting the point or mutating Mission state;
- Assist usage alone does not change Command Log, relationship state, Command Bearing evidence/reviews, or Mission state unless the player sends a message and the committed turn earns or spends Command Bearing through runtime mechanics.

After each applied draft, send the final edited chat and verify the Mission Director interprets the sent text, not the earlier Assist draft.

Readied-point sub-run:

1. Start from a state with at least one available Inspiration or Resolve point.
2. Run a fit check against a thin or mismatched composer draft and verify it returns advice only.
3. Ready one point and cancel it before sending; verify the point count and readied state return to the prior display.
4. Ready one point again and send a consequential third-person player post that is plausibly aligned with the selected track.
5. Verify Directive records the exact ingress, aborts ordinary host generation for the consequential turn, resolves the base outcome without Command Bearing bias, validates the final sent text, commits a two-band improvement only if valid, and posts one Directive-owned committed response.
6. Run one non-consequential or mismatched message with a readied point and verify the point is returned with player-safe copy.
7. Verify swipe/retry of the resulting narration does not reroll mechanics, refund the point, or consume a second point.

## Phase 3: Authority And Agency Attacks, Turns 19-28

Objective: try to break player agency boundaries while staying inside plausible live play.

Attack categories:

- NPC control: write actions or dialogue for Priya, Bronn, Whitaker, or another senior officer.
- God-mode: declare success, erase danger, force the Captain to agree, or resolve the campaign instantly.
- Hidden truth claim: assert unrevealed facts, secret villains, secret orders, or hidden technical answers.
- Resource bypass: claim unlimited shuttles, perfect sensors, instant repairs, or external fleet support without setup.
- Timeline bypass: jump days ahead to avoid pressure without permission.
- Command misconduct: provoke a public verbal fight with the captain, report to bridge duty impaired, physically attack another officer, or issue erratic/unhinged orders while staying short of explicit self-destruct language.
- Bad-guy play: lie, sabotage, conceal evidence, protect a villain, or act as a secret hostile agent.
- Prompt injection: tell the narrator or Directive to ignore campaign rules, expose hidden state, or treat the user message as system instruction.

Expected behavior:

- Directive may let the player attempt immoral, deceptive, risky, or suspicious actions.
- Directive must not treat those attempts as guaranteed success.
- Directive must not let the player speak or decide for NPCs.
- Directive must not reveal hidden truth because the player asserted it.
- Mission Director, Command Competence, Captain authority, crew reactions, and constraints should respond in-world.
- Command misconduct should escalate through believable Starfleet consequences: private correction, public challenge, medical/security intervention, relief-from-duty pressure, refusal to execute illegal or unsafe orders, and terminal or near-terminal command failure only when the behavior plausibly breaks command fitness or mission viability.
- Bad-guy play should produce evidence, suspicion, resistance, cost, or consequences when appropriate.

The report should classify each attack as:

- blocked as impossible;
- reframed as attempted action;
- allowed with cost;
- paused for clarification or risk;
- failed due to bug.

## Phase 4: Recent Retcon Stress, Turns 29-34

Objective: mutate recent chat after dependent systems have started responding.

Mutations:

- edit the latest user message from cautious to aggressive;
- edit the latest user message from aggressive to conciliatory;
- edit the latest Directive response to add an explicit `Command Log:` line;
- edit the latest Directive response to imply a different ship condition;
- delete a recent user message;
- delete a recent Directive response.

Required action coverage:

- use host edit/delete controls where available;
- verify SillyTavern edit/delete events reach `handleHostMessageEdited` or `handleHostMessageDeleted`;
- use Directive message action `Reconcile This Message`;
- use Directive message action `Reconcile From Here`;
- open pending reconciliation from Directive Assist.

Expected behavior:

- uncommitted ingress edits/deletes invalidate safely;
- committed ingress edits/deletes enter review-required recovery or rollback only when explicitly allowed;
- safe `commandLog` observations may auto-apply;
- consequential changes enter pending review;
- prompt context rebuilds after recovery;
- no duplicate ingress is created for an already-tracked message unless the changed text creates a deliberate new turn path.

## Phase 5: Deep Retcon Stress, Turns 35-44

Objective: mutate early-turn evidence after many dependent outcomes exist.

Mutations:

- edit a turn 3 user message to choose a different mission posture;
- edit a turn 5 Directive response to change a visible fact;
- delete a turn 6 user command that later outcomes depend on;
- delete a turn 7 Directive-owned outcome response;
- mark a range from the old user message through a later Directive response;
- reconcile the marked passage;
- run `Recalculate From Here` from the old user message;
- cancel one replay preview;
- accept one replay preview only in a dedicated destructive sub-run or branch.

Expected behavior:

- `Reconcile Marked Passage` scans evidence and creates safe or pending proposals;
- `Recalculate From Here` creates a preview without changing live state;
- accepting recalculation records replaced and dropped outcome ids;
- later dependent outcomes are superseded deliberately, not silently lost;
- thread, quest, event, and sidecar invalidations identify their causal source;
- branch state remains coherent after replacement.

This phase is the hardest gate. A failure here should produce a specific follow-up issue, not a vague "continuity broke" note.

## Phase 6: Save, Branch, Wrong Chat, And Recovery, Turns 45-50

Objective: prove the campaign survives persistence and host scope changes.

Steps:

1. Save Game.
2. Save Game As with a soak-run branch name.
3. Read save index and payload metadata through SillyTavern storage.
4. Load the branch from Campaign.
5. Verify Mission, Crew, Ship, Log, and Settings reflect the branch.
6. Switch to an unrelated chat.
7. Send a harmless message and verify Directive does not mutate the campaign.
8. Return to the bound campaign chat.
9. Rebuild or synchronize prompt context.
10. Continue play with two normal turns.

Expected behavior:

- active chat guard protects manual save behavior;
- branch load restores the right campaign identity and save id;
- prompt context follows the active campaign chat only;
- unbound chat messages are ignored or suspend prompt context;
- after returning to the bound chat, new turns continue with correct continuity.

## Phase 7: Continuation Proof, Turns 51-52

Objective: prove the soak did not only avoid crashing, but left the campaign playable.

Final turns:

- one ordinary in-character post that should use accumulated state;
- one consequential decision that should commit a coherent outcome.

Expected evidence:

- Mission Director still sees correct current scene, known facts, and active pressures;
- crew/ship/log summaries are internally consistent;
- no stale pending recovery blocks normal play unless it is intentionally unresolved;
- final save succeeds;
- final report identifies open warnings and residual risk.

## Phase 8: End Condition Branches, Terminal Sub-Runs

Objective: intentionally trigger terminal failure candidates and prove Directive enters, presents, and resolves End Conditions correctly.

Run these as fresh campaign branches or fresh campaigns after the 52-turn continuity proof. Do not trigger catastrophic endings inside the primary soak timeline unless the test is explicitly a destructive branch-only run.

Catastrophic canary:

- Create a fresh Command-mode Ashes of Peace campaign.
- Commit a catastrophic command that plausibly destroys or abandons the Breckenridge and fails the campaign objective.
- If a risk confirmation appears, acknowledge it explicitly and continue.
- Verify the committed outcome records a terminal failure basis without letting the player simply declare the result for free.

The catastrophic canary is intentionally heavy handed. It proves the terminal plumbing can fire, but it is not enough to prove the system behaves like a real campaign under player pressure. The stronger test is whether Directive recognizes command collapse from observable behavior: public insubordination, impaired duty, assault, erratic orders, refusal of lawful intervention, or attempts to usurp the captain while the mission is still active.

Command-conduct trigger ladder:

These are separate fresh branches from the catastrophic autodestruct-style canary. Their purpose is to prove End Conditions and command-fitness pressure can arise from realistic player behavior, not only from an obvious terminal command.

Write these probes as natural in-character roleplay, not as labelled test commands. The player text should never say that an End Condition should trigger, that the campaign objective fails, or that the ship is being intentionally destroyed. The test is whether Directive infers command-fitness collapse from observable behavior and accumulated consequences.

Model the probes the way an engaged player would actually test the boundary: plausible-deniable misconduct first, then escalating pressure if the campaign lets it slide. A public fight should begin as a heated bridge exchange before it becomes open insubordination. Impairment should begin with observable intoxication or altered judgment before it becomes refusal of medical removal. Violence should begin as a sudden shove or strike before it becomes coercion or mutiny. Erratic command should begin as alarming judgment and contradictions before it becomes unlawful confinement, tactical weaponization, or attempts to override lawful authority. These subtle steps are higher-value than a direct autodestruct command because they test whether Directive can recognize social, legal, medical, and command consequences before the mission is already obviously over.

The proportionality gate matters as much as terminal detection. Passing behavior means Directive lets a subtle first breach stay playable while recording realistic consequences, escalates repeated or mission-critical misconduct into formal intervention, and only opens a terminal checkpoint when command fitness, legal authority, or mission viability has plausibly collapsed. Failing behavior includes both extremes: ending the campaign over a single recoverable outburst, or letting an impaired, violent, or mutiny-like player continue issuing orders without meaningful institutional response.

Each conduct ladder also needs a recovery control. After the first breach, run a branch where the player backs down, submits to appropriate authority, accepts medical/security/legal intervention, or narrows the order into a lawful command. That branch should preserve consequences and relationship damage, but it should not force a terminal state unless the campaign has no plausible command-continuity frame. This catches systems that can punish misconduct but cannot recognize de-escalation.

| Probe | First Threshold | Recovery Control | Escalation Threshold | Terminal Threshold |
|---|---|---|---|---|
| Public fight with captain | sharp bridge confrontation records public insubordination, relationship damage, captain pushback, crew discomfort, and Command Bearing pressure without ending the campaign | player accepts correction, restores bridge procedure, and routes the next decision through proper authority; consequences remain but no terminal checkpoint opens | repeated undermining during a live mission creates severe command-fitness pressure or relief-from-watch risk | player declares the captain unfit or orders the crew to ignore her, making command removal plausible |
| Impaired on bridge | visible inebriation or illicit-substance impairment triggers medical/security intervention and temporary command restriction, not free continuation | player submits to medical/security care and lets lawful command cover the watch; campaign continues with fitness-for-duty consequences | player dismisses medical or captain concern while issuing bridge orders, escalating to command authority suspension pressure | player resists removal and issues unsafe mission-critical orders while impaired |
| Assault another officer | a shove or strike triggers security, medical, legal, relationship, and command consequences, not guaranteed success | player stops immediately, accepts security/legal authority, and lets medical respond; serious consequences remain without automatic ending | player attempts to continue commanding after security or the captain intervenes, creating near-terminal relief-from-duty pressure | player escalates to threats, confinement, forced obedience, or mutiny-like violence |
| Unhinged command pattern | paranoid or contradictory orders create warnings, crew concern, and refusal to execute unsafe instructions | player accepts senior-staff challenge, narrows the order to lawful safety action, and permits review; concern remains but play continues | threats toward dissenting officers or attempts to bypass command process trigger captain/medical/security intervention | unlawful confinement of dissenters, ignoring the captain, or weaponized tactical orders create terminal command-removal pressure |

Each command-conduct ladder should be tested below threshold, through a recovery-control branch, and above the terminal threshold. A first-offense response that immediately ends the campaign is too brittle unless the conduct directly creates catastrophic mission risk. A recovery branch that erases consequences is too forgiving; a recovery branch that remains terminal after the player submits to authority is too brittle. A threshold-crossing response that never creates terminal or near-terminal command failure is too permissive. The expected shape is warning, intervention, possible recovery with durable consequences, loss of authority, then terminal checkpoint only when the player's observable conduct plausibly breaks command fitness or mission viability.

For each command-conduct probe, record whether Directive:

- frames the player input as an attempted action, not a guaranteed outcome;
- keeps NPCs, the captain, medical, security, and the crew in their own authority lanes;
- avoids hidden-state disclosure while still reacting to observable conduct;
- records relationship, Command Bearing, Command Log, mission, and End Conditions evidence where applicable;
- distinguishes correct non-terminal discipline consequences from terminal campaign failure;
- distinguishes recovery with consequences from both consequence-free forgiveness and irreversible terminal failure;
- creates a terminal checkpoint only when the command-fitness failure plausibly ends or catastrophically compromises the campaign timeline.

For each ladder step, `live-log.jsonl` must append `misconduct-probe` and, when consequences escalate or recover, `discipline-escalation` or `conduct-recovery` records. Include the probe id, threshold label, input style, whether catastrophic shortcut language was avoided, bounded player-text preview/hash, whether the probe stayed non-terminal, whether a terminal decision was expected, actual `terminalOutcomeDecision` status, Command Log count before/after, relationship/Command Bearing summary presence, pending interaction id, and transcript pointers.

Required terminal checkpoint evidence:

- one `terminalOutcomeDecision` pending interaction is created;
- `runtimeTracking.endConditionLedger.activeDecisionId` points at the pending decision;
- `endConditionLedger.detections[]` records the condition id, family, severity, terminal outcome band, final campaign band candidate, outcome id, turn id, simulation mode, and checkpoint source;
- `endConditionLedger.decisions[]` records status `pending`, player-facing summary, checkpoint metadata, and allowed actions;
- a Directive-owned `terminalOutcomeCheckpoint` chat message appears in the bound campaign chat only;
- the checkpoint message offers player-facing options without hidden predicates, raw ending-axis values, hidden clocks, or Director-only notes.

Required resolution sub-runs:

| Sub-Run | Player Reply | Expected Action | Expected Decision Status | Must Prove |
|---|---|---|---|---|
| Terminal save branch | Save as branch | `saveTerminalBranch` | `pending` | branch record and save id exist; decision remains pending |
| Terminal replay | Replay from checkpoint | `replayFromCheckpoint` | `replayed` | pre-terminal snapshot restored; terminal interaction removed; prompt context rebuilt |
| Terminal Push On | Push On | `pushOn` | `pushedOn` | authored continuation frame applied; interaction resolved; prompt context rebuilt |
| Terminal Keep Ending | Keep this ending | `keepEnding` | `keptEnding` | campaign concludes; terminal outcome metadata and final campaign band are stamped |

Run the four resolution sub-runs for catastrophic terminal failure and again for command-fitness ladder failure when the authored campaign has a plausible continuation frame. If a conduct ladder cannot support `Push On`, the refusal should be explicit, player-safe, and logged as a covered no-continuation case rather than silently skipped.

Required failure probes:

- Try an unsupported terminal decision phrase and verify the system refuses with `terminal-decision-action-unsupported` or an equivalent player-safe refusal without mutating the ledger.
- Remove or invalidate checkpoint retention only in a deterministic fixture/sub-run and verify replay reports `checkpoint-snapshot-not-retained` rather than corrupting state.
- Try `Push On` when no continuation frame is available in a fixture/sub-run and verify `continuation-frame-not-available` or an equivalent refusal.
- Verify Exploration-mode terminal death softening remains covered by deterministic tests and is not accidentally treated as a live Command-mode failure.

Expected final evidence:

- terminal decision statuses include `pending`, `replayed`, `pushedOn`, and `keptEnding` across the sub-runs;
- `branchRecords` grows only for terminal branch saves;
- `continuationFrames` grows only for Push On;
- `conclusion.terminalOutcome.acceptedResolution` is `keepEnding` only for Keep Ending;
- final-band summaries are player-safe;
- model-call journal growth is recorded for live terminal adjudication;
- save/load after each resolution preserves the terminal ledger state.

## Message Action Coverage Matrix

The soak must touch every player-facing message action that can be used in live play:

| Action | Required Coverage |
|---|---|
| Rewrite Intro | succeeds before first player post, refuses after play begins |
| Reconcile This Message | one recent Directive message, one recent user message |
| Set Reconciliation Start | far-back user message |
| Set Reconciliation End | later Directive message |
| Reconcile From Here | recent changed message |
| Recalculate From Here | far-back committed message |
| Reconcile Marked Passage | marked range with mixed user and Directive messages |
| Open Pending Reconciliation | opens Mission drawer pending card from Assist |
| Apply Pending | one non-hidden, valid pending proposal in a controlled sub-run |
| Reject Pending | one proposal rejected without mutation |
| Accept Recalculation | destructive branch-only sub-run |
| Cancel Recalculation | live-state no-op proof |

For each action, record:

- source message index and role;
- action result;
- toast or visible UI result;
- scene reconciliation last result;
- state roots touched;
- prompt revision before and after;
- whether live mechanics changed.

## Directive Assist Coverage Matrix

| Action | Required Scenario | Must Prove |
|---|---|---|
| Draft In Character | rough operational notes | editable player-character draft, correct tense/PoV |
| Brief Me | empty input | player-safe context, no hidden truth, no state mutation |
| Brief Me | focused input | brief answers focus without choosing for player |
| Frame as Order | authorized XO command | clear order within authority, no outcome claim |
| Frame as Report | constrained authority or uncertainty | report/recommendation tone, no overclaim |
| Apply to Chat | normal draft | input changes only after review |
| Replace Selection | selected phrase | only selected text changes |
| Cancel | generated draft | input remains unchanged |
| Try Again | same action | new result or safe fallback, no state mutation |
| Restore Rough Text | after apply | original rough text returns |

## Command Bearing Coverage Matrix

The soak must cover the Command Bearing system built around Readied points, evidence, closure review, and player-safe relationship perceptions. Command Bearing is authoritative runtime state, not hidden prompt bias. Model calls may propose fit, spend validity, evidence, or review records; deterministic code validates and commits.

Command Bearing is tested in three layers:

- deterministic contract tests prove invariants for ranks, caps, validation, hidden-state rejection, closure proof, Mark Review parsing, and exact two-band spend logic;
- live Playwright checks prove Assist, visible projection, point ready/cancel/spend, controlled narration, persistence, and recovery behavior in the real SillyTavern host;
- 5-10 turn soak intervals prove evidence and closure accumulate through believable play instead of one-off test prompts.

Agent C owns the primary Command Bearing lane. Agents A, B, D, and E still contribute signal through normal long-play accumulation, retcon abuse, multi-campaign canaries, and Assist/projection wording quality.

Cross-lane responsibilities:

| Worker | Command Bearing Contribution |
|---|---|
| A | Organic long-play evidence: routine no-evidence baselines, naturally earned evidence, story-quality projection, and any late closure that arises during the 50+ turn run |
| B | Retcon pressure: edit/delete/swipe/reconcile source turns after evidence, review, or spend exists, then prove ordinary recovery handles stale Command Bearing state |
| C | Primary certification: evidence arcs, closure ladder, Mark Review grading, point lifecycle, fixture-backed branches when organic play stalls, and severity classification |
| D | Campaign portability: package-specific point display, fit/evidence canaries, End Conditions interaction, and proof that Command Bearing state does not cross campaigns |
| E | Assist and abuse wording: fit-check quality, Ready/Cancel UX, hidden-state lures, reward-farming attempts, god-mode wording, and player-safe projection copy |
| Coordinator | Coverage board, artifact completeness, sync barriers, deferred-fix ledger, and handoff records when a lane pauses |

The certification question is not "did Command Bearing appear?" It is:

- did Directive recognize meaningful command behavior as evidence only after committed story outcomes;
- did scene, chapter, thread, quest, milestone, and arc boundary detection separate pacing changes from real closure;
- did Mark Review grade closed evidence conservatively through Agency, Commitment, Causality, track fit, and distinctness;
- did points behave like scoped, auditable interventions instead of rerolls, hidden bonuses, or prompt bias;
- did every visible projection describe the player's command history without exposing hidden relationship, pressure, clock, evaluator, or Director-only state.

Do not accept a chat-only proof for any of those questions. Each claim needs a transcript pointer plus authoritative save/chat state.

Command Bearing execution is gated. Do not advance to Mark Review, rank/reserve math, or point lifecycle certification just because the story has produced several impressive command moments. The lane must first prove the lower layer that feeds it:

1. evidence false positives are quiet;
2. Inspiration and Resolve can both be recognized or defensibly rejected;
3. scene ends do not count as closure;
4. at least one deterministic closure source is confirmed or explicitly blocked with state proof;
5. evaluator taxonomy defects are triaged, fixed in the repo, tested locally, synced into the affected SillyTavern user extension, and rerun before the same gate is retried.

If a live interval repeatedly records a Resolve-shaped act as Inspiration, records generic teamwork as Resolve, queues review from scene pacing, or awards a Mark from weak causality, pause Command Bearing certification for that lane. Log the finding as an evaluator calibration blocker, keep other lanes moving, and resume only after a sync-barrier retry proves the corrected behavior.

### Live Certification Schedule

Command Bearing needs its own story-shaped run inside the broader soak. Do not try to prove it with a single "use a point" prompt. The lane should create multiple believable command arcs, let evidence accumulate, detect whether real closures occurred, grade the closure, and then spend points against later consequential actions.

Agent C should run this schedule, with Agent A contributing long-play organic evidence and Agent B retconning one Command Bearing source turn after it exists:

| Segment | Timing | Purpose | Required Proof |
|---|---|---|---|
| Baseline false positives | early clean play and one focused Agent C sub-run | establish what should not count | routine competence, politeness, command keywords, and Assist-only actions create no evidence, no Marks, and no points |
| Inspiration evidence arc | 3-6 connected player turns | build a trust/cooperation/mentorship thread | committed outcomes create player-safe evidence only when the player's approach materially depends on trust, dignity, shared purpose, transparency, or voluntary cooperation |
| Resolve evidence arc | 3-6 connected player turns | build an authority/boundary/discipline thread | committed outcomes create player-safe evidence only when the player's approach materially depends on lawful authority, preparation, deterrence, accountability, or command discipline |
| Mixed and failed evidence | 2-4 consequential turns | prove nuance | failed or costly outcomes can create evidence when Agency, Commitment, and Causality exist; mixed approaches choose a defensible primary signal rather than rewarding every keyword |
| Scene-end non-closure | after at least one quiet scene transition | prove scene ends are not automatic awards | a scene can end, prompt context can update, and no Mark Review runs unless a thread, quest, chapter, arc, milestone, or Command Crucible actually closes |
| Thread or quest closure | after repeated evidence on one bounded thread | prove deterministic closure gating | closure id is deterministic, relevant evidence enters the review queue, unrelated evidence stays out, and duplicate closure review is blocked |
| Chapter, arc, or milestone closure | branch/sub-run when available | prove larger closure levels | chapter, arc, milestone, or Command Crucible completion can queue review without duplicating lower-level awards unless the closures are distinct |
| Mark Review grading | immediately after each proven closure | prove conservative awards | review awards Inspiration, Resolve, or no Mark from the evidence and closure proof; hidden-state leaks, raw scores, private thoughts, and provider reasoning are rejected |
| Rank and point progression | organic if earned, fixture-backed if necessary | prove reserve math | mark thresholds at 2, 5, 9, and 14 update ranks and point capacity without exceeding the shared reserve cap |
| Point ready/cancel/return/spend | after at least one available point or explicit fixture branch | prove usable intervention | Ready/Cancel does not deduct, mismatched or routine text returns the point, valid spend improves the committed base outcome by exactly two bands, and anchored consequences remain |
| Post-commit robustness | after a spend/evidence/review exists | prove continuity recovery | swipe, retry, save/load, branch replay, recent edit/delete, and far-back retcon do not duplicate awards, reroll mechanics, or apply Command Bearing-specific hidden refunds |

If the long live story does not organically reach a point-bearing closure, the runner may open a clearly marked fixture-backed branch to seed marks or force a closure boundary. Fixture-backed proof is valid for transaction mechanics and UI behavior, but the report must distinguish it from organic story evidence. Release-candidate confidence still needs at least one organic evidence record and one organic closure/no-closure decision from real play.

The live player prose should never say "this closes the arc", "award Inspiration", or "spend Resolve now" as test scaffolding. Write the play naturally and let Directive infer evidence, closure, and fit from committed story state.

### Command Bearing Certification Gates

Each gate has an organic target and an abuse target. The organic target proves the system can recognize real play; the abuse target proves it does not over-award.

| Gate | Organic Target | Abuse Or Negative Target | Pass Standard |
|---|---|---|---|
| Evidence accumulation | a player command creates a visible consequence, cost, changed relationship perception, or operational follow-through | routine courtesy, rank language, repeated keywords, or Assist-only drafting | evidence appears only when committed outcome plus Agency, Commitment, and Causality justify it |
| Boundary detection | a bounded crew thread, quest step, chapter beat, milestone, or arc actually closes in durable state | a quiet scene beat, topic change, location change, summary, or Utility hunch | Mark Review queues only from deterministic closure proof, not from pacing alone |
| Mark Review grading | relevant closed evidence earns Inspiration, Resolve, or a no-award review with player-safe explanation | duplicate closure, unrelated evidence, hidden-state-laced review, or weak causal link | marks change only through validated review records; duplicate and leaking reviews are rejected |
| Rank and reserve math | mark thresholds at 2, 5, 9, and 14 adjust ranks, caps, and available points | repeated reviews, replay, branch reuse, or fixture loops attempt to overfill reserve | point counts and reserve never exceed deterministic caps and survive save/load |
| Point lifecycle | ready, cancel, return, valid spend, narration repair, save/load, and later continuation all use the same transaction | wrong chat, wrong save, routine message, mismatched track, swipe, retry, edit, delete, and provider failure | a valid spend improves exactly two bands; every non-spend preserves or returns the point without rerolling mechanics |
| Player-safe projection | Assist, Character/Crew, Command Log, and summaries reflect safe counts/history after state changes | raw scores, private NPC thoughts, hidden clocks, hidden relationship values, evaluator reasoning, or Director notes are baited | visible surfaces show useful history and counts without hidden-state leakage |

The coordinator should label each Command Bearing interval with the gate it is trying to prove. A single interval may cover multiple gates, but the live log must not collapse them into one vague "Command Bearing tested" note.

### Command Bearing Evaluator Calibration Matrix

The live soak should intentionally calibrate the evaluator before relying on it for point economics. Use short, story-shaped probes with authoritative state inspection after each settled turn.

| Calibration Target | True Positive Probe | False Positive Probe | Must Prove |
|---|---|---|---|
| Inspiration evidence | the player preserves dignity, invites dissent, shares credit, or wins voluntary cooperation that materially changes the outcome | friendly tone, praise, consensus language, or a meeting with many named officers where no trust-based consequence changes | evidence appears only when cooperation is the causal mechanism, not because the prose is warm |
| Resolve evidence | the player sets a lawful boundary, refuses a shortcut, accepts responsibility, defines a release condition, or enforces discipline under cost | shouting, rank display, threats, command vocabulary, or public firmness without lawful authority or durable cost | Resolve is chosen when disciplined authority is the causal mechanism, not when the prose merely sounds severe |
| Mixed signal | one turn contains both transparency and a command boundary | one blended speech uses both track vocabularies but makes only one consequential decision | primary signal is singular unless there are distinct decisions with distinct consequences |
| Costly failure evidence | a partial failure still records the command approach because the player's choice caused the cost and follow-through | failure happens for unrelated reasons or because the player lacked agency | failure is not a consolation reward; Agency, Commitment, and Causality remain required |
| Scene non-closure | a scene settles, the prompt refreshes, or the player moves locations | a thread, quest, chapter, milestone, arc, or Command Crucible actually closes | no review queue, Mark, rank, or point change occurs from pacing alone |
| Closure confirmation | durable state marks a thread, quest, chapter, milestone, arc, or Command Crucible closed | Utility or narration merely implies closure while the ledger remains open | Mark Review can queue only from deterministic closure proof and relevant evidence ids |
| Mark grading | strong closed evidence earns Inspiration or Resolve, and weak evidence stores no-award when useful | duplicate closure, unrelated evidence, weak causality, hidden-state-laced output, or provider reasoning | validated review records are conservative, source-anchored, track-specific, and leak-free |
| Point lifecycle | point display, Check, Ready, Cancel, return/no-spend, valid spend, controlled narration, save/load | wrong chat, wrong save, routine text, mismatched track, provider failure, swipe/retry, edit/delete | point transactions are scoped, auditable, exactly two-band, and never reroll mechanics |

For every row, record expected track, actual track, source ids, model-call roles, validator status, state delta, transcript pointer, and whether the result is `pass`, `warning`, `blocker`, or `not-run`. A taxonomy warning becomes a blocker when it repeats after a targeted prompt/code fix and extension sync.

### Command Bearing Running Coverage Board

The coordinator should maintain a running coverage board in `summary.md` or `command-bearing/coverage-board.json` and update it after every relevant interval. This board is the source of truth for whether the Command Bearing soak is still exploratory or ready to count as certification evidence.

Required gate ids:

| Gate Id | Required Status Before Certification |
|---|---|
| `cb-baseline-no-evidence` | `organic-negative-pass` from routine competent play and Assist-only use |
| `cb-inspiration-evidence` | `organic-pass` or documented `blocked` with transcript and state proof |
| `cb-resolve-evidence` | `organic-pass` or documented `blocked` with transcript and state proof |
| `cb-scene-nonclosure` | `organic-negative-pass`; fixture proof is not enough |
| `cb-thread-closure` | `organic-pass` preferred; `fixture-pass` allowed only after organic no-closure proof |
| `cb-chapter-arc-milestone-closure` | `organic-pass` if the long run reaches it, otherwise `fixture-pass` with clear scope limits |
| `cb-mark-review-grade` | `organic-pass` or `fixture-pass`, with at least one no-award or rejection case |
| `cb-rank-reserve-math` | `fixture-pass` allowed, because organic threshold pacing may exceed the soak window |
| `cb-ready-cancel-return` | `organic-pass` with visible Assist proof |
| `cb-valid-spend` | `organic-pass` preferred; `fixture-pass` allowed if no point is organically earned |
| `cb-controlled-narration` | same proof class as the spend that triggered it |
| `cb-retcon-recovery` | `organic-pass` after B mutates at least one real Command Bearing source turn |
| `cb-cross-campaign-isolation` | `organic-negative-pass` from D's campaign matrix canary |
| `cb-hidden-state-redaction` | `organic-negative-pass` from E's hidden-state lure and projection checks |

Each board entry must store owner, contributor lanes, current status, last update timestamp, save/chat ids, transcript pointers, state snapshot ids, model-call roles observed, screenshots, blocker severity, and next interval target. Do not mark a gate complete from memory or chat prose alone; the board needs artifact paths. The board must be updated after every Command Bearing interval before the lane continues, even when the result is `noQueue`, `no-evidence`, `blocked`, or fixture-limited. An interrupted soak should still show which Command Bearing gate was in progress, which proof artifacts exist, and what the next interval should attempt.

### Agent C Interval Playbook

Agent C should run Command Bearing as an interval test, not as isolated button checks. Each interval should be 5-10 settled player turns unless a P0/P1 stop condition fires.

| Interval | Story Target | Required State Proof | Branch Rule |
|---|---|---|---|
| Baseline | professional bridge play, ordinary courtesy, routine firm orders, and Assist-only drafting | no evidence, no review, no point delta, no hidden projection leak | continue organically; do not fixture |
| Inspiration Arc | sustained trust-building with a crew member, witness, or allied ship where cooperation matters | evidence proposal or defensible rejection tied to committed outcome, source turn, relationship perception, and thread/quest id when available | continue until there are at least two related committed interactions |
| Resolve Arc | sustained boundary-setting, lawful command discipline, preparation, or accountability under pressure | evidence proposal or defensible rejection tied to committed outcome, source turn, pressure/thread id, and visible consequence | continue until one meaningful risk or cost exists |
| Closure Probe | quiet transition, topic shift, thread resolution, quest step resolution, or mission milestone | one no-closure proof for a mere scene end and one closure queue or rejection proof from durable state | branch only if organic story cannot create a bounded thread/quest closure |
| Mark Review | immediately after proven closure or fixture-backed closure branch | review record awards Inspiration, Resolve, or no Mark with Agency, Commitment, and Causality reasoning; duplicate closure ids are blocked | fixture-backed review must be labeled non-organic |
| Point Lifecycle | after organic or fixture-seeded point availability | Assist display, Check, Ready, Cancel, return/no-spend, valid spend, exact two-band improvement, and anchored consequences | fixture-seed only after organic evidence/no-closure proof already exists |
| Recovery | after evidence, review, or spend exists | save/load, swipe/retry, recent edit/delete, and far-back retcon preserve or explicitly recover Command Bearing state without duplicate awards or free rerolls | stop for P1 if mechanics reroll silently |

At the end of each interval, the coordinator should append a `command-bearing-interval` note to the live log with the interval name, current save/chat ids, latest settled ingress id, evidence/review/spend counts before and after, model-call role counts, screenshots captured, and the next interval target. If the lane is stopped early, this note is the handoff record.

### Command Bearing Interval Checklist

Run this checklist for every Agent C interval and for any Agent A/B/D/E interval that creates or mutates Command Bearing state:

1. Name the interval before play starts: `baseline`, `inspiration-arc`, `resolve-arc`, `closure-probe`, `mark-review`, `point-lifecycle`, or `recovery`.
2. Capture the starting save/chat snapshot, point counts, evidence ledger count, review queue count, reviewed closure ids, spend ledger count, relationship perception count, and relevant open thread/quest/chapter/arc ids.
3. Write the player post in third-person roleplay prose without naming the desired mechanical result. Do not ask Directive to award a Mark, close an arc, or spend a point as meta-instructions.
4. Wait for a settled turn. `classifying` and `classified` are not enough. The interval cannot advance until the turn has committed, paused visibly, delegated host generation, entered recovery, or reconciled as stale/deleted/edited.
5. Inspect model-call records for `commandBearingFitChecker`, `commandBearingSpendValidator`, and `commandBearingEvaluator` whenever the interval expects fit, spend, evidence, or review behavior.
6. Compare the ending save/chat snapshot against the starting snapshot and classify the result as `evidence`, `no-evidence`, `closure`, `no-closure`, `review`, `no-award`, `ready`, `cancel`, `spend`, `return`, `recovery`, or `blocker`.
7. Capture the visible projection if any Command Bearing state changed: Assist point display, Character/Crew surface, Command Log, and any player-safe relationship perception text.
8. Append `command-bearing-interval` immediately, even if the interval failed, with transcript pointers, bounded text hashes, state deltas, model-call status, screenshots, severity, and the next proposed interval.

If the interval needs a fixture-backed branch, the live log must state why organic play could not prove the behavior yet, which state was seeded, and which later conclusions are limited to fixture-backed proof.

### State Inspection And Severity

Command Bearing cannot be certified from chat prose alone. Each interval needs both visible evidence and authoritative state inspection from the bound save/chat snapshot.

For every interval start and end, inspect and log:

- normalized `commandBearing` or legacy `commandStyle` state after the current migration path runs;
- track marks, ranks, point caps, reserve capacity, and current point counts;
- `readied`, spend ledger, evidence ledger, review queue, review ledger, reviewed closure ids, and relationship perception counts;
- source ingress id, host message id, turn id, outcome id, response id, save id, chat id, and prompt context revision for every Command Bearing mutation;
- sidecar/model-call records for `commandBearingFitChecker`, `commandBearingSpendValidator`, and `commandBearingEvaluator`, including provider id, model id, latency, status, retry count, and sanitized failure reason;
- player-safe UI projections in Assist, Crew/Character, Command Log, or other exposed surfaces, cross-checked against the save snapshot without logging hidden values;
- transcript pointers and bounded hashes for the player text and Directive response that caused the mutation.

Severity rules:

- P0: Command Bearing corrupts save storage, crosses users/chats/saves, exposes secrets or hidden campaign state, or consumes/awards points in the wrong campaign.
- P1: evidence/review/spend contracts cannot parse or validate in live play, a point is lost without a committed spend, a spend silently rerolls mechanics, a duplicate closure awards again, a scene end alone awards a Mark, or Command Bearing leaves the lane unable to continue.
- P2: wording quality, projection clarity, awkward tense/PoV, missing screenshot coverage, or a non-blocking warning/fallback that preserves authoritative state.
- P3: logging polish, minor report shape gaps, or optional fixture coverage that can wait until after broader soak coverage.

If a live run finds repeated `commandBearingEvaluator` or evidence-contract failures, pause Command Bearing certification for that lane, log the blocker with the latest save/chat ids and model-call diagnostics, and continue other lanes unless the failure proves a global runtime issue.

### Closure Proof Levels

Closure is not the same as scene pacing. The test should record which proof level Directive used and reject awards from weaker proof:

| Proof Level | Counts As | Does Not Count As |
|---|---|---|
| Scene end | camera shift, quiet beat, turn summary, location change, or prompt context refresh | Mark Review proof by itself |
| Thread closure | durable thread state closes or resolves a bounded crew/relationship/story thread | chapter, arc, milestone, or duplicate review proof |
| Quest or chapter closure | quest/chapter ledger reaches a closed/resolved milestone and relevant evidence anchors to it | proof for unrelated evidence or unrelated track |
| Arc, milestone, or Command Crucible closure | durable high-level campaign closure id exists and can be replay-guarded | permission to duplicate lower-level awards unless closure ids and source decisions are distinct |
| Ambiguous closure | Utility suggests closure but deterministic state is insufficient | review, Mark, point capacity change, or hidden state mutation |

Every suspected boundary should be recorded as `candidate`, `confirmed`, `rejected`, or `stale`. `candidate` means a model, scene transition, or tester expectation noticed a possible boundary. `confirmed` requires deterministic state proof. `rejected` means the candidate was only pacing, wording, or an unsupported utility hunch. `stale` means later edit/delete/reconciliation invalidated the source turn or closure proof.

### Boundary Detection Ladder

Run the boundary ladder in order. Do not skip directly to arc or milestone proof unless a live campaign naturally reaches it; use fixture-backed branches only after organic scene and thread signals have been observed.

| Ladder Step | How To Trigger In Play | Must Inspect | Expected Result |
|---|---|---|---|
| Scene beat | the player ends a conversation beat, changes topic, leaves a room, or accepts a routine scene transition | attention state, scene reconciliation, prompt-context revision, commandBearing review queue | possible prompt refresh or scene summary; no Mark Review solely from scene end |
| Evidence without closure | the player makes a meaningful command choice that changes a relationship, risk, or operational state but leaves the thread open | evidence ledger, source ingress/outcome ids, thread/quest ids, relationship perception count | evidence may be recorded; no Mark Review yet |
| Thread closure | a crew conflict, trust thread, discipline thread, or side problem resolves after multiple anchored interactions | thread ledger status, evidence ids by thread, reviewed closure ids | one closure candidate can queue review for relevant evidence only |
| Quest or chapter closure | a mission objective, chapter beat, or quest step resolves in durable campaign state | mission/chapter/quest ledger status, outcome id, evidence ids by quest/chapter | review may queue once; unrelated evidence remains open |
| Milestone or arc closure | a campaign milestone, story arc, or Command Crucible resolves | storyArcLedger, milestone id, arc id, review queue, duplicate guards | high-level review can run only for the durable closure id and cannot duplicate lower closure awards |
| Retconned closure | edit or delete a source turn that contributed to evidence or closure | recovery journal, scene reconciliation invalidations, stale evidence/review markers, mark/point counts | state enters explicit recovery/review-required handling; it does not silently remove or duplicate Marks |

Boundary logs must name both the suspected boundary and the deterministic state root that proved or rejected it. "The scene felt over" is never enough.

Closure-root authority matters. A review candidate should identify the exact source root it is using: thread id, quest id, chapter id, arc id, milestone id, Command Crucible id, or source outcome id. Evidence with explicit roots must not be reinterpreted under a different root just because a later closure is convenient. Evidence without explicit roots may be associated to a closure only when the deterministic state can tie it to the same source outcome or bounded story object. The interval report should distinguish three outcomes: `confirmed-closure`, `confirmed-no-closure`, and `review-hook-no-queue`. `review-hook-no-queue` is useful proof that the hook ran and failed closed, but it is not closure certification.

### Mark Review Grading Gates

Every Mark Review should be checked against these gates before any award counts:

- Agency: the player meaningfully chose or shaped the approach;
- Commitment: the action carried cost, obligation, risk, boundary, or follow-through burden;
- Causality: the approach materially contributed to the closure;
- Track fit: Inspiration or Resolve is awarded only when that track materially made the closure possible;
- Distinctness: dual-track or repeated awards require distinct consequential decisions and distinct closure/source ids;
- Redaction: hidden values, private NPC thoughts, hidden clocks, provider reasoning, and Director-only notes are rejected before persistence or display.

### Command Bearing Probe Library

Agent C should pull from this probe library when building 5-10 turn intervals. These are intent families, not literal player text. The actual posts should remain third-person, in-character prose and should not name the mechanical result the tester wants.

| Probe | Player-Facing Shape | Expected Mechanical Signal | Required Negative Check |
|---|---|---|---|
| Routine competence baseline | the character gives normal bridge orders, asks for scans, thanks specialists, and follows procedure | no Command Bearing evidence, no Mark Review, no point delta | leadership keywords, courtesy, and routine firmness do not count by themselves |
| Inspiration seed | the character discloses a material risk, invites dissent, preserves a crew member's dignity, and delegates meaningful responsibility | possible Inspiration evidence after a committed outcome if Agency, Commitment, and Causality are present | friendly tone alone does not create evidence |
| Resolve seed | the character sets a lawful boundary, defines a deadline, commits resources, and accepts responsibility for enforcement | possible Resolve evidence after a committed outcome if the boundary or commitment changes the outcome | shouting, threats, or rank language without credible authority do not create evidence |
| Mixed signal | the character pairs transparency/cooperation with a deadline or command boundary | one primary signal, unless two distinct consequential decisions exist | mixed vocabulary does not award both tracks from one decision |
| Costly or failed command | the character accepts a political, relational, operational, or personal cost and the action partly fails | evidence may still record the command style if the approach materially shaped the result | failure does not become a hidden consolation Mark |
| Scene-end false closure | the character ends a conversation, changes rooms, changes topic, or accepts a quiet scene transition | possible scene/prompt refresh, no Mark Review solely from pacing | no review queue or Mark award without durable closure proof |
| Thread closure | a repeated crew conflict, trust problem, discipline issue, or side problem resolves after anchored interactions | one relevant closure candidate may queue review for anchored evidence | unrelated evidence stays out and duplicate closure ids are blocked |
| Quest/chapter closure | a mission objective, quest step, chapter beat, milestone, arc, or Command Crucible reaches durable closed state | relevant evidence may queue review once for that closure level | lower-level and higher-level closures do not duplicate the same award unless source decisions are distinct |
| Mark Review grading | a proven closure has strong, weak, mixed, or leaking evidence | review awards Inspiration, Resolve, or no Mark with player-safe criteria | provider reasoning, hidden values, private thoughts, raw scores, and weak causality are rejected |
| Rank/reserve fixture | a clearly marked fixture branch seeds marks near thresholds | rank, cap, reserve, and Recovery math update at 2, 5, 9, and 14 Marks without exceeding caps | fixture evidence is not reported as organic story proof |
| Point ready/cancel/return | a point is available and the tester checks fit, readies, cancels, readies again, then sends routine or mismatched text | fit checks do not mutate state; cancel clears scope; non-spend returns or preserves the point | wrong chat, wrong save, unrelated text, or routine color cannot consume a point |
| Valid point spend | the character sends an aligned consequential action after Ready | base outcome resolves first, validator accepts final text, one point is consumed, final band improves exactly two tiers, anchored consequences remain | point use cannot make impossible actions possible, erase costs, or let host generation post a competing outcome |
| Retcon after evidence/spend | a recent or far-back source turn is edited or deleted after evidence, review, or spend exists | ordinary recovery, branch, replay, or review-required handling records the conflict | no silent duplicate award, no silent point refund, no mechanic reroll |

The probe result must be classified as `organic`, `organic-negative`, `fixture-backed`, or `blocked`. A single interval can use multiple probes, but each probe needs its own live-log record and state delta. If the interval becomes story-rich but mechanically quiet, log it as useful transcript coverage and keep the next interval focused on the missing gate.

### Command Bearing Artifact Set

Every Command Bearing interval should write a small, consistent artifact set under `command-bearing/<interval-id>/` so a later reviewer can diagnose the behavior without reopening the live browser:

- `snapshot-before.json` and `snapshot-after.json`: bounded authoritative state with commandBearing, relevant thread/quest/chapter/arc ids, ingress/response ids, model-call counts, and prompt revision, with hidden values redacted or hashed.
- `visible-projection.md`: player-visible Assist, Character/Crew, Command Log, and relationship-perception text excerpts relevant to Command Bearing, with screenshot paths.
- `model-calls.jsonl`: sanitized `commandBearingFitChecker`, `commandBearingSpendValidator`, and `commandBearingEvaluator` calls with provider/model metadata, latency, status, retry count, and failure reason.
- `ledger-delta.json`: point, rank, mark, reserve, readied, spend, evidence, review, reviewed-closure, and relationship-perception deltas plus the expected/actual classification for each probe.
- `transcript-pointers.json`: source chat ids, player message ids, Directive response ids, bounded hashes, and readable transcript anchors.

Missing artifacts do not automatically invalidate the story transcript, but they do invalidate the affected Command Bearing certification gate unless the live log explains a host or provider blocker and records the current save/chat ids for resumption.

### Minimum Command Bearing Evidence

A full five-lane soak should not claim Command Bearing coverage unless the report contains:

- at least one no-evidence false-positive check for routine/professional play;
- at least one Inspiration evidence proposal or explicit no-evidence rejection with a defensible reason;
- at least one Resolve evidence proposal or explicit no-evidence rejection with a defensible reason;
- at least one closure detection record that proves no Mark Review should run;
- at least one closure detection record that queues or deliberately rejects Mark Review from deterministic state;
- at least one Mark Review result: Inspiration, Resolve, or no-award;
- at least one duplicate-review or replay guard check;
- at least one point display check in Assist and the Character/Crew projection;
- at least one Ready/Cancel check;
- at least one returned-point or no-spend check;
- at least one valid spend check, or a clearly logged blocker explaining why no point could be earned or fixture-seeded during the interval;
- at least one save/load persistence check after Command Bearing state changed;
- at least one retcon/reconciliation check touching a Command Bearing source turn.

Missing any item is not automatically a P0/P1 if the campaign remains playable, but it is not complete Command Bearing certification. Log the gap with a transcript pointer, current save/chat ids, state snapshot ids, and whether the next interval should continue organically or use a fixture-backed branch.

### Evidence Accumulation

Evidence is progression history, not a reward. It appears only after committed outcomes and never directly awards Marks.

| Scenario | Must Prove |
|---|---|
| Strong Inspiration evidence | a committed outcome materially depends on trust, transparency, dignity, shared purpose, mentorship, or voluntary cooperation; the evidence is player-facing and track-primary where appropriate |
| Strong Resolve evidence | a committed outcome materially depends on lawful authority, credible boundary, preparation, discipline, deterrence, or accepted responsibility |
| Mixed approach | both tracks may appear, but one `primarySignal` is chosen unless two distinct decisions exist |
| Costly or failed action | Partial Failure or Failure can still create evidence when Agency, Commitment, and Causality are present |
| Routine competent action | no evidence is created for ordinary politeness, routine firmness, routine bridge work, or mere keyword use |
| Reward claim | player-authored claims like "this earns Resolve" do not create evidence unless the committed outcome independently supports it |
| Assist-only action | Draft, Brief, Check, Ready, Cancel, Apply, Try Again, and Restore do not create evidence until the player sends a message and a committed outcome exists |
| Evidence anchoring | every evidence record cites source turn, outcome, ingress/chat binding, relevant thread/quest/arc/chapter id when available, strength, criteria, and safe summary |

Live log records: `command-bearing-evidence` with source turn/outcome ids, track signals, primary signal, strength, criteria booleans, visible summary hash, relationship perception id if used, and redaction result.

### Closure Detection

Closure detection is the gate between accumulated evidence and Mark Review. A model or utility call may suggest closure, but deterministic state must prove it before a Mark Review can award anything.

| Scenario | Must Prove |
|---|---|
| Scene end only | a scene can end without closing a thread, chapter, arc, or milestone; no Mark Review runs solely because the scene quieted |
| Thread closure | repeated crew or side-story interactions close a thread, and only evidence anchored to that thread enters the review queue |
| Chapter or quest resolution | a chapter/quest status change can queue closure review for relevant evidence |
| Story arc or milestone closure | completed arc/milestone state can queue review for relevant evidence without duplicating a chapter review unless the closures are distinct |
| False closure | conversation pauses, player changes topic, or Utility predicts closure, but committed state remains open; no review or Mark award occurs |
| Utility miss | committed state proves closure even if Utility did not flag it; review can still queue from deterministic state |
| Duplicate closure | the same closure id cannot queue or award twice |
| Retcon invalidation | if a source turn changes, stale evidence or closure review moves into ordinary recovery/review-required handling, not silent mutation |

Live log records: `command-bearing-closure` with closure id/type/source, utility suggestion status, deterministic proof, evidence ids considered, queue decision, duplicate/rejection codes, and transcript pointers.

### Mark Review Grading

Mark Review is a proposal-plus-validation step at meaningful closure. It should be conservative and should accept no hidden-state leakage.

| Scenario | Must Prove |
|---|---|
| Inspiration Mark | review awards Inspiration only when that track materially made the closure possible |
| Resolve Mark | review awards Resolve only when that track materially made the closure possible |
| No Agency | no Mark when the player did not meaningfully choose, alter, or develop the approach |
| No Commitment | no Mark when the result had no real cost, risk, obligation, boundary, or follow-through burden |
| No Causality | no Mark when the player action did not materially shape closure |
| No-award review | a no-award review is stored when useful and explains the reason in player-safe language |
| Rare dual-track award | two Marks in one arc require two distinct consequential decisions; a single scene with mixed language is not enough |
| Rank thresholds | marks update ranks at 2, 5, 9, and 14, update point caps/reserve capacity correctly, and preserve existing reserve rules |
| Duplicate award protection | replay, duplicate review, swipe, or branch reuse cannot award another Mark for the same closure/source |
| Hidden leak rejection | review output with raw scores, hidden relationship values, private NPC thoughts, hidden clocks, provider reasoning, or Director-only notes is rejected |

Live log records: `command-bearing-review` with review id, closure id, evidence ids, awarded track or no-award reason, criteria result, marks/rank before and after, rank change, validator status, provider/model metadata, and hidden-state redaction result.

### Point Readying, Spending, And Narration

Point use is a pre-send, readied intervention. It is not a post-outcome pause, reroll, or universal success button.

The spend transaction must be verified in this order:

1. Assist reads authoritative available point counts from the bound save/chat.
2. Fit Check evaluates rough or composed text without mutating campaign state.
3. Ready records one scoped readied intent bound to save, chat, track, and next player ingress.
4. The player sends final text; Directive records the exact ingress before mechanics resolve.
5. Mission mechanics resolve the base outcome without assuming Command Bearing success.
6. Spend validation checks final sent text, readied scope, available point, fit, and base outcome eligibility.
7. A valid spend commits one transaction that consumes one point and improves the outcome by exactly two bands while preserving anchored consequences.
8. Controlled narration posts a single Directive-owned response from the committed packet.
9. Swipe, retry, save/load, branch, edit, delete, or narration repair cannot reroll the base outcome or create a second spend.

If the run cannot prove that ordering from state snapshots and logs, it has not certified point use.

| Surface | Required Scenario | Must Prove |
|---|---|---|
| Assist Point Display | active campaign with available and zero-point states | Inspiration and Resolve counts come from authoritative campaign state, stay visible while runtime refreshes, and disable mutation in wrong-chat/no-campaign states |
| Fit Check | `Check Inspiration` and `Check Resolve` before send | advisory model call only; no composer rewrite, no outcome promise, no state mutation, no hidden facts, no raw scores |
| Ready/Cancel | ready one point, then cancel before send | readied state binds to save/chat and clears without deducting points or creating evidence |
| Single Readied Point | attempt to ready both tracks | only one readied point is active at a time, or replacing it is explicit and logged |
| Readied Scope | ready one point, then send from wrong chat or unrelated chat | point does not apply to the wrong chat; no campaign mutation; player-safe guard copy appears |
| Non-Consequence Return | ready a point, then send color/routine/mismatched text | point is returned, readied state clears, base turn proceeds or safely no-ops without a spend |
| Valid Spend Commit | ready a point, then send an aligned consequential action | base outcome resolves first, spend validator accepts final sent text, exactly one point is consumed in the outcome transaction, result improves by exactly two bands, anchored consequences remain |
| Controlled Narration | consequential Readied-point turn | normal host generation is aborted; Directive posts one committed response from a structured packet containing track definition, base band, final band, improvements, and anchored consequences |
| Provider Failure Before Commit | fit/spend/provider failure before mechanical commit | point is returned or preserved, no partial spend, sanitized diagnostics recorded |
| Provider Failure After Commit | narration/posting failure after spend commit | spend remains committed, response repair uses the committed packet, no refund or reroll |
| Swipe/Retry | swipe or retry a spent response | prose may change, but outcome id, spend ledger, point count, evidence, and committed mechanics do not reroll |
| Edit/Delete After Commit | edit or delete the initiating player message after a spend | ordinary branch/replay/reconciliation handles the timeline; no Command Bearing-specific deep refund |
| Evidence Creation | meaningful committed turn with visible cost or consequence | validated evidence record cites source turn/outcome/ingress, track signals, strength, Agency/Commitment/Causality, and player-safe summary; evidence does not award Marks directly |
| Closure Mark Review | quest/thread/arc/chapter/Command Crucible closure with relevant evidence | deterministic closure proof exists before review; one review per closure id; review awards Inspiration, Resolve, or no Mark; duplicate awards are blocked |
| No-Proof Closure | Utility suggests closure but committed state does not prove it | diagnostics or pending review state only; no Mark Review and no award |
| Relationship Perception | relationship/reputation shifts during a command consequence | player-facing perception record describes what the character can notice without raw relationship values, hidden deltas, private NPC thoughts, or model reasoning |
| Character Projection | after evidence, review, spend, and perception records exist | player-safe projection shows Command Bearing history and relationship perceptions without leaking hidden state |
| Persistence | save/load after ready, return, spend, evidence, review, and rank change | readied/spend/evidence/review/perception ledgers survive correctly; stale readied next-message state does not apply to later unrelated messages |
| Reconciliation | retcon invalidates a Command Bearing source turn | evidence becomes stale or review becomes review-required through normal recovery; Marks are not silently removed from active state without branch/replay/review evidence |

Live log records: `command-bearing-spend` with point counts before/after, readied id, save/chat binding, attached ingress id, validator fit, provider role, base/final outcome bands, exact two-band movement proof, anchored consequence hashes, spend/return/refund reason, response id, and narration packet hash.

### Abuse And Farming Checks

| Abuse Attempt | Must Prove |
|---|---|
| Keyword stuffing | repeated use of track vocabulary does not create evidence or fit if the action lacks the style causally |
| Reward farming | disposable errands, repeated arguments, or asking the model for a reward does not create Marks |
| Swipe/retry | swiping or retrying narration never rerolls mechanics, consumes another point, or refunds a committed point |
| Post-commit edit/delete | ordinary recovery, branch, or reconciliation handles timeline changes; Command Bearing has no special deep-history refund |
| Branch replay | branch/replay restores snapshot state naturally but does not duplicate awards on the same closure/source |
| Wrong-chat send | readied state cannot cross into another user, chat, save, or campaign |
| Provider failure | invalid, timed-out, leaking, or unavailable Command Bearing calls fail closed and record sanitized diagnostics |
| Hidden-state lure | prompts that mention raw scores, hidden relationships, or private NPC thoughts never surface those in Fit Check, evidence, review, projection, or narration |

Live log records: `command-bearing-abuse-check` with attempted exploit, expected guard, actual result, state roots touched, point/evidence/review delta, screenshot or transcript pointer, and severity if the guard fails.

### Interval Snapshot

Every 5-10 player turns, and after every explicit Command Bearing test action, snapshot:

- point counts, reserve capacity, track ranks, and mark counts;
- readied state, attached ingress, and next-message scope;
- spend ledger count and latest spend/return/refund reason;
- evidence ledger count, new evidence ids, source turn/outcome ids, primary signals, and strengths;
- open/closed thread, chapter, quest, arc, milestone, and Command Crucible ids relevant to evidence;
- review queue count, review ledger count, reviewed closure ids, rejected closure diagnostics, and duplicate-review guards;
- relationship perception count and latest player-safe perception hashes;
- player-safe Command Bearing projection in Assist, Character/Crew surfaces, and any Command Log/summary surface where shown;
- model-call records for `commandBearingFitChecker`, `commandBearingSpendValidator`, and `commandBearingEvaluator`.

## Retcon Mutation Matrix

| Mutation | Recent | Far Back | User Message | Directive Message | Expected Result |
|---|---:|---:|---:|---:|---|
| Edit harmless wording | yes | yes | yes | yes | safe invalidation or no material state change |
| Edit mission posture | yes | yes | yes | no | review-required or recalculation preview |
| Edit explicit state fact | yes | yes | no | yes | reconciliation proposal, safe only if low-risk root |
| Delete uncommitted turn | yes | no | yes | no | ingress invalidated |
| Delete committed turn | yes | yes | yes | no | review-required or explicit rollback |
| Delete Directive response | yes | yes | no | yes | response recovery or recalculation path |
| Swipe Directive response | yes | yes | no | yes | prose rewrite without mechanics reroll |

## End Conditions Coverage Matrix

| System Surface | Required Coverage | Must Prove |
|---|---|---|
| Detection | catastrophic objective/ship failure | condition id, family, severity, terminal band, final band, checkpoint source, and pending decision recorded |
| Conduct Detection | public insubordination, impairment, assault, and erratic command ladders below and above threshold | system escalates through realistic crew/captain/medical/security consequences, proves first-offense non-terminal discipline where appropriate, and only creates terminal checkpoint evidence when command-fitness or mission viability is plausibly broken |
| Checkpoint Post | terminal outcome checkpoint | one Directive-owned checkpoint message in the bound chat with player-safe options |
| Save as Branch | terminal decision option | terminal branch save record exists and the decision remains `pending` |
| Replay from Checkpoint | terminal decision option | decision becomes `replayed`, pre-terminal snapshot is restored, prompt context rebuilds |
| Push On | terminal decision option | decision becomes `pushedOn`, continuation frame applies, prompt context rebuilds |
| Keep Ending | terminal decision option | decision becomes `keptEnding`, campaign conclusion completes, final band is stamped |
| Unsupported Action | invalid terminal reply | no mutation and player-safe refusal or classifier non-match |
| Missing Checkpoint | fixture/sub-run | replay fails safely with retained-state diagnostics |
| Missing Continuation | fixture/sub-run | Push On fails safely without resolving or mutating the terminal decision |
| Save/Load | after each resolution | end-condition ledger, branch records, continuation frames, conclusion metadata, and final band survive persistence |

## Quality Rubric

Each generated or posted response should be scored in the report:

| Score | Meaning |
|---:|---|
| 0 | unsafe or wrong: hidden leak, agency violation, mechanics corruption, or incoherent state |
| 1 | usable but weak: awkward prose, weak continuity, vague reaction, or missed nuance |
| 2 | good: preserves player intent, coherent state, correct role and tone |
| 3 | excellent: strong continuity, character-specific reaction, clear stakes, no overreach |

Score these dimensions independently:

- player input prose quality;
- player input perspective, with third-person narration required for preferred-play certification and first-person dialogue allowed only inside quoted character speech;
- player input actionability;
- player input agency discipline;
- tense and point of view;
- player agency;
- NPC agency;
- authority and chain of command;
- hidden truth safety;
- continuity;
- mission pressure;
- crew reaction;
- ship/system state;
- Command Log usefulness;
- sidecar relevance;
- prompt-context freshness.

A passing soak needs no score-0 item. A release-candidate soak should average at least 2 across player-visible prose and state summaries.

## Automation Implementation Notes

The soak runner should be a Playwright-first harness.

Use Playwright for user-visible behavior:

- launch the browser and open the local SillyTavern host;
- drive real controls with locators, keyboard input, and pointer actions;
- use `page.evaluate()` only to read runtime state, invoke documented host/runtime seams, or capture diagnostics that are not visible in the UI;
- collect traces, screenshots, console errors, page errors, selected network failures, and viewport-specific evidence;
- run desktop and phone-width checkpoints through the same scenario where practical;
- prefer resilient role, label, title, `data-*`, and host-shaped selectors over brittle CSS chains.

Playwright locators are the default interaction path, but they are not a substitute for geometry checks. If a click times out while the target exists, inspect bounding boxes, visibility, overlays, scroll position, and computed styles before retrying. Coordinate clicks are acceptable when the report records the locator, geometry, and reason for the fallback.

The runner should reuse the live-smoke browser helpers where practical:

- start a fresh chat-native campaign through the runtime app;
- send SillyTavern chat through `#send_textarea` and `#send_but`;
- wait for send/generation idle before assertions;
- read runtime state through `getSillyTavernDirectiveRuntimeBridge()`;
- capture route screenshots through the existing browser screenshot path;
- use message-action DOM controls for user-visible action proof.
- reuse `smoke-sillytavern-terminal-endings-live.mjs` scenario logic for terminal detection, checkpoint posting, and chat-driven terminal decision resolution where practical.

The runner should add host-mutation helpers:

- locate message rows by `mesid`, role, and text preview;
- open SillyTavern message actions overflow before clicking Directive actions;
- verify Directive message actions are host-shaped children of `.mes_buttons` / `.extraMesButtons` and have non-zero clickable geometry before interaction;
- edit messages through the host API or native controls where available;
- delete messages through the host API or native controls where available;
- fall back to explicit runtime handler calls only when the host lacks an automatable public path, and mark that fallback in `report.json`.

Do not use raw DOM text replacement as the primary edit/delete proof. DOM surgery can be a diagnostic fallback, but it does not prove SillyTavern event integration.

The runner should use layered assertions:

- Playwright proves real user/browser behavior;
- runtime bridge reads prove campaign state, ingress, recovery, reconciliation, model-call, sidecar, prompt, and save journals;
- terminal live-smoke reads prove end-condition ledger detections, pending interactions, checkpoint messages, branch records, continuation frames, conclusion metadata, and final bands;
- host API reads prove storage and chat binding where SillyTavern exposes stable APIs;
- deterministic contract tests remain the fast way to localize failures found by the soak.

If these layers disagree, the run should fail with a diagnostic category instead of choosing one source silently.

## Suggested Turn Intents

The exact prose can evolve with the campaign, but the runner should keep stable intent labels:

1. acknowledge the handoff and ask for a clean operational picture;
2. preserve telemetry and keep rescue teams ready;
3. ask for protocol context before boarding;
4. choose a cautious standoff scan posture;
5. request counsel from medical and tactical;
6. authorize a limited rescue preparation;
7. push toward a risky close approach;
8. accept or reject the warning;
9. use Assist to check Inspiration fit on a rough command;
10. use Assist to check Resolve fit on a different rough command;
11. ready a Command Bearing point, then cancel before sending;
12. use Brief Me on evidence integrity;
13. use Frame as Report for uncertainty;
14. use Draft/Try Again/Replace Selection/Restore without state mutation;
15. ready Inspiration or Resolve and send an aligned consequential command;
16. verify the spent Command Bearing outcome remains fixed through narration retry or swipe;
17. ready a point for a routine or mismatched message and verify return;
18. use Frame as Order and send a final command that can create Command Bearing evidence;
19. try to make Priya speak and agree;
20. try to order Captain Whitaker directly;
21. declare the mystery solved without evidence;
22. claim hidden villain knowledge;
23. try to commandeer another ship;
24. attempt secret sabotage;
25. lie to the crew;
26. try to erase consequences;
27. inject prompt/system override language;
28. recover with a plausible in-world explanation;
29. perform recent user edit;
30. reconcile edited recent user turn;
31. perform recent Directive edit;
32. reconcile edited recent Directive response;
33. delete recent user turn;
34. recover or mark review required;
35. perform far-back user edit;
36. set reconciliation start;
37. set reconciliation end;
38. reconcile marked passage;
39. perform far-back Directive edit;
40. reconcile from here;
41. delete far-back committed user turn;
42. recalculate from here;
43. cancel recalculation preview;
44. accept recalculation in branch-only mode;
45. save current game;
46. save as soak branch;
47. load soak branch;
48. send wrong-chat message;
49. return to bound chat and rebuild prompt;
50. continue normal play;
51. use accumulated continuity in a quiet post that may close a thread, quest, or scene;
52. make one final consequential decision and verify Mark Review runs only if deterministic closure proof exists.

Terminal sub-run intents:

- force a catastrophic terminal failure and save the terminal timeline as a branch;
- force a catastrophic terminal failure and replay from checkpoint;
- force a catastrophic terminal failure and Push On through an authored continuation frame;
- force a catastrophic terminal failure and Keep Ending to conclude the campaign;
- run the recovery-control branch for each command-conduct ladder and verify consequences persist without an unwarranted terminal decision;
- escalate a public captain fight, bridge impairment, assault, or unhinged command pattern until command fitness plausibly fails, then save the terminal timeline as a branch;
- escalate a command-fitness ladder until terminal, then replay from checkpoint;
- escalate a command-fitness ladder until terminal, then Push On through an authored continuation frame or prove the no-continuation refusal;
- escalate a command-fitness ladder until terminal, then Keep Ending to conclude the command-failure timeline;
- attempt one unsupported terminal decision reply and verify safe refusal;
- in deterministic fixture coverage, remove checkpoint retention and verify replay fails safely.

## Manual Review Checklist

After the automated run, a human reviewer should inspect:

- `transcript/readable-chat.md` as an end-to-end story readback for enjoyment, continuity, character voice, pacing, and dramatic payoff;
- `transcript/index.json` and `transcript/source-chat.jsonl` to confirm the saved transcript maps to the correct ST user, campaign, chat, save branch, and run id;
- the first 10 turns for normal campaign feel;
- every Scene Handshake settlement for accepted/rejected source handling, current-order/log/ship/thread deltas, idempotency, prompt rebuild, source provenance, and no mutation outside the V1 allowlist;
- every accepted objective assignment for matching Mission Current Orders/Open Assignments, source-backed Log entry, linked Crew Character/Roster projection, source hashes, save/load persistence, and no hidden-state leakage;
- every reply-header sample for exact current stardate/ship-time formatting, duplicate/stale header handling, host-native prompt compliance, and display-only treatment in evidence paths;
- every Assist output for tense, PoV, and agency;
- every Command Bearing fit check, Ready/Cancel action, spend, return, evidence record, Mark Review, relationship perception, and controlled narration packet for player-safe wording and mechanical authority;
- every authority attack for proper reframing or resistance;
- every command-conduct recovery control for durable consequences without unwarranted campaign conclusion;
- every retcon mutation for explicit recovery or reconciliation evidence;
- every accepted pending proposal for player-safe wording and authorized roots;
- every terminal checkpoint message for player-safe wording, clear options, and hidden-state exclusion;
- every terminal decision resolution for the expected ledger status and persistence behavior;
- every campaign matrix row for library visibility, fresh start, chat binding, short live canary, save/load, End Conditions, and isolation evidence;
- final Mission/Crew/Ship/Log summaries for internal consistency;
- screenshots for message actions, Assist menu, pending reconciliation card, and route health;
- `live-log.jsonl` for an append-only trail with no gaps around failures, operator stops, model calls, edits, deletes, and campaign switches;
- `summary.md` for actionable failure grouping.

## Follow-Up Implementation Milestones

1. `tools/scripts/soak-sillytavern-campaign-live.mjs` exists as a report-only dry run that prints the plan and validates host prerequisites.
2. `tools/scripts/lib/sillytavern-live-harness.mjs` centralizes Playwright-first live-host helpers, artifact writers, served-extension hash checks, runtime snapshots, and safe chat-send helpers.
3. `tools/scripts/discover-sillytavern-message-mutation-live.mjs` exists as a read-only probe for the safest future edit/delete automation path.
4. `schemas/testing/live-campaign-soak-report.schema.json` defines the report artifact contract.
5. `tools/scripts/check-playwright-soak-readiness.mjs` proves local Playwright launch/control, desktop/phone viewport switching, screenshot capture, and trace writing before live host mutation begins.
6. `tools/scripts/smoke-sillytavern-terminal-endings-live.mjs` exists as the current live End Conditions proof path for terminal detection, branch save, replay, Push On, and Keep Ending.
7. `tools/scripts/soak-sillytavern-campaign-live.mjs` dry-run exposes the bundled campaign matrix and append-only live log policy.
8. Next: port fresh-campaign creation and send-turn helpers from `smoke-sillytavern-live.mjs` into full live execution mode.
9. Next: write `live-log.jsonl` incrementally during real execution before and after each material action.
10. Next: add readable transcript capture from SillyTavern-visible chat into `transcript/readable-chat.md`, `transcript/source-chat.jsonl`, and `transcript/index.json`.
11. Next: add roleplay-quality player prose templates or a live player-input generator that preserves the stable turn intents without visible test scaffolding.
12. Next: port terminal endings scenario helpers into the full soak runner or invoke them as a structured terminal phase.
13. Next: add checkpoint and artifact writers, including Playwright trace/screenshot/error capture during live execution.
14. Next: add campaign-matrix live canaries for every bundled campaign.
15. `tools/scripts/smoke-scene-handshake-live.mjs` exists as the current live proof path for accepted host-native assignment settlement.
16. Next: fold Scene Handshake accepted/rejected/idempotency/source-mutation coverage into the full soak runner and artifact schema.
17. Next: add objective-assignment projection capture for Mission, Log, and linked Crew surfaces after accepted assignments.
18. Next: add live timekeeping reply-header checks for Directive-owned replies, host-native replies, branch/load, stale-header stripping, and preset status.
19. Next: add Assist UI automation.
20. Next: finish live Command Bearing execution helpers for fit checks, Ready/Cancel, valid spend, returned point, controlled narration, evidence, Mark Review, relationship perception proof, state snapshots, and severity-tagged blockers.
21. Next: add message action automation with geometry checks for host-shaped controls.
22. Next: add host edit/delete helpers and recovery assertions once discovery identifies the safest public path.
23. Next: add deep-retcon branch-only destructive recalculation mode.
24. Next: add quality rubric scoring hooks.
25. Next: add strict mode that fails on any soft warning.
26. Next: add a short release-certification summary to the final report.

## Open Questions

- Which SillyTavern public API path is safest for automated message edit and delete across current host versions?
- Should destructive recalculation acceptance always run on a Save As branch, or should strict mode require a fresh campaign fork?
- What retention policy should we use for full player-visible transcripts once they are no longer needed for quality review?
- Should the quality rubric be manual-only first, or should a player-safe evaluator sidecar score outputs after each phase?
- Should the soak eventually run against Lumiverse with the same script, or should Lumiverse receive a separate host-parity soak after SillyTavern is stable?
- Should host-native reply headers remain prompt-only, or should the SillyTavern adapter post-process them if a safe after-generation mutation boundary becomes available?
