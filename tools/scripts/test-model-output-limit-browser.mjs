import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright';
const available = createServer(); await new Promise(resolve => available.listen(0, '127.0.0.1', resolve));
const port = available.address().port; await new Promise(resolve => available.close(resolve));
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], { env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) }, stdio: 'ignore' });
const browser = await chromium.launch({ headless: true });
try {
  for (let n = 0; ; n++) { try { if ((await fetch(`${baseUrl}/reference`)).ok) break; } catch {} if (n > 49) throw Error('Preview did not start'); await new Promise(r => setTimeout(r, 100)); }
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${baseUrl}/reference`);
    await page.evaluate(async () => {
      document.head.innerHTML = '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles/directive.css">';
      document.body.replaceChildren();
      const { setDirectiveRuntimeApp } = await import('/src/runtime/runtime-shell.js');
      setDirectiveRuntimeApp({ getCurrentView: async () => ({ providerConfiguration: { settings: { utility: {}, reasoning: {} }, profiles: [], status: {} } }) });
      const { handleDirectiveUiMessage } = await import('/src/hosts/sillytavern/bootstrap.js');
      const { showSettlementRetryDialog } = await import('/src/ui/settlement-retry-dialog.js');
      handleDirectiveUiMessage({ type: 'directive.modelOutputLimit.v1', payload: {} });
      showSettlementRetryDialog({ reasonCode: 'provider_token_limit' });
    });
    await page.locator('[data-settlement-retry-action="settings"]').click();
    await page.locator('.directive-settlement-retry-overlay').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.dataset.settingsControl === 'analysis-capacity');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.settingsControl), 'analysis-capacity');
    await page.locator('[data-model-output-limit-action="open"]').click();
    await page.locator('.directive-model-output-limit-notification').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.settingsControl), 'analysis-capacity');
    await page.close();
  }
  console.log('Model output limit browser tests passed (desktop and mobile).');
} finally { await browser.close(); server.kill(); }
