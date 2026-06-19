import {
  createGenerationRoleRegistry
} from './generation-roles.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireFunction(value, label) {
  if (typeof value !== 'function') {
    throw new Error(`${label} must be a function`);
  }
}

function createTimeoutError(roleId, timeoutMs) {
  const error = new Error(`Generation role "${roleId}" timed out after ${timeoutMs}ms`);
  error.code = 'DIRECTIVE_GENERATION_TIMEOUT';
  error.roleId = roleId;
  error.timeoutMs = timeoutMs;
  return error;
}

async function withTimeout(promise, { roleId, timeoutMs }) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(createTimeoutError(roleId, timeoutMs)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function safeUsage(value) {
  return isObject(value?.usage) ? cloneJson(value.usage) : null;
}

function normalizeGeneratedResponse({
  role,
  response,
  startedAt,
  started,
  completedAt
}) {
  if (response == null || response?.success === false || response?.error) {
    return {
      kind: 'directive.generationResult',
      ok: false,
      roleId: role.id,
      role,
      error: {
        code: response?.error?.code || response?.code || 'DIRECTIVE_GENERATION_FAILED',
        message: response?.error?.message || response?.message || 'Generation failed',
        retryable: role.fallback !== 'skip'
      },
      diagnostics: {
        startedAt,
        completedAt,
        latencyMs: Math.max(0, Date.now() - started),
        providerId: response?.providerId || response?.provider_id || null,
        model: response?.model || null,
        usage: safeUsage(response)
      }
    };
  }
  return {
    kind: 'directive.generationResult',
    ok: true,
    roleId: role.id,
    role,
    response: cloneJson(response),
    diagnostics: {
      startedAt,
      completedAt,
      latencyMs: Math.max(0, Date.now() - started),
      providerId: response?.providerId || response?.provider_id || null,
      model: response?.model || null,
      usage: safeUsage(response)
    }
  };
}

export function createGenerationRouter({
  generationClient,
  roles = null,
  now = null
} = {}) {
  requireObject(generationClient, 'generationClient');
  requireFunction(generationClient.generate, 'generationClient.generate');
  const registry = roles?.get ? roles : createGenerationRoleRegistry(roles || {});

  function timestamp() {
    return typeof now === 'function' ? now() : (now || new Date().toISOString());
  }

  async function generate(roleId, request = {}, options = {}) {
    const role = registry.get(roleId);
    const timeoutMs = Math.max(1, Number(options.timeoutMs ?? role.timeoutMs));
    const startedAt = timestamp();
    const started = Date.now();
    try {
      const response = await withTimeout(
        generationClient.generate(role.id, {
          ...cloneJson(request),
          role: cloneJson(role)
        }),
        { roleId: role.id, timeoutMs }
      );
      return normalizeGeneratedResponse({
        role,
        response,
        startedAt,
        started,
        completedAt: timestamp()
      });
    } catch (error) {
      return {
        kind: 'directive.generationResult',
        ok: false,
        roleId: role.id,
        role,
        error: {
          code: error?.code || 'DIRECTIVE_GENERATION_FAILED',
          message: error?.message || String(error),
          retryable: role.fallback !== 'skip'
        },
        diagnostics: {
          startedAt,
          completedAt: timestamp(),
          latencyMs: Math.max(0, Date.now() - started),
          providerId: null,
          model: null,
          usage: null
        }
      };
    }
  }

  async function batch(requests = [], options = {}) {
    const normalized = (Array.isArray(requests) ? requests : []).map((entry) => {
      const role = registry.get(entry.roleId || entry.role?.id);
      return {
        role,
        request: cloneJson(entry.request || {}),
        timeoutMs: Math.max(1, Number(entry.timeoutMs ?? role.timeoutMs))
      };
    });
    if (normalized.length === 0) {
      return [];
    }
    if (typeof generationClient.batch !== 'function') {
      return Promise.all(normalized.map((entry) => generate(entry.role.id, entry.request, {
        timeoutMs: entry.timeoutMs
      })));
    }

    const startedAt = timestamp();
    const started = Date.now();
    const timeoutMs = Math.max(...normalized.map((entry) => entry.timeoutMs));
    try {
      const responses = await withTimeout(
        generationClient.batch(normalized.map((entry) => ({
          ...cloneJson(entry.request),
          role: cloneJson(entry.role),
          roleId: entry.role.id
        })), {
          concurrent: options.concurrent === true
        }),
        { roleId: 'batch', timeoutMs }
      );
      const completedAt = timestamp();
      return normalized.map((entry, index) => normalizeGeneratedResponse({
        role: entry.role,
        response: responses?.[index],
        startedAt,
        started,
        completedAt
      }));
    } catch (error) {
      const completedAt = timestamp();
      return normalized.map((entry) => ({
        kind: 'directive.generationResult',
        ok: false,
        roleId: entry.role.id,
        role: entry.role,
        error: {
          code: error?.code || 'DIRECTIVE_GENERATION_BATCH_FAILED',
          message: error?.message || String(error),
          retryable: entry.role.fallback !== 'skip'
        },
        diagnostics: {
          startedAt,
          completedAt,
          latencyMs: Math.max(0, Date.now() - started),
          providerId: null,
          model: null,
          usage: null
        }
      }));
    }
  }

  function providerForRole(roleId) {
    const role = registry.get(roleId);
    return {
      id: `directive-generation-role:${role.id}`,
      async generateNarration(request = {}) {
        const result = await generate(role.id, request);
        if (!result.ok) {
          const error = new Error(result.error.message);
          error.code = result.error.code;
          throw error;
        }
        return result.response;
      }
    };
  }

  return {
    generate,
    batch,
    providerForRole,
    getRole: (roleId) => registry.get(roleId),
    listRoles: () => registry.list()
  };
}
