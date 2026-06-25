# Command Bearing User-Facing System Plan

## Status

This is the development and implementation plan for making Command Bearing visible and usable during chat-native play.

The durable player-character record and deeper Command Bearing display are planned in [Player Character Page And Crew Tabs Plan](PLAYER_CHARACTER_PAGE_AND_CREW_TABS_PLAN.md). This plan owns the Assist-adjacent spend flow; the Character page owns the long-lived command record.

The authoritative backend mechanics for evidence collection, closure-triggered Mark Review, state migration, relationship perception records, and Readied spend transactions are planned in [Command Bearing Backend Development Plan](COMMAND_BEARING_BACKEND_DEVELOPMENT_PLAN.md).

It refines the product contract in [Command Bearing System](../design/COMMAND_BEARING_SYSTEM.md). The stable mechanic remains Inspiration and Resolve points improving eligible consequential outcomes. The user-facing flow changes: points are readied before the player sends a message instead of presented as a pause after every eligible outcome.

Directive is pre-alpha, so implementation should update the current runtime and docs in place. Do not preserve older pause-first Command Bearing UI behavior for compatibility.

## Goal

Players should be able to see, check, and ready Command Bearing points without slowing the game down.

The player-facing system should:

- show Inspiration and Resolve point counts near the chat composer through Directive Assist;
- let the player ready one point for the message they are about to send;
- let the player ask whether their current wording is a strong fit for Inspiration or Resolve;
- give kind, GM-style feedback without rewriting the player's message;
- spend the point only if the final sent action actually aligns with the readied track;
- improve the resolved outcome through authoritative mechanics, not hidden prompt favoritism;
- return the point when the message is routine, ineligible, impossible, already successful, or blocked by a pre-commit provider failure;
- keep the point spent once an improved outcome is committed, even if narration is retried or swiped.

## Core Decisions

### Use "Readied" Terminology

Use readied-point language:

- `Ready Inspiration`
- `Ready Resolve`
- `Inspiration readied for your next sent message.`
- `Resolve readied for your next sent message.`
- `Cancel Readied Point`

Avoid `Arm`, `load`, `charge`, or other militarized terms. The point is prepared for the next consequential action; it is not spent until Directive validates the sent action.

### No Command Bearing Pause By Default

Do not stop every eligible outcome to ask whether the player wants to spend a point.

The old pause-first model is too slow for chat-native play. Command Bearing should not become a modal checkpoint after every meaningful action. The player decides before sending that this action should draw on Inspiration or Resolve.

### Use Controlled Narration, Not Rewrite-After-The-Fact

Do not let ordinary SillyTavern chat generation write the first consequential reply and then ask Directive to improve or replace it.

For any consequential turn with a readied point, Directive should intercept the host generation event and abort normal SillyTavern generation while the turn is adjudicated. SillyTavern's configured narrator/model may still write the final prose, but only as a controlled narration provider after Directive has committed the mechanics.

Rationale:

- the player should not see a failed or lower-band reply and then watch it get overwritten;
- the first uncontrolled reply could introduce facts that conflict with the upgraded result;
- partial replies become harder to classify as committed or discarded;
- replacing arbitrary host messages is more fragile than posting Directive-owned responses;
- the spend should remain a pre-send commitment, not a post-hoc timeline edit.

If an uncontrolled host reply is accidentally produced, treat that as recovery or reconciliation. It should not be the happy path for Command Bearing spends.

### Narration Needs Full Outcome Context

Do not rely on a thin instruction such as `write the committed Partial Success, shaped by Resolve`.

The narration model must receive enough context to understand:

- what Inspiration and Resolve mean;
- the six-band outcome ladder;
- the base result band that Directive already determined;
- the deterministic two-band Command Bearing improvement;
- why the readied point was eligible;
- what specifically improved in the fiction;
- which costs, facts, and consequences remain anchored;
- which player-safe scene, crew, ship, and Command Log facts are available;
- which hidden facts and Director-only data remain forbidden.

The model should not infer the upgrade from vibe. Directive should give it a structured committed outcome packet and instruct it to narrate that packet.

### Assist Coaches, It Does Not Play

Directive Assist may provide advice about whether the current composer text fits Inspiration or Resolve.

It must not:

- produce a replacement paragraph for Command Bearing checks;
- rewrite the player's command to make it qualify;
- predict the final outcome;
- promise that the point will be spent;
- commit Command Bearing, relationship, Command Log, or mission state by itself.

The tone should be a kind GM:

```text
Inspiration Fit: Thin

What works:
You are acknowledging the crew's concern.

What is missing:
The action does not yet create trust, shared purpose, voluntary cooperation, or a dignity-preserving path.

To make this more Inspiration-aligned:
- Name the shared purpose.
- Be transparent about the risk.
- Give the other party a voluntary path to cooperate.
```

Feedback may name criteria and questions. It should not write the player character's speech for them.

### Spent Means Spent After Commit

Once a readied point validly improves a committed outcome, it is spent.

Refunds are for invalid eligibility, non-consequential messages, impossible actions, already-successful base outcomes, cancellation before send, and technical failure before mechanical commit. They are not for buyer's remorse after seeing the improved outcome.

Swiping or retrying narration does not refund the point because the mechanics did not reroll. Editing or deleting the initiating player message after commit should enter the normal recovery, branch, or replay machinery; it should not special-case Command Bearing refunds.

## Target Assist UI

Add a Command Bearing module to the Assist panel near the existing pre-send actions.

This module is the primary always-near-the-composer place where the player sees banked Command Bearing points. Mission and Player Record may summarize Command Bearing, but Assist owns the pre-send spend controls because that is where the player decides whether the next message should draw on a point.

```text
Command Bearing

Inspiration Points: 2 banked    [Ready Inspiration]
Resolve Points: 1 banked        [Ready Resolve]

[Check for Inspiration]
[Check for Resolve]
```

The displayed counts must come from authoritative campaign state:

- Inspiration row shows the current banked Inspiration points available to spend.
- Resolve row shows the current banked Resolve points available to spend.
- The row should not show raw Marks, hidden eligibility, hidden award potential, or Director-only scoring.
- If no active campaign is bound, show the module disabled with a short unavailable state instead of fake zeroes.
- If a save is loaded in the wrong chat, disable ready/check actions and use the existing current-chat guard copy pattern.
- If provider or runtime state is refreshing, keep the last known count visible and mark controls busy rather than clearing counts.

Suggested compact visual structure:

```text
Command Bearing
Reserve 1 / 2

Inspiration  [2]  [Ready]
Resolve      [1]  [Ready]

[Check Inspiration] [Check Resolve]
```

`Reserve 1 / 2` is optional but recommended when it can be displayed without crowding. The track rows are required.

When a point is readied:

```text
Command Bearing
Resolve readied for your next sent message.

Inspiration  [2]  [Ready]
Resolve      [1]  [Readied] [Cancel]

[Check Inspiration] [Check Resolve]
```

Readying a point does not immediately decrement the displayed banked count unless the UI explicitly separates `banked` from `readied`. To avoid confusion, the first implementation should keep the banked count stable and show the readied state beside the selected track. The point is deducted only when the committed outcome spend succeeds.

Disable `Ready Inspiration` when Inspiration points are zero. Disable `Ready Resolve` when Resolve points are zero. If another point is already readied, the other ready button should either be disabled or replace the readied point after explicit confirmation.

Required UI states:

| State | Inspiration Row | Resolve Row | Notes |
|---|---|---|---|
| No active campaign | Disabled | Disabled | Show no fake point counts. |
| No points | `0 banked`, Ready disabled | `0 banked`, Ready disabled | Checks may remain available if composer text exists. |
| Points available | Count plus Ready button | Count plus Ready button | Normal ready/check state. |
| Track readied | Count plus `Readied` and Cancel | Other track Ready disabled or confirm-replace | One readied point at a time. |
| Wrong chat/save guard | Counts visible if safe, actions disabled | Counts visible if safe, actions disabled | Use guard copy and avoid mutation. |
| Runtime/provider busy | Counts remain visible, actions busy | Counts remain visible, actions busy | Do not flicker to zero. |
| Spend committed | Updated count after refresh | Updated count after refresh | Show short result note if Assist is open. |
| Point returned | Original count visible | Original count visible | Show why it returned in plain language. |

Post-resolution Assist status copy should be short:

- `Resolve spent: Failure -> Partial Success.`
- `Inspiration returned: this message was not consequential.`
- `Resolve returned: the sent action did not rely on Resolve.`
- `Inspiration returned: outcome was already successful.`

Use one-message scope for the first implementation:

- the readied point applies only to the next player message in the bound campaign chat;
- if the next message is not eligible, the point is returned;
- the readied state is cleared after that message resolves or is abandoned;
- the player must ready a point again for a later message.

## Pre-Send Fit Checks

`Check for Inspiration` and `Check for Resolve` inspect the current composer text and current player-safe campaign context.

The player may run either check before or after readying a point. A check never readies a point, spends a point, commits state, changes relationship state, or creates Command Log evidence. It is an advisory report about the text currently in the composer.

The check should return a compact player-facing report:

```text
Resolve Fit: Plausible

What works:
The message gives a clear order and names who is responsible.

What is weak:
The authority boundary is implied rather than stated.

Tip:
Make the boundary or accepted responsibility explicit before sending.
```

The report should include:

- `Fit`: one qualitative label;
- `What works`: one or two short observations;
- `What is weak` or `Missing`: one or two short observations when the fit is not strong;
- `Tip`: one brief practical alignment tip;
- `Warnings`: only when the draft appears to overclaim authority, rely on hidden knowledge, or ask for an impossible result.

The report must not include a replacement message, polished paragraph, or suggested dialogue. It can advise the player what kind of element to add, but the player writes the actual message.

Track-specific tips should stay concrete:

| Track | Good fit signals | Common tip examples |
|---|---|---|
| Inspiration | trust, transparency, dignity, shared purpose, voluntary cooperation, empowerment, coalition-building | `Name the shared purpose.`, `Be transparent about the risk.`, `Offer a voluntary path to cooperate.`, `Preserve the other party's dignity.` |
| Resolve | lawful authority, preparation, credible boundaries, discipline, deadlines, accepted responsibility, commitment under pressure | `State the authority boundary.`, `Make the order or deadline specific.`, `Show what responsibility the player accepts.`, `Make the consequence credible rather than threatening.` |

The structured result should support the report:

```json
{
  "track": "inspiration",
  "fit": "thin",
  "summary": "This could become Inspiration-aligned, but the current wording does not yet depend on trust, transparency, shared purpose, or voluntary cooperation.",
  "whatWorks": [
    "The message acknowledges crew concern."
  ],
  "missing": [
    "No shared purpose is named.",
    "No voluntary path is offered."
  ],
  "suggestions": [
    "Name the shared purpose.",
    "Be explicit about the risk.",
    "Invite cooperation without writing the outcome."
  ],
  "tip": "Add one concrete reason the other party would choose to cooperate.",
  "warnings": []
}
```

Allowed fit labels:

- `strong`
- `plausible`
- `thin`
- `mismatch`
- `notConsequential`

Behavioral requirements:

- Empty or very short composer text returns `notConsequential` or `thin` with a tip to write the intended command first.
- A strong fit should still avoid promising that the point will be spent; the final sent message and committed outcome are authoritative.
- A mismatch should explain why the selected track does not fit and may name the other track if it is clearly more plausible.
- The check should use the player's current role and authority lane, so a lower-authority player receives report/recommendation guidance rather than being encouraged to issue an invalid order.
- The same check can be run repeatedly as the player edits.
- The report should stay short enough to fit inside Assist without becoming a second editor.

Do not expose raw scores. Do not expose hidden facts. Do not include replacement text.

## Post-Send Eligibility Check

After the player sends a message with a readied point, Directive runs an authoritative eligibility check against the final sent text.

Inputs:

- readied track;
- final sent player text;
- player role and authority lane;
- player-safe active scene context;
- relevant command context available to the Mission Director;
- base outcome packet or its validated intent/result summary.

Output:

```json
{
  "track": "resolve",
  "eligible": true,
  "fit": "strong",
  "causalBasis": [
    "The player issued a lawful order within their authority.",
    "The action established a clear boundary and accepted responsibility for operational cost."
  ],
  "notEligibleReason": "",
  "alternateEligibleTrack": null
}
```

The check does not decide the mission outcome. It answers only whether the readied track is causally present in the action.

Deterministic validation should reject malformed output, hidden leaks, unknown labels, and attempts to alter campaign state. If the check cannot be trusted after retry and parser recovery, the point is returned and the base outcome proceeds without the spend.

## Command Bearing Evidence Tracker

Command Bearing progression should be driven by visible evidence, not per-message XP.

Every meaningful committed turn may create one or more `commandBearingEvidence` records. These records say, in player-facing terms, what the player character did, what it cost or changed, and which Command Bearing track it may support. Evidence can stack across a crew thread, side assignment, chapter, or Command Crucible, but it does not immediately award a Command Mark.

This keeps the system transparent without turning every post into a reward event.

Evidence records should be generated only after a committed outcome exists. They should use:

- the final sent player message;
- the resolved intent;
- the committed base/final outcome;
- visible consequences;
- player-safe relationship perceptions;
- the relevant arc, thread, or decision id.

Recommended record shape:

```json
{
  "id": "bearing-evidence.123",
  "sourceTurnId": "turn.456",
  "sourceOutcomeId": "outcome.456",
  "arcId": "cross-power-grid-thread",
  "trackSignals": ["resolve", "inspiration"],
  "primarySignal": "resolve",
  "strength": "strong",
  "actionSummary": "Accepted Cross's warning and delayed launch to protect the power grid.",
  "consequenceSummary": "The ship lost time, but avoided compounding the system failure.",
  "criteria": {
    "agency": true,
    "commitment": true,
    "causality": true
  },
  "playerFacingSummary": "This showed Resolve through accepted delay, technical discipline, and responsibility for the cost.",
  "visible": true
}
```

Allowed signal strengths:

- `weak`
- `moderate`
- `strong`
- `defining`

Routine messages should usually create no evidence. A weak signal is useful only when it belongs to an existing arc or clarifies a pattern. Do not create evidence for keyword usage, ordinary politeness, routine firmness, or player-authored claims that they deserve a reward.

Evidence may be positive, costly, mixed, or unsuccessful. A failed or costly action can still support a future Mark when the player's approach satisfies Agency, Commitment, and Causality.

### Arc-End Mark Review

Command Marks should be awarded by a review at meaningful closure, not by the per-turn evidence collector.

Review triggers may include:

- completion of a crew B-story;
- resolution of a side assignment;
- conclusion of a personal-story chapter;
- completion of a designated Command Crucible;
- a campaign package milestone that explicitly calls for Command Bearing review.

The review gathers relevant evidence and decides:

- whether a Mark is awarded;
- which track receives the Mark;
- why that track was decisive;
- which evidence records mattered most;
- whether the review created a rank change.

Recommended review shape:

```json
{
  "id": "bearing-review.789",
  "arcId": "cross-power-grid-thread",
  "reviewType": "command_bearing_mark_review",
  "evidenceIds": ["bearing-evidence.123", "bearing-evidence.124"],
  "criteriaSatisfied": {
    "agency": true,
    "commitment": true,
    "causality": true
  },
  "awardedTrack": "resolve",
  "markAwarded": true,
  "awardSummary": "The commander repeatedly protected technical integrity under pressure and accepted the operational cost.",
  "marksBefore": 4,
  "marksAfter": 5,
  "rankBefore": "Established",
  "rankAfter": "Proven"
}
```

The review may award no Mark. A no-award result should still be recordable when useful:

```json
{
  "markAwarded": false,
  "reason": "The arc resolved, but the decisive action came from prior crew preparation rather than a new player command decision."
}
```

The review should preserve the existing Command Mark constraints:

- one Mark is the default maximum for one resolved story or Command Decision;
- two Marks in one arc are uncommon and require distinct consequential decisions;
- Marks are not awarded for repeated argument loops, reward farming, swiped narration, or routine progress;
- the awarded track is the style that materially made the resolution possible;
- relationship gains or losses are separate from the Mark decision.

The Character page should show evidence and reviews as the player's command record, while Assist remains the place to ready and spend banked points.

### Relationship Perception Sidecar

When a model call detects a relationship or reputation shift, it should also produce a player-safe perception record.

This record answers: what could the player character plausibly notice from the interaction?

It must not expose:

- raw relationship values;
- hidden deltas;
- private NPC thoughts;
- hidden red lines;
- secrets or unrevealed motivations;
- raw evaluator reasoning.

Recommended impact labels:

- `Great Strain`
- `Strain`
- `Slight Strain`
- `No Clear Change`
- `Slight Improvement`
- `Improvement`
- `Great Improvement`

Use `Mixed` or `Unclear` when the interaction cuts in multiple directions or the player character could not reasonably read the result.

Recommended record shape:

```json
{
  "crewId": "mara-whitaker",
  "dimension": "professional_confidence",
  "playerFacingImpact": "Slight Strain",
  "perceivedByCharacter": {
    "clarity": "subtle",
    "cue": "Whitaker complied, but her support became procedural rather than affirmative.",
    "summary": "The commander may sense that Whitaker will need stronger operational grounding next time."
  },
  "sourceOutcomeId": "outcome.456"
}
```

This perception record can appear in the Character page interaction log. It can also support Command Bearing evidence when the relationship consequence is part of the command decision's cost or effect.

## Runtime Flow

```text
Player readies Resolve
Player sends message
Directive intercepts the generation event
Directive aborts normal ST generation for this consequential turn
Utility/eligibility checks whether the sent message fits Resolve
Mission Director resolves the base outcome
Command Bearing deterministically bumps the result band if valid
Reasoner/narrator writes the final committed response
Directive posts that response into SillyTavern
```

The point is consumed only inside the commit transaction that produces the improved outcome. Readying a point does not mutate Command Bearing totals by itself.

Detailed runtime behavior:

```text
1. Player opens Assist.
2. Player clicks Ready Inspiration or Ready Resolve.
3. Directive stores one readied point for the bound save/chat.
4. Player may run Check for Inspiration or Check for Resolve at any time before sending.
5. Player sends the next message.
6. Chat ingress attaches the readied point to that message.
7. Directive intercepts generation for the bound campaign chat.
8. If the message is routine, color, or no Directive action:
   - return the readied point;
   - clear readiness;
   - allow normal host continuation when appropriate.
9. If the message is consequential:
   - abort normal host generation;
   - resolve the base outcome without Command Bearing bias;
   - run the post-send eligibility check for the readied track;
   - if valid, possible, and spendable, consume the point in the outcome transaction;
   - improve the result by exactly two bands;
   - record spend metadata;
   - create any player-safe Command Bearing evidence and relationship perception records;
   - build a full Command Bearing outcome-adjustment packet;
   - call the configured narration provider;
   - post the Directive-owned final response into SillyTavern.
10. If the readied point is invalid or cannot apply:
   - return the point;
   - commit and narrate the base outcome.
```

## Narration Prompt Contract

Command Bearing narration must be mechanically sound. The narrator is a prose renderer for committed mechanics, not the authority that decides whether the point works.

### Provider Choice

Prefer SillyTavern's configured narrator/current provider for final prose when available, because the user may have a different model or preset for narration than Directive's Reasoner provider.

This still must be a controlled model call:

- Directive supplies the prompt and structured committed packet.
- Directive uses the active SillyTavern narration style and perspective contract when available.
- Directive posts the final assistant message after the call.
- Ordinary SillyTavern chat generation remains aborted for the consequential turn.

If the SillyTavern narration provider is unavailable, fall back according to the existing narration role policy. Do not silently let normal host generation continue for a committed Command Bearing outcome after mechanics have been decided.

### Prompt Shape

The narrator request should contain these sections:

```text
System:
- You are the Directive narrator for a Star Trek command RPG.
- Use normal roleplay prose suitable for the active SillyTavern narration style.
- Do not decide mechanics.
- Do not change the result band.
- Do not erase anchored consequences.
- Do not add hidden facts, new state changes, extra rewards, or new costs.
- Do not write the player character's unspoken thoughts, feelings, or decisions.
- Apply the supplied narration perspective contract.

Outcome ladder:
- Great Failure
- Failure
- Partial Failure
- Partial Success
- Success
- Great Success

Command Bearing rule:
- Inspiration is leadership through trust, shared purpose, transparency, dignity, mentorship, and voluntary cooperation.
- Resolve is leadership through lawful authority, preparation, credible boundaries, discipline, and accepted responsibility.
- A valid readied point can improve a spendable outcome by exactly two bands before narration.
- This spend has already been validated and committed.

Committed mechanics:
- Player identity
- Scene snapshot
- Known crew identity
- Base outcome
- Command Bearing spend
- Final outcome
- Anchored consequences
- Visible Command Log continuity
- Narrator packet constraints

Instruction:
- Narrate the final outcome, not the base outcome.
- Show how the selected track made the difference.
- Preserve anchored consequences.
- Write only the next visible assistant message.
```

### Command Bearing Outcome-Adjustment Packet

When a readied point is validly spent, build a structured packet similar to:

```json
{
  "kind": "directive.commandBearingOutcomeAdjustment",
  "outcomeId": "outcome.123",
  "turnId": "chat-turn:ingress.456",
  "readiedId": "command-bearing-readied.789",
  "track": "resolve",
  "trackDefinition": "Resolve is leadership through lawful authority, preparation, credible boundaries, discipline, and accepted responsibility.",
  "outcomeLadder": [
    "Great Failure",
    "Failure",
    "Partial Failure",
    "Partial Success",
    "Success",
    "Great Success"
  ],
  "baseOutcome": {
    "resultBand": "Failure",
    "summary": "The order prevents panic, but the suspects escape through the service corridor.",
    "visibleCosts": [
      "The crew loses the immediate trail."
    ]
  },
  "eligibility": {
    "fit": "strong",
    "causalBasis": [
      "The player issued a lawful order within their authority.",
      "The player established a clear boundary and accepted operational cost."
    ]
  },
  "spend": {
    "from": "Failure",
    "to": "Partial Success",
    "rule": "One valid Command Bearing point improves a spendable outcome by exactly two bands."
  },
  "finalOutcome": {
    "resultBand": "Partial Success",
    "summary": "The suspects still escape, but disciplined containment preserves evidence and gives the crew a reliable next lead.",
    "improvements": [
      "The team secures usable sensor residue before the corridor clears.",
      "No crew member breaks formation or worsens the scene."
    ],
    "anchoredConsequences": [
      "The suspects are not captured in this beat.",
      "The immediate chase opportunity is still lost."
    ]
  },
  "safety": {
    "narrateFinalOutcomeOnly": true,
    "mayChangeResultBand": false,
    "mayEraseAnchoredConsequences": false,
    "mayInventHiddenFacts": false,
    "mayWritePlayerInterior": false
  }
}
```

The packet should be included in `turnPacket.narratorPacket`, `turnPacket.bearingSpend`, or a dedicated `turnPacket.commandBearingAdjustment` field. The exact storage shape can be chosen during implementation, but the narrator prompt must receive the structured context.

### Narrator Packet Requirements

The final `narratorPacket` should include:

- `sourceOutcomeId`;
- final `resultBand`;
- base `resultBand`;
- `commandBearingAdjustment`;
- final outcome summary;
- improvement details;
- anchored consequences;
- narrator-safe allowed facts;
- forbidden hidden facts or forbidden fact ids;
- perspective and player-agency constraints;
- visible Command Log continuity.

The current short constraint string is not enough for this feature. It can remain as a human-readable guard, but the structured packet is the source of truth for narration.

## Provider Failure And Partial Reply Rules

Command Bearing recovery should distinguish pre-commit failure from post-commit response failure.

### Before Mechanical Commit

Return or preserve the readied point when:

- the player cancels before send;
- the message fails to leave the composer;
- turn classification fails before a committed outcome;
- Mission Director output cannot be validated;
- Command Bearing eligibility output cannot be validated;
- the commit transaction fails.

If the same sent message is retried from the same ingress record, Directive may keep the readied point attached to that ingress. If the player edits or sends a new message, clear the attachment and return the point.

### After Mechanical Commit

Do not refund the point when:

- narration generation fails after mechanics commit;
- chat response posting fails after mechanics commit;
- the host posts a partial response after mechanics commit;
- the user swipes or retries the response prose.

In these cases, the point already improved the authoritative outcome. Recovery should retry, replace, or complete the visible response from the same committed packet without rerolling mechanics or spending another point.

Partial replies should be recorded as response recovery state. The UI should say that response repair is available, not that the spend failed.

## Swipe, Edit, Delete, And Branch Rules

### Swipe Or Retry Narration

Swipes and narration retries keep the same committed outcome id and spend state.

They may improve prose. They do not reroll mechanics, refund the point, or consume an additional point.

### Edit Before Commit

If the player edits or cancels before a committed outcome exists, return the readied point.

### Edit Or Delete After Commit

If the initiating message is edited or deleted after an improved outcome commits, use the ordinary recovery, branch, or replay flow. Do not automatically refund the point.

The visible rule is:

```text
The point is spent once the improved outcome is committed.
```

If a replay restores a pre-turn snapshot onto a new branch, that branch naturally contains the point state from that snapshot. That is branch/replay behavior, not a special refund.

### Thirty-Turn Rewrites

Do not support Command Bearing-specific refunds for deep history edits.

Older edits should use the existing branch/replay/reconciliation model. Command Bearing should not become a timeline editor or a way to test outcomes for free.

## Data Model Direction

Move the implementation from pre-alpha `commandStyle` naming to the `commandBearing` model in place.

Suggested authoritative shape:

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
      awardedDecisionIds[]
    resolve:
      rank
      rankTitle
      marks
      points
      pointCap
      earnedRecords[]
      awardedDecisionIds[]
  reserve:
    capacity
    absoluteCapacity
    lastRecoveryId
  thresholds[]
  awardedSources{}
  spendLedger{}
  recoveryLedger{}
  evidenceLedger{}
  reviewLedger{}
  readied:
    id
    track
    status
    saveId
    chatId
    createdAt
    expiresOn: nextPlayerMessage
```

The `readied` record is player-facing pending intent, not a hidden simulation effect. It should be saved only as needed to survive reloads between readying and sending. It should never deduct points until the spend transaction commits.

Spend ledger records should include:

```text
outcomeId
turnId
ingressId
hostMessageId
readiedId
track
from
to
fit
causalBasis[]
baseOutcomeSummary
finalOutcomeSummary
anchoredConsequences[]
narrationProviderId?
spentAtRevision
responseRecoveryId?
```

Evidence ledger records should include:

```text
evidenceId
sourceTurnId
sourceOutcomeId
arcId?
threadId?
primarySignal
trackSignals[]
strength
criteria{ agency, commitment, causality }
actionSummary
consequenceSummary
playerFacingSummary
relationshipPerceptionIds[]
visible
recordedAtRevision
```

Review ledger records should include:

```text
reviewId
arcId
threadId?
reviewType
evidenceIds[]
criteriaSatisfied{ agency, commitment, causality }
markAwarded
awardedTrack?
awardSummary
marksBefore?
marksAfter?
rankBefore?
rankAfter?
reviewedAtRevision
```

## Implementation Slices

### Slice 1: Contract And Naming

- Rename runtime state, helper APIs, docs, and tests from `commandStyle` to `commandBearing`.
- Keep the current two-track reserve, rank, recovery, and spend helper behavior.
- Update docs that still describe a default post-outcome Command Bearing pause.
- Add `Readied` wording to tips and operator-facing text.

### Slice 2: Assist Module UI

- Add Command Bearing rows to the Assist panel.
- Render point counts, disabled states, and one readied state.
- Add `Ready Inspiration`, `Ready Resolve`, `Cancel`, `Check for Inspiration`, and `Check for Resolve`.
- Keep controls compact and composer-adjacent.
- Do not move Command Bearing runtime status into Settings.

### Slice 3: Fit Check Model Call

- Add a Directive Assist fit-check action that returns structured qualitative feedback only.
- Route it through the appropriate provider lane with strict parser recovery and hidden-output rejection.
- Add deterministic fallback for empty input and obvious non-command text.
- Refuse replacement prose in the output contract.

### Slice 4: Readied Spend Runtime

- Add runtime actions to ready, cancel, attach, return, and consume a point.
- Bind readiness to the active save and bound campaign chat.
- Attach the readied point to the next player ingress only.
- Clear readiness after resolution, cancellation, wrong-chat detection, or abandoned send.

### Slice 5: Turn Pipeline Integration

- Run post-send eligibility only when a point is attached to the ingress.
- Intercept and abort normal SillyTavern generation for consequential readied-point turns.
- Resolve the base outcome without letting the readied point bias the Mission Director.
- Apply the spend in the same transaction as the committed outcome.
- Improve the result by exactly two tiers.
- Preserve anchored consequences.
- Return the point when the base outcome is Success, Great Success, impossible, non-consequential, or track-ineligible.

### Slice 6: Evidence Tracker And Mark Review

- Add committed Command Bearing evidence records for meaningful turns.
- Attach evidence to arc, thread, decision, turn, and outcome ids when available.
- Record player-facing action summaries, visible consequences, track signals, strength, and Agency/Commitment/Causality indicators.
- Add arc-end Mark Review output that gathers evidence and awards Inspiration, Resolve, or no Mark.
- Keep per-turn evidence separate from actual Mark awards.
- Add player-safe relationship perception records when relationship or reputation shifts occur.
- Ensure evidence/review records never expose hidden relationship values, model scores, private NPC thoughts, or raw evaluator output.

### Slice 7: Narration Packet And Provider Integration

- Add a structured Command Bearing outcome-adjustment packet.
- Include Inspiration/Resolve definitions, outcome ladder, base outcome, final outcome, eligibility basis, improvements, and anchored consequences.
- Expand the narration prompt so SillyTavern's narrator/current provider receives full mechanical context.
- Use the active SillyTavern narration context/perspective contract where available.
- Ensure the narrator cannot change the result band, erase costs, invent hidden facts, or write player interiority.
- Keep the current short narrator constraint only as a supplementary guard, not the primary mechanic.

### Slice 8: Recovery And Partial Replies

- Prove pre-commit failures return the point.
- Prove post-commit narration failure keeps the spend and retries from the committed packet.
- Record partial host replies as response recovery, not mechanical failure.
- Make Mission/Assist show repair status without implying the point was lost incorrectly.

### Slice 9: Tests And Live Verification

- Extend command-bearing helper tests for readied state and no-deduct-until-commit.
- Add Assist fit-check parser tests.
- Add chat-turn tests for routine message return, ineligible track return, valid spend commit, Success/Great Success return, and provider failure.
- Add narration-prompt tests proving the Command Bearing packet includes definitions, ladder, base/final bands, improvements, and anchored consequences.
- Add evidence tracker tests proving evidence does not award Marks until an arc-end review.
- Add Mark Review tests for Inspiration award, Resolve award, no award, repeated-award protection, and rank change output.
- Add relationship perception tests proving player-facing cues exist without leaking raw values or private NPC thoughts.
- Add tests proving consequential readied-point turns abort default host generation and post a Directive-owned response.
- Add swipe/retry tests proving mechanics and spend remain fixed.
- Add edit/delete/recovery tests proving no Command Bearing-specific deep refund.
- Add SillyTavern smoke coverage for visible Assist controls and at least one readied-point flow.

## Acceptance Criteria

The user-facing Command Bearing system is ready for alpha testing when:

- the player can see Inspiration and Resolve point counts in Assist;
- the player can ready one point for the next sent message;
- the player can cancel the readied point before sending;
- the player can check current wording for Inspiration or Resolve fit without receiving rewritten prose;
- non-consequential, ineligible, impossible, and already-successful actions return the point;
- valid aligned actions spend the point transactionally and improve the outcome by exactly two tiers;
- anchored consequences survive the spend;
- meaningful committed turns can create player-facing Command Bearing evidence without immediately awarding Marks;
- arc-end reviews gather evidence and award Inspiration, Resolve, or no Mark through committed mechanics;
- relationship or reputation shifts include player-safe perception cues when shown to the player;
- consequential readied-point turns abort normal host generation and produce a Directive-owned response;
- the narrator prompt includes the outcome ladder, track definition, base outcome, final outcome, eligibility basis, improvements, and anchored consequences;
- SillyTavern's configured narrator/current provider can be used for final prose through a controlled narration call;
- provider failure before commit does not consume the point;
- provider failure or partial reply after commit preserves the spend and enters response repair;
- swipes and narration retries do not reroll or refund Command Bearing;
- post-commit edits do not create Command Bearing-specific refunds;
- tests prove the above without relying on hidden prompt bias;
- docs and tips no longer describe a default pause-first Command Bearing flow.

## Non-Goals

This pass should not add:

- retroactive buyer's-remorse refunds;
- deep-history Command Bearing refund tracking;
- automatic player-message rewrites for fit;
- hidden prompt-only success boosts without committed mechanics;
- automatic per-message XP awards;
- passive bonuses from Bearing Rank;
- visible raw fit scores;
- visible raw relationship values or hidden deltas;
- relationship or reputation changes merely because the player used Assist.
