import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 55000 + (process.pid % 9000);
const baseUrl = `http://127.0.0.1:${port}`;
const artifactRoot = path.join(repoRoot, 'artifacts', 'cohesion-ship-visual');
const viewports = [
  { width: 1440, height: 900, label: 'desktop' },
  { width: 1024, height: 768, label: 'tablet' },
  { width: 390, height: 844, label: 'mobile' },
  { width: 360, height: 500, label: 'compact-mobile' },
];

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/production?route=ship`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Cohesion Ship preview server did not start.');
}

const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const browser = await chromium.launch({ headless: true });

try {
  await waitForServer();
  await mkdir(artifactRoot, { recursive: true });
  for (const icon of ['personnel', 'coordination', 'training', 'systems', 'life']) {
    const response = await fetch(`${baseUrl}/assets/icons/cohesion-task-categories/${icon}.svg`);
    assert.equal(response.ok, true, `${icon} task icon asset loads`);
    assert.match(await response.text(), /<svg\b/, `${icon} task icon asset is SVG`);
  }
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/production?route=ship`);
    await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
    await page.waitForSelector('.ship-cohesion-workspace');
    assert.deepEqual(pageErrors, [], `${viewport.label} page errors`);
    assert.equal(await page.locator('.ship-hero, .ship-board, .ship-system-card, .ship-operational-status').count(), 0);
    assert.equal(await page.locator('.ship-cohesion-segment').count(), 20);
    assert.equal(await page.locator('.ship-cohesion-ring-layer.is-back .ship-cohesion-segment').count(), 10);
    assert.equal(await page.locator('.ship-cohesion-ring-layer.is-front .ship-cohesion-segment').count(), 10);
    assert.equal(await page.locator('.ship-cohesion-segment-shape').count(), 40);
    assert.equal(
      await page.locator('.ship-cohesion-segment').evaluateAll((segments) => segments.every((segment) => segment.tagName === 'g')),
      true,
      `${viewport.label} ring retains logical SVG segment groups`,
    );
    assert.equal(
      await page.locator('.ship-cohesion-segment-shape').evaluateAll((shapes) => shapes.every((shape) => {
        const path = shape.getAttribute('d') || '';
        return shape.tagName === 'path'
          && path.trim().endsWith('Z')
          && (path.match(/\bA\b/g) || []).length === 2
          && (path.match(/\bQ\b/g) || []).length === 4;
      })),
      true,
      `${viewport.label} ring uses closed rounded annular sectors`,
    );
    assert.equal(await page.locator('.ship-task-button').count(), 5);
    assert.equal(await page.locator('.ship-task-mobile-panel').count(), 5);
    assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 0);
    assert.equal(await page.locator('.ship-task-button .ship-task-category-icon').count(), 5);
    assert.equal(await page.locator('.ship-task-detail .ship-task-category-icon').count(), 1);
    assert.deepEqual(
      await page.locator('.ship-task-button .ship-task-category-icon').evaluateAll((icons) => icons.map((icon) => icon.dataset.category)),
      ['systems', 'systems', 'personnel', 'coordination', 'shipboardLife'],
      `${viewport.label} task cards use primary-family icons`,
    );
    assert.equal(
      await page.locator('.ship-task-category-icon').evaluateAll((icons) => icons.every((icon) => icon.getAttribute('aria-hidden') === 'true')),
      true,
      `${viewport.label} decorative task icons stay out of the accessibility tree`,
    );
    assert.equal(await page.locator('.ship-task-detail').count(), 1);
    assert.match(await page.locator('.ship-cohesion-backlog').textContent(), /3 more issues queued/);

    const geometry = await page.evaluate(() => {
      const workspace = document.querySelector('.ship-cohesion-workspace');
      const header = document.querySelector('.ship-cohesion-header');
      const orbit = document.querySelector('.ship-cohesion-orbit');
      const visual = document.querySelector('.ship-cohesion-visual');
      const image = visual.querySelector('img');
      const detail = document.querySelector('.ship-task-detail');
      const nav = document.querySelector('.ship-task-nav');
      const button = document.querySelector('.ship-task-button');
      const leader = document.querySelector('.ship-task-leaders');
      const backLayer = document.querySelector('.ship-cohesion-ring-layer.is-back');
      const frontLayer = document.querySelector('.ship-cohesion-ring-layer.is-front');
      const segments = [...document.querySelectorAll('.ship-cohesion-segment')];
      const shapes = [...document.querySelectorAll('.ship-cohesion-segment-shape')];
      const visibleShapes = shapes.filter((shape) => getComputedStyle(shape).display !== 'none');
      const firstShapeStyle = getComputedStyle(visibleShapes[0]);
      const screenPoint = (path, length) => {
        const point = path.getPointAtLength(length);
        const matrix = path.getScreenCTM();
        return { x: (point.x * matrix.a) + (point.y * matrix.c) + matrix.e, y: (point.x * matrix.b) + (point.y * matrix.d) + matrix.f };
      };
      const orbitBox = orbit.getBoundingClientRect();
      const headerBox = header.getBoundingClientRect();
      const visualBox = visual.getBoundingClientRect();
      const detailBox = detail.getBoundingClientRect();
      const navBox = nav.getBoundingClientRect();
      const backBox = backLayer.getBoundingClientRect();
      const frontBox = frontLayer.getBoundingClientRect();
      const center = (box) => ({ x: box.left + (box.width / 2), y: box.top + (box.height / 2) });
      const ringCenter = center(backBox);
      const visualCenter = center(visualBox);
      const samplePath = visibleShapes[0];
      const sampleLength = samplePath.getTotalLength();
      const queuedShape = visibleShapes.find((shape) => shape.parentElement?.classList.contains('is-queued'));
      const radii = Array.from({ length: 401 }, (_, index) => {
        const sample = screenPoint(samplePath, sampleLength * (index / 400));
        return Math.hypot(sample.x - ringCenter.x, sample.y - ringCenter.y);
      });
      const visibleVariants = new Set(visibleShapes.map((shape) => (shape.classList.contains('is-mobile') ? 'mobile' : 'desktop')));
      const zIndex = (node) => Number.parseInt(getComputedStyle(node).zIndex, 10) || 0;
      return {
        workspaceOverflowY: getComputedStyle(workspace).overflowY,
        workspaceHorizontalOverflow: workspace.scrollWidth > workspace.clientWidth + .5,
        documentHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + .5,
        visualRatio: visualBox.width / orbitBox.width,
        detailBelowOrbit: detailBox.top >= orbitBox.bottom - .5,
        imageNatural: [image?.naturalWidth || 0, image?.naturalHeight || 0],
        leaderDisplay: getComputedStyle(leader).display,
        sharedDetailDisplay: getComputedStyle(detail).display,
        navPosition: getComputedStyle(nav).position,
        buttonPosition: getComputedStyle(button).position,
        buttonHeight: button.getBoundingClientRect().height,
        visibleShapeCount: visibleShapes.length,
        variant: visibleVariants.size === 1 ? [...visibleVariants][0] : 'mixed',
        pathClosed: visibleShapes.every((shape) => (shape.getAttribute('d') || '').trim().endsWith('Z')),
        hasRoundLinecap: visibleShapes.some((shape) => getComputedStyle(shape).strokeLinecap === 'round'),
        shapeFill: firstShapeStyle.fill,
        queuedStrokeDasharray: queuedShape ? getComputedStyle(queuedShape).strokeDasharray : 'none',
        bandThickness: Math.max(...radii) - Math.min(...radii),
        ringTopInsideOrbit: backBox.top >= orbitBox.top - .5,
        ringBelowHeader: backBox.top >= headerBox.bottom - .5,
        ringAboveTasks: backBox.bottom <= navBox.top + .5,
        ringLayerDelta: Math.hypot(backBox.left - frontBox.left, backBox.top - frontBox.top),
        ringShipCenterDelta: Math.hypot(ringCenter.x - visualCenter.x, ringCenter.y - visualCenter.y),
        stacking: {
          back: zIndex(backLayer), ship: zIndex(visual), front: zIndex(frontLayer),
          leaders: zIndex(leader), tasks: zIndex(nav),
        },
      };
    });
    assert.match(geometry.workspaceOverflowY, /auto|scroll/);
    assert.equal(geometry.workspaceHorizontalOverflow, false, `${viewport.label} workspace overflow-x`);
    assert.equal(geometry.documentHorizontalOverflow, false, `${viewport.label} document overflow-x`);
    assert.deepEqual(geometry.imageNatural, [1672, 941]);
    assert.equal(geometry.visibleShapeCount, 20, `${viewport.label} visible segment shapes`);
    assert.equal(geometry.variant, viewport.width <= 820 ? 'mobile' : 'desktop', `${viewport.label} responsive segment geometry`);
    assert.equal(geometry.pathClosed, true, `${viewport.label} uses closed annular sectors`);
    assert.equal(geometry.hasRoundLinecap, false, `${viewport.label} has no pill caps`);
    assert.notEqual(geometry.shapeFill, 'none', `${viewport.label} segment shape is filled`);
    assert.equal(geometry.queuedStrokeDasharray, 'none', `${viewport.label} queued segment edges remain solid`);
    assert.ok(
      geometry.bandThickness >= 13 && geometry.bandThickness <= 17,
      `${viewport.label} ring band stays optically matched (actual ${geometry.bandThickness.toFixed(2)}px)`,
    );
    assert.ok(geometry.ringLayerDelta <= .5, `${viewport.label} ring layers remain synchronized`);
    if (viewport.width > 820) {
      assert.equal(geometry.detailBelowOrbit, true, `${viewport.label} detail panel must remain below the ship`);
      assert.ok(geometry.visualRatio >= .89, `${viewport.label} ship graphic uses at least 89% of the orbit width`);
      assert.notEqual(geometry.leaderDisplay, 'none');
      assert.equal(await page.locator('.ship-task-leader').count(), 5);
      assert.equal(geometry.navPosition, 'absolute');
      assert.equal(geometry.buttonPosition, 'absolute');
      assert.ok(
        geometry.stacking.back < geometry.stacking.ship
          && geometry.stacking.ship < geometry.stacking.front
          && geometry.stacking.front < geometry.stacking.leaders
          && geometry.stacking.leaders < geometry.stacking.tasks,
        `${viewport.label} ring passes behind and in front of the ship`,
      );
    } else {
      assert.equal(geometry.leaderDisplay, 'none');
      assert.equal(geometry.navPosition, 'static');
      assert.equal(geometry.buttonPosition, 'static');
      assert.equal(geometry.sharedDetailDisplay, 'none');
      assert.ok(geometry.buttonHeight >= 44 && geometry.buttonHeight <= 72, `${viewport.label} compact task touch target`);
      assert.equal(geometry.ringTopInsideOrbit, true, `${viewport.label} ring stays inside its canvas`);
      assert.equal(geometry.ringBelowHeader, true, `${viewport.label} ring stays below the ship title`);
      assert.equal(geometry.ringAboveTasks, true, `${viewport.label} ring stays above the task accordion`);
      assert.ok(geometry.ringShipCenterDelta <= 2, `${viewport.label} ship and ring stay centered together`);
    }

    await page.screenshot({ path: path.join(artifactRoot, `${viewport.label}-${viewport.width}x${viewport.height}-initial.png`) });

    const buttons = page.locator('.ship-task-button');
    assert.equal(await buttons.nth(0).getAttribute('aria-pressed'), 'true');
    await buttons.nth(1).click();
    assert.equal(await buttons.nth(1).getAttribute('aria-pressed'), 'true');
    const mobile = viewport.width <= 820;
    const activeDetail = mobile
      ? page.locator('.ship-task-mobile-panel:not([hidden])')
      : page.locator('.ship-task-detail');
    if (mobile) {
      assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 1);
      assert.equal(await buttons.nth(1).getAttribute('aria-expanded'), 'true');
      assert.equal(await activeDetail.locator('h3').count(), 0, `${viewport.label} inline detail does not repeat the title`);
    } else {
      assert.match(await page.locator('.ship-task-detail h3').textContent(), /Systems Integration/);
    }
    assert.match(await activeDetail.textContent(), /Why it matters to you/);
    assert.match(await activeDetail.textContent(), /always ask the ship's computer for help/i);

    await buttons.nth(2).focus();
    await page.keyboard.press('Enter');
    assert.equal(await buttons.nth(2).getAttribute('aria-pressed'), 'true', `${viewport.label} keyboard task selection`);
    if (mobile) {
      assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 1);
      assert.equal(await buttons.nth(1).getAttribute('aria-expanded'), 'false');
      assert.equal(await buttons.nth(2).getAttribute('aria-expanded'), 'true');
      assert.match(await page.locator('.ship-task-mobile-panel:not([hidden])').textContent(), /crewmember missed an important watch/i);
    } else {
      assert.match(await page.locator('.ship-task-detail h3').textContent(), /The Missed Watch/);
      assert.equal(await page.locator('.ship-task-detail .ship-task-category-icon').getAttribute('data-category'), 'personnel');
    }
    await buttons.nth(0).hover();
    assert.equal(await page.locator('.ship-cohesion-segment.is-preview').count(), 2, `${viewport.label} hover reward preview`);
    await page.mouse.move(1, 1);
    assert.equal(await page.locator('.ship-cohesion-segment.is-preview').count(), 1, `${viewport.label} selected reward remains highlighted`);
    if (mobile) {
      const highlightedHeaders = await buttons.evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).borderLeftColor === 'rgb(255, 162, 79)').length);
      assert.equal(highlightedHeaders, 1, `${viewport.label} only the expanded accordion header remains highlighted`);
    }
    const reliefButton = mobile
      ? page.locator('.ship-task-mobile-panel:not([hidden]) .ship-command-relief-button')
      : page.locator('.ship-task-detail .ship-command-relief-button');
    assert.equal(await reliefButton.isEnabled(), true);
    await reliefButton.click();
    assert.match(await reliefButton.textContent(), /reserved/i);
    assert.equal(await page.evaluate(() => globalThis.__directiveFixtureActions.some(({ action }) => action === 'reserveCohesionRelief')), true);

    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelector('.ship-cohesion-workspace').scrollTop = 0;
    });
    await page.screenshot({ path: path.join(artifactRoot, `${viewport.label}-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.close();
  }

  for (const viewport of viewports.filter(({ width }) => width <= 820)) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${baseUrl}/production?route=ship&taskCount=2`);
    await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
    const buttons = page.locator('.ship-task-button');
    assert.equal(await buttons.count(), 2);
    const collapsed = await buttons.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    assert.equal(collapsed.every((height) => height >= 44 && height <= 72), true, `${viewport.label} two-task headers stay compact`);
    assert.ok(Math.max(...collapsed) - Math.min(...collapsed) <= 1, `${viewport.label} two-task headers do not stretch`);
    assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 0);
    await buttons.nth(0).click();
    assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 1);
    await buttons.nth(1).click();
    assert.equal(await buttons.nth(0).getAttribute('aria-expanded'), 'false');
    assert.equal(await buttons.nth(1).getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 1);
    await buttons.nth(1).click();
    assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 0);
    await page.screenshot({ path: path.join(artifactRoot, `${viewport.label}-${viewport.width}x${viewport.height}-two-tasks.png`), fullPage: true });
    await page.close();
  }

  const reduced = await browser.newPage({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
  await reduced.goto(`${baseUrl}/production?route=ship`);
  await reduced.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const reducedMotion = await reduced.locator('.ship-cohesion-segment').first().evaluate((node) => ({
    transition: getComputedStyle(node).transitionDuration,
    animations: getComputedStyle(node).animationName,
  }));
  assert.ok(Number.parseFloat(reducedMotion.transition) <= .001);
  assert.equal(reducedMotion.animations, 'none');
  await reduced.close();
} finally {
  await browser.close();
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

console.log('Cohesion Ship Playwright visual certification passed.');
