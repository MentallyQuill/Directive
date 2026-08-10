import assert from 'node:assert/strict';
import fs from 'node:fs';

import { chromium } from 'playwright';

const css = fs.readFileSync(new URL('../../styles/directive.css', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });

async function layoutMetrics(viewport, { reducedMotion = 'no-preference', pageZoom = 1 } = {}) {
  const page = await browser.newPage({ viewport });
  try {
    await page.emulateMedia({ reducedMotion });
    await page.setContent(`
      <style>${css}</style>
      <section id="directive-runtime-panel" class="directive-runtime-panel directive-expanded-shell">
        <aside class="directive-lcars-rail"></aside>
        <main class="directive-workspace">
          <header class="directive-topbar"><div class="directive-brand">DIRECTIVE</div></header>
          <div class="directive-route-heading"><span class="directive-route-cap"></span><div class="directive-route-name">Campaign</div></div>
          <section class="directive-runtime-body directive-route-body">
            <form class="directive-creator-form directive-creator-console directive-lcars-console directive-lcars-panel" data-creator-active-step="review" data-directive-scroll-owner="true">
              <section class="directive-creator-overview directive-lcars-panel"><div class="directive-creator-overview-media-deck"><div class="directive-creator-overview-media"></div><div class="directive-creator-player-portrait"></div></div><div class="directive-creator-overview-copy"><span class="directive-lcars-kicker">Starfleet Personnel Command</span><h3 class="directive-card-title">Commissioning File</h3><p class="directive-creator-overview-summary">Commander, Executive Officer</p></div></section>
              <header class="directive-creator-progress-header">
                <span class="directive-lcars-kicker">Commissioning Steps</span>
                <span>Complete each personnel section</span>
              </header>
              <nav class="directive-step-row directive-creator-step-row">
                <button class="directive-step-button directive-creator-step-button"><span>Identity</span><span class="directive-creator-step-state">Complete</span></button>
                <button class="directive-step-button directive-creator-step-button"><span>Service</span><span class="directive-creator-step-state">Complete</span></button>
                <button class="directive-step-button directive-creator-step-button"><span>Personality</span><span class="directive-creator-step-state">Complete</span></button>
                <button class="directive-step-button directive-creator-step-button directive-step-button-active"><span>Review</span><span class="directive-creator-step-state">Current</span></button>
              </nav>
              <div class="directive-action-row directive-creator-command-bar directive-lcars-panel">
                <button class="directive-button directive-creator-command-button directive-creator-route-exit-command">Campaign Library</button>
                <button class="directive-button directive-creator-command-button">Save Draft</button>
                <button class="directive-button directive-creator-command-button">Back</button>
                <button class="directive-button directive-creator-command-button">Next</button>
                <button class="directive-button directive-creator-command-button">Discard</button>
              </div>
              <section class="directive-form-section directive-creator-section directive-creator-section-active" data-creator-step="review">
                <div class="directive-creator-section-header">
                  <div class="directive-creator-section-heading-copy"><h3 class="directive-creator-section-title">Review</h3><p class="directive-creator-section-summary">Dossier and campaign readiness</p></div>
                  <span class="directive-creator-section-assist-control"><span class="directive-creator-assist-busy-spinner"></span><button class="directive-icon-button directive-creator-section-wand">Assist</button></span>
                </div>
                <section class="directive-creator-difficulty-field directive-lcars-panel">
                  <div class="directive-creator-difficulty-top">
                    <header class="directive-creator-difficulty-header">
                      <div class="directive-creator-difficulty-heading-copy"><span class="directive-lcars-kicker">Campaign Setup</span><h4 class="directive-creator-difficulty-title">Campaign Difficulty</h4><p class="directive-creator-difficulty-lead">Choose how hard future consequences can land in this campaign.</p></div>
                    </header>
                    <div class="directive-creator-difficulty-options" role="radiogroup">
                      <button class="directive-creator-difficulty-option" role="radio"><strong>Exploration</strong><span class="directive-creator-difficulty-option-badge">Story-forward</span></button>
                      <button class="directive-creator-difficulty-option directive-creator-difficulty-option-active" role="radio"><strong>Command</strong><span class="directive-creator-difficulty-option-badge">Full Simulation</span></button>
                    </div>
                  </div>
                  <div class="directive-creator-difficulty-body">
                    <article class="directive-creator-difficulty-summary">
                      <span class="directive-lcars-kicker">Selected Mode Summary</span>
                      <div class="directive-creator-difficulty-summary-heading"><strong class="directive-creator-difficulty-summary-title">Command</strong><span class="directive-creator-difficulty-summary-badge">Full Simulation</span><span class="directive-creator-difficulty-fatality">Full causal severity</span></div>
                      <p class="directive-creator-difficulty-summary-copy">Directive preserves full causal severity. Serious failure can include severe or fatal outcomes when the risk is established, but the system must stay fair and cannot invent unsupported harm.</p>
                      <p class="directive-creator-difficulty-best-fit">Choose this for the complete command simulation, where serious risk can produce serious consequences.</p>
                    </article>
                  </div>
                </section>
                <label class="directive-form-field"><span class="directive-field-label">Brief Biography</span><textarea class="directive-field-control">A long biography that remains available inside its own field without increasing the height of the Review page.</textarea></label>
                <label class="directive-form-field"><span class="directive-field-label">Public Reputation</span><textarea class="directive-field-control">A long reputation that remains available inside its own field without increasing the height of the Review page.</textarea></label>
              </section>
            </form>
          </section>
          <nav class="directive-route-bar"><button class="directive-route-control active">Campaign</button><button class="directive-route-control">Mission</button><button class="directive-route-control">People</button><button class="directive-route-control">Ship</button><button class="directive-route-control">Settings</button></nav>
        </main>
      </section>
      <div id="directive-modal-root" class="directive-modal-root">
        <div class="directive-creator-assist-dialog-overlay" data-creator-assist-state="loading">
          <section class="directive-creator-assist-dialog" role="dialog" aria-modal="true">
            <header class="directive-creator-assist-dialog-header">
              <h2 class="directive-creator-assist-dialog-title">Refining Identity</h2>
              <button class="directive-creator-assist-dialog-close">×</button>
            </header>
            <div class="directive-creator-assist-dialog-body" data-directive-scroll-owner="true">
              <div class="directive-creator-assist-dialog-loading">
                <span class="directive-creator-assist-dialog-spinner"></span>
                <p class="directive-creator-assist-dialog-progress">Reasoning timed out again. Trying Utility...</p>
              </div>
              <dl class="directive-creator-assist-dialog-field-list">
                <dt class="directive-creator-assist-dialog-field-label">Name</dt>
                <dd class="directive-creator-assist-dialog-field-value">Sam Vickers</dd>
              </dl>
              <div class="directive-creator-assist-dialog-actions"><button class="directive-button">Cancel</button></div>
            </div>
          </section>
        </div>
      </div>
    `);
    if (pageZoom !== 1) {
      await page.evaluate((zoom) => {
        document.body.style.zoom = String(zoom);
      }, pageZoom);
    }
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector('.directive-runtime-panel');
      const overlay = document.querySelector('.directive-creator-assist-dialog-overlay');
      const dialog = document.querySelector('.directive-creator-assist-dialog');
      const spinner = document.querySelector('.directive-creator-assist-dialog-spinner');
      const fieldList = document.querySelector('.directive-creator-assist-dialog-field-list');
      const routeBody = document.querySelector('.directive-route-body');
      const dialogBody = document.querySelector('.directive-creator-assist-dialog-body');
      const form = document.querySelector('.directive-creator-form');
      const review = document.querySelector('[data-creator-step="review"]');
      const difficulty = document.querySelector('.directive-creator-difficulty-field');
      const difficultyTop = document.querySelector('.directive-creator-difficulty-top');
      const summary = document.querySelector('.directive-creator-difficulty-summary');
      const commandBar = document.querySelector('.directive-creator-command-bar');
      const stepButtons = [...document.querySelectorAll('.directive-creator-step-button')];
      const textareas = [...review.querySelectorAll('textarea.directive-field-control')];
      const difficultyOptions = [...document.querySelectorAll('.directive-creator-difficulty-option')];
      const overlayStyle = getComputedStyle(overlay);
      const dialogStyle = getComputedStyle(dialog);
      const dialogBodyStyle = getComputedStyle(dialogBody);
      const routeBodyStyle = getComputedStyle(routeBody);
      const spinnerStyle = getComputedStyle(spinner);
      const commandStyle = getComputedStyle(commandBar);
      const overlayRect = overlay.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const routeBodyRect = routeBody.getBoundingClientRect();
      const formRect = form.getBoundingClientRect();
      const reviewRect = review.getBoundingClientRect();
      const difficultyRect = difficulty.getBoundingClientRect();
      const summaryRect = summary.getBoundingClientRect();
      const commandRect = commandBar.getBoundingClientRect();
      const stepRects = stepButtons.map((button) => button.getBoundingClientRect());
      return {
        viewport: { width: innerWidth, height: innerHeight },
        panel: {
          top: panelRect.top,
          right: panelRect.right,
          bottom: panelRect.bottom,
          left: panelRect.left
        },
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
          overflowY: dialogStyle.overflowY,
          bodyOverflowY: dialogBodyStyle.overflowY,
          titleFont: getComputedStyle(document.querySelector('.directive-creator-assist-dialog-title')).fontFamily
        },
        spinner: {
          display: spinnerStyle.display,
          animationName: spinnerStyle.animationName,
          width: Number.parseFloat(spinnerStyle.width),
          height: Number.parseFloat(spinnerStyle.height)
        },
        fieldGridColumns: getComputedStyle(fieldList).gridTemplateColumns,
        routeBody: {
          bottom: routeBodyRect.bottom,
          clientHeight: routeBody.clientHeight,
          scrollHeight: routeBody.scrollHeight,
          overflowY: routeBodyStyle.overflowY
        },
        form: {
          bottom: formRect.bottom,
          clientHeight: form.clientHeight,
          scrollHeight: form.scrollHeight
        },
        reviewBottom: reviewRect.bottom,
        difficulty: { width: difficultyRect.width },
        difficultyTopColumns: difficultyTop
          ? getComputedStyle(difficultyTop).gridTemplateColumns.trim().split(/\s+/).length
          : 0,
        summary: {
          width: summaryRect.width,
          clientWidth: summary.clientWidth,
          scrollWidth: summary.scrollWidth,
          clientHeight: summary.clientHeight,
          scrollHeight: summary.scrollHeight
        },
        summaryHasFatalityPolicy: Boolean(document.querySelector('.directive-creator-difficulty-fatality')),
        difficultyOptionContentFits: difficultyOptions.every((option) => (
          option.scrollWidth <= option.clientWidth && option.scrollHeight <= option.clientHeight
        )),
        commandPosition: commandStyle.position,
        commandTop: commandRect.top,
        stepsBottom: Math.max(...stepRects.map((rect) => rect.bottom)),
        stepHeights: stepRects.map((rect) => rect.height),
        textareas: textareas.map((textarea) => ({
          overflowY: getComputedStyle(textarea).overflowY,
          resize: getComputedStyle(textarea).resize
        })),
        documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    if (process.env.DIRECTIVE_LAYOUT_SCREENSHOT && viewport.width > 680) {
      await page.evaluate(() => {
        document.querySelector('.directive-creator-assist-dialog-overlay').style.display = 'none';
      });
      await page.screenshot({ path: process.env.DIRECTIVE_LAYOUT_SCREENSHOT });
    }
    return metrics;
  } finally {
    await page.close();
  }
}

try {
  for (const viewport of [
    { width: 1200, height: 1050 },
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
    assert.equal(metrics.dialog.overflowY, 'hidden');
    assert.equal(metrics.dialog.bodyOverflowY, 'auto');
    assert.match(metrics.dialog.titleFont, /Roboto Condensed|Arial Narrow/);
    assert.notEqual(metrics.spinner.display, 'none');
    assert.equal(metrics.spinner.animationName, 'directive-spinner');
    assert.ok(metrics.spinner.width >= 18 && metrics.spinner.height >= 18);
    assert.notEqual(metrics.commandPosition, 'sticky', 'creator command bar must not overlap prior form rows');
    assert.ok(metrics.stepHeights.every((height) => height >= 40), 'commissioning step buttons should retain their minimum height');
    if (viewport.width > 680) {
      assert.equal(metrics.routeBody.overflowY, 'hidden', 'desktop Review route body should not scroll');
      assert.ok(metrics.form.scrollHeight <= metrics.form.clientHeight, 'creator form must not hide overflow below its visible height');
      assert.ok(metrics.reviewBottom <= metrics.routeBody.bottom + 0.5, 'Review content should end above the route navigation');
      assert.ok(metrics.commandTop >= metrics.stepsBottom - 0.5, 'creator command bar must not overlap commissioning controls');
      assert.equal(metrics.difficultyTopColumns, 2, 'difficulty heading and options should share the top row');
      assert.ok(metrics.summary.width >= metrics.difficulty.width - 26, 'selected mode summary should span the difficulty panel');
      assert.ok(metrics.summary.scrollWidth <= metrics.summary.clientWidth, 'selected mode summary content should not clip horizontally');
      assert.ok(metrics.summary.scrollHeight <= metrics.summary.clientHeight, 'selected mode summary content should not clip vertically');
      assert.equal(metrics.summaryHasFatalityPolicy, true, 'selected mode summary should retain fatality policy copy');
      assert.equal(metrics.difficultyOptionContentFits, true, 'difficulty button labels should remain fully visible');
      assert.ok(metrics.textareas.every(({ overflowY, resize }) => overflowY === 'auto' && resize === 'none'), 'Review textareas should scroll internally without resizing');
    } else {
      assert.equal(metrics.routeBody.overflowY, 'hidden', 'mobile Review route body must remain fixed');
      assert.ok(metrics.form.scrollHeight >= metrics.form.clientHeight, 'mobile creator form should own any required overflow');
    }
    assert.equal(metrics.documentOverflowX, false);
    if (viewport.width <= 420) {
      assert.equal(metrics.fieldGridColumns.trim().split(/\s+/).length, 1, 'mobile assist fields should use one column');
    }
  }

  const reducedMotionMetrics = await layoutMetrics({ width: 1200, height: 1050 }, { reducedMotion: 'reduce' });
  assert.equal(reducedMotionMetrics.spinner.animationName, 'none', 'assist spinner should stop for reduced motion');

  const zoomedMetrics = await layoutMetrics(
    { width: 986, height: 952 },
    { pageZoom: 1.25 }
  );
  assert.ok(zoomedMetrics.panel.top >= 0, 'scaled desktop shell must retain its top edge');
  assert.ok(zoomedMetrics.panel.left >= 0, 'scaled desktop shell must retain its left edge');
  assert.ok(zoomedMetrics.panel.right <= zoomedMetrics.viewport.width, 'scaled desktop shell must retain its right edge');
  assert.ok(zoomedMetrics.panel.bottom <= zoomedMetrics.viewport.height, 'scaled desktop shell must retain its bottom edge');
} finally {
  await browser.close();
}

console.log('Character Creator assist layout tests passed.');
