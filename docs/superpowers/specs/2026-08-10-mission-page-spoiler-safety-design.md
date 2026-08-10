# Mission Page Spoiler Safety Design

## Goal

The Mission page must never be the first place a player learns a story fact. Every mission summary, visible objective, known-information item, clock, capability, outcome, and terminal message must be limited to information already established by the opening story, an accepted assistant/player pair, or an accepted prior-mission transition.

## Root Cause

Mission facts and conditional objectives already use authoritative visibility state: `worldFacts` records truth, `knownFacts` records disclosed truth, and the player projection filters facts and objective visibility through that state. Two authored surfaces bypassed or misused this boundary:

- `definition.playerText.summary` is projected unconditionally, so the Prelude summary exposed the Hesperus distress before `fact.hesperus.distress-established` was disclosed.
- `fact.prelude.poker-invitation` was marked `visibility: "known"`, causing Kieran's invitation to enter `knownFacts` at campaign creation even though the opening story had not delivered it.

The existing package linter's generic spoiler-term list detects only a few historical words and did not cover semantic leaks such as a named ship, system, person, target, or investigative conclusion.

## Approved Behavior

- The Prelude opens with no Known Information items.
- Its mission summary names only the transit, command handover, working command rhythm, and arrival already established by the campaign opening.
- Hesperus remains absent until its distress is disclosed through accepted story evidence.
- Kieran's invitation remains absent until accepted assistant prose explicitly gives the invitation. It is an initially true world fact, not initially known player knowledge.
- A focused audit revises every immediately visible Ashes of Peace mission summary or objective that currently states a conclusion beyond that mission's entry knowledge.
- Existing fact, objective, clock, capability, outcome, and terminal projection gates remain authoritative. No legacy path, migration, compatibility layer, or new tracker is added.

## Campaign-Wide Content Audit

The initial projection audit found entry leaks requiring correction in these missions:

- **Prelude: A Ship Underway:** remove Hesperus from the unconditional summary and remove the premature Kieran known fact.
- **Dead Letters:** avoid announcing the message system, personal archive material, or dangerous-system custody before discovery.
- **The Colony That Stayed:** avoid announcing the interface or dangerous technology before the opening Demeris record establishes either.
- **Old Lessons:** avoid presupposing an operation or announcing the diversion's target, operator evidence, authentication target, or wider-system relationship before investigation.
- **The Cost of Knowing:** avoid naming Farwatch's conduct or an authenticated-path crisis before the opening classified confrontation establishes those conclusions.

The remaining mission-entry summaries and objectives describe either the accepted prior mission result, the current opening crisis, or choices explicitly present in the initial known projection and require no wording change.

## Data Flow

1. `createMissionState()` places every initially true fact in `worldFacts`, but only `visibility: "known"` facts in `knownFacts`.
2. The accepted-pair interpreter proposes a `factDisclosed` claim only when accepted story text explicitly establishes an eligible discoverable fact.
3. The mission reducer adds an accepted disclosure to `knownFacts` and recalculates objective visibility.
4. `createMissionPlayerProjection()` includes only known non-hidden facts and objectives whose state visibility is `visible` or `resolved`.
5. The Mission panel renders only that projection.

Kieran's invitation will follow this normal path: initially true plus discoverable, eligible for an explicit assistant disclosure claim, absent before disclosure, and visible afterward.

## Verification

- A focused projection regression test must fail against the current package because the initial Prelude projection contains Hesperus and Kieran.
- The same test must prove Kieran remains absent initially and appears after an accepted `factDisclosed` claim.
- The Ashes campaign gate must positively snapshot the complete initial player-facing text for all thirteen missions and every capability-bearing entry context, so any future entry-copy change requires explicit review.
- The full `npm.cmd test` alpha gate must pass, including all mission contracts and authored scenarios.
- A final initial-projection audit must show the Prelude has no Known Information and no Hesperus text before disclosure.
