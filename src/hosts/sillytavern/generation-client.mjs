import { createSillyTavernNarrationProvider } from './narration-provider.mjs';

const OWNED_GENERATION_DEPTH_KEY = '__directiveOwnedGenerationDepth';

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

export function isDirectiveOwnedGeneration() {
  return Number(globalThis[OWNED_GENERATION_DEPTH_KEY] || 0) > 0;
}

async function withOwnedGeneration(task) {
  globalThis[OWNED_GENERATION_DEPTH_KEY] = Number(globalThis[OWNED_GENERATION_DEPTH_KEY] || 0) + 1;
  try {
    return await task();
  } finally {
    globalThis[OWNED_GENERATION_DEPTH_KEY] = Math.max(0, Number(globalThis[OWNED_GENERATION_DEPTH_KEY] || 1) - 1);
  }
}

async function callSillyTavernGeneration(context, request, route = {}) {
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
    return context.generateRaw(rawRequest);
  }
  if (typeof context.generateQuietPrompt === 'function') {
    try {
      return await context.generateQuietPrompt({
        quietPrompt: [request.systemPrompt, prompt].filter(Boolean).join('\n\n'),
        responseLength: maxTokens,
        jsonSchema: request.jsonSchema || null
      });
    } catch {
      return context.generateQuietPrompt([request.systemPrompt, prompt].filter(Boolean).join('\n\n'));
    }
  }
  if (typeof context.generate === 'function') return context.generate(prompt);
  if (typeof context.generateText === 'function') return context.generateText({ ...request, prompt });
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
  narrationProvider = null,
  providerClient = null
} = {}) {
  const narrator = narrationProvider || createSillyTavernNarrationProvider({ contextFactory });

  async function perform(roleId, request) {
    if (providerClient?.generate) {
      return providerClient.generate(roleId, request);
    }
    if (roleId === 'narration' && narrationProvider) {
      return narrator.generateNarration(request);
    }
    const context = contextFactory();
    if (!context) throw providerUnavailable('SillyTavern context is not available for generation.');
    const raw = await callSillyTavernGeneration(context, request);
    return {
      providerId: 'sillytavern-current-provider',
      text: normalizeText(raw),
      raw: cloneJson(raw)
    };
  }

  async function generate(roleId, request = {}) {
    return withOwnedGeneration(async () => {
      let response = await perform(roleId, request);
      let retriedForVisibleOutput = false;
      if (isReasoningOnly(normalizeText(response))) {
        response = await perform(roleId, retryRequest(request));
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
  isDirectiveOwnedGeneration
});
