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
      const copy = page.locator(route === 'campaign' ? '.campaign-hero-copy:visible' : '.mission-hero > p:visible').first();
      const copyBox = await copy.boundingBox();
      const layout = await chronometer.evaluate((node) => {
        const style = getComputedStyle(node);
        const parentBox = node.parentElement?.getBoundingClientRect();
        return {
          position: style.position,
          gridTemplateColumns: style.gridTemplateColumns,
          parentWidth: parentBox?.width || 0,
          previousClass: node.previousElementSibling?.className || '',
          previousTag: node.previousElementSibling?.tagName || '',
        };
      });
      assert.ok(clockBox && clockBox.width > 100 && clockBox.height > 40, `${viewport.label} ${route} clock is visible`);
      assert.ok(copyBox && !overlaps(clockBox, copyBox), `${viewport.label} ${route} clock does not cover page identity`);
      if (viewport.label === 'mobile') {
        assert.equal(layout.position, 'relative', `${route} phone clock is in flow`);
        assert.ok(clockBox.width / layout.parentWidth > 0.85, `${route} phone clock spans the hero content width`);
        assert.equal(
          route === 'campaign' ? layout.previousClass.includes('campaign-hero-copy') : layout.previousTag,
          route === 'campaign' ? true : 'P',
          `${route} phone clock follows the identity and summary`,
        );
      } else if (route === 'mission') {
        assert.ok(layout.gridTemplateColumns.split(' ').length >= 2, 'desktop Mission clock uses its compact horizontal layout');
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
