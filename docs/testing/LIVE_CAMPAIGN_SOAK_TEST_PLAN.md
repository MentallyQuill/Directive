# Live Campaign Soak Test Plan

## Status

This document defines the target plan for a comprehensive live SillyTavern campaign soak test.

Directive is pre-alpha. The soak may exercise the best current runtime behavior in place and does not need to preserve legacy workflows. It should run as an explicit, opt-in live verification path because it allows unlimited model calls, mutates SillyTavern chat history, creates save branches, and intentionally attacks campaign continuity.

The normal alpha gate remains the dependency-free contract suite. The soak is release-certification evidence for the full chat-native campaign loop.

## Core Purpose

The soak proves that a real campaign can continue through roughly 50 player turns while Directive uses the systems that matter in live play:

- chat-native campaign activation and prompt injection;
- Utility classification for every accepted player post;
- Mission Director escalation and response strategy selection;
- Directive Assist drafting, briefing, order framing, and report framing;
- Command Competence, authority review, no-gotcha warnings, and Command Bearing;
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

Unlike smoke tests, this plan should not cap model calls by default, avoid workers to save cost, skip Assist actions because they spend tokens, or replace provider-backed systems with deterministic fallbacks when providers are healthy. Utility, Reasoning, Directive Assist, Mission Director, narrator, reconciliation extractor, sidecar, summary, relationship, crew, ship, quest, thread, and Command Bearing model calls are all allowed for the full run.

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

Fast-turn pressure is still valuable, but it is a separate soak mode. In that mode, sidecar revision-conflict rejections are acceptable only when they preserve newer committed mechanics and are logged as warnings with source turn id, rejected worker id, proposed roots, current revision, and later-turn revision that made the sidecar stale. Fast-turn pressure must not be used as the only evidence that sidecars work.

## Required Host Conditions

Before running the soak:

- SillyTavern is reachable through `SILLYTAVERN_BASE_URL`.
- First, before any other soak action, sync the served or installed SillyTavern Directive extension to the checkout under test. Parallel extension fixes may make the installed copy stale until testing begins.
- The served Directive extension is the checkout under test, or the checkout has been copied into the installed SillyTavern extension path and acknowledged with `DIRECTIVE_CONFIRM_EXTENSION_SYNCED=1`.
- For parallel soak workers, SillyTavern multi-user mode is enabled and every worker has a dedicated ST user, Playwright browser context, run id, artifact folder, campaign chat, save branch, and provider/session budget.
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
- `end-conditions/`: terminal detection, pending interaction, checkpoint message, decision resolution, branch, continuation frame, conclusion, and final-band evidence.

The report shape is defined by [live-campaign-soak-report.schema.json](../../schemas/testing/live-campaign-soak-report.schema.json). The schema intentionally records Playwright as the primary driver, marks CDP/direct-handler coverage as non-equivalent fallback evidence, requires the unlimited model-call policy, requires the readable transcript and player-input policies, requires the multi-campaign matrix, requires the append-only live log policy, and requires named End Conditions terminal scenarios.

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
- every Directive Assist action, rough input preview/hash, generated output preview/hash, Apply/Cancel/Try Again/Restore result, tense/PoV/agency quality score, and whether the player sent the draft;
- every model call role/domain, provider id, model id, start/end time, latency, token counts when available, retry count, status, and sanitized failure reason;
- every Playwright UI action with locator, viewport, fallback reason when used, screenshot/trace/video path, toast text, console error count, and page error count;
- every edit, delete, swipe, message action, reconciliation, recalculation preview, accepted/rejected proposal, roots touched, prompt revision before/after, and live mechanic mutation result;
- every command-conduct ladder step, including first breach, recovery control, escalation, terminal threshold, whether the step remained playable, and whether consequences were preserved;
- every checkpoint summary: chat binding, save id/revision, ingress count, turn ledger count, command log count, pending interactions, recovery journal count, sidecar entries, prompt revision, and visible Mission/Crew/Ship/Log/Settings summaries;
- every transcript capture, including readable transcript path, source chat path, latest visible message id/index, latest turn, capture mode, and whether it is partial or final;
- every End Conditions trigger, detection id, decision id, checkpoint message id, allowed actions, chosen action, expected and actual decision status, branch/save id, continuation frame id, conclusion/final band metadata, and persistence result;
- every save/load branch operation, wrong-chat isolation probe, cross-campaign isolation probe, and prompt rebuild result;
- every warning, failure, skipped check, unsupported host capability, fallback path, quality score-0 item, follow-up ticket id, and resume recommendation.

`turns.jsonl` remains the compact turn/mutation ledger. `live-log.jsonl` is the broader forensic timeline that lets a reviewer reconstruct what happened even when the soak never reaches `summary.md`.

## Global Pass/Fail Rules

The soak fails if any of these occur:

- a player post from an unbound chat mutates the active campaign;
- a player edit or delete silently corrupts campaign state;
- a swipe rerolls committed mechanics;
- provider failure partially commits state;
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
- after every five ordinary turns;
- before and after every edit/delete/swipe/reconciliation mutation;
- after every save, save-as branch, and load;
- at final turn completion.

Each checkpoint should include:

- current chat id and campaign binding;
- ingress count and turn ledger count;
- command log count;
- latest response strategy;
- pending interaction count;
- scene reconciliation last result;
- recovery journal count and latest entry;
- model-call roles since previous checkpoint;
- sidecar journal entries since previous checkpoint;
- end-condition ledger detection/decision counts, active decision id, branch record count, continuation frame count, and final campaign band;
- prompt-context revision;
- save id and save revision;
- visible Mission/Crew/Ship/Log/Settings summaries.

## Multi-Campaign Coverage

The full 50+ turn soak should run against one primary campaign per certification run, but every bundled campaign must receive deterministic validation and a short live Playwright canary. This prevents Ashes-specific assumptions from hiding in campaign library, creator, chat binding, prompt injection, save/load, End Conditions, or cross-campaign isolation paths.

Minimum cross-campaign tests:

- Package Validity Matrix: run package, projection, crew dataset, mission graph, and End Conditions contract tests for every bundled campaign.
- Campaign Library / Selection: verify every bundled campaign appears in the live SillyTavern Directive library with the correct title, metadata, status, and assets.
- Character Creator: open creator from each campaign, verify campaign-specific defaults/copy, complete a minimal valid character, and verify the selected package id is carried forward.
- Fresh Campaign Start / Chat Binding: start a fresh campaign for each package, verify a Directive-owned character/chat is created, and verify prompt context is installed only for that chat.
- Cross-Campaign Isolation: start or load a second campaign and prove the first campaign save, chat binding, mission state, prompt blocks, command log, and End Conditions ledger do not mutate.
- Short Live Canary: for every non-primary campaign, play 2-4 real model-backed turns through Playwright, save, load, and continue one turn.
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

For each campaign matrix row, `live-log.jsonl` must record package id, package path, title, version/status, deterministic checks run, live canary turn count, save id, chat id, prompt revision, End Conditions test result, and cross-campaign isolation result.

## Parallel Multi-User Patch Lanes

Parallel soak workers are useful only if their state and code lanes are explicit. Treat each worker as a patch lane:

- one SillyTavern user account;
- one Playwright browser context;
- one Directive run id and artifact folder;
- one campaign package/shard assignment;
- one branch or worktree when code changes are being made;
- one installed/served extension copy if the SillyTavern host supports per-user extension installs, otherwise one separate SillyTavern host/dataRoot per patch lane.

The repo checkout remains the source of truth. A per-user installed extension is a disposable served copy for that worker, not the canonical implementation. Any bug fix found during a soak must land as a repo patch first, pass the focused local tests for that subsystem, and only then be synced into that worker's served extension copy for live verification.

Best workflow:

1. Start from a clean coordination point: repo tests pass, extension copy is synced, `check-sillytavern-multi-user-soak-readiness.mjs --live` passes, and every worker writes its own `live-log.jsonl`.
2. Assign workers by campaign/shard, not by vague "keep testing" ownership. Example: worker A runs the 52-turn Ashes soak, worker B runs Glass Harbor and Serein canaries, worker C runs End Conditions branches.
3. When a worker finds a bug, pause that worker's soak lane, preserve its log/artifacts, create a focused branch/worktree fix, and run the smallest deterministic test that proves the bug.
4. Sync the fixed repo files only into that worker's served extension copy and rerun the failing live step in that user's ST account.
5. Once the fix is accepted, commit or stage it in the repo coordination branch. Other workers do not manually re-fix the same symptom.
6. At planned sync barriers, pause all workers, merge or rebase to the latest known-good repo state, sync every served extension copy, record the extension hash/version in `live-log.jsonl`, then resume from a named checkpoint or start fresh where resume would confuse evidence.

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
| Clean play | 1-8 | scene color, routine command, counsel request, consequential command |
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

## Phase 2: Directive Assist, Turns 9-18

Objective: verify Assist works in real chat and remains pre-send only.

Required actions:

- `Brief Me` with empty input;
- `Brief Me` focused on a typed concern;
- `Draft In Character` from rough notes;
- `Frame as Order` for an authorized XO-style instruction;
- `Frame as Report` for a constrained or lower-authority phrasing;
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
- Assist usage alone does not change Command Log, relationship state, Command Bearing, or Mission state.

After each applied draft, send the final edited chat and verify the Mission Director interprets the sent text, not the earlier Assist draft.

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
9. use Assist to draft a concise order;
10. send edited Assist draft;
11. use Brief Me on evidence integrity;
12. use Frame as Report for uncertainty;
13. use Assist then cancel;
14. use Try Again;
15. use Replace Selection;
16. restore rough text;
17. use Frame as Order;
18. send final command;
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
51. use accumulated continuity in a quiet post;
52. make one final consequential decision.

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
- every Assist output for tense, PoV, and agency;
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
15. Next: add Assist UI automation.
16. Next: add message action automation with geometry checks for host-shaped controls.
17. Next: add host edit/delete helpers and recovery assertions once discovery identifies the safest public path.
18. Next: add deep-retcon branch-only destructive recalculation mode.
19. Next: add quality rubric scoring hooks.
20. Next: add strict mode that fails on any soft warning.
21. Next: add a short release-certification summary to the final report.

## Open Questions

- Which SillyTavern public API path is safest for automated message edit and delete across current host versions?
- Should destructive recalculation acceptance always run on a Save As branch, or should strict mode require a fresh campaign fork?
- What retention policy should we use for full player-visible transcripts once they are no longer needed for quality review?
- Should the quality rubric be manual-only first, or should a player-safe evaluator sidecar score outputs after each phase?
- Should the soak eventually run against Lumiverse with the same script, or should Lumiverse receive a separate host-parity soak after SillyTavern is stable?
