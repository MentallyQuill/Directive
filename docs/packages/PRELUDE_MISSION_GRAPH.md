# Prelude Mission Graph

## Purpose

The prelude mission graph turns `A Ship Underway` into loadable package data without scripting a fixed scene order.

The graph defines the situation, phases, facts, clocks, decision points, Command Decisions, outcome flags, end states, and retrieval hooks that the Directors need. It does not define a list of valid solutions.

## Artifacts

- Mission graph schema: [mission-graph.schema.json](../../schemas/mission/mission-graph.schema.json)
- Bundled Ashes prelude graph: [prelude-a-ship-underway.mission-graph.json](../../packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json)
- Bundled Glass Harbor mission graphs:
  [prelude-soundings.mission-graph.json](../../packages/bundled/glass-harbor/mission-graphs/prelude-soundings.mission-graph.json),
  [chapter-1-aster-basin.mission-graph.json](../../packages/bundled/glass-harbor/mission-graphs/chapter-1-aster-basin.mission-graph.json),
  [chapter-2-caligo-sounding.mission-graph.json](../../packages/bundled/glass-harbor/mission-graphs/chapter-2-caligo-sounding.mission-graph.json)
- Mission graph validator: [validate-mission-graph.mjs](../../tools/scripts/validate-mission-graph.mjs)
- Hesperus Command Decision fixture: [prelude-hesperus-fraud-command-decision.fixture.json](../../tests/fixtures/mission/prelude-hesperus-fraud-command-decision.fixture.json)
- Mission graph fixture runner: [test-mission-graph-fixture.mjs](../../tools/scripts/test-mission-graph-fixture.mjs)

## Current Ashes Graph

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

## Current Glass Harbor Graphs

The Glass Harbor draft package validates three baseline tactical graphs:

- Prelude Soundings: acting-command setup, convoy rescue, and Captain Rhos's disappearance frame.
- Chapter 1 Aster Basin: concealed civilian community, sanctuary, recognition, and surveillance pressure.
- Chapter 2 Caligo Sounding: wreckfield salvage, evidence custody, and security risk.

These records are current-schema baselines. Before playtest promotion, deepen facts, clocks, pressures, and Command Decision outcomes against the campaign source.

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
commandDecisions
outcomeFlags
endStates
retrievalHooks
```

The graph is package template data. Campaign state records which phase is active, which facts are known, which clocks changed, which Command Decisions were awarded, and which outcome flags were committed.

## Design Rules

- Situation on rails, solution off rails.
- The graph is a prepared pressure package, not a fixed story script.
- Hesperus is not Pale Lantern, sabotage, or a hidden conspiracy.
- The prelude cannot prevent the campaign from starting.
- Poor play may create delay, technical debt, reduced trust, cohort tension, administrative scrutiny, or Chapter 1 limitations.
- Poor play must not destroy the ship, remove a senior officer, or create a punitive bad start without visible cause.
- Command Decisions are concealed opportunities, not dialogue buttons.
- The Hesperus fraud Command Decision is non-repeatable and may award Inspiration or Resolve only when the method is credible, proportionate, and accepts cost.
- If a pressure becomes impossible or irrelevant because of player action, the Director should retire or redirect that pressure instead of forcing the planned beat.

## Verification

Run:

```powershell
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\breckenridge\ashes-of-peace.campaign-package.json packages\bundled\breckenridge\breckenridge-senior-staff.crew-dataset.json packages\bundled\breckenridge\prelude-a-ship-underway.mission-graph.json
node tools\scripts\validate-mission-graph.mjs schemas\mission\mission-graph.schema.json packages\bundled\glass-harbor\drowned-constellation.campaign-package.json packages\bundled\glass-harbor\glass-harbor-senior-staff.crew-dataset.json packages\bundled\glass-harbor\mission-graphs\prelude-soundings.mission-graph.json
node tools\scripts\test-mission-graph-fixture.mjs
```

The validator checks package identity, mission identity, phase coverage, required decision points, required outcome flags, failure policy, transition target, source paths, and crew-card retrieval references. The Breckenridge fixture remains the strongest bespoke fixture proof; the Glass Harbor graphs currently validate as draft baseline records.

The fixture proves the Hesperus inspection-fraud Command Decision is reachable from the Hesperus phase, linked to a decision point, non-repeatable, and protected by the prelude failure policy.

## Next Work

- Deepen concrete state-delta schemas now that phase advancement, clock changes, fact revelation, outcome flags, and Command Decision awards have executable fixtures.
- Add broader Mission Director response packet coverage for actor posture, fronts, and side-mission inheritance.
- Add retrieval hooks for mission facts and ship-system cards after those datasets exist.
