import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CONTINUITY_PLAN_KIND,
  CONTINUITY_VISIBILITY,
  createContinuityFact,
  validateContinuityProjectionPlan
} from '../../src/continuity/index.mjs';

const root = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.resolve(root, 'schemas/generation/continuity-projection-plan.schema.json'), 'utf8'));
const operationProperties = schema.properties.operations.items.properties;
assert.equal(schema.additionalProperties, false);
for (const field of ['action', 'force', 'ttl', 'confidence', 'compressionGroupId']) {
  assert.ok(operationProperties[field], `Planner operation schema should allow ${field}.`);
}
for (const illegal of ['text', 'value', 'summary', 'render', 'content', 'prompt']) {
  assert.equal(operationProperties[illegal], undefined, `Planner operation schema must not allow ${illegal}.`);
}
assert.ok(schema.properties.guardFocus);
assert.ok(schema.properties.compressionGroups);
assert.equal(schema.properties.compressionGroups.items.additionalProperties, false);
for (const illegal of ['text', 'value', 'summary', 'render', 'content', 'prompt']) {
  assert.equal(schema.properties.compressionGroups.items.properties[illegal], undefined, `Compression groups must not allow ${illegal}.`);
}

const hard = createContinuityFact({
  id: 'crew.hadrik-bronn.species',
  kind: 'crew.identity.species',
  subject: 'crew.hadrik-bronn',
  predicate: 'species',
  value: 'Tellarite',
  summary: 'Bronn is Tellarite, not a default human.',
  criticality: 'hard',
  tags: ['crew', 'invariant', 'contradiction-guard']
});
const support = createContinuityFact({
  id: 'ship.travel.current',
  kind: 'ship.travel',
  subject: 'ship.breckenridge',
  predicate: 'travel',
  summary: 'The Breckenridge has been at warp for weeks and is near the Asterion Reach.',
  criticality: 'medium',
  tags: ['ship', 'travel']
});
const guard = createContinuityFact({
  id: 'crew.hadrik-bronn.age',
  kind: 'crew.identity.age',
  subject: 'crew.hadrik-bronn',
  predicate: 'age',
  summary: 'Bronn presents as late fifties by human comparison.',
  criticality: 'high',
  tags: ['crew']
});
const audit = createContinuityFact({
  id: 'mission.handoff.protocol',
  kind: 'mission.protocol',
  subject: 'mission.handoff',
  predicate: 'protocol',
  summary: 'The XO transfer is a shuttle rendezvous, not a launch from Earth orbit.',
  criticality: 'medium',
  tags: ['mission']
});
const outside = createContinuityFact({
  id: 'outside.request',
  summary: 'This fact exists in the fact index but was not in the planner request.',
  criticality: 'medium'
});
const hidden = createContinuityFact({
  id: 'hidden.director',
  summary: 'Hidden director-only continuity.',
  visibility: CONTINUITY_VISIBILITY.directorOnly,
  criticality: 'hard',
  tags: ['invariant']
});
const factIndex = {
  facts: [hard, support, guard, audit, outside, hidden],
  conflicts: [],
  rejected: [],
  sourceCount: 6,
  acceptedCount: 6
};

const validated = validateContinuityProjectionPlan({
  kind: CONTINUITY_PLAN_KIND,
  operations: [
    { factId: support.id, lane: 'L1', reason: 'promote travel for this turn', force: 'sceneCritical', ttl: 'scene', confidence: 0.87 },
    { factId: guard.id, action: 'guardOnly', reason: 'watch identity drift', force: 'guard', ttl: 'turn' },
    { factId: audit.id, action: 'auditOnly', reason: 'audit handoff premise' },
    { factId: hard.id, lane: 'directive.contract', reason: 'illegal static lane' }
  ],
  omitted: [{ factId: hard.id, reason: 'utility omitted hard fact' }],
  guardFocus: [guard.id],
  compressionGroups: [
    {
      id: 'group.support',
      factIds: [support.id, audit.id],
      lane: 'L3',
      reason: 'related transfer context',
      goal: 'keep travel and handoff together'
    }
  ]
}, {
  factIndex,
  candidateFactIds: [support.id, guard.id, audit.id],
  hardFloorFactIds: [hard.id]
});

assert.deepEqual(validated.laneFactIds['directive.continuity.invariants'], [support.id, hard.id]);
assert.equal(validated.operations.find((operation) => operation.factId === support.id)?.force, 'boost');
assert.equal(validated.operations.find((operation) => operation.factId === support.id)?.ttl, 'scene');
assert(validated.rejections.some((rejection) => rejection.factId === hard.id && rejection.reason === 'static-lane-not-selectable'));
assert(validated.selectedFactIds.includes(hard.id), 'Hard floors must survive Utility omission and invalid Utility operations.');
assert.deepEqual(validated.guardFactIds, [guard.id]);
assert.deepEqual(validated.auditFactIds, [audit.id]);
assert.equal(Object.values(validated.laneFactIds).flat().includes(guard.id), false, 'guardOnly facts must not render into laneFactIds.');
assert.equal(Object.values(validated.laneFactIds).flat().includes(audit.id), false, 'auditOnly facts must not render into laneFactIds.');
assert.deepEqual(validated.guardFocus, [guard.id]);
assert.equal(validated.compressionGroups.length, 1);
assert.equal(validated.compressionGroups[0].lane, 'directive.continuity.domain');

const invalid = validateContinuityProjectionPlan({
  kind: CONTINUITY_PLAN_KIND,
  operations: [
    { factId: support.id, lane: 'L0', reason: 'bad layer' },
    { factId: support.id, lane: 'directive.continuity.domain', reason: 'bad field', text: 'model-authored prompt prose' },
    { factId: support.id, lane: 'directive.continuity.domain', reason: 'bad force', force: 'teleport' },
    { factId: support.id, lane: 'directive.continuity.domain', reason: 'bad ttl', ttl: 'forever' },
    { factId: hidden.id, lane: 'L1', reason: 'hidden fact leak' },
    { factId: outside.id, lane: 'L3', reason: 'not in request' }
  ],
  omitted: [],
  guardFocus: [hidden.id, outside.id],
  compressionGroups: [
    { id: 'group.hidden', factIds: [support.id, hidden.id], lane: 'L3', reason: 'bad hidden group' },
    { id: 'group.hard', factIds: [support.id, hard.id], lane: 'L3', reason: 'bad hard floor group' },
    { id: 'group.prompt', factIds: [support.id, audit.id], lane: 'L3', reason: 'bad field', prompt: 'do not allow' }
  ]
}, {
  factIndex,
  candidateFactIds: [support.id, hidden.id, hard.id],
  hardFloorFactIds: []
});

assert(invalid.rejections.some((rejection) => rejection.reason === 'static-lane-not-selectable' && rejection.lane === 'L0'));
assert(invalid.rejections.some((rejection) => rejection.reason === 'invalid-operation-field' && rejection.field === 'text'));
assert(invalid.rejections.some((rejection) => rejection.reason === 'invalid-force'));
assert(invalid.rejections.some((rejection) => rejection.reason === 'invalid-ttl'));
assert(invalid.rejections.some((rejection) => rejection.factId === hidden.id && rejection.reason === 'audience-blocked-fact'));
assert(invalid.rejections.some((rejection) => rejection.factId === outside.id && rejection.reason === 'fact-not-in-planner-candidates'));
assert(invalid.rejections.some((rejection) => rejection.reason === 'guard-focus-audience-blocked-fact'));
assert(invalid.rejections.some((rejection) => rejection.reason === 'guard-focus-fact-not-in-planner-candidates'));
assert(invalid.rejections.some((rejection) => rejection.reason === 'compression-audience-blocked-fact'));
assert(invalid.rejections.some((rejection) => rejection.reason === 'compression-hard-floor-not-allowed'));
assert(invalid.rejections.some((rejection) => rejection.reason === 'invalid-compression-group-field' && rejection.field === 'prompt'));
assert.equal(invalid.selectedFactIds.includes(hidden.id), false, 'Hidden hard facts must not be inserted for narrator-safe prompts.');
assert.equal(invalid.selectedFactIds.includes(outside.id), false, 'Facts outside the planner request must not be selected.');

console.log('Continuity projection plan validator tests passed: schema shape, legal lanes, guard/audit operations, audience gates, candidate gates, force/TTL, hard floors, and compression validation.');
