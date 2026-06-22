import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildContextPlan,
  recordContextPlan
} from '../../src/context/context-orchestrator.mjs';

const root = process.cwd();
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const state = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json').initialState;
const plan = buildContextPlan({
  campaignState: state,
  packageData,
  crewDataset,
  scene: {
    locationId: state.worldState.currentLocationId,
    presentCharacters: ['player-commander', 'priya-nayar']
  },
  createdAt: '2026-06-22T00:00:00.000Z'
});

assert.equal(plan.kind, 'directive.contextPlan');
assert.equal(plan.safety.rawHiddenValuesExposed, false);
assert.ok(plan.blocks.length > 0);
assert.ok(plan.blocks.length <= 12);
assert.doesNotMatch(plan.text, /directorOnly|rawValues/i);

const recorded = recordContextPlan(state, plan, {
  installedAt: '2026-06-22T00:01:00.000Z'
});
assert.equal(recorded.runtimeTracking.promptContext.revision, plan.revision);
assert.equal(recorded.runtimeTracking.promptContext.hash, plan.hash);

console.log('Open-world context plan contracts passed: budget, safety, and runtime tracking');
