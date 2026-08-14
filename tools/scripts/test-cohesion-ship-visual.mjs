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
    assert.equal(await page.locator('.ship-task-button').count(), 5);
    assert.equal(await page.locator('.ship-task-detail').count(), 1);
    assert.match(await page.locator('.ship-cohesion-backlog').textContent(), /3 more issues queued/);

    const geometry = await page.evaluate(() => {
      const workspace = document.querySelector('.ship-cohesion-workspace');
      const orbit = document.querySelector('.ship-cohesion-orbit');
      const visual = document.querySelector('.ship-cohesion-visual');
      const image = visual.querySelector('img');
      const detail = document.querySelector('.ship-task-detail');
      const nav = document.querySelector('.ship-task-nav');
      const button = document.querySelector('.ship-task-button');
      const leader = document.querySelector('.ship-task-leaders');
      const orbitBox = orbit.getBoundingClientRect();
      const visualBox = visual.getBoundingClientRect();
      const detailBox = detail.getBoundingClientRect();
      return {
        workspaceOverflowY: getComputedStyle(workspace).overflowY,
        workspaceHorizontalOverflow: workspace.scrollWidth > workspace.clientWidth + .5,
        documentHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + .5,
        visualRatio: visualBox.width / orbitBox.width,
        detailBelowOrbit: detailBox.top >= orbitBox.bottom - .5,
        imageNatural: [image?.naturalWidth || 0, image?.naturalHeight || 0],
        leaderDisplay: getComputedStyle(leader).display,
        navPosition: getComputedStyle(nav).position,
        buttonPosition: getComputedStyle(button).position,
        buttonHeight: button.getBoundingClientRect().height,
      };
    });
    assert.match(geometry.workspaceOverflowY, /auto|scroll/);
    assert.equal(geometry.workspaceHorizontalOverflow, false, `${viewport.label} workspace overflow-x`);
    assert.equal(geometry.documentHorizontalOverflow, false, `${viewport.label} document overflow-x`);
    assert.deepEqual(geometry.imageNatural, [1672, 941]);
    assert.equal(geometry.detailBelowOrbit, true, `${viewport.label} detail panel must remain below the ship`);
    if (viewport.width > 820) {
      assert.ok(geometry.visualRatio >= .89, `${viewport.label} ship graphic uses at least 89% of the orbit width`);
      assert.notEqual(geometry.leaderDisplay, 'none');
      assert.equal(await page.locator('.ship-task-leader').count(), 5);
      assert.equal(geometry.navPosition, 'absolute');
      assert.equal(geometry.buttonPosition, 'absolute');
    } else {
      assert.equal(geometry.leaderDisplay, 'none');
      assert.equal(geometry.navPosition, 'static');
      assert.equal(geometry.buttonPosition, 'static');
      assert.ok(geometry.buttonHeight >= 44, `${viewport.label} task touch target`);
    }

    await page.screenshot({ path: path.join(artifactRoot, `${viewport.label}-${viewport.width}x${viewport.height}-initial.png`) });

    const buttons = page.locator('.ship-task-button');
    assert.equal(await buttons.nth(0).getAttribute('aria-pressed'), 'true');
    await buttons.nth(1).click();
    assert.equal(await buttons.nth(1).getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('.ship-task-detail h3').textContent(), /Systems Integration/);
    assert.match(await page.locator('.ship-task-detail').textContent(), /Why it matters to you/);
    assert.match(await page.locator('.ship-task-detail').textContent(), /always ask the ship's computer for help/i);

    await buttons.nth(2).focus();
    await page.keyboard.press('Enter');
    assert.equal(await buttons.nth(2).getAttribute('aria-pressed'), 'true', `${viewport.label} keyboard task selection`);
    assert.match(await page.locator('.ship-task-detail h3').textContent(), /The Missed Watch/);
    await buttons.nth(0).hover();
    assert.equal(await page.locator('.ship-cohesion-segment.is-preview').count(), 2, `${viewport.label} hover reward preview`);
    await page.mouse.move(1, 1);
    assert.equal(await page.locator('.ship-cohesion-segment.is-preview').count(), 1, `${viewport.label} selected reward remains highlighted`);
    assert.equal(await page.locator('.ship-command-relief-button').isEnabled(), true);
    await page.locator('.ship-command-relief-button').click();
    assert.match(await page.locator('.ship-command-relief-button').textContent(), /reserved/i);
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
