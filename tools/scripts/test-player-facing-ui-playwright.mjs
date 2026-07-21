import fs from 'node:fs';
import path from 'node:path';

import {
  authenticateSillyTavernUser,
  launchPlaywrightBrowser,
  normalizeBaseUrl
} from './lib/sillytavern-live-harness.mjs';

const args = new Set(process.argv.slice(2));
const LIVE = args.has('--live') || process.env.DIRECTIVE_PLAYER_FACING_UI_LIVE === '1';
const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || '');
const USER = String(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_UI_TEST_USER || '').trim();
const PASSWORD = process.env.DIRECTIVE_SILLYTAVERN_PASSWORD || process.env.SILLYTAVERN_PASSWORD || '';
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const TIMEOUT_MS = Number(process.env.DIRECTIVE_PLAYER_FACING_UI_TIMEOUT_MS || 30000);
const ARTIFACT_DIR = String(process.env.DIRECTIVE_PLAYER_FACING_UI_ARTIFACT_DIR || '').trim();
const EXPECTED_ROUTES = ['campaign', 'mission', 'crew', 'ship', 'settings'];
const CURRENT_CHAT_EMPTY_STATE = /No campaign chat is active|No active campaign|Choose the campaign chat|campaign chat.*show live mission state|selected host chat|Directive save|selected campaign chat/i;

function cookieHeaderToBrowserCookies(cookieHeader, baseUrl) {
  const parsed = new URL(baseUrl);
  return String(cookieHeader || '')
    .split(/;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      return {
        name: separator >= 0 ? part.slice(0, separator) : part,
        value: separator >= 0 ? part.slice(separator + 1) : '',
        domain: parsed.hostname,
        path: '/',
        secure: parsed.protocol === 'https:',
        httpOnly: true,
        sameSite: 'Lax'
      };
    });
}

function usage() {
  return [
    'Player-facing Directive UI Playwright smoke',
    '',
    'Dry run: node tools/scripts/test-player-facing-ui-playwright.mjs',
    'Live:    DIRECTIVE_SILLYTAVERN_USER=<dedicated-user> SILLYTAVERN_BASE_URL=<url> node tools/scripts/test-player-facing-ui-playwright.mjs --live'
  ].join('\n');
}

function ensureDedicatedUser() {
  if (!USER) throw new Error('DIRECTIVE_SILLYTAVERN_USER is required for live UI verification.');
  if (USER.toLowerCase() === 'default-user') {
    throw new Error('Refusing to run player-facing UI verification against default-user. Use a dedicated test user.');
  }
}

async function clickRoute(page, routeId, mobile) {
  const selector = mobile
    ? `.directive-mobile-bottom-tab[data-route-id="${routeId}"]`
    : `.directive-spine-route[data-route-id="${routeId}"]`;
  const button = page.locator(selector).first();
  await button.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  await button.click();
  await page.waitForTimeout(120);
}

async function inspectViewport(page, { name, viewport }) {
  await page.setViewportSize(viewport);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  const panel = page.locator('#directive-runtime-panel');
  await panel.waitFor({ state: 'visible', timeout: TIMEOUT_MS });

  const mobile = viewport.width <= 720;
  const routeIds = await page.locator('.directive-spine-route, .directive-mobile-bottom-tab').evaluateAll((elements) => (
    [...new Set(elements.map((element) => element.dataset.routeId).filter(Boolean))]
  ));
  if (JSON.stringify(routeIds) !== JSON.stringify(EXPECTED_ROUTES)) {
    throw new Error(`${name}: expected routes ${EXPECTED_ROUTES.join(',')}, received ${routeIds.join(',')}`);
  }
  if (await page.locator('[data-route-id="log"]').count()) {
    throw new Error(`${name}: removed Log route is still visible.`);
  }

  await clickRoute(page, 'mission', mobile);
  const missionText = await panel.innerText();
  const missionSurface = await panel.locator('.directive-quest-journal').count();
  const questRows = panel.locator('.directive-quest-row');
  let questSelection = { status: 'skipped', reason: 'No active campaign quest rows were available.' };
  if (await questRows.count()) {
    const questId = await questRows.first().getAttribute('data-quest-id');
    try {
      await questRows.first().click();
      await page.locator(`.directive-quest-row[data-quest-id="${questId}"][aria-selected="true"]`).waitFor({ state: 'visible', timeout: TIMEOUT_MS });
      await clickRoute(page, 'crew', mobile);
      await clickRoute(page, 'mission', mobile);
      const selectedAfterReturn = await panel.locator(`.directive-quest-row[data-quest-id="${questId}"][aria-selected="true"]`).count();
      questSelection = selectedAfterReturn === 1
        ? { status: 'pass', questId }
        : { status: 'fail', reason: 'Selected quest did not remain selected after a route-only navigation.' };
    } catch (error) {
      questSelection = { status: 'fail', questId, reason: error?.message || String(error) };
    }
  }

  await clickRoute(page, 'crew', mobile);
  const crewText = await panel.innerText();
  const crewSurface = await panel.locator('.directive-crew-journal').count();
  await clickRoute(page, 'ship', mobile);
  const shipText = await panel.innerText();
  const shipSurface = await panel.locator('.directive-ship-journal').count();
  await clickRoute(page, 'settings', mobile);
  const settingsSurface = await panel.locator('.directive-settings-player-preferences').count();
  const disclosureCount = await panel.locator('.directive-settings-disclosure').count();
  const openDisclosureCount = await panel.locator('.directive-settings-disclosure[open]').count();
  const geometry = await panel.evaluate((element) => {
    const drawer = element.querySelector('.directive-command-drawer') || element;
    const journal = element.querySelector('.directive-quest-journal, .directive-crew-journal, .directive-ship-journal, .directive-settings-console');
    return {
      panelWidth: drawer.getBoundingClientRect().width,
      panelHeight: drawer.getBoundingClientRect().height,
      contentWidth: drawer.scrollWidth,
      journalWidth: journal?.getBoundingClientRect().width || 0,
      overflowsHorizontally: drawer.scrollWidth > drawer.clientWidth + 2
    };
  });

  if (!missionSurface && !CURRENT_CHAT_EMPTY_STATE.test(missionText)) {
    throw new Error(`${name}: Mission did not render a quest journal or a campaign empty state. Text: ${missionText.slice(0, 500)}`);
  }
  if ((!crewSurface && !CURRENT_CHAT_EMPTY_STATE.test(crewText)) || (!shipSurface && !CURRENT_CHAT_EMPTY_STATE.test(shipText)) || !settingsSurface || disclosureCount !== 2 || openDisclosureCount !== 0) {
    throw new Error(`${name}: one or more focused route surfaces did not render. crew=${crewSurface} ship=${shipSurface} settings=${settingsSurface} disclosures=${disclosureCount} open=${openDisclosureCount}. Crew: ${crewText.slice(0, 240)} Ship: ${shipText.slice(0, 240)}`);
  }
  if (geometry.overflowsHorizontally) throw new Error(`${name}: route surface overflows horizontally. panel=${geometry.panelWidth} content=${geometry.contentWidth} journal=${geometry.journalWidth}`);

  let screenshot = null;
  if (ARTIFACT_DIR) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    screenshot = path.join(ARTIFACT_DIR, `player-facing-${name}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
  }
  return {
    name,
    viewport,
    routeIds,
    missionSurface,
    crewSurface,
    shipSurface,
    settingsSurface,
    disclosureCount,
    openDisclosureCount,
    questSelection,
    geometry,
    screenshot
  };
}

async function runLive() {
  if (!BASE_URL) throw new Error('SILLYTAVERN_BASE_URL is required for live UI verification.');
  ensureDedicatedUser();
  const auth = await authenticateSillyTavernUser({ baseUrl: BASE_URL, handle: USER, password: PASSWORD, timeoutMs: TIMEOUT_MS });
  if (!auth.ok) throw new Error(auth.error || `SillyTavern login failed for ${USER}.`);
  const launched = await launchPlaywrightBrowser({ headless: HEADLESS, timeoutMs: TIMEOUT_MS });
  if (!launched.ok) throw new Error(launched.error?.message || 'Playwright browser launch failed.');
  const browser = launched.browser;
  const context = await browser.newContext({ baseURL: BASE_URL });
  try {
    await context.addCookies(cookieHeaderToBrowserCookies(auth.headers?.Cookie, BASE_URL));
    const page = await context.newPage();
    const desktop = await inspectViewport(page, { name: 'desktop', viewport: { width: 1440, height: 1000 } });
    const mobile = await inspectViewport(page, { name: 'mobile', viewport: { width: 390, height: 844 } });
    const selectionFailures = [desktop, mobile].filter((result) => result.questSelection.status === 'fail');
    return {
      ok: selectionFailures.length === 0,
      status: selectionFailures.length ? 'fail' : 'pass',
      mode: 'live',
      user: USER,
      baseUrl: BASE_URL,
      viewports: [desktop, mobile]
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  if (args.has('--help') || args.has('-h')) {
    console.log(usage());
    return;
  }
  if (!LIVE) {
    console.log(JSON.stringify({
      ok: true,
      status: 'skipped',
      mode: 'dry-run',
      note: 'Pass --live with a dedicated SillyTavern user to run Playwright verification.'
    }, null, 2));
    return;
  }
  const report = await runLive();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, status: 'fail', error: error?.message || String(error) }, null, 2));
  process.exitCode = 1;
});
