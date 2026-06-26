import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildPlayerSafePromptContext,
  createPlayerSafeCampaignProjection,
  recordPromptContextRevision
} from '../../src/generation/player-safe-prompt-context-builder.mjs';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const canary = 'HIDDEN_CANARY_9bcae51f';

let state = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
state.campaign = {
  ...state.campaign,
  id: 'campaign-prompt-safety',
  title: 'Ashes of Peace',
  status: 'active'
};
state.player = {
  ...state.player,
  id: 'player-prompt-safety',
  name: 'Commander Serrin',
  rank: 'Commander',
  billet: 'Executive Officer',
  dossier: {
    publicReputation: 'A deliberate officer trusted with difficult assignments.',
    privateAssessment: canary
  }
};
state.campaignChatBinding = {
  hostId: 'fake',
  chatId: 'chat-prompt-safety',
  promptContextRevision: 0
};
state.knowledgeLedger.facts.push(
  { id: 'visible-fact', summary: 'A relief convoy is overdue.', visibility: 'player' },
  { id: 'hidden-fact', summary: canary, visibility: 'directorOnly' }
);
state.mission.knownFacts.push(
  { id: 'visible-fact', summary: 'A relief convoy is overdue.', playerVisible: true },
  { id: 'hidden-fact', summary: canary, visibility: 'hidden' }
);
state.mission.formalObjectives.push({ id: 'hidden-objective', summary: canary, visibility: 'hidden' });
state.mission.openAssignments = [
  { id: 'visible-order', title: 'Walk the ship', summary: 'Talk to department heads before arrival.', playerVisible: true, owner: 'Whitaker', hiddenReason: canary },
  { id: 'hidden-order', title: canary, summary: canary, visibility: 'hidden' }
];
state.relationships.seniorCrew[0].currentStance = canary;
state.relationships.seniorCrew[0].hiddenQuestion = canary;
state.relationships.seniorCrew[0].visibleDescriptor = 'Professionally supportive, with reservations.';
state.relationships.seniorCrew[1].currentStance = canary;
state.ship.damage.push({ id: 'hidden-damage', summary: canary, visibility: 'hidden' });
state.ship.damage.push({ id: 'visible-damage', summary: 'Port sensor pallet is degraded.', playerVisible: true, internalCause: canary });
state.ship.technicalDebt.push({ id: 'hidden-debt', summary: canary, visibility: 'hidden' });
state.ship.activeRestrictions.push({ id: 'visible-restriction', summary: 'Maximum warp is temporarily restricted.', playerVisible: true, detectorScore: canary });
state.crew.casualties.push({ crewId: 'mara-whitaker', summary: canary, visibility: 'hidden' });
state.crew.casualties.push({ crewId: 'kieran-vale', summary: 'Lieutenant Vale is under observation.', playerVisible: true, privateNotes: canary });
state.crew.reassignments.push({ crewId: 'priya-nayar', to: 'Acting bridge watch officer', playerVisible: true, hiddenReason: canary });
state.pressureLedger.records.push({ id: 'hidden-pressure', summary: canary, visibility: 'hidden', status: 'active' });
state.dynamicQuestCatalog.templates.push({
  id: 'quest.hidden-canary',
  schemaVersion: 2,
  kind: 'emergent',
  title: canary,
  playerSummary: canary,
  anchors: { locationIds: [], actorIds: [], factionIds: [] },
  availability: {},
  objectives: [{ id: 'objective.hidden', label: canary, required: true }],
  approaches: [{ id: 'approach.hidden', label: 'Investigate', tags: ['investigate'] }],
  systemicResolution: { failureForward: true },
  outcomes: [],
  provenance: { sourceThreadId: 'thread.hidden-canary' }
});
state.questLedger.instances.push({
  id: 'quest.hidden-canary',
  templateId: 'quest.hidden-canary',
  kind: 'emergent',
  status: 'latent',
  foreground: false,
  objectiveStates: [{ id: 'objective.hidden', status: 'pending', progress: 0 }]
});
state.commandLog.entries.push({ id: 'hidden-log', summary: canary, visibility: 'hidden' });
state.directives.active.push({ id: 'hidden-directive', summary: canary, visibility: 'hidden' });

const scene = {
  missionTitle: 'Prelude: A Ship Underway',
  phaseLabel: 'Arrival',
  location: 'Main Bridge',
  relevantFactIds: ['visible-fact', 'hidden-fact'],
  currentQuestion: 'How will the new XO establish command rhythm?',
  immediateStakes: 'The senior staff is assessing the new command relationship.',
  presentCharacterIds: ['mara-whitaker', 'player-commander'],
  availableDecisionPointIds: ['decision.arrival-tone'],
  directorNotes: canary
};

const packet = buildPlayerSafePromptContext({
  campaignState: state,
  packageData,
  crewDataset,
  scene,
  createdAt: '2026-06-22T00:00:00.000Z'
});
const playerProjection = createPlayerSafeCampaignProjection({
  campaignState: state,
  packageData,
  crewDataset,
  scene
});
const packetJson = JSON.stringify(packet);
const projectionJson = JSON.stringify(playerProjection);

assert(packet.blocks.length > 0);
assert(packet.blocks.length <= packageData.contextPolicy.budgets.maxBlocks);
assert.equal(packet.blocks.some((block) => block.id === 'directive-contract'), true);
assert.equal(packet.blocks.some((block) => block.id === 'reply-header'), true);
assert.equal(packet.blocks.some((block) => block.id === 'immediate-scene'), true);
assert.equal(packetJson.includes('*Stardate 53049.2 | 0830 hours*'), true);
assert.equal(packetJson.includes(canary), false);
assert.equal(projectionJson.includes(canary), false);
assert.equal(packetJson.includes('A relief convoy is overdue.'), true);
assert.equal(projectionJson.includes('Talk to department heads before arrival.'), true);
assert.equal(packetJson.includes('Port sensor pallet is degraded.'), true);
assert.equal(packetJson.includes('Professionally supportive, with reservations.'), true);
assert.equal(projectionJson.includes('Lieutenant Vale is under observation.'), true);
assert.equal(projectionJson.includes('Acting bridge watch officer'), true);
assert.equal(playerProjection.scene.directorNotes, undefined);
assert.deepEqual(Object.keys(playerProjection.ship.damage[0]).sort(), ['id', 'label', 'severity', 'status']);

const malformedCommandLogProjection = createPlayerSafeCampaignProjection({
  campaignState: {
    ...state,
    commandLog: {
      entries: {
        latest: {
          id: 'malformed-live-entry',
          summary: 'This shape should not crash prompt projection.'
        }
      }
    }
  },
  packageData,
  crewDataset,
  scene
});
assert.deepEqual(malformedCommandLogProjection.commandLog, []);

const malformedKnownFactsProjection = createPlayerSafeCampaignProjection({
  campaignState: {
    ...state,
    mission: {
      ...state.mission,
      knownFacts: {
        0: 'A numeric-key known fact from an older malformed save remains player-safe.',
        1: { id: 'hidden-numeric-fact', summary: canary, visibility: 'hidden' },
        2: { id: 'visible-numeric-fact', summary: 'A second numeric-key known fact remains visible.', playerVisible: true }
      }
    }
  },
  packageData,
  crewDataset,
  scene
});
assert.equal(JSON.stringify(malformedKnownFactsProjection).includes(canary), false);
assert.equal(malformedKnownFactsProjection.mission.knownFacts.length, 2);
assert.equal(malformedKnownFactsProjection.mission.knownFacts[0], 'A numeric-key known fact from an older malformed save remains player-safe.');

state = recordPromptContextRevision(state, packet, {
  installedAt: '2026-06-22T00:00:01.000Z'
});
const rebuilt = buildPlayerSafePromptContext({ campaignState: state, packageData, crewDataset, scene });
assert.equal(rebuilt.revision > packet.revision, true);

console.log('Player-safe prompt context tests passed: explicit selectors, hidden canary exclusion, stable blocks, and monotonic revisions');
