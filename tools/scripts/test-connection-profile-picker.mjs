import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';

const fakeDocument = installFakeDom();
const { createConnectionProfilePicker } = await import('../../src/ui/connection-profile-picker.js');
const all = (root) => [root, ...root.children.flatMap(all)];
const textOf = (root) => all(root).map((node) => node.textContent || '').join(' ');

const shell = fakeDocument.createElement('section');
shell.id = 'directive-runtime-panel';
fakeDocument.body.appendChild(shell);
const opener = fakeDocument.createElement('button');
shell.appendChild(opener);
opener.focus();

const chosen = [];
const picker = createConnectionProfilePicker({
  profiles: [
    { id: 'profile.deep', name: 'Deep Reasoning', label: 'Deep Reasoning / deepseek-reasoner', model: 'deepseek-reasoner' },
    { id: 'profile.fast', name: 'Fast Utility', model: 'gpt-5-mini' }
  ],
  selectedId: 'profile.deep',
  opener,
  onSelect: async (profileId) => { chosen.push(profileId); }
});

assert.equal(fakeDocument.getElementById('directive-modal-root').children[0], picker.overlay);
assert.equal(picker.dialog.getAttribute('role'), 'dialog');
assert.equal(picker.dialog.getAttribute('aria-modal'), 'true');
assert.equal(shell.inert, true);
assert.equal(fakeDocument.activeElement, picker.searchInput);
assert.equal(picker.resultList.children.length, 2);
assert.equal(picker.resultList.getAttribute('role'), 'group');
assert.equal(picker.resultList.getAttribute('aria-label'), 'Connection profiles');
assert.equal(picker.resultList.children[0].getAttribute('role'), null);
assert.equal(picker.resultList.children[0].dataset.connectionProfileId, 'profile.deep');
assert.equal(picker.resultList.children[0].getAttribute('aria-current'), 'true');
assert.equal(picker.resultList.children[0].children[0].textContent, 'Deep Reasoning');
assert.match(textOf(picker.resultList.children[0]), /Deep Reasoning/);
assert.match(textOf(picker.resultList.children[0]), /deepseek-reasoner/);

picker.clearButton.focus();
await picker.dialog.dispatch('keydown', { key: 'Tab', shiftKey: false });
assert.equal(fakeDocument.activeElement, picker.closeButton, 'Tab should wrap from Clear selection to Close');
picker.closeButton.focus();
await picker.dialog.dispatch('keydown', { key: 'Tab', shiftKey: true });
assert.equal(fakeDocument.activeElement, picker.clearButton, 'Shift+Tab should wrap from Close to Clear selection');

picker.searchInput.value = 'deep reasoning';
await picker.searchInput.dispatch('input');
assert.equal(picker.resultList.children.length, 1);
assert.equal(picker.resultList.children[0].dataset.connectionProfileId, 'profile.deep');

picker.searchInput.value = 'fast utility';
await picker.searchInput.dispatch('input');
assert.equal(picker.resultList.children[0].dataset.connectionProfileId, 'profile.fast');

picker.searchInput.value = 'profile.deep';
await picker.searchInput.dispatch('input');
assert.equal(picker.resultList.children[0].dataset.connectionProfileId, 'profile.deep');

picker.searchInput.value = '5-MINI';
await picker.searchInput.dispatch('input');
assert.equal(picker.resultList.children.length, 1);
assert.equal(picker.resultList.children[0].dataset.connectionProfileId, 'profile.fast');
await picker.resultList.children[0].click();
assert.deepEqual(chosen, ['profile.fast']);
assert.equal(picker.isOpen(), false);
assert.equal(shell.inert, false);
assert.equal(fakeDocument.activeElement, opener);

const dismissed = [];
const closePicker = createConnectionProfilePicker({
  profiles: [{ id: 'profile.deep', label: 'Deep Reasoning' }],
  selectedId: 'profile.deep',
  opener,
  onSelect: async (profileId) => { dismissed.push(profileId); }
});
await closePicker.closeButton.click();
assert.equal(closePicker.isOpen(), false);
assert.deepEqual(dismissed, []);
assert.equal(fakeDocument.activeElement, opener);

const escapePicker = createConnectionProfilePicker({ profiles: [], opener, onSelect: async () => {} });
await escapePicker.dialog.dispatch('keydown', { key: 'Escape' });
assert.equal(escapePicker.isOpen(), false);

const backdropPicker = createConnectionProfilePicker({ profiles: [], opener, onSelect: async () => {} });
await backdropPicker.overlay.dispatch('click', { target: backdropPicker.overlay });
assert.equal(backdropPicker.isOpen(), false);

const cancelPicker = createConnectionProfilePicker({ profiles: [], opener, onSelect: async () => {} });
await cancelPicker.dialog.dispatch('cancel');
assert.equal(cancelPicker.isOpen(), false);

const cleared = [];
const clearPicker = createConnectionProfilePicker({
  profiles: [{ id: 'profile.deep', label: 'Deep Reasoning' }],
  selectedId: 'profile.deep',
  opener,
  onSelect: async (profileId) => { cleared.push(profileId); }
});
await clearPicker.clearButton.click();
assert.deepEqual(cleared, ['']);
assert.equal(clearPicker.isOpen(), false);

const noMatchPicker = createConnectionProfilePicker({
  profiles: [{ id: 'profile.deep', label: 'Deep Reasoning' }],
  opener,
  onSelect: async () => {}
});
noMatchPicker.searchInput.value = 'not-present';
await noMatchPicker.searchInput.dispatch('input');
assert.equal(noMatchPicker.resultList.children.length, 1);
assert.match(textOf(noMatchPicker.resultList.children[0]), /No matching profiles/i);
noMatchPicker.close('test-cleanup');

const emptyPicker = createConnectionProfilePicker({ profiles: [], opener, onSelect: async () => {} });
assert.match(textOf(emptyPicker.resultList), /No supported chat or text connection profiles/i);
emptyPicker.close('test-cleanup');

const errorPicker = createConnectionProfilePicker({
  profiles: [{ id: 'profile.deep', label: 'Deep Reasoning' }],
  opener,
  onSelect: async () => { throw new Error('Could not save profile.'); }
});
await errorPicker.resultList.children[0].click();
assert.equal(errorPicker.isOpen(), true);
assert.equal(errorPicker.error.hidden, false);
assert.equal(errorPicker.error.getAttribute('role'), 'alert');
assert.equal(errorPicker.error.textContent, 'Could not save profile.');
assert.equal(fakeDocument.activeElement, errorPicker.searchInput);
errorPicker.close('test-cleanup');

const popstateHandlers = [];
let pushedHistoryEntries = 0;
let backCalls = 0;
globalThis.window = {
  innerWidth: 390,
  matchMedia: () => ({ matches: true }),
  addEventListener(type, handler, capture = false) {
    if (type === 'popstate') popstateHandlers.push({ handler, capture });
  },
  removeEventListener(type, handler) {
    if (type !== 'popstate') return;
    const index = popstateHandlers.findIndex((entry) => entry.handler === handler);
    if (index >= 0) popstateHandlers.splice(index, 1);
  },
  history: {
    state: { directiveRuntimeOpen: true },
    pushState(state) { this.state = state; pushedHistoryEntries += 1; },
    back() {
      backCalls += 1;
      let stopped = false;
      const event = { stopImmediatePropagation() { stopped = true; } };
      for (const entry of [...popstateHandlers].sort((left, right) => Number(right.capture) - Number(left.capture))) {
        entry.handler(event);
        if (stopped) break;
      }
    }
  }
};
const backPicker = createConnectionProfilePicker({ profiles: [], opener, onSelect: async () => {} });
assert.equal(pushedHistoryEntries, 1, 'mobile picker should own a history entry');
window.history.back();
assert.equal(backCalls, 1);
assert.equal(backPicker.isOpen(), false, 'Android Back should close only the picker');
assert.equal(shell.inert, false);
assert.equal(popstateHandlers.length, 0, 'closing must remove the picker popstate listener');
delete globalThis.window;

console.log('Connection profile picker tests passed.');
