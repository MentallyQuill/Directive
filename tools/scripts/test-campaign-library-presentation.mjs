import assert from 'node:assert/strict';
import fs from 'node:fs';

import { chromium } from 'playwright';

import { V1_CAMPAIGN_LIBRARY_TEASERS } from '../../src/packages/bundled-package-registry.mjs';
import { renderCampaignPanel } from '../../src/ui/campaign-panel.js';

const css = fs.readFileSync(new URL('../../styles/directive.css', import.meta.url), 'utf8');
const svg = (width, height) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`)}`;
const browser = await chromium.launch({ headless: true });

async function layoutMetrics(viewport) {
  const page = await browser.newPage({ viewport });
  try {
    await page.setContent(`
      <style>${css}</style>
      <div class="directive-expanded-shell">
        <div class="directive-v1-campaign-packages" style="width:min(900px, calc(100vw - 32px))">
          <article class="directive-v1-campaign-package">
            <figure class="directive-media-frame directive-v1-campaign-media"><img src="${svg(640, 640)}"></figure>
            <div class="directive-v1-campaign-package-copy">
              <p class="directive-v1-campaign-hook">A four-sentence campaign hook occupies enough lines to make the copy column taller than its image. Its cover must retain the shared ratio. The typography remains compact and readable. The card must not stretch or clip the artwork.</p>
            </div>
          </article>
          <article class="directive-v1-campaign-package">
            <figure class="directive-media-frame directive-v1-campaign-media"><img src="${svg(960, 540)}"></figure>
            <div class="directive-v1-campaign-package-copy">
              <p class="directive-v1-campaign-hook">A second four-sentence campaign hook verifies the widescreen source. Its cover must match the square source. The typography remains compact and readable. The card must not stretch or clip the artwork.</p>
            </div>
          </article>
        </div>
      </div>
    `);
    await page.waitForFunction(() => [...document.images].every((image) => image.complete));
    return await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.directive-v1-campaign-package')];
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        covers: cards.map((card) => {
          const box = card.querySelector('.directive-v1-campaign-media').getBoundingClientRect();
          return { width: box.width, height: box.height };
        }),
        fits: cards.map((card) => getComputedStyle(card.querySelector('img')).objectFit),
        hooks: cards.map((card) => {
          const hook = card.querySelector('.directive-v1-campaign-hook');
          const style = getComputedStyle(hook);
          return {
            fontSize: Number.parseFloat(style.fontSize),
            lineHeight: Number.parseFloat(style.lineHeight),
            lineClamp: style.webkitLineClamp,
            overflowMode: style.overflow,
            overflow: hook.scrollHeight > hook.clientHeight + 1
          };
        }),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
  } finally {
    await page.close();
  }
}

try {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 680, height: 900 },
    { width: 390, height: 844 }
  ]) {
    const metrics = await layoutMetrics(viewport);
    assert.ok(
      Math.abs(metrics.covers[0].height - metrics.covers[1].height) < 0.1,
      `${viewport.width}px intrinsic image ratios must not change cover height`
    );
    for (const cover of metrics.covers) {
      assert.ok(
        Math.abs(cover.width / cover.height - 16 / 9) < 0.01,
        `${viewport.width}px campaign cover must render at 16:9: ${JSON.stringify(cover)}`
      );
    }
    assert.deepEqual(metrics.fits, ['cover', 'cover']);
    for (const hook of metrics.hooks) {
      assert.ok(Math.abs(hook.fontSize - 13.12) < 0.01, `${viewport.width}px hook font must compute to 0.82rem`);
      assert.ok(Math.abs(hook.lineHeight - 18.368) < 0.01, `${viewport.width}px hook line height must compute to 1.4`);
      assert.equal(hook.overflow, false, `${viewport.width}px hook text must remain unclipped`);
      assert.notEqual(hook.overflowMode, 'hidden', `${viewport.width}px hook text must remain unclamped`);
      assert.ok(hook.lineClamp === 'none' || hook.lineClamp === '', `${viewport.width}px hook text must not use a line clamp`);
    }
    assert.equal(metrics.overflowX, false, `${viewport.width}px campaign grid must not overflow horizontally`);
  }
} finally {
  await browser.close();
}

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.classList = {
      add: (...names) => {
        const values = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => values.add(name));
        this.className = [...values].join(' ');
      }
    };
  }

  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
}

globalThis.document = {
  createElement: (tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text })
};

const body = new Element('div');
renderCampaignPanel(body, {
  campaign: { packages: V1_CAMPAIGN_LIBRARY_TEASERS },
  campaignIndex: { campaigns: [] }
});
const nodes = [];
const visit = (node) => {
  nodes.push(node);
  node.children?.forEach(visit);
};
visit(body);
assert.equal(
  nodes.filter((node) => node.tagName === 'p' && /directive-v1-campaign-hook/.test(node.className)).length,
  6,
  'every rendered campaign package must expose the scoped hook class'
);

console.log('PASS campaign library presentation');
