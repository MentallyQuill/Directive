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

## Native generation ownership follow-up

The first recovery slice was published as `a89d2ff149757917f9714a1b2a4863f01430ff18`; all 666 installed production files were verified against that commit. Two real accepted pairs remain the semantic-soak total.

A controlled native-host probe then reproduced a second defect: one Send gesture ran four continuity attempts, because the MESSAGE_SENT observer failed and the waiting interceptor granted another recovery pass. An explicit Retry added two more attempts. Both delayed responses and fresh-page immediate responses reproduced the four-attempt initial pass. These injected HTTP responses are not real-provider semantic evidence.

The reviewed follow-up correlates native GENERATION_STARTED with observer/interceptor work, checks ownership again inside the serialized retry operation, and preserves explicit Retry and cancellation. Focused regression and independent review cover simultaneous interceptors, fast/in-flight failures, Stop followed by End and automatic generation, and successful Retry narration handoff. Installed candidate production patch SHA256: `5853e5a34eea865547e05b78523e68b0698b14579da444af4a340fdfd3a8efd0`; all 666 files match source.

Installed-host verification of this follow-up is temporarily prevented by a separately reproduced native-branch failure. Actual Create branch UI supplies valid lineage, but the timeline transaction rejects with `DIRECTIVE_BRANCH_TIME_REBUILD_FAILED`. Its pending recovery reopens the incomplete child on subsequent chat changes. The parent durable save remains unchanged at revision 5 and can be opened directly, but a new Generate is blocked by that pending transaction. A resulting zero-call retry probe is recorded as inconclusive, not passing. Root-cause investigation is in progress; no save or operation records have been manually repaired.

The reviewed retry candidate passed the complete 227-check gate (`gesture-final-gate.log`, exit 0). Its installed-host replay remains inconclusive until branch recovery is repaired. Read-only diagnosis confirms an empty-invalidation bug: a tail branch retains all five messages, but branch reconstruction unconditionally asks the time invalidator to remove an empty set. The invalidator correctly rejects that input; branch reconstruction must skip the unnecessary operation. A focused regression and scoped correction are in progress.

## Verified native retry and tail-branch repairs

The tail-branch repair now skips time invalidation only when no messages were discarded. Regression coverage preserves the entire ledger and custody revision for a retained tail, and still removes discarded time entries, decisions, and accepted-pair effects for a truncated branch. Independent review passed both authoritative-time and native-branch runtime suites.

Installed candidate patch SHA256 `bc0d3281ae4e39eec208f328396a0e9f6487e1ad0c3d76eefdb8fd5025301fb9` matches all 666 production files. Reload resumed the existing journal through normal production recovery and completed it. The previous active save was retired as designed after preservation in checkpoint `checkpoint.1789416039211.2`; that checkpoint equals the pre-branch parent state except for its validated transcript attestation. Child `save.1789416039211.1` retains five messages and the same 50 seconds of accepted time, with hydrated state exactly matching durable storage at custody revision 5. No operation or save record was manually repaired.

Installed native fault checks now pass with delayed and immediate HTTP responses: two initial continuity attempts, then exactly two more after clicking Retry, six intercepted HTTP requests total per scenario, with unchanged campaign state and cleanup through native message deletion. Evidence: `native-gesture-candidate-recovered-delayed.json` and `native-gesture-candidate-reopened-fast.json`. This proves real host lifecycle accounting with controlled responses, not real-provider semantic quality or successful narration handoff.

An intervening fresh-page harness attempted verification before reopening the campaign; the host was on its default Assistant chat. Its assertions failed and one unexpected generation request was intercepted and aborted. The harness now requires a nonnull campaign state and an exact native chat/binding match before sending. Explicit production campaign reopening restored the child, after which the immediate-response check passed. This failed setup is excluded from passing scenarios.

The final combined release gate passed all 227 checks (`gesture-branch-final-gate.log`, exit 0). Total real provider requests remain 33 and unique accepted pairs remain two; copying their history into a branch does not create additional semantic samples. The recovered child has not yet been continued through real-provider play. All remaining areas and the 20-pair/three-timeline minimum remain open.

## Third live batch and selected-swipe findings

On published `2cc02e8ae188e202e30cb0d49ca822c08423db8b`, the recovered branch completed one additional real pair after two explicit Retry gestures. The interpreter first returned a forbidden extra field, then incomplete JSON, then an evidence-quote mismatch, then incomplete JSON again. Read-only inspection confirmed both malformed responses were missing only the final root brace despite `finish_reason: stop`; the emitted examples and payloads were valid and the shared parser ran normally. Validators remained strict. The final Retry produced a valid interpretation and successfully handed off to native narration. All six earlier failed analysis calls left authority unchanged; the successful pass committed exactly one pair. Current unique-pair total: three, with real continuation on two timelines.

The acknowledgement turn preserves the player's confirmation-required handover decision. Narration acknowledges the handover and answers the request for an immediate operational concern; it does not move the player into a test or complete readiness work. Eight calls were used across the initial gesture and two explicit retries, including one successful narration. Individual measured request durations ranged from 9.7 to 53.1 seconds; manual inspection pauses are excluded from these request durations and no population latency claim is made.

A native alternative-reply attempt exposed two further defects:

- The direction prompt/schema accepted global constraint IDs in `requires`, but the compiler only accepts conditions attached to the selected target. A continuity target has no such conditions. The model's apparently valid direction therefore failed during deterministic reconciliation without an actionable explanation. The candidate aligns the target-specific contract and feedback while retaining the compiler's final guard.
- After failed swipe preparation, dialog Retry called native `Generate('swipe')` directly. The host had reset the selected slot to zero after the initial failure; Retry overwrote the original draft instead of reserving a new alternative. The preserved pre-swipe-save-evidence.json and swipe-retry-after.json show one swipe of 2470 characters becoming one swipe of 2196 characters, with the original absent. The candidate routes Retry through the native swipe lifecycle. This is a reproduced draft-loss defect; the accepted-pair count stayed at three.

Natural draft/state before controlled revalidation was preserved through production Save Game in checkpoint `checkpoint.1789418104806.2`. Its creation left active state unchanged. The original overwritten draft remains in diagnostic evidence; no manual transcript repair has been treated as gameplay proof.

The disposable account's Utility and Reasoning lanes were Auto/not-run, so their previous complex requests used Prompt JSON. Production Test Provider passed connectivity and native-schema certification for both exact configured GLM profiles, using four real requests. Auto now selects native schema. This is a new configuration boundary and capability proof, not evidence that complex semantic output will be correct. Raw request metrics and all classification boundaries are preserved in ignored artifacts.

## Authored consequence coverage expansion

The source inventory verified all 13 Ashes definition hashes and all 50 objective IDs against the support matrix. Fourteen authored scenarios and additional exact award assertions close the ten disposition-coverage gaps. The campaign harness passes 13 mission contracts and 314 scenarios: 174 terminal/transition cases and 140 active or negative cases. All supported objective dispositions now have explicit authored-scenario assertions; 48 scenarios assert exact award sets. Chapter 1 and 2 optional declines preserve closure and transition, and all three Open Orders III awards have direct completion/cost/decline/failure boundaries.

Definitions and the harness were not changed. No unreachable gate or production consequence defect was proven. Seven required objectives remain authored as success-only duties; Rhee apprehension is optional without a decline disposition but can remain unresolved without blocking closure. These source constraints still need live journey adjudication. Controlled scenarios do not prove model interpretation, player discovery, fair narration, or full-campaign completion. The detailed coverage map is retained in `ashes-fairness-coverage.md`.

## Verified direction and swipe repair candidate

The reviewed candidate matches all 666 installed production files (production patch SHA256 `03df2c795e71dd7dcca3670375a72b92cc94e960319cc7387f797c5a37eb332c`). Independent reviews approved the target-specific direction contract and the host-owned swipe continuation. Source guards, Stop/import ordering, unsupported host APIs, empty/whitespace output, and repeated failure are covered by focused regressions. The native API can preserve a nonempty partial stream without exposing a separate failure result; that native partial-output distinction remains a documented limitation.

A controlled installed-host test forced two invalid direction responses, then a valid Retry response and streamed narration. It made four intercepted HTTP calls with no real provider request. The original swipe remained unchanged, the new response occupied slot 1, and accepted pairs, mission, and time were unchanged. Evidence: `native-swipe-retry-candidate.json`. Production Load Game then restored the natural checkpoint into `save.1789418642122.1`; draft text, time, corrections, three accepted pairs, and durable state were verified (`restored-natural-checkpoint.json`).

With actual certified native-schema analysis, a real alternative generation completed in two provider calls. Its raw direction request contains the expected native JSON schema. Both alternatives were retained; selecting swipe 0 and then swipe 1 left accepted pairs at three (`selected-real-swipe.json`). The next real player message is testing acceptance of swipe 1. At this checkpoint that acceptance is still pending: duration/pacing interpretation rejected while the other analyst is still running. This is not yet a completed selected-swipe acceptance/reload journey.

The complete final gate passed 227 checks, including the 314 authored campaign scenarios (`direction-swipe-final-gate.log`, exit 0). The repair slice was published to main as `ef20acd0cc235406beb357e1b7fdd7f13daa2820`, verified through GitHub CLI, and all 666 installed production files matched that commit. The active goal retains the new interpreter finding and all remaining live scenarios.

## Native-schema portability and selected-swipe acceptance

The real selected-swipe acceptance attempt (requests 93–97) ended with Retry available and no new accepted pair. Both interpreter responses were valid JSON with a normal stop finish, but supplied `durationSeconds: 0`, an assistant source slot, and an empty duration quote. The transmitted schema makes those fields optional and non-null, with positive duration and quote-length constraints. The outputs violated that schema; Directive correctly rejected them. The retry received the exact diagnostics and repeated the invalid placeholders. Pacing independently cited an unauthored requirement, then an earlier player source and an altered assistant quote.

Earlier parseable Prompt JSON responses omitted these optional duration fields. The first two native-schema interpreter responses supplied invalid placeholders. This supports a provider/schema portability problem, but does not establish its internal cause. The existing simple boolean certification probe did not test optional constrained fields. Certification is capability evidence only, not complex-turn correctness.

At 20:54 UTC only the disposable account's Utility lane was explicitly changed to Prompt JSON; Reasoning retained native-schema certification. One actual dialog Retry then supplied no invalid duration placeholders, but its interpreter attempts failed an exact-source quote and JSON parsing respectively. This comparison has not recovered the gameplay turn. Semantic validators remain unchanged, both real swipe alternatives remain available, and the unique accepted-pair count remains three. Raw records and configuration boundaries are retained locally; provider credentials are excluded from tracked evidence.

That comparison ended after continuity reached its 300-second request limit and its retry failed grounding validation (requests 98–102). No accepted pair or narration was added. The next certification revision now asks for exact `{ "ok": true }` while declaring the constrained optional duration fields and requiring their omission. Providers that materialize those fields do not earn native certification. The v2 fingerprint invalidates earlier weak certifications; Auto uses Prompt JSON until recertified, and explicit Native Schema remains unavailable until certification succeeds. Independent review and all 227 gate checks passed (`certification-final-gate.log`). The stricter probe covers the reproduced omission failure, not universal schema compliance. Installed-host revalidation is still required for this revision.

While waiting on the real Retry, the native Stop control was hidden and the dialog remained busy. Source tracing confirmed that Close/Escape/backdrop abort the dialog controller without passing its signal into analysis. This prevents the later narration handoff but can leave analysis and settlement running. A scoped cancellation repair is in progress; no passing live Close test is claimed for the current build.

## Installed certification and Retry cancellation verification

Certification revision `68145b67b317acdad5df7c65deed08949f78b11f` was published and verified on GitHub. All 666 installed production files matched its Git content, allowing Windows checkout line endings. A production Test Provider call reproduced the exact unwanted duration placeholders in the stronger native probe. It correctly certified this configuration for Prompt JSON only (`live-certification-reasoning.json`, requests 103–104). Utility remains explicitly Prompt JSON; Reasoning Auto now uses its v2 Prompt JSON result. Reload and explicit campaign reopen preserved full state, the pending player message, and both selected-swipe alternatives.

The cancellation candidate passes the dialog attempt signal through the native bridge into queued turn preparation and its analysis controller. Dismissal cancels only that attempt. Existing mission settlement guards prevent a canceled analysis result from committing. Close, Escape, and backdrop regressions exercise abort-ignoring delayed providers, unchanged durable state, queue release, and a fresh gesture while the old response is still outstanding. The new gesture remains independent and commits once. Independent review approved the change and confirmed successful narration handoff and existing global Stop semantics remain covered.

Installed native preparation used four synthetic responses to create the blocked dialog without changing campaign state (requests 105–108). Actual dialog Retry then issued one real interpreter request; other successful proposals were reused. Clicking Close aborted that request at the transport boundary, left memory, durable state, and all chat messages unchanged, and started no subsequent request during the observation. The persistent recorder captured `net::ERR_ABORTED` within 100 ms of the Close action (`close-live-retry-verified.json`). The short-lived Close probe attached after the request began and missed its request-failed event; reconciliation against the recorder established the result without another provider call. This proves installed Close cancellation, not successful gameplay recovery. Unique accepted pairs remain three.

The complete final cancellation gate passed all 227 checks (`dialog-cancellation-final-gate.log`, exit 0). A subsequent exact reload preserved campaign and transcript state and discarded the controlled attempt's in-memory proposal cache. A fresh native Generate then resumed the real pending player turn with real calls in all three analysis lanes. Its result remains outside the completed cancellation claim.
