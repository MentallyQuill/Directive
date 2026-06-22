import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const state = projection.initialState;

const locationIds = new Set((packageData.world?.locations || []).map((location) => location.id));
assert.ok(locationIds.size >= 10, 'open-world package should define navigable locations');
assert.ok(locationIds.has(state.worldState.currentLocationId), 'current location should resolve to package world');

const questTemplates = new Set((packageData.questTemplates?.templates || []).map((quest) => quest.id));
assert.ok(questTemplates.size >= 10, 'open-world package should define standing quest templates');
for (const quest of state.questLedger.instances || []) {
  assert.ok(questTemplates.has(quest.templateId || quest.id), `${quest.id} should resolve to a package quest template`);
}

const threadTemplates = new Set((packageData.threadTemplates?.templates || []).map((thread) => thread.id));
assert.ok(threadTemplates.size >= 10, 'open-world package should define thread templates');
for (const record of state.threadLedger.records || []) {
  if (record.templateId) {
    assert.ok(threadTemplates.has(record.templateId), `${record.id} should resolve to a package thread template`);
  }
}

const storyArcIds = new Set((packageData.storyArcs?.arcs || []).map((arc) => arc.id));
for (const arc of state.storyArcLedger.arcs || []) {
  assert.ok(storyArcIds.has(arc.arcId || arc.id), `${arc.arcId || arc.id} should resolve to a package story arc`);
}

assert.equal(state.attentionState.foregroundQuestId, state.questLedger.foregroundQuestId);
assert.ok(Array.isArray(packageData.reactionRules?.rules) && packageData.reactionRules.rules.length > 0);
assert.ok(packageData.contextPolicy?.hiddenStatePolicy);

console.log('Open-world data contracts passed: world, quests, threads, arcs, attention, and context policy');
