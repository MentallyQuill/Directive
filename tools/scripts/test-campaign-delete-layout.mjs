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
      <section id="directive-runtime-panel" class="directive-runtime-panel directive-expanded-shell" style="width:100vw;height:100vh">
        <main class="directive-workspace">
          <section class="directive-runtime-body directive-route-body">
            <section class="directive-expanded-campaign campaign-layout campaign-journal" style="width:100%;height:300px">
              <aside class="campaign-master campaign-index-panel"></aside>
              <section class="campaign-detail">
                <div class="campaign-detail-actions campaign-dashboard-actions" style="width:calc(100vw - 64px)">
                  <button class="campaign-command campaign-command-primary" data-campaign-action="continue">Continue</button>
                  <button class="campaign-command" data-campaign-action="save">Save Game</button>
                  <button class="campaign-command" data-campaign-action="load">Load Game</button>
                  <button class="campaign-command campaign-command-danger campaign-delete-icon-command" data-campaign-action="delete" aria-label="Delete campaign"><span class="campaign-delete-icon"></span></button>
                </div>
              </section>
            </section>
          </section>
        </main>
      </section>
      <div id="directive-modal-root" class="directive-modal-root">
        <div class="campaign-delete-dialog-overlay" data-campaign-delete-state="confirming">
          <section class="campaign-delete-dialog" role="dialog" aria-modal="true">
            <header class="campaign-delete-dialog-header">
              <h2 class="campaign-delete-dialog-title">Delete campaign?</h2>
              <button class="campaign-delete-dialog-close">×</button>
            </header>
            <div class="campaign-delete-dialog-body" data-directive-scroll-owner="true">
              <p class="campaign-delete-dialog-warning">This will permanently delete the SillyTavern character card named "Ren Okada - Ashes of Peace" along with all of its chats.</p>
              <p class="campaign-delete-dialog-instruction">Type delete to confirm.</p>
              <label class="campaign-delete-dialog-field"><span class="campaign-delete-dialog-label">Confirmation</span><input class="campaign-delete-dialog-input" value="delete"></label>
              <p class="campaign-delete-dialog-error" role="alert" hidden></p>
              <div class="campaign-delete-dialog-actions">
                <button class="campaign-command">Cancel</button>
                <button class="campaign-command campaign-command-danger campaign-delete-confirm">Delete</button>
              </div>
            </div>
          </section>
        </div>
      </div>
    `);
    return await page.evaluate(() => {
      const overlay = document.querySelector('.campaign-delete-dialog-overlay');
      const dialog = document.querySelector('.campaign-delete-dialog');
      const body = document.querySelector('.campaign-delete-dialog-body');
      const detailActions = document.querySelector('.campaign-detail-actions');
      const actionButtons = [...document.querySelectorAll('.campaign-detail-actions .campaign-command')];
      const overlayRect = overlay.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const actionRects = actionButtons.map((button) => button.getBoundingClientRect());
      return {
        overlay: {
          position: getComputedStyle(overlay).position,
          display: getComputedStyle(overlay).display,
          backgroundColor: getComputedStyle(overlay).backgroundColor,
          width: overlayRect.width,
          height: overlayRect.height,
          left: overlayRect.left,
          top: overlayRect.top
        },
        dialog: {
          width: dialogRect.width,
          height: dialogRect.height,
          overflow: getComputedStyle(dialog).overflow,
          bodyOverflowY: getComputedStyle(body).overflowY
        },
        actionLabels: actionButtons.map((button) => button.textContent.trim()),
        actionTops: actionRects.map((rect) => rect.top),
        actionHeights: actionRects.map((rect) => rect.height),
        secondaryWidths: actionRects.slice(1, 3).map((rect) => rect.width),
        actionDisplay: getComputedStyle(detailActions).display,
        actionWidth: detailActions.getBoundingClientRect().width,
        deleteDisabled: document.querySelector('.campaign-delete-confirm').disabled,
        documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
  } finally {
    await page.close();
  }
}

try {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 }
  ]) {
    const metrics = await layoutMetrics(viewport);
    assert.equal(metrics.overlay.position, 'fixed');
    assert.equal(metrics.overlay.display, 'grid');
    assert.notEqual(metrics.overlay.backgroundColor, 'rgba(0, 0, 0, 0)');
    assert.ok(Math.abs(metrics.overlay.left) < 0.1 && Math.abs(metrics.overlay.top) < 0.1);
    assert.ok(Math.abs(metrics.overlay.width - viewport.width) < 0.1);
    assert.ok(Math.abs(metrics.overlay.height - viewport.height) < 0.1);
    assert.ok(metrics.dialog.width <= viewport.width - 20);
    assert.ok(metrics.dialog.height <= viewport.height - 20);
    assert.equal(metrics.dialog.overflow, 'hidden');
    assert.equal(metrics.dialog.bodyOverflowY, 'auto');
    assert.deepEqual(metrics.actionLabels, ['Continue', 'Save Game', 'Load Game', '']);
    if (viewport.width <= 640) {
      assert.ok(Math.abs(metrics.actionTops[0] - metrics.actionTops[3]) < 0.1, `${viewport.width}px Continue/delete row`);
      assert.ok(Math.abs(metrics.actionTops[1] - metrics.actionTops[2]) < 0.1, `${viewport.width}px Save/Load row`);
      assert.ok(metrics.actionTops[1] > metrics.actionTops[0], `${viewport.width}px intentional second row`);
      assert.ok(Math.abs(metrics.secondaryWidths[0] - metrics.secondaryWidths[1]) < 0.1, `${viewport.width}px equal Save/Load widths`);
      assert.ok(Math.min(...metrics.actionHeights) >= 44, `${viewport.width}px touch targets`);
    } else {
      assert.equal(new Set(metrics.actionTops.map((top) => Math.round(top))).size, 1, `${viewport.width}px desktop action row`);
    }
    assert.equal(metrics.deleteDisabled, false);
    assert.equal(metrics.documentOverflowX, false);
  }
} finally {
  await browser.close();
}

console.log('Campaign delete layout tests passed.');
