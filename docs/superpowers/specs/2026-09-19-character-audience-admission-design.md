# Proposed audience-admission gate

**Approved design:** one independent pre-actor audience check covering current perceptions **and selected archive grants**. Ordinary protected turns gain **one model call**, within the existing ten-attempt protected budget. This protects actor-input admission; the existing final-output reviewer remains mandatory. Model judgment can still be wrong: this is stronger containment, not a guarantee against omniscience.

Approved by the user, who explicitly authorized continued work without further approval questions. Implementation follows the companion plan; this specification does not claim implementation or provider qualification. Source inspected in `C:/Users/Keptin/.codex/worktrees/directive-live-soak/Directive`.

## Why this boundary

The offline audit moves only Nayar's valid private 22:43 perception entry to Whitaker. Production continuity/admission validation accepts it and the packet compiler gives Whitaker 22:43. Quote membership proves source custody, not the recipient's access. A final reviewer may reject publication, but that happens after the wrong actor already receives the private text.

Archived `addFact.informationAccess` has the same trust issue: persisted recipient IDs plus valid statement/audience quotations are currently sufficient for packet admission. Checking only current perceptions leaves that path open.

## Recommended design

1. **Prepare without dispatch.** Freeze the exact archive/perception candidates selected for every planned actor, required dependency/correction closure, presence and outgoing response routes. No character provider call can run yet.
2. **Build one access manifest.** Each runtime-generated entry binds recipient, acquisition/channel, origin (scene perception or archive event), statement source identity/offsets/quote, and audience evidence. Include channel/presence entries needed by the causal plan. Historical statements use `event.sources[0].evidenceQuote`, never analyst summaries.
3. **Resolve complete evidence.** Supply the independent checker the complete selected current source pair and complete historical statement/audience sources, with original accepted-pair context where needed to interpret speaker, sending versus drafting, visibility and timing. Deduplicate by exact identity. Raw evidence stays private to the checker.
4. **Check independently.** The continuity analyst remains the proposer. A separate isolated utility request approves the exact manifest or rejects it; it cannot add recipients, rewrite evidence, repair grants or return a reduced subset. Check directly addressed request/channel/confidentiality completeness too, so a message-opening fragment cannot stand in for its omitted actionable request.
5. **Enforce a runtime capability.** A strict receipt parser verifies manifest/evidence/identity digests, complete coverage, verdict and entry-bound findings. Only then issue an ephemeral capability bound to the prepared candidate set. Require it at packet compilation and before every actor dispatch, including repairs. A caller boolean or model-authored grant list cannot substitute for it.

Missing, malformed, incomplete, rejected, stale, timed-out or canceled preflight means **zero actor calls**. No automatic format retry, semantic retry, fallback route, re-proposal or reasoning-only continuation. The existing final scene review and publication guard remain unchanged in purpose.

## Custody, archive coverage and semantics

Bind approval to chat/save/branch/binding, source message and selected-swipe IDs, canonical complete-text hashes, state revision/digest, provider configuration, generation epoch, actor plan/admission digest, selected archive event/closure digests and policy version. Use existing `captureV1StorySource` normalization, not raw UI text or a similarly named current swipe.

Resolve historical source texts through captured messages and existing episode contributions/accepted-pair receipts. An identity alone is not missing discourse context. If necessary original context cannot be recovered unambiguously, fail closed before dispatch. Do not replace it with a clipped quotation, summary, biography or the grant being checked.

The gate checks archive grant **use**, including newly settled and historical `addFact` records; it does not retroactively rewrite history. Every selected unchecked archive grant is reviewed each turn. This closes the protected actor backdoor without adding a persistent knowledge silo. Legacy-mode `createCharacterInformationProjection` remains outside this guarantee; certifying grants before settlement for every consumer is a broader separate design.

Receipt of speech is access to a claim, not truth or belief. Preserve mistaken/partial/outdated statements and character-accessible correction history. Reject unsupported claim-to-world-fact upgrades; do not silently relabel stored authority on approval.

Written replies use an explicit `message` contribution kind with admitted `read` recipients; speech uses `heard` recipients and visible actions use `observed` recipients. Existing persisted speech/action syntax remains valid. Narration and final review preserve the written channel.

Ordered same-reply exposure derives only from a real validated contribution's exact text, prechecked outgoing route, recipient subset and causal position. Runtime enforces those dependencies without another audience call. No backdating, invented relay, early independent reaction or recipient enlargement. Repair invalidates descendant exposure. Later packets may use only the prechecked archive/perception set plus those ordered contributions; they cannot select an unreviewed archive item after approval.

## Trusted metadata and limits

Trusted host span metadata could discharge covered entries deterministically: exact source hash/offsets, recipient, acquisition, channel and visibility order. Hard host exclusions always prevail. If all entries are covered, no semantic call is needed; partial coverage still requires one check. Current source assembly sets protected `explicitAudience: {}` and supports only whole-slot restrictions. These cannot distinguish private text from public speech in the same message. Model-generated span grants are not trusted host metadata.

Existing bounds differ: analysis request context defaults to 48,000 characters, continuity quotation 240, scene-admission quotation 320, actor packet 12,000 characters/conservative UTF-8 estimate, 128 records, three actors/four responses/two rounds; admission records also have a 32,000-character bound. Validate the **complete preflight envelope**, including instructions/schema and all necessary evidence, against the configured request-character ceiling and a route-bound configured context allowance. The native isolated provider API does not certify actual remote model capacity or expose a route-specific tokenizer; use the exact selected profile's saved preset context limit, the resolved output reservation, and a documented conservative UTF-8 envelope estimate plus framing. Missing/malformed route-specific capacity fails explicitly. A valid receipt permits progression but does not prove the remote service never truncated internally. This is the approved implementation qualification of the original actual-provider-capacity requirement. Individually valid source messages do not imply their combined request fits.

If necessary evidence does not fit, return a distinct capacity failure. Do not trim full sources, omit qualifiers/audience evidence, remove troublesome grants or drop legitimate required knowledge to make checking pass. Existing optional archive retrieval remains explicitly partial **before** manifest freezing. The gate cannot silently shrink that selected set. No automatic chunking into extra model calls.

## Calls, reservations and lifetime

Create one shared `createTurnAttemptBudget` instance for preflight, actors, narration and final review. Reserve the one preflight attempt and existing finalization attempts, and require enough capacity for initial actor calls before sending anything. Normal initial cost becomes N+3; four character calls consume seven of ten. Existing repair proceeds only if the remainder suffices. Worst-case actor repair may not fit; fail safely rather than raise the ceiling. Update settings feasibility from character calls+2 to +3 on the semantic path.

Ensure the preflight's **physical transport** cannot retry: use a single-use reservation and an explicit one-send policy if transport otherwise retries. Caller-level absence of a loop is insufficient. Release reservations idempotently on every failure/Stop path. Global qualification request/token/time caps still count this extra physical call and never reset. The current ten-attempt budget starts after earlier accepted-pair analysts; this design does not falsely claim to bring those preceding calls inside it.

Do not cache initially. Any future cache must be ephemeral and bound to the complete identity above, invalidated by Stop, source/state/settings/plan changes or disposal. Persist no copied-source store or independent grant ledger. Failure UI should say access could not be verified; it must not claim the character is ignorant. Explicit user Retry starts a new bounded attempt.

## Exact integration map

| File / function | Proposed change |
| --- | --- |
| `src/runtime/v1-mission-runtime.mjs` / `captureAcceptedPairAnalysis` | Preserve selected-pair custody; proposals remain unverified audience suggestions. |
| `src/story/story-director.mjs` / `parseFocusedStoryOutput`, `parseContinuityAnalystOutput`, `validateInformationRecipients` | Retain structural checks; do not treat them as independent semantic admission. |
| `src/story/character-scene-admission.mjs` / creation/materialization functions | Supply manifest entries for perceptions, presence and outgoing channels. |
| `src/story/continuity-events.mjs` / `payloadFor`, event construction | Reuse statement and `informationAccess.audienceSources` custody; no new archive. |
| `src/runtime/character-runtime-snapshot.mjs` / `createCharacterRuntimeSnapshot` | Add immutable source-text resolution for selected archive evidence; currently retains identities. |
| `src/story/character-knowledge.mjs` / `createCharacterKnowledgePacket`, `selectCharacterRecords`, `admitProvisionalExposures`, `compileCharacterPacket` | Expose deterministic preparation; require approved coverage for selected archive/perception entries and preserve mandatory closure. |
| `src/runtime/character-scene-coordinator.mjs` / `createFlight`, `packetFor`, `run` | Separate preparation/dispatch; require matching capability; constrain subsequent packets to approved candidates plus ordered exposure. |
| `src/runtime/protected-character-turn.mjs` / `prepareProtectedCharacterTurn` | Own gate orchestration, shared reservations, failure cleanup and diagnostics. |
| New `src/story/character-audience-admission.mjs` | Focused manifest/checker/receipt contract, no mutable global grant store. |
| `src/generation/generation-roles.mjs`, `isolated-request.mjs`; host `provider-client.mjs` / `generate` | Register an isolated utility audience-review role using existing connection settings; enforce one physical send. |
| `src/providers/character-knowledge-settings.mjs` | Adjust initial feasibility without exceeding ten attempts. |
| `src/runtime/runtime-app.mjs` / protected opening, normal/regen, continuation paths | Traverse gate for every entry path; continuation's replaced source invalidates previous approval. |

## Alternatives

Same-proposer self-check can repeat the same mistake. Whole-message exclusion breaks mixed channels. Final review protects output too late for actor-input isolation. Trusted host spans are preferable but unavailable today. Adding independent audience derivation to an existing parallel analyst might reduce latency, but requires broader role/schema/reconciliation changes and must also cover selected historical grants; a checker cannot review an exact manifest before that manifest exists. Defer that alternative.

## Acceptance before deployment

- Production adversarial fixtures: correct quote/wrong scene recipient; the same attack in persisted and provisional addFact grants; missing historical certification; later unapproved archive injection. Checker rejection must yield zero actor calls. Valid controls retain legitimate Nayar 22:43/Whitaker 21:17 knowledge.
- Custody attacks: forged capability, stale async pass, changed swipe/hash/branch/state/settings, swapped actor or route, omitted entry and modified plan. No dispatch; host denial cannot be overruled.
- Semantics: mixed private/public channels, draft versus sent message, sleeping/departed listener, audio without vision, private thought, indirect quote, confidentiality outside selected excerpt, received lie and undisclosed correction. Full necessary evidence reaches the checker; none reaches unrelated actors.
- Capacity and failure: unavailable historical context, oversized complete envelope, missing/malformed/reject verdict, provider empty/reasoning-only/limit/timeout, Stop and late response. No silent evidence removal or retry; required closure remains intact.
- Causal/operational: ordered relay and repair invalidation; exactly +1 physical call on semantic path; zero extra call under complete trusted spans; reservations/global stage caps; opening, normal, regenerate, continue, explicit Retry, reload and publication recovery. Existing final rejection must still block publication.
- Bounded live qualification: independently labeled benign/malicious manifests from real captures, both scene and archive attacks, mixed channels and long context; agreed repeat matrix, recorded prompts/responses, route/model, usage, latency and every failure. Then representative complete turns through final publication. Mocked verdict tests prove runtime enforcement, not semantic accuracy. Token-exhausting routes remain unqualified; existing stage caps/deadlines are unchanged.

## Authorization and execution

The user approved this written design and explicitly instructed that no more approvals be requested. That authorization supersedes the skill's additional plan-approval pause. Continue with the companion implementation plan and routine implementation choices; preserve the stated budgets, containment requirements and qualification limits. The design itself makes no claim of implemented or live-verified behavior.