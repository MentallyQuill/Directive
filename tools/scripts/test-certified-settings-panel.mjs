import assert from 'node:assert/strict';
import { renderSettingsPanel, resetSettingsPanelState } from '../../src/ui/settings-panel.js';
import {
  areDirectiveTooltipsDisabled,
  setDirectiveTooltipsDisabled
} from '../../src/ui/runtime-ui-kit.js';

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.style = {};
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => !names.includes(name)).join(' '); },
      contains: (name) => this.className.split(/\s+/).includes(name)
    };
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  querySelectorAll(selector) {
    const nodes = all(this);
    if (selector === '[data-input-path]') return nodes.filter((node) => node.dataset.inputPath);
    return [];
  }
}

const all = (root) => [root, ...root.children.flatMap(all)];
const documentElement = new Element('html');
globalThis.document = {
  documentElement,
  createElement: (tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text }),
  addEventListener() {}
};
globalThis.localStorage = { getItem: () => null, setItem() {} };
setDirectiveTooltipsDisabled(false);

const providerSettings = {
  provider: 'st',
  profileId: '',
  presetMode: 'isolated',
  instructMode: 'auto',
  samplerMode: 'profile',
  structuredOutputMode: 'auto',
  temperature: 0.1,
  topP: 0.95,
  maxTokens: 8192,
  certification: { status: 'not-run' }
};
const view = {
  activeSaveId: 'save.current',
  directivePreset: {
    status: { state: 'current', pill: 'Current', installedVersion: '1.0.0', bundledVersion: '1.0.0', canInstall: true },
    autoCheck: { enabled: true }
  },
  providerConfiguration: {
    profiles: [{ id: 'profile.utility', label: 'Utility / local-model', model: 'local-model', completionMode: 'chat' }],
    settings: { utility: providerSettings, reasoning: { ...providerSettings, temperature: 0.4 } },
    status: {
      utility: { ready: true, label: 'Current local-model', certification: { status: 'not-run' } },
      reasoning: { ready: true, label: 'Current local-model', certification: { status: 'not-run' } }
    }
  },
  generationRouting: [
    { id: 'narration', label: 'Story narration', providerKind: 'reasoning' },
    { id: 'acceptedPairMissionEvidence', label: 'Mission evidence and story time', providerKind: 'utility' },
    { id: 'characterCreatorSectionDraft', label: 'Character draft', providerKind: 'reasoning' },
    { id: 'utilityJson', label: 'Story distillation', providerKind: 'utility' }
  ],
  diagnostics: { transcriptAvailable: false }
};
const updates = [];
const body = new Element('div');
resetSettingsPanelState();
renderSettingsPanel(body, view, {
  async updateProviderSettings(input) {
    updates.push(input);
    return {
      settings: input.patch,
      status: input.patch.provider === 'profile'
        ? { ready: false, label: 'Select a profile' }
        : { ready: true, label: 'Current local-model' }
    };
  },
  async testProvider() { return { ok: true, capabilities: { structuredOutput: 'native-schema' } }; },
  installDirectivePreset() {}, refreshDirectivePresetStatus() {},
  updateDirectivePresetAutoCheck() {}, verifyActiveSave() {}, exportSupportDiagnostics() {}
});

const nodes = all(body);
const byClass = (className) => nodes.filter((node) => node.className.split(/\s+/).includes(className));
const byControl = (name) => nodes.find((node) => node.dataset.settingsControl === name);
const text = nodes.map((node) => node.textContent || '').join(' ');

assert.equal(byClass('settings-layout').length, 1);
assert.equal(byClass('settings-navigation').length, 0);
assert.equal(nodes.filter((node) => node.dataset.directiveScrollOwner === 'true').length, 1);
assert.equal(byClass('settings-provider-card').length, 2);
assert.equal(byClass('settings-routing-row').length, 4);
assert.equal(byClass('settings-diagnostics').length, 1);
assert.match(text, /Interface/);
assert.match(text, /Tooltips/);
assert.match(text, /Behavioral Preset/);
assert.match(text, /Instruct Formatting/);
assert.match(text, /Samplers/);
assert.match(text, /Structured Output/);
assert.match(text, /Output token ceiling/);
assert.match(text, /Model-Call Routing/);
assert.match(text, /Include Story Transcript/);
assert.doesNotMatch(text, /OpenAI-compatible|Base URL|API key|Tutorial Prompts|Startup Tips|Help & Tutorials/i);

const providerControls = nodes.filter((node) => node.dataset.settingsControl?.endsWith('-provider'));
assert.equal(providerControls.length, 2);
assert.deepEqual(providerControls.map((control) => control.children.map((option) => option.value)), [
  ['st', 'profile'],
  ['st', 'profile']
]);
assert.ok(nodes.filter((node) => node.dataset.directiveTooltip).length >= 8);

const utilityProfileField = byClass('settings-profile-field')[0];
const utilityState = byClass('settings-provider-state')[0];
assert.equal(utilityProfileField.hidden, true);
const utilityProvider = byControl('utility-provider');
utilityProvider.value = 'profile';
await utilityProvider.listeners.get('change')?.({});
assert.equal(utilityProfileField.hidden, false);
assert.deepEqual(updates.at(-1), { kind: 'utility', patch: { provider: 'profile' } });
assert.equal(utilityState.classList.contains('is-ready'), false);
assert.equal(utilityState.textContent, 'Select a profile');

const utilitySamplerFields = byClass('settings-sampler-overrides')[0];
assert.equal(utilitySamplerFields.hidden, true);
const utilitySampler = byControl('utility-samplerMode');
utilitySampler.value = 'directive';
await utilitySampler.listeners.get('change')?.({});
assert.equal(utilitySamplerFields.hidden, false);
assert.deepEqual(updates.at(-1), { kind: 'utility', patch: { samplerMode: 'directive' } });

const tooltipsToggle = byControl('tooltips-enabled');
assert.equal(tooltipsToggle.checked, true);
tooltipsToggle.checked = false;
await tooltipsToggle.listeners.get('change')?.({});
assert.equal(areDirectiveTooltipsDisabled(), true);
assert.equal(documentElement.attributes.get('data-directive-tooltips'), 'disabled');

const transcriptToggle = byControl('include-story-transcript');
assert.equal(transcriptToggle.disabled, true);
assert.equal(nodes.filter((node) => node.tagName === 'BUTTON' && all(node).some((child) => child.textContent === 'Save')).length, 0);

setDirectiveTooltipsDisabled(false);
console.log('PASS certified Settings panel');
