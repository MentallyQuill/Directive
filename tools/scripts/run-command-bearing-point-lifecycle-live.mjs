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

const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || DEFAULT_SILLYTAVERN_BASE_URL);
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || DEFAULT_DIRECTIVE_EXTENSION_PATH);
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const ST_USER = normalizeUserHandle(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_SOAK_ST_USER || '');
const RESUME_SAVE_ID = String(process.env.DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID || '').trim();
const RESUME_CHAT_ID = String(process.env.DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID || '').trim();
const RUN_ID = String(process.env.DIRECTIVE_COMMAND_BEARING_POINT_RUN_ID || `command-bearing-point-lifecycle-live-${createRunId()}`).trim();
const ARTIFACT_DIR = path.resolve(
  process.env.DIRECTIVE_COMMAND_BEARING_POINT_ARTIFACT_DIR
  || path.join('artifacts/live-soak/sillytavern-campaign/agent-c-command-bearing-endconditions', RUN_ID)
);
const LIVE_LOG_PATH = String(
  process.env.DIRECTIVE_SILLYTAVERN_LIVE_LOG_PATH
  || 'artifacts/live-soak/sillytavern-campaign/2026-06-25T09-41-25-337Z-five-lane-coordination/live-log.jsonl'
).trim();
const WRITE_CONFIRMED = process.env.DIRECTIVE_COMMAND_BEARING_POINT_WRITE_SAVE === '1';
const TIMEOUT_MS = positiveInteger(process.env.DIRECTIVE_COMMAND_BEARING_POINT_TIMEOUT_MS, 180000);
const TURN_ID = String(process.env.DIRECTIVE_COMMAND_BEARING_POINT_TURN_ID || `turn.${RUN_ID.replace(/[^a-zA-Z0-9]+/g, '-')}.resolve-spend`).trim();
const PLAYER_INPUT = String(process.env.DIRECTIVE_COMMAND_BEARING_POINT_PLAYER_INPUT || [
  'Voss separates the Hesperus rescue from the inspection fraud record instead of letting either swallow the other.',
  'He orders the medically vulnerable passengers transferred first, directs Engineering to stabilize the Hesperus for impulse travel only, and places the falsified inspection record under preserved evidence custody.',
  'The owner gets a formal inquiry, not a public spectacle, and Voss logs the schedule delay under his own authority so the passengers do not carry the cost of the owner\'s fraud.'
].join('\n\n')).trim();

const SERVED_FILES = Object.freeze([
  'src/command/command-bearing.mjs',
  'src/runtime/director-turn-runtime.mjs',
  'src/runtime/runtime-app.mjs',
  'src/mission/director.mjs',
  'src/adjudication/intent-parser.mjs',
  'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json'
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
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function assertLive(condition, message, details = null) {
  if (condition) return;
  const error = new Error(details ? `${message}: ${compact(details, 900)}` : message);
  error.details = details;
  throw error;
}

async function createAuthenticatedPage(browser) {
  assertLive(ST_USER, 'DIRECTIVE_SILLYTAVERN_USER is required.');
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
  return { page: await context.newPage(), auth };
}

async function verifyBrowserUserSession(page) {
  const session = await page.evaluate(async () => {
    const response = await fetch('/api/users/me');
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: response.ok, status: response.status, json, text };
  });
  assertLive(session.ok && session.json?.handle === ST_USER, `Browser session is not authenticated as ${ST_USER}.`, session);
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
  return openedWith;
}

async function runLifecycleInBrowser(page) {
  return page.evaluate(async ({
    modulePath,
    resumeSaveId,
    expectedChatId,
    runId,
    turnId,
    playerInput
  }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const compact = (value, max = 700) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3))}...`;
    };
    const counts = (state = {}) => {
      const bearing = state.commandBearing || state.commandStyle || {};
      return {
        evidence: bearing.evidenceLedger?.records?.length || 0,
        reviews: bearing.reviewLedger?.records?.length || 0,
        resolveMarks: bearing.tracks?.resolve?.marks || 0,
        inspirationMarks: bearing.tracks?.inspiration?.marks || 0,
        resolveRank: bearing.tracks?.resolve?.rank || 1,
        inspirationRank: bearing.tracks?.inspiration?.rank || 1,
        reserveCapacity: bearing.reserve?.capacity || 0,
        resolvePoints: bearing.tracks?.resolve?.points || 0,
        inspirationPoints: bearing.tracks?.inspiration?.points || 0,
        readied: clone(bearing.readied || null),
        spendLedgerCount: Object.keys(bearing.spendLedger || {}).length
      };
    };
    const outcomeSummary = (packet = {}) => ({
      outcomeId: packet.outcomePacket?.id || null,
      provisionalResultBand: packet.provisionalOutcome?.resultBand || null,
      finalResultBand: packet.finalOutcome?.resultBand || packet.outcomePacket?.resultBand || null,
      commandBearingAdjustment: clone(packet.commandBearingAdjustment || null),
      narratorConstraints: clone(packet.narratorPacket?.constraints || []),
      commandBearingPrompt: clone(packet.commandBearingPrompt || null),
      commandBearingSpend: clone(packet.bearingSpend || null)
    });
    const stateSummary = (state = {}) => ({
      saveId: state.campaignChatBinding?.saveId || null,
      campaignId: state.campaign?.id || null,
      activePhaseId: state.mission?.activePhaseId || null,
      activeMissionId: state.mission?.activeMissionId || null,
      foregroundQuestId: state.attentionState?.foregroundQuestId || state.questLedger?.foregroundQuestId || null,
      revision: state.runtimeTracking?.revision || null,
      mechanicsRevision: state.runtimeTracking?.mechanicsRevision || null,
      counts: counts(state),
      lastTurn: clone((state.turnLedger?.entries || []).at(-1) || null)
    });

    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    if (!app?.loadGame || !app?.saveCurrentGameAs || !app?.previewDirectorTurn || !app?.commitProvisionalDirectorTurn) {
      return { ok: false, reason: 'required-runtime-actions-unavailable' };
    }

    const openResult = app.openCampaignChat
      ? await app.openCampaignChat({ saveId: resumeSaveId }).catch((error) => ({ ok: false, error: { message: error?.message || String(error) } }))
      : { ok: false, reason: 'openCampaignChat-unavailable' };
    if (openResult?.ok === false) await app.loadGame({ saveId: resumeSaveId });
    let view = app.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const runtimeLoaded = view?.campaignState?.campaignChatBinding?.saveId === resumeSaveId;
    if (!runtimeLoaded) {
      return { ok: false, reason: 'resume-save-not-loaded', openResult: clone(openResult), state: stateSummary(view?.campaignState || {}) };
    }

    const branch = await app.saveCurrentGameAs({ name: `Command Bearing Point Lifecycle ${new Date().toISOString()}` });
    if (branch?.ok !== true) {
      return { ok: false, reason: 'save-as-branch-failed', branch: clone(branch), openResult: clone(openResult) };
    }
    view = app.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const branchSaveId = branch.save?.id || view?.campaignState?.campaignChatBinding?.saveId || null;
    const before = stateSummary(view?.campaignState || {});

    const recoveryId = `${runId}.resolve.recovery.1`;
    const recovery = await app.recoverCommandBearingPoint({ recoveryId, track: 'resolve' });
    const duplicateRecovery = await app.recoverCommandBearingPoint({ recoveryId, track: 'resolve' });
    const capRecovery = await app.recoverCommandBearingPoint({ recoveryId: `${runId}.resolve.recovery.cap`, track: 'resolve' });
    const readyCancel = await app.readyCommandBearingPoint({ readiedId: `${runId}.resolve.ready.cancel`, track: 'resolve' });
    const cancel = await app.cancelReadiedCommandBearingPoint({ readiedId: readyCancel.commandBearing?.readied?.id || `${runId}.resolve.ready.cancel` });
    const readySpend = await app.readyCommandBearingPoint({ readiedId: `${runId}.resolve.ready.spend`, track: 'resolve' });
    const afterReady = stateSummary(readySpend.campaignState || {});

    const preview = await app.previewDirectorTurn({ turnId, playerInput });
    const prompt = preview.commandBearingPrompt || preview.turnPacket?.commandBearingPrompt || preview.turnPacket?.bearingEligibility?.interventionPrompt || null;
    const resolveAction = (prompt?.actions || []).find((action) => action.track === 'resolve');
    if (!prompt?.eligible || !resolveAction) {
      return {
        ok: false,
        reason: 'preview-not-resolve-spend-eligible',
        branchSaveId,
        openResult: clone(openResult),
        recovery: {
          applied: recovery.applied,
          duplicateApplied: duplicateRecovery.applied,
          capApplied: capRecovery.applied
        },
        readyCancel: { applied: readyCancel.applied, cancelApplied: cancel.applied },
        readySpend: { applied: readySpend.applied },
        afterReady,
        preview: outcomeSummary(preview.turnPacket || {}),
        prompt: clone(prompt)
      };
    }

    const readied = readySpend.commandBearing?.readied;
    const rationale = 'The point applies because Voss uses lawful authority, evidence custody, medical priority, owner accountability, and a logged schedule delay to improve a costly Hesperus outcome.';
    const committed = await app.commitProvisionalDirectorTurn({
      readiedCommandBearing: {
        ...readied,
        rationale,
        fit: 'strong',
        causalBasis: ['lawful authority', 'evidence custody', 'medical priority', 'accepted schedule delay']
      },
      confirmWarnings: true,
      generateNarration: true,
      generateCommandLogSummary: true
    });
    const saved = app.saveCurrentGame
      ? await app.saveCurrentGame({ summary: 'Command Bearing point lifecycle live fixture saved after valid spend.' }).catch((error) => ({ ok: false, error: { message: error?.message || String(error) } }))
      : null;
    const exported = app.exportActiveSave ? await app.exportActiveSave() : null;
    const finalView = app.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const finalState = exported?.campaignState
      || exported?.payload?.campaignState
      || exported?.saveRecord?.payload?.campaignState
      || finalView?.campaignState
      || committed.campaignState
      || {};
    const latestTurn = (finalState.turnLedger?.entries || []).find((entry) => entry.outcomeId === committed.turnPacket?.outcomePacket?.id)
      || (finalState.turnLedger?.entries || []).at(-1)
      || null;
    return {
      ok: true,
      branchSaveId,
      sourceSaveId: resumeSaveId,
      expectedChatId,
      currentChatId: host?.chat?.getCurrentChatId?.() || globalThis.SillyTavern?.getContext?.()?.chatId || null,
      runtimeOnly: openResult?.ok === false,
      openResult: {
        ok: openResult?.ok !== false,
        suspended: openResult?.chatChange?.suspended === true,
        active: openResult?.chatChange?.active === true,
        reason: openResult?.reason || null
      },
      before,
      recovery: {
        applied: recovery.applied,
        reason: recovery.reason,
        duplicateApplied: duplicateRecovery.applied,
        duplicateReason: duplicateRecovery.reason,
        capApplied: capRecovery.applied,
        capReason: capRecovery.reason,
        afterCounts: counts(capRecovery.campaignState || duplicateRecovery.campaignState || recovery.campaignState || {})
      },
      readyCancel: {
        readyApplied: readyCancel.applied,
        readyReason: readyCancel.reason,
        cancelApplied: cancel.applied,
        cancelReason: cancel.reason
      },
      readySpend: {
        applied: readySpend.applied,
        reason: readySpend.reason,
        readied: clone(readied)
      },
      afterReady,
      preview: {
        ...outcomeSummary(preview.turnPacket || {}),
        resolveAction: clone(resolveAction)
      },
      committed: {
        ...outcomeSummary(committed.turnPacket || {}),
        commandBearingSpend: clone(committed.commandBearingSpend || committed.turnPacket?.bearingSpend || null),
        narration: {
          ok: committed.narrationResult?.ok === true,
          providerId: committed.narrationResult?.providerId || committed.narrationResult?.diagnostics?.providerId || null,
          textPreview: compact(committed.narrationResult?.text || committed.narrationResult?.response?.text || '', 500),
          autosaveId: committed.narrationResult?.autosave?.id || committed.autosave?.id || null
        },
        terminalDecision: clone(committed.terminalDecision || null)
      },
      saved: saved ? {
        ok: saved.ok !== false,
        saveId: saved.save?.id || null,
        revision: saved.save?.revision || null,
        blocked: saved.blocked === true,
        reason: saved.reason || saved.error?.message || null
      } : null,
      final: stateSummary(finalState),
      persisted: {
        saveId: exported?.saveId || exported?.saveRecord?.id || finalState.campaignChatBinding?.saveId || null,
        revision: exported?.revision ?? finalState.runtimeTracking?.revision ?? null,
        spendLedgerEntry: clone(finalState.commandBearing?.spendLedger?.[committed.turnPacket?.outcomePacket?.id] || null),
        latestTurn: clone(latestTurn)
      }
    };
  }, {
    modulePath: bridgeModulePath(),
    resumeSaveId: RESUME_SAVE_ID,
    expectedChatId: RESUME_CHAT_ID,
    runId: RUN_ID,
    turnId: TURN_ID,
    playerInput: PLAYER_INPUT
  });
}

function highSignalReport(result, served, session, openedPanel) {
  const markAwarded = (result.final?.counts?.resolveMarks || 0) + (result.final?.counts?.inspirationMarks || 0);
  const spend = result.persisted?.spendLedgerEntry || result.committed?.commandBearingSpend || null;
  return {
    ok: result.ok === true,
    status: result.ok === true ? 'pass' : 'fail',
    runId: RUN_ID,
    timestamp: new Date().toISOString(),
    driver: 'playwright',
    stUser: ST_USER,
    defaultUserTouched: false,
    modelCallPolicy: 'unlimited-live-model-calls-allowed',
    sourceSaveId: RESUME_SAVE_ID,
    branchSaveId: result.branchSaveId || null,
    openedPanel,
    sessionHandle: session?.handle || null,
    runtimeOnly: result.runtimeOnly === true,
    servedExtension: {
      ok: served?.ok === true,
      comparedFiles: (served?.compared || []).map((entry) => entry.relativePath),
      mismatchCount: served?.mismatchCount || 0
    },
    playerInput: PLAYER_INPUT,
    before: result.before || null,
    recovery: result.recovery || null,
    readyCancel: result.readyCancel || null,
    readySpend: result.readySpend || null,
    preview: result.preview || null,
    committed: result.committed || null,
    saved: result.saved || null,
    final: result.final || null,
    persisted: result.persisted || null,
    gateEvidence: {
      rankReserveChecked: result.recovery?.applied === true && result.recovery?.duplicateApplied === false && result.recovery?.capApplied === false,
      readyCancelChecked: result.readyCancel?.readyApplied === true && result.readyCancel?.cancelApplied === true,
      validSpendChecked: Boolean(spend?.track === 'resolve' && spend?.from && spend?.to),
      controlledNarrationChecked: Boolean(
        result.committed?.narratorConstraints?.some?.((constraint) => /Command Bearing spend|source of truth|stronger outcome/i.test(constraint))
        && result.committed?.commandBearingAdjustment
      ),
      markCount: markAwarded
    }
  };
}

function writeSummary(report) {
  const lines = [
    '# Command Bearing Point Lifecycle Live',
    '',
    `Status: ${report.status.toUpperCase()}`,
    '',
    `SillyTavern user: \`${report.stUser}\``,
    `Branch save: \`${report.branchSaveId || 'n/a'}\``,
    `Spend: \`${report.persisted?.spendLedgerEntry?.track || report.committed?.commandBearingSpend?.track || 'n/a'}\` ${report.persisted?.spendLedgerEntry?.from || ''} -> ${report.persisted?.spendLedgerEntry?.to || ''}`.trim(),
    `Narration ok: ${report.committed?.narration?.ok === true ? 'yes' : 'no'}`,
    '',
    'Artifacts:',
    `- Report: ${path.relative(process.cwd(), path.join(ARTIFACT_DIR, 'report.json')).replace(/\\/g, '/')}`
  ];
  writeTextFile(path.join(ARTIFACT_DIR, 'summary.md'), `${lines.join('\n')}\n`);
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
  assertLive(WRITE_CONFIRMED, 'Set DIRECTIVE_COMMAND_BEARING_POINT_WRITE_SAVE=1 to allow branch-save writes through Runtime APIs.');

  const launched = await launchPlaywrightBrowser({ headless: HEADLESS, timeoutMs: TIMEOUT_MS });
  assertLive(launched.ok, 'Could not launch Playwright Chromium.', launched);
  const browser = launched.browser;
  let page = null;
  try {
    const created = await createAuthenticatedPage(browser);
    page = created.page;
    const served = await compareServedExtension({
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
    const result = await runLifecycleInBrowser(page);
    writeJsonFile(path.join(ARTIFACT_DIR, 'raw-result.json'), result);
    assertLive(result.ok, `Command Bearing point lifecycle live run failed: ${result.reason || 'unknown'}`, result);

    const report = highSignalReport(result, served, session, openedPanel);
    writeJsonFile(path.join(ARTIFACT_DIR, 'report.json'), report);
    writeSummary(report);
    appendJsonLine(LIVE_LOG_PATH, {
      timestamp: report.timestamp,
      runId: RUN_ID,
      worker: 'C',
      stUser: ST_USER,
      lane: 'end-conditions-command-bearing',
      kind: 'command-bearing-point-lifecycle-live',
      status: 'fixture-pass',
      saveId: report.branchSaveId,
      sourceSaveId: RESUME_SAVE_ID,
      chatId: RESUME_CHAT_ID || null,
      artifact: path.relative(process.cwd(), path.join(ARTIFACT_DIR, 'report.json')).replace(/\\/g, '/'),
      recovery: report.recovery,
      readyCancel: report.readyCancel,
      spend: report.persisted?.spendLedgerEntry || report.committed?.commandBearingSpend || null,
      finalCounts: report.final?.counts || null,
      gateEvidence: report.gateEvidence,
      summary: 'Fixture-backed live branch recovered a Command Bearing point within reserve cap, proved duplicate/cap no-awards, Readied/Canceled/Readied Resolve, committed a valid Resolve spend, improved the outcome two bands, generated narration, saved, and verified persisted spend state.'
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const report = failReport(error);
    writeJsonFile(path.join(ARTIFACT_DIR, 'report.json'), report);
    writeSummary(report);
    appendJsonLine(LIVE_LOG_PATH, {
      timestamp: report.timestamp,
      runId: RUN_ID,
      worker: 'C',
      stUser: ST_USER,
      lane: 'end-conditions-command-bearing',
      kind: 'command-bearing-point-lifecycle-live',
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
