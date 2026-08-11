import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 55836;
const baseUrl = `http://127.0.0.1:${port}`;
const artifactRoot = path.join(repoRoot, 'artifacts', 'expanded-interface-conformance');
const routes = ['campaign', 'mission', 'people', 'ship', 'settings'];
const viewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 360, height: 500 }
];
const requiredSelectors = {
  campaign: ['.campaign-layout', '.campaign-master', '.campaign-detail', '[data-campaign-availability="coming-later"]'],
  mission: ['.mission-layout', '.mission-collection', '.mission-detail', '.mission-objective-row'],
  people: ['.people-route', '.directive-command-bearing-strip', '.people-layout', '.people-roster', '.people-detail'],
  ship: ['.ship-layout', '.ship-hero', '.ship-board', '.ship-operational-status'],
  settings: ['.settings-layout', '.settings-navigation', '.settings-content', '.settings-provider-card']
};
const expectedOwnerCounts = { campaign: 2, mission: 2, people: 2, ship: 1, settings: 1 };
const mobilePanelGeometry = {
  campaign: {
    layout: '.campaign-layout',
    master: '.campaign-master',
    detail: '.campaign-detail',
    heading: '.campaign-hero h2'
  },
  mission: {
    layout: '.mission-layout',
    master: '.mission-collection',
    detail: '.mission-detail',
    heading: '.mission-hero h2'
  },
  people: {
    layout: '.people-layout',
    master: '.people-roster',
    detail: '.people-detail',
    heading: '.people-detail-identity h2'
  }
};

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/reference`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error('Preview server did not start.');
}

const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

const browser = await chromium.launch({ headless: true });
const report = [];
const observedVarianceIds = new Set();

try {
  await waitForServer();
  await mkdir(artifactRoot, { recursive: true });

  const reference = await browser.newPage({ viewport: viewports[0] });
  await reference.goto(`${baseUrl}/reference`);
  await reference.waitForSelector('.directive-screen');
  await reference.screenshot({ path: path.join(artifactRoot, 'reference-certified.png'), fullPage: true });
  await reference.close();

  for (const viewport of viewports) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${baseUrl}/production?route=${route}`);
      await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
      await page.waitForSelector(`.directive-expanded-shell[data-active-route="${route}"]`);
      for (const selector of requiredSelectors[route]) {
        assert.equal(await page.locator(selector).count() > 0, true, `${route} ${viewport.width}px missing ${selector}`);
      }
      assert.deepEqual(errors, [], `${route} ${viewport.width}px page errors`);

      const metrics = await page.evaluate(({ route, ownerCount }) => {
        const shell = document.querySelector('.directive-expanded-shell');
        const workspace = shell.querySelector('.directive-workspace');
        const routeBody = shell.querySelector('.directive-route-body');
        const rect = shell.getBoundingClientRect();
        const owners = [...shell.querySelectorAll('[data-directive-scroll-owner="true"]')];
        const illegal = [...shell.querySelectorAll('*')]
          .filter((node) => {
            const style = getComputedStyle(node);
            return /(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)
              && node.dataset.directiveScrollOwner !== 'true';
          })
          .map((node) => node.className);
        return {
          route,
          shell: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, overflow: getComputedStyle(shell).overflow },
          workspaceOverflow: getComputedStyle(workspace).overflow,
          routeBodyOverflow: getComputedStyle(routeBody).overflow,
          ownerCount: owners.length,
          expectedOwnerCount: ownerCount,
          illegal,
          documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          documentOverflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
          routeFont: getComputedStyle(shell.querySelector('.directive-route-name')).fontFamily
        };
      }, { route, ownerCount: expectedOwnerCounts[route] });

      assert.equal(metrics.shell.overflow, 'hidden');
      assert.equal(metrics.workspaceOverflow, 'hidden');
      assert.equal(metrics.routeBodyOverflow, 'hidden');
      assert.equal(metrics.ownerCount, metrics.expectedOwnerCount, `${route} ${viewport.width}px scroll owners`);
      assert.deepEqual(metrics.illegal, [], `${route} ${viewport.width}px undeclared scroll owners`);
      assert.equal(metrics.documentOverflowX, false, `${route} ${viewport.width}px document overflow-x`);
      assert.equal(metrics.documentOverflowY, false, `${route} ${viewport.width}px document overflow-y`);
      assert.ok(metrics.shell.left >= 0 && metrics.shell.top >= 0);
      assert.ok(metrics.shell.right <= viewport.width + .5 && metrics.shell.bottom <= viewport.height + .5);
      assert.match(metrics.routeFont, /Roboto Condensed|Arial Narrow/);

      if (viewport.width === 360 && [500, 800].includes(viewport.height) && mobilePanelGeometry[route]) {
        const geometry = await page.evaluate((selectors) => {
          const layout = document.querySelector(selectors.layout);
          const master = document.querySelector(selectors.master);
          const detail = document.querySelector(selectors.detail);
          const heading = document.querySelector(selectors.heading);
          const layoutStyle = getComputedStyle(layout);
          const masterBox = master.getBoundingClientRect();
          const detailBox = detail.getBoundingClientRect();
          const headingBox = heading.getBoundingClientRect();
          return {
            routeGap: Number.parseFloat(layoutStyle.rowGap),
            panelGap: detailBox.top - masterBox.bottom,
            masterHeight: masterBox.height,
            detailHeight: detailBox.height,
            headingHeight: headingBox.height,
            headingVisible: headingBox.top >= 0 && headingBox.bottom <= window.innerHeight,
            headingContained: headingBox.top >= detailBox.top - .5 && headingBox.bottom <= detailBox.bottom + .5
          };
        }, mobilePanelGeometry[route]);
        assert.ok(Number.isFinite(geometry.routeGap), `${route} ${viewport.width}x${viewport.height} mobile route gap must resolve to a length`);
        assert.ok(geometry.masterHeight >= 48, `${route} ${viewport.width}x${viewport.height} mobile master must remain usable`);
        assert.ok(geometry.detailHeight >= 80, `${route} ${viewport.width}x${viewport.height} mobile detail must remain usable`);
        assert.ok(geometry.headingHeight > 0 && geometry.headingVisible, `${route} ${viewport.width}x${viewport.height} mobile first detail heading must be visible`);
        assert.equal(geometry.headingContained, true, `${route} ${viewport.width}x${viewport.height} mobile first detail heading must stay inside the clipped detail panel`);
        assert.ok(
          Math.abs(geometry.panelGap - geometry.routeGap) <= .5,
          `${route} ${viewport.width}x${viewport.height} mobile master/detail dead gap: expected ${geometry.routeGap}px route gap, received ${geometry.panelGap}px`
        );
      }

      if (route === 'campaign') {
        const futureRow = page.locator('button[data-campaign-availability="coming-later"]').first();
        const row = await futureRow.evaluate((later) => ({
          ariaDisabled: later.getAttribute('aria-disabled'),
          tagName: later.tagName,
          text: later.textContent,
          description: later.querySelector('.campaign-row-copy span')?.textContent || ''
        }));
        assert.equal(row.ariaDisabled, null);
        assert.equal(row.tagName, 'BUTTON');
        assert.doesNotMatch(row.text, /Coming later/i);
        assert.match(row.description, /Nerine Reef/);

        await futureRow.click();
        await page.waitForSelector('.campaign-library-hero[data-campaign-availability="coming-later"]');
        const campaign = await page.evaluate(() => {
          const detail = document.querySelector('.campaign-library-hero[data-campaign-availability="coming-later"]');
          const art = detail.querySelector('.campaign-hero-media');
          const copy = detail.querySelector('.campaign-hero-copy');
          const action = document.querySelector('.campaign-detail .campaign-command-primary');
          const master = document.querySelector('.campaign-master');
          const selectedRow = document.querySelector('button[data-campaign-availability="coming-later"][aria-pressed="true"]');
          const detailBox = detail.getBoundingClientRect();
          const copyBox = copy.getBoundingClientRect();
          const masterBox = master.getBoundingClientRect();
          const selectedRowBox = selectedRow.getBoundingClientRect();
          return {
            status: detail.querySelector('.campaign-status')?.textContent || '',
            title: detail.querySelector('h2')?.textContent || '',
            description: detail.querySelector('[data-campaign-description]')?.textContent || '',
            artOpacity: Number(getComputedStyle(art).opacity),
            artFilter: getComputedStyle(art).filter,
            copyWithinHero: copyBox.top >= detailBox.top - .5 && copyBox.bottom <= detailBox.bottom + .5,
            selectedRowVisible: selectedRowBox.top >= masterBox.top - .5 && selectedRowBox.bottom <= masterBox.bottom + .5,
            actionDisabled: action?.disabled,
            actionText: action?.textContent || ''
          };
        });
        assert.match(campaign.status, /Coming later/i);
        assert.match(campaign.title, /Drowned Constellation/);
        assert.match(campaign.description, /Nerine Reef/);
        assert.ok(campaign.artOpacity <= .5);
        assert.match(campaign.artFilter, /grayscale\(1\)/);
        assert.equal(campaign.copyWithinHero, true, `${viewport.width}px future Campaign copy must not clip`);
        assert.equal(campaign.selectedRowVisible, true, `${viewport.width}px selected future Campaign row must stay visible`);
        assert.equal(campaign.actionDisabled, true);
        assert.match(campaign.actionText, /New campaign/i);
        observedVarianceIds.add('campaign-coming-later');
        observedVarianceIds.add('campaign-current-descriptions');
      }
      observedVarianceIds.add('bounded-scroll-ownership');

      const name = `${route}-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: path.join(artifactRoot, name) });
      report.push({ viewport, route, metrics, screenshot: name });
      await page.close();
    }
  }

  const modalPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await modalPage.goto(`${baseUrl}/production?route=people`);
  await modalPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const modal = await modalPage.evaluate(async () => {
    const assist = globalThis.__directiveFixtureOpenAssist();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      inert: document.querySelector('.directive-runtime-panel').inert,
      ariaModal: assist.dialog.getAttribute('aria-modal'),
      bodyOwner: assist.dialog.querySelector('.directive-creator-assist-dialog-body').dataset.directiveScrollOwner,
      overlay: getComputedStyle(assist.overlay).backgroundColor,
      titleFont: getComputedStyle(assist.dialog.querySelector('.directive-creator-assist-dialog-title')).fontFamily
    };
  });
  assert.equal(modal.inert, true);
  assert.equal(modal.ariaModal, 'true');
  assert.equal(modal.bodyOwner, 'true');
  assert.notEqual(modal.overlay, 'rgba(0, 0, 0, 0)');
  assert.match(modal.titleFont, /Roboto Condensed|Arial Narrow/);
  observedVarianceIds.add('creator-wand-modal');
  await modalPage.screenshot({ path: path.join(artifactRoot, 'creator-wand-modal-390x844.png') });
  await modalPage.close();

  const approvedVariances = JSON.parse(await readFile(path.join(repoRoot, 'tools/fixtures/certified-v1-ui-variances.json'), 'utf8'));
  assert.deepEqual(
    [...observedVarianceIds].sort(),
    approvedVariances.map(({ id }) => id).sort(),
    'every visual variance must be explicitly approved'
  );
  await writeFile(path.join(artifactRoot, 'report.json'), `${JSON.stringify({ approvedVariances, report }, null, 2)}\n`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`Expanded interface visual conformance passed ${routes.length * viewports.length} route/viewports and the approved modal state.`);
