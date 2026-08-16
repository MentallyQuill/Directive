import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 59000 + (process.pid % 5000);
const baseUrl = `http://127.0.0.1:${port}`;
const routes = ['mission', 'people', 'ship'];
const viewports = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'certified mobile', width: 390, height: 844 },
  { label: 'narrow mobile', width: 360, height: 780 },
];

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/production?route=ship&campaignRequired=1`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Campaign-required preview server did not start.');
}

async function sampleCampaignPulse(campaign, currentTime) {
  return campaign.evaluate((node, time) => {
    const animation = node.getAnimations().find((candidate) => candidate.animationName === 'directive-campaign-guidance-pulse');
    if (!animation) return null;
    animation.pause();
    animation.currentTime = time;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      background: style.backgroundColor,
      borderBottomColor: style.borderBottomColor,
      boxShadow: style.boxShadow,
      color: style.color,
      borderRadius: style.borderRadius,
      outlineStyle: style.outlineStyle,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    };
  }, currentTime);
}

const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const browser = await chromium.launch({ headless: true });

try {
  await waitForServer();

  for (const viewport of viewports) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${baseUrl}/production?route=${route}&campaignRequired=1`);
      try {
        await page.waitForFunction(() => globalThis.__directiveFixtureReady === true, null, { timeout: 5000 });
      } catch (error) {
        throw new Error(`${route} ${viewport.label} fixture readiness failed: ${errors.join(' | ') || error.message}`);
      }

      const statusPanel = page.locator('.directive-campaign-required');
      assert.equal(await statusPanel.count(), 1, `${route} ${viewport.label} must render one campaign-required panel`);
      assert.equal(await statusPanel.locator('button').count(), 0, 'guidance panel must not add a secondary route action');
      assert.equal(
        await statusPanel.locator('.directive-campaign-required-icon').getAttribute('data-glyph'),
        'route-ship',
      );
      assert.equal(
        await statusPanel.locator('.directive-campaign-required-instruction').textContent(),
        'Open Campaign below, then choose or load a save to bring this panel online.',
      );
      const lcarsSegments = statusPanel.locator('.directive-campaign-required-segment');
      assert.equal(await statusPanel.locator('.directive-campaign-required-frame').count(), 1, `${route} ${viewport.label} must render one LCARS frame`);
      assert.equal(await statusPanel.locator('.directive-campaign-required-elbow').count(), 1, `${route} ${viewport.label} must render one continuous elbow`);
      assert.equal(await statusPanel.locator('.directive-campaign-required-icon-pod').count(), 0, `${route} ${viewport.label} must not render the old icon pod`);
      assert.equal(await lcarsSegments.count(), 6, `${route} ${viewport.label} must render six LCARS segments`);
      assert.deepEqual(
        await lcarsSegments.evaluateAll((segments) => segments.map((segment) => segment.dataset.tone)),
        ['amber', 'lilac', 'blue', 'violet', 'salmon', 'amber'],
      );
      const segmentColors = await lcarsSegments.evaluateAll((segments) => segments.map((segment) => getComputedStyle(segment).backgroundColor));
      assert.equal(new Set(segmentColors).size, 5, `${route} ${viewport.label} must use all five LCARS theme colors`);

      const geometry = await page.evaluate(() => {
        const body = document.querySelector('[data-directive-runtime-body="true"]');
        const panel = document.querySelector('.directive-campaign-required');
        const nav = document.querySelector('.directive-route-bar');
        return {
          body: copyRect(body.getBoundingClientRect()),
          panel: copyRect(panel.getBoundingClientRect()),
          nav: copyRect(nav.getBoundingClientRect()),
          panelScrollWidth: panel.scrollWidth,
          bodyClientWidth: body.clientWidth,
          elbow: copyRect(document.querySelector('.directive-campaign-required-elbow').getBoundingClientRect()),
          elbowStyle: (() => {
            const style = getComputedStyle(document.querySelector('.directive-campaign-required-elbow'));
            return {
              background: style.backgroundColor,
              borderTopWidth: style.borderTopWidth,
              borderRightWidth: style.borderRightWidth,
              borderBottomWidth: style.borderBottomWidth,
              borderLeftWidth: style.borderLeftWidth,
            };
          })(),
          topRail: copyRect(document.querySelector('.directive-campaign-required-rail-top').getBoundingClientRect()),
          bottomRail: copyRect(document.querySelector('.directive-campaign-required-rail-bottom').getBoundingClientRect()),
          icon: copyRect(document.querySelector('.directive-campaign-required-icon').getBoundingClientRect()),
          copy: copyRect(document.querySelector('.directive-campaign-required-copy').getBoundingClientRect()),
          copyStyle: (() => {
            const style = getComputedStyle(document.querySelector('.directive-campaign-required-copy'));
            return {
              background: style.backgroundColor,
              boxShadow: style.boxShadow,
              borderRadius: style.borderRadius,
            };
          })(),
          documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };

        function copyRect({ left, top, right, bottom, width, height }) {
          return { left, top, right, bottom, width, height };
        }
      });
      assert.ok(
        Math.abs((geometry.panel.left + geometry.panel.width / 2) - (geometry.body.left + geometry.body.width / 2)) <= 2,
        `${route} ${viewport.label} panel must center horizontally`,
      );
      assert.ok(
        Math.abs((geometry.panel.top + geometry.panel.height / 2) - (geometry.body.top + geometry.body.height / 2)) <= 3,
        `${route} ${viewport.label} panel must center vertically`,
      );
      assert.ok(geometry.panel.bottom < geometry.nav.top, `${route} ${viewport.label} panel must clear navigation`);
      assert.ok(geometry.panelScrollWidth <= geometry.bodyClientWidth, `${route} ${viewport.label} panel must fit route body`);
      assert.ok(Math.abs(geometry.elbow.right - geometry.topRail.left) <= 1, `${route} ${viewport.label} upper rail must touch elbow`);
      assert.ok(Math.abs(geometry.elbow.right - geometry.bottomRail.left) <= 1, `${route} ${viewport.label} lower rail must touch elbow`);
      assert.ok(Math.abs(geometry.elbow.top - geometry.topRail.top) <= 1, `${route} ${viewport.label} upper rail must align with elbow top`);
      assert.ok(Math.abs(geometry.elbow.bottom - geometry.bottomRail.bottom) <= 1, `${route} ${viewport.label} lower rail must align with elbow bottom`);
      assert.deepEqual(
        geometry.elbowStyle,
        {
          background: 'rgba(0, 0, 0, 0)',
          borderTopWidth: '14px',
          borderRightWidth: '0px',
          borderBottomWidth: '14px',
          borderLeftWidth: '14px',
        },
        `${route} ${viewport.label} elbow must expose the real black field through a three-sided border`,
      );
      assert.ok(geometry.icon.left >= geometry.elbow.left && geometry.icon.right <= geometry.elbow.right, `${route} ${viewport.label} ship must sit inside elbow field`);
      assert.ok(geometry.copy.left >= geometry.elbow.right, `${route} ${viewport.label} copy must begin outside elbow`);
      assert.equal(geometry.copyStyle.background, 'rgba(0, 0, 0, 0)', `${route} ${viewport.label} copy field must stay open`);
      assert.equal(geometry.copyStyle.boxShadow, 'none', `${route} ${viewport.label} copy field must not cast a card shadow`);
      assert.equal(geometry.copyStyle.borderRadius, '0px', `${route} ${viewport.label} copy field must not have card corners`);
      assert.equal(geometry.documentOverflowX, false, `${route} ${viewport.label} must not overflow the viewport`);

      const campaign = page.locator('[data-route-id="campaign"]');
      assert.equal(await campaign.getAttribute('aria-describedby'), 'directive-campaign-guidance-instruction');
      const cueStyle = await campaign.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          animationDuration: style.animationDuration,
          animationName: style.animationName,
          animationTimingFunction: style.animationTimingFunction,
          transform: style.transform,
        };
      });
      assert.equal(cueStyle.animationName, 'directive-campaign-guidance-pulse');
      assert.equal(cueStyle.animationDuration, '2.4s');
      assert.equal(cueStyle.animationTimingFunction, 'linear');
      assert.equal(cueStyle.transform, 'none');

      const quiet = await sampleCampaignPulse(campaign, 0);
      const bright = await sampleCampaignPulse(campaign, 200);
      const brightHold = await sampleCampaignPulse(campaign, 1000);
      const quietAfterRamp = await sampleCampaignPulse(campaign, 1400);
      const quietHold = await sampleCampaignPulse(campaign, 2200);
      assert.ok(quiet && bright && brightHold && quietAfterRamp && quietHold, `${route} ${viewport.label} campaign cue must expose a CSS animation`);
      assert.notDeepEqual(
        [quiet.background, quiet.borderBottomColor, quiet.boxShadow, quiet.color],
        [bright.background, bright.borderBottomColor, bright.boxShadow, bright.color],
        `${route} ${viewport.label} cue must visibly change internal illumination`,
      );
      assert.deepEqual(
        [bright.background, bright.borderBottomColor, bright.boxShadow, bright.color],
        [brightHold.background, brightHold.borderBottomColor, brightHold.boxShadow, brightHold.color],
        `${route} ${viewport.label} cue must hold fully illuminated for one second`,
      );
      assert.deepEqual(
        [quietAfterRamp.background, quietAfterRamp.borderBottomColor, quietAfterRamp.boxShadow, quietAfterRamp.color],
        [quietHold.background, quietHold.borderBottomColor, quietHold.boxShadow, quietHold.color],
        `${route} ${viewport.label} cue must hold dark for one second`,
      );
      assert.notEqual(bright.borderRadius, '0px', `${route} ${viewport.label} illumination must use the button silhouette`);
      assert.equal(bright.outlineStyle, 'none', `${route} ${viewport.label} illumination must not draw an outline`);
      assert.doesNotMatch(bright.boxShadow, /0px 0px 0px 1px/, `${route} ${viewport.label} illumination must not draw an inset stroke`);
      assert.deepEqual(quiet.rect, bright.rect, `${route} ${viewport.label} pulse must not change control geometry`);
      assert.deepEqual(quiet.rect, brightHold.rect, `${route} ${viewport.label} hold must not change control geometry`);
      assert.deepEqual(quiet.rect, quietAfterRamp.rect, `${route} ${viewport.label} off ramp must not change control geometry`);

      await campaign.click();
      await page.waitForSelector('.directive-expanded-shell[data-active-route="campaign"]');
      assert.equal(await page.locator('.directive-campaign-required').count(), 0);
      assert.equal(await page.locator('[data-route-id="campaign"]').getAttribute('aria-describedby'), null);
      assert.deepEqual(errors, [], `${route} ${viewport.label} browser errors`);
      await page.close();
    }
  }

  const reducedContext = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`${baseUrl}/production?route=ship&campaignRequired=1`);
  await reducedPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  assert.equal(await reducedPage.locator('.directive-campaign-required').count(), 1);
  const reducedStyle = await reducedPage.locator('[data-route-id="campaign"]').evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      animationName: style.animationName,
      background: style.backgroundColor,
      boxShadow: style.boxShadow,
      transform: style.transform,
    };
  });
  assert.equal(reducedStyle.animationName, 'none');
  assert.notEqual(reducedStyle.background, 'rgba(0, 0, 0, 0)');
  assert.notEqual(reducedStyle.boxShadow, 'none');
  assert.equal(reducedStyle.transform, 'none');
  await reducedContext.close();

  console.log('Campaign-required empty-state Playwright certification passed.');
} finally {
  await browser.close();
  server.kill();
}
