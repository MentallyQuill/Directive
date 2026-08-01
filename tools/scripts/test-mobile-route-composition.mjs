import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { buildCampaignView } from '../../src/ui/view-models/campaign-view.mjs';

const view = buildCampaignView({
  saves: [{
    id: 'save:ashes',
    current: true,
    updatedAt: '2026-08-01T12:00:00.000Z',
    metadata: {
      campaignId: 'campaign:ashes',
      packageId: 'package:ashes',
      campaignTitle: 'Ashes of Peace',
      playerName: 'Sam Vickers',
      playerRole: 'Executive Officer'
    }
  }],
  packages: [{
    packageId: 'package:ashes',
    title: 'Ashes of Peace',
    playerRole: {
      label: 'Executive Officer',
      authority: 'Acting command authority'
    }
  }]
});

const campaign = view.campaigns[0];
assert.equal(typeof campaign.playerRole, 'string');
assert.equal(campaign.playerRole, 'Executive Officer');
assert.deepEqual(campaign.playerRoleContext, {
  label: 'Executive Officer',
  authority: 'Acting command authority'
});

console.log('Mobile route composition role contract passed');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directiveCss = await readFile(path.join(repoRoot, 'styles', 'directive.css'), 'utf8');
const expandedShellSource = await readFile(path.join(repoRoot, 'src', 'ui', 'directive-expanded-shell.js'), 'utf8');
const runtimeShellSource = await readFile(path.join(repoRoot, 'src', 'runtime', 'runtime-shell.js'), 'utf8');
const campaignPanelSource = await readFile(path.join(repoRoot, 'src', 'ui', 'campaign-panel.js'), 'utf8');
const missionJournalSource = await readFile(path.join(repoRoot, 'src', 'ui', 'mission-quest-journal.js'), 'utf8');
const crewPanelSource = await readFile(path.join(repoRoot, 'src', 'ui', 'crew-panel.js'), 'utf8');
const shipPanelSource = await readFile(path.join(repoRoot, 'src', 'ui', 'ship-panel.js'), 'utf8');
const settingsPanelSource = await readFile(path.join(repoRoot, 'src', 'ui', 'settings-panel.js'), 'utf8');
assert.match(expandedShellSource, /panel\.setAttribute\('role',\s*'dialog'\)/);
assert.match(expandedShellSource, /panel\.setAttribute\('aria-modal',\s*'true'\)/);
assert.match(runtimeShellSource, /addEventListener\('popstate'/);
assert.match(runtimeShellSource, /hideDirectiveRuntimePanel\(\{ skipHistory: true \}\)/);
const expandedShellCss = directiveCss.slice(directiveCss.indexOf('/* Expanded interface shell:'));
const mobileExpandedCss = expandedShellCss.slice(expandedShellCss.lastIndexOf('@media (max-width: 640px)'));
assert.match(mobileExpandedCss, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
assert.match(mobileExpandedCss, /\.directive-lcars-rail\s*\{[\s\S]*?display:\s*none/);
assert.match(mobileExpandedCss, /width:\s*100vw/);
assert.match(mobileExpandedCss, /height:\s*100dvh/);
assert.match(mobileExpandedCss, /border-radius:\s*14px\s+14px\s+0\s+0/);
assert.match(mobileExpandedCss, /\.directive-runtime-panel\.directive-expanded-shell::before[\s\S]*?content:\s*""/);

console.log('Mobile shell CSS contract passed');

assert.doesNotMatch(campaignPanelSource, /if \(open\) item\.appendChild\(createCampaignDetail/);
assert.match(campaignPanelSource, /data-directive-mobile-view/);
assert.match(missionJournalSource, /directive-mobile-mission-route/);
assert.match(missionJournalSource, /directive-mobile-route-back/);
assert.match(crewPanelSource, /directive-mobile-people-route/);
assert.match(crewPanelSource, /directive-mobile-route-back/);
assert.match(shipPanelSource, /directive-mobile-ship-route/);
assert.match(settingsPanelSource, /directive-mobile-settings-route/);
assert.match(settingsPanelSource, /activeMobileSettingsSectionId = ''/);
assert.doesNotMatch(directiveCss, /mobile-campaign-accordion/);

console.log('Mobile campaign hierarchy contract passed');
