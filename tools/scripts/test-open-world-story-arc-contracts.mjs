import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  applyStoryArcDelta,
  createStoryArcLedger,
  evaluateMilestones
} from '../../src/story/story-arc-director.mjs';

const root = process.cwd();
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const state = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json').initialState;
const ledger = createStoryArcLedger(packageData);
assert.equal(ledger.schemaVersion, 2);
assert.ok(ledger.arcs.length > 0);
assert.equal(ledger.rawValuesHidden, true);

const evaluated = evaluateMilestones(ledger, {
  packageData,
  state,
  sourceEventId: 'event.test.story'
});
assert.equal(evaluated.ledger.rawValuesHidden, true);
assert.ok(Array.isArray(evaluated.completed));
assert.ok(Array.isArray(evaluated.unlocked));

const patched = applyStoryArcDelta(evaluated.ledger, {
  revealedLeadIdsAdd: ['lead.test.visible'],
  endingAxisUpdates: [{ id: 'axis.test', state: 'observed', evidence: ['event.test.story'] }]
});
assert.ok(patched.revealedLeadIds.includes('lead.test.visible'));
assert.equal(patched.rawValuesHidden, true);

console.log('Open-world story arc contracts passed: ledger, milestone evaluation, and deltas');
