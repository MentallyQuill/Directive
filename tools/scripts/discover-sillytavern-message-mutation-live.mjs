import {
  DEFAULT_DIRECTIVE_EXTENSION_PATH,
  DEFAULT_SOAK_ARTIFACT_ROOT,
  compact,
  createArtifactPaths,
  createRunId,
  ensureArtifactTree,
  errorSummary,
  launchPlaywrightBrowser,
  normalizeBaseUrl,
  normalizeExtensionPath,
  writeJsonFile
} from './lib/sillytavern-live-harness.mjs';

const args = new Set(process.argv.slice(2));
const HELP = args.has('--help') || args.has('-h');
const LIVE = args.has('--live') || process.env.DIRECTIVE_MUTATION_DISCOVERY_LIVE === '1';
const WRITE_ARTIFACTS = args.has('--write-artifacts') || process.env.DIRECTIVE_MUTATION_DISCOVERY_WRITE === '1';
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || '');
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || DEFAULT_DIRECTIVE_EXTENSION_PATH);
const RUN_ID = process.env.DIRECTIVE_MUTATION_DISCOVERY_RUN_ID || createRunId();
const ARTIFACT_ROOT = process.env.DIRECTIVE_SOAK_ARTIFACT_DIR || DEFAULT_SOAK_ARTIFACT_ROOT;

function usage() {
  return `Directive SillyTavern message edit/delete discovery

Read-only default:
  node tools\\scripts\\discover-sillytavern-message-mutation-live.mjs

Live browser discovery:
  $env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
  node tools\\scripts\\discover-sillytavern-message-mutation-live.mjs --live --write-artifacts

This script does not edit or delete messages. It inspects SillyTavern event
names, runtime bridge capabilities, message row controls, and visible DOM
candidates so the soak runner can later use a host-native mutation path.
`;
}

function dryRunReport() {
  return {
    schemaVersion: 1,
    kind: 'directive.sillytavernMessageMutation.discovery',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    status: BASE_URL ? 'not-run' : 'skipped',
    baseUrl: BASE_URL || null,
    extensionPath: EXTENSION_PATH,
    findings: [],
    notes: [
      'Set SILLYTAVERN_BASE_URL and pass --live to inspect the browser host.',
      'The live probe is read-only and should not mutate chat history.'
    ]
  };
}

async function inspectPage(page) {
  return page.evaluate(async ({ extensionPath }) => {
    const text = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visibleRect = (element) => {
      if (!element?.getBoundingClientRect) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents
      };
    };
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const eventTypes = context.eventTypes || context.event_types || {};
    const eventTypeEntries = Object.entries(eventTypes).filter(([key, value]) => /message|chat|swipe|edit|delete|remove/i.test(`${key} ${value}`));
    const contextKeys = Object.keys(context).filter((key) => /message|chat|event|edit|delete|remove|swipe|save/i.test(key)).sort();
    const globalKeys = Object.keys(globalThis).filter((key) => /message|chat|event|edit|delete|remove|swipe|save/i.test(key)).sort().slice(0, 240);
    const messageRows = Array.from(document.querySelectorAll('#chat .mes[mesid]')).slice(-12).map((row) => ({
      mesid: row.getAttribute('mesid'),
      className: row.className,
      textPreview: text(row.querySelector('.mes_text')?.textContent || row.textContent).slice(0, 180),
      hasMesButtons: Boolean(row.querySelector('.mes_buttons')),
      hasExtraMesButtons: Boolean(row.querySelector('.extraMesButtons')),
      directiveButton: Boolean(row.querySelector('.directive-message-actions-button')),
      rowRect: visibleRect(row),
      directiveButtonRect: visibleRect(row.querySelector('.directive-message-actions-button'))
    }));
    const candidateControls = Array.from(document.querySelectorAll('button, [role="button"], .menu_button, .mes_button, a')).map((element) => ({
      tagName: element.tagName,
      className: element.className || '',
      id: element.id || '',
      title: element.getAttribute('title') || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      text: text(element.textContent).slice(0, 120),
      rect: visibleRect(element)
    })).filter((entry) => /edit|delete|remove|message actions|swipe|regenerate|reconcile|recalculate/i.test(`${entry.id} ${entry.className} ${entry.title} ${entry.ariaLabel} ${entry.text}`)).slice(0, 200);

    let bridgeSnapshot = null;
    try {
      const mod = await import(`${extensionPath}/src/hosts/sillytavern/runtime-bridge.mjs`);
      const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
      bridgeSnapshot = {
        enabled: bridge.enabled !== false,
        hasRuntimeApp: Boolean(bridge.runtimeApp),
        hasHost: Boolean(bridge.host),
        hostChatCapabilities: Object.keys(bridge.host?.chat || {}).sort(),
        runtimeAppCapabilities: Object.keys(bridge.runtimeApp || {}).filter((key) => /message|chat|reconcile|assist|save|load|runtime/i.test(key)).sort()
      };
    } catch (error) {
      bridgeSnapshot = {
        error: error?.message || String(error)
      };
    }

    return {
      location: globalThis.location?.href || null,
      eventTypeEntries,
      contextKeys,
      globalKeys,
      messageRows,
      candidateControls,
      bridgeSnapshot,
      recommendations: {
        hasMessageEditedEvent: eventTypeEntries.some(([key, value]) => /MESSAGE_EDITED|MESSAGE_UPDATED|edited|updated/i.test(`${key} ${value}`)),
        hasMessageDeletedEvent: eventTypeEntries.some(([key, value]) => /MESSAGE_DELETED|MESSAGE_REMOVED|deleted|removed/i.test(`${key} ${value}`)),
        hasVisibleEditDeleteControls: candidateControls.some((entry) => /edit|delete|remove/i.test(`${entry.id} ${entry.className} ${entry.title} ${entry.ariaLabel} ${entry.text}`)),
        directiveActionsHaveGeometry: messageRows.some((entry) => entry.directiveButtonRect?.width > 0 && entry.directiveButtonRect?.height > 0)
      }
    };
  }, { extensionPath: EXTENSION_PATH });
}

async function liveReport() {
  if (!BASE_URL) {
    return {
      ...dryRunReport(),
      status: 'skipped',
      notes: ['SILLYTAVERN_BASE_URL is required for live discovery.']
    };
  }
  const browserResult = await launchPlaywrightBrowser({ headless: HEADLESS });
  if (!browserResult.ok) {
    return {
      ...dryRunReport(),
      mode: 'live',
      status: 'fail',
      failures: [browserResult.error?.message || 'Playwright browser launch failed.'],
      browser: browserResult
    };
  }
  const { browser } = browserResult;
  try {
    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const inspected = await inspectPage(page);
    return {
      schemaVersion: 1,
      kind: 'directive.sillytavernMessageMutation.discovery',
      runId: RUN_ID,
      generatedAt: new Date().toISOString(),
      mode: 'live-read-only',
      status: 'pass',
      baseUrl: BASE_URL,
      extensionPath: EXTENSION_PATH,
      inspected,
      findings: [
        inspected.recommendations.hasMessageEditedEvent ? 'SillyTavern exposes a message-edited event name.' : 'No message-edited event name was found in context event types.',
        inspected.recommendations.hasMessageDeletedEvent ? 'SillyTavern exposes a message-deleted event name.' : 'No message-deleted event name was found in context event types.',
        inspected.recommendations.hasVisibleEditDeleteControls ? 'Visible edit/delete/remove controls were detected.' : 'No visible edit/delete/remove controls were detected in the current view.',
        inspected.recommendations.directiveActionsHaveGeometry ? 'Directive message action buttons have visible geometry on at least one row.' : 'No visible Directive message action geometry was detected.'
      ]
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  if (HELP) {
    console.log(usage());
    return;
  }
  const report = LIVE ? await liveReport() : dryRunReport();
  if (WRITE_ARTIFACTS) {
    const paths = createArtifactPaths({ rootDir: ARTIFACT_ROOT, runId: RUN_ID });
    ensureArtifactTree(paths);
    writeJsonFile(`${paths.discovery}/message-mutation-discovery.json`, report);
  }
  console.log(JSON.stringify({
    ok: report.status !== 'fail',
    status: report.status,
    mode: report.mode,
    runId: report.runId,
    writeArtifacts: WRITE_ARTIFACTS,
    baseUrl: report.baseUrl,
    findings: (report.findings || []).map((entry) => compact(entry, 180))
  }, null, 2));
  if (report.status === 'fail') process.exitCode = 1;
}

main().catch((error) => {
  console.error(errorSummary(error));
  process.exit(1);
});
