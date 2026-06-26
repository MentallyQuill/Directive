import assert from 'node:assert/strict';

import {
  createGenerationRoleRegistry,
  GENERATION_ROLE_IDS
} from '../../src/generation/generation-roles.mjs';
import {
  allowedRootsForModelRole,
  authorityForRole,
  listModelCallAuthorityMatrix
} from '../../src/generation/model-call-authority-matrix.mjs';
import { SIDECAR_OUTPUT_SCHEMA_IDS } from '../../src/jobs/sidecar-output-contracts.mjs';
import { __campaignSidecarSchedulerTestHooks } from '../../src/jobs/campaign-sidecar-scheduler.mjs';

const registry = createGenerationRoleRegistry();
const matrix = listModelCallAuthorityMatrix();
assert.equal(matrix.length, GENERATION_ROLE_IDS.length);
assert.deepEqual(matrix.map((entry) => entry.roleId), GENERATION_ROLE_IDS);

for (const entry of matrix) {
  const role = registry.get(entry.roleId);
  assert.equal(entry.providerKind, role.providerKind, `${entry.roleId}: providerKind drift`);
  assert.equal(entry.blocking, role.blocking === true, `${entry.roleId}: blocking drift`);
  assert.equal(entry.mayProposeState, role.mayProposeState === true, `${entry.roleId}: mayProposeState drift`);
  assert.equal(entry.mayInjectPrompt, role.mayInjectPrompt === true, `${entry.roleId}: mayInjectPrompt drift`);
  assert.equal(entry.fallback, role.fallback, `${entry.roleId}: fallback drift`);
  assert.ok(entry.trigger, `${entry.roleId}: missing trigger`);
  assert.ok(entry.owningModule, `${entry.roleId}: missing owning module`);
  assert.ok(entry.hiddenStatePolicy, `${entry.roleId}: missing hidden-state policy`);
  assert.ok(Array.isArray(entry.tests) && entry.tests.length > 0, `${entry.roleId}: missing tests`);
  if (entry.mayProposeState) {
    assert.ok(entry.allowedRoots.length > 0, `${entry.roleId}: proposing role must declare roots`);
    assert.equal(entry.parserSchema, SIDECAR_OUTPUT_SCHEMA_IDS.stateDeltaProposal, `${entry.roleId}: proposing role must use state-delta proposal schema`);
  } else {
    assert.equal(entry.allowedRoots.length, 0, `${entry.roleId}: non-proposing role must not declare state roots`);
  }
}

assert.equal(authorityForRole('questActionInterpreter').mayProposeState, false);
assert.equal(authorityForRole('questActionInterpreter').allowedRoots.length, 0);
assert.equal(authorityForRole('questArchitect').providerKind, 'reasoning');
assert.equal(authorityForRole('questArchitect').mayProposeState, false);
assert.equal(authorityForRole('sceneDeltaExtractor').providerKind, 'utility');
assert.equal(authorityForRole('sceneDeltaExtractor').mayProposeState, false);
assert.equal(authorityForRole('sceneHandshakeSettler').providerKind, 'utility');
assert.equal(authorityForRole('sceneHandshakeSettler').blocking, true);
assert.equal(authorityForRole('sceneHandshakeSettler').mayProposeState, false);
assert.deepEqual(allowedRootsForModelRole('sceneHandshakeSettler'), []);
assert.deepEqual(allowedRootsForModelRole('continuityTracker'), ['continuity', 'mission']);
assert.equal(allowedRootsForModelRole('continuityTracker').includes('commandLog'), false);
assert.deepEqual(
  allowedRootsForModelRole('sceneReconciliationExtractor'),
  []
);
assert.equal(authorityForRole('commandLogSummarizer').parserSchema, SIDECAR_OUTPUT_SCHEMA_IDS.commandLogSummary);
assert.equal(authorityForRole('utilityTurnClassifier').providerKind, 'utility');
assert.equal(authorityForRole('narration').providerKind, 'reasoning');
assert.equal(authorityForRole('commandBearingFitChecker').providerKind, 'utility');
assert.equal(authorityForRole('commandBearingFitChecker').mayProposeState, false);
assert.equal(authorityForRole('commandBearingSpendValidator').providerKind, 'utility');
assert.equal(authorityForRole('commandBearingSpendValidator').fallback, 'fail-closed');
assert.equal(authorityForRole('factualGroundingReviewer').providerKind, 'utility');
assert.equal(authorityForRole('factualGroundingReviewer').mayProposeState, false);
assert.equal(authorityForRole('factualGroundingReviewer').mayInjectPrompt, false);
assert.deepEqual(allowedRootsForModelRole('factualGroundingReviewer'), []);

const workers = __campaignSidecarSchedulerTestHooks.WORKERS;
for (const worker of Object.values(workers)) {
  assert.deepEqual(
    worker.allowedRoots,
    allowedRootsForModelRole(worker.roleId),
    `${worker.roleId}: scheduler roots must match authority matrix`
  );
}

assert.throws(() => authorityForRole('missingRole'), /Unknown model-call authority role/);

console.log('Model-call authority matrix tests passed: role coverage, provider lanes, state roots, schemas, and scheduler drift checks');
