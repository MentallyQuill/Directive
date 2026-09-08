import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 61000 + (process.pid % 3000);
const baseUrl = `http://127.0.0.1:${port}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/production?route=mission`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Turn activity preview server did not start.');
}

const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) },
  stdio: ['ignore', 'ignore', 'inherit']
});
const browser = await chromium.launch({ headless: true });

try {
  await waitForServer();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${baseUrl}/production?route=mission`);
  await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  await page.evaluate(async () => {
    const bridge = await import('/src/hosts/sillytavern/runtime-bridge.mjs');
    const events = await import('/src/hosts/sillytavern/shell-events.js');
    const listeners = new Map();
    events.wireEvents({ eventSource: {
      on(name, handler) { listeners.set(name, handler); },
      off(name) { listeners.delete(name); }
    }, eventTypes: { GENERATION_ENDED: 'generation_ended' } });
    globalThis.__emitActivityEnd = () => listeners.get('generation_ended')();
    globalThis.__emitActivityStream = text => listeners.get('STREAM_TOKEN_RECEIVED')(text);
    bridge.setSillyTavernDirectiveRuntimeBridge({
      turnOrchestrator: {
        async interceptGeneration() {
          await new Promise(resolve => { globalThis.__releaseActivityInterception = resolve; });
          return {
            handled: true,
            abortDefaultGeneration: false,
            responseStrategy: 'injectAndContinue'
          };
        }
      }
    });
    globalThis.__directiveBoundaryInterception = bridge.directiveGenerationInterceptor([], 8192, () => {}, 'normal');
  });

  const indicator = page.locator('#directive-turn-activity-indicator');
  await indicator.waitFor({ state: 'visible', timeout: 1200 });
  assert.equal(await indicator.locator('.directive-notification-category').textContent(), 'Directive');
  assert.equal(await indicator.locator('.directive-turn-activity-label').textContent(), 'Processing the turn...');
  assert.equal(await indicator.locator('.directive-notification-title-icon').getAttribute('data-glyph'), 'route-campaign');
  assert.equal(await indicator.locator('button').count(), 0, 'turn activity remains lifecycle-controlled and non-dismissible');
  const activityStyle = await indicator.evaluate((card) => ({
    borderLeftColor: getComputedStyle(card).borderLeftColor,
    clipPath: getComputedStyle(card).clipPath,
    borderRadius: getComputedStyle(card).borderRadius,
  }));
  assert.equal(activityStyle.borderLeftColor, 'rgb(242, 161, 38)', 'activity uses the shared yellow-orange accent');
  assert.equal(activityStyle.clipPath, 'none', 'activity outline and shadow are not polygon-clipped');
  assert.equal(activityStyle.borderRadius, '4px', 'activity uses the shared softly rounded bevel');
  await indicator.evaluate(card => Promise.all(card.getAnimations().map(animation => animation.finished)));
  const readingGeometry = await indicator.boundingBox();
  assert.ok(readingGeometry?.width > 0 && readingGeometry?.height > 0, 'reading status must occupy visible browser geometry');
  assert.ok(
    readingGeometry.y >= 8 && readingGeometry.y <= 40,
    `reading status shares the upper Directive notification lane: ${JSON.stringify(readingGeometry)}`,
  );
  await page.evaluate(async () => {
    const activity = await import('/src/hosts/sillytavern/turn-activity-indicator.js');
    activity.recordDirectiveTurnProgress({ type: 'start', operationId: 'review', stage: 'reviewing-events', startedAt: performance.now() });
  });
  assert.equal(await indicator.locator('.directive-turn-activity-label').textContent(), 'Reviewing recent events...');
  assert.equal(await indicator.locator('[role="status"]').count(), 1);
  assert.equal(await indicator.locator('.directive-turn-activity-elapsed').getAttribute('aria-live'), 'off');
  await indicator.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await indicator.locator('details').getAttribute('open'), '');
  assert.match(await indicator.locator('ol').textContent(), /Reviewing recent events.*In progress/);
  await page.evaluate(async () => {
    const activity = await import('/src/hosts/sillytavern/turn-activity-indicator.js');
    activity.recordDirectiveTurnProgress({ type: 'start', operationId: 'episode', stage: 'reviewing-episode', startedAt: performance.now() });
    activity.recordDirectiveTurnProgress({ type: 'update', operationId: 'episode', attempt: 2 });
  });
  assert.match(await indicator.locator('.directive-turn-activity-concurrent').textContent(), /Reviewing recent events/);
  assert.match(await indicator.locator('.directive-turn-activity-label').textContent(), /attempt 2/);
  assert.equal(await indicator.locator('summary').evaluate(node => node === document.activeElement), true, 'progress updates preserve disclosure focus');
  const progressArtifacts = path.join(repoRoot, 'artifacts', 'turn-progress');
  mkdirSync(progressArtifacts, { recursive: true });
  await page.screenshot({path: path.join(progressArtifacts, 'desktop-details.png')});
  await page.evaluate(async () => {
    const activity = await import('/src/hosts/sillytavern/turn-activity-indicator.js');
    activity.recordDirectiveTurnProgress({ type: 'finish', operationId: 'episode', outcome: 'failed', endedAt: performance.now() });
    activity.recordDirectiveTurnProgress({ type: 'finish', operationId: 'review', outcome: 'complete', endedAt: performance.now() });
  });
  assert.match(await indicator.locator('ol').textContent(), /Reviewing the episode.*Failed/);
  await indicator.locator('summary').click();
  await page.evaluate(async () => {
    globalThis.__releaseActivityInterception();
    await globalThis.__directiveBoundaryInterception;
  });
  assert.equal(await indicator.getAttribute('data-directive-turn-activity-phase'), 'waiting', 'handoff updates immediately without a reading hold');
  assert.equal(await indicator.locator('.directive-turn-activity-label').textContent(), 'Waiting for the reply...');

  await page.evaluate(() => {
    const base = {
      kind: 'objectiveComplete',
      title: 'Objective complete',
      summary: 'Notification coexistence proof.',
      priority: 70,
      sourceRevision: 'mission:2;story:1',
    };
    globalThis.__directiveShowGameplayNotifications([
      { ...base, id: 'mission.activity-stack', route: 'mission', subjectId: 'mission.activity-stack' },
      { ...base, id: 'people.activity-stack', route: 'people', subjectId: 'people.activity-stack' },
      { ...base, id: 'ship.activity-stack', route: 'ship', subjectId: 'ship.activity-stack' },
    ]);
  });
  await page.waitForTimeout(220);
  assert.equal(await page.locator('#directive-notifications').count(), 1, 'activity and gameplay share one notification host');
  assert.equal(await page.locator('.directive-gameplay-notification').count(), 3, 'activity does not consume a gameplay slot');
  const stackedGeometry = await page.evaluate(() => {
    const activity = document.querySelector('#directive-turn-activity-indicator').getBoundingClientRect();
    const gameplay = document.querySelector('.directive-gameplay-notification').getBoundingClientRect();
    return { activityBottom: activity.bottom, gameplayTop: gameplay.top };
  });
  assert.ok(stackedGeometry.gameplayTop >= stackedGeometry.activityBottom + 6, 'gameplay cards stack below active turn status');

  await page.waitForTimeout(850);
  assert.equal(await indicator.isVisible(), true, 'non-streaming response remains owned beyond the old expiry');
  const artifactRoot = path.join(repoRoot, 'artifacts', 'notification-bevel');
  mkdirSync(artifactRoot, { recursive: true });
  const waitingBox = await indicator.boundingBox();
  await page.screenshot({
    path: path.join(artifactRoot, 'activity-bevel.png'), animations: 'disabled',
    clip: { x: Math.max(0, waitingBox.x - 24), y: Math.max(0, waitingBox.y - 8), width: waitingBox.width + 48, height: waitingBox.height + 40 },
  });
  assert.equal(await indicator.locator('.directive-notification-category').textContent(), 'SillyTavern');
  await page.evaluate(() => globalThis.__emitActivityStream('actual stream chunk'));
  assert.equal(await indicator.locator('.directive-turn-activity-label').textContent(), 'Receiving the reply...');
  await page.evaluate(async () => {
    globalThis.__emitActivityEnd();
  });
  await indicator.waitFor({ state: 'hidden', timeout: 1500 });
  assert.equal(await page.locator('.directive-gameplay-notification').count(), 3, 'activity cleanup leaves gameplay notifications intact');

  await page.evaluate(async () => {
    const bridge = await import('/src/hosts/sillytavern/runtime-bridge.mjs');
    bridge.clearSillyTavernDirectiveRuntimeBridge();
  });
  await page.close();

  const reducedContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 780 } });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${baseUrl}/production?route=mission`);
  await reducedPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  await reducedPage.evaluate(async () => {
    const activity = await import('/src/hosts/sillytavern/turn-activity-indicator.js');
    globalThis.__directiveReducedActivityToken = activity.markDirectiveTurnActivity();
  });
  const reducedIndicator = reducedPage.locator('#directive-turn-activity-indicator');
  await reducedIndicator.waitFor({ state: 'visible', timeout: 1200 });
  const reducedStyles = await reducedIndicator.evaluate((card) => ({
    cardAnimation: getComputedStyle(card).animationName,
    glyphAnimation: getComputedStyle(card.querySelector('.directive-notification-title-icon')).animationName,
  }));
  assert.equal(reducedStyles.cardAnimation, 'none');
  assert.equal(reducedStyles.glyphAnimation, 'none');
  await reducedPage.evaluate(async () => {
    const activity = await import('/src/hosts/sillytavern/turn-activity-indicator.js');
    activity.recordDirectiveTurnProgress({ type: 'start', operationId: 'mobile', stage: 'updating-characters', startedAt: performance.now() });
    activity.recordDirectiveTurnProgress({ type: 'update', operationId: 'mobile', attempt: 2 });
  });
  await reducedIndicator.locator('summary').click();
  const mobileBox = await reducedIndicator.boundingBox();
  assert.ok(mobileBox.x >= 0 && mobileBox.x + mobileBox.width <= 390, 'expanded mobile status remains inside the viewport');
  assert.equal(await reducedIndicator.locator('.directive-turn-activity-label').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'long retry label wraps without clipping');
  await reducedPage.screenshot({path: path.join(progressArtifacts, 'mobile-details.png')});
  await reducedPage.setViewportSize({width: 320, height: 780});
  await reducedPage.waitForFunction(() => {
    const box = document.querySelector('#directive-turn-activity-indicator').getBoundingClientRect();
    return box.left >= 0 && box.right <= 320;
  });
  assert.equal(await reducedIndicator.locator('.directive-turn-activity-label').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'retry label remains readable at 320px');
  await reducedPage.evaluate(async () => {
    const activity = await import('/src/hosts/sillytavern/turn-activity-indicator.js');
    activity.clearDirectiveTurnActivity(globalThis.__directiveReducedActivityToken);
  });
  await reducedContext.close();
  console.log('PASS Directive turn activity Playwright reproduction');
} finally {
  await browser.close();
  server.kill();
}
