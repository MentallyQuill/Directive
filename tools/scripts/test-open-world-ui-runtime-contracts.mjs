import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function readText(filePath) {
  return fs.readFileSync(path.resolve(root, filePath), 'utf8');
}

const runtimeApp = readText('src/runtime/runtime-app.mjs');
const runtimeShell = readText('src/runtime/runtime-shell.js');
const missionPanel = readText('src/ui/mission-panel.js');
const settingsPanel = readText('src/ui/settings-panel.js');

for (const action of [
  'getQuestOpportunities',
  'offerOpenWorldQuest',
  'acceptOpenWorldQuest',
  'activateOpenWorldQuest',
  'pauseOpenWorldQuest',
  'delegateOpenWorldQuest',
  'abandonOpenWorldQuest',
  'travelOpenWorld',
  'advanceOpenWorldTime'
]) {
  assert.match(runtimeApp, new RegExp(`async ${action}\\b`), `runtime app should implement ${action}`);
  assert.match(runtimeShell, new RegExp(`${action}\\(options\\)`), `runtime shell should expose ${action}`);
}

for (const source of [runtimeApp, runtimeShell, missionPanel, settingsPanel]) {
  assert.doesNotMatch(source, /commitOpenOrders|startOpenOrders|runSideMission|sideMissions|lastSideMissionProviderAssistResult/);
}

assert.match(missionPanel, /Open World/);
assert.doesNotMatch(settingsPanel, /Open-World Runtime Diagnostics|Refresh Opportunities|getQuestOpportunities/);

console.log('Open-world UI/runtime contracts passed: runtime actions, shell exposure, labels, and legacy exclusions');
