import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 57000 + (process.pid % 7000);
const baseUrl = `http://127.0.0.1:${port}`;
const notificationCss = fs.readFileSync(path.join(repoRoot, 'styles', 'directive.css'), 'utf8');
assert.match(
  notificationCss,
  /@media\s*\(max-width:\s*360\.5px\)[\s\S]*?\.directive-gameplay-notification-view-text\s*\{\s*display:\s*none;/,
  'the compact View label breakpoint must tolerate fractional 360px browser viewports',
);

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/production?route=mission`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Gameplay notification preview server did not start.');
}

const missionRecord = {
  id: 'mission.objectiveComplete.mission.alpha.2.objective.signal',
  route: 'mission',
  subjectId: 'mission.alpha',
  kind: 'objectiveComplete',
  title: 'Objective complete',
  summary: 'The signal source was located.',
  priority: 70,
  sourceRevision: 'mission:2;story:1',
};
const peopleRecord = {
  ...missionRecord,
  id: 'people.relationshipUpdated.person.t-vel.mission:2;story:2.posture',
  route: 'people',
  subjectId: 'person.t-vel',
  kind: 'relationshipUpdated',
  title: "Relationship updated: T'Vel",
  summary: 'Current posture: Cautiously cooperative',
  priority: 50,
  sourceRevision: 'mission:2;story:2',
};
const shipRecord = {
  ...missionRecord,
  id: 'ship.shipTaskProgress.task.sensor.2.phase.baseline',
  route: 'ship',
  subjectId: 'task.sensor',
  kind: 'shipTaskProgress',
  title: 'Ship task progressed: Sensor Baseline',
  summary: 'Step complete: Run an isolation test',
  priority: 40,
};

const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const browser = await chromium.launch({ headless: true });

try {
  await waitForServer();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${baseUrl}/production?route=mission`);
  await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  await page.evaluate((records) => globalThis.__directiveShowGameplayNotifications(records), [missionRecord, peopleRecord, shipRecord]);
  await page.waitForTimeout(220);
  assert.equal(await page.locator('.directive-gameplay-notification').count(), 3, 'desktop shows the bounded three-card stack');
  const box = await page.locator('.directive-gameplay-notification').first().boundingBox();
  assert.ok(box.width <= 340, 'desktop notification stays compact');
  assert.ok(Math.abs((box.x + (box.width / 2)) - 640) <= 2, 'desktop notification is centered');
  assert.ok(box.y >= 8 && box.y <= 40, `desktop notification stays near the upper edge: ${JSON.stringify(box)}`);
  const cardStyles = await page.locator('.directive-gameplay-notification').evaluateAll((cards) => cards.map((card) => ({
    route: [...card.classList].find((name) => name.startsWith('is-')),
    borderLeftColor: getComputedStyle(card).borderLeftColor,
    clipPath: getComputedStyle(card).clipPath,
  })));
  assert.deepEqual(
    new Set(cardStyles.map(({ borderLeftColor }) => borderLeftColor)),
    new Set(['rgb(242, 161, 38)']),
    'every Directive gameplay notification uses the shared yellow-orange accent',
  );
  assert.equal(
    cardStyles.every(({ clipPath }) => clipPath.includes('4px')),
    true,
    'every Directive gameplay notification exposes four-pixel bevel geometry',
  );
  const titleGlyphs = await page.locator('.directive-notification-title-icon').evaluateAll((icons) => icons.map((icon) => ({
    glyph: icon.dataset.glyph,
    maskImage: getComputedStyle(icon).maskImage,
    ariaHidden: icon.getAttribute('aria-hidden'),
  })));
  assert.deepEqual(titleGlyphs.map(({ glyph }) => glyph), ['route-mission', 'route-crew', 'route-ship']);
  assert.equal(titleGlyphs.every(({ maskImage }) => /route-(mission|crew|ship)\.svg/.test(maskImage)), true);
  assert.equal(titleGlyphs.every(({ ariaHidden }) => ariaHidden === 'true'), true);
  const viewGeometry = await page.locator('.directive-gameplay-notification-view').first().evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const icon = button.querySelector('.directive-gameplay-notification-view-icon');
    return {
      width: rect.width,
      height: rect.height,
      ariaLabel: button.getAttribute('aria-label'),
      glyph: icon.dataset.glyph,
      maskImage: getComputedStyle(icon).maskImage,
    };
  });
  assert.ok(viewGeometry.width >= 44 && viewGeometry.height >= 44, 'View keeps a 44px minimum target');
  assert.equal(viewGeometry.ariaLabel, 'View Mission');
  assert.equal(viewGeometry.glyph, 'action-view');
  assert.match(viewGeometry.maskImage, /action-view\.svg/, 'the supplied search icon renders through the vector mask');

  await page.locator('.directive-gameplay-notification.is-mission .directive-gameplay-notification-dismiss').click();
  await page.waitForTimeout(220);
  assert.equal(await page.locator('.directive-gameplay-notification').count(), 2, 'body click dismisses without navigating');
  assert.equal(await page.locator('[data-directive-runtime-body="true"]').getAttribute('data-route-view'), 'mission');
  await page.locator('.directive-gameplay-notification.is-people .directive-gameplay-notification-view').click();
  await page.waitForTimeout(220);
  assert.equal(await page.locator('[data-directive-runtime-body="true"]').getAttribute('data-route-view'), 'people', 'View opens the matching panel');
  await page.close();

  const presetPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await presetPage.goto(`${baseUrl}/production?route=settings`);
  await presetPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  await presetPage.evaluate(() => globalThis.__directiveShowPresetUpdateNotification({
    title: 'Directive Preset update available',
    message: 'Install the latest bundled narration preset.',
    bundledVersion: '0.3.0',
  }));
  const presetGeometry = await presetPage.locator('.directive-preset-update-notification').evaluate((card) => ({
    borderLeftColor: getComputedStyle(card).borderLeftColor,
    clipPath: getComputedStyle(card).clipPath,
    actionCount: card.querySelectorAll('.directive-preset-update-action').length,
    surfaceId: card.parentElement?.parentElement?.id,
  }));
  assert.equal(presetGeometry.borderLeftColor, 'rgb(242, 161, 38)');
  assert.match(presetGeometry.clipPath, /4px/);
  assert.equal(presetGeometry.actionCount, 3);
  assert.equal(presetGeometry.surfaceId, 'directive-notifications');
  await presetPage.close();

  const collisionPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await collisionPage.goto(`${baseUrl}/production?route=mission`);
  await collisionPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  await collisionPage.evaluate(() => {
    const topBar = document.createElement('div');
    topBar.id = 'top-bar';
    Object.assign(topBar.style, { position: 'fixed', left: '340px', top: '0', width: '600px', height: '48px' });
    const chat = document.createElement('div');
    chat.id = 'sheld';
    Object.assign(chat.style, { position: 'fixed', left: '340px', top: '48px', width: '600px', height: '752px' });
    const container = document.createElement('div');
    container.id = 'toast-container';
    Object.assign(container.style, { position: 'fixed', left: '490px', top: '48px', width: '300px' });
    const toast = document.createElement('div');
    toast.className = 'toast toast-info';
    Object.assign(toast.style, { width: '300px', height: '62px' });
    container.appendChild(toast);
    document.body.append(topBar, chat, container);
  });
  await collisionPage.evaluate((record) => globalThis.__directiveShowGameplayNotifications([record]), missionRecord);
  await collisionPage.waitForTimeout(220);
  const collisionGeometry = await collisionPage.evaluate(() => {
    const directive = document.querySelector('#directive-notifications').getBoundingClientRect();
    const toast = document.querySelector('#toast-container > .toast').getBoundingClientRect();
    const chat = document.querySelector('#sheld').getBoundingClientRect();
    return {
      directiveTop: directive.top,
      directiveCenter: directive.left + (directive.width / 2),
      toastBottom: toast.bottom,
      chatCenter: chat.left + (chat.width / 2),
    };
  });
  assert.ok(collisionGeometry.directiveTop >= collisionGeometry.toastBottom + 6, 'Directive yields below a colliding native toast stack');
  assert.ok(Math.abs(collisionGeometry.directiveCenter - collisionGeometry.chatCenter) <= 2, 'collision-shifted Directive cards stay centered in the chat panel');
  await collisionPage.evaluate(() => document.querySelector('#toast-container').remove());
  await collisionPage.waitForTimeout(100);
  const returnedTop = await collisionPage.locator('#directive-notifications').evaluate((surface) => surface.getBoundingClientRect().top);
  assert.ok(Math.abs(returnedTop - 56) <= 1, 'Directive returns below the top bar after native toasts clear');
  await collisionPage.close();

  const mobilePage = await browser.newPage({ viewport: { width: 360, height: 780 } });
  await mobilePage.goto(`${baseUrl}/production?route=ship`);
  await mobilePage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  await mobilePage.evaluate((record) => globalThis.__directiveShowGameplayNotifications([record]), shipRecord);
  await mobilePage.waitForTimeout(220);
  const mobileGeometry = await mobilePage.locator('.directive-gameplay-notification').evaluate((card) => {
    const cardRect = card.getBoundingClientRect();
    const view = card.querySelector('.directive-gameplay-notification-view');
    return {
      card: { left: cardRect.left, top: cardRect.top, width: cardRect.width },
      viewWidth: view.getBoundingClientRect().width,
      viewTextDisplay: getComputedStyle(view.querySelector('.directive-gameplay-notification-view-text')).display,
    };
  });
  assert.ok(Math.abs((mobileGeometry.card.left + (mobileGeometry.card.width / 2)) - 180) <= 2, 'mobile card stays centered');
  assert.ok(mobileGeometry.card.top >= 8 && mobileGeometry.card.top <= 40, 'mobile card stays below the safe upper edge');
  assert.equal(Math.round(mobileGeometry.viewWidth), 44, '360px viewport uses the compact 44px View button');
  assert.equal(mobileGeometry.viewTextDisplay, 'none', '360px viewport hides only the visible View label');
  await mobilePage.close();

  const mobileCollisionPage = await browser.newPage({ viewport: { width: 360, height: 780 } });
  await mobileCollisionPage.goto(`${baseUrl}/production?route=ship`);
  await mobileCollisionPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  await mobileCollisionPage.evaluate(() => {
    const topBar = document.createElement('div');
    topBar.id = 'top-bar';
    Object.assign(topBar.style, { position: 'fixed', left: '0', top: '0', width: '360px', height: '48px' });
    const chat = document.createElement('div');
    chat.id = 'sheld';
    Object.assign(chat.style, { position: 'fixed', left: '0', top: '48px', width: '360px', height: '732px' });
    const container = document.createElement('div');
    container.id = 'toast-container';
    Object.assign(container.style, { position: 'fixed', left: '30px', top: '48px', width: '300px' });
    const toast = document.createElement('div');
    toast.className = 'toast toast-info';
    Object.assign(toast.style, { width: '300px', height: '62px' });
    container.appendChild(toast);
    document.body.append(topBar, chat, container);
  });
  await mobileCollisionPage.evaluate((record) => globalThis.__directiveShowGameplayNotifications([record]), shipRecord);
  await mobileCollisionPage.waitForTimeout(220);
  const mobileCollision = await mobileCollisionPage.evaluate(() => {
    const directive = document.querySelector('#directive-notifications').getBoundingClientRect();
    const toast = document.querySelector('#toast-container > .toast').getBoundingClientRect();
    return { directiveTop: directive.top, toastBottom: toast.bottom, directiveWidth: directive.width };
  });
  assert.ok(mobileCollision.directiveTop >= mobileCollision.toastBottom + 6, 'mobile Directive cards yield below colliding native toasts');
  assert.ok(mobileCollision.directiveWidth <= 336, 'mobile collision avoidance keeps the 12px side gutters');
  await mobileCollisionPage.close();

  const reducedContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 780 } });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${baseUrl}/production?route=mission`);
  await reducedPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  await reducedPage.evaluate((record) => globalThis.__directiveShowGameplayNotifications([record]), missionRecord);
  const reducedStyle = await reducedPage.locator('.directive-gameplay-notification').evaluate((card) => ({
    animationName: getComputedStyle(card).animationName,
    transform: getComputedStyle(card).transform,
  }));
  assert.equal(reducedStyle.animationName, 'none');
  assert.equal(reducedStyle.transform, 'none');
  await reducedContext.close();

  const proofPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await proofPage.goto(`${baseUrl}/production?route=mission&notificationProof=stack`);
  await proofPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  assert.equal(
    await proofPage.locator('.directive-gameplay-notification').count(),
    3,
    'the fixture-only proof URL should expose a read-only notification stack for external browser certification',
  );
  await proofPage.close();
  console.log('Directive gameplay notification visual tests passed.');
} finally {
  await browser.close();
  server.kill();
}
