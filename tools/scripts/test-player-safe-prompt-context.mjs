import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildPlayerSafePromptContext,
  buildPlayerSafePromptContextWithContinuityPlanner,
  createPlayerSafeCampaignProjection,
  recordPromptContextRevision
} from '../../src/generation/player-safe-prompt-context-builder.mjs';
import { CONTINUITY_PLAN_KIND, DIRECTIVE_STATIC_PROMPT_KEYS } from '../../src/continuity/index.mjs';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const shipDataset = readJson('packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json');
const canary = 'HIDDEN_CANARY_9bcae51f';

function findBundledPackagePairs() {
  const bundledRoot = path.resolve(root, 'packages/bundled');
  return fs.readdirSync(bundledRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(bundledRoot, entry.name))
    .map((dir) => {
      const files = fs.readdirSync(dir);
      return {
        dir,
        packagePath: files.find((file) => file.endsWith('.campaign-package.json')),
        projectionPath: files.find((file) => file.endsWith('.campaign-projection.json')),
        crewDatasetPath: files.find((file) => file.endsWith('.crew-dataset.json')),
        shipDatasetPath: files.find((file) => file.endsWith('.ship-dataset.json'))
      };
    })
    .filter((entry) => entry.packagePath && entry.projectionPath && entry.crewDatasetPath)
    .map((entry) => ({
      packagePath: path.relative(root, path.join(entry.dir, entry.packagePath)),
      projectionPath: path.relative(root, path.join(entry.dir, entry.projectionPath)),
      crewDatasetPath: path.relative(root, path.join(entry.dir, entry.crewDatasetPath)),
      shipDatasetPath: entry.shipDatasetPath ? path.relative(root, path.join(entry.dir, entry.shipDatasetPath)) : null
    }));
}

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
  presentCharacterIds: ['mara-whitaker', 'hadrik-bronn', 'player-commander'],
  availableDecisionPointIds: ['decision.arrival-tone'],
  directorNotes: canary
};

const packet = buildPlayerSafePromptContext({
  campaignState: state,
  packageData,
  crewDataset,
  shipDataset,
  scene,
  createdAt: '2026-06-22T00:00:00.000Z'
});
const playerProjection = createPlayerSafeCampaignProjection({
  campaignState: state,
  packageData,
  crewDataset,
  shipDataset,
  scene
});
const packetJson = JSON.stringify(packet);
const projectionJson = JSON.stringify(playerProjection);

const coreRevisionState = cloneJson(state);
coreRevisionState.runtimeTracking.revision = 99;
coreRevisionState.runtimeTracking.mechanicsRevision = 88;
coreRevisionState.directiveRuntimeEvidence = {
  coreStoreReadProjections: {
    kind: 'directive.coreStoreReadProjections.v1',
    runtimeAuthority: 'coreStoreV2',
    revisions: { runtime: 7, mechanics: 3 }
  }
};
const coreRevisionPacket = buildPlayerSafePromptContext({
  campaignState: coreRevisionState,
  packageData,
  crewDataset,
  shipDataset,
  scene,
  createdAt: '2026-06-22T00:00:00.000Z'
});
assert.equal(coreRevisionPacket.revision, 8);
assert.equal(
  coreRevisionPacket.blocks.every((block) => Number(block.source?.revision) === 7),
  true,
  'Prompt block source revisions must use CORE/v2 read-projection authority, not stale runtimeTracking.revision.'
);
const coreAuthorityNoVectorState = cloneJson(state);
coreAuthorityNoVectorState.runtimeTracking.revision = 99;
coreAuthorityNoVectorState.runtimeTracking.mechanicsRevision = 88;
coreAuthorityNoVectorState.directiveRuntimeEvidence = {
  coreStoreReadProjections: {
    kind: 'directive.coreStoreReadProjections.v1',
    runtimeAuthority: 'coreStoreV2'
  }
};
const coreAuthorityNoVectorPacket = buildPlayerSafePromptContext({
  campaignState: coreAuthorityNoVectorState,
  packageData,
  crewDataset,
  shipDataset,
  scene,
  createdAt: '2026-06-22T00:00:00.000Z'
});
assert.equal(coreAuthorityNoVectorPacket.revision, 1);
assert.equal(
  coreAuthorityNoVectorPacket.blocks.every((block) => Number(block.source?.revision) === 0),
  true,
  'Prompt block source revisions must not borrow stale runtimeTracking.revision when CORE/v2 authority exists without revisions.'
);

assert(packet.blocks.length > 0);
assert(packet.blocks.length <= packageData.contextPolicy.budgets.maxBlocks + DIRECTIVE_STATIC_PROMPT_KEYS.length);
assert.equal(packet.blocks.some((block) => block.id === 'continuity-contract'), true);
assert.deepEqual(
  packet.blocks.filter((block) => DIRECTIVE_STATIC_PROMPT_KEYS.includes(block.promptKey)).map((block) => block.promptKey),
  DIRECTIVE_STATIC_PROMPT_KEYS
);
assert.equal(packet.blocks.every((block) => typeof block.lensPromptBudgetLane === 'string' && block.lensPromptBudgetLane.length > 0), true);
assert.equal(packet.blocks.find((block) => block.promptKey === 'directive.contract')?.lensPromptBudgetLane, 'stableRules');
assert.equal(packet.blocks.find((block) => block.promptKey === 'directive.scene.active')?.lensPromptBudgetLane, 'activeScene');
assert.equal(packet.blocks.find((block) => block.promptKey === 'directive.continuity.invariants')?.lensPromptBudgetLane, 'protectedContinuity');
const playerCharacterBlock = packet.blocks.find((block) => block.id === 'player-character');
assert.equal(Boolean(playerCharacterBlock), true, 'Prompt packet must include the user-created player character block.');
assert.equal(playerCharacterBlock.promptKey, 'directive.campaign.player-character');
assert.equal(playerCharacterBlock.mustInclude, true);
assert.equal(playerCharacterBlock.content.includes('Commander Serrin'), true);
assert.equal(playerCharacterBlock.content.includes('Executive Officer'), true);
assert.equal(packetJson.includes('Do not invent a different name, rank, billet, or callsign.'), true);
const turnYieldBlock = packet.blocks.find((block) => block.id === 'turn-yield');
assert.equal(Boolean(turnYieldBlock), true, 'Prompt packet must include a mandatory turn-yield block.');
assert.equal(turnYieldBlock.promptKey, 'directive.campaign.turn-yield');
assert.equal(turnYieldBlock.mustInclude, true);
assert.equal(turnYieldBlock.lensPromptBudgetLane, 'activeScene');
assert.equal(turnYieldBlock.content.includes('Default live reply length: 80-140 words.'), true);
assert.equal(turnYieldBlock.content.includes('Player agency target: Commander Serrin.'), true);
assert.equal(turnYieldBlock.content.includes('not necessarily the current command recipient'), true);
const commandAuthorityBlock = packet.blocks.find((block) => block.id === 'command-authority');
assert.equal(Boolean(commandAuthorityBlock), true, 'Prompt packet must include command-authority separation.');
assert.equal(commandAuthorityBlock.promptKey, 'directive.campaign.command-authority');
assert.equal(commandAuthorityBlock.mustInclude, true);
assert.equal(packet.blocks.find((block) => block.id === 'reply-header')?.lensPromptBudgetLane, 'activeScene');
assert.equal(packet.continuityProjection.audit.blockCount, DIRECTIVE_STATIC_PROMPT_KEYS.length);
assert.equal(packet.blocks.some((block) => block.id === 'reply-header'), true);
assert.equal(packet.blocks.some((block) => block.id === 'immediate-scene'), true);
assert.equal(packetJson.includes('*Stardate 53049.2 | 0830 hours*'), true);
assert.equal(packetJson.includes(canary), false);
assert.equal(projectionJson.includes(canary), false);
assert.equal(packetJson.includes('A relief convoy is overdue.'), true);
assert.equal(projectionJson.includes('Talk to department heads before arrival.'), true);
assert.equal(packetJson.includes('Port sensor pallet is degraded.'), true);
assert.equal(packetJson.includes('Professionally supportive, with reservations.'), true);
assert.equal(packetJson.includes('Lieutenant Commander Hadrik Bronn (Tellarite), Chief Tactical and Security Officer'), true);
assert.equal(packetJson.includes('age: 47 at campaign start; describe her as late forties, not early fifties.'), true);
assert.equal(packetJson.includes('age: Late fifties by human comparison.'), true);
assert.equal(packetJson.includes('Lieutenant Commander Hadrik Bronn is Tellarite'), true);
assert.equal(packetJson.includes('mustard-yellow'), true);
assert.equal(
  packetJson.includes('Do not describe the opening Breckenridge transit as six days at impulse')
  || packetJson.includes('Do not describe the opening Breckenridge transit as only three days out'),
  true
);
assert.equal(packetJson.includes('A named location change is a playable scene boundary'), true);
assert.equal(packetJson.includes('Do not enter a named location, resolve its purpose, and leave it in the same reply'), true);
assert.equal(packetJson.includes('Advance exactly one immediate playable beat, then yield.'), true);
assert.equal(packetJson.includes('End at the first meaningful opportunity for the player character to speak, observe, or act.'), true);
assert.equal(packetJson.includes('Do not continue into the next briefing, strategy handoff, relationship calibration, location purpose, or consequence chain unless the player explicitly asks to cut or summarize.'), true);
assert.equal(packetJson.includes('do not force the full Asterion Reach strategy conversation yet'), true);
assert.equal(packetJson.includes('shuttlebay two in the aft section between the swept nacelle pylons'), true);
assert.equal(projectionJson.includes('Deck 10 aft dorsal secondary hull'), true);
assert.equal(projectionJson.includes('saucer-underside shuttlebay'), true);
assert.equal(packetJson.includes('a human male in his early forties'), false);
assert.equal(packetJson.includes('red-and-black of tactical'), false);
assert.equal(projectionJson.includes('Lieutenant Vale is under observation.'), true);
assert.equal(projectionJson.includes('Acting bridge watch officer'), true);
assert.equal(playerProjection.scene.directorNotes, undefined);
assert.deepEqual(Object.keys(playerProjection.ship.damage[0]).sort(), ['id', 'label', 'severity', 'status']);

const samVickersState = cloneJson(state);
samVickersState.player = {
  ...samVickersState.player,
  id: 'sam-vickers',
  name: 'Sam Vickers',
  rank: 'Commander',
  billet: 'Executive Officer'
};
const samVickersPacket = buildPlayerSafePromptContext({
  campaignState: samVickersState,
  packageData,
  crewDataset,
  shipDataset,
  scene,
  createdAt: '2026-07-07T20:21:00.000Z'
});
const samVickersPlayerBlock = samVickersPacket.blocks.find((block) => block.id === 'player-character');
assert.equal(samVickersPlayerBlock.promptKey, 'directive.campaign.player-character');
assert.equal(samVickersPlayerBlock.mustInclude, true);
assert.equal(samVickersPlayerBlock.content.includes('Commander Sam Vickers'), true);
const samVickersYieldBlock = samVickersPacket.blocks.find((block) => block.id === 'turn-yield');
assert.equal(samVickersYieldBlock.promptKey, 'directive.campaign.turn-yield');
assert.equal(samVickersYieldBlock.content.includes('Player agency target: Commander Sam Vickers.'), true);
assert.equal(samVickersYieldBlock.content.includes('do not compress arrival, Bronn handoff, Whitaker handoff, and Reach strategy into one reply'), true);
assert.equal(JSON.stringify(samVickersPacket).includes('Vasquez'), false);

const shuttlebayPacket = buildPlayerSafePromptContext({
  campaignState: state,
  packageData,
  crewDataset,
  shipDataset,
  scene: {
    ...scene,
    location: 'Shuttlebay',
    locationId: 'intrepid.shuttlebay-complex'
  },
  playerText: 'I head to the shuttlebay and ask shuttle control for docking clearance.',
  createdAt: '2026-06-22T00:00:00.000Z'
});
const shuttlebayPacketJson = JSON.stringify(shuttlebayPacket);
assert.equal(shuttlebayPacketJson.includes('Deck 10 aft dorsal secondary hull'), true);
assert.equal(shuttlebayPacketJson.includes('saucer-underside'), true);

const readyRoomState = cloneJson(state);
readyRoomState.mission = {
  ...readyRoomState.mission,
  activePhaseId: 'ready-room-handover',
  phase: 'ready-room-handover',
  availableDecisionPointIds: ['decision.handover-value']
};
const readyRoomPacket = buildPlayerSafePromptContext({
  campaignState: readyRoomState,
  packageData,
  crewDataset,
  shipDataset,
  scene: {
    ...scene,
    phaseLabel: 'Ready-room handover',
    availableDecisionPointIds: ['decision.handover-value']
  },
  createdAt: '2026-06-22T00:00:00.000Z'
});
assert.equal(readyRoomPacket.text.includes('Do not turn the first captain meeting into a broad Asterion Reach thesis interview'), true);

const asyncFallbackPacket = await buildPlayerSafePromptContextWithContinuityPlanner({
  campaignState: state,
  packageData,
  crewDataset,
  shipDataset,
  scene,
  createdAt: '2026-06-22T00:00:00.000Z'
});
assert.equal(asyncFallbackPacket.hash, packet.hash);
assert.equal(asyncFallbackPacket.continuityProjection.planner, null);

const plannerCalls = [];
const plannerPacket = await buildPlayerSafePromptContextWithContinuityPlanner({
  campaignState: state,
  packageData,
  crewDataset,
  shipDataset,
  scene,
  playerText: 'I ask Bronn for the tactical and travel handoff.',
  createdAt: '2026-06-22T00:00:00.000Z'
}, {
  generationRouter: {
    async generate(roleId, request) {
      plannerCalls.push({ roleId, request });
      return {
        ok: true,
        response: {
          text: JSON.stringify({
            kind: CONTINUITY_PLAN_KIND,
            operations: [
              { factId: 'crew.hadrik-bronn.species', lane: 'L1', reason: 'active identity guard' },
              { factId: 'ship.uss-breckenridge.travel.not-six-days-impulse', lane: 'L3', reason: 'active travel guard', force: 'boost', ttl: 'scene' },
              { factId: 'ship.uss-breckenridge.travel.not-short-refit-duration', lane: 'L3', reason: 'active travel guard', force: 'boost', ttl: 'scene' }
            ],
            omitted: [{ factId: 'crew.hadrik-bronn.age-description', reason: 'utility budget omission' }],
            guardFocus: ['crew.hadrik-bronn.species'],
            compressionGroups: []
          })
        }
      };
    }
  }
});
assert.equal(plannerCalls.length, 1);
assert.equal(plannerCalls[0].roleId, 'continuityProjectionPlanner');
assert.equal(plannerCalls[0].request.parserSchema, CONTINUITY_PLAN_KIND);
assert.equal(plannerPacket.continuityProjection.planner.ok, true);
assert.equal(plannerPacket.continuityProjection.plan.laneFactIds['directive.continuity.invariants'].includes('crew.hadrik-bronn.species'), true);
assert.equal(plannerPacket.continuityProjection.plan.laneFactIds['directive.continuity.invariants'].includes('crew.hadrik-bronn.uniform-division-color'), true);
assert.equal(plannerPacket.continuityProjection.plan.selectedFactIds.includes('crew.hadrik-bronn.age-description'), true);
assert.equal(plannerPacket.continuityProjection.plan.guardFocus.includes('crew.hadrik-bronn.species'), true);
assert.equal(JSON.stringify(plannerPacket).includes(canary), false);

const invalidPlannerPacket = await buildPlayerSafePromptContextWithContinuityPlanner({
  campaignState: state,
  packageData,
  crewDataset,
  shipDataset,
  scene,
  createdAt: '2026-06-22T00:00:00.000Z'
}, {
  generationRouter: {
    async generate() {
      return { ok: true, response: { text: 'not-json' } };
    }
  }
});
assert.equal(invalidPlannerPacket.continuityProjection.planner.status, 'fallback');
assert.equal(invalidPlannerPacket.continuityProjection.planner.fallbackReason, 'planner-json-parse-failed');
assert.equal(invalidPlannerPacket.continuityProjection.plan.selectedFactIds.includes('crew.hadrik-bronn.species'), true);
assert.equal(JSON.stringify(invalidPlannerPacket).includes(canary), false);

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
  shipDataset,
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
  shipDataset,
  scene
});
assert.equal(JSON.stringify(malformedKnownFactsProjection).includes(canary), false);
assert.equal(malformedKnownFactsProjection.mission.knownFacts.length, 2);
assert.equal(malformedKnownFactsProjection.mission.knownFacts[0], 'A numeric-key known fact from an older malformed save remains player-safe.');

state = recordPromptContextRevision(state, packet, {
  installedAt: '2026-06-22T00:00:01.000Z'
});
assert.equal(state.runtimeTracking?.promptContext, undefined, 'Prompt revision record must not persist old runtimeTracking.promptContext authority.');
assert.equal(state.directiveRuntimeEvidence?.lensPromptRevisionRecord?.kind, 'directive.lensPromptRevisionRecord.v1');
assert.equal(state.directiveRuntimeEvidence.lensPromptRevisionRecord.revision, packet.revision);
assert.equal(state.directiveRuntimeEvidence.lensPromptRevisionRecord.blockCount, packet.blocks.length);
assert.equal(JSON.stringify(state.directiveRuntimeEvidence.lensPromptRevisionRecord).includes('Hidden text'), false);
const rebuilt = buildPlayerSafePromptContext({ campaignState: state, packageData, crewDataset, shipDataset, scene });
assert.equal(rebuilt.revision > packet.revision, true);

for (const pair of findBundledPackagePairs()) {
  const bundledPackage = readJson(pair.packagePath);
  const bundledProjection = readJson(pair.projectionPath);
  const bundledCrewDataset = readJson(pair.crewDatasetPath);
  const bundledShipDataset = pair.shipDatasetPath ? readJson(pair.shipDatasetPath) : null;
  const bundledState = initializeCampaignRuntimeTracking(cloneJson(bundledProjection.initialState));
  bundledState.campaign = {
    ...bundledState.campaign,
    id: `campaign-sweep-${bundledPackage.manifest.id}`,
    status: 'active'
  };
  const presentCrew = bundledPackage.crew.senior
    .filter((crew) => crew.id !== 'player-commander')
    .map((crew) => crew.id);
  const bundledPacket = buildPlayerSafePromptContext({
    campaignState: bundledState,
    packageData: bundledPackage,
    crewDataset: bundledCrewDataset,
    shipDataset: bundledShipDataset,
    scene: {
      missionTitle: 'Bundled crew identity sweep',
      phaseLabel: 'Identity Guard',
      presentCharacterIds: presentCrew
    },
    createdAt: '2026-06-22T00:00:00.000Z'
  });
  const relevantCrewBlock = bundledPacket.blocks.find((block) => block.id === 'relevant-crew');
  assert(relevantCrewBlock, `${pair.packagePath} should include relevant crew context`);
  for (const crew of bundledPackage.crew.senior.filter((entry) => entry.id !== 'player-commander')) {
    const datasetOfficer = bundledCrewDataset.officers.find((entry) => entry.id === crew.id);
    assert.match(relevantCrewBlock.content, new RegExp(`\\b${escapeRegex(crew.name)}\\b`), `${pair.packagePath} missing ${crew.name}`);
    assert.match(relevantCrewBlock.content, new RegExp(`\\(${escapeRegex(crew.species)}\\)`), `${pair.packagePath} missing ${crew.name} species`);
    assert.match(relevantCrewBlock.content, new RegExp(escapeRegex(crew.rank)), `${pair.packagePath} missing ${crew.name} rank`);
    assert.equal(Boolean(crew.publicProfile), true, `${pair.packagePath} missing ${crew.name} public profile data`);
    assert.equal(Boolean(crew.ageDescription), true, `${pair.packagePath} missing ${crew.name} public age data`);
    assert.equal(datasetOfficer?.ageDescription, crew.ageDescription, `${pair.crewDatasetPath} age data should match package roster for ${crew.name}`);
    assert.equal(relevantCrewBlock.content.includes(`age: ${crew.ageDescription}`), true, `${pair.packagePath} missing ${crew.name} age in relevant crew context`);
    const defaultProfile = `${crew.rank} ${crew.name} is ${crew.species}, ${crew.billet}.`;
    if (crew.publicProfile !== defaultProfile) {
      assert.equal(relevantCrewBlock.content.includes(crew.publicProfile), true, `${pair.packagePath} missing ${crew.name} non-default public profile`);
    }
  }
}

console.log('Player-safe prompt context tests passed: explicit selectors, hidden canary exclusion, stable blocks, and monotonic revisions');
