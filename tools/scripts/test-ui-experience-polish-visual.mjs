import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = 42000 + (process.pid % 9000);
const url = `http://127.0.0.1:${port}`;
const artifacts = path.join(root, 'artifacts/ui-experience-polish');
const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], {
  cwd: root, env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) }, stdio: ['ignore', 'ignore', 'inherit'],
});
let browser;
try {
  await mkdir(artifacts, { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(`${url}/production`)).ok) break; } catch {}
    if (attempt === 50) throw new Error('Polish preview did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function open(route = 'campaign') {
    await page.goto(`${url}/production?route=${route}`);
    await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  }
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 360, height: 500 }]) {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize(viewport);
    await open();
    await page.screenshot({ animations: 'disabled', path: path.join(artifacts, `campaign-${viewport.width}.png`) });
    await page.evaluate(async () => {
      const { createSaveGameDialog } = await import('/src/ui/timeline-dialogs.js');
      createSaveGameDialog({ campaign: { chapter: 'A longer chapter name for a saved game' }, onSave: async () => ({ ok: true }) });
    });
    await page.screenshot({ animations: 'disabled', path: path.join(artifacts, `save-${viewport.width}.png`) });
    const saveFont = await page.locator('.timeline-dialog').evaluate(el => getComputedStyle(el).fontFamily);
    await page.keyboard.press('Tab');
    const focusStyle = await page.locator('.timeline-dialog-actions button:focus-visible').evaluate(el => ({
      style: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth,
    }));
    assert.deepEqual(focusStyle, { style: 'solid', width: '2px' }, 'dialog action keyboard focus has a consistent visible ring');
    await open();
    await page.evaluate(async () => {
      const { createCharacterCreatorAssistDialog } = await import('/src/ui/character-creator-assist-dialog.js');
      const assist = createCharacterCreatorAssistDialog();
      assist.showResult({ fields: [{ label: 'Background', value: 'A veteran navigator ready for a new assignment.' }] });
    });
    const apply = page.locator('[data-creator-assist-action="apply"]');
    await apply.focus();
    await page.waitForTimeout(180);
    const applyColors = await apply.evaluate(el => ({ foreground: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
    assert.notEqual(applyColors.background, 'rgba(0, 0, 0, 0)', 'focused assist action has a resolved contrasting surface outside the shell');
    const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(value => {
      const channel = Number(value) / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const levels = [luminance(applyColors.foreground), luminance(applyColors.background)].sort((a, b) => b - a);
    assert.ok((levels[0] + .05) / (levels[1] + .05) >= 4.5, 'focused assist action text remains readable');
    await page.screenshot({ animations: 'disabled', path: path.join(artifacts, `assist-${viewport.width}.png`) });
    await open('mission');
    await page.evaluate(async () => {
      const { showSettlementRetryDialog } = await import('/src/ui/settlement-retry-dialog.js');
      showSettlementRetryDialog({ onRetry: () => new Promise(() => {}) });
    });
    if (viewport.height <= 500) {
      await page.locator('.directive-settlement-retry-detail').evaluate(el => {
        el.textContent = 'The connection could not complete this request. Your current turn remains available for another attempt. '.repeat(8);
      });
      await page.locator('[data-settlement-retry-action="retry"]').scrollIntoViewIfNeeded();
      const action = await page.locator('[data-settlement-retry-action="retry"]').boundingBox();
      assert.ok(action.y >= 10 && action.y + action.height <= viewport.height - 10, 'long recovery content keeps actions reachable');
    }
    await page.screenshot({ animations: 'disabled', path: path.join(artifacts, `retry-${viewport.width}.png`) });
    const retryLayout = await page.locator('.directive-settlement-retry-dialog').evaluate(el => ({
      font: getComputedStyle(el).fontFamily,
      left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right,
    }));
    assert.equal(retryLayout.font, saveFont, 'recovery and save dialogs share the reading font');
    assert.ok(retryLayout.left >= 10 && retryLayout.right <= viewport.width - 10, 'recovery dialog fits with viewport gutters');
    const button = page.locator('[data-settlement-retry-action="retry"]');
    await page.mouse.move(0, 0);
    const resting = await button.boundingBox();
    await button.hover();
    await page.waitForTimeout(180);
    const hovered = await button.boundingBox();
    assert.equal(hovered.y, resting.y, 'hover must not move the action target');
    assert.equal(hovered.width, resting.width, 'hover preserves button width');
    await button.click();
    const busyStyle = await button.evaluate(el => ({ cursor: getComputedStyle(el).cursor, opacity: Number(getComputedStyle(el).opacity) }));
    assert.equal(busyStyle.cursor, 'progress', 'pending actions look busy rather than unavailable');
    assert.ok(busyStyle.opacity >= .75, 'pending action remains readable');
    assert.equal((await button.boundingBox()).width, resting.width, 'busy label preserves action width');
    assert.equal((await button.boundingBox()).height, resting.height, 'busy label preserves action height');
    assert.equal((await button.boundingBox()).y, resting.y, 'pending status preserves action position');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await button.evaluate(el => getComputedStyle(el).transitionDuration.split(',').map(value => parseFloat(value)));
    assert.ok(reduced.every(seconds => seconds <= .00001), 'reduced motion applies to modal controls outside the route shell');
  }
  assert.deepEqual(errors, [], 'production UI renders without page errors');
  console.log('UI experience polish visual checks passed.');
} finally {
  await browser?.close();
  server.kill();
}
