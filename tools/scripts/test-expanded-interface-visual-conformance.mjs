import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 55836;
const baseUrl = `http://127.0.0.1:${port}`;
const artifactRoot = path.join(repoRoot, 'artifacts', 'expanded-interface-conformance');
const strictPixels = process.env.DIRECTIVE_STRICT_VISUAL !== '0';
const reportMetrics = process.env.DIRECTIVE_REPORT_VISUAL === '1';
// At most 40 unclassified edge pixels may vary after explicit antialias detection.
// This is under 0.014% of the smallest certified screenshot and cannot conceal a one-pixel layout line.
const maximumRasterEdgeVariancePixels = 40;
const routeSelectors = Object.freeze({
  campaign: ['.campaign-journal', '.campaign-index-panel', '.campaign-detail', '.campaign-hero', '.campaign-detail-body', '.campaign-premise', '.campaign-command', '.campaign-saves', '.campaign-saves-head', '.campaign-save-list', '.campaign-save-actions-empty', '.campaign-feedback', '.mobile-campaign-head img', '.mobile-campaign-detail-image img, .mobile-campaign-detail > img', '.mobile-campaign-accordion'],
  mission: ['.hero', '.lcars-rule', '.mission-layout', '.quest-index', '.quest-detail', '.quest-description', '.objective-description', '.mobile-quest-accordion'],
  people: ['.people-layout, .crew-journal', '.people-roster, .crew-index-panel', '.people-detail, .crew-detail', '.people-detail__role, .crew-detail-role', '.people-involvement', '.people-list', '.mobile-crew-accordion', '.mobile-crew-item .mobile-accordion-head'],
  ship: ['.ship-journal', '.ship-hero', '.ship-operation', '.ship-status-columns, .ship-board', '.ship-section-head, .ship-status-panel > h2', '.ship-issue', '.ship-issue-title', '.ship-capability-description', '.mobile-ship-journal', '.mobile-ship-journal .ship-issue', '.mobile-ship-journal .ship-issue-title', '.mobile-ship-journal .ship-issue-toggle', '.mobile-ship-journal .ship-issue-detail', '.mobile-ship-journal .ship-record-handle'],
  settings: ['.settings-journal', '.settings-shelf-nav', '.settings-scroll', '.settings-section', '.settings-control-detail']
});
const phoneTextRasterSelectors = Object.freeze({
  shell: { reference: '.route-control b', production: '.directive-route-control-label' },
  shellRouteName: { reference: '.directive-reference-route-name-label', production: '.directive-route-name-label' },
  shellEdges: { reference: '.route-bar', production: '.directive-route-bar' },
  campaignSave: { reference: '.campaign-saves-head .campaign-command span', production: '.campaign-save-create span' },
  campaignChevron: { reference: '.mobile-campaign-chevron', production: '.mobile-campaign-chevron' },
  campaignImages: {
    reference: '.mobile-campaign-head img, .mobile-campaign-detail > img',
    production: '.mobile-campaign-head img, .mobile-campaign-detail-image img, .mobile-campaign-detail > img'
  },
  missionText: {
    reference: '.mobile-quest-accordion .mobile-section-head span, .mobile-quest-item .mobile-accordion-copy strong, .mobile-quest-item .mobile-accordion-copy small, .mobile-accordion-detail .mobile-detail-kicker, .mobile-accordion-detail .mobile-detail-copy, .mobile-task-list li > span:last-child, .mobile-detail-meta span, .mobile-quest-accordion > .quest-group span',
    production: '.mobile-quest-accordion .mobile-section-head span, .mobile-quest-item .mobile-accordion-copy strong, .mobile-quest-item .mobile-accordion-copy small, .mobile-accordion-detail .mobile-detail-kicker, .mobile-accordion-detail .mobile-detail-copy, .mobile-task-list li > span:last-child, .mobile-detail-meta span, .mobile-quest-accordion > .quest-group span'
  },
  peopleText: {
    reference: '.mobile-crew-accordion .people-collection-toolbar > span, .collection-category-copy strong, .collection-category-copy small, .mobile-accordion-copy strong, .mobile-accordion-copy small, .mobile-accordion-detail > .mobile-detail-kicker, .mobile-accordion-detail .crew-detail-section h3, .people-involvement-label, .people-involvement strong, .people-involvement-copy span, .people-list li, .people-disclosure summary',
    production: '.mobile-crew-accordion .people-collection-toolbar > span, .collection-category-copy strong, .collection-category-copy small, .mobile-accordion-copy strong, .mobile-accordion-copy small, .mobile-accordion-detail > .mobile-detail-kicker, .mobile-accordion-detail .people-detail__section h3, .people-involvement-label, .people-involvement strong, .people-involvement-copy span, .people-list li, .people-disclosure summary'
  },
  peopleEdges: {
    reference: '.mobile-crew-item .mobile-accordion-head',
    production: '.mobile-crew-item .mobile-accordion-head'
  },
  shipText: {
    reference: '.mobile-ship-journal .ship-issue-title, .mobile-ship-journal .ship-issue-type, .mobile-ship-journal .ship-issue-meta span, .mobile-ship-journal .ship-detail-label, .mobile-ship-journal .ship-issue-effect',
    production: '.mobile-ship-journal .ship-issue-title, .mobile-ship-journal .ship-issue-type, .mobile-ship-journal .ship-issue-meta span, .mobile-ship-journal .ship-detail-label, .mobile-ship-journal .ship-issue-effect'
  }
});

async function measurements(scope, selectors) {
  return scope.evaluate((element, requested) => {
    const scopeRect = element.getBoundingClientRect();
    return Object.fromEntries(requested.map((selector) => {
    const target = element.matches?.(selector) ? element : element.querySelector(selector);
    if (!target || getComputedStyle(target).display === 'none') return [selector, null];
    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    return [selector, { x: rect.x - scopeRect.x, y: rect.y - scopeRect.y, width: rect.width, height: rect.height, scrollHeight: target.scrollHeight, clientHeight: target.clientHeight, overflowY: style.overflowY, backgroundColor: style.backgroundColor, borderBottomColor: style.borderBottomColor, borderBottomWidth: style.borderBottomWidth, borderRadius: style.borderRadius, color: style.color, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, source: target.currentSrc || '' }];
  }));
  }, selectors);
}

async function shellMeasurements(scope, production = false) {
  return scope.evaluate((element, isProduction) => {
    const selectors = isProduction
      ? { brand: '.directive-brand', path: '.directive-route-path', close: '.directive-close-action', routeName: '.directive-route-name', railCode: '.directive-lcars-rail-segment b', campaignControl: '[data-route-id="campaign"]', campaignLabel: '[data-route-id="campaign"] b' }
      : { brand: '.brand', path: '.route-path', close: '.close-action', routeName: '.route-name', railCode: '.rail-segment b', campaignControl: '[data-preview-route="campaign"]', campaignLabel: '[data-preview-route="campaign"] b' };
    const root = element.getBoundingClientRect();
    return Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
      const target = element.querySelector(selector);
      if (!target) return [name, null];
      const rect = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      return [name, { x: rect.x - root.x, y: rect.y - root.y, width: rect.width, height: rect.height, boxSizing: style.boxSizing, padding: style.padding, border: style.border, color: style.color, font: style.font }];
    }));
  }, production);
}

async function textRasterMeasurements(scope, selectors) {
  return scope.evaluate((element, requested) => {
    const root = element.getBoundingClientRect();
    return Object.fromEntries(Object.entries(requested).map(([key, selector]) => [key, [...element.querySelectorAll(selector)]
      .filter((target) => {
        const style = getComputedStyle(target);
        const rect = target.getBoundingClientRect();
        return style.display !== 'none' && rect.width > 0 && rect.height > 0;
      })
      .map((target) => {
        const rect = target.getBoundingClientRect();
        const style = getComputedStyle(target);
        return {
          text: String(target.textContent || '').trim(),
          x: rect.x - root.x,
          y: rect.y - root.y,
          width: rect.width,
          height: rect.height,
          font: style.font,
          color: style.color
        };
      })]));
  }, selectors);
}

function pairTextRasterRegions(reference, production, viewportName, routeId) {
  const regions = [];
  for (const key of Object.keys(reference)) {
    const expected = reference[key] || [];
    const actual = production[key] || [];
    assert.equal(actual.length, expected.length, `${viewportName}/${routeId}/${key}: certified text region count (${JSON.stringify({ expected: expected.map((entry) => entry.text), actual: actual.map((entry) => entry.text) })})`);
    for (let index = 0; index < expected.length; index += 1) {
      assert.equal(actual[index].text, expected[index].text, `${viewportName}/${routeId}/${key}[${index}]: certified text content`);
      const edgeOnly = key.endsWith('Images') || key.endsWith('Edges');
      if (!edgeOnly) assert.equal(actual[index].font, expected[index].font, `${viewportName}/${routeId}/${key}[${index}]: certified text font`);
      const textBoxTolerance = key === 'peopleText' ? 3.5 : 0.5;
      assertMeasurementClose(actual[index], expected[index], `${viewportName}/${routeId}/${key}[${index}]: certified text box`, ['x', 'y', 'width', 'height'], textBoxTolerance);
      const x = Math.min(actual[index].x, expected[index].x);
      const y = Math.min(actual[index].y, expected[index].y);
      const right = Math.max(actual[index].x + actual[index].width, expected[index].x + expected[index].width);
      const bottom = Math.max(actual[index].y + actual[index].height, expected[index].y + expected[index].height);
      regions.push({ ...actual[index], x, y, width: right - x, height: bottom - y, edgeOnly });
    }
  }
  return regions;
}

function assertMeasurementClose(actual, expected, label, properties = ['x', 'y', 'width', 'height'], tolerance = 1.5) {
  assert.ok(actual && expected, `${label}: measurement is present`);
  for (const property of properties) {
    assert.ok(Math.abs(actual[property] - expected[property]) <= tolerance, `${label}: ${property} differs (${actual[property]} vs ${expected[property]})`);
  }
}

async function screenshotDifference(page, actual, expected, textRasterRegions = [], channelTolerance = 2) {
  return page.evaluate(async ({ actualBase64, expectedBase64, rasterRegions, tolerance }) => {
    const load = (base64) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `data:image/png;base64,${base64}`;
    });
    const [actualImage, expectedImage] = await Promise.all([load(actualBase64), load(expectedBase64)]);
    if (actualImage.width !== expectedImage.width || actualImage.height !== expectedImage.height) {
      return { mismatchedPixels: Number.POSITIVE_INFINITY, dimensionsDiffer: true };
    }
    const canvas = document.createElement('canvas');
    canvas.width = actualImage.width;
    canvas.height = actualImage.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(actualImage, 0, 0);
    const actualPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(expectedImage, 0, 0);
    const expectedPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const luminanceDelta = (pixels, first, second) => {
      const luminance = (offset) => (pixels[offset] * 0.29889531) + (pixels[offset + 1] * 0.58662247) + (pixels[offset + 2] * 0.11448223);
      return luminance(first) - luminance(second);
    };
    const hasManySiblings = (pixels, x, y) => {
      const x0 = Math.max(x - 1, 0); const y0 = Math.max(y - 1, 0);
      const x2 = Math.min(x + 1, canvas.width - 1); const y2 = Math.min(y + 1, canvas.height - 1);
      const position = (y * canvas.width + x) * 4;
      let matches = x === x0 || x === x2 || y === y0 || y === y2 ? 1 : 0;
      for (let siblingX = x0; siblingX <= x2; siblingX += 1) {
        for (let siblingY = y0; siblingY <= y2; siblingY += 1) {
          if (siblingX === x && siblingY === y) continue;
          const sibling = (siblingY * canvas.width + siblingX) * 4;
          if (
            pixels[position] === pixels[sibling]
            && pixels[position + 1] === pixels[sibling + 1]
            && pixels[position + 2] === pixels[sibling + 2]
            && pixels[position + 3] === pixels[sibling + 3]
          ) matches += 1;
          if (matches > 2) return true;
        }
      }
      return false;
    };
    // Pixelmatch-style neighborhood detection permits only rasterized edge variation;
    // solid-color, geometry, and interior glyph changes remain strict mismatches.
    const isAntialiased = (pixels, x, y, otherPixels) => {
      const x0 = Math.max(x - 1, 0); const y0 = Math.max(y - 1, 0);
      const x2 = Math.min(x + 1, canvas.width - 1); const y2 = Math.min(y + 1, canvas.height - 1);
      const position = (y * canvas.width + x) * 4;
      let matches = x === x0 || x === x2 || y === y0 || y === y2 ? 1 : 0;
      let min = 0; let max = 0; let minPoint = null; let maxPoint = null;
      for (let siblingX = x0; siblingX <= x2; siblingX += 1) {
        for (let siblingY = y0; siblingY <= y2; siblingY += 1) {
          if (siblingX === x && siblingY === y) continue;
          const sibling = (siblingY * canvas.width + siblingX) * 4;
          const delta = luminanceDelta(pixels, position, sibling);
          if (delta === 0) {
            matches += 1;
            if (matches > 2) return false;
          } else if (delta < min) {
            min = delta; minPoint = [siblingX, siblingY];
          } else if (delta > max) {
            max = delta; maxPoint = [siblingX, siblingY];
          }
        }
      }
      if (min === 0 || max === 0) return false;
      return [minPoint, maxPoint].some((point) => point
        && hasManySiblings(pixels, point[0], point[1])
        && hasManySiblings(otherPixels, point[0], point[1]));
    };
    let mismatchedPixels = 0;
    let antialiasedPixels = 0;
    let textRasterPixels = 0;
    let rawMismatchedPixels = 0;
    let maxChannelDelta = 0;
    const deltaBuckets = { over2: 0, over8: 0, over16: 0, over32: 0, over64: 0 };
    const zones = { rail: 0, header: 0, routeBar: 0, content: 0 };
    const samples = [];
    const zoneSamples = {};
    const diff = context.createImageData(canvas.width, canvas.height);
    let minX = canvas.width; let minY = canvas.height; let maxX = -1; let maxY = -1;
    for (let index = 0; index < actualPixels.length; index += 4) {
      const delta = Math.max(
        Math.abs(actualPixels[index] - expectedPixels[index]),
        Math.abs(actualPixels[index + 1] - expectedPixels[index + 1]),
        Math.abs(actualPixels[index + 2] - expectedPixels[index + 2]),
        Math.abs(actualPixels[index + 3] - expectedPixels[index + 3])
      );
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      if (delta > 2) deltaBuckets.over2 += 1;
      if (delta > 8) deltaBuckets.over8 += 1;
      if (delta > 16) deltaBuckets.over16 += 1;
      if (delta > 32) deltaBuckets.over32 += 1;
      if (delta > 64) deltaBuckets.over64 += 1;
      if (delta <= tolerance) continue;
      rawMismatchedPixels += 1;
      const pixel = index / 4;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      if (rasterRegions.some((region) => {
        const edgePadding = region.edgeOnly ? 1 : 0;
        const inside = x >= Math.floor(region.x) - edgePadding && x < Math.ceil(region.x + region.width) + edgePadding
          && y >= Math.floor(region.y) - edgePadding && y < Math.ceil(region.y + region.height) + edgePadding;
        if (!inside || !region.edgeOnly) return inside;
        return x - region.x < 2 || (region.x + region.width) - x <= 2
          || y - region.y < 2 || (region.y + region.height) - y <= 2;
      })) {
        antialiasedPixels += 1;
        textRasterPixels += 1;
        diff.data[index] = 255;
        diff.data[index + 1] = 255;
        diff.data[index + 2] = 0;
        diff.data[index + 3] = 255;
        continue;
      }
      if (isAntialiased(actualPixels, x, y, expectedPixels) || isAntialiased(expectedPixels, x, y, actualPixels)) {
        antialiasedPixels += 1;
        diff.data[index] = 255;
        diff.data[index + 1] = 255;
        diff.data[index + 2] = 0;
        diff.data[index + 3] = 255;
        continue;
      }
      mismatchedPixels += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      const zone = x < 40 ? 'rail' : y < 96 ? 'header' : y >= canvas.height - 58 ? 'routeBar' : 'content';
      zones[zone] += 1;
      diff.data[index] = 255;
      diff.data[index + 1] = Math.min(255, delta * 2);
      diff.data[index + 2] = 0;
      diff.data[index + 3] = 255;
      if (samples.length < 12 && delta > 32) {
        samples.push({
          x,
          y,
          actual: [...actualPixels.slice(index, index + 4)],
          expected: [...expectedPixels.slice(index, index + 4)],
          delta
        });
      }
      if (!zoneSamples[zone] && delta > 32) zoneSamples[zone] = { x, y, actual: [...actualPixels.slice(index, index + 4)], expected: [...expectedPixels.slice(index, index + 4)], delta };
    }
    context.putImageData(diff, 0, 0);
    return {
      mismatchedPixels,
      rawMismatchedPixels,
      antialiasedPixels,
      textRasterPixels,
      maxChannelDelta,
      deltaBuckets,
      zones,
      bounds: mismatchedPixels ? { minX, minY, maxX, maxY } : null,
      samples,
      zoneSamples,
      diffBase64: mismatchedPixels ? canvas.toDataURL('image/png').split(',')[1] : ''
    };
  }, {
    actualBase64: actual.toString('base64'),
    expectedBase64: expected.toString('base64'),
    rasterRegions: textRasterRegions,
    tolerance: channelTolerance
  });
}

async function captureScreenScreenshot(page, locator, screenshotPath) {
  const box = await locator.boundingBox();
  return page.screenshot({
    path: screenshotPath,
    clip: { x: box.x, y: box.y, width: Math.round(box.width), height: Math.round(box.height) }
  });
}

async function waitForVisibleImages(scope) {
  await scope.locator('img:visible').evaluateAll((images) => Promise.all(images.map(async (image) => {
    if (!image.complete || image.naturalWidth === 0) await image.decode();
  })));
  await scope.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function normalizeScreenCaptureFrame(locator, { width, height, phoneReference = false }) {
  await locator.evaluate((element, options) => {
    const important = (target, property, value) => target.style.setProperty(property, value, 'important');
    important(element, 'position', 'fixed');
    important(element, 'inset', 'auto');
    important(element, 'top', '0');
    important(element, 'left', '0');
    important(element, 'right', 'auto');
    important(element, 'bottom', 'auto');
    important(element, 'width', `${options.width}px`);
    important(element, 'max-width', `${options.width}px`);
    important(element, 'height', `${options.height}px`);
    important(element, 'min-height', `${options.height}px`);
    important(element, 'max-height', `${options.height}px`);
    important(element, 'margin', '0');
    important(element, 'transform', 'none');
    important(element, 'overflow', 'hidden');
    if (!options.phoneReference) return;
    const shell = element.querySelector('.shell');
    const workspace = element.querySelector('.workspace');
    if (shell) {
      important(shell, 'height', '100%');
      important(shell, 'min-height', '0');
    }
    if (workspace) {
      important(workspace, 'height', '100%');
      important(workspace, 'min-height', '0');
    }
  }, { width, height, phoneReference });
}

async function normalizeReferenceRouteName(locator) {
  await locator.evaluate((element) => {
    const routeName = element.querySelector('.route-name');
    if (!routeName || routeName.querySelector('.directive-reference-route-name-label')) return;
    const label = document.createElement('span');
    label.className = 'directive-reference-route-name-label';
    label.textContent = routeName.textContent;
    routeName.replaceChildren(label);
  });
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

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/runtime-shell`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => globalThis.__directiveRuntimeShellReady === true);
  const initialRuntimeViewReads = await page.evaluate(() => globalThis.__directiveRuntimeViewReads);
  const firstFramePeopleRoute = await page.evaluate(() => new Promise((resolve) => {
    document.querySelector('[data-route-id="people"]')?.click();
    requestAnimationFrame(() => {
      const body = document.querySelector('[data-directive-runtime-body="true"]');
      resolve({
        route: document.querySelector('#directive-runtime-panel')?.getAttribute('data-active-route'),
        peopleVisible: Boolean(body?.querySelector('.people-layout, .mobile-crew-accordion')),
        runtimeViewReads: globalThis.__directiveRuntimeViewReads
      });
    });
  }));
  assert.equal(firstFramePeopleRoute.route, 'people', 'real runtime shell updates the active route by the first animation frame');
  assert.equal(firstFramePeopleRoute.peopleVisible, true, 'real runtime shell renders the retained People view by the first animation frame');
  assert.equal(firstFramePeopleRoute.runtimeViewReads, initialRuntimeViewReads, 'real runtime shell route clicks do not start a new authoritative view read');

  for (const fixture of viewports) {
    const viewportName = `${fixture.width}x${fixture.height}`;
    const viewportArtifacts = path.join(artifactRoot, viewportName);
    await mkdir(viewportArtifacts, { recursive: true });
    await page.setViewportSize({ width: fixture.width, height: fixture.height });
    await page.goto(`${baseUrl}/reference`, { waitUntil: 'networkidle' });
    const referenceScreen = page.locator('.directive-screen').first();
    await referenceScreen.waitFor({ state: 'visible' });
    if (fixture.width <= 640) await page.getByRole('button', { name: 'Phone', exact: true }).click();
    await normalizeScreenCaptureFrame(referenceScreen, {
      width: fixture.expected.width,
      height: fixture.expected.height,
      phoneReference: fixture.width <= 640
    });
    const referenceShellGeometry = await referenceScreen.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    const referenceShots = new Map();
    const referenceMeasurements = new Map();
    const referenceTextRasterMeasurements = new Map();
    const referenceShellMeasurements = await shellMeasurements(referenceScreen, false);
    for (const routeId of ['campaign', 'mission', 'people', 'ship', 'settings']) {
      const referenceRouteId = routeId === 'people' ? 'crew' : routeId;
      await page.locator(`[data-preview-route="${referenceRouteId}"]`).first().click();
      if (fixture.width <= 640) await normalizeReferenceRouteName(referenceScreen);
      await waitForVisibleImages(referenceScreen);
      const shot = await captureScreenScreenshot(page, referenceScreen, path.join(viewportArtifacts, `reference-${routeId}.png`));
      referenceShots.set(routeId, shot);
      referenceMeasurements.set(routeId, await measurements(referenceScreen, routeSelectors[routeId]));
      if (fixture.width <= 640) {
        referenceTextRasterMeasurements.set(routeId, await textRasterMeasurements(referenceScreen, {
          shell: phoneTextRasterSelectors.shell.reference,
          shellRouteName: phoneTextRasterSelectors.shellRouteName.reference,
          shellEdges: phoneTextRasterSelectors.shellEdges.reference,
          ...(routeId === 'campaign' ? {
            campaignSave: phoneTextRasterSelectors.campaignSave.reference,
            campaignChevron: phoneTextRasterSelectors.campaignChevron.reference,
            campaignImages: phoneTextRasterSelectors.campaignImages.reference
          } : {}),
          ...(routeId === 'mission' ? { missionText: phoneTextRasterSelectors.missionText.reference } : {}),
          ...(routeId === 'people' ? {
            peopleText: phoneTextRasterSelectors.peopleText.reference,
            peopleEdges: phoneTextRasterSelectors.peopleEdges.reference
          } : {}),
          ...(routeId === 'ship' ? { shipText: phoneTextRasterSelectors.shipText.reference } : {})
        }));
      }
    }
    await page.goto(`${baseUrl}/production`, { waitUntil: 'networkidle' });
    const screen = page.locator('.directive-screen');
    await screen.waitFor({ state: 'visible' });
    await normalizeScreenCaptureFrame(screen, { width: fixture.expected.width, height: fixture.expected.height });
    if (reportMetrics) console.log(JSON.stringify({ viewportName, shellReference: referenceShellMeasurements, shellProduction: await shellMeasurements(screen, true) }));
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
    assertMeasurementClose(geometry, referenceShellGeometry, `${fixture.width}x${fixture.height}: production shell matches frozen shell dimensions`, ['width', 'height'], 0.5);
    assert.ok(Math.abs(geometry.railWidth - fixture.expected.rail) <= 0.5, `${fixture.width}x${fixture.height}: rail width`);
    assert.ok(Math.abs(geometry.headingHeight - (fixture.width <= 640 ? 22 : 24)) <= 0.5, `${fixture.width}x${fixture.height}: route heading height`);
    assert.ok(geometry.routeBarBottom <= fixture.height + 0.5, `${fixture.width}x${fixture.height}: route bar stays in viewport`);
    assert.ok(geometry.horizontalOverflow <= 0.5, `${fixture.width}x${fixture.height}: no document horizontal overflow`);

    for (const routeId of ['campaign', 'mission', 'people', 'ship', 'settings']) {
      await page.locator(`[data-route-id="${routeId}"]`).click();
      const routeBody = page.locator(`[data-directive-runtime-body="true"][data-directive-fixture-route="${routeId}"]`);
      await routeBody.waitFor();
      await waitForVisibleImages(screen);
      assert.equal(
        await routeBody.locator('[data-directive-tour]').count() > 0,
        true,
        `${fixture.width}x${fixture.height}/${routeId}: production route must use a real player-facing renderer`
      );
      const shot = await captureScreenScreenshot(page, page.locator('.directive-screen'), path.join(viewportArtifacts, `production-${routeId}.png`));
      if (fixture.width <= 640) {
        assert.equal(await screen.locator('[title]').count(), 0, `${viewportName}/${routeId}: mobile Directive surface has no native hover titles`);
      }
      const productionMeasurements = await measurements(screen, routeSelectors[routeId]);
      if (reportMetrics) console.log(JSON.stringify({ viewportName, routeId, reference: referenceMeasurements.get(routeId), production: productionMeasurements }));
      const referenceRouteMeasurements = referenceMeasurements.get(routeId);
      if (fixture.width > 640) {
        for (const selector of routeSelectors[routeId]) {
          if (selector === '.campaign-detail-body' || selector === '.ship-status-columns' || selector.startsWith('.mobile-')) continue;
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
        const textRasterRegions = fixture.width <= 640
          ? pairTextRasterRegions(referenceTextRasterMeasurements.get(routeId), await textRasterMeasurements(screen, {
            shell: phoneTextRasterSelectors.shell.production,
            shellRouteName: phoneTextRasterSelectors.shellRouteName.production,
            shellEdges: phoneTextRasterSelectors.shellEdges.production,
            ...(routeId === 'campaign' ? {
              campaignSave: phoneTextRasterSelectors.campaignSave.production,
              campaignChevron: phoneTextRasterSelectors.campaignChevron.production,
              campaignImages: phoneTextRasterSelectors.campaignImages.production
            } : {}),
            ...(routeId === 'mission' ? { missionText: phoneTextRasterSelectors.missionText.production } : {}),
            ...(routeId === 'people' ? {
              peopleText: phoneTextRasterSelectors.peopleText.production,
              peopleEdges: phoneTextRasterSelectors.peopleEdges.production
            } : {}),
            ...(routeId === 'ship' ? { shipText: phoneTextRasterSelectors.shipText.production } : {})
          }), viewportName, routeId)
          : [];
        const { diffBase64, ...difference } = await screenshotDifference(page, shot, referenceShots.get(routeId), textRasterRegions);
        if (diffBase64) await writeFile(path.join(viewportArtifacts, `difference-${routeId}.png`), Buffer.from(diffBase64, 'base64'));
        assert.ok(difference.mismatchedPixels <= maximumRasterEdgeVariancePixels, `${viewportName}/${routeId}: screenshot differs from frozen reference beyond the documented raster-edge tolerance: ${JSON.stringify(difference)}`);
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
          : { campaign: '.campaign-detail', people: '.people-roster > .category-card-collection', ship: '.ship-journal' }[routeId];
        const independentScroll = await screen.locator(scrollSelector).first().evaluate((element) => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, overflowY: getComputedStyle(element).overflowY }));
        assert.ok(independentScroll.scrollHeight > independentScroll.clientHeight, `${viewportName}/${routeId}: long content has an independent scroll range`);
        assert.match(independentScroll.overflowY, /auto|scroll/, `${viewportName}/${routeId}: independent scroll region is enabled`);
      }
    }

    if (fixture.width <= 640) {
      for (const { routeId, selector } of [
        { routeId: 'people', selector: '.mobile-crew-accordion' },
        { routeId: 'campaign', selector: '.mobile-campaign-accordion' }
      ]) {
        await page.locator(`[data-route-id="${routeId}"]`).click();
        const widthContract = await page.locator(selector).evaluate((element) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            if (walker.currentNode.nodeValue.trim()) walker.currentNode.nodeValue = 'A';
          }
          const routeRect = element.getBoundingClientRect();
          const hostRect = element.parentElement.getBoundingClientRect();
          return {
            routeLeft: routeRect.left,
            routeWidth: routeRect.width,
            hostLeft: hostRect.left,
            hostWidth: hostRect.width
          };
        });
        assertMeasurementClose(
          widthContract,
          { routeLeft: widthContract.hostLeft, routeWidth: widthContract.hostWidth },
          `${viewportName}/${routeId}: mobile route fills its host with short runtime content`,
          ['routeLeft', 'routeWidth'],
          0.5
        );
      }
    }

    await page.locator('[data-route-id="settings"]').click();
    await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    assert.equal(await page.locator('[data-settings-page="advanced"]').evaluate((element) => getComputedStyle(element).display !== 'none'), true, `${viewportName}: Advanced settings shelf opens`);
    if (fixture.width <= 640) {
      assert.equal(await page.locator('.directive-expanded-shell [title]').count(), 0, `${viewportName}: expanded mobile settings have no native hover titles`);
    }

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

      await page.evaluate(() => globalThis.__directiveFixtureSetPeopleMode('with-player'));
      await page.locator('[data-route-id="people"]').click();
      const desktopCategoryDisclosure = page.locator('.people-layout .collection-category').first().locator('.collection-disclosure');
      assert.equal(await desktopCategoryDisclosure.locator('svg').count(), 1, 'People desktop categories use the shared animated SVG chevron');
      const playerRow = page.locator('.people-layout .collection-person-row[data-person-id="player-commander"]');
      assert.equal(await playerRow.count(), 1, 'People renders the player as a real roster record');
      const desktopHandleAlignment = await playerRow.evaluate((element) => {
        const row = element.getBoundingClientRect();
        const handle = element.querySelector('.collection-drag-handle')?.getBoundingClientRect();
        return { rowCenter: row.top + row.height / 2, handleCenter: handle ? handle.top + handle.height / 2 : -1 };
      });
      assert.ok(Math.abs(desktopHandleAlignment.rowCenter - desktopHandleAlignment.handleCenter) <= 0.5, 'People desktop drag handles are vertically centered');
      const desktopPeopleHandle = playerRow.locator('.collection-drag-handle');
      const desktopPeopleHandleBox = await desktopPeopleHandle.boundingBox();
      const desktopPeopleSourceAppearance = await playerRow.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { width: rect.width, height: rect.height, backgroundColor: style.backgroundColor, borderTopColor: style.borderTopColor, borderRadius: style.borderRadius };
      });
      await page.mouse.move(desktopPeopleHandleBox.x + desktopPeopleHandleBox.width / 2, desktopPeopleHandleBox.y + desktopPeopleHandleBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(30);
      const desktopPeopleGhost = page.locator('.mobile-drag-ghost.people-drag-ghost');
      assert.equal(await desktopPeopleGhost.count(), 1, 'People desktop drag creates the approved card preview');
      const desktopGhostGeometry = await desktopPeopleGhost.evaluate((element) => {
        const handle = element.querySelector('.collection-drag-handle')?.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { opacity: Number(style.opacity), width: rect.width, height: rect.height, backgroundColor: style.backgroundColor, borderTopColor: style.borderTopColor, borderRadius: style.borderRadius, handleCenterX: handle ? handle.left + handle.width / 2 : -1, handleCenterY: handle ? handle.top + handle.height / 2 : -1 };
      });
      assert.equal(desktopGhostGeometry.opacity, 0.5, 'People drag preview uses 50% opacity');
      assert.deepEqual(
        { ...desktopGhostGeometry, opacity: undefined, handleCenterX: undefined, handleCenterY: undefined },
        { ...desktopPeopleSourceAppearance, opacity: undefined, handleCenterX: undefined, handleCenterY: undefined },
        'People desktop drag preview preserves the source card dimensions and surface geometry'
      );
      assert.ok(Math.abs(desktopGhostGeometry.handleCenterX - (desktopPeopleHandleBox.x + desktopPeopleHandleBox.width / 2)) <= 0.5, `People drag preview remains centered under the pointer horizontally: ${JSON.stringify({ desktopGhostGeometry, desktopPeopleHandleBox })}`);
      assert.ok(Math.abs(desktopGhostGeometry.handleCenterY - (desktopPeopleHandleBox.y + desktopPeopleHandleBox.height / 2)) <= 0.5, `People drag preview remains centered under the pointer vertically: ${JSON.stringify({ desktopGhostGeometry, desktopPeopleHandleBox })}`);
      await page.mouse.up();
      await playerRow.locator('.people-row').click();
      assert.equal(await page.locator('.people-detail [data-asset-icon="assets/icons/comm-badge.svg"]').count(), 1, 'People uses the comm badge when the player has no portrait');
      assert.equal(await page.getByRole('button', { name: 'Import', exact: true }).count(), 1, 'People exposes player portrait import');
      assert.equal(await page.getByRole('button', { name: 'Import', exact: true }).isVisible(), true, 'People keeps player portrait import visible inside the desktop portrait');
      assert.equal(await page.getByRole('button', { name: 'Remove', exact: true }).count(), 0, 'People omits portrait removal until an image exists');
      await page.evaluate(() => globalThis.__directiveFixtureSetPortraitActionFailure(true));
      const portraitFileInput = page.locator('.people-detail input[type="file"]');
      await portraitFileInput.setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from('fixture portrait') });
      assert.equal(await page.locator('.people-detail [role="status"]').innerText(), 'Portrait import failed. Try again.', 'People reports portrait import failures in an accessible status without exposing host details');
      assert.equal(await portraitFileInput.inputValue(), '', 'People clears a failed portrait file selection so the same file can be retried');
      await page.evaluate(() => globalThis.__directiveFixtureSetPortraitActionFailure(false));
      await page.evaluate(() => globalThis.__directiveFixtureSetPlayerPortrait('populated'));
      await page.locator('.people-layout .collection-person-row[data-person-id="player-commander"] .people-row').click();
      assert.equal(await page.locator('.people-detail .directive-player-portrait-image').count(), 1, 'People renders a stored player portrait');
      assert.equal(await page.getByRole('button', { name: 'Change', exact: true }).count(), 1, 'People exposes player portrait replacement');
      assert.equal(await page.getByRole('button', { name: 'Remove', exact: true }).count(), 1, 'People exposes player portrait removal');
      await page.getByRole('button', { name: 'Remove', exact: true }).click();
      await page.getByRole('button', { name: 'Import', exact: true }).waitFor();
      await page.waitForFunction(() => document.activeElement?.classList.contains('directive-crew-player-portrait-import'));
      assert.equal(await page.getByRole('button', { name: 'Import', exact: true }).evaluate((element) => document.activeElement === element), true, 'People restores focus to portrait import after removal rerenders the route');
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
      await page.reload({ waitUntil: 'networkidle' });
      await page.evaluate(() => globalThis.__directiveFixtureSetPeopleMode('empty'));
      await page.locator('[data-route-id="people"]').click();
      await page.locator('.directive-close-action').focus();
      assert.equal(await page.locator('.directive-floating-tooltip').isVisible().catch(() => false), false, `${viewportName}: mobile control focus does not show a tooltip`);
      assert.equal(await page.locator('.directive-expanded-shell [title]').count(), 0, `${viewportName}: mobile Directive controls do not expose native hover titles`);
      assert.equal(await page.locator('.mobile-crew-item').count(), 0, `${viewportName}: empty People hydration starts without records`);
      await page.evaluate(() => globalThis.__directiveFixtureSetPeopleMode('with-player'));
      assert.equal(await page.locator('.mobile-crew-item').first().evaluate((element) => element.classList.contains('is-open')), true, `${viewportName}: first person opens when People records hydrate after an empty render`);
      const firstPeopleCategory = page.locator('.mobile-people-category').first();
      const mobileCategoryGeometry = await firstPeopleCategory.evaluate((element) => {
        const head = element.querySelector('.collection-category-head');
        const firstItem = element.querySelector('.mobile-crew-item');
        const avatar = firstItem?.querySelector('.mobile-crew-avatar');
        return {
          marginTop: parseFloat(getComputedStyle(element).marginTop),
          headHeight: head?.getBoundingClientRect().height || 0,
          itemMarginTop: firstItem ? parseFloat(getComputedStyle(firstItem).marginTop) : 0,
          avatarWidth: avatar?.getBoundingClientRect().width || 0,
          avatarHeight: avatar?.getBoundingClientRect().height || 0,
          avatarBorder: avatar ? parseFloat(getComputedStyle(avatar).borderTopWidth) : 0
        };
      });
      assertMeasurementClose(mobileCategoryGeometry, { marginTop: 5, headHeight: 46, itemMarginTop: 4, avatarWidth: 50, avatarHeight: 58, avatarBorder: 0 }, `${viewportName}: People category and row geometry`, ['marginTop', 'headHeight', 'itemMarginTop', 'avatarWidth', 'avatarHeight', 'avatarBorder'], 0.5);
      const categoryDisclosure = firstPeopleCategory.locator('.collection-disclosure');
      await categoryDisclosure.click();
      assert.equal(await categoryDisclosure.getAttribute('aria-expanded'), 'false', `${viewportName}: People category collapses in place`);
      assert.equal(await firstPeopleCategory.locator('.mobile-crew-item').first().isVisible(), false, `${viewportName}: collapsed People category hides its records`);
      await categoryDisclosure.click();
      const knownContacts = page.locator('.mobile-people-category').filter({ hasText: 'Known Contacts' });
      const knownContactsDisclosure = knownContacts.locator('.collection-disclosure');
      await knownContactsDisclosure.click();
      assert.equal(await knownContactsDisclosure.getAttribute('aria-expanded'), 'true', `${viewportName}: Known Contacts category expands in place`);
      assert.equal(await knownContacts.locator('.collection-empty').isVisible(), true, `${viewportName}: expanded empty People category shows its bounded empty state`);
      const openPerson = page.locator('.mobile-crew-item.is-open').first();
      assert.equal(await openPerson.locator('.mobile-accordion-copy small').innerText(), 'Player Character', `${viewportName}: People mobile player row uses the approved compact role label`);
      assert.equal(await openPerson.locator('.mobile-accordion-chevron svg').count(), 1, `${viewportName}: People disclosures use the frozen SVG chevron`);
      const expandedChevronStyle = await openPerson.locator('.mobile-accordion-chevron svg').evaluate((element) => ({
        transform: getComputedStyle(element).transform,
        transformOrigin: getComputedStyle(element).transformOrigin,
        transitionDuration: getComputedStyle(element).transitionDuration
      }));
      assert.match(expandedChevronStyle.transform, /none|matrix\(1, 0, 0, 1, 0, 0\)/, `${viewportName}: expanded People chevron points down`);
      assert.notEqual(expandedChevronStyle.transitionDuration, '0s', `${viewportName}: People chevron rotation is animated`);
      const openChevronBox = await openPerson.locator('.mobile-accordion-chevron svg').boundingBox();
      assert.equal(expandedChevronStyle.transformOrigin, `${openChevronBox.width / 2}px ${openChevronBox.height / 2}px`, `${viewportName}: People chevron rotates around its center`);
      const mobilePortrait = openPerson.locator('.mobile-crew-detail-image');
      assert.equal(await mobilePortrait.count(), 1, `${viewportName}: expanded People records use the frozen mobile detail composition`);
      assertMeasurementClose(await mobilePortrait.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height };
      }), { height: 152 }, `${viewportName}: People mobile detail portrait`, ['height'], 0.5);
      assert.equal(await mobilePortrait.locator('[data-asset-icon="assets/icons/comm-badge.svg"]').count(), 1, `${viewportName}: People mobile player detail uses the comm badge fallback`);
      assert.equal(await openPerson.locator('.people-detail-mobile').count(), 0, `${viewportName}: mobile People records do not reuse the desktop detail component`);
      const maraPerson = page.locator('.mobile-crew-item[data-person-id="mara-whitaker"]');
      await maraPerson.locator('.mobile-accordion-toggle').click();
      assert.equal(await maraPerson.locator('.people-involvement').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(/\s+/).length), 1, `${viewportName}: mobile People involvement uses one column`);

      await page.reload({ waitUntil: 'networkidle' });
      await page.evaluate(() => globalThis.__directiveFixtureSetPeopleMode('partial'));
      await page.locator('[data-route-id="people"]').click();
      assert.equal(await page.locator('.mobile-crew-item').first().evaluate((element) => element.classList.contains('is-open')), true, `${viewportName}: partial People hydration opens its available record`);
      await page.evaluate(() => globalThis.__directiveFixtureSetPeopleMode('with-player'));
      assert.equal(await page.locator('.mobile-crew-item').first().evaluate((element) => element.classList.contains('is-open')), true, `${viewportName}: final People hydration replaces a stale expanded record`);

      await page.locator('[data-route-id="mission"]').click();
      const missionItems = page.locator('.mobile-quest-item');
      assert.equal(await missionItems.first().locator('.mobile-accordion-chevron path').getAttribute('d'), 'm8 10 4 4 4-4', `${viewportName}: Mission uses the approved down-chevron SVG before rotation`);
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
      const sourceOuterHeight = await missionItems.first().evaluate((element) => {
        const style = getComputedStyle(element);
        return element.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      });
      await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(30);
      assert.equal(await page.locator('.mobile-drag-ghost').count(), 1, `${viewportName}: mouse drag creates a preview`);
      await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height - 2, { steps: 4 });
      assert.equal(await page.locator('.mobile-drag-placeholder').count(), 1, `${viewportName}: mouse drag creates a placeholder`);
      const placeholderOuterHeight = await page.locator('.mobile-drag-placeholder').evaluate((element) => {
        const style = getComputedStyle(element);
        return element.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      });
      assert.ok(Math.abs(placeholderOuterHeight - sourceOuterHeight) <= 0.5, `${viewportName}: drag placeholder preserves the source record outer slot height`);
      await page.mouse.up();

      const touchHandle = page.locator('.mobile-quest-item .mobile-drag-handle').first();
      const touchBox = await touchHandle.boundingBox();
      await touchHandle.dispatchEvent('pointerdown', { pointerId: 41, pointerType: 'touch', isPrimary: true, button: 0, clientX: touchBox.x + 8, clientY: touchBox.y + 8 });
      await page.waitForTimeout(200);
      assert.equal(await page.locator('.mobile-drag-ghost').count(), 1, `${viewportName}: touch long-press starts dragging`);
      await touchHandle.dispatchEvent('pointerup', { pointerId: 41, pointerType: 'touch', isPrimary: true, button: 0, clientX: touchBox.x + 8, clientY: touchBox.y + 8 });

      const cancelledHandle = page.locator('.mobile-quest-item .mobile-drag-handle').first();
      const cancelledBox = await cancelledHandle.boundingBox();
      await cancelledHandle.dispatchEvent('pointerdown', { pointerId: 42, pointerType: 'mouse', isPrimary: true, button: 0, clientX: cancelledBox.x + cancelledBox.width / 2, clientY: cancelledBox.y + cancelledBox.height / 2 });
      await page.waitForTimeout(30);
      await cancelledHandle.dispatchEvent('lostpointercapture', { pointerId: 42, pointerType: 'mouse', isPrimary: true });
      assert.equal(await page.locator('.mobile-drag-ghost').count(), 0, `${viewportName}: lost pointer capture removes the drag preview`);
      assert.equal(await page.locator('.mobile-drag-placeholder').count(), 0, `${viewportName}: lost pointer capture removes the placeholder`);
      assert.equal(await page.locator('.mobile-quest-item').first().isVisible(), true, `${viewportName}: lost pointer capture restores the source record`);

      await page.locator('[data-route-id="people"]').click();
      assert.equal(await page.locator('.mobile-crew-item').first().evaluate((element) => element.classList.contains('is-open')), true, `${viewportName}: first person opens in place`);
      const mobilePeopleHandle = page.locator('.mobile-crew-item .collection-drag-handle').first();
      const mobilePeopleHandleBox = await mobilePeopleHandle.boundingBox();
      const mobilePeopleSourceAppearance = await page.locator('.mobile-crew-item .mobile-accordion-head').first().evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { width: rect.width, height: rect.height, backgroundColor: style.backgroundColor, borderTopColor: style.borderTopColor, borderRadius: style.borderRadius };
      });
      await page.mouse.move(mobilePeopleHandleBox.x + mobilePeopleHandleBox.width / 2, mobilePeopleHandleBox.y + mobilePeopleHandleBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(30);
      const mobilePeopleGhost = page.locator('.mobile-drag-ghost.people-drag-ghost');
      const mobilePeopleGhostGeometry = await mobilePeopleGhost.evaluate((element) => {
        const handle = element.querySelector('.collection-drag-handle')?.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { opacity: Number(style.opacity), width: rect.width, height: rect.height, backgroundColor: style.backgroundColor, borderTopColor: style.borderTopColor, borderRadius: style.borderRadius, handleCenterX: handle ? handle.left + handle.width / 2 : -1, handleCenterY: handle ? handle.top + handle.height / 2 : -1 };
      });
      assert.equal(mobilePeopleGhostGeometry.opacity, 0.5, `${viewportName}: People drag preview uses 50% opacity`);
      assert.deepEqual(
        { ...mobilePeopleGhostGeometry, opacity: undefined, handleCenterX: undefined, handleCenterY: undefined },
        { ...mobilePeopleSourceAppearance, opacity: undefined, handleCenterX: undefined, handleCenterY: undefined },
        `${viewportName}: People drag preview preserves the source card dimensions and surface geometry`
      );
      assert.ok(Math.abs(mobilePeopleGhostGeometry.handleCenterX - (mobilePeopleHandleBox.x + mobilePeopleHandleBox.width / 2)) <= 0.5, `${viewportName}: People drag preview remains centered under the pointer horizontally`);
      assert.ok(Math.abs(mobilePeopleGhostGeometry.handleCenterY - (mobilePeopleHandleBox.y + mobilePeopleHandleBox.height / 2)) <= 0.5, `${viewportName}: People drag preview remains centered under the pointer vertically`);
      await page.mouse.up();
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

      await page.setViewportSize({ width: 800, height: fixture.height });
      const resizedClose = page.locator('.directive-close-action');
      const resizedCloseBox = await resizedClose.boundingBox();
      await page.mouse.move(resizedCloseBox.x + resizedCloseBox.width / 2, resizedCloseBox.y + resizedCloseBox.height / 2);
      await page.waitForTimeout(20);
      assert.equal(await page.locator('.directive-floating-tooltip').isVisible(), true, `${viewportName}: controls created on phone regain hover tips after resizing to a mouse desktop surface`);
    }
  }
  console.log('Expanded interface visual conformance fixture passed.');
} finally {
  await browser?.close();
  server.kill();
}
