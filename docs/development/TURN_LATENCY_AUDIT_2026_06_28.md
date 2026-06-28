# Turn Latency Audit 2026-06-28

## Scope

This audit records live evidence from the active Sam Vickers / Ashes of Peace campaign in SillyTavern `default-user`.

Evidence paths:

- Save: `F:\SillyTavern\SillyTavern\data\default-user\user\files\directive-saves-save-1782609891577-3-382605b7.v1.json`
- Chat: `F:\SillyTavern\SillyTavern\data\default-user\chats\Directive - Ashes of Peace (2)\Directive - Ashes of Peace (2) - 2026-06-27@19h24m52s895ms.jsonl`
- Installed extension: `F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive`

The installed extension copy did not match the repo hashes at audit time. The live installed copy still had the relevant behaviors checked here: serialized runtime persistence, pretty JSON save writes through host file upload, open-world `rootsSet` including `runtimeTracking`, and turn-ledger storage of full `turnPacket.stateDelta`.

All timestamps below are UTC.

## Numbering Note

SillyTavern chat row numbers, Directive ingress `hostMessageId`, and Directive response `hostMessageId` are not the same layer.

- Chat row `30` is the player message beginning `"I'll be sure to let her know..."`.
- That player message is recorded in Directive as ingress `hostMessageId: "29"`.
- Chat row `31` is the host-native assistant response to that same ingress, not a separate player turn.
- The next player message is chat row `32`, recorded as Directive ingress `hostMessageId: "31"`.
- After the player edited/retried that message, a second ingress with `hostMessageId: "31"` and a new text hash appeared.

## Save Bloat Finding

At the later audit read, the active save was:

- save revision: `257`
- runtime revision: `69`
- save index revision: `5125`
- file size: `73,166,880` bytes
- runtime history length: `20`

Largest serialized campaign-state roots:

| Root | Minified bytes |
| --- | ---: |
| `turnLedger` | `21,836,975` |
| `runtimeTracking` | `14,090,539` |
| `continuity` | `558,237` |
| `threadLedger` | `69,000` |

The turn ledger retained only two entries, but both carried very large `stateDelta` payloads:

| Turn ledger entry | `stateDelta` bytes | `stateDelta.openWorld.rootsSet.runtimeTracking` bytes |
| --- | ---: | ---: |
| ingress `17` outcome | `7,395,954` | `7,282,992` |
| ingress `31` outcome | `13,227,023` | `13,119,063` |

This points to a structural bloat path:

1. The open-world coordinator creates a projected root set.
2. That root set includes `runtimeTracking`.
3. The projected root set is placed in `turnPacket.stateDelta.openWorld.rootsSet`.
4. The transaction layer stores the full turn packet state delta in `turnLedger.entries`.
5. Every save writes the normal runtime tracking root plus another large nested runtime-tracking copy inside retained turn-ledger deltas.

The likely first optimization is to sanitize or split the stored turn-ledger delta so durable audit records do not retain full runtime tracking snapshots inside open-world root replacements.

Repo follow-up: `src/campaign/transaction-state.mjs` now compacts `stateDelta.openWorld.rootsSet.runtimeTracking` when appending durable `turnLedger` entries and when pruning retained packet deltas. The live open-world root replacement still applies before the ledger write, but the retained packet copy drops runtime history, ingress/response/recovery journals, sidecar/model-call journals, pending interactions, active ingress, and scene-reconciliation work queues. This addresses the duplicate nested `runtimeTracking` copies measured above, including already-retained packets on the next prune/commit pass. It does not by itself solve the separate `runtimeTracking.history` root, which was still `14,090,539` minified bytes in this save and remains a scale target for 5000-message campaigns.

## Turn 29 / Chat Row 30 Timeline

Player message:

- chat row: `30`
- Directive ingress: `hostMessageId: "29"`, text hash `41a9ab62`
- received: `2026-06-28T05:44:20.762Z`
- classification: `counselRequest`
- strategy: `injectAndContinue`
- status: `complete`

Blocking and model-call timeline:

| Offset | Event |
| ---: | --- |
| `+6s` | `sceneHandshakeSettler` started |
| `+36s` | `sceneHandshakeSettler` failed with `DIRECTIVE_GENERATION_TIMEOUT` after `30,011ms` |
| `+42s` | `utilityTurnClassifier` started |
| `+53s` | `utilityTurnClassifier` returned ok after `11,189ms` |
| `+54s` | ingress marked classified |
| `+59s` | `missionDirectorAdvisor` started |
| `+81s` | `missionDirectorAdvisor` returned ok after `21,461ms` |
| `+93s` | response ledger recorded delegated host generation |
| `+103s` | ingress marked complete |
| `+110s` | five sidecar model calls started concurrently |
| `+146s` to `+148s` | sidecar model calls returned |
| `+162s` | continuity sidecar applied revision `58` |
| `+186s` | relationship sidecar applied revision `59` |
| `+211s` | crew sidecar applied revision `60` |
| `+238s` | ship sidecar applied revision `61` |
| `+247s` | command-bearing sidecar recorded no-change |

Response evidence:

- response kind: `hostGeneration`
- response strategy: `injectAndContinue`
- response ledger posted: `2026-06-28T05:45:54.081Z`, about `+93s`
- host continuation result: `{ ok: true, skipped: true, reason: "host-already-generating" }`
- assistant chat row `31` send date: `2026-06-28T05:46:52.977Z`
- assistant chat row `31` native `gen_started`: `2026-06-28T05:44:19.947Z`
- assistant chat row `31` native `gen_finished`: `2026-06-28T05:47:16.445Z`
- native time to first token: `41,925ms`

Interpretation:

SillyTavern's native generation appears to have started immediately for the host-native path, but Directive spent about 93 seconds before recording the handoff. The visible row did not arrive until about 153 seconds after the player message. The pre-handoff delay came mainly from a 30 second Scene Handshake timeout, classification, a blocking `missionDirectorAdvisor` call, prompt/sync/bookkeeping, and serialized full-save persistence.

Sidecar generation itself was concurrent. The slow sidecar region was result application, prompt sync, journaling, and persistence after the batch returned.

## Turn 31 Original / Chat Row 32 Timeline

Player message:

- chat row: `32`
- Directive ingress: `hostMessageId: "31"`, text hash `524caba2`
- received: `2026-06-28T05:53:17.265Z`
- classification: `consequentialCommand`
- strategy: `directivePosted`
- status after edit: `recoveryRequired`
- invalidated: `2026-06-28T05:57:34.696Z`
- invalidation type: `playerMessageEdited`

Blocking and model-call timeline:

| Offset | Event |
| ---: | --- |
| `+6s` | `sceneHandshakeSettler` started |
| `+18s` | `sceneHandshakeSettler` returned ok after `11,573ms` |
| `+24s` | `utilityTurnClassifier` started |
| `+32s` | `utilityTurnClassifier` returned ok after `8,022ms` |
| `+33s` | ingress marked classified |
| `+56s` | `narration` started |
| `+152s` | `narration` returned ok after `96,493ms` |
| `+171s` | Directive-owned response posted |
| `+195s` | ingress marked complete |
| `+207s` | `sceneDeltaExtractor` started |
| `+215s` | `sceneDeltaExtractor` returned ok after `8,111ms` |
| `+230s` | `questArchitect` started |
| `+257s` | player edit invalidated the source message and Scene Handshake source |
| `+281s` | `questArchitect` failed with `DIRECTIVE_GENERATION_TIMEOUT` after `50,741ms` |
| `+329s` | four sidecar model calls started concurrently |
| `+341s` to `+346s` | sidecar model calls returned |
| `+350s` | continuity sidecar rejected as stale source |
| `+365s` | relationship sidecar rejected as stale source |
| `+384s` | crew sidecar rejected as stale source |

Response evidence:

- response kind: `committedOutcome`
- response strategy: `directivePosted`
- response host message id: `32`
- response posted: `2026-06-28T05:56:08.183Z`, about `+171s`
- assistant chat row `33` send date: `2026-06-28T05:56:07.090Z`

Interpretation:

Turn 31's visible delay was not mostly save I/O before the response. The dominant pre-response cost was the `narration` model call: about 96.5 seconds by itself. There was still about 23 seconds between classifier completion and narration start, plus about 19 seconds between narration completion and posted response, where mechanics commit, prompt/sync, response ledgering, and full-save persistence are plausible contributors.

After the response posted, a player edit invalidated the source. The pending post-turn work kept running. The stale-source guards correctly rejected sidecar applications later, but the system still spent provider and persistence time on work that had already become stale.

## Turn 31 Edited Retry

After the edit, a second ingress for the same host message id appeared. A later stable ledger read showed:

- Directive ingress: `hostMessageId: "31"`, text hash `387f8f73`
- received: `2026-06-28T05:58:47.669Z`
- classified: `2026-06-28T06:00:47.431Z`, about `+120s`
- classification: `sceneColor`
- strategy: `injectAndContinue`
- status at audit read: `classified`

No response or sidecar records for the edited retry were present at the audit read. This looks like in-flight or incomplete handling rather than a complete turn. The older recovery records still reference the original edited ingress.

## Edit-Recovery Loop Finding

The edited player message added:

> Sam waited for her reply.

The live transcript contained exactly one row with that phrase:

- chat row `32`: edited player message, `hostMessageId: "31"`, current text hash `387f8f73`
- chat row `33`: the old assistant response generated from the pre-edit text hash `524caba2`

The save therefore had two records for the same host message id:

| Ingress | Text hash | Status | Strategy | Meaning |
| --- | --- | --- | --- | --- |
| original `hostMessageId: "31"` | `524caba2` | `recoveryRequired` | `directivePosted` | already committed a Directive-owned outcome, then was invalidated by the edit |
| replacement `hostMessageId: "31"` | `387f8f73` | `classified` | `injectAndContinue` | reobserved the edited text as if it were a live turn, but never recorded a response delegation or completion |

This is evidence of possible over-engineering in the turn architecture. A single user action, editing one prior player row, activates several partially independent systems:

1. Message reconciliation marks the original committed ingress as `recoveryRequired` and records `playerMessageEdited`.
2. Scene Handshake invalidation records `sceneHandshakeSourceInvalidated`.
3. Old post-turn work continues and later rejects sidecars as stale source.
4. The edited text is reobserved as a fresh ingress.
5. The classifier changes the edited text from `consequentialCommand` to `sceneColor`.
6. Because `sceneColor` maps to `injectAndContinue`, the orchestrator attempts to hand the scene back to host generation.
7. The chat tail is already an assistant row from the invalidated pre-edit outcome, so normal host continuation is not a coherent operation.

The architecture has many correct local guards, but their combination creates an unstable product behavior: review-required state remains open, a replacement ingress is stranded at `classified`, and UI/runtime activity can appear to circle through review again.

The simpler product rule should be: if a player edits a message that already has a dependent assistant response after it, do not re-enter the normal turn pipeline. Route the edit to explicit reconciliation, rollback, or dependent-row replacement. Only reobserve the edited player message as a live `injectAndContinue` turn when it is still the latest chat boundary.

## Optimization Candidates

1. Keep `runtimeTracking` compacted in stored turn-ledger deltas, and continue auditing the remaining live `runtimeTracking.history` root for 5000-message scale.
2. Keep sidecar generation batched, but apply accepted same-batch sidecar results with one state transaction, one prompt rebuild, and one durable journal/save where possible.
3. Move `missionDirectorAdvisor` off the blocking `injectAndContinue` path for counsel turns, or make it opportunistic background work.
4. Shorten or defer Scene Handshake provider waits when deterministic evidence suggests the prior host-native scene is low risk.
5. Coalesce ingress/response state transitions into fewer full-save writes before visible response handoff.
6. Cancel or suppress queued post-turn work when the source ingress becomes edited/deleted/replaced, not only at apply time.
7. Collapse edit recovery into one explicit branch: review/reconcile dependent assistant rows, rollback, or replace dependent rows before any retry, instead of combining review-required recovery with automatic reobservation.
8. Consider compact JSON writes for live save payloads after the structural duplication is fixed.
