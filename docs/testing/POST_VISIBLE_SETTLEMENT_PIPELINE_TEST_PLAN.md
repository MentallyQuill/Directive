# Post-Visible Settlement Pipeline Test Plan

**Status:** Required verification contract

**Design:** `docs/superpowers/specs/2026-07-20-post-visible-settlement-pipeline-design.md`

**Implementation:** `docs/superpowers/plans/2026-07-20-post-visible-settlement-pipeline.md`

## Purpose

Prove that every selected visible assistant response is interpreted once, that accepted time and mission changes reach canonical committed state before the next player turn, and that source mutation or model failure cannot corrupt state or break immersion.

This test plan separates deterministic contract proof, runtime integration proof, replay proof, and live SillyTavern proof. A green unit suite alone is insufficient.

## Release Gates

All gates are mandatory before consolidated mode becomes the default:

1. Focused contract and integration scripts pass.
2. The full alpha gate passes.
3. Ashes replay fixtures pass with exact expected time/mission transitions.
4. Both Directive-authored and host-native visible response routes pass live.
5. Duplicate, swipe, edit, delete, stale-result, timeout, and retry cases pass.
6. CORE diagnostics contain no raw prompt/provider payload.
7. Eligible settled responses use one semantic tracking call after legacy call retirement.
8. Headers and countdowns agree with canonical committed state on the following turn.

## Test Environments

- **Deterministic local:** repository script tests with stubbed provider output and fixed timestamps.
- **Replay:** sanitized fixture built from the observed Ashes failure shape, not a live write to `default-user`.
- **Live soak:** dedicated non-human SillyTavern user/save/chat with installed extension copy verified against the repository revision.
- **Read-only production evidence:** latest Ashes chat under `default-user`, inspected without mutation unless explicitly authorized.

## Required Artifacts

For each live run retain:

- repository commit and installed extension file hashes;
- campaign/save/chat ids and response route;
- source frame id, response id, selected text hash, and settlement key;
- pre/post state revision and mechanics revision;
- pre/post canonical scene time and countdown values;
- accepted/rejected event hashes and reason codes;
- CORE background batch id and LENS prompt revision;
- model-call journal rows showing role id and attempt count;
- next outbound prompt header proving committed time/mission projection.

Do not retain raw system prompts, credentials, cookies, provider reasoning, or hidden-state payloads.

## Layer 1: Contract Tests

Run:

```powershell
node tools/scripts/test-post-visible-response-frame.mjs
node tools/scripts/test-post-visible-settlement-observer.mjs
node tools/scripts/test-post-visible-settlement-validators.mjs
```

### Frame cases

| Case | Expected |
| --- | --- |
| Directive visible response | Valid immutable frame |
| Host-native visible response | Same contract, `response.kind = hostContinue` |
| Missing CORE visible ref | Frame construction rejected |
| Missing selected text hash | Frame construction rejected |
| Unselected swipe text present in host transcript | Excluded from frame |
| Hidden/raw fields present in source objects | Excluded from serialized frame |
| Oversized transcript | Bounded player-safe tail with stable hashes |

### Observer/parser cases

| Case | Expected |
| --- | --- |
| Empty valid observation | Accepted no-change result |
| Valid time and mission bundle | Parsed and source-bound |
| Arbitrary `operations` or `patch` | Schema rejection |
| Wrong frame/response hash | Stale/source rejection |
| Span outside response bounds | Evidence rejection |
| Evidence text hash mismatch | Evidence rejection |
| More than contract event cap | Schema rejection |
| Malformed first response, valid retry | Two attempts, valid result |
| Two malformed responses | Terminal fail-soft, no proposal |

## Layer 2: Semantic Time Matrix

Use `tests/fixtures/post-visible-settlement/ashes-time-mission.fixture.json`.

| Visible context | Expected elapsed time |
| --- | ---: |
| Reactor report changes from 53 minutes remaining to 41 | 12 minutes |
| Reactor report changes from 41 to 37 | 4 minutes |
| "Seventy-five minutes later" with a nested 20-minute repair | 75 minutes |
| Character says, "We spend the week repairing her" as a proposal | 0 |
| Character thinks about spending a week | 0 |
| Quoted log says a prior repair took a week | 0 |
| "If we spend a week..." | 0 |
| "We have one week remaining" | 0 |
| "The repair should take a week" | 0 |
| Narration depicts one week of completed work | 10080 minutes |
| Player compression already commits 60 and continuation restates it | 0 additional |
| Player commits 60 and continuation establishes another later 10 | 10 additional |

For every accepted case assert:

- exact prior and resulting canonical scene time;
- exact countdown derivation;
- one `timeSettlementRef`;
- no second commit on callback replay;
- next prompt/header uses resulting time.

For every rejected case assert no time operation, a stable rejection reason, and no fallback lexical advancement.

## Layer 3: Mission Matrix

| Candidate | Expected |
| --- | --- |
| Visible evidence reveals known fact | `factDiscovered` accepted |
| Work visibly advances known objective | `objectiveProgressed` accepted |
| New obstruction visibly prevents progress | `objectiveBlocked` accepted |
| Completion criteria and committed outcome both support completion | `objectiveCompleted` accepted |
| Prose claims completion without criteria/outcome | Rejected |
| Known assignment changes owner/status with evidence | Accepted |
| Unknown objective id | Event rejected; valid time retained |
| Hidden truth absent from visible text | Rejected |
| Phase transition proposed by prose | Suggestion recorded; no direct phase mutation |
| Narration contradicts mechanics result | Mechanics retained; contradiction diagnostic |

Assert exact dirty domains and one LENS flush for every accepted bundle.

## Layer 4: Coordinator and Transaction Tests

Run:

```powershell
node tools/scripts/test-post-visible-settlement-coordinator.mjs
node tools/scripts/test-post-visible-settlement-queue.mjs
node tools/scripts/test-state-delta-gateway.mjs
node tools/scripts/test-forge-internal-background-settlement.mjs
```

Required assertions:

- accepted domains apply in one campaign revision;
- rejected events produce diagnostics but no operations;
- valid domains survive unrelated domain rejection;
- forbidden roots fail before mutation;
- mechanics revision drift rejects and rebuilds from a fresh frame;
- tracking-only revision drift revalidates and rebases at most once;
- persist failure never produces an applied CORE batch;
- LENS failure leaves committed state intact and schedules prompt retry;
- CORE effect refs contain hashes/counts only;
- settlement idempotency key is stable across duplicate callbacks.

## Layer 5: Queue and Concurrency Tests

| Scenario | Expected |
| --- | --- |
| Two responses in same chat | FIFO settlement |
| Responses in different chats | Independent lanes |
| Duplicate callback while queued | Same promise/result |
| Duplicate callback after applied | `replayed`, no mutation |
| Player submits while prior response settles | Ingress waits, then reads new revision |
| Observer hangs | Attempt timeout, one retry, bounded release |
| Both attempts fail | Diagnostic and ingress release; no state change |
| UI-only event | Does not wait on settlement lane |
| Stale result arrives after swipe | Rejected before commit |

Measure the ingress wait. It must not exceed the configured two-attempt bound plus small local validation overhead.

## Layer 6: Response Route Integration

Run:

```powershell
node tools/scripts/test-response-dispatcher-core-bridge.mjs
node tools/scripts/test-post-visible-settlement-runtime.mjs
node tools/scripts/test-chat-turn-orchestrator.mjs
```

### Directive route

1. Commit mechanics/outcome.
2. Post Directive narration.
3. Record CORE visible response.
4. Schedule exactly one settlement.
5. Apply accepted state and flush LENS.
6. Submit next player input and prove it reads the settled revision.

### Host-native route

1. Release host generation.
2. Observe selected assistant message.
3. Record CORE host-native visible response.
4. Schedule exactly one settlement using observed text/hash.
5. Apply accepted state and flush LENS.
6. Prove no wait-until-next-player accepted-pair mutation remains.

Failed, unavailable, and recovery-only response paths must not schedule a normal settlement.

## Layer 7: Source Mutation and Recovery

Run:

```powershell
node tools/scripts/test-post-visible-settlement-runtime.mjs
node tools/scripts/test-scene-reconciliation.mjs
node tools/scripts/test-repair-runtime.mjs
node tools/scripts/test-message-recovery.mjs
```

Test each mutation after an applied settlement and while a provider call is still running:

- swipe selection change;
- assistant message edit;
- assistant message delete;
- player source edit/delete;
- response reobserve after restart.

Expected sequence:

1. Old settlement key becomes invalid.
2. Old effects are removed by revision restore/replay, not field-specific subtraction.
3. Late old result is stale.
4. New selected response receives a new frame/hash.
5. New settlement applies once.
6. Prompt projection matches the new selected response.

## Layer 8: Consolidation and Cost Proof

Use model-call journal assertions on representative turns:

| Mode | Expected semantic tracking calls |
| --- | --- |
| Shadow | New observer plus legacy comparator; new path cannot mutate |
| Authoritative time/mission | One new observer; legacy time/mission writers diagnostic-only |
| Consolidated | One new observer; no separate thread/Command Log interpretation for same response |

Record:

- observer call count per selected visible response;
- retry count;
- legacy comparator call count;
- total Utility calls before and after consolidation;
- p50/p95 observer and ingress-wait latency.

Release fails if consolidated mode adds a permanent semantic tracking call without retiring an overlapping call.

## Layer 9: Full Alpha Gate

Run:

```powershell
npm test
```

Expected: exit code 0 and no failed scripts in the maintained alpha-gate summary.

Any unrelated failure must be documented with exact script/error and reproduced independently before being classified as pre-existing.

## Layer 10: Live SillyTavern Proof

### Preparation

1. Use a dedicated non-human soak user.
2. Install/sync the repository build into that user's served extension path.
3. Hash the modified runtime files in both repository and installed copy; require equality.
4. Start SillyTavern and confirm the extension loaded without console errors.
5. Create or import an Ashes-derived test save with a visible clock and countdown.

### Live scenario A: host-native elapsed time

1. Set canonical scene time to 0900 and reactor countdown to 53 minutes.
2. Send an ordinary rescue instruction routed to host continuation.
3. Provider response must visibly establish a 12-minute progression and report 41 minutes remaining.
4. Wait for hidden settlement; do not provide player acceptance.
5. Inspect state and CORE journal: time must be 0912, countdown 41, one settlement.
6. Send the next player message immediately after visibility; its outbound prompt must already contain 0912.

### Live scenario B: duration in dialogue

1. At a known time, produce dialogue containing "we spend the week" as a proposal without depicting the work.
2. Verify time does not advance.
3. Verify a rejection/no-change observation exists without lexical fallback.

### Live scenario C: Directive narration and mission progress

1. Trigger a mechanics-bearing Directive turn against a known objective.
2. Confirm mechanics commit before narration.
3. Let visible narration establish objective progress.
4. Verify one post-visible settlement updates mission progress without changing mechanics.
5. Verify next prompt includes updated objective state.

### Live scenario D: rapid ingress

1. Submit the next player message immediately when the assistant response appears.
2. Verify the player sees no confirmation UI.
3. Verify classification/adjudication begins only after settlement terminal status.
4. Verify bounded fail-soft behavior by forcing observer timeout in a test configuration.

### Live scenario E: swipe/edit/delete

Run only on the non-human soak user. Apply a time-advancing response, then swipe to a non-advancing variant. Verify old time mutation is removed and the new variant settles once. Repeat for edit and delete.

## Read-Only Ashes Regression Review

For the latest `default-user` Ashes chat:

1. Locate the exact assistant message where Bronn reports 41 minutes remaining.
2. Capture the preceding canonical time/header and any prior countdown value.
3. Replay the player/assistant pair through the deterministic fixture harness.
4. Expect a 12-minute proposal and resulting 0912 state.
5. Do not mutate the live chat/save during this review.

This establishes that the original failure shape is covered without risking the user's active campaign.

## Pass/Fail Report Template

```md
# Post-Visible Settlement Verification

- Commit: `<sha>`
- Installed-copy hashes match: yes/no
- Focused suite: pass/fail
- Alpha gate: pass/fail
- Ashes replay: pass/fail
- Directive live route: pass/fail
- Host-native live route: pass/fail
- Mutation/recovery: pass/fail
- Privacy inspection: pass/fail
- Calls per eligible response: `<before>` -> `<after>`
- p95 observer latency: `<ms>`
- p95 ingress wait: `<ms>`
- Remaining risks: `<specific list or none>`
```

Consolidated mode is approved only when every release gate has direct evidence. A plausible response or a correct model proposal without committed state is a failure.
