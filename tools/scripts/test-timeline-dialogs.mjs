import assert from 'node:assert/strict';

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
    this.disabled = false;
    this.isConnected = true;
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  focus() {}
  select() {}
  remove() {
    this.isConnected = false;
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
  }
}

const body = new Element('body');
const all = (root) => [root, ...root.children.flatMap(all)];
globalThis.document = {
  body,
  documentElement: body,
  createElement: (tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text }),
  getElementById: (id) => all(body).find((node) => node.id === id) || null
};

const {
  createLoadGameDialog,
  createPreviousTimelineNameDialog,
  createSaveGameDialog
} = await import('../../src/ui/timeline-dialogs.js');

const textOf = (root) => all(root).map((node) => node.textContent || '').join(' ');
const campaign = {
  chapter: 'Prelude: A Ship Underway',
  savedGames: [{
    id: 'saved.1', name: 'Before Whitaker', chapter: 'Prelude: A Ship Underway',
    stardate: 53068.405312, createdAt: '2026-08-11T12:00:00.000Z'
  }, {
    id: 'saved.2', name: 'Before the signal', chapter: 'Prelude: A Ship Underway',
    stardate: 53069.1, createdAt: '2026-08-11T13:00:00.000Z'
  }]
};

let loaded = null;
let deleted = null;
const loadDialog = createLoadGameDialog({
  campaign,
  onLoad: (payload) => { loaded = payload; }
});
assert.equal(loadDialog.dialog.getAttribute('role'), 'dialog');
assert.match(textOf(loadDialog.dialog), /Loading this save creates a new timeline\. Your current timeline will be preserved automatically\./);
assert.match(textOf(loadDialog.rows[0]), /Before Whitaker.*Prelude: A Ship Underway.*Stardate 53068\.4\s+\/.*2026/);
assert.doesNotMatch(textOf(loadDialog.rows[0]), /53068\.405312/);
assert.equal(loadDialog.primary.disabled, true);
assert.equal(loadDialog.deleteButtons.length, 0, 'saved-game deletion must be absent without an authoritative handler');
loadDialog.rows[0].listeners.get('click')();
assert.equal(loadDialog.rows[0].getAttribute('aria-pressed'), 'true');
assert.equal(loadDialog.primary.disabled, false);
await loadDialog.primary.listeners.get('click')();
assert.deepEqual(loaded, { savedGameId: 'saved.1' });

const deleteDialog = createLoadGameDialog({
  campaign,
  onDelete: (payload) => { deleted = payload; }
});
deleteDialog.rows[1].listeners.get('click')();
globalThis.confirm = () => true;
assert.equal(deleteDialog.deleteButtons[0].getAttribute('aria-label'), 'Delete saved game Before Whitaker');
await deleteDialog.deleteButtons[0].listeners.get('click')({ preventDefault() {}, stopPropagation() {} });
assert.deepEqual(deleted, { savedGameId: 'saved.1' });
assert.equal(deleteDialog.entries.length, 1);
assert.equal(deleteDialog.rows.length, 1);
assert.equal(deleteDialog.selectedSavedGameId(), 'saved.2', 'deleting another save must preserve the selected load target');
assert.equal(deleteDialog.rows[0].getAttribute('aria-pressed'), 'true');
assert.equal(deleteDialog.primary.disabled, false);

let saved = null;
let resolvePersistence;
let resolveRefresh;
let postSaveStarted = false;
const persistence = new Promise((resolve) => { resolvePersistence = resolve; });
const refresh = new Promise((resolve) => { resolveRefresh = resolve; });
const saveDialog = createSaveGameDialog({
  campaign,
  onSave: async (payload) => {
    saved = payload;
    return persistence;
  },
  onSaved: async (result) => {
    assert.equal(saveDialog.overlay.isConnected, false, 'durable save success must close the dialog before refresh');
    assert.deepEqual(result, { savedGameId: 'saved.ready-room' });
    postSaveStarted = true;
    await refresh;
  }
});
assert.equal(saveDialog.input.value, 'Before Prelude: A Ship Underway');
saveDialog.input.value = 'Before the signal';
const saveClick = saveDialog.primary.listeners.get('click')();
await Promise.resolve();
assert.deepEqual(saved, { name: 'Before the signal' });
assert.equal(saveDialog.primary.textContent, 'Saving...');
assert.equal(saveDialog.primary.disabled, true);
assert.equal(saveDialog.cancel.textContent, 'Close', 'an in-flight save can be closed but cannot be cancelled');
assert.equal(saveDialog.overlay.isConnected, true, 'dialog must remain visible until durable persistence succeeds');
resolvePersistence({ savedGameId: 'saved.ready-room' });
await Promise.resolve();
await Promise.resolve();
assert.equal(saveDialog.overlay.isConnected, false);
assert.equal(postSaveStarted, true, 'post-save refresh must begin after the success dialog closes');
resolveRefresh();
await saveClick;

const failedSaveDialog = createSaveGameDialog({
  campaign,
  onSave: async () => { throw new Error('Storage unavailable'); }
});
failedSaveDialog.input.value = 'Retryable save';
await failedSaveDialog.primary.listeners.get('click')();
assert.equal(failedSaveDialog.overlay.isConnected, true, 'persistence failure must keep the dialog open');
assert.equal(failedSaveDialog.error.hidden, false);
assert.equal(failedSaveDialog.error.textContent, 'Storage unavailable');
assert.equal(failedSaveDialog.primary.textContent, 'Save Game');
assert.equal(failedSaveDialog.primary.disabled, false);
assert.equal(failedSaveDialog.cancel.textContent, 'Cancel');

let renamed = null;
const nameDialog = createPreviousTimelineNameDialog({
  savedGameId: 'saved.2',
  suggestedName: 'Prelude: A Ship Underway — Stardate 53068.4',
  onRename: (payload) => { renamed = payload; }
});
assert.equal(nameDialog.input.value, 'Prelude: A Ship Underway — Stardate 53068.4');
assert.match(textOf(nameDialog.dialog), /Your previous timeline was saved so you can return to it\./);
nameDialog.input.value = 'Before the alternate order';
await nameDialog.primary.listeners.get('click')();
assert.deepEqual(renamed, { savedGameId: 'saved.2', name: 'Before the alternate order' });

let emptyRenameCalls = 0;
const emptyNameDialog = createPreviousTimelineNameDialog({
  savedGameId: 'saved.3', suggestedName: 'Automatic name', onRename: () => { emptyRenameCalls += 1; }
});
emptyNameDialog.input.value = '';
await emptyNameDialog.primary.listeners.get('click')();
assert.equal(emptyRenameCalls, 0, 'empty naming keeps the already-persisted automatic name');

console.log('timeline dialog tests passed');
