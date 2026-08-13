import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 55000 + (process.pid % 9000);
const baseUrl = `http://127.0.0.1:${port}`;
const artifactRoot = path.join(repoRoot, 'artifacts', 'mobile-route-accordions');
const routes = {
  campaign: {
    accordion: '.campaign-mobile-accordion',
    desktopMaster: '.campaign-desktop-master',
    desktopDetail: '.campaign-desktop-detail',
    indexHead: '.campaign-index-head'
  },
  mission: {
    accordion: '.mission-mobile-accordion',
    desktopMaster: '.mission-desktop-collection',
    desktopDetail: '.mission-desktop-detail',
    indexHead: '.mission-index-head'
  }
};

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/production?route=campaign`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Preview server did not start.');
}

const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) },
  stdio: ['ignore', 'ignore', 'inherit']
});
const browser = await chromium.launch({ headless: true });

try {
  await waitForServer();
  await mkdir(artifactRoot, { recursive: true });

  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 500 }]) {
    for (const [route, selectors] of Object.entries(routes)) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${baseUrl}/production?route=${route}`);
      await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
      const activeNav = page.locator('.directive-route-control.active');
      await activeNav.focus();

      const initial = await page.evaluate((value) => {
        const visible = (node) => Boolean(node?.getClientRects().length) && getComputedStyle(node).display !== 'none';
        const accordion = document.querySelector(value.accordion);
        const expanded = accordion?.querySelector('[aria-expanded="true"]');
        const panel = expanded ? document.getElementById(expanded.getAttribute('aria-controls')) : null;
        const accordionBox = accordion?.getBoundingClientRect();
        const panelBox = panel?.getBoundingClientRect();
        const nav = document.querySelector('.directive-route-control.active');
        const navStyle = getComputedStyle(nav);
        const owners = [...document.querySelectorAll('[data-directive-scroll-owner="true"]')]
          .filter((node) => visible(node) && /(auto|scroll)/.test(`${getComputedStyle(node).overflowX} ${getComputedStyle(node).overflowY}`));
        accordion.dataset.testIdentity = `${value.route}-phone-list`;
        return {
          routeHeadingVisible: visible(document.querySelector('.directive-route-heading')),
          desktopMasterVisible: visible(document.querySelector(value.desktopMaster)),
          desktopDetailVisible: visible(document.querySelector(value.desktopDetail)),
          indexHeadVisible: visible(document.querySelector(value.indexHead)),
          accordionVisible: visible(accordion),
          ownerCount: owners.length,
          accordionOwnsScroll: owners[0] === accordion,
          expandedCount: accordion?.querySelectorAll('[aria-expanded="true"]').length || 0,
          panelVisible: visible(panel),
          panelWidthRatio: panelBox && accordionBox ? panelBox.width / accordionBox.width : 0,
          navOutline: navStyle.outlineStyle,
          navOutlineWidth: navStyle.outlineWidth,
          navShadow: navStyle.boxShadow,
          navBackground: navStyle.backgroundColor,
          navBorderBottom: navStyle.borderBottomColor,
          documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          documentOverflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight
        };
      }, { ...selectors, route });

      assert.equal(initial.routeHeadingVisible, false, `${route} ${viewport.width}px repeated route heading`);
      assert.equal(initial.desktopMasterVisible, false, `${route} ${viewport.width}px desktop master must be hidden`);
      assert.equal(initial.desktopDetailVisible, false, `${route} ${viewport.width}px desktop detail must be hidden`);
      assert.equal(initial.indexHeadVisible, false, `${route} ${viewport.width}px redundant index header`);
      assert.equal(initial.accordionVisible, true, `${route} ${viewport.width}px phone list`);
      assert.equal(initial.ownerCount, 1, `${route} ${viewport.width}px visible scroll owners`);
      assert.equal(initial.accordionOwnsScroll, true, `${route} ${viewport.width}px phone list must own scrolling`);
      assert.equal(initial.expandedCount, 1, `${route} ${viewport.width}px default-open record`);
      assert.equal(initial.panelVisible, true, `${route} ${viewport.width}px default detail`);
      assert.ok(initial.panelWidthRatio >= .98, `${route} ${viewport.width}px detail must use list width`);
      assert.equal(initial.navOutline, 'none', `${route} ${viewport.width}px active nav outline`);
      assert.ok(initial.navOutlineWidth === '0px' || initial.navOutlineWidth === '', `${route} ${viewport.width}px active nav outline width`);
      assert.equal(initial.navShadow, 'none', `${route} ${viewport.width}px active nav inset ring`);
      assert.match(initial.navBackground, /^rgb\(/, `${route} ${viewport.width}px active nav must have a solid fill`);
      assert.match(initial.navBorderBottom, /rgba\([^)]*, 0\)|transparent/, `${route} ${viewport.width}px active nav border ring`);
      assert.equal(initial.documentOverflowX, false, `${route} ${viewport.width}px document overflow-x`);
      assert.equal(initial.documentOverflowY, false, `${route} ${viewport.width}px document overflow-y`);

      const toggled = await page.evaluate((value) => {
        const accordion = document.querySelector(value.accordion);
        const identity = accordion.dataset.testIdentity;
        const trigger = accordion.querySelector('[aria-expanded="true"]');
        trigger.focus();
        trigger.click();
        return {
          sameList: document.querySelector(value.accordion) === accordion,
          identity: accordion.dataset.testIdentity,
          expandedCount: accordion.querySelectorAll('[aria-expanded="true"]').length,
          focusRetained: document.activeElement === trigger
        };
      }, selectors);
      assert.equal(toggled.sameList, true, `${route} ${viewport.width}px disclosure list identity`);
      assert.equal(toggled.identity, `${route}-phone-list`, `${route} ${viewport.width}px disclosure list marker`);
      assert.equal(toggled.expandedCount, 0, `${route} ${viewport.width}px collapse-all`);
      assert.equal(toggled.focusRetained, true, `${route} ${viewport.width}px disclosure focus`);

      await page.screenshot({ path: path.join(artifactRoot, `${route}-${viewport.width}x${viewport.height}.png`) });
      await page.close();
    }
  }

  for (const [route, selectors] of Object.entries(routes)) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.goto(`${baseUrl}/production?route=${route}`);
    await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
    const desktop = await page.evaluate((value) => {
      const visible = (node) => Boolean(node?.getClientRects().length) && getComputedStyle(node).display !== 'none';
      const owners = [...document.querySelectorAll('[data-directive-scroll-owner="true"]')]
        .filter((node) => visible(node) && /(auto|scroll)/.test(`${getComputedStyle(node).overflowX} ${getComputedStyle(node).overflowY}`));
      return {
        routeHeadingVisible: visible(document.querySelector('.directive-route-heading')),
        desktopMasterVisible: visible(document.querySelector(value.desktopMaster)),
        desktopDetailVisible: visible(document.querySelector(value.desktopDetail)),
        indexHeadVisible: visible(document.querySelector(value.indexHead)),
        accordionVisible: visible(document.querySelector(value.accordion)),
        ownerCount: owners.length
      };
    }, selectors);
    assert.equal(desktop.routeHeadingVisible, true, `${route} desktop route heading must remain`);
    assert.equal(desktop.desktopMasterVisible, true, `${route} desktop master must remain`);
    assert.equal(desktop.desktopDetailVisible, true, `${route} desktop detail must remain`);
    assert.equal(desktop.indexHeadVisible, true, `${route} desktop index header must remain`);
    assert.equal(desktop.accordionVisible, false, `${route} desktop phone list must be hidden`);
    assert.equal(desktop.ownerCount, 2, `${route} desktop scroll ownership must remain`);
    await page.close();
  }

  console.log('PASS mobile Campaign and Mission accordions');
} finally {
  await browser.close();
  server.kill();
}
