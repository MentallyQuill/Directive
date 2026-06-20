import assert from 'node:assert/strict';

import {
  assertHostPromptBlockSafeForInjection,
  createHostPromptInjectionPacket,
  normalizeHostPromptBlock
} from '../../src/generation/prompt-injection-safety.mjs';

const activeSituation = {
  id: 'active-situation',
  title: 'Active Situation',
  audience: 'playerSafe',
  priority: 20,
  source: {
    kind: 'campaignState',
    id: 'campaign-1',
    revision: 7
  },
  content: {
    phase: 'relief-convoy-handoff',
    visiblePressures: [
      'Convoy relief window is narrowing.'
    ],
    availableOrders: [
      'Stabilize the convoy route.',
      'Keep the Breckenridge inside mission safety limits.'
    ]
  }
};

const commandLog = {
  id: 'command-log-continuity',
  title: 'Command Log Continuity',
  audience: 'narratorSafe',
  priority: 10,
  source: {
    kind: 'commandLog',
    id: 'turn-12',
    revision: 7
  },
  content: 'Recent visible continuity: the crew accepted a delay to protect evacuees.'
};

const normalized = normalizeHostPromptBlock(activeSituation);
assert.equal(normalized.kind, 'directive.hostPromptBlock');
assert.equal(normalized.audience, 'playerSafe');
assert.equal(normalized.safety.playerVisible, true);
assert.match(normalized.text, /relief-convoy-handoff/);

const safe = assertHostPromptBlockSafeForInjection(activeSituation);
safe.content.visiblePressures.push('Mutated after validation.');
assert.equal(
  assertHostPromptBlockSafeForInjection(activeSituation).content.visiblePressures.length,
  1
);

const packet = createHostPromptInjectionPacket({
  blocks: [activeSituation, commandLog],
  attributionLabel: 'Directive Context',
  createdAt: '2026-06-19T14:00:00.000Z'
});
assert.equal(packet.kind, 'directive.hostPromptInjectionPacket');
assert.equal(packet.blocks[0].id, 'command-log-continuity');
assert.equal(packet.blocks[1].id, 'active-situation');
assert.match(packet.text, /\[Directive Context: Command Log Continuity\]/);
assert.match(packet.text, /\[Directive Context: Active Situation\]/);
assert.deepEqual(packet.breakdown[0], {
  label: 'Directive Context',
  title: 'Command Log Continuity',
  sourceKind: 'commandLog',
  sourceId: 'turn-12',
  sourceRevision: 7
});

assert.throws(
  () => assertHostPromptBlockSafeForInjection({
    ...activeSituation,
    audience: 'internalOnly'
  }),
  /cannot be injected/
);

assert.throws(
  () => assertHostPromptBlockSafeForInjection({
    ...activeSituation,
    safety: {
      rawHiddenValuesExposed: true
    }
  }),
  /safety flags/
);

assert.throws(
  () => assertHostPromptBlockSafeForInjection({
    ...activeSituation,
    content: {
      visible: 'safe',
      hiddenFacts: [
        'unsafe'
      ]
    }
  }),
  /unsafe content key "hiddenFacts"/
);

assert.throws(
  () => normalizeHostPromptBlock({
    ...activeSituation,
    content: '   '
  }),
  /content must not be empty/
);

console.log('Prompt injection safety tests passed.');
