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
      return {
        kind: 'directive.generationResult',
        ok: true,
        roleId: role.id,
        role,
        response: cloneJson(response),
        diagnostics: {
          startedAt,
          completedAt: timestamp(),
          latencyMs: Math.max(0, Date.now() - started),
          providerId: response?.providerId || response?.provider_id || null,
          model: response?.model || null,
          usage: safeUsage(response)
        }
      };
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
    providerForRole,
    getRole: (roleId) => registry.get(roleId),
    listRoles: () => registry.list()
  };
}
