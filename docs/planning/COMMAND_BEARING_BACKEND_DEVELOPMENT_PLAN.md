# Command Bearing Backend Development Plan

## Status

This is the backend implementation plan for making Command Bearing evidence, arc-end Mark Review, Readied point spends, and player-facing relationship perceptions real in Directive state.

It depends on [Command Bearing System](../design/COMMAND_BEARING_SYSTEM.md), [Command Bearing User-Facing System Plan](COMMAND_BEARING_USER_FACING_SYSTEM_PLAN.md), [Player Character Page And Crew Tabs Plan](PLAYER_CHARACTER_PAGE_AND_CREW_TABS_PLAN.md), [Crew And Relationship Model](../design/CREW_AND_RELATIONSHIP_MODEL.md), and [Model Call Robustness Pass Plan](MODEL_CALL_ROBUSTNESS_PASS_PLAN.md).

The phased multi-agent build plan for this backend work and its UI dependencies is [Command Bearing Agent Execution Plan](COMMAND_BEARING_AGENT_EXECUTION_PLAN.md).

Directive is pre-alpha, so this pass should update the current `commandStyle` implementation in place toward `commandBearing`. Do not preserve legacy naming, pause-first intervention behavior, or old Command Bearing award shortcuts when they conflict with the new backend contract.

## Goal

Build the backend systems that let Directive:

- record player-safe Command Bearing evidence during meaningful committed turns;
- wait until arc, chapter, quest, thread, or Command Crucible closure before awarding permanent Command Marks;
- review accumulated evidence and award Inspiration, Resolve, or no Mark through committed mechanics;
- support Readied point spends without hidden prompt bias;
- validate every model-produced Command Bearing proposal before it can mutate state;
- produce player-safe relationship perception records without exposing hidden relationship values;
- project the resulting durable record to Assist and the new Character page.

The player-facing result is covered by the other two planning docs:

- Assist shows banked points, fit checks, and Readied point controls.
- Character shows Command Bearing rank, marks, banked points, evidence, Mark Reviews, spends, recovery, and player-perceived relationship changes.

This backend plan owns the authoritative state, model-call contracts, transaction ordering, validation, idempotency, and tests behind those surfaces.

## Related Plan Ownership

- [Command Bearing User-Facing System Plan](COMMAND_BEARING_USER_FACING_SYSTEM_PLAN.md) owns Assist controls, pre-send fit checks, Readied point copy, user-facing refund rules, and controlled narration expectations.
- [Player Character Page And Crew Tabs Plan](PLAYER_CHARACTER_PAGE_AND_CREW_TABS_PLAN.md) owns how player identity, Command Bearing evidence, Mark Reviews, banked points, relationship perceptions, and service-record material appear in the Crew drawer's Character tab.
- [Command Bearing Agent Execution Plan](COMMAND_BEARING_AGENT_EXECUTION_PLAN.md) owns phased multi-agent sequencing, worker lanes, integration freezes, and build verification order.
- This backend plan owns the state model, evidence/review ledgers, closure detection, Mark Review calls, relationship perception records, Readied spend transactions, projection contracts, migration, and verification.

## Current Reality

Directive already has some Command Bearing plumbing, but not the evidence/review system.

Implemented today:

- specific action resolvers can attach `commandDecisionAwards` directly to an outcome, such as Hesperus accountability or the initial convoy posture in [action-resolver.mjs](../../src/adjudication/action-resolver.mjs);
- [state-delta.mjs](../../src/mission/state-delta.mjs) converts those awards into `commandStyle.earnedRecordsAdd` and `commandStyle.awardedDecisionIdsAdd`;
- [transaction-state.mjs](../../src/campaign/transaction-state.mjs) applies the delta and calls `applyCommandMarkAwards`;
- [command-bearing.mjs](../../src/command/command-bearing.mjs) tracks ranks, marks, point caps, recovery, spend eligibility, and two-tier outcome improvement;
- [story-arc-director.mjs](../../src/story/story-arc-director.mjs) can complete milestones and arcs;
- [director-coordinator.mjs](../../src/directors/director-coordinator.mjs) processes quest/world boundaries and reports milestone changes;
- [thread-ledger.mjs](../../src/threads/thread-ledger.mjs) stores hidden thread evidence and closure reviews;
- [campaign-sidecar-scheduler.mjs](../../src/jobs/campaign-sidecar-scheduler.mjs) already has a `commandBearing` sidecar lane, but it currently owns only command-style and command-culture observations.

Missing today:

- no `commandBearing.evidenceLedger`;
- no `commandBearing.reviewLedger`;
- no per-turn Command Bearing evidence collector;
- no closure detector that asks Command Bearing to review evidence;
- no arc/chapter/thread/quest-end Mark Review;
- no player-facing relationship perception ledger;
- no backend projection for the Character page's Command Bearing evidence/review sections;
- no controlled Readied-spend runtime replacing the old pause-first intervention path.

The current direct-award path should be treated as transitional. It proves that marks and spend helpers work, but it bypasses the evidence-first design.

## Core Backend Decisions

### Evidence Is Not A Mark

Per-turn systems may create Command Bearing evidence. They must not award permanent Marks by themselves.

Evidence records answer:

- what did the player character do?
- what visible cost, consequence, or change followed?
- which Command Bearing style did the action express?
- did the action show Agency, Commitment, and Causality?
- which arc, quest, thread, or decision might this evidence belong to?

Mark Review answers:

- did enough meaningful evidence accumulate by closure?
- which track, if any, was decisive?
- should one permanent Command Mark be awarded?
- did the Mark change rank, cap, or reserve behavior?

This distinction prevents per-message XP farming while still making the player's command history visible.

### Closure Triggers Review

Command Marks should be reviewed only at meaningful closure:

- a quest resolves;
- a story arc completes a milestone or reaches complete status;
- a narrative thread resolves or transforms;
- a chapter transition occurs;
- a Command Crucible closes;
- a package-authored review trigger fires.

Ordinary consequential turns can add evidence. They do not grant a permanent Mark unless the turn itself is explicitly a Command Crucible closure.

### Closure Detection Uses Hybrid Authority

Closure detection should be hybrid:

- the existing per-turn Utility classifier may flag a possible closure;
- deterministic committed state must prove that closure happened;
- Mark Review runs only when there is both proven closure and relevant open evidence.

The Utility model is useful for detecting soft language such as `we wrap up`, `time passes`, `after the debrief`, or `chapter ends`. That signal should help schedule or prioritize follow-up work, but it must not be treated as authoritative. A model can detect vibes; committed state confirms closure.

The authority order is:

1. committed quest/thread/arc/chapter state;
2. package-authored closure or Command Crucible markers;
3. deterministic closure planner;
4. Utility closure candidate signal;
5. Mark Review model call only after steps 1-3 prove the review target.

If the Utility classifier suggests closure but committed state does not prove closure, record diagnostics or `reviewPending` only. Do not award a Mark.

### Robustness Without Extra Calls

Most closure robustness should be deterministic and should not add model-call cost:

- stable closure ids;
- one-review-per-closure idempotency;
- evidence source references;
- closure-source validation;
- schema validation;
- hidden-output rejection;
- duplicate-award protection;
- stale evidence handling after edits/replays;
- confidence thresholds;
- conservative no-award fallback.

The only model-call cost additions should be:

- no extra call for closure candidates when the field is added to the existing Utility classifier;
- optional evidence collection through the existing `commandBearing` sidecar lane;
- sparse Mark Review calls only when proven closure plus relevant evidence exists;
- optional second-pass review only for low-confidence or high-impact closure reviews.

Do not add a standalone model call whose only job is basic closure detection unless deterministic state and the existing Utility classifier have proven insufficient.

### Deterministic Code Commits Mechanics

Model calls may classify, summarize, and propose structured records. They do not directly mutate state.

Deterministic code must:

- validate every structured output;
- reject hidden leaks and unknown labels;
- enforce one-review-per-closure idempotency;
- enforce one-award-per-source protection;
- apply point spends, evidence records, reviews, and Mark awards transactionally;
- preserve pre-commit and post-commit failure boundaries.

This is the safety boundary that lets the feature ship as one pre-alpha swing. We can ask models for judgment, but code owns whether that judgment is admissible, linked to real sources, safe to show, and mechanically legal.

### Relationship Perception Is A Separate Projection

The relationship evaluator may update hidden relationship state, but the Character page should not display hidden values or private NPC thoughts.

When a relationship or reputation shift occurs, the backend should also produce a player-safe perception record:

- what the player character could plausibly notice;
- the visible dimension, such as professional confidence, integrity trust, or personal rapport;
- the qualitative impact label;
- a short cue and consequence summary.

This record is displayable. The hidden relationship delta is not.

### Readied Spending Uses Committed Outcome Packets

Readied point spending should not be a prompt-only boost.

The backend must:

- attach the readied point to the next player ingress;
- resolve the base outcome without Command Bearing bias;
- check whether the sent action aligns with the readied track;
- deterministically improve eligible spendable outcomes by two tiers;
- commit the spend and final result before narration;
- build a full narration packet that explains the base result, final result, selected track, and anchored consequences.

## Authoritative State Model

Target shape:

```text
commandBearing:
  version: 1

  tracks:
    inspiration:
      rank
      rankTitle
      marks
      points
      pointCap
      earnedRecords[]
      awardedSourceIds[]
    resolve:
      rank
      rankTitle
      marks
      points
      pointCap
      earnedRecords[]
      awardedSourceIds[]

  reserve:
    capacity
    absoluteCapacity
    lastRecoveryId

  thresholds[]
  awardedSources{}
  spendLedger{}
  recoveryLedger{}
  evidenceLedger:
    records[]
    bySourceOutcomeId{}
    byArcId{}
    byThreadId{}
    byQuestId{}
  reviewLedger:
    records[]
    reviewedClosureIds{}
  readied:
    id
    track
    status
    saveId
    chatId
    ingressId?
    createdAt
    expiresOn: nextPlayerMessage
```

The implementation can migrate gradually, but the target should replace `commandStyle` rather than permanently supporting both names.

### Evidence Record

```text
id
sourceTurnId
sourceOutcomeId
sourceIngressId?
hostMessageId?
arcId?
threadId?
questId?
decisionId?
chapterId?
primarySignal: inspiration | resolve | mixed | none
trackSignals[]
strength: weak | moderate | strong | defining
criteria:
  agency: true | false
  commitment: true | false
  causality: true | false
actionSummary
consequenceSummary
playerFacingSummary
relationshipPerceptionIds[]
visible
status: open | reviewed | awarded | rejected | stale
recordedAtRevision
invalidatedAt?
invalidationReason?
```

### Review Record

```text
id
closureId
closureType: quest | storyArc | milestone | thread | chapter | commandCrucible
arcId?
threadId?
questId?
chapterId?
sourceOutcomeId?
evidenceIds[]
criteriaSatisfied:
  agency
  commitment
  causality
markAwarded
awardedTrack?
awardSummary
noAwardReason?
marksBefore?
marksAfter?
rankBefore?
rankAfter?
reviewedAtRevision
modelDiagnostics?
```

`modelDiagnostics` must be sanitized. Store model role, parser status, retry count, and schema version. Do not store raw hidden reasoning or provider output in campaign state.

### Relationship Perception Record

Relationship perception records may live under `relationships.perceptionLedger` or a dedicated player-character projection cache. The authoritative hidden relationship values stay in the relationship domain.

```text
id
crewId
dimension: professional_confidence | integrity_trust | personal_rapport | reputation | mixed
playerFacingImpact:
  Great Strain | Strain | Slight Strain | No Clear Change |
  Slight Improvement | Improvement | Great Improvement | Mixed | Unclear
perceivedByCharacter:
  clarity: obvious | subtle | ambiguous
  cue
  summary
sourceOutcomeId
sourceTurnId?
visible
recordedAtRevision
```

## Backend Flow

### Normal Consequential Turn

```text
Player sends message
Directive classifies intent and may flag possible closure
Mission Director resolves outcome
State delta commits outcome
Command Bearing evidence collector evaluates committed turn
Relationship sidecar/evaluator produces hidden delta and player-safe perception
Closure planner checks committed quest/thread/arc/chapter state
Mark Review runs only if closure is proven and relevant evidence exists
Command Log records visible consequences
Character projection can show new evidence/perception
```

The evidence collector runs after a committed outcome exists. It can be part of the same transaction when the turn packet already includes validated evidence, or a post-commit sidecar when latency matters. If post-commit, it must be revision-aware and fail-soft.

### Readied Point Turn

```text
Player readies Inspiration or Resolve in Assist
Player sends message
Chat ingress attaches readied point
Directive intercepts and aborts normal host generation
Mission Director resolves base outcome without bias
Eligibility check validates the readied track
Spend helper improves result by two tiers if valid and spendable
Commit applies final outcome, point spend, evidence, and ledgers
Narration provider receives full committed outcome packet
Directive posts final response into SillyTavern
```

Evidence should record both the underlying command action and the spend:

- the action may become evidence for a future Mark;
- the spend goes into `spendLedger`;
- the Character page can show both, but should not double-count them.

### Closure Review

```text
Quest/thread/arc/chapter boundary completes
Closure detector creates a stable closure id
Command Bearing review planner gathers open evidence linked to that closure
Model or deterministic reviewer proposes Inspiration, Resolve, or no Mark
Validator checks schema, hidden leaks, idempotency, and award rules
Transaction records review and applies any Mark
Evidence statuses update from open to reviewed/awarded/rejected
Character projection shows the review result
```

Closure review should be able to run from:

- quest resolution in `resolveQuestBoundary`;
- milestone or arc completion in `evaluateMilestones`;
- thread closure in `closeThreadsFromSceneDelta`;
- chapter transition or campaign package milestone;
- manual recovery/reconciliation when a closure was missed.

## Model Call Contracts

### Utility Closure Signal

The existing per-turn Utility classifier may include a lightweight closure candidate. This should not require a separate model call.

Input:

- current player message;
- player-safe active scene context;
- current classification context;
- active quest/thread/arc/chapter hints when already available;
- no hidden relationship values or Director-only facts.

Output addition:

```json
{
  "closureSignals": {
    "possibleClosure": true,
    "confidence": "medium",
    "closureTypes": ["thread", "quest"],
    "playerFacingReason": "The player appears to be wrapping the staff exchange and moving toward the next duty interval."
  }
}
```

Allowed confidence labels:

- `low`
- `medium`
- `high`

Allowed closure types:

- `quest`
- `storyArc`
- `milestone`
- `thread`
- `chapter`
- `commandCrucible`
- `scene`

The Utility signal may influence worker plans and diagnostics. It must not:

- create a closure id by itself;
- award or deny a Mark;
- mark evidence reviewed;
- advance quest, thread, arc, or chapter state;
- expose hidden facts or model reasoning.

Deterministic closure proof remains required before Mark Review.

### Evidence Collector

Role: `commandBearingEvaluator`.

Inputs:

- final sent player message;
- resolved intent;
- outcome packet;
- visible costs and consequences;
- relevant player-safe scene context;
- current player Command Bearing summary;
- linked quest/thread/arc ids;
- player-safe relationship perception summaries;
- hidden-output exclusion rules.

Output:

```json
{
  "evidence": [
    {
      "primarySignal": "resolve",
      "trackSignals": ["resolve"],
      "strength": "strong",
      "criteria": {
        "agency": true,
        "commitment": true,
        "causality": true
      },
      "actionSummary": "Accepted Cross's warning and delayed launch to protect the power grid.",
      "consequenceSummary": "The ship lost time, but avoided compounding the system failure.",
      "playerFacingSummary": "This showed Resolve through accepted delay, technical discipline, and responsibility for the cost.",
      "visible": true
    }
  ],
  "noEvidenceReason": ""
}
```

Reject output when:

- it awards a Mark;
- it changes points, marks, ranks, relationships, ship, mission, or Command Log state;
- it exposes hidden values, private NPC thoughts, or model reasoning;
- it creates evidence from keywords without a visible consequential action;
- it lacks source linkage.

### Relationship Perception

Role: `relationshipEvaluator`, with an added player-safe perception output.

Inputs:

- committed outcome;
- relationship-relevant visible interactions;
- affected crew ids;
- player-safe scene facts;
- hidden relationship state for evaluator use only;
- explicit instruction that display output must be what the player character could plausibly perceive.

Output:

```json
{
  "hiddenRelationshipDelta": {
    "descriptiveChanges": []
  },
  "playerPerceptions": [
    {
      "crewId": "mara-whitaker",
      "dimension": "professional_confidence",
      "playerFacingImpact": "Slight Strain",
      "perceivedByCharacter": {
        "clarity": "subtle",
        "cue": "Whitaker complied, but her support became procedural rather than affirmative.",
        "summary": "The commander may sense that Whitaker will need stronger operational grounding next time."
      }
    }
  ]
}
```

The hidden delta and player perception must be validated separately. The Character page receives only perception records and existing player-safe relationship summaries.

### Mark Review

Role: `commandBearingEvaluator` or a dedicated `commandBearingReviewer` if provider routing needs separate authority.

Inputs:

- closure id and closure type;
- player-safe closure summary;
- relevant evidence records;
- source outcome ids;
- track definitions;
- Command Mark criteria: Agency, Commitment, Causality;
- existing awarded source ids;
- current marks/ranks;
- package-authored Command Crucible or bearing-potential guidance when available.

Output:

```json
{
  "closureId": "closure.thread.cross-power-grid.1",
  "markAwarded": true,
  "awardedTrack": "resolve",
  "criteriaSatisfied": {
    "agency": true,
    "commitment": true,
    "causality": true
  },
  "evidenceIds": ["bearing-evidence.123", "bearing-evidence.124"],
  "awardSummary": "The commander repeatedly protected technical integrity under pressure and accepted the operational cost.",
  "noAwardReason": ""
}
```

No-award output:

```json
{
  "closureId": "closure.thread.kieran-risk.1",
  "markAwarded": false,
  "awardedTrack": null,
  "criteriaSatisfied": {
    "agency": true,
    "commitment": false,
    "causality": true
  },
  "evidenceIds": ["bearing-evidence.201"],
  "awardSummary": "",
  "noAwardReason": "The thread resolved, but the decisive change came from prior crew preparation rather than a new command decision."
}
```

Reject output when:

- it awards a track outside `inspiration` or `resolve`;
- it awards without all three criteria;
- it references evidence not supplied;
- it tries to award more than allowed;
- it repeats a reviewed closure id;
- it exposes hidden facts or private reasoning;
- it contradicts the closure's committed outcome.

## Deterministic Validation

Every Command Bearing model output is a proposal. A proposal becomes state only after deterministic validation compares it against the current committed campaign snapshot, the model role's authority, the source records supplied to the prompt, and the Command Bearing rules.

This applies to:

- Utility closure signals;
- evidence proposals;
- relationship perception proposals;
- Mark Review proposals;
- Readied point eligibility and spend commits;
- Character and Assist projection payloads.

### Validation Ladder

Run validation in this order. A later gate cannot rescue a failure from an earlier gate.

1. Parse and schema gate.

   - Require strict structured JSON or the existing structured-output parser result.
   - Require the expected schema id and schema version.
   - Reject unknown top-level roots.
   - Reject enum values outside the contract.
   - Reject unbounded strings, missing required source ids, invalid nullable fields, and malformed arrays.
   - Reject raw chain-of-thought, provider diagnostics, XML-ish hidden tags, or prose outside allowed summary fields.

2. Role authority gate.

   - Check the model role against [model-call-authority-matrix.mjs](../../src/generation/model-call-authority-matrix.mjs).
   - Reuse the sidecar parser pattern from [sidecar-output-contracts.mjs](../../src/jobs/sidecar-output-contracts.mjs).
   - `utilityClassifier` may propose only `closureSignals` and other classifier metadata.
   - `commandBearingEvaluator` may propose evidence and, if explicitly invoked for review, a Mark Review result.
   - `relationshipEvaluator` may propose hidden relationship deltas plus player-safe perception records, but those outputs are validated and projected separately.
   - Narration providers may write committed prose from a packet. They may not award Marks, spend points, or alter ledgers.

3. Source anchor gate.

   - Every `sourceOutcomeId`, `sourceIngressId`, `sourceHostMessageId`, `questId`, `threadId`, `arcId`, `chapterId`, `closureId`, `evidenceId`, and `readiedId` must exist in the committed state or in the exact input packet supplied to the model.
   - Evidence proposals may reference only the committed turn they were asked to evaluate.
   - Relationship perceptions must cite a committed interaction and affected crew ids from the evaluator input.
   - Mark Reviews may reference only supplied, open, visible, non-stale evidence ids.
   - Readied spends must match the exact readied record attached to the next player ingress in the bound campaign chat.

4. Closure proof gate.

   - Mark Review requires a deterministic closure candidate from the closure planner.
   - The closure id must be stable and reproducible from committed state.
   - A Utility `closureSignals` candidate can raise attention, but cannot satisfy closure proof.
   - The closure source must match the closure type: quest status, story milestone/arc status, thread closure, chapter transition, Command Crucible marker, or package-authored review trigger.

5. Command Bearing invariant gate.

   - Evidence can never award a Mark.
   - Evidence requires a visible consequential action and at least one plausible track signal.
   - Evidence strength must be one of the allowed labels and cannot upgrade itself into a point, rank, or review.
   - Mark Review can award zero or one Mark by default.
   - A Mark can be awarded only when Agency, Commitment, and Causality are all satisfied.
   - Awarded track must be `inspiration` or `resolve`.
   - Existing `awardedSources` and `reviewLedger.reviewedClosureIds` must block duplicates.
   - Rank, cap, reserve, and recovery changes must be recalculated by code, not copied from the model.
   - Readied spend improvement must be exactly the configured two-tier improvement, bounded by the six-band outcome ladder.
   - Invalid, routine, impossible, already-successful, or track-mismatched Readied actions return the point and use the base committed outcome.

6. Player-safe disclosure gate.

   - Player-facing records cannot expose hidden relationship values, NPC private thoughts, model confidence scores, raw provider output, or model reasoning.
   - Relationship perception summaries must be phrased as what the player character could plausibly notice.
   - Character and Assist projections must be generated from player-safe records, not by filtering hidden state inline in the UI.
   - Keyword rejection is defense in depth. The real safety comes from source anchoring, role authority, and projection-only display records.

7. Transaction gate.

   - Apply the accepted proposal to the expected campaign revision only.
   - Use idempotency keys for evidence, reviews, awards, spends, refunds, and recovery entries.
   - Reject or rebase only when the touched paths are compatible with the committed revision.
   - Commit evidence, reviews, awards, and spends atomically when they are part of the same consequential turn.
   - Store sanitized diagnostics for rejected proposals. Do not store raw prompts, raw completions, or hidden reasoning in campaign state.

### Failure Behavior

- Utility closure signal fails validation: drop the signal, keep the rest of the turn, and record sanitized classifier diagnostics.
- Evidence proposal has mixed valid and invalid records: commit only independently valid records when their source anchors do not overlap; reject the entire evidence batch if any invalid record would affect the same source/signal key.
- Relationship perception proposal fails display safety: keep any separately valid hidden relationship delta, drop the unsafe perception, and record sanitized diagnostics.
- Mark Review proposal fails validation: do not award a Mark, do not mark evidence reviewed, keep the closure review retryable, and record sanitized review diagnostics.
- Readied eligibility fails: return the point, commit the base outcome, and record the failed spend attempt as player-safe history.
- Readied spend commits but narration/posting fails: preserve the spend and committed final outcome, then enter response repair. Do not refund post-commit.
- Transaction revision mismatch: retry through the normal state-delta gateway when paths are compatible; otherwise reject and schedule reconciliation.

### Validator Helpers

Add focused validators under `src/command` and call them from the runtime, sidecar scheduler, and transaction layer before mutation:

- `validateCommandBearingClosureSignal`;
- `validateCommandBearingClosureCandidate`;
- `validateCommandBearingEvidenceProposal`;
- `validateCommandBearingRelationshipPerceptionProposal`;
- `validateCommandBearingReviewProposal`;
- `validateCommandBearingSpendCommit`;
- `validateCommandBearingProjection`;
- `projectCommandBearingForPlayer`.

These helpers should return typed success/failure objects with:

- `accepted`;
- `records`;
- `rejections`;
- `sanitizedDiagnostics`;
- `touchedPaths`;
- `idempotencyKeys`.

Do not return partially mutated state from validators. Validation describes what may be committed; transaction code performs the commit.

## Closure Detection

Add a Command Bearing review planner that receives closure signals from existing runtime systems.

Closure planner inputs:

- deterministic committed deltas from quest, story arc, thread, chapter, and world-boundary systems;
- any `closureSignals` candidate from the Utility classifier;
- package-authored Command Crucible or review guidance;
- open Command Bearing evidence records;
- source outcome, event, thread, quest, and milestone ids.

Closure planner outputs:

```json
{
  "closureCandidates": [
    {
      "closureId": "closure.quest.cross-power-grid.outcome-456",
      "closureType": "quest",
      "source": "committedState",
      "proof": ["quest status changed to resolved"],
      "utilitySuggested": true,
      "reviewEligible": true,
      "evidenceIds": ["bearing-evidence.123"]
    }
  ],
  "noReviewDiagnostics": []
}
```

When Utility suggested closure but committed state did not prove it:

```json
{
  "closureCandidates": [],
  "noReviewDiagnostics": [
    {
      "source": "utilityClosureSignal",
      "status": "pending",
      "reason": "Utility suggested chapter closure, but no quest, thread, arc, milestone, or chapter transition committed."
    }
  ]
}
```

`reviewEligible` requires:

- proven closure;
- stable closure id;
- relevant open evidence or explicit package review guidance;
- no existing review for the closure id;
- no stale-only evidence set.

### Quest Resolution

Hook after `resolveQuestBoundary` completes.

Create closure id:

```text
closure.quest.{questId}.{outcomeId}
```

Gather evidence where:

- `questId` matches;
- source outcome belongs to the quest;
- thread evidence promoted into the quest references the quest;
- package-authored review tags match the quest or Command Crucible.

### Story Arc And Milestone Completion

Hook after `evaluateMilestones`.

Create closure ids:

```text
closure.milestone.{milestoneId}.{sourceEventId}
closure.arc.{arcId}.{sourceEventId}
```

Gather evidence where:

- `arcId` matches;
- source outcome appears in milestone source event ids;
- quest/template metadata links to the arc;
- package-authored review tags match the arc.

Arc completion may create a review even when no Mark is awarded. This is useful because it tells the Character page that the evidence was considered.

### Thread Closure

Hook after `closeThreadsFromSceneDelta`.

Create closure id:

```text
closure.thread.{threadId}.{reviewIndex}
```

Gather evidence where:

- `threadId` matches;
- relationship perception records cite the same thread or source outcomes;
- thread `bearingPotential` is eligible or evidence itself has track signals.

The current thread README says the thread slice is isolated from Command Bearing awards. This implementation changes that contract deliberately and should update that README.

### Chapter Transition

Hook when a mission graph transition or package chapter checkpoint is committed.

Create closure id:

```text
closure.chapter.{chapterId}.{sourceOutcomeId}
```

Gather evidence across:

- open chapter-bound evidence;
- completed quests in the chapter;
- closed threads attached to the chapter;
- package-authored chapter review guidance.

Chapter reviews should be conservative. They should not award a Mark if a smaller quest/thread review already awarded the same decisive source.

## Transaction And Idempotency Rules

### Evidence

- one evidence id per source outcome plus signal type;
- duplicate evidence from retries should merge rather than append;
- evidence from invalidated chat ranges should become `stale`, not deleted;
- stale evidence cannot support new Mark Reviews unless a replay revalidates it;
- post-commit evidence sidecars must rebase only onto compatible revisions.

### Reviews

- one review per closure id;
- a review can award zero or one Mark by default;
- two Marks require explicit package guidance and distinct supplied evidence sets;
- review records persist even when no Mark is awarded;
- review status can become stale if source evidence is invalidated;
- stale reviews do not silently remove Marks from active state. Reconciliation should branch, replay, or require review.

### Awards

- one award per unique closure/source id and track;
- awarded source ids must be tracked under `awardedSources`;
- rank recalculation happens inside the same transaction as the Mark award;
- rank-change output is recorded for Character display;
- point totals are not automatically replenished by rank changes except through existing Recovery rules.

### Readied Points

- readied state applies only to the next player message in the bound campaign chat;
- readying does not deduct points;
- invalid, routine, impossible, already-successful, or track-mismatched messages return the point;
- valid spends commit once the improved outcome commits;
- post-commit narration failure does not refund the point;
- swipe/retry keeps the same mechanics;
- edit/delete after commit uses ordinary branch/replay/recovery machinery.

## Integration Points

### `src/command`

Add or update helpers for:

- `refreshCommandBearing`;
- `validateCommandBearingClosureSignal`;
- `validateCommandBearingClosureCandidate`;
- `validateCommandBearingEvidenceProposal`;
- `validateCommandBearingRelationshipPerceptionProposal`;
- `validateCommandBearingReviewProposal`;
- `validateCommandBearingSpendCommit`;
- `validateCommandBearingProjection`;
- `recordCommandBearingEvidence`;
- `planCommandBearingReview`;
- `applyCommandBearingReview`;
- `markEvidenceReviewed`;
- `selectEvidenceForClosure`;
- `projectCommandBearingForPlayer`;
- migration from `commandStyle` to `commandBearing`.

Keep the existing rank thresholds unless the design doc changes:

```text
I Practiced: 0 Marks
II Established: 2 Marks
III Proven: 5 Marks
IV Defining: 9 Marks
V Exemplary: 14 Marks
```

### `src/jobs`

Extend sidecar scheduling:

- `commandBearingEvaluator` can generate evidence proposals;
- Mark Review may use the same role or a new route with stricter authority;
- sidecars must pass parser, authority, source-anchor, and path validation before any write;
- sidecars must write only allowed roots;
- same-batch conflict handling must reject overlapping Command Bearing paths;
- diagnostics should record sanitized role/parser/status metadata.

### `src/directors`

Add review planner hooks in:

- open-world turn finalization;
- quest resolution boundary;
- story milestone/arc completion;
- thread closure processing;
- chapter transition handling.

### `src/campaign`

Update transaction application:

- apply `commandBearing` deltas;
- migrate old `commandStyle` state;
- require deterministic validator success before applying Command Bearing deltas;
- enforce award idempotency;
- apply evidence/review/award updates atomically;
- preserve recovery and spend ledgers.

### `src/runtime`

Update chat-native orchestration:

- attach Readied points to ingress;
- abort normal host generation for consequential readied-point turns;
- route eligibility checks;
- validate exact readied id, ingress id, campaign chat id, and outcome-band improvement before commit;
- commit final outcome packets;
- schedule evidence/perception sidecars;
- surface repair status for post-commit narration failures.

### `src/ui`

Backend projections should support UI without leaking hidden state:

- Assist receives point counts, readied state, and fit-check results;
- Character receives summary, evidence, reviews, spend/recovery history, and relationship perceptions;
- Crew receives only existing player-safe senior staff projections.

The UI should not assemble hidden-state filters inline.

## Implementation Slices

### Slice 1: Backend Contract And Migration

- Add `commandBearing` state helpers and migration from `commandStyle`.
- Keep rank, threshold, point cap, recovery, and two-tier spend behavior.
- Add `evidenceLedger` and `reviewLedger` shapes.
- Update schemas and validators for the new roots.
- Update docs and tests that still assume direct `commandStyle` as the final model.

### Slice 2: Deterministic Validation Backbone

- Add schema ids for closure signals, evidence proposals, relationship perception proposals, Mark Review proposals, spend commits, and player-safe projections.
- Add validator helpers under `src/command`.
- Wire role authority to `model-call-authority-matrix.mjs`.
- Wire structured parsing to `sidecar-output-contracts.mjs` or a sibling Command Bearing parser module.
- Add source-anchor validation against committed campaign state and supplied model-call packets.
- Add idempotency-key generation for evidence, reviews, awards, spends, refunds, and recovery.
- Add sanitized diagnostics for rejected proposals.
- Require validator success before `state-delta-gateway` or transaction code applies Command Bearing changes.

### Slice 3: Evidence Collector

- Add evidence proposal contract for `commandBearingEvaluator`.
- Add deterministic fallback for obvious no-evidence turns.
- Validate track labels, strengths, criteria, summaries, source refs, and hidden-output constraints.
- Commit evidence records after meaningful committed turns.
- Add stale/invalidated behavior for scene reconciliation.

### Slice 4: Relationship Perception Records

- Extend relationship evaluator output to include player-safe perception records.
- Validate hidden deltas separately from perception records.
- Store perception records in the relationship domain or a player-character projection cache.
- Link perception records to evidence when relevant.

### Slice 5: Closure Detection

- Add `closureSignals` to the existing Utility turn classifier output without adding a standalone closure model call.
- Add closure ids for quest, milestone, arc, thread, chapter, and Command Crucible closure.
- Add deterministic closure proof from committed state deltas.
- Gather evidence by source ids and package metadata.
- Queue review only when there is open relevant evidence or explicit package guidance.
- Record no-review diagnostics when closure has no eligible evidence or Utility suggested closure without committed proof.

### Slice 6: Mark Review

- Add Mark Review model contract and parser.
- Add deterministic validation and retry behavior.
- Apply no-award, Inspiration award, Resolve award, and rank-change records.
- Enforce one review per closure id and one award per source.
- Convert old direct-award hotspots to evidence plus review when feasible.

### Slice 7: Readied Spend Backend

- Add readied point state and ingress attachment.
- Add post-send eligibility check.
- Abort normal SillyTavern generation for consequential readied-point turns.
- Commit spend, final result band, anchored consequences, and narration packet atomically.
- Preserve failure/refund boundaries.

### Slice 8: Player Projections

- Build `commandBearingPlayerView`.
- Build `playerCharacterView.commandBearingEvidence`.
- Build `playerCharacterView.commandBearingReviews`.
- Build relationship perception projection.
- Ensure projections exclude raw scores, hidden deltas, hidden facts, raw provider output, and private NPC thoughts.

### Slice 9: Cleanup And Compatibility Removal

- Remove pause-first Command Bearing UI assumptions.
- Rename remaining `commandStyle` public concepts to `commandBearing`.
- Update thread README now that thread closure can feed Command Bearing review.
- Update Operator Manual, Tips, and visual render tracking after UI implementation.

## Tests And Verification

### Unit Tests

- migration from `commandStyle` to `commandBearing`;
- closure signal schema and authority validation;
- evidence proposal schema, authority, source-anchor, and hidden-output validation;
- evidence record validation;
- evidence merge/idempotency;
- evidence invalidation on source edit;
- relationship perception schema, source-anchor, and display-safety validation;
- Mark Review schema, authority, closure-proof, criteria, duplicate-source, and hidden-output validation;
- review idempotency;
- no-award review persistence;
- Inspiration award;
- Resolve award;
- rank-change output;
- duplicate-award protection;
- hidden-value rejection;
- Utility closure signal parsing and validation;
- closure planner requiring committed proof before review;
- Utility-suggested closure producing `reviewPending` or diagnostics when state does not prove closure;
- invalid Mark Review proposals leave evidence open and review retryable;
- readied point attach/return/consume;
- readied spend exact ingress/readied id validation;
- two-tier spend application;
- outcome-band bounds for Readied spend improvement;
- post-commit narration failure preserving spend.

### Integration Tests

- meaningful turn creates evidence but no Mark;
- quest resolution triggers review;
- thread closure triggers review;
- story milestone/arc completion triggers review;
- chapter transition triggers conservative review;
- Utility closure signal alone does not trigger Mark Review;
- proven closure plus relevant evidence triggers at most one Mark Review;
- rejected evidence/review/spend proposals produce diagnostics without mutating state;
- Mark Review updates Character projection;
- relationship shift creates player-safe perception;
- swiped narration does not rerun review or refund spends;
- edit/delete invalidates evidence and marks downstream review stale;
- sidecar batch conflicts reject overlapping Command Bearing writes.

### Live Or Smoke Verification

- fresh campaign produces at least one evidence record from a meaningful turn;
- closure or scripted fixture produces a Mark Review;
- Character projection shows evidence/review without raw hidden values;
- Assist shows points and readied state from authoritative state;
- SillyTavern readied-point turn posts a Directive-owned response;
- provider failure before commit refunds the point;
- provider failure after commit preserves the spend and retries narration.

## Acceptance Criteria

The backend system is ready for alpha testing when:

- `commandBearing` is the authoritative runtime state name;
- meaningful committed turns can create validated evidence records;
- evidence records never award Marks directly;
- quest/thread/arc/chapter closure can trigger Mark Review only after committed state proves closure;
- Utility closure signals can schedule or prioritize review planning without becoming authoritative;
- model-produced Command Bearing proposals cannot mutate state until deterministic validators accept schema, authority, source anchors, closure proof, domain invariants, player-safe disclosure, and transaction idempotency;
- Mark Review can award Inspiration, Resolve, or no Mark;
- review and award records are idempotent;
- duplicate awards are blocked;
- rank changes are recorded and projected;
- relationship shifts can include player-safe perception records;
- Readied point spends improve outcomes through committed mechanics, not hidden prompt bias;
- all player-facing projections exclude raw hidden values, model scores, private NPC thoughts, and raw provider output;
- scene reconciliation can invalidate evidence/reviews safely;
- tests cover direct success, no-award, failure, provider retry, swipe, edit, and branch/replay cases.

## Non-Goals

This backend pass should not add:

- automatic per-message XP;
- visible raw relationship values;
- hidden prompt-only success boosts;
- prompt-trusted Command Bearing awards or point spends without deterministic validation;
- standalone closure-detection model calls unless the existing Utility classifier and committed-state planner prove insufficient;
- editable Command Bearing totals;
- passive rank bonuses beyond existing reserve/recovery rules;
- omniscient NPC thought summaries;
- Command Bearing refunds for post-commit buyer's remorse;
- deep-history Command Bearing special rollback separate from normal branch/replay.
