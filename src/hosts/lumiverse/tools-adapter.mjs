const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

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

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeToolName(name) {
  const value = requireNonEmptyString(name, 'tool name');
  if (!TOOL_NAME_PATTERN.test(value)) {
    throw new Error(`Invalid Lumiverse tool name "${value}"`);
  }
  return value;
}

export function normalizeDirectiveToolRegistration(tool = {}) {
  requireObject(tool, 'tool');
  return {
    name: normalizeToolName(tool.name),
    display_name: requireNonEmptyString(tool.display_name || tool.displayName, 'tool display_name'),
    description: requireNonEmptyString(tool.description, 'tool description'),
    parameters: cloneJson(tool.parameters || {
      type: 'object',
      properties: {},
      additionalProperties: false
    }),
    council_eligible: tool.council_eligible === true || tool.councilEligible === true
  };
}

function normalizeInvocationPayload(payload = {}) {
  requireObject(payload, 'tool invocation payload');
  return {
    toolName: normalizeToolName(payload.toolName),
    args: cloneJson(payload.args || {}),
    requestId: payload.requestId || null,
    councilMember: cloneJson(payload.councilMember || null),
    contextMessages: cloneJson(payload.contextMessages || null)
  };
}

export function createLumiverseToolAdapter({ spindle } = {}) {
  requireObject(spindle, 'spindle');
  requireFunction(spindle.registerTool, 'spindle.registerTool');
  requireFunction(spindle.on, 'spindle.on');
  const registeredTools = new Map();
  const handlers = new Map();
  let unsubscribeInvocation = null;

  function ensureInvocationSubscription() {
    if (unsubscribeInvocation) {
      return;
    }
    unsubscribeInvocation = spindle.on('TOOL_INVOCATION', async (payload) => {
      const invocation = normalizeInvocationPayload(payload);
      const handler = handlers.get(invocation.toolName);
      if (!handler) {
        return `Unknown Directive tool: ${invocation.toolName}`;
      }
      try {
        const result = await handler(invocation);
        return typeof result === 'string' ? result : JSON.stringify(result ?? null);
      } catch (error) {
        return `Directive tool ${invocation.toolName} failed: ${error?.message || error}`;
      }
    });
  }

  function registerTool(tool, handler) {
    requireFunction(handler, 'tool handler');
    const registration = normalizeDirectiveToolRegistration(tool);
    spindle.registerTool(registration);
    registeredTools.set(registration.name, cloneJson(registration));
    handlers.set(registration.name, handler);
    ensureInvocationSubscription();
    return registration;
  }

  function unregisterTool(name) {
    const toolName = normalizeToolName(name);
    if (typeof spindle.unregisterTool === 'function') {
      spindle.unregisterTool(toolName);
    }
    registeredTools.delete(toolName);
    handlers.delete(toolName);
  }

  function disposeAll() {
    for (const toolName of [...registeredTools.keys()]) {
      unregisterTool(toolName);
    }
    if (unsubscribeInvocation) {
      unsubscribeInvocation();
      unsubscribeInvocation = null;
    }
  }

  return {
    registerTool,
    unregisterTool,
    disposeAll,
    registeredTools: () => [...registeredTools.values()].map(cloneJson)
  };
}
