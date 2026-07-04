import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import {
  DIRECTIVE_LOGICAL_STORAGE_KEYS,
  coreSaveManifestV2LogicalKey,
  toSillyTavernUserFilesPath
} from '../../src/storage/logical-storage-paths.mjs';
import {
  readCoreStoreProjectionsV2
} from '../../src/storage/core-store-v2.mjs';
import {
  authenticateSillyTavernUser
} from './lib/sillytavern-live-harness.mjs';
import {
  perspectiveLogFields,
  playerInputPerspectiveEvidence
} from './lib/player-input-perspective.mjs';
import {
  generationTimingEntryStatus,
  generationTimingProofStatus,
  timingProofEntryIsNonGenerated,
  timingProofEntryRequiresGenerationStart
} from './lib/generation-timing-proof-policy.mjs';
import {
  corePlayerIngressProof,
  generationTimingProofFromCoreProjections,
  hostNativeCompletionProofFromCoreProjections,
  hostNativeCompletionTargetOutcome,
  uniqueStringList
} from './lib/sillytavern-core-proof-policy.mjs';
import {
  EXTERNAL_CONTEXT_FIXTURE_WORLD,
  buildExternalContextFixtureChatMetadata
} from './prepare-sillytavern-external-context-fixture.mjs';

const args = new Set(process.argv.slice(2));
const BASE_URL = (process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || '').replace(/\/+$/, '');
const EXTENSION_PATH = normalizePath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || '/scripts/extensions/third-party/Directive');
const RUN_BROWSER = process.env.DIRECTIVE_SILLYTAVERN_BROWSER === '1';
const RUN_STORAGE = process.env.DIRECTIVE_SILLYTAVERN_STORAGE === '1';
const RUN_BROWSER_SAVE_FLOW = process.env.DIRECTIVE_SILLYTAVERN_SAVE_FLOW === '1';
const RUN_CHAT_CAMPAIGN_FLOW = process.env.DIRECTIVE_SILLYTAVERN_CHAT_CAMPAIGN === '1'
  || process.env.DIRECTIVE_SILLYTAVERN_OPEN_WORLD_FLOW === '1';
const RUN_LIVE_GENERATION = process.env.DIRECTIVE_SILLYTAVERN_GENERATION === '1'
  || process.env.DIRECTIVE_LIVE_GENERATION === '1';
const RUN_TEARDOWN = process.env.DIRECTIVE_SILLYTAVERN_TEARDOWN === '1';
const RUN_SCREENSHOTS = process.env.DIRECTIVE_SILLYTAVERN_SCREENSHOTS === '1';
const RUN_RESIZE_SWEEP = process.env.DIRECTIVE_SILLYTAVERN_RESIZE_SWEEP === '1';
const RUN_TOGGLE_ONLY = process.env.DIRECTIVE_SILLYTAVERN_TOGGLE_ONLY === '1';
const STRICT = process.env.DIRECTIVE_SILLYTAVERN_STRICT === '1';
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const SILLYTAVERN_USER = normalizeUserHandle(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_SOAK_ST_USER || '');
const CAMPAIGN_PACKAGE_ID = String(process.env.DIRECTIVE_SILLYTAVERN_CAMPAIGN_PACKAGE_ID || '').trim();
const CHAT_MESSAGES_JSON = String(process.env.DIRECTIVE_SILLYTAVERN_CHAT_MESSAGES_JSON || '').trim();
const CHAT_MESSAGES_FILE = String(process.env.DIRECTIVE_SILLYTAVERN_CHAT_MESSAGES_FILE || '').trim();
const CHAT_CAMPAIGN_RESUME_SAVE_ID = String(process.env.DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID || '').trim();
const CHAT_CAMPAIGN_RESUME_CHAT_ID = String(process.env.DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID || '').trim();
const CHAT_CAMPAIGN_RESUME_CURRENT = process.env.DIRECTIVE_SILLYTAVERN_RESUME_CURRENT === '1';
const CHAT_CAMPAIGN_PLAYER_NAME = String(process.env.DIRECTIVE_SILLYTAVERN_PLAYER_NAME || '').trim();
const CHAT_CAMPAIGN_PLAYER_PRONOUNS = String(process.env.DIRECTIVE_SILLYTAVERN_PLAYER_PRONOUNS || 'she/her').trim() || 'she/her';
const CHAT_CAMPAIGN_PLAYER_APPEARANCE = String(process.env.DIRECTIVE_SILLYTAVERN_PLAYER_APPEARANCE || '').trim();
const CHAT_CAMPAIGN_PLAYER_BIO = String(process.env.DIRECTIVE_SILLYTAVERN_PLAYER_BIO || '').trim();
const CHAT_CAMPAIGN_PLAYER_REPUTATION = String(process.env.DIRECTIVE_SILLYTAVERN_PLAYER_REPUTATION || '').trim();
const CHAT_CAMPAIGN_RESUME_ENABLED = Boolean(
  CHAT_CAMPAIGN_RESUME_SAVE_ID
  || CHAT_CAMPAIGN_RESUME_CHAT_ID
  || CHAT_CAMPAIGN_RESUME_CURRENT
);
const LIVE_ARTIFACT_DIR = String(process.env.DIRECTIVE_SILLYTAVERN_ARTIFACT_DIR || '').trim()
  ? path.resolve(process.cwd(), process.env.DIRECTIVE_SILLYTAVERN_ARTIFACT_DIR)
  : '';
const LIVE_LOG_PATH = String(process.env.DIRECTIVE_SILLYTAVERN_LIVE_LOG_PATH || '').trim()
  ? path.resolve(process.cwd(), process.env.DIRECTIVE_SILLYTAVERN_LIVE_LOG_PATH)
  : (LIVE_ARTIFACT_DIR ? path.join(LIVE_ARTIFACT_DIR, 'live-log.jsonl') : '');
const TRANSCRIPT_DIR = String(process.env.DIRECTIVE_SILLYTAVERN_TRANSCRIPT_DIR || '').trim()
  ? path.resolve(process.cwd(), process.env.DIRECTIVE_SILLYTAVERN_TRANSCRIPT_DIR)
  : (LIVE_ARTIFACT_DIR ? path.join(LIVE_ARTIFACT_DIR, 'transcript') : '');
const PROMPT_INSPECTION_DIR = String(process.env.DIRECTIVE_SILLYTAVERN_PROMPT_INSPECTION_DIR || '').trim()
  ? path.resolve(process.cwd(), process.env.DIRECTIVE_SILLYTAVERN_PROMPT_INSPECTION_DIR)
  : (LIVE_ARTIFACT_DIR ? path.join(LIVE_ARTIFACT_DIR, 'prompt-inspection') : '');
const FACT_REVIEW_ONLY = process.env.DIRECTIVE_SILLYTAVERN_FACT_REVIEW_ONLY === '1';
const FACT_REVIEW_REQUEST_PATH = String(process.env.DIRECTIVE_SILLYTAVERN_FACT_REVIEW_REQUEST_PATH || '').trim()
  ? path.resolve(process.cwd(), process.env.DIRECTIVE_SILLYTAVERN_FACT_REVIEW_REQUEST_PATH)
  : '';
const FACT_REVIEW_OUTPUT_PATH = String(process.env.DIRECTIVE_SILLYTAVERN_FACT_REVIEW_OUTPUT_PATH || '').trim()
  ? path.resolve(process.cwd(), process.env.DIRECTIVE_SILLYTAVERN_FACT_REVIEW_OUTPUT_PATH)
  : (LIVE_ARTIFACT_DIR ? path.join(LIVE_ARTIFACT_DIR, 'fact-review-provider-result.json') : '');
const STORY_QUALITY_REVIEW_ONLY = process.env.DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_ONLY === '1';
const STORY_QUALITY_REVIEW_REQUEST_PATH = String(process.env.DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_REQUEST_PATH || '').trim()
  ? path.resolve(process.cwd(), process.env.DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_REQUEST_PATH)
  : '';
const STORY_QUALITY_REVIEW_OUTPUT_PATH = String(process.env.DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_OUTPUT_PATH || '').trim()
  ? path.resolve(process.cwd(), process.env.DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_OUTPUT_PATH)
  : (LIVE_ARTIFACT_DIR ? path.join(LIVE_ARTIFACT_DIR, 'story-quality-review-provider-result.json') : '');
const STORY_QUALITY_REVIEW_RETRY_COUNT = positiveInteger(
  process.env.DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_RETRY_COUNT,
  1
);
const COMPACT_STDOUT = process.env.DIRECTIVE_SILLYTAVERN_COMPACT_STDOUT === '1';
const REQUIRE_BATCHED_SIDECARS = process.env.DIRECTIVE_SILLYTAVERN_REQUIRE_BATCHED_SIDECARS === '1'
  || (process.env.DIRECTIVE_SILLYTAVERN_REQUIRE_BATCHED_SIDECARS !== '0' && !CAMPAIGN_PACKAGE_ID);
const FAIL_ON_NARRATION_RECOVERY = process.env.DIRECTIVE_SILLYTAVERN_FAIL_ON_NARRATION_RECOVERY === '1';
const WAIT_FOR_SIDECARS_EACH_TURN = process.env.DIRECTIVE_SILLYTAVERN_WAIT_SIDECARS_EACH_TURN === '1';
const ACTIVATE_EXTERNAL_CONTEXT_FIXTURE = process.env.DIRECTIVE_SOAK_ACTIVATE_EXTERNAL_CONTEXT_FIXTURE === '1'
  || process.env.DIRECTIVE_SILLYTAVERN_ACTIVATE_EXTERNAL_CONTEXT_FIXTURE === '1';
const BROWSER_TIMEOUT_MS = positiveInteger(process.env.DIRECTIVE_SILLYTAVERN_BROWSER_TIMEOUT_MS, 15000);
const UI_BOOT_TIMEOUT_MS = positiveInteger(
  process.env.DIRECTIVE_SILLYTAVERN_UI_BOOT_TIMEOUT_MS,
  Math.max(BROWSER_TIMEOUT_MS, 45000)
);
const GENERATION_TIMEOUT_MS = positiveInteger(process.env.DIRECTIVE_SILLYTAVERN_GENERATION_TIMEOUT_MS, 90000);
const CHAT_CAMPAIGN_TIMEOUT_MS = positiveInteger(process.env.DIRECTIVE_SILLYTAVERN_CHAT_TIMEOUT_MS, Math.max(120000, GENERATION_TIMEOUT_MS));
const HOST_NATIVE_COMPLETION_PROOF_TIMEOUT_MS = positiveInteger(
  process.env.DIRECTIVE_SILLYTAVERN_HOST_NATIVE_COMPLETION_PROOF_TIMEOUT_MS,
  Math.min(Math.max(CHAT_CAMPAIGN_TIMEOUT_MS, 360000), 360000)
);
const SIDECAR_SETTLE_TIMEOUT_MS = positiveInteger(
  process.env.DIRECTIVE_SILLYTAVERN_SIDECAR_SETTLE_TIMEOUT_MS,
  Math.min(CHAT_CAMPAIGN_TIMEOUT_MS, 120000)
);
const FINAL_SIDECAR_ACTIVITY_TIMEOUT_MS = positiveInteger(
  process.env.DIRECTIVE_SILLYTAVERN_FINAL_SIDECAR_ACTIVITY_TIMEOUT_MS,
  Math.min(CHAT_CAMPAIGN_TIMEOUT_MS, 30000)
);
const SIDECAR_MODEL_ROLE_IDS = Object.freeze([
  'continuityTracker',
  'relationshipEvaluator',
  'crewDirector',
  'shipDirector',
  'commandBearingEvaluator'
]);
const SCREENSHOT_BASE_DIR = process.env.DIRECTIVE_SILLYTAVERN_SCREENSHOT_DIR
  || path.join(os.tmpdir(), 'directive-sillytavern-smoke-screenshots');
const SCREENSHOT_RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const HELP = args.has('--help') || args.has('-h');
const DRY_RUN = args.has('--dry-run') || args.has('--checklist');

const REQUIRED_ROUTES = Object.freeze([
  'Campaign',
  'Mission',
  'Crew',
  'Ship',
  'Log',
  'Settings'
]);

const ROUTE_IDS = Object.freeze({
  Campaign: 'campaign',
  Mission: 'mission',
  Crew: 'crew',
  Ship: 'ship',
  Log: 'log',
  Settings: 'settings'
});
const ROUTE_PANEL_HEADINGS = Object.freeze({
  Campaign: ['Campaign'],
  Mission: ['Mission'],
  Crew: ['Crew', 'Personnel'],
  Ship: ['Ship'],
  Log: ['Log'],
  Settings: ['Settings']
});

const SAVE_INDEX_USER_FILES_PATH = toSillyTavernUserFilesPath(DIRECTIVE_LOGICAL_STORAGE_KEYS.saveIndex);
let bootstrappedRequestAuth = null;
let requestAuthBootstrapAttempted = false;
let smokeUserAuth = null;

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

function normalizePath(value = '') {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function jsonClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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

function compactReportSummary(report) {
  const browser = report?.browser || {};
  const chatCampaignFlow = browser?.chatCampaignFlow || {};
  const created = chatCampaignFlow?.created || {};
  const final = chatCampaignFlow?.final || {};
  const generationTimingProof = chatCampaignFlow?.generationTimingProof || {};
  const hostNativeCompletionProof = chatCampaignFlow?.hostNativeCompletionProof || {};
  const retainedModelCalls = Array.isArray(final?.modelCalls) ? final.modelCalls : [];
  const staticExtension = report?.staticExtension || {};
  const storage = report?.storage || {};
  return {
    ok: report?.ok === true,
    skipped: report?.skipped === true,
    reason: report?.reason || null,
    baseUrl: report?.baseUrl || null,
    extensionPath: report?.extensionPath || null,
    user: SILLYTAVERN_USER || browser?.authenticatedUser || browser?.browserUser || null,
    liveGeneration: report?.liveGeneration === true,
    staticExtension: {
      ok: staticExtension?.ok ?? null,
      skipped: staticExtension?.skipped ?? null
    },
    storage: {
      ok: storage?.ok ?? null,
      skipped: storage?.skipped ?? null
    },
    browser: {
      skipped: browser?.skipped ?? null,
      authenticatedUser: browser?.authenticatedUser || null,
      generationEnabled: browser?.generationEnabled ?? null,
      chatCampaignEnabled: browser?.chatCampaignEnabled ?? null,
      saveFlowEnabled: browser?.saveFlowEnabled ?? null
    },
    chatCampaign: {
      mode: chatCampaignFlow?.mode || null,
      qualityStatus: chatCampaignFlow?.qualityStatus || null,
      packageId: created?.campaign?.packageId || CAMPAIGN_PACKAGE_ID || null,
      campaignId: created?.campaign?.id || null,
      campaignTitle: created?.campaign?.title || null,
      saveId: created?.binding?.saveId || created?.resumeSaveId || CHAT_CAMPAIGN_RESUME_SAVE_ID || null,
      chatId: final?.currentChatId || created?.binding?.chatId || null,
      messageCount: chatCampaignFlow?.messageCount ?? null,
      sentMessageCount: chatCampaignFlow?.sentMessageCount ?? null,
      turnLedgerCount: final?.turnLedgerCount ?? null,
      commandLogCount: final?.commandLogCount ?? null,
      modelCallCount: final?.modelCallCount ?? retainedModelCalls.length,
      retainedModelCallCount: retainedModelCalls.length,
      failedModelCallCount: retainedModelCalls.filter((call) => call?.status === 'failed' || call?.error).length,
      sidecarCount: final?.sidecarCount ?? null,
      sidecarRejectedCount: chatCampaignFlow?.sidecarRejectedCount ?? null,
      sidecarRejectedDelta: chatCampaignFlow?.sidecarRejectedDelta ?? null,
      pendingInteractionCount: chatCampaignFlow?.pendingInteractionCount ?? null,
      generationTimingStatus: generationTimingProof?.status || null,
      generationTimingProofSource: generationTimingProof?.source || null,
      generationTimingProofTimingSource: generationTimingProof?.timingSource || null,
      generationTimingCheckedTurns: generationTimingProof?.checkedTurnCount ?? null,
      generationTimingSkippedTurns: generationTimingProof?.skippedTurnCount ?? null,
      generationTimingMaxLatencyMs: generationTimingProof?.maxGenerationStartLatencyMs ?? null,
      hostNativeCompletionStatus: hostNativeCompletionProof?.status || null,
      hostNativeCompletionProofSource: hostNativeCompletionProof?.source || null,
      hostNativeCompletionProofCompletionSource: hostNativeCompletionProof?.completionSource || null,
      hostNativeCompletionCount: hostNativeCompletionProof?.completedHostContinueCount ?? null,
      hostNativeCompletionFailureCount: hostNativeCompletionProof?.failedHostContinueCount ?? null,
      hostNativeCompletionRequiredCount: hostNativeCompletionProof?.requiredCompletionCount ?? null,
      hostNativeCompletionRequiredPassCount: hostNativeCompletionProof?.requiredCompletionPassCount ?? null,
      hostNativeCompletionRequiredFailureCount: hostNativeCompletionProof?.requiredCompletionFailureCount ?? null,
      hostNativeCompletionMaxLatencyMs: hostNativeCompletionProof?.maxCompletionLatencyMs ?? null,
      stoppedOnTerminalDecision: chatCampaignFlow?.stoppedOnTerminalDecision === true,
      stoppedOnPendingInteraction: chatCampaignFlow?.stoppedOnPendingInteraction || null,
      perspectiveQualityStatus: chatCampaignFlow?.perspectiveQualityStatus || null,
      narrationQualityStatus: chatCampaignFlow?.narrationQualityStatus || null
    },
    transcript: Array.isArray(chatCampaignFlow?.transcriptCaptures)
      ? chatCampaignFlow.transcriptCaptures.at(-1) || null
      : null,
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
    kind: 'report-artifact',
    status: report?.ok === true ? 'pass' : 'fail',
    reportPath,
    summaryPath
  });
  return {
    reportPath,
    summaryPath
  };
}

function usage() {
  return `SillyTavern live smoke scaffold

Default safe modes:
  node tools\\scripts\\smoke-sillytavern-live.mjs --dry-run
  node tools\\scripts\\smoke-sillytavern-live.mjs

Live host:
  $env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
  node tools\\scripts\\smoke-sillytavern-live.mjs

Optional checks:
  DIRECTIVE_SILLYTAVERN_BROWSER=1   check the live browser shell with Playwright or Edge/Chrome CDP
  DIRECTIVE_SILLYTAVERN_TOGGLE_ONLY=1
                                      with browser mode, stop after proving the Directive enabled switch off/on path
  DIRECTIVE_SILLYTAVERN_STORAGE=1   write, verify, read, and delete one smoke-owned JSON file
  DIRECTIVE_SILLYTAVERN_SAVE_FLOW=1 click Campaign Records Save Game, Save Game As..., and reselect the new branch
  DIRECTIVE_SILLYTAVERN_GENERATION=1 or DIRECTIVE_LIVE_GENERATION=1
                                      allow Accept Outcome to run narration/provider calls
  DIRECTIVE_SILLYTAVERN_CHAT_CAMPAIGN=1
                                      create a fresh campaign, bind/open its SillyTavern chat, and send real chat turns
  DIRECTIVE_SILLYTAVERN_FACT_REVIEW_ONLY=1
                                      run only the in-browser factualGroundingReviewer provider call
  DIRECTIVE_SILLYTAVERN_FACT_REVIEW_REQUEST_PATH='fact-checks\\model-assisted-review\\request.json'
                                      model-assisted factual review request for fact-review-only mode
  DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_ONLY=1
                                      run only the in-browser storyQualityReviewer provider call
  DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_REQUEST_PATH='quality-review\\model-assisted-review\\request.json'
                                      model-assisted story quality review request for story-quality-review-only mode
  DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID='save-...'
                                      resume that saved campaign instead of creating a fresh campaign
  DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID='Directive - ...'
                                      assert the resumed save opens the expected bound SillyTavern chat
  DIRECTIVE_SILLYTAVERN_SCREENSHOTS=1 capture desktop and phone-width route screenshots
  DIRECTIVE_SILLYTAVERN_RESIZE_SWEEP=1 resize the desktop drawer through compact/standard/wide route screenshots and diagnostics
  DIRECTIVE_SILLYTAVERN_TEARDOWN=1   invoke the served disable lifecycle and verify cleanup
  DIRECTIVE_SILLYTAVERN_STRICT=1    fail instead of reporting optional-check skips

Optional host config:
  DIRECTIVE_SILLYTAVERN_EXTENSION_PATH=/scripts/extensions/third-party/Directive
  DIRECTIVE_SILLYTAVERN_SCREENSHOT_DIR='C:\\tmp\\directive-sillytavern-smoke'
  DIRECTIVE_SILLYTAVERN_CHAT_TIMEOUT_MS=120000
  DIRECTIVE_SILLYTAVERN_CAMPAIGN_PACKAGE_ID='directive:campaign-package:breckenridge-ashes-of-peace'
  SILLYTAVERN_COOKIE='name=value'
  SILLYTAVERN_REQUEST_TOKEN='<csrf token>'
  SILLYTAVERN_AUTH_HEADER='Bearer ...'
  DIRECTIVE_SILLYTAVERN_USER='directive-soak-a'
`;
}

function checklist() {
  return {
    intendedCoverage: [
      'served Directive manifest and extension source assets',
      'extensions-menu registration for Directive',
      'extensions settings dropdown with Directive enabled switch and Open Runtime control',
      'browser-mode Directive enabled switch off/on behavior',
      'global Directive bridge registration',
      'left command-spine runtime shell rendering',
      'single drawer header action cluster and bottom-right resize handle',
      'bottom-right resize handle drag changes drawer geometry and can be reset',
      'optional compact, standard, and wide drawer resize sweep across every route',
      'Campaign, Mission, Crew, Ship, Log, and Settings route tabs',
      'optional active-campaign Mission preview, discard, commit, Campaign Records Save Game, Save Game As..., and branch reselect browser flow',
      'optional chat-native campaign creation, SillyTavern chat binding, real player message sends, provider calls, response posting, and runtime diagnostics',
      'optional desktop and phone-width screenshots for every Directive route',
      'phone-width direct bottom navigation fallback',
      'optional SillyTavern /api/files upload, verify, read, and delete for one smoke-owned file',
      'opt-in provider routing through a live Accept Outcome narration commit',
      'teardown/disable cleanup once a live host exposes a repeatable automation surface'
    ],
    noGenerationByDefault: true,
    storageWriteRequires: 'DIRECTIVE_SILLYTAVERN_STORAGE=1',
    browserRequires: 'DIRECTIVE_SILLYTAVERN_BROWSER=1 and either local Playwright or installed Edge/Chrome CDP support',
    saveFlowRequires: 'DIRECTIVE_SILLYTAVERN_SAVE_FLOW=1, an active campaign, and readable SillyTavern storage for branch reselect proof',
    generationRequires: 'DIRECTIVE_SILLYTAVERN_GENERATION=1 or DIRECTIVE_LIVE_GENERATION=1',
    chatCampaignRequires: 'DIRECTIVE_SILLYTAVERN_BROWSER=1, DIRECTIVE_SILLYTAVERN_CHAT_CAMPAIGN=1, and DIRECTIVE_SILLYTAVERN_GENERATION=1 or DIRECTIVE_LIVE_GENERATION=1',
    chatCampaignResumeRequires: 'DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID for deterministic continuation, optionally DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID for bound-chat assertion',
    screenshotsRequire: 'DIRECTIVE_SILLYTAVERN_BROWSER=1 and DIRECTIVE_SILLYTAVERN_SCREENSHOTS=1',
    resizeSweepRequires: 'DIRECTIVE_SILLYTAVERN_BROWSER=1 and DIRECTIVE_SILLYTAVERN_RESIZE_SWEEP=1',
    teardownRequires: 'DIRECTIVE_SILLYTAVERN_BROWSER=1 and DIRECTIVE_SILLYTAVERN_TEARDOWN=1',
    liveHostRequires: 'SILLYTAVERN_BASE_URL or ST_BASE_URL'
  };
}

function compact(value, maxLength = 700) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const redacted = redactSecrets(text);
  return redacted.length <= maxLength ? redacted : `${redacted.slice(0, maxLength)}...`;
}

class NonJsonResponseError extends Error {
  constructor({ method, path, status, contentType, raw }) {
    const type = contentType || 'unknown content type';
    super(`${method} ${path} returned non-JSON response (${status}, ${type}). Excerpt: ${compact(raw, 180)}`);
    this.name = 'NonJsonResponseError';
    this.method = method;
    this.path = path;
    this.status = status;
    this.contentType = contentType || '';
    this.excerpt = compact(raw, 180);
  }
}

class HttpResponseError extends Error {
  constructor({ method, path, status, contentType, raw }) {
    const type = contentType || 'unknown content type';
    super(`${method} ${path} failed with ${status} (${type}): ${compact(raw)}`);
    this.name = 'HttpResponseError';
    this.method = method;
    this.path = path;
    this.status = status;
    this.contentType = contentType || '';
    this.excerpt = compact(raw, 180);
  }
}

class OptionalCheckSkipError extends Error {
  constructor(result) {
    super(result?.reason || 'Optional check skipped.');
    this.name = 'OptionalCheckSkipError';
    this.result = result;
  }
}

function assertContains(text, needle, label) {
  if (!String(text || '').includes(needle)) {
    throw new Error(`${label} is missing "${needle}". Served ${String(text || '').length} bytes. Excerpt: ${compact(text, 260)}`);
  }
}

function assertOmits(text, needle, label) {
  if (String(text || '').includes(needle)) {
    throw new Error(`${label} should not include "${needle}". Served ${String(text || '').length} bytes. Excerpt: ${compact(text, 260)}`);
  }
}

function redactSecrets(value) {
  let text = String(value);
  for (const secret of [
    process.env.SILLYTAVERN_COOKIE,
    process.env.SILLYTAVERN_REQUEST_TOKEN,
    process.env.SILLYTAVERN_AUTH_HEADER,
    bootstrappedRequestAuth?.cookie,
    bootstrappedRequestAuth?.csrfToken
  ].filter(Boolean)) {
    text = text.split(secret).join('[redacted]');
  }
  return text;
}

function errorSummary(error) {
  if (error instanceof Error) {
    const summary = {
      name: error.name,
      message: redactSecrets(error.message)
    };
    if (error.details) summary.details = error.details;
    return summary;
  }
  return {
    name: typeof error,
    message: compact(error)
  };
}

function compactErrorSummary(error, maxDetails = 2400) {
  if (!error) return null;
  const summary = {
    name: error.name || 'Error',
    message: compact(redactSecrets(error.message || String(error)), 1200)
  };
  if (error.stack) {
    summary.stack = redactSecrets(error.stack).split('\n').slice(0, 4).join('\n');
  }
  if (error.details !== undefined) {
    let detailsText = '';
    try {
      detailsText = JSON.stringify(error.details);
    } catch {
      detailsText = String(error.details);
    }
    summary.detailsPreview = compact(redactSecrets(detailsText), maxDetails);
  }
  return summary;
}

function isStorageEndpointUnavailableStatus(status) {
  return [0, 401, 403, 404, 405].includes(Number(status));
}

function formatOptionalSkip(result) {
  const parts = [result?.reason || 'Optional check skipped.'];
  if (result?.endpoint) {
    parts.push(`${result.endpoint} returned ${result.status ?? 'unknown'} (${result.contentType || 'unknown content type'}).`);
  }
  if (result?.excerpt) {
    parts.push(`Excerpt: ${result.excerpt}`);
  }
  return parts.join(' ');
}

function maybeReturnOptionalSkip(result) {
  if (STRICT) {
    throw new Error(formatOptionalSkip(result));
  }
  return result;
}

function splitSetCookieHeader(value = '') {
  return String(value || '')
    .split(/,(?=\s*[^=;,\s]+=)/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setCookieHeaders(headers) {
  if (typeof headers?.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const rawHeaders = typeof headers?.raw === 'function' ? headers.raw() : null;
  if (Array.isArray(rawHeaders?.['set-cookie'])) {
    return rawHeaders['set-cookie'];
  }
  const combined = headers?.get?.('set-cookie') || '';
  return splitSetCookieHeader(combined);
}

function cookiePair(setCookieValue = '') {
  return String(setCookieValue || '').split(';')[0].trim();
}

function mergeCookieHeader(...cookieHeaders) {
  const pairsByName = new Map();
  for (const header of cookieHeaders.filter(Boolean)) {
    for (const pair of String(header).split(';').map((item) => item.trim()).filter(Boolean)) {
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      pairsByName.set(pair.slice(0, separator), pair);
    }
  }
  return [...pairsByName.values()].join('; ');
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

function parseMaybeJson(raw = '') {
  if (!String(raw || '').trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeChatScriptEntry(entry, index) {
  if (typeof entry === 'string') {
    const text = entry.trim();
    if (!text) return null;
    const perspectiveEvidence = playerInputPerspectiveEvidence(text);
    return {
      id: `message-${index + 1}`,
      label: `Message ${index + 1}`,
      category: 'custom',
      text,
      perspective: perspectiveEvidence.declaredPerspective,
      detectedPerspective: perspectiveEvidence.detectedPerspective,
      firstPersonNarrationSuspected: perspectiveEvidence.firstPersonNarrationSuspected,
      preferredPlayEvidence: perspectiveEvidence.preferredPlayEvidence,
      perspectiveWarning: perspectiveEvidence.perspectiveWarning
    };
  }
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const text = String(entry.text || entry.message || entry.playerMessage || '').trim();
    if (!text) return null;
    const perspectiveEvidence = playerInputPerspectiveEvidence(text, entry.perspective || entry.playerInputPerspective || '');
    const turn = Number(entry.turn);
    return {
      id: String(entry.id || `message-${index + 1}`),
      turn: Number.isFinite(turn) && turn > 0 ? turn : null,
      label: String(entry.label || entry.id || `Message ${index + 1}`),
      category: String(entry.category || entry.kind || 'custom'),
      text,
      perspective: perspectiveEvidence.declaredPerspective,
      detectedPerspective: perspectiveEvidence.detectedPerspective,
      firstPersonNarrationSuspected: perspectiveEvidence.firstPersonNarrationSuspected,
      preferredPlayEvidence: perspectiveEvidence.preferredPlayEvidence,
      perspectiveWarning: perspectiveEvidence.perspectiveWarning,
      expectedRoute: entry.expectedRoute ? String(entry.expectedRoute) : null,
      expectedResponseStrategy: entry.expectedResponseStrategy ? String(entry.expectedResponseStrategy) : null,
      hostNativeCompletionRequired: entry.hostNativeCompletionRequired === true,
      pendingResolutionText: String(entry.pendingResolutionText || entry.pendingReply || '').trim(),
      clarificationText: String(entry.clarificationText || '').trim(),
      riskConfirmationText: String(entry.riskConfirmationText || '').trim(),
      assist: entry.assist && typeof entry.assist === 'object' && !Array.isArray(entry.assist)
        ? jsonClone(entry.assist)
        : null,
      send: entry.send === false ? false : true
    };
  }
  return null;
}

function parseChatMessageScriptPayload(payload, source) {
  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const rawMessages = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed?.messages) ? parsed.messages : []);
  const messages = rawMessages
    .map((entry, index) => normalizeChatScriptEntry(entry, index))
    .filter(Boolean);
  if (messages.length === 0) {
    throw new Error(`${source} did not contain any usable chat messages.`);
  }
  const hostNativeCompletionRequiredMessages = messages
    .filter((message) => message.hostNativeCompletionRequired === true)
    .map((message) => ({
      id: message.id,
      turn: message.turn,
      label: message.label,
      category: message.category,
      expectedRoute: message.expectedRoute || null,
      expectedResponseStrategy: message.expectedResponseStrategy || null
    }));
  return { source, messages, hostNativeCompletionRequiredMessages };
}

function csrfTokenFromPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  return String(
    payload.token
    || payload.csrfToken
    || payload.csrf
    || payload.requestToken
    || payload._csrf
    || ''
  ).trim();
}

async function ensureRequestAuth() {
  if (SILLYTAVERN_USER) {
    if (!smokeUserAuth) {
      smokeUserAuth = await authenticateSillyTavernUser({
        baseUrl: BASE_URL,
        handle: SILLYTAVERN_USER,
        password: configuredUserPassword(SILLYTAVERN_USER),
        timeoutMs: BROWSER_TIMEOUT_MS
      });
      if (!smokeUserAuth.ok) {
        throw new Error(`Could not authenticate SillyTavern user ${SILLYTAVERN_USER}: ${smokeUserAuth.error || smokeUserAuth.loginStatus || 'unknown error'}`);
      }
      bootstrappedRequestAuth = {
        csrfToken: smokeUserAuth.csrfToken || smokeUserAuth.headers?.['X-CSRF-Token'] || '',
        cookie: smokeUserAuth.headers.Cookie || smokeUserAuth.headers.cookie || '',
        source: `api-users-login:${SILLYTAVERN_USER}`
      };
    }
    return bootstrappedRequestAuth;
  }

  const completeEnvAuth = Boolean(
    process.env.SILLYTAVERN_AUTH_HEADER
    || (process.env.SILLYTAVERN_COOKIE && process.env.SILLYTAVERN_REQUEST_TOKEN)
  );
  if (requestAuthBootstrapAttempted || completeEnvAuth) {
    return bootstrappedRequestAuth;
  }
  requestAuthBootstrapAttempted = true;
  if (!BASE_URL) {
    return null;
  }
  try {
    const headers = {
      accept: 'application/json, */*'
    };
    if (process.env.SILLYTAVERN_COOKIE) {
      headers.cookie = process.env.SILLYTAVERN_COOKIE;
    }
    const response = await fetch(`${BASE_URL}/csrf-token`, {
      method: 'GET',
      headers
    });
    const raw = await response.text();
    const payload = parseMaybeJson(raw);
    const csrfToken = csrfTokenFromPayload(payload);
    const cookie = mergeCookieHeader(...setCookieHeaders(response.headers).map(cookiePair));
    if (response.ok && (csrfToken || cookie)) {
      bootstrappedRequestAuth = {
        csrfToken,
        cookie,
        source: '/csrf-token'
      };
    }
  } catch {
    bootstrappedRequestAuth = null;
  }
  return bootstrappedRequestAuth;
}

function requestHeaders({ json = false } = {}) {
  const headers = {
    accept: json ? 'application/json, */*' : 'text/plain, application/javascript, text/css, application/json, */*'
  };
  if (json) {
    headers['content-type'] = 'application/json';
  }
  if (process.env.SILLYTAVERN_COOKIE) {
    headers.cookie = mergeCookieHeader(process.env.SILLYTAVERN_COOKIE, bootstrappedRequestAuth?.cookie);
  } else if (bootstrappedRequestAuth?.cookie) {
    headers.cookie = bootstrappedRequestAuth.cookie;
  }
  if (process.env.SILLYTAVERN_AUTH_HEADER) {
    headers.authorization = process.env.SILLYTAVERN_AUTH_HEADER;
  }
  if (process.env.SILLYTAVERN_REQUEST_TOKEN) {
    headers['x-csrf-token'] = process.env.SILLYTAVERN_REQUEST_TOKEN;
  } else if (bootstrappedRequestAuth?.csrfToken) {
    headers['x-csrf-token'] = bootstrappedRequestAuth.csrfToken;
  }
  return headers;
}

async function http(path, {
  method = 'GET',
  body,
  text = false,
  allowFailure = false
} = {}) {
  assert.ok(BASE_URL, 'SILLYTAVERN_BASE_URL is required for live HTTP checks.');
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: requestHeaders({ json: body !== undefined }),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const raw = await response.text();
  const contentType = response.headers.get('content-type') || '';
  let payload = null;
  if (!response.ok && !allowFailure) {
    throw new HttpResponseError({
      method,
      path,
      status: response.status,
      contentType,
      raw
    });
  }
  if (text) {
    payload = raw;
  } else if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new NonJsonResponseError({
        method,
        path,
        status: response.status,
        contentType,
        raw
      });
    }
  }
  return {
    response,
    payload,
    raw,
    status: response.status,
    contentType
  };
}

async function verifyStaticExtension() {
  await ensureRequestAuth();
  const manifest = (await http(`${EXTENSION_PATH}/manifest.json`)).payload;
  assert.equal(manifest.display_name, 'Directive');
  assert.equal(manifest.key, 'directive');
  assert.equal(manifest.js, 'src/extension/index.js');
  assert.equal(manifest.css, 'styles/directive.css');

  const entry = (await http(`${EXTENSION_PATH}/${manifest.js}`, { text: true })).payload;
  if (!/bootstrapDirectiveExtension|configureRuntimeActions/.test(entry)) {
    throw new Error(`Directive entry script does not look current. Served ${entry.length} bytes. Excerpt: ${compact(entry, 260)}`);
  }

  const css = (await http(`${EXTENSION_PATH}/${manifest.css}`, { text: true })).payload;
  if (!/directive-runtime-panel|directive-command-spine-shell|directive-command-drawer/.test(css)) {
    throw new Error(`Directive CSS does not include runtime shell styles. Served ${css.length} bytes. Excerpt: ${compact(css, 260)}`);
  }
  assertContains(css, 'directive-extension-dropdown-title', 'Directive CSS');
  assertContains(css, 'directive-extension-enable-slider', 'Directive CSS');
  assertContains(css, 'directive-runtime-window-actions', 'Directive CSS');

  const sillyTavernBootstrap = (await http(`${EXTENSION_PATH}/src/hosts/sillytavern/bootstrap.js`, { text: true })).payload;
  assertContains(sillyTavernBootstrap, 'applySillyTavernDirectiveFeatureState', 'Directive SillyTavern bootstrap source');
  const featureToggle = (await http(`${EXTENSION_PATH}/src/hosts/sillytavern/feature-toggle.mjs`, { text: true })).payload;
  assertContains(featureToggle, 'installExtensionsMenuDropdown', 'Directive SillyTavern feature-toggle source');
  assertContains(featureToggle, 'setSillyTavernDirectiveEnabledSetting', 'Directive SillyTavern feature-toggle source');

  const settingsPanel = (await http(`${EXTENSION_PATH}/src/extension/settings-panel.js`, { text: true })).payload;
  assertContains(settingsPanel, 'DIRECTIVE_OPEN_RUNTIME_BUTTON_ID', 'Directive settings panel source');
  assertContains(settingsPanel, 'DIRECTIVE_EXTENSION_ENABLE_TOGGLE_ID', 'Directive settings panel source');
  assertContains(settingsPanel, 'Directive enabled', 'Directive settings panel source');
  assertContains(settingsPanel, 'Open Runtime', 'Directive settings panel source');

  const runtimeShell = (await http(`${EXTENSION_PATH}/src/runtime/runtime-shell.js`, { text: true })).payload;
  assertContains(runtimeShell, 'createDirectiveCommandSpineShell', 'Directive runtime shell source');

  const commandSpineShell = (await http(`${EXTENSION_PATH}/src/ui/directive-command-spine-shell.js`, { text: true })).payload;
  assertContains(commandSpineShell, "panel.dataset.directiveShell = 'command-spine'", 'Directive command spine source');
  assertContains(commandSpineShell, 'createDrawerResizeHandle', 'Directive command spine source');
  assertOmits(commandSpineShell, "createDrawerResizeHandle({ edge: 'left'", 'Directive command spine source');
  assertContains(commandSpineShell, "createDrawerResizeHandle({ edge: 'right'", 'Directive command spine source');
  assertContains(commandSpineShell, "dataset.directiveShellActions = 'drawer-header'", 'Directive command spine source');

  const shellLayout = (await http(`${EXTENSION_PATH}/src/ui/directive-shell-layout.mjs`, { text: true })).payload;
  assertContains(shellLayout, 'viewport.width * 0.47', 'Directive shell layout source');
  assertContains(shellLayout, 'DIRECTIVE_SHELL_LAYOUT_STORAGE_KEY', 'Directive shell layout source');

  return {
    manifest: {
      displayName: manifest.display_name,
      key: manifest.key,
      version: manifest.version,
      js: manifest.js,
      css: manifest.css
    },
    entryBytes: entry.length,
    cssBytes: css.length,
    sillyTavernBootstrapBytes: sillyTavernBootstrap.length,
    featureToggleBytes: featureToggle.length,
    settingsPanelBytes: settingsPanel.length,
    extensionDropdownSource: true,
    runtimeShellBytes: runtimeShell.length,
    commandSpineShellBytes: commandSpineShell.length,
    shellLayoutBytes: shellLayout.length,
    commandSpineSource: true
  };
}

async function runStorageSmoke() {
  if (!RUN_STORAGE) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_STORAGE=1 not set'
    };
  }

  const fileName = `directive-sillytavern-live-smoke-${Date.now()}.v1.json`;
  const body = {
    kind: 'directive.sillyTavernLiveSmoke',
    createdAt: new Date().toISOString(),
    destructive: false
  };
  const encoded = Buffer.from(`${JSON.stringify(body, null, 2)}\n`, 'utf8').toString('base64');
  let storedPath = '';

  try {
    try {
      const authBootstrap = await ensureRequestAuth();
      const upload = (await http('/api/files/upload', {
        method: 'POST',
        body: {
          name: fileName,
          data: encoded
        }
      })).payload;
      storedPath = String(upload?.path || '');
      assert.equal(storedPath, `/user/files/${fileName}`);

      const verified = (await http('/api/files/verify', {
        method: 'POST',
        body: {
          urls: [storedPath]
        }
      })).payload;
      assert.equal(verified?.[storedPath], true);

      const readBackResult = await http(storedPath, { text: true });
      let readBackPayload;
      try {
        readBackPayload = JSON.parse(readBackResult.payload);
      } catch {
        throw new NonJsonResponseError({
          method: 'GET',
          path: storedPath,
          status: readBackResult.status,
          contentType: readBackResult.contentType,
          raw: readBackResult.payload
        });
      }
      assert.equal(readBackPayload.kind, body.kind);

      return {
        skipped: false,
        path: storedPath,
        verified: true,
        readBack: true,
        authBootstrap: authBootstrap?.source || 'env-or-not-required'
      };
    } finally {
      if (storedPath) {
        await http('/api/files/delete', {
          method: 'POST',
          body: {
            path: storedPath
          },
          text: true,
          allowFailure: false
        });
      }
    }
  } catch (error) {
    if (error instanceof NonJsonResponseError) {
      const result = {
        skipped: true,
        reason: 'SillyTavern file API returned a non-JSON response; storage smoke was not proven and no smoke-owned cleanup path was available.',
        endpoint: `${error.method} ${error.path}`,
        status: error.status,
        contentType: error.contentType || 'unknown',
        excerpt: error.excerpt
      };
      if (STRICT) {
        throw new Error(`${result.reason} ${result.endpoint} returned ${result.status} (${result.contentType}). Excerpt: ${result.excerpt}`);
      }
      return result;
    }
    if (error instanceof HttpResponseError && isStorageEndpointUnavailableStatus(error.status)) {
      return maybeReturnOptionalSkip({
        skipped: true,
        reason: 'SillyTavern file API endpoint was missing or forbidden; storage smoke was not proven and no smoke-owned cleanup path was available.',
        endpoint: `${error.method} ${error.path}`,
        status: error.status,
        contentType: error.contentType || 'unknown',
        excerpt: error.excerpt
      });
    }
    throw error;
  }
}

function browserSkip(reason) {
  if (STRICT) {
    throw new Error(reason);
  }
  return {
    skipped: true,
    reason
  };
}

function isPlaywrightDependencyError(error) {
  const message = String(error?.message || error || '');
  return /Cannot find package 'playwright'|Executable doesn't exist|playwright install|Host system is missing dependencies|browserType\.launch/i.test(message);
}

function assertBrowser(condition, message, details = null) {
  if (!condition) {
    const error = new Error(details ? `${message}: ${compact(details, 420)}` : message);
    if (details) error.details = details;
    throw error;
  }
}

async function evaluateBrowserJson(page, pageFunction, arg = null, timeoutMs = BROWSER_TIMEOUT_MS) {
  const evaluationTimeoutMs = Math.max(1, Number(timeoutMs || BROWSER_TIMEOUT_MS));
  let timeoutId = null;
  return Promise.race([
    page.evaluate(pageFunction, arg),
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(`Browser evaluation did not settle after ${evaluationTimeoutMs}ms.`);
        error.code = 'BROWSER_EVALUATION_TIMEOUT';
        reject(error);
      }, evaluationTimeoutMs);
    })
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

async function waitForJsonValue(page, pageFunction, arg = null, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeout || BROWSER_TIMEOUT_MS));
  const pollMs = Math.max(50, Number(options.polling || 250));
  const evaluationTimeoutMs = Math.max(1, Number(options.evaluationTimeout || Math.min(timeoutMs, BROWSER_TIMEOUT_MS)));
  const started = Date.now();
  let lastValue = null;
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      lastValue = await evaluateBrowserJson(page, pageFunction, arg, evaluationTimeoutMs);
      lastError = null;
      if (lastValue) return lastValue;
    } catch (error) {
      lastError = error;
      if (error?.code === 'BROWSER_EVALUATION_TIMEOUT') break;
    }
    await page.waitForTimeout(Math.min(pollMs, Math.max(0, timeoutMs - (Date.now() - started))));
  }
  const error = new Error(`Timed out waiting for browser condition after ${timeoutMs}ms.`);
  error.details = {
    timeoutMs,
    lastValue,
    lastError: lastError ? {
      name: lastError.name || 'Error',
      message: lastError.message || String(lastError)
    } : null
  };
  throw error;
}

async function browserStep(label, operation) {
  try {
    return await operation();
  } catch (error) {
    const wrapped = new Error(`Browser smoke failed during ${label}: ${error?.message || error}`);
    if (error?.details) wrapped.details = error.details;
    throw wrapped;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function cdpBrowserCandidates() {
  return [
    process.env.DIRECTIVE_SILLYTAVERN_BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ].filter(Boolean);
}

async function reserveLocalPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForCdpEndpoint(port, timeoutMs) {
  const started = Date.now();
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(versionUrl);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Browser process is still starting.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for Chromium CDP endpoint on ${versionUrl}.`);
}

class CdpConnection {
  constructor(webSocketUrl, {
    sessionId = null
  } = {}) {
    this.webSocketUrl = webSocketUrl;
    this.sessionId = sessionId;
    this.nextId = 1;
    this.pending = new Map();
    this.socket = null;
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.webSocketUrl);
      this.socket = socket;
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', (event) => {
        reject(new Error(event?.message || `Failed to connect to ${this.webSocketUrl}.`));
      }, { once: true });
      socket.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });
      socket.addEventListener('close', () => {
        this.rejectPending('CDP socket closed.');
      });
      socket.addEventListener('error', () => {
        this.rejectPending('CDP socket error.');
      });
    });
  }

  rejectPending(message) {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
      this.pending.delete(id);
    }
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message.id || !this.pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = this.pending.get(message.id);
    clearTimeout(this.pending.get(message.id).timer);
    this.pending.delete(message.id);
    if (message.error) {
      reject(new Error(`${message.error.message || 'CDP command failed'} (${message.error.code || 'unknown code'})`));
      return;
    }
    resolve(message.result || {});
  }

  send(method, params = {}, options = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('CDP socket is not open.');
    }
    const id = this.nextId++;
    const payload = JSON.stringify({
      id,
      method,
      params,
      ...(this.sessionId && options.browser !== true ? { sessionId: this.sessionId } : {})
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP command ${method}.`));
      }, BROWSER_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(payload);
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // Best effort.
    }
  }
}

function serializeCdpArgument(value) {
  if (typeof value === 'undefined') {
    return 'undefined';
  }
  return JSON.stringify(value);
}

function cdpFunctionExpression(pageFunction, args) {
  const source = typeof pageFunction === 'function'
    ? pageFunction.toString()
    : `() => (${String(pageFunction)})`;
  return `(() => {
    const __directiveSmokeFn = ${source};
    return __directiveSmokeFn(${args.map(serializeCdpArgument).join(', ')});
  })()`;
}

class CdpLocator {
  constructor(page, definition) {
    this.page = page;
    this.definition = {
      selector: definition.selector,
      filterText: definition.filterText || '',
      role: definition.role || '',
      name: definition.name || '',
      exact: Boolean(definition.exact),
      firstOnly: Boolean(definition.firstOnly)
    };
  }

  first() {
    return new CdpLocator(this.page, {
      ...this.definition,
      firstOnly: true
    });
  }

  filter({ hasText } = {}) {
    return new CdpLocator(this.page, {
      ...this.definition,
      filterText: String(hasText || '')
    });
  }

  getByRole(role, options = {}) {
    return new CdpLocator(this.page, {
      selector: this.definition.selector,
      filterText: this.definition.filterText,
      role,
      name: String(options.name || ''),
      exact: Boolean(options.exact)
    });
  }

  async count() {
    return this.page.evaluate((definition) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const roots = Array.from(document.querySelectorAll(definition.selector || 'body'))
        .filter((element) => !definition.filterText || normalize(element.textContent).includes(definition.filterText));
      let elements = roots;
      if (definition.role === 'button') {
        elements = roots.flatMap((root) => Array.from(root.querySelectorAll('button, [role="button"]')))
          .filter((element) => {
            const text = normalize(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '');
            return definition.exact ? text === definition.name : text.includes(definition.name);
          });
      }
      return definition.firstOnly ? Math.min(elements.length, 1) : elements.length;
    }, this.definition);
  }

  async waitFor({ timeout = BROWSER_TIMEOUT_MS } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await this.count() > 0) {
        return;
      }
      await sleep(100);
    }
    throw new Error(`Locator "${this.definition.selector}" did not appear before timeout.`);
  }

  async click({ timeout = BROWSER_TIMEOUT_MS } = {}) {
    await this.waitFor({ timeout });
    const clicked = await this.page.evaluate((definition) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const roots = Array.from(document.querySelectorAll(definition.selector || 'body'))
        .filter((element) => !definition.filterText || normalize(element.textContent).includes(definition.filterText));
      let elements = roots;
      if (definition.role === 'button') {
        elements = roots.flatMap((root) => Array.from(root.querySelectorAll('button, [role="button"]')))
          .filter((element) => {
            const text = normalize(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '');
            return definition.exact ? text === definition.name : text.includes(definition.name);
          });
      }
      const element = elements[0];
      if (!element) return false;
      element.scrollIntoView?.({ block: 'center', inline: 'center' });
      element.click();
      return true;
    }, this.definition);
    assertBrowser(clicked, `Locator "${this.definition.selector}" could not be clicked.`, this.definition);
  }

  async fill(value) {
    const filled = await this.page.evaluate((definition, nextValue) => {
      const element = Array.from(document.querySelectorAll(definition.selector || 'input, textarea'))[0];
      if (!element) return false;
      element.focus?.();
      element.value = nextValue;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, this.definition, String(value || ''));
    assertBrowser(filled, `Locator "${this.definition.selector}" could not be filled.`, this.definition);
  }

  async evaluateAll(pageFunction) {
    return this.page.evaluate((definition, functionSource) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const roots = Array.from(document.querySelectorAll(definition.selector || 'body'))
        .filter((element) => !definition.filterText || normalize(element.textContent).includes(definition.filterText));
      let elements = roots;
      if (definition.role === 'button') {
        elements = roots.flatMap((root) => Array.from(root.querySelectorAll('button, [role="button"]')))
          .filter((element) => {
            const text = normalize(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '');
            return definition.exact ? text === definition.name : text.includes(definition.name);
          });
      }
      const mapper = new Function(`return (${functionSource});`)();
      return mapper(elements);
    }, this.definition, pageFunction.toString());
  }
}

class CdpPage {
  constructor(connection) {
    this.connection = connection;
  }

  async initialize() {
    await this.connection.send('Runtime.enable');
    await this.connection.send('Page.enable');
  }

  async goto(url) {
    await this.connection.send('Page.navigate', { url });
    await this.waitForFunction(() => ['interactive', 'complete'].includes(document.readyState), null, {
      timeout: BROWSER_TIMEOUT_MS
    });
  }

  async waitForLoadState() {
    await sleep(500);
  }

  async setViewportSize({ width, height }) {
    await this.connection.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 560,
      screenWidth: width,
      screenHeight: height
    });
    await this.connection.send('Emulation.setVisibleSize', {
      width,
      height
    }).catch(() => {});
  }

  async screenshot({ path: filePath } = {}) {
    const result = await this.connection.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false
    });
    const bytes = Buffer.from(result.data || '', 'base64');
    if (filePath) {
      fs.writeFileSync(filePath, bytes);
    }
    return bytes;
  }

  async evaluate(pageFunction, ...args) {
    const expression = cdpFunctionExpression(pageFunction, args);
    const result = await this.connection.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(details.exception?.description || details.text || 'CDP evaluation failed.');
    }
    return result.result?.value;
  }

  async waitForFunction(pageFunction, arg = null, options = {}) {
    const timeout = positiveInteger(options?.timeout, BROWSER_TIMEOUT_MS);
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const result = await this.evaluate(pageFunction, arg);
      if (result) {
        return result;
      }
      await sleep(100);
    }
    throw new Error('Timed out waiting for browser function.');
  }

  locator(selector) {
    return new CdpLocator(this, { selector });
  }
}

class CdpBrowser {
  constructor({
    executablePath,
    process,
    tempUserDataDir,
    connection
  }) {
    this.executablePath = executablePath;
    this.process = process;
    this.tempUserDataDir = tempUserDataDir;
    this.connection = connection;
  }

  async newPage() {
    const page = new CdpPage(this.connection);
    await page.initialize();
    return page;
  }

  async close() {
    try {
      await this.connection.send('Browser.close', {}, { browser: true });
    } catch {
      // Browser may already be closing.
    }
    this.connection.close();
    try {
      this.process.kill();
    } catch {
      // Best effort.
    }
    try {
      fs.rmSync(this.tempUserDataDir, {
        recursive: true,
        force: true
      });
    } catch {
      // Best effort.
    }
  }
}

async function launchCdpBrowser() {
  if (typeof WebSocket !== 'function') {
    throw new Error('Node WebSocket support is not available for CDP fallback.');
  }
  const executablePaths = cdpBrowserCandidates().filter((candidate) => fs.existsSync(candidate));
  if (executablePaths.length === 0) {
    throw new Error('No Edge or Chrome executable was found. Set DIRECTIVE_SILLYTAVERN_BROWSER_PATH to use CDP fallback.');
  }

  const failures = [];
  for (const executablePath of executablePaths) {
    try {
      return await launchCdpBrowserExecutable(executablePath);
    } catch (error) {
      failures.push(`${executablePath}: ${error?.message || error}`);
    }
  }

  throw new Error(`No installed Chromium CDP endpoint could be opened. ${failures.join(' | ')}`);
}

async function launchCdpBrowserExecutable(executablePath) {
  const port = await reserveLocalPort();
  const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'directive-smoke-cdp-'));
  const args = [
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempUserDataDir}`,
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-webgpu',
    '--disable-features=SkiaGraphite,DawnGraphite',
    '--window-size=1280,900'
  ];
  if (HEADLESS) {
    args.push('--headless=new');
  }

  const browserProcess = spawn(executablePath, args, {
    stdio: 'ignore',
    windowsHide: true
  });
  browserProcess.unref?.();

  try {
    const version = await waitForCdpEndpoint(port, BROWSER_TIMEOUT_MS);
    const connection = new CdpConnection(version.webSocketDebuggerUrl);
    await connection.connect();
    const target = await connection.send('Target.createTarget', {
      url: 'about:blank'
    }, { browser: true });
    const attached = await connection.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true
    }, { browser: true });
    connection.sessionId = attached.sessionId;
    return new CdpBrowser({
      executablePath,
      process: browserProcess,
      tempUserDataDir,
      connection
    });
  } catch (error) {
    try {
      browserProcess.kill();
    } catch {
      // Best effort.
    }
    try {
      fs.rmSync(tempUserDataDir, {
        recursive: true,
        force: true
      });
    } catch {
      // Best effort.
    }
    throw error;
  }
}

async function openDirectivePanel(page) {
  await page.waitForFunction(() => {
    if (typeof globalThis.Directive?.bridge?.showRuntime === 'function') return true;
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') return true;
    if (typeof globalThis.Directive?.actions?.run === 'function') return true;
    if (document.getElementById('directive-extensions-menu-button')) return true;
    return Array.from(document.querySelectorAll('button, a, div, [role="button"]')).some((element) => {
      const text = `${element.textContent || ''} ${element.getAttribute('title') || ''} ${element.getAttribute('aria-label') || ''}`;
      return /\bDirective\b/i.test(text);
    });
  }, null, {
    timeout: BROWSER_TIMEOUT_MS
  });

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
    const menuButton = document.getElementById('directive-extensions-menu-button')
      || Array.from(document.querySelectorAll('button, a, div, [role="button"]')).find((element) => {
        const text = `${element.textContent || ''} ${element.getAttribute('title') || ''} ${element.getAttribute('aria-label') || ''}`;
        return /\bDirective\b/i.test(text);
      });
    menuButton?.click();
    return menuButton ? 'extensions-menu' : '';
  });

  assertBrowser(openedWith, 'Directive bridge or menu launcher was not found on the live SillyTavern page.');
  await page.waitForFunction(() => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    return Boolean(
      panel
      && panel.hidden !== true
      && (panel.dataset.directiveShell === 'command-spine' || panel.classList.contains('directive-command-spine-shell'))
      && panel.querySelector('[data-directive-runtime-body="true"]')
    );
  }, null, {
    timeout: BROWSER_TIMEOUT_MS
  });
  return openedWith;
}

async function directiveExtensionControlSnapshot(page, diagnostics = {}) {
  const browserSnapshot = await page.evaluate(async () => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const readText = async (url, { keepRaw = false } = {}) => {
      try {
        const response = await fetch(url);
        const text = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get('content-type') || '',
          byteLength: text.length,
          textPreview: text.slice(0, 180),
          rawText: keepRaw ? text : undefined
        };
      } catch (error) {
        return {
          ok: false,
          status: null,
          contentType: '',
          byteLength: 0,
          error: error?.message || String(error)
        };
      }
    };
    const readJson = async (url) => {
      const response = await readText(url, { keepRaw: true });
      let json = null;
      try {
        json = response.rawText ? JSON.parse(response.rawText) : null;
      } catch {
        json = null;
      }
      delete response.rawText;
      return {
        ...response,
        json
      };
    };
    const settingsRoot = document.getElementById('directive_settings');
    const extensionContainers = [
      document.getElementById('extensions_settings2'),
      document.getElementById('extensions_settings')
    ].filter(Boolean);
    const context = (() => {
      try {
        return globalThis.SillyTavern?.getContext?.() || null;
      } catch {
        return null;
      }
    })();
    const extensionSettings = context?.extensionSettings || context?.extension_settings || globalThis.extension_settings || {};
    const disabledExtensions = Array.isArray(extensionSettings.disabledExtensions)
      ? extensionSettings.disabledExtensions
      : [];
    const discover = await readJson('/api/extensions/discover');
    const manifest = await readJson('/scripts/extensions/third-party/Directive/manifest.json');
    const scriptProbe = await readText('/scripts/extensions/third-party/Directive/src/extension/index.js');
    return {
      readyState: document.readyState,
      bodyPreview: normalize(document.body?.innerText || '').slice(0, 500),
      directiveSettings: Boolean(settingsRoot),
      directiveSettingsParentId: settingsRoot?.parentElement?.id || '',
      openRuntime: Boolean(document.getElementById('directive_open_runtime')),
      extensionEnabled: Boolean(document.getElementById('directive_extension_enabled')),
      extensionContainerIds: extensionContainers.map((element) => element.id),
      extensionContainerTextPreview: extensionContainers.map((element) => normalize(element.innerText).slice(0, 300)),
      directiveScriptTags: Array.from(document.scripts || [])
        .map((script) => script.src || script.id || '')
        .filter((value) => /Directive|third-party\/Directive|directive/i.test(value))
        .slice(0, 12),
      directiveStyleTags: Array.from(document.querySelectorAll('link[rel="stylesheet"]') || [])
        .map((link) => link.href || link.id || '')
        .filter((value) => /Directive|third-party\/Directive|directive/i.test(value))
        .slice(0, 12),
      sillyTavernContext: {
        available: Boolean(context),
        disabledExtensionCount: disabledExtensions.length,
        directiveDisabledEntries: disabledExtensions.filter((entry) => /directive/i.test(String(entry))).slice(0, 12),
        extensionSettingsKeys: Object.keys(extensionSettings).filter((key) => /directive|disabled|extension/i.test(key)).slice(0, 24)
      },
      discoveryProbe: {
        ok: discover.ok,
        status: discover.status,
        directiveEntries: Array.isArray(discover.json)
          ? discover.json.filter((entry) => /directive/i.test(`${entry?.type || ''} ${entry?.name || ''}`)).slice(0, 12)
          : [],
        entryCount: Array.isArray(discover.json) ? discover.json.length : null
      },
      manifestProbe: {
        ok: manifest.ok,
        status: manifest.status,
        key: manifest.json?.key || null,
        displayName: manifest.json?.display_name || null,
        js: manifest.json?.js || null,
        contentType: manifest.contentType
      },
      scriptProbe: {
        ok: scriptProbe.ok,
        status: scriptProbe.status,
        contentType: scriptProbe.contentType,
        byteLength: scriptProbe.byteLength
      },
      directiveBridge: {
        hasDirective: Boolean(globalThis.Directive),
        showRuntime: typeof globalThis.Directive?.bridge?.showRuntime === 'function',
        runAction: typeof globalThis.Directive?.bridge?.runAction === 'function',
        actionsRun: typeof globalThis.Directive?.actions?.run === 'function'
      }
    };
  });
  return {
    ...browserSnapshot,
    pageConsoleMessages: Array.isArray(diagnostics.consoleMessages) ? diagnostics.consoleMessages.slice(-12) : [],
    pageErrors: Array.isArray(diagnostics.pageErrors) ? diagnostics.pageErrors.slice(-12) : []
  };
}

async function verifyExtensionControls(page, diagnostics = {}) {
  try {
    await page.waitForFunction(() => {
      return Boolean(
        document.getElementById('directive_settings')
        && document.getElementById('directive_open_runtime')
        && document.getElementById('directive_extension_enabled')
      );
    }, null, {
      timeout: UI_BOOT_TIMEOUT_MS
    });
  } catch (error) {
    error.details = {
      ...(error.details || {}),
      uiBootTimeoutMs: UI_BOOT_TIMEOUT_MS,
      extensionControlSnapshot: await directiveExtensionControlSnapshot(page, diagnostics).catch((snapshotError) => ({
        error: errorSummary(snapshotError)
      }))
    };
    throw error;
  }

  const snapshot = await page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    let resetLayoutRegistered = false;
    try {
      resetLayoutRegistered = Boolean(globalThis.Directive?.actions?.has?.('runtime.resetLayout'));
      if (!resetLayoutRegistered && typeof globalThis.Directive?.bridge?.listActions === 'function') {
        resetLayoutRegistered = globalThis.Directive.bridge.listActions().some((action) => action?.id === 'runtime.resetLayout');
      }
    } catch {
      resetLayoutRegistered = false;
    }

    const root = document.getElementById('directive_settings');
    const title = root?.querySelector('.directive-extension-dropdown-title');
    const enableToggle = document.getElementById('directive_extension_enabled');
    const enableStatus = document.getElementById('directive_extension_enabled_status');
    const openButton = document.getElementById('directive_open_runtime');
    const resetButton = document.getElementById('directive_reset_window');
    return {
      root: Boolean(root),
      parentId: root?.parentElement?.id || '',
      inlineDrawer: Boolean(root?.querySelector('.inline-drawer')),
      title: normalize(title?.textContent),
      titleIcon: title?.querySelector('.directive-extensions-menu-icon')?.className || '',
      description: normalize(root?.querySelector('.directive-extension-description')?.textContent),
      enableToggle: Boolean(enableToggle),
      enableToggleChecked: enableToggle?.checked === true,
      enableToggleRole: enableToggle?.getAttribute('role') || '',
      enableStatus: normalize(enableStatus?.textContent),
      openRuntime: Boolean(openButton),
      openRuntimeText: normalize(openButton?.textContent),
      openRuntimeTitle: openButton?.getAttribute('title') || '',
      resetWindow: Boolean(resetButton),
      resetWindowText: normalize(resetButton?.textContent),
      resetLayoutRegistered
    };
  });

  assertBrowser(snapshot.root, 'Directive settings dropdown was not mounted.', snapshot);
  assertBrowser(['extensions_settings2', 'extensions_settings'].includes(snapshot.parentId), 'Directive settings dropdown mounted outside the SillyTavern extensions settings container.', snapshot);
  assertBrowser(snapshot.inlineDrawer, 'Directive settings dropdown is not using SillyTavern inline-drawer markup.', snapshot);
  assertBrowser(snapshot.title === 'Directive', 'Directive settings dropdown title was wrong.', snapshot);
  assertBrowser(/\bfa-compass\b/.test(snapshot.titleIcon), 'Directive settings dropdown did not include the compass icon.', snapshot);
  assertBrowser(/\bmission\b/i.test(snapshot.description) && /\bsettings\b/i.test(snapshot.description), 'Directive settings dropdown description did not describe the runtime scope.', snapshot);
  assertBrowser(snapshot.enableToggle, 'Directive settings dropdown did not expose the Directive enabled switch.', snapshot);
  assertBrowser(snapshot.enableToggleRole === 'switch', 'Directive enabled switch did not use switch semantics.', snapshot);
  assertBrowser(['On', 'Off'].includes(snapshot.enableStatus), 'Directive enabled switch did not expose readable status text.', snapshot);
  assertBrowser(snapshot.openRuntime, 'Directive settings dropdown did not expose Open Runtime.', snapshot);
  assertBrowser(snapshot.openRuntimeText === 'Open Runtime', 'Directive Open Runtime label was wrong.', snapshot);
  assertBrowser(snapshot.openRuntimeTitle === 'Open the Directive runtime.', 'Directive Open Runtime title was wrong.', snapshot);
  assertBrowser(snapshot.resetWindow === snapshot.resetLayoutRegistered, 'Directive Reset Window visibility did not match reset-layout availability.', snapshot);
  if (snapshot.resetWindow) {
    assertBrowser(snapshot.resetWindowText === 'Reset Window', 'Directive Reset Window label was wrong.', snapshot);
  }

  await page.evaluate(() => {
    const toggle = document.getElementById('directive_extension_enabled');
    if (!toggle) return false;
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  await page.waitForFunction(() => {
    const openButton = document.getElementById('directive_open_runtime');
    const status = document.getElementById('directive_extension_enabled_status');
    return Boolean(
      openButton
      && openButton.disabled === true
      && status?.textContent?.trim() === 'Off'
      && !globalThis.Directive?.bridge
      && !globalThis.Directive?.actions
    );
  }, null, {
    timeout: BROWSER_TIMEOUT_MS
  });

  const disabledSnapshot = await page.evaluate(() => {
    const openButton = document.getElementById('directive_open_runtime');
    const resetButton = document.getElementById('directive_reset_window');
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const style = panel ? getComputedStyle(panel) : null;
    return {
      openDisabled: openButton?.disabled === true,
      resetDisabled: resetButton ? resetButton.disabled === true : null,
      bridgeRemoved: !globalThis.Directive?.bridge && !globalThis.Directive?.actions,
      panelHidden: !panel
        || panel.hidden === true
        || panel.getAttribute('aria-hidden') === 'true'
        || style?.display === 'none'
    };
  });
  assertBrowser(disabledSnapshot.openDisabled, 'Directive Open Runtime remained active after turning Directive off.', disabledSnapshot);
  assertBrowser(disabledSnapshot.resetDisabled !== false, 'Directive Reset Window remained active after turning Directive off.', disabledSnapshot);
  assertBrowser(disabledSnapshot.bridgeRemoved, 'Directive global bridge remained after turning Directive off.', disabledSnapshot);
  assertBrowser(disabledSnapshot.panelHidden, 'Directive runtime panel remained visible after turning Directive off.', disabledSnapshot);

  await page.evaluate(() => {
    const toggle = document.getElementById('directive_extension_enabled');
    if (!toggle) return false;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  await page.waitForFunction(() => {
    const openButton = document.getElementById('directive_open_runtime');
    const status = document.getElementById('directive_extension_enabled_status');
    return Boolean(
      openButton
      && openButton.disabled !== true
      && status?.textContent?.trim() === 'On'
      && typeof globalThis.Directive?.bridge?.showRuntime === 'function'
    );
  }, null, {
    timeout: BROWSER_TIMEOUT_MS
  });

  await page.evaluate(() => {
    document.getElementById('directive_open_runtime')?.click();
  });
  await page.waitForFunction(() => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    return Boolean(
      panel
      && panel.hidden !== true
      && panel.getAttribute('aria-hidden') !== 'true'
      && getComputedStyle(panel).display !== 'none'
    );
  }, null, {
    timeout: BROWSER_TIMEOUT_MS
  });

  return {
    ...snapshot,
    toggledOffAndOn: true,
    openedFromDropdown: true
  };
}

async function installBrowserErrorCapture(page) {
  await page.evaluate(() => {
    if (globalThis.__directiveSmokeErrorCaptureInstalled) return true;
    globalThis.__directiveSmokeErrorCaptureInstalled = true;
    globalThis.__directiveSmokeErrors = [];
    const compactError = (value) => {
      if (value?.stack) return String(value.stack);
      if (value?.message) return String(value.message);
      try {
        return typeof value === 'string' ? value : JSON.stringify(value);
      } catch {
        return String(value);
      }
    };
    const record = (kind, value) => {
      globalThis.__directiveSmokeErrors.push({
        kind,
        message: compactError(value),
        at: new Date().toISOString()
      });
      if (globalThis.__directiveSmokeErrors.length > 12) {
        globalThis.__directiveSmokeErrors.splice(0, globalThis.__directiveSmokeErrors.length - 12);
      }
    };
    globalThis.addEventListener?.('error', (event) => {
      record('error', event?.error || event?.message || 'window error');
    });
    globalThis.addEventListener?.('unhandledrejection', (event) => {
      record('unhandledrejection', event?.reason || 'unhandled rejection');
    });
    const originalConsoleError = globalThis.console?.error;
    if (typeof originalConsoleError === 'function') {
      globalThis.console.error = (...args) => {
        record('console.error', args.map(compactError).join(' '));
        return originalConsoleError.apply(globalThis.console, args);
      };
    }
    return true;
  });
}

async function panelSnapshot(page) {
  return page.evaluate(async ({ requiredRoutes, modulePath }) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const body = panel?.querySelector('[data-directive-runtime-body="true"]') || null;
    const routeButtons = Array.from(panel?.querySelectorAll('.directive-spine-route') || []);
    const routeLabel = (button) => normalize(
      button?.querySelector('.directive-spine-route-label')?.textContent
      || button?.dataset.mobileLabel
      || button?.getAttribute('aria-label')
      || button?.textContent
    );
    const bodyButtonDetails = Array.from(body?.querySelectorAll('button') || []).map((button) => ({
      text: normalize(button.textContent),
      disabled: button.disabled === true || button.getAttribute('aria-disabled') === 'true'
    })).filter((button) => button.text);
    const bodyButtons = bodyButtonDetails.map((button) => button.text);
    const routeLabels = routeButtons.map(routeLabel).filter(Boolean);
    const routeIds = routeButtons.map((button) => button.dataset.routeId || button.dataset.tab || '').filter(Boolean);
    const selected = routeButtons.find((button) => button.getAttribute('aria-selected') === 'true');
    const bodyText = normalize(body?.textContent || '');
    const saveGuardText = normalize(body?.querySelector('.directive-starship-save-guard')?.textContent || '');
    const runtimeDiagnostics = await (async () => {
      try {
        const mod = await import(modulePath);
        const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
        const ctx = globalThis.SillyTavern?.getContext?.();
        const view = await bridge.runtimeApp?.getCurrentView?.({ tabId: 'campaign' });
        return {
          contextChatId: ctx?.chatId || ctx?.chat_id || ctx?.currentChatId || null,
          contextCurrentChatId: typeof ctx?.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : null,
          contextChatOpenMethods: ['openChat', 'openCharacterChat', 'openGroupChat', 'selectChat', 'selectCharacterById', 'createNewChat', 'createChat', 'newChat']
            .filter((method) => typeof ctx?.[method] === 'function'),
          globalChatOpenMethods: ['openChat', 'openCharacterChat', 'openGroupChat', 'selectChat', 'selectCharacterById', 'createNewChat', 'createChat', 'newChat']
            .filter((method) => typeof globalThis?.[method] === 'function'),
          directiveCharacters: Array.from(ctx?.characters || globalThis.characters || [])
            .map((entry, index) => ({
              index,
              name: entry?.name || entry?.data?.name || '',
              avatar: entry?.avatar || entry?.filename || entry?.avatar_url || ''
            }))
            .filter((entry) => /Directive|Ashes of Peace/i.test(entry.name || entry.avatar))
            .slice(0, 12),
          hostCurrentChatId: bridge.host?.chat?.getCurrentChatId?.() || null,
          hostBinding: bridge.host?.chat?.getCurrentBinding?.() || null,
          hostMetadata: bridge.host?.chat?.getBindingMetadata?.() || null,
          viewCurrentChat: view?.currentChat || null,
          viewCurrentChatCampaignGuard: view?.currentChatCampaignGuard || null,
          viewManualSaveGuard: view?.chatNative?.manualSaveGuard || null,
          viewChatBinding: view?.chatNative?.binding || null,
          loadedSave: view?.loadedSave || null,
          activeSaveId: view?.activeSaveId || null
        };
      } catch (error) {
        return {
          error: error?.message || String(error)
        };
      }
    })();
    const drawer = panel?.querySelector('.directive-command-drawer') || null;
    const resizeHandles = Array.from(drawer?.querySelectorAll('[data-directive-drawer-resize-handle="true"]') || []);
    const providerContext = (() => {
      try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const supportedGenerationMethods = ['generateRaw', 'generate', 'generateText'].filter((method) => (
          typeof ctx?.[method] === 'function'
        ));
        const unsupportedGenerationHints = ['generateQuietPrompt', 'connectionManagerRequestService'].filter((method) => (
          Boolean(ctx?.[method])
        ));
        return {
          available: Boolean(ctx),
          generationSurface: supportedGenerationMethods.length > 0,
          supportedGenerationMethods,
          unsupportedGenerationHints
        };
      } catch {
        return {
          available: false,
          generationSurface: false,
          supportedGenerationMethods: [],
          unsupportedGenerationHints: []
        };
      }
    })();
    return {
      browserErrors: Array.isArray(globalThis.__directiveSmokeErrors)
        ? globalThis.__directiveSmokeErrors.slice(-8)
        : [],
      lastClickedBodyButton: globalThis.__directiveLastClickedBodyButton || null,
      bridge: Boolean(globalThis.Directive?.bridge?.showRuntime),
      actions: Array.isArray(globalThis.Directive?.bridge?.listActions?.())
        ? globalThis.Directive.bridge.listActions().map((action) => action.id)
        : [],
      panel: Boolean(panel),
      hidden: panel?.hidden === true,
      commandSpine: panel?.dataset.directiveShell === 'command-spine' || panel?.classList.contains('directive-command-spine-shell'),
      drawer: Boolean(drawer),
      drawerOpen: panel?.dataset.drawerOpen === 'true' && drawer?.hidden !== true,
      drawerHeader: Boolean(panel?.querySelector('[data-directive-shell-actions="drawer-header"]')),
      resizeHandle: resizeHandles.length === 1,
      resizeHandleCount: resizeHandles.length,
      leftResizeHandle: resizeHandles.some((handle) => handle.dataset.directiveDrawerResizeEdge === 'left'),
      rightResizeHandle: resizeHandles.some((handle) => handle.dataset.directiveDrawerResizeEdge === 'right'),
      fullscreenControl: Boolean(panel?.querySelector('[data-shell-action="fullscreen"]')),
      collapseControl: Boolean(panel?.querySelector('[data-shell-action="collapse"]')),
      routeLabels,
      routeIds,
      selectedRouteId: selected?.dataset.routeId || selected?.dataset.tab || null,
      shellTitle: normalize(panel?.querySelector('[data-directive-current-route-title="true"] .directive-shell-title-label')?.textContent || ''),
      routeContext: normalize(panel?.querySelector('[data-directive-current-route="true"]')?.textContent || ''),
      missingRoutes: requiredRoutes.filter((label) => !routeLabels.includes(label)),
      headings: Array.from(body?.querySelectorAll('h2,h3,h4') || []).map((heading) => normalize(heading.textContent)).filter(Boolean).slice(0, 16),
      bodyText,
      saveGuardText,
      runtimeDiagnostics,
      bodyButtons,
      bodyButtonDetails,
      stateSafetyControls: {
        section: Boolean(body?.querySelector('.directive-settings-state-safety-card'))
          || /State Safety|Safety & State|Campaign State Controls/i.test(bodyText),
        verify: bodyButtons.includes('Verify Active Save'),
        settle: bodyButtons.includes('Settle Active State'),
        export: bodyButtons.includes('Export Active Save'),
        clean: bodyButtons.includes('Clean Missing Records')
      },
      hasActiveCampaign: !/No active campaign\./i.test(bodyText)
        && /Active Campaign|Campaign Chat|Open Campaign Chat|Formal Objectives/i.test(bodyText),
      noActiveCampaign: /No active campaign\./i.test(bodyText),
      hasTurnInput: Boolean(body?.querySelector('[data-input-path="turn.playerInput"]')),
      hasSaveAsInput: Boolean(body?.querySelector('[data-input-path="saveAs.name"]')),
      saveAsValue: body?.querySelector('[data-input-path="saveAs.name"]')?.value || '',
      hasRecordSaveAsDialog: Boolean(document.querySelector('.directive-record-save-as-dialog')),
      hasRecordSaveAsDialogInput: Boolean(document.querySelector('.directive-record-save-as-name-input')),
      hasPendingPreview: /Provisional Outcome|Replacement Outcome|Procedure Check/i.test(bodyText),
      hasLastOutcome: /Last Outcome/i.test(bodyText),
      hasNarrationRecovery: /Narration Recovery/i.test(bodyText),
      providerContext
    };
  }, {
    requiredRoutes: REQUIRED_ROUTES,
    modulePath: bridgeModulePath()
  });
}

async function navigateDirectiveRoute(page, label) {
  const tabId = ROUTE_IDS[label];
  assertBrowser(tabId, `No route id is configured for "${label}".`);
  const usedBridge = await page.evaluate(async (routeId) => {
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') {
      await globalThis.Directive.bridge.runAction('runtime.setTab', { tabId: routeId });
      return true;
    }
    if (typeof globalThis.Directive?.actions?.run === 'function') {
      await globalThis.Directive.actions.run('runtime.setTab', { tabId: routeId });
      return true;
    }
    return false;
  }, tabId);

  if (!usedBridge) {
    const selector = `#directive-runtime-panel [data-route-id="${tabId}"], [data-directive-shell="command-spine"] [data-route-id="${tabId}"]`;
    await page.locator(selector).first().click({ timeout: BROWSER_TIMEOUT_MS });
  }

  await page.waitForFunction(({ routeId, routeLabel }) => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const selected = panel?.querySelector(`[data-route-id="${routeId}"]`);
    const body = panel?.querySelector('[data-directive-runtime-body="true"]');
    return Boolean(
      selected
      && selected.getAttribute('aria-selected') === 'true'
      && body
      && panel?.dataset?.activeRoute === routeId
      && body.dataset.directiveTour === `route-body.${routeId}`
      && body.children.length > 0
    );
  }, {
    routeId: tabId,
    routeLabel: label
  }, {
    timeout: BROWSER_TIMEOUT_MS
  });

  return {
    label,
    routeId: tabId,
    usedBridge
  };
}

async function verifyBrowserRoutes(page) {
  const coverage = [];
  for (const label of REQUIRED_ROUTES) {
    const navigation = await navigateDirectiveRoute(page, label);
    const snapshot = await panelSnapshot(page);
    const allowedHeadings = ROUTE_PANEL_HEADINGS[label] || [label];
    assertBrowser(snapshot.selectedRouteId === navigation.routeId, `Route "${label}" did not become selected.`, snapshot);
    assertBrowser(snapshot.shellTitle === label, `Route "${label}" did not update the shell title label.`, snapshot);
    assertBrowser(snapshot.routeContext === label, `Route "${label}" did not update the shell context label.`, snapshot);
    assertBrowser(
      allowedHeadings.some((heading) => snapshot.headings.includes(heading)),
      `Route "${label}" did not render an accepted panel heading.`,
      { ...snapshot, acceptedHeadings: allowedHeadings }
    );
    if (label === 'Settings') {
      assertBrowser(snapshot.stateSafetyControls.section, 'Settings did not render State Safety controls.', snapshot);
      assertBrowser(snapshot.stateSafetyControls.verify, 'Settings did not render Verify Active Save.', snapshot);
      assertBrowser(snapshot.stateSafetyControls.settle, 'Settings did not render Settle Active State.', snapshot);
      assertBrowser(snapshot.stateSafetyControls.export, 'Settings did not render Export Active Save.', snapshot);
      assertBrowser(snapshot.stateSafetyControls.clean, 'Settings did not render Clean Missing Records.', snapshot);
    }
    coverage.push({
      label,
      routeId: navigation.routeId,
      usedBridge: navigation.usedBridge
    });
  }
  return coverage;
}

async function bodyButtonLabels(page) {
  return page.locator('#directive-runtime-panel [data-directive-runtime-body="true"] button').evaluateAll((buttons) => (
    buttons.map((button) => String(button.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
  ));
}

async function clickBodyButton(page, label) {
  const clicked = await page.evaluate((buttonLabel) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const body = document.querySelector('#directive-runtime-panel [data-directive-runtime-body="true"]');
    const isVisible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && !element.closest('[hidden], [aria-hidden="true"]');
    };
    const buttons = Array.from(body?.querySelectorAll('button, [role="button"]') || []);
    const exact = buttons.filter((button) => normalize(
      button.textContent || button.getAttribute('aria-label') || button.getAttribute('title') || ''
    ) === buttonLabel);
    const target = exact.find((button) => isVisible(button) && button.disabled !== true && button.getAttribute('aria-disabled') !== 'true')
      || exact.find((button) => isVisible(button))
      || exact[0];
    if (!target) return false;
    target.scrollIntoView?.({ block: 'center', inline: 'center' });
    globalThis.__directiveLastClickedBodyButton = {
      label: buttonLabel,
      text: normalize(target.textContent || target.getAttribute('aria-label') || target.getAttribute('title') || ''),
      disabled: target.disabled === true || target.getAttribute('aria-disabled') === 'true',
      className: target.className || '',
      parentClassName: target.parentElement?.className || '',
      ancestorClassName: target.closest('article, section, footer, header')?.className || '',
      saveId: target.closest('[data-save-id]')?.dataset?.saveId || null,
      campaignSessionKey: target.closest('[data-campaign-session-key]')?.dataset?.campaignSessionKey || null
    };
    target.click();
    return true;
  }, label);
  if (!clicked) {
    const body = page.locator('#directive-runtime-panel [data-directive-runtime-body="true"]').first();
    const labels = await bodyButtonLabels(page);
    throw new Error(`Button "${label}" was not found in the Directive panel body. Visible buttons: ${labels.join(', ') || 'none'}`);
  }
}

async function selectMissionSubtab(page, label) {
  await navigateDirectiveRoute(page, 'Mission');
  const selected = await page.evaluate((targetLabel) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const button = Array.from(document.querySelectorAll('#directive-runtime-panel .directive-mission-subtab'))
      .find((candidate) => normalize(candidate.textContent) === targetLabel);
    if (!button) return false;
    button.click();
    return true;
  }, label);
  if (!selected) {
    const snapshot = await panelSnapshot(page);
    assertBrowser(false, `Mission subtab "${label}" was not found.`, {
      selectedRouteId: snapshot.selectedRouteId,
      shellTitle: snapshot.shellTitle,
      routeContext: snapshot.routeContext,
      headings: snapshot.headings,
      bodyButtons: snapshot.bodyButtons,
      bodyTextExcerpt: snapshot.bodyText.slice(0, 500),
      runtimeDiagnostics: snapshot.runtimeDiagnostics,
      browserErrors: snapshot.browserErrors
    });
  }
  await page.waitForFunction((targetLabel) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const active = Array.from(document.querySelectorAll('#directive-runtime-panel .directive-mission-subtab'))
      .find((candidate) => normalize(candidate.textContent) === targetLabel);
    return active?.getAttribute('aria-selected') === 'true';
  }, label, {
    timeout: BROWSER_TIMEOUT_MS
  });
}

async function selectCampaignSubtab(page, label) {
  await navigateDirectiveRoute(page, 'Campaign');
  const selected = await page.evaluate((targetLabel) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const button = Array.from(document.querySelectorAll('#directive-runtime-panel .directive-campaign-subtab'))
      .find((candidate) => normalize(candidate.textContent) === targetLabel);
    if (!button) return false;
    button.click();
    return true;
  }, label);
  assertBrowser(selected, `Campaign subtab "${label}" was not found.`);
  await page.waitForFunction((targetLabel) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const active = Array.from(document.querySelectorAll('#directive-runtime-panel .directive-campaign-subtab'))
      .find((candidate) => normalize(candidate.textContent) === targetLabel);
    return active?.getAttribute('aria-selected') === 'true';
  }, label, {
    timeout: BROWSER_TIMEOUT_MS
  });
}

async function waitForBodyButtonEnabled(page, label) {
  await page.waitForFunction((buttonLabel) => {
    const panel = document.querySelector('#directive-runtime-panel');
    const body = panel?.querySelector('[data-directive-runtime-body="true"]');
    return Array.from(body?.querySelectorAll('button') || []).some((button) => (
      String(button.textContent || '').replace(/\s+/g, ' ').trim() === buttonLabel
      && button.disabled !== true
    ));
  }, label, {
    timeout: BROWSER_TIMEOUT_MS
  });
}

async function recoverMissionCampaignChatSelection(page) {
  await navigateDirectiveRoute(page, 'Mission');
  const mission = await panelSnapshot(page);
  if (!/choose the campaign chat|no campaign chat selected|not linked to this directive save/i.test(mission.bodyText)) {
    return {
      attempted: false,
      reason: 'Mission route already has a live campaign surface.'
    };
  }
  try {
    await selectCampaignSubtab(page, 'Records');
  } catch (error) {
    const directOpenResult = await page.evaluate(async (modulePath) => {
      const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
      try {
        const mod = await import(modulePath);
        const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
        const result = await bridge.runtimeApp?.openCampaignChat?.();
        return clone({
          ok: result?.ok ?? null,
          reason: result?.reason || null,
          binding: result?.binding || null,
          currentChat: result?.view?.currentChat || null,
          guard: result?.view?.currentChatCampaignGuard || result?.view?.chatNative?.manualSaveGuard || null
        });
      } catch (directError) {
        return { error: directError?.message || String(directError) };
      }
    }, bridgeModulePath());
    await sleep(3200);
    await navigateDirectiveRoute(page, 'Mission');
    return {
      attempted: true,
      reason: 'Campaign Records was unavailable; attempted runtimeApp.openCampaignChat directly.',
      before: {
        bodyTextExcerpt: mission.bodyText.slice(0, 400),
        currentChatId: mission.runtimeDiagnostics?.hostCurrentChatId || null,
        contextChatOpenMethods: mission.runtimeDiagnostics?.contextChatOpenMethods || [],
        globalChatOpenMethods: mission.runtimeDiagnostics?.globalChatOpenMethods || [],
        directiveCharacters: mission.runtimeDiagnostics?.directiveCharacters || [],
        guardReason: mission.runtimeDiagnostics?.viewCurrentChatCampaignGuard?.reason || mission.runtimeDiagnostics?.viewManualSaveGuard?.reason || null,
        boundChatId: mission.runtimeDiagnostics?.viewCurrentChatCampaignGuard?.boundChatId || mission.runtimeDiagnostics?.viewManualSaveGuard?.boundChatId || null
      },
      records: {
        unavailable: true,
        error: error?.message || String(error)
      },
      directOpenResult
    };
  }
  const records = await panelSnapshot(page);
  if (!records.bodyButtons.includes('Open Campaign Chat')) {
    return {
      attempted: false,
      reason: 'Campaign Records did not expose Open Campaign Chat.',
      records: {
        saveGuardText: records.saveGuardText,
        bodyButtons: records.bodyButtons,
        runtimeDiagnostics: records.runtimeDiagnostics
      }
    };
  }
  const directOpenResult = await page.evaluate(async (modulePath) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    try {
      const mod = await import(modulePath);
      const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
      const result = await bridge.runtimeApp?.openCampaignChat?.();
      return clone({
        ok: result?.ok ?? null,
        reason: result?.reason || null,
        binding: result?.binding || null,
        currentChat: result?.view?.currentChat || null,
        guard: result?.view?.currentChatCampaignGuard || result?.view?.chatNative?.manualSaveGuard || null
      });
    } catch (error) {
      return { error: error?.message || String(error) };
    }
  }, bridgeModulePath());
  await sleep(3200);
  await navigateDirectiveRoute(page, 'Mission');
  return {
    attempted: true,
    before: {
      bodyTextExcerpt: mission.bodyText.slice(0, 400),
      currentChatId: mission.runtimeDiagnostics?.hostCurrentChatId || null,
      contextChatOpenMethods: mission.runtimeDiagnostics?.contextChatOpenMethods || [],
      globalChatOpenMethods: mission.runtimeDiagnostics?.globalChatOpenMethods || [],
      directiveCharacters: mission.runtimeDiagnostics?.directiveCharacters || [],
      guardReason: mission.runtimeDiagnostics?.viewCurrentChatCampaignGuard?.reason || mission.runtimeDiagnostics?.viewManualSaveGuard?.reason || null,
      boundChatId: mission.runtimeDiagnostics?.viewCurrentChatCampaignGuard?.boundChatId || mission.runtimeDiagnostics?.viewManualSaveGuard?.boundChatId || null
    },
    records: {
      saveGuardText: records.saveGuardText,
      currentChatId: records.runtimeDiagnostics?.hostCurrentChatId || null,
      contextChatOpenMethods: records.runtimeDiagnostics?.contextChatOpenMethods || [],
      globalChatOpenMethods: records.runtimeDiagnostics?.globalChatOpenMethods || [],
      directiveCharacters: records.runtimeDiagnostics?.directiveCharacters || [],
      guardReason: records.runtimeDiagnostics?.viewCurrentChatCampaignGuard?.reason || records.runtimeDiagnostics?.viewManualSaveGuard?.reason || null,
      boundChatId: records.runtimeDiagnostics?.viewCurrentChatCampaignGuard?.boundChatId || records.runtimeDiagnostics?.viewManualSaveGuard?.boundChatId || null
    },
    directOpenResult
  };
}

async function readBrowserStorageJson(page, userFilesPath, label, { unavailableIsSkip = false } = {}) {
  const result = await page.evaluate(async (path) => {
    try {
      const headers = (() => {
        try {
          return globalThis.SillyTavern?.getContext?.()?.getRequestHeaders?.() || {};
        } catch {
          return {};
        }
      })();
      const response = await fetch(path, {
        method: 'GET',
        headers
      });
      const raw = await response.text();
      let payload = null;
      let parseError = '';
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch (error) {
          parseError = error?.message || String(error);
        }
      }
      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type') || '',
        payload,
        parseError,
        excerpt: raw.slice(0, 220)
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        contentType: '',
        payload: null,
        parseError: '',
        excerpt: error?.message || String(error)
      };
    }
  }, userFilesPath);

  const endpoint = `GET ${userFilesPath}`;
  if (!result.ok) {
    const skip = {
      skipped: true,
      reason: `${label} was not readable through SillyTavern storage; branch load/reselect was not proven.`,
      endpoint,
      status: result.status,
      contentType: result.contentType || 'unknown',
      excerpt: compact(result.excerpt || '', 180)
    };
    if (unavailableIsSkip && isStorageEndpointUnavailableStatus(result.status)) {
      throw new OptionalCheckSkipError(maybeReturnOptionalSkip(skip));
    }
    throw new Error(formatOptionalSkip(skip));
  }

  if (result.parseError) {
    const skip = {
      skipped: true,
      reason: `${label} returned a non-JSON response through SillyTavern storage; branch load/reselect was not proven.`,
      endpoint,
      status: result.status,
      contentType: result.contentType || 'unknown',
      excerpt: compact(result.excerpt || '', 180)
    };
    if (unavailableIsSkip) {
      throw new OptionalCheckSkipError(maybeReturnOptionalSkip(skip));
    }
    throw new Error(formatOptionalSkip(skip));
  }

  return result.payload;
}

function indexedSaveEntries(saveIndex) {
  return Object.values(saveIndex?.saves || {}).filter((entry) => entry && typeof entry === 'object');
}

function findSaveEntryByName(saveIndex, saveName) {
  const matches = indexedSaveEntries(saveIndex)
    .filter((entry) => entry.name === saveName)
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  if (matches.length === 0) {
    throw new Error(`Save Game As branch "${saveName}" was not present in the SillyTavern save index. Indexed save count: ${indexedSaveEntries(saveIndex).length}.`);
  }
  return matches[0];
}

function userFilesPathForIndexedEntry(entry) {
  const path = String(entry?.path || '');
  if (!path) {
    throw new Error(`Save index entry "${entry?.id || 'unknown'}" does not include a payload path.`);
  }
  return path.startsWith('/user/files/') ? path : toSillyTavernUserFilesPath(path);
}

function assertActiveSaveIndex(saveIndex, saveId, label) {
  const currentIds = indexedSaveEntries(saveIndex).filter((entry) => entry.current === true).map((entry) => entry.id);
  const activeSaveId = saveIndex?.activeSaveId || null;
  if (activeSaveId !== saveId || JSON.stringify(currentIds) !== JSON.stringify([saveId])) {
    throw new Error(`${label} active index mismatch: ${compact({
      expectedSaveId: saveId,
      activeSaveId,
      currentIds,
      expectedEntry: saveIndex?.saves?.[saveId] || null,
      activeEntry: activeSaveId ? saveIndex?.saves?.[activeSaveId] || null : null
    }, 900)}`);
  }
}

function campaignIdentitySummary(saveRecord) {
  const campaignState = saveRecord?.payload?.campaignState || {};
  const turnEntries = campaignState?.turnLedger?.entries;
  return {
    campaignId: campaignState?.campaign?.id || saveRecord?.metadata?.campaignId || null,
    campaignTitle: campaignState?.campaign?.title || saveRecord?.metadata?.campaignTitle || null,
    packageId: campaignState?.activeCampaignPackage?.packageId || saveRecord?.metadata?.packageId || null,
    playerName: campaignState?.player?.name || saveRecord?.metadata?.playerName || null,
    shipName: campaignState?.ship?.name || campaignState?.starship?.name || saveRecord?.metadata?.shipName || null,
    missionId: campaignState?.mission?.activeMissionId || campaignState?.mission?.id || null,
    missionGraphId: campaignState?.mission?.activeMissionGraphId || null,
    stardate: campaignState?.campaign?.currentStardate || null,
    turnCount: Array.isArray(turnEntries) ? turnEntries.length : null
  };
}

function sanitizeTimingMetric(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    kind: value.kind || null,
    playerSubmittedAt: Number.isFinite(Number(value.playerSubmittedAt)) ? Number(value.playerSubmittedAt) : null,
    turnObservedAt: Number.isFinite(Number(value.turnObservedAt)) ? Number(value.turnObservedAt) : null,
    routeDecidedAt: Number.isFinite(Number(value.routeDecidedAt)) ? Number(value.routeDecidedAt) : null,
    hostGenerationReleasedAt: Number.isFinite(Number(value.hostGenerationReleasedAt)) ? Number(value.hostGenerationReleasedAt) : null,
    directiveGenerationStartedAt: Number.isFinite(Number(value.directiveGenerationStartedAt)) ? Number(value.directiveGenerationStartedAt) : null,
    visibleResponsePostedAt: Number.isFinite(Number(value.visibleResponsePostedAt)) ? Number(value.visibleResponsePostedAt) : null,
    generationStartedAt: Number.isFinite(Number(value.generationStartedAt)) ? Number(value.generationStartedAt) : null,
    generationStartLatencyMs: Number.isFinite(Number(value.generationStartLatencyMs)) ? Number(value.generationStartLatencyMs) : null,
    providerCompletionLatencyMs: Number.isFinite(Number(value.providerCompletionLatencyMs)) ? Number(value.providerCompletionLatencyMs) : null,
    architectureWithin60s: typeof value.architectureWithin60s === 'boolean' ? value.architectureWithin60s : null
  };
}

function sanitizeTimingResponse(response = {}, ingressById = new Map()) {
  const ingress = ingressById.get(response.ingressId) || null;
  const turnLatency = sanitizeTimingMetric(response.turnLatency);
  const route = response.strategy === 'injectAndContinue'
    ? 'hostContinue'
    : (response.strategy === 'directivePosted' ? 'directiveCommit' : response.strategy || null);
  const hostGenerationReleasedAt = response.hostGenerationReleasedAt
    || response.hostContinuation?.hostGenerationReleasedAt
    || response.hostContinuation?.generationStartedAt
    || null;
  const directiveGenerationStartedAt = response.directiveGenerationStartedAt || null;
  return {
    responseId: response.id || null,
    ingressId: response.ingressId || null,
    coreTransactionId: response.coreTransactionId || ingress?.coreTransactionId || null,
    sourceFrameId: ingress?.sourceFrameId || ingress?.sourceFrame?.id || null,
    route,
    strategy: response.strategy || null,
    responseKind: response.responseKind || null,
    status: response.status || null,
    hostMessageId: response.hostMessageId || null,
    playerHostMessageId: ingress?.hostMessageId || null,
    hostGenerationReleaseMode: response.hostGenerationReleaseMode || null,
    hostGenerationReleasedAt,
    directiveGenerationStartedAt,
    generationStartedAt: response.generationStartedAt || directiveGenerationStartedAt || hostGenerationReleasedAt || null,
    turnLatency
  };
}

function generationTimingProofFromLedgers({
  source,
  ingressLedger = [],
  responseLedger = [],
  beforeResponseIds = [],
  saveId = null,
  payloadPath = null
} = {}) {
  const priorIds = new Set((beforeResponseIds || []).filter(Boolean));
  const ingressById = new Map((ingressLedger || []).map((entry) => [entry.id, entry]));
  const candidates = (responseLedger || []).filter((entry) => entry?.id && !priorIds.has(entry.id));
  const selected = candidates.length > 0 ? candidates : (responseLedger || []).slice(-1);
  const entries = selected.map((entry) => sanitizeTimingResponse(entry, ingressById));
  const checked = entries.filter((entry) => timingProofEntryRequiresGenerationStart(entry));
  const statuses = checked.map((entry) => generationTimingEntryStatus(entry));
  const skippedEntries = entries.filter((entry) => timingProofEntryIsNonGenerated(entry));
  const maxGenerationStartLatencyMs = checked.reduce((max, entry) => {
    const value = Number(entry.turnLatency?.generationStartLatencyMs);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  const status = generationTimingProofStatus({ checked, statuses, entries });
  return {
    status,
    source,
    certificationEvidence: false,
    diagnosticOnlyReason: 'raw-runtime-ledger-snapshot-not-certification-evidence',
    saveId,
    payloadPath,
    checkedResponseCount: checked.length,
    candidateResponseCount: candidates.length,
    skippedResponseCount: skippedEntries.length,
    skippedTurnCount: skippedEntries.length,
    maxGenerationStartLatencyMs: checked.length > 0 ? maxGenerationStartLatencyMs : null,
    entries: checked.map((entry, index) => ({
      ...entry,
      timingStatus: statuses[index] || 'unknown'
    })),
    skippedEntries: skippedEntries.map((entry) => ({
      ...entry,
      timingStatus: 'skipped-non-generation'
    }))
  };
}

function hostNativeCompletionRequirementProof(message = {}, proof = {}) {
  if (message.hostNativeCompletionRequired !== true) return null;
  const source = proof?.source || null;
  const completionSource = proof?.completionSource || null;
  const completedHostContinueCount = Number(proof?.completedHostContinueCount || 0);
  const failedHostContinueCount = Number(proof?.failedHostContinueCount || 0);
  const targetOutcome = hostNativeCompletionTargetOutcome(proof, {
    targetTransactionIds: proof?.targetTransactionIds || [],
    targetPlayerHostMessageIds: proof?.targetPlayerHostMessageIds || []
  });
  const pass = proof?.status === 'pass'
    && source === 'coreStoreResponseLedger'
    && completionSource === 'coreProjection'
    && targetOutcome.targetCompletedHostContinueCount > 0
    && targetOutcome.targetFailedHostContinueCount === 0;
  return {
    required: true,
    status: pass ? 'pass' : 'fail',
    scriptMessageId: message.id || null,
    turn: Number.isFinite(Number(message.turn)) ? Number(message.turn) : null,
    scriptLabel: message.label || null,
    scriptCategory: message.category || null,
    expectedRoute: message.expectedRoute || 'hostContinue',
    expectedResponseStrategy: message.expectedResponseStrategy || 'injectAndContinue',
    proofStatus: proof?.status || null,
    source,
    completionSource,
    completedHostContinueCount,
    failedHostContinueCount,
    targetOutcomeStatus: targetOutcome.status,
    targetEntryCount: targetOutcome.targetEntryCount,
    targetCompletedHostContinueCount: targetOutcome.targetCompletedHostContinueCount,
    targetFailedHostContinueCount: targetOutcome.targetFailedHostContinueCount,
    targetPlayerHostMessageIds: uniqueStringList(proof?.targetPlayerHostMessageIds || []),
    targetTransactionIds: uniqueStringList(proof?.targetTransactionIds || []),
    unavailableReason: proof?.unavailableReason || null
  };
}

async function captureCoreStoreProjections(page, {
  saveId = null,
  campaignId = null,
  label = 'Directive save index for CORE proof'
} = {}) {
  const saveIndex = await readBrowserStorageJson(page, SAVE_INDEX_USER_FILES_PATH, label, {
    unavailableIsSkip: true
  });
  const entry = saveId && saveIndex?.saves?.[saveId]
    ? saveIndex.saves[saveId]
    : saveIndex?.saves?.[saveIndex?.activeSaveId || ''];
  if (!entry) {
    return {
      status: 'warning',
      reason: 'active-save-index-entry-missing',
      saveId: saveId || saveIndex?.activeSaveId || null
    };
  }
  const resolvedSaveId = entry.id || saveId || null;
  const resolvedCampaignId = campaignId || campaignIdForSaveIndexEntry(entry);
  if (!resolvedCampaignId) {
    return {
      status: 'warning',
      reason: 'campaign-id-for-core-projection-missing',
      saveId: resolvedSaveId
    };
  }
  const adapter = createBrowserLogicalStorageAdapter(page);
  const projections = await readCoreStoreProjectionsV2(adapter, {
    campaignId: resolvedCampaignId,
    saveId: resolvedSaveId
  });
  const coreManifestPath = toSillyTavernUserFilesPath(coreSaveManifestV2LogicalKey({
    campaignId: resolvedCampaignId,
    saveId: resolvedSaveId
  }));
  return {
    status: 'pass',
    entry,
    projections,
    saveId: resolvedSaveId,
    campaignId: resolvedCampaignId,
    payloadPath: userFilesPathForIndexedEntry(entry),
    coreManifestPath
  };
}

function campaignIdFromV2ManifestRef(ref = {}) {
  const logicalKey = String(ref?.logicalKey || '');
  const match = logicalKey.match(/^campaigns\/([^/]+)\/saves\/([^/]+)\//u);
  return match?.[1] || null;
}

function campaignIdForSaveIndexEntry(entry = {}) {
  return entry?.campaignId
    || entry?.metadata?.campaignId
    || entry?.metadata?.campaignChatBinding?.campaignId
    || campaignIdFromV2ManifestRef(entry?.v2ManifestRef)
    || null;
}

function createBrowserLogicalStorageAdapter(page) {
  return {
    async readJson(logicalKey) {
      return readBrowserStorageJson(
        page,
        toSillyTavernUserFilesPath(logicalKey),
        `Directive logical storage ${logicalKey}`,
        { unavailableIsSkip: true }
      );
    }
  };
}

async function capturePersistedGenerationTimingProof(page, {
  saveId = null,
  campaignId = null,
  beforeSnapshot = null,
  afterSnapshot = null,
  targetTransactionIds = [],
  targetPlayerHostMessageIds = []
} = {}) {
  try {
    const core = await captureCoreStoreProjections(page, {
      saveId,
      campaignId,
      label: 'Directive save index for generation timing proof'
    });
    if (core.status !== 'pass') {
      return {
        status: 'warning',
        source: 'coreStoreTurnTiming',
        timingSource: 'coreProjection',
        reason: core.reason,
        saveId: core.saveId || saveId || null
      };
    }
    return generationTimingProofFromCoreProjections({
      source: 'coreStoreTurnTiming',
      saveId: core.saveId,
      campaignId: core.campaignId,
      payloadPath: core.payloadPath,
      coreManifestPath: core.coreManifestPath,
      projections: core.projections,
      beforeSnapshot,
      afterSnapshot,
      targetTransactionIds,
      targetPlayerHostMessageIds
    });
  } catch (error) {
    return {
      status: 'warning',
      source: 'coreStoreTurnTiming',
      timingSource: 'coreProjection',
      reason: error?.message || String(error),
      saveId: saveId || null
    };
  }
}

async function capturePersistedHostNativeCompletionProof(page, {
  saveId = null,
  campaignId = null,
  beforeSnapshot = null,
  afterSnapshot = null,
  targetTransactionIds = [],
  targetPlayerHostMessageIds = []
} = {}) {
  try {
    const core = await captureCoreStoreProjections(page, {
      saveId,
      campaignId,
      label: 'Directive save index for host-native completion proof'
    });
    if (core.status !== 'pass') {
      return {
        status: 'warning',
        source: 'coreStoreResponseLedger',
        completionSource: 'coreProjection',
        reason: core.reason,
        saveId: core.saveId || saveId || null
      };
    }
    return hostNativeCompletionProofFromCoreProjections({
      source: 'coreStoreResponseLedger',
      saveId: core.saveId,
      campaignId: core.campaignId,
      payloadPath: core.payloadPath,
      coreManifestPath: core.coreManifestPath,
      projections: core.projections,
      beforeSnapshot,
      afterSnapshot,
      targetTransactionIds,
      targetPlayerHostMessageIds
    });
  } catch (error) {
    return {
      status: 'warning',
      source: 'coreStoreResponseLedger',
      completionSource: 'coreProjection',
      reason: error?.message || String(error),
      saveId: saveId || null
    };
  }
}

async function reobserveHostGenerationCompletions(page) {
  try {
    return await page.evaluate(async (modulePath) => {
      const mod = await import(modulePath);
      const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
      const app = bridge.runtimeApp || null;
      if (typeof app?.reobserveHostGenerationCompletions !== 'function') {
        return { ok: false, skipped: true, reason: 'reobserveHostGenerationCompletions-unavailable' };
      }
      return app.reobserveHostGenerationCompletions();
    }, bridgeModulePath());
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: error?.message || String(error)
    };
  }
}

async function waitForPersistedHostNativeCompletionProof(page, {
  saveId = null,
  campaignId = null,
  beforeSnapshot = null,
  afterSnapshot = null,
  targetTransactionIds = [],
  targetPlayerHostMessageIds = [],
  timeoutMs = HOST_NATIVE_COMPLETION_PROOF_TIMEOUT_MS,
  pollingMs = 1000
} = {}) {
  const startedAt = Date.now();
  const timeout = Math.max(1, Number(timeoutMs || HOST_NATIVE_COMPLETION_PROOF_TIMEOUT_MS));
  const polling = Math.max(100, Number(pollingMs || 1000));
  let latest = null;
  let attempts = 0;
  while (true) {
    attempts += 1;
    const reobserve = await reobserveHostGenerationCompletions(page);
    latest = await capturePersistedHostNativeCompletionProof(page, {
      saveId,
      campaignId,
      beforeSnapshot,
      afterSnapshot,
      targetTransactionIds,
      targetPlayerHostMessageIds
    });
    latest = {
      ...latest,
      reobserveHostGeneration: reobserve ? {
        ok: reobserve.ok === true,
        skipped: reobserve.skipped === true,
        reason: reobserve.reason || null,
        checkedResponseCount: reobserve.checkedResponseCount ?? null,
        checkedCoreProjectionCount: reobserve.checkedCoreProjectionCount ?? null,
        completedCount: reobserve.completedCount ?? null,
        refreshResult: reobserve.refreshResult ? {
          ok: reobserve.refreshResult.ok === true,
          refreshed: reobserve.refreshResult.refreshed === true,
          reason: reobserve.refreshResult.reason || null,
          error: reobserve.refreshResult.error ? {
            code: reobserve.refreshResult.error.code || null,
            message: reobserve.refreshResult.error.message || null
          } : null
        } : null,
        results: Array.isArray(reobserve.results)
          ? reobserve.results.map((entry) => ({
            responseId: entry.responseId || null,
            status: entry.status || null,
            ok: entry.ok === true,
            hostMessageId: entry.hostMessageId || null,
            index: entry.index ?? null,
            textHash: entry.textHash || null,
            reason: entry.reason || null,
            playerHostMessageId: entry.playerHostMessageId || null,
            playerIndex: entry.playerIndex ?? null,
            recentMessageCount: entry.recentMessageCount ?? null,
            recentWindowAfterPlayer: Array.isArray(entry.recentWindowAfterPlayer)
              ? entry.recentWindowAfterPlayer.slice(0, 8)
              : [],
            recentTail: Array.isArray(entry.recentTail)
              ? entry.recentTail.slice(0, 8)
              : []
          })).slice(-8)
          : [],
        coreProjectionResults: Array.isArray(reobserve.coreProjectionResults)
          ? reobserve.coreProjectionResults.map((entry) => ({
            transactionId: entry.transactionId || null,
            status: entry.status || null,
            ok: entry.ok === true,
            source: entry.source || null,
            hostMessageId: entry.hostMessageId || null,
            index: entry.index ?? null,
            textHash: entry.textHash || null,
            reason: entry.reason || null,
            playerHostMessageId: entry.playerHostMessageId || null,
            playerIndex: entry.playerIndex ?? null,
            recentMessageCount: entry.recentMessageCount ?? null,
            recentWindowAfterPlayer: Array.isArray(entry.recentWindowAfterPlayer)
              ? entry.recentWindowAfterPlayer.slice(0, 8)
              : [],
            recentTail: Array.isArray(entry.recentTail)
              ? entry.recentTail.slice(0, 8)
              : [],
            error: entry.error ? {
              code: entry.error.code || null,
              message: entry.error.message || null
            } : null
          })).slice(-8)
          : []
      } : null
    };
    const targetOutcome = hostNativeCompletionTargetOutcome(latest, {
      targetTransactionIds,
      targetPlayerHostMessageIds
    });
    const completed = Number(latest?.completedHostContinueCount || 0);
    const failed = Number(latest?.failedHostContinueCount || 0);
    const targetCompleted = Number(targetOutcome.targetCompletedHostContinueCount || 0);
    const noExplicitTargetReady = targetOutcome.hasExplicitTargets !== true
      && (latest?.status === 'pass' || completed > 0 || failed > 0);
    if (targetOutcome.status === 'pass' || noExplicitTargetReady) {
      return {
        ...latest,
        targetOutcomeStatus: targetOutcome.status,
        targetCompletedHostContinueCount: targetCompleted,
        targetFailedHostContinueCount: Number(targetOutcome.targetFailedHostContinueCount || 0),
        targetEntryCount: targetOutcome.targetEntryCount,
        waitedForCompletionProof: attempts > 1,
        proofWaitAttempts: attempts,
        proofWaitMs: Date.now() - startedAt,
        proofWaitTimedOut: false
      };
    }
    if (Date.now() - startedAt >= timeout) break;
    await sleep(Math.min(polling, Math.max(0, timeout - (Date.now() - startedAt))));
  }
  const targetOutcome = hostNativeCompletionTargetOutcome(latest, {
    targetTransactionIds,
    targetPlayerHostMessageIds
  });
  return {
    ...(latest || {
      status: 'warning',
      source: 'coreStoreResponseLedger',
      completionSource: 'coreProjection',
      saveId: saveId || null,
      campaignId: campaignId || null
    }),
    targetOutcomeStatus: targetOutcome.status,
    targetCompletedHostContinueCount: Number(targetOutcome.targetCompletedHostContinueCount || 0),
    targetFailedHostContinueCount: Number(targetOutcome.targetFailedHostContinueCount || 0),
    targetEntryCount: targetOutcome.targetEntryCount,
    waitedForCompletionProof: attempts > 0,
    proofWaitAttempts: attempts,
    proofWaitMs: Date.now() - startedAt,
    proofWaitTimedOut: true
  };
}

function aggregateGenerationTimingProof(rounds = []) {
  const persisted = rounds.map((round) => round.generationTiming?.persisted).filter(Boolean);
  const runtime = rounds.map((round) => round.generationTiming?.runtime).filter(Boolean);
  const persistedWithEntries = persisted.filter((proof) => (proof.entries || []).length > 0);
  const runtimeWithEntries = runtime.filter((proof) => (proof.entries || []).length > 0);
  const proofs = persisted;
  const checked = proofs.flatMap((proof) => proof.entries || []);
  const skipped = proofs.flatMap((proof) => proof.skippedEntries || []);
  const failed = proofs.filter((proof) => proof.status === 'fail');
  const warnings = proofs.filter((proof) => proof.status === 'warning');
  return {
    status: failed.length > 0 ? 'fail' : (checked.length > 0 ? 'pass' : 'warning'),
    source: 'coreStoreTurnTiming',
    timingSource: persistedWithEntries.length ? 'coreProjection' : null,
    runtimeSnapshotAvailable: runtimeWithEntries.length > 0,
    proofCount: proofs.length,
    checkedTurnCount: checked.length,
    skippedTurnCount: skipped.length,
    targetPlayerHostMessageIds: targetPlayerHostMessageIdsForRounds(rounds),
    targetTransactionIds: uniqueStringList(proofs.flatMap((proof) => proof.targetTransactionIds || [])),
    maxGenerationStartLatencyMs: checked.reduce((max, entry) => {
      const value = Number(entry.turnLatency?.generationStartLatencyMs);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0) || null,
    warningCount: warnings.length,
    failureCount: failed.length,
    routes: [...new Set(checked.map((entry) => entry.route).filter(Boolean))]
  };
}

function aggregateHostNativeCompletionProof(rounds = []) {
  const proofs = rounds.map((round) => round.hostNativeCompletion?.persisted).filter(Boolean);
  const entries = proofs.flatMap((proof) => proof.entries || []);
  const completed = entries.filter((entry) => entry.completionStatus === 'pass');
  const failed = entries.filter((entry) => entry.completionStatus && entry.completionStatus !== 'pass');
  const requiredCompletions = rounds
    .map((round) => round.hostNativeCompletionRequirement)
    .filter((entry) => entry?.required === true);
  const requiredCompletionFailures = requiredCompletions.filter((entry) => entry.status !== 'pass');
  const requiredCompletionPasses = requiredCompletions.filter((entry) => entry.status === 'pass');
  const warningProofs = proofs.filter((proof) => proof.status === 'warning');
  const failedProofs = proofs.filter((proof) => proof.status === 'fail');
  return {
    status: failedProofs.length > 0 || failed.length > 0 || requiredCompletionFailures.length > 0
      ? 'fail'
      : (completed.length > 0 ? 'pass' : 'warning'),
    source: 'coreStoreResponseLedger',
    completionSource: completed.length ? 'coreProjection' : null,
    proofCount: proofs.length,
    completedHostContinueCount: completed.length,
    failedHostContinueCount: failed.length,
    targetPlayerHostMessageIds: targetPlayerHostMessageIdsForRounds(rounds),
    targetTransactionIds: uniqueStringList(proofs.flatMap((proof) => proof.targetTransactionIds || [])),
    requiredCompletionCount: requiredCompletions.length,
    requiredCompletionPassCount: requiredCompletionPasses.length,
    requiredCompletionFailureCount: requiredCompletionFailures.length,
    warningProofCount: warningProofs.length,
    failureProofCount: failedProofs.length,
    maxCompletionLatencyMs: completed.reduce((max, entry) => {
      const value = Number(entry.completionLatencyMs);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0) || null,
    transactionIds: [...new Set(completed.map((entry) => entry.transactionId).filter(Boolean))],
    entries: completed,
    failures: failed,
    requiredCompletions,
    requiredHostNativeCompletions: requiredCompletions,
    unavailableReasons: [...new Set(proofs.map((proof) => proof.unavailableReason || proof.reason).filter(Boolean))]
  };
}

function targetPlayerHostMessageIdsForRound(round = {}) {
  return uniqueStringList([
    round.after?.matchedUserHostMessageId,
    round.after?.matchedUserIndex,
    round.after?.matchedIngress?.hostMessageId,
    round.sendResult?.directiveFallbackScan?.matchedIndex
  ]);
}

function targetPlayerHostMessageIdsForRounds(rounds = []) {
  return uniqueStringList((rounds || []).flatMap((round) => targetPlayerHostMessageIdsForRound(round)));
}

async function assertMissionBodyShowsCampaign(page, summary) {
  const visible = await page.evaluate((expected) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const body = document.querySelector('#directive-runtime-panel [data-directive-runtime-body="true"]');
    const text = normalize(body?.textContent || '');
    const checks = ['playerName', 'shipName', 'campaignTitle'].filter((key) => expected?.[key]);
    return {
      checks,
      missing: checks.filter((key) => !text.includes(expected[key])),
      excerpt: text.slice(0, 400)
    };
  }, summary);
  assertBrowser(visible.missing.length === 0, 'Mission body did not show the loaded branch campaign identity.', visible);
}

async function assertCampaignCommandGroupsLatestSave(page, branchRecord, latestSaveId) {
  const expected = campaignIdentitySummary(branchRecord);
  await selectCampaignSubtab(page, 'Command');
  const command = await page.evaluate(async ({ modulePath, campaignId, latestSaveId: expectedLatestSaveId }) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const view = await bridge.runtimeApp?.getCurrentView?.({ tabId: 'campaign' });
    const sessions = Array.isArray(view?.campaignIndex?.sessions) ? view.campaignIndex.sessions : [];
    const visibleSessions = Array.isArray(view?.campaignIndex?.visibleSessions) ? view.campaignIndex.visibleSessions : [];
    const matching = sessions.filter((session) => session.campaignId === campaignId);
    const visibleMatching = visibleSessions.filter((session) => session.campaignId === campaignId);
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const body = panel?.querySelector('[data-directive-runtime-body="true"]') || null;
    const rows = Array.from(body?.querySelectorAll('.directive-campaign-session-row') || []).map((row) => ({
      key: row.dataset.campaignSessionKey || '',
      text: normalize(row.textContent)
    }));
    const target = matching[0] || null;
    return {
      expectedLatestSaveId,
      campaignId,
      sessionCount: sessions.length,
      matching,
      visibleMatching,
      target,
      targetDomRows: target?.key ? rows.filter((row) => row.key === target.key) : [],
      rowCount: rows.length,
      bodyText: normalize(body?.textContent || '').slice(0, 1400)
    };
  }, {
    modulePath: bridgeModulePath(),
    campaignId: expected.campaignId,
    latestSaveId
  });

  assertBrowser(command.matching.length === 1, 'Campaign Command should show one card for the campaign after Save Game As, not one card per save.', command);
  assertBrowser(command.visibleMatching.length === 1, 'Campaign Command visible list should contain one campaign card after Save Game As.', command);
  assertBrowser(command.target?.saveId === latestSaveId, 'Campaign Command card should target the latest Save Game As branch.', command);
  assertBrowser(Number(command.target?.saveCount || 0) >= 2, 'Campaign Command card should preserve the grouped save count after Save Game As.', command);
  assertBrowser(command.targetDomRows.length === 1, 'Campaign Command DOM should render one row for the grouped campaign card.', command);
  assertBrowser(/Latest Save/i.test(command.bodyText), 'Campaign Command should label the representative save as Latest Save.', command);
  assertBrowser(/Load Latest Save/i.test(command.bodyText), 'Campaign Command should expose Load Latest Save for the grouped campaign card.', command);
  return {
    campaignId: expected.campaignId,
    latestSaveId,
    saveCount: command.target.saveCount,
    rowCount: command.rowCount
  };
}

async function currentDirectiveChatBinding(page) {
  return page.evaluate(async (modulePath) => {
    const clone = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));
    try {
      const mod = await import(modulePath);
      const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
      const hostBinding = bridge.host?.chat?.getBindingMetadata?.();
      if (hostBinding) return clone(hostBinding);
      const view = await bridge.runtimeApp?.getCurrentView?.({ tabId: 'campaign' });
      if (view?.chatNative?.binding) return clone(view.chatNative.binding);
    } catch {
      // Fall back to raw host context metadata below.
    }
    const ctx = globalThis.SillyTavern?.getContext?.();
    const metadata = ctx?.chatMetadata || ctx?.chat_metadata || null;
    return clone(metadata?.directiveCampaignBinding || null);
  }, bridgeModulePath());
}

async function clickCampaignSaveLoad(page, saveName) {
  await selectCampaignSubtab(page, 'Records');
  const row = page.locator('#directive-runtime-panel [data-directive-runtime-body="true"] .directive-starship-save-row').filter({
    hasText: saveName
  }).first();
  await row.waitFor({ timeout: BROWSER_TIMEOUT_MS });
  await row.click({ timeout: BROWSER_TIMEOUT_MS });
  await clickBodyButton(page, 'Load Save');
  await page.waitForFunction((missionRouteId) => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const selected = panel?.querySelector(`[data-route-id="${missionRouteId}"]`);
    const body = panel?.querySelector('[data-directive-runtime-body="true"]');
    const bodyText = String(body?.textContent || '');
    return Boolean(
      selected
      && selected.getAttribute('aria-selected') === 'true'
      && body
      && /Active Campaign|Campaign Chat|Open Campaign Chat|Formal Objectives/i.test(bodyText)
    );
  }, ROUTE_IDS.Mission, {
    timeout: BROWSER_TIMEOUT_MS
  });
}

async function verifySaveAsBranchReselect(page, saveAsName, sourceBindingBeforeSaveAs = null) {
  try {
    const saveIndexAfterSaveAs = await readBrowserStorageJson(
      page,
      SAVE_INDEX_USER_FILES_PATH,
      'Directive save index',
      { unavailableIsSkip: true }
    );
    const branchEntry = findSaveEntryByName(saveIndexAfterSaveAs, saveAsName);
    assertActiveSaveIndex(saveIndexAfterSaveAs, branchEntry.id, 'Save Game As branch');

    const payloadPath = userFilesPathForIndexedEntry(branchEntry);
    const branchRecordBeforeLoad = await readBrowserStorageJson(page, payloadPath, 'Save Game As branch payload');
    assert.equal(branchRecordBeforeLoad?.kind, 'directive.campaignSave', 'Save Game As branch payload kind');
    assert.equal(branchRecordBeforeLoad?.id, branchEntry.id, 'Save Game As branch payload id');
    assert.equal(branchRecordBeforeLoad?.name, saveAsName, 'Save Game As branch payload name');
    assert.equal(
      branchRecordBeforeLoad?.payload?.campaignState?.campaignChatBinding?.saveId,
      branchEntry.id,
      'Save Game As branch campaignChatBinding saveId'
    );
    const branchChatId = branchRecordBeforeLoad?.payload?.campaignState?.campaignChatBinding?.chatId || null;
    assertBrowser(branchChatId, 'Save Game As branch payload must include a cloned campaign chat id.', branchRecordBeforeLoad);
    if (sourceBindingBeforeSaveAs?.chatId) {
      assert.notEqual(
        branchChatId,
        sourceBindingBeforeSaveAs.chatId,
        'Save Game As branch must point at a cloned chat, not the source chat.'
      );
    }
    const chatBindingAfterSaveAs = await currentDirectiveChatBinding(page);
    assert.equal(chatBindingAfterSaveAs?.saveId, branchEntry.id, 'Active chat metadata saveId after Save Game As');
    assert.equal(chatBindingAfterSaveAs?.chatId, branchChatId, 'Active chat metadata chatId after Save Game As');
    assert.equal(
      chatBindingAfterSaveAs?.campaignId,
      branchRecordBeforeLoad?.payload?.campaignState?.campaign?.id,
      'Active chat metadata campaignId after Save Game As'
    );
    const beforeSummary = campaignIdentitySummary(branchRecordBeforeLoad);
    const commandGrouping = await assertCampaignCommandGroupsLatestSave(page, branchRecordBeforeLoad, branchEntry.id);

    await clickCampaignSaveLoad(page, saveAsName);
    const missionSnapshot = await panelSnapshot(page);
    assertBrowser(missionSnapshot.selectedRouteId === ROUTE_IDS.Mission, 'Branch load did not return to Mission.', missionSnapshot);
    assertBrowser(missionSnapshot.hasActiveCampaign, 'Branch load did not render an active Mission campaign.', missionSnapshot);
    await assertMissionBodyShowsCampaign(page, beforeSummary);

    const saveIndexAfterLoad = await readBrowserStorageJson(page, SAVE_INDEX_USER_FILES_PATH, 'Directive save index after branch load');
    assertActiveSaveIndex(saveIndexAfterLoad, branchEntry.id, 'Loaded Save Game As branch');

    const branchRecordAfterLoad = await readBrowserStorageJson(page, payloadPath, 'Save Game As branch payload after load');
    assert.deepEqual(
      campaignIdentitySummary(branchRecordAfterLoad),
      beforeSummary,
      'Loading the Save Game As branch changed its campaign identity payload.'
    );

    return {
      skipped: false,
      saveIndexPath: SAVE_INDEX_USER_FILES_PATH,
      saveId: branchEntry.id,
      saveNamePrefix: 'Directive Live Smoke',
      payloadPath,
      sourceChatId: sourceBindingBeforeSaveAs?.chatId || null,
      branchChatId,
      loadedFrom: 'Campaign saves row',
      activeAfterLoad: true,
      campaign: beforeSummary,
      commandGrouping
    };
  } catch (error) {
    if (error instanceof OptionalCheckSkipError) {
      return error.result;
    }
    throw error;
  }
}

function chatCampaignMessageScript() {
  if (CHAT_MESSAGES_FILE) {
    const filePath = path.resolve(process.cwd(), CHAT_MESSAGES_FILE);
    return parseChatMessageScriptPayload(fs.readFileSync(filePath, 'utf8'), `file:${filePath}`);
  }
  if (CHAT_MESSAGES_JSON) {
    return parseChatMessageScriptPayload(CHAT_MESSAGES_JSON, 'env:DIRECTIVE_SILLYTAVERN_CHAT_MESSAGES_JSON');
  }
  return parseChatMessageScriptPayload({
    messages: [
      {
        id: 'default-1',
        label: 'Freighter pursuit',
        category: 'clean-play',
        perspective: 'third-person',
        text: 'Commander Serrin orders helm to change course and pursue the freighter while operations keeps passive sensors on the convoy.'
      },
      {
        id: 'default-2',
        label: 'Medical rescue',
        category: 'clean-play',
        perspective: 'third-person',
        text: 'Serrin authorizes medical to prepare rescue teams and hails the freighter with a direct offer of aid while keeping shields raised.'
      },
      {
        id: 'default-3',
        label: 'Civilian diversion',
        category: 'clean-play',
        perspective: 'third-person',
        text: 'Serrin chooses to divert toward the civilians, launches a probe, and assigns engineering to stabilize the transfer corridor.'
      }
    ]
  }, 'default');
}

function bridgeModulePath() {
  return `${EXTENSION_PATH}/src/hosts/sillytavern/runtime-bridge.mjs`;
}

function runtimeLedgerViewModulePath() {
  return `${EXTENSION_PATH}/src/runtime/runtime-ledger-view.mjs`;
}

function terminalDecisionLedgerViewModulePath() {
  return `${EXTENSION_PATH}/src/runtime/terminal-decision-ledger-view.mjs`;
}

function shellEventsModulePath() {
  return `${EXTENSION_PATH}/src/hosts/sillytavern/shell-events.js`;
}

function transcriptMarkdown(transcript, metadata = {}) {
  const lines = [
    '# Directive Live Campaign Transcript',
    '',
    `Captured: ${transcript.capturedAt || new Date().toISOString()}`,
    `Chat: ${transcript.currentChatId || 'unknown'}`,
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

async function captureChatTranscript(page, metadata = {}) {
  if (!TRANSCRIPT_DIR) return null;
  let transcript;
  try {
    transcript = await evaluateBrowserJson(page, () => {
      const messageText = (message) => {
        const value = message?.mes ?? message?.content ?? message?.text ?? '';
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map((part) => part?.text || '').filter(Boolean).join('\n');
        return String(value || '');
      };
      const directiveMetadata = (message) => (
        message?.extra?.directive
        || message?.metadata?.directive
        || null
      );
      const context = globalThis.SillyTavern?.getContext?.() || {};
      const chat = Array.isArray(context?.chat) ? context.chat : [];
      return {
        capturedAt: new Date().toISOString(),
        currentChatId: context?.chatId || context?.chat_id || null,
        messages: chat.map((message, index) => {
          const metadataValue = directiveMetadata(message);
          return {
            index,
            name: message?.name || message?.sender || '',
            isUser: message?.is_user === true || message?.role === 'user',
            isSystem: message?.is_system === true || message?.role === 'system',
            directiveOwned: Boolean(metadataValue),
            responseKind: metadataValue?.responseKind || null,
            text: messageText(message)
          };
        })
      };
    }, null, BROWSER_TIMEOUT_MS);
  } catch (error) {
    appendLiveLog({
      kind: 'transcript-capture',
      status: 'warning',
      reason: metadata.reason || 'snapshot',
      scriptMessageId: metadata.scriptMessageId || null,
      scriptCategory: metadata.scriptCategory || null,
      error: errorSummary(error)
    });
    return null;
  }
  ensureDirectory(TRANSCRIPT_DIR);
  const readableTranscript = path.join(TRANSCRIPT_DIR, 'readable-chat.md');
  const sourceChatTranscript = path.join(TRANSCRIPT_DIR, 'source-chat.jsonl');
  const transcriptIndex = path.join(TRANSCRIPT_DIR, 'index.json');
  const snapshotId = [
    String(transcript.messages?.length || 0).padStart(4, '0'),
    slugPart(metadata.reason || 'snapshot'),
    slugPart(metadata.scriptMessageId || 'campaign')
  ].join('-');
  const snapshotDir = path.join(TRANSCRIPT_DIR, 'snapshots');
  const snapshotSourceChatTranscript = path.join(snapshotDir, `${snapshotId}.source-chat.jsonl`);
  const snapshotReadableTranscript = path.join(snapshotDir, `${snapshotId}.readable-chat.md`);
  const sourceChatText = `${(transcript.messages || []).map((message) => JSON.stringify(message)).join('\n')}${transcript.messages?.length ? '\n' : ''}`;
  const readableText = transcriptMarkdown(transcript, metadata);
  writeTextArtifact(readableTranscript, readableText);
  writeTextArtifact(sourceChatTranscript, sourceChatText);
  writeTextArtifact(snapshotReadableTranscript, readableText);
  writeTextArtifact(snapshotSourceChatTranscript, sourceChatText);
  writeJsonArtifact(transcriptIndex, {
    capturedAt: transcript.capturedAt,
    reason: metadata.reason || 'snapshot',
    scriptMessageId: metadata.scriptMessageId || null,
    scriptCategory: metadata.scriptCategory || null,
    currentChatId: transcript.currentChatId || null,
    messageCount: transcript.messages?.length || 0,
    readableTranscript,
    sourceChatTranscript,
    snapshotReadableTranscript,
    snapshotSourceChatTranscript
  });
  const capture = {
    reason: metadata.reason || 'snapshot',
    scriptMessageId: metadata.scriptMessageId || null,
    currentChatId: transcript.currentChatId || null,
    messageCount: transcript.messages?.length || 0,
    readableTranscript,
    sourceChatTranscript,
    snapshotReadableTranscript,
    snapshotSourceChatTranscript,
    transcriptIndex
  };
  appendLiveLog({
    kind: 'transcript-capture',
    status: 'pass',
    ...capture
  });
  return capture;
}

function sanitizePromptInspection(promptInspection = null) {
  if (!promptInspection || typeof promptInspection !== 'object') return null;
  const blocks = Array.isArray(promptInspection.blocks)
    ? promptInspection.blocks.map((block) => ({
      key: block?.key || null,
      promptKey: block?.promptKey || block?.key || null,
      id: block?.id || null,
      title: block?.title || null,
      hash: block?.hash || null,
      contentHash: block?.contentHash || null,
      priority: block?.priority ?? null,
      depth: block?.depth ?? null,
      ttl: block?.ttl || null,
      sourceHash: block?.sourceHash || null,
      sourceIds: Array.isArray(block?.sourceIds) ? [...block.sourceIds] : [],
      sourceRevision: block?.sourceRevision ?? null
    }))
    : [];
  return {
    kind: promptInspection.kind || 'directive.promptInspection',
    status: promptInspection.status || null,
    binding: jsonClone(promptInspection.binding || null),
    revision: promptInspection.revision ?? null,
    hash: promptInspection.hash || null,
    blockCount: promptInspection.blockCount ?? blocks.length,
    blocks,
    externalPromptEnvironmentRef: jsonClone(promptInspection.externalPromptEnvironmentRef || null),
    knownExternalPromptKeys: Array.isArray(promptInspection.knownExternalPromptKeys)
      ? promptInspection.knownExternalPromptKeys.filter(Boolean).map(String)
      : [],
    directiveOwnedPromptKeys: Array.isArray(promptInspection.directiveOwnedPromptKeys)
      ? promptInspection.directiveOwnedPromptKeys.filter(Boolean).map(String)
      : blocks.map((block) => block.promptKey).filter((key) => /^directive\./.test(String(key || ''))),
    finalHostPromptMayIncludeExternal: promptInspection.finalHostPromptMayIncludeExternal ?? null,
    externalPromptEnvironmentTargets: jsonClone(promptInspection.externalPromptEnvironmentTargets || null),
    unavailableSignals: Array.isArray(promptInspection.unavailableSignals)
      ? promptInspection.unavailableSignals.filter(Boolean).map(String)
      : [],
    redactions: Array.isArray(promptInspection.redactions)
      ? promptInspection.redactions.map((entry) => ({
          key: entry?.key || null,
          reason: entry?.reason || null
        })).filter((entry) => entry.reason)
      : [],
    updatedAt: promptInspection.updatedAt || null,
    lastError: promptInspection.lastError ? { message: compact(promptInspection.lastError.message || promptInspection.lastError, 240) } : null
  };
}

function promptInspectionExternalSummary(promptInspection = null) {
  if (!promptInspection || typeof promptInspection !== 'object') {
    return {
      externalPromptEnvironmentRef: null,
      knownExternalPromptKeys: [],
      directiveOwnedPromptKeys: [],
      finalHostPromptMayIncludeExternal: null,
      externalPromptEnvironmentTargets: null,
      unavailableSignals: [],
      redactions: [],
      redactionReasons: []
    };
  }
  const redactions = Array.isArray(promptInspection.redactions)
    ? promptInspection.redactions.map((entry) => ({
        key: entry?.key || null,
        reason: entry?.reason || null
      })).filter((entry) => entry.reason)
    : [];
  return {
    externalPromptEnvironmentRef: jsonClone(promptInspection.externalPromptEnvironmentRef || null),
    knownExternalPromptKeys: Array.isArray(promptInspection.knownExternalPromptKeys)
      ? promptInspection.knownExternalPromptKeys.filter(Boolean).map(String)
      : [],
    directiveOwnedPromptKeys: Array.isArray(promptInspection.directiveOwnedPromptKeys)
      ? promptInspection.directiveOwnedPromptKeys.filter(Boolean).map(String)
      : [],
    finalHostPromptMayIncludeExternal: promptInspection.finalHostPromptMayIncludeExternal ?? null,
    externalPromptEnvironmentTargets: jsonClone(promptInspection.externalPromptEnvironmentTargets || null),
    unavailableSignals: Array.isArray(promptInspection.unavailableSignals)
      ? promptInspection.unavailableSignals.filter(Boolean).map(String)
      : [],
    redactions,
    redactionReasons: [...new Set(redactions.map((entry) => entry.reason).filter(Boolean))]
  };
}

function capturePromptInspectionSnapshot(snapshot, metadata = {}) {
  if (!PROMPT_INSPECTION_DIR) return null;
  const promptInspection = sanitizePromptInspection(snapshot?.promptInspection || null);
  const externalSummary = promptInspectionExternalSummary(promptInspection);
  const capturedAt = new Date().toISOString();
  const snapshotId = [
    slugPart(metadata.reason || 'prompt'),
    slugPart(metadata.scriptMessageId || 'campaign'),
    String(snapshot?.chatLength ?? 0).padStart(4, '0')
  ].join('-');
  const artifactPath = path.join(PROMPT_INSPECTION_DIR, `${snapshotId}.json`);
  const artifact = {
    kind: 'directive.sillytavern.promptInspectionSnapshot',
    schemaVersion: 1,
    capturedAt,
    reason: metadata.reason || 'snapshot',
    scriptMessageId: metadata.scriptMessageId || null,
    scriptLabel: metadata.scriptLabel || null,
    scriptCategory: metadata.scriptCategory || null,
    currentChatId: snapshot?.currentChatId || null,
    chatLength: snapshot?.chatLength ?? null,
    promptInspection
  };
  writeJsonArtifact(artifactPath, artifact);
  const capture = {
    reason: artifact.reason,
    scriptMessageId: artifact.scriptMessageId,
    currentChatId: artifact.currentChatId,
    chatLength: artifact.chatLength,
    promptInspectionStatus: promptInspection?.status || null,
    promptRevision: promptInspection?.revision ?? null,
    promptHash: promptInspection?.hash || null,
    promptBlockCount: promptInspection?.blockCount ?? null,
    ...externalSummary,
    artifactPath
  };
  appendLiveLog({
    kind: 'prompt-inspection-capture',
    status: promptInspection ? 'pass' : 'warning',
    ...capture
  });
  return capture;
}

async function chatNativeRuntimeSnapshot(page) {
  return evaluateBrowserJson(page, async ({ modulePath, ledgerModulePath, terminalLedgerModulePath }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const compactText = (value, max = 180) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length <= max ? text : `${text.slice(0, max)}...`;
    };
    const messageText = (message) => {
      const value = message?.mes ?? message?.content ?? message?.text ?? '';
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) {
        return value.map((part) => part?.text || '').filter(Boolean).join('\n');
      }
      return String(value || '');
    };
    const directiveMetadata = (message) => (
      message?.extra?.directive
      || message?.metadata?.directive
      || null
    );
    const latestItem = (items) => (Array.isArray(items) && items.length > 0 ? items.at(-1) : null);
    const safeCheckpoint = (checkpoint) => checkpoint && typeof checkpoint === 'object'
      ? {
          source: checkpoint.source || null,
          outcomeId: checkpoint.outcomeId || null,
          retained: checkpoint.retained === true
        }
      : null;
    const safeEndConditionDetection = (entry) => entry && typeof entry === 'object'
      ? {
          id: entry.id || null,
          decisionId: entry.decisionId || null,
          conditionId: entry.conditionId || null,
          family: entry.family || null,
          severity: entry.severity || null,
          simulationMode: entry.simulationMode || null,
          turnId: entry.turnId || null,
          outcomeId: entry.outcomeId || null,
          terminalOutcomeBand: entry.terminalOutcomeBand || null,
          finalCampaignBand: entry.finalCampaignBand || null,
          detectedAt: entry.detectedAt || null,
          checkpoint: safeCheckpoint(entry.checkpoint)
        }
      : null;
    const safeEndConditionDecision = (entry) => entry && typeof entry === 'object'
      ? {
          id: entry.id || null,
          detectionId: entry.detectionId || null,
          conditionId: entry.conditionId || null,
          status: entry.status || null,
          turnId: entry.turnId || null,
          outcomeId: entry.outcomeId || null,
          terminalOutcomeBand: entry.terminalOutcomeBand || null,
          finalCampaignBand: entry.finalCampaignBand || null,
          finalCampaignBandSummary: compactText(entry.finalCampaignBandSummary, 220),
          playerFacingSummary: compactText(entry.playerFacingSummary, 220),
          checkpoint: safeCheckpoint(entry.checkpoint),
          postedAt: entry.postedAt || null,
          resolvedAt: entry.resolvedAt || null,
          resolutionAction: entry.resolution?.action || entry.resolution || null,
          savedBranchIds: Array.isArray(entry.savedBranchIds) ? entry.savedBranchIds.slice(-4) : []
        }
      : null;
    const context = globalThis.SillyTavern?.getContext?.() || null;
    const selectedGroupId = context?.groupId || context?.group_id || context?.selectedGroupId || globalThis.selected_group || null;
    const selectedCharacterId = context?.characterId
      ?? context?.character_id
      ?? context?.this_chid
      ?? context?.selectedCharacterId
      ?? globalThis.this_chid
      ?? null;
    const selectedEntity = selectedGroupId
      ? {
          entityType: 'group',
          entityId: String(selectedGroupId),
          entityName: context?.groups?.find?.((group) => String(group?.id) === String(selectedGroupId))?.name || 'Group'
        }
      : {
          entityType: 'character',
          entityId: selectedCharacterId === undefined || selectedCharacterId === null ? '' : String(selectedCharacterId),
          entityName: context?.name2 || context?.characterName || globalThis.name2 || 'Character'
        };
    const mod = await import(modulePath);
    let ledgerTools = null;
    try {
      ledgerTools = await import(ledgerModulePath);
    } catch {
      ledgerTools = null;
    }
    let terminalLedgerTools = null;
    try {
      terminalLedgerTools = await import(terminalLedgerModulePath);
    } catch {
      terminalLedgerTools = null;
    }
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    let sillyTavernGeneration = { isSendPress: null, isGenerating: null };
    try {
      const st = await import('/script.js');
      sillyTavernGeneration = {
        isSendPress: st.is_send_press === true,
        isGenerating: typeof st.isGenerating === 'function' ? st.isGenerating() === true : null
      };
    } catch {
      sillyTavernGeneration = { isSendPress: null, isGenerating: null };
    }
    const view = app?.getCurrentView
      ? await app.getCurrentView({ tabId: 'mission' })
      : null;
    const chat = Array.isArray(context?.chat) ? context.chat : [];
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
    const safeModelCallMetadata = (metadata) => {
      if (!metadata || typeof metadata !== 'object') return null;
      const result = {};
      for (const key of [
        'coreDiagnosticTarget',
        'fallbackAdvisoryHash',
        'fallbackHash',
        'fallbackUsed',
        'deterministicFallbackHash',
        'lastGoodProjectionHash',
        'sourceHash',
        'requestHash',
        'candidateFactCount'
      ]) {
        if (metadata[key] === undefined || metadata[key] === null) continue;
        const value = metadata[key];
        result[key] = typeof value === 'string' && value.length > 96
          ? `${value.slice(0, 96)}...`
          : value;
      }
      return Object.keys(result).length ? result : null;
    };
    const safeModelCall = (entry) => ({
      id: entry.id || null,
      roleId: entry.roleId || null,
      status: entry.status || null,
      ok: entry.ok === true,
      providerKind: entry.providerKind || null,
      providerId: entry.providerId || null,
      model: entry.model || null,
      latencyMs: entry.latencyMs ?? null,
      errorCode: entry.errorCode || null,
      requestHash: entry.requestHash || entry.metadata?.requestHash || null,
      fallback: entry.fallback || entry.fallbackPolicy || null,
      fallbackOutcome: entry.fallbackOutcome || entry.fallbackStatus || null,
      retryable: entry.retryable ?? null,
      structuredOutput: entry.structuredOutput === true,
      mayProposeState: entry.mayProposeState === true,
      mayInjectPrompt: entry.mayInjectPrompt === true,
      parseStatus: entry.parseStatus || entry.parserStatus || null,
      validationStatus: entry.validationStatus || null,
      applyStatus: entry.applyStatus || null,
      metadata: safeModelCallMetadata(entry.metadata || null),
      recordedAt: entry.recordedAt || null
    });
    const campaignState = view?.campaignState || {};
    const runtimeLedgerView = typeof ledgerTools?.createRuntimeLedgerView === 'function'
      ? ledgerTools.createRuntimeLedgerView(campaignState, { runtimeOverlay: true })
      : null;
    const runtimeCoreProjections = typeof ledgerTools?.readRuntimeCoreProjections === 'function'
      ? ledgerTools.readRuntimeCoreProjections(campaignState)
      : {};
    const modelCalls = (view?.chatNative?.modelCalls || []).map(safeModelCall);
    const coreSidecarRows = [
      ...(Array.isArray(runtimeCoreProjections?.sidecarDiagnostics) ? runtimeCoreProjections.sidecarDiagnostics : []),
      ...(Array.isArray(runtimeCoreProjections?.backgroundBatches) ? runtimeCoreProjections.backgroundBatches : [])
    ];
    const legacySidecarRows = Array.isArray(view?.campaignState?.runtimeTracking?.sidecarJournal)
      ? view.campaignState.runtimeTracking.sidecarJournal
      : [];
    const sidecars = coreSidecarRows.map((entry) => ({
      id: entry.id || null,
      workerId: entry.workerId || null,
      roleId: entry.roleId || null,
      status: entry.status || null,
      outcomeId: entry.outcomeId || null,
      errorCode: entry.error?.code || null,
      summary: entry.summary || null,
      diagnostics: clone(entry.diagnostics || null),
      sidecarGeneration: clone(entry.diagnostics?.sidecarGeneration || null)
    }));
    const sidecarStatusCounts = sidecars.reduce((counts, entry) => {
      const status = entry.status || 'unknown';
      counts[status] = Number(counts[status] || 0) + 1;
      return counts;
    }, {});
    const runtimeTracking = view?.campaignState?.runtimeTracking || {};
    const ingressLedger = Array.isArray(runtimeLedgerView?.ingressLedger)
      ? runtimeLedgerView.ingressLedger
      : [];
    const responseLedger = Array.isArray(runtimeLedgerView?.responseLedger)
      ? runtimeLedgerView.responseLedger
      : [];
    const safeTurnLatency = (value) => value && typeof value === 'object'
      ? {
          kind: value.kind || null,
          playerSubmittedAt: Number.isFinite(Number(value.playerSubmittedAt)) ? Number(value.playerSubmittedAt) : null,
          turnObservedAt: Number.isFinite(Number(value.turnObservedAt)) ? Number(value.turnObservedAt) : null,
          routeDecidedAt: Number.isFinite(Number(value.routeDecidedAt)) ? Number(value.routeDecidedAt) : null,
          hostGenerationReleasedAt: Number.isFinite(Number(value.hostGenerationReleasedAt)) ? Number(value.hostGenerationReleasedAt) : null,
          directiveGenerationStartedAt: Number.isFinite(Number(value.directiveGenerationStartedAt)) ? Number(value.directiveGenerationStartedAt) : null,
          visibleResponsePostedAt: Number.isFinite(Number(value.visibleResponsePostedAt)) ? Number(value.visibleResponsePostedAt) : null,
          generationStartedAt: Number.isFinite(Number(value.generationStartedAt)) ? Number(value.generationStartedAt) : null,
          generationStartLatencyMs: Number.isFinite(Number(value.generationStartLatencyMs)) ? Number(value.generationStartLatencyMs) : null,
          providerCompletionLatencyMs: Number.isFinite(Number(value.providerCompletionLatencyMs)) ? Number(value.providerCompletionLatencyMs) : null,
          architectureWithin60s: typeof value.architectureWithin60s === 'boolean' ? value.architectureWithin60s : null
        }
      : null;
    const safeIngress = (entry) => ({
      id: entry?.id || null,
      hostMessageId: entry?.hostMessageId || null,
      status: entry?.status || null,
      classification: entry?.classification || null,
      responseStrategy: entry?.responseStrategy || null,
      coreTransactionId: entry?.coreTransactionId || null,
      sourceFrameId: entry?.sourceFrameId || entry?.sourceFrame?.id || null,
      textHash: entry?.textHash || entry?.sourceFrame?.textHash || null,
      receivedAt: entry?.receivedAt || null,
      playerSubmittedAt: entry?.playerSubmittedAt || entry?.receivedAt || null,
      turnId: entry?.turnId || null,
      outcomeId: entry?.outcomeId || null
    });
    const safeResponse = (entry) => ({
      id: entry?.id || null,
      ingressId: entry?.ingressId || null,
      hostMessageId: entry?.hostMessageId || null,
      strategy: entry?.strategy || null,
      responseKind: entry?.responseKind || null,
      status: entry?.status || null,
      turnId: entry?.turnId || null,
      outcomeId: entry?.outcomeId || null,
      coreTransactionId: entry?.coreTransactionId || null,
      coreRelease: entry?.coreRelease ? {
        transactionId: entry.coreRelease.transactionId || null,
        phase: entry.coreRelease.phase || null,
        route: entry.coreRelease.route || null
      } : null,
      hostGenerationReleaseMode: entry?.hostGenerationReleaseMode || null,
      hostGenerationReleasedAt: entry?.hostGenerationReleasedAt || entry?.hostContinuation?.hostGenerationReleasedAt || entry?.hostContinuation?.generationStartedAt || null,
      directiveGenerationStartedAt: entry?.directiveGenerationStartedAt || null,
      generationStartedAt: entry?.generationStartedAt || null,
      postedAt: entry?.postedAt || null,
      turnLatency: safeTurnLatency(entry?.turnLatency)
    });
    const pendingInteractions = (view?.chatNative?.pendingInteractions || []).filter((entry) => entry?.status !== 'resolved');
    const commandLogRoot = view?.campaignState?.commandLog;
    const commandLogEntries = Array.isArray(commandLogRoot?.entries)
      ? commandLogRoot.entries
      : (Array.isArray(commandLogRoot) ? commandLogRoot : []);
    const turnLedgerRoot = view?.campaignState?.turnLedger;
    const turnLedgerEntries = Array.isArray(turnLedgerRoot?.entries)
      ? turnLedgerRoot.entries
      : (Array.isArray(turnLedgerRoot) ? turnLedgerRoot : []);
    const recoveryJournal = Array.isArray(runtimeLedgerView?.recoveryJournal)
      ? runtimeLedgerView.recoveryJournal
      : [];
    const narrationRecoveries = recoveryJournal.filter((entry) => entry?.type === 'providerFailureAfterMechanicsCommit');
    const openNarrationRecoveries = narrationRecoveries.filter((entry) => !['resolved', 'closed'].includes(String(entry?.status || '').toLowerCase()));
    const narrationFailureTurns = turnLedgerEntries.filter((entry) => String(entry?.narrationStatus || '').toLowerCase() === 'failed');
    const endConditionLedger = typeof terminalLedgerTools?.terminalDecisionLedgerView === 'function'
      ? terminalLedgerTools.terminalDecisionLedgerView(campaignState)
      : {};
    const tracking = view?.chatNative?.tracking || {};
    return {
      bridgeAvailable: Boolean(bridge.runtimeApp),
      hostAvailable: Boolean(host),
      generationInterceptorInstalled: typeof globalThis.directiveGenerationInterceptor === 'function',
      sillyTavernGeneration,
      selectedEntity,
      currentChatId: host?.chat?.getCurrentChatId?.() || context?.chatId || context?.chat_id || null,
      chatLength: chat.length,
      userMessageCount: messages.filter((message) => message.isUser).length,
      directiveMessageCount: messages.filter((message) => message.directiveOwned).length,
      nonDirectiveAssistantCount: messages.filter((message) => !message.isUser && !message.isSystem && !message.directiveOwned).length,
      directiveResponseKinds: messages.filter((message) => message.directiveOwned).map((message) => message.responseKind).filter(Boolean),
      recentMessages: messages.slice(-12),
      binding: clone(view?.chatNative?.binding || null),
      activation: clone(view?.chatNative?.activation || null),
      tracking: clone(tracking),
      runtimeLedgerView: runtimeLedgerView ? {
        coreProjectionAvailable: runtimeLedgerView.coreProjectionAvailable === true,
        authoritative: runtimeLedgerView.authoritative === true,
        ingressCount: Array.isArray(runtimeLedgerView.ingressLedger) ? runtimeLedgerView.ingressLedger.length : 0,
        responseCount: Array.isArray(runtimeLedgerView.responseLedger) ? runtimeLedgerView.responseLedger.length : 0,
        recoveryCount: Array.isArray(runtimeLedgerView.recoveryJournal) ? runtimeLedgerView.recoveryJournal.length : 0
      } : null,
      recentIngressLedger: ingressLedger.slice(-24).map(safeIngress),
      recentResponseLedger: responseLedger.slice(-24).map(safeResponse),
      pendingInteractionCount: pendingInteractions.length,
      pendingInteractions: clone(pendingInteractions),
      modelCallCount: modelCalls.length,
      modelCallRoles: modelCalls.map((entry) => entry.roleId).filter(Boolean),
      modelCalls: modelCalls.slice(-20),
      sidecarCount: sidecars.length,
      legacySidecarCount: legacySidecarRows.length,
      sidecarRejectedCount: Number(sidecarStatusCounts.rejected || 0),
      sidecarStatusCounts,
      sidecarStatuses: sidecars.map((entry) => `${entry.workerId || entry.roleId || 'unknown'}:${entry.status || 'unknown'}`),
      sidecars: sidecars.slice(-20),
      commandLogCount: commandLogEntries.length,
      recentCommandLog: commandLogEntries.slice(-8).map((entry) => ({
        id: entry?.id || null,
        type: entry?.type || null,
        sourceOutcomeId: entry?.sourceOutcomeId || null,
        summaryInputs: Array.isArray(entry?.summaryInputs) ? entry.summaryInputs.slice(0, 3) : [],
        visibleConsequences: Array.isArray(entry?.visibleConsequences) ? entry.visibleConsequences.slice(0, 3) : []
      })),
      narrationFailureCount: narrationFailureTurns.length,
      openNarrationRecoveryCount: openNarrationRecoveries.length,
      recentTurnLedger: turnLedgerEntries.slice(-8).map((entry) => ({
        id: entry?.id || entry?.turnId || null,
        outcomeId: entry?.outcomeId || null,
        resultBand: entry?.resultBand || null,
        narrationStatus: entry?.narrationStatus || null,
        responseStatus: entry?.responseStatus || null
      })),
      recentRecoveryJournal: recoveryJournal.slice(-8).map((entry) => ({
        id: entry?.id || null,
        type: entry?.type || null,
        status: entry?.status || null,
        outcomeId: entry?.outcomeId || null,
        errorCode: entry?.details?.error?.code || entry?.details?.error?.errorCode || null,
        message: compactText(entry?.details?.error?.message || entry?.details?.message || '', 180),
        fallbackResponsePosted: entry?.details?.fallbackResponsePosted === true
      })),
      endConditionLedger: {
        activeDecisionId: endConditionLedger.activeDecisionId || null,
        detectionCount: Array.isArray(endConditionLedger.detections) ? endConditionLedger.detections.length : 0,
        decisionCount: Array.isArray(endConditionLedger.decisions) ? endConditionLedger.decisions.length : 0,
        branchRecordCount: Array.isArray(endConditionLedger.branchRecords) ? endConditionLedger.branchRecords.length : 0,
        continuationFrameCount: Array.isArray(endConditionLedger.continuationFrames) ? endConditionLedger.continuationFrames.length : 0,
        latestDetection: safeEndConditionDetection(latestItem(endConditionLedger.detections)),
        latestDecision: safeEndConditionDecision(latestItem(endConditionLedger.decisions))
      },
      turnLedgerCount: turnLedgerEntries.length,
      campaign: {
        id: view?.campaignState?.campaign?.id || null,
        title: view?.campaignState?.campaign?.title || null,
        status: view?.campaignState?.campaign?.status || null
      },
      promptInspection: clone(view?.promptInspection || null),
      providerConfiguration: clone(view?.providerConfiguration || null),
      browserErrors: Array.isArray(globalThis.__directiveSmokeErrors)
        ? globalThis.__directiveSmokeErrors.slice(-8)
        : []
    };
  }, {
    modulePath: bridgeModulePath(),
    ledgerModulePath: runtimeLedgerViewModulePath(),
    terminalLedgerModulePath: terminalDecisionLedgerViewModulePath()
  }, BROWSER_TIMEOUT_MS);
}

async function waitForDirectiveRuntimeQuiescence(page, {
  quietMs = 3000,
  timeoutMs = 60000,
  pollingMs = 500
} = {}) {
  const started = Date.now();
  let stableSince = 0;
  let lastKey = '';
  let lastSnapshot = null;
  while (Date.now() - started < timeoutMs) {
    const snapshot = await chatNativeRuntimeSnapshot(page);
    const key = JSON.stringify({
      isSendPress: snapshot.sillyTavernGeneration?.isSendPress === true,
      isGenerating: snapshot.sillyTavernGeneration?.isGenerating === true,
      modelCallCount: snapshot.modelCallCount,
      sidecarCount: snapshot.sidecarCount,
      pendingInteractionCount: snapshot.pendingInteractionCount,
      turnLedgerCount: snapshot.turnLedgerCount,
      commandLogCount: snapshot.commandLogCount
    });
    const busy = snapshot.sillyTavernGeneration?.isSendPress === true
      || snapshot.sillyTavernGeneration?.isGenerating === true;
    if (!busy && key === lastKey) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= quietMs) return snapshot;
    } else {
      stableSince = 0;
      lastKey = key;
    }
    lastSnapshot = snapshot;
    await page.waitForTimeout(Math.min(pollingMs, Math.max(0, timeoutMs - (Date.now() - started))));
  }
  return lastSnapshot;
}

async function waitForSillyTavernSendReady(page, beforeSnapshot = null) {
  return waitForJsonValue(page, async ({ before }) => {
    let st = null;
    try {
      st = await import('/script.js');
    } catch {
      return {
        ready: true,
        reason: 'script-module-unavailable'
      };
    }
    const context = globalThis.SillyTavern?.getContext?.() || null;
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const ready = st.is_send_press !== true
      && (typeof st.isGenerating !== 'function' || st.isGenerating() !== true);
    if (!ready) return null;
    return {
      ready: true,
      isSendPress: st.is_send_press === true,
      isGenerating: typeof st.isGenerating === 'function' ? st.isGenerating() === true : null,
      chatLength: chat.length,
      chatLengthDelta: before ? chat.length - Number(before.chatLength || 0) : null
    };
  }, {
    before: beforeSnapshot || null
  }, {
    timeout: CHAT_CAMPAIGN_TIMEOUT_MS
  });
}

async function createChatNativeLiveCampaign(page) {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  return page.evaluate(async ({
    modulePath,
    runId,
    requireProviders,
    packageIdOverride,
    playerNameOverride,
    playerPronouns,
    playerAppearance,
    playerBio,
    playerReputation
  }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    let context = globalThis.SillyTavern?.getContext?.() || null;
    const readSelectedEntity = () => {
      const selectedGroupId = context?.groupId || context?.group_id || context?.selectedGroupId || globalThis.selected_group || null;
      const selectedCharacterId = context?.characterId
        ?? context?.character_id
        ?? context?.this_chid
        ?? context?.selectedCharacterId
        ?? globalThis.this_chid
        ?? null;
      return selectedGroupId
        ? {
            entityType: 'group',
            entityId: String(selectedGroupId),
            entityName: context?.groups?.find?.((group) => String(group?.id) === String(selectedGroupId))?.name || 'Group'
          }
        : {
            entityType: 'character',
            entityId: selectedCharacterId === undefined || selectedCharacterId === null ? '' : String(selectedCharacterId),
            entityName: context?.name2 || context?.characterName || globalThis.name2 || 'Character'
          };
    };
    let selectedEntity = readSelectedEntity();
    const autoSelectedEntity = null;

    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    if (!app || !host?.chat) {
      return {
        skipped: true,
        reason: 'The served Directive runtime app or SillyTavern chat adapter was not available.',
        selectedEntity,
        autoSelectedEntity
      };
    }

    let providerTests = null;
    if (requireProviders) {
      providerTests = {
        utility: await app.testProvider({ kind: 'utility' }),
        reasoning: await app.testProvider({ kind: 'reasoning' })
      };
    }

    const initialView = await app.getCurrentView({ tabId: 'campaign' });
    const availablePackages = Array.isArray(initialView?.campaign?.packages)
      ? initialView.campaign.packages
      : [];
    const packageRecord = packageIdOverride
      ? availablePackages.find((entry) => (
        [entry?.packageId, entry?.id, entry?.manifestId]
          .map((value) => String(value || '').trim())
          .includes(packageIdOverride)
      ))
      : null;
    if (packageIdOverride && !packageRecord) {
      return {
        skipped: true,
        reason: `Directive did not expose requested campaign package "${packageIdOverride}" for live campaign creation.`,
        selectedEntity,
        autoSelectedEntity,
        availablePackageIds: availablePackages.map((entry) => entry?.packageId || entry?.id || entry?.manifestId).filter(Boolean)
      };
    }
    if (packageRecord && packageRecord.actions?.startNewCampaign === false) {
      return {
        skipped: true,
        reason: `Requested campaign package "${packageIdOverride}" is not startable in the current Directive view.`,
        selectedEntity,
        autoSelectedEntity,
        packageRecord: clone(packageRecord)
      };
    }
    const packageId = packageRecord?.packageId
      || packageRecord?.id
      || packageRecord?.manifestId
      || initialView?.activePackageId
      || initialView?.campaign?.activePackageId
      || availablePackages.find?.((entry) => entry?.actions?.startNewCampaign)?.packageId
      || availablePackages.find?.((entry) => entry?.actions?.startNewCampaign)?.id
      || availablePackages[0]?.packageId
      || availablePackages[0]?.id
      || null;
    if (!packageId) {
      return {
        skipped: true,
        reason: 'Directive did not expose an active bundled campaign package for live campaign creation.',
        selectedEntity,
        autoSelectedEntity
      };
    }

    const creatorDraft = await app.startCreatorDraft({ packageId });
    const creatorView = creatorDraft?.creator || creatorDraft;
    const creatorOptions = creatorView?.options || {};
    const creatorDossier = creatorView?.dossier || {};
    const shipName = creatorView?.ship?.name
      || packageRecord?.ship?.name
      || packageRecord?.shipName
      || 'the assigned starship';
    const playerName = playerNameOverride || 'Mira Arlen';
    const biography = playerBio
      || `${playerName} is a Starfleet Commander assigned to ${shipName}, trusted for calm judgment, accountable evidence handling, and steady command under ambiguous frontier pressure.`;
    const reputation = playerReputation
      || `${playerName} is known as a measured officer who separates fact, inference, and uncertainty before committing the crew.`;
    const appearance = playerAppearance
      || 'A composed officer with a quiet voice and a habit of watching the room before speaking.';
    const optionId = (source, preferred = []) => {
      const entries = Array.isArray(source) ? source : (Array.isArray(source?.options) ? source.options : []);
      const entryId = (entry) => typeof entry === 'string'
        ? entry
        : String(entry?.id || '');
      const preferredMatch = preferred
        .map((id) => entries.find((entry) => entryId(entry) === id))
        .find(Boolean);
      return entryId(preferredMatch) || entryId(entries.find((entry) => entryId(entry))) || '';
    };
    const traitId = (categoryId, preferred = []) => {
      const categories = Array.isArray(creatorOptions.traitCategories)
        ? creatorOptions.traitCategories
        : [];
      const category = categories.find((entry) => entry?.id === categoryId)
        || categories.find((entry) => String(entry?.id || '').toLowerCase().includes(categoryId))
        || null;
      return optionId(category?.options || [], preferred);
    };
    const selectedCreatorIds = {
      speciesId: optionId(creatorOptions.allowedSpecies, ['human']),
      ageBandId: optionId(creatorOptions.ageBands, ['mid-career', 'typical-command-age', 'established-command-track']),
      careerBackgroundId: optionId(creatorOptions.careerBackgrounds, ['tactical-security', 'security-escort', 'line-officer-generalist']),
      formativeExperienceId: optionId(creatorOptions.formativeExperiences, ['dominion-war-fleet-service', 'dominion-war-convoy', 'frontier-autonomy']),
      assignmentReasonId: optionId(creatorOptions.assignmentReasons, ['experienced-outsider-transfer', 'command-succession', 'frontier-command']),
      traits: {
        insight: traitId('insight', ['perceptive', 'analytical', 'observant']),
        connection: traitId('connection', ['candid', 'steady', 'empathetic']),
        execution: traitId('execution', ['decisive', 'measured', 'bold'])
      },
      flawId: optionId(creatorOptions.flaws, ['impatient', 'overextends', 'guarded'])
    };
    const dossierDetailLevel = optionId(creatorDossier.detailLevels, [
      creatorDossier.defaultDetailLevel,
      'Standard',
      'standard',
      'concise'
    ]) || creatorDossier.defaultDetailLevel || 'Standard';
    const missingCreatorIds = Object.entries({
      speciesId: selectedCreatorIds.speciesId,
      ageBandId: selectedCreatorIds.ageBandId,
      careerBackgroundId: selectedCreatorIds.careerBackgroundId,
      formativeExperienceId: selectedCreatorIds.formativeExperienceId,
      assignmentReasonId: selectedCreatorIds.assignmentReasonId,
      insightTrait: selectedCreatorIds.traits.insight,
      connectionTrait: selectedCreatorIds.traits.connection,
      executionTrait: selectedCreatorIds.traits.execution,
      flawId: selectedCreatorIds.flawId
    }).filter(([, value]) => !value).map(([key]) => key);
    if (missingCreatorIds.length > 0) {
      return {
        skipped: true,
        reason: `Selected campaign package "${packageId}" did not expose required creator option ids: ${missingCreatorIds.join(', ')}.`,
        selectedEntity,
        autoSelectedEntity,
        packageId,
        creatorOptionKeys: Object.keys(creatorOptions)
      };
    }
    await app.saveCreatorDraft({
      reason: 'liveSillyTavernChatSmoke',
      patch: {
        activeStep: 'review',
        input: {
          identity: {
            name: playerName,
            pronounsOrAddress: playerPronouns,
            speciesId: selectedCreatorIds.speciesId,
            ageBandId: selectedCreatorIds.ageBandId,
            appearance
          },
          service: {
            careerBackgroundId: selectedCreatorIds.careerBackgroundId,
            formativeExperienceId: selectedCreatorIds.formativeExperienceId,
            assignmentReasonId: selectedCreatorIds.assignmentReasonId
          },
          personality: {
            traits: selectedCreatorIds.traits,
            flawId: selectedCreatorIds.flawId
          },
          dossier: {
            detailLevel: dossierDetailLevel,
            briefBiography: biography,
            publicReputation: reputation
          },
          settings: {
            simulationMode: 'Command'
          }
        }
      }
    });
    const startedView = await app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });
    const openResult = await app.openCampaignChat();
    const view = await app.getCurrentView({ tabId: 'mission' });
    return {
      skipped: false,
      runId,
      packageId,
      packageIdOverride,
      playerName,
      selectedEntity,
      autoSelectedEntity,
      providerTests: clone(providerTests),
      openCampaignChat: clone(openResult),
      campaign: clone({
        id: view?.campaignState?.campaign?.id || startedView?.campaignState?.campaign?.id || null,
        title: view?.campaignState?.campaign?.title || startedView?.campaignState?.campaign?.title || null,
        status: view?.campaignState?.campaign?.status || startedView?.campaignState?.campaign?.status || null
      }),
      binding: clone(view?.chatNative?.binding || null),
      activation: clone(view?.chatNative?.activation || null),
      intro: clone(view?.chatNative?.activation?.introPacket || null),
      tracking: clone(view?.chatNative?.tracking || null),
      promptInspection: clone(view?.promptInspection || null)
    };
  }, {
    modulePath: bridgeModulePath(),
    runId,
    requireProviders: RUN_LIVE_GENERATION,
    packageIdOverride: CAMPAIGN_PACKAGE_ID || null,
    playerNameOverride: CHAT_CAMPAIGN_PLAYER_NAME || null,
    playerPronouns: CHAT_CAMPAIGN_PLAYER_PRONOUNS,
    playerAppearance: CHAT_CAMPAIGN_PLAYER_APPEARANCE || null,
    playerBio: CHAT_CAMPAIGN_PLAYER_BIO || null,
    playerReputation: CHAT_CAMPAIGN_PLAYER_REPUTATION || null
  });
}

async function activateExternalContextFixtureForCampaignChat(page, {
  expectedChatId = null,
  userHandle = SILLYTAVERN_USER
} = {}) {
  if (!ACTIVATE_EXTERNAL_CONTEXT_FIXTURE) {
    return { ok: false, skipped: true, reason: 'activation-not-requested' };
  }
  if (normalizeUserHandle(userHandle) === 'default-user') {
    return { ok: false, skipped: false, reason: 'default-user-reserved-for-human-testing' };
  }
  const fixtureMetadata = buildExternalContextFixtureChatMetadata();
  return page.evaluate(async ({ worldName, expectedChatId, fixtureMetadata }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const mergeDefined = (base = {}, override = {}) => {
      const next = { ...asObject(base) };
      for (const [key, value] of Object.entries(asObject(override))) {
        if (value !== undefined && value !== null) next[key] = value;
      }
      return next;
    };
    const hasMemoryBookRange = (value = {}) => {
      const record = asObject(value);
      if (record.sceneStart !== undefined && record.sceneEnd !== undefined) return true;
      if (Array.isArray(record.ranges) && record.ranges.length) return true;
      if (Array.isArray(record.entryRanges) && record.entryRanges.length) return true;
      return false;
    };
    const hasSummaryceptionDiagnostics = (value = {}) => {
      const record = asObject(value);
      if (record.summarizedUpTo !== undefined) return true;
      if (Array.isArray(record.layers) && record.layers.length) return true;
      if (Array.isArray(record.ghostedIndices) && record.ghostedIndices.length) return true;
      if (record.staleness && typeof record.staleness === 'object') return true;
      return false;
    };
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const currentChatId = context.chatId
      || context.chat_id
      || context.currentChatId
      || context.current_chat_id
      || context.chatMetadata?.chat_id
      || context.chat_metadata?.chat_id
      || globalThis.chat_metadata?.chat_id
      || null;
    const metadata = context.chatMetadata
      || context.chat_metadata
      || globalThis.chat_metadata
      || {};
    metadata.world_info = worldName;
    if (!hasMemoryBookRange(metadata.STMemoryBooks)) {
      metadata.STMemoryBooks = mergeDefined(fixtureMetadata.STMemoryBooks, metadata.STMemoryBooks);
    }
    if (!hasSummaryceptionDiagnostics(metadata.summaryception)) {
      metadata.summaryception = mergeDefined(fixtureMetadata.summaryception, metadata.summaryception);
    }
    if (!metadata.vectFox || typeof metadata.vectFox !== 'object') {
      metadata.vectFox = clone(fixtureMetadata.vectFox || {});
    }
    context.chatMetadata = metadata;
    context.chat_metadata = metadata;
    globalThis.chat_metadata = metadata;

    const settings = context.worldInfoSettings
      || context.world_info_settings
      || globalThis.world_info_settings
      || {};
    const worldInfo = settings.world_info || {};
    const existingGlobalSelect = Array.isArray(worldInfo.globalSelect) ? worldInfo.globalSelect : [];
    settings.world_info = {
      ...worldInfo,
      globalSelect: [...new Set([...existingGlobalSelect, worldName])]
    };
    if (settings.world_info_depth === undefined) settings.world_info_depth = 4;
    if (settings.world_info_budget === undefined) settings.world_info_budget = 100;
    if (settings.world_info_recursive === undefined) settings.world_info_recursive = true;
    context.worldInfoSettings = settings;
    context.world_info_settings = settings;
    globalThis.world_info_settings = settings;

    const saveMetadata = globalThis.saveMetadata || context.saveMetadata;
    if (typeof saveMetadata === 'function') {
      await saveMetadata().catch(() => null);
    }
    return {
      ok: true,
      status: 'bound-live-campaign-chat',
      expectedChatId,
      currentChatId,
      currentChatMatchesExpected: !expectedChatId || !currentChatId || String(expectedChatId) === String(currentChatId),
      worldInfo: {
        chatBoundName: metadata.world_info || null,
        activeNames: settings.world_info?.globalSelect || []
      },
      chatMetadata: clone({
        world_info: metadata.world_info || null,
        hasSTMemoryBooks: Boolean(metadata.STMemoryBooks),
        stMemoryBookHasRange: hasMemoryBookRange(metadata.STMemoryBooks),
        hasSummaryception: Boolean(metadata.summaryception),
        summaryceptionHasDiagnostics: hasSummaryceptionDiagnostics(metadata.summaryception)
      })
    };
  }, {
    worldName: EXTERNAL_CONTEXT_FIXTURE_WORLD,
    expectedChatId,
    fixtureMetadata
  });
}

async function resumeChatNativeLiveCampaign(page) {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  return page.evaluate(async ({ modulePath, runId, requireProviders, resumeSaveId, expectedChatId }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    let context = globalThis.SillyTavern?.getContext?.() || null;
    const readSelectedEntity = () => {
      const selectedGroupId = context?.groupId || context?.group_id || context?.selectedGroupId || globalThis.selected_group || null;
      const selectedCharacterId = context?.characterId
        ?? context?.character_id
        ?? context?.this_chid
        ?? context?.selectedCharacterId
        ?? globalThis.this_chid
        ?? null;
      return selectedGroupId
        ? {
            entityType: 'group',
            entityId: String(selectedGroupId),
            entityName: context?.groups?.find?.((group) => String(group?.id) === String(selectedGroupId))?.name || 'Group'
          }
        : {
            entityType: 'character',
            entityId: selectedCharacterId === undefined || selectedCharacterId === null ? '' : String(selectedCharacterId),
            entityName: context?.name2 || context?.characterName || globalThis.name2 || 'Character'
          };
    };
    const selectedEntity = readSelectedEntity();

    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    if (!app || !host?.chat) {
      return {
        skipped: true,
        resumed: true,
        reason: 'The served Directive runtime app or SillyTavern chat adapter was not available for campaign resume.',
        selectedEntity,
        autoSelectedEntity: null
      };
    }

    let providerTests = null;
    if (requireProviders) {
      providerTests = {
        utility: await app.testProvider({ kind: 'utility' }),
        reasoning: await app.testProvider({ kind: 'reasoning' })
      };
    }

    const resumeBinding = expectedChatId
      ? {
          chatId: expectedChatId,
          saveId: resumeSaveId || null
        }
      : null;
    const openCampaignInput = resumeSaveId
      ? {
          saveId: resumeSaveId,
          ...(resumeBinding ? { binding: resumeBinding } : {})
        }
      : (resumeBinding ? { binding: resumeBinding } : undefined);
    const openResult = await app.openCampaignChat(openCampaignInput);
    const view = await app.getCurrentView({ tabId: 'mission' });
    context = globalThis.SillyTavern?.getContext?.() || null;
    const currentChatId = host?.chat?.getCurrentChatId?.() || context?.chatId || context?.chat_id || null;
    const binding = view?.chatNative?.binding || null;
    const activeSelectedEntity = readSelectedEntity();
    const expectedChatMatches = expectedChatId
      ? [currentChatId, binding?.chatId].map((value) => String(value || '')).includes(expectedChatId)
      : null;
    return {
      skipped: false,
      resumed: true,
      runId,
      resumeSaveId: resumeSaveId || null,
      expectedChatId: expectedChatId || null,
      expectedChatMatches,
      currentChatId,
      selectedEntity,
      activeSelectedEntity,
      autoSelectedEntity: null,
      providerTests: clone(providerTests),
      openCampaignChat: clone(openResult),
      campaign: clone({
        id: view?.campaignState?.campaign?.id || null,
        packageId: view?.campaignState?.campaign?.packageId || view?.campaignState?.packageId || null,
        title: view?.campaignState?.campaign?.title || null,
        status: view?.campaignState?.campaign?.status || null
      }),
      binding: clone(binding),
      activation: clone(view?.chatNative?.activation || null),
      intro: clone(view?.chatNative?.activation?.introPacket || null),
      tracking: clone(view?.chatNative?.tracking || null),
      promptInspection: clone(view?.promptInspection || null)
    };
  }, {
    modulePath: bridgeModulePath(),
    runId,
    requireProviders: RUN_LIVE_GENERATION,
    resumeSaveId: CHAT_CAMPAIGN_RESUME_SAVE_ID || '',
    expectedChatId: CHAT_CAMPAIGN_RESUME_CHAT_ID || ''
  });
}

async function runDirectiveAssistForScriptMessage(page, message, attemptLabel = '') {
  const assist = message.assist || null;
  if (!assist) return null;
  const action = String(assist.action || '').trim();
  if (!action) throw new Error(`Script message ${message.id} requested Assist without an action.`);
  const inputText = String(assist.inputText || message.text || '').trim();
  const useProvider = assist.useProvider !== false;
  appendLiveLog({
    kind: 'assist-action',
    status: 'in_progress',
    scriptMessageId: message.id,
    scriptLabel: message.label,
    scriptCategory: message.category,
    action,
    attemptLabel,
    inputPreview: compact(inputText, 180),
    useProvider
  });
  const result = await page.evaluate(async ({ modulePath, action: assistAction, inputText: assistInputText, useProvider: assistUseProvider }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const countEntries = (root) => Array.isArray(root?.entries) ? root.entries.length : (Array.isArray(root) ? root.length : 0);
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.runDirectiveAssist || !app?.getCurrentView) {
      return {
        ok: false,
        reason: 'Directive runtime app does not expose runDirectiveAssist/getCurrentView.'
      };
    }
    const before = await app.getCurrentView({ tabId: 'mission' });
    const beforeCounts = {
      commandLogCount: countEntries(before?.campaignState?.commandLog),
      turnLedgerCount: countEntries(before?.campaignState?.turnLedger),
      pendingInteractionCount: Array.isArray(before?.chatNative?.pendingInteractions)
        ? before.chatNative.pendingInteractions.filter((entry) => entry?.status !== 'resolved').length
        : 0
    };
    const assistResponse = await app.runDirectiveAssist({
      action: assistAction,
      inputText: assistInputText,
      useProvider: assistUseProvider
    });
    const after = await app.getCurrentView({ tabId: 'mission' });
    const afterCounts = {
      commandLogCount: countEntries(after?.campaignState?.commandLog),
      turnLedgerCount: countEntries(after?.campaignState?.turnLedger),
      pendingInteractionCount: Array.isArray(after?.chatNative?.pendingInteractions)
        ? after.chatNative.pendingInteractions.filter((entry) => entry?.status !== 'resolved').length
        : 0
    };
    const modelCalls = after?.chatNative?.modelCalls || [];
    return {
      ok: true,
      beforeCounts,
      afterCounts,
      modelCallCount: modelCalls.length,
      latestModelCall: clone(modelCalls.at(-1) || null),
      assistResult: clone(assistResponse?.assistResult || assistResponse || null),
      campaignStateMutated: assistResponse?.campaignStateMutated === true,
      committed: assistResponse?.committed === true
    };
  }, {
    modulePath: bridgeModulePath(),
    action,
    inputText,
    useProvider
  });
  assertBrowser(result?.ok === true, result?.reason || 'Directive Assist did not run in the live browser.', result);
  assertBrowser(result.committed !== true, 'Directive Assist reported a committed gameplay change before send.', result);
  const commandLogChanged = result.beforeCounts?.commandLogCount !== result.afterCounts?.commandLogCount;
  const gameplayCountsChanged = result.beforeCounts?.turnLedgerCount !== result.afterCounts?.turnLedgerCount
    || result.beforeCounts?.pendingInteractionCount !== result.afterCounts?.pendingInteractionCount;
  assertBrowser(
    !gameplayCountsChanged,
    'Directive Assist changed turn or pending-interaction state before send.',
    result
  );
  const commandLogShrank = Number(result.afterCounts?.commandLogCount || 0) < Number(result.beforeCounts?.commandLogCount || 0);
  assertBrowser(
    !commandLogShrank,
    'Directive Assist reduced Command Log state before send.',
    result
  );
  const assistResult = result.assistResult || {};
  const briefSummary = assistResult.brief?.summary || '';
  const replacementText = String(assistResult.replacementText || '').trim();
  const outputText = assist.action === 'briefMe' ? briefSummary : replacementText;
  const assistStatus = commandLogChanged || commandLogShrank || gameplayCountsChanged
    ? 'warning'
    : 'pass';
  appendLiveLog({
    kind: 'assist-action',
    status: assistStatus,
    scriptMessageId: message.id,
    scriptLabel: message.label,
    scriptCategory: message.category,
    action,
    attemptLabel,
    outputPreview: compact(outputText, 220),
    source: assistResult.source || null,
    providerUsed: assistResult.diagnostics?.providerUsed === true,
    campaignStateMutated: result.campaignStateMutated,
    diagnosticStateChanged: result.campaignStateMutated,
    committed: result.committed,
    gameplayCountsChanged,
    commandLogChanged,
    commandLogShrank,
    beforeCounts: result.beforeCounts || null,
    afterCounts: result.afterCounts || null,
    modelCallCount: result.modelCallCount,
    latestModelRole: result.latestModelCall?.roleId || null
  });
  return {
    action,
    inputText,
    useProvider,
    result,
    replacementText,
    briefSummary,
    outputText
  };
}

async function prepareScriptMessage(page, message) {
  if (!message.assist) {
    return {
      text: message.text,
      assist: null,
      send: message.send !== false
    };
  }
  const mode = String(message.assist.mode || 'apply').trim() || 'apply';
  const settled = await waitForDirectiveRuntimeQuiescence(page);
  appendLiveLog({
    kind: 'assist-action',
    status: settled ? 'runtime-settled' : 'runtime-settle-timeout',
    scriptMessageId: message.id,
    scriptLabel: message.label,
    scriptCategory: message.category,
    action: message.assist.action || null,
    modelCallCount: settled?.modelCallCount ?? null,
    sidecarCount: settled?.sidecarCount ?? null,
    pendingInteractionCount: settled?.pendingInteractionCount ?? null,
    turnLedgerCount: settled?.turnLedgerCount ?? null,
    commandLogCount: settled?.commandLogCount ?? null
  });
  const first = await runDirectiveAssistForScriptMessage(page, message, 'initial');
  let finalAssist = first;
  if (mode === 'tryAgain') {
    finalAssist = await runDirectiveAssistForScriptMessage(page, message, 'try-again');
  }
  const roughText = String(message.text || '').trim();
  const assistText = String(finalAssist.outputText || finalAssist.replacementText || '').trim();
  const editedText = String(message.assist.sendText || '').trim();
  const sendText = mode === 'restore'
    ? roughText
    : editedText || assistText || roughText;
  const shouldSend = message.send !== false && !['cancel', 'briefOnly'].includes(mode);
  appendLiveLog({
    kind: 'assist-action',
    status: shouldSend ? 'applied' : 'cancelled',
    scriptMessageId: message.id,
    scriptLabel: message.label,
    scriptCategory: message.category,
    action: finalAssist.action,
    mode,
    sendPlanned: shouldSend,
    sentTextPreview: compact(sendText, 220)
  });
  return {
    text: sendText,
    assist: {
      action: finalAssist.action,
      mode,
      source: finalAssist.result?.assistResult?.source || null,
      providerUsed: finalAssist.result?.assistResult?.diagnostics?.providerUsed === true,
      outputPreview: compact(finalAssist.outputText, 220)
    },
    send: shouldSend
  };
}

function pendingInteractionSummary(snapshot = {}) {
  return (Array.isArray(snapshot.pendingInteractions) ? snapshot.pendingInteractions : [])
    .filter((entry) => entry?.status !== 'resolved')
    .map((entry) => ({
      id: entry?.id || null,
      kind: entry?.kind || null,
      status: entry?.status || null,
      promptPreview: compact(entry?.prompt || entry?.message || entry?.text || '', 180)
    }));
}

function pendingResolutionForScriptMessage(message = {}, snapshot = {}) {
  const pending = pendingInteractionSummary(snapshot);
  if (pending.length === 0) return null;
  const terminal = pending.find((entry) => entry.kind === 'terminalOutcomeDecision');
  if (terminal) {
    return {
      shouldStop: true,
      reason: 'terminal-outcome-decision',
      pending
    };
  }
  const clarification = pending.find((entry) => entry.kind === 'clarificationNeeded');
  if (clarification) {
    const text = String(message.clarificationText || message.pendingResolutionText || '').trim();
    return {
      text,
      kind: 'clarificationNeeded',
      shouldStop: !text,
      reason: text ? 'scripted-clarification' : 'clarification-requires-scripted-reply',
      pending
    };
  }
  const riskConfirmation = pending.find((entry) => entry.kind === 'riskConfirmationNeeded');
  if (riskConfirmation) {
    const text = String(message.riskConfirmationText || message.pendingResolutionText || 'Proceed.').trim();
    return {
      text,
      kind: 'riskConfirmationNeeded',
      shouldStop: !text,
      reason: text ? 'risk-confirmation' : 'risk-confirmation-requires-scripted-reply',
      pending
    };
  }
  const text = String(message.pendingResolutionText || '').trim();
  return {
    text,
    kind: pending[0]?.kind || 'pendingInteraction',
    shouldStop: !text,
    reason: text ? 'scripted-pending-resolution' : 'pending-interaction-requires-scripted-reply',
    pending
  };
}

async function sendSillyTavernChatMessage(page, text, beforeSnapshot) {
  await waitForSillyTavernSendReady(page, beforeSnapshot);
  const sendResult = await page.evaluate(async (messageText) => {
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
    const setNativeValue = (element, value) => {
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (setter) setter.call(element, value);
      else element.value = value;
    };
    textarea.focus?.();
    setNativeValue(textarea, messageText);
    try {
      const beforeInput = typeof InputEvent === 'function'
        ? new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: messageText
        })
        : new Event('beforeinput', { bubbles: true, cancelable: true });
      textarea.dispatchEvent(beforeInput);
    } catch {
      // Older browser engines may not construct InputEvent with data.
    }
    const inputEvent = typeof InputEvent === 'function'
      ? new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: messageText
      })
      : new Event('input', { bubbles: true });
    textarea.dispatchEvent(inputEvent);
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keyup', {
      bubbles: true,
      key: messageText.slice(-1) || ' ',
      code: 'KeyA'
    }));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const sendButtonHidden = sendButton.classList.contains('displayNone') || sendButton.offsetParent === null;
    const sendButtonDisabled = sendButton.disabled === true || sendButton.getAttribute('aria-disabled') === 'true';
    if (sendButtonHidden || sendButtonDisabled) {
      return {
        sent: false,
        reason: 'SillyTavern send button did not become available after filling chat input.',
        chatLengthBeforeClick: Array.isArray(context?.chat) ? context.chat.length : null,
        sendButtonHidden,
        sendButtonDisabled,
        textareaLength: String(textarea.value || '').length
      };
    }
    sendButton.click();
    return {
      sent: true,
      chatLengthBeforeClick: Array.isArray(context?.chat) ? context.chat.length : null,
      sendButtonHidden,
      sendButtonDisabled,
      textareaLength: String(textarea.value || '').length
    };
  }, text);
  assertBrowser(sendResult.sent, sendResult.reason || 'SillyTavern chat message was not sent.', sendResult);
  sendResult.directiveFallbackScan = await waitForJsonValue(page, async ({ shellModulePath, bridgeModulePath: runtimeBridgeModulePath, before, text: expectedText }) => {
    const context = globalThis.SillyTavern?.getContext?.() || null;
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const currentChatId = context?.chatId
      || context?.chat_id
      || context?.currentChatId
      || context?.current_chat_id
      || context?.chatMetadata?.chat_id
      || context?.chat_metadata?.chat_id
      || before?.currentChatId
      || before?.binding?.chatId
      || null;
    const messageText = (message) => {
      const value = message?.mes ?? message?.content ?? message?.text ?? '';
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.map((part) => part?.text || '').filter(Boolean).join('\n');
      return String(value || '');
    };
    const expectedPrefix = String(expectedText || '').slice(0, 70);
    let matchedIndex = -1;
    for (let index = chat.length - 1; index >= 0; index -= 1) {
      const message = chat[index];
      if (
        (message?.is_user === true || message?.role === 'user')
        && messageText(message).includes(expectedPrefix)
      ) {
        matchedIndex = index;
        break;
      }
    }
    const matched = matchedIndex >= 0;
    if (!matched) return null;
    const shellMod = await import(shellModulePath);
    const hooks = shellMod.__directiveEventTestHooks || {};
    const scan = typeof hooks.scanLatestUserMessageFallback === 'function'
      ? hooks.scanLatestUserMessageFallback('smoke-after-native-send')
      : { handled: false, reason: 'fallback-scan-unavailable' };
    const bridgeMod = await import(runtimeBridgeModulePath);
    const app = bridgeMod.getSillyTavernDirectiveRuntimeBridge?.().runtimeApp || null;
    const message = chat[matchedIndex] || null;
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    let direct = { scheduled: false, reason: 'observeHostPlayerMessage-unavailable' };
    if (app?.observeHostPlayerMessage) {
      const observed = await app.observeHostPlayerMessage({
        chatId: currentChatId,
        index: matchedIndex,
        messageId: matchedIndex,
        hostMessageId: String(matchedIndex),
        message,
        source: 'smoke-after-native-send-direct'
      });
      direct = {
        scheduled: true,
        reason: observed?.reason || null,
        handled: observed?.handled === true,
        responseStrategy: observed?.responseStrategy || null,
        abortDefaultGeneration: observed?.abortDefaultGeneration ?? null,
        response: clone(observed?.response || null)
      };
    }
    return {
      ok: true,
      scan,
      direct,
      matchedIndex,
      currentChatId,
      chatLength: chat.length
    };
  }, {
    shellModulePath: shellEventsModulePath(),
    bridgeModulePath: bridgeModulePath(),
    before: beforeSnapshot,
    text
  }, {
    timeout: Math.min(CHAT_CAMPAIGN_TIMEOUT_MS, 120000),
    polling: 100
  }).catch((error) => ({
    ok: false,
    reason: 'fallback-scan-failed',
    error: errorSummary(error)
  }));
  appendLiveLog({
    kind: 'checkpoint',
    status: sendResult.directiveFallbackScan?.ok === true ? 'pass' : 'warning',
    checkpoint: 'post-send-observation-scheduled',
    matchedIndex: sendResult.directiveFallbackScan?.matchedIndex ?? null,
    currentChatId: sendResult.directiveFallbackScan?.currentChatId || beforeSnapshot?.currentChatId || beforeSnapshot?.binding?.chatId || null,
    chatLength: sendResult.directiveFallbackScan?.chatLength ?? null,
    scan: sendResult.directiveFallbackScan?.scan || null,
    direct: sendResult.directiveFallbackScan?.direct || null,
    reason: sendResult.directiveFallbackScan?.reason || null,
    error: sendResult.directiveFallbackScan?.error || null
  });

  const after = await waitForJsonValue(page, async ({ modulePath, ledgerModulePath, before, text: expectedText, targetHostMessageId }) => {
    const mod = await import(modulePath);
    let ledgerTools = null;
    try {
      ledgerTools = await import(ledgerModulePath);
    } catch {
      ledgerTools = null;
    }
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const view = app?.getCurrentView
      ? await app.getCurrentView({ tabId: 'mission' })
      : null;
    const context = globalThis.SillyTavern?.getContext?.() || null;
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const messageText = (message) => {
      const value = message?.mes ?? message?.content ?? message?.text ?? '';
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.map((part) => part?.text || '').filter(Boolean).join('\n');
      return String(value || '');
    };
    const directiveMetadata = (message) => message?.extra?.directive || message?.metadata?.directive || null;
    const compactText = (value, max = 180) => {
      const normalized = String(value || '').replace(/\s+/g, ' ').trim();
      return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`;
    };
    const tracking = view?.chatNative?.tracking || {};
    const runtimeLedgerView = typeof ledgerTools?.createRuntimeLedgerView === 'function'
      ? ledgerTools.createRuntimeLedgerView(view?.campaignState || {}, { runtimeOverlay: true })
      : null;
    const runtimeLedgerProofAvailable = runtimeLedgerView?.authoritative === true
      && runtimeLedgerView?.coreProjectionAvailable === true;
    const runtimeCoreProjections = typeof ledgerTools?.readRuntimeCoreProjections === 'function'
      ? ledgerTools.readRuntimeCoreProjections(view?.campaignState || {})
      : {};
    const coreSidecars = [
      ...(Array.isArray(runtimeCoreProjections?.sidecarDiagnostics) ? runtimeCoreProjections.sidecarDiagnostics : []),
      ...(Array.isArray(runtimeCoreProjections?.backgroundBatches) ? runtimeCoreProjections.backgroundBatches : [])
    ];
    const ingressLedger = Array.isArray(runtimeLedgerView?.ingressLedger)
      ? runtimeLedgerView.ingressLedger
      : [];
    const responseLedger = Array.isArray(runtimeLedgerView?.responseLedger)
      ? runtimeLedgerView.responseLedger
      : [];
    const priorResponseIds = new Set((before.recentResponseLedger || [])
      .map((entry) => entry?.id)
      .filter(Boolean));
    const pendingInteractions = (view?.chatNative?.pendingInteractions || []).filter((entry) => entry?.status !== 'resolved');
    const messages = chat.map((message, index) => ({
      index,
      isUser: message?.is_user === true || message?.role === 'user',
      isSystem: message?.is_system === true || message?.role === 'system',
      directiveOwned: Boolean(directiveMetadata(message)),
      responseKind: directiveMetadata(message)?.responseKind || null,
      textPreview: compactText(messageText(message))
    }));
    const expectedPrefix = String(expectedText).slice(0, 70);
    const matchedUser = messages.findLast((message) => (
      message.isUser
      && message.textPreview.includes(expectedPrefix)
    ));
    const matchedUserMessage = Boolean(matchedUser);
    const visibleDirectiveResponse = matchedUser
      ? messages.find((message) => (
        message.index > matchedUser.index
        && !message.isUser
        && !message.isSystem
        && message.directiveOwned
        && message.responseKind !== 'campaignIntro'
      ))
      : null;
    const matchedIngress = ingressLedger.find((entry) => (
      (
        targetHostMessageId
        && String(entry?.hostMessageId ?? entry?.messageId ?? '') === String(targetHostMessageId)
      )
      || String(entry?.textPreview || entry?.text || entry?.messageText || '').includes(expectedPrefix)
    ));
    const matchedHostGenerationResponse = [...responseLedger].reverse().find((entry) => (
      entry?.strategy === 'injectAndContinue'
      && entry?.responseKind === 'hostGeneration'
      && (
        (matchedIngress?.id && entry.ingressId === matchedIngress.id)
        || (!priorResponseIds.has(entry.id) && entry.id)
        || (
          targetHostMessageId
          && entry.ingressId
          && String(entry.ingressId).includes(`:${targetHostMessageId}:`)
        )
      )
    ));
    const beforeRuntimeLedgerView = before.runtimeLedgerView || {};
    const runtimeIngressCount = Array.isArray(runtimeLedgerView?.ingressLedger) ? runtimeLedgerView.ingressLedger.length : 0;
    const runtimeResponseCount = Array.isArray(runtimeLedgerView?.responseLedger) ? runtimeLedgerView.responseLedger.length : 0;
    const beforeRuntimeIngressCount = Number(beforeRuntimeLedgerView.ingressCount || before.recentIngressLedger?.length || 0);
    const beforeRuntimeResponseCount = Number(beforeRuntimeLedgerView.responseCount || before.recentResponseLedger?.length || 0);
    const runtimeCountProgress = runtimeLedgerProofAvailable
      && Boolean(targetHostMessageId)
      && runtimeIngressCount > beforeRuntimeIngressCount;
    const ingressAdvanced = matchedIngress
      && !['classifying', 'received', 'pending'].includes(String(matchedIngress.status || '').toLowerCase());
    const directObservation = before?.lastDirectiveFallbackScan?.direct || null;
    const directObservedProgress = Boolean(matchedUserMessage)
      && directObservation?.handled === true
      && (
        !targetHostMessageId
        || String(matchedUser?.index ?? '') === String(targetHostMessageId)
      )
      && ['directivePosted', 'injectAndContinue', 'pause'].includes(String(directObservation?.responseStrategy || ''));
    const runtimeProgress = runtimeLedgerProofAvailable
      && (Boolean(matchedIngress) || runtimeCountProgress)
      && (
        ingressAdvanced
        || runtimeCountProgress
        || runtimeResponseCount > beforeRuntimeResponseCount
        || pendingInteractions.length > Number(before.pendingInteractionCount || 0)
      )
      && (
        ingressAdvanced
        || runtimeCountProgress
        || runtimeResponseCount > beforeRuntimeResponseCount
        || pendingInteractions.length > Number(before.pendingInteractionCount || 0)
      );
    const directiveMessageCount = messages.filter((message) => message.directiveOwned).length;
    const visibleDirectiveProgress = Boolean(visibleDirectiveResponse)
      && directiveMessageCount > Number(before.directiveMessageCount || 0);
    if (!matchedUserMessage || (!runtimeProgress && !visibleDirectiveProgress && !directObservedProgress)) return null;
    return {
      tracking,
      runtimeLedgerView: runtimeLedgerView ? {
        coreProjectionAvailable: runtimeLedgerView.coreProjectionAvailable === true,
        authoritative: runtimeLedgerView.authoritative === true,
        ingressCount: Array.isArray(runtimeLedgerView.ingressLedger) ? runtimeLedgerView.ingressLedger.length : 0,
        responseCount: Array.isArray(runtimeLedgerView.responseLedger) ? runtimeLedgerView.responseLedger.length : 0,
        recoveryCount: Array.isArray(runtimeLedgerView.recoveryJournal) ? runtimeLedgerView.recoveryJournal.length : 0
      } : null,
      progressSource: directObservedProgress
        ? 'direct-observeHostPlayerMessage'
        : (runtimeCountProgress ? 'core-runtime-ledger-count' : (runtimeProgress ? 'core-runtime-ledger' : 'visible-directive-chat-response')),
      matchedUserIndex: matchedUser?.index ?? null,
      matchedUserHostMessageId: matchedUser ? String(matchedUser.index) : null,
      visibleDirectiveResponse: visibleDirectiveResponse
        ? {
            index: visibleDirectiveResponse.index,
            responseKind: visibleDirectiveResponse.responseKind || null,
            textPreview: visibleDirectiveResponse.textPreview || null
          }
        : null,
      matchedIngress: matchedIngress
        ? {
            id: matchedIngress.id || null,
            status: matchedIngress.status || null,
            responseStrategy: matchedIngress.responseStrategy || null,
            classification: matchedIngress.classification?.classification || null,
            hostMessageId: matchedIngress.hostMessageId || null,
            coreTransactionId: matchedIngress.coreTransactionId || matchedIngress.transactionId || null,
            sourceFrameId: matchedIngress.sourceFrameId || matchedIngress.sourceFrame?.id || null,
            textPreview: compactText(matchedIngress.textPreview || matchedIngress.text || matchedIngress.messageText || '')
          }
        : null,
      matchedHostGenerationResponse: matchedHostGenerationResponse
        ? {
            id: matchedHostGenerationResponse.id || null,
            ingressId: matchedHostGenerationResponse.ingressId || null,
            hostMessageId: matchedHostGenerationResponse.hostMessageId || null,
            strategy: matchedHostGenerationResponse.strategy || null,
            responseKind: matchedHostGenerationResponse.responseKind || null,
            status: matchedHostGenerationResponse.status || null,
            coreTransactionId: matchedHostGenerationResponse.coreTransactionId || null,
            coreRelease: matchedHostGenerationResponse.coreRelease
              ? {
                  transactionId: matchedHostGenerationResponse.coreRelease.transactionId || null,
                  phase: matchedHostGenerationResponse.coreRelease.phase || null,
                  route: matchedHostGenerationResponse.coreRelease.route || null
                }
              : null
          }
        : null,
      pendingInteractions: pendingInteractions.map((entry) => ({
        id: entry?.id || null,
        kind: entry?.kind || null,
        status: entry?.status || null,
        ingressId: entry?.ingressId || null,
        turnId: entry?.turnId || null,
        outcomeId: entry?.outcomeId || null
      })),
      chatLength: chat.length,
      directiveMessageCount: messages.filter((message) => message.directiveOwned).length,
      nonDirectiveAssistantCount: messages.filter((message) => !message.isUser && !message.isSystem && !message.directiveOwned).length,
      recentMessages: messages.slice(-8),
      modelCalls: (view?.chatNative?.modelCalls || []).map((entry) => {
        const safeMetadata = {};
        for (const key of [
          'coreDiagnosticTarget',
          'fallbackAdvisoryHash',
          'fallbackHash',
          'fallbackUsed',
          'deterministicFallbackHash',
          'lastGoodProjectionHash',
          'sourceHash',
          'requestHash',
          'candidateFactCount'
        ]) {
          if (entry.metadata?.[key] === undefined || entry.metadata?.[key] === null) continue;
          const value = entry.metadata[key];
          safeMetadata[key] = typeof value === 'string' && value.length > 96
            ? `${value.slice(0, 96)}...`
            : value;
        }
        return {
          id: entry.id || null,
          roleId: entry.roleId || null,
          status: entry.status || null,
          ok: entry.ok === true,
          providerKind: entry.providerKind || null,
          providerId: entry.providerId || null,
          errorCode: entry.errorCode || null,
          requestHash: entry.requestHash || entry.metadata?.requestHash || null,
          fallback: entry.fallback || entry.fallbackPolicy || null,
          fallbackOutcome: entry.fallbackOutcome || entry.fallbackStatus || null,
          retryable: entry.retryable ?? null,
          structuredOutput: entry.structuredOutput === true,
          mayProposeState: entry.mayProposeState === true,
          mayInjectPrompt: entry.mayInjectPrompt === true,
          parseStatus: entry.parseStatus || entry.parserStatus || null,
          validationStatus: entry.validationStatus || null,
          applyStatus: entry.applyStatus || null,
          metadata: Object.keys(safeMetadata).length ? safeMetadata : null
        };
      }).slice(-12),
      sidecarCount: coreSidecars.length,
      turnLedgerCount: view?.campaignState?.turnLedger?.entries?.length || 0,
      commandLogCount: view?.campaignState?.commandLog?.entries?.length || 0
    };
  }, {
    modulePath: bridgeModulePath(),
    ledgerModulePath: runtimeLedgerViewModulePath(),
    before: {
      ...beforeSnapshot,
      lastDirectiveFallbackScan: sendResult.directiveFallbackScan || null
    },
    text,
    targetHostMessageId: sendResult.directiveFallbackScan?.matchedIndex !== undefined && sendResult.directiveFallbackScan?.matchedIndex !== null
      ? String(sendResult.directiveFallbackScan.matchedIndex)
      : null
  }, {
    timeout: CHAT_CAMPAIGN_TIMEOUT_MS
  });
  assertBrowser(after && typeof after === 'object', 'SillyTavern chat send did not return a serializable Directive observation.', {
    text,
    beforeSnapshot,
    after
  });

  const idle = await waitForSillyTavernSendReady(page, after);
  const idleSnapshot = await chatNativeRuntimeSnapshot(page);
  const directiveHandled = Number(after.directiveMessageCount || 0) > Number(beforeSnapshot.directiveMessageCount || 0)
    || Number(after.pendingInteractions?.length || 0) > Number(beforeSnapshot.pendingInteractionCount || 0);
  assertBrowser(
    !directiveHandled
      || Number(idleSnapshot.nonDirectiveAssistantCount || 0) <= Number(beforeSnapshot.nonDirectiveAssistantCount || 0),
    'SillyTavern appended a non-Directive assistant message after Directive handled the chat turn.',
    { beforeSnapshot, after, idle, idleSnapshot }
  );

  return {
    text,
    sendResult,
    after,
    idle
  };
}

async function flushDirectiveSidecars(page) {
  return page.evaluate(async (modulePath) => {
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.flushChatSidecars) {
      return { ok: false, skipped: true, reason: 'flushChatSidecars-unavailable' };
    }
    return app.flushChatSidecars();
  }, bridgeModulePath());
}

async function readSidecarActivity(page, beforeSnapshot) {
  return page.evaluate(async ({ modulePath, ledgerModulePath, before, sidecarRoleIds }) => {
    const mod = await import(modulePath);
    let ledgerTools = null;
    try {
      ledgerTools = await import(ledgerModulePath);
    } catch {
      ledgerTools = null;
    }
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const view = app?.getCurrentView
      ? await app.getCurrentView({ tabId: 'mission' })
      : null;
    const runtimeCoreProjections = typeof ledgerTools?.readRuntimeCoreProjections === 'function'
      ? ledgerTools.readRuntimeCoreProjections(view?.campaignState || {})
      : {};
    const coreSidecars = [
      ...(Array.isArray(runtimeCoreProjections?.sidecarDiagnostics) ? runtimeCoreProjections.sidecarDiagnostics : []),
      ...(Array.isArray(runtimeCoreProjections?.backgroundBatches) ? runtimeCoreProjections.backgroundBatches : [])
    ];
    const sidecars = coreSidecars;
    const modelCalls = view?.chatNative?.modelCalls || [];
    const beforeSidecarCount = Number(before.sidecarCount || 0);
    const beforeModelCallCount = Number(before.tracking?.modelCallCount ?? before.modelCallCount ?? 0);
    const newSidecars = sidecars.slice(beforeSidecarCount);
    const newModelCalls = modelCalls.slice(beforeModelCallCount);
    const sidecarModelRoles = new Set(sidecarRoleIds);
    const sidecarModelCallRoles = newModelCalls.filter((entry) => sidecarModelRoles.has(entry?.roleId)).map((entry) => entry.roleId);
    const sidecarDelta = Math.max(0, sidecars.length - beforeSidecarCount);
    return {
      sidecarCount: sidecars.length,
      sidecarDelta,
      sidecarStatuses: sidecars.map((entry) => `${entry.workerId || entry.roleId || 'unknown'}:${entry.status || 'unknown'}`),
      sidecars: sidecars.map((entry) => ({
        workerId: entry.workerId || null,
        roleId: entry.roleId || null,
        status: entry.status || null,
        errorCode: entry.error?.code || null,
        outcomeId: entry.outcomeId || null,
        sidecarGeneration: entry.diagnostics?.sidecarGeneration || null
      })).slice(-20),
      newSidecars: newSidecars.map((entry) => ({
        workerId: entry.workerId || null,
        roleId: entry.roleId || null,
        status: entry.status || null,
        errorCode: entry.error?.code || null,
        outcomeId: entry.outcomeId || null,
        sidecarGeneration: entry.diagnostics?.sidecarGeneration || null
      })),
      modelCallDelta: Math.max(0, modelCalls.length - beforeModelCallCount),
      sidecarModelRoles: sidecarModelCallRoles,
      hasNewSidecarActivity: sidecarDelta > 0 || sidecarModelCallRoles.length > 0
    };
  }, {
    modulePath: bridgeModulePath(),
    ledgerModulePath: runtimeLedgerViewModulePath(),
    before: beforeSnapshot,
    sidecarRoleIds: SIDECAR_MODEL_ROLE_IDS
  });
}

async function waitForSidecarActivity(page, beforeSnapshot, {
  timeoutMs = CHAT_CAMPAIGN_TIMEOUT_MS
} = {}) {
  return waitForJsonValue(page, async ({ modulePath, ledgerModulePath, before, sidecarRoleIds }) => {
    const mod = await import(modulePath);
    let ledgerTools = null;
    try {
      ledgerTools = await import(ledgerModulePath);
    } catch {
      ledgerTools = null;
    }
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const view = app?.getCurrentView
      ? await app.getCurrentView({ tabId: 'mission' })
      : null;
    const runtimeCoreProjections = typeof ledgerTools?.readRuntimeCoreProjections === 'function'
      ? ledgerTools.readRuntimeCoreProjections(view?.campaignState || {})
      : {};
    const coreSidecars = [
      ...(Array.isArray(runtimeCoreProjections?.sidecarDiagnostics) ? runtimeCoreProjections.sidecarDiagnostics : []),
      ...(Array.isArray(runtimeCoreProjections?.backgroundBatches) ? runtimeCoreProjections.backgroundBatches : [])
    ];
    const sidecars = coreSidecars;
    const modelCalls = view?.chatNative?.modelCalls || [];
    const beforeSidecarCount = Number(before.sidecarCount || 0);
    const beforeModelCallCount = Number(before.tracking?.modelCallCount ?? before.modelCallCount ?? 0);
    const newSidecars = sidecars.slice(beforeSidecarCount);
    const newModelCalls = modelCalls.slice(beforeModelCallCount);
    const sidecarModelRoles = new Set(sidecarRoleIds);
    const sidecarModelCallRoles = newModelCalls.filter((entry) => sidecarModelRoles.has(entry?.roleId)).map((entry) => entry.roleId);
    const sidecarDelta = Math.max(0, sidecars.length - beforeSidecarCount);
    if (sidecarDelta <= 0 && sidecarModelCallRoles.length === 0) return null;
    return {
      sidecarCount: sidecars.length,
      sidecarDelta,
      sidecarStatuses: sidecars.map((entry) => `${entry.workerId || entry.roleId || 'unknown'}:${entry.status || 'unknown'}`),
      sidecars: sidecars.map((entry) => ({
        workerId: entry.workerId || null,
        roleId: entry.roleId || null,
        status: entry.status || null,
        errorCode: entry.error?.code || null,
        outcomeId: entry.outcomeId || null,
        sidecarGeneration: entry.diagnostics?.sidecarGeneration || null
      })).slice(-20),
      newSidecars: newSidecars.map((entry) => ({
        workerId: entry.workerId || null,
        roleId: entry.roleId || null,
        status: entry.status || null,
        errorCode: entry.error?.code || null,
        outcomeId: entry.outcomeId || null,
        sidecarGeneration: entry.diagnostics?.sidecarGeneration || null
      })),
      modelCallDelta: Math.max(0, modelCalls.length - beforeModelCallCount),
      sidecarModelRoles: sidecarModelCallRoles,
      hasNewSidecarActivity: true
    };
  }, {
    modulePath: bridgeModulePath(),
    ledgerModulePath: runtimeLedgerViewModulePath(),
    before: beforeSnapshot,
    sidecarRoleIds: SIDECAR_MODEL_ROLE_IDS
  }, {
    timeout: timeoutMs
  });
}

async function settleSidecarsForTurn(page, beforeSnapshot, {
  scriptMessageId = null,
  scriptLabel = null,
  scriptCategory = null
} = {}) {
  if (!WAIT_FOR_SIDECARS_EACH_TURN) return null;
  const flush = await flushDirectiveSidecars(page).catch((error) => ({
    ok: false,
    skipped: true,
    reason: error?.message || String(error)
  }));
  const activity = flush?.ok
    ? await readSidecarActivity(page, beforeSnapshot).catch((error) => ({
      skipped: true,
      reason: error?.message || String(error)
    }))
    : await waitForSidecarActivity(page, beforeSnapshot).catch((error) => ({
      skipped: true,
      reason: error?.message || String(error)
    }));
  const settled = await waitForDirectiveRuntimeQuiescence(page, {
    quietMs: 2500,
    timeoutMs: SIDECAR_SETTLE_TIMEOUT_MS,
    pollingMs: 750
  }).catch((error) => ({
    skipped: true,
    reason: error?.message || String(error)
  }));
  const snapshot = settled && settled.skipped !== true
    ? settled
    : await chatNativeRuntimeSnapshot(page);
  const sidecarRejectedDelta = Math.max(
    0,
    Number(snapshot.sidecarRejectedCount || 0) - Number(beforeSnapshot.sidecarRejectedCount || 0)
  );
  appendLiveLog({
    kind: 'checkpoint',
    status: sidecarRejectedDelta > 0 ? 'warning' : 'pass',
    checkpoint: 'sidecar-settle-after-turn',
    scriptMessageId,
    scriptLabel,
    scriptCategory,
    sidecarFlush: flush,
    sidecarActivity: activity,
    sidecarCount: snapshot.sidecarCount,
    sidecarRejectedCount: snapshot.sidecarRejectedCount,
    newSidecarRejectedCount: sidecarRejectedDelta,
    sidecarStatusCounts: snapshot.sidecarStatusCounts,
    modelCallCount: snapshot.tracking?.modelCallCount ?? snapshot.modelCallCount ?? null,
    turnLedgerCount: snapshot.turnLedgerCount,
    commandLogCount: snapshot.commandLogCount
  });
  return {
    activity,
    settled,
    snapshot
  };
}

async function waitForChatNativeIngressCount(page, {
  baseIngressCount = 0,
  expectedDelta = 0,
  saveId = null,
  campaignId = null,
  targetPlayerHostMessageIds = []
} = {}) {
  const targetIds = uniqueStringList(targetPlayerHostMessageIds);
  if (targetIds.length > 0) {
    const startedAt = Date.now();
    let latest = null;
    while (Date.now() - startedAt < CHAT_CAMPAIGN_TIMEOUT_MS) {
      const core = await captureCoreStoreProjections(page, {
        saveId,
        campaignId,
        label: 'Directive save index for CORE ingress settlement'
      }).catch((error) => ({
        status: 'warning',
        reason: error?.message || String(error),
        saveId,
        campaignId
      }));
      const proof = core.status === 'pass'
        ? corePlayerIngressProof({
          projections: core.projections,
          targetPlayerHostMessageIds: targetIds
        })
        : {
          status: 'warning',
          source: 'coreStoreIngressLedger',
          expectedPlayerHostMessageIds: targetIds,
          matchedPlayerHostMessageIds: [],
          missingPlayerHostMessageIds: targetIds,
          expectedPlayerMessageCount: targetIds.length,
          matchedPlayerMessageCount: 0,
          reason: core.reason || 'core-projections-unavailable'
        };
      latest = {
        status: proof.status,
        source: 'coreStoreIngressLedger',
        saveId: core.saveId || saveId || null,
        campaignId: core.campaignId || campaignId || null,
        payloadPath: core.payloadPath || null,
        coreManifestPath: core.coreManifestPath || null,
        corePlayerIngressProof: proof
      };
      if (proof.status === 'pass') return latest;
      await sleep(Math.min(1000, Math.max(0, CHAT_CAMPAIGN_TIMEOUT_MS - (Date.now() - startedAt))));
    }
    return latest || {
      status: 'warning',
      source: 'coreStoreIngressLedger',
      saveId,
      campaignId,
      corePlayerIngressProof: {
        status: 'warning',
        source: 'coreStoreIngressLedger',
        expectedPlayerHostMessageIds: targetIds,
        matchedPlayerHostMessageIds: [],
        missingPlayerHostMessageIds: targetIds,
        expectedPlayerMessageCount: targetIds.length,
        matchedPlayerMessageCount: 0,
        unavailableReason: 'core-ingress-settlement-timeout'
      }
    };
  }
  const minimum = Number(baseIngressCount || 0) + Number(expectedDelta || 0);
  if (minimum <= 0) return chatNativeRuntimeSnapshot(page);
  const settled = await waitForJsonValue(page, async ({ modulePath, minimum }) => {
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const view = app?.getCurrentView
      ? await app.getCurrentView({ tabId: 'mission' })
      : null;
    const tracking = view?.chatNative?.tracking || {};
    const ingressCount = Number(tracking.ingressCount || 0);
    if (ingressCount < minimum) return null;
    return {
      tracking,
      ingressCount,
      pendingInteractionCount: (view?.chatNative?.pendingInteractions || []).filter((entry) => entry?.status !== 'resolved').length,
      modelCallCount: view?.chatNative?.modelCalls?.length ?? 0
    };
  }, {
    modulePath: bridgeModulePath(),
    minimum
  }, {
    timeout: CHAT_CAMPAIGN_TIMEOUT_MS
  }).catch(() => null);
  return settled || chatNativeRuntimeSnapshot(page);
}

async function runChatNativeCampaignFlow(page) {
  if (!RUN_CHAT_CAMPAIGN_FLOW) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_CHAT_CAMPAIGN=1 not set'
    };
  }
  if (!RUN_LIVE_GENERATION) {
    return browserSkip('DIRECTIVE_SILLYTAVERN_CHAT_CAMPAIGN=1 requires DIRECTIVE_SILLYTAVERN_GENERATION=1 or DIRECTIVE_LIVE_GENERATION=1 because it sends real SillyTavern chat turns and expects provider/model-call evidence.');
  }

  const created = CHAT_CAMPAIGN_RESUME_ENABLED
    ? await resumeChatNativeLiveCampaign(page)
    : await createChatNativeLiveCampaign(page);
  if (created.skipped) {
    return browserSkip(`${created.reason}${created.providerTests ? ` Provider tests: ${compact(created.providerTests, 260)}` : ''}`);
  }
  const activationDetails = {
    mode: created.resumed ? 'resume' : 'fresh',
    resumeSaveId: created.resumeSaveId || CHAT_CAMPAIGN_RESUME_SAVE_ID || null,
    expectedChatId: created.expectedChatId || CHAT_CAMPAIGN_RESUME_CHAT_ID || null,
    expectedChatMatches: created.expectedChatMatches ?? null,
    currentChatId: created.currentChatId || null,
    selectedEntity: created.selectedEntity,
    activeSelectedEntity: created.activeSelectedEntity,
    autoSelectedEntity: created.autoSelectedEntity,
    campaign: created.campaign,
    binding: created.binding,
    activation: created.activation,
    openCampaignChat: created.openCampaignChat,
    providerPrecheck: {
      utilityOk: created.providerTests?.utility?.ok ?? null,
      utilityError: created.providerTests?.utility?.error || null,
      reasoningOk: created.providerTests?.reasoning?.ok ?? null,
      reasoningError: created.providerTests?.reasoning?.error || null
    }
  };
  if (!created.binding?.chatId) {
    throw new Error(`Live chat-native campaign did not bind a SillyTavern chat. Activation details: ${compact(activationDetails, 1800)}`);
  }
  const directiveOwnedBinding = /^Directive(?:\b| - )/.test(String(created.binding?.entityName || ''))
    || /^Directive(?:\b| - )/.test(String(created.activeSelectedEntity?.entityName || ''))
    || (
      created.binding?.createdByDirective === true
      && /^Directive(?:\b| - )/.test(String(created.binding?.chatName || created.binding?.chatId || created.currentChatId || ''))
      && (created.expectedChatMatches !== false)
    );
  assertBrowser(
    directiveOwnedBinding,
    'Live chat-native campaign did not bind to a Directive-owned SillyTavern character card.',
    activationDetails
  );
  const activationComplete = created.activation?.status === 'complete'
    || (created.resumed === true && created.campaign?.status === 'active');
  if (!activationComplete) {
    throw new Error(`Live chat-native campaign activation did not complete. Activation details: ${compact(activationDetails, 1800)}`);
  }
  if (CHAT_CAMPAIGN_RESUME_CHAT_ID) {
    assertBrowser(
      created.expectedChatMatches === true,
      'Resumed chat-native campaign did not open the expected bound SillyTavern chat.',
      activationDetails
    );
  }
  assertBrowser(created.openCampaignChat?.ok !== false, 'Directive could not open the bound SillyTavern campaign chat.', activationDetails);
  const externalContextFixtureActivation = await activateExternalContextFixtureForCampaignChat(page, {
    expectedChatId: created.binding?.chatId || null
  });
  if (ACTIVATE_EXTERNAL_CONTEXT_FIXTURE) {
    assertBrowser(
      externalContextFixtureActivation?.ok === true,
      'External context fixture activation did not bind the live campaign chat.',
      externalContextFixtureActivation
    );
    appendLiveLog({
      kind: 'external-context-fixture-activation',
      status: 'pass',
      scope: 'live-campaign-chat',
      activation: externalContextFixtureActivation
    });
  }
  appendLiveLog({
    kind: 'campaign-start',
    status: 'pass',
    mode: created.resumed ? 'resume' : 'fresh',
    user: SILLYTAVERN_USER || null,
    packageId: created.campaign?.packageId || CAMPAIGN_PACKAGE_ID || null,
    campaignId: created.campaign?.id || null,
    campaignTitle: created.campaign?.title || null,
    saveId: created.binding?.saveId || created.resumeSaveId || CHAT_CAMPAIGN_RESUME_SAVE_ID || null,
    chatId: created.binding?.chatId || null,
    currentChatId: created.currentChatId || null,
    expectedChatId: created.expectedChatId || CHAT_CAMPAIGN_RESUME_CHAT_ID || null,
    externalContextFixtureActivation,
    artifactDir: LIVE_ARTIFACT_DIR || null
  });

  await navigateDirectiveRoute(page, 'Mission');
  await clickBodyButton(page, 'Open Campaign Chat');

  const messageScript = chatCampaignMessageScript();
  const rounds = [];
  const transcriptCaptures = [];
  const promptInspectionCaptures = [];
  let snapshot = await chatNativeRuntimeSnapshot(page);
  const campaignStartSnapshot = snapshot;
  const initialSidecarRejectedCount = Number(snapshot.sidecarRejectedCount || 0);
  const initialPromptInspection = capturePromptInspectionSnapshot(snapshot, {
    reason: 'campaign-start',
    scriptMessageId: null,
    scriptCategory: null
  });
  if (initialPromptInspection) promptInspectionCaptures.push(initialPromptInspection);
  const initialTranscript = await captureChatTranscript(page, {
    reason: 'campaign-start',
    scriptMessageId: null,
    scriptCategory: null
  });
  if (initialTranscript) transcriptCaptures.push(initialTranscript);
  let stoppedOnTerminalDecision = false;
  let stoppedOnPendingInteraction = null;
  for (const message of messageScript.messages) {
    appendLiveLog({
      kind: 'turn-start',
      status: 'in_progress',
      scriptMessageId: message.id,
      scriptLabel: message.label,
      scriptCategory: message.category,
      ...perspectiveLogFields(message),
      textPreview: compact(message.text, 220),
      assistAction: message.assist?.action || null
    });
    const prepared = await prepareScriptMessage(page, message);
    const preparedPerspective = playerInputPerspectiveEvidence(prepared.text, message.perspective);
    if (!prepared.send) {
      rounds.push({
        scriptMessageId: message.id,
        scriptLabel: message.label,
        scriptCategory: message.category,
        ...perspectiveLogFields(preparedPerspective),
        text: prepared.text,
        assist: prepared.assist,
        assistOnly: true,
        skippedSend: true
      });
      const capture = await captureChatTranscript(page, {
        reason: 'assist-only',
        scriptMessageId: message.id,
        scriptCategory: message.category
      });
      if (capture) transcriptCaptures.push(capture);
      appendLiveLog({
        kind: 'turn-end',
        status: 'pass',
        scriptMessageId: message.id,
        scriptLabel: message.label,
        scriptCategory: message.category,
        ...perspectiveLogFields(preparedPerspective),
        assistOnly: true,
        skippedSend: true,
        transcript: capture
      });
      continue;
    }
    const beforeTurnSnapshot = snapshot;
    const beforeTurnPromptInspection = capturePromptInspectionSnapshot(beforeTurnSnapshot, {
      reason: 'pre-generation',
      scriptMessageId: message.id,
      scriptLabel: message.label,
      scriptCategory: message.category
    });
    if (beforeTurnPromptInspection) promptInspectionCaptures.push(beforeTurnPromptInspection);
    const round = await sendSillyTavernChatMessage(page, prepared.text, snapshot);
    rounds.push({
      ...round,
      scriptMessageId: message.id,
      scriptLabel: message.label,
      scriptCategory: message.category,
      ...perspectiveLogFields(preparedPerspective),
      assist: prepared.assist || null,
      promptInspection: beforeTurnPromptInspection
    });
    const sidecarSettle = await settleSidecarsForTurn(page, beforeTurnSnapshot, {
      scriptMessageId: message.id,
      scriptLabel: message.label,
      scriptCategory: message.category
    });
    snapshot = sidecarSettle?.snapshot || await chatNativeRuntimeSnapshot(page);
    const capture = await captureChatTranscript(page, {
      reason: 'turn-end',
      scriptMessageId: message.id,
      scriptCategory: message.category
    });
    if (capture) transcriptCaptures.push(capture);
    const targetPlayerHostMessageIds = targetPlayerHostMessageIdsForRound(round);
    const generationTiming = {
      runtime: generationTimingProofFromLedgers({
        source: 'runtimeLedgerDiagnostic',
        ingressLedger: snapshot.recentIngressLedger || [],
        responseLedger: snapshot.recentResponseLedger || [],
        beforeResponseIds: (beforeTurnSnapshot?.recentResponseLedger || []).map((response) => response.id).filter(Boolean)
      }),
      persisted: await capturePersistedGenerationTimingProof(page, {
        campaignId: created.campaign?.id || null,
        saveId: created.binding?.saveId || created.resumeSaveId || CHAT_CAMPAIGN_RESUME_SAVE_ID || null,
        beforeSnapshot: beforeTurnSnapshot,
        afterSnapshot: snapshot,
        targetPlayerHostMessageIds
      })
    };
    const hostNativeCompletionProofInput = {
      campaignId: created.campaign?.id || null,
      saveId: created.binding?.saveId || created.resumeSaveId || CHAT_CAMPAIGN_RESUME_SAVE_ID || null,
      beforeSnapshot: beforeTurnSnapshot,
      afterSnapshot: snapshot,
      targetPlayerHostMessageIds
    };
    const hostNativeCompletion = {
      persisted: message.hostNativeCompletionRequired === true
        ? await waitForPersistedHostNativeCompletionProof(page, hostNativeCompletionProofInput)
        : await capturePersistedHostNativeCompletionProof(page, hostNativeCompletionProofInput)
    };
    if (message.hostNativeCompletionRequired === true) {
      snapshot = await chatNativeRuntimeSnapshot(page);
    }
    const postHostNativeWaitTranscript = message.hostNativeCompletionRequired === true
      ? await captureChatTranscript(page, {
        reason: 'host-native-completion-proof',
        scriptMessageId: message.id,
        scriptCategory: message.category
      })
      : null;
    if (postHostNativeWaitTranscript) transcriptCaptures.push(postHostNativeWaitTranscript);
    const hostNativeCompletionRequirement = hostNativeCompletionRequirementProof(message, hostNativeCompletion.persisted);
    const recordedRound = rounds.at(-1);
    if (recordedRound && recordedRound.scriptMessageId === message.id) {
      recordedRound.transcript = postHostNativeWaitTranscript || capture;
      recordedRound.generationTiming = generationTiming;
      recordedRound.hostNativeCompletion = hostNativeCompletion;
      recordedRound.hostNativeCompletionRequirement = hostNativeCompletionRequirement;
    }
    const newSidecarRejectedCount = Math.max(0, Number(snapshot.sidecarRejectedCount || 0) - Number(beforeTurnSnapshot?.sidecarRejectedCount || 0));
    const turnStatus = snapshot.openNarrationRecoveryCount > 0
      || snapshot.narrationFailureCount > 0
      || newSidecarRejectedCount > 0
      || snapshot.pendingInteractionCount > 0
      ? 'warning'
      : 'pass';
    appendLiveLog({
      kind: 'turn-end',
      status: turnStatus,
      scriptMessageId: message.id,
      scriptLabel: message.label,
      scriptCategory: message.category,
      ...perspectiveLogFields(preparedPerspective),
      textPreview: compact(prepared.text, 220),
      responseCount: round.after?.tracking?.responseCount ?? null,
      ingressCount: round.after?.tracking?.ingressCount ?? null,
      modelCallCount: round.after?.tracking?.modelCallCount ?? round.after?.modelCalls?.length ?? null,
      pendingInteractionCount: snapshot.pendingInteractionCount,
      turnLedgerCount: snapshot.turnLedgerCount,
      commandLogCount: snapshot.commandLogCount,
      narrationFailureCount: snapshot.narrationFailureCount,
      openNarrationRecoveryCount: snapshot.openNarrationRecoveryCount,
      sidecarRejectedCount: snapshot.sidecarRejectedCount,
      newSidecarRejectedCount,
      sidecarStatusCounts: snapshot.sidecarStatusCounts,
      recentRecoveryJournal: snapshot.recentRecoveryJournal,
      generationTiming,
      hostNativeCompletion,
      hostNativeCompletionRequirement,
      transcript: postHostNativeWaitTranscript || capture
    });
    assertBrowser(
      !hostNativeCompletionRequirement || hostNativeCompletionRequirement.status === 'pass',
      'Required host-native completion proof was not recorded for the scripted hostContinue turn.',
      hostNativeCompletionRequirement
    );
    if ((snapshot.pendingInteractions || []).some((entry) => entry?.kind === 'terminalOutcomeDecision')) {
      stoppedOnTerminalDecision = true;
      break;
    }
    if (snapshot.pendingInteractionCount > 0) {
      const pendingResolution = pendingResolutionForScriptMessage(message, snapshot);
      if (!pendingResolution || pendingResolution.shouldStop) {
        stoppedOnPendingInteraction = pendingResolution || {
          reason: 'pending-interaction-without-resolution',
          pending: pendingInteractionSummary(snapshot)
        };
        appendLiveLog({
          kind: 'pending-resolution-skipped',
          status: 'warning',
          scriptMessageId: message.id,
          scriptLabel: message.label,
          scriptCategory: message.category,
          ...perspectiveLogFields(preparedPerspective),
          reason: stoppedOnPendingInteraction.reason,
          pendingInteractions: stoppedOnPendingInteraction.pending || []
        });
        break;
      }
      const resolutionPerspective = playerInputPerspectiveEvidence(pendingResolution.text, message.perspective);
      appendLiveLog({
        kind: 'turn-start',
        status: 'in_progress',
        scriptMessageId: `${message.id}:proceed`,
        scriptLabel: `${message.label} ${pendingResolution.kind || 'pending'} resolution`,
        scriptCategory: 'pending-resolution',
        ...perspectiveLogFields(resolutionPerspective),
        textPreview: compact(pendingResolution.text, 220),
        pendingKind: pendingResolution.kind || null,
        pendingResolutionReason: pendingResolution.reason || null
      });
      const beforeResolutionSnapshot = snapshot;
      const beforeResolutionPromptInspection = capturePromptInspectionSnapshot(beforeResolutionSnapshot, {
        reason: 'pre-generation',
        scriptMessageId: `${message.id}:proceed`,
        scriptLabel: `${message.label} ${pendingResolution.kind || 'pending'} resolution`,
        scriptCategory: 'pending-resolution'
      });
      if (beforeResolutionPromptInspection) promptInspectionCaptures.push(beforeResolutionPromptInspection);
      const resolution = await sendSillyTavernChatMessage(page, pendingResolution.text, snapshot);
      rounds.push({
        ...resolution,
        resolvesPendingInteraction: true,
        scriptMessageId: `${message.id}:proceed`,
        scriptLabel: `${message.label} ${pendingResolution.kind || 'pending'} resolution`,
        scriptCategory: 'pending-resolution',
        ...perspectiveLogFields(resolutionPerspective),
        pendingKind: pendingResolution.kind || null,
        promptInspection: beforeResolutionPromptInspection
      });
      const resolutionSidecarSettle = await settleSidecarsForTurn(page, beforeResolutionSnapshot, {
        scriptMessageId: `${message.id}:proceed`,
        scriptLabel: `${message.label} ${pendingResolution.kind || 'pending'} resolution`,
        scriptCategory: 'pending-resolution'
      });
      snapshot = resolutionSidecarSettle?.snapshot || await chatNativeRuntimeSnapshot(page);
      const resolutionCapture = await captureChatTranscript(page, {
        reason: 'pending-resolution',
        scriptMessageId: `${message.id}:proceed`,
        scriptCategory: 'pending-resolution'
      });
      if (resolutionCapture) transcriptCaptures.push(resolutionCapture);
      const resolutionTargetPlayerHostMessageIds = targetPlayerHostMessageIdsForRound(resolution);
      const resolutionGenerationTiming = {
        runtime: generationTimingProofFromLedgers({
          source: 'runtimeLedgerDiagnostic',
          ingressLedger: snapshot.recentIngressLedger || [],
          responseLedger: snapshot.recentResponseLedger || [],
          beforeResponseIds: (beforeResolutionSnapshot?.recentResponseLedger || []).map((response) => response.id).filter(Boolean)
        }),
        persisted: await capturePersistedGenerationTimingProof(page, {
          campaignId: created.campaign?.id || null,
          saveId: created.binding?.saveId || created.resumeSaveId || CHAT_CAMPAIGN_RESUME_SAVE_ID || null,
          beforeSnapshot: beforeResolutionSnapshot,
          afterSnapshot: snapshot,
          targetPlayerHostMessageIds: resolutionTargetPlayerHostMessageIds
        })
      };
      const resolutionHostNativeCompletion = {
        persisted: await capturePersistedHostNativeCompletionProof(page, {
          campaignId: created.campaign?.id || null,
          saveId: created.binding?.saveId || created.resumeSaveId || CHAT_CAMPAIGN_RESUME_SAVE_ID || null,
          beforeSnapshot: beforeResolutionSnapshot,
          afterSnapshot: snapshot,
          targetPlayerHostMessageIds: resolutionTargetPlayerHostMessageIds
        })
      };
      const recordedResolutionRound = rounds.at(-1);
      if (recordedResolutionRound?.scriptMessageId === `${message.id}:proceed`) {
        recordedResolutionRound.transcript = resolutionCapture;
        recordedResolutionRound.generationTiming = resolutionGenerationTiming;
        recordedResolutionRound.hostNativeCompletion = resolutionHostNativeCompletion;
      }
      const resolutionNewSidecarRejectedCount = Math.max(0, Number(snapshot.sidecarRejectedCount || 0) - Number(beforeResolutionSnapshot?.sidecarRejectedCount || 0));
      const resolutionStatus = snapshot.openNarrationRecoveryCount > 0
        || snapshot.narrationFailureCount > 0
        || resolutionNewSidecarRejectedCount > 0
        || snapshot.pendingInteractionCount > 0
        ? 'warning'
        : 'pass';
      appendLiveLog({
        kind: 'turn-end',
        status: resolutionStatus,
        scriptMessageId: `${message.id}:proceed`,
        scriptLabel: `${message.label} ${pendingResolution.kind || 'pending'} resolution`,
        scriptCategory: 'pending-resolution',
        ...perspectiveLogFields(resolutionPerspective),
        textPreview: compact(pendingResolution.text, 220),
        pendingKind: pendingResolution.kind || null,
        pendingResolutionReason: pendingResolution.reason || null,
        responseCount: resolution.after?.tracking?.responseCount ?? null,
        ingressCount: resolution.after?.tracking?.ingressCount ?? null,
        modelCallCount: resolution.after?.tracking?.modelCallCount ?? resolution.after?.modelCalls?.length ?? null,
        pendingInteractionCount: snapshot.pendingInteractionCount,
        turnLedgerCount: snapshot.turnLedgerCount,
        commandLogCount: snapshot.commandLogCount,
        narrationFailureCount: snapshot.narrationFailureCount,
        openNarrationRecoveryCount: snapshot.openNarrationRecoveryCount,
        sidecarRejectedCount: snapshot.sidecarRejectedCount,
        newSidecarRejectedCount: resolutionNewSidecarRejectedCount,
        sidecarStatusCounts: snapshot.sidecarStatusCounts,
        recentRecoveryJournal: snapshot.recentRecoveryJournal,
        generationTiming: resolutionGenerationTiming,
        hostNativeCompletion: resolutionHostNativeCompletion,
        transcript: resolutionCapture
      });
      if ((snapshot.pendingInteractions || []).some((entry) => entry?.kind === 'terminalOutcomeDecision')) {
        stoppedOnTerminalDecision = true;
        break;
      }
    }
  }

  const sentRounds = rounds.filter((round) => !round.skippedSend);
  const sentRoundCount = sentRounds.length;
  const sentPlayerHostMessageIds = targetPlayerHostMessageIdsForRounds(sentRounds);
  appendLiveLog({
    kind: 'checkpoint',
    status: 'in_progress',
    checkpoint: 'ingress-settle-after-script',
    baseIngressCount: created.tracking?.ingressCount || 0,
    expectedDelta: sentRoundCount,
    expectedIngressCount: Number(created.tracking?.ingressCount || 0) + sentRoundCount,
    targetPlayerHostMessageIds: sentPlayerHostMessageIds
  });
  const ingressSettlement = await waitForChatNativeIngressCount(page, {
    baseIngressCount: created.tracking?.ingressCount || 0,
    expectedDelta: sentRoundCount,
    campaignId: created.campaign?.id || null,
    saveId: created.binding?.saveId || created.resumeSaveId || CHAT_CAMPAIGN_RESUME_SAVE_ID || null,
    targetPlayerHostMessageIds: sentPlayerHostMessageIds
  });
  appendLiveLog({
    kind: 'checkpoint',
    status: ingressSettlement?.corePlayerIngressProof?.status || (ingressSettlement ? 'pass' : 'warning'),
    checkpoint: 'ingress-settle-after-script',
    baseIngressCount: created.tracking?.ingressCount || 0,
    expectedDelta: sentRoundCount,
    expectedIngressCount: Number(created.tracking?.ingressCount || 0) + sentRoundCount,
    targetPlayerHostMessageIds: sentPlayerHostMessageIds,
    ingressSettlement
  });
  let finalSnapshot = await chatNativeRuntimeSnapshot(page);
  const matchedIngressRounds = rounds.filter((round) => (
    round.after?.matchedIngress || round.after?.matchedHostGenerationResponse
  ));
  const sidecarActivityExpected = matchedIngressRounds.some((round) => (
    ['committed', 'complete'].includes(String(round.after?.matchedIngress?.status || '').toLowerCase())
    && round.after?.matchedIngress?.responseStrategy !== 'pause'
  ));
  const sidecars = sidecarActivityExpected
    ? await waitForSidecarActivity(page, snapshot, {
      timeoutMs: FINAL_SIDECAR_ACTIVITY_TIMEOUT_MS
    }).catch((error) => ({
      skipped: true,
      reason: error?.code === 'BROWSER_EVALUATION_TIMEOUT'
        ? 'final-sidecar-activity-browser-timeout'
        : 'final-sidecar-activity-timeout',
      timeoutMs: FINAL_SIDECAR_ACTIVITY_TIMEOUT_MS,
      message: error?.message || String(error)
    }))
    : {
      skipped: true,
      reason: 'sidecar-not-expected-before-committed-or-complete-turn'
    };
  finalSnapshot = sidecarActivityExpected ? await chatNativeRuntimeSnapshot(page) : finalSnapshot;
  const initialModelCalls = Number(created.tracking?.modelCallCount || 0);
  const finalModelCalls = Number(finalSnapshot.tracking?.modelCallCount || finalSnapshot.modelCallCount || 0);
  const finalCoreIngressProof = ingressSettlement?.corePlayerIngressProof || null;
  const finalCoreIngressOk = sentPlayerHostMessageIds.length > 0 && finalCoreIngressProof?.status === 'pass';
  const finalLegacyIngressOk = Number(finalSnapshot.tracking?.ingressCount || 0) >= Number(created.tracking?.ingressCount || 0) + sentRoundCount;
  assertBrowser(
    sentRoundCount === 0 || finalCoreIngressOk,
    'Live chat-native campaign did not record every SillyTavern player message as a turn ingress.',
    {
      expectedIngressCount: Number(created.tracking?.ingressCount || 0) + sentRoundCount,
      targetPlayerHostMessageIds: sentPlayerHostMessageIds,
      corePlayerIngressProof: finalCoreIngressProof,
      legacyRuntimeTracking: {
        ok: finalLegacyIngressOk,
        initialIngressCount: Number(created.tracking?.ingressCount || 0),
        finalIngressCount: Number(finalSnapshot.tracking?.ingressCount || 0)
      },
      initialTracking: created.tracking || null,
      roundCount: sentRoundCount,
      rounds: rounds.map((round) => ({
        scriptMessageId: round.scriptMessageId || null,
        scriptLabel: round.scriptLabel || null,
        scriptCategory: round.scriptCategory || null,
        textPreview: compact(round.text, 100),
        resolvesPendingInteraction: round.resolvesPendingInteraction === true,
        afterTracking: round.after?.tracking || null,
        matchedUserHostMessageId: round.after?.matchedUserHostMessageId || null,
        targetPlayerHostMessageIds: targetPlayerHostMessageIdsForRound(round),
        afterChatLength: round.after?.chatLength || null,
        afterUserMessageCount: round.after?.userMessageCount || null,
        recentMessages: round.after?.recentMessages || []
      })),
      ingressSettlement,
      final: {
        tracking: finalSnapshot.tracking,
        chatLength: finalSnapshot.chatLength,
        userMessageCount: finalSnapshot.userMessageCount,
        directiveMessageCount: finalSnapshot.directiveMessageCount,
        recentMessages: finalSnapshot.recentMessages,
        modelCalls: finalSnapshot.modelCalls,
        pendingInteractionCount: finalSnapshot.pendingInteractionCount,
        browserErrors: finalSnapshot.browserErrors
      }
    }
  );
  const modelCallGrowthObserved = finalModelCalls > initialModelCalls;
  const delegatedHostGenerationRounds = matchedIngressRounds.filter((round) => (
    round.after?.matchedIngress?.responseStrategy === 'injectAndContinue'
    || round.after?.matchedHostGenerationResponse?.strategy === 'injectAndContinue'
  ));
  const campaignStartResponseIds = new Set((campaignStartSnapshot.recentResponseLedger || [])
    .map((entry) => entry?.id)
    .filter(Boolean));
  const finalHostGenerationResponses = (finalSnapshot.recentResponseLedger || []).filter((entry) => (
    entry?.strategy === 'injectAndContinue'
    && ['hostGeneration', 'hostContinue'].includes(String(entry?.responseKind || ''))
    && entry?.hostMessageId
    && (!entry.id || !campaignStartResponseIds.has(entry.id))
  ));
  const delegatedHostGenerationContinuation = (
    delegatedHostGenerationRounds.length > 0
    || finalHostGenerationResponses.length > 0
  )
    && Number(finalSnapshot.nonDirectiveAssistantCount || 0) > Number(campaignStartSnapshot.nonDirectiveAssistantCount || 0);
  const directiveOwnedResponseObserved = finalSnapshot.directiveMessageCount > Number(campaignStartSnapshot.directiveMessageCount || 0)
    || finalSnapshot.directiveResponseKinds.includes('committedOutcome');
  assertBrowser(
    modelCallGrowthObserved || delegatedHostGenerationContinuation,
    'Live chat-native campaign did not record Directive model-call growth or CORE host-native continuation during chat play.',
    {
      modelCallGrowthObserved,
      delegatedHostGenerationContinuation,
      initialModelCalls,
      finalModelCalls,
      modelCalls: finalSnapshot.modelCalls,
      finalHostGenerationResponses
    }
  );
  assertBrowser(
    directiveOwnedResponseObserved || delegatedHostGenerationContinuation,
    'Live chat-native campaign did not produce accepted response evidence in the bound SillyTavern chat.',
    {
      directiveOwnedResponseObserved,
      delegatedHostGenerationContinuation,
      delegatedHostGenerationRounds: delegatedHostGenerationRounds.map((round) => ({
        scriptMessageId: round.scriptMessageId || null,
        classification: round.after?.matchedIngress?.classification || null,
        responseStrategy: round.after?.matchedIngress?.responseStrategy || round.after?.matchedHostGenerationResponse?.strategy || null,
        responseStatus: round.after?.matchedHostGenerationResponse?.status || null,
        responseHostMessageId: round.after?.matchedHostGenerationResponse?.hostMessageId || null
      })),
      finalHostGenerationResponses: finalHostGenerationResponses.map((entry) => ({
        id: entry.id || null,
        ingressId: entry.ingressId || null,
        hostMessageId: entry.hostMessageId || null,
        status: entry.status || null,
        coreTransactionId: entry.coreTransactionId || null
      })),
      initialDirectiveMessageCount: Number(campaignStartSnapshot.directiveMessageCount || 0),
      finalDirectiveMessageCount: finalSnapshot.directiveMessageCount,
      initialNonDirectiveAssistantCount: Number(campaignStartSnapshot.nonDirectiveAssistantCount || 0),
      finalNonDirectiveAssistantCount: finalSnapshot.nonDirectiveAssistantCount,
      finalSnapshot
    }
  );
  const directorTurnExpected = matchedIngressRounds.some((round) => ![
    'routineCommand',
    'sceneColor',
    'sceneNavigation',
    'locationTransition',
    'counselRequest'
  ].includes(String(round.after?.matchedIngress?.classification || '')));
  assertBrowser(
    !directorTurnExpected
      || finalSnapshot.turnLedgerCount >= 1
      || finalSnapshot.pendingInteractionCount > Number(campaignStartSnapshot.pendingInteractionCount || 0)
      || finalHostGenerationResponses.length > 0,
    'Live chat-native campaign did not commit or pause any director turn when one was expected.',
    {
      directorTurnExpected,
      finalHostGenerationResponseCount: finalHostGenerationResponses.length,
      matchedIngressRounds: matchedIngressRounds.map((round) => ({
        scriptMessageId: round.scriptMessageId || null,
        classification: round.after?.matchedIngress?.classification || null,
        responseStrategy: round.after?.matchedIngress?.responseStrategy || round.after?.matchedHostGenerationResponse?.strategy || null,
        responseStatus: round.after?.matchedHostGenerationResponse?.status || null,
        responseHostMessageId: round.after?.matchedHostGenerationResponse?.hostMessageId || null
      })),
      turnLedgerCount: finalSnapshot.turnLedgerCount,
      pendingInteractionCount: finalSnapshot.pendingInteractionCount,
      initialPendingInteractionCount: Number(campaignStartSnapshot.pendingInteractionCount || 0),
      finalSnapshot
    }
  );
  const finalSidecarModelRoles = (Array.isArray(finalSnapshot.modelCalls) ? finalSnapshot.modelCalls : [])
    .filter((entry) => SIDECAR_MODEL_ROLE_IDS.includes(entry?.roleId))
    .map((entry) => entry.roleId);
  const sidecarActivityObserved = Number(finalSnapshot.sidecarCount || 0) > 0
    || (Array.isArray(sidecars?.sidecarModelRoles) && sidecars.sidecarModelRoles.length > 0)
    || finalSidecarModelRoles.length > 0;
  assertBrowser(
    !sidecarActivityExpected || sidecarActivityObserved,
    'Live chat-native campaign did not record sidecar journal or sidecar model-call activity.',
    { sidecarActivityExpected, sidecarActivityObserved, finalSidecarModelRoles, finalSnapshot, sidecars }
  );
  const sidecarEvidence = [
    ...(Array.isArray(finalSnapshot.sidecars) ? finalSnapshot.sidecars : []),
    ...(Array.isArray(sidecars?.sidecars) ? sidecars.sidecars : [])
  ];
  const batchedSidecars = sidecarEvidence.filter((entry) => (
    entry?.diagnostics?.sidecarGeneration?.concurrent === true
    || entry?.sidecarGeneration?.concurrent === true
  ));
  if (REQUIRE_BATCHED_SIDECARS) {
    assertBrowser(
      batchedSidecars.length > 0,
      'Live chat-native campaign did not record batched sidecar diagnostics.',
      { finalSnapshot, sidecars }
    );
  }
  const narrationQualityStatus = Number(finalSnapshot.openNarrationRecoveryCount || 0) > 0
    || Number(finalSnapshot.narrationFailureCount || 0) > 0
    ? 'warning'
    : 'pass';
  const sidecarRejectedDelta = Math.max(0, Number(finalSnapshot.sidecarRejectedCount || 0) - initialSidecarRejectedCount);
  const sidecarHealthStatus = sidecarRejectedDelta > 0 ? 'warning' : 'pass';
  const pendingInteractionStatus = Number(finalSnapshot.pendingInteractionCount || 0) > 0 ? 'warning' : 'pass';
  const generationTimingProof = aggregateGenerationTimingProof(sentRounds);
  const generationTimingStatus = generationTimingProof.status === 'fail'
    ? 'warning'
    : generationTimingProof.status;
  const hostNativeCompletionProof = aggregateHostNativeCompletionProof(sentRounds);
  const hostNativeCompletionStatus = hostNativeCompletionProof.status === 'fail'
    ? 'warning'
    : hostNativeCompletionProof.status;
  const preferredPlayEvidenceCount = sentRounds.filter((round) => round.preferredPlayEvidence !== false).length;
  const nonPreferredPlayEvidenceCount = sentRounds.length - preferredPlayEvidenceCount;
  const perspectiveQualityStatus = nonPreferredPlayEvidenceCount > 0 ? 'warning' : 'pass';
  const perspectiveWarnings = rounds
    .filter((round) => round.perspectiveWarning)
    .map((round) => ({
      scriptMessageId: round.scriptMessageId || null,
      scriptLabel: round.scriptLabel || null,
      scriptCategory: round.scriptCategory || null,
      playerInputPerspective: round.playerInputPerspective || null,
      declaredPlayerInputPerspective: round.declaredPlayerInputPerspective || null,
      perspectiveWarning: round.perspectiveWarning || null,
      textPreview: compact(round.text, 120)
    }));
  const runQualityStatus = narrationQualityStatus === 'warning'
    || sidecarHealthStatus === 'warning'
    || pendingInteractionStatus === 'warning'
    || generationTimingStatus === 'warning'
    || hostNativeCompletionStatus === 'warning'
    || perspectiveQualityStatus === 'warning'
    ? 'warning'
    : 'pass';
  if (FAIL_ON_NARRATION_RECOVERY) {
    assertBrowser(
      narrationQualityStatus === 'pass',
      'Live chat-native campaign had failed narration or open narration recovery events.',
      {
        narrationFailureCount: finalSnapshot.narrationFailureCount,
        openNarrationRecoveryCount: finalSnapshot.openNarrationRecoveryCount,
        recentTurnLedger: finalSnapshot.recentTurnLedger,
        recentRecoveryJournal: finalSnapshot.recentRecoveryJournal
      }
    );
  }
  const finalTranscript = await captureChatTranscript(page, {
    reason: 'run-end',
    scriptMessageId: null,
    scriptCategory: null
  });
  if (finalTranscript) transcriptCaptures.push(finalTranscript);
  const finalPromptInspection = capturePromptInspectionSnapshot(finalSnapshot, {
    reason: 'run-end',
    scriptMessageId: null,
    scriptCategory: null
  });
  if (finalPromptInspection) promptInspectionCaptures.push(finalPromptInspection);
  appendLiveLog({
    kind: 'run-end',
    status: runQualityStatus,
    mode: created.resumed ? 'resume' : 'fresh',
    user: SILLYTAVERN_USER || null,
    packageId: CAMPAIGN_PACKAGE_ID || created.campaign?.packageId || null,
    campaignId: created.campaign?.id || null,
    saveId: created.binding?.saveId || created.resumeSaveId || CHAT_CAMPAIGN_RESUME_SAVE_ID || null,
    chatId: finalSnapshot.currentChatId || created.binding?.chatId || null,
    expectedChatId: created.expectedChatId || CHAT_CAMPAIGN_RESUME_CHAT_ID || null,
    messageScriptSource: messageScript.source,
    plannedMessageCount: messageScript.messages.length,
    hostNativeCompletionRequiredMessages: messageScript.hostNativeCompletionRequiredMessages || [],
    sentMessageCount: sentRoundCount,
    stoppedOnTerminalDecision,
    stoppedOnPendingInteraction,
    finalChatLength: finalSnapshot.chatLength,
    realNonDirectiveAssistantCount: finalSnapshot.nonDirectiveAssistantCount,
    pendingInteractionCount: finalSnapshot.pendingInteractionCount,
    turnLedgerCount: finalSnapshot.turnLedgerCount,
    commandLogCount: finalSnapshot.commandLogCount,
    modelCallCount: finalModelCalls,
    sidecarCount: finalSnapshot.sidecarCount,
    sidecarRejectedCount: finalSnapshot.sidecarRejectedCount,
    initialSidecarRejectedCount,
    sidecarRejectedDelta,
    sidecarStatusCounts: finalSnapshot.sidecarStatusCounts,
    generationTimingProof,
    hostNativeCompletionProof,
    narrationFailureCount: finalSnapshot.narrationFailureCount,
    openNarrationRecoveryCount: finalSnapshot.openNarrationRecoveryCount,
    perspectiveQualityStatus,
    preferredPlayEvidenceCount,
    nonPreferredPlayEvidenceCount,
    perspectiveWarnings,
    recentRecoveryJournal: finalSnapshot.recentRecoveryJournal,
    transcript: finalTranscript,
    promptInspection: finalPromptInspection
  });

  return {
    skipped: false,
    mode: created.resumed ? 'resume' : 'fresh',
    created,
    externalContextFixtureActivation,
    messageScript: {
      source: messageScript.source,
      messageCount: messageScript.messages.length,
      hostNativeCompletionRequiredMessages: messageScript.hostNativeCompletionRequiredMessages || [],
      messages: messageScript.messages.map((message) => ({
        id: message.id,
        turn: message.turn,
        label: message.label,
        category: message.category,
        perspective: message.detectedPerspective || message.perspective,
        declaredPerspective: message.perspective,
        expectedRoute: message.expectedRoute || null,
        expectedResponseStrategy: message.expectedResponseStrategy || null,
        hostNativeCompletionRequired: message.hostNativeCompletionRequired === true,
        preferredPlayEvidence: message.preferredPlayEvidence !== false,
        firstPersonNarrationSuspected: message.firstPersonNarrationSuspected === true,
        perspectiveWarning: message.perspectiveWarning || null,
        textPreview: compact(message.text, 120)
      }))
    },
    messageCount: rounds.length,
    sentMessageCount: sentRoundCount,
    stoppedOnTerminalDecision,
    stoppedOnPendingInteraction,
    qualityStatus: runQualityStatus,
    narrationQualityStatus,
    sidecarHealthStatus,
    pendingInteractionStatus,
    generationTimingStatus,
    generationTimingProof,
    hostNativeCompletionStatus,
    hostNativeCompletionProof,
    perspectiveQualityStatus,
    preferredPlayEvidenceCount,
    nonPreferredPlayEvidenceCount,
    perspectiveWarnings,
    narrationFailureCount: finalSnapshot.narrationFailureCount,
    openNarrationRecoveryCount: finalSnapshot.openNarrationRecoveryCount,
    pendingInteractionCount: finalSnapshot.pendingInteractionCount,
    sidecarRejectedCount: finalSnapshot.sidecarRejectedCount,
    initialSidecarRejectedCount,
    sidecarRejectedDelta,
    sidecarStatusCounts: finalSnapshot.sidecarStatusCounts,
    rounds: rounds.map((round) => ({
      scriptMessageId: round.scriptMessageId || null,
      scriptLabel: round.scriptLabel || null,
      scriptCategory: round.scriptCategory || null,
      playerInputPerspective: round.playerInputPerspective || null,
      declaredPlayerInputPerspective: round.declaredPlayerInputPerspective || null,
      preferredPlayEvidence: round.preferredPlayEvidence !== false,
      firstPersonNarrationSuspected: round.firstPersonNarrationSuspected === true,
      perspectiveWarning: round.perspectiveWarning || null,
      textPreview: compact(round.text, 120),
      resolvesPendingInteraction: round.resolvesPendingInteraction === true,
      assistOnly: round.assistOnly === true,
      skippedSend: round.skippedSend === true,
      assist: round.assist || null,
      promptInspection: round.promptInspection || null,
      transcript: round.transcript || null,
      generationTiming: round.generationTiming || null,
      hostNativeCompletion: round.hostNativeCompletion || null,
      hostNativeCompletionRequirement: round.hostNativeCompletionRequirement || null,
      responseCount: round.after?.tracking?.responseCount ?? null,
      ingressCount: round.after?.tracking?.ingressCount ?? null,
      modelCalls: round.after?.modelCalls || [],
      pendingInteractionCount: round.after?.pendingInteractions?.length || 0,
      turnLedgerCount: round.after?.turnLedgerCount || 0,
      commandLogCount: round.after?.commandLogCount || 0,
      recentMessages: round.after?.recentMessages || []
    })),
    promptInspectionCaptures,
    sidecars,
    batchedSidecarRequired: REQUIRE_BATCHED_SIDECARS,
    batchedSidecarCount: batchedSidecars.length,
    batchedSidecars: batchedSidecars.slice(-8),
    transcriptCaptures,
    final: finalSnapshot
  };
}

async function runMissionBrowserFlow(page) {
  const missionChatRecovery = await recoverMissionCampaignChatSelection(page);
  const beforeSubtab = await panelSnapshot(page);
  const hasMissionSubtabs = beforeSubtab.bodyText && await page.evaluate(() => (
    document.querySelectorAll('#directive-runtime-panel .directive-mission-subtab').length > 0
  ));
  if (!hasMissionSubtabs) {
    const binding = beforeSubtab.runtimeDiagnostics?.viewChatBinding || beforeSubtab.runtimeDiagnostics?.hostBinding || null;
    if (!binding?.chatId) {
      return {
        skipped: true,
        reason: beforeSubtab.noActiveCampaign
          ? 'Mission route reports no active campaign; create or load a campaign before exercising Mission save flow.'
          : 'Mission route has no bound campaign chat yet; chat-native campaign creation must run before Mission save flow.',
        bodyTextExcerpt: beforeSubtab.bodyText.slice(0, 500),
        recovery: missionChatRecovery
      };
    }
  }
  try {
    await selectMissionSubtab(page, 'Active');
  } catch (error) {
    const afterRecovery = await panelSnapshot(page);
    throw new Error(`${error?.message || error}; recovery=${compact({
      missionChatRecovery: {
        attempted: missionChatRecovery?.attempted,
        before: {
          currentChatId: missionChatRecovery?.before?.currentChatId,
          guardReason: missionChatRecovery?.before?.guardReason,
          boundChatId: missionChatRecovery?.before?.boundChatId
        },
        records: {
          currentChatId: missionChatRecovery?.records?.currentChatId,
          guardReason: missionChatRecovery?.records?.guardReason,
          boundChatId: missionChatRecovery?.records?.boundChatId
        }
      },
      afterRecovery: {
        lastClickedBodyButton: afterRecovery.lastClickedBodyButton,
        currentChatId: afterRecovery.runtimeDiagnostics?.hostCurrentChatId || null,
        contextChatOpenMethods: afterRecovery.runtimeDiagnostics?.contextChatOpenMethods || [],
        guardReason: afterRecovery.runtimeDiagnostics?.viewCurrentChatCampaignGuard?.reason || afterRecovery.runtimeDiagnostics?.viewManualSaveGuard?.reason || null,
        boundChatId: afterRecovery.runtimeDiagnostics?.viewCurrentChatCampaignGuard?.boundChatId || afterRecovery.runtimeDiagnostics?.viewManualSaveGuard?.boundChatId || null,
        browserErrors: afterRecovery.browserErrors
      }
    }, 1600)}`);
  }
  const initial = await panelSnapshot(page);
  if (!initial.hasActiveCampaign) {
    return {
      skipped: true,
      reason: initial.noActiveCampaign
        ? 'Mission route reports no active campaign; load or start a campaign to exercise save/save-as.'
        : 'Mission route does not expose the active-campaign surface required for Mission save smoke.',
      controls: {
        buttons: initial.bodyButtons,
        hasTurnInput: initial.hasTurnInput,
        hasSaveAsInput: initial.hasSaveAsInput
      }
    };
  }

  assertBrowser(!initial.hasTurnInput, 'Mission panel should not render the old player action input.', initial);
  assertBrowser(!initial.bodyButtons.includes('Preview Outcome'), 'Mission panel should not expose the old Preview Outcome button.', initial);
  assertBrowser(!initial.bodyButtons.includes('Save Game'), 'Mission panel should not expose Save Game after save controls moved to Campaign Records.', initial);
  assertBrowser(!initial.bodyButtons.includes('Save As'), 'Mission panel should not expose the old Save As button.', initial);
  assertBrowser(!initial.bodyButtons.includes('Save Game As...'), 'Mission panel should not expose Save Game As after save controls moved to Campaign Records.', initial);
  assertBrowser(!initial.hasSaveAsInput, 'Mission panel should not render a Save As Name input.', initial);

  let openedCampaignChatForGuard = false;
  let records = null;
  try {
    await selectCampaignSubtab(page, 'Records');
    records = await panelSnapshot(page);
  } catch (error) {
    if (RUN_BROWSER_SAVE_FLOW) {
      throw error;
    }
    return {
      skipped: false,
      removedMissionPreviewInput: true,
      missionSaveControlsRemoved: true,
      missionChatRecovery,
      saveFlow: {
        skipped: true,
        openedCampaignChatForGuard,
        recordsAvailable: false,
        reason: 'Campaign Records was not present; save-flow assertions require DIRECTIVE_SILLYTAVERN_SAVE_FLOW=1 or a campaign surface exposing Records.',
        error: error?.message || String(error)
      }
    };
  }
  for (const label of ['Save Game', 'Save Game As...', 'Load Save', 'Delete Save']) {
    assertBrowser(records.bodyButtons.includes(label), `Campaign Records is missing "${label}".`, records);
  }
  if (!/Save Check\s*Ready to save/i.test(records.bodyText) && records.bodyButtons.includes('Open Campaign Chat')) {
    assertBrowser(/Choose the campaign chat|Open this save's campaign chat|not linked to this save/i.test(records.saveGuardText), 'Campaign Records save guard was blocked but did not explain how to recover.', {
      saveGuardText: records.saveGuardText,
      bodyButtons: records.bodyButtons,
      bodyTextExcerpt: records.bodyText.slice(0, 700)
    });
    for (const label of ['Save Game', 'Save Game As...']) {
      const detail = records.bodyButtonDetails.find((button) => button.text === label);
      assertBrowser(detail && detail.disabled === true, `Campaign Records "${label}" should be disabled until the bound chat is active.`, {
        saveGuardText: records.saveGuardText,
        saveButtons: records.bodyButtonDetails.filter((button) => ['Save Game', 'Save Game As...'].includes(button.text))
      });
    }
    await clickBodyButton(page, 'Open Campaign Chat');
    await sleep(500);
    await selectCampaignSubtab(page, 'Records');
    records = await panelSnapshot(page);
    openedCampaignChatForGuard = true;
  }
  assertBrowser(/Save Check\s*Ready to save/i.test(records.bodyText), 'Campaign Records did not show the ready save guard.', {
    saveGuardText: records.saveGuardText,
    saveButtons: records.bodyButtonDetails.filter((button) => ['Save Game', 'Save Game As...'].includes(button.text)),
    headings: records.headings,
    bodyTextExcerpt: records.bodyText.slice(0, 700),
    browserErrors: records.browserErrors
  });
  for (const label of ['Save Game', 'Save Game As...']) {
    const detail = records.bodyButtonDetails.find((button) => button.text === label);
    assertBrowser(detail && detail.disabled === false, `Campaign Records "${label}" should be enabled when the bound chat is active.`, records);
  }
  assertBrowser(!records.hasSaveAsInput, 'Campaign Records should not render Save As Name before Save Game As is clicked.', records);

  let saveFlow;
  if (RUN_BROWSER_SAVE_FLOW) {
    await clickBodyButton(page, 'Save Game');
    await waitForBodyButtonEnabled(page, 'Save Game');

    const saveAsName = `Directive Live Smoke ${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const sourceBindingBeforeSaveAs = await currentDirectiveChatBinding(page);
    await clickBodyButton(page, 'Save Game As...');
    await page.locator('.directive-record-save-as-name-input').first().fill(saveAsName);
    await page.locator('.directive-record-save-as-dialog').getByRole('button', {
      name: 'Save',
      exact: true
    }).click({ timeout: BROWSER_TIMEOUT_MS });
    await page.waitForFunction(() => !document.querySelector('.directive-record-save-as-dialog'), null, {
      timeout: BROWSER_TIMEOUT_MS
    });
    const saved = await panelSnapshot(page);
    const branchLoad = await verifySaveAsBranchReselect(page, saveAsName, sourceBindingBeforeSaveAs);
    saveFlow = {
      skipped: false,
      openedCampaignChatForGuard,
      saveGame: true,
      saveAs: true,
      saveAsNamePrefix: 'Directive Live Smoke',
      routeStillCampaign: saved.selectedRouteId === ROUTE_IDS.Campaign,
      branchLoad
    };
  } else {
    saveFlow = {
      skipped: true,
      openedCampaignChatForGuard,
      reason: 'DIRECTIVE_SILLYTAVERN_SAVE_FLOW=1 not set; Campaign Records save buttons were verified but not clicked.'
    };
  }

  return {
    skipped: false,
    removedMissionPreviewInput: true,
    missionSaveControlsRemoved: true,
    missionChatRecovery,
    saveFlow
  };
}

function screenshotViewports() {
  return [
    {
      id: 'desktop',
      width: 1280,
      height: 900
    },
    {
      id: 'phone',
      width: 390,
      height: 844
    }
  ];
}

function slugPart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'route';
}

function screenshotRunDirectory() {
  return path.resolve(SCREENSHOT_BASE_DIR, SCREENSHOT_RUN_ID);
}

async function setBrowserViewport(page, viewport) {
  if (typeof page.setViewportSize === 'function') {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height
    });
  }
  await sleep(250);
}

async function capturePageScreenshot(page, filePath) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  }));
  await sleep(150);
  const bytes = await page.screenshot({
    path: filePath,
    fullPage: false
  });
  if (Buffer.isBuffer(bytes)) {
    return bytes.length;
  }
  return fs.statSync(filePath).size;
}

async function directiveLayoutSnapshot(page) {
  return page.evaluate(() => {
    const normalizeRect = (rect) => ({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left)
    });
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const spine = panel?.querySelector('.directive-command-spine') || null;
    const drawer = panel?.querySelector('.directive-command-drawer') || null;
    const header = drawer?.querySelector('.directive-command-drawer-header') || null;
    const body = drawer?.querySelector('[data-directive-runtime-body="true"]') || null;
    const mobileBottomBar = drawer?.querySelector('.directive-mobile-bottom-bar') || null;
    const leftResizeHandle = drawer?.querySelector('[data-directive-drawer-resize-handle="true"][data-directive-drawer-resize-edge="left"]') || null;
    const rightResizeHandle = drawer?.querySelector('[data-directive-drawer-resize-handle="true"][data-directive-drawer-resize-edge="right"]') || null;
    const isVisible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const desktopRouteButtons = Array.from(panel?.querySelectorAll('.directive-spine-route') || []).filter(isVisible);
    const mobileRouteButtons = Array.from(panel?.querySelectorAll('.directive-mobile-bottom-tab') || []).filter(isVisible);
    const routeButtons = mobileRouteButtons.length > 0 ? mobileRouteButtons : desktopRouteButtons;
    const selected = routeButtons.find((button) => button.getAttribute('aria-selected') === 'true')
      || routeButtons.find((button) => button.getAttribute('aria-current') === 'page');
    const routeRects = routeButtons.map((button) => ({
      routeId: button.dataset.routeId || button.dataset.mobileRouteId || button.dataset.tab || '',
      text: normalize(
        button.querySelector('.directive-spine-route-label, .directive-mobile-bottom-label')?.textContent
        || button.getAttribute('aria-label')
        || button.textContent
      ),
      rect: normalizeRect(button.getBoundingClientRect()),
      disabled: button.disabled === true,
      ariaSelected: button.getAttribute('aria-selected') === 'true'
    }));
    const panelStyle = panel ? getComputedStyle(panel) : null;
    const spineStyle = spine ? getComputedStyle(spine) : null;
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      panel: Boolean(panel),
      commandSpine: panel?.dataset.directiveShell === 'command-spine' || panel?.classList.contains('directive-command-spine-shell'),
      hidden: panel?.hidden === true,
      drawerOpen: panel?.dataset.drawerOpen === 'true' && isVisible(drawer),
      fullscreen: panel?.dataset.fullscreen === 'true',
      spineMode: panel?.dataset.spineMode || '',
      drawerDensity: panel?.dataset.drawerDensity || '',
      panelRect: panel ? normalizeRect(panel.getBoundingClientRect()) : null,
      spineRect: spine ? normalizeRect(spine.getBoundingClientRect()) : null,
      computed: {
        panelWidth: panelStyle?.width || '',
        panelPaddingLeft: panelStyle?.paddingLeft || '',
        panelPaddingRight: panelStyle?.paddingRight || '',
        panelBoxSizing: panelStyle?.boxSizing || '',
        spineWidth: spineStyle?.width || '',
        spineMinWidth: spineStyle?.minWidth || '',
        spinePaddingLeft: spineStyle?.paddingLeft || '',
        spinePaddingRight: spineStyle?.paddingRight || '',
        spineBoxSizing: spineStyle?.boxSizing || '',
        spineVar: panelStyle?.getPropertyValue('--directive-spine-width').trim() || ''
      },
      drawerRect: drawer ? normalizeRect(drawer.getBoundingClientRect()) : null,
      headerRect: header ? normalizeRect(header.getBoundingClientRect()) : null,
      bodyRect: body ? normalizeRect(body.getBoundingClientRect()) : null,
      mobileBottomBarRect: mobileBottomBar ? normalizeRect(mobileBottomBar.getBoundingClientRect()) : null,
      mobileBottomBarVisible: isVisible(mobileBottomBar),
      leftResizeHandleRect: leftResizeHandle ? normalizeRect(leftResizeHandle.getBoundingClientRect()) : null,
      rightResizeHandleRect: rightResizeHandle ? normalizeRect(rightResizeHandle.getBoundingClientRect()) : null,
      leftResizeHandleVisible: isVisible(leftResizeHandle),
      rightResizeHandleVisible: isVisible(rightResizeHandle),
      resizeHandleVisible: isVisible(rightResizeHandle),
      drawerActionsVisible: isVisible(panel?.querySelector('[data-directive-shell-actions="drawer-header"]')),
      routeRects,
      selectedRouteId: selected?.dataset.routeId || selected?.dataset.mobileRouteId || selected?.dataset.tab || null,
      bodyTextLength: normalize(body?.textContent || '').length
    };
  });
}

function assertDirectiveLayout(layout, {
  routeId,
  viewportId
}) {
  assertBrowser(layout.panel, `${viewportId} screenshot layout missing Directive panel.`, layout);
  assertBrowser(layout.commandSpine, `${viewportId} screenshot layout is not using the command-spine shell.`, layout);
  assertBrowser(layout.hidden !== true, `${viewportId} screenshot layout panel is hidden.`, layout);
  assertBrowser(layout.drawerOpen, `${viewportId} screenshot layout drawer is not open.`, layout);
  assertBrowser(layout.bodyTextLength > 10, `${viewportId} screenshot layout body appears blank.`, layout);
  assertBrowser(layout.selectedRouteId === routeId, `${viewportId} screenshot layout selected the wrong route.`, layout);
  assertBrowser(layout.routeRects.length === REQUIRED_ROUTES.length, `${viewportId} screenshot layout route count mismatch.`, layout);

  const viewport = layout.viewport || {};
  const spine = layout.spineRect || {};
  const drawer = layout.drawerRect || {};
  const header = layout.headerRect || {};
  const body = layout.bodyRect || {};
  const mobileBottomBar = layout.mobileBottomBarRect || {};
  const rightResizeHandle = layout.rightResizeHandleRect || {};

  assertBrowser(drawer.width > 280, `${viewportId} screenshot layout drawer is too narrow.`, layout);
  assertBrowser(drawer.height > 360, `${viewportId} screenshot layout drawer is too short.`, layout);
  assertBrowser(drawer.left >= -1 && drawer.top >= -1, `${viewportId} screenshot layout drawer starts outside the viewport.`, layout);
  assertBrowser(drawer.right <= viewport.width + 1, `${viewportId} screenshot layout drawer overflows the viewport horizontally.`, layout);
  assertBrowser(drawer.bottom <= viewport.height + 1, `${viewportId} screenshot layout drawer overflows the viewport vertically.`, layout);
  assertBrowser(body.height > 120, `${viewportId} screenshot layout body is collapsed.`, layout);
  assertBrowser(header.height > 36, `${viewportId} screenshot layout drawer header is collapsed.`, layout);
  assertBrowser(body.top >= header.bottom - 2, `${viewportId} screenshot layout body overlaps the drawer header.`, layout);

  if (layout.mobileBottomBarVisible) {
    assertBrowser(drawer.width >= viewport.width - 2, `${viewportId} phone drawer does not fill the viewport width.`, layout);
    assertBrowser(drawer.height >= viewport.height - 2, `${viewportId} phone drawer does not fill the viewport height.`, layout);
    assertBrowser(mobileBottomBar.height > 40, `${viewportId} screenshot layout bottom navigation is collapsed.`, layout);
    assertBrowser(body.bottom <= mobileBottomBar.top + 2, `${viewportId} screenshot layout body overlaps the bottom navigation.`, layout);
    assertBrowser(!layout.leftResizeHandleVisible && !layout.rightResizeHandleVisible, `${viewportId} phone layout should hide the drawer resize handle.`, layout);
  } else {
    assertBrowser(spine.width >= 50 && spine.width <= 220, `${viewportId} screenshot layout command spine width is invalid.`, layout);
    assertBrowser(spine.height > 360, `${viewportId} screenshot layout command spine is too short.`, layout);
    assertBrowser(spine.left >= -1 && spine.left <= 40, `${viewportId} screenshot layout command spine is not left anchored.`, layout);
    assertBrowser(spine.right <= drawer.left + 2, `${viewportId} screenshot layout drawer overlaps the command spine.`, layout);
    assertBrowser(layout.drawerActionsVisible, `${viewportId} screenshot layout drawer actions are not visible.`, layout);
    assertBrowser(!layout.leftResizeHandleVisible, `${viewportId} screenshot layout should not expose a left resize handle.`, layout);
    assertBrowser(layout.rightResizeHandleVisible, `${viewportId} screenshot layout right resize handle is not visible.`, layout);
    assertBrowser(Math.abs(rightResizeHandle.right - drawer.right) <= 4, `${viewportId} right resize handle is not on the drawer's right edge.`, layout);
    assertBrowser(Math.abs(rightResizeHandle.bottom - drawer.bottom) <= 4, `${viewportId} right resize handle is not on the drawer's bottom edge.`, layout);
  }

  for (const route of layout.routeRects) {
    assertBrowser(route.rect.width >= 32, `${viewportId} screenshot layout route "${route.text}" is too narrow.`, layout);
    assertBrowser(route.rect.height >= 24, `${viewportId} screenshot layout route "${route.text}" is too short.`, layout);
    if (layout.mobileBottomBarVisible) {
      assertBrowser(route.rect.top >= mobileBottomBar.top - 1 && route.rect.bottom <= mobileBottomBar.bottom + 1, `${viewportId} screenshot layout route "${route.text}" escapes the bottom navigation.`, layout);
    } else {
      assertBrowser(route.rect.left >= spine.left - 1 && route.rect.right <= spine.right + 3, `${viewportId} screenshot layout route "${route.text}" escapes the command spine.`, layout);
      assertBrowser(route.rect.top >= spine.top - 1 && route.rect.bottom <= spine.bottom + 1, `${viewportId} screenshot layout route "${route.text}" escapes the command spine vertically.`, layout);
    }
  }
}

async function resetDirectiveRuntimeLayout(page) {
  await page.evaluate(async () => {
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') {
      await globalThis.Directive.bridge.runAction('runtime.resetLayout');
      return true;
    }
    if (typeof globalThis.Directive?.actions?.run === 'function') {
      await globalThis.Directive.actions.run('runtime.resetLayout');
      return true;
    }
    return false;
  });
  await sleep(250);
}

async function dragBrowserPointer(page, start, end) {
  if (page.mouse && typeof page.mouse.move === 'function') {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    return;
  }
  if (page.connection && typeof page.connection.send === 'function') {
    await page.connection.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: start.x,
      y: start.y,
      button: 'none'
    });
    await page.connection.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: start.x,
      y: start.y,
      button: 'left',
      buttons: 1,
      clickCount: 1
    });
    for (let step = 1; step <= 8; step += 1) {
      const progress = step / 8;
      await page.connection.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(start.x + ((end.x - start.x) * progress)),
        y: Math.round(start.y + ((end.y - start.y) * progress)),
        button: 'left',
        buttons: 1
      });
    }
    await page.connection.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: end.x,
      y: end.y,
      button: 'left',
      buttons: 0,
      clickCount: 1
    });
    return;
  }
  throw new Error('Browser driver cannot dispatch a pointer drag.');
}

async function dispatchDomMouseDrag(page, start, end) {
  return page.evaluate(({ startPoint, endPoint }) => {
    const target = document.elementFromPoint(startPoint.x, startPoint.y)
      || document.querySelector('[data-directive-drawer-resize-handle="true"][data-directive-drawer-resize-edge="right"]')
      || document.querySelector('[data-directive-drawer-resize-handle="true"]');
    if (!target) return { ok: false, reason: 'resize-handle-not-found' };
    const eventInit = (point, buttons = 1) => ({
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: point.x,
      clientY: point.y,
      screenX: point.x,
      screenY: point.y,
      button: 0,
      buttons
    });
    target.dispatchEvent(new MouseEvent('mousedown', eventInit(startPoint, 1)));
    for (let step = 1; step <= 8; step += 1) {
      const progress = step / 8;
      document.dispatchEvent(new MouseEvent('mousemove', eventInit({
        x: Math.round(startPoint.x + ((endPoint.x - startPoint.x) * progress)),
        y: Math.round(startPoint.y + ((endPoint.y - startPoint.y) * progress))
      }, 1)));
    }
    document.dispatchEvent(new MouseEvent('mouseup', eventInit(endPoint, 0)));
    return {
      ok: true,
      targetClass: target.className || '',
      targetTag: target.tagName || ''
    };
  }, {
    startPoint: start,
    endPoint: end
  });
}

async function runDrawerResizeDragSmoke(page) {
  const desktopViewport = screenshotViewports().find((viewport) => viewport.id === 'desktop') || screenshotViewports()[0];
  await setBrowserViewport(page, desktopViewport);
  await openDirectivePanel(page);
  await resetDirectiveRuntimeLayout(page);
  await openDirectivePanel(page);
  await navigateDirectiveRoute(page, 'Mission');

  const before = await directiveLayoutSnapshot(page);
  assertBrowser(before.rightResizeHandleVisible, 'Desktop drawer resize drag smoke could not see the right resize handle.', before);
  const handle = before.rightResizeHandleRect || {};
  const drawer = before.drawerRect || {};
  const start = {
    x: Math.max(handle.left + 4, handle.right - 8),
    y: Math.max(handle.top + 4, handle.bottom - 8)
  };
  const end = {
    x: start.x + 88,
    y: start.y + 52
  };
  const shellMargin = 16;
  const maxConstrainedHeight = Math.max(drawer.height, (before.viewport?.height || 0) - drawer.top - shellMargin);
  const requiredWidthGrowth = 40;
  const requiredHeightGrowth = Math.min(24, Math.max(0, maxConstrainedHeight - drawer.height));

  const waitForGrowth = () => page.waitForFunction((initial) => {
    const activeDrawer = document.querySelector('.directive-command-drawer');
    if (!activeDrawer) return false;
    const rect = activeDrawer.getBoundingClientRect();
    return rect.width >= initial.width + initial.requiredWidthGrowth
      && rect.height >= initial.height + initial.requiredHeightGrowth;
  }, {
    width: drawer.width,
    height: drawer.height,
    requiredWidthGrowth,
    requiredHeightGrowth
  }, {
    timeout: BROWSER_TIMEOUT_MS
  });

  try {
    await dragBrowserPointer(page, start, end);
    try {
      await waitForGrowth();
    } catch (nativeError) {
      const domDrag = await dispatchDomMouseDrag(page, start, end);
      try {
        await waitForGrowth();
      } catch (domError) {
        const afterFailure = await directiveLayoutSnapshot(page);
        const error = new Error(`Drawer resize drag did not grow after native and DOM drag attempts: ${domError?.message || domError}`);
        error.details = {
          nativeError: nativeError?.message || String(nativeError),
          domDrag,
          before,
          after: afterFailure
        };
        throw error;
      }
    }
    const after = await directiveLayoutSnapshot(page);
    assertBrowser(after.drawerRect.width >= drawer.width + requiredWidthGrowth, 'Bottom-right resize drag did not grow drawer width.', { before, after });
    assertBrowser(after.drawerRect.height >= drawer.height + requiredHeightGrowth, 'Bottom-right resize drag did not respect drawer height growth constraints.', {
      requiredHeightGrowth,
      maxConstrainedHeight,
      before,
      after
    });
    assertBrowser(Math.abs(after.spineRect.width - before.spineRect.width) <= 2, 'Drawer resize should not change the command shelf width.', { before, after });
    assertBrowser(Math.abs(after.spineRect.height - before.spineRect.height) <= 2, 'Drawer resize should not change the command shelf height.', { before, after });
    return {
      skipped: false,
      handle: 'right',
      before: {
        width: drawer.width,
        height: drawer.height,
        requiredHeightGrowth,
        shelfWidth: before.spineRect.width,
        shelfHeight: before.spineRect.height
      },
      after: {
        width: after.drawerRect.width,
        height: after.drawerRect.height,
        shelfWidth: after.spineRect.width,
        shelfHeight: after.spineRect.height
      }
    };
  } finally {
    await resetDirectiveRuntimeLayout(page);
    await openDirectivePanel(page);
  }
}

async function runExpandedSpineSmoke(page) {
  const desktopViewport = screenshotViewports().find((viewport) => viewport.id === 'desktop') || screenshotViewports()[0];
  await setBrowserViewport(page, desktopViewport);
  await openDirectivePanel(page);
  await resetDirectiveRuntimeLayout(page);
  await openDirectivePanel(page);
  await navigateDirectiveRoute(page, 'Campaign');

  const clicked = await page.evaluate(() => {
    const control = document.querySelector('.directive-command-spine-shell [data-shell-action="density"]');
    if (!control) return false;
    control.click();
    return true;
  });
  assertBrowser(clicked, 'Expanded shelf smoke could not find the shelf density control.');
  await page.waitForFunction(() => {
    const panel = document.querySelector('.directive-command-spine-shell');
    const spine = panel?.querySelector('.directive-command-spine');
    const panelRect = panel?.getBoundingClientRect();
    const spineRect = spine?.getBoundingClientRect();
    return panel?.dataset.spineMode === 'expanded'
      && panel.querySelector('.directive-spine-route-copy')
      && getComputedStyle(panel.querySelector('.directive-spine-route-copy')).display !== 'none'
      && spineRect?.width >= 160
      && Math.abs(spineRect.width - panelRect.width) <= 2;
  }, null, {
    timeout: BROWSER_TIMEOUT_MS
  });

  const layout = await directiveLayoutSnapshot(page);
  assertBrowser(layout.spineMode === 'expanded', 'Expanded shelf smoke did not enter expanded spine mode.', layout);
  assertBrowser(layout.panelRect.width >= 171 && layout.panelRect.width <= 177, 'Expanded shelf panel width should fit the wide brand logo target.', layout);
  assertBrowser(layout.spineRect.width >= 160 && layout.spineRect.width <= layout.panelRect.width, 'Expanded inner shelf width should stay within the panel box.', layout);
  assertBrowser(layout.spineRect.height >= 398 && layout.spineRect.height <= 402, 'Expanded shelf height should remain the reduced shelf target.', layout);
  assertBrowser(layout.drawerRect.left >= layout.spineRect.right + 8, 'Expanded shelf should not overlap the command drawer.', layout);

  const labelDiagnostics = await page.evaluate(() => {
    const rect = (element) => {
      const box = element?.getBoundingClientRect?.();
      if (!box) {
        return {
          width: 0,
          height: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        };
      }
      return {
        width: Math.round(box.width),
        height: Math.round(box.height),
        top: Math.round(box.top),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
        left: Math.round(box.left)
      };
    };
    const readableLineHeight = (element) => {
      const style = getComputedStyle(element);
      return Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) || 0;
    };
    return Array.from(document.querySelectorAll('.directive-command-spine-shell .directive-spine-route')).map((route) => {
      const copy = route.querySelector('.directive-spine-route-copy');
      const label = route.querySelector('.directive-spine-route-label');
      const detail = route.querySelector('.directive-spine-route-detail');
      const routeRect = rect(route);
      const copyRect = rect(copy);
      const labelRect = rect(label);
      const detailRect = rect(detail);
      const labelStyle = label ? getComputedStyle(label) : null;
      const detailStyle = detail ? getComputedStyle(detail) : null;
      return {
        route: route.dataset.routeId || '',
        text: String(label?.textContent || '').trim(),
        copyVisible: copyRect.width > 0 && copyRect.height > 0,
        copyInsideRoute: copyRect.left >= routeRect.left - 1 && copyRect.right <= routeRect.right + 1,
        labelWhiteSpace: labelStyle?.whiteSpace || '',
        detailWhiteSpace: detailStyle?.whiteSpace || '',
        labelHeight: labelRect.height,
        labelLineHeight: readableLineHeight(label),
        detailHeight: detailRect.height,
        detailLineHeight: readableLineHeight(detail),
        labelOverlapsDetail: labelRect.bottom > detailRect.top + 1,
        labelRect,
        detailRect,
        routeRect
      };
    });
  });

  assertBrowser(labelDiagnostics.length === REQUIRED_ROUTES.length, 'Expanded shelf route label count mismatch.', labelDiagnostics);
  for (const route of labelDiagnostics) {
    assertBrowser(route.copyVisible, `Expanded shelf route "${route.text}" label copy is hidden.`, route);
    assertBrowser(route.copyInsideRoute, `Expanded shelf route "${route.text}" label copy escapes its route.`, route);
    assertBrowser(route.labelWhiteSpace === 'nowrap', `Expanded shelf route "${route.text}" label can wrap.`, route);
    assertBrowser(route.detailWhiteSpace === 'nowrap', `Expanded shelf route "${route.text}" detail can wrap.`, route);
    assertBrowser(route.labelHeight <= Math.ceil(route.labelLineHeight * 1.35) + 2, `Expanded shelf route "${route.text}" label appears multi-line.`, route);
    assertBrowser(route.detailHeight <= Math.ceil(route.detailLineHeight * 1.35) + 2, `Expanded shelf route "${route.text}" detail appears multi-line.`, route);
    assertBrowser(!route.labelOverlapsDetail, `Expanded shelf route "${route.text}" label overlaps its detail.`, route);
  }

  let screenshotPath = null;
  if (RUN_SCREENSHOTS) {
    const runDir = screenshotRunDirectory();
    fs.mkdirSync(runDir, { recursive: true });
    screenshotPath = path.join(runDir, 'expanded-spine-campaign.png');
    await capturePageScreenshot(page, screenshotPath);
  }

  try {
    await resetDirectiveRuntimeLayout(page);
    await openDirectivePanel(page);
  } catch {
    // The rest of the smoke suite constrains layout again before each probe.
  }

  return {
    spineMode: layout.spineMode,
    shelfWidth: layout.spineRect.width,
    shelfHeight: layout.spineRect.height,
    drawerLeft: layout.drawerRect.left,
    routeLabels: labelDiagnostics.map((route) => route.text),
    screenshotPath
  };
}

function drawerResizeSweepSizes() {
  return [
    { id: 'compact', width: 460, height: 560 },
    { id: 'standard', width: 720, height: 660 },
    { id: 'wide', width: 980, height: 640 }
  ];
}

function drawerScrollPositions() {
  return [
    { id: 'top', ratio: 0 },
    { id: 'middle', ratio: 0.5 },
    { id: 'bottom', ratio: 1 }
  ];
}

async function resizeDrawerTo(page, target) {
  const before = await directiveLayoutSnapshot(page);
  assertBrowser(before.rightResizeHandleVisible, `Resize sweep could not see the right handle for ${target.id}.`, before);
  const handle = before.rightResizeHandleRect || {};
  const drawer = before.drawerRect || {};
  const start = {
    x: Math.max(handle.left + 4, handle.right - 8),
    y: Math.max(handle.top + 4, handle.bottom - 8)
  };
  const end = {
    x: start.x + (target.width - drawer.width),
    y: start.y + (target.height - drawer.height)
  };
  await dragBrowserPointer(page, start, end);
  const waitForTarget = () => page.waitForFunction((expected) => {
    const activeDrawer = document.querySelector('.directive-command-drawer');
    if (!activeDrawer) return false;
    const rect = activeDrawer.getBoundingClientRect();
    return Math.abs(rect.width - expected.width) <= expected.tolerance
      && Math.abs(rect.height - expected.height) <= expected.tolerance;
  }, {
    width: target.width,
    height: target.height,
    tolerance: 34
  }, {
    timeout: BROWSER_TIMEOUT_MS
  });
  await waitForTarget().catch(async () => {
    await dispatchDomMouseDrag(page, start, end);
    await waitForTarget().catch(() => {});
  });
  const after = await directiveLayoutSnapshot(page);
  assertBrowser(Math.abs(after.drawerRect.width - target.width) <= 42, `Resize sweep drawer width missed ${target.id} target.`, { target, before, after });
  assertBrowser(Math.abs(after.drawerRect.height - target.height) <= 42, `Resize sweep drawer height missed ${target.id} target.`, { target, before, after });
  assertBrowser(Math.abs(after.spineRect.width - before.spineRect.width) <= 2, `Resize sweep changed shelf width for ${target.id}.`, { target, before, after });
  assertBrowser(Math.abs(after.spineRect.height - before.spineRect.height) <= 2, `Resize sweep changed shelf height for ${target.id}.`, { target, before, after });
  return after;
}

async function setDrawerScrollPosition(page, scrollPosition) {
  const metrics = await page.evaluate((position) => {
    const body = document.querySelector('[data-directive-runtime-body="true"]');
    if (!body) return null;
    const maxScroll = Math.max(0, body.scrollHeight - body.clientHeight);
    body.scrollTop = Math.round(maxScroll * position.ratio);
    return {
      scrollTop: body.scrollTop,
      maxScroll,
      clientHeight: body.clientHeight,
      scrollHeight: body.scrollHeight
    };
  }, scrollPosition);
  await sleep(120);
  return metrics;
}

async function routeVisualDiagnostics(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const rectData = (rect) => ({
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    });
    const body = document.querySelector('[data-directive-runtime-body="true"]');
    const bodyRect = body?.getBoundingClientRect();
    const intersectRect = (a, b) => {
      const left = Math.max(a.left, b.left);
      const top = Math.max(a.top, b.top);
      const right = Math.min(a.right, b.right);
      const bottom = Math.min(a.bottom, b.bottom);
      return {
        left,
        top,
        right,
        bottom,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top)
      };
    };
    const clipsOverflow = (element) => {
      const style = getComputedStyle(element);
      return /(auto|scroll|hidden|clip)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`);
    };
    const visibleRectFor = (element) => {
      if (!element || !body?.contains(element) || !bodyRect) return null;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      let visibleRect = intersectRect(rect, bodyRect);
      for (let ancestor = element.parentElement; ancestor && body.contains(ancestor); ancestor = ancestor.parentElement) {
        const ancestorStyle = getComputedStyle(ancestor);
        if (ancestorStyle.display === 'none' || ancestorStyle.visibility === 'hidden') return null;
        if (clipsOverflow(ancestor)) {
          visibleRect = intersectRect(visibleRect, ancestor.getBoundingClientRect());
        }
        if (visibleRect.width <= 1 || visibleRect.height <= 1) return null;
        if (ancestor === body) break;
      }
      return visibleRect.width > 1 && visibleRect.height > 1 ? visibleRect : null;
    };
    const isVisible = (element) => Boolean(visibleRectFor(element));
    const labelSelector = [
      '.directive-card-title',
      '.directive-crew-name',
      '.directive-crew-rank',
      '.directive-crew-billet',
      '.directive-crew-row-status',
      '.directive-lcars-status-label',
      '.directive-lcars-status-value',
      '.directive-settings-action-title',
      '.directive-settings-overview-label',
      '.directive-ship-hero-title',
      '.directive-ship-hero-subtitle',
      '.directive-log-entry-identity .directive-card-title'
    ].join(',');
    const sectionSelector = [
      '.directive-lcars-panel',
      '.directive-card',
      '.directive-lcars-status-block',
      '.directive-settings-overview-tile',
      '.directive-settings-action-tile',
      '.directive-crew-roster-row',
      '.directive-log-entry-card',
      '.directive-campaign-package-card'
    ].join(',');
    const mediaSelector = [
      '.directive-media-frame',
      '.directive-media-image',
      '.directive-crew-detail-portrait',
      '.directive-ship-hero-media',
      '.directive-campaign-package-visual'
    ].join(',');
    const labelWraps = Array.from(body?.querySelectorAll(labelSelector) || [])
      .filter(isVisible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2 || 16;
        const lines = Math.round(rect.height / lineHeight);
        return {
          selector: element.className || element.tagName,
          text: normalize(element.textContent).slice(0, 80),
          lines,
          rect: rectData(rect)
        };
      })
      .filter((item) => item.text.length > 0 && item.text.length <= 48 && item.lines > 2)
      .slice(0, 12);
    const horizontalOverflow = Array.from(body?.querySelectorAll('*') || [])
      .filter(isVisible)
      .filter((element) => element.scrollWidth > element.clientWidth + 3)
      .filter((element) => {
        const style = getComputedStyle(element);
        const clipsInline = /(hidden|clip)/.test(`${style.overflowX} ${style.overflow}`);
        return !(clipsInline && style.textOverflow === 'ellipsis');
      })
      .map((element) => ({
        selector: element.className || element.tagName,
        text: normalize(element.textContent).slice(0, 80),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        rect: rectData(element.getBoundingClientRect())
      }))
      .filter((item) => item.clientWidth > 28)
      .slice(0, 12);
    const tinySections = Array.from(body?.querySelectorAll(sectionSelector) || [])
      .filter(isVisible)
      .map((element) => {
        return {
          selector: element.className || element.tagName,
          text: normalize(element.textContent).slice(0, 80),
          rect: rectData(element.getBoundingClientRect())
        };
      })
      .filter((item) => item.rect.width < 150 || item.rect.height < 28)
      .slice(0, 12);
    const mediaBounds = Array.from(body?.querySelectorAll(mediaSelector) || [])
      .filter(isVisible)
      .map((element) => {
        const panelBackdrop = element.matches('.directive-starship-command-backdrop, .directive-starship-command-backdrop-image')
          || Boolean(element.closest('.directive-starship-command-backdrop'));
        const largeMedia = !panelBackdrop && (
          element.matches('.directive-crew-detail-portrait, .directive-ship-hero-media, .directive-campaign-package-visual')
          || (element.matches('.directive-media-frame, .directive-media-image')
            && !element.closest('.directive-crew-roster-row, .directive-ship-command-officer'))
        );
        return {
          selector: element.className || element.tagName,
          largeMedia,
          rect: rectData(element.getBoundingClientRect())
        };
      })
      .filter((item) => item.largeMedia && (item.rect.height > 540 || item.rect.width < 120))
      .slice(0, 12);
    const boxes = Array.from(body?.querySelectorAll(sectionSelector) || [])
      .filter(isVisible)
      .map((element) => ({ element, rect: visibleRectFor(element), selector: element.className || element.tagName }))
      .filter((item) => item.rect.width > 24 && item.rect.height > 24);
    const overlaps = [];
    for (let index = 0; index < boxes.length; index += 1) {
      for (let next = index + 1; next < boxes.length; next += 1) {
        const a = boxes[index];
        const b = boxes[next];
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        const xOverlap = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const yOverlap = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (xOverlap > 8 && yOverlap > 8) {
          overlaps.push({
            a: a.selector,
            b: b.selector,
            overlap: {
              width: Math.round(xOverlap),
              height: Math.round(yOverlap)
            },
            aRect: rectData(a.rect),
            bRect: rectData(b.rect)
          });
        }
        if (overlaps.length >= 8) break;
      }
      if (overlaps.length >= 8) break;
    }
    return {
      body: body ? {
        rect: rectData(body.getBoundingClientRect()),
        scrollTop: body.scrollTop,
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight
      } : null,
      labelWraps,
      horizontalOverflow,
      tinySections,
      mediaBounds,
      overlaps
    };
  });
}

function assertRouteVisualDiagnostics(diagnostics, context) {
  assertBrowser(diagnostics?.body, `Resize sweep missing drawer body for ${context}.`, diagnostics);
  assertBrowser(diagnostics.horizontalOverflow.length === 0, `Resize sweep found horizontal overflow for ${context}.`, diagnostics);
  assertBrowser(diagnostics.overlaps.length === 0, `Resize sweep found overlapping sections for ${context}.`, diagnostics);
  assertBrowser(diagnostics.tinySections.length === 0, `Resize sweep found squished sections for ${context}.`, diagnostics);
  assertBrowser(diagnostics.mediaBounds.length === 0, `Resize sweep found uncontrolled media sizing for ${context}.`, diagnostics);
  assertBrowser(diagnostics.labelWraps.length === 0, `Resize sweep found overly wrapped short labels for ${context}.`, diagnostics);
}

async function runDrawerResizeSweepSmoke(page) {
  if (!RUN_RESIZE_SWEEP) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_RESIZE_SWEEP=1 not set'
    };
  }

  const desktopViewport = screenshotViewports().find((viewport) => viewport.id === 'desktop') || screenshotViewports()[0];
  const outputDir = path.join(screenshotRunDirectory(), 'resize-sweep');
  fs.mkdirSync(outputDir, { recursive: true });
  await setBrowserViewport(page, desktopViewport);
  await openDirectivePanel(page);
  const captures = [];
  const diagnostics = [];
  let currentContext = 'resize-sweep/start';

  try {
    for (const size of drawerResizeSweepSizes()) {
      currentContext = `${size.id}/reset`;
      await resetDirectiveRuntimeLayout(page);
      currentContext = `${size.id}/open`;
      await openDirectivePanel(page);
      currentContext = `${size.id}/Mission/prepare`;
      await navigateDirectiveRoute(page, 'Mission');
      currentContext = `${size.id}/resize`;
      const sizeLayout = await resizeDrawerTo(page, size);
      for (const label of REQUIRED_ROUTES) {
        currentContext = `${size.id}/${label}/navigate`;
        const navigation = await navigateDirectiveRoute(page, label);
        for (const scrollPosition of drawerScrollPositions()) {
          currentContext = `${size.id}/${label}/${scrollPosition.id}`;
          const scrollMetrics = await setDrawerScrollPosition(page, scrollPosition);
          const layout = await directiveLayoutSnapshot(page);
          assertDirectiveLayout(layout, {
            routeId: navigation.routeId,
            viewportId: `resize-${size.id}-${scrollPosition.id}`
          });
          const routeDiagnostics = await routeVisualDiagnostics(page);
          const context = `${size.id}/${label}/${scrollPosition.id}`;
          assertRouteVisualDiagnostics(routeDiagnostics, context);
          const filePath = path.join(outputDir, `${size.id}-${slugPart(label)}-${scrollPosition.id}.png`);
          const bytes = await capturePageScreenshot(page, filePath);
          assertBrowser(bytes > 2500, `Resize sweep screenshot for ${context} was too small to prove a rendered UI.`, {
            filePath,
            bytes
          });
          captures.push({
            size: size.id,
            route: label,
            routeId: navigation.routeId,
            scroll: scrollPosition.id,
            filePath,
            bytes
          });
          diagnostics.push({
            size: size.id,
            route: label,
            routeId: navigation.routeId,
            scroll: scrollPosition.id,
            drawer: layout.drawerRect,
            shelf: layout.spineRect,
            body: routeDiagnostics.body,
            scrollMetrics
          });
        }
      }
      assertBrowser(sizeLayout.drawerRect.width > sizeLayout.spineRect.width, `Resize sweep ${size.id} drawer should remain separate from shelf.`, sizeLayout);
    }
    return {
      skipped: false,
      outputDir,
      sizes: drawerResizeSweepSizes(),
      scrolls: drawerScrollPositions().map((item) => item.id),
      captures,
      diagnostics
    };
  } catch (error) {
    if (error && typeof error.message === 'string' && !error.message.includes('Resize sweep context:')) {
      error.message = `Resize sweep context: ${currentContext}. ${error.message}`;
    }
    throw error;
  } finally {
    await resetDirectiveRuntimeLayout(page);
    await openDirectivePanel(page);
  }
}

async function runScreenshotSmoke(page) {
  if (!RUN_SCREENSHOTS) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_SCREENSHOTS=1 not set'
    };
  }

  const outputDir = screenshotRunDirectory();
  fs.mkdirSync(outputDir, {
    recursive: true
  });
  const captures = [];
  for (const viewport of screenshotViewports()) {
    await setBrowserViewport(page, viewport);
    await openDirectivePanel(page);
    for (const label of REQUIRED_ROUTES) {
      const navigation = await navigateDirectiveRoute(page, label);
      const layout = await directiveLayoutSnapshot(page);
      assertDirectiveLayout(layout, {
        routeId: navigation.routeId,
        viewportId: viewport.id
      });
      const fileName = `${viewport.id}-${slugPart(label)}.png`;
      const filePath = path.join(outputDir, fileName);
      const bytes = await capturePageScreenshot(page, filePath);
      assertBrowser(bytes > 2500, `${viewport.id} screenshot for "${label}" was too small to prove a rendered UI.`, {
        filePath,
        bytes
      });
      captures.push({
        viewport: viewport.id,
        route: label,
        routeId: navigation.routeId,
        width: viewport.width,
        height: viewport.height,
        filePath,
        bytes,
        layout: {
          panel: layout.panelRect,
          spine: layout.spineRect,
          drawer: layout.drawerRect,
          body: layout.bodyRect,
          routeCount: layout.routeRects.length,
          selectedRouteId: layout.selectedRouteId
        }
      });
    }
  }
  return {
    skipped: false,
    outputDir,
    captures
  };
}

async function mobileShellInteractionSnapshot(page) {
  return page.evaluate(() => {
    const normalizeRect = (rect) => ({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left)
    });
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const bottomBar = panel?.querySelector('.directive-mobile-bottom-bar') || null;
    const activeRoute = panel?.querySelector('.directive-mobile-bottom-tab-active') || null;
    const body = panel?.querySelector('[data-directive-runtime-body="true"]') || null;
    const hidden = !panel
      || panel.hidden === true
      || panel.getAttribute('aria-hidden') === 'true'
      || getComputedStyle(panel).display === 'none';
    return {
      panel: Boolean(panel),
      hidden,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      bodyText: normalize(body?.textContent || '').slice(0, 180),
      bottomBarVisible: Boolean(bottomBar && bottomBar.getBoundingClientRect().height > 0 && getComputedStyle(bottomBar).display !== 'none'),
      bottomBarRect: bottomBar ? normalizeRect(bottomBar.getBoundingClientRect()) : null,
      activeRouteId: activeRoute?.dataset.mobileRouteId || null,
      activeRouteLabel: normalize(activeRoute?.textContent || ''),
      activeRouteAriaCurrent: activeRoute?.getAttribute('aria-current') || '',
      activeRouteAriaSelected: activeRoute?.getAttribute('aria-selected') || '',
      tabHistoryBackVisible: Boolean(panel?.querySelector('[data-mobile-shell-action="back"], [data-shell-action="back"]'))
    };
  });
}

async function runMobileShellInteractionSmoke(page) {
  const phone = screenshotViewports().find((viewport) => viewport.id === 'phone') || screenshotViewports()[1];
  await setBrowserViewport(page, phone);
  await openDirectivePanel(page);

  await navigateDirectiveRoute(page, 'Campaign');
  await navigateDirectiveRoute(page, 'Mission');
  const mission = await mobileShellInteractionSnapshot(page);
  assertBrowser(mission.viewport.width <= 560, 'Mobile shell interaction smoke did not enter a phone-width viewport.', mission);
  assertBrowser(mission.bottomBarVisible, 'Phone-width shell did not expose bottom route navigation.', mission);
  assertBrowser(mission.activeRouteId === ROUTE_IDS.Mission, 'Phone-width bottom navigation did not mark Mission active.', mission);
  assertBrowser(/\bMission\b/.test(mission.activeRouteLabel), 'Phone-width active route did not keep its route label.', mission);
  assertBrowser(!mission.tabHistoryBackVisible, 'Phone-width shell should not expose tab-history Back navigation.', mission);

  await navigateDirectiveRoute(page, 'Campaign');
  await page.waitForFunction((routeId) => {
    const active = document.querySelector('#directive-runtime-panel .directive-mobile-bottom-tab-active');
    const body = document.querySelector('#directive-runtime-panel [data-directive-runtime-body="true"]');
    return active?.dataset.mobileRouteId === routeId
      && active.getAttribute('aria-selected') === 'true'
      && String(body?.textContent || '').includes('Campaign');
  }, ROUTE_IDS.Campaign, {
    timeout: BROWSER_TIMEOUT_MS
  });
  const afterDirectCampaign = await mobileShellInteractionSnapshot(page);
  assertBrowser(afterDirectCampaign.activeRouteId === ROUTE_IDS.Campaign, 'Phone-width bottom navigation did not switch directly to Campaign.', afterDirectCampaign);

  await navigateDirectiveRoute(page, 'Mission');
  const afterMissionReturn = await mobileShellInteractionSnapshot(page);
  assertBrowser(afterMissionReturn.activeRouteId === ROUTE_IDS.Mission, 'Phone-width bottom navigation did not return to Mission.', afterMissionReturn);

  return {
    skipped: false,
    viewport: {
      width: phone.width,
      height: phone.height
    },
    bottomNavigation: true,
    activeRouteKeepsLabel: true,
    tabHistoryBackVisible: false,
    directNavigation: {
      from: ROUTE_IDS.Mission,
      to: afterDirectCampaign.activeRouteId
    },
    returnedRoute: afterMissionReturn.activeRouteId
  };
}

async function runTeardownCleanupSmoke(page) {
  if (!RUN_TEARDOWN) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_TEARDOWN=1 not set'
    };
  }

  const invoked = await page.evaluate(async (extensionPath) => {
    const cleanupState = () => {
      const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
      const style = panel ? getComputedStyle(panel) : null;
      return {
        bridge: Boolean(globalThis.Directive?.bridge),
        actions: Boolean(globalThis.Directive?.actions),
        panelPresent: Boolean(panel),
        panelHidden: !panel
          || panel.hidden === true
          || panel.getAttribute('aria-hidden') === 'true'
          || style?.display === 'none'
      };
    };

    const result = {
      before: cleanupState(),
      invokedWith: '',
      eventName: '',
      eventMethod: '',
      moduleError: '',
      eventError: ''
    };

    try {
      const lifecycle = await import(`${extensionPath}/src/hosts/sillytavern/lifecycle.js`);
      if (typeof lifecycle.directiveOnDisable === 'function') {
        await lifecycle.directiveOnDisable();
        result.invokedWith = 'served lifecycle directiveOnDisable';
      }
    } catch (error) {
      result.moduleError = error?.message || String(error);
    }

    if (!result.invokedWith) {
      try {
        const ctx = globalThis.SillyTavern?.getContext?.() || null;
        const source = ctx?.eventSource || ctx?.eventBus || globalThis.eventBus || null;
        const eventTypes = ctx?.event_types || {};
        const eventNames = [
          eventTypes.EXTENSION_DISABLED,
          eventTypes.EXTENSION_DISABLE,
          'EXTENSION_DISABLED',
          'EXTENSION_DISABLE'
        ].filter(Boolean);
        const uniqueEventNames = Array.from(new Set(eventNames));
        const eventMethod = ['emit', 'trigger'].find((method) => typeof source?.[method] === 'function');
        if (eventMethod && uniqueEventNames.length > 0) {
          source[eventMethod](uniqueEventNames[0]);
          result.invokedWith = `host event ${eventMethod}`;
          result.eventMethod = eventMethod;
          result.eventName = uniqueEventNames[0];
        }
      } catch (error) {
        result.eventError = error?.message || String(error);
      }
    }

    return result;
  }, EXTENSION_PATH);

  if (!invoked.invokedWith) {
    return maybeReturnOptionalSkip({
      skipped: true,
      reason: 'No repeatable disable lifecycle or host-event automation surface was available in the live browser.',
      moduleError: invoked.moduleError,
      eventError: invoked.eventError
    });
  }

  await page.waitForFunction(() => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const style = panel ? getComputedStyle(panel) : null;
    const panelHidden = !panel
      || panel.hidden === true
      || panel.getAttribute('aria-hidden') === 'true'
      || style?.display === 'none';
    const bridgeRemoved = !globalThis.Directive?.bridge && !globalThis.Directive?.actions;
    return panelHidden && bridgeRemoved;
  }, null, {
    timeout: BROWSER_TIMEOUT_MS
  });

  const after = await page.evaluate(() => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const style = panel ? getComputedStyle(panel) : null;
    return {
      bridgeRemoved: !globalThis.Directive?.bridge && !globalThis.Directive?.actions,
      panelPresent: Boolean(panel),
      panelHidden: !panel
        || panel.hidden === true
        || panel.getAttribute('aria-hidden') === 'true'
        || style?.display === 'none'
    };
  });

  assertBrowser(after.bridgeRemoved, 'Directive global bridge remained after disable cleanup.', after);
  assertBrowser(after.panelHidden, 'Directive runtime panel remained visible after disable cleanup.', after);

  return {
    skipped: false,
    invokedWith: invoked.invokedWith,
    eventName: invoked.eventName || null,
    eventMethod: invoked.eventMethod || null,
    bridgeRemoved: after.bridgeRemoved,
    panelHidden: after.panelHidden
  };
}

async function createAuthenticatedPage(browser, browserDriver) {
  if (!SILLYTAVERN_USER) {
    return {
      page: await browser.newPage(),
      context: null,
      authenticatedUser: null
    };
  }

  assertBrowser(
    browserDriver === 'playwright' && typeof browser.newContext === 'function',
    'DIRECTIVE_SILLYTAVERN_USER requires Playwright browser contexts.',
    { browserDriver, handle: SILLYTAVERN_USER }
  );

  const auth = await authenticateSillyTavernUser({
    baseUrl: BASE_URL,
    handle: SILLYTAVERN_USER,
    password: configuredUserPassword(SILLYTAVERN_USER),
    timeoutMs: BROWSER_TIMEOUT_MS
  });
  assertBrowser(auth.ok, `Could not authenticate SillyTavern user ${SILLYTAVERN_USER}.`, auth);
  smokeUserAuth = auth;
  bootstrappedRequestAuth = {
    csrfToken: auth.csrfToken || auth.headers?.['X-CSRF-Token'] || '',
    cookie: auth.headers.Cookie || auth.headers.cookie || '',
    source: `api-users-login:${SILLYTAVERN_USER}`
  };

  const cookies = cookieHeaderToPlaywrightCookies(bootstrappedRequestAuth.cookie);
  assertBrowser(cookies.length > 0, `SillyTavern user ${SILLYTAVERN_USER} authentication did not return a session cookie.`, auth);

  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();
  return {
    page,
    context,
    authenticatedUser: {
      handle: SILLYTAVERN_USER,
      loginStatus: auth.loginStatus
    }
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
  assertBrowser(
    session.ok && session.json?.handle === SILLYTAVERN_USER,
    `Browser session is not authenticated as ${SILLYTAVERN_USER}.`,
    session
  );
  return {
    handle: session.json.handle,
    name: session.json.name || null
  };
}

async function runFactualGroundingReviewOnly(page) {
  if (!FACT_REVIEW_ONLY) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_FACT_REVIEW_ONLY=1 not set'
    };
  }
  if (!FACT_REVIEW_REQUEST_PATH) {
    throw new Error('DIRECTIVE_SILLYTAVERN_FACT_REVIEW_REQUEST_PATH is required for fact-review-only mode.');
  }
  const reviewRequest = JSON.parse(fs.readFileSync(FACT_REVIEW_REQUEST_PATH, 'utf8'));
  appendLiveLog({
    kind: 'model-assisted-factual-review',
    status: 'in_progress',
    requestPath: FACT_REVIEW_REQUEST_PATH,
    outputPath: FACT_REVIEW_OUTPUT_PATH || null,
    requestId: reviewRequest?.requestId || null,
    packageId: reviewRequest?.packageId || null,
    packId: reviewRequest?.packId || null,
    inputHash: reviewRequest?.inputHash || null
  });
  const result = await page.evaluate(async ({ modulePath, request }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.runFactualGroundingReview) {
      return {
        ok: false,
        reason: 'Directive runtime app does not expose runFactualGroundingReview.'
      };
    }
    if (typeof app.initialize === 'function') {
      await app.initialize();
    }
    const review = await app.runFactualGroundingReview({ reviewRequest: request });
    return clone(review);
  }, {
    modulePath: bridgeModulePath(),
    request: reviewRequest
  });
  const output = {
    kind: 'directive.sillytavern.factualGroundingReviewProviderResult',
    capturedAt: new Date().toISOString(),
    requestPath: FACT_REVIEW_REQUEST_PATH,
    requestId: reviewRequest?.requestId || null,
    packageId: reviewRequest?.packageId || null,
    packId: reviewRequest?.packId || null,
    inputHash: reviewRequest?.inputHash || null,
    result
  };
  if (FACT_REVIEW_OUTPUT_PATH) writeJsonArtifact(FACT_REVIEW_OUTPUT_PATH, output);
  appendLiveLog({
    kind: 'model-assisted-factual-review',
    status: result?.ok === true ? 'pass' : 'fail',
    requestPath: FACT_REVIEW_REQUEST_PATH,
    outputPath: FACT_REVIEW_OUTPUT_PATH || null,
    requestId: reviewRequest?.requestId || null,
    packageId: reviewRequest?.packageId || null,
    packId: reviewRequest?.packId || null,
    inputHash: reviewRequest?.inputHash || null,
    modelCall: result?.modelCall || null,
    generation: result?.generation || null,
    reason: result?.reason || result?.generation?.error?.message || null
  });
  return output;
}

async function runStoryQualityReviewOnly(page) {
  if (!STORY_QUALITY_REVIEW_ONLY) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_ONLY=1 not set'
    };
  }
  if (!STORY_QUALITY_REVIEW_REQUEST_PATH) {
    throw new Error('DIRECTIVE_SILLYTAVERN_STORY_QUALITY_REVIEW_REQUEST_PATH is required for story-quality-review-only mode.');
  }
  const reviewRequest = JSON.parse(fs.readFileSync(STORY_QUALITY_REVIEW_REQUEST_PATH, 'utf8'));
  appendLiveLog({
    kind: 'model-assisted-story-quality-review',
    status: 'in_progress',
    requestPath: STORY_QUALITY_REVIEW_REQUEST_PATH,
    outputPath: STORY_QUALITY_REVIEW_OUTPUT_PATH || null,
    requestId: reviewRequest?.requestId || null,
    inputHash: reviewRequest?.inputHash || null
  });
  let result = null;
  const maxAttempts = Math.max(1, 1 + STORY_QUALITY_REVIEW_RETRY_COUNT);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    result = await page.evaluate(async ({ modulePath, request }) => {
      const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
      const mod = await import(modulePath);
      const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
      const app = bridge.runtimeApp || null;
      if (!app?.runStoryQualityReview) {
        return {
          ok: false,
          reason: 'Directive runtime app does not expose runStoryQualityReview.'
        };
      }
      if (typeof app.initialize === 'function') {
        await app.initialize();
      }
      const review = await app.runStoryQualityReview({ reviewRequest: request });
      return clone(review);
    }, {
      modulePath: bridgeModulePath(),
      request: reviewRequest
    });
    result = {
      ...(result || {}),
      reviewAttempt: attempt,
      reviewMaxAttempts: maxAttempts
    };
    const timeout = result?.generation?.error?.code === 'DIRECTIVE_GENERATION_TIMEOUT'
      || result?.modelCall?.errorCode === 'DIRECTIVE_GENERATION_TIMEOUT';
    const empty = !String(result?.text || '').trim();
    if (result?.ok === true || attempt >= maxAttempts || (!timeout && !empty)) break;
    appendLiveLog({
      kind: 'model-assisted-story-quality-review',
      status: 'retry',
      requestPath: STORY_QUALITY_REVIEW_REQUEST_PATH,
      outputPath: STORY_QUALITY_REVIEW_OUTPUT_PATH || null,
      requestId: reviewRequest?.requestId || null,
      inputHash: reviewRequest?.inputHash || null,
      attempt,
      maxAttempts,
      reason: result?.generation?.error?.message || result?.reason || 'empty story-quality reviewer output'
    });
  }
  const output = {
    kind: 'directive.sillytavern.storyQualityReviewProviderResult',
    capturedAt: new Date().toISOString(),
    requestPath: STORY_QUALITY_REVIEW_REQUEST_PATH,
    requestId: reviewRequest?.requestId || null,
    inputHash: reviewRequest?.inputHash || null,
    result
  };
  if (STORY_QUALITY_REVIEW_OUTPUT_PATH) writeJsonArtifact(STORY_QUALITY_REVIEW_OUTPUT_PATH, output);
  appendLiveLog({
    kind: 'model-assisted-story-quality-review',
    status: result?.ok === true ? 'pass' : 'fail',
    requestPath: STORY_QUALITY_REVIEW_REQUEST_PATH,
    outputPath: STORY_QUALITY_REVIEW_OUTPUT_PATH || null,
    requestId: reviewRequest?.requestId || null,
    inputHash: reviewRequest?.inputHash || null,
    modelCall: result?.modelCall || null,
    generation: result?.generation || null,
    reason: result?.reason || null,
    error: result?.error || null
  });
  return output;
}

async function runBrowserSmoke() {
  if (!RUN_BROWSER) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_BROWSER=1 not set'
    };
  }

  let chromium;
  let browserDriver = 'playwright';
  let playwrightError = null;
  try {
    ({ chromium } = await import('playwright'));
  } catch (error) {
    playwrightError = error;
  }

  let browser;
  if (chromium) {
    try {
      browser = await chromium.launch({ headless: HEADLESS });
    } catch (error) {
      if (!isPlaywrightDependencyError(error)) {
        throw error;
      }
      playwrightError = error;
    }
  }

  if (!browser) {
    try {
      browser = await launchCdpBrowser();
      browserDriver = 'chromium-cdp';
    } catch (error) {
      return browserSkip(`Browser automation is not available. Playwright: ${playwrightError?.message || 'not attempted'}; CDP fallback: ${error?.message || error}`);
    }
  }

  let context = null;
  try {
    const authPage = await createAuthenticatedPage(browser, browserDriver);
    const page = authPage.page;
    context = authPage.context;
    const pageDiagnostics = {
      consoleMessages: [],
      pageErrors: []
    };
    page.on?.('console', (message) => {
      pageDiagnostics.consoleMessages.push({
        type: message.type?.() || '',
        text: compact(redactSecrets(message.text?.() || ''), 500)
      });
      if (pageDiagnostics.consoleMessages.length > 40) {
        pageDiagnostics.consoleMessages.splice(0, pageDiagnostics.consoleMessages.length - 40);
      }
    });
    page.on?.('pageerror', (error) => {
      pageDiagnostics.pageErrors.push(errorSummary(error));
      if (pageDiagnostics.pageErrors.length > 20) {
        pageDiagnostics.pageErrors.splice(0, pageDiagnostics.pageErrors.length - 20);
      }
    });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await installBrowserErrorCapture(page);
    const browserUser = await verifyBrowserUserSession(page);

    const extensionControls = await browserStep('extension settings dropdown', () => verifyExtensionControls(page, pageDiagnostics));
    if (FACT_REVIEW_ONLY) {
      const openedWith = await browserStep('open Directive panel', () => openDirectivePanel(page));
      const factualGroundingReview = await browserStep('factual grounding review', () => runFactualGroundingReviewOnly(page));
      return {
        skipped: false,
        factReviewOnly: true,
        driver: browserDriver,
        browserDriver,
        browserUser,
        authenticatedUser: authPage.authenticatedUser,
        extensionControls,
        openedWith,
        factualGroundingReview
      };
    }
    if (STORY_QUALITY_REVIEW_ONLY) {
      const openedWith = await browserStep('open Directive panel', () => openDirectivePanel(page));
      const storyQualityReview = await browserStep('story quality review', () => runStoryQualityReviewOnly(page));
      return {
        skipped: false,
        storyQualityReviewOnly: true,
        driver: browserDriver,
        browserDriver,
        browserUser,
        authenticatedUser: authPage.authenticatedUser,
        extensionControls,
        openedWith,
        storyQualityReview
      };
    }
    if (RUN_TOGGLE_ONLY) {
      return {
        skipped: false,
        toggleOnly: true,
        driver: browserDriver,
        extensionControls
      };
    }
    const openedWith = await browserStep('open Directive panel', () => openDirectivePanel(page));
    const shell = await browserStep('shell contract', async () => {
      const snapshot = await panelSnapshot(page);
      assertBrowser(snapshot.panel, 'Directive runtime panel was not present.', snapshot);
      assertBrowser(snapshot.hidden !== true, 'Directive runtime panel was hidden after opening.', snapshot);
      assertBrowser(snapshot.commandSpine, 'Directive runtime panel was not using the command-spine shell.', snapshot);
      assertBrowser(snapshot.drawer, 'Directive runtime panel did not create the single command drawer.', snapshot);
      assertBrowser(snapshot.drawerHeader, 'Directive runtime panel did not expose the drawer-header action cluster.', snapshot);
      assertBrowser(snapshot.resizeHandle && !snapshot.leftResizeHandle && snapshot.rightResizeHandle, 'Directive runtime panel should expose only the bottom-right resize handle.', snapshot);
      assertBrowser(snapshot.fullscreenControl && snapshot.collapseControl, 'Directive drawer header did not expose expand and collapse controls.', snapshot);
      assertBrowser(snapshot.missingRoutes.length === 0, 'Directive command-spine routes were missing.', snapshot);
      return snapshot;
    });
    const expandedSpine = await browserStep('expanded shelf labels', () => runExpandedSpineSmoke(page));
    const resizeDrag = await browserStep('drawer resize drag', () => runDrawerResizeDragSmoke(page));
    const resizeSweep = await browserStep('drawer resize sweep', () => runDrawerResizeSweepSmoke(page));
    const routeCoverage = await browserStep('route coverage', () => verifyBrowserRoutes(page));
    const screenshots = await browserStep('route screenshots', () => runScreenshotSmoke(page));
    const mobileShellInteractions = await browserStep('mobile shell interactions', () => runMobileShellInteractionSmoke(page));
    await setBrowserViewport(page, screenshotViewports()[0]);
    await openDirectivePanel(page);
    const chatCampaignFlow = await browserStep('chat-native campaign flow', () => runChatNativeCampaignFlow(page));
    const missionFlow = await browserStep('active campaign Mission flow', () => runMissionBrowserFlow(page));
    const teardownCleanup = await browserStep('teardown cleanup', () => runTeardownCleanupSmoke(page));

    return {
      skipped: false,
      openedWith,
      bridge: shell.bridge,
      actions: shell.actions,
      extensionControls,
      commandSpine: shell.commandSpine,
      drawer: shell.drawer,
      drawerHeader: shell.drawerHeader,
      resizeHandle: shell.resizeHandle,
      expandedSpine,
      resizeDrag,
      resizeSweep,
      browserDriver,
      browserUser,
      authenticatedUser: authPage.authenticatedUser,
      routes: shell.routeLabels,
      routeCoverage,
      providerContext: shell.providerContext,
      generationEnabled: RUN_LIVE_GENERATION,
      saveFlowEnabled: RUN_BROWSER_SAVE_FLOW,
      screenshotsEnabled: RUN_SCREENSHOTS,
      screenshots,
      mobileShellInteractions,
      teardownEnabled: RUN_TEARDOWN,
      missionFlow,
      chatCampaignEnabled: RUN_CHAT_CAMPAIGN_FLOW,
      chatCampaignFlow,
      teardownCleanup
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

  const staticExtension = await verifyStaticExtension();
  const storage = await runStorageSmoke();
  const browser = await runBrowserSmoke();

  const report = {
    ok: true,
    baseUrl: BASE_URL,
    extensionPath: EXTENSION_PATH,
    staticExtension,
    storage,
    browser,
    liveGeneration: RUN_LIVE_GENERATION
  };
  writeReportArtifacts(report);
  console.log(JSON.stringify(COMPACT_STDOUT ? compactReportSummary(report) : report, null, 2));
}

try {
  await main();
} catch (error) {
  appendLiveLog({
    kind: 'failure',
    status: 'fail',
    user: SILLYTAVERN_USER || null,
    packageId: CAMPAIGN_PACKAGE_ID || null,
    error: compactErrorSummary(error)
  });
  const report = {
    ok: false,
    baseUrl: BASE_URL || null,
    extensionPath: EXTENSION_PATH,
    error: errorSummary(error)
  };
  writeReportArtifacts(report);
  console.error(JSON.stringify(COMPACT_STDOUT ? compactReportSummary(report) : report, null, 2));
  process.exit(1);
}
