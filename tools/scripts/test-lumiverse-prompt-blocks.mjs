import assert from 'node:assert/strict';

import {
  createHostPromptInjectionPacket
} from '../../src/generation/prompt-injection-safety.mjs';
import {
  createLumiversePromptBlocksFromRuntimeSummary
} from '../../src/hosts/lumiverse/prompt-blocks.mjs';

assert.deepEqual(createLumiversePromptBlocksFromRuntimeSummary(null), []);
assert.deepEqual(createLumiversePromptBlocksFromRuntimeSummary({
  initialized: false
}), []);

const blocks = createLumiversePromptBlocksFromRuntimeSummary({
  initialized: true,
  activeSaveId: 'save-1',
  campaignState: {
    id: 'campaign-1',
    title: 'Ashes of Peace',
    playerName: 'Talia Serrin',
    shipName: 'U.S.S. Breckenridge',
    stardate: '57721.4',
    activeMissionGraphId: 'chapter-1-the-empty-convoy',
    activePhaseId: 'convoy-first-response',
    simulationMode: 'Command',
    visiblePressureCount: 2,
    commandLog: {
      count: 2,
      entries: [
        {
          type: 'campaignStart',
          stardate: '57721.1',
          summary: 'Talia Serrin accepted assignment aboard the Breckenridge.',
          visibleConsequences: [
            'Player character created.'
          ]
        },
        {
          type: 'directorOutcome',
          stardate: '57721.4',
          summary: 'The crew preserves evidence while protecting civilians.',
          visibleConsequences: [
            'The convoy response remains lawful and cautious.'
          ]
        }
      ]
    }
  },
  pendingOutcome: {
    resultBand: 'Partial Success',
    summary: 'The response is workable but carries timing pressure.',
    warningCount: 1
  },
  crew: {
    seniorCount: 2,
    seniorCrew: [
      {
        id: 'player-commander',
        name: 'Talia Serrin',
        rank: 'Commander',
        billet: 'Executive Officer',
        role: 'Player character',
        continuity: 'Player character'
      },
      {
        id: 'mara-whitaker',
        name: 'Mara Whitaker',
        rank: 'Captain',
        billet: 'Commanding Officer',
        role: 'Captain',
        continuity: 'Tracked behind the scenes'
      }
    ]
  },
  ship: {
    name: 'U.S.S. Breckenridge',
    class: 'Excelsior II',
    registry: 'NCC-97658',
    condition: 'Shakedown active',
    activeRestrictions: [
      'Combined-load testing incomplete.'
    ],
    technicalDebt: [
      'Command-network fallback procedure still needs validation.'
    ]
  }
}, {
  revision: 4
});

assert.equal(blocks.length, 3);
assert.deepEqual(blocks.map((block) => block.id), [
  'lumiverse-active-situation',
  'lumiverse-command-log-continuity',
  'lumiverse-crew-and-ship'
]);
assert.equal(blocks.every((block) => block.safety.rawHiddenValuesExposed === false), true);
assert.equal(blocks.every((block) => block.safety.directorOnlyDataIncluded === false), true);

const packet = createHostPromptInjectionPacket({
  blocks,
  attributionLabel: 'Directive Context',
  createdAt: '2026-06-19T18:00:00.000Z'
});
assert.match(packet.text, /Talia Serrin/);
assert.match(packet.text, /U\.S\.S\. Breckenridge/);
assert.match(packet.text, /Command Log Continuity/);
assert.doesNotMatch(packet.text, /hiddenFacts|directorOnlyData|rawRelationshipValues|rawValuesHidden/i);
assert.equal(packet.breakdown.length, 3);

console.log('Lumiverse prompt block tests passed.');
