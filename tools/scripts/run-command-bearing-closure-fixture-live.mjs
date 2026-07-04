import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_DIRECTIVE_EXTENSION_PATH,
  DEFAULT_SILLYTAVERN_BASE_URL,
  appendJsonLine,
  authenticateSillyTavernUser,
  cloneJson,
  compareServedExtension,
  createRunId,
  ensureDirectory,
  launchPlaywrightBrowser,
  normalizeBaseUrl,
  normalizeExtensionPath,
  writeJsonFile,
  writeTextFile
} from './lib/sillytavern-live-harness.mjs';
import { commitCommandBearingReviewRecords } from '../../src/campaign/transaction-state.mjs';
import {
  commitTrackedCampaignState,
  initializeCampaignRuntimeTracking
} from '../../src/runtime/state-delta-gateway.mjs';

const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || DEFAULT_SILLYTAVERN_BASE_URL);
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || DEFAULT_DIRECTIVE_EXTENSION_PATH);
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const ST_USER = normalizeUserHandle(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_SOAK_ST_USER || '');
const RESUME_SAVE_ID = String(process.env.DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID || '').trim();
const RESUME_CHAT_ID = String(process.env.DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID || '').trim();
const DATA_ROOT = String(process.env.DIRECTIVE_SILLYTAVERN_DATA_ROOT || 'F:/SillyTavern/SillyTavern/data').trim();
const RUN_ID = String(process.env.DIRECTIVE_COMMAND_BEARING_FIXTURE_RUN_ID || `command-bearing-closure-fixture-live-${createRunId()}`).trim();
const ARTIFACT_DIR = path.resolve(
  process.env.DIRECTIVE_COMMAND_BEARING_FIXTURE_ARTIFACT_DIR
  || path.join('artifacts/live-soak/sillytavern-campaign/agent-c-command-bearing-endconditions', RUN_ID)
);
const LIVE_LOG_PATH = String(
  process.env.DIRECTIVE_SILLYTAVERN_LIVE_LOG_PATH
  || 'artifacts/live-soak/sillytavern-campaign/2026-06-25T09-41-25-337Z-five-lane-coordination/live-log.jsonl'
).trim();
const WRITE_CONFIRMED = process.env.DIRECTIVE_COMMAND_BEARING_FIXTURE_WRITE_SAVE === '1';
const TIMEOUT_MS = positiveInteger(process.env.DIRECTIVE_COMMAND_BEARING_FIXTURE_TIMEOUT_MS, 120000);
const FIXTURE_CLOSURE_TYPE = normalizeClosureType(process.env.DIRECTIVE_COMMAND_BEARING_FIXTURE_CLOSURE_TYPE || 'quest');
const FIXTURE_TARGET_ID = String(process.env.DIRECTIVE_COMMAND_BEARING_FIXTURE_TARGET_ID || '').trim();
const BRANCH_MODE = String(process.env.DIRECTIVE_COMMAND_BEARING_FIXTURE_BRANCH_MODE || 'storageClone').trim();

const SERVED_FILES = Object.freeze([
  'src/command/command-bearing.mjs',
  'src/command/command-bearing-review.mjs',
  'src/campaign/transaction-state.mjs',
  'src/generation/generation-router.mjs',
  'src/runtime/runtime-app.mjs',
  'src/runtime/state-delta-gateway.mjs'
]);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeUserHandle(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
}

function normalizeClosureType(value = '') {
  const normalized = String(value || '').trim();
  if (['quest', 'chapter', 'milestone', 'storyArc'].includes(normalized)) return normalized;
  if (/^story[-_ ]?arc$/i.test(normalized)) return 'storyArc';
  return 'quest';
}

function envPasswordKey(handle) {
  const suffix = String(handle || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return suffix ? `DIRECTIVE_SOAK_ST_PASSWORD_${suffix}` : null;
}

function configuredUserPassword(handle) {
  const key = envPasswordKey(handle);
  return process.env.DIRECTIVE_SILLYTAVERN_PASSWORD
    || process.env.DIRECTIVE_SOAK_ST_PASSWORD
    || (key ? process.env[key] : '')
    || '';
}

function cookieHeaderToPlaywrightCookies(cookieHeader = '') {
  return String(cookieHeader || '')
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf('=');
      if (separator <= 0) return null;
      return {
        name: pair.slice(0, separator),
        value: pair.slice(separator + 1),
        url: BASE_URL
      };
    })
    .filter(Boolean);
}

function bridgeModulePath() {
  return `${EXTENSION_PATH}/src/hosts/sillytavern/runtime-bridge.mjs`;
}

function compact(value, maxLength = 700) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function assertLive(condition, message, details = null) {
  if (condition) return;
  const error = new Error(details ? `${message}: ${compact(details, 900)}` : message);
  error.details = details;
  throw error;
}

function saveFilePath(saveId) {
  return path.join(DATA_ROOT, ST_USER, 'user', 'files', `directive-saves-${saveId}.v1.json`);
}

function saveIndexFilePath() {
  return path.join(DATA_ROOT, ST_USER, 'user', 'files', 'directive-indexes-saves.v1.json');
}

function storageIndexFilePath() {
  return path.join(DATA_ROOT, ST_USER, 'user', 'files', 'directive-system-storage-index.v1.json');
}

function readSaveRecord(saveId) {
  const filePath = saveFilePath(saveId);
  return {
    filePath,
    record: JSON.parse(fs.readFileSync(filePath, 'utf8'))
  };
}

function writeSaveRecord(saveId, record) {
  const filePath = saveFilePath(saveId);
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return filePath;
}

function logicalSavePath(saveId) {
  return `saves/${saveId}.v1.json`;
}

function randomHex(length = 8) {
  return Math.random().toString(16).slice(2, 2 + length).padEnd(length, '0');
}

function createFixtureSaveId() {
  return `save-${Date.now()}-fixture-${randomHex(8)}`;
}

function saveListEntry(saveRecord, filePath = logicalSavePath(saveRecord.id)) {
  return {
    id: saveRecord.id,
    name: saveRecord.name,
    slotType: saveRecord.slotType,
    revision: saveRecord.revision,
    updatedAt: saveRecord.updatedAt,
    metadata: cloneJson(saveRecord.metadata || {}),
    path: filePath,
    current: saveRecord.current === true
  };
}

function writeSaveIndexActive(saveRecord) {
  const indexPath = saveIndexFilePath();
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const now = saveRecord.updatedAt || new Date().toISOString();
  const next = {
    ...index,
    revision: Number(index.revision || 0) + 1,
    updatedAt: now,
    saves: {
      ...(index.saves || {})
    },
    activeSaveId: saveRecord.id
  };
  for (const entry of Object.values(next.saves)) {
    entry.current = false;
  }
  next.saves[saveRecord.id] = saveListEntry(saveRecord);
  fs.writeFileSync(indexPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return indexPath;
}

function writeStorageIndexEntry(saveRecord) {
  const indexPath = storageIndexFilePath();
  if (!fs.existsSync(indexPath)) return null;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const now = saveRecord.updatedAt || new Date().toISOString();
  const logicalPath = logicalSavePath(saveRecord.id);
  const next = {
    ...index,
    revision: Number(index.revision || 0) + 1,
    updatedAt: now,
    files: {
      ...(index.files || {}),
      [logicalPath]: {
        path: logicalPath,
        kind: 'directive.campaignSave',
        ownerId: saveRecord.id,
        campaignId: saveRecord.metadata?.campaignId || null,
        indexPath: 'indexes/saves.v1.json',
        updatedAt: now
      }
    }
  };
  fs.writeFileSync(indexPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return indexPath;
}

function createStorageCloneBranch(sourceSaveId) {
  const { filePath: sourcePath, record: sourceRecord } = readSaveRecord(sourceSaveId);
  const now = new Date().toISOString();
  const newSaveId = createFixtureSaveId();
  const sourceState = sourceRecord.payload?.campaignState || sourceRecord.campaignState || {};
  const branchState = {
    ...cloneJson(sourceState),
    campaignChatBinding: sourceState.campaignChatBinding
      ? {
          ...cloneJson(sourceState.campaignChatBinding),
          saveId: newSaveId
        }
      : sourceState.campaignChatBinding
  };
  const branchRecord = {
    ...cloneJson(sourceRecord),
    id: newSaveId,
    revision: 1,
    slotType: 'manual',
    name: `Command Bearing ${FIXTURE_CLOSURE_TYPE} Closure Fixture ${now}`,
    createdAt: now,
    updatedAt: now,
    current: true,
    metadata: {
      ...(cloneJson(sourceRecord.metadata || {})),
      lastUpdatedAt: now,
      summary: `Fixture branch cloned from ${sourceSaveId} before live Command Bearing ${FIXTURE_CLOSURE_TYPE} closure review.`,
      campaignChatBinding: sourceRecord.metadata?.campaignChatBinding
        ? {
            ...cloneJson(sourceRecord.metadata.campaignChatBinding),
            saveId: newSaveId
          }
        : (branchState.campaignChatBinding ? cloneJson(branchState.campaignChatBinding) : null),
      branch: {
        parentSaveId: sourceSaveId,
        parentSaveName: sourceRecord.name || null,
        divergenceOutcomeId: sourceState.turnLedger?.lastCommittedOutcomeId || null,
        branchedAt: now,
        fixtureBacked: true,
        branchMode: 'storageClone'
      }
    },
    payload: {
      ...(cloneJson(sourceRecord.payload || {})),
      campaignState: branchState
    }
  };
  const branchPath = writeSaveRecord(newSaveId, branchRecord);
  const saveIndexPath = writeSaveIndexActive(branchRecord);
  const storageIndexPath = writeStorageIndexEntry(branchRecord);
  return {
    ok: true,
    mode: 'storageClone',
    previousSaveId: sourceSaveId,
    saveId: newSaveId,
    branchSaveId: newSaveId,
    sourcePath,
    branchPath,
    saveIndexPath,
    storageIndexPath,
    binding: cloneJson(branchState.campaignChatBinding || null),
    revision: branchState.runtimeTracking?.revision || null,
    campaignId: branchState.campaign?.id || null
  };
}

function countOpenEvidence(state) {
  return (state?.commandBearing?.evidenceLedger?.records || [])
    .filter((record) => record?.visible !== false && String(record?.status || 'open') === 'open')
    .length;
}

function commandBearingCounts(state) {
  const bearing = state?.commandBearing || {};
  return {
    evidence: bearing.evidenceLedger?.records?.length || 0,
    reviews: bearing.reviewLedger?.records?.length || 0,
    resolveMarks: bearing.tracks?.resolve?.marks || 0,
    inspirationMarks: bearing.tracks?.inspiration?.marks || 0,
    resolvePoints: bearing.tracks?.resolve?.points || 0,
    inspirationPoints: bearing.tracks?.inspiration?.points || 0,
    openEvidence: countOpenEvidence(state)
  };
}

function updateSaveRecordWithState(saveRecord, finalState, timestamp, summary) {
  const next = cloneJson(saveRecord);
  next.revision = finalState.runtimeTracking?.revision ?? Number(next.revision || 0) + 1;
  next.updatedAt = timestamp;
  next.current = true;
  next.payload = {
    ...(next.payload || {}),
    campaignState: cloneJson(finalState)
  };
  next.metadata = {
    ...(next.metadata || {}),
    campaignId: finalState.campaign?.id || next.metadata?.campaignId || null,
    campaignTitle: finalState.campaign?.title || next.metadata?.campaignTitle || null,
    packageId: finalState.activeCampaignPackage?.id || finalState.campaign?.packageId || next.metadata?.packageId || null,
    playerName: finalState.player?.name || next.metadata?.playerName || null,
    stardate: finalState.worldState?.currentStardate ?? next.metadata?.stardate ?? null,
    activeMissionId: finalState.mission?.activeMissionId || finalState.attentionState?.foregroundQuestId || next.metadata?.activeMissionId || null,
    activePhaseId: finalState.mission?.activePhaseId || next.metadata?.activePhaseId || null,
    simulationMode: finalState.settings?.simulationMode || next.metadata?.simulationMode || null,
    lastUpdatedAt: timestamp,
    summary,
    campaignChatBinding: cloneJson(finalState.campaignChatBinding || next.metadata?.campaignChatBinding || null)
  };
  return next;
}

function appendSummary(report) {
  const closureType = report.closure?.closureType || 'n/a';
  const lines = [
    '# Command Bearing Closure Fixture Live',
    '',
    `Status: ${report.status.toUpperCase()}`,
    '',
    `SillyTavern user: \`${report.stUser}\``,
    `Branch save: \`${report.branchSaveId || report.isolation?.branchSaveId || 'n/a'}\``,
    `Closure: \`${report.closure?.closureId || 'n/a'}\` (${closureType})`,
    `Review records: ${report.review?.records?.length || 0}`,
    `Mark awarded: ${report.review?.records?.some((record) => record.markAwarded) ? 'yes' : 'no'}`,
    '',
    'Artifacts:',
    `- Report: ${path.relative(process.cwd(), path.join(ARTIFACT_DIR, 'report.json')).replace(/\\/g, '/')}`,
    `- Persisted verification: ${path.relative(process.cwd(), path.join(ARTIFACT_DIR, 'persisted-verification.json')).replace(/\\/g, '/')}`
  ];
  writeTextFile(path.join(ARTIFACT_DIR, 'summary.md'), `${lines.join('\n')}\n`);
}

async function createAuthenticatedPage(browser) {
  if (!ST_USER) return { page: await browser.newPage(), auth: null };
  assertLive(ST_USER !== 'default-user', 'default-user is reserved for human testing and cannot run soak automation.');
  const auth = await authenticateSillyTavernUser({
    baseUrl: BASE_URL,
    handle: ST_USER,
    password: configuredUserPassword(ST_USER),
    timeoutMs: TIMEOUT_MS
  });
  assertLive(auth.ok, `Could not authenticate SillyTavern user ${ST_USER}.`, auth);
  const cookies = cookieHeaderToPlaywrightCookies(auth.headers?.Cookie || auth.headers?.cookie || '');
  assertLive(cookies.length > 0, `SillyTavern user ${ST_USER} authentication did not return a session cookie.`, auth);
  const context = await browser.newContext();
  await context.addCookies(cookies);
  return {
    page: await context.newPage(),
    auth
  };
}

async function verifyBrowserUserSession(page) {
  if (!ST_USER) return null;
  const session = await page.evaluate(async () => {
    const response = await fetch('/api/users/me');
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: response.ok, status: response.status, json, text };
  });
  assertLive(
    session.ok && session.json?.handle === ST_USER,
    `Browser session is not authenticated as ${ST_USER}.`,
    session
  );
  return session.json;
}

async function openDirectivePanel(page) {
  await page.waitForFunction(() => {
    if (typeof globalThis.Directive?.bridge?.showRuntime === 'function') return true;
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') return true;
    if (typeof globalThis.Directive?.actions?.run === 'function') return true;
    return Boolean(document.getElementById('directive-extensions-menu-button'));
  }, null, { timeout: TIMEOUT_MS });

  const openedWith = await page.evaluate(async () => {
    if (typeof globalThis.Directive?.bridge?.showRuntime === 'function') {
      await globalThis.Directive.bridge.showRuntime();
      return 'Directive.bridge.showRuntime';
    }
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') {
      await globalThis.Directive.bridge.runAction('runtime.open');
      return 'Directive.bridge.runAction(runtime.open)';
    }
    if (typeof globalThis.Directive?.actions?.run === 'function') {
      await globalThis.Directive.actions.run('runtime.open');
      return 'Directive.actions.run(runtime.open)';
    }
    const button = document.getElementById('directive-extensions-menu-button');
    button?.click();
    return button ? 'extensions-menu' : '';
  });
  assertLive(openedWith, 'Directive bridge or menu launcher was not found.');
  await page.waitForFunction(() => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    return Boolean(panel && panel.hidden !== true && panel.querySelector('[data-directive-runtime-body="true"]'));
  }, null, { timeout: TIMEOUT_MS });
  return openedWith;
}

async function openCampaignChat(page, saveId, expectedChatId = '') {
  return page.evaluate(async ({ modulePath, saveId: id, expectedChatId: chatId }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const summarizeView = (view) => {
      if (!view || typeof view !== 'object') return null;
      return {
        activeSaveId: view.activeSaveId || null,
        loadedSaveId: view.loadedSave?.saveId || null,
        loadedStatus: view.loadedSave?.status || null,
        currentChat: clone(view.currentChat || null),
        currentChatCampaignGuard: clone(view.currentChatCampaignGuard || null),
        binding: clone(view.chatNative?.binding || view.loadedChatNative?.binding || view.campaignState?.campaignChatBinding || null),
        campaign: view.campaignState?.campaign ? {
          id: view.campaignState.campaign.id || null,
          status: view.campaignState.campaign.status || null
        } : null,
        runtimeRevision: view.campaignState?.runtimeTracking?.revision || null,
        promptContextRevision: view.campaignState?.campaignChatBinding?.promptContextRevision || null
      };
    };
    const summarizeLoadResult = (result) => {
      if (!result || typeof result !== 'object') return clone(result || null);
      if (result.ok === false && result.error) return clone(result);
      return summarizeView(result);
    };
    const summarizeOpenResult = (result) => {
      if (!result || typeof result !== 'object') return clone(result || null);
      return {
        ok: result.ok !== false,
        binding: clone(result.binding || null),
        openSync: result.openSync ? {
          opened: result.openSync.opened === true,
          metadataUpdated: result.openSync.metadataUpdated === true,
          reason: result.openSync.reason || null,
          binding: clone(result.openSync.binding || null)
        } : null,
        chatChange: result.chatChange ? {
          active: result.chatChange.active === true,
          reason: result.chatChange.reason || null,
          handled: result.chatChange.handled === true
        } : null,
        view: summarizeView(result.view)
      };
    };
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    if (!app?.openCampaignChat) return { ok: false, reason: 'openCampaignChat-unavailable' };
    const loadResult = app.loadGame ? await app.loadGame({ saveId: id }).catch((error) => ({
      ok: false,
      error: { message: error?.message || String(error) }
    })) : null;
    const openResult = await app.openCampaignChat({ saveId: id });
    if (openResult?.ok === false && app.loadGame) {
      await app.loadGame({ saveId: id }).catch(() => null);
    }
    const view = app.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const currentChatId = host?.chat?.getCurrentChatId?.() || globalThis.SillyTavern?.getContext?.()?.chatId || null;
    const runtimeLoaded = view?.campaignState?.campaignChatBinding?.saveId === id;
    const activeSaveLoaded = view?.activeSaveId === id || view?.loadedSave?.saveId === id;
    return {
      ok: runtimeLoaded && activeSaveLoaded && openResult?.ok !== false,
      runtimeOnly: openResult?.ok === false && runtimeLoaded && activeSaveLoaded,
      loadResult: summarizeLoadResult(loadResult),
      openResult: summarizeOpenResult(openResult),
      expectedChatId: chatId || null,
      currentChatId,
      expectedChatMatches: chatId ? [currentChatId, view?.chatNative?.binding?.chatId].includes(chatId) : null,
      campaignId: view?.campaignState?.campaign?.id || null,
      saveId: view?.campaignState?.campaignChatBinding?.saveId || id,
      activeSaveId: view?.activeSaveId || null,
      loadedSaveId: view?.loadedSave?.saveId || null,
      binding: clone(view?.chatNative?.binding || null)
    };
  }, {
    modulePath: bridgeModulePath(),
    saveId,
    expectedChatId
  });
}

async function exportActiveSave(page) {
  return page.evaluate(async ({ modulePath }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.exportActiveSave) return { ok: false, reason: 'exportActiveSave-unavailable' };
    const result = await app.exportActiveSave();
    const saveRecord = result?.saveRecord || result?.save || null;
    const state = result?.campaignState
      || result?.state
      || result?.payload?.campaignState
      || result?.export?.campaignState
      || saveRecord?.payload?.campaignState
      || saveRecord?.campaignState
      || null;
    return {
      ok: result?.ok !== false,
      saveId: result?.saveId || saveRecord?.id || state?.campaignChatBinding?.saveId || null,
      revision: result?.revision ?? state?.runtimeTracking?.revision ?? null,
      saveRecordId: saveRecord?.id || null,
      campaignState: clone(state),
      metadata: clone(saveRecord?.metadata || null)
    };
  }, { modulePath: bridgeModulePath() });
}

async function saveAsBranch(page) {
  return page.evaluate(async ({ modulePath, name }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.saveCurrentGameAs) return { ok: false, reason: 'saveCurrentGameAs-unavailable' };
    const before = app.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const result = await app.saveCurrentGameAs({ name });
    const view = result?.view || (app.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null);
    const state = view?.campaignState || {};
    return {
      ok: result?.ok === true,
      blocked: result?.blocked === true,
      reason: result?.reason || result?.saveGuard?.reason || null,
      saveGuard: clone(result?.saveGuard || null),
      previousSaveId: before?.campaignState?.campaignChatBinding?.saveId || null,
      saveId: result?.save?.id || state.campaignChatBinding?.saveId || null,
      branchSaveId: result?.branchSave?.id || null,
      binding: clone(state.campaignChatBinding || null),
      revision: state.runtimeTracking?.revision || null,
      campaignId: state.campaign?.id || null
    };
  }, {
    modulePath: bridgeModulePath(),
    name: `Command Bearing ${FIXTURE_CLOSURE_TYPE} Closure Fixture ${new Date().toISOString()}`
  });
}

async function runLiveReview(page, branchState) {
  return page.evaluate(async ({ extensionPath, branchState: inputState, fixtureClosureType, fixtureTargetId }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const compact = (value, max = 700) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3))}...`;
    };
    const asArray = (value) => Array.isArray(value) ? value : [];
    const id = (value) => String(value || '').trim();
    const terminalQuestClosureType = (quest = {}) => {
      const questId = id(quest.id || quest.templateId);
      const kind = String(quest.kind || '').trim().toLowerCase();
      if (kind === 'chapter' || /^chapter[-.]/i.test(questId) || /^chapter[-.]/i.test(id(quest.templateId))) return 'chapter';
      return 'quest';
    };
    const chooseEvidence = (state, preferred = {}) => {
      const records = asArray(state.commandBearing?.evidenceLedger?.records)
        .filter((record) => record?.visible !== false && String(record?.status || 'open') === 'open');
      return records.sort((a, b) => {
        const score = (record) => (
          (record.primarySignal === 'resolve' ? 100 : 0)
          + (record.strength === 'strong' ? 40 : record.strength === 'moderate' ? 20 : 0)
          + (preferred.arcId && record.arcId === preferred.arcId ? 50 : 0)
          + (preferred.questId && record.questId === preferred.questId ? 45 : 0)
          + (preferred.chapterId && record.chapterId === preferred.chapterId ? 45 : 0)
          + (record.sourceOutcomeId ? 5 : 0)
        );
        return score(b) - score(a);
      })[0] || null;
    };
    const completeQuestClosure = (state, previousState, now) => {
      const evidence = chooseEvidence(state);
      if (!evidence) return { ok: false, reason: 'no-open-command-bearing-evidence' };
      const questId = fixtureTargetId
        || state.attentionState?.foregroundQuestId
        || state.questLedger?.foregroundQuestId
        || evidence.questId
        || state.mission?.activeMissionId
        || null;
      const quest = asArray(state.questLedger?.instances).find((item) => item?.id === questId)
        || asArray(state.questLedger?.instances).find((item) => item?.status === 'active')
        || null;
      if (!quest?.id) return { ok: false, reason: 'no-closable-quest', evidence: clone(evidence) };
      const closureType = terminalQuestClosureType(quest);
      if (fixtureClosureType === 'chapter' && closureType !== 'chapter') {
        return { ok: false, reason: 'target-is-not-chapter', evidence: clone(evidence), quest: clone(quest) };
      }
      const questIndex = state.questLedger.instances.findIndex((item) => item?.id === quest.id);
      const sourceOutcomeId = evidence.sourceOutcomeId || `outcome.command-bearing-fixture.${Date.now()}`;
      state.questLedger.instances[questIndex] = {
        ...state.questLedger.instances[questIndex],
        status: 'resolved',
        resolvedAt: now,
        outcomeId: sourceOutcomeId,
        outcomeKey: 'command-bearing-fixture-closure',
        history: [
          ...(state.questLedger.instances[questIndex].history || []),
          {
            type: 'quest-resolved',
            status: 'resolved',
            at: now,
            sourceOutcomeId,
            reason: 'command-bearing-live-fixture'
          }
        ],
        metadata: {
          ...(state.questLedger.instances[questIndex].metadata || {}),
          commandBearingFixture: true
        }
      };
      return {
        ok: true,
        evidence,
        target: clone(state.questLedger.instances[questIndex]),
        quest: clone(state.questLedger.instances[questIndex]),
        closureTypes: [closureType],
        domain: 'questLedger'
      };
    };
    const completeMilestoneClosure = (state, previousState, now) => {
      const milestones = asArray(state.storyArcLedger?.milestones);
      const milestone = milestones.find((item) => item?.id === fixtureTargetId)
        || milestones.find((item) => String(item?.status || '') !== 'complete')
        || null;
      if (!milestone?.id) return { ok: false, reason: 'no-closable-milestone' };
      const evidence = chooseEvidence(state, { arcId: milestone.arcId });
      if (!evidence) return { ok: false, reason: 'no-open-command-bearing-evidence', milestone: clone(milestone) };
      const milestoneIndex = milestones.findIndex((item) => item?.id === milestone.id);
      const sourceOutcomeId = evidence.sourceOutcomeId || `outcome.command-bearing-fixture.${Date.now()}`;
      state.storyArcLedger.milestones[milestoneIndex] = {
        ...state.storyArcLedger.milestones[milestoneIndex],
        status: 'complete',
        completedAt: now,
        outcomeId: sourceOutcomeId,
        sourceOutcomeId,
        sourceOutcomeIds: [...new Set([...(state.storyArcLedger.milestones[milestoneIndex].sourceOutcomeIds || []), sourceOutcomeId].filter(Boolean))],
        history: [
          ...(state.storyArcLedger.milestones[milestoneIndex].history || []),
          {
            type: 'milestone-complete',
            status: 'complete',
            at: now,
            sourceOutcomeId,
            reason: 'command-bearing-live-fixture'
          }
        ],
        metadata: {
          ...(state.storyArcLedger.milestones[milestoneIndex].metadata || {}),
          commandBearingFixture: true
        }
      };
      return {
        ok: true,
        evidence,
        target: clone(state.storyArcLedger.milestones[milestoneIndex]),
        milestone: clone(state.storyArcLedger.milestones[milestoneIndex]),
        closureTypes: ['milestone'],
        domain: 'storyArcLedger'
      };
    };
    const completeStoryArcClosure = (state, previousState, now) => {
      const arcs = asArray(state.storyArcLedger?.arcs);
      const arc = arcs.find((item) => item?.id === fixtureTargetId)
        || arcs.find((item) => ['active', 'available'].includes(String(item?.status || '')))
        || null;
      if (!arc?.id) return { ok: false, reason: 'no-closable-story-arc' };
      const evidence = chooseEvidence(state, { arcId: arc.id });
      if (!evidence) return { ok: false, reason: 'no-open-command-bearing-evidence', arc: clone(arc) };
      const arcIndex = arcs.findIndex((item) => item?.id === arc.id);
      const sourceOutcomeId = evidence.sourceOutcomeId || `outcome.command-bearing-fixture.${Date.now()}`;
      state.storyArcLedger.arcs[arcIndex] = {
        ...state.storyArcLedger.arcs[arcIndex],
        status: 'complete',
        completedAt: now,
        outcomeId: sourceOutcomeId,
        sourceOutcomeId,
        sourceOutcomeIds: [...new Set([...(state.storyArcLedger.arcs[arcIndex].sourceOutcomeIds || []), sourceOutcomeId].filter(Boolean))],
        history: [
          ...(state.storyArcLedger.arcs[arcIndex].history || []),
          {
            type: 'story-arc-complete',
            status: 'complete',
            at: now,
            sourceOutcomeId,
            reason: 'command-bearing-live-fixture'
          }
        ],
        metadata: {
          ...(state.storyArcLedger.arcs[arcIndex].metadata || {}),
          commandBearingFixture: true
        }
      };
      return {
        ok: true,
        evidence,
        target: clone(state.storyArcLedger.arcs[arcIndex]),
        arc: clone(state.storyArcLedger.arcs[arcIndex]),
        closureTypes: ['storyArc'],
        domain: 'storyArcLedger'
      };
    };
    const mod = await import(`${extensionPath}/src/hosts/sillytavern/runtime-bridge.mjs`);
    const { createGenerationRouter } = await import(`${extensionPath}/src/generation/generation-router.mjs`);
    const { runCommandBearingClosureReviews } = await import(`${extensionPath}/src/command/command-bearing-review.mjs`);
    const { planCommandBearingStateClosureReviews } = await import(`${extensionPath}/src/command/command-bearing.mjs`);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const generationClient = bridge.host?.generation || null;
    if (!generationClient?.generate) return { ok: false, reason: 'generation-client-unavailable' };

    const previousState = clone(inputState);
    const currentState = clone(inputState);
    const now = new Date().toISOString();
    const closureMutation = fixtureClosureType === 'milestone'
      ? completeMilestoneClosure(currentState, previousState, now)
      : fixtureClosureType === 'storyArc'
        ? completeStoryArcClosure(currentState, previousState, now)
        : completeQuestClosure(currentState, previousState, now);
    if (!closureMutation.ok) return closureMutation;
    const evidence = closureMutation.evidence;

    const closureSignals = {
      possibleClosure: true,
      confidence: 'high',
      closureTypes: closureMutation.closureTypes,
      playerFacingReason: `${closureMutation.target?.title || closureMutation.target?.id} reached an explicit fixture-backed stopping point for Command Bearing review.`
    };
    const reviewPlan = planCommandBearingStateClosureReviews({
      commandBearing: currentState.commandBearing || currentState.commandBearing,
      previousState,
      currentState,
      closureSignals
    });
    if (!reviewPlan.reviewQueue?.length) {
      return {
        ok: false,
        reason: 'review-queue-empty',
        evidence: clone(evidence),
        target: clone(closureMutation.target),
        quest: clone(closureMutation.quest || null),
        milestone: clone(closureMutation.milestone || null),
        arc: clone(closureMutation.arc || null),
        reviewPlan: clone(reviewPlan)
      };
    }

    const modelCalls = [];
    const generationRouter = createGenerationRouter({
      generationClient,
      now: () => new Date().toISOString(),
      onModelCall: (event) => modelCalls.push(clone(event))
    });
    const review = await runCommandBearingClosureReviews({
      generationRouter,
      campaignState: currentState,
      reviewQueue: reviewPlan.reviewQueue,
      maxReviews: 1
    });
    return {
      ok: review.records?.length > 0,
      reason: review.records?.length > 0 ? null : 'no-accepted-review-records',
      previousState,
      closureState: currentState,
      evidence: clone(evidence),
      target: clone(closureMutation.target),
      quest: clone(closureMutation.quest || null),
      milestone: clone(closureMutation.milestone || null),
      arc: clone(closureMutation.arc || null),
      fixtureClosureType,
      fixtureTargetId,
      closureDomain: closureMutation.domain,
      closure: clone(reviewPlan.reviewQueue[0] || null),
      reviewPlan: clone(reviewPlan),
      review: clone(review),
      modelCalls: clone(modelCalls),
      promptExcerpt: compact(review.results?.[0]?.diagnostics?.parser?.raw || '', 700)
    };
  }, {
    extensionPath: EXTENSION_PATH,
    branchState,
    fixtureClosureType: FIXTURE_CLOSURE_TYPE,
    fixtureTargetId: FIXTURE_TARGET_ID
  });
}

async function reloadAndVerify(page, saveId, expected) {
  return page.evaluate(async ({ modulePath, saveId: id, expected }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.loadGame) return { ok: false, reason: 'loadGame-unavailable' };
    await app.loadGame({ saveId: id });
    await app.openCampaignChat?.({ saveId: id }).catch(() => null);
    const view = app.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const state = view?.campaignState || {};
    const bearing = state.commandBearing || {};
    const reviewRecords = bearing.reviewLedger?.records || [];
    const review = reviewRecords.find((record) => record.closureId === expected.closureId) || null;
    return {
      ok: Boolean(review)
        && state.campaignChatBinding?.saveId === id
        && bearing.reviewLedger?.reviewedClosureIds?.[expected.closureId] === true,
      saveId: state.campaignChatBinding?.saveId || null,
      campaignId: state.campaign?.id || null,
      runtimeRevision: state.runtimeTracking?.revision || null,
      mechanicsRevision: state.runtimeTracking?.mechanicsRevision || null,
      review: clone(review),
      reviewedClosure: bearing.reviewLedger?.reviewedClosureIds?.[expected.closureId] === true,
      counts: {
        evidence: bearing.evidenceLedger?.records?.length || 0,
        reviews: reviewRecords.length,
        resolveMarks: bearing.tracks?.resolve?.marks || 0,
        inspirationMarks: bearing.tracks?.inspiration?.marks || 0,
        resolvePoints: bearing.tracks?.resolve?.points || 0,
        inspirationPoints: bearing.tracks?.inspiration?.points || 0
      }
    };
  }, {
    modulePath: bridgeModulePath(),
    saveId,
    expected
  });
}

function failReport(error, partial = {}) {
  return {
    ok: false,
    status: 'fail',
    runId: RUN_ID,
    timestamp: new Date().toISOString(),
    driver: 'playwright',
    stUser: ST_USER,
    defaultUserTouched: false,
    error: {
      name: error?.name || 'Error',
      message: error?.message || String(error),
      details: cloneJson(error?.details || null),
      stack: process.env.DIRECTIVE_DEBUG_STACKS === '1' ? String(error?.stack || '') : null
    },
    ...partial
  };
}

async function main() {
  ensureDirectory(ARTIFACT_DIR);
  assertLive(ST_USER, 'DIRECTIVE_SILLYTAVERN_USER is required.');
  assertLive(ST_USER !== 'default-user', 'default-user is reserved for human testing and cannot run soak automation.');
  assertLive(RESUME_SAVE_ID, 'DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID is required.');
  assertLive(WRITE_CONFIRMED, 'Set DIRECTIVE_COMMAND_BEARING_FIXTURE_WRITE_SAVE=1 to allow writing the isolated branch save.');

  const launched = await launchPlaywrightBrowser({ headless: HEADLESS, timeoutMs: TIMEOUT_MS });
  assertLive(launched.ok, 'Could not launch Playwright Chromium.', launched);
  const browser = launched.browser;
  let page = null;
  let served = null;
  try {
    const created = await createAuthenticatedPage(browser);
    page = created.page;
    served = await compareServedExtension({
      baseUrl: BASE_URL,
      extensionPath: EXTENSION_PATH,
      localRoot: process.cwd(),
      files: SERVED_FILES,
      headers: created.auth?.headers || {},
      timeoutMs: 20000
    });
    writeJsonFile(path.join(ARTIFACT_DIR, 'served-extension-compare.json'), served);
    assertLive(served.ok, 'Served Directive extension is not synced with the current checkout.', served);

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    const session = await verifyBrowserUserSession(page);
    const openedPanel = await openDirectivePanel(page);
    const opened = await openCampaignChat(page, RESUME_SAVE_ID, RESUME_CHAT_ID);
    assertLive(opened.ok, 'Could not open the Agent C campaign chat.', opened);
    if (RESUME_CHAT_ID) assertLive(opened.expectedChatMatches !== false, 'Opened chat did not match expected Agent C chat.', opened);

    const branch = await saveAsBranch(page);
    assertLive(branch.ok && branch.saveId && branch.saveId !== RESUME_SAVE_ID, 'Could not create isolated Command Bearing fixture save branch.', branch);
    const branchSaveId = branch.saveId;
    const exported = await exportActiveSave(page);
    assertLive(exported.ok && exported.campaignState?.campaignChatBinding?.saveId === branchSaveId, 'Branch export did not return the active branch state.', exported);
    const branchState = initializeCampaignRuntimeTracking(exported.campaignState);
    const beforeCounts = commandBearingCounts(branchState);

    const reviewRun = await runLiveReview(page, branchState);
    writeJsonFile(path.join(ARTIFACT_DIR, 'live-review-run.json'), {
      ...cloneJson(reviewRun),
      previousState: undefined,
      closureState: undefined
    });
    assertLive(reviewRun.ok, 'Live Command Bearing evaluator did not return an accepted review record.', reviewRun);

    let reviewedState = commitCommandBearingReviewRecords(reviewRun.closureState, reviewRun.review.records);
    const closureType = reviewRun.closure?.closureType || FIXTURE_CLOSURE_TYPE || 'quest';
    const closureDomain = reviewRun.closureDomain || (['storyArc', 'milestone'].includes(closureType) ? 'storyArcLedger' : 'questLedger');
    const closureSummary = `Fixture-backed live Command Bearing ${closureType} closure review committed to isolated save branch.`;
    reviewedState = commitTrackedCampaignState({
      campaignState: branchState,
      nextCampaignState: reviewedState,
      delta: {
        source: 'liveCommandBearingClosureFixture',
        reason: closureSummary,
        summary: closureSummary,
        domains: [closureDomain, 'commandBearing', 'commandBearing'],
        outcomeId: reviewRun.evidence?.sourceOutcomeId || null,
        metadata: {
          runId: RUN_ID,
          branchSaveId,
          closureId: reviewRun.closure?.closureId || null,
          closureType,
          fixtureTargetId: FIXTURE_TARGET_ID || null,
          evidenceId: reviewRun.evidence?.id || null,
          fixtureBacked: true
        }
      },
      now: new Date().toISOString()
    });
    const fixtureModelCallCount = Array.isArray(reviewRun.modelCalls) ? reviewRun.modelCalls.length : 0;
    if (fixtureModelCallCount > 0) {
      reviewedState = initializeCampaignRuntimeTracking(reviewedState);
      const priorSequence = Number(reviewedState.runtimeResume?.modelCallEventSequence || 0);
      reviewedState.runtimeResume = {
        ...(reviewedState.runtimeResume || {}),
        kind: reviewedState.runtimeResume?.kind || 'directive.runtimeResumeCursor.v1',
        modelCallEventSequence: priorSequence + fixtureModelCallCount
      };
    }

    const { filePath, record: branchRecord } = readSaveRecord(branchSaveId);
    const timestamp = new Date().toISOString();
    const updatedRecord = updateSaveRecordWithState(
      branchRecord,
      reviewedState,
      timestamp,
      `Fixture-backed Command Bearing ${closureType} closure review applied on isolated branch.`
    );
    const writtenPath = writeSaveRecord(branchSaveId, updatedRecord);
    assertLive(writtenPath === filePath, 'Save record was written to an unexpected path.', { writtenPath, filePath });

    const persisted = await reloadAndVerify(page, branchSaveId, {
      closureId: reviewRun.closure?.closureId
    });
    writeJsonFile(path.join(ARTIFACT_DIR, 'persisted-verification.json'), persisted);
    assertLive(persisted.ok, 'Reloaded branch did not expose the committed Command Bearing review.', persisted);

    const afterCounts = commandBearingCounts(reviewedState);
    const report = {
      ok: true,
      status: 'pass',
      runId: RUN_ID,
      timestamp,
      driver: 'playwright',
      stUser: ST_USER,
      defaultUserTouched: false,
      modelCallPolicy: 'unlimited-live-model-calls-allowed',
      fixtureBacked: true,
      fixture: {
        requestedClosureType: FIXTURE_CLOSURE_TYPE,
        requestedTargetId: FIXTURE_TARGET_ID || null
      },
      isolation: {
        sourceSaveId: RESUME_SAVE_ID,
        branchSaveId,
        sourceChatId: RESUME_CHAT_ID || null,
        branchWritePath: writtenPath
      },
      browser: {
        openedPanel,
        sessionHandle: session?.handle || null,
        openedCampaign: opened
      },
      servedExtension: {
        ok: served.ok,
        comparedFiles: served.compared.map((entry) => entry.relativePath),
        mismatchCount: served.mismatchCount
      },
      closure: {
        closureId: reviewRun.closure?.closureId || null,
        closureType: reviewRun.closure?.closureType || null,
        source: reviewRun.closure?.source || null,
        evidenceIds: reviewRun.closure?.evidenceIds || [],
        evidence: {
          id: reviewRun.evidence?.id || null,
          primarySignal: reviewRun.evidence?.primarySignal || null,
          strength: reviewRun.evidence?.strength || null,
          sourceOutcomeId: reviewRun.evidence?.sourceOutcomeId || null,
          actionSummary: reviewRun.evidence?.actionSummary || null,
          playerFacingSummary: reviewRun.evidence?.playerFacingSummary || null
        },
        target: reviewRun.target ? {
          id: reviewRun.target.id || null,
          title: reviewRun.target.title || null,
          status: reviewRun.target.status || null,
          outcomeId: reviewRun.target.outcomeId || null,
          arcId: reviewRun.target.arcId || null
        } : null,
        quest: {
          id: reviewRun.quest?.id || null,
          title: reviewRun.quest?.title || null,
          status: reviewRun.quest?.status || null,
          outcomeId: reviewRun.quest?.outcomeId || null
        }
      },
      reviewPlan: {
        closureCandidates: reviewRun.reviewPlan?.closureCandidates?.length || 0,
        reviewQueue: reviewRun.reviewPlan?.reviewQueue || [],
        diagnostics: reviewRun.reviewPlan?.diagnostics || []
      },
      review: {
        records: reviewRun.review?.records || [],
        results: reviewRun.review?.results || []
      },
      counts: {
        before: beforeCounts,
        after: afterCounts,
        persisted: persisted.counts
      },
      artifacts: {
        report: path.join(ARTIFACT_DIR, 'report.json'),
        servedExtension: path.join(ARTIFACT_DIR, 'served-extension-compare.json'),
        liveReviewRun: path.join(ARTIFACT_DIR, 'live-review-run.json'),
        persistedVerification: path.join(ARTIFACT_DIR, 'persisted-verification.json')
      }
    };
    writeJsonFile(path.join(ARTIFACT_DIR, 'report.json'), report);
    appendSummary(report);
    appendJsonLine(LIVE_LOG_PATH, {
      timestamp,
      runId: RUN_ID,
      worker: 'C',
      stUser: ST_USER,
      lane: 'end-conditions-command-bearing',
      kind: 'command-bearing-closure-fixture-live',
      status: 'fixture-pass',
      saveId: branchSaveId,
      sourceSaveId: RESUME_SAVE_ID,
      chatId: RESUME_CHAT_ID || opened.currentChatId || null,
      artifact: path.relative(process.cwd(), path.join(ARTIFACT_DIR, 'report.json')).replace(/\\/g, '/'),
      closureId: report.closure.closureId,
      evidenceIds: report.closure.evidenceIds,
      reviewRecordCount: report.review.records.length,
      markAwarded: report.review.records.some((record) => record.markAwarded === true),
      awardedTracks: [...new Set(report.review.records.map((record) => record.awardedTrack).filter(Boolean))],
      counts: report.counts.after,
      summary: `Fixture-backed live branch created a durable ${report.closure.closureType || 'closure'} candidate, ran the real Command Bearing evaluator through SillyTavern, committed accepted review records, and reloaded the branch to verify persistence.`
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const report = failReport(error);
    writeJsonFile(path.join(ARTIFACT_DIR, 'report.json'), report);
    appendSummary(report);
    appendJsonLine(LIVE_LOG_PATH, {
      timestamp: report.timestamp,
      runId: RUN_ID,
      worker: 'C',
      stUser: ST_USER,
      lane: 'end-conditions-command-bearing',
      kind: 'command-bearing-closure-fixture-live',
      status: 'fail',
      artifact: path.relative(process.cwd(), path.join(ARTIFACT_DIR, 'report.json')).replace(/\\/g, '/'),
      summary: report.error.message
    });
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    await page?.context?.().close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

main().catch((error) => {
  const report = failReport(error);
  ensureDirectory(ARTIFACT_DIR);
  writeJsonFile(path.join(ARTIFACT_DIR, 'report.json'), report);
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
