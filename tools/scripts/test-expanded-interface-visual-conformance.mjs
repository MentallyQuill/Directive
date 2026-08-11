import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 54000 + (process.pid % 10000);
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
  settings: ['.settings-layout', '.settings-content', '.settings-provider-grid', '.settings-provider-card', '.settings-diagnostics']
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
  stdio: ['ignore', 'ignore', 'inherit']
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
        const owners = [...shell.querySelectorAll('[data-directive-scroll-owner="true"]')]
          .filter((node) => node.getClientRects().length && /(auto|scroll)/.test(`${getComputedStyle(node).overflowX} ${getComputedStyle(node).overflowY}`));
        const illegal = [...shell.querySelectorAll('*')]
          .filter((node) => {
            const style = getComputedStyle(node);
            return node.getClientRects().length > 0
              && /(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)
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
      }, { route, ownerCount: route === 'people' && viewport.width <= 640 ? 1 : expectedOwnerCounts[route] });

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

      if (route === 'settings') {
        const settingsGeometry = await page.evaluate(() => {
          const layout = document.querySelector('.settings-layout');
          const content = document.querySelector('.settings-content');
          const cards = [...document.querySelectorAll('.settings-provider-card')].map((card) => card.getBoundingClientRect());
          const layoutBox = layout.getBoundingClientRect();
          const contentBox = content.getBoundingClientRect();
          return {
            navigationCount: document.querySelectorAll('.settings-navigation').length,
            contentWidthRatio: contentBox.width / layoutBox.width,
            cardsStacked: cards.length === 2
              && Math.abs(cards[0].left - cards[1].left) <= .5
              && Math.abs(cards[0].width - cards[1].width) <= .5
              && cards[1].top > cards[0].bottom,
            cardWithinContent: cards.every((card) => card.left >= contentBox.left - .5 && card.right <= contentBox.right + .5)
          };
        });
        assert.equal(settingsGeometry.navigationCount, 0, `${viewport.width}px Settings must not render redundant navigation`);
        assert.ok(settingsGeometry.contentWidthRatio >= .98, `${viewport.width}px Settings content must use the full route width`);
        assert.equal(settingsGeometry.cardsStacked, true, `${viewport.width}px provider cards must remain stacked`);
        assert.equal(settingsGeometry.cardWithinContent, true, `${viewport.width}px provider cards must stay inside Settings content`);
      }

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
          const body = document.querySelector('.campaign-library-detail-body');
          const description = body?.querySelector('[data-campaign-description]');
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
            description: description?.textContent || '',
            descriptionOutsideHero: Boolean(description && !detail.contains(description)),
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
        assert.equal(campaign.descriptionOutsideHero, true, `${viewport.width}px future Campaign description must sit below the hero`);
        assert.ok(campaign.artOpacity <= .5);
        assert.match(campaign.artFilter, /grayscale\(1\)/);
        assert.equal(campaign.copyWithinHero, true, `${viewport.width}px future Campaign copy must not clip`);
        assert.equal(campaign.selectedRowVisible, true, `${viewport.width}px selected future Campaign row must stay visible`);
        assert.equal(campaign.actionDisabled, true);
        assert.match(campaign.actionText, /New campaign/i);
        observedVarianceIds.add('campaign-coming-later');
        observedVarianceIds.add('campaign-current-descriptions');
      }
      if (route === 'people') {
        const portraits = await page.locator('.people-row-image img, .mobile-crew-avatar img').count();
        assert.ok(portraits >= 4, `${viewport.width}px People must resolve package portraits`);
        const handleStyles = await page.evaluate(() => {
          const person = document.querySelector('.collection-person-row .collection-drag-handle');
          const category = document.querySelector('.collection-category > .collection-category-head > .collection-drag-handle');
          const personStyle = getComputedStyle(person, '::before');
          const categoryStyle = getComputedStyle(category, '::before');
          return {
            personMask: personStyle.maskImage || personStyle.webkitMaskImage,
            categoryBackground: categoryStyle.backgroundImage,
            categoryMask: categoryStyle.maskImage || categoryStyle.webkitMaskImage
          };
        });
        assert.match(handleStyles.personMask, /handle-person\.svg/, `${viewport.width}px person handles must use the supplied two-line mask`);
        assert.match(handleStyles.categoryBackground, /radial-gradient/, `${viewport.width}px category handles must retain the dotted glyph`);
        assert.doesNotMatch(handleStyles.categoryMask, /handle-person\.svg/, `${viewport.width}px category handles must not use the person mask`);
        const pipColors = await page.evaluate(() => Object.fromEntries(['command', 'operations', 'science'].map((division) => [
          division,
          getComputedStyle(document.querySelector(`.people-pips-${division}`)).color
        ])));
        assert.deepEqual(pipColors, {
          command: 'rgb(166, 4, 0)',
          operations: 'rgb(221, 138, 18)',
          science: 'rgb(0, 72, 128)'
        }, `${viewport.width}px People pips must use the certified division colors`);
        if (viewport.width <= 640) {
          assert.equal(await page.locator('.mobile-crew-accordion').evaluate((node) => getComputedStyle(node).display !== 'none'), true);
          assert.equal(await page.locator('.mobile-crew-item.is-open .people-detail-portrait').count(), 1);
        }
      }
      observedVarianceIds.add('bounded-scroll-ownership');

      const name = `${route}-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: path.join(artifactRoot, name) });
      report.push({ viewport, route, metrics, screenshot: name });
      await page.close();
    }
  }

  const peoplePage = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await peoplePage.goto(`${baseUrl}/production?route=people`);
  await peoplePage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  await peoplePage.evaluate(() => localStorage.clear());
  await peoplePage.reload();
  await peoplePage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const maraThumb = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"] .people-row-image img');
  assert.match(await maraThumb.getAttribute('src'), /mara-whitaker\.thumb\.webp$/);
  await peoplePage.locator('.people-desktop-journal .people-row[data-person-id="mara-whitaker"]').click();
  assert.match(await peoplePage.locator('.people-desktop-journal .people-detail-portrait img').getAttribute('src'), /mara-whitaker\.detail\.webp$/);

  await peoplePage.locator('.people-desktop-journal .people-add-category').click();
  const categoryInput = peoplePage.locator('.people-desktop-journal .collection-category-input');
  await categoryInput.fill('Bridge Team');
  await categoryInput.press('Enter');
  const bridgeCategory = peoplePage.locator('.people-desktop-journal .collection-category', { hasText: 'Bridge Team' });
  assert.equal(await bridgeCategory.count(), 1);

  const priyaHandle = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="priya-nayar"] .collection-drag-handle');
  await priyaHandle.focus();
  await priyaHandle.press('ArrowDown');
  assert.equal(await bridgeCategory.locator('.collection-person-row[data-person-id="priya-nayar"]').count(), 0, 'one non-boundary Arrow key must move exactly one position');
  const bridgeDisclosure = bridgeCategory.locator('.collection-disclosure');
  await bridgeDisclosure.click();
  assert.equal(await bridgeDisclosure.getAttribute('aria-expanded'), 'false');
  const bronnHandle = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="hadrik-bronn"] .collection-drag-handle');
  await bronnHandle.focus();
  await bronnHandle.press('ArrowDown');
  await peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="hadrik-bronn"] .collection-drag-handle').press('ArrowDown');
  await peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="hadrik-bronn"] .collection-drag-handle').press('ArrowDown');
  assert.equal(await bridgeCategory.locator('.collection-person-row[data-person-id="hadrik-bronn"]').count(), 1, 'keyboard boundary movement must cross categories');
  assert.equal(await bridgeDisclosure.getAttribute('aria-expanded'), 'true', 'keyboard movement must expand a collapsed target category');
  await peoplePage.waitForFunction(() => document.activeElement?.closest('.collection-person-row')?.dataset.personId === 'hadrik-bronn');

  const maraHandle = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"] .collection-drag-handle');
  const maraBox = await maraHandle.boundingBox();
  const bridgeDropBox = await bridgeCategory.locator('.collection-category-head').boundingBox();
  const sourceGeometry = await peoplePage.locator('.people-desktop-journal .collection-person-row').evaluateAll((rows) => rows.map((row) => ({
    id: row.dataset.personId,
    top: row.getBoundingClientRect().top
  })));
  await peoplePage.mouse.move(maraBox.x + maraBox.width / 2, maraBox.y + maraBox.height / 2);
  await peoplePage.mouse.down();
  await peoplePage.waitForFunction(() => (
    document.querySelector('.collection-person-row[data-person-id="mara-whitaker"].is-dragging')
    && !document.querySelector('.mobile-drag-placeholder')
  ));
  const ghostInitialBox = await peoplePage.locator('.mobile-drag-ghost').boundingBox();
  await peoplePage.mouse.move(bridgeDropBox.x + bridgeDropBox.width / 2, bridgeDropBox.y + bridgeDropBox.height / 2, { steps: 8 });
  const ghostDropBox = await peoplePage.locator('.mobile-drag-ghost').boundingBox();
  assert.equal(await peoplePage.locator('.mobile-drag-placeholder').count(), 0, 'certified People dragging must not reflow through a placeholder');
  assert.equal(await peoplePage.locator('.collection-person-row[data-person-id="mara-whitaker"].is-dragging').count(), 1, 'the source person must remain connected and fade in place');
  assert.equal(await peoplePage.locator('.collection-person-row.is-drop-before, .collection-category.is-drop-target').count(), 1, 'the active destination must use a certified drop marker');
  assert.equal(await peoplePage.locator('.mobile-drag-ghost').evaluate((ghost) => getComputedStyle(ghost).opacity), '0.92', 'the drag ghost must retain the certified visual weight');
  assert.equal(Math.round(ghostDropBox.x), Math.round(ghostInitialBox.x), 'the certified drag ghost must remain horizontally aligned with the roster');
  assert.deepEqual(await peoplePage.locator('.people-desktop-journal .collection-person-row').evaluateAll((rows) => rows.map((row) => ({
    id: row.dataset.personId,
    top: row.getBoundingClientRect().top
  }))), sourceGeometry, 'person rows must retain their geometry until pointer-up');
  await peoplePage.mouse.up();
  const pointerMoved = await bridgeCategory.locator('.collection-person-row[data-person-id="mara-whitaker"]').count();
  assert.equal(pointerMoved, 1, 'pointer drag must cross categories');
  assert.equal(await peoplePage.locator('.people-desktop-journal .collection-person-row').count(), 6, 'reordering must preserve every fixture person');

  const cancelledTouchHandle = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="priya-nayar"] .collection-drag-handle');
  const cancelledTouchBox = await cancelledTouchHandle.boundingBox();
  await cancelledTouchHandle.dispatchEvent('pointerdown', {
    pointerId: 70, pointerType: 'touch', button: 0,
    clientX: cancelledTouchBox.x + cancelledTouchBox.width / 2, clientY: cancelledTouchBox.y + cancelledTouchBox.height / 2
  });
  await peoplePage.evaluate(({ x, y }) => document.dispatchEvent(new PointerEvent('pointermove', {
    pointerId: 70, pointerType: 'touch', bubbles: true, clientX: x + 12, clientY: y
  })), { x: cancelledTouchBox.x + cancelledTouchBox.width / 2, y: cancelledTouchBox.y + cancelledTouchBox.height / 2 });
  await peoplePage.waitForTimeout(200);
  assert.equal(await peoplePage.locator('.mobile-drag-ghost').count(), 0, 'touch movement beyond 8px must cancel before the hold lifts');

  const touchHandle = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"] .collection-drag-handle');
  const touchBox = await touchHandle.boundingBox();
  await touchHandle.dispatchEvent('pointerdown', {
    pointerId: 71, pointerType: 'touch', button: 0,
    clientX: touchBox.x + touchBox.width / 2, clientY: touchBox.y + touchBox.height / 2
  });
  await peoplePage.waitForTimeout(100);
  assert.equal(await peoplePage.locator('.mobile-drag-ghost').count(), 0, 'touch drag must not lift before the hold delay');
  await peoplePage.waitForTimeout(100);
  assert.equal(await peoplePage.locator('.mobile-drag-ghost').count(), 1, 'touch drag must lift after 175ms');
  await peoplePage.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 71, pointerType: 'touch', bubbles: true })));

  const bridgeCategoryHandle = bridgeCategory.locator(':scope > .collection-category-head > .collection-drag-handle');
  await bridgeCategoryHandle.focus();
  await bridgeCategoryHandle.press('ArrowUp');
  await peoplePage.waitForFunction(() => document.activeElement?.closest('.collection-category')?.querySelector('.collection-category-copy strong')?.textContent === 'Bridge Team');

  await peoplePage.reload();
  await peoplePage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const restoredBridge = peoplePage.locator('.people-desktop-journal .collection-category', { hasText: 'Bridge Team' });
  assert.equal(await restoredBridge.locator('.collection-person-row[data-person-id="hadrik-bronn"]').count(), 1);
  assert.equal(await restoredBridge.locator('.collection-person-row[data-person-id="mara-whitaker"]').count(), 1);
  observedVarianceIds.add('people-restored-collections');
  await peoplePage.close();

  const mobilePeoplePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePeoplePage.goto(`${baseUrl}/production?route=people`);
  await mobilePeoplePage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const mobileScrollOwner = mobilePeoplePage.locator('.people-journal-host');
  const mobileScrollBefore = await mobileScrollOwner.evaluate((node) => {
    node.scrollTop = Math.min(220, node.scrollHeight - node.clientHeight);
    node.dataset.scrollIdentity = 'mobile-crew-scroll-owner';
    return node.scrollTop;
  });
  assert.ok(mobileScrollBefore > 0, 'mobile People fixture must have enough roster overflow to exercise scroll retention');
  await mobilePeoplePage.locator('.mobile-crew-item[data-person-id="hadrik-bronn"] .mobile-accordion-toggle').click();
  const mobileScrollAfter = await mobileScrollOwner.evaluate((node) => ({
    connected: node.isConnected,
    identity: node.dataset.scrollIdentity,
    scrollTop: node.scrollTop
  }));
  assert.equal(mobileScrollAfter.connected, true, 'mobile disclosure must retain the original scroll owner');
  assert.equal(mobileScrollAfter.identity, 'mobile-crew-scroll-owner', 'mobile disclosure must not replace the roster DOM');
  assert.ok(Math.abs(mobileScrollAfter.scrollTop - mobileScrollBefore) < 1, 'mobile disclosure must preserve the roster scroll offset');
  assert.equal(await mobilePeoplePage.locator('.mobile-crew-item.is-open').getAttribute('data-person-id'), 'hadrik-bronn');
  assert.equal(await mobilePeoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="hadrik-bronn"].active').count(), 1, 'mobile disclosure must synchronize desktop selection');
  await mobilePeoplePage.close();

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
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 2000))
    ]);
  }
}

console.log(`Expanded interface visual conformance passed ${routes.length * viewports.length} route/viewports and the approved modal state.`);
