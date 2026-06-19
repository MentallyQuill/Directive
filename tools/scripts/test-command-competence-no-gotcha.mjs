import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { planCommandCompetence } from '../../src/competence/competence-planner.mjs';
import { evaluateNoGotchaCheck } from '../../src/competence/no-gotcha.mjs';

const DEFAULT_FIXTURE_DIR = 'tests/fixtures/competence';

const root = process.cwd();
const fixturePaths = process.argv.length > 2
  ? process.argv.slice(2).map((fixture) => path.resolve(root, fixture))
  : fs.readdirSync(path.resolve(root, DEFAULT_FIXTURE_DIR))
    .filter((fileName) => fileName.endsWith('.no-gotcha.fixture.json'))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => path.resolve(root, DEFAULT_FIXTURE_DIR, fileName));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ids(records = []) {
  return records.map((record) => record.id);
}

function assertSameIds(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...(expected || [])].sort(), label);
}

function assertHiddenTermsAbsent(packet, terms = []) {
  const text = JSON.stringify(packet).toLowerCase();
  for (const term of terms) {
    assert.equal(text.includes(String(term).toLowerCase()), false, `packet must not include hidden term "${term}"`);
  }
}

for (const fixturePath of fixturePaths) {
  const fixture = readJson(fixturePath);
  const policyFixture = readJson(path.resolve(root, fixture.policyFixturePath));

  for (const scene of fixture.scenes || []) {
    const packet = planCommandCompetence({
      policy: policyFixture.policy,
      sceneSnapshot: scene.sceneSnapshot,
      sourceTurnId: `turn.${scene.id}`
    });

    assertHiddenTermsAbsent(packet, fixture.hiddenTermsAbsent);
    assertSameIds(ids(packet.proceduralWarnings), scene.expectedWarningIds || [], `${fixture.id} ${scene.id}: warning ids`);

    for (const consequence of scene.consequences || []) {
      const expected = consequence.expected || {};
      const check = evaluateNoGotchaCheck({
        consequence,
        competencePacket: packet
      });

      assert.equal(check.fair, expected.fair, `${fixture.id} ${scene.id} ${consequence.id}: fairness`);
      assert.equal(
        check.shouldHaveBeenAutocompleted,
        expected.shouldHaveBeenAutocompleted,
        `${fixture.id} ${scene.id} ${consequence.id}: autocomplete flag`
      );
      assertSameIds(check.evidence, expected.evidence || [], `${fixture.id} ${scene.id} ${consequence.id}: evidence`);
    }
  }
}

console.log(`Command Competence no-gotcha fixtures passed: ${fixturePaths.map((fixturePath) => path.relative(root, fixturePath).replaceAll(path.sep, '/')).join(', ')}`);
