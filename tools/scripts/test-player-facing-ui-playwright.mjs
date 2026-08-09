import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  authenticateSillyTavernUser,
  launchPlaywrightBrowser,
  normalizeBaseUrl
} from './lib/sillytavern-live-harness.mjs';

const args = new Set(process.argv.slice(2));
const LIVE = args.has('--live') || process.env.DIRECTIVE_PLAYER_FACING_UI_LIVE === '1';
const ALLOW_DEFAULT_USER = args.has('--allow-default-user');
const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || '');
const USER = String(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_UI_TEST_USER || '').trim();
const PASSWORD = process.env.DIRECTIVE_SILLYTAVERN_PASSWORD || process.env.SILLYTAVERN_PASSWORD || '';
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const TIMEOUT_MS = Number(process.env.DIRECTIVE_PLAYER_FACING_UI_TIMEOUT_MS || 30000);
const ARTIFACT_DIR = String(process.env.DIRECTIVE_PLAYER_FACING_UI_ARTIFACT_DIR || '').trim();
const EXPECTED_ROUTES = ['campaign', 'mission', 'people', 'ship', 'settings'];
const SERVED_EXTENSION_FILES = Object.freeze([
  'manifest.json',
  'styles/directive.css',
  'src/runtime/runtime-shell.js',
  'src/ui/campaign-panel.js',
  'src/ui/people-journal.js',
  'src/ui/settings-panel.js'
]);
const VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'desktop-1440x900', viewport: Object.freeze({ width: 1440, height: 900 }) }),
  Object.freeze({ name: 'tablet-1024x768', viewport: Object.freeze({ width: 1024, height: 768 }) }),
  Object.freeze({ name: 'phone-390x844', viewport: Object.freeze({ width: 390, height: 844 }) }),
  Object.freeze({ name: 'phone-360x800', viewport: Object.freeze({ width: 360, height: 800 }) })
]);
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function verifyServedExtension(context) {
  const results = [];
  for (const relativePath of SERVED_EXTENSION_FILES) {
    const response = await context.request.get(`/scripts/extensions/third-party/Directive/${relativePath}?directive-audit=${Date.now()}`);
    if (!response.ok()) throw new Error(`Served Directive file ${relativePath} returned HTTP ${response.status()}.`);
    const served = await response.body();
    const local = fs.readFileSync(path.resolve(relativePath));
    const servedHash = sha256(served);
    const localHash = sha256(local);
    if (servedHash !== localHash) throw new Error(`Served Directive file ${relativePath} does not match the repository (${servedHash} != ${localHash}).`);
    results.push({ relativePath, sha256: servedHash });
  }
  return results;
}

function usage() {
  return [
    'Player-facing Directive UI Playwright smoke',
    '',
    'Dry run: node tools/scripts/test-player-facing-ui-playwright.mjs',
    'Live:    DIRECTIVE_SILLYTAVERN_USER=<user> SILLYTAVERN_BASE_URL=<url> node tools/scripts/test-player-facing-ui-playwright.mjs --live',
    'Installed default-user smoke: add --allow-default-user explicitly.'
  ].join('\n');
}

function ensureDedicatedUser() {
  if (!USER) throw new Error('DIRECTIVE_SILLYTAVERN_USER is required for live UI verification.');
  if (USER.toLowerCase() === 'default-user' && !ALLOW_DEFAULT_USER) {
    throw new Error('Refusing to run player-facing UI verification against default-user. Use a dedicated test user.');
  }
}

async function clickRoute(page, routeId) {
  const selector = `.directive-route-control[data-route-id="${routeId}"]`;
  const button = page.locator(selector).first();
  await button.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  const box = await button.boundingBox();
  const viewport = page.viewportSize();
  if (!box || box.x < -1 || box.y < -1 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) {
    const shell = await page.locator('#directive-runtime-panel').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const bar = element.querySelector('.directive-route-bar')?.getBoundingClientRect();
      const style = getComputedStyle(element);
      const host = element.parentElement?.getBoundingClientRect();
      return {
        shell: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        bar: bar ? { x: bar.x, y: bar.y, width: bar.width, height: bar.height } : null,
        host: host ? { x: host.x, y: host.y, width: host.width, height: host.height } : null,
        computed: { position: style.position, top: style.top, right: style.right, bottom: style.bottom, left: style.left, transform: style.transform, translate: style.translate }
      };
    });
    throw new Error(`${routeId} route control is outside the viewport. ${JSON.stringify({ box, viewport, shell })}`);
  }
  if ((page.viewportSize()?.width || 0) <= 640) await button.tap();
  else await button.click();
  await page.waitForTimeout(120);
}

async function openDirectiveOverlay(page) {
  const overlay = page.locator('#directive-runtime-overlay');
  const backdrop = page.locator('#directive-runtime-overlay .directive-runtime-backdrop');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = await overlay.count()
      && (await overlay.getAttribute('aria-hidden')) !== 'true'
      && (await overlay.getAttribute('hidden')) === null;
    if (open) return true;
    const hostExtensionsMenu = page.locator('#extensionsMenuButton');
    const directiveMenuItem = page.locator('#directive-extensions-menu-button');
    if (!(await hostExtensionsMenu.count()) || !(await directiveMenuItem.count())) break;
    await hostExtensionsMenu.click();
    await directiveMenuItem.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    await directiveMenuItem.click();
    try {
      await backdrop.waitFor({ state: 'visible', timeout: Math.min(TIMEOUT_MS, 5000) });
      return true;
    } catch {
      await page.waitForTimeout(200);
    }
  }
  return false;
}

async function inspectViewport(page, { name, viewport }) {
  const isMobile = viewport.width <= 640;
  await page.setViewportSize(viewport);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.locator('#directive-runtime-overlay').waitFor({ state: 'attached', timeout: TIMEOUT_MS });
  await page.waitForTimeout(750);
  const directivePanel = page.locator('#directive-runtime-panel');
  const overlayOpened = await openDirectiveOverlay(page);
  if (!overlayOpened) {
    throw new Error(`${name}: Directive overlay did not open from the SillyTavern Extensions menu.`);
  }
  const panel = directivePanel;
  await panel.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  await page.locator('#directive-runtime-overlay .directive-runtime-backdrop').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  const nestedPageTitleCount = await panel.locator('.directive-route-heading, .directive-runtime-section-title').count();
  if (nestedPageTitleCount !== 1) {
    throw new Error(`${name}: approved route heading is missing or duplicated (${nestedPageTitleCount}).`);
  }

  const routeIds = await page.locator('.directive-route-control').evaluateAll((elements) => (
    [...new Set(elements.map((element) => element.dataset.routeId).filter(Boolean))]
  ));
  if (JSON.stringify(routeIds) !== JSON.stringify(EXPECTED_ROUTES)) {
    throw new Error(`${name}: expected routes ${EXPECTED_ROUTES.join(',')}, received ${routeIds.join(',')}`);
  }
  if (await page.locator('[data-route-id="log"]').count()) {
    throw new Error(`${name}: removed Log route is still visible.`);
  }

  if (isMobile) {
    if (!await panel.locator('.directive-lcars-rail:visible').count()) throw new Error(`${name}: approved compact LCARS rail is missing on mobile.`);
    if (await panel.locator('.directive-fullscreen-action:visible').count()) throw new Error(`${name}: retired fullscreen control remains visible on mobile.`);
    if (!await panel.locator('.directive-route-bar:visible').count()) throw new Error(`${name}: mobile bottom route bar is not visible.`);
    if (!await panel.locator('.mobile-campaign-accordion:visible').count()) throw new Error(`${name}: approved mobile Campaign accordion is not visible.`);
  }
  if (false && isMobile) {
    const campaignMobileView = await panel.locator('.directive-mobile-campaign-route').getAttribute('data-directive-mobile-view');
    if (campaignMobileView !== 'detail') throw new Error(`${name}: Campaign did not open on active detail (view=${campaignMobileView}).`);
    if (!await panel.locator('.directive-mobile-campaign-route .directive-mobile-route-detail:visible').count()) {
      throw new Error(`${name}: Campaign detail surface is not visible on mobile.`);
    }
    const campaignsBack = panel.locator('.directive-mobile-campaign-route .directive-mobile-route-back').first();
    await campaignsBack.tap();
    await panel.locator('.directive-mobile-campaign-route[data-directive-mobile-view="list"]:visible').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    const campaignRow = panel.locator('.directive-mobile-campaign-row').first();
    if (await campaignRow.count()) {
      await campaignRow.tap();
      await panel.locator('.directive-mobile-campaign-route[data-directive-mobile-view="detail"]:visible').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    }
    const newCampaignButton = panel.locator('.campaign-new-button:visible').first();
    if (await newCampaignButton.count()) {
      await newCampaignButton.tap();
      const picker = page.locator('.directive-campaign-browser-dialog:visible');
      await picker.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
      const pickerDetails = await picker.locator('.campaign-browser-hero, .campaign-browser-hook, .campaign-browser-opening-hook, .campaign-browser-field').count();
      if (pickerDetails === 0 && !/No campaign packages are available/i.test(await picker.innerText())) {
        throw new Error(`${name}: New Campaign picker lacks artwork or campaign context.`);
      }
      const stacking = await picker.evaluate((element) => {
        const runtime = document.querySelector('#directive-runtime-panel');
        const modalOverlay = element.closest('.directive-campaign-dialog-overlay');
        const modalRoot = element.closest('.directive-modal-root');
        const zIndex = (node) => {
          const value = Number.parseInt(node ? getComputedStyle(node).zIndex : '', 10);
          return Number.isFinite(value) ? value : 0;
        };
        return {
          pickerZ: Math.max(
            zIndex(element),
            zIndex(modalOverlay),
            zIndex(modalRoot)
          ),
          runtimeZ: zIndex(runtime)
        };
      });
      if (!(stacking.pickerZ > stacking.runtimeZ)) throw new Error(`${name}: New Campaign picker is behind the runtime panel. ${JSON.stringify(stacking)}`);
      const pickerGeometry = await picker.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const overlayElement = element.closest('.directive-campaign-dialog-overlay');
        const overlay = overlayElement?.getBoundingClientRect();
        const overlayStyle = overlayElement ? getComputedStyle(overlayElement) : null;
        const rootElement = element.closest('.directive-modal-root');
        const rootRect = rootElement?.getBoundingClientRect();
        const rootStyle = rootElement ? getComputedStyle(rootElement) : null;
        return {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          overlayTop: overlay?.top,
          overlayBottom: overlay?.bottom,
          overlayWidth: overlay?.width,
          overlayHeight: overlay?.height,
          overlayPosition: overlayStyle?.position,
          overlayDisplay: overlayStyle?.display,
          overlayInset: overlayStyle?.inset,
          rootWidth: rootRect?.width,
          rootHeight: rootRect?.height,
          rootPosition: rootStyle?.position,
          rootDisplay: rootStyle?.display,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight
        };
      });
      if (pickerGeometry.top < -1 || pickerGeometry.bottom > viewport.height + 1) {
        throw new Error(`${name}: New Campaign picker is outside the viewport. ${JSON.stringify(pickerGeometry)}`);
      }
      if (ARTIFACT_DIR) {
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, `player-facing-${name}-new-campaign.png`),
          fullPage: false
        });
      }
      const closePicker = picker.locator('.directive-campaign-dialog-close').first();
      await closePicker.evaluate((element) => element.click());
      await page.waitForTimeout(80);
      if (await page.locator('.directive-campaign-browser-dialog:visible').count()) throw new Error(`${name}: New Campaign picker did not close.`);
      if (!await newCampaignButton.evaluate((element) => document.activeElement === element).catch(() => false)) {
        throw new Error(`${name}: New Campaign close did not restore focus to its opener.`);
      }
      if (ARTIFACT_DIR) {
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, `player-facing-${name}-campaign.png`),
          fullPage: false
        });
      }
    }
  }

  const campaignControl = page.locator('.directive-route-control[data-route-id="campaign"]').first();
  await campaignControl.focus();
  await campaignControl.press('ArrowRight');
  await page.locator('.directive-route-control[data-route-id="mission"][aria-selected="true"]').waitFor({ state: 'visible', timeout: TIMEOUT_MS });

  await clickRoute(page, 'mission');
  const missionText = await panel.innerText();
  const missionSurface = isMobile
    ? await panel.locator('.mobile-quest-accordion:visible').count()
    : await panel.locator('.mission-layout:visible').count();
  const questRows = panel.locator('.quest-row');
  let questSelection = { status: 'skipped', reason: 'No active campaign quest rows were available.' };
  if (false && isMobile) {
    const missionRoute = panel.locator('.directive-mobile-mission-route:visible');
    const missionRows = missionRoute.locator('.directive-quest-row');
    if (await missionRows.count()) {
      await missionRows.first().tap();
      await missionRoute.locator('[data-directive-mobile-surface="detail"]:visible').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
      if (await missionRoute.locator('[data-directive-mobile-surface="list"]:visible').count()) throw new Error(`${name}: Mission list and detail are visible together.`);
      await missionRoute.locator('.directive-mobile-route-back').tap();
      await missionRoute.locator('[data-directive-mobile-surface="list"]:visible').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    }
  }
  if (!isMobile && await questRows.count()) {
    const questId = await questRows.first().getAttribute('data-quest-id');
    try {
      await questRows.first().click();
      await page.locator(`.quest-row[data-quest-id="${questId}"][aria-selected="true"]`).waitFor({ state: 'visible', timeout: TIMEOUT_MS });
      await clickRoute(page, 'people');
      await clickRoute(page, 'mission');
      const selectedAfterReturn = await panel.locator(`.quest-row[data-quest-id="${questId}"][aria-selected="true"]`).count();
      questSelection = selectedAfterReturn === 1
        ? { status: 'pass', questId }
        : { status: 'fail', reason: 'Selected quest did not remain selected after a route-only navigation.' };
    } catch (error) {
      questSelection = { status: 'fail', questId, reason: error?.message || String(error) };
    }
  }

  await clickRoute(page, 'people');
  const crewText = await panel.innerText();
  const crewSurface = isMobile
    ? await panel.locator('.mobile-crew-accordion:visible').count()
    : await panel.locator('.people-layout:visible').count();
  if (false && isMobile) {
    const peopleRoute = panel.locator('.directive-mobile-people-route:visible');
    const peopleRows = peopleRoute.locator('.directive-mobile-crew-row');
    if (await peopleRows.count()) {
      await peopleRows.first().tap();
      await peopleRoute.locator('[data-directive-mobile-surface="detail"]:visible').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
      if (await peopleRoute.locator('[data-directive-mobile-surface="list"]:visible').count()) throw new Error(`${name}: People list and detail are visible together.`);
      await peopleRoute.locator('.directive-mobile-route-back').tap();
      await peopleRoute.locator('[data-directive-mobile-surface="list"]:visible').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    }
  }
  await clickRoute(page, 'ship');
  const shipText = await panel.innerText();
  const shipSurface = isMobile
    ? await panel.locator('.mobile-ship-journal:visible').count()
    : await panel.locator('.ship-journal:visible').count();
  await clickRoute(page, 'settings');
  const settingsSurface = await panel.locator('.settings-journal:visible').count();
  if (false && isMobile) {
    const settingsRoute = panel.locator('.directive-mobile-settings-route:visible');
    const settingsRows = settingsRoute.locator('.directive-mobile-settings-row');
    await settingsRows.first().tap();
    await settingsRoute.locator('[data-directive-mobile-surface="detail"]:visible').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    if (await settingsRoute.locator('[data-directive-mobile-surface="list"]:visible').count()) throw new Error(`${name}: Settings list and detail are visible together.`);
    await settingsRoute.locator('.directive-mobile-route-back').tap();
    await settingsRoute.locator('[data-directive-mobile-surface="list"]:visible').waitFor({ state: 'visible', timeout: TIMEOUT_MS });
  }
  const disclosureCount = await panel.locator('.settings-disclosure').count();
  const openDisclosureCount = await panel.locator('.settings-disclosure[open]').count();
  const geometry = await panel.evaluate((element) => {
    const drawer = element.querySelector('.directive-route-body') || element;
    const journal = element.querySelector('.mobile-quest-accordion, .mobile-crew-accordion, .mobile-ship-journal, .mission-layout, .people-layout, .ship-journal, .settings-journal');
    const rect = element.getBoundingClientRect();
    return {
      shell: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      panelWidth: drawer.getBoundingClientRect().width,
      panelHeight: drawer.getBoundingClientRect().height,
      contentWidth: drawer.scrollWidth,
      journalWidth: journal?.getBoundingClientRect().width || 0,
      overflowsHorizontally: drawer.scrollWidth > drawer.clientWidth + 2,
      routeBodyOverflowY: getComputedStyle(drawer).overflowY,
      routeBarVisible: Boolean(element.querySelector('.directive-route-bar')),
      hostMargin: window.innerWidth <= 640 ? 0 : 24,
      bounded: window.innerWidth <= 640
        ? rect.left <= 1 && rect.top <= 1 && Math.abs(rect.width - window.innerWidth) <= 2 && Math.abs(rect.height - window.innerHeight) <= 2
        : rect.left >= 24 && rect.top >= 24 && rect.right <= window.innerWidth - 24 && rect.bottom <= window.innerHeight - 24
    };
  });

  if (!missionSurface && !CURRENT_CHAT_EMPTY_STATE.test(missionText)) {
    throw new Error(`${name}: Mission did not render a quest journal or a campaign empty state. Text: ${missionText.slice(0, 500)}`);
  }
  if ((!crewSurface && !CURRENT_CHAT_EMPTY_STATE.test(crewText)) || (!shipSurface && !CURRENT_CHAT_EMPTY_STATE.test(shipText)) || !settingsSurface || disclosureCount !== 3 || openDisclosureCount !== 0) {
    throw new Error(`${name}: one or more focused route surfaces did not render. crew=${crewSurface} ship=${shipSurface} settings=${settingsSurface} disclosures=${disclosureCount} open=${openDisclosureCount}. Crew: ${crewText.slice(0, 240)} Ship: ${shipText.slice(0, 240)}`);
  }
  if (geometry.overflowsHorizontally) throw new Error(`${name}: route surface overflows horizontally. panel=${geometry.panelWidth} content=${geometry.contentWidth} journal=${geometry.journalWidth}`);
  if (!geometry.bounded) throw new Error(`${name}: shell geometry is incorrect. ${JSON.stringify(geometry.shell)}`);
  if (isMobile && geometry.routeBodyOverflowY !== 'auto' && geometry.routeBodyOverflowY !== 'scroll') throw new Error(`${name}: route body is not the mobile scrolling region (${geometry.routeBodyOverflowY}).`);
  if (isMobile && !geometry.routeBarVisible) throw new Error(`${name}: route bar disappeared on mobile.`);
  if (isMobile) {
    const mobileText = await panel.innerText();
    if (mobileText.includes('[object Object]')) throw new Error(`${name}: player-facing mobile text contains [object Object].`);
  }

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
  const context = await browser.newContext({ baseURL: BASE_URL, hasTouch: true });
  try {
    await context.addCookies(cookieHeaderToBrowserCookies(auth.headers?.Cookie, BASE_URL));
    const servedExtensionParity = await verifyServedExtension(context);
    const page = await context.newPage();
    const viewports = [];
    for (const entry of VIEWPORTS) {
      viewports.push(await inspectViewport(page, entry));
    }
    const selectionFailures = viewports.filter((result) => result.questSelection.status === 'fail');
    return {
      ok: selectionFailures.length === 0,
      status: selectionFailures.length ? 'fail' : 'pass',
      mode: 'live',
      user: USER,
      baseUrl: BASE_URL,
      servedExtensionParity,
      viewports
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
