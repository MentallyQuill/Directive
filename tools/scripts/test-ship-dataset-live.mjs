import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  authenticateSillyTavernUser,
  compact,
  errorSummary,
  fetchText,
  fileSha256,
  launchPlaywrightBrowser,
  normalizeBaseUrl,
  normalizeExtensionPath,
  positiveInteger,
  sha256Text,
  writeJsonFile
} from './lib/sillytavern-live-harness.mjs';

const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || 'http://127.0.0.1:8000');
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || '/scripts/extensions/third-party/Directive');
const ST_USER = normalizeUserHandle(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_SOAK_ST_USER || '');
const TIMEOUT_MS = positiveInteger(process.env.DIRECTIVE_SILLYTAVERN_BROWSER_TIMEOUT_MS, 30000);
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const ARTIFACT_DIR = path.resolve(
  process.cwd(),
  process.env.DIRECTIVE_SILLYTAVERN_ARTIFACT_DIR || 'artifacts/live-soak/intrepid-ship-dataset-live'
);

const SHIP_DATASET_PATH = 'packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json';
const PACKAGE_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json';
const PROJECTION_PATH = 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json';
const CREW_DATASET_PATH = 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json';
const MISSION_GRAPH_PATH = 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json';

const SERVED_FILE_CHECKS = Object.freeze([
  PACKAGE_PATH,
  PROJECTION_PATH,
  CREW_DATASET_PATH,
  MISSION_GRAPH_PATH,
  SHIP_DATASET_PATH,
  'src/generation/player-safe-prompt-context-builder.mjs',
  'src/continuity/source-frame.mjs',
  'src/continuity/fact-index.mjs',
  'src/continuity/projection-matrix.mjs',
  'src/continuity/projection-plan-validator.mjs',
  'src/continuity/materializers/index.mjs',
  'src/continuity/materializers/ship-dataset-facts.mjs',
  'src/continuity/contradiction-guard.mjs',
  'src/retrieval/dataset-index.mjs',
  'src/retrieval/recall-lanes.mjs',
  'src/retrieval/packet-builder.mjs',
  'src/retrieval/card-hydration.mjs'
]);

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

function cookieHeaderToPlaywrightCookies(cookieHeader = '', baseUrl = BASE_URL) {
  const url = new URL(baseUrl);
  return String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator <= 0) return null;
      return {
        name: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim(),
        domain: url.hostname,
        path: '/',
        httpOnly: false,
        secure: url.protocol === 'https:',
        sameSite: 'Lax'
      };
    })
    .filter((cookie) => cookie?.name);
}

async function compareServedFiles(headers) {
  const compared = [];
  for (const relativePath of SERVED_FILE_CHECKS) {
    const localPath = path.resolve(process.cwd(), relativePath);
    const requestPath = `${EXTENSION_PATH}/${relativePath.replace(/\\/g, '/')}`;
    const record = {
      relativePath,
      requestPath,
      localExists: fs.existsSync(localPath),
      servedOk: false,
      status: null,
      localSha256: null,
      servedSha256: null,
      matches: null,
      error: null
    };
    if (record.localExists) record.localSha256 = fileSha256(localPath);
    try {
      const served = await fetchText({
        baseUrl: BASE_URL,
        requestPath,
        headers,
        timeoutMs: TIMEOUT_MS
      });
      record.status = served.status;
      record.servedOk = served.ok;
      if (served.ok) {
        record.servedSha256 = sha256Text(served.text);
        record.matches = record.localSha256 ? record.localSha256 === record.servedSha256 : null;
      } else {
        record.error = `HTTP ${served.status}: ${compact(served.text, 240)}`;
      }
    } catch (error) {
      record.error = error?.message || String(error);
    }
    compared.push(record);
  }
  const mismatches = compared.filter((entry) => entry.matches === false);
  const servedFailures = compared.filter((entry) => !entry.servedOk);
  const missingLocal = compared.filter((entry) => !entry.localExists);
  return {
    ok: mismatches.length === 0 && servedFailures.length === 0 && missingLocal.length === 0,
    checkedCount: compared.length,
    mismatchCount: mismatches.length,
    servedFailureCount: servedFailures.length,
    missingLocalCount: missingLocal.length,
    compared
  };
}

async function runBrowserProof(page, runId) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await page.waitForLoadState('networkidle', { timeout: TIMEOUT_MS }).catch(() => {});

  return page.evaluate(async ({
    extensionPath,
    runId,
    packagePath,
    projectionPath,
    crewDatasetPath,
    missionGraphPath,
    shipDatasetPath
  }) => {
    const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const jsonText = (value) => JSON.stringify(value);
    const fetchJson = async (relativePath) => {
      const response = await fetch(`${extensionPath}/${relativePath}`, {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`GET ${relativePath} failed with ${response.status}: ${text.slice(0, 240)}`);
      }
      return JSON.parse(text);
    };
    const importServed = (relativePath) => import(`${extensionPath}/${relativePath}?directiveShipDatasetLive=${encodeURIComponent(runId)}`);

    const packageData = await fetchJson(packagePath);
    const projectionData = await fetchJson(projectionPath);
    const crewDataset = await fetchJson(crewDatasetPath);
    const missionGraph = await fetchJson(missionGraphPath);
    const shipDataset = await fetchJson(shipDatasetPath);

    const promptMod = await importServed('src/generation/player-safe-prompt-context-builder.mjs');
    const factIndexMod = await importServed('src/continuity/fact-index.mjs');
    const sourceFrameMod = await importServed('src/continuity/source-frame.mjs');
    const contradictionMod = await importServed('src/continuity/contradiction-guard.mjs');
    const retrievalMod = await importServed('src/retrieval/packet-builder.mjs');
    const stateDeltaMod = await importServed('src/runtime/state-delta-gateway.mjs');

    let campaignState = stateDeltaMod.initializeCampaignRuntimeTracking(clone(projectionData.initialState));
    campaignState.campaign = {
      ...(campaignState.campaign || {}),
      id: 'campaign-live-intrepid-ship-dataset',
      title: 'Ashes of Peace',
      packageId: packageData.manifest?.id || null,
      status: 'active'
    };
    campaignState.player = {
      ...(campaignState.player || {}),
      id: 'player-live-intrepid-proof',
      name: 'Commander Serrin',
      rank: 'Commander',
      billet: 'Executive Officer',
      species: { label: 'Human' }
    };
    campaignState.ship = {
      ...(campaignState.ship || {}),
      id: 'uss-breckenridge',
      name: 'U.S.S. Breckenridge',
      class: 'Intrepid-class',
      travelContinuity: clone(packageData.ship?.travelContinuity || {})
    };
    campaignState.mission = {
      ...(campaignState.mission || {}),
      activePhaseId: 'shuttle-rendezvous',
      phase: 'shuttle-rendezvous',
      availableDecisionPointIds: ['decision.arrival-tone']
    };
    campaignState.worldState = {
      ...(campaignState.worldState || {}),
      currentLocationId: 'intrepid.shuttlebay-complex',
      currentStardate: 53049.2
    };
    campaignState.campaignChatBinding = {
      hostId: 'sillytavern-live-readonly',
      chatId: 'readonly-intrepid-ship-dataset-proof',
      promptContextRevision: 0
    };

    const playerText = 'I head to the shuttlebay and ask shuttle control to confirm the Intrepid-class bay location before launch.';
    const scene = {
      missionTitle: 'Prelude: A Ship Underway',
      phaseLabel: 'Shuttle rendezvous',
      activePhaseId: 'shuttle-rendezvous',
      phaseId: 'shuttle-rendezvous',
      location: 'Shuttlebay',
      locationId: 'intrepid.shuttlebay-complex',
      currentQuestion: 'How should the new XO treat the shuttle arrival?',
      immediateStakes: 'The first command beat depends on correct ship geometry.',
      presentCharacterIds: ['player-commander'],
      availableDecisionPointIds: ['decision.arrival-tone']
    };

    const playerProjection = promptMod.createPlayerSafeCampaignProjection({
      campaignState,
      packageData,
      crewDataset,
      shipDataset,
      scene
    });
    const packet = promptMod.buildPlayerSafePromptContext({
      campaignState,
      packageData,
      crewDataset,
      shipDataset,
      scene,
      playerText,
      createdAt: '2026-06-27T00:00:00.000Z'
    });
    const factIndex = factIndexMod.buildContinuityFactIndex({
      campaignState,
      packageData,
      crewDataset,
      shipDataset,
      campaignProjection: projectionData
    });
    const sourceFrame = sourceFrameMod.buildContinuitySourceFrame({
      campaignState,
      packageData,
      crewDataset,
      shipDataset,
      campaignProjection: projectionData,
      scene,
      playerText
    });
    const retrieval = retrievalMod.runDirectorRetrieval({
      crewDataset,
      shipDataset,
      missionGraph,
      sceneSnapshot: {
        campaignId: 'ashes-of-peace',
        missionId: 'prelude-a-ship-underway',
        activePhaseId: 'shuttle-rendezvous',
        phaseId: 'shuttle-rendezvous',
        locationId: 'intrepid.shuttlebay-complex',
        playerInput: playerText,
        presentCharacters: ['player-commander'],
        audiences: ['missionDirector', 'shipDirector', 'narrator']
      },
      campaignState,
      intentParse: {
        primaryIntent: 'establish-arrival-tone'
      },
      turnId: 'turn.live.intrepid.ship-dataset',
      outcomeId: 'outcome.live.intrepid.ship-dataset'
    });
    const contradictionReview = contradictionMod.reviewContinuityContradictions({
      text: 'The shuttle Rangiroa matched velocity at two thousand meters, and the Breckenridge shuttlebay doors opened in the underside of the saucer.',
      campaignState,
      packageData,
      crewDataset,
      shipDataset,
      campaignProjection: projectionData
    });

    const packetJson = jsonText(packet);
    const projectionJson = jsonText(playerProjection);
    const factSummary = factIndex.facts.map((fact) => ({
      id: fact.id,
      kind: fact.kind,
      predicate: fact.predicate,
      summary: fact.summary,
      tags: fact.tags || []
    }));
    const shuttlebayFacts = factSummary.filter((fact) => /shuttle|shuttlebay|saucer|deck 10/i.test(jsonText(fact)));
    const narratorCards = retrieval.packets?.narrator?.cardIds || [];
    const shipDirectorCards = retrieval.packets?.shipDirector?.cardIds || [];
    const hydratedShuttlebay = retrieval.packets?.narrator?.hydratedCards?.find((card) => card.id === 'ship.intrepid.location.shuttlebay') || null;

    return {
      packageId: packageData.manifest?.id || null,
      shipDataset: {
        id: shipDataset.manifest?.id || null,
        packageId: shipDataset.manifest?.packageId || null,
        shipId: shipDataset.manifest?.shipId || null,
        classId: shipDataset.manifest?.classId || null,
        areaCount: Array.isArray(shipDataset.areas) ? shipDataset.areas.length : 0,
        systemCount: Array.isArray(shipDataset.systems) ? shipDataset.systems.length : 0,
        cardCount: Array.isArray(shipDataset.cards) ? shipDataset.cards.length : 0
      },
      prompt: {
        blockCount: packet.blocks?.length || 0,
        hash: packet.hash || null,
        hasDeck10: /Deck 10 aft dorsal secondary hull/i.test(packetJson),
        hasSaucerGuard: /saucer-underside|underside of the saucer|ventral primary hull/i.test(packetJson),
        guardFactIds: packet.continuityProjection?.plan?.guardFactIds || [],
        selectedFactIds: packet.continuityProjection?.plan?.selectedFactIds || []
      },
      playerProjection: {
        hasDeck10: /Deck 10 aft dorsal secondary hull/i.test(projectionJson),
        hasSaucerGuard: /saucer-underside|underside of the saucer|ventral primary hull/i.test(projectionJson),
        shuttlebayAnchor: playerProjection.ship?.layoutAnchors?.find((anchor) => anchor.id === 'intrepid.shuttlebay-complex') || null
      },
      sourceFrame: {
        shipDatasetRevision: sourceFrame.shipDatasetRevision || null,
        shipDatasetId: sourceFrame.shipDatasetId || null,
        shipId: sourceFrame.shipId || null,
        shipClassId: sourceFrame.shipClassId || null,
        areaIds: sourceFrame.shipDatasetAreaIds || [],
        systemIds: sourceFrame.shipDatasetSystemIds || []
      },
      factIndex: {
        sourceCount: factIndex.sourceCount,
        acceptedCount: factIndex.acceptedCount,
        shuttlebayFacts
      },
      retrieval: {
        narratorCards,
        shipDirectorCards,
        hydratedShuttlebayGuidance: hydratedShuttlebay?.guidance || null
      },
      contradictionReview: {
        ok: contradictionReview.ok,
        checkedFactCount: contradictionReview.checkedFactCount,
        findings: contradictionReview.findings
      }
    };
  }, {
    extensionPath: EXTENSION_PATH,
    runId,
    packagePath: PACKAGE_PATH,
    projectionPath: PROJECTION_PATH,
    crewDatasetPath: CREW_DATASET_PATH,
    missionGraphPath: MISSION_GRAPH_PATH,
    shipDatasetPath: SHIP_DATASET_PATH
  });
}

async function main() {
  assert.ok(BASE_URL, 'SILLYTAVERN_BASE_URL or ST_BASE_URL is required.');
  assert.ok(ST_USER, 'DIRECTIVE_SILLYTAVERN_USER or DIRECTIVE_SOAK_ST_USER is required for the live ship dataset smoke.');

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const auth = await authenticateSillyTavernUser({
    baseUrl: BASE_URL,
    handle: ST_USER,
    password: configuredUserPassword(ST_USER),
    timeoutMs: TIMEOUT_MS
  });
  assert.equal(auth.ok, true, `Could not authenticate SillyTavern user ${ST_USER}: ${auth.error || auth.loginStatus || 'unknown error'}`);

  const servedFiles = await compareServedFiles(auth.headers);
  assert.equal(servedFiles.ok, true, `Served Directive ship-dataset files did not match checkout: ${compact(servedFiles, 2000)}`);

  const launched = await launchPlaywrightBrowser({ headless: HEADLESS, timeoutMs: TIMEOUT_MS });
  assert.equal(launched.ok, true, `Could not launch Playwright Chromium: ${launched.error?.message || compact(launched)}`);

  const cookies = cookieHeaderToPlaywrightCookies(auth.headers.Cookie || auth.headers.cookie || '');
  assert.ok(cookies.length > 0, `SillyTavern user ${ST_USER} authentication did not return a session cookie.`);

  const browser = launched.browser;
  let context = null;
  try {
    context = await browser.newContext();
    await context.addCookies(cookies);
    const page = await context.newPage();
    const browserProof = await runBrowserProof(page, runId);

    assert.equal(browserProof.shipDataset.id, 'breckenridge.intrepid-class');
    assert.equal(browserProof.shipDataset.packageId, 'directive:campaign-package:breckenridge-ashes-of-peace');
    assert.equal(browserProof.shipDataset.shipId, 'uss-breckenridge');
    assert.equal(browserProof.shipDataset.classId, 'intrepid-class');
    assert.ok(browserProof.shipDataset.areaCount >= 15, 'Ship dataset should expose rich area coverage.');
    assert.ok(browserProof.shipDataset.systemCount >= 8, 'Ship dataset should expose rich system coverage.');
    assert.ok(browserProof.shipDataset.cardCount >= 8, 'Ship dataset should expose director cards.');

    assert.equal(browserProof.playerProjection.hasDeck10, true, 'Player-safe projection did not expose Deck 10 shuttlebay placement.');
    assert.equal(browserProof.playerProjection.hasSaucerGuard, true, 'Player-safe projection did not expose the saucer-underside guard.');
    assert.equal(browserProof.prompt.hasDeck10, true, 'Prompt packet did not contain Deck 10 shuttlebay placement.');
    assert.equal(browserProof.prompt.hasSaucerGuard, true, 'Prompt packet did not contain the saucer-underside guard.');
    assert.equal(browserProof.sourceFrame.shipDatasetId, 'breckenridge.intrepid-class');
    assert.equal(browserProof.sourceFrame.areaIds.includes('intrepid.shuttlebay-complex'), true);
    assert.equal(browserProof.sourceFrame.systemIds.includes('intrepid.variable-geometry-nacelles'), true);
    assert.equal(
      browserProof.factIndex.shuttlebayFacts.some((fact) => fact.id.endsWith('.not-saucer-underside')),
      true,
      'Continuity fact index did not materialize the shuttlebay contradiction guard.'
    );
    assert.deepEqual(browserProof.retrieval.narratorCards.slice(0, 2), [
      'ship.intrepid.exterior.shuttle-approach',
      'ship.intrepid.location.shuttlebay'
    ]);
    assert.equal(browserProof.retrieval.shipDirectorCards.includes('ship.intrepid.location.shuttlebay'), true);
    assert.match(JSON.stringify(browserProof.retrieval.hydratedShuttlebayGuidance), /Deck 10 aft dorsal secondary hull/i);
    assert.match(JSON.stringify(browserProof.retrieval.hydratedShuttlebayGuidance), /saucer-underside|ventral primary-hull|underside of the saucer/i);
    assert.equal(browserProof.contradictionReview.ok, false, 'Contradiction review should reject saucer-underside shuttlebay prose.');
    assert.equal(
      browserProof.contradictionReview.findings.some((finding) => finding.kind === 'ship-layout-contradiction'),
      true,
      'Contradiction review did not report a ship-layout contradiction.'
    );

    const report = {
      ok: true,
      runId,
      baseUrl: BASE_URL,
      extensionPath: EXTENSION_PATH,
      user: ST_USER,
      servedFiles: {
        ok: servedFiles.ok,
        checkedCount: servedFiles.checkedCount,
        mismatchCount: servedFiles.mismatchCount,
        servedFailureCount: servedFiles.servedFailureCount
      },
      browserProof
    };
    writeJsonFile(path.join(ARTIFACT_DIR, 'ship-dataset-live-report.json'), report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

try {
  await main();
} catch (error) {
  const report = {
    ok: false,
    baseUrl: BASE_URL,
    extensionPath: EXTENSION_PATH,
    user: ST_USER || null,
    error: errorSummary(error)
  };
  writeJsonFile(path.join(ARTIFACT_DIR, 'ship-dataset-live-report.json'), report);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
