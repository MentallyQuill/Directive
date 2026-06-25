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

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function requestHash(request = {}) {
  try {
    return fnv1a(JSON.stringify(request || {}));
  } catch {
    return fnv1a('[unserializable-request]');
  }
}

function normalizeProviderKindOverride(value = '') {
  const kind = String(value || '').trim().toLowerCase();
  return ['utility', 'reasoning'].includes(kind) ? kind : null;
}

function normalizeGeneratedResponse({
  role,
  response,
  startedAt,
  started,
  completedAt
}) {
  const effectiveRole = {
    ...role,
    providerKind: response?.providerKind || response?.configuration?.providerKind || role.providerKind
  };
  if (response == null || response?.success === false || response?.error) {
    return {
      kind: 'directive.generationResult',
      ok: false,
      roleId: effectiveRole.id,
      role: effectiveRole,
      error: {
        code: response?.error?.code || response?.code || 'DIRECTIVE_GENERATION_FAILED',
        message: response?.error?.message || response?.message || 'Generation failed',
        retryable: effectiveRole.fallback !== 'skip'
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
    roleId: effectiveRole.id,
    role: effectiveRole,
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
  now = null,
  onModelCall = null
} = {}) {
  requireObject(generationClient, 'generationClient');
  requireFunction(generationClient.generate, 'generationClient.generate');
  const registry = roles?.get ? roles : createGenerationRoleRegistry(roles || {});

  function timestamp() {
    return typeof now === 'function' ? now() : (now || new Date().toISOString());
  }

  function finalizeGenerationResult(result, request = {}) {
    const hash = requestHash(request);
    const finalized = {
      ...result,
      diagnostics: {
        ...(result.diagnostics || {}),
        requestHash: hash
      }
    };
    try {
      onModelCall?.({
        roleId: finalized.roleId,
        providerKind: finalized.role?.providerKind || null,
        status: finalized.ok ? 'ok' : 'failed',
        ok: finalized.ok === true,
        providerId: finalized.diagnostics?.providerId || null,
        model: finalized.diagnostics?.model || null,
        latencyMs: finalized.diagnostics?.latencyMs ?? null,
        requestHash: hash,
        retryable: finalized.error?.retryable === true,
        errorCode: finalized.error?.code || null,
        fallback: finalized.role?.fallback || null,
        structuredOutput: finalized.role?.structuredOutput === true,
        mayProposeState: finalized.role?.mayProposeState === true,
        mayInjectPrompt: finalized.role?.mayInjectPrompt === true,
        blocking: finalized.role?.blocking === true,
        metadata: cloneJson(request.metadata || null)
      });
    } catch {
      // Model-call diagnostics are best-effort and must never affect generation.
    }
    return finalized;
  }

  async function generate(roleId, request = {}, options = {}) {
    const baseRole = registry.get(roleId);
    const providerKindOverride = normalizeProviderKindOverride(options.providerKind);
    const role = providerKindOverride
      ? { ...baseRole, providerKind: providerKindOverride }
      : baseRole;
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
      return finalizeGenerationResult(normalizeGeneratedResponse({
        role,
        response,
        startedAt,
        started,
        completedAt: timestamp()
      }), request);
    } catch (error) {
      const effectiveRole = {
        ...role,
        providerKind: error?.providerKind || role.providerKind
      };
      return finalizeGenerationResult({
        kind: 'directive.generationResult',
        ok: false,
        roleId: effectiveRole.id,
        role: effectiveRole,
        error: {
          code: error?.code || 'DIRECTIVE_GENERATION_FAILED',
          message: error?.message || String(error),
          retryable: effectiveRole.fallback !== 'skip'
        },
        diagnostics: {
          startedAt,
          completedAt: timestamp(),
          latencyMs: Math.max(0, Date.now() - started),
          providerId: null,
          model: null,
          usage: null
        }
      }, request);
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
    const timeoutMs = normalized.reduce((total, entry) => total + entry.timeoutMs, 0);
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
      return normalized.map((entry, index) => finalizeGenerationResult(normalizeGeneratedResponse({
        role: entry.role,
        response: responses?.[index],
        startedAt,
        started,
        completedAt
      }), entry.request));
    } catch (error) {
      const completedAt = timestamp();
      return normalized.map((entry) => finalizeGenerationResult({
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
      }, entry.request));
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
