import assert from 'node:assert/strict';
import fs from 'node:fs';

import { chromium } from 'playwright';

const css = fs.readFileSync(new URL('../../styles/directive.css', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });

async function layoutMetrics(viewport) {
  const page = await browser.newPage({ viewport });
  try {
    await page.setContent(`
      <style>${css}</style>
      <section id="directive-runtime-panel" class="directive-runtime-panel directive-expanded-shell" style="display:block;position:relative;transform:none;width:100%;height:100%">
        <form class="directive-creator-form directive-creator-console directive-lcars-console directive-lcars-panel">
          <nav class="directive-step-row directive-creator-step-row">
            <button class="directive-step-button directive-creator-step-button directive-step-button-active"><span>Identity</span></button>
            <button class="directive-step-button directive-creator-step-button"><span>Service</span></button>
            <button class="directive-step-button directive-creator-step-button"><span>Personality</span></button>
            <button class="directive-step-button directive-creator-step-button"><span>Review</span></button>
          </nav>
          <div class="directive-action-row directive-creator-command-bar directive-lcars-panel">
            <button class="directive-button directive-creator-command-button">Save Draft</button>
          </div>
          <section class="directive-creator-section directive-creator-section-active" style="min-height:1200px"></section>
        </form>
      </section>
      <div id="directive-modal-root" class="directive-modal-root">
        <div class="directive-creator-assist-dialog-overlay" data-creator-assist-state="loading">
          <section class="directive-creator-assist-dialog" role="dialog" aria-modal="true">
            <header class="directive-creator-assist-dialog-header">
              <h2 class="directive-creator-assist-dialog-title">Refining Identity</h2>
              <button class="directive-creator-assist-dialog-close">×</button>
            </header>
            <div class="directive-creator-assist-dialog-body">
              <div class="directive-creator-assist-dialog-loading">
                <span class="directive-creator-assist-dialog-spinner"></span>
                <p class="directive-creator-assist-dialog-progress">Reasoning timed out again. Trying Utility...</p>
              </div>
              <div class="directive-creator-assist-dialog-actions"><button class="directive-button">Cancel</button></div>
            </div>
          </section>
        </div>
      </div>
    `);
    return await page.evaluate(() => {
      const overlay = document.querySelector('.directive-creator-assist-dialog-overlay');
      const dialog = document.querySelector('.directive-creator-assist-dialog');
      const spinner = document.querySelector('.directive-creator-assist-dialog-spinner');
      const commandBar = document.querySelector('.directive-creator-command-bar');
      const stepButtons = [...document.querySelectorAll('.directive-creator-step-button')];
      const overlayStyle = getComputedStyle(overlay);
      const dialogStyle = getComputedStyle(dialog);
      const spinnerStyle = getComputedStyle(spinner);
      const commandStyle = getComputedStyle(commandBar);
      const overlayRect = overlay.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        overlay: {
          position: overlayStyle.position,
          display: overlayStyle.display,
          backgroundColor: overlayStyle.backgroundColor,
          width: overlayRect.width,
          height: overlayRect.height,
          left: overlayRect.left,
          top: overlayRect.top
        },
        dialog: {
          width: dialogRect.width,
          height: dialogRect.height,
          overflowY: dialogStyle.overflowY
        },
        spinner: {
          display: spinnerStyle.display,
          animationName: spinnerStyle.animationName,
          width: Number.parseFloat(spinnerStyle.width),
          height: Number.parseFloat(spinnerStyle.height)
        },
        commandPosition: commandStyle.position,
        stepHeights: stepButtons.map((button) => button.getBoundingClientRect().height),
        documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
  } finally {
    await page.close();
  }
}

try {
  for (const viewport of [
    { width: 1200, height: 900 },
    { width: 390, height: 844 }
  ]) {
    const metrics = await layoutMetrics(viewport);
    assert.equal(metrics.overlay.position, 'fixed');
    assert.equal(metrics.overlay.display, 'grid');
    assert.ok(metrics.overlay.backgroundColor !== 'rgba(0, 0, 0, 0)', 'modal overlay should visibly dim Directive');
    assert.ok(Math.abs(metrics.overlay.left) < 0.1 && Math.abs(metrics.overlay.top) < 0.1);
    assert.ok(Math.abs(metrics.overlay.width - viewport.width) < 0.1);
    assert.ok(Math.abs(metrics.overlay.height - viewport.height) < 0.1);
    assert.ok(metrics.dialog.width <= viewport.width - 24, `${viewport.width}px dialog should fit horizontally`);
    assert.ok(metrics.dialog.height <= viewport.height - 24, `${viewport.width}px dialog should fit vertically`);
    assert.equal(metrics.dialog.overflowY, 'auto');
    assert.notEqual(metrics.spinner.display, 'none');
    assert.equal(metrics.spinner.animationName, 'directive-spinner');
    assert.ok(metrics.spinner.width >= 18 && metrics.spinner.height >= 18);
    assert.notEqual(metrics.commandPosition, 'sticky', 'creator command bar must not overlap prior form rows');
    assert.ok(metrics.stepHeights.every((height) => height >= 40), 'commissioning step buttons should retain their minimum height');
    assert.equal(metrics.documentOverflowX, false);
  }
} finally {
  await browser.close();
}

console.log('Character Creator assist layout tests passed.');
