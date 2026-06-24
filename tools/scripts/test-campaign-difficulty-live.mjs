import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { chromium } from 'playwright';

const BASE_URL = (process.env.SILLYTAVERN_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const TIMEOUT_MS = Number.parseInt(process.env.DIRECTIVE_SILLYTAVERN_BROWSER_TIMEOUT_MS || '90000', 10);
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const ARTIFACT_ROOT = process.env.DIRECTIVE_SILLYTAVERN_SCREENSHOT_DIR
  || path.join(os.tmpdir(), 'directive-sillytavern-campaign-difficulty-live');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const ARTIFACT_DIR = path.join(ARTIFACT_ROOT, RUN_ID);

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function ensureArtifactDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  return ARTIFACT_DIR;
}

async function screenshot(page, name) {
  await ensureArtifactDir();
  const filePath = path.join(ARTIFACT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function openDirectiveCampaign(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await page.waitForFunction(() => typeof globalThis.Directive?.bridge?.showRuntime === 'function', null, { timeout: TIMEOUT_MS });
  await page.evaluate(async () => {
    await globalThis.Directive.bridge.showRuntime();
    await globalThis.Directive.bridge.runAction?.('runtime.setTab', { tabId: 'campaign' });
  });
  await page.waitForSelector('#directive-runtime-panel [data-directive-runtime-body="true"]', { timeout: TIMEOUT_MS });
}

async function bodyText(page) {
  return page.locator('#directive-runtime-panel [data-directive-runtime-body="true"]').evaluate((body) => body.textContent || '');
}

async function clickCampaignSubtab(page, target) {
  await page.locator(`button[data-campaign-subtab-target="${target}"]`).click({ timeout: TIMEOUT_MS });
}

async function setInputValue(page, inputPath, value) {
  const selector = `[data-input-path="${inputPath}"]`;
  await page.waitForSelector(selector, { timeout: TIMEOUT_MS });
  await page.locator(selector).evaluate((element, nextValue) => {
    const control = element;
    if (control.tagName === 'SELECT') {
      const option = Array.from(control.options || []).find((item) => item.value) || control.options?.[0];
      control.value = option?.value || nextValue;
    } else {
      control.value = nextValue;
    }
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function fillCreatorStep(page, stepId) {
  if (stepId === 'identity') {
    await setInputValue(page, 'identity.name', 'Live Difficulty Probe');
    await setInputValue(page, 'identity.pronounsOrAddress', 'Commander');
    await setInputValue(page, 'identity.speciesId', 'human');
    await setInputValue(page, 'identity.ageBandId', 'adult');
    await setInputValue(page, 'identity.appearance', 'A composed Starfleet officer with a steady bridge presence.');
    return;
  }
  if (stepId === 'service') {
    await setInputValue(page, 'service.careerBackgroundId', 'command');
    await setInputValue(page, 'service.formativeExperienceId', 'frontier');
    await setInputValue(page, 'service.assignmentReasonId', 'trusted');
    return;
  }
  if (stepId === 'personality') {
    await setInputValue(page, 'personality.traits.insight', 'measured');
    await setInputValue(page, 'personality.traits.connection', 'steady');
    await setInputValue(page, 'personality.traits.execution', 'decisive');
    await setInputValue(page, 'personality.flawId', 'overextends');
  }
}

async function activeCreatorStep(page) {
  return page.locator('.directive-creator-step-button[aria-current="step"]').evaluate((button) => button.dataset.creatorStepButton || '');
}

async function advanceCreatorToReview(page) {
  for (let guard = 0; guard < 5; guard += 1) {
    const stepId = await activeCreatorStep(page);
    if (stepId === 'review') return;
    await fillCreatorStep(page, stepId);
    await page.getByRole('button', { name: /^Next:/ }).click({ timeout: TIMEOUT_MS });
    await page.waitForTimeout(250);
  }
  assert.equal(await activeCreatorStep(page), 'review', 'Character Creator did not reach Review step.');
}

async function openCreatorDifficultyReview(page) {
  await clickCampaignSubtab(page, 'directive-campaign-library-section');
  const packageRows = page.locator('.directive-starship-library-row');
  assert.ok(await packageRows.count(), 'No campaign package rows are available in the live library.');
  await packageRows.first().click({ timeout: TIMEOUT_MS });
  await page.locator('.directive-starship-create-commander-command').click({ timeout: TIMEOUT_MS });
  await page.waitForSelector('.directive-creator-step-button', { timeout: TIMEOUT_MS });
  await advanceCreatorToReview(page);

  const text = normalizeText(await bodyText(page));
  assert.match(text, /Campaign Difficulty/);
  assert.match(text, /Story-forward/);
  assert.match(text, /Full simulation/);
  assert.doesNotMatch(text, /Simulation Mode/);

  const options = page.locator('.directive-creator-difficulty-option');
  assert.equal(await options.count(), 2, 'Creator should show two visible Campaign Difficulty options.');
  await page.locator('[data-creator-difficulty-option="Exploration"]').click({ timeout: TIMEOUT_MS });
  const hiddenMode = await page.locator('[data-input-path="settings.simulationMode"]').inputValue();
  assert.equal(hiddenMode, 'Exploration');
  assert.match(normalizeText(await bodyText(page)), /No player or senior staff death/);
  const screenshotPath = await screenshot(page, 'creator-campaign-difficulty-review');

  await setInputValue(
    page,
    'dossier.briefBiography',
    'Live Difficulty Probe is a Starfleet officer created by the live Campaign Difficulty smoke test.'
  );
  await setInputValue(
    page,
    'dossier.publicReputation',
    'Known as a composed officer who chooses carefully under pressure.'
  );
  await page.getByRole('button', { name: 'Save Draft' }).click({ timeout: TIMEOUT_MS });
  await page.waitForSelector('.directive-creator-begin-button', { timeout: TIMEOUT_MS });
  await page.waitForFunction(() => {
    const button = document.querySelector('.directive-creator-begin-button');
    return button && !button.disabled;
  }, null, { timeout: TIMEOUT_MS });
  await page.getByRole('button', { name: 'Start Campaign' }).click({ timeout: TIMEOUT_MS });
  await page.waitForFunction(() => {
    const panel = document.querySelector('#directive-runtime-panel');
    const selected = panel?.querySelector('[data-route-id="mission"][aria-current="page"]');
    return Boolean(selected);
  }, null, { timeout: TIMEOUT_MS });
  return screenshotPath;
}

async function currentCampaignDifficultyMode(page) {
  const surface = page.locator('.directive-campaign-difficulty-block, .directive-campaign-session-difficulty-fact');
  assert.ok(await surface.count(), 'Active Campaign Command did not show Campaign Difficulty.');
  const text = normalizeText(await surface.first().textContent());
  if (text.includes('Exploration')) return 'Exploration';
  if (text.includes('Command')) return 'Command';
  throw new Error(`Could not determine active Campaign Difficulty from: ${text}`);
}

async function applyCampaignDifficulty(page, mode) {
  const change = page.locator('.directive-campaign-session-difficulty-change, .directive-campaign-difficulty-change-command').first();
  await change.click({ timeout: TIMEOUT_MS });
  await page.waitForSelector('.directive-campaign-difficulty-dialog', { timeout: TIMEOUT_MS });
  const dialogText = normalizeText(await page.locator('.directive-campaign-difficulty-dialog').textContent());
  assert.match(dialogText, /Change Campaign Difficulty/);
  assert.match(dialogText, /future outcomes only/i);
  assert.match(dialogText, /Existing Command Log entries/i);
  await screenshot(page, `campaign-difficulty-dialog-${mode.toLowerCase()}`);
  await page.locator(`[data-campaign-difficulty-option="${mode}"]`).click({ timeout: TIMEOUT_MS });
  await page.getByRole('button', { name: 'Apply' }).click({ timeout: TIMEOUT_MS });
  await page.waitForFunction(() => !document.querySelector('.directive-campaign-difficulty-dialog'), null, { timeout: TIMEOUT_MS });
  await page.waitForTimeout(500);
  assert.equal(await currentCampaignDifficultyMode(page), mode);
}

async function proveCampaignDifficultyDialog(page) {
  await page.evaluate(async () => {
    await globalThis.Directive.bridge.runAction?.('runtime.setTab', { tabId: 'campaign' });
  });
  await page.waitForSelector('button[data-campaign-subtab-target="directive-campaign-command-section"]', { timeout: TIMEOUT_MS });
  await clickCampaignSubtab(page, 'directive-campaign-command-section');
  await page.waitForTimeout(750);
  if (!await page.locator('.directive-campaign-difficulty-block, .directive-campaign-session-difficulty-fact').count()) {
    const failureScreenshot = await screenshot(page, 'missing-campaign-difficulty');
    const diagnostics = await page.evaluate(() => {
      const panel = document.querySelector('#directive-runtime-panel');
      const body = panel?.querySelector('[data-directive-runtime-body="true"]');
      return {
        selectedRoute: panel?.querySelector('[data-route-id][aria-current="page"]')?.getAttribute('data-route-id') || null,
        bodyText: (body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1800),
        subtabs: Array.from(body?.querySelectorAll('.directive-campaign-subtab') || []).map((button) => ({
          text: (button.textContent || '').replace(/\s+/g, ' ').trim(),
          target: button.dataset.campaignSubtabTarget || '',
          active: button.classList.contains('directive-campaign-subtab-active')
        })),
        sections: Array.from(body?.querySelectorAll('.directive-campaign-section') || []).map((section) => ({
          id: section.id,
          active: section.classList.contains('directive-campaign-section-active'),
          ariaHidden: section.getAttribute('aria-hidden'),
          text: (section.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 900)
        }))
      };
    });
    throw new Error(`Campaign Difficulty was not available after starting campaign. Screenshot: ${failureScreenshot}. Diagnostics: ${JSON.stringify(diagnostics)}`);
  }
  const originalMode = await currentCampaignDifficultyMode(page);
  const nextMode = originalMode === 'Command' ? 'Exploration' : 'Command';
  await applyCampaignDifficulty(page, nextMode);
  const changedScreenshot = await screenshot(page, `campaign-difficulty-updated-${nextMode.toLowerCase()}`);
  await applyCampaignDifficulty(page, originalMode);
  assert.equal(await currentCampaignDifficultyMode(page), originalMode);
  return { originalMode, changedMode: nextMode, screenshotPath: changedScreenshot };
}

const browser = await chromium.launch({ headless: HEADLESS, timeout: TIMEOUT_MS });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('dialog', (dialog) => dialog.accept());

try {
  await openDirectiveCampaign(page);
  const creatorScreenshot = await openCreatorDifficultyReview(page);
  const campaignChange = await proveCampaignDifficultyDialog(page);
  console.log(JSON.stringify({
    ok: true,
    baseUrl: BASE_URL,
    artifacts: ARTIFACT_DIR,
    creatorScreenshot,
    campaignChange
  }, null, 2));
} finally {
  await browser.close();
}
