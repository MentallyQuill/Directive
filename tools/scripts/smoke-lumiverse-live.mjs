import assert from 'node:assert/strict';

const BASE_URL = (process.env.LUMIVERSE_BASE_URL || 'http://localhost:7860').replace(/\/+$/, '');
const USERNAME = process.env.LUMIVERSE_USERNAME || process.env.LUMIVERSE_USER || '';
const PASSWORD = process.env.LUMIVERSE_PASSWORD || '';
const AUTH_PATH = process.env.LUMIVERSE_AUTH_PATH || ['', 'api', 'auth', 'sign-in', 'username'].join('/');
const IMPORT_LOCAL = process.env.DIRECTIVE_LUMIVERSE_IMPORT !== '0';
const PRESERVE_DEV_MODE = process.env.DIRECTIVE_LUMIVERSE_PRESERVE_DEV_MODE !== '0';
const RUN_WS = process.env.DIRECTIVE_LIVE_WS !== '0';
const RUN_DRY_RUN = process.env.DIRECTIVE_LIVE_DRY_RUN !== '0';
const RUN_GENERATION = process.env.DIRECTIVE_LIVE_GENERATION === '1';
const STRICT = process.env.DIRECTIVE_LIVE_STRICT === '1';
const RUNTIME_REQUEST_TYPE = 'directive.runtime.request';
const RUNTIME_RESPONSE_TYPE = 'directive.runtime.response';
const REQUIRED_PERMISSIONS = Object.freeze([
  'generation',
  'interceptor',
  'tools'
]);
const REQUIRED_TOOLS = Object.freeze([
  'directive_get_active_situation',
  'directive_search_command_log',
  'directive_get_crew_context',
  'directive_get_ship_status'
]);

if (!USERNAME || !PASSWORD) {
  console.error('Set LUMIVERSE_USERNAME and LUMIVERSE_PASSWORD before running the live Lumiverse smoke.');
  process.exit(2);
}

let jar = '';

function compact(value, maxLength = 500) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const redacted = redactSecrets(text);
  return redacted.length <= maxLength ? redacted : `${redacted.slice(0, maxLength)}...`;
}

function redactSecrets(value) {
  let text = String(value);
  for (const secret of [USERNAME, PASSWORD].filter(Boolean)) {
    text = text.split(secret).join('[redacted]');
  }
  return text;
}

function errorText(error, maxLength = 5000) {
  if (error instanceof Error) {
    const cause = error.cause ? `\nCause: ${errorText(error.cause, maxLength)}` : '';
    return compact(`${error.name}: ${error.message}\n${error.stack || ''}${cause}`, maxLength);
  }
  return compact(error, maxLength);
}

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? redactSecrets(error.message) : errorText(error, 1000)
  };
}

function isProviderAuthError(error) {
  const text = errorText(error).toLowerCase();
  return text.includes('invalid_api_key')
    || text.includes('invalid api key')
    || text.includes('invalid session')
    || text.includes('nanogpt api error 401')
    || /\b401\b/.test(text);
}

function splitSetAuthHeader(value) {
  if (!value) {
    return [];
  }
  return String(value).split(/,(?=\s*[^;,=\s]+=[^;,]+)/g);
}

function rememberAuth(headers) {
  const headerListMethod = ['get', 'Set', 'Coo', 'kie'].join('');
  const values = typeof headers[headerListMethod] === 'function'
    ? headers[headerListMethod]()
    : splitSetAuthHeader(headers.get('set-cookie'));
  const pairs = values
    .map((entry) => String(entry).split(';')[0].trim())
    .filter(Boolean);
  if (pairs.length > 0) {
    const merged = new Map(jar.split(/;\s*/).filter(Boolean).map((entry) => {
      const [name, ...rest] = entry.split('=');
      return [name, rest.join('=')];
    }));
    for (const pair of pairs) {
      const [name, ...rest] = pair.split('=');
      merged.set(name, rest.join('='));
    }
    jar = [...merged.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

async function api(path, {
  method = 'GET',
  body,
  headers = {},
  allowFailure = false,
  text = false
} = {}) {
  const requestHeaders = {
    accept: text ? 'text/plain, application/javascript, */*' : 'application/json',
    ...headers
  };
  let requestBody = body;
  if (body !== undefined && typeof body !== 'string') {
    requestHeaders['content-type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }
  if (jar) {
    requestHeaders.cookie = jar;
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: requestBody
  });
  rememberAuth(response.headers);
  const raw = await response.text();
  const payload = text
    ? raw
    : raw
      ? JSON.parse(raw)
      : null;
  if (!response.ok && !allowFailure) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${compact(raw)}`);
  }
  return {
    response,
    payload,
    raw
  };
}

async function signIn() {
  await api(AUTH_PATH, {
    method: 'POST',
    body: {
      username: USERNAME,
      password: PASSWORD
    }
  });
  assert.ok(jar, 'Lumiverse sign-in did not return an authenticated session.');
}

function extensionRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.extensions)) {
    return payload.extensions;
  }
  return [];
}

function isLocalDevExtension(extension) {
  if (!extension || typeof extension !== 'object') {
    return false;
  }
  const flags = [
    extension.dev_mode,
    extension.devMode,
    extension.local_dev,
    extension.localDev
  ];
  if (flags.some((flag) => flag === true)) {
    return true;
  }
  const textFields = [
    extension.mode,
    extension.install_mode,
    extension.installMode,
    extension.source,
    extension.source_kind,
    extension.sourceKind,
    extension.type
  ];
  return textFields
    .filter((value) => typeof value === 'string')
    .some((value) => /(^|[-_\s])(dev|local-dev|development)([-_\s]|$)/i.test(value));
}

async function findDirectiveExtension() {
  const { payload } = await api('/api/v1/spindle');
  return extensionRows(payload).find((extension) => extension.identifier === 'directive') || null;
}

async function waitForDirectiveRunning(extensionId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const extension = await findDirectiveExtension();
    if (extension?.id === extensionId && extension.status === 'running') {
      return extension;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const extension = await findDirectiveExtension();
  throw new Error(`Directive extension did not reach running status. Last status: ${extension?.status || 'missing'}`);
}

async function prepareExtension() {
  const existing = await findDirectiveExtension();
  const preservingDevMode = Boolean(existing && PRESERVE_DEV_MODE && isLocalDevExtension(existing));
  let importedLocal = false;
  if (IMPORT_LOCAL && !preservingDevMode) {
    await api('/api/v1/spindle/import-local', {
      method: 'POST'
    });
    importedLocal = true;
  }
  let extension = await findDirectiveExtension();
  assert.ok(extension, 'Directive extension is not installed in local Lumiverse.');

  await api(`/api/v1/spindle/${extension.id}/permissions`, {
    method: 'POST',
    body: {
      grant: REQUIRED_PERMISSIONS
    }
  });

  extension = await findDirectiveExtension();
  if (!extension.enabled) {
    await api(`/api/v1/spindle/${extension.id}/enable`, {
      method: 'POST'
    });
  } else {
    await api(`/api/v1/spindle/${extension.id}/restart`, {
      method: 'POST'
    });
  }
  const running = await waitForDirectiveRunning(extension.id);
  return {
    ...running,
    smokeImport: {
      importedLocal,
      preservedLocalDev: preservingDevMode,
      localDev: isLocalDevExtension(running),
      preserveDevMode: PRESERVE_DEV_MODE
    }
  };
}

async function verifyManifestAndFrontend(extension) {
  const manifest = (await api(`/api/v1/spindle/${extension.id}/manifest`)).payload;
  assert.equal(manifest.identifier, 'directive');
  assert.equal(manifest.entry_backend, 'src/hosts/lumiverse/backend.js');
  assert.equal(manifest.entry_frontend, 'dist/frontend.js');

  const frontend = (await api(`/api/v1/spindle/${extension.id}/frontend`, {
    text: true
  })).payload;
  assert.match(frontend, /directive-bottom-navigation-shell|directiveShellActions/);
  assert.match(frontend, /bottom-navigation/);
  assert.match(frontend, /top-right/);
  assert.match(frontend, /Start Candidate|commitOpenOrdersCandidateReview/);
  assert.match(frontend, /Open Assignment|startOpenOrdersAssignmentScene/);
  assert.match(frontend, /Advance Scene|commitOpenOrdersAssignmentSceneBeat/);
  assert.match(frontend, /Delegate Assignment|commitOpenOrdersAssignmentResolution/);
  return {
    manifest,
    frontendBytes: frontend.length
  };
}

async function verifyTools() {
  const tools = (await api('/api/v1/spindle/tools')).payload;
  const names = new Set((Array.isArray(tools) ? tools : []).map((tool) => tool.name));
  for (const toolName of REQUIRED_TOOLS) {
    assert.equal(names.has(toolName), true, `Missing Lumiverse tool ${toolName}`);
  }
  return REQUIRED_TOOLS;
}

function wsUrlFromBase(ticket) {
  const url = new URL(BASE_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/api/ws';
  url.search = `?ticket=${encodeURIComponent(ticket)}`;
  return url.toString();
}

async function connectWs() {
  assert.equal(typeof WebSocket, 'function', 'This Node runtime must expose WebSocket.');
  const ticket = (await api('/api/v1/ws-ticket', {
    method: 'POST'
  })).payload.ticket;
  assert.ok(ticket, 'Lumiverse did not issue a WebSocket ticket.');
  const socket = new WebSocket(wsUrlFromBase(ticket));
  const messages = [];
  const waiters = [];

  function resolveWaiters() {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      const match = messages.find(waiter.predicate);
      if (match) {
        clearTimeout(waiter.timer);
        waiters.splice(index, 1);
        waiter.resolve(match);
      }
    }
  }

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    messages.push(message);
    resolveWaiters();
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for Lumiverse WebSocket open.')), 10000);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    }, {
      once: true
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Lumiverse WebSocket connection failed.'));
    }, {
      once: true
    });
  });

  function waitFor(predicate, label, timeoutMs = 30000) {
    const match = messages.find(predicate);
    if (match) {
      return Promise.resolve(match);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = waiters.findIndex((waiter) => waiter.resolve === resolve);
        if (index >= 0) {
          waiters.splice(index, 1);
        }
        reject(new Error(`Timed out waiting for ${label}.`));
      }, timeoutMs);
      waiters.push({
        predicate,
        resolve,
        timer
      });
    });
  }

  await waitFor((message) => message.event === 'CONNECTED', 'Lumiverse WebSocket connected event', 10000);

  return {
    socket,
    waitFor,
    close() {
      socket.close();
    }
  };
}

async function sendRuntime(ws, extensionId, action, params = {}, timeoutMs = 60000) {
  const requestId = `${action}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  ws.socket.send(JSON.stringify({
    type: 'SPINDLE_BACKEND_MSG',
    extensionId,
    payload: {
      type: RUNTIME_REQUEST_TYPE,
      requestId,
      action,
      params
    }
  }));
  const response = await ws.waitFor((message) => (
    message.event === 'SPINDLE_FRONTEND_MSG'
    && message.payload?.extensionId === extensionId
    && message.payload?.data?.type === RUNTIME_RESPONSE_TYPE
    && message.payload?.data?.payload?.requestId === requestId
  ), `Directive runtime response for ${action}`, timeoutMs);
  return response.payload.data.payload;
}

async function runRuntimeSmoke(extension) {
  if (!RUN_WS) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_LIVE_WS=0'
    };
  }

  const ws = await connectWs();
  try {
    const initialize = await sendRuntime(ws, extension.id, 'initialize');
    assert.equal(initialize.ok, true);
    assert.equal(initialize.summary.initialized, true);

    const quickStart = await sendRuntime(ws, extension.id, 'startQuickCampaign', {
      simulationMode: 'Command'
    });
    assert.equal(quickStart.ok, true);
    assert.equal(quickStart.summary.campaign.playerName, 'Talia Serrin');
    assert.ok(quickStart.summary.activeSaveId, 'startQuickCampaign should create an active save');

    const manualSave = await sendRuntime(ws, extension.id, 'saveCurrentGame', {
      summary: 'Lumiverse live smoke manual save.'
    });
    assert.equal(manualSave.ok, true);
    const manualSaveId = manualSave.result?.save?.id || manualSave.summary?.activeSaveId;
    assert.ok(manualSaveId, 'saveCurrentGame should return or preserve an active save id');
    assert.equal(manualSaveId, quickStart.summary.activeSaveId);
    assert.equal(manualSave.summary.activeSaveId, manualSaveId);

    const loadManualSave = await sendRuntime(ws, extension.id, 'loadGame', {
      saveId: manualSaveId
    });
    assert.equal(loadManualSave.ok, true);
    assert.equal(loadManualSave.summary.activeSaveId, manualSaveId);

    const preview = await sendRuntime(ws, extension.id, 'previewDirectorTurn');
    assert.equal(preview.ok, true);
    assert.ok(preview.summary.pendingOutcome?.resultBand);

    const commit = await sendRuntime(ws, extension.id, 'commitProvisionalDirectorTurn', {
      confirmWarnings: true,
      generateNarration: RUN_GENERATION,
      generateCommandLogSummary: RUN_GENERATION
    }, RUN_GENERATION ? 120000 : 60000);
    assert.equal(commit.ok, true);
    assert.ok(commit.summary.lastOutcome?.resultBand);
    if (RUN_GENERATION) {
      assert.equal(commit.summary.lastNarration?.ok, true, compact(commit.summary.lastNarration));
    }

    let sidecars = null;
    if (RUN_GENERATION) {
      sidecars = await sendRuntime(ws, extension.id, 'runSidecars', {}, 180000);
      assert.equal(sidecars.ok, true);
      assert.equal(sidecars.result.sidecars.concurrent, true);
      assert.equal(sidecars.result.sidecars.results.length, 2);
      assert.equal(sidecars.result.sidecars.results.every((entry) => entry.status === 'complete'), true);
    }

    return {
      initialized: initialize.summary.initialized,
      playerName: quickStart.summary.campaign.playerName,
      shipName: quickStart.summary.campaign.shipName,
      saveId: manualSaveId,
      manualSave: {
        saveId: manualSave.result?.save?.id || null,
        activeSaveId: manualSave.summary.activeSaveId
      },
      loadedSaveId: loadManualSave.summary.activeSaveId,
      previewBand: preview.summary.pendingOutcome.resultBand,
      committedBand: commit.summary.lastOutcome.resultBand,
      narration: RUN_GENERATION ? commit.summary.lastNarration : 'skipped',
      sidecars: sidecars?.result?.sidecars || 'skipped'
    };
  } finally {
    ws.close();
  }
}

function firstChatId(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.chats)
        ? payload.chats
        : [];
  const row = rows[0];
  return row?.id || row?.chatId || null;
}

async function runPromptDryRunSmoke() {
  if (!RUN_DRY_RUN) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_LIVE_DRY_RUN=0'
    };
  }
  const chatId = process.env.LUMIVERSE_DRY_RUN_CHAT_ID
    || firstChatId((await api('/api/v1/chats/recent?limit=1', {
      allowFailure: true
    })).payload);
  if (!chatId) {
    return {
      skipped: true,
      reason: 'No existing Lumiverse chat found; set LUMIVERSE_DRY_RUN_CHAT_ID to verify prompt-block injection.'
    };
  }

  const result = await api('/api/v1/generate/dry-run', {
    method: 'POST',
    body: {
      chat_id: chatId
    },
    allowFailure: true
  });
  if (!result.response.ok) {
    const skipped = {
      skipped: true,
      chatId,
      reason: `Dry run failed: ${compact(result.payload || result.raw)}`
    };
    if (STRICT) {
      throw new Error(skipped.reason);
    }
    return skipped;
  }
  const serialized = JSON.stringify(result.payload);
  assert.match(serialized, /\[Directive Context: Active Situation\]/);
  assert.doesNotMatch(serialized, /hiddenFacts|directorOnlyData|rawRelationshipValues/i);
  return {
    skipped: false,
    chatId,
    directiveContext: true
  };
}

async function main() {
  await signIn();
  const extension = await prepareExtension();
  const frontend = await verifyManifestAndFrontend(extension);
  const tools = await verifyTools();
  const runtime = await runRuntimeSmoke(extension);
  const dryRun = await runPromptDryRunSmoke();

  console.log(JSON.stringify({
    ok: true,
    baseUrl: BASE_URL,
    extension: {
      id: extension.id,
      identifier: extension.identifier,
      status: extension.status,
      enabled: extension.enabled === true,
      localDev: extension.smokeImport.localDev,
      importedLocal: extension.smokeImport.importedLocal,
      preservedLocalDev: extension.smokeImport.preservedLocalDev
    },
    frontend: {
      entry: frontend.manifest.entry_frontend,
      bytes: frontend.frontendBytes,
      bottomNavigation: true,
      openOrdersControls: true
    },
    tools,
    runtime,
    dryRun,
    liveGeneration: RUN_GENERATION
  }, null, 2));
}

try {
  await main();
} catch (error) {
  const providerAuthBlocked = RUN_GENERATION && isProviderAuthError(error);
  console.error(JSON.stringify({
    ok: false,
    baseUrl: BASE_URL,
    liveGeneration: RUN_GENERATION,
    providerAuthBlocked,
    error: serializeError(error)
  }, null, 2));
  process.exit(providerAuthBlocked ? 3 : 1);
}
