# Fair Discovery and Crew Initiative Design

## Status

Approved V1 architecture design for making hidden-information discovery, competent crew reporting, conditional mission objectives, and consequence evaluation fair without creating another tracking subsystem.

This design is a binding companion to [Unified Story Settlement and Episode Tracking](2026-08-08-unified-story-settlement-design.md). It defines constraints on Mission Director, Command Competence, authored mission data, Story Settlement effects, and player-facing objective projection. It does not create a separate semantic authority, ledger, sidecar, or player-facing tracker.

[Mission State and Objective Resolution](2026-08-09-mission-state-and-objective-resolution-design.md) owns objective lifecycle, evidence reduction, deadlines, mission closure, and next-mission activation. This document constrains those mechanics wherever player knowledge and fair evaluation are involved.

## Decision Summary

Directive tests the player's judgment, not whether the player guessed the investigation or terminology expected by the author.

Hidden story truth may produce credible causal developments in the world. It may not produce evaluative punishment until the player character received enough player-visible information to make an informed choice. Mission failure, objective failure, Command Bearing judgment, relationship judgment, reprimand, or competence criticism must therefore cite committed player knowledge or an explicit informed rejection.

Routine professional work occurs through Command Competence without requiring the player to micromanage trained officers. When that work produces a material player-safe finding, a relevant officer may deliver one bounded Duty Report. Captain-level intervention is a fallback for missing material reports, serious foreseeable risk, or captain-owned authority boundaries; it does not choose the player's moral, strategic, or political answer.

Conditional objectives are derived from committed knowledge. Hidden branches do not appear in the UI, do not count against mission closure, and do not leave visible failed checkboxes. Discoveries and reports remain provisional while their assistant response is swipeable and become authoritative only through accepted-pair source settlement.

## V1 Scope

Ashes of Peace is the only campaign required to become fully V1-native under this contract. Other bundled campaigns may retain catalog teaser metadata such as campaign name and image, but remain greyed out and unselectable. Their legacy mission structures do not constrain the V1 architecture.

V1 includes:

- fair evaluation boundaries for hidden information;
- routine professional discovery work;
- bounded crew Duty Reports;
- captain fallback behavior;
- conditional spoiler-safe objectives;
- mission closure across required, optional, and conditional objectives;
- accepted-pair custody for disclosed knowledge;
- authoring validation and deterministic scenario coverage.

V1 excludes:

- a general hint engine;
- adaptive handholding difficulty;
- a separate awareness or opportunity ledger;
- a per-fact model call;
- automatic promotion of discoveries into emergent quests;
- rewards for routine discovery itself;
- conversion of every discoverable Ashes fact into a bespoke disclosure contract;
- migration of non-Ashes campaign missions into the V1-native contract.

## Core Invariants

### Hidden Information Cannot Grade the Player

An evaluative consequence is valid only when its supporting evidence includes at least one of:

- a committed player-known fact;
- a committed player-visible warning;
- an explicitly accepted or rejected risk;
- an authored routine-professional fact the player character is defined to know and that Directive made visible before the decision;
- a credible player-visible uncertainty that the player knowingly chose to accept.

Absent such evidence, Directive must not:

- fail or downgrade an objective because of the hidden fact;
- withhold mission completion because of the hidden fact;
- reduce trust or characterize the player as negligent;
- award or deny Command Bearing based on the hidden branch;
- display the hidden objective or a missed-opportunity marker;
- let an NPC reprimand the player for failing to discover it.

### Causal and Evaluative Consequences Are Different

Hidden facts may continue to affect an autonomous world. An undiscovered fraud may persist. A concealed attacker may act. An unknown fault may worsen.

Those developments cannot retroactively become player blame. When a hidden fact later becomes visible, narration must present it as new information or a new complication unless the player had previously received a fair warning. World causality may create future choices; it cannot manufacture a past informed choice.

### Professional Competence Is Automatic Where Safe

Command Competence supplies routine, reversible, low-cost, noncontroversial, authorized, intent-consistent, and non-escalatory work. In a rescue this may include logging signals, preserving records, requesting manifests, comparing service records, initiating diagnostics, and alerting relevant departments.

Routine work can produce evidence. It cannot silently perform command judgment, assert success that the adjudicator did not authorize, or expose director-only truth without an eligible causal route.

### Crew Report Findings, Not Answers

A Duty Report communicates a fact, uncertainty, professional implication, or duty-based objection. It may include a recommendation when the player requests counsel or the officer has a duty to object. It must not identify a single correct moral, political, tactical, or strategic answer.

### Accepted Visible Delivery Creates Player Knowledge

Scheduling or prompting a disclosure does not make it player knowledge. The information must reach a player-visible response surface and the selected response must settle through the accepted-pair source boundary.

Knowledge remains provisional while the assistant response is swipeable. A changed swipe, edit, deletion, source replacement, or branch invalidates dependent knowledge and objective projections through the existing CORE, SRE, REPAIR, and Story Settlement custody paths.

## Rejected Complexity

This design deliberately rejects a standalone Fair Discovery service. It also rejects stored lifecycles such as `eligible -> offered -> surfaced -> accepted -> declined -> expired` for every hidden fact.

The target architecture reuses existing owners:

| Concern | Existing owner |
|---|---|
| Authored truth and reveal routes | campaign mission graph |
| Player-character knowledge | campaign knowledge projection |
| Routine professional work and reports | Command Competence |
| Decision and consequence authority | Mission Director and deterministic reducers |
| Accepted semantic evidence and typed effects | Story Settlement |
| Source identity, swipes, edits, branches, and rollback | CORE, SRE, and REPAIR |
| Player-facing mission/objective display | mission projection and UI |

Derived presentation state must not become new durable authority. For example:

- absence from player knowledge means the fact remains hidden;
- a player-safe clue or rumor represents suspicion when needed;
- a confirmed player-known fact represents informed knowledge;
- an objective whose visibility predicate is false remains absent from the player-facing projection;
- a pending report beat is transient control state bound to its response transaction, not semantic history.

## Knowledge Representation

Mission data defines canonical truth separately from player knowledge.

V1 does not require a general `unaware | signaled | informed` enum. When a meaningful distinction is necessary, campaign authors use separate stable facts or an existing rumor/fact distinction:

```json
{
  "id": "hesperus.inspection-record-irregularity",
  "visibility": "discoverable",
  "summary": "The inspection record does not reconcile with the vessel's observed condition."
}
```

```json
{
  "id": "hesperus.inspection-fraud",
  "visibility": "discoverable",
  "summary": "The owner falsified an inspection entry after deferred maintenance."
}
```

The first fact can justify an investigation or warning without pretending the fraud is confirmed. The second supports accountability evaluation after confirmation.

Player statements are evidence of intent, speech, or attempted action. They do not make authored truth known merely because the player asserts it. Adjudication or accepted visible disclosure must establish the result.

## Minimal Authored Disclosure Contract

Most discoverable facts require no additional disclosure metadata. The safe default is:

- the fact remains hidden until grounded evidence reveals it;
- it creates no player-facing objective while hidden;
- it creates no evaluative consequence while hidden;
- failure to discover it cannot block mission closure.

Only a discoverable fact that gates a consequential decision, required objective, or negative evaluation needs an explicit fairness contract.

```json
{
  "factId": "hesperus.inspection-fraud",
  "revealWhen": {
    "eventOccurred": "hesperus.records-reviewed"
  },
  "reporterRoles": ["operations", "security"],
  "requiredBeforeDecisionId": null
}
```

`revealWhen` uses Directive's existing predicate vocabulary. `reporterRoles` identifies professional capability before named performance; campaign character data may supply preferred performers and voice. `requiredBeforeDecisionId` is null for an optional branch.

For material knowledge that must precede a player judgment:

```json
{
  "factId": "mission.reactor-containment-failing",
  "revealWhen": {
    "factKnown": "mission.engineering-assessment-complete"
  },
  "reporterRoles": ["engineering"],
  "requiredBeforeDecisionId": "decision.evacuate-or-contain"
}
```

The dependent decision cannot receive evaluative adjudication until the required disclosure has visibly settled. If delivery fails, Directive holds that judgment and schedules a bounded recovery beat rather than guessing that the player knew.

## Conditional Objective Contract

Conditional objectives use existing mission ownership and derived visibility:

```json
{
  "id": "objective.hesperus-accountability",
  "playerText": "Address the falsified inspection record.",
  "optional": true,
  "visibleWhen": {
    "factKnown": "hesperus.inspection-fraud"
  }
}
```

Rules:

- Hidden conditional objectives are omitted, not shown as locked or redacted rows.
- Optional objectives do not count toward required mission closure.
- A surfaced optional objective may terminate as completed, handed off, knowingly declined, waived, failed after informed action, or expired after a clearly communicated opportunity.
- A player may complete a mission while an optional branch remains unactivated.
- A conditional objective required for later campaign progression must have a reachable mandatory disclosure route; it cannot remain optional and later become a retroactive failure.
- Mission summaries must distinguish primary mission outcome from optional branch disposition rather than flattening every dimension into one failure label.

## Crew Initiative

### Duty Report Selection

Command Competence selects a reporter by:

1. required professional capability or billet;
2. access to the evidence source;
3. current presence or plausible communications access;
4. mission-authored preference;
5. character voice and relationship context.

Named character IDs may express Ashes preferences, but capability roles remain the durable contract so future campaigns can use different command structures.

The existing report economy applies. One relevant Duty Report is the normal maximum for one disclosure beat. Additional officers speak only when their domains materially disagree, the player requests counsel, or a serious duty-to-object condition exists.

Reports are deduplicated by fact or disclosure identity. Rewording the same finding must not create a new fact, objective, episode, memory, or relationship event.

### Captain Fallback

The campaign identifies its captain or equivalent command-support role. In Ashes this is Captain Mara Whitaker.

The captain may intervene when:

- a required professional report is missing before a consequential decision;
- a serious or critical known risk remains unaddressed;
- the decision crosses captain-owned legal or command authority;
- the player explicitly requests captain-level counsel.

The intervention ladder is:

1. ask the relevant officer for the missing report;
2. ask the player a pointed, non-prescriptive question;
3. state a captain-owned constraint or counteroffer;
4. issue a direct order only when captain authority and the seriousness of the situation justify it.

Whitaker must not reveal unsupported director truth, resolve ordinary XO decisions, repeatedly rescue the player from informed choices, or become a quest-marker voice. Her mentorship is expressed through bounded autonomous command behavior, not a hidden handholding score.

## Delivery and Transaction Flow

```text
accepted player intent or routine professional action
    -> evidence proposal with source identity
    -> deterministic fact and predicate validation
    -> authorized disclosure beat
    -> relevant officer report in a player-visible response
    -> selected response remains provisional while swipeable
    -> next player ingress settles the accepted response pair
    -> player knowledge effect commits
    -> conditional objective projection becomes visible
    -> later decisions may cite that knowledge for evaluation
```

The model may interpret freeform prose and propose evidence. Code validates known identifiers, reachable predicates, allowed transitions, source hashes, and current branch state. Phrase matching is not semantic authority.

Compound actions are resolved in causal order. For example, "Review the records, and if they are falsified, preserve them and notify the inspector general" means:

1. attempt the records review;
2. determine whether the evidence supports disclosure;
3. apply the explicitly conditional follow-up only if its condition becomes true and the action is feasible.

The player cannot force a discovery by declaring its result, but may issue sensible conditional orders without waiting through unnecessary conversational turns.

## Proving Visible Delivery

An authorized prompt instruction alone is insufficient evidence that the model actually informed the player.

Optional discoveries may remain model-rendered. If the narrator omits one, the fact stays hidden and no penalty follows.

A disclosure required before evaluative judgment must include a deterministic player-safe disclosure segment bound to the visible response identity. Its canonical delivery surface is a compact Duty Report block attached to the relevant assistant chat row. It is transient scene information, not a new page, modal, popup, objective, or durable tracker. The active Mission view may mirror the report while it remains relevant, but that mirror is not delivery authority. Narration may integrate or elaborate the report, but the minimum fact and confidence statement must be visibly present independent of free-prose compliance.

The delivery record contains only the disclosure ID, fact ID, speaker ID or role, response identity, visible-text hash, source transaction, and disclosure contract version. It is transaction evidence, not a story entry. Player knowledge commits only after the response variant settles.

## Hesperus Reference Behavior

### Initial Player-Facing Mission

The Hesperus phase initially presents only spoiler-safe rescue goals such as:

- assess the emergency and passenger risk;
- protect passengers and crew;
- secure a safe disposition for the vessel.

Its phase summary, objectives, and UI must not mention falsified records before disclosure.

### Routine Work and Discovery

A competent rescue response may automatically begin engineering diagnostics and retrieve registration, inspection, and service records. If those sources produce a mismatch, Priya or another qualified officer reports the irregularity. Engineering or Security may provide a supporting implication when materially distinct. Whitaker may request the report if the issue is decision-critical and the normal chain stalls.

The first report can establish an irregularity without immediately proving intent. Further evidence may confirm fraud. The accountability objective appears only when its configured knowledge predicate becomes true.

### Outcome Matrix

| Player-visible state and action | Primary rescue result | Accountability result | Evaluation |
|---|---|---|---|
| Passengers and crew saved; fraud never surfaced | success | not activated | no penalty and no missed-objective display |
| Irregularity surfaced; player preserves records and hands off review | success | responsibly handed off | valid mission closure |
| Fraud confirmed; player responds proportionately | success | resolved | may qualify for Command Bearing based on judgment, not discovery |
| Fraud confirmed; player knowingly ignores or conceals it | rescue may still succeed | informed accountability failure or waiver | fair causal and evaluative consequences |
| Player prioritizes accountability despite a known, preventable passenger danger | partial or failed rescue | varies | consequence follows the known priority choice |
| Fraud remains hidden and later causes a world development | prior rescue remains successful | new complication | no retroactive blame |

Not discovering the fraud is not itself partial success. Partial success describes an incomplete primary rescue, accepted known cost, or mixed informed outcome. A dormant optional branch does not reduce the primary result.

## Command Bearing Boundary

Routine diagnostics, automatic records review, crew reporting, fact discovery, and objective activation do not award Command Bearing.

Once informed, the player's handling of a meaningful command decision may qualify under the separate Command Bearing contract. The award must cite the committed decision and relevant knowledge, not the existence or completion of the optional objective. A player who never encounters the branch sees no missing point, penalty, rank loss, or implied failure.

## Failure Handling

### Model Omits an Optional Report

Leave the fact hidden. Do not activate the objective or evaluate the branch.

### Model Omits a Required Report

Do not evaluate the dependent decision. Render or schedule the deterministic player-safe disclosure segment, then resume decision handling after visible settlement.

### Model Proposes an Unsupported Discovery

Reject the fact transition. Preserve the player's attempted investigation and narrate only supported uncertainty or failure.

### Reporter Is Unavailable

Select another actor with the required capability and evidence access, use a plausible communications route, or defer the report. Do not grant knowledge from an unavailable source.

### Player Rushes Toward Closure

Optional undiscovered branches remain dormant. Required missing knowledge invokes one bounded Duty Report or captain fallback before evaluative closure.

### Provider or Settlement Failure

Fail safely for the player. Preserve independently committed mechanics, keep the disclosure uncommitted, omit the conditional objective, and retry or recover through the existing transaction path. Do not infer awareness from provider intent.

### Source Mutation

Invalidate the delivery, dependent knowledge effect, objective projection, and downstream evaluation when their source response is swiped, edited, deleted, superseded, or excluded by a branch. Rebuild from remaining valid evidence.

## Authoring Validation

The Ashes V1 campaign validator must reject:

- a required objective gated by an unreachable fact;
- a required or negative decision consequence without sufficient player-knowledge evidence;
- a mandatory disclosure without a reachable reveal predicate;
- a mandatory disclosure without a valid capability role and player-safe summary;
- a player-facing phase summary or objective that names a hidden fact;
- a reveal route that depends circularly on the objective or decision it unlocks;
- an optional objective that blocks required mission closure;
- a director-only fact included in a player-visible report or objective;
- a discovery contract that can silently treat scheduled delivery as settled knowledge;
- a non-Ashes campaign marked V1-selectable without completing the same validation contract.

The validator should report stable IDs and dependency paths so authors can repair the campaign rather than interpret a generic schema failure.

## Testing Strategy

### Contract Tests

- default undiscovered facts produce no objective or evaluative consequence;
- `revealWhen` accepts the existing predicate vocabulary and rejects unknown identifiers;
- capability-role reporter selection is deterministic and respects evidence access;
- mandatory disclosure delivery is bound to one visible response identity;
- scheduled but undelivered disclosure does not create player knowledge;
- optional objectives do not block required mission closure;
- informed decline and handoff are valid terminal dispositions;
- director-only facts cannot enter player-safe reports.

### Freeform Scenario Tests

- direct investigation, indirect investigation, delegated investigation, and terse procedural prose reach the same eligible evidence state;
- a player who never requests records is not penalized for omitted routine work;
- a player can issue a conditional order in the same turn as an attempted discovery;
- a player assertion of success does not create unsupported knowledge;
- player metagame language does not become character knowledge;
- absent preferred officers fall back by capability without changing truth;
- repeated NPC paraphrases do not duplicate facts or objectives;
- Whitaker asks for a missing report without choosing the player's response.

### Hesperus Scenario Tests

- rescue success with no fraud disclosure closes successfully and shows no fraud row;
- accepted Priya disclosure activates the optional accountability objective;
- swiping away the disclosure prevents knowledge and objective activation;
- evidence handoff closes accountability without requiring full investigation;
- proportionate informed action can support a Command Bearing review;
- knowing concealment can create accountability consequences without rewriting rescue success;
- later fraud consequences do not retroactively mark the rescue failed;
- the mission page remains spoiler-safe before disclosure.

### Recovery and Branch Tests

- edit, delete, swipe, replacement, and branch invalidate only dependent disclosure state;
- Save As inherits only pre-fork accepted knowledge;
- stale async discovery proposals fail source-hash and revision checks;
- restart restores accepted delivery without duplicating the report;
- provider failure cannot fabricate a fact, objective, punishment, or award.

### Authoring Lints

- every required decision knowledge dependency has at least one reachable disclosure route;
- every negative evaluation cites committed awareness or informed risk;
- no visibility dependency cycle exists;
- every mandatory report has a player-safe capsule and capable reporter route;
- campaign selection exposes only Ashes as V1-native.

## Acceptance Criteria

The V1 contract is satisfied only when:

1. Hidden facts cannot create player-facing objectives, evaluation, punishment, or mission blockage.
2. Causal hidden-world developments remain possible without retroactive blame.
3. Routine professional work can produce grounded evidence without player micromanagement.
4. Crew reports preserve command judgment and obey report-economy limits.
5. Captain intervention is a bounded fallback grounded in command responsibility.
6. Player knowledge requires accepted visible delivery and remains correct across swipes, edits, deletes, and branches.
7. Conditional objectives are derived from knowledge and do not create another ledger.
8. Required decision knowledge has a reachable and provable disclosure path.
9. Optional undiscovered branches do not reduce mission success or display missed rewards.
10. Command Bearing evaluates informed judgment, never routine discovery.
11. Hesperus passes the spoiler-safe, rescue-first, partial-outcome, and accountability scenario matrix.
12. Ashes is the only selectable V1-native campaign; other campaign cards are teaser-only.

## Final Architectural Rule

Fair Discovery is a constraint on existing authorities, not a new authority.

Keep truth in authored campaign data. Keep player knowledge in the knowledge projection. Let Command Competence perform routine work and surface professional findings. Let Mission Director evaluate only informed choices. Let Story Settlement retain accepted meaning once. Let CORE, SRE, and REPAIR preserve exact source custody.

The world may surprise the player. Directive may not blame the player for information it never fairly gave them.
