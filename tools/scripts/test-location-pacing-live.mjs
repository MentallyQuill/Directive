import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  authenticateSillyTavernUser,
  createRunId,
  DEFAULT_DIRECTIVE_EXTENSION_PATH,
  DEFAULT_SILLYTAVERN_BASE_URL,
  normalizeBaseUrl,
  normalizeExtensionPath
} from './lib/sillytavern-live-harness.mjs';

const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || DEFAULT_SILLYTAVERN_BASE_URL);
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || DEFAULT_DIRECTIVE_EXTENSION_PATH);
const BRIDGE_MODULE_PATH = `${EXTENSION_PATH}/src/hosts/sillytavern/runtime-bridge.mjs`;
const ST_USER = String(process.env.DIRECTIVE_SILLYTAVERN_USER || 'default-user').trim();
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const TIMEOUT_MS = Number.parseInt(process.env.DIRECTIVE_LOCATION_PACING_TIMEOUT_MS || '120000', 10);
const ARTIFACT_DIR = path.resolve(process.cwd(), process.env.DIRECTIVE_LOCATION_PACING_ARTIFACT_DIR || 'artifacts/live-pacing');
const SKIP_LOCATION_PROBE = process.env.DIRECTIVE_LOCATION_PACING_SKIP_LOCATION === '1';
const LOCATION_PROBE_TEXT = process.env.DIRECTIVE_LOCATION_PACING_LOCATION_TEXT || 'I head to Engineering.';
const EXPLICIT_CUT_TEXT = process.env.DIRECTIVE_LOCATION_PACING_EXPLICIT_CUT_TEXT || 'Cut to Sam entering the bridge three minutes early.';

function passwordEnvKey(handle = '') {
  const suffix = String(handle || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return suffix ? `DIRECTIVE_SILLYTAVERN_PASSWORD_${suffix}` : '';
}

function configuredPassword(handle = '') {
  const keyed = passwordEnvKey(handle);
  return process.env.DIRECTIVE_SILLYTAVERN_PASSWORD
    || process.env.DIRECTIVE_SOAK_ST_PASSWORD
    || (keyed ? process.env[keyed] : '')
    || '';
}

function cookieHeaderToPlaywrightCookies(cookieHeader = '', baseUrl = BASE_URL) {
  const url = new URL(baseUrl);
  return String(cookieHeader || '')
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf('=');
      if (separator <= 0) return null;
      return {
        name: pair.slice(0, separator).trim(),
        value: pair.slice(separator + 1).trim(),
        domain: url.hostname,
        path: '/'
      };
    })
    .filter((cookie) => cookie?.name);
}

function compact(value = '', maxLength = 320) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

async function createAuthenticatedPage(chromium) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const browserContext = await browser.newContext();
  if (ST_USER) {
    const auth = await authenticateSillyTavernUser({
      baseUrl: BASE_URL,
      handle: ST_USER,
      password: configuredPassword(ST_USER),
      timeoutMs: 15000
    });
    assert.equal(auth.ok, true, `Could not authenticate SillyTavern user ${ST_USER}: ${auth.error || auth.loginStatus || 'unknown error'}`);
    const cookies = cookieHeaderToPlaywrightCookies(auth.headers?.Cookie || auth.headers?.cookie || '');
    assert.ok(cookies.length > 0, `SillyTavern user ${ST_USER} authentication did not return a session cookie.`);
    await browserContext.addCookies(cookies);
  }
  const page = await browserContext.newPage();
  return { browser, context: browserContext, page };
}

async function waitForRuntime(page) {
  await page.waitForFunction(async (modulePath) => {
    try {
      const mod = await import(modulePath);
      const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
      return Boolean(bridge.runtimeApp?.getCurrentView && bridge.runtimeApp?.openCampaignChat);
    } catch {
      return false;
    }
  }, BRIDGE_MODULE_PATH, { timeout: TIMEOUT_MS });
}

async function runtimeSnapshot(page) {
  return page.evaluate(async ({ modulePath }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const compactText = (value = '', maxLength = 500) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
    };
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    const view = app?.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const assistantMessages = chat
      .map((message, index) => {
        const extra = message.extra || {};
        const metadata = message.metadata || extra.runtimeMetadata || {};
        const directive = extra.directive || metadata.directive || {};
        const text = compactText(message.mes || message.text || message.content || '', 900);
        return {
          index,
          mesid: message.mesid ?? index,
          isUser: message.is_user === true || message.isUser === true,
          name: message.name || '',
          text,
          responseKind: directive.responseKind || metadata.responseKind || message.responseKind || null,
          directiveOwned: Boolean(directive.responseKind || metadata.responseKind || message.isDirectiveOwned || message.directiveOwned)
        };
      })
      .filter((entry) => !entry.isUser);
    const campaignState = view?.campaignState || {};
    const ingressLedger = campaignState.runtimeTracking?.ingressLedger || [];
    const responseLedger = campaignState.runtimeTracking?.responseLedger || [];
    return {
      currentChatId: host?.chat?.getCurrentChatId?.() || context.chatId || context.chat_id || null,
      binding: clone(view?.chatNative?.binding || null),
      campaign: clone(campaignState.campaign || null),
      elapsedMinutes: campaignState.worldState?.elapsedMinutes ?? null,
      ingressCount: ingressLedger.length,
      responseCount: responseLedger.length,
      lastIngress: clone(ingressLedger.at(-1) || null),
      lastResponse: clone(responseLedger.at(-1) || null),
      ingressTail: clone(ingressLedger.slice(-5).map((entry) => ({
        hostMessageId: entry.hostMessageId || null,
        status: entry.status || null,
        classification: entry.classification?.classification || entry.classification || null,
        responseStrategy: entry.responseStrategy || entry.classification?.responseStrategy || null
      }))),
      responseTail: clone(responseLedger.slice(-5).map((entry) => ({
        responseKind: entry.responseKind || null,
        strategy: entry.strategy || null,
        status: entry.status || null,
        hostMessageId: entry.hostMessageId || null,
        hostContinuation: entry.hostContinuation || null
      }))),
      assistantTail: assistantMessages.slice(-8)
    };
  }, { modulePath: BRIDGE_MODULE_PATH });
}

async function openActiveCampaignChat(page) {
  return page.evaluate(async ({ modulePath }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const compactOpenResult = (result = null) => {
      if (!result || typeof result !== 'object') return null;
      return {
        ok: result.ok ?? null,
        binding: clone(result.binding || null),
        openSync: result.openSync ? {
          opened: result.openSync.opened ?? null,
          metadataUpdated: result.openSync.metadataUpdated ?? null,
          prompt: result.openSync.prompt ? {
            ok: result.openSync.prompt.ok ?? null,
            active: result.openSync.prompt.active ?? null,
            revision: result.openSync.prompt.packet?.revision ?? result.openSync.prompt.revision ?? null,
            hash: result.openSync.prompt.packet?.hash || result.openSync.prompt.packet?.contentHash || result.openSync.prompt.hash || null
          } : null
        } : null
      };
    };
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const openResult = await app?.openCampaignChat?.();
    const view = app?.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    return {
      openResult: compactOpenResult(openResult || null),
      binding: clone(view?.chatNative?.binding || null),
      campaign: clone(view?.campaignState?.campaign || null)
    };
  }, { modulePath: BRIDGE_MODULE_PATH });
}

async function waitForSendReady(page) {
  await page.waitForFunction(async () => {
    try {
      const st = await import('/script.js');
      return st.is_send_press !== true
        && (typeof st.isGenerating !== 'function' || st.isGenerating() !== true);
    } catch {
      const button = document.querySelector('#send_but') || document.querySelector('#send_button');
      return Boolean(button && !button.disabled);
    }
  }, null, { timeout: TIMEOUT_MS });
}

async function sendChatMessage(page, text) {
  await waitForSendReady(page);
  const before = await page.evaluate(() => {
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chat = Array.isArray(context.chat) ? context.chat : [];
    return { length: chat.length };
  });
  await page.fill('#send_textarea', '');
  await page.fill('#send_textarea', text);
  await page.evaluate((messageText) => {
    const textarea = document.querySelector('#send_textarea');
    if (!textarea) return;
    textarea.value = messageText;
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: messageText }));
    textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }, text);
  await page.click('#send_but');
  const userRow = await page.waitForFunction(({ beforeLength, messageText }) => {
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chat = Array.isArray(context.chat) ? context.chat : [];
    if (chat.length <= beforeLength) return false;
    const row = chat.slice(beforeLength).find((entry, offset) => {
      const text = String(entry.mes || entry.text || '').replace(/\s+/g, ' ').trim();
      return (entry.is_user === true || entry.isUser === true) && text.includes(messageText);
    });
    if (!row) return false;
    const index = chat.indexOf(row);
    return {
      hostMessageId: String(row.mesid ?? index),
      index,
      role: 'user',
      isUser: true,
      text: String(row.mes || row.text || messageText)
    };
  }, {
    beforeLength: before.length,
    messageText: text
  }, { timeout: 15000 });
  const message = await userRow.jsonValue();
  await page.evaluate(async ({ modulePath, message }) => {
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    if (!app?.observeHostPlayerMessage) return null;
    return app.observeHostPlayerMessage({
      chatId: host?.chat?.getCurrentChatId?.() || null,
      message
    });
  }, { modulePath: BRIDGE_MODULE_PATH, message }).catch(() => null);
  return message;
}

async function waitForIngressAfter(page, beforeIngressCount, expectedClassification, {
  expectedResponseKind = null,
  expectedResponseStrategy = null
} = {}) {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    last = await runtimeSnapshot(page);
    const classification = last.lastIngress?.classification?.classification || last.lastIngress?.classification || null;
    const responseKind = last.lastResponse?.responseKind || null;
    const responseStrategy = last.lastIngress?.responseStrategy || last.lastResponse?.strategy || null;
    const settled = ['committed', 'complete'].includes(String(last.lastIngress?.status || ''));
    const responseMatches = !expectedResponseKind || responseKind === expectedResponseKind;
    const strategyMatches = !expectedResponseStrategy || responseStrategy === expectedResponseStrategy;
    if (
      last.ingressCount > beforeIngressCount
      && classification === expectedClassification
      && settled
      && responseMatches
      && strategyMatches
    ) {
      return last;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Timed out waiting for ${expectedClassification} ingress. Last snapshot: ${JSON.stringify(last, null, 2)}`);
}

async function run() {
  const { chromium } = await import('playwright');
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const runId = createRunId();
  const artifactPath = path.join(ARTIFACT_DIR, `location-pacing-${runId}.json`);
  const { browser, context, page } = await createAuthenticatedPage(chromium);
  const report = {
    kind: 'directive.liveLocationPacingProof',
    runId,
    baseUrl: BASE_URL,
    user: ST_USER,
    artifactPath,
    checks: []
  };
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await waitForRuntime(page);
    report.opened = await openActiveCampaignChat(page);
    assert.ok(report.opened?.binding?.chatId, 'Active campaign chat binding was not opened.');

    let beforeLocation = null;
    let afterLocation = null;
    let locationResponse = null;
    if (SKIP_LOCATION_PROBE) {
      afterLocation = await runtimeSnapshot(page);
      locationResponse = afterLocation.assistantTail.findLast?.((entry) => entry.responseKind === 'locationTransition')
        || [...afterLocation.assistantTail].reverse().find((entry) => entry.responseKind === 'locationTransition');
      assert.ok(locationResponse, 'No existing locationTransition assistant response was available to reuse.');
    } else {
      beforeLocation = await runtimeSnapshot(page);
      await sendChatMessage(page, LOCATION_PROBE_TEXT);
      afterLocation = await waitForIngressAfter(page, beforeLocation.ingressCount, 'locationTransition', {
        expectedResponseKind: 'locationTransition',
        expectedResponseStrategy: 'directivePosted'
      });
      locationResponse = afterLocation.assistantTail.find((entry) => String(entry.mesid) === String(afterLocation.lastResponse?.hostMessageId || ''))
        || [...afterLocation.assistantTail].reverse().find((entry) => entry.responseKind === 'locationTransition')
        || afterLocation.assistantTail.at(-1);
      assert.equal(afterLocation.lastIngress.classification.classification, 'locationTransition');
      assert.equal(afterLocation.lastIngress.responseStrategy, 'directivePosted');
      assert.equal(afterLocation.lastResponse.responseKind, 'locationTransition');
      assert.equal(afterLocation.lastResponse.strategy, 'directivePosted');
      assert.equal(afterLocation.elapsedMinutes, Number(beforeLocation.elapsedMinutes || 0) + 2);
    }
    assert.ok(/Engineering/i.test(locationResponse?.text || ''), `Location transition response did not mention Engineering: ${locationResponse?.text || ''}`);
    assert.ok(/threshold/i.test(locationResponse?.text || ''), `Location transition response did not stop at a threshold: ${locationResponse?.text || ''}`);
    assert.ok(!/\bBridge\b/i.test(locationResponse?.text || ''), `Location transition response crossed onward to the bridge: ${locationResponse?.text || ''}`);
    assert.ok(!/breckenridge-in-transit|intrepid\./i.test(locationResponse?.text || ''), `Location transition response exposed a raw location id: ${locationResponse?.text || ''}`);
    report.checks.push({
      id: 'location-transition-stops-on-arrival',
      status: 'pass',
      reusedExisting: SKIP_LOCATION_PROBE,
      before: beforeLocation,
      after: afterLocation,
      responsePreview: compact(locationResponse?.text || '')
    });

    const beforeCut = await runtimeSnapshot(page);
    await sendChatMessage(page, EXPLICIT_CUT_TEXT);
    const afterCut = await waitForIngressAfter(page, beforeCut.ingressCount, 'sceneNavigation', {
      expectedResponseKind: 'hostGeneration',
      expectedResponseStrategy: 'injectAndContinue'
    });
    await waitForSendReady(page);
    const finalCut = await runtimeSnapshot(page);
    assert.equal(afterCut.lastIngress.classification.classification, 'sceneNavigation');
    assert.equal(afterCut.lastIngress.responseStrategy, 'injectAndContinue');
    report.checks.push({
      id: 'explicit-cut-remains-host-continuation',
      status: 'pass',
      before: beforeCut,
      after: finalCut
    });

    fs.writeFileSync(artifactPath, JSON.stringify(report, null, 2));
    console.log(`Live location pacing proof passed. Artifact: ${artifactPath}`);
  } catch (error) {
    report.error = {
      message: error?.message || String(error),
      stack: error?.stack || null
    };
    try {
      report.failureSnapshot = await runtimeSnapshot(page);
    } catch {
      report.failureSnapshot = null;
    }
    fs.writeFileSync(artifactPath, JSON.stringify(report, null, 2));
    throw error;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

await run();
