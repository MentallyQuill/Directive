# Story call architecture investigation

Date: 2026-09-08. This document records the pre-implementation investigation. See the subsequent design and validation documents for the implemented architecture.

The subsequent [design spec](../superpowers/specs/2026-09-08-parallel-story-director-design.md) and [implementation plan](../superpowers/plans/2026-09-08-parallel-story-director.md) define the concrete proposed contracts and supersede tentative engineering choices in this assessment.

## Recommendation

Evolve the checkpoint episode evaluator into an ongoing story director. Run it alongside the existing accepted-pair interpreter, reconcile their typed proposals in code, then let SillyTavern generate the next narrative response. Retain evidence interpretation, player participation recognition, and authoritative time custody outside creative direction.

This requires changes to contracts, scheduling, persistence, and prompt assembly, not just rearranging prompt paragraphs. It provides next-turn containment of generated additions, not prevention of their first appearance or a guarantee of prose correctness.

## User decisions following the assessment

- Let the narrator improvise under the supplied direction. Do not introduce a model review before showing each generated response, and do not require permission popups for story additions. Mostly local consequences are a desired tendency, not a promised pre-publication restriction.
- Review the selected narration when the player next responds. Preserve compatible developments and the player's decisions; direct subsequent play so generated complications do not expand without purpose. This does not make every generated claim an authoritative mission rule.
- Respect sustained player interest in diversions. Keep authored opportunities available where consistent with elapsed time and campaign rules, and offer occasional natural reminders rather than forced returns. Nudges should use established people, commitments, and opportunities, not invent an emergency to end the diversion.
- Narration must wait for valid interpreter and director results. A director timeout or failure cannot permit narration using stale or conservative fallback direction. Technical failure recovery is separate from approval of story choices and should use ordinary turn status/retry controls, not an immersion-breaking permission workflow.
- New NPC biographies should ideally not delay narration. Deferred or overlapping enrichment remains a design option, not a finalized scheduling decision. It must preserve accepted identity and public facts and cannot make a late biography silently contradict intervening play.

These decisions replace the assessment's earlier recommendation to continue narration conservatively when the director is unavailable.

## Evidence and scope

Inspected the interpreter and evaluator prompts, their schemas and validators, narration context, settlement paths, scene-pacing authorization, episode scheduling, dossier authoring, and generation transport. Source and installed default-user copies matched by SHA-256 for `runtime-app.mjs`, `v1-mission-runtime.mjs`, `accepted-pair-interpreter.mjs`, `episode-evaluator.mjs`, `scene-pacing.mjs`, and `provider-client.mjs`.

No provider requests, gameplay actions, runtime edits, or save mutations were performed. The analysis does not establish live concurrency, latency, or model quality. The pre-existing `debug.log` modification is unrelated.

## Current responsibilities

| Component | Input | Output and authority | Cadence |
| --- | --- | --- | --- |
| Accepted-pair interpreter | Full previous assistant/current player text; closed mission/ship-work/Cohesion candidates; time context; known people; authored participation requirements when available | Assistant acceptance, quoted evidence selections, People observations, elapsed-time proposal, participation and player intent. Runtime validates and commits effects. | One request for a new ordinary accepted pair; cached results may be reused. |
| Episode evaluator | Committed working capsule, bounded excerpts, visible effects, People evidence, relationships, reference IDs, two recent sealed summaries | Continue/seal/abstain; replacement memory; foreground question; relationship posture/open matter; defining moments on seal. Runtime may persist these into Story Settlement. | Pending checkpoint, normally after narration; default eight contributions. |
| Narrator | Native chat history and model/preset plus Directive's player-safe state, time, People, ship mechanics, story memory, scene-pacing permissions, authored opening/transition/report instructions | Player-visible prose. It becomes eligible for settlement when the next player response accepts it. | One normal host generation. |
| People dossier author | Newly materialized named introductions and public campaign/ship context | Plausible public biographical details, mapped to accepted identities | An additional batch request when the interpreter introduces people; awaited before pair settlement finishes. |

The earlier conversational count omitted the conditional dossier request. Normal gameplay is two calls, plus up to one dossier batch and one due episode review: potentially four logical calls before recovery/replay or exceptional host behavior. Eight accepted contributions are roughly four ordinary exchanges, not a guaranteed review interval. Hard boundaries can seal deterministically.

The opening director, character creator, and regenerations are separate paths. They must eventually honor the same authority policy but should not be counted as normal per-turn overhead.

### Interpreter observations are not all director work

The interpreter already observes mission evidence, ship work, Cohesion, time, People, and scene participation. Claims and People observations share a four-selection durable budget; time and pacing have separate output sections. The configured output ceiling is 8,192 tokens, not measured usage.

Participation and explicit player intent are safety-critical observations. `settleScenePacing` and `gateScenePacingClaims` use their receipts to prevent premature objective completion. Moving them wholesale into a creative role would mix evidence recognition with preferred story direction. Keep these observations in the interpreter; extract their embedded instructions about future pacing into runtime/director responsibilities where possible.

### The evaluator is more than a summarizer

Its relationship proposals can become durable effects. Defining moments are source-bound and restricted to meaningful seals. Those behaviors must survive any replacement.

Its prompt does not receive a campaign-wide authored reference: the request carries reference IDs and bounded story evidence, not enough campaign content to judge all departures from authored material. It is not currently a general director or canon reviewer.

### Narration has substantial implicit decision-making

The narrator receives many static directives and scene-pacing permissions, but no ongoing director plan. It realizes situations, fills missing detail, and describes results. The packet forbids invented deadlines/conditions while also declaring visible chat canon. That combination does not distinguish an established utterance from an authorized world constraint.

The current scene-pacing context can be null for definitions without authored pacing requirements. A global continuity/director policy must operate even in those cases, during downtime, at transitions, and in player-led detours.

## Proposed ownership

| Concern | Owner |
| --- | --- |
| Acceptance/rejection of the previous reply; quoted player intent and participation | Interpreter |
| Mission, time, ship, Cohesion and public People evidence | Interpreter proposes; runtime validates |
| Current focus, unresolved threads, containment, a bounded next-beat recommendation | Director |
| Episode memory, qualitative relationship synthesis, defining moments | Director's retrospective section, replacing evaluator work |
| Objective availability/completion, clock arithmetic, report/transition authorization | Deterministic runtime |
| Exact identity, visibility, evidence lineage, effect permissions and persistence | Deterministic runtime |
| Dialogue, description, characterization and natural realization of permitted actions/results | Narrator |

The director must not invent completed outcomes to make its preferred next beat possible. The narrator still needs room to realize outcomes under supplied rules; asking it to only restate already-committed events would prevent gameplay from progressing.

## Parallelism and the real dependency

At player reply N, capture an immutable pre-settlement snapshot R and the exact pending pair: assistant N-1 and player N.

1. Interpreter analyzes that pair against R.
2. Director runs concurrently on R, authored guardrails, active continuity, and the same explicitly provisional pair.
3. Code validates both outputs against their original source envelope, prepares the accepted state, filters director proposals against it, and commits a coherent result.
4. Prompt assembly exposes authoritative state, approved continuity and valid direction to the narrator.

The director cannot consume effects the concurrent interpreter has not produced. Do not hide this with a shared mutable state object or silently rewrite revision numbers to make proposals pass.

Recommended initial contract:

- **Retrospective review:** summarize and update relationships only from already-committed evidence in R. Run this subsection only when an episode checkpoint is pending. It may therefore reflect the newest pair on a later turn. That bounded lag is the tradeoff for clean parallelism.
- **Continuity observations:** identify additions in the pending pair with exact source anchors and provisional status. Promote only the supported subset after acceptance and rule validation. A remembered character claim is distinct from a world fact; a generated continuity fact is distinct from an authored mission rule.
- **Prospective direction:** propose a small next-beat instruction, using explicit prerequisite references. Code enables it only if the newly settled state and player intent satisfy those prerequisites. If the mission changes, source-mission directions cannot follow the player into the successor automatically.

Current episode review validates against the exact current request, checkpoint, and revision. It cannot simply be called in parallel and applied after settlement under its existing API. The new transaction must validate retrospective review against captured R, then compose it with the new pair while preserving source custody and hard-boundary ordering. Attempt metadata that changes revisions must be recorded before snapshot capture or handled without making the snapshot stale.

Fresh prose must remain available for immediate narration continuity even when durable episode summaries lag. The director's pending-pair access is not permission to summarize rejected prose into permanent memory.

## Prompt revisions

### Interpreter

Purpose: "Report what this exchange supports, using supplied candidates and exact evidence. Observe player intent; do not choose the story's direction."

Keep acceptance, evidence quotes, source roles, closed candidate sets, time interpretation, People observations and participation. Preserve the rule that current player prose establishes attempts/intent, not successful world outcomes. Keep model output budgets separate from proposed story-director fields.

### Director

Purpose: "Maintain coherent story continuity and propose the next focus within authored constraints and observed player agency. The pending exchange is provisional; runtime decides its acceptance and effects."

Use separate typed sections for provisional continuity, next-beat direction, and optional retrospective episode review. Memory must describe past evidence; direction must describe a future opportunity. Never store a proposed future as a fact.

Supply compiled authored constraints and available opportunities, not only mission IDs or summaries. Separate private constraint checks from player-safe narration guidance. Do not expose hidden future facts through free-form guidance. Representation of authored guardrails is real content work: code cannot enforce constraints that are absent from its contract.

Limit active generated obligations and their cumulative demands. Do not expire unresolved promises merely to keep the prompt short; archive resolved records and preserve unresolved records with retrieval. Encourage resolution without erasing costs or forcing a player departure.

### Narrator

Purpose: "Respond to the player and realize the reconciled scene within supplied permissions. Preserve established continuity and the player's control."

Replace the blanket chat-is-canon instruction with an explicit authority ordering: authored/runtime rules and accepted state; approved continuity; provisional chat details; optional direction. A director suggestion cannot override player intent or runtime constraints. A normal in-character response does not authorize new campaign rules.

Keep viewpoint, identity, knowledge, opening, transition, report, and ship-mechanics contracts. A validated report segment remains verbatim; a director cannot paraphrase away its custody requirement. Do not duplicate these rules in competing prompts with different ownership.

## Reconciliation is code, not another model

It validates branch/save identity, package version, source hashes and snapshot revision; applies acceptance and pacing gates; evaluates allowed effects and prerequisites; then constructs the narration packet. Director contradiction flags should reference exact source spans and known policies, allowing implicated proposals to be withheld without discarding unrelated valid interpretation.

This is not a general semantic truth engine. Quote validity alone does not establish authored support. Detecting some narrative contradictions remains model judgment, and provisional prose remains visible before review. The achievable claim is stronger containment with explicit authority, not elimination of all hallucinations.

Interpreter and director failure both block the next narration until required results are valid. A timeout ends a failed request, not the requirement for direction. Preserve reusable successful results under the exact source/snapshot envelope, surface the failed analysis through ordinary turn status, and retry the failed work without automatically regenerating the successful analysis. Do not introduce indefinite automatic retries. No stale plan, missing director result, or conservative fallback may release narration. Independent output sections need validation that does not let a malformed optional memory update corrupt mission settlement; the exact treatment of an invalid optional section needs a defined contract before implementation.

Cancelled or stale work cannot attach to another swipe, branch, or save. Cache by source identity and contract/snapshot version; retry persistence using validated results rather than reissuing both model requests.

## Call count, latency and the dossier dependency

Replacing the episode evaluator with an every-turn director yields three ordinary logical calls: interpreter and director concurrently, then narrator. A checkpoint review becomes an optional output section in the same director request, not a fourth review call. This increases frequency and token cost relative to the current occasional evaluator.

The dossier author remains a potential additional sequential request. It currently depends on identities discovered by the interpreter. Work for an already accepted introduction can run alongside a later turn's analysis. Work for an introduction in the current pending pair cannot start from its finalized identity until interpretation provides it; it may then overlap the remaining director time. To guarantee that it does not delay narration, full enrichment would have to be deferred beyond the narration gate, with late results validated against current public facts and source lineage. Background enrichment must not invalidate the active interpreter/director snapshot; stage its result and merge at a controlled boundary. Deferred enrichment is proposed, not yet a settled choice. Do not silently remove the feature or add full biography writing to the director merely to claim a fixed three-call budget. Its prompt intentionally permits plausible public details, so it belongs in the expansion-policy audit too.

Without a dossier request, preparation approaches max(interpreter, director) plus reconciliation overhead. With the existing dossier dependency it approaches max(interpreter + dossier, director), provided director work remains in flight. These are dependency models, not measured timings.

The generation client offers concurrent batching and its ownership wrapper uses a counter, not a serialization lock. Provider requests have request-local controls. This supports feasibility but does not prove overlap through every native provider route, shared sampler behavior, rate limits, cancellation or UI activity tracking. Verify those in the actual host before claiming performance.

## Alternatives considered

1. Add all continuity/direction fields to the interpreter: cheapest call count, but expands an already broad evidence role and shares failure/output pressure. Not recommended for this broader redesign.
2. Add a director while keeping the evaluator permanently: simpler migration, but overlapping story context and an extra conditional request. Useful only as a temporary measured transition.
3. Replace the evaluator with the parallel director and bounded retrospective subsection: recommended, with explicit memory lag and transaction redesign.

## Required proof before integration

- Preserve existing time, People, mission evidence and scene-participation regression behavior. In particular, next-turn direction cannot retroactively authorize the previous response's premature completion.
- Verify pleasant generated encounters survive, while unsupported dependencies, escalating obligations and cumulative diversions are constrained across multiple missions and definitions without pacing metadata.
- Verify rejected/swiped/edited prose cannot enter memory or authorize effects; player-led departures remain possible.
- Verify retrospective summaries, relationship updates, defining moments, checkpoint and hard-boundary behavior survive the scheduling change.
- Verify one result cannot overwrite newer state; transition, branch, reload, cancellation and independent provider failures have deterministic outcomes.
- Verify neither a timeout nor a failed director request releases narration; a successful parallel result can be reused on retry only while its exact source/snapshot remains valid.
- Verify diversions require no permission popups, player interest is respected, and reminders reuse established opportunities without manufacturing a new emergency.
- Capture actual request start/end times, token usage, physical attempts and time to first visible narration. Measure concurrency and overhead rather than relying on Promise.all or configured budgets.
- Exercise source-to-installed parity and the normal SillyTavern workflow in an explicitly scoped disposable campaign. Do not modify the user's active Sam Vickers save as part of this assessment.

## Source map

- `src/mission/v1/accepted-pair-interpreter.mjs`: schema, prompt, evidence checks, source acceptance, output limits.
- `src/narration/scene-pacing.mjs`: observed participation, permissions, completion gates and report/departure rules.
- `src/story/episode-evaluator.mjs`: committed review input, memory/relationship output, evidence validation.
- `src/runtime/v1-mission-runtime.mjs`: interpretation, conditional dossier call, settlement and checkpoint-review orchestration.
- `src/runtime/v1-state-spine.mjs`: authoritative commit, hard boundaries, review validation and relationship effects.
- `src/runtime/runtime-app.mjs`: native generation handoff, narration packet, queues and generation-end review scheduling.
- `src/projection/v1/prompt-projection.mjs`: bounded working and sealed story memory projections.
- `src/people/people-dossier-author.mjs`: intentional public biography generation and its schema.
- `src/hosts/sillytavern/generation-client.mjs` and `provider-client.mjs`: concurrency entry point, routing and transport.
