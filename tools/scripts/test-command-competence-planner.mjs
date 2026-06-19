import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { planCommandCompetence } from '../../src/competence/competence-planner.mjs';
import { validateCompetencePacket } from '../../src/competence/competence-packet.mjs';

const DEFAULT_FIXTURE_DIR = 'tests/fixtures/competence';

const root = process.cwd();
const fixturePaths = process.argv.length > 2
  ? process.argv.slice(2).map((fixture) => path.resolve(root, fixture))
  : fs.readdirSync(path.resolve(root, DEFAULT_FIXTURE_DIR))
    .filter((fileName) => fileName.endsWith('.competence.fixture.json'))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => path.resolve(root, DEFAULT_FIXTURE_DIR, fileName));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function ids(records = []) {
  return records.map((record) => record.id);
}

function assertSameIds(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

function assertExcludes(actual, excluded, label) {
  for (const id of excluded || []) {
    assert.equal(actual.includes(id), false, `${label} must not include ${id}`);
  }
}

function assertHiddenTermsAbsent(packet, terms = []) {
  const text = JSON.stringify(packet).toLowerCase();
  for (const term of terms) {
    assert.equal(text.includes(String(term).toLowerCase()), false, `packet must not include hidden term "${term}"`);
  }
}

for (const fixturePath of fixturePaths) {
  const fixture = readJson(fixturePath);
  const policyBefore = cloneJson(fixture.policy);
  const sceneBefore = cloneJson(fixture.input.sceneSnapshot);
  const campaignBefore = cloneJson(fixture.input.campaignState);

  const packet = planCommandCompetence({
    policy: fixture.policy,
    sceneSnapshot: fixture.input.sceneSnapshot,
    campaignState: fixture.input.campaignState,
    sourceTurnId: fixture.input.sourceTurnId
  });

  assert.deepEqual(fixture.policy, policyBefore, `${fixture.id}: policy must not mutate`);
  assert.deepEqual(fixture.input.sceneSnapshot, sceneBefore, `${fixture.id}: scene snapshot must not mutate`);
  assert.deepEqual(fixture.input.campaignState, campaignBefore, `${fixture.id}: campaign state must not mutate`);

  const validation = validateCompetencePacket(packet);
  assert.equal(validation.ok, true, `${fixture.id}: ${validation.errors.join(', ')}`);
  assert.equal(packet.sourceTurnId, fixture.input.sourceTurnId);
  assert.equal(packet.activeMissionId, fixture.input.sceneSnapshot.missionId);
  assert.equal(packet.activePhaseId, fixture.input.sceneSnapshot.activePhaseId);
  assert.equal(packet.rawHiddenValuesExposed, false);
  assert.equal(packet.directorOnlyDataIncluded, false);

  assertSameIds(ids(packet.routineActions), fixture.expected.routineActionIds, `${fixture.id}: routine action ids`);
  assertExcludes(ids(packet.routineActions), fixture.expected.excludedRoutineActionIds, `${fixture.id}: routine action ids`);

  assertSameIds(ids(packet.professionalKnowledge), fixture.expected.professionalKnowledgeIds, `${fixture.id}: professional knowledge ids`);
  assertExcludes(ids(packet.professionalKnowledge), fixture.expected.excludedProfessionalKnowledgeIds, `${fixture.id}: professional knowledge ids`);

  assertSameIds(ids(packet.domainReports), fixture.expected.domainReportIds, `${fixture.id}: domain report ids`);
  assertExcludes(ids(packet.domainReports), fixture.expected.excludedDomainReportIds, `${fixture.id}: domain report ids`);

  assert.equal(packet.commandQuestion.id, fixture.expected.commandQuestionId, `${fixture.id}: command question id`);
  assertSameIds(ids(packet.proceduralWarnings), fixture.expected.warningIds, `${fixture.id}: warning ids`);
  assertSameIds(ids(packet.authorityNotes), fixture.expected.authorityNoteIds, `${fixture.id}: authority note ids`);

  assertSameIds(ids(packet.commandBrief.knownFacts), fixture.expected.commandBrief.knownFactIds, `${fixture.id}: brief known facts`);
  assertSameIds(ids(packet.commandBrief.uncertainty), fixture.expected.commandBrief.uncertaintyIds, `${fixture.id}: brief uncertainty`);
  assertSameIds(ids(packet.commandBrief.operationalPressure), fixture.expected.commandBrief.operationalPressureIds, `${fixture.id}: brief operational pressure`);
  assert.equal(packet.commandBrief.commandQuestion.id, fixture.expected.commandQuestionId, `${fixture.id}: brief command question`);

  assertHiddenTermsAbsent(packet, fixture.expected.hiddenTermsAbsent);
}

console.log(`Command Competence planner fixtures passed: ${fixturePaths.map((fixturePath) => path.relative(root, fixturePath).replaceAll(path.sep, '/')).join(', ')}`);
