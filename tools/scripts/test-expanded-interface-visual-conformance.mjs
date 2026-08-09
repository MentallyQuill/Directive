import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 55836;
const baseUrl = `http://127.0.0.1:${port}`;
const artifactRoot = path.join(repoRoot, 'artifacts', 'expanded-interface-conformance');
const strictPixels = process.env.DIRECTIVE_STRICT_VISUAL === '1';
const reportMetrics = process.env.DIRECTIVE_REPORT_VISUAL === '1';
const routeSelectors = Object.freeze({
  campaign: ['.campaign-journal', '.campaign-index-panel', '.campaign-detail', '.campaign-hero', '.campaign-detail-body', '.campaign-premise', '.campaign-command', '.campaign-saves', '.campaign-saves-head', '.campaign-save-list', '.campaign-save-actions-empty', '.campaign-feedback', '.mobile-campaign-accordion'],
  mission: ['.hero', '.lcars-rule', '.mission-layout', '.quest-index', '.quest-detail', '.quest-description', '.objective-description', '.mobile-quest-accordion'],
  people: ['.people-layout, .crew-journal', '.people-roster, .crew-index-panel', '.people-detail, .crew-detail', '.people-detail__role, .crew-detail-role', '.people-involvement', '.people-list', '.mobile-crew-accordion'],
  ship: ['.ship-journal', '.ship-hero', '.ship-operation', '.ship-status-columns, .ship-board', '.ship-section-head, .ship-status-panel > h2', '.ship-issue', '.ship-issue-title', '.ship-capability-description', '.mobile-ship-journal'],
  settings: ['.settings-journal', '.settings-shelf-nav', '.settings-scroll', '.settings-section', '.settings-control-detail']
});

async function measurements(scope, selectors) {
  return scope.evaluate((element, requested) => {
    const scopeRect = element.getBoundingClientRect();
    return Object.fromEntries(requested.map((selector) => {
    const target = element.matches?.(selector) ? element : element.querySelector(selector);
    if (!target || getComputedStyle(target).display === 'none') return [selector, null];
    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    return [selector, { x: rect.x - scopeRect.x, y: rect.y - scopeRect.y, width: rect.width, height: rect.height, scrollHeight: target.scrollHeight, clientHeight: target.clientHeight, overflowY: style.overflowY, backgroundColor: style.backgroundColor, borderRadius: style.borderRadius, color: style.color, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight }];
  }));
  }, selectors);
}

function assertMeasurementClose(actual, expected, label, properties = ['x', 'y', 'width', 'height'], tolerance = 1.5) {
  assert.ok(actual && expected, `${label}: measurement is present`);
  for (const property of properties) {
    assert.ok(Math.abs(actual[property] - expected[property]) <= tolerance, `${label}: ${property} differs (${actual[property]} vs ${expected[property]})`);
  }
}
const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/production`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Expanded-interface production fixture did not become available.');
}

const viewports = [
  { width: 1440, height: 900, expected: { width: 940, height: 750, rail: 40 } },
  { width: 1024, height: 768, expected: { width: 940, height: 620, rail: 40 } },
  { width: 390, height: 844, expected: { width: 390, height: 844, rail: 24 } },
  { width: 360, height: 800, expected: { width: 360, height: 800, rail: 24 } }
];

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await mkdir(artifactRoot, { recursive: true });
  for (const fixture of viewports) {
    const viewportName = `${fixture.width}x${fixture.height}`;
    const viewportArtifacts = path.join(artifactRoot, viewportName);
    await mkdir(viewportArtifacts, { recursive: true });
    await page.setViewportSize({ width: fixture.width, height: fixture.height });
    await page.goto(`${baseUrl}/reference`, { waitUntil: 'networkidle' });
    const referenceScreen = page.locator('.directive-screen').first();
    await referenceScreen.waitFor({ state: 'visible' });
    if (fixture.width <= 640) await page.getByRole('button', { name: 'Phone', exact: true }).click();
    const referenceShots = new Map();
    const referenceMeasurements = new Map();
    for (const routeId of ['campaign', 'mission', 'people', 'ship', 'settings']) {
      const referenceRouteId = routeId === 'people' ? 'crew' : routeId;
      await page.locator(`[data-preview-route="${referenceRouteId}"]`).first().click();
      const shot = await referenceScreen.screenshot({ path: path.join(viewportArtifacts, `reference-${routeId}.png`) });
      referenceShots.set(routeId, shot);
      referenceMeasurements.set(routeId, await measurements(referenceScreen, routeSelectors[routeId]));
    }
    await page.goto(`${baseUrl}/production`, { waitUntil: 'networkidle' });
    const screen = page.locator('.directive-screen');
    await screen.waitFor({ state: 'visible' });
    const geometry = await screen.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const rail = element.querySelector('.directive-lcars-rail')?.getBoundingClientRect();
      const heading = element.querySelector('.directive-route-heading')?.getBoundingClientRect();
      const routeBar = element.querySelector('.directive-route-bar')?.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        railWidth: rail?.width || 0,
        headingHeight: heading?.height || 0,
        routeBarBottom: routeBar?.bottom || 0,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    assert.ok(Math.abs(geometry.width - fixture.expected.width) <= 0.5, `${fixture.width}x${fixture.height}: shell width`);
    assert.ok(Math.abs(geometry.height - fixture.expected.height) <= 0.5, `${fixture.width}x${fixture.height}: shell height`);
    assert.ok(Math.abs(geometry.railWidth - fixture.expected.rail) <= 0.5, `${fixture.width}x${fixture.height}: rail width`);
    assert.ok(Math.abs(geometry.headingHeight - (fixture.width <= 640 ? 22 : 24)) <= 0.5, `${fixture.width}x${fixture.height}: route heading height`);
    assert.ok(geometry.routeBarBottom <= fixture.height + 0.5, `${fixture.width}x${fixture.height}: route bar stays in viewport`);
    assert.ok(geometry.horizontalOverflow <= 0.5, `${fixture.width}x${fixture.height}: no document horizontal overflow`);

    for (const routeId of ['campaign', 'mission', 'people', 'ship', 'settings']) {
      await page.locator(`[data-route-id="${routeId}"]`).click();
      const routeBody = page.locator(`[data-directive-runtime-body="true"][data-directive-fixture-route="${routeId}"]`);
      await routeBody.waitFor();
      assert.equal(
        await routeBody.locator('[data-directive-tour]').count() > 0,
        true,
        `${fixture.width}x${fixture.height}/${routeId}: production route must use a real player-facing renderer`
      );
      const shot = await page.locator('.directive-screen').screenshot({ path: path.join(viewportArtifacts, `production-${routeId}.png`) });
      const productionMeasurements = await measurements(screen, routeSelectors[routeId]);
      if (reportMetrics) console.log(JSON.stringify({ viewportName, routeId, reference: referenceMeasurements.get(routeId), production: productionMeasurements }));
      const referenceRouteMeasurements = referenceMeasurements.get(routeId);
      if (fixture.width > 640) {
        for (const selector of routeSelectors[routeId]) {
          if (selector === '.campaign-detail-body' || selector === '.ship-status-columns') continue;
          const referenceMeasurement = referenceRouteMeasurements[selector];
          const productionMeasurement = productionMeasurements[selector];
          if (!referenceMeasurement && !productionMeasurement) continue;
          assertMeasurementClose(productionMeasurement, referenceMeasurement, `${viewportName}/${routeId}/${selector}`);
        }
      } else {
        const selector = {
          campaign: '.mobile-campaign-accordion', mission: '.mobile-quest-accordion', people: '.mobile-crew-accordion', ship: '.mobile-ship-journal', settings: '.settings-journal'
        }[routeId];
        assertMeasurementClose(productionMeasurements[selector], referenceRouteMeasurements[selector], `${viewportName}/${routeId}/${selector}`, ['x', 'width']);
      }
      if (strictPixels) {
        assert.equal(shot.equals(referenceShots.get(routeId)), true, `${viewportName}/${routeId}: screenshot differs from frozen reference`);
      }

      const routeVisibility = await routeBody.evaluate((element, { routeId: id, mobile }) => {
        const selector = {
          campaign: mobile ? '.mobile-campaign-accordion' : '.campaign-journal',
          mission: mobile ? '.mobile-quest-accordion' : '.mission-layout',
          people: mobile ? '.mobile-crew-accordion' : '.people-layout',
          ship: mobile ? '.mobile-ship-journal' : '.ship-journal',
          settings: '.settings-journal'
        }[id];
        const target = element.querySelector(selector);
        return Boolean(target && getComputedStyle(target).display !== 'none');
      }, { routeId, mobile: fixture.width <= 640 });
      assert.equal(routeVisibility, true, `${viewportName}/${routeId}: approved route composition must be visible`);
      const scrollContract = await routeBody.evaluate((element) => ({
        overflowY: getComputedStyle(element).overflowY,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight
      }));
      assert.match(scrollContract.overflowY, /auto|scroll/, `${viewportName}/${routeId}: route content scrolls internally`);
      if ((fixture.width <= 640 && ['campaign', 'people'].includes(routeId)) || (fixture.width === 1024 && ['campaign', 'people'].includes(routeId))) {
        const scrollSelector = fixture.width <= 640
          ? '[data-directive-runtime-body="true"]'
          : { campaign: '.campaign-detail', people: '.people-roster', ship: '.ship-journal' }[routeId];
        const independentScroll = await screen.locator(scrollSelector).first().evaluate((element) => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, overflowY: getComputedStyle(element).overflowY }));
        assert.ok(independentScroll.scrollHeight > independentScroll.clientHeight, `${viewportName}/${routeId}: long content has an independent scroll range`);
        assert.match(independentScroll.overflowY, /auto|scroll/, `${viewportName}/${routeId}: independent scroll region is enabled`);
      }
    }

    await page.locator('[data-route-id="settings"]').click();
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    assert.equal(await page.locator('[data-settings-page="advanced"]').evaluate((element) => getComputedStyle(element).display !== 'none'), true, `${viewportName}: Advanced settings shelf opens`);

    if (fixture.width === 1440) {
      await page.locator('[data-route-id="campaign"]').click();
      await page.getByRole('button', { name: 'Open Chat', exact: true }).click();
      assert.equal(await page.evaluate(() => globalThis.__directiveFixtureActions.some((entry) => entry.action === 'openCampaignChat')), true, 'Campaign Open Chat uses the runtime action');
      await page.getByRole('button', { name: 'Save Game', exact: true }).click();
      const saveDialog = page.locator('.directive-campaign-dialog-overlay');
      await saveDialog.waitFor();
      await saveDialog.locator('input[type="text"]').fill('Conformance Save');
      await saveDialog.getByRole('button', { name: 'Save Game', exact: true }).click();
      assert.equal(await page.evaluate(() => globalThis.__directiveFixtureActions.some((entry) => entry.action === 'saveGame')), true, 'Save Game uses the runtime action');
      await page.getByRole('button', { name: /Arrival Aboard/ }).click();
      await page.getByRole('button', { name: 'Load Game', exact: true }).click();
      assert.equal(await page.evaluate(() => globalThis.__directiveFixtureActions.some((entry) => entry.action === 'loadCheckpoint')), true, 'Load Game uses the runtime action');
      await page.getByRole('button', { name: 'Delete Save', exact: true }).click();
      const deleteDialog = page.locator('.directive-campaign-dialog-overlay');
      await deleteDialog.waitFor();
      await deleteDialog.getByRole('button', { name: 'Delete Save', exact: true }).click();
      assert.equal(await page.evaluate(() => globalThis.__directiveFixtureActions.some((entry) => entry.action === 'deleteSave')), true, 'Delete Save uses the runtime action');

      await page.locator('[data-route-id="people"]').click();
      await page.getByRole('button', { name: 'Add People category', exact: true }).click();
      const categoryInput = page.getByRole('textbox', { name: 'Category name', exact: true });
      await categoryInput.fill('Reach Delegates');
      await page.getByRole('button', { name: 'Save category', exact: true }).click();
      assert.equal(await page.getByText('Reach Delegates', { exact: true }).count() > 0, true, 'People custom categories can be added and renamed');
      await page.getByRole('button', { name: 'Remove category', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm remove category', exact: true }).click();
      assert.equal(await page.getByText('Reach Delegates', { exact: true }).count(), 0, 'People custom categories require confirmation and can be removed');

      await page.locator('[data-route-id="settings"]').click();
      await page.getByRole('button', { name: 'Advanced', exact: true }).click();
      await page.getByRole('button', { name: 'Test Provider', exact: true }).first().click();
      assert.equal(await page.evaluate(() => globalThis.__directiveFixtureActions.some((entry) => entry.action === 'testProvider')), true, 'Provider test uses the runtime action');
      await page.getByText('Diagnostics', { exact: true }).click();
      await page.getByRole('button', { name: 'Export Diagnostics', exact: true }).click();
      assert.equal(await page.evaluate(() => globalThis.__directiveFixtureActions.some((entry) => entry.action === 'exportSupportDiagnostics')), true, 'Diagnostics download uses the privacy-bounded runtime action');
    }

    if (fixture.width <= 640) {
      await page.locator('[data-route-id="mission"]').click();
      const missionItems = page.locator('.mobile-quest-item');
      await missionItems.first().locator('.mobile-accordion-toggle').click();
      assert.equal(await missionItems.first().locator('.mobile-accordion-toggle').getAttribute('aria-expanded'), 'false', `${viewportName}: quest collapses in place`);
      await missionItems.first().locator('.mobile-accordion-toggle').click();
      const handles = page.locator('.mobile-quest-item .mobile-drag-handle');
      const firstBefore = await missionItems.first().getAttribute('data-mobile-quest-id');
      await handles.first().press('ArrowDown');
      assert.notEqual(await missionItems.first().getAttribute('data-mobile-quest-id'), firstBefore, `${viewportName}: keyboard reorder changes presentation order`);

      const mouseHandle = handles.first();
      const mouseTarget = missionItems.nth(1);
      const fromBox = await mouseHandle.boundingBox();
      const toBox = await mouseTarget.boundingBox();
      await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(30);
      assert.equal(await page.locator('.mobile-drag-ghost').count(), 1, `${viewportName}: mouse drag creates a preview`);
      await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height - 2, { steps: 4 });
      assert.equal(await page.locator('.mobile-drag-placeholder').count(), 1, `${viewportName}: mouse drag creates a placeholder`);
      await page.mouse.up();

      const touchHandle = page.locator('.mobile-quest-item .mobile-drag-handle').first();
      const touchBox = await touchHandle.boundingBox();
      await touchHandle.dispatchEvent('pointerdown', { pointerId: 41, pointerType: 'touch', isPrimary: true, button: 0, clientX: touchBox.x + 8, clientY: touchBox.y + 8 });
      await page.waitForTimeout(200);
      assert.equal(await page.locator('.mobile-drag-ghost').count(), 1, `${viewportName}: touch long-press starts dragging`);
      await touchHandle.dispatchEvent('pointerup', { pointerId: 41, pointerType: 'touch', isPrimary: true, button: 0, clientX: touchBox.x + 8, clientY: touchBox.y + 8 });

      await page.locator('[data-route-id="people"]').click();
      assert.equal(await page.locator('.mobile-crew-item').first().evaluate((element) => element.classList.contains('is-open')), true, `${viewportName}: first person opens in place`);
      const personBefore = await page.locator('.mobile-crew-item').first().getAttribute('data-person-id');
      await page.locator('.mobile-crew-item .collection-drag-handle').first().press('ArrowDown');
      assert.notEqual(await page.locator('.mobile-crew-item').first().getAttribute('data-person-id'), personBefore, `${viewportName}: people keyboard reorder is presentation-only`);

      await page.locator('[data-route-id="ship"]').click();
      await page.locator('.mobile-ship-journal .ship-issue-toggle').first().click();
      assert.equal(await page.locator('.mobile-ship-journal .ship-issue-toggle').first().getAttribute('aria-expanded'), 'false', `${viewportName}: ship issue collapses in place`);
      const issueBefore = await page.locator('.mobile-ship-journal .ship-issue').first().getAttribute('data-ship-record-id');
      await page.locator('.mobile-ship-journal .ship-record-handle').first().press('ArrowDown');
      assert.notEqual(await page.locator('.mobile-ship-journal .ship-issue').first().getAttribute('data-ship-record-id'), issueBefore, `${viewportName}: ship keyboard reorder changes presentation order`);
      const shipIssueList = page.locator('.mobile-ship-journal .ship-issue-list');
      await shipIssueList.evaluate((list) => {
        const source = list.querySelector('.ship-issue');
        for (let index = 0; index < 6; index += 1) list.appendChild(source.cloneNode(true));
      });
      const boundedIssues = await shipIssueList.evaluate((list) => ({ scrollHeight: list.scrollHeight, clientHeight: list.clientHeight, overflowY: getComputedStyle(list).overflowY }));
      assert.ok(boundedIssues.scrollHeight > boundedIssues.clientHeight, `${viewportName}: long ship issue lists remain bounded`);
      assert.match(boundedIssues.overflowY, /auto|scroll/, `${viewportName}: ship issue list scrolls independently`);
    }
  }
  console.log('Expanded interface visual conformance fixture passed.');
} finally {
  await browser?.close();
  server.kill();
}
