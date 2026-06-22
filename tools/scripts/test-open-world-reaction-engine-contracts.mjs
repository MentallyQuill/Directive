import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  applyReactionRules,
  commitWorldEvent,
  ensureOpenWorldLedgers,
  normalizeEventLedger
} from '../../src/world/reaction-engine.mjs';

const root = process.cwd();
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
let state = ensureOpenWorldLedgers(readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json').initialState);
const committed = commitWorldEvent(state, {
  type: 'test.open-world-event',
  actorIds: ['priya-nayar'],
  locationIds: [state.worldState.currentLocationId],
  playerFacingSummary: 'Priya confirms the operations queue is stable.'
}, {
  boundaryType: 'test',
  now: '2026-06-22T00:00:00.000Z'
});

assert.equal(committed.event.sequence, 1);
assert.equal(committed.state.eventLedger.committedEvents.length, normalizeEventLedger(state.eventLedger).committedEvents.length + 1);
const reactions = applyReactionRules(committed.state, {
  packageData,
  event: committed.event,
  boundaryType: 'test',
  now: '2026-06-22T00:00:01.000Z'
});
assert.ok(reactions.state.eventLedger.lastCommittedEventId);
assert.equal(reactions.state.eventLedger.schemaVersion, 2);

console.log('Open-world reaction engine contracts passed: event commit, ledger normalization, and reaction pass');
