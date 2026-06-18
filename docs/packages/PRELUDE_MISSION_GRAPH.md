# Prelude Mission Graph

## Purpose

The prelude mission graph turns `A Ship Underway` into loadable package data without scripting a fixed scene order.

The graph defines the situation, phases, facts, clocks, decision points, Command Moments, outcome flags, end states, and retrieval hooks that the Directors need. It does not define a list of valid solutions.

## Artifacts

- Mission graph schema: [mission-graph.schema.json](../../schemas/mission/mission-graph.schema.json)
- Bundled prelude graph: [prelude-a-ship-underway.mission-graph.json](../../packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json)
- Mission graph validator: [validate-mission-graph.mjs](../../tools/scripts/validate-mission-graph.mjs)
- Hesperus Command Moment fixture: [prelude-hesperus-fraud-command-moment.fixture.json](../../tests/fixtures/mission/prelude-hesperus-fraud-command-moment.fixture.json)
- Mission graph fixture runner: [test-mission-graph-fixture.mjs](../../tools/scripts/test-mission-graph-fixture.mjs)

## Current Graph

The current prelude graph covers:

- Shuttle rendezvous.
- Ready-room handover.
- Senior readiness conference.
- Fallback-command drill.
- Command rhythm scenes.
- The Hesperus diversion.
- Hesperus aftermath.
- Combined-load test.
- Final command review.
- Arrival at the Reach and transition into Chapter 1.

## Contract Shape

Top-level graph fields:

```text
manifest
sources
missionFrame
phases
facts
clocks
decisionPoints
commandMoments
outcomeFlags
endStates
retrievalHooks
```

The graph is package template data. Campaign state records which phase is active, which facts are known, which clocks changed, which Command Moments were awarded, and which outcome flags were committed.

## Design Rules

- Situation on rails, solution off rails.
- The graph is a prepared pressure package, not a fixed story script.
- Hesperus is not Pale Lantern, sabotage, or a hidden conspiracy.
- The prelude cannot prevent the campaign from starting.
- Poor play may create delay, technical debt, reduced trust, cohort tension, administrative scrutiny, or Chapter 1 limitations.
- Poor play must not destroy the ship, remove a senior officer, or create a punitive bad start without visible cause.
- Command Moments are concealed opportunities, not dialogue buttons.
- The Hesperus fraud Command Moment is non-repeatable and may award Inspiration or Resolve only when the method is credible, proportionate, and accepts cost.
- If a pressure becomes impossible or irrelevant because of player action, the Director should retire or redirect that pressure instead of forcing the planned beat.

## Verification

Run:

```powershell
node tools\scripts\validate-mission-graph.mjs
node tools\scripts\test-mission-graph-fixture.mjs
```

The validator checks package identity, mission identity, prelude phase coverage, required decision points, required outcome flags, failure policy, transition target, source paths, and crew-card retrieval references.

The fixture proves the Hesperus inspection-fraud Command Moment is reachable from the Hesperus phase, linked to a decision point, non-repeatable, and protected by the prelude failure policy.

## Next Work

- Add concrete state-delta schemas for phase advancement, clock changes, fact revelation, and outcome flag commits.
- Add Mission Director response packet contracts.
- Add Command Moment adjudication packet contracts.
- Add retrieval hooks for mission facts and ship-system cards after those datasets exist.
