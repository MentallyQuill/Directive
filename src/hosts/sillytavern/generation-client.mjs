import { createSillyTavernNarrationProvider } from './narration-provider.mjs';

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
  if (typeof value?.choices?.[0]?.message?.content === 'string') return value.choices[0].message.content.trim();
  if (typeof value?.choices?.[0]?.text === 'string') return value.choices[0].text.trim();
  return '';
}

function defaultContextFactory() {
  return globalThis.SillyTavern?.getContext?.() || null;
}

function promptFromRequest(request = {}) {
  if (typeof request.prompt === 'string' && request.prompt.trim()) {
    return request.prompt;
  }
  if (Array.isArray(request.messages) && request.messages.length > 0) {
    return request.messages
      .map((message) => `${message.role || 'user'}: ${message.content || ''}`)
      .join('\n');
  }
  return JSON.stringify(request, null, 2);
}

async function callSillyTavernGeneration(context, request) {
  const prompt = promptFromRequest(request);
  if (typeof context.generateRaw === 'function') {
    return context.generateRaw(prompt);
  }
  if (typeof context.generate === 'function') {
    return context.generate(prompt);
  }
  if (typeof context.generateText === 'function') {
    return context.generateText({
      ...request,
      prompt
    });
  }
  throw providerUnavailable('SillyTavern context does not expose a supported generation method.');
}

export function createSillyTavernGenerationClient({
  contextFactory = defaultContextFactory,
  narrationProvider = null
} = {}) {
  const narrator = narrationProvider || createSillyTavernNarrationProvider({ contextFactory });

  async function generate(roleId, request = {}) {
    if (roleId === 'narration') {
      return narrator.generateNarration(request);
    }
    const context = contextFactory();
    if (!context) {
      throw providerUnavailable('SillyTavern context is not available for generation.');
    }
    const response = await callSillyTavernGeneration(context, request);
    return {
      providerId: 'sillytavern-current-provider',
      roleId,
      text: normalizeText(response),
      raw: cloneJson(response)
    };
  }

  return {
    id: 'sillytavern-generation-client',
    generate,
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
