import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  createQuestLedger,
  playerSafeQuestSummaries,
  setForegroundQuest,
  transitionQuest
} from '../../src/quests/quest-ledger.mjs';

const root = process.cwd();
const packageData = JSON.parse(fs.readFileSync(path.resolve(root, 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json'), 'utf8'));
const template = packageData.questTemplates.templates.find((item) => item.id === 'side-the-long-repair')
  || packageData.questTemplates.templates[0];

let ledger = createQuestLedger({
  questTemplates: packageData.questTemplates,
  now: '2026-06-22T00:00:00.000Z',
  statusOverrides: { [template.id]: 'available' }
});
ledger = transitionQuest(ledger, template.id, 'accepted', { now: '2026-06-22T00:01:00.000Z', reason: 'test-accept' });
ledger = setForegroundQuest(ledger, template.id, { now: '2026-06-22T00:02:00.000Z', reason: 'test-foreground' });

const active = ledger.instances.find((quest) => quest.id === template.id);
assert.equal(active.status, 'active');
assert.equal(active.foreground, true);
assert.equal(ledger.foregroundQuestId, template.id);

const summaries = playerSafeQuestSummaries(ledger, packageData, { statuses: ['active'] });
assert.ok(summaries.some((summary) => summary.id === template.id));
assert.doesNotMatch(JSON.stringify(summaries), /directorOnly|hidden|rawValues/i);

console.log('Open-world quest ledger contracts passed: transition, foreground, and player-safe summary');
