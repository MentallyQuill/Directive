import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_DIRECTIVE_EXTENSION_PATH,
  DEFAULT_SOAK_ARTIFACT_ROOT,
  PLAYWRIGHT_SELECTOR_GUIDANCE,
  PLAYWRIGHT_VIEWPORTS,
  appendJsonLine,
  cloneJson,
  compact,
  compareServedExtension,
  createArtifactPaths,
  createRunId,
  ensureArtifactTree,
  errorSummary,
  loadPlaywright,
  normalizeBaseUrl,
  normalizeExtensionPath,
  verifyPlaywrightBrowserEnvironment,
  writeJsonFile,
  writeTextFile
} from './lib/sillytavern-live-harness.mjs';

const args = new Set(process.argv.slice(2));
const HELP = args.has('--help') || args.has('-h');
const WRITE_ARTIFACTS = args.has('--write-artifacts')
  || process.env.DIRECTIVE_SOAK_WRITE_ARTIFACTS === '1'
  || (process.env.DIRECTIVE_LIVE_CAMPAIGN_SOAK === '1' && !args.has('--dry-run') && !args.has('--no-write'));
const LIVE_PREFLIGHT = args.has('--live-preflight') || process.env.DIRECTIVE_SOAK_LIVE_PREFLIGHT === '1';
const LIVE_EXECUTION = process.env.DIRECTIVE_LIVE_CAMPAIGN_SOAK === '1' && !args.has('--dry-run');
const REQUIRE_PLAYWRIGHT = LIVE_EXECUTION || LIVE_PREFLIGHT || process.env.DIRECTIVE_REQUIRE_PLAYWRIGHT === '1';
const VERIFY_PLAYWRIGHT_BROWSER = process.env.DIRECTIVE_SKIP_PLAYWRIGHT_BROWSER_CHECK !== '1';
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const RUN_ID = process.env.DIRECTIVE_SOAK_RUN_ID || createRunId();
const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || '');
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || DEFAULT_DIRECTIVE_EXTENSION_PATH);
const ARTIFACT_ROOT = process.env.DIRECTIVE_SOAK_ARTIFACT_DIR || DEFAULT_SOAK_ARTIFACT_ROOT;
const EXTENSION_SYNC_ACK = process.env.DIRECTIVE_CONFIRM_EXTENSION_SYNCED === '1';
const SCHEMA_PATH = 'schemas/testing/live-campaign-soak-report.schema.json';

export const SOAK_LIVE_LOG_POLICY = Object.freeze({
  artifact: 'live-log.jsonl',
  appendOnly: true,
  flushAfterEveryRecord: true,
  partialRunProofRequired: true,
  updateCadence: 'append before and after every live action, mutation, checkpoint, warning, failure, and phase transition',
  recordKinds: Object.freeze([
    'run-start',
    'preflight-check',
    'extension-sync',
    'extension-sync-barrier',
    'parallel-user',
    'patch-lane',
    'campaign-matrix-check',
    'campaign-start',
    'phase-start',
    'phase-end',
    'turn-start',
    'turn-end',
    'assist-action',
    'model-call',
    'message-mutation',
    'message-action',
    'reconciliation',
    'checkpoint',
    'end-condition',
    'save-load',
    'quality-score',
    'artifact',
    'warning',
    'failure',
    'operator-stop',
    'run-end'
  ])
});

export const SOAK_CAMPAIGN_MATRIX = Object.freeze([
  campaignMatrixEntry({
    packageId: 'directive:campaign-package:breckenridge-ashes-of-peace',
    title: 'U.S.S. Breckenridge: Ashes of Peace - Open World',
    packagePath: 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',
    theater: 'Asterion Reach',
    status: 'pre-alpha',
    liveCoverage: 'full-soak-rotation-primary',
    focus: 'reference 52-turn soak, message mutation stress, terminal End Conditions live proof'
  }),
  campaignMatrixEntry({
    packageId: 'directive:campaign-package:glass-harbor-drowned-constellation',
    title: 'U.S.S. Glass Harbor: Drowned Constellation - Open World',
    packagePath: 'packages/bundled/glass-harbor/drowned-constellation.campaign-package.json',
    theater: 'The Nerine Reef',
    status: 'draft',
    liveCoverage: 'short-live-canary',
    focus: 'campaign library selection, fresh start, underwater/research-specific mission pressure, campaign-specific End Conditions'
  }),
  campaignMatrixEntry({
    packageId: 'directive:campaign-package:serein-black-current',
    title: 'U.S.S. Serein: Black Current - Open World',
    packagePath: 'packages/bundled/serein/black-current.campaign-package.json',
    theater: 'The Vanta Wake',
    status: 'draft',
    liveCoverage: 'short-live-canary',
    focus: 'campaign library selection, fresh start, convoy/logistics-specific mission pressure, campaign-specific End Conditions'
  }),
  campaignMatrixEntry({
    packageId: 'directive:campaign-package:eudora-vale-broken-accord',
    title: 'Broken Accord',
    packagePath: 'packages/bundled/eudora-vale/broken-accord.campaign-package.json',
    theater: 'The Ilyra System',
    status: 'draft',
    liveCoverage: 'short-live-canary',
    focus: 'campaign library selection, fresh start, diplomacy/resource-specific mission pressure, campaign-specific End Conditions'
  }),
  campaignMatrixEntry({
    packageId: 'directive:campaign-package:aster-vale-unseen-border',
    title: 'Unseen Border',
    packagePath: 'packages/bundled/aster-vale/unseen-border.campaign-package.json',
    theater: 'The Lacuna March',
    status: 'draft',
    liveCoverage: 'short-live-canary',
    focus: 'campaign library selection, fresh start, border/route-specific mission pressure, campaign-specific End Conditions'
  }),
  campaignMatrixEntry({
    packageId: 'directive:campaign-package:celandine-enemys-garden',
    title: "U.S.S. Celandine: Enemy's Garden - Open World",
    packagePath: 'packages/bundled/celandine/enemys-garden.campaign-package.json',
    theater: 'The Cyradon Relief Cluster',
    status: 'draft',
    liveCoverage: 'short-live-canary',
    focus: 'campaign library selection, fresh start, relief/biology-specific mission pressure, campaign-specific End Conditions'
  })
]);

export const SOAK_PHASES = Object.freeze([
  phase('activation-baseline', 'Activation Baseline', '0', 'fresh campaign, character, chat, intro, prompt context'),
  phase('clean-play', 'Clean Play', '1-8', 'scene color, routine commands, counsel, consequential turns, sidecars'),
  phase('directive-assist', 'Directive Assist', '9-18', 'Draft, Brief, Order, Report, Apply, Cancel, Try Again, Restore'),
  phase('authority-attacks', 'Authority And Agency Attacks', '19-28', 'NPC control, god-mode, unsupported action, bad-guy/deception play'),
  phase('recent-retcons', 'Recent Retcon Stress', '29-34', 'edit/delete latest user and Directive replies'),
  phase('deep-retcons', 'Deep Retcon Stress', '35-44', 'edit/delete far-back user and Directive replies'),
  phase('branch-recovery', 'Save, Branch, Wrong Chat, And Recovery', '45-50', 'save, save-as, branch load, wrong-chat isolation, prompt rebuild'),
  phase('continuation-proof', 'Continuation Proof', '51-52', 'continue playable campaign after stress'),
  phase('end-condition-branches', 'End Condition Branches', 'terminal sub-runs', 'force terminal failures and resolve checkpoint replay, Push On, Keep Ending, and Save Branch')
]);

export const SOAK_TURN_SCRIPT = Object.freeze([
  intent(1, 'acknowledge the handoff and ask for a clean operational picture', 'baseline'),
  intent(2, 'preserve telemetry and keep rescue teams ready', 'routine-command'),
  intent(3, 'ask for protocol context before boarding', 'counsel'),
  intent(4, 'choose a cautious standoff scan posture', 'consequential-command'),
  intent(5, 'request counsel from medical and tactical', 'counsel'),
  intent(6, 'authorize a limited rescue preparation', 'routine-command'),
  intent(7, 'push toward a risky close approach', 'risk-warning'),
  intent(8, 'accept or reject the warning', 'pending-resolution'),
  intent(9, 'use Assist to draft a concise order', 'assist'),
  intent(10, 'send edited Assist draft', 'assist-send'),
  intent(11, 'use Brief Me on evidence integrity', 'assist'),
  intent(12, 'use Frame as Report for uncertainty', 'assist'),
  intent(13, 'use Assist then cancel', 'assist'),
  intent(14, 'use Try Again', 'assist'),
  intent(15, 'use Replace Selection', 'assist'),
  intent(16, 'restore rough text', 'assist'),
  intent(17, 'use Frame as Order', 'assist'),
  intent(18, 'send final command', 'assist-send'),
  intent(19, 'try to make Priya speak and agree', 'agency-attack'),
  intent(20, 'try to order Captain Whitaker directly', 'authority-attack'),
  intent(21, 'declare the mystery solved without evidence', 'god-mode'),
  intent(22, 'claim hidden villain knowledge', 'hidden-truth-attack'),
  intent(23, 'try to commandeer another ship', 'resource-bypass'),
  intent(24, 'attempt secret sabotage', 'bad-guy-play'),
  intent(25, 'lie to the crew', 'bad-guy-play'),
  intent(26, 'try to erase consequences', 'god-mode'),
  intent(27, 'inject prompt/system override language', 'prompt-injection'),
  intent(28, 'recover with a plausible in-world explanation', 'recovery-play'),
  intent(29, 'perform recent user edit', 'recent-retcon'),
  intent(30, 'reconcile edited recent user turn', 'reconciliation'),
  intent(31, 'perform recent Directive edit', 'recent-retcon'),
  intent(32, 'reconcile edited recent Directive response', 'reconciliation'),
  intent(33, 'delete recent user turn', 'recent-retcon'),
  intent(34, 'recover or mark review required', 'recovery'),
  intent(35, 'perform far-back user edit', 'deep-retcon'),
  intent(36, 'set reconciliation start', 'message-action'),
  intent(37, 'set reconciliation end', 'message-action'),
  intent(38, 'reconcile marked passage', 'reconciliation'),
  intent(39, 'perform far-back Directive edit', 'deep-retcon'),
  intent(40, 'reconcile from here', 'reconciliation'),
  intent(41, 'delete far-back committed user turn', 'deep-retcon'),
  intent(42, 'recalculate from here', 'recalculation'),
  intent(43, 'cancel recalculation preview', 'recalculation'),
  intent(44, 'accept recalculation in branch-only mode', 'recalculation'),
  intent(45, 'save current game', 'save'),
  intent(46, 'save as soak branch', 'save-as'),
  intent(47, 'load soak branch', 'load'),
  intent(48, 'send wrong-chat message', 'wrong-chat'),
  intent(49, 'return to bound chat and rebuild prompt', 'prompt-rebuild'),
  intent(50, 'continue normal play', 'continuation'),
  intent(51, 'use accumulated continuity in a quiet post', 'continuation'),
  intent(52, 'make one final consequential decision', 'continuation')
]);

export const SOAK_END_CONDITION_SCENARIOS = Object.freeze([
  terminalScenario(
    'terminal-save-branch',
    'force a catastrophic terminal failure, then preserve it with Save as branch',
    'saveTerminalBranch',
    'pending'
  ),
  terminalScenario(
    'terminal-replay',
    'force a catastrophic terminal failure, then replay from checkpoint',
    'replayFromCheckpoint',
    'replayed'
  ),
  terminalScenario(
    'terminal-push-on',
    'force a catastrophic terminal failure, then Push On through an authored continuation frame',
    'pushOn',
    'pushedOn'
  ),
  terminalScenario(
    'terminal-keep-ending',
    'force a catastrophic terminal failure, then keep the ending and conclude the campaign',
    'keepEnding',
    'keptEnding'
  )
]);

function phase(id, label, turnRange, purpose) {
  return Object.freeze({ id, label, turnRange, purpose, status: 'planned' });
}

function intent(turn, intentText, category) {
  return Object.freeze({ turn, intent: intentText, category });
}

function terminalScenario(id, intentText, expectedAction, expectedDecisionStatus) {
  return Object.freeze({
    id,
    intent: intentText,
    expectedInteractionKind: 'terminalOutcomeDecision',
    expectedAction,
    expectedDecisionStatus
  });
}

function campaignMatrixEntry({
  packageId,
  title,
  packagePath,
  theater,
  status,
  liveCoverage,
  focus
}) {
  return Object.freeze({
    packageId,
    title,
    packagePath,
    theater,
    status,
    deterministicCoverage: Object.freeze([
      'package-validation',
      'projection-validation',
      'crew-dataset-validation',
      'mission-graph-validation',
      'end-condition-contract'
    ]),
    liveCoverage,
    requiredCanaryTurns: liveCoverage === 'full-soak-rotation-primary' ? 52 : 4,
    requiredLiveChecks: Object.freeze([
      'library-visible',
      'creator-opens',
      'fresh-campaign-starts',
      'chat-binding-created',
      'prompt-context-installed',
      'first-model-turn-completes',
      'save-load-preserves-package',
      'cross-campaign-isolation'
    ]),
    focus
  });
}

function usage() {
  return `Directive live campaign soak runner

Current modes:
  node tools\\scripts\\soak-sillytavern-campaign-live.mjs --dry-run
  node tools\\scripts\\soak-sillytavern-campaign-live.mjs --dry-run --write-artifacts
  node tools\\scripts\\soak-sillytavern-campaign-live.mjs --dry-run --live-preflight

Environment:
  SILLYTAVERN_BASE_URL=http://127.0.0.1:8000
  DIRECTIVE_SILLYTAVERN_EXTENSION_PATH=/scripts/extensions/third-party/Directive
  DIRECTIVE_LIVE_MODEL_CALL_BUDGET=unlimited
  DIRECTIVE_SOAK_ARTIFACT_DIR=artifacts/live-soak/sillytavern-campaign
  DIRECTIVE_SOAK_LIVE_PREFLIGHT=1
  DIRECTIVE_REQUIRE_PLAYWRIGHT=1
  DIRECTIVE_SKIP_PLAYWRIGHT_BROWSER_CHECK=1

This prep runner does not yet execute the 52-turn campaign. It validates the
Playwright-first harness assumptions, artifact schema, unlimited model-call
policy, browser launch/control, served-extension freshness checks, and
phase/turn/end-condition contract.
`;
}

function check(id, status, summary, details = null) {
  return { id, status, summary, details: cloneJson(details) };
}

function statusFromChecks(checks) {
  if (checks.some((entry) => entry.status === 'fail')) return 'fail';
  if (checks.some((entry) => entry.status === 'warning')) return 'warning';
  if (checks.some((entry) => entry.status === 'pass')) return 'pass';
  return 'not-run';
}

async function buildChecks({ artifacts = null } = {}) {
  const checks = [];
  checks.push(check(
    'plan-doc',
    fs.existsSync('docs/testing/LIVE_CAMPAIGN_SOAK_TEST_PLAN.md') ? 'pass' : 'fail',
    'Live campaign soak plan document is present.'
  ));
  checks.push(check(
    'artifact-schema',
    fs.existsSync(SCHEMA_PATH) ? 'pass' : 'fail',
    'Live campaign soak report schema is present.',
    { schemaPath: SCHEMA_PATH }
  ));
  checks.push(check(
    'live-smoke-source',
    fs.existsSync('tools/scripts/smoke-sillytavern-live.mjs') ? 'pass' : 'fail',
    'Existing SillyTavern live smoke scaffold is available for helper parity.'
  ));
  checks.push(check(
    'terminal-endings-live-smoke-source',
    fs.existsSync('tools/scripts/smoke-sillytavern-terminal-endings-live.mjs') ? 'pass' : 'fail',
    'Terminal endings live smoke is available for end-condition scenario parity.'
  ));
  checks.push(check(
    'shared-harness',
    fs.existsSync('tools/scripts/lib/sillytavern-live-harness.mjs') ? 'pass' : 'fail',
    'Shared SillyTavern live harness helpers are available.'
  ));

  const playwright = await loadPlaywright();
  checks.push(check(
    'playwright-import',
    playwright.ok ? 'pass' : REQUIRE_PLAYWRIGHT ? 'fail' : 'warning',
    playwright.ok
      ? 'Playwright imports successfully.'
      : REQUIRE_PLAYWRIGHT
        ? 'Playwright could not be imported, and this mode requires it.'
        : 'Playwright could not be imported in this checkout; install/sync it before live execution.',
    playwright.ok ? { browsers: ['chromium', 'firefox', 'webkit'] } : playwright.error
  ));

  if (playwright.ok && VERIFY_PLAYWRIGHT_BROWSER) {
    const browserProbe = await verifyPlaywrightBrowserEnvironment({
      headless: HEADLESS,
      artifactPaths: artifacts,
      captureArtifacts: WRITE_ARTIFACTS,
      timeoutMs: positiveTimeout()
    });
    checks.push(check(
      'playwright-browser-control',
      browserProbe.ok ? 'pass' : REQUIRE_PLAYWRIGHT ? 'fail' : 'warning',
      browserProbe.ok
        ? 'Playwright can launch Chromium, drive role locators, switch soak viewports, and use the fixture artifact path when artifact writing is enabled.'
        : REQUIRE_PLAYWRIGHT
          ? 'Playwright browser launch/control failed, and this mode requires it.'
          : 'Playwright browser launch/control failed; live execution will require this to pass.',
      summarizeBrowserProbe(browserProbe)
    ));
  } else {
    checks.push(check(
      'playwright-browser-control',
      playwright.ok ? 'skipped' : REQUIRE_PLAYWRIGHT ? 'fail' : 'warning',
      playwright.ok
        ? 'Playwright browser launch/control check skipped by DIRECTIVE_SKIP_PLAYWRIGHT_BROWSER_CHECK=1.'
        : 'Playwright import failed, so browser launch/control could not be checked.',
      playwright.ok ? { skippedBy: 'DIRECTIVE_SKIP_PLAYWRIGHT_BROWSER_CHECK=1' } : playwright.error
    ));
  }

  const modelBudget = process.env.DIRECTIVE_LIVE_MODEL_CALL_BUDGET || '';
  checks.push(check(
    'unlimited-model-call-policy',
    modelBudget === 'unlimited' ? 'pass' : 'warning',
    modelBudget === 'unlimited'
      ? 'Unlimited model-call policy is explicitly accepted through environment.'
      : 'Set DIRECTIVE_LIVE_MODEL_CALL_BUDGET=unlimited before live execution.',
    { value: modelBudget || null }
  ));

  checks.push(check(
    'base-url',
    BASE_URL ? 'pass' : 'skipped',
    BASE_URL ? 'SillyTavern base URL is configured.' : 'No SillyTavern base URL configured; live preflight skipped.',
    { baseUrl: BASE_URL || null }
  ));

  let servedExtension = null;
  let servedExtensionFresh = false;
  if (BASE_URL && LIVE_PREFLIGHT) {
    try {
      servedExtension = await compareServedExtension({
        baseUrl: BASE_URL,
        extensionPath: EXTENSION_PATH,
        localRoot: process.cwd()
      });
      servedExtensionFresh = servedExtension.ok === true;
      checks.push(check(
        'served-extension-freshness',
        servedExtension.ok ? 'pass' : 'warning',
        servedExtension.ok
          ? 'Served Directive extension files match the checkout hashes for the checked files.'
          : 'Served Directive extension differs from the checkout or could not be fully read.',
        {
          mismatchCount: servedExtension.mismatchCount,
          servedFailureCount: servedExtension.servedFailureCount,
          extensionPath: servedExtension.extensionPath
        }
      ));
    } catch (error) {
      checks.push(check(
        'served-extension-freshness',
        'warning',
        'Served extension freshness check could not complete.',
        errorSummary(error)
      ));
    }
  } else {
    checks.push(check(
      'served-extension-freshness',
      'skipped',
      'Served extension freshness check requires SILLYTAVERN_BASE_URL and --live-preflight or DIRECTIVE_SOAK_LIVE_PREFLIGHT=1.',
      { baseUrl: BASE_URL || null, livePreflight: LIVE_PREFLIGHT }
    ));
  }

  checks.push(check(
    'extension-sync-before-testing',
    servedExtensionFresh || EXTENSION_SYNC_ACK ? 'pass' : 'warning',
    servedExtensionFresh
      ? 'Served extension hash check proves the host is serving the checkout for checked files.'
      : EXTENSION_SYNC_ACK
        ? 'Operator acknowledged the installed SillyTavern extension has been synced before testing.'
        : 'Before live soak testing begins, sync the installed SillyTavern extension copy before any other soak action.',
    {
      acknowledged: EXTENSION_SYNC_ACK,
      servedExtensionFresh,
      acknowledgementEnv: 'DIRECTIVE_CONFIRM_EXTENSION_SYNCED=1'
    }
  ));

  return { checks, servedExtension };
}

export async function buildDryRunReport() {
  const artifacts = createArtifactPaths({ rootDir: ARTIFACT_ROOT, runId: RUN_ID });
  const { checks, servedExtension } = await buildChecks({ artifacts });
  const warnings = checks.filter((entry) => entry.status === 'warning').map((entry) => entry.summary);
  const failures = checks.filter((entry) => entry.status === 'fail').map((entry) => entry.summary);
  const status = statusFromChecks(checks);
  return {
    schemaVersion: 1,
    kind: 'directive.liveCampaignSoak.report',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    status,
    baseUrl: BASE_URL || null,
    extensionPath: EXTENSION_PATH,
    modelCallPolicy: {
      budget: 'unlimited',
      liveProvidersRequired: true,
      fallbackWarningRequired: true
    },
    driverPolicy: {
      primary: 'playwright',
      fallbacks: ['chromium-cdp', 'direct-runtime-handler'],
      fallbackEvidenceIsEquivalent: false
    },
    artifacts,
    liveLogPolicy: {
      ...SOAK_LIVE_LOG_POLICY,
      recordKinds: [...SOAK_LIVE_LOG_POLICY.recordKinds]
    },
    checks,
    warnings,
    failures,
    campaignMatrix: SOAK_CAMPAIGN_MATRIX.map((entry) => ({
      ...entry,
      deterministicCoverage: [...entry.deterministicCoverage],
      requiredLiveChecks: [...entry.requiredLiveChecks]
    })),
    phases: SOAK_PHASES.map((entry) => ({ ...entry, status: 'planned' })),
    turnScript: SOAK_TURN_SCRIPT.map((entry) => ({ ...entry })),
    endConditionScenarios: SOAK_END_CONDITION_SCENARIOS.map((entry) => ({ ...entry })),
    servedExtension,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      cwd: process.cwd(),
      livePreflight: LIVE_PREFLIGHT,
      liveExecution: LIVE_EXECUTION,
      requirePlaywright: REQUIRE_PLAYWRIGHT,
      verifyPlaywrightBrowser: VERIFY_PLAYWRIGHT_BROWSER,
      headless: HEADLESS,
      writeArtifacts: WRITE_ARTIFACTS,
      selectorGuidance: PLAYWRIGHT_SELECTOR_GUIDANCE,
      viewports: PLAYWRIGHT_VIEWPORTS
    }
  };
}

function summaryMarkdown(report) {
  const lines = [
    '# Directive Live Campaign Soak Dry Run',
    '',
    `Run: ${report.runId}`,
    `Status: ${report.status}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Checks',
    ''
  ];
  for (const entry of report.checks) {
    lines.push(`- ${entry.status}: ${entry.id} - ${entry.summary}`);
  }
  lines.push('', '## Campaign Matrix', '');
  for (const campaign of report.campaignMatrix || []) {
    lines.push(`- ${campaign.title}: ${campaign.liveCoverage}, ${campaign.requiredCanaryTurns} planned live turns`);
  }
  lines.push('', '## Live Log Policy', '');
  lines.push(`- ${report.liveLogPolicy.artifact}: ${report.liveLogPolicy.updateCadence}`);
  lines.push('', '## Planned Phases', '');
  for (const phaseEntry of report.phases) {
    lines.push(`- ${phaseEntry.turnRange}: ${phaseEntry.label} - ${phaseEntry.purpose}`);
  }
  lines.push('', '## End Condition Scenarios', '');
  for (const scenario of report.endConditionScenarios || []) {
    lines.push(`- ${scenario.id}: ${scenario.expectedAction} -> ${scenario.expectedDecisionStatus}`);
  }
  lines.push('', '## Next Step', '');
  lines.push('Implement live Playwright execution against this dry-run contract once manual SillyTavern testing has identified the safest host edit/delete path.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function positiveTimeout() {
  const parsed = Number.parseInt(process.env.DIRECTIVE_PLAYWRIGHT_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

function summarizeBrowserProbe(probe) {
  if (!probe) return null;
  return {
    ok: probe.ok === true,
    stage: probe.stage || null,
    interaction: probe.interaction || null,
    artifactPaths: {
      trace: probe.artifacts?.trace?.path || null,
      screenshots: Object.fromEntries(Object.entries(probe.viewports || {}).map(([id, entry]) => [
        id,
        entry.screenshot?.path || null
      ]))
    },
    error: probe.error || null,
    pageErrorCount: Array.isArray(probe.pageErrors) ? probe.pageErrors.length : 0,
    consoleMessageCount: Array.isArray(probe.consoleMessages) ? probe.consoleMessages.length : 0
  };
}

async function main() {
  if (HELP) {
    console.log(usage());
    return;
  }

  const report = await buildDryRunReport();
  if (WRITE_ARTIFACTS) {
    ensureArtifactTree(report.artifacts);
    writeJsonFile(report.artifacts.report, report);
    writeTextFile(report.artifacts.summary, summaryMarkdown(report));
    appendJsonLine(report.artifacts.liveLog, {
      kind: 'run-start',
      status: report.status,
      mode: report.mode,
      runId: report.runId,
      generatedAt: report.generatedAt,
      note: 'dry-run contract generated'
    });
    writeTextFile(report.artifacts.turns, '');
  }
  console.log(JSON.stringify({
    ok: report.status !== 'fail',
    status: report.status,
    runId: report.runId,
    mode: report.mode,
    writeArtifacts: WRITE_ARTIFACTS,
    artifactRoot: WRITE_ARTIFACTS ? report.artifacts.root : null,
    checks: report.checks.map((entry) => ({ id: entry.id, status: entry.status, summary: compact(entry.summary, 160) })),
    plannedCampaigns: report.campaignMatrix.length,
    plannedPhases: report.phases.length,
    plannedTurns: report.turnScript.length,
    plannedEndConditionScenarios: report.endConditionScenarios.length,
    liveLogRecordKinds: report.liveLogPolicy.recordKinds.length
  }, null, 2));
  if (report.status === 'fail') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(errorSummary(error));
    process.exit(1);
  });
}
