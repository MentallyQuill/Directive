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
assert.equal(plan.blocks.some((block) => block.id === 'reply-header'), true);
assert.match(plan.text, /\[Directive: Reply Header\]\nBegin every assistant reply/);
assert.match(plan.text, /\*Stardate 53049\.2 \| 0830 hours\*/);
assert.match(plan.text, /Priya Nayar/);
assert.match(plan.text, /Voice cue: Priya turns intent into cooperation/);
assert.match(plan.text, /Line shape: "Bronn thinks any unofficial path is a tunnel with a trap at the end/);
assert.match(plan.text, /do not force the full Asterion Reach strategy conversation yet/);
assert.match(plan.text, /Active objectives:\n- Complete the command handover with Captain Whitaker/);
assert.doesNotMatch(plan.text, /undefined: The Breckenridge/);
assert.doesNotMatch(plan.text, /directorOnly|rawValues/i);
assert.doesNotMatch(plan.text, /Becky Chambers|Picard|Sisko|Janeway|write like|in the style of/i);

const recorded = recordContextPlan(state, plan, {
  installedAt: '2026-06-22T00:01:00.000Z'
});
const lensRecord = recorded.directiveRuntimeEvidence?.lensPromptRevisionRecord;
assert.equal(recorded.runtimeTracking?.promptContext, undefined);
assert.equal(lensRecord.kind, 'directive.lensPromptRevisionRecord.v1');
assert.equal(lensRecord.revision, plan.revision);
assert.equal(lensRecord.hash, plan.hash);
assert.equal(recorded.runtimeResume.promptContextRevision, plan.revision);

console.log('Open-world context plan contracts passed: budget, safety, and LENS prompt revision record');
