import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const css = fs.readFileSync(new URL('../../styles/directive.css', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent(`
    <style>${css}</style>
    <section class="directive-runtime-panel directive-expanded-shell" inert></section>
    <div class="directive-creator-assist-dialog-overlay">
      <section class="directive-creator-assist-dialog" role="dialog" aria-modal="true">
        <header class="directive-creator-assist-dialog-header"><h2 class="directive-creator-assist-dialog-title">Refining Identity</h2></header>
        <div class="directive-creator-assist-dialog-body" data-directive-scroll-owner="true">${'<p>Suggested field</p>'.repeat(100)}</div>
      </section>
    </div>
  `);
  const metrics = await page.evaluate(() => {
    const overlay = document.querySelector('.directive-creator-assist-dialog-overlay');
    const dialog = document.querySelector('.directive-creator-assist-dialog');
    const title = document.querySelector('.directive-creator-assist-dialog-title');
    const body = document.querySelector('.directive-creator-assist-dialog-body');
    return {
      ariaModal: dialog.getAttribute('aria-modal'),
      overlayBackground: getComputedStyle(overlay).backgroundColor,
      dialogOverflow: getComputedStyle(dialog).overflowY,
      bodyOverflow: getComputedStyle(body).overflowY,
      bodyScrolls: body.scrollHeight > body.clientHeight,
      titleFont: getComputedStyle(title).fontFamily
    };
  });
  assert.equal(metrics.ariaModal, 'true');
  assert.notEqual(metrics.overlayBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(metrics.dialogOverflow, 'hidden');
  assert.equal(metrics.bodyOverflow, 'auto');
  assert.equal(metrics.bodyScrolls, true);
  assert.match(metrics.titleFont, /Roboto Condensed|Arial Narrow/);
} finally {
  await browser.close();
}

console.log('PASS certified Character Creator modal');
