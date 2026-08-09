# Mission State and Objective Resolution Design

## Status

Approved target V1 architecture for spoiler-safe objectives, evidence-backed state reduction, mission closure, authored deadlines, and deterministic transition into the next phase or mission.

This design is bound by [V1 Gameplay Architecture](../../architecture/V1_GAMEPLAY_ARCHITECTURE.md), [Unified Story Settlement](2026-08-08-unified-story-settlement-design.md), and [Fair Discovery and Crew Initiative](2026-08-09-fair-discovery-and-crew-initiative-design.md).

It defines target behavior. Existing mission graphs and runtime trackers remain current/as-coded until the [Ashes V1 Migration Plan](../../planning/ASHES_V1_MIGRATION_PLAN.md) converts them.

## Decision Summary

Directive must understand freeform play without trusting either prose or a model to complete objectives.

The model-facing interpretation layer proposes a small set of typed evidence claims and cites the accepted source that supports each claim. Deterministic code rejects stale, impossible, duplicate, hidden, or unsupported claims, then evaluates authored predicates and applies allowed transitions. Player text can establish intent, speech, consent, or an attempted action. It cannot establish its own success.

Objectives are a graph of independently evaluable conditions, not a displayed checklist order. Required objectives define mission closure. Optional objectives enrich the result but do not block primary completion. Conditional objectives do not exist in the player projection until their visibility predicate is satisfied. A mission may therefore close successfully even when a hidden optional branch was never discovered.

Code owns completion and next-mission activation. After committing the transition, it sends the narrator an authorized packet that explains what changed and what may be narrated.

## Goals

- Accept varied player prose, tactics, and ordering.
- Make player-visible objectives clear without exposing hidden plot.
- Produce explainable objective state from committed evidence.
- Support required, optional, and conditional work without railroading.
- Permit partial, mixed, handed-off, waived, and informed-failure outcomes.
- Close missions deterministically when authored conditions are satisfied.
- Trigger the next phase or mission exactly once.
- Display urgency only when an actual authored deadline exists.
- Remain safe across swipes, edits, deletions, branches, retries, and provider failures.
- Keep mission state as a projection from authored data and Story Settlement effects, not a competing story ledger.

## Non-Goals

- Phrase lists that attempt to recognize every way a player may act.
- Model authority to create objective IDs or commit state.
- A universal linear quest checklist.
- Numeric progress percentages for objectives that do not have authored quantities.
- Failed rows for secrets the player never discovered.
- Automatic quests for every emergent detail.
- Command Bearing rewards for routine task completion.
- A timer derived from dramatic language alone.
- Migrating non-Ashes campaign gameplay for V1.

## Ownership

| Concern | Owner |
|---|---|
| Objective definitions, predicates, outcome dimensions, reveal routes, clocks, transitions | campaign package |
| Player source, selected swipe, edit/delete/branch identity | SillyTavern host source plus CORE/SRE/REPAIR custody |
| Freeform semantic proposal | bounded model interpretation |
| Evidence validity, objective reduction, clocks, closure, activation | deterministic mission engine |
| Accepted semantic effect provenance | Story Settlement |
| Player knowledge and fair evaluation | campaign knowledge projection under Fair Discovery |
| Player-facing objective and deadline display | Mission projection and UI |
| Committed-result prose | narrator using an authorized transition packet |

No owner may silently assume another owner's authority.

## Stable Identity

Every mission, phase, objective, fact, event, outcome dimension, clock, decision, and transition has a stable package-scoped ID. Labels and player text may change without changing identity.

An ID may be referenced only when it exists in the active package version. The reducer never accepts model-invented IDs and never falls back to fuzzy matching an unknown ID.

Save data records the package version and contract version under which state was committed. Package updates require validation or migration rather than silent reinterpretation.

## Mission Definition

A V1 mission definition has this conceptual shape:

```json
{
  "kind": "directive.missionDefinition.v1",
  "id": "mission.prelude-a-ship-underway",
  "playerText": {
    "title": "Prelude: A Ship Underway",
    "summary": "Complete the command handover and depart for the Asterion Reach."
  },
  "objectives": [],
  "outcomeDimensions": [],
  "clocks": [],
  "closeWhen": {},
  "terminalDispositions": [],
  "transitions": []
}
```

The exact storage schema is an implementation design. The semantic requirements in this document are normative.

## Objective Contract

### Classification

Each objective declares exactly one class:

- `required`: participates in the mission's primary closure predicate.
- `optional`: visible or discoverable work that can enrich the result but never blocks primary closure.
- `conditional`: absent until an authored activation or visibility predicate becomes true. Once activated, it also declares whether it behaves as required or optional for the currently active mission scope.

V1 should prefer conditional-optional branches. A conditional-required objective is valid only when its activation route is mandatory, reachable, player-visible, and guaranteed before the mission can close. It cannot be a concealed surprise requirement.

### Mechanical State and Player Visibility

Mechanical state and presentation are separate.

An objective's internal lifecycle may include:

- `inactive`: activation predicate is false;
- `available`: the player may pursue it;
- `inProgress`: committed evidence shows material progress but no terminal disposition;
- `terminal`: one authored disposition has been committed.

Player visibility is derived independently:

- `hidden`: omitted from all player-facing counts and lists;
- `visible`: shown with spoiler-safe text;
- `resolved`: shown with its player-safe terminal result when it was previously visible or when the resolution itself becomes known.

The UI must never expose `inactive`, hidden IDs, hidden counts, or redacted placeholders.

### Terminal Dispositions

An objective declares the subset of dispositions it supports. V1 vocabulary includes:

- `completed`;
- `completedWithCost`;
- `handedOff`;
- `knowinglyDeclined`;
- `waived`;
- `failedAfterInformedAction`;
- `expiredAfterKnownDeadline`.

These are mechanical categories, not necessarily literal UI labels. An undiscovered conditional objective has no terminal disposition and is not treated as failed, missed, or declined.

Required closure predicates explicitly state which dispositions satisfy them. For example, a required rescue objective might accept `completed`, `completedWithCost`, or an authored `handedOff` route. The engine does not assume that every non-`completed` result is failure.

### Spoiler-Safe Text

Every visible state has authored player text that reveals only what the player knows. A hidden fraud branch cannot appear as “Resolve the Hesperus maintenance fraud,” “Unknown objective,” a hidden count, or a suspicious gap in numbering.

When a clue becomes known, the package may reveal a new objective such as “Review the Hesperus inspection discrepancies.” When fraud is confirmed, that same stable objective or an authored successor may present “Address the falsified inspection record.” The projection must not expose confirmation before the fact is committed.

## Non-Linear Dependency Semantics

Objective availability and completion use predicates over committed state, not list position.

Supported predicate inputs may include:

- accepted facts known to the player;
- world facts eligible for internal causal evaluation;
- committed events;
- accepted decision outcomes;
- objective states and dispositions;
- clock states;
- mission or phase identity;
- explicitly authored resource or capability state.

Predicates must be declarative, side-effect free, deterministic, and explainable. They may use conjunction, disjunction, negation where safe, and explicit cardinality. They must not execute model calls or inspect uncommitted chat text.

Array order is display preference only. It never creates dependency. If Objective C requires A, the package says so in C's predicate. If A, B, and C are available in parallel, the UI presents them as parallel work and accepts any order.

Cycle validation is required. Cycles are legal only when the author declares a stable convergence rule; the V1 default is to reject dependency cycles.

## Evidence Contract

### Evidence Proposal

The bounded interpretation layer may propose:

```json
{
  "kind": "directive.missionEvidenceProposal.v1",
  "branchId": "save-id",
  "missionId": "mission.prelude-a-ship-underway",
  "baseRevision": 42,
  "claims": [
    {
      "claimId": "proposal-local-1",
      "effectType": "eventOccurred",
      "targetId": "hesperus.survivors-transferred",
      "sourceRefs": [
        {
          "messageId": "host-message-id",
          "selectedSwipe": 1,
          "textHash": "sha256",
          "evidenceExcerpt": "Transporters report the final survivor aboard."
        }
      ],
      "confidence": "high"
    }
  ]
}
```

`confidence` may control rejection or review policy but cannot make weak evidence authoritative. Evidence excerpts are bounded diagnostics, not a duplicate transcript.

### What Player Prose Can Prove

Player prose may directly support:

- an instruction was given;
- a question was asked;
- an offer, refusal, promise, or acceptance was expressed;
- a method was attempted;
- the player knowingly chose among disclosed risks.

It does not directly support:

- the ordered action succeeded;
- an NPC complied;
- a scan found a specific authored truth;
- a technical repair worked;
- an objective completed;
- an elapsed duration passed;
- a hidden fact became known.

Those results need authoritative adjudication or player-visible narration that survives accepted-pair settlement.

### Validation Pipeline

For each proposal, deterministic code validates in this order:

1. contract version and structural shape;
2. active branch, mission, phase, package version, and base revision;
3. source message existence, selected swipe, hash, and accepted-pair status;
4. target identity and effect type allowlist;
5. source role eligibility for the claimed fact;
6. authored preconditions and feasibility;
7. player-knowledge and Fair Discovery constraints;
8. duplicate or already-superseded effect identity;
9. objective predicate consequences;
10. closure, clock, and transition consequences.

Invalid claims are rejected individually when safe. One malformed optional claim should not discard unrelated valid claims. A proposal with stale branch or source custody is rejected as a whole.

The reducer records rejection reason codes for diagnostics. Rejected prose is not converted into a best guess.

### Idempotency

Committed effects use stable keys derived from branch, source identity, effect type, and target identity. Replaying a response, retrying a provider call, reopening the UI, or re-running projection cannot apply the same transition twice.

Reducer transactions use compare-and-swap revision checks. A stale asynchronous result is discarded and may be recomputed against the new revision.

## Reduction Order

One accepted transaction reduces in causal order:

1. validate source custody;
2. commit eligible facts, events, and outcomes;
3. commit visible disclosures and player knowledge;
4. evaluate objective activation and visibility;
5. evaluate objective progress and terminal dispositions;
6. advance eligible clocks from authoritative time effects;
7. apply clock expiry consequences;
8. evaluate mission outcome dimensions;
9. evaluate mission closure;
10. commit the terminal mission disposition;
11. activate the authorized next phase or mission exactly once;
12. write typed effect references into the active Story Settlement episode;
13. emit projection updates and an authorized narrator packet.

This order prevents an objective from being punished for knowledge revealed only after the decision and prevents narration from racing ahead of committed state.

## Mission Outcome and Closure

### Outcome Dimensions

A mission result is not one percentage. Packages define a small number of meaningful dimensions, such as:

- lives protected;
- primary duty fulfilled;
- damage or cost incurred;
- evidence preserved;
- optional accountability pursued;
- diplomatic or crew consequences.

Dimensions are calculated from committed facts and objective dispositions. They support concise mixed outcomes without converting every observation into a score.

### Closure Predicate

`closeWhen` is an authored predicate over required objectives, terminal events, and permitted exceptional exits. It is evaluated after every accepted transaction and clock consequence.

A mission remains active while any closure-required condition is neither satisfied nor validly terminal. It closes when one authored terminal mission disposition is selected. Closure is idempotent and irreversible within a source branch except through source invalidation and reconstruction.

Optional objectives:

- do not block closure;
- may already be terminal at closure;
- may be explicitly handed off into later campaign state when authored;
- may be waived by the mission transition;
- may remain unactivated and invisible;
- do not become “missed” merely because the mission ended.

### Mission Terminal Dispositions

Packages define player-safe terminal outcomes such as:

- `primarySuccess`;
- `primarySuccessWithCost`;
- `mixedResolution`;
- `orderlyWithdrawal`;
- `failedAfterInformedChoice`;
- `supersededByCampaignEvent`.

Names are stable internal IDs with authored presentation. The mission cannot use a failure disposition whose evidence depends on information that was hidden from the player.

### Next Phase or Mission

Transitions are authored and predicate-gated. The reducer chooses at most one transition by explicit priority and mutual-exclusion rules. Ambiguous eligible transitions are an authoring error, not a model choice.

Activation occurs in the same transaction as closure or through a durable pending transition when campaign design requires a narrated interlude. In either case:

- the source mission cannot reactivate itself;
- the target activates once;
- save/reload cannot duplicate activation;
- an omitted narration cannot strand the campaign;
- narration cannot activate a different target.

## Authorized Mission Transition Packet

After deterministic commitment, the narrator receives a player-safe packet shaped conceptually as:

```json
{
  "kind": "directive.missionTransitionNarration.v1",
  "sourceMissionId": "mission.hesperus-diversion",
  "sourceDisposition": "primarySuccess",
  "committedEffects": [],
  "playerKnownOutcomeSummary": [],
  "optionalOutcomeSummaries": [],
  "unresolvedPlayerKnownConsequences": [],
  "next": {
    "kind": "phase",
    "id": "phase.command-review",
    "playerSafeSetup": "Return to the command handover and readiness review."
  },
  "mustNarrate": [],
  "mustNotReveal": []
}
```

The narrator may choose voice, pacing, sensory detail, dialogue, and scene framing consistent with the packet. It may not change the disposition, invent an objective result, reveal hidden optional outcomes, reopen the mission, or select another transition.

If narration fails, state remains committed. Directive retries or supplies a local factual fallback from the packet. It does not roll back a valid mission transition merely because prose generation failed.

## Deadlines and Urgency

### Clock Contract

A player-facing deadline requires:

- a stable clock ID;
- an authored unit and deterministic conversion policy;
- a start predicate;
- an advance source tied to authoritative time or discrete events;
- optional pause and resume predicates;
- an expiry predicate;
- an authored consequence at expiry;
- a player-visibility predicate;
- player-safe deadline and consequence text.

A clock can be internal and causal while hidden, but it cannot produce evaluative blame for a deadline the player was not made aware of. If a hidden world event is time-sensitive, the player may later face the new situation without being graded for missing an undisclosed timer.

### State

Clock state is one of:

- `notStarted`;
- `running`;
- `paused`;
- `expired`;
- `resolved`.

The reducer records authoritative start value, current value, last advancement source, and expiry effect. Wall-clock time does not advance story time unless the campaign explicitly authors real-time behavior, which Ashes V1 does not require.

### Player Presentation

The Mission UI displays a clock only after its visibility predicate is satisfied. It shows a stable player-facing value such as “18 minutes remaining” or “Before 0600 ship time,” plus a concise consequence when known.

The UI must not show:

- “0 minutes remaining” for a missing or invalid clock;
- an urgency block without a clock;
- approximate time presented as exact;
- a hidden clock count;
- a timer that advances independently of authoritative campaign time.

Narrative pressure without a deadline appears in mission framing, crew dialogue, or current risks, not in timer chrome.

## Hesperus Reference Mechanics

Hesperus demonstrates primary success with an optional discovery branch.

Initially visible work may include:

- render aid to the distressed vessel;
- stabilize the immediate hazard;
- account for the crew;
- preserve a safe route back to the Breckenridge's command handover.

Routine professional work includes recording the distress call, obtaining the manifest, preserving service records, and comparing observed condition with records when operationally relevant. The player need not utter a magic request for “fraud.”

Rescue completion depends on accepted rescue evidence. It does not depend on uncovering fraud.

The inspection discrepancy fact may become known through grounded evidence. Only then can a spoiler-safe investigation objective appear. Confirmation of falsification may activate an optional accountability objective. That objective may resolve through direct action, preservation and handoff, a knowing decision not to pursue, or informed failure where authored.

Representative outcomes:

| Rescue | Fraud knowledge | Accountability | Primary result | Optional result |
|---|---|---|---|---|
| succeeds | undiscovered | unactivated | full primary success | absent, no penalty |
| succeeds | suspected only | handed off for review | full primary success | prudent handoff |
| succeeds | confirmed | proportionately addressed | full primary success | accountability achieved |
| succeeds | confirmed | knowingly ignored | full primary success | informed optional consequence |
| fails after informed command choice | any | any | authored mixed or failed result | evaluated separately |

Captain Whitaker or an eligible crew officer may surface a material report through the Fair Discovery contract. They do not force a particular solution. Command Bearing may be awarded only for an authored, adequately informed command judgment; discovery itself and rescue checkbox completion do not automatically award it.

## Recovery and Invalidations

### Provider Failure or Malformed Proposal

No semantic mutation occurs from an invalid proposal. Deterministic effects already supported by exact runtime events may still proceed. Optional interpretation may retry within a bounded policy or wait for the next settlement opportunity.

### Narrator Omission

If the narrator omits a required player-visible disclosure, the fact is not player-known. A required decision is held or receives a bounded recovery report. A mission transition already committed may use a deterministic fallback summary.

### Stale Evidence

Evidence whose base revision, message hash, selected swipe, branch, or mission no longer matches is rejected. The system does not patch the claim onto the new source.

### Swipe, Edit, Delete, or Branch

Source mutation invalidates every dependent fact, objective disposition, clock effect, closure, transition, and projection after the affected source boundary. CORE/SRE/REPAIR reconstruct from surviving authoritative source. The player is not asked to reconcile records manually.

### Premature Closure

If closure was derived from invalid evidence, reconstruction removes the terminal effect and any descendant activation before recalculating. This is a source-custody correction, not an ordinary “reopen mission” action.

### Projection Failure

Committed state remains authoritative. UI projection retries from current state and may show a concise unavailable/error state without inventing progress.

## Authoring Validation

V1 validation rejects or flags:

- duplicate or missing stable IDs;
- references to unknown facts, events, objectives, clocks, or transitions;
- dependency cycles without an explicit convergence rule;
- required objectives with no reachable satisfying disposition;
- conditional-required objectives without mandatory visible activation;
- hidden objectives included in initial player text, counts, or summaries;
- optional objectives included in primary closure unless explicitly converted by a fair visible condition;
- objective failure supported only by hidden facts;
- deadlines without start, advancement, visibility, expiry, or consequence rules;
- multiple simultaneously eligible transitions without deterministic priority;
- transition targets that are missing or unreachable;
- outcome dimensions whose evidence cannot be explained;
- model-defined arbitrary predicate code.

Static validation is necessary but insufficient. Scenario matrices must prove reachable behavior under different action order, phrasing, optional discovery, and time outcomes.

## Testing Strategy

### Contract Tests

- validate every objective classification, state, disposition, predicate, and transition;
- reject unknown IDs, stale revisions, bad source hashes, and unsupported effect types;
- prove idempotent reduction and activation;
- prove hidden objective omission from projection and counts;
- prove player prose cannot self-certify success.

### Prose Variation Tests

Equivalent intent is expressed as direct orders, questions, dialogue-heavy prose, terse commands, technobabble, and indirect delegation. Interpretation may vary in confidence, but valid supported actions converge on the same authored evidence types.

### Non-Linear Tests

Complete parallel objectives in every valid order, combine several actions in one turn, revisit earlier work, hand work to crew, and skip optional branches. Required closure must depend on state rather than display sequence.

### Fairness Tests

Run with fraud undiscovered, suspected, confirmed, reported late, omitted by narration, and invalidated by swipe. Primary rescue success remains independent. Negative optional evaluation appears only after committed visible knowledge.

### Deadline Tests

Cover not started, visible running, hidden causal, paused, resumed, advanced, expired, resolved before expiry, invalid time source, save/reload, and branch reconstruction. No phantom zero-minute urgency may render.

### Transition Tests

Cover successful closure, mixed closure, provider failure after commit, narrator omission, retry, save/reload, and invalidation across the closure boundary. Exactly one correct target activates.

## Acceptance Criteria

- Every objective has a stable identity, explicit class, visibility rule, and supported terminal dispositions.
- Hidden conditional objectives are absent from player display and counts.
- Objective order is determined only by predicates, never array order.
- Freeform player prose can be interpreted without phrase matching being state authority.
- Every committed objective change cites accepted, current evidence.
- The model cannot create identifiers, apply transitions, close a mission, or activate the next mission.
- Player assertions cannot prove success.
- Optional undiscovered content cannot block or downgrade primary closure.
- Hesperus rescue can reach full primary success without fraud discovery.
- Known optional choices can produce positive, neutral, or negative consequences without rewriting primary rescue success.
- Required closures and next transitions are deterministic, explainable, idempotent, and branch-safe.
- Only authored visible deadlines render countdown UI.
- Provider or narrator failure cannot corrupt committed state or strand progression.
- Swipe, edit, delete, and branch recovery remove dependent state exactly.
- Mission projection can explain every visible objective state from player-safe committed evidence.

## Final Architectural Rule

Models recognize possible meaning; accepted evidence proves it; deterministic mission code decides what changes; Story Settlement records why; the UI reveals only what the player is allowed to know.
