import assert from 'node:assert/strict';
import { renderSettingsPanel, resetSettingsPanelState } from '../../src/ui/settings-panel.js';
import {
  areDirectiveTooltipsDisabled,
  setDirectiveTooltipsDisabled
} from '../../src/ui/runtime-ui-kit.js';
import { installFakeDom } from './helpers/fake-dom.mjs';

const all = (root) => [root, ...root.children.flatMap(all)];
const fakeDocument = installFakeDom();
const documentElement = fakeDocument.documentElement;
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
    profiles: [
      { id: 'profile.utility', label: 'Utility / local-model', model: 'local-model', completionMode: 'chat' },
      { id: 'profile.reasoning', label: 'Reasoning profile', model: 'deepseek-reasoner', completionMode: 'chat' }
    ],
    settings: { utility: providerSettings, reasoning: { ...providerSettings, profileId: 'missing.profile', temperature: 0.4 } },
    status: {
      utility: { ready: true, label: 'Current local-model', certification: { status: 'not-run' } },
      reasoning: { ready: true, label: 'Current local-model', certification: { status: 'not-run' } }
    }
  },
  generationRouting: [
    { id: 'episodeEvaluator', label: 'Bounded story analysis', providerKind: 'reasoning' },
    { id: 'acceptedPairMissionEvidence', label: 'Mission evidence and story time', providerKind: 'utility' },
    { id: 'characterCreatorSectionDraft', label: 'Character draft', providerKind: 'reasoning' }
  ],
  storageDiagnostics: { ok: true, initialized: true, saveCount: 1, draftCount: 0, recoveryCopyCount: 1 },
  diagnostics: { transcriptAvailable: false }
};
const updates = [];
const body = fakeDocument.createElement('div');
body.id = 'directive-runtime-panel';
fakeDocument.body.appendChild(body);
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
assert.equal(byClass('settings-provider-card').length, 3);
assert.equal(byClass('settings-routing-row').length, 3);
assert.equal(byClass('settings-diagnostics').length, 1);
assert.match(text, /Interface/);
assert.match(text, /Tooltips/);
assert.match(text, /Behavioral Preset/);
assert.match(text, /Instruct Formatting/);
assert.match(text, /Samplers/);
assert.match(text, /Structured Output/);
assert.match(text, /Analysis capacity/);
assert.equal(nodes.filter(node=>node.dataset.settingsControl==='analysis-capacity').length,1);
assert.equal(Boolean(byClass('settings-analysis-advanced')[0].open),false);
assert.match(text, /Request timeout \(seconds\)/);
for (const kind of ['utility', 'reasoning']) {
  const timeout = byControl(`${kind}-timeoutSeconds`);
  assert.equal(Number(timeout.value), 300);
  timeout.value = '1500';
  await timeout.dispatch('change');
  assert.deepEqual(updates.at(-1), { kind, patch: { timeoutSeconds: 1500 } });
  const roleId=kind==='utility'?'acceptedPairMissionEvidence':'storyDirectionAnalyst';
  assert.equal(byControl(`${kind}-${roleId}-timeoutSeconds`).placeholder,'Inherit (1500)','successful lane timeout saves refresh existing Advanced inheritance');
}
assert.match(text, /Model-Call Routing/);
assert.match(text, /Shared context and response limits/);
const roleTokens = byControl('reasoning-storyDirectionAnalyst-maxTokens');
assert.equal(byControl('reasoning-peopleDossierAuthor-maxAttempts'), undefined);
assert.equal(roleTokens.value, '');
assert.match(roleTokens.placeholder, /Inherit/);
roleTokens.value = '32000';
await roleTokens.dispatch('change');
assert.deepEqual(updates.at(-1), { kind: 'reasoning', patch: { roleLimits: { storyDirectionAnalyst: { maxTokens: 32000 } } } });
roleTokens.value = '';
await roleTokens.dispatch('change');
assert.deepEqual(updates.at(-1), { kind: 'reasoning', patch: { roleLimits: { storyDirectionAnalyst: { maxTokens: null } } } });
const factLimit = byControl('analysis-continuityFactCharacters');
assert.equal(Number(byControl('analysis-hostNarrationTimeoutSeconds').max), 2147483);
factLimit.value = '8192';
await factLimit.dispatch('change');
assert.deepEqual(updates.at(-1), { kind: 'utility', patch: { analysisOverrides: { continuityFactCharacters: 8192 } } });
factLimit.value=''; await factLimit.dispatch('change');
assert.deepEqual(updates.at(-1), { kind: 'utility', patch: { analysisOverrides: { continuityFactCharacters: null } } });
const capacity=byControl('analysis-capacity');
capacity.value='2.5'; await capacity.dispatch('input');
assert.equal(nodes.find(node=>node.dataset.analysisCapacityValue==='true').textContent,'2.5×');
await capacity.dispatch('change');
assert.deepEqual(updates.at(-1),{kind:'utility',patch:{analysisCapacity:2.5}});
assert.equal(factLimit.placeholder,'Inherit (1280)');
await nodes.find(node=>node.dataset.settingsAction==='reset-analysis-overrides').click();
assert.deepEqual(updates.slice(-2),[{kind:'utility',patch:{analysisOverrides:null,outputTokenOverride:null,roleLimits:null}},{kind:'reasoning',patch:{outputTokenOverride:null,roleLimits:null}}]);
assert.match(text, /Include Story Transcript/);
assert.match(text, /upgraded 1 older V1 save/i);
assert.match(text, /verified recovery copy/i);
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
await utilityProvider.dispatch('change');
assert.equal(utilityProfileField.hidden, false);
assert.deepEqual(updates.at(-1), { kind: 'utility', patch: { provider: 'profile' } });
assert.equal(utilityState.classList.contains('is-ready'), false);
assert.equal(utilityState.textContent, 'Select a profile');
const utilityProfileButton = byControl('utility-profileId');
assert.equal(utilityProfileButton.tagName, 'BUTTON');
assert.equal(utilityProfileButton.getAttribute('aria-haspopup'), 'dialog');
await utilityProfileButton.click();
const profileModalRoot = fakeDocument.getElementById('directive-modal-root');
assert.equal(profileModalRoot.children.length, 1);
assert.match(all(profileModalRoot.children[0]).map((node) => node.textContent || '').join(' '), /Reasoning profile/);
const reasoningChoice = all(profileModalRoot.children[0])
  .find((node) => node.dataset.connectionProfileId === 'profile.reasoning');
await reasoningChoice.click();
assert.deepEqual(updates.at(-1), { kind: 'utility', patch: { profileId: 'profile.reasoning' } });
assert.equal(utilityProfileButton.textContent, 'Reasoning profile');
assert.equal(profileModalRoot.children.length, 0);
assert.equal(byControl('reasoning-profileId').textContent, 'missing.profile');

const utilitySamplerFields = byClass('settings-sampler-overrides')[0];
assert.equal(utilitySamplerFields.hidden, true);
const utilitySampler = byControl('utility-samplerMode');
utilitySampler.value = 'directive';
await utilitySampler.dispatch('change');
assert.equal(utilitySamplerFields.hidden, false);
assert.deepEqual(updates.at(-1), { kind: 'utility', patch: { samplerMode: 'directive' } });

const tooltipsToggle = byControl('tooltips-enabled');
assert.equal(tooltipsToggle.checked, true);
tooltipsToggle.checked = false;
await tooltipsToggle.dispatch('change');
assert.equal(areDirectiveTooltipsDisabled(), true);
assert.equal(documentElement.attributes.get('data-directive-tooltips'), 'disabled');

const transcriptToggle = byControl('include-story-transcript');
assert.equal(transcriptToggle.disabled, true);
assert.equal(nodes.filter((node) => node.tagName === 'BUTTON' && all(node).some((child) => child.textContent === 'Save')).length, 0);

setDirectiveTooltipsDisabled(false);
const failedBody=fakeDocument.createElement('div');const failedUpdates=[];
renderSettingsPanel(failedBody,view,{async updateProviderSettings(input){failedUpdates.push(input);throw Error('Could not persist reset');}});
await all(failedBody).find(node=>node.dataset.settingsAction==='reset-analysis-overrides').click();
assert.equal(failedUpdates.length,1,'failed first reset does not continue and report success for the second lane');
assert.match(all(failedBody).map(node=>node.textContent).join(' '),/Could not persist reset/);
const failedTimeout=all(failedBody).find(node=>node.dataset.settingsControl==='utility-timeoutSeconds');
failedTimeout.value='99';await failedTimeout.dispatch('change');
assert.equal(all(failedBody).find(node=>node.dataset.settingsControl==='utility-acceptedPairMissionEvidence-timeoutSeconds').placeholder,'Inherit (300)','failed timeout save must not change inheritance');
console.log('PASS certified Settings panel');
