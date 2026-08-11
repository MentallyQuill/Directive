import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';

const fakeDocument = installFakeDom();
const { createCampaignDeleteDialog } = await import('../../src/ui/campaign-delete-dialog.js');

const shell = fakeDocument.createElement('section');
shell.id = 'directive-runtime-panel';
fakeDocument.body.appendChild(shell);
const opener = fakeDocument.createElement('button');
shell.appendChild(opener);
opener.focus();

const campaign = {
  id: 'campaign.ashes',
  title: 'Ashes of Peace',
  characterName: 'Ren Okada - Ashes of Peace',
  activeTimeline: { saveId: 'save.active' }
};
const all = (root) => [root, ...root.children.flatMap(all)];
const textOf = (root) => all(root).map((node) => node.textContent || '').join(' ');

let deleteCalls = 0;
const dialog = createCampaignDeleteDialog({
  campaign,
  opener,
  onDelete: async () => { deleteCalls += 1; }
});
assert.equal(fakeDocument.getElementById('directive-modal-root').children[0], dialog.overlay);
assert.equal(dialog.dialog.getAttribute('role'), 'dialog');
assert.equal(dialog.dialog.getAttribute('aria-modal'), 'true');
assert.equal(dialog.overlay.dataset.campaignDeleteModal, 'campaign.ashes');
assert.match(textOf(dialog.dialog), /Ren Okada - Ashes of Peace/);
assert.match(textOf(dialog.dialog), /all of its chats/i);
assert.equal(shell.inert, true);
assert.equal(fakeDocument.activeElement, dialog.input);
assert.equal(dialog.deleteButton.disabled, true);

dialog.input.value = 'remove';
await dialog.input.dispatch('input');
assert.equal(dialog.deleteButton.disabled, true);
dialog.input.value = '  DeLeTe  ';
await dialog.input.dispatch('input');
assert.equal(dialog.deleteButton.disabled, false);
await dialog.deleteButton.click();
assert.equal(deleteCalls, 1);
assert.equal(dialog.isOpen(), false);
assert.equal(shell.inert, false);
assert.equal(fakeDocument.activeElement, opener);

let canceledDeletes = 0;
const cancelDialog = createCampaignDeleteDialog({
  campaign,
  opener,
  onDelete: async () => { canceledDeletes += 1; }
});
await cancelDialog.cancelButton.click();
assert.equal(cancelDialog.isOpen(), false);
assert.equal(canceledDeletes, 0);

const escapeDialog = createCampaignDeleteDialog({ campaign, opener, onDelete: async () => {} });
await escapeDialog.dialog.dispatch('keydown', { key: 'Escape' });
assert.equal(escapeDialog.isOpen(), false);

let releaseDelete;
const pendingDelete = new Promise((resolve) => { releaseDelete = resolve; });
const busyDialog = createCampaignDeleteDialog({ campaign, opener, onDelete: async () => pendingDelete });
busyDialog.input.value = 'delete';
await busyDialog.input.dispatch('input');
const deletionPromise = busyDialog.deleteButton.click();
assert.equal(busyDialog.overlay.dataset.campaignDeleteState, 'deleting');
assert.equal(busyDialog.input.disabled, true);
await busyDialog.dialog.dispatch('keydown', { key: 'Escape' });
assert.equal(busyDialog.isOpen(), true);
releaseDelete();
await deletionPromise;
assert.equal(busyDialog.isOpen(), false);

const errorDialog = createCampaignDeleteDialog({
  campaign,
  opener,
  onDelete: async () => { throw new Error('SillyTavern refused deletion.'); }
});
errorDialog.input.value = 'DELETE';
await errorDialog.input.dispatch('input');
await errorDialog.deleteButton.click();
assert.equal(errorDialog.isOpen(), true);
assert.equal(errorDialog.overlay.dataset.campaignDeleteState, 'error');
assert.equal(errorDialog.error.getAttribute('role'), 'alert');
assert.equal(errorDialog.error.textContent, 'SillyTavern refused deletion.');
assert.equal(errorDialog.input.disabled, false);
assert.equal(errorDialog.deleteButton.disabled, false);
errorDialog.close('test-cleanup');

console.log('Campaign delete dialog tests passed.');
