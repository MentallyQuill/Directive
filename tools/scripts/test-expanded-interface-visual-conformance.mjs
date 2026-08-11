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
  const referenceErrors = [];
  reference.on('pageerror', (error) => referenceErrors.push(error.message));
  await reference.goto(`${baseUrl}/reference`);
  await reference.waitForSelector('.directive-screen');
  assert.deepEqual(referenceErrors, [], 'certified interactive reference must load without page errors');
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
        const portraitControls = await page.evaluate(() => {
          const controls = [...document.querySelectorAll('.directive-crew-player-portrait-controls')]
            .find((node) => node.getClientRects().length > 0);
          const portrait = controls?.closest('.people-detail-portrait');
          const controlsBox = controls?.getBoundingClientRect();
          const portraitBox = portrait?.getBoundingClientRect();
          const uploadIcon = controls?.querySelector('.directive-crew-player-portrait-upload-icon');
          const removeIcon = controls?.querySelector('.directive-crew-player-portrait-remove-icon');
          const uploadStyle = uploadIcon ? getComputedStyle(uploadIcon) : null;
          const removeStyle = removeIcon ? getComputedStyle(removeIcon) : null;
          return {
            width: controlsBox?.width || 0,
            height: controlsBox?.height || 0,
            withinPortrait: Boolean(controlsBox && portraitBox
              && controlsBox.top >= portraitBox.top
              && controlsBox.right <= portraitBox.right
              && controlsBox.bottom <= portraitBox.bottom),
            topGap: controlsBox && portraitBox ? controlsBox.top - portraitBox.top : -1,
            rightGap: controlsBox && portraitBox ? portraitBox.right - controlsBox.right : -1,
            uploadMask: uploadStyle?.maskImage || uploadStyle?.webkitMaskImage || '',
            removeMask: removeStyle?.maskImage || removeStyle?.webkitMaskImage || '',
            visibleText: controls?.textContent?.trim() || ''
          };
        });
        assert.ok(portraitControls.width >= 58 && portraitControls.width <= 64, `${viewport.width}px portrait controls must be a compact attached pair`);
        assert.ok(portraitControls.height >= 29 && portraitControls.height <= 31, `${viewport.width}px portrait controls must remain icon-sized`);
        assert.equal(portraitControls.withinPortrait, true, `${viewport.width}px portrait controls must stay inside the portrait`);
        assert.ok(portraitControls.topGap >= 7 && portraitControls.topGap <= 9, `${viewport.width}px portrait controls must sit in the upper-right corner`);
        assert.ok(portraitControls.rightGap >= 7 && portraitControls.rightGap <= 9, `${viewport.width}px portrait controls must sit in the upper-right corner`);
        assert.match(portraitControls.uploadMask, /upload-pc-image\.svg/, `${viewport.width}px portrait upload must use the supplied upload icon`);
        assert.match(portraitControls.removeMask, /remove-pc-image\.svg/, `${viewport.width}px portrait remove must use the supplied remove icon`);
        assert.equal(portraitControls.visibleText, '', `${viewport.width}px portrait controls must not show text labels`);
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
  const desktopPortraitControls = peoplePage.locator('.people-desktop-journal .directive-crew-player-portrait-controls');
  const visualRemoveControl = desktopPortraitControls.locator('.directive-crew-player-portrait-remove');
  await visualRemoveControl.evaluate((button) => { button.disabled = false; });
  await visualRemoveControl.click();
  const confirmationState = await desktopPortraitControls.evaluate((controls) => {
    const confirm = controls.querySelector('.directive-crew-player-portrait-confirm');
    const cancel = controls.querySelector('.directive-crew-player-portrait-cancel');
    return {
      confirmText: confirm?.textContent || '',
      cancelText: cancel?.textContent || '',
      confirmColor: confirm ? getComputedStyle(confirm).color : '',
      cancelColor: cancel ? getComputedStyle(cancel).color : '',
      uploadCount: controls.querySelectorAll('.directive-crew-player-portrait-upload').length,
      removeCount: controls.querySelectorAll('.directive-crew-player-portrait-remove').length
    };
  });
  assert.deepEqual(confirmationState, {
    confirmText: '✓',
    cancelText: '×',
    confirmColor: 'rgb(239, 127, 114)',
    cancelColor: 'rgba(248, 239, 224, 0.68)',
    uploadCount: 0,
    removeCount: 0
  }, 'portrait removal must replace both icons with a red check and grey cancel X');
  await desktopPortraitControls.locator('.directive-crew-player-portrait-cancel').click();
  assert.equal(await desktopPortraitControls.locator('.directive-crew-player-portrait-upload').count(), 1, 'portrait removal cancel must restore upload');
  assert.equal(await desktopPortraitControls.locator('.directive-crew-player-portrait-remove').count(), 1, 'portrait removal cancel must restore remove');
  const maraThumb = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"] .people-row-image img');
  assert.match(await maraThumb.getAttribute('src'), /mara-whitaker\.thumb\.webp$/);
  await peoplePage.locator('.people-desktop-journal .people-row[data-person-id="mara-whitaker"]').click();
  assert.match(await peoplePage.locator('.people-desktop-journal .people-detail-portrait img').getAttribute('src'), /mara-whitaker\.detail\.webp$/);
  const maraDetail = peoplePage.locator('.people-desktop-journal .people-detail');
  const maraServiceRecord = maraDetail.locator('.people-service-record');
  assert.equal(await maraServiceRecord.count(), 1, 'Mara detail must render one public service record');
  assert.match(await maraDetail.textContent(), /Human/);
  assert.match(await maraServiceRecord.textContent(), /Age47BirthplaceKingston, Ontario, EarthService backgroundScience operations, diplomacy, executive commandAssignment historyCommanding officer since the Breckenridge's 2372 commission/);
  assert.equal(await maraServiceRecord.evaluate((record) => record.scrollWidth <= record.clientWidth), true, 'public service record must not overflow its detail column');

  await peoplePage.locator('.people-desktop-journal .people-add-category').click();
  const categoryInput = peoplePage.locator('.people-desktop-journal .collection-category-input');
  await categoryInput.fill('Bridge Team');
  await categoryInput.press('Enter');
  const bridgeCategory = peoplePage.locator('.people-desktop-journal .collection-category', { hasText: 'Bridge Team' });
  assert.equal(await bridgeCategory.count(), 1);

  const categoryOrderBeforeClick = await peoplePage.locator('.people-desktop-journal .collection-category').evaluateAll((categories) => categories.map((category) => category.dataset.categoryId));
  const unmovedCategoryHandle = peoplePage.locator('.people-desktop-journal .collection-category').first().locator(':scope > .collection-category-head > .collection-drag-handle');
  const unmovedCategoryHandleBox = await unmovedCategoryHandle.boundingBox();
  await peoplePage.mouse.move(unmovedCategoryHandleBox.x + unmovedCategoryHandleBox.width / 2, unmovedCategoryHandleBox.y + unmovedCategoryHandleBox.height / 2);
  await peoplePage.mouse.down();
  await peoplePage.mouse.up();
  await peoplePage.waitForFunction(() => !document.querySelector('.people-category-drag-ghost'));
  assert.deepEqual(await peoplePage.locator('.people-desktop-journal .collection-category').evaluateAll((categories) => categories.map((category) => category.dataset.categoryId)), categoryOrderBeforeClick, 'clicking a shared category handle without moving must retain its position');

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

  const cancelledPriya = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="priya-nayar"]');
  const cancelledPriyaCategory = await cancelledPriya.locator('xpath=..').getAttribute('data-category-id');
  const cancelledPriyaHandle = cancelledPriya.locator('.collection-drag-handle');
  const cancelledPriyaBox = await cancelledPriyaHandle.boundingBox();
  const cancelledDropBox = await bridgeCategory.locator('.collection-category-head').boundingBox();
  await peoplePage.mouse.move(cancelledPriyaBox.x + cancelledPriyaBox.width / 2, cancelledPriyaBox.y + cancelledPriyaBox.height / 2);
  await peoplePage.mouse.down();
  await peoplePage.mouse.move(cancelledDropBox.x + cancelledDropBox.width / 2, cancelledDropBox.y + cancelledDropBox.height / 2, { steps: 6 });
  await peoplePage.keyboard.press('Escape');
  await peoplePage.waitForTimeout(500);
  assert.equal(await peoplePage.locator('.people-drag-ghost').count(), 0, 'Escape must finish the return-to-origin animation');
  assert.equal(await peoplePage.evaluate(() => document.activeElement?.closest('.collection-person-row')?.dataset.personId), 'priya-nayar', 'Escape must restore focus to the returned card handle');
  await peoplePage.mouse.up();
  assert.equal(await peoplePage.locator(`.people-desktop-journal .collection-person-list[data-category-id="${cancelledPriyaCategory}"] .collection-person-row[data-person-id="priya-nayar"]`).count(), 1, 'Escape must restore the person to the original list');

  const invalidPriyaHandle = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="priya-nayar"] .collection-drag-handle');
  const invalidPriyaBox = await invalidPriyaHandle.boundingBox();
  await invalidPriyaHandle.dispatchEvent('pointerdown', {
    pointerId: 82, pointerType: 'mouse', button: 0,
    clientX: invalidPriyaBox.x + invalidPriyaBox.width / 2, clientY: invalidPriyaBox.y + invalidPriyaBox.height / 2
  });
  await peoplePage.evaluate(({ x, y }) => document.dispatchEvent(new PointerEvent('pointermove', {
    pointerId: 82, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y
  })), { x: cancelledDropBox.x + cancelledDropBox.width / 2, y: cancelledDropBox.y + cancelledDropBox.height / 2 });
  assert.equal(await peoplePage.locator('.people-card-drop-slot').evaluate((slot) => slot.closest('.collection-category')?.textContent.includes('Bridge Team')), true, 'invalid-release setup must first establish a valid destination');
  await peoplePage.evaluate(() => {
    document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 82, pointerType: 'mouse', bubbles: true, clientX: 800, clientY: 4 }));
  });
  await peoplePage.waitForTimeout(500);
  assert.equal(await peoplePage.locator(`.people-desktop-journal .collection-person-list[data-category-id="${cancelledPriyaCategory}"] .collection-person-row[data-person-id="priya-nayar"]`).count(), 1, 'release outside the vertical roster must restore the original position');

  const maraHandle = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"] .collection-drag-handle');
  const maraBox = await maraHandle.boundingBox();
  const maraCardBox = await peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"]').boundingBox();
  const bridgeDropBox = await bridgeCategory.locator('.collection-category-head').boundingBox();
  await peoplePage.evaluate(() => {
    globalThis.__directiveDragVibrations = [];
    globalThis.__directiveCaptureTarget = null;
    const originalSetPointerCapture = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function (...args) {
      globalThis.__directiveCaptureTarget = this;
      return originalSetPointerCapture.apply(this, args);
    };
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (duration) => { globalThis.__directiveDragVibrations.push(duration); return true; }
    });
  });
  await peoplePage.mouse.move(maraBox.x + 2, maraBox.y + maraBox.height / 2);
  await peoplePage.mouse.down();
  await peoplePage.waitForFunction(() => (
    document.querySelector('.people-card-drop-slot')
    && document.querySelector('.people-drag-ghost')
    && !document.querySelector('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"]')
  ));
  assert.deepEqual(await peoplePage.evaluate(() => globalThis.__directiveDragVibrations), [10], 'lifting a person card must request one short haptic pulse');
  const ghostInitialBox = await peoplePage.locator('.mobile-drag-ghost').boundingBox();
  assert.equal(Math.round(ghostInitialBox.x), Math.round(maraCardBox.x), 'lifting from an off-center point must not make the card jump');
  assert.deepEqual(await peoplePage.evaluate(() => ({
    connected: globalThis.__directiveCaptureTarget?.isConnected,
    slot: globalThis.__directiveCaptureTarget?.classList?.contains('people-card-drop-slot')
  })), { connected: true, slot: true }, 'the connected landing slot must retain pointer capture after the source card detaches');
  assert.deepEqual(await peoplePage.locator('.mobile-drag-ghost').evaluate((ghost) => ({
    ariaHidden: ghost.getAttribute('aria-hidden'),
    inert: ghost.inert,
    duplicateIds: ghost.querySelectorAll('[id]').length,
    tabbable: ghost.querySelectorAll('[tabindex]:not([tabindex="-1"])').length
  })), { ariaHidden: 'true', inert: true, duplicateIds: 0, tabbable: 0 }, 'the visual drag ghost must be absent from the accessibility tree');
  await peoplePage.mouse.move(800, bridgeDropBox.y + bridgeDropBox.height / 2, { steps: 8 });
  const ghostDropBox = await peoplePage.locator('.mobile-drag-ghost').boundingBox();
  assert.equal(await peoplePage.locator('.people-card-drop-slot').count(), 1, 'People dragging must expose one exact landing slot');
  assert.equal(await peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"]').count(), 0, 'the lifted person must be detached from the active roster flow');
  assert.equal(await peoplePage.locator('.people-card-drop-slot').evaluate((slot) => getComputedStyle(slot).borderStyle), 'solid', 'the active destination must use a full-card outline');
  assert.equal(await peoplePage.locator('.mobile-drag-ghost').evaluate((ghost) => getComputedStyle(ghost).opacity), '0.96', 'the lifted card must remain nearly solid');
  assert.equal(Math.round(ghostDropBox.x), Math.round(ghostInitialBox.x), 'the certified drag ghost must remain horizontally aligned with the roster');
  assert.equal(await peoplePage.locator('.people-card-drop-slot').evaluate((slot) => slot.closest('.collection-category')?.textContent.includes('Bridge Team')), true, 'horizontal pointer drift must not change the vertical roster target');
  assert.equal(Math.round((await peoplePage.locator('.people-card-drop-slot').boundingBox()).height), Math.round(maraCardBox.height), 'the landing slot must preserve the exact card height');
  assert.equal(await peoplePage.locator('.people-desktop-journal .collection-person-row').evaluateAll((rows) => rows.some((row) => row.getAnimations().some((animation) => animation.playState === 'running'))), true, 'cards displaced by the landing slot must animate');
  await peoplePage.mouse.up();
  assert.equal(await peoplePage.locator('.people-drag-ghost.is-snapping').count(), 1, 'pointer-up must begin a visible docking phase');
  assert.equal(await peoplePage.locator('.people-card-drop-slot.is-drop-committing').count(), 1, 'the landing slot must brighten while the card docks');
  await peoplePage.waitForFunction(() => !document.querySelector('.people-drag-ghost'));
  assert.deepEqual(await peoplePage.evaluate(() => globalThis.__directiveDragVibrations), [10, 8], 'successful docking must request a distinct completion pulse');
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
  const touchCardBox = await touchHandle.locator('xpath=..').boundingBox();
  await touchHandle.dispatchEvent('pointerdown', {
    pointerId: 71, pointerType: 'touch', button: 0,
    clientX: touchBox.x + touchBox.width / 2, clientY: touchBox.y + touchBox.height / 2
  });
  await peoplePage.evaluate(({ x, y }) => document.dispatchEvent(new PointerEvent('pointermove', {
    pointerId: 71, pointerType: 'touch', bubbles: true, clientX: x + 7, clientY: y
  })), { x: touchBox.x + touchBox.width / 2, y: touchBox.y + touchBox.height / 2 });
  await peoplePage.waitForTimeout(100);
  assert.equal(await peoplePage.locator('.mobile-drag-ghost').count(), 0, 'touch drag must not lift before the hold delay');
  await peoplePage.waitForTimeout(100);
  assert.equal(await peoplePage.locator('.mobile-drag-ghost').count(), 1, 'touch drag must lift after 175ms');
  assert.equal(Math.round((await peoplePage.locator('.mobile-drag-ghost').boundingBox()).x), Math.round(touchCardBox.x), 'sub-threshold touch drift must not shift a vertically locked card');
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
  await mobileScrollOwner.evaluate((node) => {
    node.scrollTop = Math.min(220, node.scrollHeight - node.clientHeight);
    node.dataset.scrollIdentity = 'mobile-crew-scroll-owner';
  });
  const mobileHadrikToggle = mobilePeoplePage.locator('.mobile-crew-item[data-person-id="hadrik-bronn"] .mobile-accordion-toggle');
  await mobileHadrikToggle.scrollIntoViewIfNeeded();
  const mobileScrollBefore = await mobileScrollOwner.evaluate((node) => node.scrollTop);
  assert.ok(mobileScrollBefore > 0, 'mobile People fixture must have enough roster overflow to exercise scroll retention');
  await mobileHadrikToggle.click();
  const mobileScrollAfter = await mobileScrollOwner.evaluate((node) => ({
    connected: node.isConnected,
    identity: node.dataset.scrollIdentity,
    scrollTop: node.scrollTop
  }));
  assert.equal(mobileScrollAfter.connected, true, 'mobile disclosure must retain the original scroll owner');
  assert.equal(mobileScrollAfter.identity, 'mobile-crew-scroll-owner', 'mobile disclosure must not replace the roster DOM');
  assert.ok(
    Math.abs(mobileScrollAfter.scrollTop - mobileScrollBefore) < 1,
    `mobile disclosure must preserve the roster scroll offset (${mobileScrollBefore} -> ${mobileScrollAfter.scrollTop})`
  );
  assert.equal(await mobilePeoplePage.locator('.mobile-crew-item.is-open').getAttribute('data-person-id'), 'hadrik-bronn');
  assert.equal(await mobilePeoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="hadrik-bronn"].active').count(), 1, 'mobile disclosure must synchronize desktop selection');
  const expandedTouchCard = mobilePeoplePage.locator('.mobile-crew-item[data-person-id="hadrik-bronn"]');
  const expandedTouchDetail = expandedTouchCard.locator('.mobile-accordion-detail');
  const expandedTouchCardBox = await expandedTouchCard.boundingBox();
  const expandedTouchDetailBox = await expandedTouchDetail.boundingBox();
  await expandedTouchDetail.dispatchEvent('pointerdown', {
    pointerId: 79, pointerType: 'touch', button: 0,
    clientX: expandedTouchDetailBox.x + expandedTouchDetailBox.width / 2, clientY: expandedTouchDetailBox.y + 10
  });
  await mobilePeoplePage.waitForTimeout(200);
  assert.equal(Math.round((await mobilePeoplePage.locator('.people-drag-ghost').boundingBox()).height), Math.round(expandedTouchCardBox.height), 'touch-holding an expanded card must lift the complete rendered card');
  await mobilePeoplePage.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 79, pointerType: 'touch', bubbles: true })));
  await mobilePeoplePage.waitForTimeout(500);
  const scrollingTouchSurface = mobilePeoplePage.locator('.mobile-crew-item[data-person-id="priya-nayar"] .mobile-accordion-toggle');
  const scrollingTouchBox = await scrollingTouchSurface.boundingBox();
  await scrollingTouchSurface.dispatchEvent('pointerdown', {
    pointerId: 80, pointerType: 'touch', button: 0,
    clientX: scrollingTouchBox.x + scrollingTouchBox.width / 2, clientY: scrollingTouchBox.y + scrollingTouchBox.height / 2
  });
  await mobilePeoplePage.evaluate(({ x, y }) => document.dispatchEvent(new PointerEvent('pointermove', {
    pointerId: 80, pointerType: 'touch', bubbles: true, clientX: x, clientY: y + 12
  })), { x: scrollingTouchBox.x + scrollingTouchBox.width / 2, y: scrollingTouchBox.y + scrollingTouchBox.height / 2 });
  await mobilePeoplePage.waitForTimeout(200);
  assert.equal(await mobilePeoplePage.locator('.people-drag-ghost').count(), 0, 'whole-card touch movement beyond 8px must remain ordinary scrolling');
  await mobilePeoplePage.evaluate(({ x, y }) => document.dispatchEvent(new PointerEvent('pointerup', {
    pointerId: 80, pointerType: 'touch', bubbles: true, clientX: x, clientY: y + 12
  })), { x: scrollingTouchBox.x + scrollingTouchBox.width / 2, y: scrollingTouchBox.y + scrollingTouchBox.height / 2 });
  const mobileTouchSurface = mobilePeoplePage.locator('.mobile-crew-item[data-person-id="mara-whitaker"] .mobile-accordion-toggle');
  const mobileTouchBox = await mobileTouchSurface.boundingBox();
  await mobileTouchSurface.dispatchEvent('pointerdown', {
    pointerId: 81, pointerType: 'touch', button: 0,
    clientX: mobileTouchBox.x + mobileTouchBox.width / 2, clientY: mobileTouchBox.y + mobileTouchBox.height / 2
  });
  await mobilePeoplePage.waitForTimeout(100);
  assert.equal(await mobilePeoplePage.locator('.people-drag-ghost').count(), 0, 'whole-card touch must not lift before the hold delay');
  await mobilePeoplePage.waitForTimeout(100);
  assert.equal(await mobilePeoplePage.locator('.people-drag-ghost').count(), 1, 'whole-card touch must lift after 175ms');
  assert.equal(await mobilePeoplePage.evaluate(() => {
    const event = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  }), true, 'an active whole-card drag must take custody of touch scrolling');
  await mobilePeoplePage.waitForTimeout(650);
  await mobilePeoplePage.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 81, pointerType: 'touch', bubbles: true })));
  await mobilePeoplePage.waitForFunction(() => !document.querySelector('.people-drag-ghost'));
  await mobileTouchSurface.dispatchEvent('click');
  assert.equal(await mobilePeoplePage.locator('.mobile-crew-item[data-person-id="mara-whitaker"].is-open').count(), 0, 'a completed whole-card hold must suppress its trailing click');
  await mobilePeoplePage.close();

  const reducedPeoplePage = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await reducedPeoplePage.emulateMedia({ reducedMotion: 'reduce' });
  await reducedPeoplePage.goto(`${baseUrl}/production?route=people`);
  await reducedPeoplePage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const reducedHandle = reducedPeoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"] .collection-drag-handle');
  const reducedHandleBox = await reducedHandle.boundingBox();
  const reducedTargetBox = await reducedPeoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="priya-nayar"]').boundingBox();
  await reducedPeoplePage.mouse.move(reducedHandleBox.x + reducedHandleBox.width / 2, reducedHandleBox.y + reducedHandleBox.height / 2);
  await reducedPeoplePage.mouse.down();
  await reducedPeoplePage.mouse.move(reducedTargetBox.x + reducedTargetBox.width / 2, reducedTargetBox.y + reducedTargetBox.height / 2);
  assert.equal(await reducedPeoplePage.locator('.people-card-drop-slot').count(), 1, 'reduced motion must retain the exact landing slot');
  assert.equal(await reducedPeoplePage.locator('.people-desktop-journal .collection-person-row').evaluateAll((rows) => rows.some((row) => row.getAnimations().some((animation) => animation.playState === 'running'))), false, 'reduced motion must remove sibling displacement animation');
  await reducedPeoplePage.mouse.up();
  await reducedPeoplePage.waitForFunction(() => !document.querySelector('.people-drag-ghost'));
  await reducedPeoplePage.close();

  const scrollPeoplePage = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await scrollPeoplePage.goto(`${baseUrl}/production?route=people`);
  await scrollPeoplePage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const peopleRosterScroll = scrollPeoplePage.locator('.people-desktop-journal .people-category-list');
  const rosterScrollBox = await peopleRosterScroll.boundingBox();
  const scrollHandle = scrollPeoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"] .collection-drag-handle');
  const scrollBeforeEdge = await peopleRosterScroll.evaluate((node) => { node.scrollTop = 20; return node.scrollTop; });
  const scrollHandleBox = await scrollHandle.boundingBox();
  await scrollPeoplePage.mouse.move(scrollHandleBox.x + scrollHandleBox.width / 2, scrollHandleBox.y + scrollHandleBox.height / 2);
  await scrollPeoplePage.mouse.down();
  await scrollPeoplePage.mouse.move(scrollHandleBox.x + scrollHandleBox.width / 2, rosterScrollBox.y + rosterScrollBox.height - 1);
  const scrollAfterEdge = await peopleRosterScroll.evaluate((node) => node.scrollTop);
  assert.ok(scrollAfterEdge - scrollBeforeEdge >= 16, 'the nearest People roster must reach the approved 16px edge-scroll step');
  await scrollPeoplePage.waitForTimeout(100);
  assert.ok(await peopleRosterScroll.evaluate((node, previous) => node.scrollTop > previous, scrollAfterEdge), 'holding stationary at the edge must keep scrolling the nearest roster');
  await scrollPeoplePage.keyboard.press('Escape');
  await scrollPeoplePage.waitForTimeout(500);
  await scrollPeoplePage.mouse.up();
  await scrollPeoplePage.close();

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
