import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  comparableDirectivePresetVersion,
  compareDirectivePresetVersions,
  createSillyTavernDirectivePresetManager,
  DIRECTIVE_DEFAULT_POV_RULE,
  directiveNarrationContextFromPreset,
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

function regexFromString(input) {
  const match = String(input || '').match(/(\/?)(.+)\1([a-z]*)/i);
  if (!match) return null;
  if (match[3] && !/^(?!.*?(.).*?\1)[gmixXsuUAJ]+$/.test(match[3])) {
    return RegExp(input);
  }
  return new RegExp(match[2], match[3]);
}

function applyPresetRegexScripts(scripts, rawString, placement, { isMarkdown = false, isPrompt = false } = {}) {
  let finalString = rawString;
  for (const script of scripts) {
    const appliesToMode = (script.markdownOnly && isMarkdown)
      || (script.promptOnly && isPrompt)
      || (!script.markdownOnly && !script.promptOnly && !isMarkdown && !isPrompt);
    if (!appliesToMode || !script.placement.includes(placement)) continue;
    const regex = regexFromString(script.findRegex);
    assert.ok(regex, `${script.scriptName} should compile.`);
    finalString = finalString.replace(regex, script.replaceString);
  }
  return finalString;
}

const bundled = ensureDirectivePresetMetadata({
  prompts: [],
  prompt_order: [],
  notes: 'Directive bundled test preset.'
});
const metadata = directivePresetMetadata(bundled);
assert.equal(metadata.displayVersion, 'Directive-0.1.0-pre-alpha.10');
assert.equal(metadata.supportsDirectiveRuntime, true);
assert.equal(comparableDirectivePresetVersion('Directive-0.1.0-pre-alpha.10'), '0.1.0');
assert.equal(compareDirectivePresetVersions('Directive-0.0.9', 'Directive-0.1.0-pre-alpha.10'), -1);
assert.equal(compareDirectivePresetVersions('Directive-0.1.0', 'Directive-0.1.0-pre-alpha.10'), 1);
assert.equal(compareDirectivePresetVersions('Directive-0.1.0-pre-alpha.9', 'Directive-0.1.0-pre-alpha.10'), -1);
assert.equal(compareDirectivePresetVersions('Directive-0.1.0-pre-alpha.11', 'Directive-0.1.0-pre-alpha.10'), 1);
assert.equal(compareDirectivePresetVersions('Directive-0.2.0', 'Directive-0.1.0-pre-alpha.10'), 1);

const asset = JSON.parse(fs.readFileSync('presets/sillytavern/directive.json', 'utf8'));
const assetOrder = asset.prompt_order[0].order;
assert.equal(asset.prompts.length, assetOrder.length, 'Directive preset prompts and order must stay aligned.');
assert.equal(asset.extensions.directive.presetVersion, 'Directive-0.1.0-pre-alpha.10');
assert.equal(assetOrder.find((entry) => entry.identifier === 'directive-tense-past')?.enabled, true);
assert.equal(assetOrder.find((entry) => entry.identifier === 'directive-tense-present')?.enabled, false);
assert.equal(assetOrder.find((entry) => entry.identifier === 'directive-pov-third-limited')?.enabled, true);
assert.equal(assetOrder.find((entry) => entry.identifier === 'directive-pov-second-external')?.enabled, false);
assert.equal(assetOrder.find((entry) => entry.identifier === 'directive-pov-first-non-player')?.enabled, false);
assert.equal(assetOrder.find((entry) => entry.identifier === 'directive-player-agency-perspective')?.enabled, true);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-player-agency-perspective')?.content || '',
  /Write in \{\{getvar::directive_tense\}\}, \{\{getvar::directive_pov\}\}/
);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-player-agency-perspective')?.content || '',
  /only \{\{user\}\} speaks, acts, decides, and thinks/
);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-player-agency-perspective')?.content || '',
  /Player input is not automatically audible/
);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'main')?.content || '',
  /\[Directive: Reply Header\]/
);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-post-history')?.content || '',
  /Reply Header/
);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-post-history')?.content || '',
  /Do not infer time passage/
);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-scene-rhythm')?.content || '',
  /treat it as an active conversation, not a completed cutscene/
);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-scene-rhythm')?.content || '',
  /Do not deliver the whole conversation/
);
assert.equal(assetOrder.find((entry) => entry.identifier === 'directive-scene-shape-variation')?.enabled, true);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-scene-shape-variation')?.content || '',
  /\{\{random::a limited-PoV non-player impression::lines of dialogue::an action\}\}/
);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-scene-shape-variation')?.content || '',
  /must belong to a non-player character/
);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-post-history')?.content || '',
  /Conversations require turn-taking/
);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-post-history')?.content || '',
  /do not complete the whole exchange in one assistant message/
);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-knowledge-boundaries')?.content || '',
  /Telepathy is not a bypass/
);
assert.match(
  asset.prompts.find((entry) => entry.identifier === 'directive-knowledge-boundaries')?.content || '',
  /forcibly intrude/
);
assert.equal(asset.bias_preset_selected, 'Directive Soft Cleanup', 'Directive preset should select the conservative bundled logit bias profile.');
assert.deepEqual(
  Object.keys(asset.bias_presets),
  [
    'Default (none)',
    'Directive Soft Cleanup',
    'Directive Anti-Mindread Guard',
    'Directive Starship Slop Guard'
  ],
  'Directive preset bias presets should expose the supported SillyTavern logit-bias profiles.'
);
assert.equal(asset.bias_presets['Default (none)'].length, 0);
assert.ok(
  asset.bias_presets['Directive Soft Cleanup'].some((entry) => entry.text === ' ozone' && entry.value <= -50),
  'Directive Soft Cleanup should discourage ozone-heavy sci-fi slop.'
);
assert.ok(
  asset.bias_presets['Directive Anti-Mindread Guard'].some((entry) => entry.text === 'heard your thoughts' && entry.value <= -90),
  'Directive Anti-Mindread Guard should discourage phrasing that treats private typed thoughts as audible.'
);
for (const [name, entries] of Object.entries(asset.bias_presets)) {
  assert.ok(Array.isArray(entries), `${name} should be a SillyTavern logit-bias array.`);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length, `${name} logit-bias IDs must be unique.`);
  for (const entry of entries) {
    assert.equal(typeof entry.text, 'string', `${name} logit-bias entries should have text.`);
    assert.equal(typeof entry.value, 'number', `${name} logit-bias entries should have numeric values.`);
  }
}
const assetRegexScripts = asset.extensions.regex_scripts;
assert.equal(assetRegexScripts.length, 13, 'Directive preset should bundle regex cleanup scripts.');
assert.equal(new Set(assetRegexScripts.map((script) => script.id)).size, assetRegexScripts.length, 'Directive preset regex script IDs must be unique.');
for (const script of assetRegexScripts) {
  assert.ok(script.scriptName.startsWith('Directive '), 'Directive preset regex scripts should be clearly owned by Directive.');
  assert.ok(Array.isArray(script.placement) && script.placement.length > 0, `${script.scriptName} should declare SillyTavern placements.`);
  assert.ok(regexFromString(script.findRegex), `${script.scriptName} should use a valid SillyTavern regex string.`);
}
assert.deepEqual(
  assetRegexScripts.map((script) => script.scriptName),
  [
    'Directive 01 Fix Mojibake Em Dashes',
    'Directive 02 Fix Mojibake En Dashes',
    'Directive 03 Fix Mojibake Apostrophes',
    'Directive 04 Fix Mojibake Double Quotes',
    'Directive 05 Fix Mojibake Ellipsis',
    'Directive 06 Replace Nonbreaking Spaces',
    'Directive 07 Remove Encoding Artifacts',
    'Directive 08 Remove Chinese Characters',
    'Directive 09 Remove Extra Spaces',
    'Directive 10 Replace Em-Dashes',
    'Directive 11 Fix Double Quotations',
    'Directive 12 Fix Apostrophes',
    'Directive 13 Fix Ellipsis'
  ],
  'Directive preset regex cleanup order is part of the preset contract.'
);
const mojibakeSample = 'The officer \u00e2\u20ac\u201d said \u00e2\u20ac\u0153ready\u00e2\u20ac\ufffd, it\u00e2\u20ac\u2122s done...  Now\u00c2\u00a0go\ufffd.';
assert.equal(
  applyPresetRegexScripts(assetRegexScripts, mojibakeSample, 2),
  'The officer \u2014 said "ready", it\'s done\u2026 Now go.'
);
assert.equal(
  applyPresetRegexScripts(assetRegexScripts, 'Status \u4f60\u597d ready', 2, { isMarkdown: true }),
  'Status  ready',
  'CJK stripping should apply to rendered generated output when preset regex is allowed.'
);
const secondPersonAsset = JSON.parse(JSON.stringify(asset));
for (const entry of secondPersonAsset.prompt_order[0].order) {
  if (entry.identifier === 'directive-pov-third-limited') entry.enabled = false;
  if (entry.identifier === 'directive-pov-second-external') entry.enabled = true;
  if (entry.identifier === 'directive-tense-past') entry.enabled = false;
  if (entry.identifier === 'directive-tense-present') entry.enabled = true;
}
const secondPersonContext = directiveNarrationContextFromPreset(secondPersonAsset, {
  presetName: 'Directive',
  roleId: 'campaignIntro'
});
assert.equal(secondPersonContext.compatible, true);
assert.equal(secondPersonContext.source, 'active-directive-preset');
assert.equal(secondPersonContext.perspectivePromptId, 'directive-pov-second-external');
assert.match(secondPersonContext.perspective, /second person external/);
assert.equal(secondPersonContext.tensePromptId, 'directive-tense-present');
assert.equal(secondPersonContext.tense, 'present tense');
assert.match(secondPersonContext.instructions, /Write in present tense, second person external/);

const unrelatedContext = directiveNarrationContextFromPreset({
  prompts: [{ identifier: 'alien-main', content: 'Write as an unrelated preset.' }],
  prompt_order: [{ order: [{ identifier: 'alien-main', enabled: true }] }]
}, { presetName: 'Unrelated Preset' });
assert.equal(unrelatedContext.compatible, false);
assert.equal(unrelatedContext.source, 'unrelated-active-preset');
assert.equal(unrelatedContext.perspective, DIRECTIVE_DEFAULT_POV_RULE);
assert.equal(unrelatedContext.tense, 'past tense');

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

let autoCheckSaveCount = 0;
const autoCheckContext = {
  extension_settings: {},
  saveSettingsDebounced() {
    autoCheckSaveCount += 1;
  },
  getPresetManager(id) {
    assert.equal(id, 'openai');
    return missingManager;
  }
};
const autoCheckAdapter = createSillyTavernDirectivePresetManager({
  contextFactory: () => autoCheckContext
});
assert.deepEqual(
  autoCheckAdapter.getAutoCheckPreference(),
  { enabled: true, dismissedVersion: '' },
  'Directive preset auto-check should default on.'
);
const missingReminder = autoCheckAdapter.getStartupCheck();
assert.equal(missingReminder.shouldPrompt, true, 'Missing Directive preset should prompt at startup by default.');
assert.equal(missingReminder.state, 'missing');
autoCheckAdapter.dismissAutoCheckForVersion(missingReminder.bundledVersion);
assert.equal(autoCheckSaveCount, 1, 'Dismissing startup reminder should persist SillyTavern extension settings.');
assert.equal(autoCheckAdapter.getStartupCheck().shouldPrompt, false, 'Not Now should suppress the current bundled preset version.');
autoCheckAdapter.setAutoCheckPreference(true);
assert.equal(autoCheckAdapter.getAutoCheckPreference().dismissedVersion, '', 'Re-enabling auto-check should clear version dismissal.');
assert.equal(autoCheckAdapter.getStartupCheck().shouldPrompt, true);
autoCheckAdapter.setAutoCheckPreference(false);
assert.equal(autoCheckAdapter.getStartupCheck().shouldPrompt, false, 'Disabled auto-check should never prompt.');

const currentAutoCheckAdapter = createSillyTavernDirectivePresetManager({
  contextFactory: () => ({
    extension_settings: {},
    getPresetManager(id) {
      assert.equal(id, 'openai');
      return currentManager;
    }
  })
});
assert.equal(currentAutoCheckAdapter.getStartupCheck().shouldPrompt, false, 'Current Directive preset should not prompt at startup.');

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
assert.equal(installManager.saves[0].preset.extensions.directive.presetVersion, 'Directive-0.1.0-pre-alpha.10');
assert.equal(installManager.selected(), 'Existing Preset');
assert.equal(installed.restored, true);

const selectedDirectiveManager = createPresetManager({
  presets: {
    Directive: secondPersonAsset
  },
  selected: 'Directive'
});
const selectedDirectiveAdapter = createSillyTavernDirectivePresetManager({
  contextFactory: () => ({
    getPresetManager(id) {
      assert.equal(id, 'openai');
      return selectedDirectiveManager;
    }
  })
});
assert.match(selectedDirectiveAdapter.getNarrationContext({ roleId: 'campaignIntro' }).perspective, /second person external/);

const unrelatedSelectedManager = createPresetManager({
  presets: {
    Directive: asset,
    'Existing Preset': { prompts: [{ identifier: 'main', content: 'Unrelated preset.' }], prompt_order: [{ order: [{ identifier: 'main', enabled: true }] }] }
  },
  selected: 'Existing Preset'
});
const unrelatedSelectedAdapter = createSillyTavernDirectivePresetManager({
  contextFactory: () => ({
    getPresetManager(id) {
      assert.equal(id, 'openai');
      return unrelatedSelectedManager;
    }
  })
});
const unrelatedSelectedContext = unrelatedSelectedAdapter.getNarrationContext({ roleId: 'campaignIntro' });
assert.equal(unrelatedSelectedContext.compatible, false);
assert.equal(unrelatedSelectedContext.source, 'unrelated-active-preset');
assert.equal(unrelatedSelectedContext.perspective, DIRECTIVE_DEFAULT_POV_RULE);

console.log('SillyTavern preset manager tests passed: metadata, status comparison, legacy detection, install, and selection restore');
