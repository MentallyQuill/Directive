function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireFunction(value, label) {
  if (typeof value !== 'function') {
    throw new Error(`${label} must be a function`);
  }
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value?.content === 'string') return value.content.trim();
  if (typeof value?.text === 'string') return value.text.trim();
  if (typeof value?.message === 'string') return value.message.trim();
  return '';
}

function messagesFromRequest(request = {}) {
  if (Array.isArray(request.messages) && request.messages.length > 0) {
    return cloneJson(request.messages);
  }
  if (typeof request.prompt === 'string' && request.prompt.trim()) {
    return [
      {
        role: 'user',
        content: request.prompt
      }
    ];
  }
  return [
    {
      role: 'user',
      content: JSON.stringify(request, null, 2)
    }
  ];
}

function inputFromRequest(request = {}) {
  const input = {
    messages: messagesFromRequest(request)
  };
  if (request.parameters && typeof request.parameters === 'object') {
    input.parameters = cloneJson(request.parameters);
  }
  if (typeof request.connection_id === 'string') {
    input.connection_id = request.connection_id;
  } else if (typeof request.connectionId === 'string') {
    input.connection_id = request.connectionId;
  }
  if (typeof request.provider === 'string') {
    input.provider = request.provider;
  }
  if (typeof request.model === 'string') {
    input.model = request.model;
  }
  if (typeof request.api_url === 'string') {
    input.api_url = request.api_url;
  } else if (typeof request.apiUrl === 'string') {
    input.api_url = request.apiUrl;
  }
  if (Array.isArray(request.tools)) {
    input.tools = cloneJson(request.tools);
  }
  if (request.signal) {
    input.signal = request.signal;
  }
  return input;
}

function normalizeGenerationResult({ roleId, response, index = null, success = true, error = null }) {
  return {
    providerId: 'lumiverse-spindle',
    roleId,
    index,
    success,
    content: normalizeText(response),
    text: normalizeText(response),
    finishReason: response?.finish_reason || response?.finishReason || null,
    usage: cloneJson(response?.usage || null),
    toolCalls: cloneJson(response?.tool_calls || response?.toolCalls || null),
    error: error ? {
      message: error.message || String(error),
      code: error.code || 'DIRECTIVE_LUMIVERSE_GENERATION_FAILED'
    } : null,
    raw: cloneJson(response)
  };
}

function createUnavailableError(message) {
  const error = new Error(message);
  error.code = 'DIRECTIVE_LUMIVERSE_GENERATION_UNAVAILABLE';
  return error;
}

export function createLumiverseGenerationClient({
  spindle,
  userId = null,
  modeByRole = {},
  defaultMode = 'quiet'
} = {}) {
  requireObject(spindle, 'spindle');
  requireObject(spindle.generate, 'spindle.generate');
  const connectionCache = new Map();

  async function listConnections() {
    if (typeof spindle.connections?.list !== 'function') {
      return [];
    }
    const cacheKey = '__default__';
    if (!connectionCache.has(cacheKey)) {
      connectionCache.set(cacheKey, Promise.resolve(spindle.connections.list(userId || undefined)));
    }
    const value = await connectionCache.get(cacheKey);
    return Array.isArray(value) ? value : [];
  }

  async function getConnection(connectionId) {
    if (!connectionId || typeof spindle.connections?.get !== 'function') {
      return null;
    }
    const cacheKey = `connection:${connectionId}`;
    if (!connectionCache.has(cacheKey)) {
      connectionCache.set(cacheKey, Promise.resolve(spindle.connections.get(connectionId, userId || undefined)));
    }
    return connectionCache.get(cacheKey);
  }

  async function resolveBatchConnection(request = {}) {
    const requestedConnectionId = request.connection_id || request.connectionId || null;
    if (requestedConnectionId) {
      const connection = await getConnection(requestedConnectionId);
      if (connection) {
        return connection;
      }
    }
    const connections = await listConnections();
    return connections.find((connection) => connection?.is_default && connection.provider && connection.model)
      || connections.find((connection) => connection?.provider && connection.model && connection.has_api_key !== false)
      || connections.find((connection) => connection?.provider && connection.model)
      || null;
  }

  async function batchInputFromRequest(request = {}) {
    const input = inputFromRequest(request);
    const connection = await resolveBatchConnection(request);
    if (!connection?.provider || !connection?.model) {
      return null;
    }
    input.connection_id = input.connection_id || connection.id;
    input.provider = input.provider || connection.provider;
    input.model = input.model || connection.model;
    input.api_url = input.api_url || connection.api_url || undefined;
    return input;
  }

  async function generate(roleId, request = {}) {
    const mode = modeByRole[roleId] || defaultMode;
    const input = inputFromRequest(request);
    if (userId) {
      input.userId = userId;
    }
    if (mode === 'raw') {
      requireFunction(spindle.generate.raw, 'spindle.generate.raw');
      return normalizeGenerationResult({
        roleId,
        response: await spindle.generate.raw(input)
      });
    }
    if (mode === 'quiet') {
      requireFunction(spindle.generate.quiet, 'spindle.generate.quiet');
      return normalizeGenerationResult({
        roleId,
        response: await spindle.generate.quiet(input)
      });
    }
    throw createUnavailableError(`Unknown Lumiverse generation mode "${mode}"`);
  }

  async function batch(requests = [], options = {}) {
    requireFunction(spindle.generate.batch, 'spindle.generate.batch');
    const batchInputs = [];
    for (const request of requests) {
      const input = await batchInputFromRequest(request);
      if (!input) {
        return Promise.all(requests.map(async (entry, index) => ({
          ...(await generate(entry.roleId || entry.role?.id || 'unknown', entry)),
          index
        })));
      }
      batchInputs.push(input);
    }
    const response = await spindle.generate.batch({
      requests: batchInputs,
      concurrent: options.concurrent === true,
      ...(userId ? { userId } : {})
    });
    return response.map((result, index) => {
      if (result?.success === false) {
        return normalizeGenerationResult({
          roleId: requests[index]?.roleId || requests[index]?.role?.id || 'unknown',
          response: null,
          index: result.index ?? index,
          success: false,
          error: {
            message: result.error || 'Lumiverse batch generation failed',
            code: 'DIRECTIVE_LUMIVERSE_BATCH_ITEM_FAILED'
          }
        });
      }
      return normalizeGenerationResult({
        roleId: requests[index]?.roleId || requests[index]?.role?.id || 'unknown',
        response: result,
        index: result?.index ?? index,
        success: true
      });
    });
  }

  function observe(chatId) {
    requireFunction(spindle.generate.observe, 'spindle.generate.observe');
    return spindle.generate.observe(chatId);
  }

  return {
    id: 'lumiverse-generation-client',
    generate,
    batch,
    observe
  };
}
