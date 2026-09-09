import { assertGenerationActive } from '../../runtime/generation-cancellation.mjs';

const OWNED_GENERATION_DEPTH_KEY = '__directiveOwnedGenerationDepth';
const OWNED_HOST_GENERATION_DEPTH_KEY = '__directiveOwnedHostGenerationDepth';

function providerUnavailable(message) {
  const error = new Error(message);
  error.code = 'DIRECTIVE_PROVIDER_UNAVAILABLE';
  return error;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value?.text === 'string') return value.text.trim();
  if (typeof value?.content === 'string') return value.content.trim();
  if (typeof value?.message === 'string') return value.message.trim();
  if (typeof value?.message?.content === 'string') return value.message.content.trim();
  if (typeof value?.choices?.[0]?.message?.content === 'string') return value.choices[0].message.content.trim();
  if (typeof value?.choices?.[0]?.text === 'string') return value.choices[0].text.trim();
  return '';
}

function defaultContextFactory() {
  return globalThis.SillyTavern?.getContext?.() || null;
}

function promptFromRequest(request = {}) {
  if (typeof request.prompt === 'string' && request.prompt.trim()) return request.prompt;
  if (Array.isArray(request.messages) && request.messages.length > 0) {
    return request.messages
      .map((message) => `${message.role || 'user'}: ${message.content || ''}`)
      .join('\n');
  }
  return JSON.stringify(request, null, 2);
}

function isReasoningOnly(text) {
  const source = String(text || '').trim();
  if (!source) return true;
  const withoutThinking = source
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
    .trim();
  return withoutThinking.length === 0;
}

function isAbortLikeError(error) {
  return error?.code === 'DIRECTIVE_GENERATION_ABORTED'
    || error?.name === 'AbortError'
    || error?.code === 'ABORT_ERR';
}

export function isDirectiveOwnedGeneration() {
  return Number(globalThis[OWNED_GENERATION_DEPTH_KEY] || 0) > 0;
}

export function isDirectiveOwnedHostGeneration() {
  return Number(globalThis[OWNED_HOST_GENERATION_DEPTH_KEY] || 0) > 0;
}

async function withOwnedGeneration(task) {
  globalThis[OWNED_GENERATION_DEPTH_KEY] = Number(globalThis[OWNED_GENERATION_DEPTH_KEY] || 0) + 1;
  try {
    return await task();
  } finally {
    globalThis[OWNED_GENERATION_DEPTH_KEY] = Math.max(0, Number(globalThis[OWNED_GENERATION_DEPTH_KEY] || 1) - 1);
  }
}

async function withOwnedHostGeneration(task) {
  globalThis[OWNED_HOST_GENERATION_DEPTH_KEY] = Number(globalThis[OWNED_HOST_GENERATION_DEPTH_KEY] || 0) + 1;
  try {
    return await task();
  } finally {
    globalThis[OWNED_HOST_GENERATION_DEPTH_KEY] = Math.max(
      0,
      Number(globalThis[OWNED_HOST_GENERATION_DEPTH_KEY] || 1) - 1
    );
  }
}

function reportAttempt(callback, attempt = null) {
  if (typeof callback !== 'function') return;
  try {
    Promise.resolve(callback(attempt)).catch(() => null);
  } catch {
    // Attempt reporting is presentation-only.
  }
}

async function callSillyTavernGeneration(context, request, route = {}, onAttempt = null, allowCompatibilityRetry = true) {
  assertGenerationActive(request.signal);
  const prompt = promptFromRequest(request);
  const maxTokens = request.parameters?.max_tokens
    || request.max_tokens
    || request.maxTokens
    || route.maxTokens
    || null;

  if (typeof context.generateRaw === 'function') {
    const rawRequest = {
      prompt,
      responseLength: maxTokens,
      jsonSchema: request.jsonSchema || null
    };
    if (route.temperature !== undefined) rawRequest.temperature = route.temperature;
    if (route.topP !== undefined) rawRequest.top_p = route.topP;
    if (request.systemPrompt) rawRequest.systemPrompt = request.systemPrompt;
    if (request.signal) rawRequest.signal = request.signal;
    reportAttempt(onAttempt);
    return context.generateRaw(rawRequest);
  }
  if (typeof context.generateQuietPrompt === 'function') {
    try {
      reportAttempt(onAttempt);
      return await context.generateQuietPrompt({
        quietPrompt: [request.systemPrompt, prompt].filter(Boolean).join('\n\n'),
        responseLength: maxTokens,
        jsonSchema: request.jsonSchema || null,
        ...(request.signal ? { signal: request.signal } : {})
      });
    } catch (error) {
      assertGenerationActive(request.signal);
      if (isAbortLikeError(error) || !allowCompatibilityRetry) throw error;
      reportAttempt(onAttempt);
      return context.generateQuietPrompt([request.systemPrompt, prompt].filter(Boolean).join('\n\n'));
    }
  }
  if (typeof context.generate === 'function') {
    reportAttempt(onAttempt);
    return context.generate([request.systemPrompt, prompt].filter(Boolean).join('\n\n'));
  }
  if (typeof context.generateText === 'function') {
    reportAttempt(onAttempt);
    return context.generateText({ ...request, prompt });
  }
  throw providerUnavailable('SillyTavern context does not expose a supported generation method.');
}

function retryRequest(request = {}) {
  const suffix = '\n\nReturn the final visible answer now. Do not return private reasoning, analysis tags, or planning notes.';
  if (Array.isArray(request.messages) && request.messages.length) {
    return {
      ...request,
      messages: [
        ...request.messages,
        { role: 'user', content: suffix.trim() }
      ]
    };
  }
  return { ...request, prompt: `${promptFromRequest(request)}${suffix}` };
}

export function createSillyTavernGenerationClient({
  contextFactory = defaultContextFactory,
  providerClient = null
} = {}) {
  async function perform(roleId, request, options = {}) {
    if (providerClient?.generate) {
      return providerClient.generate(roleId, request, options);
    }
    const context = contextFactory();
    if (!context) throw providerUnavailable('SillyTavern context is not available for generation.');
    const raw = await withOwnedHostGeneration(() => callSillyTavernGeneration(
      context,
      options.signal ? { ...request, signal: options.signal } : request,
      {},
      options.onAttempt,
      options.allowVisibleOutputRetry !== false
    ));
    return {
      providerId: 'sillytavern-current-provider',
      text: normalizeText(raw),
      raw: cloneJson(raw)
    };
  }

  async function generate(roleId, request = {}, options = {}) {
    return withOwnedGeneration(async () => {
      let physicalAttempt = 0;
      const routedOptions = {
        ...options,
        ...(typeof options.onAttempt === 'function'
          ? { onAttempt: () => reportAttempt(options.onAttempt, ++physicalAttempt) }
          : {}),
      };
      const performAttempt = async (attemptRequest) => {
        const signal = options.signal || attemptRequest.signal;
        assertGenerationActive(signal);
        const result = await perform(roleId, attemptRequest, routedOptions);
        assertGenerationActive(signal);
        return result;
      };
      let response = await performAttempt(request);
      let retriedForVisibleOutput = false;
      if (options.allowVisibleOutputRetry !== false && isReasoningOnly(normalizeText(response))) {
        response = await performAttempt(retryRequest(request));
        retriedForVisibleOutput = true;
      }
      const text = normalizeText(response);
      if (!text) {
        const error = providerUnavailable('Generation provider returned no visible text.');
        error.code = 'DIRECTIVE_PROVIDER_EMPTY_RESPONSE';
        throw error;
      }
      return {
        ...response,
        text,
        roleId,
        retriedForVisibleOutput
      };
    });
  }

  async function batch(requests = [], options = {}) {
    const entries = Array.isArray(requests) ? requests : [];
    if (options.concurrent === true) {
      return Promise.all(entries.map((entry) => generate(entry.roleId || entry.role?.id || 'unknown', entry)));
    }
    const results = [];
    for (const entry of entries) {
      results.push(await generate(entry.roleId || entry.role?.id || 'unknown', entry));
    }
    return results;
  }

  return {
    id: 'sillytavern-generation-client',
    supportsIndependentBackgroundRequests: typeof providerClient?.generate === 'function',
    async generateNarration(request = {}) {
      return withOwnedGeneration(async () => {
        const context = contextFactory();
        if (!context) throw providerUnavailable('SillyTavern context is not available for narration.');
        // Main narration uses the selected chat model, never a structured utility/reasoning profile.
        const messages = Array.isArray(request.messages) ? request.messages : [];
        const nativeRequest = messages.length ? {
          ...request,
          systemPrompt: [request.systemPrompt, ...messages.filter(message => message.role === 'system').map(message => message.content)].filter(Boolean).join('\n\n'),
          prompt: messages.filter(message => message.role !== 'system').map(message => message.content).join('\n\n')
        } : request;
        const raw = await withOwnedHostGeneration(() => callSillyTavernGeneration(context, nativeRequest));
        const text = normalizeText(raw);
        if (!text || isReasoningOnly(text)) throw providerUnavailable('The narration model returned no visible opening.');
        return { text, providerId: 'sillytavern-current-provider', roleId: 'narration' };
      });
    },
    generate,
    batch,
    role(roleId) {
      return {
        id: `sillytavern-role:${roleId}`,
        async generateNarration(request = {}) {
          return generate(roleId, request);
        }
      };
    }
  };
}

export const __sillyTavernGenerationClientTestHooks = Object.freeze({
  callSillyTavernGeneration,
  promptFromRequest,
  normalizeText,
  isReasoningOnly,
  retryRequest,
  isDirectiveOwnedGeneration,
  isDirectiveOwnedHostGeneration
});
