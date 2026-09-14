import assert from 'node:assert/strict';
import { renderSettingsPanel } from '../../src/ui/settings-panel.js';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { createSillyTavernProviderSettingsStore } from '../../src/providers/directive-provider-settings.mjs';

const doc = installFakeDom();
globalThis.localStorage = { getItem: () => null, setItem() {} };
const store = createSillyTavernProviderSettingsStore({ context: { extensionSettings: {}, saveSettingsDebounced() {} } });
let release;
const gate = new Promise(resolve => { release = resolve; });
let saveGate = Promise.resolve();
let rejectNext = false;
const body = doc.createElement('div');
doc.body.appendChild(body);
renderSettingsPanel(body, { providerConfiguration: { settings: store.getAll(), profiles: [], status: {} } }, {
  updateProviderSettings: async ({ kind, patch }) => {
    await gate;
    await saveGate;
    if (rejectNext) { rejectNext = false; throw new Error('Fixture save failure'); }
    return { settings: store.update(kind, patch) };
  },
});
const all = element => [element, ...element.children.flatMap(all)];
const get = key => all(body).find(element => element.dataset.settingsControl === key);
const first = get('analysis-continuityFactCharacters');
const second = get('reasoning-maxTokens');
first.value = '900';
const saving = first.dispatch('change');
second.value = '19000';
await second.dispatch('input');
second.focus();
release();
await saving;
assert.equal(second.value, '19000', 'An unrelated save must preserve an in-progress field edit');
const reset = all(body).find(element => element.dataset.settingsAction === 'reset-analysis-overrides');
await reset.click();
assert.equal(second.value, '', 'Explicit reset discards an unsaved override draft');

saveGate = new Promise(resolve => { release = resolve; });
second.value = '12000';
await second.dispatch('input');
const olderSave = second.dispatch('change');
second.value = '14000';
await second.dispatch('input');
release();
await olderSave;
assert.equal(store.get('reasoning').outputTokenOverride, 12000);
assert.equal(second.value, '14000', 'Older response must not acknowledge a newer unsaved draft');
await second.dispatch('change');
assert.equal(store.get('reasoning').outputTokenOverride, 14000);

rejectNext = true;
second.value = '16000';
await second.dispatch('input');
await second.dispatch('change');
first.value = '800';
await first.dispatch('change');
assert.equal(second.value, '16000', 'Failed draft survives later successful unrelated saves');
assert.equal(store.get('reasoning').outputTokenOverride, 14000);

saveGate = new Promise(resolve => { release = resolve; });
const resetPending = reset.click();
second.value = '18000';
await second.dispatch('input');
const newerSave = second.dispatch('change');
release();
await resetPending;
await newerSave;
assert.equal(second.value, '18000', 'An edit after Reset must win over both queued lane resets');
assert.equal(store.get('reasoning').outputTokenOverride, 18000);
console.log('Settings drafts survive delayed, failed, superseded saves and ordered resets.');
