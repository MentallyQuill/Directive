# Player promise stabilization evidence

Status: in progress. No full stabilization or live-soak completion claim.

## Scope and baseline

The active goal covers objective authority, accepted-choice persistence, character information, campaign fairness, long-campaign behavior, and provider/host recovery. The execution plan is `docs/superpowers/plans/2026-09-14-player-promise-stabilization.md`.

- Published baseline verified through GitHub CLI: `1d4102db9695fcb90cc9976a5117267a8b255407`.
- Isolated worktree: `F:/git/Directive/.worktrees/player-promise-stabilization`.
- Existing personal checkout and prior test-account data are preserved.
- Existing localhost port 8000 refused a connection during setup; this is a host-availability observation, not a Directive defect.
- Baseline gate: all 225 checks passed; full output in ignored `artifacts/stabilization-20260914/baseline-gate.log`.
- Disposable SillyTavern 1.18.0, source `61ad2189fb53aa01c774ab03b70d7c47d772c640`, loopback port 8014, separate data root under ignored artifacts. Personal settings, installs, and saves were not changed.
- All 666 installed production files matched baseline hashes before live play. Subsequent candidate installs have a separate hash manifest; they are unpublished working-tree builds.
- NanoGPT profiles: utility `z-ai/glm-5.3-flash`; reasoning/narration `z-ai/glm-5.2:thinking`. Analysis max output 8192; opening narration 2200. Only necessary configuration was copied from an existing disposable account into a fresh account.

## Coverage ledger

| Area | Controlled evidence | Live evidence | Remaining |
| --- | --- | --- | --- |
| Objective interpretation and authority | Ten objective suites pass; combined production-path probe preserves unrelated facts and partial progress across failed persistence, stale interpretation, correction, and fresh hydration | Real opening completed; native Mission resolve/reopen persisted across page reload and explicit campaign reopen | Natural partial-progress interpretation and continued narration, rewards/transition journey |
| Choice/persistence/timelines | Existing branch/storage suites available | Pending | Selected swipe, branches, interrupted persistence, stale sessions |
| Information/spoilers | Existing extraction corpus available | Pending | Real extraction plus narration and UI adjudication |
| Fairness/completion | Existing 13-mission predicate matrix | Pending | Consequence-bearing journeys, non-success routes, fair discovery |
| Long campaigns | Existing simple scale fixture | Pending | Rich state, retrieval quality, measured performance |
| Recovery/coexistence | Focused retry and raw-response boundary regressions added; independent review requires preserving native extraction compatibility | Natural invalid-evidence, invalid-target, reasoning-only, and token-exhaustion responses captured; first attempted turn paused | Verify revised candidate in host, live Stop/Retry, mobile and ordinary chats |

## Findings

Two production defects were reproduced in the first live attempt:

1. Native response extraction discarded `finish_reason: length`, so an empty response that exhausted 8192 completion tokens was reported as reasoning-only instead of token-limited. An initial raw-response fix passed the existing gate but independent review found Claude schema, llama.cpp array, and text/instruct compatibility regressions. Revision is required before publication or further semantic scoring.
2. Continuity and direction retries did not receive their strict validator's diagnostics. The existing coordinator already supported role-local feedback; the focused analyst adapters dropped it. The candidate retains at most eight diagnostics of 240 characters each and supplies them only as retry feedback. Source evidence, validators, schemas, and retry counts remain authoritative. Independent review found no blockers in this change.

These are observed recovery failures, not evidence that failed model output should be accepted. The revised provider adapter passed independent review after retaining native schema extraction, array response metadata, instruct/preset cleanup, and provider-source snapshots. The scoped fixes and integration regression are included with this report; broader stabilization remains in progress.

## First live batch: baseline observations

- Fresh Ashes campaign with synthetic player Avery Quinn. Opening completed through two real provider requests.
- First natural player turn asked to enter the ready room and discuss command authority. Eight subsequent provider calls ran across parallel analysis and recovery; the turn paused after approximately 305 seconds without a new assistant reply or accepted pair.
- Interpreter evidence initially used an ellipsis rather than a continuous quote; its existing feedback retry succeeded. Direction initially selected an invalid target; a later attempt succeeded. Continuity alternated between token exhaustion and invalid source quotes and did not settle.
- Total real requests: 10 including opening. This is not a successful sustained soak; accepted post-opening pairs: zero.
- Native Mission controls successfully marked command handover complete and then still underway. Page reload followed by explicit campaign reopen retained the player decision, matching the durable save, with confirmation required and state revision 3. This is live UI/persistence evidence, not natural semantic completion evidence. The initial immediate reload probe raced host startup; the explicit reopening probe passed.
- A Stop probe ran after the turn was already terminal. Stop remains unverified.
- At 390px and 320px widths, the installed Mission correction dialog and each action remained reachable inside the viewport; Cancel preserved exact campaign state. Screenshots were inspected. This is resized Chromium geometry/cancellation evidence, not physical mobile-device coverage.

## Reviewed candidate: installed-host checks

- Candidate production patch SHA256 `e9757c7d9ec5c47efa7f72ae7df99c024995e4f0ba202a3dd43f2f9d01ab0299`; all 666 installed files matched the working-tree source at installation.
- Replayed one naturally captured HTTP envelope through the actual installed native request path: `provider_token_limit`, `finishReason: length`, `maxTokens: 8192`, one request, no campaign-state mutation. The output-limit Settings guidance appeared. This replay made no real provider call.
- Actual browser-loaded native SillyTavern extractors retained Claude `tool_use.input` and native-schema certification in a synthetic-transport check. This verifies installed adapter/native-function compatibility, not a live Claude-provider response.
- Native Stop canceled three real concurrent analysis transports (`net::ERR_ABORTED`), left memory/durable state and chat count unchanged, and started no retries during the five-second observation. Controlled delayed-result regression separately covers callbacks beyond that window.
- An earlier Stop harness used blank Send, which expands to the copied host's `Continue.` setting. Stop canceled its three transports and preserved campaign state, but the harness's unchanged-chat assertion correctly failed. The exact added test message was removed through native deletion; the verified rerun used native regeneration of the pending player message.
- First batch ended with 16 real provider requests (10 baseline plus six canceled Stop-probe requests) and one HTTP replay. The three Claude extractor fixture calls used synthetic transport and are excluded.
- A second bounded gameplay batch uses the existing copied GLM Flash profile for the dedicated account's reasoning lane, following repeated exhaustion by the original GLM5.2 thinking configuration. Native narration remains on its original profile. Quality and latency must be attributed to this separate configuration.
- First attempt in that configuration: four real calls; interpreter and continuity returned valid proposals, while direction twice selected an objective ID as a continuity-thread target. The retry received the validator code, confirming feedback transport, but the code alone did not produce recovery. Narration paused honestly, with chat still two messages and authoritative mission revision unchanged. This attempt is not a semantic gameplay pass.
- Focused direction rejection now retains its stable error code and adds a bounded diagnostic identifying the invalid move/target and the permitted source-bound target set. It never presents shortened identifiers as legal IDs and cannot invoke coercion on malformed object values. Independent review and regressions cover both cases.
- Final candidate production patch SHA256 `7ee20f541169848c8c1b731237465c2f961ef27e40907a12162ae172c77eb527`; all 666 installed files matched source. The final full gate passed all 226 checks; log: `final-candidate-gate.log`.
- Live revalidation of the same pending player turn succeeded through five real calls (three initial analysts, one direction retry, one narration). Direction first returned `respond-to-player` with an objective target, then corrected it after receiving the actionable diagnostic. Narration answered the command-boundary question. The handover remained incomplete with player confirmation required. This is one successful recovery, not a sustained-soak result.
- A following natural turn accepts that reply and asks about emergency authority before formalizing the handover. Narration completed, again leaving handover incomplete. It required eight real calls, including continuity retries across two preparation passes; that operation boundary is under investigation before claiming turn-wide retry boundedness.
- Current durable snapshot matches in-memory authority at custody revision 5, with exactly two accepted-pair receipts and two director receipts. The latest assistant draft is not yet accepted. The two completed narrations do not satisfy the predeclared 20-pair, three-timeline minimum.

## Evidence and remaining work

The tracked `tools/scripts/test-objective-progress-app-recovery.mjs` promotes the combined correction journey into the alpha gate. Independent review and its focused run pass. It controls provider responses and one storage-write failure while exercising production app, settlement, correction, replay, and hydration; it does not patch campaign state directly. Its retry is a failed-correction retry, not a native generation Retry.

Ignored `artifacts/stabilization-20260914/` holds baseline gate output, installed-file manifests, provider request/response records, request timestamps, controlled journey probe/output, correction snapshots, and screenshots. Raw provider records contain synthetic story material; copied provider configuration and credentials remain outside tracked evidence. The baseline correction snapshot is preserved separately from candidate runs.

No full-soak, aggregate semantic-quality, latency-percentile, ordinary-chat, or all-mission completion claim is supported yet. Continue the bounded objective journey, then selected-swipe branching and private-information continuation. All unexercised scenarios in the plan remain required by the active goal.
