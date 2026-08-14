import assert from 'node:assert/strict';
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
    bridge.setSillyTavernDirectiveRuntimeBridge({
      turnOrchestrator: {
        async interceptGeneration() {
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
  assert.equal(await indicator.locator('.directive-turn-activity-label').textContent(), 'Reading your post...');
  assert.equal(await indicator.locator('.directive-notification-title-icon').getAttribute('data-glyph'), 'route-campaign');
  assert.equal(await indicator.locator('button').count(), 0, 'turn activity remains lifecycle-controlled and non-dismissible');
  await page.waitForTimeout(220);
  const readingGeometry = await indicator.boundingBox();
  assert.ok(readingGeometry?.width > 0 && readingGeometry?.height > 0, 'reading status must occupy visible browser geometry');
  assert.ok(
    readingGeometry.y >= 8 && readingGeometry.y <= 40,
    `reading status shares the upper Directive notification lane: ${JSON.stringify(readingGeometry)}`,
  );
  assert.equal(
    await page.evaluate(async () => (await globalThis.__directiveBoundaryInterception).responseStrategy),
    'injectAndContinue',
    'presentation dwell must not delay the generation interceptor result'
  );
  assert.equal(await indicator.isVisible(), true, 'fast interception keeps the reading phase visible long enough to perceive');
  assert.equal(await indicator.locator('.directive-turn-activity-label').textContent(), 'Reading your post...');

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

  await page.waitForFunction(() => (
    document.querySelector('#directive-turn-activity-indicator')?.dataset.directiveTurnActivityPhase === 'writing'
  ));
  assert.equal(await indicator.getAttribute('data-directive-turn-activity-phase'), 'writing');
  assert.equal(await indicator.locator('.directive-notification-category').textContent(), 'SillyTavern');
  assert.equal(await indicator.locator('.directive-turn-activity-label').textContent(), 'Writing...');
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
    activity.clearDirectiveTurnActivity(globalThis.__directiveReducedActivityToken);
  });
  await reducedContext.close();
  console.log('PASS Directive turn activity Playwright reproduction');
} finally {
  await browser.close();
  server.kill();
}
