import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  initializeOpenWorldCampaignState,
  timeAdvanceBoundary
} from '../../src/directors/director-coordinator.mjs';
import {
  activateQuest,
  delegateQuest
} from '../../src/quests/quest-director.mjs';
import {
  questInstanceById,
  reconcileQuestAvailability,
  registerDynamicQuestTemplate
} from '../../src/quests/quest-ledger.mjs';

const packageData = JSON.parse(fs.readFileSync(new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json', import.meta.url), 'utf8'));
const projection = JSON.parse(fs.readFileSync(new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json', import.meta.url), 'utf8'));
let tick = 0;
const now = () => `2026-06-22T14:${String(tick++).padStart(2, '0')}:00.000Z`;
let state = initializeOpenWorldCampaignState({ packageData, baseState: projection.initialState, now });

function objective(id, label) {
  return {
    id,
    label,
    playerText: label,
    optional: false,
    initialStatus: 'pending',
    initialProgress: 0,
    progressModel: { mode: 'incremental', completionThreshold: 100, defaultProgress: 40, strongMatchProgress: 60, setbackProgress: 20 }
  };
}

function dynamicTemplate(id, overrides = {}) {
  return {
    id,
    kind: 'emergent',
    dynamic: true,
    title: overrides.title || id,
    summary: overrides.summary || 'Lifecycle fixture.',
    playerSummary: overrides.summary || 'Lifecycle fixture.',
    directorSummary: 'Deterministic lifecycle fixture.',
    dramaticQuestion: 'Will the assignment advance under open-world lifecycle rules?',
    anchors: { locationIds: [state.worldState.currentLocationId], actorIds: [], factionIds: [] },
    availability: overrides.availability || {},
    initialStatus: 'available',
    activation: { mode: 'player-selection' },
    offerPolicy: { retractWhenUnavailable: false },
    objectives: overrides.objectives || [objective(`${id}.objective.one`, 'Complete the first bounded task.'), objective(`${id}.objective.two`, 'Verify the result.')],
    pressures: [],
    revelations: [],
    approaches: ['Direct supervision.', 'Delegated specialist work.'],
    outcomes: [{ id: 'resolved', summary: 'The bounded assignment is complete.', effects: [] }],
    completionConditions: {},
    failureConditions: {},
    expiryConditions: overrides.expiryConditions || {},
    transformsTo: overrides.transformsTo || [],
    delegation: overrides.delegation || { allowed: true, requiresAssetIds: [], risk: 'Delegated work may take time.', minimumHours: 1, progressPerCheck: 65, checkEveryHours: 1, failureForward: true },
    systemicResolution: { enabled: true, minimumApproachDiversity: 2, failureForward: true, maxObjectiveProgressPerTurn: 65, completionRequiresAllRequiredObjectives: true },
    emittedEvents: [],
    contextHints: { actorIds: [], locationIds: [state.worldState.currentLocationId], factionIds: [], factIds: [], frontIds: [], pressureIds: [] },
    tags: ['fixture'],
    provenance: { evidenceIds: ['fixture'], sourceMessageIds: [], sourceOutcomeIds: [], anchorRange: null, method: 'test' },
    semanticFingerprint: `${id}.fingerprint`
  };
}

const delegatedId = 'quest.emergent.delegation-fixture';
state = registerDynamicQuestTemplate(state, dynamicTemplate(delegatedId), { now });
state.questLedger = reconcileQuestAvailability(state.questLedger, packageData, state, { now }).ledger;
state = activateQuest(state, packageData, delegatedId, { now, reason: 'test-delegation' });
assert.deepEqual(state.attentionState.questFocusStack, ['prelude-a-ship-underway']);
state = delegateQuest(state, packageData, delegatedId, ['nella-ivers'], { now, reason: 'test-delegation' });
assert.equal(questInstanceById(state.questLedger, delegatedId).status, 'delegated');
assert.equal(state.questLedger.foregroundQuestId, 'prelude-a-ship-underway');

let boundary = timeAdvanceBoundary({ state, packageData, hours: 5, reason: 'downtime', now });
state = boundary.state;
assert(boundary.events.some((event) => event.type === 'quest.delegation.progress'));
assert(questInstanceById(state.questLedger, delegatedId).objectiveStates.some((item) => item.progress > 0));
for (let i = 0; i < 4 && questInstanceById(state.questLedger, delegatedId).status !== 'resolved'; i += 1) {
  boundary = timeAdvanceBoundary({ state, packageData, hours: 5, reason: 'downtime', now });
  state = boundary.state;
}
assert.equal(questInstanceById(state.questLedger, delegatedId).status, 'resolved', 'Delegated objectives must complete at bounded world boundaries.');
assert(state.eventLedger.committedEvents.some((event) => event.sourceQuestId === delegatedId));

const transformTargetId = 'quest.emergent.deadline-transformed';
const expiringId = 'quest.emergent.deadline-fixture';
state = registerDynamicQuestTemplate(state, dynamicTemplate(transformTargetId, {
  title: 'Changed Circumstances',
  availability: { flag: { id: 'unlock-only-by-transformation', value: true } },
  delegation: { allowed: false, requiresAssetIds: [], failureForward: true }
}), { now });
const deadline = Number((state.worldState.currentStardate + 0.01).toFixed(3));
state = registerDynamicQuestTemplate(state, dynamicTemplate(expiringId, {
  title: 'Time-Limited Opportunity',
  expiryConditions: { time: { op: '>=', stardate: deadline } },
  transformsTo: [transformTargetId],
  delegation: { allowed: false, requiresAssetIds: [], failureForward: true }
}), { now });
state.questLedger = reconcileQuestAvailability(state.questLedger, packageData, state, { now }).ledger;
// The target exists but remains latent until the source transforms.
const targetBefore = questInstanceById(state.questLedger, transformTargetId);
targetBefore.status = 'latent';
state = activateQuest(state, packageData, expiringId, { now, reason: 'test-active-deadline' });
assert.equal(questInstanceById(state.questLedger, expiringId).status, 'active');

boundary = timeAdvanceBoundary({ state, packageData, hours: 2, reason: 'downtime', now });
state = boundary.state;
assert.equal(questInstanceById(state.questLedger, expiringId).status, 'expired', 'Expiry conditions must apply to active quests when their world deadline passes.');
assert.equal(questInstanceById(state.questLedger, transformTargetId).status, 'available');
assert(boundary.questTransformations.some((item) => item.fromQuestId === expiringId && item.toQuestId === transformTargetId));
assert(state.eventLedger.committedEvents.some((event) => event.type === 'quest.transformed'));

console.log('test-open-world-delegation-lifecycle: ok');
