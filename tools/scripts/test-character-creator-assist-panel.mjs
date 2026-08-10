import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createCharacterCreatorViewModel } from '../../src/runtime/campaign-start-controller.mjs';
import { installFakeDom } from './helpers/fake-dom.mjs';

const fakeDocument = installFakeDom();
globalThis.requestAnimationFrame = (callback) => callback();

const { renderCharacterCreatorPanel } = await import('../../src/ui/character-creator-panel.js');

const packageData = JSON.parse(fs.readFileSync(
  new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json', import.meta.url),
  'utf8'
));
const creator = createCharacterCreatorViewModel({
  packageData,
  draft: {
    id: 'draft-assist-test',
    status: 'inProgress',
    revision: 1,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    activeStep: 'identity',
    input: {},
    progress: {},
    autosave: {}
  }
});

const shell = fakeDocument.createElement('section');
shell.id = 'directive-runtime-panel';
const body = fakeDocument.createElement('div');
shell.appendChild(body);
fakeDocument.body.appendChild(shell);

let resolveGeneration;
const generationCalls = [];
const saves = [];
const actions = {
  generateCreatorSectionDraft(options) {
    generationCalls.push(options);
    return new Promise((resolve) => { resolveGeneration = resolve; });
  },
  saveCreatorDraft(options) { saves.push(options); return Promise.resolve({}); },
  refresh() { return Promise.resolve({}); }
};

renderCharacterCreatorPanel(body, {
  creator,
  activePackage: packageData
}, actions);

const form = body.querySelector('[data-creator-form="true"]');
const wand = body.querySelector('[data-creator-section-wand="identity"]');
assert(form && wand, 'identity creator controls should render');
const difficultyField = body.querySelector('.directive-creator-difficulty-field');
const difficultyTop = body.querySelector('.directive-creator-difficulty-top');
const difficultyOptions = body.querySelectorAll('.directive-creator-difficulty-option');
assert(difficultyField && difficultyTop, 'difficulty heading and options should render in a shared top row');
assert.equal(difficultyOptions.length, 2, 'both campaign difficulty choices should render');
assert.equal(body.querySelectorAll('.directive-creator-difficulty-option-policy').length, 0, 'difficulty buttons should omit redundant fatality policy copy');
assert(body.querySelector('.directive-creator-difficulty-fatality'), 'selected mode summary should retain fatality policy copy');
const nameInput = form.querySelector('[data-input-path="identity.name"]');
assert.equal(nameInput.value, '');

const generationPromise = wand.click();
await Promise.resolve();

const loadingModal = fakeDocument.querySelector('[data-creator-assist-modal="identity"]');
assert(loadingModal, 'wand should open the assist modal before provider resolution');
assert.equal(loadingModal.dataset.creatorAssistState, 'loading');
assert.equal(generationCalls.length, 1);
generationCalls[0].onProgress({ message: 'Reasoning timed out again. Trying Utility...' });
assert.equal(
  loadingModal.querySelector('.directive-creator-assist-dialog-progress').textContent,
  'Reasoning timed out again. Trying Utility...'
);

resolveGeneration({
  assistResult: {
    ok: true,
    source: 'provider',
    mode: 'create',
    fields: {
      'identity.name': 'Ari Venn',
      'identity.pronounsOrAddress': 'they, them',
      'identity.speciesId': 'human',
      'identity.ageBandId': 'mid-career',
      'identity.appearance': 'A composed officer with an observant command presence.'
    },
    notes: ['Review before applying.'],
    warnings: [],
    diagnostics: { finalProviderKind: 'reasoning' }
  }
});
await generationPromise;

assert.equal(nameInput.value, '', 'empty-section generation must not auto-apply');
assert.equal(saves.length, 0, 'generation must not save before confirmation');
assert.equal(loadingModal.dataset.creatorAssistState, 'result');

const apply = loadingModal.querySelector('[data-creator-assist-action="apply"]');
await apply.click();
assert.equal(nameInput.value, 'Ari Venn');
assert.equal(saves.length, 1);
assert.equal(saves[0].reason, 'sectionDraftApplied');
assert.equal(saves[0].patch.input.identity.name, 'Ari Venn');
assert.equal(fakeDocument.querySelector('[data-creator-assist-modal="identity"]'), null, 'Apply should close the modal');

const lateGenerationPromise = wand.click();
await Promise.resolve();
const lateCall = generationCalls[1];
const cancelModal = fakeDocument.querySelector('[data-creator-assist-modal="identity"]');
assert(cancelModal, 'a later refinement should open a fresh modal');
await cancelModal.querySelector('[data-creator-assist-action="cancel"]').click();
assert.equal(lateCall.signal.aborted, true, 'Cancel should abort the provider signal');
assert.equal(lateCall.signal.reason, 'cancel', 'Cancel should preserve its lifecycle reason');
assert.equal(fakeDocument.querySelector('[data-creator-assist-modal="identity"]'), null);

resolveGeneration({
  assistResult: {
    ok: true,
    source: 'provider',
    mode: 'refine',
    fields: { 'identity.name': 'Late Result' },
    notes: [],
    warnings: []
  }
});
await lateGenerationPromise;
assert.equal(nameInput.value, 'Ari Venn', 'a late provider result must not alter the form');
assert.equal(saves.length, 1, 'a late provider result must not save');
assert.equal(fakeDocument.querySelector('[data-creator-assist-modal="identity"]'), null, 'a late provider result must not reopen the modal');

const serviceWand = body.querySelector('[data-creator-section-wand="service"]');
void wand.click();
await Promise.resolve();
void serviceWand.click();
await Promise.resolve();
assert.equal(shell.inert, true, 'replacing an assist session must keep Directive inert for the new modal');
const replacementModal = fakeDocument.querySelector('[data-creator-assist-modal="service"]');
assert(replacementModal, 'the replacement session should own the visible modal');
await replacementModal.querySelector('[data-creator-assist-action="cancel"]').click();
assert.equal(shell.inert, false);

console.log('Character Creator assist panel tests passed.');
