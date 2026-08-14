import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 63000 + (process.pid % 2000);
const baseUrl = `http://127.0.0.1:${port}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/tools/fixtures/directive-launcher-button.html`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Directive launcher preview server did not start.');
}

const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) },
  stdio: ['ignore', 'ignore', 'inherit']
});
const browser = await chromium.launch({ headless: true });

try {
  await waitForServer();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/tools/fixtures/directive-launcher-button.html`);
  await page.waitForFunction(() => globalThis.__directiveLauncherInstalled === true);

  const measurement = await page.evaluate(() => {
    const launcher = document.getElementById('directive-launcher-button');
    const wand = document.getElementById('extensionsMenuButton');
    const icon = launcher.querySelector('.directive-launcher-button-icon');
    const launcherStyle = getComputedStyle(launcher);
    const wandStyle = getComputedStyle(wand);
    const iconStyle = getComputedStyle(icon);
    const launcherBox = launcher.getBoundingClientRect();
    const wandBox = wand.getBoundingClientRect();
    return {
      launcher: {
        tag: launcher.tagName,
        type: launcher.type,
        className: launcher.className,
        ariaLabel: launcher.getAttribute('aria-label'),
        backgroundColor: launcherStyle.backgroundColor,
        borderTopWidth: launcherStyle.borderTopWidth,
        borderTopStyle: launcherStyle.borderTopStyle,
        opacity: launcherStyle.opacity,
        filter: launcherStyle.filter,
        color: launcherStyle.color,
        width: launcherBox.width,
        height: launcherBox.height
      },
      wand: {
        color: wandStyle.color,
        width: wandBox.width,
        height: wandBox.height
      },
      icon: {
        width: Number.parseFloat(iconStyle.width),
        height: Number.parseFloat(iconStyle.height)
      }
    };
  });

  assert.equal(measurement.launcher.tag, 'BUTTON');
  assert.equal(measurement.launcher.type, 'button');
  assert.equal(measurement.launcher.className, 'interactable directive-launcher-button');
  assert.equal(measurement.launcher.ariaLabel, 'Open Directive');
  assert.equal(measurement.launcher.backgroundColor, 'rgba(0, 0, 0, 0)');
  assert.equal(measurement.launcher.borderTopWidth, '0px');
  assert.equal(measurement.launcher.borderTopStyle, 'none');
  assert.equal(measurement.launcher.opacity, '0.7');
  assert.equal(measurement.launcher.filter, 'none');
  assert.equal(measurement.launcher.color, measurement.wand.color);
  assert.ok(Math.abs(measurement.launcher.width - measurement.wand.width) < 0.01);
  assert.ok(Math.abs(measurement.launcher.height - measurement.wand.height) < 0.01);
  assert.equal(measurement.icon.width, 35.625);
  assert.equal(measurement.icon.height, 35.625);

  const launcher = page.locator('#directive-launcher-button');
  await launcher.hover();
  await page.waitForTimeout(250);
  const hoverStyle = await launcher.evaluate((element) => ({
    opacity: getComputedStyle(element).opacity,
    filter: getComputedStyle(element).filter
  }));
  assert.deepEqual(hoverStyle, { opacity: '1', filter: 'brightness(1.2)' });

  await launcher.click();
  assert.equal(await page.evaluate(() => globalThis.__directiveLauncherOpenCount), 1);
  console.log('PASS Directive launcher native composer alignment');
} finally {
  await browser.close();
  server.kill();
}
