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
  assert.equal(await indicator.locator('.directive-turn-activity-label').textContent(), 'Directive is reading your post...');
  const readingGeometry = await indicator.boundingBox();
  assert.ok(readingGeometry?.width > 0 && readingGeometry?.height > 0, 'reading status must occupy visible browser geometry');
  assert.ok(readingGeometry.y > 400, 'reading status stays near the lower edge of the viewport');
  assert.equal(
    await page.evaluate(async () => (await globalThis.__directiveBoundaryInterception).responseStrategy),
    'injectAndContinue',
    'presentation dwell must not delay the generation interceptor result'
  );
  await page.waitForTimeout(250);
  assert.equal(await indicator.isVisible(), true, 'fast interception must keep the reading phase visible long enough to perceive');
  assert.equal(await indicator.locator('.directive-turn-activity-label').textContent(), 'Directive is reading your post...');

  await page.waitForFunction(() => (
    document.querySelector('#directive-turn-activity-indicator')?.dataset.directiveTurnActivityPhase === 'writing'
  ));
  assert.equal(await indicator.getAttribute('data-directive-turn-activity-phase'), 'writing');
  assert.equal(await indicator.locator('.directive-turn-activity-label').textContent(), 'SillyTavern is writing...');
  await indicator.waitFor({ state: 'hidden', timeout: 1500 });

  await page.evaluate(async () => {
    const bridge = await import('/src/hosts/sillytavern/runtime-bridge.mjs');
    bridge.clearSillyTavernDirectiveRuntimeBridge();
  });
  await page.close();
  console.log('PASS Directive turn activity Playwright reproduction');
} finally {
  await browser.close();
  server.kill();
}
