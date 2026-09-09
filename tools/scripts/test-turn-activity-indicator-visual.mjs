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
  await indicator.waitFor({state: 'visible'});
  assert.equal(await indicator.locator('.directive-turn-activity-label').textContent(), 'Processing the turn...');
  const styles = await indicator.evaluate(card => ({border: getComputedStyle(card).borderLeftColor, radius: getComputedStyle(card).borderRadius}));
  assert.equal(styles.border, 'rgb(242, 161, 38)');
  assert.equal(styles.radius, '4px');
  await page.evaluate(async () => {
    const activity = await import('/src/hosts/sillytavern/turn-activity-indicator.js');
    globalThis.__activity = activity;
    for (let i = 0; i < 8; i++) {
      activity.recordDirectiveTurnProgress({type:'start', operationId:`done-${i}`, stage:'directing-story', startedAt:performance.now() - 6000});
      activity.recordDirectiveTurnProgress({type:'update', operationId:`done-${i}`, phase:'waiting-model', phaseStartedAt:performance.now() - 6000});
      activity.recordDirectiveTurnProgress({type:'update', operationId:`done-${i}`, phase:'validating-response', phaseStartedAt:performance.now() - 500});
      activity.recordDirectiveTurnProgress({type:'finish', operationId:`done-${i}`, outcome:i === 0 ? 'failed' : 'complete', endedAt:performance.now()});
    }
    activity.recordDirectiveTurnProgress({type:'start', operationId:'review', stage:'reviewing-events', startedAt:performance.now()});
    activity.recordDirectiveTurnProgress({type:'update', operationId:'review', phase:'waiting-model', phaseStartedAt:performance.now()});
  });
  const recent = indicator.locator('.directive-progress-recent');
  assert.equal(await recent.locator(':scope > li').count(), 5, 'four recent operations plus older failure');
  assert.equal(await indicator.locator('.directive-progress-active > li').count(), 1, 'current work appears once');
  assert.equal(await indicator.locator('.directive-progress-breakdown:visible').count(), 0, 'substeps start collapsed');
  assert.equal(await recent.locator(':scope > [data-outcome="failed"]').count(), 1, 'failure stays visible');
  assert.equal(await indicator.locator('.directive-turn-activity-elapsed').getAttribute('aria-live'), 'off');
  const recentBox = await recent.boundingBox();
  assert.ok(recentBox.height < 180, `five rows fit compactly: ${recentBox.height}`);
  assert.equal(await recent.evaluate(el => el.scrollHeight <= el.clientHeight), true, 'recent activity does not scroll');
  const disclosure = indicator.locator('.directive-progress-active > li > details');
  await disclosure.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await disclosure.getAttribute('open'), '');
  await page.evaluate(() => __activity.recordDirectiveTurnProgress({type:'update', operationId:'review', phase:'validating-response', phaseStartedAt:performance.now()}));
  assert.equal(await disclosure.locator(':scope > summary').evaluate(el => el === document.activeElement), true, 'phase events preserve keyboard focus');
  assert.equal(await disclosure.getAttribute('open'), '', 'phase events preserve expansion');
  await page.waitForTimeout(2100);
  assert.notEqual(await disclosure.locator(':scope > summary [data-progress-duration]').textContent(), '<1s', 'observed duration ticks');
  await disclosure.locator(':scope > summary').click();
  await page.evaluate(() => {
    __activity.recordDirectiveTurnProgress({type:'start', operationId:'episode', stage:'reviewing-episode', startedAt:performance.now()});
    __activity.recordDirectiveTurnProgress({type:'update', operationId:'episode', attempt:2, phase:'waiting-model', phaseStartedAt:performance.now()});
  });
  assert.equal(await indicator.locator('.directive-progress-active > li').count(), 2, 'concurrent operations are both anchored');
  assert.match(await indicator.locator('.directive-turn-activity-label').textContent(), /attempt 2/);
  const earlier = indicator.locator('.directive-turn-activity-details');
  await earlier.locator(':scope > summary').click();
  assert.equal(await earlier.locator('.directive-progress-earlier > li').count(), 3);
  await earlier.locator(':scope > summary').click();
  const artifacts = path.join(repoRoot, 'artifacts', 'compact-turn-progress');
  mkdirSync(artifacts, {recursive:true});
  await indicator.screenshot({path:path.join(artifacts,'desktop.png')});
  await indicator.getByRole('button', {name:'View full log'}).click();
  const log = page.locator('#directive-turn-progress-log');
  assert.equal(await log.isVisible(), true);
  assert.equal(await log.locator('.directive-progress-log-rows > li').count(), 10);
  await page.keyboard.press('Escape');
  assert.equal(await indicator.getByRole('button', {name:'View full log'}).evaluate(el => el === document.activeElement), true, 'Escape restores opener focus');
  const moving = indicator.locator('[data-row-id="review"] > details');
  await moving.locator(':scope > summary').click();
  await page.evaluate(() => __activity.recordDirectiveTurnProgress({type:'finish', operationId:'review', outcome:'complete', endedAt:performance.now()}));
  assert.equal(await moving.getAttribute('open'), '', 'completion retains expanded details');
  assert.equal(await moving.locator(':scope > summary').evaluate(el => el === document.activeElement), true, 'completion retains keyboard focus');
  // Completion still owns the active card; retaining a log never keeps it running.
  await page.evaluate(async () => {
    __activity.recordDirectiveTurnProgress({type:'finish', operationId:'episode', outcome:'failed', endedAt:performance.now()});
    __activity.recordDirectiveTurnProgress({type:'finish', operationId:'review', outcome:'complete', endedAt:performance.now()});
    globalThis.__releaseActivityInterception();
    await globalThis.__directiveBoundaryInterception;
  });
  assert.equal(await indicator.getAttribute('data-directive-turn-activity-phase'), 'waiting');
  await page.evaluate(() => {
    const base = {kind:'objectiveComplete', title:'Objective complete', summary:'Coexistence proof.', priority:70, sourceRevision:'mission:2;story:1'};
    __directiveShowGameplayNotifications(['mission','people','ship'].map(route => ({...base,id:`${route}.compact`,route,subjectId:`${route}.compact`})));
  });
  assert.equal(await page.locator('.directive-gameplay-notification').count(), 3);
  await page.waitForTimeout(250);
  const stack = await page.evaluate(() => ({bottom:document.querySelector('#directive-turn-activity-indicator').getBoundingClientRect().bottom, top:document.querySelector('.directive-gameplay-notification').getBoundingClientRect().top}));
  assert.ok(stack.top >= stack.bottom + 6, 'gameplay notifications remain below activity');
  await page.evaluate(() => __emitActivityStream('actual stream chunk'));
  assert.equal(await indicator.locator('.directive-turn-activity-label').textContent(), 'Receiving the reply');
  await indicator.getByRole('button', {name:'View full log'}).click();
  await page.evaluate(() => __emitActivityEnd());
  await indicator.waitFor({state:'hidden'});
  assert.equal(await log.isVisible(), true, 'open log remains readable on completion');
  assert.equal(await log.locator('[data-outcome="active"]').count(), 0);
  const frozen = await log.locator('.directive-progress-log-total').textContent();
  await page.waitForTimeout(1100);
  assert.equal(await log.locator('.directive-progress-log-total').textContent(), frozen, 'completed durations freeze');
  await log.screenshot({path:path.join(artifacts,'full-log.png')});
  await page.keyboard.press('Escape');
  const launcher = page.locator('#directive-turn-activity-log-launcher');
  await page.waitForFunction(() => document.activeElement?.id === 'directive-turn-activity-log-launcher');
  assert.equal(await launcher.evaluate(el => el === document.activeElement), true, 'completion restores focus to retained log control');
  await launcher.click();
  assert.match(await log.textContent(), /Last activity/);
  await page.evaluate(() => __activity.recordDirectiveTurnProgress({type:'reset'}));
  assert.equal(await page.locator('#directive-turn-progress-log').count(), 0, 'reset removes stale log and modal');
  assert.equal(await launcher.count(), 0);
  assert.equal(await page.locator('.directive-gameplay-notification').count(), 3, 'log cleanup preserves gameplay cards');
  await page.evaluate(() => {
    __activity.markDirectiveTurnActivity();
    __activity.recordDirectiveTurnProgress({type:'start',operationId:'context',stage:'building-context',startedAt:performance.now()});
  });
  assert.equal(await indicator.locator('.directive-progress-active > li').count(), 1, 'local context is not duplicated');
  assert.notEqual(await indicator.locator('.directive-progress-active > li > details > summary [data-progress-duration]').textContent(), '', 'context has observed duration');
  await page.evaluate(() => __activity.recordDirectiveTurnProgress({type:'finish',operationId:'context',outcome:'complete',endedAt:performance.now()}));
  const contextSummary = indicator.locator('[data-row-id="turn-context"] > details > summary');
  await contextSummary.click();
  await page.evaluate(() => {
    for (let i=0; i<5; i++) {
      __activity.recordDirectiveTurnProgress({type:'start',operationId:`age-${i}`,stage:'directing-story',startedAt:performance.now()});
      __activity.recordDirectiveTurnProgress({type:'finish',operationId:`age-${i}`,outcome:'complete',endedAt:performance.now()});
    }
  });
  assert.equal(await contextSummary.evaluate(el => el === document.activeElement), true, 'aging into earlier history preserves focus');
  assert.equal(await contextSummary.isVisible(), true, 'focused older operation remains readable');
  assert.equal(await indicator.locator('[data-row-id="turn-context"] > details').getAttribute('open'), '');
  await page.close();

  const context = await browser.newContext({reducedMotion:'reduce', viewport:{width:390,height:780}});
  const mobile = await context.newPage();
  await mobile.goto(`${baseUrl}/production?route=mission`);
  await mobile.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  await mobile.evaluate(async () => {
    const a = await import('/src/hosts/sillytavern/turn-activity-indicator.js');
    a.markDirectiveTurnActivity();
    for (let i=0;i<5;i++) {
      a.recordDirectiveTurnProgress({type:'start',operationId:`m${i}`,stage:'updating-characters',startedAt:performance.now()});
      a.recordDirectiveTurnProgress({type:'finish',operationId:`m${i}`,outcome:'complete',endedAt:performance.now()});
    }
    a.recordDirectiveTurnProgress({type:'start',operationId:'mobile',stage:'updating-characters',startedAt:performance.now(),attempt:12});
    a.recordDirectiveTurnProgress({type:'update',operationId:'mobile',phase:'validating-response',phaseStartedAt:performance.now()});
  });
  const mobileCard = mobile.locator('#directive-turn-activity-indicator');
  for (const width of [390,320]) {
    await mobile.setViewportSize({width,height:780});
    const box = await mobileCard.boundingBox();
    assert.ok(box.x >= 0 && box.x+box.width <= width, `card fits ${width}px`);
    assert.equal(await mobileCard.locator('.directive-turn-activity-label').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'long operation labels wrap');
    assert.equal(await mobileCard.locator('.directive-progress-active > li > details > summary .directive-progress-state-dot').evaluate(el => getComputedStyle(el).animationName), 'none');
    await mobileCard.screenshot({path:path.join(artifacts,`mobile-${width}.png`)});
    await mobileCard.getByRole('button',{name:'View full log'}).click();
    const dialogBox = await mobile.locator('dialog[open]').boundingBox();
    assert.ok(dialogBox.x >= 0 && dialogBox.x+dialogBox.width <= width, 'log fits mobile viewport');
    await mobile.keyboard.press('Escape');
  }
  await context.close();
  console.log('PASS compact turn progress browser layout, focus, lifecycle, concurrency and mobile');
} finally {
  await browser.close();
  server.kill();
}
