import assert from 'node:assert/strict';
import fs from 'node:fs';

import { chromium } from 'playwright';

import { V1_CAMPAIGN_LIBRARY_TEASERS } from '../../src/packages/bundled-package-registry.mjs';
import { renderCampaignPanel } from '../../src/ui/campaign-panel.js';

const css = fs.readFileSync(new URL('../../styles/directive.css', import.meta.url), 'utf8');
const svg = (width, height) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`)}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 680, height: 900 } });
  await page.setContent(`
    <style>${css}</style>
    <div class="directive-expanded-shell">
      <figure id="square" class="directive-media-frame directive-v1-campaign-media" style="width:320px"><img src="${svg(640, 640)}"></figure>
      <figure id="wide" class="directive-media-frame directive-v1-campaign-media" style="width:320px"><img src="${svg(960, 540)}"></figure>
      <article class="directive-v1-campaign-package" style="width:640px">
        <figure id="tablet" class="directive-media-frame directive-v1-campaign-media"><img src="${svg(640, 640)}"></figure>
        <div class="directive-v1-campaign-package-copy">
          <p id="control">Ordinary campaign copy.</p>
          <p id="hook" class="directive-v1-campaign-hook">A four-sentence campaign hook occupies enough lines to make the copy column taller than its image. Its cover must retain the shared ratio. The typography remains compact and readable. The card must not stretch the artwork.</p>
        </div>
      </article>
    </div>
  `);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  const metrics = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { width: box.width, height: box.height };
    };
    const hook = getComputedStyle(document.querySelector('#hook'));
    const control = getComputedStyle(document.querySelector('#control'));
    return {
      square: rect('#square'),
      wide: rect('#wide'),
      tablet: rect('#tablet'),
      fits: [...document.querySelectorAll('.directive-v1-campaign-media img')].map((image) => getComputedStyle(image).objectFit),
      hookFont: Number.parseFloat(hook.fontSize),
      controlFont: Number.parseFloat(control.fontSize),
      hookLineHeight: Number.parseFloat(hook.lineHeight)
    };
  });

  assert.equal(metrics.square.height, metrics.wide.height, 'intrinsic image ratios must not change cover height');
  assert.ok(Math.abs(metrics.square.width / metrics.square.height - 16 / 9) < 0.01, 'campaign covers must render at 16:9');
  assert.ok(
    Math.abs(metrics.tablet.width / metrics.tablet.height - 16 / 9) < 0.01,
    `two-column cards must retain the shared cover ratio: ${JSON.stringify(metrics.tablet)}`
  );
  assert.deepEqual(metrics.fits, ['cover', 'cover', 'cover']);
  assert.ok(metrics.hookFont < metrics.controlFont, 'campaign hook type must be smaller than ordinary card copy');
  assert.ok(metrics.hookLineHeight > metrics.hookFont, 'campaign hooks must retain readable line spacing');
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
