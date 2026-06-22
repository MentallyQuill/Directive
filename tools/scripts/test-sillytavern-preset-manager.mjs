import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  comparableDirectivePresetVersion,
  compareDirectivePresetVersions,
  createSillyTavernDirectivePresetManager,
  directivePresetMetadata,
  directivePresetStatus,
  ensureDirectivePresetMetadata
} from '../../src/hosts/sillytavern/preset-manager.mjs';

function createPresetManager(initial = {}) {
  const presets = new Map(Object.entries(initial.presets || {}));
  let selected = initial.selected || 'Existing Preset';
  const saves = [];
  return {
    saves,
    getAllPresets() {
      return [...presets.keys()];
    },
    getCompletionPresetByName(name) {
      return presets.get(name) || null;
    },
    readPresetExtensionField({ name, path }) {
      return presets.get(name)?.extensions?.[path] || null;
    },
    async savePreset(name, preset) {
      saves.push({ name, preset: JSON.parse(JSON.stringify(preset)) });
      presets.set(name, JSON.parse(JSON.stringify(preset)));
      selected = name;
    },
    getSelectedPreset() {
      return selected;
    },
    getSelectedPresetName() {
      return selected;
    },
    selectPreset(name) {
      selected = name;
    },
    selected() {
      return selected;
    }
  };
}

const bundled = ensureDirectivePresetMetadata({
  prompts: [],
  prompt_order: [],
  notes: 'Directive bundled test preset.'
});
const metadata = directivePresetMetadata(bundled);
assert.equal(metadata.displayVersion, 'Directive-0.1.0-pre-alpha.4');
assert.equal(metadata.supportsDirectiveRuntime, true);
assert.equal(comparableDirectivePresetVersion('Directive-0.1.0-pre-alpha.4'), '0.1.0');
assert.equal(compareDirectivePresetVersions('Directive-0.0.9', 'Directive-0.1.0-pre-alpha.4'), -1);
assert.equal(compareDirectivePresetVersions('Directive-0.1.0', 'Directive-0.1.0-pre-alpha.4'), 1);
assert.equal(compareDirectivePresetVersions('Directive-0.1.0-pre-alpha.3', 'Directive-0.1.0-pre-alpha.4'), -1);
assert.equal(compareDirectivePresetVersions('Directive-0.1.0-pre-alpha.5', 'Directive-0.1.0-pre-alpha.4'), 1);
assert.equal(compareDirectivePresetVersions('Directive-0.2.0', 'Directive-0.1.0-pre-alpha.4'), 1);

const asset = JSON.parse(fs.readFileSync('presets/sillytavern/directive.json', 'utf8'));
const assetOrder = asset.prompt_order[0].order;
assert.equal(asset.prompts.length, assetOrder.length, 'Directive preset prompts and order must stay aligned.');
assert.equal(asset.extensions.directive.presetVersion, 'Directive-0.1.0-pre-alpha.4');
assert.equal(assetOrder.find((entry) => entry.identifier === 'directive-pov-third-limited')?.enabled, true);
assert.equal(assetOrder.find((entry) => entry.identifier === 'directive-pov-second-external')?.enabled, false);
assert.equal(assetOrder.find((entry) => entry.identifier === 'directive-pov-first-non-player')?.enabled, false);
assert.equal(assetOrder.find((entry) => entry.identifier === 'directive-player-agency-perspective')?.enabled, true);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-player-agency-perspective')?.content || '',
  /only \{\{user\}\} speaks, acts, decides, and thinks/
);

const missingManager = createPresetManager();
assert.equal(directivePresetStatus({ manager: missingManager }).state, 'missing');

const olderManager = createPresetManager({
  presets: {
    Directive: {
      extensions: {
        directive: {
          presetName: 'Directive',
          presetVersion: 'Directive-0.0.9'
        }
      }
    }
  }
});
assert.equal(directivePresetStatus({ manager: olderManager }).state, 'behind');

const currentManager = createPresetManager({
  presets: {
    Directive: bundled
  }
});
assert.equal(directivePresetStatus({ manager: currentManager }).state, 'current');

const legacyManager = createPresetManager({
  presets: {
    'Directive Star Trek Command': bundled
  }
});
assert.equal(directivePresetStatus({ manager: legacyManager }).state, 'legacy-name');

const installManager = createPresetManager({
  presets: {
    'Existing Preset': { prompts: [] }
  },
  selected: 'Existing Preset'
});
const adapter = createSillyTavernDirectivePresetManager({
  contextFactory: () => ({
    getPresetManager(id) {
      assert.equal(id, 'openai');
      return installManager;
    }
  }),
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        prompts: [],
        prompt_order: [],
        notes: 'Directive fetched preset.'
      };
    }
  })
});

assert.equal(adapter.getStatus().state, 'missing');
const installed = await adapter.installBundledPreset();
assert.equal(installed.ok, true);
assert.equal(installed.status.state, 'current');
assert.equal(installManager.saves[0].name, 'Directive');
assert.equal(installManager.saves[0].preset.extensions.directive.presetVersion, 'Directive-0.1.0-pre-alpha.4');
assert.equal(installManager.selected(), 'Existing Preset');
assert.equal(installed.restored, true);

console.log('SillyTavern preset manager tests passed: metadata, status comparison, legacy detection, install, and selection restore');
