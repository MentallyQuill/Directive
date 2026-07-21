import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildPlayerFacingInformation,
  resolveSelectedQuestId
} from '../../src/ui/player-facing-information.mjs';

const runtimeApp = fs.readFileSync('src/runtime/runtime-app.mjs', 'utf8');
const runtimeShell = fs.readFileSync('src/runtime/runtime-shell.js', 'utf8');

assert.match(runtimeApp, /async selectMissionQuest\(\{ questId = '' \} = \{\}\)/);
assert.match(runtimeApp, /uiPreferences\.selectQuest\(scopeKey, normalizedQuestId\)/);
assert.match(runtimeApp, /playerFacingInformation/);
assert.doesNotMatch(runtimeApp, /foregroundQuestId/);
assert.match(runtimeShell, /selectMissionQuest\(options\)/);

const before = {
  campaign: { id: 'campaign:ui-only' },
  mission: { id: 'main:one', title: 'Main', status: 'active' },
  openWorld: { quests: [{ id: 'side:two', title: 'Side', status: 'available' }] }
};
const information = buildPlayerFacingInformation({ campaignState: before });
const selected = resolveSelectedQuestId({
  quests: information.quests,
  selectedQuestId: 'side:two',
  activeMissionId: 'main:one'
});
assert.equal(selected, 'side:two');
assert.deepEqual(before, {
  campaign: { id: 'campaign:ui-only' },
  mission: { id: 'main:one', title: 'Main', status: 'active' },
  openWorld: { quests: [{ id: 'side:two', title: 'Side', status: 'available' }] }
});

console.log('UI-only quest selection contracts passed');
