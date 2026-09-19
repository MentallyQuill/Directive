import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const portServer = createServer(); await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], { cwd: process.cwd(), env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) }, stdio: ['ignore', 'ignore', 'inherit'] });
const browser = await chromium.launch({ headless: true });
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/production?route=settings`)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  await mkdir('artifacts/character-knowledge-settings', { recursive: true });
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/production?route=settings`);
    await page.evaluate(async () => {
      const { renderSettingsPanel } = await import('/src/ui/settings-panel.js');
      const { createDirectiveExpandedShell } = await import('/src/ui/directive-expanded-shell.js');
      const { DIRECTIVE_PRIMARY_ROUTES } = await import('/src/ui/directive-routes.mjs');
      const { normalizeDirectiveProviderSettings } = await import('/src/providers/directive-provider-settings.mjs');
      const { normalizeCharacterKnowledgeSettings, validateCharacterKnowledgeSettings } = await import('/src/providers/character-knowledge-settings.mjs');
      document.body.replaceChildren();
      const shell = createDirectiveExpandedShell({ id: 'directive-runtime-panel', routes: DIRECTIVE_PRIMARY_ROUTES, activeRouteId: 'settings', onSelectRoute() {} }); shell.classList.add('directive-screen'); document.body.appendChild(shell);
      const providers = normalizeDirectiveProviderSettings(); let settings = normalizeCharacterKnowledgeSettings();
      window.protectedSettingsProof = { providers, get settings() { return settings; }, stops: 0 };
      renderSettingsPanel(shell.querySelector('[data-directive-runtime-body="true"]'), { characterKnowledgeSettings: settings, providerConfiguration: { settings: providers, profiles: [{ id: 'profile.nano', label: 'NanoGPT writing' }], status: {} } }, {
        adoptCurrentNarrationProfile: async () => { providers.narration = { ...providers.narration, provider: 'profile', profileId: 'profile.nano', presetMode: 'isolated' }; return { settings: providers.narration, status: { ready: true, label: 'NanoGPT writing' } }; },
        updateCharacterKnowledgeSettings: async patch => { await window.protectedSettingsProof.saveGate; const checked = validateCharacterKnowledgeSettings({ ...settings, ...patch }, { narration: providers.narration, ready: !!providers.narration.profileId }); if (!checked.ok) throw new Error(checked.errors.join(' ')); settings = checked.settings; return { characterKnowledgeSettings: settings }; },
      });
    });
    const mode = page.locator('[data-settings-control="character-knowledge-mode"]');
    assert.equal(await mode.inputValue(), 'legacy');
    await mode.selectOption('protected'); await page.waitForFunction(() => document.querySelector('[data-settings-control="character-knowledge-mode"]').value === 'legacy');
    await page.locator('[data-settings-action="adopt-narration-profile"]').click();
    await page.waitForFunction(() => protectedSettingsProof.providers.narration.profileId === 'profile.nano');
    await mode.selectOption('protected'); await page.waitForFunction(() => protectedSettingsProof.settings.mode === 'protected');
    const advanced = page.locator('.settings-character-advanced'); await advanced.locator('summary').click();
    const attempts = page.locator('[data-settings-control="character-knowledge-maxAttempts"]');
    await page.evaluate(() => { protectedSettingsProof.saveGate = new Promise(resolve => { protectedSettingsProof.release = resolve; }); });
    await attempts.fill('9'); await attempts.press('Tab'); await attempts.fill('8');
    await page.evaluate(() => protectedSettingsProof.release());
    await page.waitForFunction(() => protectedSettingsProof.settings.maxAttempts === 9);
    assert.equal(await attempts.inputValue(), '8'); await attempts.press('Tab'); await page.waitForFunction(() => protectedSettingsProof.settings.maxAttempts === 8);
    await page.evaluate(async () => {
      const bridge = await import('/src/hosts/sillytavern/runtime-bridge.mjs');
      const activity = await import('/src/hosts/sillytavern/turn-activity-indicator.js');
      bridge.setSillyTavernDirectiveRuntimeBridge({ app: { subscribeTurnProgress: () => () => {}, resetTurnProgress() {}, async handleHostGenerationStopped() { protectedSettingsProof.stops++; } } });
      activity.recordDirectiveTurnProgress({ type: 'start', operationId: 'protected.browser', stage: 'protected-scene', startedAt: performance.now() });
      activity.recordDirectiveTurnProgress({ type: 'update', operationId: 'protected.browser', phase: 'review', phaseStartedAt: performance.now() });
    });
    const stop = page.locator('.directive-progress-stop'); assert.equal(await stop.isVisible(), true);
    await page.screenshot({ path: `artifacts/character-knowledge-settings/${width}.png` });
    await stop.click(); await page.waitForFunction(() => protectedSettingsProof.stops === 1);
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('PASS protected settings browser: desktop/mobile, activation guard, profile adoption, dirty drafts and Stop');
} finally { await browser.close(); server.kill(); }
