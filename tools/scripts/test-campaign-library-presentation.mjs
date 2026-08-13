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
            <aside class="campaign-master campaign-index-panel campaign-desktop-master" data-directive-scroll-owner="true">
              <header class="campaign-index-head"><span class="campaign-kicker">Story library</span><h2>Campaigns</h2></header>
              <div class="campaign-index-list">
                <button type="button" class="campaign-row campaign-library-row" data-campaign-availability="coming-later" aria-pressed="true">
                  <figure class="directive-media-frame"><img class="directive-media-image" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='640'/%3E"></figure>
                  <div class="campaign-row-copy"><strong>Drowned Constellation</strong><span class="campaign-row-description">Current approved campaign description.</span></div>
                </button>
              </div>
            </aside>
            <section class="campaign-detail campaign-desktop-detail" data-directive-scroll-owner="true">
              <section class="campaign-hero campaign-library-hero directive-responsive-hero is-coming-later" data-campaign-availability="coming-later">
                <figure class="campaign-hero-media directive-media-frame"><img class="directive-media-image" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'/%3E"></figure>
                <div class="campaign-hero-copy"><span class="campaign-status">Coming later</span><h2>Drowned Constellation</h2></div>
              </section>
              <div class="campaign-library-detail-body">
                <p class="campaign-summary campaign-library-description">Current approved campaign description.</p>
                <div class="campaign-facts campaign-library-facts">
                  <div class="campaign-fact"><span>Era</span><strong>2373, Dominion War</strong></div>
                  <div class="campaign-fact"><span>Theater</span><strong>Nerine Reef</strong></div>
                  <div class="campaign-fact"><span>Assignment</span><strong>U.S.S. Glass Harbor, Steamrunner-class</strong></div>
                  <div class="campaign-fact"><span>Your Role</span><strong>Commander, Executive Officer</strong></div>
                </div>
                <button type="button" class="campaign-command campaign-command-primary" disabled><span>New campaign</span></button>
              </div>
            </section>
            <section class="campaign-mobile-accordion" data-directive-scroll-owner="true">
              <article class="campaign-mobile-record">
                <button type="button" class="campaign-row campaign-mobile-trigger" data-campaign-availability="coming-later" aria-expanded="true" aria-controls="campaign-mobile-fixture-detail">
                  <figure class="directive-media-frame"><img class="directive-media-image" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='640'/%3E"></figure>
                  <div class="campaign-row-copy"><strong>Drowned Constellation</strong><span class="campaign-row-description">Current approved campaign description.</span></div>
                </button>
                <div id="campaign-mobile-fixture-detail" class="campaign-mobile-detail">
                  <section class="campaign-hero campaign-library-hero directive-responsive-hero is-coming-later" data-campaign-availability="coming-later">
                    <figure class="campaign-hero-media directive-media-frame"><img class="directive-media-image" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'/%3E"></figure>
                    <div class="campaign-hero-copy"><span class="campaign-status">Coming later</span><h2>Drowned Constellation</h2></div>
                  </section>
                  <div class="campaign-library-detail-body">
                    <p class="campaign-summary campaign-library-description">Current approved campaign description.</p>
                    <div class="campaign-facts campaign-library-facts">
                      <div class="campaign-fact"><span>Era</span><strong>2373, Dominion War</strong></div>
                      <div class="campaign-fact"><span>Theater</span><strong>Nerine Reef</strong></div>
                      <div class="campaign-fact"><span>Assignment</span><strong>U.S.S. Glass Harbor, Steamrunner-class</strong></div>
                      <div class="campaign-fact"><span>Your Role</span><strong>Commander, Executive Officer</strong></div>
                    </div>
                    <button type="button" class="campaign-command campaign-command-primary" disabled><span>New campaign</span></button>
                  </div>
                </div>
              </article>
            </section>
          </div>
        </main>
      </section>
    `);
    const metrics = await page.evaluate(() => {
      const mobile = window.innerWidth <= 640;
      const journal = document.querySelector('.campaign-journal');
      const row = document.querySelector(mobile ? '.campaign-mobile-trigger' : '.campaign-desktop-master .campaign-row');
      const detail = document.querySelector(mobile ? '.campaign-mobile-detail' : '.campaign-desktop-detail');
      const scrollOwner = document.querySelector(mobile ? '.campaign-mobile-accordion' : '.campaign-desktop-detail');
      const art = row.querySelector('.directive-media-frame');
      const rowStyle = getComputedStyle(row);
      const artStyle = getComputedStyle(art);
      const rowTitleStyle = getComputedStyle(row.querySelector('strong'));
      const rowDescriptionStyle = getComputedStyle(row.querySelector('.campaign-row-description'));
      const heroArt = detail.querySelector('.campaign-hero-media');
      const heroArtStyle = getComputedStyle(heroArt);
      const heroCopyStyle = getComputedStyle(detail.querySelector('.campaign-hero-copy'));
      const action = detail.querySelector('.campaign-command-primary');
      const artBox = art.getBoundingClientRect();
      const facts = detail.querySelector('.campaign-library-facts');
      const hero = detail.querySelector('.campaign-library-hero');
      const heroHeight = hero.getBoundingClientRect().height;
      hero.style.transition = 'none';
      hero.classList.add('is-expanded');
      const expandedHeroHeight = hero.getBoundingClientRect().height;
      scrollOwner.scrollTop = scrollOwner.scrollHeight;
      const detailBox = scrollOwner.getBoundingClientRect();
      const actionBox = action.getBoundingClientRect();
      return {
        columns: mobile ? 1 : getComputedStyle(journal).gridTemplateColumns.split(' ').filter(Boolean).length,
        desktopVisible: document.querySelector('.campaign-desktop-master').getClientRects().length > 0,
        mobileVisible: document.querySelector('.campaign-mobile-accordion').getClientRects().length > 0,
        rowOpacity: Number(rowStyle.opacity),
        rowFilter: rowStyle.filter,
        artFilter: artStyle.filter,
        rowTitleOpacity: Number(rowTitleStyle.opacity),
        rowDescriptionOpacity: Number(rowDescriptionStyle.opacity),
        heroArtOpacity: Number(heroArtStyle.opacity),
        heroArtFilter: heroArtStyle.filter,
        heroCopyOpacity: Number(heroCopyStyle.opacity),
        descriptionInsideHero: Boolean(detail.querySelector('.campaign-hero .campaign-library-description')),
        factColumns: getComputedStyle(facts).gridTemplateColumns.split(' ').filter(Boolean).length,
        factValueWhiteSpace: getComputedStyle(facts.querySelector('strong')).whiteSpace,
        heroHeight,
        expandedHeroHeight,
        actionAfterFacts: Boolean(detail.querySelector('.campaign-library-facts + .campaign-command-primary')),
        detailOverflowY: getComputedStyle(scrollOwner).overflowY,
        actionReachableAfterScroll: actionBox.top >= detailBox.top - .5 && actionBox.bottom <= detailBox.bottom + .5,
        actionDisabled: action.disabled,
        artWidth: artBox.width,
        artHeight: artBox.height,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    assert.equal(metrics.columns, viewport.width <= 640 ? 1 : 2, `${viewport.width}px Campaign master/detail columns`);
    assert.equal(metrics.desktopVisible, viewport.width > 640, `${viewport.width}px desktop Campaign composition visibility`);
    assert.equal(metrics.mobileVisible, viewport.width <= 640, `${viewport.width}px mobile Campaign composition visibility`);
    assert.equal(metrics.rowOpacity, 1, `${viewport.width}px Campaign library row must remain full strength`);
    assert.equal(metrics.rowFilter, 'none', `${viewport.width}px Campaign library row container must remain unfiltered`);
    assert.match(metrics.artFilter, /grayscale\(1\)/, `${viewport.width}px future Campaign row art must be grayscale`);
    assert.ok(metrics.rowTitleOpacity < 1, `${viewport.width}px future Campaign row title must be dimmed`);
    assert.ok(metrics.rowDescriptionOpacity < 1, `${viewport.width}px future Campaign row description must be dimmed`);
    assert.ok(metrics.heroArtOpacity <= .5, `${viewport.width}px future Campaign detail art must be greyed`);
    assert.match(metrics.heroArtFilter, /grayscale\(1\)/, `${viewport.width}px future Campaign detail art must be grayscale`);
    assert.equal(metrics.heroCopyOpacity, 1, `${viewport.width}px future Campaign detail copy must remain full strength`);
    assert.equal(metrics.descriptionInsideHero, false, `${viewport.width}px description must remain below the Campaign hero`);
    assert.equal(metrics.factColumns, viewport.width <= 640 ? 2 : 4, `${viewport.width}px Campaign fact columns`);
    assert.equal(metrics.factValueWhiteSpace, 'normal', `${viewport.width}px Campaign fact values must wrap`);
    assert.equal(metrics.heroHeight, viewport.width <= 640 ? 112 : 140, `${viewport.width}px collapsed Campaign hero height`);
    assert.equal(metrics.expandedHeroHeight, viewport.width <= 640 ? 220 : 280, `${viewport.width}px expanded Campaign hero height`);
    assert.equal(metrics.actionAfterFacts, true, `${viewport.width}px Campaign action must follow facts`);
    assert.match(metrics.detailOverflowY, /auto|scroll/, `${viewport.width}px Campaign detail must own local scrolling`);
    assert.equal(metrics.actionReachableAfterScroll, true, `${viewport.width}px Campaign action must be reachable inside the detail scroller`);
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

const comingLater = nodes.filter((node) => (
  node.dataset.campaignAvailability === 'coming-later'
  && node.dataset.campaignRecordKey
));
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
