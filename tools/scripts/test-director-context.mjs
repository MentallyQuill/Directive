import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createDirectorAuthoredContext,
  projectDirectorContinuity,
} from '../../src/story/director-context.mjs';
import { validateMissionDefinition } from '../../src/mission/v1/mission-contracts.mjs';

const definition = {
  id: 'mission.context',
  objectives: [{
    id: 'objective.visible',
    activationWhen: { factKnown: 'fact.public' },
    availableWhen: { eventOccurred: 'event.arrived' },
    visibleWhen: { factKnown: 'fact.public' },
    progressWhen: { outcomeIs: { id: 'outcome.work', equals: 'started' } },
    playerText: { title: 'Talk to the tender', summary: 'Discuss the outstanding assignment.' },
    scenePacing: { authorizationOutcomeId: 'outcome.pacing.visible' },
  }, {
    id: 'objective.hidden',
    playerText: { title: 'Secret saboteur', summary: 'Expose the hidden saboteur.' },
  }, {
    id: 'objective.resolved',
    playerText: { title: 'Finished work', summary: 'This is already complete.' },
  }],
  directorGuidance: {
    focusText: 'Keep the tender conversation available when the player wants it.',
    avoidText: 'Do not force the assignment while the player pursues another lead.',
    constraintRefs: ['ship-constraint.cascade-risk'],
  },
};
const missionState = {
  outcomes: { 'outcome.pacing.visible': 'held' },
  objectives: {
    'objective.visible': { state: 'available', visibility: 'visible', disposition: null },
    'objective.hidden': { state: 'inactive', visibility: 'hidden', disposition: null },
    'objective.resolved': { state: 'terminal', visibility: 'resolved', disposition: 'completed' },
  },
};
const context = createDirectorAuthoredContext({
  definition,
  missionState,
  shipMechanics: {
    constraints: [{
      id: 'ship-constraint.cascade-risk',
      label: 'Cascade risk',
      summary: 'Combined-load work can propagate failures.',
      narratorGuidance: 'Do not allow a combined-load shortcut.',
    }],
    capabilities: [{
      id: 'ship-capability.isolation',
      label: 'Segmented isolation',
      summary: 'Isolate one subsystem for controlled work.',
      narratorGuidance: 'Permit the established isolation route.',
      limits: ['Isolation does not guarantee success.'],
    }],
  },
  pendingTransition: null,
  pendingDutyReport: null,
});
assert.equal(context.coverage, 'partial');
assert.deepEqual(context.opportunities.map(({ id }) => id), ['objective.visible']);
assert.equal(context.opportunities[0].permissionFlags.completionAuthorized, false);
assert.deepEqual(context.opportunities[0].predicateRefs.sort(), [
  'event.arrived', 'fact.public', 'outcome.work', 'outcome.pacing.visible',
].sort());
assert.equal(context.constraints.some(({ id }) => id === 'ship-constraint.cascade-risk'), true);
assert.equal(context.constraints.some(({ id }) => id === 'ship-capability.isolation.limit.0'), true);
assert.equal(JSON.stringify(context).includes('Secret saboteur'), false);
assert.equal(JSON.stringify(context).includes('already complete'), false);

const withTypedTargets = createDirectorAuthoredContext({
  definition: { id: 'mission.empty', objectives: [] },
  missionState: { objectives: {} },
  pendingTransition: {
    kind: 'directive.missionTransitionNarrationPacket.v1',
    id: 'transition.next',
    next: { playerSafeSetup: 'A new assignment waits at Asterion Station.' },
    mustNarrate: ['Acknowledge the accepted disposition.'],
    mustNotReveal: ['Do not identify the attacker.'],
  },
  pendingDutyReport: {
    packet: { kind: 'directive.dutyReportPacket.v1', reportId: 'report.one', playerText: { summary: 'A report is ready.' } },
    segment: { canonicalText: 'Captain, the report is ready.' },
  },
});
assert.deepEqual(withTypedTargets.opportunities.map(({ kind }) => kind), ['duty-report', 'transition']);
assert.equal(withTypedTargets.opportunities[0].playerSafeText, 'Captain, the report is ready.');
assert.equal(withTypedTargets.opportunities[1].playerSafeText, 'A new assignment waits at Asterion Station.');
assert.equal(JSON.stringify(withTypedTargets).includes('Do not identify the attacker.'), false);

const unavailable = createDirectorAuthoredContext({
  definition: { id: 'mission.empty', objectives: [] },
  missionState: { objectives: {} },
  pendingTransition: { available: false, id: 'transition.secret', playerSafeText: 'Unavailable target text.' },
});
assert.equal(JSON.stringify(unavailable).includes('Unavailable target text.'), false);

const missionDefinition = JSON.parse(readFileSync(new URL(
  '../../packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json',
  import.meta.url,
), 'utf8'));
const missionSchema = JSON.parse(readFileSync(new URL(
  '../../schemas/mission/mission-v1.schema.json', import.meta.url,
), 'utf8'));
assert.deepEqual(missionSchema.properties.directorGuidance, { $ref: '#/$defs/directorGuidance' });
assert.equal(missionSchema.$defs.directorGuidance.additionalProperties, false);
assert.deepEqual(missionSchema.$defs.directorGuidance.required, ['focusText', 'avoidText', 'constraintRefs']);
missionDefinition.directorGuidance = {
  focusText: 'Keep the first meeting playable.',
  avoidText: 'Do not rush into the next assignment.',
  constraintRefs: [],
};
assert.equal(validateMissionDefinition(missionDefinition).ok, true);
const invalidGuidance = structuredClone(missionDefinition);
invalidGuidance.directorGuidance.secretText = 'The hidden answer.';
assert.match(validateMissionDefinition(invalidGuidance).errors.join('\n'), /directorGuidance contains unknown field/);
const duplicateGuidance = structuredClone(missionDefinition);
duplicateGuidance.directorGuidance.constraintRefs = ['ship-constraint.one', 'ship-constraint.one'];
assert.match(validateMissionDefinition(duplicateGuidance).errors.join('\n'), /constraintRefs must be unique/);

function source(id, quote) {
  return [{ messageId: `message.${id}`, selectedSwipeId: null, textHash: `hash.${id}`, evidenceQuote: quote }];
}
const events = [{
  kind: 'directive.continuityEvent.v1', id: 'event.open.alpha', threadId: 'thread.alpha', branchId: 'main',
  operation: 'open', payload: { title: 'Alpha obligation', category: 'obligation' },
  sourceContributionIds: ['contribution.alpha'], sources: source('alpha', 'Alpha obligation was accepted.'),
  dependsOnEventIds: [], settledAtRevision: 1,
}, {
  kind: 'directive.continuityEvent.v1', id: 'event.fact.alpha', threadId: 'thread.alpha', branchId: 'main',
  operation: 'addFact', payload: { text: 'The tender expects an answer.', claimType: 'narrated-fact', authoredRef: 'mission.context', supersedesFactId: null },
  sourceContributionIds: ['contribution.alpha'], sources: source('alpha', 'The tender expects an answer.'),
  dependsOnEventIds: ['event.open.alpha'], settledAtRevision: 2,
}, {
  kind: 'directive.continuityEvent.v1', id: 'event.open.beta', threadId: 'thread.beta', branchId: 'main',
  operation: 'open', payload: { title: 'Beta problem', category: 'unresolved-problem' },
  sourceContributionIds: ['contribution.beta'], sources: source('beta', 'Beta problem remains unresolved.'),
  dependsOnEventIds: [], settledAtRevision: 3,
}, {
  kind: 'directive.continuityEvent.v1', id: 'event.resolve.beta', threadId: 'thread.beta', branchId: 'main',
  operation: 'setStatus', payload: { status: 'resolved' },
  sourceContributionIds: ['contribution.beta'], sources: source('beta', 'Beta problem is now resolved.'),
  dependsOnEventIds: ['event.open.beta'], settledAtRevision: 4,
}];

const continuity = projectDirectorContinuity({
  events,
  missionId: 'mission.context',
  referencedIds: ['thread.beta'],
  maxCharacters: 4000,
});
assert.deepEqual(continuity.index.map(({ id }) => id), ['thread.alpha']);
assert.deepEqual(continuity.records.map(({ id }) => id), ['thread.beta', 'thread.alpha']);
assert.equal(continuity.records[1].facts[0].text, 'The tender expects an answer.');

assert.throws(() => projectDirectorContinuity({
  events: events.map((event, index) => index === 0
    ? { ...event, payload: { ...event.payload, title: 'x'.repeat(400) } }
    : event),
  missionId: 'mission.context',
  referencedIds: [],
  maxCharacters: 40,
}), /director-context-overflow/);

console.log('Director context tests passed.');
