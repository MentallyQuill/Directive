import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const panel = await readFile(path.join(repoRoot, 'src', 'ui', 'campaign-panel.js'), 'utf8');
const css = await readFile(path.join(repoRoot, 'styles', 'directive.css'), 'utf8');

for (const className of [
  'campaign-journal',
  'campaign-index-panel',
  'campaign-index-list',
  'campaign-row',
  'campaign-detail',
  'campaign-hero',
  'campaign-facts',
  'campaign-command-row',
  'campaign-saves',
  'campaign-save-list',
  'mobile-campaign-accordion',
  'mobile-campaign-item'
]) {
  assert.match(panel, new RegExp(`['"\`]${className}`), `Campaign renderer must emit ${className}`);
  assert.match(css, new RegExp(`\\.${className}(?:[\\s,:{.#>]|$)`), `Production CSS must style ${className}`);
}

for (const action of ['selectCampaign', 'openCampaignChat', 'saveGame', 'loadCheckpoint', 'deleteSave']) {
  assert.match(panel, new RegExp(`actions\\?\\.${action}|actions\\.${action}`), `Campaign renderer must use ${action}`);
}

for (const obsolete of [
  'saveCurrentGame',
  'saveCurrentGameAs',
  'deleteCampaignSave',
  'actions?.loadGame',
  'Campaign Library',
  'Saved Campaigns',
  'Terminal Branch'
]) {
  assert.equal(panel.includes(obsolete), false, `Campaign renderer must not retain obsolete contract: ${obsolete}`);
}

assert.match(panel, /createPackageImage\(/, 'Campaign art must resolve through the shared package media API');
assert.equal(panel.includes('/files/'), false, 'Campaign renderer must not hardcode SillyTavern asset URLs');
assert.match(panel, /aria-live/);
assert.match(panel, /aria-expanded/);

console.log('Expanded Campaign panel contract tests passed.');
