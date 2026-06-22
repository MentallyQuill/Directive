import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  acceptQuest,
  delegateQuest,
  openWorldQuestView,
  rankQuestOpportunities
} from '../../src/quests/quest-director.mjs';
import { transitionQuest } from '../../src/quests/quest-ledger.mjs';

const root = process.cwd();
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
let state = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json').initialState;
state.questLedger = transitionQuest(state.questLedger, 'side-the-long-repair', 'available', {
  now: '2026-06-22T00:00:00.000Z',
  reason: 'test-available'
});
const opportunities = rankQuestOpportunities({ state, packageData, limit: 8 });
const target = opportunities.find((quest) => quest.id === 'side-the-long-repair');
assert.ok(target, 'expected at least one available or offered quest opportunity');

state = acceptQuest(state, packageData, target.id, {
  now: '2026-06-22T00:01:00.000Z',
  makeForeground: true,
  reason: 'test-accept'
});
state = delegateQuest(state, packageData, target.id, ['priya-nayar'], {
  now: '2026-06-22T00:02:00.000Z',
  reason: 'test-delegate'
});

const view = openWorldQuestView(state, packageData);
const delegated = view.quests.find((quest) => quest.id === target.id);
assert.equal(delegated.status, 'delegated');
assert.deepEqual(delegated.assignedActorIds, ['priya-nayar']);
assert.ok(view.foregroundQuestId);

console.log('Open-world quest director contracts passed: opportunity, accept, delegate, and view');
