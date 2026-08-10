import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

import { V1_CAMPAIGN_LIBRARY_TEASERS } from '../../src/packages/bundled-package-registry.mjs';
import { renderCampaignPanel, resetCampaignPanelState } from '../../src/ui/campaign-panel.js';

const css = fs.readFileSync(new URL('../../styles/directive.css', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 680, height: 900 },
    { width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport });
    await page.setContent(`
      <style>${css}</style>
      <section class="directive-runtime-panel directive-expanded-shell" style="position:relative!important;inset:auto!important;width:100%!important;height:760px!important;margin:0!important">
        <main class="directive-route-body">
          <div class="directive-expanded-campaign campaign-layout campaign-journal">
            <aside class="campaign-master campaign-index-panel" data-directive-scroll-owner="true">
              <header class="campaign-index-head"><span class="campaign-kicker">Story library</span><h2>Campaigns</h2></header>
              <div class="campaign-index-list">
                <button type="button" class="campaign-row campaign-library-row" data-campaign-availability="coming-later" aria-pressed="true">
                  <figure class="directive-media-frame"><img class="directive-media-image" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='640'/%3E"></figure>
                  <div class="campaign-row-copy"><strong>Drowned Constellation</strong><span class="campaign-row-description">Current approved campaign description.</span></div>
                </button>
              </div>
            </aside>
            <section class="campaign-detail" data-directive-scroll-owner="true">
              <section class="campaign-hero campaign-library-hero is-coming-later" data-campaign-availability="coming-later">
                <figure class="campaign-hero-media directive-media-frame"><img class="directive-media-image" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'/%3E"></figure>
                <div class="campaign-hero-copy"><span class="campaign-status">Coming later</span><h2>Drowned Constellation</h2><p class="campaign-summary">Current approved campaign description.</p></div>
              </section>
              <button type="button" class="campaign-command campaign-command-primary" disabled><span>New campaign</span></button>
            </section>
          </div>
        </main>
      </section>
    `);
    const metrics = await page.evaluate(() => {
      const journal = document.querySelector('.campaign-journal');
      const row = document.querySelector('.campaign-row');
      const art = row.querySelector('.directive-media-frame');
      const rowStyle = getComputedStyle(row);
      const heroArt = document.querySelector('.campaign-hero-media');
      const heroArtStyle = getComputedStyle(heroArt);
      const action = document.querySelector('.campaign-command-primary');
      const artBox = art.getBoundingClientRect();
      return {
        columns: getComputedStyle(journal).gridTemplateColumns.split(' ').filter(Boolean).length,
        rowOpacity: Number(rowStyle.opacity),
        rowFilter: rowStyle.filter,
        heroArtOpacity: Number(heroArtStyle.opacity),
        heroArtFilter: heroArtStyle.filter,
        actionDisabled: action.disabled,
        artWidth: artBox.width,
        artHeight: artBox.height,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    assert.equal(metrics.columns, viewport.width <= 640 ? 1 : 2, `${viewport.width}px Campaign master/detail columns`);
    assert.equal(metrics.rowOpacity, 1, `${viewport.width}px Campaign library row must remain full strength`);
    assert.equal(metrics.rowFilter, 'none', `${viewport.width}px Campaign library row must remain full color`);
    assert.ok(metrics.heroArtOpacity <= .5, `${viewport.width}px future Campaign detail art must be greyed`);
    assert.match(metrics.heroArtFilter, /grayscale\(1\)/, `${viewport.width}px future Campaign detail art must be grayscale`);
    assert.equal(metrics.actionDisabled, true, `${viewport.width}px New campaign must remain disabled`);
    assert.ok(Math.abs(metrics.artWidth - metrics.artHeight) < .1, `${viewport.width}px Campaign row art must remain square`);
    assert.equal(metrics.overflowX, false, `${viewport.width}px Campaign route must not overflow horizontally`);
    await page.close();
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
    this.textContent = '';
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
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
}

globalThis.document = {
  createElement: (tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text })
};

const body = new Element('div');
resetCampaignPanelState();
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

const comingLater = nodes.filter((node) => node.dataset.campaignAvailability === 'coming-later');
assert.equal(comingLater.length, V1_CAMPAIGN_LIBRARY_TEASERS.length - 1);
const subtreeText = (root) => {
  const values = [];
  const collect = (node) => {
    values.push(node.textContent || '');
    node.children?.forEach(collect);
  };
  collect(root);
  return values.join(' ');
};
for (const row of comingLater) {
  assert.equal(row.tagName, 'button');
  assert.equal(row.attributes.has('aria-disabled'), false);
  assert.equal(row.listeners.has('click'), true);
  assert.doesNotMatch(subtreeText(row), /Coming later/i);
}
for (const teaser of V1_CAMPAIGN_LIBRARY_TEASERS.slice(1)) {
  assert.ok(nodes.some((node) => node.textContent === teaser.campaign.highConcept), `${teaser.title} must retain current description`);
}

console.log('PASS campaign library presentation');
