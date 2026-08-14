import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const directiveCss = await readFile(path.join(repoRoot, 'styles', 'directive.css'), 'utf8');
assert.match(
  directiveCss,
  /@keyframes directive-hero-stars-far-cruise\s*\{\s*to\s*\{\s*transform:\s*translate3d\(-1344px,\s*-840px,\s*0\);\s*\}\s*\}/,
  'far-star loop endpoint must equal exactly one displayed far tile'
);
assert.match(
  directiveCss,
  /@keyframes directive-hero-stars-near-cruise\s*\{\s*to\s*\{\s*transform:\s*translate3d\(-960px,\s*-600px,\s*0\);\s*\}\s*\}/,
  'near-star loop endpoint must equal exactly one displayed near tile'
);
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
  ship: ['.ship-cohesion-workspace', '.ship-cohesion-ring', '.ship-task-nav', '.ship-task-detail'],
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

  const relayPage = await browser.newPage({ viewport: viewports[0] });
  await relayPage.goto(`${baseUrl}/production?route=campaign`);
  await relayPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);

  const relayBehavior = await relayPage.evaluate(() => {
    const segments = [...document.querySelectorAll('.directive-lcars-rail-segment')];
    const animations = segments.map((segment) => segment.getAnimations({ subtree: true })
      .find((animation) => animation.animationName === 'directive-lcars-relay-press'));
    const rgbLuminance = ([red, green, blue]) => (red * .2126) + (green * .7152) + (blue * .0722);
    const parseRgb = (value) => {
      const channels = value.match(/[\d.]+/g)?.slice(-3).map(Number) ?? [];
      return channels.length === 3 ? channels : null;
    };
    const parseCenterOverlay = (value) => {
      const colors = [...value.matchAll(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)]
        .map((match) => match.slice(1).map((channel) => Number(channel) * 255));
      return colors[1] ?? null;
    };
    const animationCount = animations.filter(Boolean).length;
    if (animationCount !== segments.length) {
      return { segmentCount: segments.length, animationCount };
    }
    const firstStyle = getComputedStyle(segments[0], '::after');
    animations.forEach((animation) => animation.pause());
    let maxLit = 0;
    let sawSolo = false;
    let sawPair = false;
    let activePair = null;
    const pairWindows = [];
    for (let time = 0; time <= 32000; time += 100) {
      animations.forEach((animation) => { animation.currentTime = time; });
      const litSegments = segments
        .map((segment, index) => ({ index: index + 1, opacity: Number.parseFloat(getComputedStyle(segment, '::after').opacity) }))
        .filter(({ opacity }) => opacity > .05)
        .map(({ index }) => index);
      const lit = litSegments.length;
      maxLit = Math.max(maxLit, lit);
      sawSolo ||= lit === 1;
      sawPair ||= lit === 2;
      if (lit === 2) {
        const signature = litSegments.join(',');
        if (!activePair || activePair.signature !== signature || time > activePair.end + 100) {
          activePair = { signature, start: time, end: time };
          pairWindows.push(activePair);
        } else {
          activePair.end = time;
        }
      } else {
        activePair = null;
      }
    }
    animations.forEach((animation) => {
      animation.currentTime = Number(animation.effect.getTiming().delay) + 1000;
    });
    const compositeLuminanceLift = segments.map((segment) => {
      const face = parseRgb(getComputedStyle(segment).backgroundColor);
      const overlayStyle = getComputedStyle(segment, '::after');
      const overlay = parseCenterOverlay(overlayStyle.backgroundImage);
      const opacity = Number.parseFloat(overlayStyle.opacity);
      const composite = face.map((channel, index) => channel + ((overlay[index] - channel) * opacity));
      return rgbLuminance(composite) - rgbLuminance(face);
    });
    return {
      segmentCount: segments.length,
      animationCount,
      duration: animations[0]?.effect.getTiming().duration,
      illuminatedOpacity: Number.parseFloat(getComputedStyle(segments[0], '::after').opacity),
      compositeLuminanceLift,
      keyframeOffsets: animations[0].effect.getKeyframes().map((frame) => frame.offset),
      segment: {
        isolation: getComputedStyle(segments[0]).isolation,
        labelZIndices: [
          getComputedStyle(segments[0].querySelector('b')).zIndex,
          getComputedStyle(segments[0].querySelector('small')).zIndex
        ]
      },
      overlay: {
        pointerEvents: firstStyle.pointerEvents,
        filter: firstStyle.filter,
        boxShadowLayers: firstStyle.boxShadow.replace(/rgba\([^)]*\)/g, 'rgba()').split(/,\s*/),
        zIndex: firstStyle.zIndex,
        inset: [firstStyle.top, firstStyle.right, firstStyle.bottom, firstStyle.left],
        overflow: getComputedStyle(segments[0]).overflow
      },
      maxLit,
      sawSolo,
      sawPair,
      pairWindows: pairWindows.map(({ signature, start, end }) => ({
        duration: end - start + 100,
        signature
      }))
    };
  });

  assert.equal(relayBehavior.segmentCount, 5);
  assert.equal(relayBehavior.animationCount, 5);
  assert.equal(relayBehavior.duration, 32000);
  assert.ok(relayBehavior.compositeLuminanceLift.every((lift) => lift >= 14 && lift <= 30));
  assert.ok(relayBehavior.illuminatedOpacity >= .88 && relayBehavior.illuminatedOpacity <= .92);
  assert.deepEqual(relayBehavior.keyframeOffsets, [0, .005, .055, .07, 1]);
  assert.equal(relayBehavior.segment.isolation, 'isolate');
  assert.deepEqual(relayBehavior.segment.labelZIndices, ['1', '1']);
  assert.equal(relayBehavior.overlay.pointerEvents, 'none');
  assert.equal(relayBehavior.overlay.filter, 'none');
  assert.equal(relayBehavior.overlay.zIndex, '0');
  assert.ok(relayBehavior.overlay.boxShadowLayers.every((layer) => layer.includes('inset')));
  assert.deepEqual(relayBehavior.overlay.inset, ['0px', '0px', '0px', '0px']);
  assert.equal(relayBehavior.overlay.overflow, 'hidden');
  assert.equal(relayBehavior.maxLit, 2);
  assert.equal(relayBehavior.sawSolo, true);
  assert.equal(relayBehavior.sawPair, true);
  assert.equal(relayBehavior.pairWindows.length, 1);
  assert.equal(relayBehavior.pairWindows[0].signature, '3,5');
  assert.ok(relayBehavior.pairWindows[0].duration >= 500 && relayBehavior.pairWindows[0].duration <= 900);
  await relayPage.close();

  const mobileRelayPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobileRelayPage.goto(`${baseUrl}/production?route=campaign`);
  await mobileRelayPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const mobileRelay = await mobileRelayPage.locator('.directive-lcars-rail-segment').evaluateAll((segments) => {
    const luminance = ([red, green, blue]) => (red * .2126) + (green * .7152) + (blue * .0722);
    return segments.map((segment) => {
      const animation = segment.getAnimations({ subtree: true })
        .find((candidate) => candidate.animationName === 'directive-lcars-relay-press');
      animation.pause();
      animation.currentTime = Number(animation.effect.getTiming().delay) + 1000;
      const face = getComputedStyle(segment).backgroundColor.match(/[\d.]+/g)?.slice(-3).map(Number) ?? [];
      const overlayStyle = getComputedStyle(segment, '::after');
      const overlay = [...overlayStyle.backgroundImage.matchAll(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)]
        .map((match) => match.slice(1).map((channel) => Number(channel) * 255))[1];
      const opacity = Number.parseFloat(overlayStyle.opacity);
      const composite = face.map((channel, index) => channel + ((overlay[index] - channel) * opacity));
      return {
        compositeLuminanceLift: luminance(composite) - luminance(face),
        opacity
      };
    });
  });
  assert.equal(mobileRelay.length, 5);
  assert.ok(mobileRelay.every(({ compositeLuminanceLift }) => compositeLuminanceLift >= 18 && compositeLuminanceLift <= 36));
  assert.ok(mobileRelay.every(({ opacity }) => opacity >= .94 && opacity <= .98));
  await mobileRelayPage.close();

  const reducedRelayPage = await browser.newPage({ viewport: viewports[0] });
  await reducedRelayPage.emulateMedia({ reducedMotion: 'reduce' });
  await reducedRelayPage.goto(`${baseUrl}/production?route=campaign`);
  await reducedRelayPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const reducedRelay = await reducedRelayPage.locator('.directive-lcars-rail-segment').first().evaluate((segment) => ({
    animationName: getComputedStyle(segment, '::after').animationName,
    opacity: getComputedStyle(segment, '::after').opacity
  }));
  assert.equal(reducedRelay.animationName, 'none');
  assert.equal(reducedRelay.opacity, '0');
  await reducedRelayPage.close();

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
        const measureBrowserHero = async (hero) => hero.evaluate((node) => {
          const scene = node.querySelector('.directive-hero-scene');
          const layers = [...node.querySelectorAll('.directive-hero-scene-layer')];
          const foreground = layers.find((layer) => layer.dataset.heroSceneLayer === 'foreground');
          const sceneStyle = scene ? getComputedStyle(scene) : null;
          return {
            height: node.getBoundingClientRect().height,
            responsive: node.classList.contains('directive-responsive-hero'),
            toggleCount: node.querySelectorAll('.directive-responsive-hero-toggle').length,
            ariaExpanded: node.getAttribute('aria-expanded'),
            transitionDuration: getComputedStyle(node).transitionDuration,
            horizontalOverflow: node.scrollWidth - node.clientWidth,
            foregroundVerticalOffset: foreground && scene
              ? foreground.offsetTop - (scene.clientHeight / 2)
              : null,
            layerOrder: layers.map((layer) => layer.dataset.heroSceneLayer),
            scaleStart: sceneStyle?.getPropertyValue('--directive-hero-ship-scale-start').trim() || null,
            scaleEnd: sceneStyle?.getPropertyValue('--directive-hero-ship-scale-end').trim() || null
          };
        });
        const expectedBrowserHeroHeight = viewport.width <= 640 ? 220 : 320;
        const storyHero = page.locator('.campaign-browser-hero:visible').first();
        const storyHeroBefore = await measureBrowserHero(storyHero);
        assert.ok(
          Math.abs(storyHeroBefore.height - expectedBrowserHeroHeight) < 1,
          `${viewport.width}px saved-story cover must use the expanded Campaigns-browser height`
        );
        assert.equal(storyHeroBefore.responsive, false);
        assert.equal(storyHeroBefore.toggleCount, 0);
        assert.equal(storyHeroBefore.ariaExpanded, null);
        assert.equal(storyHeroBefore.transitionDuration, '0s');
        assert.ok(storyHeroBefore.horizontalOverflow <= 1);
        assert.ok(
          Math.abs(storyHeroBefore.foregroundVerticalOffset) < 1,
          `${viewport.width}px saved-story ship must anchor at the Campaigns-browser vertical center`
        );
        assert.deepEqual(storyHeroBefore.layerOrder, ['background', 'stars', 'stars-far', 'stars-near', 'foreground', 'sunlight']);
        assert.equal(storyHeroBefore.scaleStart, viewport.width <= 640 ? '1.03' : '.79');
        assert.equal(storyHeroBefore.scaleEnd, viewport.width <= 640 ? '1.05' : '.81');
        await storyHero.click({ position: { x: 20, y: 20 } });
        const storyHeroAfter = await measureBrowserHero(storyHero);
        assert.ok(
          Math.abs(storyHeroAfter.height - storyHeroBefore.height) < 1,
          `${viewport.width}px saved-story cover click must not resize the hero`
        );
        const availableRow = viewport.width <= 640
          ? page.locator('.campaign-mobile-trigger[data-campaign-availability="available"]').first()
          : page.locator('.campaign-desktop-master button[data-campaign-availability="available"]').first();
        await availableRow.click();
        const ashesLibraryHero = page.locator('.campaign-library-hero:visible').first();
        const ashesLibraryComposition = await measureBrowserHero(ashesLibraryHero);
        assert.ok(
          Math.abs(ashesLibraryComposition.foregroundVerticalOffset) < 1,
          `${viewport.width}px Ashes Campaign Library ship must anchor at the vertical center`
        );
        assert.deepEqual(ashesLibraryComposition.layerOrder, storyHeroBefore.layerOrder);
        assert.equal(ashesLibraryComposition.scaleStart, storyHeroBefore.scaleStart);
        assert.equal(ashesLibraryComposition.scaleEnd, storyHeroBefore.scaleEnd);
        if (viewport.width === 1440 || viewport.width === 390) {
          await page.screenshot({
            path: path.join(artifactRoot, `campaign-browser-ashes-centered-${viewport.width}x${viewport.height}.png`)
          });
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
        const libraryHero = page.locator('.campaign-library-hero:visible').first();
        const libraryHeroBefore = await measureBrowserHero(libraryHero);
        assert.ok(
          Math.abs(libraryHeroBefore.height - expectedBrowserHeroHeight) < 1,
          `${viewport.width}px Campaign Library cover must use the expanded Campaigns-browser height`
        );
        assert.equal(libraryHeroBefore.responsive, false);
        assert.equal(libraryHeroBefore.toggleCount, 0);
        assert.equal(libraryHeroBefore.ariaExpanded, null);
        assert.equal(libraryHeroBefore.transitionDuration, '0s');
        assert.ok(libraryHeroBefore.horizontalOverflow <= 1);
        await libraryHero.click({ position: { x: 20, y: 20 } });
        const libraryHeroAfter = await measureBrowserHero(libraryHero);
        assert.ok(
          Math.abs(libraryHeroAfter.height - libraryHeroBefore.height) < 1,
          `${viewport.width}px Campaign Library cover click must not resize the hero`
        );
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
        if (viewport.width === 1440 || viewport.width === 390) {
          await page.screenshot({
            path: path.join(artifactRoot, `campaign-browser-static-covers-${viewport.width}x${viewport.height}.png`)
          });
        }
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

  async function measureCampaignDashboard(page) {
    return page.locator('.campaign-dashboard').evaluate((dashboard) => {
      const heading = dashboard.querySelector('.campaign-dashboard-heading');
      const hero = dashboard.querySelector('.campaign-dashboard-hero');
      const copy = hero.querySelector('.campaign-hero-copy');
      const actions = dashboard.querySelector('.campaign-dashboard-actions');
      const routeBar = dashboard.closest('.directive-workspace').querySelector('.directive-route-bar');
      const scene = hero.querySelector('.directive-hero-scene');
      const layers = [...hero.querySelectorAll('.directive-hero-scene-layer')];
      const foreground = layers.find((layer) => layer.dataset.heroSceneLayer === 'foreground');
      const sunlight = layers.find((layer) => layer.dataset.heroSceneLayer === 'sunlight');
      const sceneStyle = getComputedStyle(scene);
      const foregroundStyle = getComputedStyle(foreground);
      const sunlightStyle = getComputedStyle(sunlight);
      const heroAfter = getComputedStyle(hero, '::after');
      const sceneAfter = getComputedStyle(scene, '::after');
      const orbitVariableNames = [
        '--directive-hero-orbit-background-x', '--directive-hero-orbit-background-y',
        '--directive-hero-orbit-far-x', '--directive-hero-orbit-far-y',
        '--directive-hero-orbit-near-x', '--directive-hero-orbit-near-y',
        '--directive-hero-orbit-ship-x', '--directive-hero-orbit-ship-y',
        '--directive-hero-orbit-ship-roll'
      ];
      const transformOffset = (node) => {
        const transform = getComputedStyle(node).transform;
        const matrix = transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
        return { x: matrix.m41, y: matrix.m42 };
      };
      const rect = (node) => {
        const value = node.getBoundingClientRect();
        return {
          left: value.left, top: value.top, right: value.right, bottom: value.bottom,
          width: value.width, height: value.height
        };
      };
      const heroRect = rect(hero);
      const foregroundRect = rect(foreground);
      const visibleWidth = Math.max(
        0,
        Math.min(heroRect.right, foregroundRect.right) - Math.max(heroRect.left, foregroundRect.left)
      );
      return {
        dashboard: rect(dashboard),
        heading: rect(heading),
        hero: heroRect,
        copy: rect(copy),
        actions: rect(actions),
        routeBar: rect(routeBar),
        actionBoxes: [...actions.children].map((node) => ({
          action: node.dataset.campaignAction,
          ...rect(node)
        })),
        heroToggleCount: hero.querySelectorAll('.directive-responsive-hero-toggle').length,
        heroTransitionDuration: getComputedStyle(hero).transitionDuration,
        heroExpanded: hero.classList.contains('is-expanded'),
        heroOrbitBound: hero.dataset.heroOrbitBound || '',
        heroOrbitEngaged: hero.classList.contains('is-hero-orbit-engaged'),
        heroOrbitMouse: hero.classList.contains('is-hero-orbit-mouse'),
        layerOrder: layers.map((layer) => layer.dataset.heroSceneLayer),
        layerTags: layers.map((layer) => layer.tagName),
        objectFits: layers.map((layer) => getComputedStyle(layer).objectFit),
        naturalSizes: layers.map((layer) => `${layer.naturalWidth || 0}x${layer.naturalHeight || 0}`),
        animations: layers.map((layer) => getComputedStyle(layer).animationName),
        animationDurations: layers.map((layer) => getComputedStyle(layer).animationDuration),
        timingFunctions: layers.map((layer) => getComputedStyle(layer).animationTimingFunction),
        willChange: layers.map((layer) => getComputedStyle(layer).willChange),
        backgroundRepeats: layers.map((layer) => getComputedStyle(layer).backgroundRepeat),
        backgroundSizes: layers.map((layer) => getComputedStyle(layer).backgroundSize),
        opacities: layers.map((layer) => getComputedStyle(layer).opacity),
        transforms: layers.map((layer) => getComputedStyle(layer).transform),
        translations: layers.map((layer) => getComputedStyle(layer).translate),
        rotations: layers.map((layer) => getComputedStyle(layer).rotate),
        transitionProperties: layers.map((layer) => getComputedStyle(layer).transitionProperty),
        transitionDurations: layers.map((layer) => getComputedStyle(layer).transitionDuration),
        transitionTimingFunctions: layers.map((layer) => getComputedStyle(layer).transitionTimingFunction),
        filters: layers.map((layer) => getComputedStyle(layer).filter),
        orbitVariables: Object.fromEntries(orbitVariableNames.map((name) => [
          name,
          sceneStyle.getPropertyValue(name).trim()
        ])),
        cruiseOffsets: Object.fromEntries(
          layers
            .filter((layer) => layer.dataset.heroSceneLayer === 'stars-far' || layer.dataset.heroSceneLayer === 'stars-near')
            .map((layer) => [layer.dataset.heroSceneLayer, transformOffset(layer)])
        ),
        starBlends: layers
          .filter((layer) => ['stars', 'stars-far', 'stars-near', 'sunlight'].includes(layer.dataset.heroSceneLayer))
          .map((layer) => getComputedStyle(layer).mixBlendMode),
        heroOverlay: {
          content: heroAfter.content,
          backgroundImage: heroAfter.backgroundImage,
          zIndex: heroAfter.zIndex
        },
        sceneScrim: {
          content: sceneAfter.content,
          backgroundImage: sceneAfter.backgroundImage,
          zIndex: sceneAfter.zIndex
        },
        foregroundPresentation: {
          opacity: foregroundStyle.opacity,
          filter: foregroundStyle.filter,
          blend: foregroundStyle.mixBlendMode,
          zIndex: foregroundStyle.zIndex
        },
        sunlightPresentation: {
          blend: sunlightStyle.mixBlendMode,
          zIndex: sunlightStyle.zIndex
        },
        copyTextShadow: getComputedStyle(copy).textShadow,
        foregroundVisibleWidthRatio: visibleWidth / foregroundRect.width,
        sourceCanvas: {
          widthRatio: foreground.offsetWidth / scene.clientWidth,
          aspectRatio: foreground.offsetWidth / foreground.offsetHeight,
          centerXRatio: foreground.offsetLeft / scene.clientWidth,
          verticalOffset: foreground.offsetTop - (scene.clientHeight / 2),
          translate: foregroundStyle.translate
        },
        motionBounds: {
          scaleStart: sceneStyle.getPropertyValue('--directive-hero-ship-scale-start').trim(),
          scaleEnd: sceneStyle.getPropertyValue('--directive-hero-ship-scale-end').trim(),
          restScale: sceneStyle.getPropertyValue('--directive-hero-ship-rest-scale').trim(),
          rotateStart: sceneStyle.getPropertyValue('--directive-hero-ship-rotate-start').trim(),
          rotateEnd: sceneStyle.getPropertyValue('--directive-hero-ship-rotate-end').trim(),
          xStart: sceneStyle.getPropertyValue('--directive-hero-ship-x-start').trim(),
          yStart: sceneStyle.getPropertyValue('--directive-hero-ship-y-start').trim(),
          xEnd: sceneStyle.getPropertyValue('--directive-hero-ship-x-end').trim(),
          yEnd: sceneStyle.getPropertyValue('--directive-hero-ship-y-end').trim()
        },
        horizontalOverflow: dashboard.scrollWidth - dashboard.clientWidth
      };
    });
  }

  const orbitNumber = (campaign, name) => Number.parseFloat(campaign.orbitVariables[name]) || 0;
  const orbitAxis = (campaign, axis) => ({
    background: orbitNumber(campaign, `--directive-hero-orbit-background-${axis}`),
    far: orbitNumber(campaign, `--directive-hero-orbit-far-${axis}`),
    near: orbitNumber(campaign, `--directive-hero-orbit-near-${axis}`),
    ship: orbitNumber(campaign, `--directive-hero-orbit-ship-${axis}`)
  });
  const assertOrbitDepth = (campaign, label) => {
    for (const axis of ['x', 'y']) {
      const values = orbitAxis(campaign, axis);
      assert.ok(values.background < 0, `${label} ${axis} background must move opposite input`);
      assert.ok(values.far < 0, `${label} ${axis} far stars must move opposite input`);
      assert.ok(values.near < 0, `${label} ${axis} near stars must move opposite input`);
      assert.ok(values.ship > 0, `${label} ${axis} ship must move with input`);
      assert.ok(
        Math.abs(values.near) > Math.abs(values.far) && Math.abs(values.far) > Math.abs(values.background),
        `${label} ${axis} response must preserve near > far > background depth`
      );
    }
  };
  const assertNeutralOrbit = (campaign, label) => {
    for (const [name, value] of Object.entries(campaign.orbitVariables)) {
      assert.equal(Number.parseFloat(value) || 0, 0, `${label} ${name} must return to neutral`);
    }
    assert.equal(campaign.heroOrbitEngaged, false, `${label} must not retain engaged state`);
  };

  const desktopCampaignPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktopCampaignPage.goto(`${baseUrl}/production?route=campaign`);
  await desktopCampaignPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const desktopCampaign = await measureCampaignDashboard(desktopCampaignPage);
  assert.ok(Math.abs(desktopCampaign.hero.top - desktopCampaign.heading.bottom) < 1, 'desktop hero must start directly below the Campaign header');
  assert.ok(Math.abs(desktopCampaign.actions.top - desktopCampaign.hero.bottom) < 1, 'desktop dock must start directly below the hero');
  assert.ok(Math.abs(desktopCampaign.actions.bottom - desktopCampaign.dashboard.bottom) < 1, 'desktop dock must form the dashboard bottom edge');
  assert.ok(
    desktopCampaign.routeBar.top - desktopCampaign.dashboard.bottom >= 0
      && desktopCampaign.routeBar.top - desktopCampaign.dashboard.bottom <= 16,
    'desktop dock must sit immediately above route navigation without overlap'
  );
  assert.ok(desktopCampaign.hero.height > 400, 'desktop hero must consume the available panel height');
  assert.equal(desktopCampaign.heroToggleCount, 0);
  assert.equal(desktopCampaign.heroTransitionDuration, '0s');
  assert.equal(desktopCampaign.heroExpanded, false);
  assert.equal(desktopCampaign.heroOrbitBound, 'true');
  assert.deepEqual(desktopCampaign.layerOrder, ['background', 'stars', 'stars-far', 'stars-near', 'foreground', 'sunlight']);
  assert.deepEqual(desktopCampaign.layerTags, ['IMG', 'IMG', 'SPAN', 'SPAN', 'IMG', 'IMG']);
  assert.deepEqual(desktopCampaign.objectFits, ['cover', 'cover', 'fill', 'fill', 'contain', 'cover'], 'dashboard must keep authored images aligned, repeating fields bounded, and the foreground ship contained');
  assert.deepEqual(desktopCampaign.naturalSizes, ['1672x941', '1672x941', '0x0', '0x0', '1672x941', '1672x941']);
  assert.deepEqual(desktopCampaign.animations, [
    'none', 'none', 'directive-hero-stars-far-cruise', 'directive-hero-stars-near-cruise', 'directive-hero-ship-drift', 'directive-hero-sunlight-pulse'
  ], 'dashboard scene must use static authored stars plus seamless parallax and aligned sunlight');
  assert.deepEqual(desktopCampaign.animationDurations, ['0s', '0s', '240s', '90s', '30s', '19s']);
  assert.deepEqual(desktopCampaign.timingFunctions, ['ease', 'ease', 'linear', 'linear', 'linear', 'ease-in-out']);
  assert.deepEqual(desktopCampaign.translations, ['0px', '0px', '0px', '0px', '-50% -50%', '0px']);
  assert.deepEqual(desktopCampaign.rotations, ['none', 'none', 'none', 'none', '0deg', 'none']);
  assert.deepEqual(desktopCampaign.transitionProperties, ['translate', 'translate', 'translate', 'translate', 'translate, rotate', 'translate']);
  assert.deepEqual(desktopCampaign.transitionDurations, ['0.42s', '0.42s', '0.42s', '0.42s', '0.42s', '0.42s']);
  assert.deepEqual(desktopCampaign.transitionTimingFunctions, [
    'cubic-bezier(0.2, 0.8, 0.2, 1)',
    'cubic-bezier(0.2, 0.8, 0.2, 1)',
    'cubic-bezier(0.2, 0.8, 0.2, 1)',
    'cubic-bezier(0.2, 0.8, 0.2, 1)',
    'cubic-bezier(0.2, 0.8, 0.2, 1)',
    'cubic-bezier(0.2, 0.8, 0.2, 1)'
  ]);
  assert.deepEqual(desktopCampaign.orbitVariables, {
    '--directive-hero-orbit-background-x': '0px',
    '--directive-hero-orbit-background-y': '0px',
    '--directive-hero-orbit-far-x': '0px',
    '--directive-hero-orbit-far-y': '0px',
    '--directive-hero-orbit-near-x': '0px',
    '--directive-hero-orbit-near-y': '0px',
    '--directive-hero-orbit-ship-x': '0px',
    '--directive-hero-orbit-ship-y': '0px',
    '--directive-hero-orbit-ship-roll': '0deg'
  });
  assert.deepEqual(desktopCampaign.willChange, ['auto', 'auto', 'transform', 'transform', 'transform', 'opacity, filter']);
  assert.deepEqual(desktopCampaign.backgroundRepeats.slice(2, 4), ['repeat', 'repeat']);
  assert.deepEqual(desktopCampaign.backgroundSizes.slice(2, 4), ['1344px 840px', '960px 600px']);
  assert.deepEqual(desktopCampaign.opacities.slice(2, 4), ['0.18', '0.24']);
  assert.deepEqual(desktopCampaign.starBlends, ['plus-lighter', 'screen', 'screen', 'screen']);
  assert.equal(desktopCampaign.heroOverlay.content, 'none');
  assert.equal(desktopCampaign.heroOverlay.backgroundImage, 'none');
  assert.equal(desktopCampaign.sceneScrim.content, '""');
  assert.ok(desktopCampaign.sceneScrim.backgroundImage.includes('radial-gradient'));
  assert.equal(desktopCampaign.sceneScrim.zIndex, '3');
  assert.deepEqual(desktopCampaign.foregroundPresentation, {
    opacity: '1', filter: 'none', blend: 'normal', zIndex: '4'
  });
  assert.deepEqual(desktopCampaign.sunlightPresentation, { blend: 'screen', zIndex: '5' });
  assert.notEqual(desktopCampaign.copyTextShadow, 'none');
  assert.ok(desktopCampaign.foregroundVisibleWidthRatio > .99, 'desktop must keep the complete drifting ship visible');
  assert.ok(Math.abs(desktopCampaign.sourceCanvas.widthRatio - 1) < .002);
  assert.ok(Math.abs(desktopCampaign.sourceCanvas.aspectRatio - (1672 / 941)) < .002);
  assert.ok(Math.abs(desktopCampaign.sourceCanvas.centerXRatio - .5) < .002);
  assert.ok(Math.abs(desktopCampaign.sourceCanvas.verticalOffset - 20) < 1);
  assert.equal(desktopCampaign.sourceCanvas.translate, '-50% -50%');
  assert.deepEqual(desktopCampaign.motionBounds, {
    scaleStart: '.79', scaleEnd: '.81', restScale: '.8', rotateStart: '-.15deg', rotateEnd: '.15deg',
    xStart: '-3%', yStart: '-1.2%', xEnd: '3%', yEnd: '1.2%'
  });
  const cruiseMotionStart = desktopCampaign.cruiseOffsets;
  await desktopCampaignPage.waitForTimeout(1200);
  const cruiseMotionEnd = (await measureCampaignDashboard(desktopCampaignPage)).cruiseOffsets;
  const travelDistance = (name) => Math.hypot(
    cruiseMotionEnd[name].x - cruiseMotionStart[name].x,
    cruiseMotionEnd[name].y - cruiseMotionStart[name].y
  );
  const farTravel = travelDistance('stars-far');
  const nearTravel = travelDistance('stars-near');
  assert.ok(cruiseMotionEnd['stars-far'].x < cruiseMotionStart['stars-far'].x);
  assert.ok(cruiseMotionEnd['stars-far'].y < cruiseMotionStart['stars-far'].y);
  assert.ok(cruiseMotionEnd['stars-near'].x < cruiseMotionStart['stars-near'].x);
  assert.ok(cruiseMotionEnd['stars-near'].y < cruiseMotionStart['stars-near'].y);
  assert.ok(nearTravel / farTravel >= 1.8 && nearTravel / farTravel <= 2.4, 'near-star screen velocity must remain 1.8x to 2.4x the far field');
  const desktopHeroBox = await desktopCampaignPage.locator('.campaign-dashboard-hero').boundingBox();
  assert.ok(desktopHeroBox, 'desktop Campaign hero must expose a hover target');
  await desktopCampaignPage.mouse.move(
    desktopHeroBox.x + (desktopHeroBox.width * .85),
    desktopHeroBox.y + (desktopHeroBox.height * .80)
  );
  await desktopCampaignPage.waitForTimeout(120);
  const desktopOrbit = await measureCampaignDashboard(desktopCampaignPage);
  assert.equal(desktopOrbit.heroOrbitEngaged, true);
  assert.equal(desktopOrbit.heroOrbitMouse, true);
  assertOrbitDepth(desktopOrbit, 'desktop orbit');
  assert.ok(Math.abs(orbitNumber(desktopOrbit, '--directive-hero-orbit-background-x')) <= 3.5);
  assert.ok(Math.abs(orbitNumber(desktopOrbit, '--directive-hero-orbit-far-x')) <= 6);
  assert.ok(Math.abs(orbitNumber(desktopOrbit, '--directive-hero-orbit-near-x')) <= 10);
  assert.ok(
    orbitNumber(desktopOrbit, '--directive-hero-orbit-ship-x') > 0
      && orbitNumber(desktopOrbit, '--directive-hero-orbit-ship-x') <= 1,
    'desktop ship horizontal response must remain a barely perceptible positional breath'
  );
  assert.ok(
    orbitNumber(desktopOrbit, '--directive-hero-orbit-ship-y') > 0
      && orbitNumber(desktopOrbit, '--directive-hero-orbit-ship-y') <= .5,
    'desktop ship vertical response must remain a barely perceptible positional breath'
  );
  assert.equal(
    orbitNumber(desktopOrbit, '--directive-hero-orbit-ship-roll'),
    0,
    'desktop orbit must not rotate the ship independently of the authored scene'
  );
  assert.deepEqual(desktopOrbit.animations, desktopCampaign.animations, 'hover orbit must not replace idle animation names');
  assert.deepEqual(desktopOrbit.animationDurations, desktopCampaign.animationDurations, 'hover orbit must not retime idle animation');
  assert.deepEqual(desktopOrbit.transitionDurations, ['0.36s', '0.36s', '0.36s', '0.36s', '0.36s', '0.36s']);
  assert.ok(Math.abs(desktopOrbit.copy.left - desktopCampaign.copy.left) < 1);
  assert.ok(Math.abs(desktopOrbit.copy.top - desktopCampaign.copy.top) < 1);
  assert.ok(desktopOrbit.actionBoxes.every((box, index) => (
    Math.abs(box.left - desktopCampaign.actionBoxes[index].left) < 1
      && Math.abs(box.top - desktopCampaign.actionBoxes[index].top) < 1
  )), 'orbit must not move Campaign copy or controls');
  assert.ok(desktopOrbit.horizontalOverflow <= 1);
  await desktopCampaignPage.screenshot({
    path: path.join(artifactRoot, 'campaign-orbit-desktop-1440x900.png')
  });
  await desktopCampaignPage.mouse.move(1, 1);
  await desktopCampaignPage.waitForTimeout(450);
  assertNeutralOrbit(await measureCampaignDashboard(desktopCampaignPage), 'desktop release');
  assert.ok(desktopCampaign.actionBoxes.every((box) => Math.abs(box.top - desktopCampaign.actionBoxes[0].top) < 1), 'desktop campaign actions must share one row');
  assert.ok(desktopCampaign.horizontalOverflow <= 1);
  await desktopCampaignPage.emulateMedia({ reducedMotion: 'reduce' });
  await desktopCampaignPage.mouse.move(
    desktopHeroBox.x + (desktopHeroBox.width * .85),
    desktopHeroBox.y + (desktopHeroBox.height * .80)
  );
  await desktopCampaignPage.waitForTimeout(120);
  const reducedCampaign = await measureCampaignDashboard(desktopCampaignPage);
  assertNeutralOrbit(reducedCampaign, 'reduced-motion hover');
  assert.deepEqual(reducedCampaign.animations, ['none', 'none', 'none', 'none', 'none', 'none']);
  assert.deepEqual(reducedCampaign.transforms.slice(2, 4), ['none', 'none']);
  assert.equal(reducedCampaign.opacities[5], '0.12');
  assert.equal(reducedCampaign.filters[5], 'none');
  await desktopCampaignPage.locator('.campaign-dashboard-hero').click();
  await desktopCampaignPage.waitForTimeout(220);
  const desktopAfterClick = await measureCampaignDashboard(desktopCampaignPage);
  assert.ok(Math.abs(desktopAfterClick.hero.height - desktopCampaign.hero.height) < 1, 'desktop click must not resize the Campaign hero');
  assert.equal(desktopAfterClick.heroExpanded, false);
  await desktopCampaignPage.close();

  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });
  const touchPage = await touchContext.newPage();
  const touchCdp = await touchContext.newCDPSession(touchPage);
  await touchPage.goto(`${baseUrl}/production?route=campaign`);
  await touchPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const mobileCampaign = await measureCampaignDashboard(touchPage);
  assert.ok(Math.abs(mobileCampaign.hero.top - mobileCampaign.heading.bottom) < 1, 'mobile hero must start directly below the Campaign header');
  assert.ok(Math.abs(mobileCampaign.actions.top - mobileCampaign.hero.bottom) < 1, 'mobile dock must start directly below the hero');
  assert.ok(Math.abs(mobileCampaign.actions.bottom - mobileCampaign.dashboard.bottom) < 1, 'mobile dock must form the dashboard bottom edge');
  assert.ok(
    mobileCampaign.routeBar.top - mobileCampaign.dashboard.bottom >= 0
      && mobileCampaign.routeBar.top - mobileCampaign.dashboard.bottom <= 16,
    'mobile dock must sit immediately above route navigation without overlap'
  );
  assert.ok(mobileCampaign.hero.height > 350, 'mobile hero must consume the available portrait panel height');
  assert.equal(mobileCampaign.heroToggleCount, 0);
  assert.equal(mobileCampaign.heroTransitionDuration, '0s');
  assert.ok(mobileCampaign.foregroundVisibleWidthRatio > .9, 'mobile must retain the broad bow-to-stern ship composition');
  assert.ok(Math.abs(mobileCampaign.sourceCanvas.aspectRatio - (1672 / 941)) < .002);
  assert.ok(Math.abs(mobileCampaign.sourceCanvas.verticalOffset + 20) < 1);
  assert.deepEqual(mobileCampaign.motionBounds, {
    scaleStart: '1.03', scaleEnd: '1.05', restScale: '1.04', rotateStart: '-.15deg', rotateEnd: '.15deg',
    xStart: '-3%', yStart: '-1.2%', xEnd: '3%', yEnd: '1.2%'
  });
  assert.equal(mobileCampaign.heroOverlay.content, 'none');
  assert.equal(mobileCampaign.heroOverlay.backgroundImage, 'none');
  assert.equal(mobileCampaign.sceneScrim.content, '""');
  assert.ok(mobileCampaign.sceneScrim.backgroundImage.includes('radial-gradient'));
  assert.equal(mobileCampaign.sceneScrim.zIndex, '3');
  assert.deepEqual(mobileCampaign.foregroundPresentation, {
    opacity: '1', filter: 'none', blend: 'normal', zIndex: '4'
  });
  assert.deepEqual(mobileCampaign.sunlightPresentation, { blend: 'screen', zIndex: '5' });
  assert.notEqual(mobileCampaign.copyTextShadow, 'none');
  assert.ok(mobileCampaign.actionBoxes.every((box) => box.height >= 44));
  assert.ok(Math.abs(mobileCampaign.actionBoxes[0].top - mobileCampaign.actionBoxes[3].top) < 1, 'Continue and Delete must share mobile row one');
  assert.ok(Math.abs(mobileCampaign.actionBoxes[1].top - mobileCampaign.actionBoxes[2].top) < 1, 'Save and Load must share mobile row two');
  assert.ok(mobileCampaign.actionBoxes[1].top > mobileCampaign.actionBoxes[0].bottom, 'mobile action row two must follow row one');
  assert.ok(mobileCampaign.horizontalOverflow <= 1);
  const mobileHero = touchPage.locator('.campaign-dashboard-hero');
  await mobileHero.evaluate((hero) => {
    hero.addEventListener('touchstart', (event) => {
      hero.dataset.lastTouchTrusted = String(event.isTrusted);
    }, { capture: true, once: true });
  });
  const mobileHeroBox = await mobileHero.boundingBox();
  assert.ok(mobileHeroBox);
  const mobileTouchStart = {
    x: mobileHeroBox.x + (mobileHeroBox.width * .5),
    y: mobileHeroBox.y + (mobileHeroBox.height * .5),
    id: 71,
    radiusX: 1,
    radiusY: 1,
    force: .5
  };
  const mobileTouchMoved = {
    ...mobileTouchStart,
    x: mobileHeroBox.x + (mobileHeroBox.width * .8),
    y: mobileHeroBox.y + (mobileHeroBox.height * .9)
  };
  await touchCdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [mobileTouchStart] });
  await touchCdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [mobileTouchMoved] });
  await touchPage.waitForTimeout(120);
  assert.equal(await mobileHero.getAttribute('data-last-touch-trusted'), 'true', 'phone proof must use browser-trusted touch input');
  const mobileOrbit = await measureCampaignDashboard(touchPage);
  assert.equal(mobileOrbit.heroOrbitEngaged, true);
  assertOrbitDepth(mobileOrbit, 'phone orbit');
  assert.ok(orbitNumber(mobileOrbit, '--directive-hero-orbit-far-x') <= -12, 'phone orbit must move distant stars substantially');
  assert.ok(orbitNumber(mobileOrbit, '--directive-hero-orbit-near-x') <= -22, 'phone orbit must make near-star depth unmistakable');
  assert.ok(orbitNumber(mobileOrbit, '--directive-hero-orbit-ship-x') >= 8, 'phone orbit must visibly carry the ship with the finger');
  assert.ok(orbitNumber(mobileOrbit, '--directive-hero-orbit-ship-roll') >= .6, 'phone orbit must add a clearly perceptible bounded roll');
  assert.deepEqual(mobileOrbit.transitionDurations, ['0.09s', '0.09s', '0.09s', '0.09s', '0.09s', '0.09s']);
  assert.deepEqual(mobileOrbit.animations, mobileCampaign.animations, 'phone orbit must preserve idle animation names');
  assert.ok(mobileOrbit.horizontalOverflow <= 1);
  await touchPage.screenshot({
    path: path.join(artifactRoot, 'campaign-orbit-phone-390x844.png')
  });
  await touchCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touchPage.waitForTimeout(450);
  assertNeutralOrbit(await measureCampaignDashboard(touchPage), 'phone release');
  await touchPage.locator('.campaign-dashboard-hero').tap();
  await touchPage.waitForTimeout(220);
  const mobileAfterTap = await measureCampaignDashboard(touchPage);
  assert.ok(Math.abs(mobileAfterTap.hero.height - mobileCampaign.hero.height) < 1, 'mobile tap must not resize the Campaign hero');
  assert.equal(mobileAfterTap.heroExpanded, false);

  await touchPage.locator('[data-campaign-action="campaigns"]').tap();
  await touchPage.waitForSelector('.campaign-browser');
  await touchPage.locator('[data-mobile-record-key="package:directive:campaign-package:breckenridge-ashes-of-peace"]').tap();
  await touchPage.waitForSelector('.campaign-library-hero:visible');
  const staticHeroOverlay = await touchPage
    .locator('.campaign-library-hero:not(:has(.directive-hero-scene))')
    .first()
    .evaluate((hero) => {
      const after = getComputedStyle(hero, '::after');
      return { content: after.content, backgroundImage: after.backgroundImage };
    });
  assert.equal(staticHeroOverlay.content, '""');
  assert.ok(staticHeroOverlay.backgroundImage.includes('linear-gradient'));
  const visibleAshesHero = touchPage.locator('.campaign-library-hero:visible').first();
  assert.equal(await visibleAshesHero.getAttribute('data-hero-orbit-bound'), 'true');
  const campaignAccordion = touchPage.locator('.campaign-mobile-accordion');
  await visibleAshesHero.evaluate((hero) => {
    hero.scrollIntoView({ block: 'center' });
    hero.addEventListener('touchstart', (event) => {
      hero.dataset.lastTouchTrusted = String(event.isTrusted);
    }, { capture: true });
  });
  await touchPage.waitForTimeout(120);
  let responsiveHeroBox = await visibleAshesHero.boundingBox();
  assert.ok(responsiveHeroBox);
  const wobbleTouchStart = {
    x: responsiveHeroBox.x + (responsiveHeroBox.width * .5),
    y: responsiveHeroBox.y + (responsiveHeroBox.height * .5),
    id: 81,
    radiusX: 1,
    radiusY: 1,
    force: .5
  };
  await touchCdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [wobbleTouchStart] });
  await touchCdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...wobbleTouchStart, x: wobbleTouchStart.x + 3, y: wobbleTouchStart.y + 3 }]
  });
  await touchPage.waitForTimeout(60);
  assert.equal(
    await visibleAshesHero.evaluate((hero) => hero.classList.contains('is-hero-orbit-engaged')),
    false,
    'subthreshold Library movement must remain an unclaimed tap gesture'
  );
  await touchCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await visibleAshesHero.getAttribute('data-last-touch-trusted'), 'true', 'Library gesture proof must use browser-trusted touch input');

  await visibleAshesHero.evaluate((hero) => hero.scrollIntoView({ block: 'center' }));
  await touchPage.waitForTimeout(120);
  const dragScrollTop = await campaignAccordion.evaluate((accordion) => accordion.scrollTop);
  responsiveHeroBox = await visibleAshesHero.boundingBox();
  assert.ok(responsiveHeroBox);
  const heldTouchStart = {
    x: responsiveHeroBox.x + (responsiveHeroBox.width * .5),
    y: responsiveHeroBox.y + (responsiveHeroBox.height * .5),
    id: 82,
    radiusX: 1,
    radiusY: 1,
    force: .5
  };
  await touchCdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [heldTouchStart] });
  await touchCdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...heldTouchStart, x: heldTouchStart.x + 24, y: heldTouchStart.y + 24 }]
  });
  await touchPage.waitForTimeout(120);
  const heldGestureState = await visibleAshesHero.evaluate((hero) => ({
    engaged: hero.classList.contains('is-hero-orbit-engaged'),
    nearX: Number.parseFloat(getComputedStyle(hero.querySelector('.directive-hero-scene')).getPropertyValue('--directive-hero-orbit-near-x')) || 0
  }));
  const heldScrollAfter = await campaignAccordion.evaluate((accordion) => accordion.scrollTop);
  assert.equal(heldGestureState.engaged, true, 'qualifying Library drag must immediately engage orbit mode');
  assert.ok(heldGestureState.nearX < 0, 'qualifying Library drag must move near stars opposite the finger');
  assert.ok(Math.abs(heldScrollAfter - dragScrollTop) <= 1, 'Library orbit drag must prevent native scrolling after orbit engages');
  await touchCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touchPage.waitForTimeout(450);

  const staticCoverBefore = await visibleAshesHero.evaluate((hero) => ({
    height: hero.getBoundingClientRect().height,
    toggleCount: hero.querySelectorAll('.directive-responsive-hero-toggle').length,
    responsive: hero.classList.contains('directive-responsive-hero')
  }));
  assert.equal(staticCoverBefore.toggleCount, 0);
  assert.equal(staticCoverBefore.responsive, false);
  await visibleAshesHero.evaluate((hero) => {
    document.addEventListener('click', (event) => {
      if (!hero.contains(event.target)) return;
      hero.dataset.capturedClickCount = String((Number(hero.dataset.capturedClickCount) || 0) + 1);
      hero.dataset.lastClickTrusted = String(event.isTrusted);
    }, { capture: true });
    hero.addEventListener('click', () => {
      hero.dataset.reachedCoverClickCount = String((Number(hero.dataset.reachedCoverClickCount) || 0) + 1);
    });
  });
  responsiveHeroBox = await visibleAshesHero.boundingBox();
  assert.ok(responsiveHeroBox);
  await visibleAshesHero.tap();
  assert.equal(await visibleAshesHero.getAttribute('data-captured-click-count'), '1', 'a short tap must emit one browser click');
  assert.equal(await visibleAshesHero.getAttribute('data-last-click-trusted'), 'true', 'short-tap proof must use a browser-trusted click');
  assert.equal(await visibleAshesHero.getAttribute('data-reached-cover-click-count'), '1', 'a short tap must remain unclaimed by orbit custody');
  assert.equal((await visibleAshesHero.boundingBox()).height, staticCoverBefore.height, 'short tap must retain the always-open Campaign cover height');
  await touchPage.locator('[data-campaign-action="back-to-current"]').tap();
  await touchPage.waitForSelector('.campaign-dashboard');

  await touchPage.locator('[data-route-id="ship"]').tap();
  await touchPage.waitForSelector('.directive-expanded-shell[data-active-route="ship"]');
  assert.equal(await touchPage.locator('.ship-cohesion-workspace').count(), 1);
  assert.equal(await touchPage.locator('.ship-hero').count(), 0, 'Ship must not restore the redundant banner');

  await touchPage.locator('[data-route-id="campaign"]').tap();
  await touchPage.waitForSelector('.directive-expanded-shell[data-active-route="campaign"]');
  const returnedCampaign = await measureCampaignDashboard(touchPage);
  assert.equal(returnedCampaign.heroToggleCount, 0, 'Campaign must remain non-interactive after route re-entry');
  assert.ok(returnedCampaign.hero.height > 350, 'Campaign must refill the panel after route re-entry');
  await touchContext.close();

  const assertLayeredHeroCoverage = async (viewport) => {
    const page = await browser.newPage({ viewport });
    await page.goto(`${baseUrl}/production?route=campaign`);
    await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
    await page.locator('[data-campaign-action="campaigns"]').click();
    await page.waitForSelector('.campaign-browser');
    const ashesKey = 'package:directive:campaign-package:breckenridge-ashes-of-peace';
    const record = viewport.width <= 640
      ? page.locator(`[data-mobile-record-key="${ashesKey}"]`)
      : page.locator(`[data-campaign-record-key="${ashesKey}"]`);
    await record.click();
    await page.waitForSelector('.campaign-library-hero:visible');
    const hero = page.locator('.campaign-library-hero:visible').first();

    const assertEdges = async () => {
      for (const edge of [
        { label: 'upper-left', x: .01, y: .01 },
        { label: 'lower-right', x: .99, y: .99 }
      ]) {
        await hero.evaluate((node) => node.scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(80);
        const box = await hero.boundingBox();
        assert.ok(box, `${viewport.width}x${viewport.height} static Campaign cover must be visible`);
        await page.mouse.move(box.x + (box.width * edge.x), box.y + (box.height * edge.y));
        await page.waitForTimeout(120);
        const coverage = await hero.evaluate((node) => {
          const rect = (candidate) => {
            const value = candidate.getBoundingClientRect();
            return { left: value.left, top: value.top, right: value.right, bottom: value.bottom };
          };
          return {
            hero: rect(node),
            layers: ['background', 'stars', 'sunlight'].map((name) => ({
              name,
              ...rect(node.querySelector(`[data-hero-scene-layer="${name}"]`))
            }))
          };
        });
        for (const layer of coverage.layers) {
          assert.ok(layer.left <= coverage.hero.left + .05, `${viewport.width}x${viewport.height} static ${edge.label} ${layer.name} must cover the left edge`);
          assert.ok(layer.top <= coverage.hero.top + .05, `${viewport.width}x${viewport.height} static ${edge.label} ${layer.name} must cover the top edge`);
          assert.ok(layer.right >= coverage.hero.right - .05, `${viewport.width}x${viewport.height} static ${edge.label} ${layer.name} must cover the right edge`);
          assert.ok(layer.bottom >= coverage.hero.bottom - .05, `${viewport.width}x${viewport.height} static ${edge.label} ${layer.name} must cover the bottom edge`);
        }
      }
    };

    const staticCover = await hero.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      toggleCount: node.querySelectorAll('.directive-responsive-hero-toggle').length,
      responsive: node.classList.contains('directive-responsive-hero')
    }));
    assert.ok(Math.abs(staticCover.height - (viewport.width <= 640 ? 220 : 320)) < 1);
    assert.equal(staticCover.toggleCount, 0);
    assert.equal(staticCover.responsive, false);
    await assertEdges();
    await page.close();
  };

  for (const viewport of viewports) await assertLayeredHeroCoverage(viewport);

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
