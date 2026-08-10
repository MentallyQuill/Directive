import assert from 'node:assert/strict';
import fs from 'node:fs';

import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { lintMissionPackage } from '../../src/mission/v1/mission-package-linter.mjs';
import {
  eligibleMissionCommandBearingAwards,
  reduceMissionEvidence
} from '../../src/mission/v1/mission-reducer.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const FIXTURE_DIRECTORY = 'tests/fixtures/mission/v1';
const EXPECTED_PACKAGE_ROOTS = [
  'assets',
  'campaign',
  'characterCreation',
  'crew',
  'guardrails',
  'manifest',
  'ship',
  'world'
];
const EXPECTED_SOURCE_CHAIN = [
  'prelude-a-ship-underway',
  'chapter-1-the-empty-convoy',
  'chapter-2-false-colors',
  'open-orders-1-work-worth-doing',
  'chapter-3-dead-letters',
  'chapter-4-the-colony-that-stayed',
  'chapter-5-old-lessons',
  'open-orders-2-what-survives',
  'chapter-6-the-cost-of-knowing',
  'chapter-7-a-peace-of-their-own',
  'open-orders-3-before-the-lamps-go-out',
  'chapter-8-the-last-directive',
  'epilogue-the-terms-we-keep'
];

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function scenarioFixtures() {
  return fs.readdirSync(FIXTURE_DIRECTORY)
    .filter((name) => name.endsWith('-scenarios.fixture.json'))
    .map((name) => readJson(`${FIXTURE_DIRECTORY}/${name}`));
}

function sourceForStep({ definition, scenario, step, index, revision }) {
  const selectedSwipeId = step.sourceRole === 'assistant' ? `swipe.${index + 1}` : null;
  return {
    messageId: `message.${definition.packageBinding.sourceId}.${scenario.id}.${index + 1}`,
    branchId: `branch.${definition.packageBinding.sourceId}.${scenario.id}`,
    accepted: true,
    selectedSwipeId,
    textHash: (index + 1).toString(16).padStart(2, '0').repeat(32),
    role: step.sourceRole,
    acceptedAtRevision: revision
  };
}

function runScenario(definition, fixture, scenario) {
  const branchId = `branch.${definition.packageBinding.sourceId}.${scenario.id}`;
  const steps = [
    ...(scenario.sequence || []).flatMap((fragmentId) => {
      const fragment = fixture.fragments?.[fragmentId];
      assert.equal(Array.isArray(fragment), true, `${definition.id}:${scenario.id}: missing fragment ${fragmentId}`);
      return fragment;
    }),
    ...(scenario.steps || [])
  ];
  let state = createMissionState({ definition, branchId });
  let acceptedClaimCount = 0;
  const rejectedReasonCodes = [];
  for (const [index, step] of steps.entries()) {
    const source = sourceForStep({ definition, scenario, step, index, revision: state.revision });
    const proposal = {
      kind: 'directive.missionEvidenceProposal.v1',
      branchId,
      missionId: definition.id,
      baseRevision: state.revision + (step.baseRevisionOffset || 0),
      claims: [{
        claimId: step.claimId,
        policyId: step.policyId,
        claimType: step.claimType,
        targetId: step.targetId,
        ...(Object.hasOwn(step, 'value') ? { value: step.value } : {}),
        sourceRef: {
          messageId: source.messageId,
          swipeId: step.sourceSwipeOverride ?? source.selectedSwipeId,
          textHash: source.textHash
        }
      }]
    };
    const evidence = validateMissionEvidenceProposal({
      definition,
      state,
      proposal,
      resolveSourceRef: (ref) => ref?.messageId === source.messageId ? source : null
    });
    acceptedClaimCount += evidence.acceptedClaims.length;
    rejectedReasonCodes.push(...evidence.rejectedClaims.map((claim) => claim.reasonCode));
    if (!evidence.acceptedClaims.length) continue;
    state = reduceMissionEvidence({
      definition,
      state,
      acceptedClaims: evidence.acceptedClaims,
      sourceContribution: {
        id: `contribution.${definition.packageBinding.sourceId}.${scenario.id}.${index + 1}`,
        messageId: source.messageId,
        swipeId: source.selectedSwipeId,
        role: source.role,
        textHash: source.textHash,
        acceptedAtRevision: source.acceptedAtRevision
      }
    }).state;
  }
  return { state, acceptedClaimCount, rejectedReasonCodes };
}

function assertScenarioResult(definition, scenario, result) {
  const label = `${definition.id}:${scenario.id}`;
  const expected = scenario.expected;
  assert.equal(result.state.status, expected.status, `${label}: status`);
  assert.equal(result.state.terminalDisposition, expected.terminalDisposition, `${label}: disposition`);
  assert.equal(result.acceptedClaimCount, expected.acceptedClaimCount, `${label}: accepted claims`);
  assert.deepEqual(result.rejectedReasonCodes, expected.rejectedReasonCodes, `${label}: rejected claims`);
  for (const [id, value] of Object.entries(expected.objectiveDispositions || {})) {
    assert.equal(result.state.objectives[id]?.disposition, value, `${label}:${id}`);
  }
  for (const [id, value] of Object.entries(expected.outcomeDimensions || {})) {
    assert.equal(result.state.outcomeDimensions[id] ?? 'pending', value, `${label}:${id}`);
  }
  for (const [id, value] of Object.entries(expected.outcomeValues || {})) {
    assert.equal(result.state.outcomes[id], value, `${label}:${id}`);
  }
  for (const id of expected.knownFactsIncludes || []) {
    assert.equal(result.state.knownFacts.includes(id), true, `${label}:${id}`);
  }
  for (const id of expected.knownFactsExcludes || []) {
    assert.equal(result.state.knownFacts.includes(id), false, `${label}:${id}`);
  }
  for (const id of expected.eventsInclude || []) {
    assert.equal(result.state.events.includes(id), true, `${label}:${id}`);
  }
  for (const id of expected.eventsExclude || []) {
    assert.equal(result.state.events.includes(id), false, `${label}:${id}`);
  }
  for (const [id, value] of Object.entries(expected.clockStates || {})) {
    assert.equal(result.state.clocks[id]?.state, value.state, `${label}:${id}:state`);
    assert.equal(result.state.clocks[id]?.value, value.value, `${label}:${id}:value`);
  }
  if (Object.hasOwn(expected, 'commandBearingAwardIds')) {
    assert.deepEqual(
      eligibleMissionCommandBearingAwards(definition, result.state).map((award) => award.id),
      expected.commandBearingAwardIds,
      `${label}: Command Bearing awards`
    );
  }
  assert.equal(result.state.transitionReceipt?.target?.id || null, expected.transitionTargetId || null, `${label}: transition`);
}

const { packageData, crewDataset, shipDataset, missionDefinitions } = loadAshesRuntimeAssets();
assert.deepEqual(Object.keys(packageData).sort(), EXPECTED_PACKAGE_ROOTS);
assert.equal(packageData.manifest.kind, 'directive.campaignPackage.v1');
assert.equal(packageData.manifest.schemaVersion, 1);
assert.deepEqual(Object.keys(crewDataset).sort(), ['manifest', 'officers']);
assert.equal(crewDataset.manifest.kind, 'directive.crewDataset.v1');
assert.equal(crewDataset.manifest.packageId, packageData.manifest.id);
assert.equal(crewDataset.officers.length, 7);
for (const officer of crewDataset.officers) {
  assert.deepEqual(Object.keys(officer).sort(), ['billet', 'id', 'name', 'narrationGuide', 'profileSummary']);
  assert.equal(Boolean(officer.profileSummary.trim()), true);
  assert.equal(Boolean(officer.narrationGuide.voice.trim()), true);
  assert.equal(officer.narrationGuide.constraints.length > 0, true);
}
assert.deepEqual(Object.keys(shipDataset).sort(), ['manifest', 'profile']);
assert.equal(shipDataset.manifest.kind, 'directive.shipDataset.v1');
assert.equal(shipDataset.manifest.packageId, packageData.manifest.id);
assert.equal(Boolean(shipDataset.profile.summary.trim()), true);
assert.equal(Boolean(shipDataset.profile.narrationGuide.trim()), true);
assert.equal(shipDataset.profile.hardFacts.length > 0, true);
assert.equal(missionDefinitions.length, EXPECTED_SOURCE_CHAIN.length);

const byId = new Map(missionDefinitions.map((definition) => [definition.id, definition]));
const bySourceId = new Map(missionDefinitions.map((definition) => [definition.packageBinding.sourceId, definition]));
assert.equal(byId.size, missionDefinitions.length, 'mission definition ids must be unique');
assert.equal(bySourceId.size, missionDefinitions.length, 'mission source ids must be unique');
assert.equal(packageData.manifest.openingMissionId, EXPECTED_SOURCE_CHAIN[0]);

for (const [index, sourceId] of EXPECTED_SOURCE_CHAIN.entries()) {
  const definition = bySourceId.get(sourceId);
  assert.ok(definition, `missing Ashes V1 mission ${sourceId}`);
  assert.equal(definition.packageBinding.packageId, packageData.manifest.id, `${sourceId}: package id`);
  assert.equal(definition.packageBinding.packageVersion, packageData.manifest.version, `${sourceId}: package version`);
  const targetIds = [...new Set(definition.transitions.map((transition) => transition.target.id))];
  if (index < EXPECTED_SOURCE_CHAIN.length - 1) {
    assert.deepEqual(targetIds, [EXPECTED_SOURCE_CHAIN[index + 1]], `${sourceId}: next mission`);
    assert.equal(definition.transitions.every((transition) => transition.target.kind === 'mission'), true);
  } else {
    assert.deepEqual(targetIds, ['ashes-authored-conclusion']);
    assert.equal(definition.transitions.every((transition) => (
      transition.target.kind === 'phase'
      && Boolean(transition.target.campaignConclusion?.endConditionId)
    )), true, 'the epilogue must own an explicit authored conclusion');
  }
}

const fixtures = scenarioFixtures();
const fixturesByDefinition = new Map(fixtures.map((fixture) => [fixture.definitionId, fixture]));
assert.equal(fixturesByDefinition.size, missionDefinitions.length, 'every Ashes mission needs one scenario fixture');

let scenarioCount = 0;
const knownTransitionTargetIds = new Set([
  ...EXPECTED_SOURCE_CHAIN,
  'ashes-authored-conclusion'
]);
for (const definition of missionDefinitions) {
  const fixture = fixturesByDefinition.get(definition.id);
  assert.ok(fixture, `${definition.id}: scenario fixture missing`);
  const lint = lintMissionPackage({
    definition,
    knownDefinitions: missionDefinitions,
    knownTransitionTargetIds,
    scenarioExpectations: fixture.scenarios.map((scenario) => scenario.expected)
  });
  assert.equal(lint.ok, true, `${definition.id}: ${lint.errors.join('\n')}`);
  for (const scenario of fixture.scenarios) {
    assertScenarioResult(definition, scenario, runScenario(definition, fixture, scenario));
    scenarioCount += 1;
  }
}

console.log(`Ashes V1 campaign passed ${missionDefinitions.length} mission contracts and ${scenarioCount} authored scenarios.`);
