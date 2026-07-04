import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { classifyChatTurn } from '../../src/adjudication/utility-turn-classifier.mjs';

const root = process.cwd();
const fixtureDir = path.resolve(root, 'tests/fixtures/classifier');

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function mergeContext(...values) {
  return values.reduce((merged, value) => ({
    ...merged,
    ...(value && typeof value === 'object' && !Array.isArray(value) ? cloneJson(value) : {})
  }), {});
}

function readFixtureSets() {
  return fs.readdirSync(fixtureDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map((fileName) => {
      const filePath = path.join(fixtureDir, fileName);
      return {
        fileName,
        value: JSON.parse(fs.readFileSync(filePath, 'utf8'))
      };
    });
}

function expandFixtureSet({ fileName, value }) {
  assert.equal(value.kind, 'directive.turnIntentClassifierFixtureSet', `${fileName}: unexpected fixture kind`);
  const cases = [];
  for (const family of asArray(value.families)) {
    const texts = asArray(family.texts);
    assert.ok(texts.length > 0, `${fileName}:${family.idPrefix} must include texts`);
    texts.forEach((text, index) => {
      cases.push({
        fileName,
        id: `${family.idPrefix}.${String(index + 1).padStart(3, '0')}`,
        text,
        context: mergeContext(value.defaultContext, family.context),
        providerResponse: cloneJson(family.providerResponse),
        providerResponseRaw: family.providerResponseRaw,
        providerOk: family.providerOk,
        expect: cloneJson(family.expect || {})
      });
    });
  }
  for (const item of asArray(value.cases)) {
    cases.push({
      fileName,
      id: item.id,
      text: item.text,
      context: mergeContext(value.defaultContext, item.context),
      providerResponse: cloneJson(item.providerResponse),
      providerResponseRaw: item.providerResponseRaw,
      providerOk: item.providerOk,
      expect: cloneJson(item.expect || {})
    });
  }
  return cases;
}

function createRouter(fixture, calls) {
  return {
    async generate(roleId, request) {
      calls.push({
        roleId,
        request
      });
      assert.equal(roleId, 'utilityTurnClassifier', `${fixture.id}: unexpected role`);
      if (fixture.providerOk === false) {
        return {
          ok: false,
          roleId,
          error: {
            code: 'FIXTURE_PROVIDER_FAILED',
            message: 'Fixture provider failure.'
          },
          diagnostics: {
            providerId: 'fixture-utility'
          }
        };
      }
      const text = fixture.providerResponseRaw !== undefined
        ? String(fixture.providerResponseRaw)
        : JSON.stringify(fixture.providerResponse || {
          classification: 'noDirectiveAction',
          responseStrategy: 'injectAndContinue',
          confidence: 0.5,
          reasons: ['Default fixture response.'],
          workerPlan: {}
        });
      return {
        ok: true,
        roleId,
        response: {
          text,
          providerId: 'fixture-utility'
        },
        diagnostics: {
          latencyMs: 3,
          providerId: 'fixture-utility'
        }
      };
    }
  };
}

function assertAnyOf(actual, allowed, label, fixture) {
  if (!allowed || allowed.length === 0) return;
  assert.ok(
    allowed.includes(actual),
    `${fixture.id}: expected ${label} one of ${allowed.join(', ')}, got ${actual}; text="${fixture.text}"`
  );
}

function assertWorkers(decision, fixture) {
  const plan = decision.workerPlan || {};
  for (const key of asArray(fixture.expect.requiredWorkers)) {
    assert.equal(plan[key], true, `${fixture.id}: expected workerPlan.${key}=true; text="${fixture.text}"`);
  }
  for (const key of asArray(fixture.expect.forbiddenWorkers)) {
    assert.equal(plan[key], false, `${fixture.id}: expected workerPlan.${key}=false; text="${fixture.text}"`);
  }
}

function assertDomains(decision, fixture) {
  const actual = new Set(asArray(decision.domainSignals || decision.slots?.domains).map((item) => compact(item).toLowerCase()));
  for (const domain of asArray(fixture.expect.requiredDomains)) {
    assert.ok(
      actual.has(compact(domain).toLowerCase()),
      `${fixture.id}: expected domain "${domain}", got ${[...actual].join(', ') || '(none)'}; text="${fixture.text}"`
    );
  }
}

function assertDiagnostics(decision, fixture, calls) {
  const diagnostics = decision.diagnostics || {};
  const expect = fixture.expect || {};
  if (expect.providerAttempted !== undefined) {
    assert.equal(
      diagnostics.providerAttempted,
      expect.providerAttempted,
      `${fixture.id}: providerAttempted mismatch; text="${fixture.text}"`
    );
    assert.equal(
      calls.length > 0,
      expect.providerAttempted,
      `${fixture.id}: provider call count mismatch; text="${fixture.text}"`
    );
  }
  if (expect.deterministicFastPath !== undefined) {
    assert.equal(
      diagnostics.deterministicFastPath,
      expect.deterministicFastPath,
      `${fixture.id}: deterministicFastPath mismatch; text="${fixture.text}"`
    );
  }
  if (expect.providerRejected !== undefined) {
    assert.equal(
      diagnostics.providerRejected,
      expect.providerRejected,
      `${fixture.id}: providerRejected mismatch; text="${fixture.text}"`
    );
  }
}

function assertSlots(decision, fixture) {
  const expect = fixture.expect || {};
  if (expect.actionRequired === true) {
    assert.ok(compact(decision.action), `${fixture.id}: expected action slot; text="${fixture.text}"`);
  }
  if (expect.targetRequired === true) {
    assert.ok(compact(decision.target), `${fixture.id}: expected target slot; text="${fixture.text}"`);
  }
  if (expect.pendingAction !== undefined) {
    assert.equal(
      decision.pendingInteractionResolution?.action || null,
      expect.pendingAction,
      `${fixture.id}: pending action mismatch; text="${fixture.text}"`
    );
  }
  if (expect.pendingInteractionId !== undefined) {
    assert.equal(
      decision.pendingInteractionResolution?.interactionId || null,
      expect.pendingInteractionId,
      `${fixture.id}: pending interaction id mismatch; text="${fixture.text}"`
    );
  }
}

function assertSceneBoundary(decision, fixture) {
  const expect = fixture.expect || {};
  if (expect.sceneBoundaryKind !== undefined) {
    assert.equal(
      decision.sceneBoundary?.kind || null,
      expect.sceneBoundaryKind,
      `${fixture.id}: sceneBoundary.kind mismatch; text="${fixture.text}"`
    );
  }
  if (expect.sceneBoundaryStopPolicy !== undefined) {
    assert.equal(
      decision.sceneBoundary?.stopPolicy || null,
      expect.sceneBoundaryStopPolicy,
      `${fixture.id}: sceneBoundary.stopPolicy mismatch; text="${fixture.text}"`
    );
  }
  if (expect.maxNamedLocations !== undefined) {
    assert.equal(
      decision.sceneBoundary?.maxNamedLocations || null,
      expect.maxNamedLocations,
      `${fixture.id}: sceneBoundary.maxNamedLocations mismatch; text="${fixture.text}"`
    );
  }
}

async function runFixture(fixture) {
  const calls = [];
  const generationRouter = createRouter(fixture, calls);
  const decision = await classifyChatTurn({
    text: fixture.text,
    context: fixture.context,
    generationRouter
  });
  assert.equal(decision.kind, 'directive.validatedTurnDecision', `${fixture.id}: unexpected decision kind`);
  assertAnyOf(decision.classification, fixture.expect.classificationAnyOf, 'classification', fixture);
  assertAnyOf(decision.responseStrategy, fixture.expect.responseStrategyAnyOf, 'responseStrategy', fixture);
  assertDiagnostics(decision, fixture, calls);
  assertWorkers(decision, fixture);
  assertDomains(decision, fixture);
  assertSlots(decision, fixture);
  assertSceneBoundary(decision, fixture);
  if (fixture.expect.minConfidence !== undefined) {
    assert.ok(decision.confidence >= fixture.expect.minConfidence, `${fixture.id}: confidence below minimum`);
  }
  if (fixture.expect.maxConfidence !== undefined) {
    assert.ok(decision.confidence <= fixture.expect.maxConfidence, `${fixture.id}: confidence above maximum`);
  }
  assert.equal(
    typeof decision.diagnostics?.arbitration?.status,
    'string',
    `${fixture.id}: expected arbitration diagnostics`
  );
}

const fixtureSets = readFixtureSets();
const fixtures = fixtureSets.flatMap(expandFixtureSet);
assert.ok(fixtures.length >= 150, `Expected at least 150 classifier fixtures, found ${fixtures.length}`);

for (const fixture of fixtures) {
  await runFixture(fixture);
}

{
  const calls = [];
  const fixture = {
    id: 'closure-signal.advisory.001',
    text: 'After the debrief, I dismiss the staff and move us into the next watch.',
    context: { activeMissionId: 'fixture-mission' },
    providerResponse: {
      classification: 'consequentialCommand',
      responseStrategy: 'directivePosted',
      confidence: 0.78,
      ambiguity: 'medium',
      speechAct: 'order',
      action: 'dismiss staff and move to next watch',
      target: 'staff debrief',
      domainSignals: ['command'],
      riskSignals: [],
      missingInformation: [],
      pendingInteractionResolution: null,
      closureSignals: {
        possibleClosure: true,
        confidence: 'medium',
        closureTypes: ['thread', 'chapter', 'invalid-type'],
        playerFacingReason: 'The player appears to be closing the debrief and moving to the next interval.'
      },
      mixedIntent: false,
      workerPlan: { commandBearing: true },
      reasons: ['The post changes the command interval after a debrief.']
    },
    expect: {
      classificationAnyOf: ['consequentialCommand'],
      responseStrategyAnyOf: ['directivePosted'],
      requiredWorkers: ['commandBearing'],
      requiredDomains: ['command'],
      providerAttempted: true
    }
  };
  const decision = await classifyChatTurn({
    text: fixture.text,
    context: fixture.context,
    generationRouter: createRouter(fixture, calls)
  });
  assert.equal(decision.closureSignals.possibleClosure, true);
  assert.equal(decision.closureSignals.confidence, 'medium');
  assert.deepEqual(decision.closureSignals.closureTypes, ['thread', 'chapter']);
  assert.match(decision.closureSignals.playerFacingReason, /closing the debrief/);
}

{
  const calls = [];
  const decision = await classifyChatTurn({
    text: 'Sam acknowledged the hail, kept his hands clear of the controls, and waited for the reply.',
    context: {},
    generationRouter: createRouter({
      id: 'passive-scene-beat.waits-for-reply',
      providerResponse: {
        classification: 'consequentialCommand',
        responseStrategy: 'directivePosted',
        confidence: 0.88
      }
    }, calls)
  });
  assert.equal(decision.classification, 'noDirectiveAction');
  assert.equal(decision.responseStrategy, 'injectAndContinue');
  assert.equal(decision.diagnostics.providerAttempted, false);
  assert.equal(decision.diagnostics.providerSkippedReason, 'deterministic-fast-path');
  assert.equal(calls.length, 0, 'Passive wait beats should not block on utility provider classification.');
}

{
  const calls = [];
  const fixture = {
    id: 'active-hail-command.provider-review',
    providerResponse: {
      classification: 'routineCommand',
      responseStrategy: 'directivePosted',
      confidence: 0.83,
      workerPlan: { continuity: true, promptUpdate: true, narrator: true }
    }
  };
  const decision = await classifyChatTurn({
    text: 'Sam hails the ship and asks for their reply.',
    context: {},
    generationRouter: createRouter(fixture, calls)
  });
  assert.equal(calls.length, 1, 'Active hail commands should still allow provider review.');
  assert.equal(decision.diagnostics.providerAttempted, true);
}

console.log(`Turn intent classifier fixture tests passed: ${fixtures.length} language-diverse cases`);
