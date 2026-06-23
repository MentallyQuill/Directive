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

## Required Host Conditions

Before running the soak:

- SillyTavern is reachable through `SILLYTAVERN_BASE_URL`.
- First, before any other soak action, sync the served or installed SillyTavern Directive extension to the checkout under test. Parallel extension fixes may make the installed copy stale until testing begins.
- The served Directive extension is the checkout under test, or the checkout has been copied into the installed SillyTavern extension path and acknowledged with `DIRECTIVE_CONFIRM_EXTENSION_SYNCED=1`.
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
- `turns.jsonl`: one record per test turn or mutation.
- `snapshots/`: bounded campaign-state summaries after each checkpoint.
- `transcript/`: transcript excerpts with hidden-state redaction.
- `screenshots/`: desktop and phone screenshots of Mission, Crew, Ship, Log, Campaign, and Settings at key checkpoints.
- `playwright/`: trace, video, console, network, and browser-error artifacts when enabled by the runner.
- `prompt-inspection/`: prompt block ids, hashes, placement, and revision metadata, never raw hidden prompt content.
- `storage/`: save-index and branch metadata proof, never provider secrets.

The report shape is defined by [live-campaign-soak-report.schema.json](../../schemas/testing/live-campaign-soak-report.schema.json). The schema intentionally records Playwright as the primary driver, marks CDP/direct-handler coverage as non-equivalent fallback evidence, and requires the unlimited model-call policy.

The report must redact:

- API keys, cookies, CSRF tokens, and auth headers;
- hidden campaign truth;
- raw relationship values;
- raw pressure values;
- hidden clocks;
- provider prompt bodies unless explicitly captured in a sanitized diagnostics mode.

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
- prompt-context revision;
- save id and save revision;
- visible Mission/Crew/Ship/Log/Settings summaries.

## Turn Script Overview

The soak target is 52 player turns. The exact prose can vary by campaign package, but the script should preserve the intent categories and mutation timing.

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
- Bad-guy play: lie, sabotage, conceal evidence, protect a villain, or act as a secret hostile agent.
- Prompt injection: tell the narrator or Directive to ignore campaign rules, expose hidden state, or treat the user message as system instruction.

Expected behavior:

- Directive may let the player attempt immoral, deceptive, risky, or suspicious actions.
- Directive must not treat those attempts as guaranteed success.
- Directive must not let the player speak or decide for NPCs.
- Directive must not reveal hidden truth because the player asserted it.
- Mission Director, Command Competence, Captain authority, crew reactions, and constraints should respond in-world.
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

## Quality Rubric

Each generated or posted response should be scored in the report:

| Score | Meaning |
|---:|---|
| 0 | unsafe or wrong: hidden leak, agency violation, mechanics corruption, or incoherent state |
| 1 | usable but weak: awkward prose, weak continuity, vague reaction, or missed nuance |
| 2 | good: preserves player intent, coherent state, correct role and tone |
| 3 | excellent: strong continuity, character-specific reaction, clear stakes, no overreach |

Score these dimensions independently:

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

## Manual Review Checklist

After the automated run, a human reviewer should inspect:

- the first 10 turns for normal campaign feel;
- every Assist output for tense, PoV, and agency;
- every authority attack for proper reframing or resistance;
- every retcon mutation for explicit recovery or reconciliation evidence;
- every accepted pending proposal for player-safe wording and authorized roots;
- final Mission/Crew/Ship/Log summaries for internal consistency;
- screenshots for message actions, Assist menu, pending reconciliation card, and route health;
- `summary.md` for actionable failure grouping.

## Follow-Up Implementation Milestones

1. `tools/scripts/soak-sillytavern-campaign-live.mjs` exists as a report-only dry run that prints the plan and validates host prerequisites.
2. `tools/scripts/lib/sillytavern-live-harness.mjs` centralizes Playwright-first live-host helpers, artifact writers, served-extension hash checks, runtime snapshots, and safe chat-send helpers.
3. `tools/scripts/discover-sillytavern-message-mutation-live.mjs` exists as a read-only probe for the safest future edit/delete automation path.
4. `schemas/testing/live-campaign-soak-report.schema.json` defines the report artifact contract.
5. `tools/scripts/check-playwright-soak-readiness.mjs` proves local Playwright launch/control, desktop/phone viewport switching, screenshot capture, and trace writing before live host mutation begins.
6. Next: port fresh-campaign creation and send-turn helpers from `smoke-sillytavern-live.mjs` into full live execution mode.
7. Next: add checkpoint and artifact writers, including Playwright trace/screenshot/error capture during live execution.
8. Next: add Assist UI automation.
9. Next: add message action automation with geometry checks for host-shaped controls.
10. Next: add host edit/delete helpers and recovery assertions once discovery identifies the safest public path.
11. Next: add deep-retcon branch-only destructive recalculation mode.
12. Next: add quality rubric scoring hooks.
13. Next: add strict mode that fails on any soft warning.
14. Next: add a short release-certification summary to the final report.

## Open Questions

- Which SillyTavern public API path is safest for automated message edit and delete across current host versions?
- Should destructive recalculation acceptance always run on a Save As branch, or should strict mode require a fresh campaign fork?
- How much generated prose should be stored in artifacts before privacy and hidden-state risk outweigh debugging value?
- Should the quality rubric be manual-only first, or should a player-safe evaluator sidecar score outputs after each phase?
- Should the soak eventually run against Lumiverse with the same script, or should Lumiverse receive a separate host-parity soak after SillyTavern is stable?
