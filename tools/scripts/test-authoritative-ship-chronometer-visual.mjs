import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 57000 + (process.pid % 7000);
const baseUrl = `http://127.0.0.1:${port}`;
const artifactRoot = path.join(repoRoot, 'artifacts', 'authoritative-ship-chronometer');
const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const browser = await chromium.launch({ headless: true });

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/production?route=campaign`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Chronometer preview server did not start.');
}

function overlaps(left, right) {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

try {
  await waitForServer();
  await mkdir(artifactRoot, { recursive: true });
  for (const viewport of [
    { width: 1440, height: 900, label: 'desktop' },
    { width: 390, height: 844, label: 'mobile' },
  ]) {
    for (const route of ['campaign', 'mission']) {
      const page = await browser.newPage({ viewport });
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(`${baseUrl}/production?route=${route}`);
      await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
      const chronometer = page.locator(`.directive-ship-chronometer-${route}:visible`).first();
      await chronometer.waitFor();
      assert.deepEqual(pageErrors, [], `${viewport.label} ${route} page errors`);
      assert.equal(await chronometer.locator('.directive-ship-chronometer-clock').textContent(), '08:37:39');
      assert.equal(await chronometer.locator('.directive-ship-chronometer-stardate').textContent(), 'Stardate 53068.4');
      assert.equal(
        await chronometer.locator('.directive-ship-chronometer-clock').evaluate((node) => getComputedStyle(node).fontVariantNumeric.includes('tabular-nums')),
        true,
        `${viewport.label} ${route} clock uses stable-width numerals`,
      );
      const clockBox = await chronometer.boundingBox();
      const title = page.locator(
        route === 'campaign'
          ? '.campaign-hero-copy > h2:visible'
          : viewport.label === 'mobile'
            ? '.mission-mobile-trigger:visible strong'
            : '.mission-hero > h2:visible',
      ).first();
      const summary = page.locator(route === 'campaign' ? '.campaign-summary:visible' : '.mission-hero > p:visible').first();
      const titleBox = await title.boundingBox();
      const summaryBox = await summary.boundingBox();
      const layout = await chronometer.evaluate((node) => {
        const style = getComputedStyle(node);
        const clockStyle = getComputedStyle(node.querySelector('.directive-ship-chronometer-clock'));
        const titleNode = node.closest('.campaign-hero')?.querySelector('.campaign-hero-copy h2')
          || node.closest('.mission-mobile-record')?.querySelector('.mission-mobile-trigger strong')
          || node.closest('.mission-hero')?.querySelector('h2');
        const parentBox = node.parentElement?.getBoundingClientRect();
        const parentStyle = getComputedStyle(node.parentElement);
        return {
          position: style.position,
          backgroundImage: style.backgroundImage,
          backgroundColor: style.backgroundColor,
          borderRightWidth: style.borderRightWidth,
          boxShadow: style.boxShadow,
          clockFontSize: Number.parseFloat(clockStyle.fontSize),
          titleFontSize: Number.parseFloat(getComputedStyle(titleNode).fontSize),
          parentWidth: parentBox?.width || 0,
          parentScrollWidth: node.parentElement?.scrollWidth || 0,
          parentClass: node.parentElement?.className || '',
          parentDisplay: parentStyle.display,
          parentPaddingRight: Number.parseFloat(parentStyle.paddingRight),
          previousTag: node.previousElementSibling?.tagName || '',
        };
      });
      assert.ok(clockBox && clockBox.width > 100 && clockBox.height > 24, `${viewport.label} ${route} clock is visible`);
      assert.ok(titleBox && !overlaps(clockBox, titleBox), `${viewport.label} ${route} clock does not cover the page title`);
      assert.ok(summaryBox && !overlaps(clockBox, summaryBox), `${viewport.label} ${route} clock does not cover the page summary`);
      assert.equal(layout.position, 'static', `${viewport.label} ${route} clock participates in page flow`);
      assert.equal(layout.backgroundImage, 'none', `${viewport.label} ${route} clock has no card gradient`);
      assert.equal(layout.backgroundColor, 'rgba(0, 0, 0, 0)', `${viewport.label} ${route} clock has no card fill`);
      assert.equal(layout.borderRightWidth, '0px', `${viewport.label} ${route} clock has no heavy edge`);
      assert.equal(layout.boxShadow, 'none', `${viewport.label} ${route} clock has no card shadow`);
      assert.ok(layout.titleFontSize > layout.clockFontSize, `${viewport.label} ${route} title remains visually dominant`);
      assert.ok(
        layout.clockFontSize <= (route === 'campaign' ? 20 : viewport.label === 'desktop' ? 18 : 15),
        `${viewport.label} ${route} clock remains quiet`,
      );
      if (viewport.label === 'mobile') {
        assert.ok(clockBox.width / layout.parentWidth > 0.85, `${route} phone clock spans the hero content width`);
        assert.equal(layout.previousTag, 'P', `${route} phone clock follows the identity and summary`);
        assert.ok(layout.parentScrollWidth <= layout.parentWidth + 1, `${route} phone clock creates no horizontal overflow`);
        if (route === 'campaign') {
          assert.ok(layout.parentClass.includes('campaign-hero-copy'), 'Campaign phone clock belongs to the identity caption');
        }
      } else if (route === 'campaign') {
        assert.ok(layout.parentClass.includes('campaign-hero-copy'), 'Campaign desktop clock belongs to the identity caption');
        assert.equal(layout.parentDisplay, 'grid', 'Campaign desktop caption composes identity and time together');
      } else if (route === 'mission') {
        assert.ok(layout.parentClass.includes('mission-hero'), 'Mission desktop clock belongs to the mission header');
        assert.equal(layout.parentDisplay, 'grid', 'Mission desktop header composes status and time together');
        assert.ok(layout.parentPaddingRight < 50, 'Mission desktop header does not reserve an overlay column');
      }
      await page.screenshot({
        path: path.join(artifactRoot, `${route}-${viewport.label}.png`),
        fullPage: true,
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}

console.log('Authoritative ship chronometer visual tests passed.');
