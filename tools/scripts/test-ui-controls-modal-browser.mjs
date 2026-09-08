import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = 57000 + process.pid % 3000;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], { cwd: root, env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) }, stdio: ['ignore', 'ignore', 'inherit'] });
const browser = await chromium.launch();
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${base}/production`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  const page = await browser.newPage();
  await page.goto(`${base}/production`);
  await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  await page.evaluate(async () => {
    document.body.replaceChildren();
    const kit = await import('/src/ui/runtime-ui-kit.js');
    const host = document.createElement('main'); host.id = 'host';
    const opener = document.createElement('button'); opener.textContent = 'Open'; host.append(opener); document.body.append(host);
    window.calls = 0;
    window.button = kit.createButton({ label: 'Save', onClick: () => { window.calls++; return new Promise(r => window.finish = r); } });
    host.append(window.button); window.button.focus(); window.before = window.button.getBoundingClientRect().width;
    window.button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    window.button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  assert.equal(await page.evaluate(() => button.getAttribute('aria-busy')), 'true');
  assert.equal(await page.evaluate(() => calls), 1);
  assert.equal(await page.evaluate(() => button.getBoundingClientRect().width), await page.evaluate(() => before));
  assert.equal(await page.evaluate(() => document.activeElement === button), true);
  await page.evaluate(() => finish());
  assert.equal(await page.evaluate(() => button.hasAttribute('aria-busy')), false);
  assert.equal(await page.evaluate(() => button.textContent), 'Save');
  await page.evaluate(async () => {
    const { createSaveGameDialog } = await import('/src/ui/timeline-dialogs.js');
    window.opener = document.querySelector('#host > button'); opener.focus();
    window.modal = createSaveGameDialog({ opener, onSave: async () => {} });
  });
  assert.equal(await page.locator('#host').evaluate(node => node.inert), true, 'the entire host must be inert');
  await page.evaluate(() => modal.primary.focus());
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement === modal.input), true, 'Tab wraps inside the modal');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement === modal.primary), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#host').evaluate(node => node.inert), false);
  assert.equal(await page.evaluate(() => document.activeElement === opener), true);
  await page.evaluate(async () => {
    const { createPreviousTimelineNameDialog } = await import('/src/ui/timeline-dialogs.js');
    window.rename = createPreviousTimelineNameDialog({ savedGameId: 'one', suggestedName: 'Original', onRename: async () => { throw new Error('Disk unavailable'); } });
    rename.input.value = 'Keep this name'; rename.primary.click();
  });
  await page.waitForTimeout(20);
  assert.equal(await page.evaluate(() => rename.input.value), 'Keep this name');
  assert.equal(await page.evaluate(() => rename.primary.disabled), false, 'failed rename remains retryable');
  assert.equal(await page.evaluate(() => rename.error?.textContent), 'Disk unavailable');
  await page.evaluate(() => rename.close());
  await page.evaluate(async () => {
    const { createSaveGameDialog } = await import('/src/ui/timeline-dialogs.js');
    const { createCampaignDeleteDialog } = await import('/src/ui/campaign-delete-dialog.js');
    window.outer = createSaveGameDialog({ opener });
    window.inner = createCampaignDeleteDialog({ opener: outer.primary });
    window.addedHost = document.createElement('button'); addedHost.textContent = 'Host added later'; document.body.append(addedHost);
  });
  assert.equal(await page.evaluate(() => outer.overlay.inert), true, 'a nested modal blocks the prior modal');
  assert.equal(await page.evaluate(() => addedHost.inert), true, 'new host elements are also blocked');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => outer.overlay.inert), false);
  assert.equal(await page.evaluate(() => document.activeElement === outer.primary), true);
  assert.equal(await page.locator('#host').evaluate(node => node.inert), true, 'closing a child must not unblock the host');
  await page.evaluate(() => outer.overlay.remove());
  assert.equal(await page.locator('#host').evaluate(node => node.inert), false, 'external removal releases ownership');
  assert.equal(await page.evaluate(() => document.activeElement === opener), true);
  await page.evaluate(async () => {
    const retry = await import('/src/ui/settlement-retry-dialog.js');
    window.oldRetry = retry.showSettlementRetryDialog({ onRetry: () => new Promise(r => window.finishOldRetry = r) });
    oldRetry.retry.click(); oldRetry.close.click();
    window.newRetry = retry.showSettlementRetryDialog();
    finishOldRetry({ ok: true });
  });
  assert.equal(await page.evaluate(() => newRetry.overlay.isConnected), true, 'dismissed retry completion cannot close a newer dialog');
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const { createCharacterCreatorAssistDialog } = await import('/src/ui/character-creator-assist-dialog.js');
    window.assist = createCharacterCreatorAssistDialog();
  });
  assert.equal(await page.locator('#host').evaluate(node => node.inert), true);
  await page.evaluate(() => assist.close());
  await page.evaluate(() => assist.showError({ message: 'Stale failure' }));
  assert.equal(await page.evaluate(() => assist.overlay.dataset.creatorAssistState), 'loading', 'dismissed assist cannot render stale results');
  await page.evaluate(async () => {
    const { createConnectionProfilePicker } = await import('/src/ui/connection-profile-picker.js');
    window.picker = createConnectionProfilePicker({ profiles: [{ id: 'one', name: 'One' }], onSelect: async () => { throw new Error('Keep search'); } });
    picker.searchInput.value = 'One'; picker.searchInput.dispatchEvent(new Event('input'));
    picker.resultList.querySelector('button').click();
  });
  assert.equal(await page.evaluate(() => picker.searchInput.value), 'One');
  assert.equal(await page.evaluate(() => picker.error.textContent), 'Keep search');
  assert.equal(await page.locator('#host').evaluate(node => node.inert), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#host').evaluate(node => node.inert), false);
  await page.evaluate(async () => {
    const retry = await import('/src/ui/settlement-retry-dialog.js');
    window.removedRetry = retry.showSettlementRetryDialog();
    removedRetry.overlay.remove();
  });
  await page.evaluate(async () => {
    const retry = await import('/src/ui/settlement-retry-dialog.js');
    window.reopenedRetry = retry.showSettlementRetryDialog();
  });
  assert.equal(await page.evaluate(() => reopenedRetry.overlay.isConnected), true, 'external disposal must allow a fresh retry dialog');
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const { createSaveGameDialog } = await import('/src/ui/timeline-dialogs.js');
    window.saveCalls = 0;
    window.save = createSaveGameDialog({ onSave: () => { saveCalls++; return new Promise((resolve, reject) => { window.rejectSave = reject; window.resolveSave = resolve; }); } });
    save.input.value = 'Retain my input'; save.primary.focus();
    window.saveWidth = save.primary.getBoundingClientRect().width;
    save.primary.click(); save.primary.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  assert.equal(await page.evaluate(() => saveCalls), 1);
  assert.equal(await page.evaluate(() => save.primary.getBoundingClientRect().width), await page.evaluate(() => saveWidth));
  assert.equal(await page.evaluate(() => document.activeElement === save.primary), true);
  await page.evaluate(() => rejectSave(new Error('Save unavailable')));
  assert.equal(await page.evaluate(() => save.input.value), 'Retain my input');
  assert.equal(await page.evaluate(() => save.error.textContent), 'Save unavailable');
  assert.equal(await page.evaluate(() => save.primary.hasAttribute('aria-busy')), false);
  assert.equal(await page.evaluate(() => save.primary.style.width), '');
  await page.evaluate(() => { save.primary.click(); resolveSave({ id: 'saved' }); });
  assert.equal(await page.evaluate(() => save.overlay.isConnected), false);
  await page.evaluate(async () => {
    const { createCampaignDeleteDialog } = await import('/src/ui/campaign-delete-dialog.js');
    window.deletion = createCampaignDeleteDialog({ onDelete: () => new Promise(r => window.finishDelete = r) });
    deletion.input.value = 'delete'; deletion.input.dispatchEvent(new Event('input'));
    deletion.deleteButton.focus(); deletion.deleteButton.click();
  });
  assert.equal(await page.evaluate(() => document.activeElement === deletion.deleteButton), true, 'pending destructive action must keep focus within the dialog');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => deletion.isOpen()), true);
  await page.evaluate(() => finishDelete());
  console.log('Busy control and modal browser regressions passed.');
} finally { await browser.close(); server.kill(); }
