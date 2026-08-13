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
  campaign: ['.campaign-dashboard', '.campaign-dashboard-heading', '.campaign-detail-actions', '[data-campaign-action="campaigns"]'],
  mission: ['.mission-layout', '.mission-collection', '.mission-detail', '.mission-objective-row'],
  people: ['.people-route', '.directive-command-bearing-strip', '.people-layout', '.people-roster', '.people-detail'],
  ship: ['.ship-layout', '.ship-hero', '.ship-board', '.ship-operational-status'],
  settings: ['.settings-layout', '.settings-content', '.settings-provider-grid', '.settings-provider-card', '.settings-diagnostics']
};
const expectedOwnerCounts = { campaign: 1, mission: 2, people: 2, ship: 1, settings: 1 };
const mobilePanelGeometry = {
  mission: {
    layout: '.mission-layout',
    accordion: '.mission-mobile-accordion',
    desktopMaster: '.mission-desktop-collection',
    desktopDetail: '.mission-desktop-detail',
    trigger: '.mission-mobile-trigger[aria-expanded="true"]'
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
      }, {
        route,
        ownerCount: viewport.width <= 640 && ['campaign', 'mission', 'people'].includes(route)
          ? 1
          : expectedOwnerCounts[route]
      });

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

        await page.locator('[data-settings-control="utility-profileId"]').click();
        await page.waitForSelector('.connection-profile-picker-dialog');
        const pickerGeometry = await page.evaluate(() => {
          const dialog = document.querySelector('.connection-profile-picker-dialog');
          const results = document.querySelector('.connection-profile-picker-results');
          const options = [...document.querySelectorAll('.connection-profile-picker-option')];
          const longOption = options.at(-1);
          const close = document.querySelector('.connection-profile-picker-close');
          const clear = document.querySelector('.connection-profile-picker-clear');
          const dialogBox = dialog.getBoundingClientRect();
          const resultsStyle = getComputedStyle(results);
          const longBox = longOption.getBoundingClientRect();
          return {
            dialog: { left: dialogBox.left, top: dialogBox.top, right: dialogBox.right, bottom: dialogBox.bottom, width: dialogBox.width },
            scrollOwner: results.dataset.directiveScrollOwner,
            overflowX: resultsStyle.overflowX,
            overflowY: resultsStyle.overflowY,
            verticallyScrollable: results.scrollHeight > results.clientHeight,
            resultsHaveNoHorizontalOverflow: results.scrollWidth <= results.clientWidth + .5,
            longOptionHasNoHorizontalOverflow: longOption.scrollWidth <= longOption.clientWidth + .5,
            optionMinHeight: Math.min(...options.map((option) => option.getBoundingClientRect().height)),
            longOptionWidth: longBox.width,
            closeHeight: close.getBoundingClientRect().height,
            clearHeight: clear.getBoundingClientRect().height
          };
        });
        assert.equal(pickerGeometry.scrollOwner, 'true', `${viewport.width}px profile results must own their scroll`);
        assert.match(pickerGeometry.overflowY, /auto|scroll/, `${viewport.width}px profile results must scroll vertically`);
        assert.doesNotMatch(pickerGeometry.overflowX, /auto|scroll/, `${viewport.width}px profile results must not scroll horizontally`);
        assert.equal(pickerGeometry.verticallyScrollable, true, `${viewport.width}px long profile lists must scroll`);
        assert.equal(pickerGeometry.resultsHaveNoHorizontalOverflow, true, `${viewport.width}px profile results must not overflow horizontally`);
        assert.equal(pickerGeometry.longOptionHasNoHorizontalOverflow, true, `${viewport.width}px long profile text must wrap`);
        assert.ok(pickerGeometry.dialog.left >= 0 && pickerGeometry.dialog.top >= 0, `${viewport.width}px picker starts inside viewport`);
        assert.ok(pickerGeometry.dialog.right <= viewport.width + .5 && pickerGeometry.dialog.bottom <= viewport.height + .5, `${viewport.width}px picker ends inside viewport`);
        if (viewport.width <= 640) {
          assert.ok(pickerGeometry.dialog.width >= viewport.width * .9, `${viewport.width}px mobile picker must use nearly the full viewport`);
          assert.ok(pickerGeometry.optionMinHeight >= 44, `${viewport.width}px profile rows must be touch sized`);
          assert.ok(pickerGeometry.closeHeight >= 44, `${viewport.width}px picker close must be touch sized`);
          assert.ok(pickerGeometry.clearHeight >= 44, `${viewport.width}px picker clear must be touch sized`);
        } else {
          assert.ok(pickerGeometry.dialog.width <= 680, `${viewport.width}px desktop picker must remain bounded`);
        }
        await page.locator('.connection-profile-picker-clear').focus();
        await page.keyboard.press('Tab');
        assert.equal(
          await page.locator('.connection-profile-picker-close').evaluate((node) => node === document.activeElement),
          true,
          `${viewport.width}px Tab must wrap within the profile picker`
        );
        await page.locator('.connection-profile-picker-close').focus();
        await page.keyboard.press('Shift+Tab');
        assert.equal(
          await page.locator('.connection-profile-picker-clear').evaluate((node) => node === document.activeElement),
          true,
          `${viewport.width}px Shift+Tab must wrap within the profile picker`
        );
        if (viewport.width <= 640) {
          await page.goBack();
          await page.waitForSelector('.connection-profile-picker-dialog', { state: 'detached' });
          assert.equal(
            await page.locator('.directive-expanded-shell').isVisible(),
            true,
            `${viewport.width}px browser Back must close only the profile picker`
          );
        } else {
          await page.locator('.connection-profile-picker-close').click();
        }
      }

      if (viewport.width === 360 && [500, 800].includes(viewport.height) && mobilePanelGeometry[route]) {
        const geometry = await page.evaluate((selectors) => {
          const layout = document.querySelector(selectors.layout);
          const accordion = document.querySelector(selectors.accordion);
          const desktopMaster = document.querySelector(selectors.desktopMaster);
          const desktopDetail = document.querySelector(selectors.desktopDetail);
          const trigger = document.querySelector(selectors.trigger);
          const detail = trigger ? document.getElementById(trigger.getAttribute('aria-controls')) : null;
          const layoutBox = layout.getBoundingClientRect();
          const accordionBox = accordion.getBoundingClientRect();
          const detailBox = detail?.getBoundingClientRect();
          return {
            desktopMasterVisible: desktopMaster.getClientRects().length > 0,
            desktopDetailVisible: desktopDetail.getClientRects().length > 0,
            accordionHeight: accordionBox.height,
            accordionWidthRatio: accordionBox.width / layoutBox.width,
            detailWidthRatio: detailBox ? detailBox.width / accordionBox.width : 0,
            expandedCount: accordion.querySelectorAll('[aria-expanded="true"]').length,
            detailVisible: Boolean(detailBox?.height)
          };
        }, mobilePanelGeometry[route]);
        assert.equal(geometry.desktopMasterVisible, false, `${route} ${viewport.width}x${viewport.height} desktop master must be hidden`);
        assert.equal(geometry.desktopDetailVisible, false, `${route} ${viewport.width}x${viewport.height} desktop detail must be hidden`);
        assert.ok(geometry.accordionHeight >= 120, `${route} ${viewport.width}x${viewport.height} phone list must remain usable`);
        assert.ok(geometry.accordionWidthRatio >= .98, `${route} ${viewport.width}x${viewport.height} phone list must use route width`);
        assert.ok(geometry.detailWidthRatio >= .98, `${route} ${viewport.width}x${viewport.height} expanded detail must use list width`);
        assert.equal(geometry.expandedCount, 1, `${route} ${viewport.width}x${viewport.height} default-open record`);
        assert.equal(geometry.detailVisible, true, `${route} ${viewport.width}x${viewport.height} expanded detail must be visible`);
      }

      if (route === 'campaign') {
        const dashboard = await page.evaluate((mobile) => {
          const controls = [...document.querySelectorAll('.campaign-detail-actions .campaign-command')];
          const boxes = controls.map((control) => control.getBoundingClientRect());
          const rowTops = [...new Set(boxes.map((box) => Math.round(box.top)))];
          const [continueBox, saveBox, loadBox, deleteBox] = boxes;
          return {
            labels: controls.map((control) => control.textContent.trim()),
            rowCount: rowTops.length,
            minHeight: Math.min(...boxes.map((box) => box.height)),
            continueWithDelete: Math.abs(continueBox.top - deleteBox.top) < .5,
            saveWithLoad: Math.abs(saveBox.top - loadBox.top) < .5,
            secondRowAfterFirst: saveBox.top > continueBox.top,
            equalSecondaryWidth: Math.abs(saveBox.width - loadBox.width) < .5,
            deleteLabel: controls[3].getAttribute('aria-label'),
            deleteTooltip: controls[3].dataset.directiveTooltip,
            campaignsHeight: document.querySelector('[data-campaign-action="campaigns"]').getBoundingClientRect().height,
            savedListCount: document.querySelectorAll('.campaign-save-list').length,
            browserCount: document.querySelectorAll('.campaign-browser').length,
            overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            mobile
          };
        }, viewport.width <= 640);
        assert.deepEqual(dashboard.labels, ['Continue', 'Save Game', 'Load Game', '']);
        assert.equal(dashboard.savedListCount, 0, `${viewport.width}px dashboard saved-game list`);
        assert.equal(dashboard.browserCount, 0, `${viewport.width}px dashboard browser visibility`);
        assert.equal(dashboard.deleteLabel, 'Delete campaign');
        assert.equal(dashboard.deleteTooltip, 'Delete campaign');
        assert.equal(dashboard.overflowX, false, `${viewport.width}px dashboard overflow-x`);
        if (viewport.width <= 640) {
          assert.equal(dashboard.rowCount, 2, `${viewport.width}px intentional dashboard action rows`);
          assert.ok(dashboard.minHeight >= 44, `${viewport.width}px dashboard touch target`);
          assert.ok(dashboard.campaignsHeight >= 44, `${viewport.width}px Campaigns touch target`);
          assert.equal(dashboard.continueWithDelete, true, `${viewport.width}px Continue/delete row`);
          assert.equal(dashboard.saveWithLoad, true, `${viewport.width}px Save/Load row`);
          assert.equal(dashboard.secondRowAfterFirst, true, `${viewport.width}px secondary row ordering`);
          assert.equal(dashboard.equalSecondaryWidth, true, `${viewport.width}px equal Save/Load widths`);
        } else {
          assert.equal(dashboard.rowCount, 1, `${viewport.width}px aligned desktop action row`);
          const deleteCampaign = page.locator('[data-campaign-action="delete"]');
          await deleteCampaign.focus();
          await page.waitForFunction(() => {
            const tooltip = document.querySelector('.directive-floating-tooltip');
            return tooltip?.textContent === 'Delete campaign' && getComputedStyle(tooltip).display === 'block';
          });
        }

        const loadGame = page.getByRole('button', { name: 'Load Game', exact: true });
        await loadGame.click();
        await page.waitForSelector('.load-game-dialog-overlay');
        const loadGeometry = await page.evaluate(() => {
          const dialog = document.querySelector('.timeline-dialog');
          const list = document.querySelector('.timeline-saved-game-list');
          const deletes = [...document.querySelectorAll('.timeline-saved-game-delete')];
          const box = dialog.getBoundingClientRect();
          return {
            left: box.left,
            top: box.top,
            right: box.right,
            bottom: box.bottom,
            listOverflowY: getComputedStyle(list).overflowY,
            minDeleteHeight: Math.min(...deletes.map((button) => button.getBoundingClientRect().height)),
            documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            documentOverflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight
          };
        });
        assert.ok(loadGeometry.left >= 0 && loadGeometry.top >= 0, `${viewport.width}px load dialog starts inside viewport`);
        assert.ok(loadGeometry.right <= viewport.width + .5 && loadGeometry.bottom <= viewport.height + .5, `${viewport.width}px load dialog ends inside viewport`);
        assert.match(loadGeometry.listOverflowY, /auto|scroll/, `${viewport.width}px saved-game list scroll`);
        assert.equal(loadGeometry.documentOverflowX, false, `${viewport.width}px load dialog document overflow-x`);
        assert.equal(loadGeometry.documentOverflowY, false, `${viewport.width}px load dialog document overflow-y`);
        if (viewport.width <= 640) assert.ok(loadGeometry.minDeleteHeight >= 44, `${viewport.width}px saved-game delete target`);
        assert.equal(await page.locator('.timeline-saved-game-row').count(), 2, `${viewport.width}px saved games live in Load Game`);
        assert.equal(await page.getByRole('button', { name: 'Load Game', exact: true }).last().isDisabled(), true);
        await page.evaluate(() => { globalThis.__directiveFixtureActions.length = 0; });
        page.once('dialog', (dialog) => dialog.accept());
        await page.locator('.timeline-saved-game-delete').first().click();
        await page.waitForFunction(() => globalThis.__directiveFixtureActions.some((entry) => entry.action === 'deleteSave'));
        const deleteSaveCall = await page.evaluate(() => globalThis.__directiveFixtureActions.find((entry) => entry.action === 'deleteSave'));
        assert.deepEqual(deleteSaveCall.args[0], { campaignId: 'campaign.ashes', checkpointId: 'save.current' });
        assert.equal(await page.locator('.timeline-saved-game-row').count(), 1, `${viewport.width}px successful save deletion updates picker`);
        await page.locator('.timeline-saved-game-row').first().click();
        assert.equal(await page.getByRole('button', { name: 'Load Game', exact: true }).last().isDisabled(), false);
        await page.keyboard.press('Escape');
        assert.equal(await loadGame.evaluate((node) => node === document.activeElement), true, `${viewport.width}px Load Game focus restoration`);

        await page.evaluate(() => { globalThis.__directiveFixtureActions.length = 0; });
        await page.locator('[data-campaign-action="campaigns"]').click();
        await page.waitForSelector('.campaign-browser');
        assert.equal(
          await page.locator('[data-campaign-action="back-to-current"]').evaluate((node) => node === document.activeElement),
          true,
          `${viewport.width}px Campaigns must move focus to the browser return control`
        );
        if (viewport.width <= 640) {
          assert.ok(
            await page.locator('[data-campaign-action="back-to-current"]').evaluate((node) => node.getBoundingClientRect().height) >= 44,
            `${viewport.width}px Back to Current Campaign touch target`
          );
        }
        const futureRow = viewport.width <= 640
          ? page.locator('.campaign-mobile-trigger[data-campaign-availability="coming-later"]').first()
          : page.locator('.campaign-desktop-master button[data-campaign-availability="coming-later"]').first();
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
        const campaign = await page.evaluate((mobile) => {
          const visible = (node) => Boolean(node?.getClientRects().length) && getComputedStyle(node).display !== 'none';
          const detail = [...document.querySelectorAll('.campaign-library-hero[data-campaign-availability="coming-later"]')].find(visible);
          const detailContainer = detail?.closest('.campaign-mobile-detail, .campaign-detail');
          const body = detailContainer?.querySelector('.campaign-library-detail-body');
          const description = body?.querySelector('[data-campaign-description]');
          const art = detail.querySelector('.campaign-hero-media');
          const copy = detail.querySelector('.campaign-hero-copy');
          const action = detailContainer?.querySelector('.campaign-command-primary');
          const master = mobile
            ? document.querySelector('.campaign-mobile-accordion')
            : document.querySelector('.campaign-desktop-master');
          const selectedRow = mobile
            ? document.querySelector('.campaign-mobile-trigger[data-campaign-availability="coming-later"][aria-expanded="true"]')
            : document.querySelector('.campaign-desktop-master button[data-campaign-availability="coming-later"][aria-pressed="true"]');
          const detailBox = detail.getBoundingClientRect();
          const copyBox = copy.getBoundingClientRect();
          const masterBox = master.getBoundingClientRect();
          const selectedRowBox = selectedRow.getBoundingClientRect();
          const topbarBox = document.querySelector('.directive-topbar').getBoundingClientRect();
          return {
            status: detail.querySelector('.campaign-status')?.textContent || '',
            title: detail.querySelector('h2')?.textContent || '',
            description: description?.textContent || '',
            descriptionOutsideHero: Boolean(description && !detail.contains(description)),
            artOpacity: Number(getComputedStyle(art).opacity),
            artFilter: getComputedStyle(art).filter,
            copyWithinHero: copyBox.top >= detailBox.top - .5 && copyBox.bottom <= detailBox.bottom + .5,
            selectedRowVisible: mobile
              ? selectedRowBox.bottom > masterBox.top && selectedRowBox.top < masterBox.bottom
              : selectedRowBox.top >= masterBox.top - .5 && selectedRowBox.bottom <= masterBox.bottom + .5,
            topbarVisible: topbarBox.top >= 0 && topbarBox.bottom <= window.innerHeight,
            actionDisabled: action?.disabled,
            actionText: action?.textContent || ''
          };
        }, viewport.width <= 640);
        assert.match(campaign.status, /Coming later/i);
        if (viewport.width <= 640) {
          assert.equal(campaign.title, '', `${viewport.width}px phone Campaign detail must not repeat its accordion title`);
        } else {
          assert.match(campaign.title, /Drowned Constellation/);
        }
        assert.match(campaign.description, /Nerine Reef/);
        assert.equal(campaign.descriptionOutsideHero, true, `${viewport.width}px future Campaign description must sit below the hero`);
        assert.ok(campaign.artOpacity <= .5);
        assert.match(campaign.artFilter, /grayscale\(1\)/);
        assert.equal(campaign.copyWithinHero, true, `${viewport.width}px future Campaign copy must not clip`);
        assert.equal(campaign.selectedRowVisible, true, `${viewport.width}px selected future Campaign row must stay visible`);
        assert.equal(campaign.topbarVisible, true, `${viewport.width}px Campaign disclosure must not scroll the shell header`);
        assert.equal(campaign.actionDisabled, true);
        assert.match(campaign.actionText, /New campaign/i);
        observedVarianceIds.add('campaign-coming-later');
        observedVarianceIds.add('campaign-current-descriptions');
        await page.locator('[data-campaign-action="back-to-current"]').click();
        await page.waitForSelector('.campaign-dashboard');
        assert.equal(await page.locator('.campaign-browser').count(), 0, `${viewport.width}px browser closes back to dashboard`);
        assert.equal(
          await page.locator('[data-campaign-action="campaigns"]').evaluate((node) => node === document.activeElement),
          true,
          `${viewport.width}px browser return must restore focus to Campaigns`
        );
        assert.equal(await page.evaluate(() => globalThis.__directiveFixtureActions.length), 0, `${viewport.width}px browser navigation is presentation-only`);
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

  const measureForegroundVerticalOffset = (hero) => hero.evaluate((node) => {
    const sceneNode = node.classList.contains('directive-hero-scene') ? node : node.querySelector('.directive-hero-scene');
    const foreground = sceneNode.querySelector('[data-hero-scene-layer="foreground"]');
    return foreground.offsetTop - (sceneNode.clientHeight / 2);
  });

  async function measureDesktopHero(route, selector, outsideSelector, stableSelector = outsideSelector) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${baseUrl}/production?route=${route}`);
    await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
    const hero = page.locator(selector);
    await hero.waitFor();
    const finePointer = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
    const collapsedHeight = Math.round(await hero.evaluate((node) => node.getBoundingClientRect().height));
    const glyphBorderBeforeHover = await hero.locator('.directive-responsive-hero-toggle').evaluate(
      (node) => getComputedStyle(node, '::after').borderColor
    );
    const outsideTopBeforeHover = Math.round(await page.locator(stableSelector).evaluate((node) => node.getBoundingClientRect().top));
    await hero.hover();
    await page.waitForTimeout(220);
    const hoverHeight = Math.round(await hero.evaluate((node) => node.getBoundingClientRect().height));
    const glyphBorderAfterHover = await hero.locator('.directive-responsive-hero-toggle').evaluate(
      (node) => getComputedStyle(node, '::after').borderColor
    );
    const outsideTopAfterHover = Math.round(await page.locator(stableSelector).evaluate((node) => node.getBoundingClientRect().top));
    await hero.click();
    await page.waitForTimeout(220);
    const expandedHeight = Math.round(await hero.evaluate((node) => node.getBoundingClientRect().height));
    await page.locator(outsideSelector).click();
    await page.waitForTimeout(220);
    const afterOutsideClickHeight = Math.round(await hero.evaluate((node) => node.getBoundingClientRect().height));
    const expandedAfterOutsideClick = await hero.evaluate((node) => node.classList.contains('is-expanded'));
    const scene = await hero.evaluate((node) => {
      const layers = [...node.querySelectorAll('.directive-hero-scene-layer')];
      const sceneNode = node.classList.contains('directive-hero-scene') ? node : node.querySelector('.directive-hero-scene');
      const sceneStyle = getComputedStyle(sceneNode);
      const foreground = layers.find((layer) => layer.dataset.heroSceneLayer === 'foreground');
      const foregroundStyle = getComputedStyle(foreground);
      return {
        order: layers.map((layer) => layer.dataset.heroSceneLayer),
        objectFits: layers.map((layer) => getComputedStyle(layer).objectFit),
        naturalSizes: layers.map((layer) => `${layer.naturalWidth}x${layer.naturalHeight}`),
        animations: layers.map((layer) => getComputedStyle(layer).animationName),
        timingFunctions: layers.map((layer) => getComputedStyle(layer).animationTimingFunction),
        starBlends: layers
          .filter((layer) => layer.dataset.heroSceneLayer === 'stars' || layer.dataset.heroSceneLayer === 'stars-glow')
          .map((layer) => getComputedStyle(layer).mixBlendMode),
        starPositions: layers
          .filter((layer) => layer.dataset.heroSceneLayer === 'stars' || layer.dataset.heroSceneLayer === 'stars-glow')
          .map((layer) => getComputedStyle(layer).objectPosition),
        willChange: layers.map((layer) => getComputedStyle(layer).willChange),
        sourceCanvas: {
          widthRatio: foreground.offsetWidth / sceneNode.clientWidth,
          aspectRatio: foreground.offsetWidth / foreground.offsetHeight,
          centerXRatio: foreground.offsetLeft / sceneNode.clientWidth,
          centerYRatio: foreground.offsetTop / sceneNode.clientHeight,
          verticalOffset: foreground.offsetTop - (sceneNode.clientHeight / 2),
          translate: foregroundStyle.translate
        },
        motionBounds: {
          scaleStart: sceneStyle.getPropertyValue('--directive-hero-ship-scale-start').trim(),
          scaleEnd: sceneStyle.getPropertyValue('--directive-hero-ship-scale-end').trim(),
          rotateStart: sceneStyle.getPropertyValue('--directive-hero-ship-rotate-start').trim(),
          rotateEnd: sceneStyle.getPropertyValue('--directive-hero-ship-rotate-end').trim()
        }
      };
    });
    await hero.click();
    await page.waitForTimeout(220);
    const finalHeight = Math.round(await hero.evaluate((node) => node.getBoundingClientRect().height));
    const expandedFinally = await hero.evaluate((node) => node.classList.contains('is-expanded'));
    await page.close();
    return {
      finePointer,
      collapsedHeight,
      hoverHeight,
      glyphBorderBeforeHover,
      glyphBorderAfterHover,
      outsideTopBeforeHover,
      outsideTopAfterHover,
      expandedHeight,
      afterOutsideClickHeight,
      expandedAfterOutsideClick,
      finalHeight,
      expandedFinally,
      scene
    };
  }

  const desktopCampaignHero = await measureDesktopHero(
    'campaign',
    '.campaign-dashboard .directive-responsive-hero',
    '.campaign-dashboard-heading',
    '.campaign-dashboard-actions'
  );
  const desktopShipHero = await measureDesktopHero('ship', '.ship-hero.directive-responsive-hero', '.ship-board');
  for (const [label, result] of [['Campaign', desktopCampaignHero], ['Ship', desktopShipHero]]) {
    assert.equal(result.finePointer, true);
    assert.equal(result.collapsedHeight, 140, `${label} must start compact`);
    assert.equal(result.hoverHeight, 140, `${label} hover must not change geometry`);
    assert.notEqual(result.glyphBorderAfterHover, result.glyphBorderBeforeHover, `${label} hover must highlight only the toggle glyph`);
    assert.equal(result.outsideTopAfterHover, result.outsideTopBeforeHover, `${label} hover must not move content below the banner`);
    assert.equal(result.expandedHeight, 320, `${label} click must expand the desktop banner forty pixels taller`);
    assert.equal(result.afterOutsideClickHeight, 320, `${label} outside click must leave the taller desktop banner expanded`);
    assert.equal(result.expandedAfterOutsideClick, true);
    assert.equal(result.finalHeight, 140, `${label} second banner click must collapse it`);
    assert.equal(result.expandedFinally, false);
    assert.deepEqual(result.scene.order, ['background', 'stars', 'stars-glow', 'foreground']);
    assert.deepEqual(result.scene.objectFits, ['cover', 'cover', 'cover', 'contain'], `${label} must preserve the complete foreground ship canvas without changing the fill layers`);
    assert.deepEqual(result.scene.naturalSizes, ['1672x941', '1672x941', '1672x941', '1672x941'], `${label} layered scene assets must retain their original authored dimensions`);
    assert.deepEqual(result.scene.animations, [
      'none', 'directive-hero-stars-drift', 'directive-hero-stars-parallax, directive-hero-stars-shimmer', 'directive-hero-ship-drift'
    ], `${label} scene must animate while compact`);
    assert.deepEqual(result.scene.timingFunctions, [
      'ease', 'linear', 'linear, ease-in-out', 'linear'
    ], `${label} drift must not become visually stationary near its endpoints`);
    assert.deepEqual(result.scene.willChange, ['auto', 'transform', 'transform, opacity, filter', 'transform']);
    assert.deepEqual(result.scene.starBlends, ['plus-lighter', 'plus-lighter'], `${label} star planes must use additive blending`);
    assert.deepEqual(result.scene.starPositions, ['50% 50%', '48% 52%'], `${label} star planes must start from visibly offset positions`);
    assert.ok(Math.abs(result.scene.sourceCanvas.widthRatio - 1) < .002, `${label} ship source canvas must use the original full-width baseline before scaling`);
    assert.ok(Math.abs(result.scene.sourceCanvas.aspectRatio - (1672 / 941)) < .002, `${label} ship source canvas must preserve its intrinsic aspect ratio`);
    assert.ok(Math.abs(result.scene.sourceCanvas.centerXRatio - .5) < .002, `${label} ship source canvas must stay horizontally centered`);
    assert.ok(Math.abs(result.scene.sourceCanvas.verticalOffset - 40) < 1, `${label} ship source canvas must sit 40px below the banner center`);
    assert.equal(result.scene.sourceCanvas.translate, '-50% -50%', `${label} ship source canvas must center before the banner clips its scaled composition`);
    assert.deepEqual(result.scene.motionBounds, {
      scaleStart: '.79', scaleEnd: '.81', rotateStart: '-.15deg', rotateEnd: '.15deg'
    }, `${label} ship must drift around an eighty-percent source-canvas scale without rewriting the asset`);
  }

  const motionPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await motionPage.goto(`${baseUrl}/production?route=ship`);
  await motionPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const motionHero = motionPage.locator('.ship-hero.directive-responsive-hero');
  const sampleShipMotion = () => motionHero.evaluate((node) => {
    const layer = node.querySelector('[data-hero-scene-layer="foreground"]');
    const stars = node.querySelector('[data-hero-scene-layer="stars"]');
    const glow = node.querySelector('[data-hero-scene-layer="stars-glow"]');
    const matrix = new DOMMatrixReadOnly(getComputedStyle(layer).transform);
    const starMatrix = new DOMMatrixReadOnly(getComputedStyle(stars).transform);
    const glowMatrix = new DOMMatrixReadOnly(getComputedStyle(glow).transform);
    const rect = node.getBoundingClientRect();
    return {
      a: matrix.a,
      b: matrix.b,
      e: matrix.e,
      f: matrix.f,
      starE: starMatrix.e,
      starF: starMatrix.f,
      glowE: glowMatrix.e,
      glowF: glowMatrix.f,
      glowOpacity: Number(getComputedStyle(glow).opacity),
      width: rect.width,
      height: rect.height
    };
  });
  const translationDistance = (before, after, x = 'e', y = 'f') => Math.hypot(after[x] - before[x], after[y] - before[y]);
  const compactMotionSamples = [await sampleShipMotion()];
  for (let sampleIndex = 0; sampleIndex < 4; sampleIndex += 1) {
    await motionPage.waitForTimeout(1000);
    compactMotionSamples.push(await sampleShipMotion());
  }
  const compactMotionStart = compactMotionSamples[0];
  const compactMotionEnd = compactMotionSamples.at(-1);
  assert.ok(
    translationDistance(compactMotionStart, compactMotionEnd) >= 6,
    'compact hero ship motion must be apparent during a four-second glance'
  );
  assert.ok(
    translationDistance(compactMotionStart, compactMotionEnd, 'starE', 'starF') >= 2,
    'compact stable-star drift must be apparent during a four-second glance'
  );
  assert.ok(
    translationDistance(compactMotionStart, compactMotionEnd, 'glowE', 'glowF') >= 4,
    'compact glow-star plane must produce independent four-second parallax'
  );
  const compactGlowOpacities = compactMotionSamples.map((sample) => sample.glowOpacity);
  assert.ok(
    Math.max(...compactGlowOpacities) - Math.min(...compactGlowOpacities) >= .12,
    'compact glow-star plane must visibly pulse during a four-second glance'
  );
  await motionHero.click();
  await motionPage.waitForTimeout(220);
  const expandedMotionStart = await sampleShipMotion();
  await motionPage.waitForTimeout(4000);
  const expandedMotionEnd = await sampleShipMotion();
  assert.ok(
    translationDistance(expandedMotionStart, expandedMotionEnd) >= 6,
    'expanded hero ship motion must be apparent during a four-second glance'
  );
  await motionPage.close();

  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(`${baseUrl}/production?route=campaign`);
  await touchPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const mobileCampaignHero = touchPage.locator('.campaign-dashboard .directive-responsive-hero');
  const mobileCampaignToggle = mobileCampaignHero.locator('.directive-responsive-hero-toggle');
  assert.equal(Math.round(await mobileCampaignHero.evaluate((node) => node.getBoundingClientRect().height)), 112);
  assert.ok(Math.abs(await measureForegroundVerticalOffset(mobileCampaignHero)) < 1, 'mobile compact Campaign ship must return to center');
  assert.deepEqual(await mobileCampaignHero.evaluate((node) => {
    const style = getComputedStyle(node.classList.contains('directive-hero-scene') ? node : node.querySelector('.directive-hero-scene'));
    return {
      scaleStart: style.getPropertyValue('--directive-hero-ship-scale-start').trim(),
      scaleEnd: style.getPropertyValue('--directive-hero-ship-scale-end').trim(),
      restScale: style.getPropertyValue('--directive-hero-ship-rest-scale').trim()
    };
  }), { scaleStart: '1.035', scaleEnd: '1.045', restScale: '1.04' }, 'mobile Campaign ship must be thirty percent larger than the desktop baseline');
  await mobileCampaignToggle.tap();
  await touchPage.waitForTimeout(220);
  assert.equal(Math.round(await mobileCampaignHero.evaluate((node) => node.getBoundingClientRect().height)), 220);
  assert.ok(Math.abs(await measureForegroundVerticalOffset(mobileCampaignHero)) < 1, 'mobile expanded Campaign ship must stay centered');
  assert.equal(await mobileCampaignToggle.getAttribute('aria-expanded'), 'true');
  await mobileCampaignToggle.tap();
  await touchPage.waitForTimeout(220);
  assert.equal(Math.round(await mobileCampaignHero.evaluate((node) => node.getBoundingClientRect().height)), 112);
  await mobileCampaignToggle.tap();
  await touchPage.waitForTimeout(220);
  await touchPage.locator('.campaign-dashboard-heading').tap();
  await touchPage.waitForTimeout(220);
  assert.equal(Math.round(await mobileCampaignHero.evaluate((node) => node.getBoundingClientRect().height)), 220, 'outside tap must leave Campaign hero expanded');
  await mobileCampaignToggle.tap();
  await touchPage.waitForTimeout(220);
  assert.equal(Math.round(await mobileCampaignHero.evaluate((node) => node.getBoundingClientRect().height)), 112);

  await touchPage.locator('[data-route-id="ship"]').tap();
  await touchPage.waitForSelector('.directive-expanded-shell[data-active-route="ship"]');
  const mobileShipHero = touchPage.locator('.ship-hero.directive-responsive-hero');
  const mobileShipToggle = mobileShipHero.locator('.directive-responsive-hero-toggle');
  assert.equal(Math.round(await mobileShipHero.evaluate((node) => node.getBoundingClientRect().height)), 112);
  assert.ok(Math.abs(await measureForegroundVerticalOffset(mobileShipHero)) < 1, 'mobile compact Ship image must return to center');
  await mobileShipToggle.tap();
  await touchPage.waitForTimeout(220);
  assert.equal(Math.round(await mobileShipHero.evaluate((node) => node.getBoundingClientRect().height)), 220);
  assert.ok(Math.abs(await measureForegroundVerticalOffset(mobileShipHero)) < 1, 'mobile expanded Ship image must stay centered');
  assert.equal(await mobileShipToggle.getAttribute('aria-expanded'), 'true');

  await touchPage.locator('[data-route-id="campaign"]').tap();
  await touchPage.waitForSelector('.directive-expanded-shell[data-active-route="campaign"]');
  const returnedCampaignHero = touchPage.locator('.campaign-dashboard .directive-responsive-hero');
  assert.equal(Math.round(await returnedCampaignHero.evaluate((node) => node.getBoundingClientRect().height)), 112, 'Campaign must start compact after route re-entry');
  await touchContext.close();

  const wideTouchContext = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true
  });
  const wideTouchPage = await wideTouchContext.newPage();
  await wideTouchPage.goto(`${baseUrl}/production?route=ship`);
  await wideTouchPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const wideTouchMotion = await wideTouchPage.locator('.ship-hero.directive-hero-scene').evaluate((node) => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    shipX: getComputedStyle(node).getPropertyValue('--directive-hero-ship-x-end').trim(),
    starsX: getComputedStyle(node).getPropertyValue('--directive-hero-stars-x-end').trim(),
    glowStarsX: getComputedStyle(node).getPropertyValue('--directive-hero-glow-stars-x-end').trim(),
    scaleStart: getComputedStyle(node).getPropertyValue('--directive-hero-ship-scale-start').trim(),
    scaleEnd: getComputedStyle(node).getPropertyValue('--directive-hero-ship-scale-end').trim(),
    rotateStart: getComputedStyle(node).getPropertyValue('--directive-hero-ship-rotate-start').trim(),
    rotateEnd: getComputedStyle(node).getPropertyValue('--directive-hero-ship-rotate-end').trim()
  }));
  assert.deepEqual(wideTouchMotion, {
    coarse: true,
    shipX: '1.5%',
    starsX: '.6%',
    glowStarsX: '-.9%',
    scaleStart: '.795',
    scaleEnd: '.805',
    rotateStart: '-.075deg',
    rotateEnd: '.075deg'
  }, 'wide coarse-pointer screens must use half-strength motion');
  await wideTouchContext.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce'
  });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${baseUrl}/production?route=ship`);
  await reducedPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const reducedMotion = await reducedPage.locator('.ship-hero.directive-responsive-hero').evaluate((node) => ({
    transition: getComputedStyle(node).transitionDuration,
    animations: [...node.querySelectorAll('.directive-hero-scene-layer')].map((layer) => getComputedStyle(layer).animationName),
    foregroundScale: new DOMMatrixReadOnly(getComputedStyle(node.querySelector('[data-hero-scene-layer="foreground"]')).transform).a
  }));
  assert.equal(reducedMotion.transition, '0s', 'reduced motion must remove the hero height transition');
  assert.deepEqual(reducedMotion.animations, ['none', 'none', 'none', 'none'], 'reduced motion must freeze every scene layer');
  assert.ok(Math.abs(reducedMotion.foregroundScale - .8) < .001, 'reduced motion must retain the twenty-percent-smaller ship framing');
  await reducedContext.close();

  const mobileReducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce'
  });
  const mobileReducedPage = await mobileReducedContext.newPage();
  await mobileReducedPage.goto(`${baseUrl}/production?route=ship`);
  await mobileReducedPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const mobileReducedMotion = await mobileReducedPage.locator('.ship-hero.directive-responsive-hero').evaluate((node) => ({
    foregroundScale: new DOMMatrixReadOnly(getComputedStyle(node.querySelector('[data-hero-scene-layer="foreground"]')).transform).a,
    verticalOffset: node.querySelector('[data-hero-scene-layer="foreground"]').offsetTop - (node.clientHeight / 2),
    animations: [...node.querySelectorAll('.directive-hero-scene-layer')].map((layer) => getComputedStyle(layer).animationName)
  }));
  assert.ok(Math.abs(mobileReducedMotion.foregroundScale - 1.04) < .001, 'mobile reduced motion must retain the thirty-percent-larger ship framing');
  assert.ok(Math.abs(mobileReducedMotion.verticalOffset) < 1, 'mobile reduced motion must keep the ship centered');
  assert.deepEqual(mobileReducedMotion.animations, ['none', 'none', 'none', 'none']);
  await mobileReducedContext.close();

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
  await peoplePage.mouse.move(0, 0);
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
  await peoplePage.evaluate(async () => {
    const { createPlayerPortraitImage } = await import('/src/ui/directive-media.js');
    const current = document.querySelector('.people-desktop-journal .people-row-image.directive-player-portrait-frame');
    current.replaceWith(createPlayerPortraitImage(null, { wrapperClass: 'people-row-image', label: 'Sam Vickers' }));
  });
  const compactPlayerFallback = await peoplePage.locator(
    '.people-desktop-journal .people-row-image.directive-player-portrait-frame'
  ).evaluate((frame) => {
    const icon = frame.querySelector('.directive-asset-mask-icon');
    const label = frame.querySelector('.directive-media-placeholder-label');
    const frameRect = frame.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    return {
      frameCenterX: frameRect.left + frameRect.width / 2,
      frameCenterY: frameRect.top + frameRect.height / 2,
      iconCenterX: iconRect.left + iconRect.width / 2,
      iconCenterY: iconRect.top + iconRect.height / 2,
      labelDisplay: getComputedStyle(label).display
    };
  });
  assert.ok(Math.abs(compactPlayerFallback.iconCenterX - compactPlayerFallback.frameCenterX) <= 1, 'the compact PC fallback emblem must be horizontally centered');
  assert.ok(Math.abs(compactPlayerFallback.iconCenterY - compactPlayerFallback.frameCenterY) <= 1, 'the compact PC fallback emblem must be vertically centered');
  assert.equal(compactPlayerFallback.labelDisplay, 'none', 'the compact PC fallback must reserve the thumbnail for the emblem');
  await peoplePage.screenshot({ path: path.join(artifactRoot, 'people-compact-player-fallback-1024x768.png') });
  const maraRosterRow = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"]');
  const maraRosterSelect = maraRosterRow.locator('.people-row');
  const maraRosterHandle = maraRosterRow.locator('.collection-person-drag-handle');
  const sampleMaraRosterSurface = () => maraRosterRow.evaluate((row) => {
    const select = row.querySelector('.people-row');
    const handle = row.querySelector('.collection-person-drag-handle');
    const rowStyle = getComputedStyle(row);
    const selectStyle = getComputedStyle(select);
    const handleStyle = getComputedStyle(handle);
    return {
      rowBackground: rowStyle.backgroundColor,
      rowBorderBottom: `${rowStyle.borderBottomWidth} ${rowStyle.borderBottomStyle} ${rowStyle.borderBottomColor}`,
      selectBackground: selectStyle.backgroundColor,
      selectBorderBottom: `${selectStyle.borderBottomWidth} ${selectStyle.borderBottomStyle}`,
      handleBackground: handleStyle.backgroundColor
    };
  });
  await maraRosterSelect.hover();
  const bodyHoverSurface = await sampleMaraRosterSurface();
  assert.notEqual(bodyHoverSurface.rowBackground, 'rgba(0, 0, 0, 0)', 'hovering the character body must highlight the shared outer card surface');
  assert.equal(bodyHoverSurface.selectBackground, 'rgba(0, 0, 0, 0)', 'the character body must not paint a separate hover box');
  assert.equal(bodyHoverSurface.handleBackground, 'rgba(0, 0, 0, 0)', 'the reorder handle must remain an icon on the shared card surface');
  assert.equal(bodyHoverSurface.selectBorderBottom, '0px none', 'the character body must not own a partial-width divider');
  assert.match(bodyHoverSurface.rowBorderBottom, /^1px solid /, 'the shared outer card must own one full-width divider');
  await maraRosterHandle.hover();
  const handleHoverSurface = await sampleMaraRosterSurface();
  assert.equal(handleHoverSurface.rowBackground, bodyHoverSurface.rowBackground, 'hovering the reorder handle must retain the same full-card highlight');
  assert.equal(handleHoverSurface.selectBackground, 'rgba(0, 0, 0, 0)', 'handle hover must not split the character body into a separate surface');
  const selectedRosterRow = peoplePage.locator('.people-desktop-journal .collection-person-row.active');
  const selectedBackgroundBeforeHover = await selectedRosterRow.evaluate((row) => getComputedStyle(row).backgroundImage);
  await selectedRosterRow.locator('.collection-person-drag-handle').hover();
  assert.equal(
    await selectedRosterRow.evaluate((row) => getComputedStyle(row).backgroundImage),
    selectedBackgroundBeforeHover,
    'hovering the selected card must preserve its authoritative selection gradient'
  );
  await peoplePage.mouse.move(0, 0);
  await selectedRosterRow.locator('.collection-person-drag-handle').focus();
  assert.equal(
    await selectedRosterRow.evaluate((row) => getComputedStyle(row).backgroundImage),
    selectedBackgroundBeforeHover,
    'focusing the selected card handle must preserve its authoritative selection gradient'
  );
  const fallbackPlayerHandle = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="player.sam-vickers"] .collection-drag-handle');
  const fallbackPlayerHandleBox = await fallbackPlayerHandle.boundingBox();
  await peoplePage.mouse.move(fallbackPlayerHandleBox.x + 2, fallbackPlayerHandleBox.y + fallbackPlayerHandleBox.height / 2);
  await peoplePage.mouse.down();
  await peoplePage.waitForFunction(() => document.querySelector('.people-drag-ghost') && document.querySelector('.people-card-drop-slot'));
  await peoplePage.mouse.move(
    fallbackPlayerHandleBox.x + 2,
    fallbackPlayerHandleBox.y + fallbackPlayerHandleBox.height / 2 + 34,
    { steps: 4 }
  );
  await peoplePage.waitForFunction(() => {
    const ghost = document.querySelector('.people-drag-ghost')?.getBoundingClientRect();
    const slot = document.querySelector('.people-card-drop-slot')?.getBoundingClientRect();
    return Boolean(ghost && slot && ghost.top > slot.top + 10);
  });
  assert.deepEqual(await peoplePage.evaluate(() => ({
    ghost: getComputedStyle(document.querySelector('.people-drag-ghost')).borderRadius,
    slot: getComputedStyle(document.querySelector('.people-card-drop-slot')).borderRadius
  })), { ghost: '0px', slot: '0px' }, 'the held PC card and its destination outline must share square corners');
  await peoplePage.screenshot({ path: path.join(artifactRoot, 'people-compact-player-fallback-active-drag-1024x768.png') });
  await peoplePage.keyboard.press('Escape');
  await peoplePage.waitForFunction(() => !document.querySelector('.people-drag-ghost'));
  await peoplePage.mouse.up();
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
  const bronnLocation = async () => peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="hadrik-bronn"]').evaluate((row) => {
    const category = row.closest('.collection-category');
    return `${category?.dataset.categoryId}:${[...row.parentElement.children].indexOf(row)}`;
  });
  let previousBronnLocation = await bronnLocation();
  for (let move = 0; move < 3; move += 1) {
    await peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="hadrik-bronn"] .collection-drag-handle').press('ArrowDown');
    await peoplePage.waitForFunction(({ personId, previous }) => {
      const row = document.querySelector(`.people-desktop-journal .collection-person-row[data-person-id="${personId}"]`);
      const category = row?.closest('.collection-category');
      const current = `${category?.dataset.categoryId}:${row ? [...row.parentElement.children].indexOf(row) : -1}`;
      return current !== previous;
    }, { personId: 'hadrik-bronn', previous: previousBronnLocation });
    previousBronnLocation = await bronnLocation();
  }
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
  assert.deepEqual(await peoplePage.evaluate(() => ({
    rootClass: document.documentElement.classList.contains('directive-reorder-grabbing'),
    root: getComputedStyle(document.documentElement).cursor,
    card: getComputedStyle(document.querySelector('.people-row')).cursor,
    slot: getComputedStyle(document.querySelector('.people-card-drop-slot')).cursor
  })), { rootClass: true, root: 'grabbing', card: 'grabbing', slot: 'grabbing' });
  await peoplePage.keyboard.press('Escape');
  await peoplePage.waitForFunction(() => !document.querySelector('.people-drag-ghost'));
  assert.equal(await peoplePage.evaluate(() => document.documentElement.classList.contains('directive-reorder-grabbing')), false);
  assert.equal(await peoplePage.locator('.people-drag-ghost').count(), 0, 'Escape must finish the return-to-origin animation');
  assert.equal(await peoplePage.evaluate(() => document.activeElement?.closest('.collection-person-row')?.dataset.personId), 'priya-nayar', 'Escape must restore focus to the returned card handle');
  await peoplePage.mouse.up();
  assert.equal(await peoplePage.locator(`.people-desktop-journal .collection-person-list[data-category-id="${cancelledPriyaCategory}"] .collection-person-row[data-person-id="priya-nayar"]`).count(), 1, 'Escape must restore the person to the original list');

  const overlappingPriyaHandle = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="priya-nayar"] .collection-drag-handle');
  const overlappingMaraHandle = peoplePage.locator('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"] .collection-drag-handle');
  const overlappingPriyaBox = await overlappingPriyaHandle.boundingBox();
  const overlappingMaraBox = await overlappingMaraHandle.boundingBox();
  await overlappingPriyaHandle.dispatchEvent('pointerdown', {
    pointerId: 80, pointerType: 'mouse', button: 0,
    clientX: overlappingPriyaBox.x + overlappingPriyaBox.width / 2,
    clientY: overlappingPriyaBox.y + overlappingPriyaBox.height / 2
  });
  await overlappingMaraHandle.dispatchEvent('pointerdown', {
    pointerId: 81, pointerType: 'mouse', button: 0,
    clientX: overlappingMaraBox.x + overlappingMaraBox.width / 2,
    clientY: overlappingMaraBox.y + overlappingMaraBox.height / 2
  });
  assert.equal(await peoplePage.locator('.people-drag-ghost').count(), 2, 'independent reorder controllers can overlap while one card is docking');
  await peoplePage.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', {
    pointerId: 80, pointerType: 'mouse', bubbles: true
  })));
  await peoplePage.waitForFunction(() => document.querySelectorAll('.people-drag-ghost').length === 1);
  assert.equal(await peoplePage.evaluate(() => document.documentElement.classList.contains('directive-reorder-grabbing')), true, 'finishing one controller must preserve cursor ownership for another active drag');
  await peoplePage.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', {
    pointerId: 81, pointerType: 'mouse', bubbles: true
  })));
  await peoplePage.waitForFunction(() => document.querySelectorAll('.people-drag-ghost').length === 0);
  assert.equal(await peoplePage.evaluate(() => document.documentElement.classList.contains('directive-reorder-grabbing')), false, 'the final controller must release shared cursor ownership');

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
  await peoplePage.screenshot({ path: path.join(artifactRoot, 'people-card-active-drag-1024x768.png') });
  const heldCardPresentation = await peoplePage.locator('.people-drag-ghost').evaluate((ghost) => {
    const style = getComputedStyle(ghost);
    const layerZ = Number.parseInt(getComputedStyle(ghost.parentElement).zIndex, 10);
    const shellZ = Number.parseInt(getComputedStyle(document.querySelector('.directive-runtime-panel.directive-expanded-shell')).zIndex, 10);
    return {
      aboveShell: layerZ > shellZ,
      borderStyles: [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle],
      background: style.backgroundColor,
      transform: style.transform,
      willChange: style.willChange,
      active: ghost.classList.contains('active'),
      inlineDeclarations: [ghost, ...ghost.querySelectorAll('*')]
        .reduce((total, element) => total + element.style.length, 0)
    };
  });
  assert.deepEqual({
    aboveShell: heldCardPresentation.aboveShell,
    borderStyles: heldCardPresentation.borderStyles,
    background: heldCardPresentation.background,
    willChange: heldCardPresentation.willChange,
    active: heldCardPresentation.active
  }, {
    aboveShell: true,
    borderStyles: ['solid', 'solid', 'solid', 'solid'],
    background: 'rgb(20, 18, 28)',
    willChange: 'transform',
    active: false
  }, 'the held card must render as one complete elevated dossier above the Directive shell');
  assert.notEqual(heldCardPresentation.transform, 'none', 'the held card must use a compositor transform');
  assert.ok(heldCardPresentation.inlineDeclarations < 100, 'lifting a card must not snapshot thousands of computed declarations');
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
  await peoplePage.screenshot({ path: path.join(artifactRoot, 'people-card-docking-1024x768.png') });
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
  assert.equal(Math.round((await peoplePage.locator('.mobile-drag-ghost').boundingBox()).x), Math.round(touchCardBox.x), 'sub-threshold touch drift must not shift a horizontally locked card');
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

  const thresholdPage = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await thresholdPage.goto(`${baseUrl}/production?route=people`);
  await thresholdPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const thresholdHandle = thresholdPage.locator('.people-desktop-journal .collection-person-row[data-person-id="player.sam-vickers"] .collection-drag-handle');
  const thresholdHandleBox = await thresholdHandle.boundingBox();
  const thresholdPeerBox = await thresholdPage.locator('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"]').boundingBox();
  await thresholdPage.mouse.move(thresholdHandleBox.x + thresholdHandleBox.width / 2, thresholdHandleBox.y + thresholdHandleBox.height / 2);
  await thresholdPage.mouse.down();
  await thresholdPage.waitForFunction(() => document.querySelector('.people-card-drop-slot'));
  await thresholdPage.mouse.move(thresholdHandleBox.x + thresholdHandleBox.width / 2, thresholdPeerBox.y + thresholdPeerBox.height / 2 + 1);
  const thresholdState = await thresholdPage.evaluate(async () => {
    const slot = document.querySelector('.people-card-drop-slot');
    const peer = document.querySelector('.collection-person-row[data-person-id="mara-whitaker"]');
    if (!slot || !peer) throw new Error('threshold slot and Mara peer must be present');
    const sample = () => {
      const slotRect = slot.getBoundingClientRect();
      const peerRect = peer.getBoundingClientRect();
      return {
        slotTop: slotRect.top,
        slotLeft: slotRect.left,
        peerTop: peerRect.top
      };
    };
    const first = sample();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const second = sample();
    return {
      slotAnimations: slot.getAnimations().length,
      peerAnimating: peer.getAnimations().some(({ playState }) => playState === 'running'),
      adjacent: slot.previousElementSibling === peer,
      first,
      second
    };
  });
  assert.equal(thresholdState.slotAnimations, 0, 'crossing a card midpoint must settle the destination slot immediately');
  assert.equal(thresholdState.peerAnimating, true, 'crossing a card midpoint must retain sibling glide');
  assert.equal(thresholdState.adjacent, true, 'the sampled sibling must border the destination slot');
  assert.equal(thresholdState.second.slotTop, thresholdState.first.slotTop, 'the destination slot top must remain fixed across sibling reflow frames');
  assert.equal(thresholdState.second.slotLeft, thresholdState.first.slotLeft, 'the destination slot left must remain fixed across sibling reflow frames');
  assert.ok(thresholdState.second.peerTop < thresholdState.first.peerTop, 'Mara must glide upward from her former visual position toward the settled position');
  await thresholdPage.keyboard.press('Escape');
  await thresholdPage.waitForFunction(() => !document.querySelector('.people-drag-ghost'));
  await thresholdPage.mouse.up();
  await thresholdPage.close();

  const rapidReflowPage = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await rapidReflowPage.emulateMedia({ reducedMotion: 'no-preference' });
  await rapidReflowPage.goto(`${baseUrl}/production?route=people`);
  await rapidReflowPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  await rapidReflowPage.evaluate(() => {
    globalThis.__directiveReflowAnimationIds = { next: 1, values: new WeakMap() };
  });
  const rapidHandle = rapidReflowPage.locator('.people-desktop-journal .collection-person-row[data-person-id="player.sam-vickers"] .collection-drag-handle');
  const rapidHandleBox = await rapidHandle.boundingBox();
  const rapidPointerX = rapidHandleBox.x + rapidHandleBox.width / 2;
  const moveAcrossRapidRow = async (personId, side) => {
    const box = await rapidReflowPage.locator(`.people-desktop-journal .collection-person-row[data-person-id="${personId}"]`).boundingBox();
    const y = side === 'after' ? box.y + (box.height / 2) + 2 : box.y + 4;
    await rapidReflowPage.mouse.move(rapidPointerX, y);
  };
  const sampleRapidRows = async () => rapidReflowPage.evaluate(() => {
    const identity = globalThis.__directiveReflowAnimationIds;
    const result = {};
    for (const row of document.querySelectorAll('.people-desktop-journal .collection-person-row')) {
      if (row.getClientRects().length === 0) continue;
      const animations = row.getAnimations().filter((animation) => {
        const timing = animation.effect?.getTiming?.();
        const keyframes = animation.effect?.getKeyframes?.() || [];
        return timing?.duration === 170
          && keyframes.length === 2
          && String(keyframes[0]?.transform || '').startsWith('translateY(');
      });
      const animation = animations.find(({ playState }) => ['running', 'pending', 'paused'].includes(playState)) || null;
      if (animation && !identity.values.has(animation)) {
        identity.values.set(animation, identity.next);
        identity.next += 1;
      }
      const transform = getComputedStyle(row).transform;
      const matrix = transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
      const visualTop = row.getBoundingClientRect().top;
      const firstTransform = animation?.effect?.getKeyframes?.()[0]?.transform || 'none';
      const firstMatrix = firstTransform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(firstTransform);
      result[row.dataset.personId] = {
        animationId: animation ? identity.values.get(animation) : null,
        runningAnimations: animations.filter(({ playState }) => playState === 'running' || playState === 'pending').length,
        visualTop,
        layoutTop: visualTop - matrix.m42,
        reconstructedTop: visualTop - matrix.m42 + firstMatrix.m42
      };
    }
    return result;
  });
  await rapidReflowPage.mouse.move(rapidPointerX, rapidHandleBox.y + rapidHandleBox.height / 2);
  await rapidReflowPage.mouse.down();
  await rapidReflowPage.waitForFunction(() => document.querySelector('.people-card-drop-slot'));
  await moveAcrossRapidRow('mara-whitaker', 'after');
  const afterRapidMara = await sampleRapidRows();
  await moveAcrossRapidRow('kieran-vale', 'after');
  const afterRapidKieran = await sampleRapidRows();
  await moveAcrossRapidRow('priya-nayar', 'after');
  const afterRapidPriya = await sampleRapidRows();
  await rapidReflowPage.evaluate(async () => {
    const rows = ['kieran-vale', 'priya-nayar'].map((id) => document.querySelector(`.people-desktop-journal .collection-person-row[data-person-id="${id}"]`));
    const animations = rows.flatMap((row) => row?.getAnimations?.() || []).filter((animation) => animation.effect?.getTiming?.().duration === 170);
    animations.forEach((animation) => animation.pause());
    await Promise.all(animations.map((animation) => animation.ready));
  });
  const beforeRapidReverse = await sampleRapidRows();
  const priyaBeforeRapidReverse = beforeRapidReverse['priya-nayar'].visualTop;
  const kieranBeforeRapidReverse = beforeRapidReverse['kieran-vale'].visualTop;
  await moveAcrossRapidRow('kieran-vale', 'before');
  const afterRapidReverse = await sampleRapidRows();
  assert.ok(afterRapidMara['mara-whitaker'].animationId, 'the first rapid crossing must start Mara reflow');
  assert.equal(afterRapidKieran['mara-whitaker'].animationId, afterRapidMara['mara-whitaker'].animationId, 'crossing Kieran must not restart Mara when her layout endpoint is unchanged');
  assert.equal(afterRapidPriya['mara-whitaker'].animationId, afterRapidMara['mara-whitaker'].animationId, 'crossing Priya must not restart Mara when her layout endpoint is unchanged');
  assert.equal(afterRapidPriya['kieran-vale'].animationId, afterRapidKieran['kieran-vale'].animationId, 'crossing Priya must not restart Kieran when his layout endpoint is unchanged');
  assert.notEqual(afterRapidReverse['priya-nayar'].animationId, afterRapidPriya['priya-nayar'].animationId, 'a rapid upward reversal must retarget Priya when her layout endpoint changes');
  assert.notEqual(afterRapidReverse['kieran-vale'].animationId, afterRapidKieran['kieran-vale'].animationId, 'a rapid upward reversal must retarget Kieran when his layout endpoint changes');
  assert.equal(afterRapidReverse['mara-whitaker'].animationId, afterRapidMara['mara-whitaker'].animationId, 'the rapid upward reversal must retain Mara when her layout endpoint is unchanged');
  assert.ok(Math.abs(afterRapidReverse['priya-nayar'].reconstructedTop - priyaBeforeRapidReverse) < 1, 'reversed Priya must continue from her exact pre-retarget presentation top');
  assert.ok(Math.abs(afterRapidReverse['kieran-vale'].reconstructedTop - kieranBeforeRapidReverse) < 1, 'reversed Kieran must continue from his exact pre-retarget presentation top');
  for (const snapshot of [afterRapidMara, afterRapidKieran, afterRapidPriya, afterRapidReverse]) {
    assert.ok(Object.values(snapshot).every(({ runningAnimations }) => runningAnimations <= 1), 'one active pointer must own at most one reflow animation per row');
  }
  await rapidReflowPage.keyboard.press('Escape');
  await rapidReflowPage.waitForFunction(() => !document.querySelector('.people-drag-ghost'));
  await rapidReflowPage.mouse.up();
  await rapidReflowPage.close();

  const immediateDropPage = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await immediateDropPage.goto(`${baseUrl}/production?route=people`);
  await immediateDropPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const immediateHandle = immediateDropPage.locator('.people-desktop-journal .collection-person-row[data-person-id="mara-whitaker"] .collection-drag-handle');
  const immediateHandleBox = await immediateHandle.boundingBox();
  const immediateTargetBox = await immediateDropPage.locator('.people-desktop-journal .collection-person-row[data-person-id="rowan-saye"]').boundingBox();
  await immediateDropPage.mouse.move(immediateHandleBox.x + immediateHandleBox.width / 2, immediateHandleBox.y + immediateHandleBox.height / 2);
  await immediateDropPage.mouse.down();
  await immediateDropPage.waitForFunction(() => document.querySelector('.people-card-drop-slot'));
  await immediateDropPage.mouse.move(immediateTargetBox.x + immediateTargetBox.width / 2, immediateTargetBox.y + immediateTargetBox.height / 2);
  await immediateDropPage.mouse.up();
  const immediateDockAlignment = await immediateDropPage.evaluate(() => {
    const ghost = document.querySelector('.people-drag-ghost.is-snapping');
    const slot = document.querySelector('.people-card-drop-slot.is-drop-committing');
    const docking = ghost?.getAnimations().find((animation) => animation.effect?.getKeyframes?.().length === 2);
    const finalTransform = docking?.effect?.getKeyframes?.().at(-1)?.transform;
    const target = finalTransform ? new DOMMatrixReadOnly(finalTransform) : null;
    const slotRect = slot?.getBoundingClientRect();
    const slotTransform = slot ? getComputedStyle(slot).transform : 'none';
    const slotMatrix = slotTransform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(slotTransform);
    return {
      target: target ? { x: target.m41, y: target.m42 } : null,
      settledSlot: slotRect ? { x: slotRect.left - slotMatrix.m41, y: slotRect.top - slotMatrix.m42 } : null
    };
  });
  assert.ok(immediateDockAlignment.target && immediateDockAlignment.settledSlot, 'immediate release must retain a visible docking animation and slot');
  assert.ok(Math.abs(immediateDockAlignment.target.x - immediateDockAlignment.settledSlot.x) < 1, 'immediate release must dock to the settled slot x-coordinate');
  assert.ok(Math.abs(immediateDockAlignment.target.y - immediateDockAlignment.settledSlot.y) < 1, 'immediate release must dock to the settled slot y-coordinate');
  await immediateDropPage.waitForFunction(() => !document.querySelector('.people-drag-ghost'));
  await immediateDropPage.close();

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
  const mobileServiceRecord = expandedTouchDetail.locator('.people-service-record');
  assert.equal(await mobileServiceRecord.count(), 1, 'expanded mobile crew detail must render one public service record');
  assert.match(await mobileServiceRecord.textContent(), /Late fifties by human comparison/);
  assert.equal(await mobileServiceRecord.evaluate((record) => record.scrollWidth <= record.clientWidth), true, 'mobile public service record must not overflow its detail column');
  const expandedTouchCardBox = await expandedTouchCard.boundingBox();
  const expandedTouchHandle = expandedTouchCard.locator('.collection-drag-handle');
  const expandedTouchHandleBox = await expandedTouchHandle.boundingBox();
  await expandedTouchHandle.dispatchEvent('pointerdown', {
    pointerId: 79, pointerType: 'touch', button: 0,
    clientX: expandedTouchHandleBox.x + expandedTouchHandleBox.width / 2, clientY: expandedTouchHandleBox.y + expandedTouchHandleBox.height / 2
  });
  await mobilePeoplePage.waitForTimeout(200);
  const expandedTouchGhostBox = await mobilePeoplePage.locator('.people-drag-ghost').boundingBox();
  assert.ok(Math.abs((expandedTouchGhostBox.height / expandedTouchCardBox.height) - 1.015) < 0.005, 'touch-holding an expanded card handle must lift the complete rendered card at the approved 1.015 scale');
  assert.equal(await mobilePeoplePage.locator('.people-card-drop-slot').evaluate((slot) => getComputedStyle(slot).borderRadius), '5px', 'desktop slot geometry must not remove mobile card rounding');
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
  await mobilePeoplePage.close();

  const realTouchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3
  });
  const realTouchPage = await realTouchContext.newPage();
  await realTouchPage.goto(`${baseUrl}/production?route=people`);
  await realTouchPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  await realTouchPage.locator('.mobile-crew-item[data-person-id="player.sam-vickers"] .mobile-accordion-toggle').click();
  const realTouchBody = realTouchPage.locator('.mobile-crew-item[data-person-id="mara-whitaker"] .mobile-accordion-toggle');
  await realTouchBody.scrollIntoViewIfNeeded();
  const realTouchBodyBox = await realTouchBody.boundingBox();
  const realTouchBodyPoint = {
    x: realTouchBodyBox.x + realTouchBodyBox.width / 2,
    y: realTouchBodyBox.y + realTouchBodyBox.height / 2
  };
  const realTouchCdp = await realTouchContext.newCDPSession(realTouchPage);
  await realTouchCdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...realTouchBodyPoint, radiusX: 6, radiusY: 6, force: 1, id: 1 }]
  });
  await realTouchPage.waitForTimeout(200);
  assert.equal(await realTouchPage.locator('.people-drag-ghost').count(), 0, 'holding a mobile card body must preserve scrolling instead of lifting');
  await realTouchCdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: realTouchBodyPoint.x, y: realTouchBodyPoint.y - 24, radiusX: 6, radiusY: 6, force: 1, id: 1 }]
  });
  await realTouchCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await realTouchBody.click();
  assert.equal(await realTouchPage.locator('.mobile-crew-item[data-person-id="mara-whitaker"].is-open').count(), 1, 'card-body touch must retain the accordion action');
  await realTouchBody.click();
  assert.equal(await realTouchPage.locator('.mobile-crew-item[data-person-id="mara-whitaker"].is-open').count(), 0, 'card-body touch must retain accordion collapse');

  const realTouchHandle = realTouchPage.locator('.mobile-crew-item[data-person-id="mara-whitaker"] .collection-drag-handle');
  await realTouchHandle.scrollIntoViewIfNeeded();
  const realTouchHandleBox = await realTouchHandle.boundingBox();
  const realTouchHandlePoint = {
    x: realTouchHandleBox.x + realTouchHandleBox.width / 2,
    y: realTouchHandleBox.y + realTouchHandleBox.height / 2
  };
  await realTouchPage.evaluate(() => {
    globalThis.__directiveRealTouchTrace = { moves: 0, cancels: 0 };
    document.addEventListener('pointermove', () => { globalThis.__directiveRealTouchTrace.moves += 1; }, true);
    document.addEventListener('pointercancel', () => { globalThis.__directiveRealTouchTrace.cancels += 1; }, true);
  });
  await realTouchCdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...realTouchHandlePoint, radiusX: 6, radiusY: 6, force: 1, id: 2 }]
  });
  await realTouchPage.waitForTimeout(200);
  assert.equal(await realTouchPage.locator('.people-drag-ghost').count(), 1, 'holding the mobile reorder handle must lift after 175ms');
  const realTouchYPath = [
    realTouchHandlePoint.y - 50,
    realTouchHandlePoint.y - 110,
    realTouchHandlePoint.y - 30,
    realTouchHandlePoint.y - 140,
    realTouchHandlePoint.y - 20
  ];
  for (const y of realTouchYPath) {
    await realTouchCdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: realTouchHandlePoint.x, y, radiusX: 6, radiusY: 6, force: 1, id: 2 }]
    });
    await realTouchPage.waitForTimeout(12);
  }
  const realTouchTrace = await realTouchPage.evaluate(() => globalThis.__directiveRealTouchTrace);
  assert.ok(realTouchTrace.moves >= 4, `rapid handle reversals must retain pointer movement (${realTouchTrace.moves} observed)`);
  assert.equal(realTouchTrace.cancels, 0, 'native scrolling must not cancel an active handle drag');
  assert.equal(await realTouchPage.locator('.people-drag-ghost').count(), 1, 'rapid handle reversals must keep the lifted card active');
  assert.equal(await realTouchPage.locator('.people-card-drop-slot').count(), 1, 'rapid handle reversals must retain one exact destination slot');
  await realTouchPage.screenshot({ path: path.join(artifactRoot, 'people-card-active-drag-390x844.png') });
  await realTouchCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await realTouchPage.waitForFunction(() => !document.querySelector('.people-drag-ghost'));
  assert.equal(await realTouchPage.locator('.mobile-crew-item').count(), 6, 'real-touch reordering must preserve every mobile crew card');
  await realTouchPage.close();
  await realTouchContext.close();

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
