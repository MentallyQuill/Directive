import { providerKindForRole } from '../../providers/directive-provider-settings.mjs';
import {
  PROVIDER_RESPONSE_ERROR_CODES,
  assertProviderResponseText
} from '../../providers/provider-response-normalizer.mjs';

const CONNECTION_PROFILE_ARRAY_KEYS = Object.freeze([
  'connectionProfiles',
  'connection_profiles',
  'profileList',
  'profiles',
  'connectionManagerProfiles'
]);
export const DIRECTIVE_PROVIDER_TEST_MAX_TOKENS = 512;
const FINAL_VISIBLE_OUTPUT_RETRY_MESSAGE = 'Return the final visible answer now. Do not return private reasoning, analysis tags, or planning notes.';

function collectProfileArrays(root, keys = CONNECTION_PROFILE_ARRAY_KEYS) {
  const arrays = [];
  const seenArrays = new Set();
  const visited = new Set();
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  function add(value) {
    if (!Array.isArray(value) || seenArrays.has(value)) return;
    seenArrays.add(value);
    arrays.push(value);
  }
  function visit(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 6 || visited.has(value)) return;
    visited.add(value);
    for (const key of keys) add(value[key]);
    for (const [key, child] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (keySet.has(lower) || keys.some((candidate) => lower.includes(candidate.toLowerCase()))) add(child);
    }
    for (const child of Object.values(value)) visit(child, depth + 1);
  }
  visit(root);
  return arrays;
}

function profileId(profile = {}) {
  return String(profile.id || profile.name || profile.profileId || profile.uuid || profile.profile_id || profile.label || '').trim();
}

function profileLabel(profile = {}, fallback = '') {
  return String(profile.name || profile.label || profile.profileName || profile.title || fallback || '').trim();
}

export function listSillyTavernConnectionProfiles(context = null) {
  const service = context?.ConnectionManagerRequestService || globalThis.ConnectionManagerRequestService;
  let supportedProfiles = [];
  if (typeof service?.getSupportedProfiles === 'function') {
    try {
      const result = service.getSupportedProfiles();
      if (Array.isArray(result)) supportedProfiles = result;
    } catch {
      // Connection Manager may be disabled; fall back to passive settings inspection.
    }
  }
  const roots = [
    { profiles: supportedProfiles },
    context,
    globalThis.connectionManager,
    globalThis.ConnectionManager,
    globalThis.extension_settings,
    globalThis.power_user
  ];
  const seen = new Set();
  const profiles = [];
  for (const array of roots.flatMap((root) => collectProfileArrays(root))) {
    for (const item of array) {
      if (!item || typeof item !== 'object') continue;
      const id = profileId(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      profiles.push({
        id,
        label: profileLabel(item, id),
        model: String(item.model || item.modelId || item.model_name || item.settings?.model || '').trim() || null
      });
    }
  }
  return profiles;
}

export function currentSillyTavernModelName(context = null) {
  let resolvedModel = '';
  if (typeof context?.getChatCompletionModel === 'function') {
    try { resolvedModel = context.getChatCompletionModel() || ''; } catch { /* fall through */ }
  }
  return String(
    resolvedModel
    || context?.onlineApiModel
    || context?.model
    || context?.modelName
    || context?.apiModel
    || context?.selectedModel
    || globalThis.onlineApiModel
    || globalThis.selectedModel
    || ''
  ).trim();
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function providerError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = cloneJson(details);
  return error;
}

function requestMaxTokens(request = {}, config = {}) {
  return request.parameters?.max_tokens || request.maxTokens || config.maxTokens;
}

function requestProviderKindOverride(request = {}) {
  const kind = String(request?.role?.providerKind || request?.providerKind || '').trim().toLowerCase();
  return ['utility', 'reasoning'].includes(kind) ? kind : null;
}

function extractText(value, options = {}) {
  return assertProviderResponseText(value, options).trim();
}

function shouldRetryForVisibleOutput(error) {
  return [
    PROVIDER_RESPONSE_ERROR_CODES.EMPTY_CONTENT,
    PROVIDER_RESPONSE_ERROR_CODES.REASONING_ONLY
  ].includes(String(error?.code || ''));
}

function isAbortLikeError(error) {
  return error?.code === 'DIRECTIVE_GENERATION_ABORTED'
    || error?.name === 'AbortError'
    || error?.code === 'ABORT_ERR';
}

function visibleOutputRetryRequest(request = {}) {
  if (Array.isArray(request.messages) && request.messages.length) {
    return {
      ...request,
      messages: [
        ...request.messages,
        { role: 'user', content: FINAL_VISIBLE_OUTPUT_RETRY_MESSAGE }
      ]
    };
  }
  const prompt = String(request.prompt || '').trim();
  return {
    ...request,
    prompt: [prompt, FINAL_VISIBLE_OUTPUT_RETRY_MESSAGE].filter(Boolean).join('\n\n')
  };
}

function requestPrompts(request = {}) {
  const messages = Array.isArray(request.messages) ? request.messages : [];
  const system = String(request.systemPrompt || messages.find((message) => message?.role === 'system')?.content || '').trim();
  const userMessages = messages.filter((message) => message?.role !== 'system');
  const prompt = String(request.prompt || userMessages.map((message) => `${message.role || 'user'}: ${message.content || ''}`).join('\n') || '').trim();
  return { system, prompt };
}

function openAiEndpoint(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw providerError('DIRECTIVE_PROVIDER_CONFIGURATION', 'OpenAI-compatible base URL is missing.');
  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

async function sendViaCurrentSillyTavern(context, config, request, { retriedForVisibleOutput = false } = {}) {
  const { system, prompt } = requestPrompts(request);
  let response;
  if (typeof context?.generateRaw === 'function') {
    response = await context.generateRaw({
      systemPrompt: system,
      prompt,
      prefill: request.prefill || '',
      responseLength: requestMaxTokens(request, config),
      temperature: request.parameters?.temperature ?? request.temperature ?? config.temperature,
      topP: request.parameters?.top_p ?? request.topP ?? config.topP,
      jsonSchema: request.jsonSchema || null,
      bypassAll: true,
      ...(request.signal ? { signal: request.signal } : {})
    });
  } else if (typeof context?.generateQuietPrompt === 'function') {
    const quietPrompt = [system, prompt].filter(Boolean).join('\n\n');
    try {
      response = await context.generateQuietPrompt({
        quietPrompt,
        ...(request.signal ? { signal: request.signal } : {})
      });
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      response = await context.generateQuietPrompt(quietPrompt);
    }
  } else if (typeof context?.generate === 'function') {
    response = await context.generate([system, prompt].filter(Boolean).join('\n\n'));
  } else if (typeof context?.generateText === 'function') {
    response = await context.generateText({ ...request, prompt, systemPrompt: system });
  } else {
    throw providerError('DIRECTIVE_PROVIDER_UNAVAILABLE', 'SillyTavern does not expose a supported generation method.');
  }
  const text = extractText(response, {
    providerTitle: 'SillyTavern',
    maxTokens: requestMaxTokens(request, config),
    retried: retriedForVisibleOutput
  });
  return { text, raw: response, providerId: 'sillytavern-current-model' };
}

async function sendViaConnectionProfile(context, config, request, { retriedForVisibleOutput = false } = {}) {
  const service = context?.ConnectionManagerRequestService || globalThis.ConnectionManagerRequestService;
  if (!config.profileId) throw providerError('DIRECTIVE_PROVIDER_CONFIGURATION', 'Connection profile is not selected.');
  if (typeof service?.sendRequest !== 'function') {
    throw providerError('DIRECTIVE_PROVIDER_UNAVAILABLE', 'ConnectionManagerRequestService is unavailable.');
  }
  const { system, prompt } = requestPrompts(request);
  const messages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    { role: 'user', content: prompt }
  ];
  const response = await service.sendRequest(
    config.profileId,
    messages,
    requestMaxTokens(request, config),
    {
      stream: false,
      extractData: true,
      includePreset: true,
      includeInstruct: true
    },
    {
      temperature: request.parameters?.temperature ?? request.temperature ?? config.temperature,
      top_p: request.parameters?.top_p ?? request.topP ?? config.topP
    }
  );
  const text = extractText(response, {
    providerTitle: 'Connection profile',
    maxTokens: requestMaxTokens(request, config),
    retried: retriedForVisibleOutput
  });
  return { text, raw: response, providerId: `sillytavern-profile:${config.profileId}` };
}

async function sendViaOpenAiCompatible(config, request, { fetchImpl, apiKey, retriedForVisibleOutput = false }) {
  if (!config.model) throw providerError('DIRECTIVE_PROVIDER_CONFIGURATION', 'OpenAI-compatible model is missing.');
  const { system, prompt } = requestPrompts(request);
  const response = await fetchImpl(openAiEndpoint(config.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    credentials: 'omit',
    ...(request.signal ? { signal: request.signal } : {}),
    body: JSON.stringify({
      model: config.model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: request.parameters?.temperature ?? request.temperature ?? config.temperature,
      top_p: request.parameters?.top_p ?? request.topP ?? config.topP,
      max_tokens: requestMaxTokens(request, config),
      stream: false
    })
  });
  const textBody = await response.text();
  let json = null;
  try { json = textBody ? JSON.parse(textBody) : null; } catch { /* handled below */ }
  if (!response.ok) {
    throw providerError('DIRECTIVE_PROVIDER_REQUEST_FAILED', `OpenAI-compatible request failed (${response.status}): ${textBody.slice(0, 500)}`, { status: response.status });
  }
  const text = extractText(json, {
    providerTitle: 'OpenAI-compatible',
    maxTokens: requestMaxTokens(request, config),
    retried: retriedForVisibleOutput
  });
  return { text, raw: json, providerId: `openai-compatible:${config.model}`, model: config.model, usage: json?.usage || null };
}

export function createDirectiveProviderClient({
  contextFactory = () => globalThis.SillyTavern?.getContext?.() || null,
  settingsStore,
  fetchImpl = globalThis.fetch?.bind(globalThis)
} = {}) {
  if (!settingsStore || typeof settingsStore.get !== 'function') {
    throw new Error('settingsStore with get(kind) is required');
  }

  async function generate(roleId, request = {}) {
    const settings = settingsStore.getAll?.() || null;
    const kind = requestProviderKindOverride(request)
      || settingsStore.getRoleProviderKind?.(roleId)
      || providerKindForRole(roleId, settings);
    const config = settingsStore.get(kind);
    const context = contextFactory();
    async function sendOnce(requestToSend, retryOptions = {}) {
      if (config.provider === 'profile') {
        return sendViaConnectionProfile(context, config, requestToSend, retryOptions);
      }
      if (config.provider === 'openai_compatible') {
        if (typeof fetchImpl !== 'function') throw providerError('DIRECTIVE_PROVIDER_UNAVAILABLE', 'Fetch is unavailable for OpenAI-compatible generation.');
        return sendViaOpenAiCompatible(config, requestToSend, {
          fetchImpl,
          apiKey: settingsStore.getApiKey?.(kind) || '',
          ...retryOptions
        });
      }
      return sendViaCurrentSillyTavern(context, config, requestToSend, retryOptions);
    }

    let result;
    let retriedForVisibleOutput = false;
    try {
      try {
        result = await sendOnce(request);
      } catch (error) {
        if (!shouldRetryForVisibleOutput(error)) throw error;
        retriedForVisibleOutput = true;
        result = await sendOnce(visibleOutputRetryRequest(request), { retriedForVisibleOutput: true });
      }
    } catch (error) {
      if (error && typeof error === 'object') {
        error.providerKind = kind;
        throw error;
      }
      const wrapped = providerError('DIRECTIVE_PROVIDER_REQUEST_FAILED', String(error || 'Provider request failed.'));
      wrapped.providerKind = kind;
      throw wrapped;
    }
    return {
      ...result,
      roleId,
      providerKind: kind,
      retriedForVisibleOutput,
      configuration: {
        provider: config.provider,
        profileId: config.profileId || null,
        baseUrl: config.baseUrl || null,
        model: config.model || result.model || null
      }
    };
  }

  async function test(kind) {
    const roleId = kind === 'utility' ? 'utilityJson' : 'missionDirectorAdvisor';
    try {
      const response = await generate(roleId, {
        systemPrompt: 'Connectivity test only. Return exactly DIRECTIVE_PROVIDER_OK as the complete visible answer. Do not include reasoning, analysis, markdown, or extra text.',
        prompt: 'Reply with DIRECTIVE_PROVIDER_OK.',
        maxTokens: DIRECTIVE_PROVIDER_TEST_MAX_TOKENS,
        parameters: {
          temperature: 0,
          top_p: 1,
          max_tokens: DIRECTIVE_PROVIDER_TEST_MAX_TOKENS
        }
      });
      return { ok: Boolean(response.text), kind, providerId: response.providerId, text: response.text, maxTokens: DIRECTIVE_PROVIDER_TEST_MAX_TOKENS };
    } catch (error) {
      return {
        ok: false,
        kind,
        maxTokens: DIRECTIVE_PROVIDER_TEST_MAX_TOKENS,
        error: {
          code: error?.code || 'DIRECTIVE_PROVIDER_TEST_FAILED',
          message: error?.message || String(error),
          details: cloneJson(error?.details || null)
        }
      };
    }
  }

  function status(kind) {
    const config = settingsStore.get(kind);
    const context = contextFactory();
    if (config.provider === 'profile') {
      const profile = listSillyTavernConnectionProfiles(context).find((entry) => entry.id === config.profileId);
      return {
        kind,
        provider: config.provider,
        ready: Boolean(config.profileId && (context?.ConnectionManagerRequestService?.sendRequest || globalThis.ConnectionManagerRequestService?.sendRequest)),
        label: profile?.model || profile?.label || config.profileId || 'Profile not selected',
        sourceLabel: 'SillyTavern Connection Profile',
        profile: profile || null
      };
    }
    if (config.provider === 'openai_compatible') {
      return {
        kind,
        provider: config.provider,
        ready: Boolean(config.baseUrl && config.model),
        label: config.model || 'Model not configured',
        sourceLabel: 'OpenAI-compatible endpoint'
      };
    }
    const model = currentSillyTavernModelName(context);
    return {
      kind,
      provider: 'st',
      ready: Boolean(context?.generateRaw || context?.generateQuietPrompt || context?.generate || context?.generateText),
      label: model || 'Current SillyTavern model',
      sourceLabel: 'Current SillyTavern model'
    };
  }

  return {
    id: 'directive-dual-provider-client',
    generate,
    test,
    status,
    listProfiles: () => listSillyTavernConnectionProfiles(contextFactory()),
    settings: () => settingsStore.getAll?.() || null
  };
}
