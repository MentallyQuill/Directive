import assert from 'node:assert/strict';

import {
  CONTINUITY_PLAN_KIND,
  createContinuityFact
} from '../../src/continuity/index.mjs';
import {
  CONTINUITY_PROJECTION_PLANNER_ROLE_ID,
  planContinuityProjection
} from '../../src/continuity/projection-planner-client.mjs';

const factIndex = {
  facts: [
    createContinuityFact({
      id: 'crew.hadrik-bronn.species',
      summary: 'Bronn is Tellarite, not a default human.',
      criticality: 'hard',
      tags: ['crew', 'invariant']
    }),
    createContinuityFact({
      id: 'ship.travel.current',
      summary: 'The Breckenridge has been at warp for weeks.',
      criticality: 'medium',
      tags: ['ship', 'travel']
    })
  ],
  conflicts: [],
  rejected: [],
  sourceCount: 2,
  acceptedCount: 2
};
const sourceFrame = {
  kind: 'directive.continuitySourceFrame.v1',
  sourceHash: 'source-hash-test',
  campaignId: 'campaign-test',
  packageId: 'package-test',
  revision: 7,
  relevantActorIds: ['hadrik-bronn'],
  playerText: 'I ask Bronn for the tactical report.',
  recentMessages: []
};

const noRouter = await planContinuityProjection({ factIndex, sourceFrame });
assert.equal(noRouter.ok, false);
assert.equal(noRouter.skipped, true);
assert.equal(noRouter.fallbackReason, 'no-generation-router');

const calls = [];
const valid = await planContinuityProjection({
  factIndex,
  sourceFrame,
  projectionHints: [{ id: 'hint.travel', factId: 'ship.travel.current', force: 'boost', minimumLane: 'directive.continuity.domain' }],
  generationRouter: {
    async generate(roleId, request) {
      calls.push({ roleId, request });
      return {
        ok: true,
        response: {
          text: [
            '```json',
            JSON.stringify({
              kind: CONTINUITY_PLAN_KIND,
              operations: [
                { factId: 'ship.travel.current', lane: 'L3', reason: 'active travel premise', force: 'boost', ttl: 'scene' }
              ],
              omitted: [],
              guardFocus: ['crew.hadrik-bronn.species'],
              compressionGroups: []
            }),
            '```'
          ].join('\n')
        },
        diagnostics: { providerId: 'fake-utility' }
      };
    }
  }
});
assert.equal(valid.ok, true);
assert.equal(calls.length, 1);
assert.equal(calls[0].roleId, CONTINUITY_PROJECTION_PLANNER_ROLE_ID);
assert.equal(calls[0].request.structuredOutput, true);
assert.equal(calls[0].request.parserSchema, CONTINUITY_PLAN_KIND);
assert.equal(calls[0].request.metadata.sourceHash, sourceFrame.sourceHash);
assert.equal(valid.request.candidateFacts.length, 2);
assert.equal(valid.request.hardFloorFactIds.includes('crew.hadrik-bronn.species'), true);
assert.equal(valid.plan.operations[0].factId, 'ship.travel.current');
assert.equal(valid.repairedJson, false);

const nestedPlan = await planContinuityProjection({
  factIndex,
  sourceFrame,
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          content: {
            plan: {
              kind: CONTINUITY_PLAN_KIND,
              operations: [{ factId: 'crew.hadrik-bronn.species', lane: 'L1', reason: 'hard identity' }],
              omitted: []
            }
          }
        }
      };
    }
  }
});
assert.equal(nestedPlan.ok, true);
assert.equal(nestedPlan.plan.operations[0].factId, 'crew.hadrik-bronn.species');

const invalidJson = await planContinuityProjection({
  factIndex,
  sourceFrame,
  generationRouter: {
    async generate() {
      return { ok: true, response: { text: 'not-json' } };
    }
  }
});
assert.equal(invalidJson.ok, false);
assert.equal(invalidJson.fallbackReason, 'planner-json-parse-failed');

const invalidShape = await planContinuityProjection({
  factIndex,
  sourceFrame,
  generationRouter: {
    async generate() {
      return { ok: true, response: { text: '{"kind":"wrong","operations":[]}' } };
    }
  }
});
assert.equal(invalidShape.ok, false);
assert.equal(invalidShape.fallbackReason, 'planner-plan-shape-invalid');

const providerFailure = await planContinuityProjection({
  factIndex,
  sourceFrame,
  generationRouter: {
    async generate() {
      return { ok: false, error: { code: 'PROVIDER_OFFLINE', message: 'offline' } };
    }
  }
});
assert.equal(providerFailure.ok, false);
assert.equal(providerFailure.fallbackReason, 'PROVIDER_OFFLINE');

console.log('Continuity projection planner client tests passed: Utility request shape, JSON parsing, nested plans, and fail-soft fallbacks.');
