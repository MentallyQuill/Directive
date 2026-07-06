import assert from 'node:assert/strict';
import fs from 'node:fs';

import { initializeOpenWorldCampaignState } from '../../src/directors/director-coordinator.mjs';
import { buildContextPlan, recordContextPlan } from '../../src/context/context-orchestrator.mjs';

const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const packageData = read('../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = read('../../packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = read('../../packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const canary = 'DIRECTOR_ONLY_CONTEXT_CANARY_9f4a2c';

let state = initializeOpenWorldCampaignState({
  packageData,
  baseState: projection.initialState,
  now: () => '2026-06-22T14:00:00.000Z'
});
state.knowledgeLedger.facts.push({
  id: 'fact.hidden.canary',
  visibility: 'directorOnly',
  summary: canary,
  playerSafeSummary: canary
});
state.commandLog.entries.push({
  id: 'log.visible',
  summary: 'The new executive officer reviewed the shipboard readiness picture.',
  visibility: 'player'
});
state.commandLog.entries.push({
  id: 'log.hidden',
  summary: canary,
  visibility: 'hidden'
});
state.dynamicQuestCatalog.templates.push({
  id: 'quest.dynamic.hidden-canary',
  schemaVersion: 2,
  title: canary,
  kind: 'emergent',
  playerSummary: canary,
  anchors: { locationIds: ['asterion-station'], actorIds: [], factionIds: [] },
  objectives: [{ id: 'objective.hidden', label: canary, required: true }],
  approaches: [{ id: 'approach.hidden', label: 'Investigate', tags: ['investigate'] }],
  availability: { all: [{ op: 'factKnown', factId: 'never-known' }] },
  systemicResolution: { failureForward: true, successThreshold: 60 },
  outcomes: [],
  provenance: { sourceThreadId: 'thread.hidden' }
});
state.questLedger.instances.push({
  id: 'quest.dynamic.hidden-canary',
  templateId: 'quest.dynamic.hidden-canary',
  kind: 'emergent',
  status: 'latent',
  foreground: false,
  objectiveStates: [{ id: 'objective.hidden', status: 'pending', progress: 0 }]
});

const plan = buildContextPlan({
  campaignState: state,
  packageData,
  crewDataset,
  scene: {
    presentCharacterIds: ['captain-whitaker', 'priya-nayar'],
    relevantFactIds: ['fact.hidden.canary'],
    currentQuestion: 'How should the new executive officer establish an effective command rhythm?',
    immediateStakes: 'Readiness and crew confidence before arrival in the Asterion Reach.'
  },
  recentMessageSummary: 'The player asked for a concise readiness report.',
  createdAt: '2026-06-22T14:00:00.000Z'
});

assert.equal(plan.kind, 'directive.contextPlan');
assert.equal(plan.audience, 'narratorSafe');
assert(plan.blocks.some((block) => block.id === 'directive-contract'));
assert(plan.blocks.some((block) => block.id === 'immediate-scene'));
assert(plan.blocks.some((block) => block.id === 'foreground-quest'));
assert(plan.blocks.length <= plan.budget.maxBlocks);
assert(plan.usage.total <= plan.budget.totalTokens || plan.blocks.every((block) => block.id === 'directive-contract' || block.id === 'immediate-scene' || block.id === 'foreground-quest'));
assert(!plan.text.includes(canary), 'Director-only and dormant canary content must never enter narrator context.');
assert(!plan.blocks.some((block) => block.sourceIds?.includes('quest.dynamic.hidden-canary')));
assert(plan.blocks.every((block) => block.audience === 'narratorSafe'));
assert(plan.blocks.every((block) => Number.isInteger(block.depth) && block.depth >= 0));
assert(plan.blocks.every((block) => block.tokenEstimate > 0));
assert(plan.blocks.every((block) => typeof block.lensPromptBudgetLane === 'string' && block.lensPromptBudgetLane.length > 0));
assert.equal(plan.blocks.find((block) => block.id === 'directive-contract')?.lensPromptBudgetLane, 'stableRules');
assert.equal(plan.blocks.find((block) => block.id === 'immediate-scene')?.lensPromptBudgetLane, 'activeScene');
assert.equal(plan.blocks.find((block) => block.id === 'relevant-crew')?.lensPromptBudgetLane, 'activeCast');
assert.equal(plan.safety.rawHiddenValuesExposed, false);
assert.equal(plan.safety.directorOnlyDataIncluded, false);

const recorded = recordContextPlan(state, plan, { installedAt: '2026-06-22T14:00:01.000Z' });
const lensRecord = recorded.directiveRuntimeEvidence?.lensPromptRevisionRecord;
assert.equal(recorded.runtimeTracking?.promptContext, undefined);
assert.equal(lensRecord.kind, 'directive.lensPromptRevisionRecord.v1');
assert.equal(lensRecord.hash, plan.hash);
assert.equal(lensRecord.blockCount, plan.blocks.length);
assert.equal(recorded.runtimeResume.promptContextRevision, plan.revision);

console.log('test-open-world-context-budget: ok');
