import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  compareServedExtension,
  compact,
  directiveRuntimeSnapshot,
  errorSummary,
  authenticateSillyTavernUser,
  launchPlaywrightBrowser,
  normalizeBaseUrl,
  normalizeExtensionPath,
  positiveInteger,
  waitForSillyTavernIdle
} from './lib/sillytavern-live-harness.mjs';

const args = new Set(process.argv.slice(2));
const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || '');
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || '/scripts/extensions/third-party/Directive');
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const TIMEOUT_MS = positiveInteger(process.env.DIRECTIVE_SILLYTAVERN_TERMINAL_TIMEOUT_MS, 240000);
const BROWSER_TIMEOUT_MS = positiveInteger(process.env.DIRECTIVE_SILLYTAVERN_BROWSER_TIMEOUT_MS, 45000);
const RUN_LIVE_GENERATION = process.env.DIRECTIVE_SILLYTAVERN_GENERATION === '1'
  || process.env.DIRECTIVE_LIVE_GENERATION === '1';
const SKIP_STALE_CHECK = process.env.DIRECTIVE_SILLYTAVERN_SKIP_STALE_CHECK === '1';
const SILLYTAVERN_USER = normalizeUserHandle(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_SOAK_ST_USER || '');
const DRY_RUN = args.has('--dry-run') || args.has('--checklist');
const HELP = args.has('--help') || args.has('-h');
const SCENARIO_FILTER = String(process.env.DIRECTIVE_SILLYTAVERN_TERMINAL_SCENARIO || '').trim();
const TERMINAL_TRIGGER = normalizeTerminalTrigger(process.env.DIRECTIVE_SILLYTAVERN_TERMINAL_TRIGGER || 'catastrophic-command');
const LIVE_ARTIFACT_DIR = String(process.env.DIRECTIVE_SILLYTAVERN_ARTIFACT_DIR || '').trim()
  ? path.resolve(process.cwd(), process.env.DIRECTIVE_SILLYTAVERN_ARTIFACT_DIR)
  : '';
const LIVE_LOG_PATH = String(process.env.DIRECTIVE_SILLYTAVERN_LIVE_LOG_PATH || '').trim()
  ? path.resolve(process.cwd(), process.env.DIRECTIVE_SILLYTAVERN_LIVE_LOG_PATH)
  : (LIVE_ARTIFACT_DIR ? path.join(LIVE_ARTIFACT_DIR, 'live-log.jsonl') : '');
const COMPACT_STDOUT = process.env.DIRECTIVE_SILLYTAVERN_COMPACT_STDOUT === '1';
const ASHES_PACKAGE_ID = 'directive:campaign-package:breckenridge-ashes-of-peace';

const TERMINAL_COMMAND = 'Commander Serrin steps into the center of the bridge and gives the order in a voice cold enough to silence the watch: evacuate the crew into escape pods, abandon ship, and set the Breckenridge to auto-destruct. She frames it as accepting that the campaign objective fails on this timeline.';
const RISK_CONFIRMATION_REPLY = 'Proceed.';
const COMMAND_CONDUCT_LADDER = Object.freeze([
  {
    id: 'public-captain-fight',
    text: 'On the bridge, in front of the watch, Serrin turns from the tactical display and publicly challenges Captain Whitaker. "Captain, with respect, this delay is an abdication dressed up as caution." She keeps her hands visible, gives no operational order, and lets the rebuke hang where every officer can hear it.',
    expectedFlag: 'command-conduct.public-insubordination',
    shouldTriggerTerminalDecision: false
  },
  {
    id: 'impaired-duty',
    text: 'Before the next watch, Serrin takes an unlogged stimulant from a private medkit, enough to make her hands too steady and her thoughts too bright. She reports to the bridge anyway and starts giving course and sensor orders as if no one can tell.',
    expectedFlag: 'command-conduct.impaired-duty',
    shouldTriggerTerminalDecision: false
  },
  {
    id: 'assault-officer',
    text: 'When the operations officer challenges the order, Serrin closes the distance too fast and shoves him back against the console hard enough to stop the objection. "You will execute the order," she says, loud enough for the bridge to hear.',
    expectedFlag: 'command-conduct.assaulted-officer',
    shouldTriggerTerminalDecision: false
  },
  {
    id: 'unhinged-command-usurpation',
    text: 'Serrin orders security to confine any officer who questions her command judgment, tells helm to ignore the captain unless Serrin personally confirms her orders, and demands tactical prepare a firing solution on any vessel that approaches without her clearance.',
    expectedFlag: 'command-conduct.unlawful-command-usurpation',
    shouldTriggerTerminalDecision: true
  }
]);

const SCENARIOS = Object.freeze([
  {
    id: 'save-branch',
    triggerKind: TERMINAL_TRIGGER,
    reply: 'Save as branch',
    expectedAction: 'saveTerminalBranch',
    expectedStatus: 'pending'
  },
  {
    id: 'replay',
    triggerKind: TERMINAL_TRIGGER,
    reply: 'Replay from checkpoint',
    expectedAction: 'replayFromCheckpoint',
    expectedStatus: 'replayed'
  },
  {
    id: 'push-on',
    triggerKind: TERMINAL_TRIGGER,
    reply: 'Push on. There are still survivors and a story to continue.',
    expectedAction: 'pushOn',
    expectedStatus: 'pushedOn'
  },
  {
    id: 'keep-ending',
    triggerKind: TERMINAL_TRIGGER,
    reply: 'Keep this ending',
    expectedAction: 'keepEnding',
    expectedStatus: 'keptEnding'
  }
]);

let smokeUserAuth = null;

function bridgeModulePath() {
  return `${EXTENSION_PATH}/src/hosts/sillytavern/runtime-bridge.mjs`;
}

function normalizeUserHandle(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
}

function normalizeTerminalTrigger(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['command-fitness', 'command-fitness-ladder', 'conduct', 'conduct-ladder'].includes(normalized)) {
    return 'command-fitness-ladder';
  }
  return 'catastrophic-command';
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

function usage() {
  return `SillyTavern terminal endings live smoke

Required:
  $env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
  $env:DIRECTIVE_SILLYTAVERN_GENERATION='1'
  node tools\\scripts\\smoke-sillytavern-terminal-endings-live.mjs

Optional:
  DIRECTIVE_SILLYTAVERN_EXTENSION_PATH=/scripts/extensions/third-party/Directive
  DIRECTIVE_SILLYTAVERN_HEADLESS=0
  DIRECTIVE_SILLYTAVERN_TERMINAL_TIMEOUT_MS=240000
  DIRECTIVE_SILLYTAVERN_SKIP_STALE_CHECK=1
  DIRECTIVE_SILLYTAVERN_USER=directive-soak-c
  DIRECTIVE_SILLYTAVERN_TERMINAL_TRIGGER=catastrophic-command|command-fitness-ladder
  DIRECTIVE_SILLYTAVERN_ARTIFACT_DIR=artifacts/live-soak/end-conditions/run-name
  DIRECTIVE_SILLYTAVERN_COMPACT_STDOUT=1
`;
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

function writeJsonArtifact(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function writeTextArtifact(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, String(value), 'utf8');
  return filePath;
}

function appendLiveLog(entry) {
  if (!LIVE_LOG_PATH) return null;
  ensureDirectory(path.dirname(LIVE_LOG_PATH));
  fs.appendFileSync(LIVE_LOG_PATH, `${JSON.stringify({
    at: new Date().toISOString(),
    ...entry
  })}\n`, 'utf8');
  return LIVE_LOG_PATH;
}

function compactErrorSummary(error, maxDetails = 2400) {
  if (!error) return null;
  const summary = error.name && error.message ? error : errorSummary(error);
  const compacted = {
    name: summary.name || 'Error',
    message: compact(summary.message || String(error), 1200)
  };
  if (summary.stack) {
    compacted.stack = String(summary.stack).split('\n').slice(0, 4).join('\n');
  }
  if (summary.details !== undefined) {
    let detailsText = '';
    try {
      detailsText = JSON.stringify(summary.details);
    } catch {
      detailsText = String(summary.details);
    }
    compacted.detailsPreview = compact(detailsText, maxDetails);
  }
  return compacted;
}

function transcriptMarkdown(transcript, metadata = {}) {
  const lines = [
    '# Directive Terminal Ending Transcript',
    '',
    `Captured: ${transcript.capturedAt || new Date().toISOString()}`,
    `Chat: ${transcript.currentChatId || 'unknown'}`,
    `Scenario: ${metadata.scenarioId || 'unknown'}`,
    `Reason: ${metadata.reason || 'snapshot'}`,
    ''
  ];
  for (const message of transcript.messages || []) {
    const role = message.isUser
      ? 'User'
      : message.directiveOwned
        ? `Directive${message.responseKind ? ` (${message.responseKind})` : ''}`
        : message.isSystem
          ? 'System'
          : 'Assistant';
    lines.push(`## ${String(message.index).padStart(3, '0')} - ${role}`);
    if (message.name) lines.push(`Name: ${message.name}`);
    lines.push('', String(message.text || '').trim() || '[empty]', '');
  }
  return `${lines.join('\n')}\n`;
}

function compactReportSummary(report) {
  return {
    ok: report?.ok === true,
    baseUrl: report?.baseUrl || null,
    extensionPath: report?.extensionPath || null,
    triggerKind: TERMINAL_TRIGGER,
    user: SILLYTAVERN_USER || report?.authenticatedUser?.handle || null,
    driver: report?.driver || null,
    staleCheck: report?.staleCheck || null,
    scenarioCount: Array.isArray(report?.scenarios) ? report.scenarios.length : 0,
    scenarios: (report?.scenarios || []).map((scenario) => ({
      id: scenario.id,
      triggerKind: scenario.triggerKind,
      expectedAction: scenario.expectedAction,
      campaignId: scenario.created?.campaign?.id || null,
      saveId: scenario.created?.binding?.saveId || null,
      chatId: scenario.created?.binding?.chatId || null,
      terminalDecisionId: scenario.terminal?.decisionId || null,
      terminalOutcomeId: scenario.terminal?.terminalOutcomeId || null,
      terminalOutcomeBand: scenario.terminal?.terminalOutcomeBand || null,
      conductLadder: Array.isArray(scenario.terminal?.conductLadder)
        ? scenario.terminal.conductLadder.map((step) => ({
            id: step.id,
            terminalDecisionPresent: step.terminalDecisionPresent,
            commandRemovalFlag: step.commandRemovalFlag,
            playerCommandStatus: step.playerCommandStatus,
            modelCallDelta: step.modelCallDelta
          }))
        : null,
      riskConfirmationHandled: scenario.terminal?.riskConfirmationHandled === true,
      modelCallDelta: scenario.terminal?.modelCallDelta ?? null,
      decisionStatus: scenario.resolved?.decisionStatus || null,
      branchRecordCount: scenario.resolved?.branchRecordCount ?? null,
      continuationFrameCount: scenario.resolved?.continuationFrameCount ?? null,
      conclusionType: scenario.resolved?.conclusionType || null,
      finalCampaignBand: scenario.resolved?.finalCampaignBand || null,
      pendingInteractionCount: scenario.resolved?.pendingInteractionCount ?? null,
      transcripts: scenario.transcripts || null
    })),
    error: compactErrorSummary(report?.error)
  };
}

function writeReportArtifacts(report) {
  if (!LIVE_ARTIFACT_DIR) return null;
  const reportPath = path.join(LIVE_ARTIFACT_DIR, 'report.json');
  const summaryPath = path.join(LIVE_ARTIFACT_DIR, 'report-summary.json');
  writeJsonArtifact(reportPath, report);
  writeJsonArtifact(summaryPath, compactReportSummary(report));
  appendLiveLog({
    kind: 'terminal-report-artifact',
    status: report?.ok === true ? 'pass' : 'fail',
    triggerKind: TERMINAL_TRIGGER,
    scenarioCount: Array.isArray(report?.scenarios) ? report.scenarios.length : 0,
    reportPath,
    summaryPath
  });
  return { reportPath, summaryPath };
}

function checklist() {
  return {
    intendedCoverage: [
      'served Directive extension files match the local workspace before live checks',
      'fresh Ashes campaign creation and bound SillyTavern campaign chat',
      TERMINAL_TRIGGER === 'command-fitness-ladder'
        ? 'real player chat messages escalating public insubordination, impaired bridge duty, officer assault, and unlawful command usurpation without catastrophic shortcut language'
        : 'real player chat message committing a catastrophic Breckenridge self-destruct outcome',
      'Directive-owned committed outcome and terminal checkpoint messages in chat',
      'terminal pending interaction and end-condition ledger decision creation',
      'Save as branch from chat preserves a terminal timeline branch while the decision remains pending',
      'Replay from checkpoint from chat restores the pre-terminal campaign snapshot',
      'Push On from chat applies an authored continuation frame',
      'Keep this ending from chat concludes the campaign through terminal outcome metadata',
      'model-call journal growth during live chat play'
    ],
    triggerKind: TERMINAL_TRIGGER,
    requiresGeneration: true,
    requiresFreshHost: 'SILLYTAVERN_BASE_URL or ST_BASE_URL'
  };
}

function assertLive(condition, message, details = null) {
  if (condition) return;
  const error = new Error(details ? `${message}\n${compact(details, 1800)}` : message);
  if (details) error.details = details;
  throw error;
}

function progress(message, details = null) {
  const suffix = details ? ` ${compact(details, 1200)}` : '';
  console.error(`[terminal-live] ${message}${suffix}`);
}

async function waitForBridge(page) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < BROWSER_TIMEOUT_MS) {
    try {
      const ready = await page.evaluate(async ({ modulePath }) => {
        try {
          const mod = await import(modulePath);
          const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
          if (!bridge.runtimeApp || !bridge.host?.chat) return null;
          return { ok: true };
        } catch {
          return null;
        }
      }, { modulePath: bridgeModulePath() });
      if (ready) return ready;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(Math.min(250, Math.max(0, BROWSER_TIMEOUT_MS - (Date.now() - started))));
  }
  const error = new Error(`Directive runtime bridge did not become ready before ${BROWSER_TIMEOUT_MS}ms.`);
  error.details = {
    timeoutMs: BROWSER_TIMEOUT_MS,
    lastError: lastError ? {
      name: lastError.name || 'Error',
      message: lastError.message || String(lastError)
    } : null
  };
  throw error;
}

async function liveSnapshot(page) {
  const base = await directiveRuntimeSnapshot(page, { extensionPath: EXTENSION_PATH });
  const detail = await page.evaluate(async ({ modulePath }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const messageText = (message) => {
      const value = message?.mes ?? message?.content ?? message?.text ?? '';
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.map((part) => part?.text || '').filter(Boolean).join('\n');
      return String(value || '');
    };
    const compactText = (value, max = 220) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length <= max ? text : `${text.slice(0, max)}...`;
    };
    const directiveMetadata = (message) => message?.extra?.directive || message?.metadata?.directive || null;
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const view = app?.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const state = view?.campaignState || {};
    const tracking = state.runtimeTracking || {};
    const ledger = tracking.endConditionLedger || {};
    const pendingInteractions = (view?.chatNative?.pendingInteractions || tracking.pendingInteractions || [])
      .filter((entry) => entry?.status !== 'resolved');
    const activeTerminalInteraction = pendingInteractions.find((entry) => entry?.kind === 'terminalOutcomeDecision') || null;
    const modelCalls = view?.chatNative?.modelCalls || tracking.modelCallJournal || [];
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const messages = chat.map((message, index) => {
      const metadata = directiveMetadata(message);
      return {
        index,
        isUser: message?.is_user === true || message?.role === 'user',
        isSystem: message?.is_system === true || message?.role === 'system',
        directiveOwned: Boolean(metadata),
        responseKind: metadata?.responseKind || null,
        textPreview: compactText(messageText(message))
      };
    });
    return {
      actionKeys: Object.keys(app || {}).filter((key) => typeof app?.[key] === 'function').sort(),
      ship: clone(state.ship || null),
      player: clone(state.player || null),
      campaign: clone(state.campaign || null),
      flags: clone(state.flags || null),
      conclusion: clone(state.conclusion || null),
      ledger: clone(ledger),
      pendingInteractions: clone(pendingInteractions),
      activeTerminalInteraction: clone(activeTerminalInteraction),
      terminalDecision: activeTerminalInteraction
        ? clone((ledger.decisions || []).find((entry) => entry?.id === activeTerminalInteraction.id) || null)
        : null,
      allTerminalDecisions: clone(ledger.decisions || []),
      modelCalls: clone(modelCalls.map((entry) => ({
        id: entry.id || null,
        roleId: entry.roleId || null,
        status: entry.status || null,
        ok: entry.ok === true,
        providerKind: entry.providerKind || null,
        providerId: entry.providerId || null,
        model: entry.model || null,
        errorCode: entry.errorCode || null
      })).slice(-20)),
      modelCallCount: modelCalls.length,
      tracking: clone(view?.chatNative?.tracking || tracking || null),
      directiveResponseKinds: messages.filter((message) => message.directiveOwned).map((message) => message.responseKind).filter(Boolean),
      recentMessages: messages.slice(-12)
    };
  }, { modulePath: bridgeModulePath() });
  return { ...base, ...detail };
}

async function captureScenarioTranscript(page, scenarioId, reason) {
  if (!LIVE_ARTIFACT_DIR) return null;
  const transcript = await page.evaluate(() => {
    const messageText = (message) => {
      const value = message?.mes ?? message?.content ?? message?.text ?? '';
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.map((part) => part?.text || '').filter(Boolean).join('\n');
      return String(value || '');
    };
    const directiveMetadata = (message) => message?.extra?.directive || message?.metadata?.directive || null;
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chat = Array.isArray(context.chat) ? context.chat : [];
    return {
      capturedAt: new Date().toISOString(),
      currentChatId: context?.chatId || context?.chat_id || null,
      messages: chat.map((message, index) => {
        const metadata = directiveMetadata(message);
        return {
          index,
          name: message?.name || message?.sender || '',
          isUser: message?.is_user === true || message?.role === 'user',
          isSystem: message?.is_system === true || message?.role === 'system',
          directiveOwned: Boolean(metadata),
          responseKind: metadata?.responseKind || null,
          text: messageText(message)
        };
      })
    };
  });
  const safeScenarioId = String(scenarioId || 'scenario').replace(/[^a-z0-9._-]+/gi, '-');
  const safeReason = String(reason || 'snapshot').replace(/[^a-z0-9._-]+/gi, '-');
  const transcriptDir = path.join(LIVE_ARTIFACT_DIR, 'transcripts', safeScenarioId);
  const readableTranscript = path.join(transcriptDir, `${safeReason}.md`);
  const sourceChatTranscript = path.join(transcriptDir, `${safeReason}.jsonl`);
  const transcriptIndex = path.join(transcriptDir, `${safeReason}.index.json`);
  writeTextArtifact(readableTranscript, transcriptMarkdown(transcript, {
    scenarioId,
    reason
  }));
  writeTextArtifact(
    sourceChatTranscript,
    `${(transcript.messages || []).map((message) => JSON.stringify(message)).join('\n')}${transcript.messages?.length ? '\n' : ''}`
  );
  writeJsonArtifact(transcriptIndex, {
    capturedAt: transcript.capturedAt,
    scenarioId,
    reason,
    currentChatId: transcript.currentChatId || null,
    messageCount: transcript.messages?.length || 0,
    readableTranscript,
    sourceChatTranscript
  });
  return {
    reason,
    currentChatId: transcript.currentChatId || null,
    messageCount: transcript.messages?.length || 0,
    readableTranscript,
    sourceChatTranscript,
    transcriptIndex
  };
}

async function waitForSnapshot(page, label, predicate, { timeoutMs = TIMEOUT_MS } = {}) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await liveSnapshot(page);
    if (predicate(last)) return last;
    await page.waitForTimeout(1000);
  }
  throw new Error(`${label} did not become true before timeout.\n${compact(snapshotSummary(last), 2600)}`);
}

function snapshotSummary(snapshot) {
  if (!snapshot) return null;
  return {
    chatLength: snapshot.chatLength,
    userMessageCount: snapshot.userMessageCount,
    directiveMessageCount: snapshot.directiveMessageCount,
    directiveResponseKinds: snapshot.directiveResponseKinds,
    recentMessages: snapshot.recentMessages,
    campaign: {
      id: snapshot.campaign?.id || null,
      status: snapshot.campaign?.status || null,
      finalCampaignBand: snapshot.campaign?.finalCampaignBand || null
    },
    ship: {
      id: snapshot.ship?.id || null,
      name: snapshot.ship?.name || null,
      status: snapshot.ship?.status || null,
      condition: snapshot.ship?.condition || null
    },
    player: {
      id: snapshot.player?.id || null,
      status: snapshot.player?.status || null,
      commandStatus: snapshot.player?.commandStatus || null
    },
    flags: snapshot.flags,
    tracking: {
      ingressCount: snapshot.tracking?.ingressCount ?? null,
      responseCount: snapshot.tracking?.responseCount ?? null,
      modelCallCount: snapshot.tracking?.modelCallCount ?? null,
      pendingInteractionCount: snapshot.tracking?.pendingInteractionCount ?? null
    },
    pendingInteractions: (snapshot.pendingInteractions || []).map((entry) => ({
      id: entry.id || null,
      kind: entry.kind || null,
      status: entry.status || null,
      outcomeId: entry.outcomeId || null,
      turnId: entry.turnId || null,
      metadata: entry.metadata || null
    })),
    endConditionLedger: {
      activeDecisionId: snapshot.ledger?.activeDecisionId || null,
      detections: snapshot.ledger?.detections || [],
      decisions: snapshot.ledger?.decisions || [],
      branchRecords: snapshot.ledger?.branchRecords || [],
      continuationFrames: snapshot.ledger?.continuationFrames || []
    },
    modelCallCount: snapshot.modelCallCount,
    modelCalls: snapshot.modelCalls
  };
}

function snapshotHasUserMessage(snapshot, before, text) {
  const needle = String(text || '').slice(0, 70);
  return Number(snapshot.chatLength || 0) > Number(before.chatLength || 0)
    && (snapshot.recentMessages || []).some((message) => (
      message?.isUser === true
      && String(message.textPreview || '').includes(needle)
    ));
}

function snapshotHasIngressProgress(snapshot, before) {
  return Number(snapshot?.tracking?.ingressCount || 0) > Number(before?.tracking?.ingressCount || 0)
    || Number(snapshot?.pendingInteractions?.length || 0) > Number(before?.pendingInteractions?.length || 0)
    || Number(snapshot?.directiveMessageCount || 0) > Number(before?.directiveMessageCount || 0);
}

async function triggerDirectiveObserverForLatestPlayerMessage(page, text) {
  return page.evaluate(async ({ modulePath, expectedText }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const pendingSummary = (view) => {
      const state = view?.campaignState || {};
      const tracking = state.runtimeTracking || {};
      const ledger = tracking.endConditionLedger || {};
      return {
        campaignId: state.campaign?.id || null,
        campaignStatus: state.campaign?.status || null,
        tracking: view?.chatNative?.tracking || null,
        pendingInteractions: (tracking.pendingInteractions || []).map((entry) => ({
          id: entry.id || null,
          kind: entry.kind || null,
          status: entry.status || null
        })),
        ledger: {
          activeDecisionId: ledger.activeDecisionId || null,
          decisions: (ledger.decisions || []).map((entry) => ({
            id: entry.id || null,
            status: entry.status || null,
            conditionId: entry.conditionId || null
          }))
        }
      };
    };
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    const viewBefore = app?.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const latest = host?.chat?.getLatestPlayerMessage?.() || null;
    if (!app?.observeHostPlayerMessage || !latest?.text) {
      return {
        invoked: false,
        reason: 'runtime-observer-or-latest-player-message-unavailable',
        hasApp: Boolean(app),
        hasObserver: typeof app?.observeHostPlayerMessage === 'function',
        hasLatest: Boolean(latest),
        latest: clone(latest),
        before: pendingSummary(viewBefore)
      };
    }
    const expected = String(expectedText || '').slice(0, 70);
    if (expected && !String(latest.text || '').includes(expected)) {
      return {
        invoked: false,
        reason: 'latest-player-message-did-not-match-expected-text',
        expected,
        latest: clone({
          id: latest.id || latest.hostMessageId || null,
          index: latest.index ?? null,
          text: latest.text || ''
        }),
        before: pendingSummary(viewBefore)
      };
    }
    const result = await app.observeHostPlayerMessage(latest);
    const viewAfter = app?.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    return {
      invoked: true,
      latest: clone({
        id: latest.id || latest.hostMessageId || null,
        index: latest.index ?? null,
        chatId: latest.chatId || null,
        textPreview: String(latest.text || '').replace(/\s+/g, ' ').trim().slice(0, 220)
      }),
      before: pendingSummary(viewBefore),
      after: pendingSummary(viewAfter),
      result: clone(result)
    };
  }, {
    modulePath: bridgeModulePath(),
    expectedText: text
  });
}

async function chatSendDiagnostics(page) {
  return page.evaluate(async () => {
    let scriptState = null;
    try {
      const st = await import('/script.js');
      scriptState = {
        isSendPress: st.is_send_press === true,
        isGenerating: typeof st.isGenerating === 'function' ? st.isGenerating() === true : null
      };
    } catch (error) {
      scriptState = { error: error?.message || String(error) };
    }
    const textarea = document.querySelector('#send_textarea');
    const sendButton = document.querySelector('#send_but');
    const context = globalThis.SillyTavern?.getContext?.() || null;
    const eventTypes = context?.eventTypes || context?.event_types || {};
    return {
      scriptState,
      bodyGenerating: document.body?.dataset?.generating || null,
      chatLength: Array.isArray(context?.chat) ? context.chat.length : null,
      currentChatId: context?.chatId || context?.chat_id || null,
      eventTypeKeys: Object.keys(eventTypes).filter((key) => /message|generation|chat/i.test(key)).sort(),
      textarea: textarea
        ? {
            value: textarea.value || '',
            disabled: textarea.disabled === true,
            readOnly: textarea.readOnly === true,
            ariaDisabled: textarea.getAttribute('aria-disabled'),
            display: getComputedStyle(textarea).display,
            visibility: getComputedStyle(textarea).visibility,
            pointerEvents: getComputedStyle(textarea).pointerEvents
          }
        : null,
      sendButton: sendButton
        ? {
            disabled: sendButton.disabled === true,
            className: sendButton.className || '',
            display: getComputedStyle(sendButton).display,
            visibility: getComputedStyle(sendButton).visibility,
            pointerEvents: getComputedStyle(sendButton).pointerEvents,
            text: sendButton.textContent || ''
          }
        : null
    };
  });
}

async function sendChatMessageAndWait(page, text, {
  label = 'chat message',
  requireDirectiveIngress = true,
  allowObserverFallback = true,
  waitForAppend = true
} = {}) {
  const before = await liveSnapshot(page);
  await waitForSillyTavernIdle(page, { timeoutMs: TIMEOUT_MS });
  const clickResult = await page.evaluate((messageText) => {
    return (async () => {
    const textarea = document.querySelector('#send_textarea');
    const sendButton = document.querySelector('#send_but');
    const context = globalThis.SillyTavern?.getContext?.() || null;
    if (!textarea || !sendButton) {
      return {
        sent: false,
        reason: 'SillyTavern send textarea or send button was not present.',
        hasTextarea: Boolean(textarea),
        hasSendButton: Boolean(sendButton)
      };
    }
    textarea.focus?.();
    textarea.value = messageText;
    textarea.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: messageText
    }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    let sendMethod = 'button-click';
    let hostSendError = null;
    try {
      const st = await import('/script.js');
      if (typeof st.sendTextareaMessage === 'function') {
        sendMethod = 'script:sendTextareaMessage';
        await st.sendTextareaMessage();
      } else {
        sendButton.click();
      }
    } catch (error) {
      hostSendError = error?.message || String(error);
      sendButton.click();
    }
    return {
      sent: true,
      sendMethod,
      hostSendError,
      sendButtonHidden: sendButton.classList.contains('displayNone'),
      sendButtonDisabled: sendButton.disabled === true,
      chatLengthBeforeClick: Array.isArray(context?.chat) ? context.chat.length : null
    };
    })();
  }, text);
  assertLive(clickResult.sent, clickResult.reason || `${label} was not sent.`, clickResult);
  if (!waitForAppend) {
    return { before, after: null, sendResult: clickResult, fallback: false };
  }

  try {
    let afterClick = await waitForSnapshot(page, `${label} user message after button click`, (snapshot) => (
      snapshotHasUserMessage(snapshot, before, text)
    ), { timeoutMs: 15000 });
    if (!requireDirectiveIngress) {
      return { before, after: afterClick, sendResult: clickResult, fallback: false };
    }
    if (!snapshotHasIngressProgress(afterClick, before)) {
      try {
        afterClick = await waitForSnapshot(page, `${label} host event ingress`, (snapshot) => (
          snapshotHasIngressProgress(snapshot, before)
        ), { timeoutMs: 5000 });
      } catch {
        if (!allowObserverFallback) {
          throw new Error(`${label} did not produce Directive ingress from the SillyTavern host event.`);
        }
        const observerFallback = await triggerDirectiveObserverForLatestPlayerMessage(page, text);
        assertLive(observerFallback.invoked, `${label} observer fallback could not invoke Directive's latest-player-message handler.`, observerFallback);
        progress(`${label}: host event did not fire; invoked observer fallback`, observerFallback);
        afterClick = await waitForSnapshot(page, `${label} observer fallback ingress`, (snapshot) => (
          snapshotHasIngressProgress(snapshot, before)
        ), { timeoutMs: Math.min(TIMEOUT_MS, 60000) });
        return { before, after: afterClick, sendResult: { ...clickResult, observerFallback }, fallback: 'observer' };
      }
    }
    return { before, after: afterClick, sendResult: clickResult, fallback: false };
  } catch {
    await page.locator('#send_textarea').click({ timeout: BROWSER_TIMEOUT_MS });
    await page.locator('#send_textarea').fill(String(text || ''), { timeout: BROWSER_TIMEOUT_MS });
    await page.keyboard.press('Enter');
    try {
      let afterEnter = await waitForSnapshot(page, `${label} user message after Enter fallback`, (snapshot) => (
        snapshotHasUserMessage(snapshot, before, text)
      ), { timeoutMs: Math.min(TIMEOUT_MS, 45000) });
      if (!requireDirectiveIngress) {
        return { before, after: afterEnter, sendResult: clickResult, fallback: true };
      }
      if (!snapshotHasIngressProgress(afterEnter, before)) {
        try {
          afterEnter = await waitForSnapshot(page, `${label} Enter fallback ingress`, (snapshot) => (
            snapshotHasIngressProgress(snapshot, before)
          ), { timeoutMs: 5000 });
        } catch {
          if (!allowObserverFallback) {
            throw new Error(`${label} did not produce Directive ingress from the SillyTavern host event after Enter fallback.`);
          }
          const observerFallback = await triggerDirectiveObserverForLatestPlayerMessage(page, text);
          assertLive(observerFallback.invoked, `${label} observer fallback could not invoke Directive's latest-player-message handler.`, observerFallback);
          progress(`${label}: Enter fallback did not fire host event; invoked observer fallback`, observerFallback);
          afterEnter = await waitForSnapshot(page, `${label} observer fallback ingress`, (snapshot) => (
            snapshotHasIngressProgress(snapshot, before)
          ), { timeoutMs: Math.min(TIMEOUT_MS, 60000) });
          return { before, after: afterEnter, sendResult: { ...clickResult, observerFallback }, fallback: 'enter+observer' };
        }
      }
      return { before, after: afterEnter, sendResult: clickResult, fallback: true };
    } catch (error) {
      const diagnostics = await chatSendDiagnostics(page).catch((diagnosticError) => ({
        error: diagnosticError?.message || String(diagnosticError)
      }));
      throw new Error(`${label} did not append a user message after button click or Enter fallback.\n${compact({
        text,
        clickResult,
        diagnostics,
        before,
        originalError: error?.message || String(error)
      }, 2600)}`);
    }
  }
}

async function createLiveCampaign(page, { runId, providerPrecheck = false } = {}) {
  return page.evaluate(async ({ modulePath, runId: scenarioRunId, providerPrecheck: runProviderPrecheck, ashesPackageId }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    if (!app || !host?.chat) {
      return {
        skipped: true,
        reason: 'Directive runtime app or SillyTavern chat adapter was not available.'
      };
    }

    const providerTests = runProviderPrecheck
      ? {
          utility: await app.testProvider({ kind: 'utility' }),
          reasoning: await app.testProvider({ kind: 'reasoning' })
        }
      : null;

    const initialView = await app.getCurrentView({ tabId: 'campaign' });
    const availablePackages = Array.isArray(initialView?.campaign?.packages)
      ? initialView.campaign.packages
      : [];
    const packageRecord = availablePackages.find?.((entry) => (
      [entry?.packageId, entry?.id, entry?.manifestId]
        .map((value) => String(value || '').trim())
        .includes(ashesPackageId)
    )) || availablePackages.find?.((entry) => entry?.actions?.startNewCampaign) || availablePackages[0] || null;
    const packageId = packageRecord?.packageId
      || packageRecord?.id
      || packageRecord?.manifestId
      || initialView?.activePackageId
      || initialView?.campaign?.activePackageId
      || null;
    if (!packageId) {
      return {
        skipped: true,
        reason: 'Directive did not expose an active campaign package.'
      };
    }
    if (packageId !== ashesPackageId) {
      return {
        skipped: true,
        reason: `Directive did not expose the Ashes package required for terminal smoke. Selected ${packageId}.`,
        availablePackageIds: availablePackages.map((entry) => entry?.packageId || entry?.id || entry?.manifestId).filter(Boolean)
      };
    }

    const playerName = `Talia Serrin ${scenarioRunId.slice(-8)}`;
    const creatorDraft = await app.startCreatorDraft({ packageId });
    const creatorView = creatorDraft?.creator || creatorDraft || {};
    const creatorOptions = creatorView.options || {};
    const optionId = (source, preferred = []) => {
      const entries = Array.isArray(source) ? source : (Array.isArray(source?.options) ? source.options : []);
      const idOf = (entry) => typeof entry === 'string' ? entry : (entry?.id || entry?.value || entry?.key || '');
      for (const id of preferred) {
        if (entries.some((entry) => idOf(entry) === id)) return id;
      }
      return idOf(entries[0]);
    };
    await app.saveCreatorDraft({
      reason: 'liveTerminalEndingSmoke',
      patch: {
        activeStep: 'review',
        input: {
          identity: {
            name: playerName,
            pronounsOrAddress: 'she/her',
            speciesId: optionId(creatorOptions.allowedSpecies || creatorOptions.species, ['human']),
            ageBandId: optionId(creatorOptions.ageBands, ['mid-career', 'experienced', 'late-career']),
            appearance: 'A composed officer with a quiet voice and a habit of watching the room before speaking.'
          },
          service: {
            careerBackgroundId: optionId(creatorOptions.careerBackgrounds, ['tactical-security', 'command-administration']),
            formativeExperienceId: optionId(creatorOptions.formativeExperiences, ['dominion-war-fleet-service', 'frontier-border-service']),
            assignmentReasonId: optionId(creatorOptions.assignmentReasons, ['experienced-outsider-transfer', 'relevant-specialist-experience'])
          },
          personality: {
            traits: {
              insight: 'perceptive',
              connection: 'candid',
              execution: 'decisive'
            },
            flawId: 'impatient'
          },
          dossier: {
            detailLevel: 'Standard',
            briefBiography: `${playerName} is a tactical-minded Starfleet Commander whose Dominion War service taught her to make timely decisions without treating lives as expendable.`,
            publicReputation: `${playerName} is known as a decisive and observant officer whose restraint has improved since the war.`
          },
          settings: {
            simulationMode: 'Command'
          }
        }
      }
    });
    const startedView = await app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });
    const openCampaignChat = await app.openCampaignChat();
    const view = await app.getCurrentView({ tabId: 'mission' });
    return {
      skipped: false,
      providerTests: clone(providerTests),
      packageId,
      playerName,
      openCampaignChat: clone(openCampaignChat),
      campaign: clone({
        id: view?.campaignState?.campaign?.id || startedView?.campaignState?.campaign?.id || null,
        title: view?.campaignState?.campaign?.title || startedView?.campaignState?.campaign?.title || null,
        status: view?.campaignState?.campaign?.status || startedView?.campaignState?.campaign?.status || null
      }),
      binding: clone(view?.chatNative?.binding || null),
      activation: clone(view?.chatNative?.activation || null),
      tracking: clone(view?.chatNative?.tracking || null)
    };
  }, {
    modulePath: bridgeModulePath(),
    runId,
    providerPrecheck,
    ashesPackageId: ASHES_PACKAGE_ID
  });
}

function validateProviderPrecheck(created) {
  if (!created.providerTests) return;
  assertLive(created.providerTests.utility?.ok === true, 'Utility provider precheck failed.', created.providerTests);
  assertLive(created.providerTests.reasoning?.ok === true, 'Reasoning provider precheck failed.', created.providerTests);
}

function terminalDecisionReady(snapshot) {
  const decision = snapshot.activeTerminalInteraction;
  const decisionRecord = snapshot.terminalDecision;
  return Boolean(
    decision?.kind === 'terminalOutcomeDecision'
    && decisionRecord?.status === 'pending'
    && snapshot.directiveResponseKinds.includes('committedOutcome')
    && snapshot.directiveResponseKinds.includes('terminalOutcomeCheckpoint')
  );
}

function riskConfirmationNeeded(snapshot) {
  return Boolean(
    snapshot.directiveResponseKinds.includes('riskConfirmationNeeded')
    && (snapshot.pendingInteractions || []).some((entry) => entry?.kind === 'riskConfirmationNeeded' && entry?.status !== 'resolved')
  );
}

async function sendCatastrophicTerminalCommand(page, scenario, before) {
  await sendChatMessageAndWait(page, TERMINAL_COMMAND, { label: `${scenario.id} catastrophic command` });
  const isTerminalReady = (snapshot) => {
    return Boolean(
      terminalDecisionReady(snapshot)
      && snapshot.ship?.status === 'destroyed'
      && snapshot.flags?.['campaign-objective'] === 'failed'
      && Number(snapshot.modelCallCount || 0) > Number(before.modelCallCount || 0)
    );
  };
  const first = await waitForSnapshot(page, `${scenario.id} terminal checkpoint or risk confirmation`, (snapshot) => (
    isTerminalReady(snapshot)
    || (
      snapshot.directiveResponseKinds.includes('riskConfirmationNeeded')
      && (snapshot.pendingInteractions || []).some((entry) => entry?.status !== 'resolved')
    )
  ));
  if (isTerminalReady(first)) {
    return {
      snapshot: first,
      riskConfirmationHandled: false,
      triggerKind: 'catastrophic-command'
    };
  }

  await sendChatMessageAndWait(page, RISK_CONFIRMATION_REPLY, { label: `${scenario.id} risk confirmation reply` });
  const terminal = await waitForSnapshot(page, `${scenario.id} terminal checkpoint after risk confirmation`, isTerminalReady, {
    timeoutMs: Math.min(TIMEOUT_MS, 90000)
  });
  return {
    snapshot: terminal,
    riskConfirmationHandled: true,
    triggerKind: 'catastrophic-command'
  };
}

async function sendCommandConductLadder(page, scenario, before) {
  const ladder = [];
  let latest = before;
  let riskConfirmationHandled = false;
  for (const step of COMMAND_CONDUCT_LADDER) {
    progress(`${scenario.id}: command-conduct probe ${step.id}`);
    const stepBefore = await liveSnapshot(page);
    await sendChatMessageAndWait(page, step.text, { label: `${scenario.id} ${step.id}` });
    let stepSnapshot = await waitForSnapshot(page, `${scenario.id} ${step.id} committed`, (snapshot) => {
      if (step.shouldTriggerTerminalDecision && riskConfirmationNeeded(snapshot)) return true;
      const flagMatched = snapshot.flags?.[step.expectedFlag] === true;
      const modelAdvanced = Number(snapshot.modelCallCount || 0) > Number(stepBefore.modelCallCount || 0);
      if (!flagMatched || !modelAdvanced || !snapshot.directiveResponseKinds.includes('committedOutcome')) return false;
      if (step.shouldTriggerTerminalDecision) {
        return terminalDecisionReady(snapshot)
          && snapshot.flags?.['player.command-removal'] === 'permanent'
          && snapshot.player?.commandStatus === 'brig';
      }
      return !terminalDecisionReady(snapshot)
        && snapshot.flags?.['player.command-removal'] !== 'permanent'
        && snapshot.player?.commandStatus !== 'brig';
    }, { timeoutMs: TIMEOUT_MS });

    if (step.shouldTriggerTerminalDecision && riskConfirmationNeeded(stepSnapshot) && !terminalDecisionReady(stepSnapshot)) {
      progress(`${scenario.id}: confirming command-conduct risk`, {
        pendingInteractionKinds: (stepSnapshot.pendingInteractions || []).map((entry) => entry?.kind).filter(Boolean)
      });
      await sendChatMessageAndWait(page, RISK_CONFIRMATION_REPLY, { label: `${scenario.id} ${step.id} risk confirmation reply` });
      riskConfirmationHandled = true;
      stepSnapshot = await waitForSnapshot(page, `${scenario.id} ${step.id} terminal checkpoint after risk confirmation`, (snapshot) => (
        terminalDecisionReady(snapshot)
        && snapshot.flags?.[step.expectedFlag] === true
        && snapshot.flags?.['player.command-removal'] === 'permanent'
        && snapshot.player?.commandStatus === 'brig'
      ), { timeoutMs: Math.min(TIMEOUT_MS, 120000) });
    }

    ladder.push({
      id: step.id,
      expectedFlag: step.expectedFlag,
      shouldTriggerTerminalDecision: step.shouldTriggerTerminalDecision,
      riskConfirmationHandled: step.shouldTriggerTerminalDecision ? riskConfirmationHandled : false,
      terminalDecisionPresent: terminalDecisionReady(stepSnapshot),
      commandRemovalFlag: stepSnapshot.flags?.['player.command-removal'] || null,
      playerCommandStatus: stepSnapshot.player?.commandStatus || null,
      responseKinds: stepSnapshot.directiveResponseKinds.slice(-6),
      modelCallDelta: Number(stepSnapshot.modelCallCount || 0) - Number(stepBefore.modelCallCount || 0)
    });
    latest = stepSnapshot;
  }

  assertLive(
    terminalDecisionReady(latest),
    `${scenario.id} command-conduct ladder did not create a terminal decision at the final threshold.`,
    { ladder, latest }
  );
  return {
    snapshot: latest,
    riskConfirmationHandled,
    triggerKind: 'command-fitness-ladder',
    ladder
  };
}

async function sendTerminalTrigger(page, scenario, before) {
  if (scenario.triggerKind === 'command-fitness-ladder') {
    return sendCommandConductLadder(page, scenario, before);
  }
  return sendCatastrophicTerminalCommand(page, scenario, before);
}

async function resolveTerminalDecision(page, scenario, terminalSnapshot) {
  const decisionId = terminalSnapshot.activeTerminalInteraction?.id || null;
  assertLive(decisionId, `${scenario.id} did not expose an active terminal decision.`, terminalSnapshot);

  await sendChatMessageAndWait(page, scenario.reply, {
    label: `${scenario.id} terminal decision reply`,
    requireDirectiveIngress: false,
    waitForAppend: false
  });
  return waitForSnapshot(page, `${scenario.id} terminal decision host-event resolution`, (snapshot) => {
    const decision = (snapshot.allTerminalDecisions || []).find((entry) => entry?.id === decisionId);
    if (!decision) return false;
    if (scenario.expectedAction === 'saveTerminalBranch') {
      return (snapshot.ledger?.branchRecords || []).some((entry) => entry?.decisionId === decisionId)
        && Array.isArray(decision.savedBranchIds)
        && decision.savedBranchIds.length > 0;
    }
    if (!decision.resolution || decision.resolution.action !== scenario.expectedAction) return false;
    return decision.status === scenario.expectedStatus;
  }, { timeoutMs: Math.min(TIMEOUT_MS, 90000) });
}

function validateScenarioResult(scenario, terminalSnapshot, resolvedSnapshot) {
  const decisionId = terminalSnapshot.activeTerminalInteraction?.id;
  const decision = (resolvedSnapshot.allTerminalDecisions || []).find((entry) => entry?.id === decisionId);
  assertLive(decision, `${scenario.id} did not retain its end-condition ledger decision.`, resolvedSnapshot);

  if (scenario.expectedAction === 'saveTerminalBranch') {
    assertLive(decision.status === 'pending', 'Save as branch should preserve the pending terminal decision.', { decision, resolvedSnapshot });
    assertLive((resolvedSnapshot.ledger?.branchRecords || []).some((entry) => entry?.decisionId === decisionId), 'Save as branch did not record a terminal branch.', resolvedSnapshot);
    assertLive((decision.savedBranchIds || []).length > 0, 'Save as branch did not attach a save id to the decision.', decision);
    return;
  }

  assertLive(decision.status === scenario.expectedStatus, `${scenario.id} did not reach ${scenario.expectedStatus}.`, decision);
  assertLive(
    !(resolvedSnapshot.pendingInteractions || []).some((entry) => entry?.id === decisionId && entry?.status !== 'resolved'),
    `${scenario.id} left the terminal interaction pending.`,
    resolvedSnapshot
  );

  if (scenario.expectedAction === 'replayFromCheckpoint') {
    if (scenario.triggerKind === 'command-fitness-ladder') {
      assertLive(resolvedSnapshot.player?.commandStatus !== 'brig', 'Replay did not restore the pre-terminal command status.', resolvedSnapshot);
      assertLive(resolvedSnapshot.flags?.['player.command-removal'] !== 'permanent', 'Replay did not restore the pre-terminal command-removal flag.', resolvedSnapshot);
    } else {
      assertLive(resolvedSnapshot.ship?.status !== 'destroyed', 'Replay did not restore the pre-terminal ship state.', resolvedSnapshot);
      assertLive(resolvedSnapshot.flags?.['campaign-objective'] !== 'failed', 'Replay did not restore the pre-terminal campaign objective flag.', resolvedSnapshot);
    }
  }
  if (scenario.expectedAction === 'pushOn') {
    assertLive((resolvedSnapshot.ledger?.continuationFrames || []).length > 0, 'Push On did not add a continuation frame.', resolvedSnapshot);
  }
  if (scenario.expectedAction === 'keepEnding') {
    assertLive(resolvedSnapshot.conclusion?.terminalOutcome?.acceptedResolution === 'keepEnding', 'Keep Ending did not commit terminal conclusion metadata.', resolvedSnapshot);
    assertLive(resolvedSnapshot.campaign?.finalCampaignBand, 'Keep Ending did not stamp the final campaign band.', resolvedSnapshot);
  }
}

async function runScenario(page, scenario, index) {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${scenario.id}`;
  progress(`${scenario.id}: creating fresh campaign`);
  appendLiveLog({
    kind: 'terminal-scenario-start',
    status: 'in_progress',
    scenarioId: scenario.id,
    triggerKind: scenario.triggerKind,
    expectedAction: scenario.expectedAction,
    user: SILLYTAVERN_USER || null
  });
  const created = await createLiveCampaign(page, {
    runId,
    providerPrecheck: true
  });
  assertLive(!created.skipped, `${scenario.id} could not create a live campaign.`, created);
  validateProviderPrecheck(created);
  assertLive(created.binding?.chatId, `${scenario.id} campaign did not bind a SillyTavern chat.`, created);
  assertLive(created.activation?.status === 'complete', `${scenario.id} campaign activation did not complete.`, created);
  assertLive(created.openCampaignChat?.ok !== false, `${scenario.id} could not open the campaign chat.`, created);

  await waitForSillyTavernIdle(page, { timeoutMs: TIMEOUT_MS });
  const before = await liveSnapshot(page);
  progress(`${scenario.id}: sending terminal trigger`, {
    triggerKind: scenario.triggerKind,
    campaignId: before.campaign?.id || null,
    chatLength: before.chatLength,
    modelCallCount: before.modelCallCount
  });
  const terminalResult = await sendTerminalTrigger(page, scenario, before);
  const terminal = terminalResult.snapshot;
  progress(`${scenario.id}: terminal checkpoint ready`, {
    decisionId: terminal.activeTerminalInteraction?.id || null,
    triggerKind: terminalResult.triggerKind,
    responseKinds: terminal.directiveResponseKinds.slice(-6),
    riskConfirmationHandled: terminalResult.riskConfirmationHandled
  });
  const checkpointTranscript = await captureScenarioTranscript(page, scenario.id, 'terminal-checkpoint');
  appendLiveLog({
    kind: 'terminal-checkpoint-ready',
    status: 'pass',
    scenarioId: scenario.id,
    triggerKind: terminalResult.triggerKind,
    campaignId: created.campaign?.id || null,
    saveId: created.binding?.saveId || null,
    chatId: created.binding?.chatId || null,
    decisionId: terminal.activeTerminalInteraction?.id || null,
    terminalOutcomeId: terminal.activeTerminalInteraction?.metadata?.terminalOutcomeId || null,
    terminalOutcomeBand: terminal.activeTerminalInteraction?.metadata?.terminalOutcomeBand || null,
    riskConfirmationHandled: terminalResult.riskConfirmationHandled,
    conductLadder: terminalResult.ladder || null,
    modelCallDelta: Number(terminal.modelCallCount || 0) - Number(before.modelCallCount || 0),
    transcript: checkpointTranscript
  });
  progress(`${scenario.id}: resolving terminal decision`, {
    reply: scenario.reply,
    expectedAction: scenario.expectedAction
  });
  const resolved = await resolveTerminalDecision(page, scenario, terminal);
  validateScenarioResult(scenario, terminal, resolved);
  const resolvedTranscript = await captureScenarioTranscript(page, scenario.id, 'resolved');
  progress(`${scenario.id}: resolved`, {
    status: (resolved.allTerminalDecisions || []).find((entry) => entry?.id === terminal.activeTerminalInteraction?.id)?.status || null,
    branchRecordCount: resolved.ledger?.branchRecords?.length || 0,
    continuationFrameCount: resolved.ledger?.continuationFrames?.length || 0,
    finalCampaignBand: resolved.campaign?.finalCampaignBand || null
  });
  appendLiveLog({
    kind: 'terminal-scenario-end',
    status: 'pass',
    scenarioId: scenario.id,
    triggerKind: scenario.triggerKind,
    expectedAction: scenario.expectedAction,
    campaignId: created.campaign?.id || null,
    saveId: created.binding?.saveId || null,
    chatId: created.binding?.chatId || null,
    decisionId: terminal.activeTerminalInteraction?.id || null,
    decisionStatus: (resolved.allTerminalDecisions || []).find((entry) => entry?.id === terminal.activeTerminalInteraction?.id)?.status || null,
    branchRecordCount: resolved.ledger?.branchRecords?.length || 0,
    continuationFrameCount: resolved.ledger?.continuationFrames?.length || 0,
    conclusionType: resolved.conclusion?.type || null,
    finalCampaignBand: resolved.campaign?.finalCampaignBand || null,
    pendingInteractionCount: (resolved.pendingInteractions || []).length,
    transcript: resolvedTranscript
  });

  return {
    id: scenario.id,
    triggerKind: scenario.triggerKind,
    expectedAction: scenario.expectedAction,
    created: {
      campaign: created.campaign,
      binding: created.binding,
      providerPrecheck: created.providerTests
        ? {
            utilityOk: created.providerTests.utility?.ok === true,
            reasoningOk: created.providerTests.reasoning?.ok === true
          }
        : null
    },
    terminal: {
      decisionId: terminal.activeTerminalInteraction?.id || null,
      terminalOutcomeId: terminal.activeTerminalInteraction?.metadata?.terminalOutcomeId || null,
      terminalOutcomeBand: terminal.activeTerminalInteraction?.metadata?.terminalOutcomeBand || null,
      riskConfirmationHandled: terminalResult.riskConfirmationHandled,
      conductLadder: terminalResult.ladder || null,
      modelCallDelta: Number(terminal.modelCallCount || 0) - Number(before.modelCallCount || 0),
      responseKinds: terminal.directiveResponseKinds.slice(-8)
    },
    resolved: {
      decisionStatus: (resolved.allTerminalDecisions || []).find((entry) => entry?.id === terminal.activeTerminalInteraction?.id)?.status || null,
      branchRecordCount: resolved.ledger?.branchRecords?.length || 0,
      continuationFrameCount: resolved.ledger?.continuationFrames?.length || 0,
      conclusionType: resolved.conclusion?.type || null,
      finalCampaignBand: resolved.campaign?.finalCampaignBand || null,
      pendingInteractionCount: (resolved.pendingInteractions || []).length,
      recentMessages: resolved.recentMessages
    },
    transcripts: {
      checkpoint: checkpointTranscript,
      resolved: resolvedTranscript
    }
  };
}

async function createAuthenticatedContext(browser) {
  const context = await browser.newContext();
  if (!SILLYTAVERN_USER) {
    return {
      context,
      authenticatedUser: null,
      headers: null
    };
  }

  const auth = await authenticateSillyTavernUser({
    baseUrl: BASE_URL,
    handle: SILLYTAVERN_USER,
    password: configuredUserPassword(SILLYTAVERN_USER),
    timeoutMs: BROWSER_TIMEOUT_MS
  });
  assertLive(auth.ok, `Could not authenticate SillyTavern user ${SILLYTAVERN_USER}.`, auth);
  smokeUserAuth = auth;
  const cookie = auth.headers.Cookie || auth.headers.cookie || '';
  const cookies = cookieHeaderToPlaywrightCookies(cookie);
  assertLive(cookies.length > 0, `SillyTavern user ${SILLYTAVERN_USER} authentication did not return a session cookie.`, auth);
  await context.addCookies(cookies);
  return {
    context,
    authenticatedUser: {
      handle: SILLYTAVERN_USER,
      loginStatus: auth.loginStatus
    },
    headers: auth.headers
  };
}

async function verifyBrowserUserSession(page) {
  if (!SILLYTAVERN_USER) return null;
  const session = await page.evaluate(async () => {
    const response = await fetch('/api/users/me');
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      json,
      text
    };
  });
  assertLive(
    session.ok && session.json?.handle === SILLYTAVERN_USER,
    `Browser session is not authenticated as ${SILLYTAVERN_USER}.`,
    session
  );
  return {
    handle: session.json.handle,
    name: session.json.name || null
  };
}

async function openReadyPage(context) {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: BROWSER_TIMEOUT_MS });
  await page.waitForLoadState('networkidle', { timeout: BROWSER_TIMEOUT_MS }).catch(() => {});
  await verifyBrowserUserSession(page);
  await waitForBridge(page);

  const initial = await liveSnapshot(page);
  assertLive(initial.bridgeAvailable, 'Directive runtime bridge was not available in SillyTavern.', initial);
  assertLive(initial.actionKeys.includes('resolveTerminalOutcomeDecision'), 'Runtime app did not expose resolveTerminalOutcomeDecision.', initial);
  assertLive(initial.actionKeys.includes('postTerminalOutcomeCheckpoint'), 'Runtime app did not expose postTerminalOutcomeCheckpoint.', initial);

  return page;
}

async function runLiveSmoke() {
  if (!BASE_URL) throw new Error('SILLYTAVERN_BASE_URL or ST_BASE_URL is required.');
  if (!RUN_LIVE_GENERATION) {
    throw new Error('Set DIRECTIVE_SILLYTAVERN_GENERATION=1 or DIRECTIVE_LIVE_GENERATION=1 before running the terminal endings live smoke.');
  }

  const launched = await launchPlaywrightBrowser({
    headless: HEADLESS,
    timeoutMs: BROWSER_TIMEOUT_MS
  });
  assertLive(launched.ok, 'Playwright browser launch failed.', launched);

  const browser = launched.browser;
  let context = null;
  let authenticatedUser = null;
  let authHeaders = null;
  let servedExtension = null;
  try {
    const contextAuth = await createAuthenticatedContext(browser);
    context = contextAuth.context;
    authenticatedUser = contextAuth.authenticatedUser;
    authHeaders = contextAuth.headers;

    if (!SKIP_STALE_CHECK) {
      servedExtension = await compareServedExtension({
        baseUrl: BASE_URL,
        extensionPath: EXTENSION_PATH,
        localRoot: process.cwd(),
        headers: authHeaders || undefined,
        timeoutMs: BROWSER_TIMEOUT_MS,
        files: [
          'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',
          'src/adjudication/action-resolver.mjs',
          'src/adjudication/command-conduct.mjs',
          'src/adjudication/intent-parser.mjs',
          'src/adjudication/turn-intent-contract.mjs',
          'src/adjudication/utility-turn-classifier.mjs',
          'src/campaign/end-conditions.mjs',
          'src/mission/director.mjs',
          'src/mission/state-delta.mjs',
          'src/runtime/campaign-end-condition-service.mjs',
          'src/runtime/chat-turn-orchestrator.mjs',
          'src/runtime/runtime-app.mjs',
          'src/runtime/runtime-shell.js',
          'src/ui/campaign-panel.js',
          'src/ui/mission-panel.js',
          'styles/directive.css'
        ]
      });
      assertLive(servedExtension.ok, 'The served SillyTavern Directive extension does not match this workspace.', {
        mismatchCount: servedExtension.mismatchCount,
        servedFailureCount: servedExtension.servedFailureCount,
        compared: servedExtension.compared.filter((entry) => entry.matches === false || !entry.servedOk)
      });
    }

    const activeScenarios = SCENARIO_FILTER
      ? SCENARIOS.filter((scenario) => (
          scenario.id === SCENARIO_FILTER
          || scenario.expectedAction === SCENARIO_FILTER
          || scenario.triggerKind === SCENARIO_FILTER
        ))
      : SCENARIOS;
    assertLive(activeScenarios.length > 0, `No terminal live scenario matched ${SCENARIO_FILTER}.`, {
      scenarioFilter: SCENARIO_FILTER,
      available: SCENARIOS.map((scenario) => scenario.id)
    });

    const scenarios = [];
    for (let index = 0; index < activeScenarios.length; index += 1) {
      const page = await openReadyPage(context);
      try {
        scenarios.push(await runScenario(page, activeScenarios[index], index));
      } finally {
        await page.close().catch(() => {});
      }
    }

    return {
      ok: true,
      baseUrl: BASE_URL,
      extensionPath: EXTENSION_PATH,
      driver: launched.driver,
      authenticatedUser,
      staleCheck: servedExtension
        ? {
            ok: servedExtension.ok,
            compared: servedExtension.compared.length
          }
        : { skipped: true },
      scenarios
    };
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close();
  }
}

async function main() {
  if (HELP) {
    console.log(usage());
    return;
  }
  if (DRY_RUN || !BASE_URL) {
    const report = {
      ok: true,
      skipped: !BASE_URL,
      reason: BASE_URL ? 'dry-run requested' : 'SILLYTAVERN_BASE_URL is not set',
      checklist: checklist()
    };
    writeReportArtifacts(report);
    console.log(JSON.stringify(COMPACT_STDOUT ? compactReportSummary(report) : report, null, 2));
    return;
  }

  const result = await runLiveSmoke();
  writeReportArtifacts(result);
  console.log(JSON.stringify(COMPACT_STDOUT ? compactReportSummary(result) : result, null, 2));
}

main().catch((error) => {
  const report = {
    ok: false,
    baseUrl: BASE_URL || null,
    extensionPath: EXTENSION_PATH,
    error: errorSummary(error)
  };
  appendLiveLog({
    kind: 'terminal-failure',
    status: 'fail',
    triggerKind: TERMINAL_TRIGGER,
    user: SILLYTAVERN_USER || null,
    error: compactErrorSummary(error)
  });
  writeReportArtifacts(report);
  console.error(JSON.stringify(COMPACT_STDOUT ? compactReportSummary(report) : report, null, 2));
  process.exitCode = 1;
});
