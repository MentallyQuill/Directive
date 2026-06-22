import { providerKindForRole } from '../../providers/directive-provider-settings.mjs';

const CONNECTION_PROFILE_ARRAY_KEYS = Object.freeze([
  'connectionProfiles',
  'connection_profiles',
  'profileList',
  'profiles',
  'connectionManagerProfiles'
]);

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

function extractText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value?.text === 'string') return value.text.trim();
  if (typeof value?.content === 'string') return value.content.trim();
  if (typeof value?.message === 'string') return value.message.trim();
  if (typeof value?.choices?.[0]?.message?.content === 'string') return value.choices[0].message.content.trim();
  if (typeof value?.choices?.[0]?.text === 'string') return value.choices[0].text.trim();
  return '';
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

async function sendViaCurrentSillyTavern(context, config, request) {
  const { system, prompt } = requestPrompts(request);
  let response;
  if (typeof context?.generateRaw === 'function') {
    response = await context.generateRaw({
      systemPrompt: system,
      prompt,
      prefill: request.prefill || '',
      responseLength: request.parameters?.max_tokens || request.maxTokens || config.maxTokens,
      temperature: request.parameters?.temperature ?? request.temperature ?? config.temperature,
      topP: request.parameters?.top_p ?? request.topP ?? config.topP,
      jsonSchema: request.jsonSchema || null,
      bypassAll: true
    });
  } else if (typeof context?.generateQuietPrompt === 'function') {
    const quietPrompt = [system, prompt].filter(Boolean).join('\n\n');
    try {
      response = await context.generateQuietPrompt({ quietPrompt });
    } catch {
      response = await context.generateQuietPrompt(quietPrompt);
    }
  } else if (typeof context?.generate === 'function') {
    response = await context.generate([system, prompt].filter(Boolean).join('\n\n'));
  } else if (typeof context?.generateText === 'function') {
    response = await context.generateText({ ...request, prompt, systemPrompt: system });
  } else {
    throw providerError('DIRECTIVE_PROVIDER_UNAVAILABLE', 'SillyTavern does not expose a supported generation method.');
  }
  const text = extractText(response);
  if (!text) throw providerError('DIRECTIVE_PROVIDER_EMPTY_RESPONSE', 'SillyTavern provider returned no visible text.');
  return { text, raw: response, providerId: 'sillytavern-current-model' };
}

async function sendViaConnectionProfile(context, config, request) {
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
    request.parameters?.max_tokens || request.maxTokens || config.maxTokens,
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
  const text = extractText(response);
  if (!text) throw providerError('DIRECTIVE_PROVIDER_EMPTY_RESPONSE', 'Connection profile returned no visible text.');
  return { text, raw: response, providerId: `sillytavern-profile:${config.profileId}` };
}

async function sendViaOpenAiCompatible(config, request, { fetchImpl, apiKey }) {
  if (!config.model) throw providerError('DIRECTIVE_PROVIDER_CONFIGURATION', 'OpenAI-compatible model is missing.');
  const { system, prompt } = requestPrompts(request);
  const response = await fetchImpl(openAiEndpoint(config.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    credentials: 'omit',
    body: JSON.stringify({
      model: config.model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: request.parameters?.temperature ?? request.temperature ?? config.temperature,
      top_p: request.parameters?.top_p ?? request.topP ?? config.topP,
      max_tokens: request.parameters?.max_tokens || request.maxTokens || config.maxTokens,
      stream: false
    })
  });
  const textBody = await response.text();
  let json = null;
  try { json = textBody ? JSON.parse(textBody) : null; } catch { /* handled below */ }
  if (!response.ok) {
    throw providerError('DIRECTIVE_PROVIDER_REQUEST_FAILED', `OpenAI-compatible request failed (${response.status}): ${textBody.slice(0, 500)}`, { status: response.status });
  }
  const text = extractText(json);
  if (!text) throw providerError('DIRECTIVE_PROVIDER_EMPTY_RESPONSE', 'OpenAI-compatible provider returned no visible text.');
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
    const kind = providerKindForRole(roleId);
    const config = settingsStore.get(kind);
    const context = contextFactory();
    let result;
    if (config.provider === 'profile') {
      result = await sendViaConnectionProfile(context, config, request);
    } else if (config.provider === 'openai_compatible') {
      if (typeof fetchImpl !== 'function') throw providerError('DIRECTIVE_PROVIDER_UNAVAILABLE', 'Fetch is unavailable for OpenAI-compatible generation.');
      result = await sendViaOpenAiCompatible(config, request, {
        fetchImpl,
        apiKey: settingsStore.getApiKey?.(kind) || ''
      });
    } else {
      result = await sendViaCurrentSillyTavern(context, config, request);
    }
    return {
      ...result,
      roleId,
      providerKind: kind,
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
        systemPrompt: 'Return exactly DIRECTIVE_PROVIDER_OK.',
        prompt: 'Provider connectivity test.',
        maxTokens: 32
      });
      return { ok: Boolean(response.text), kind, providerId: response.providerId, text: response.text };
    } catch (error) {
      return { ok: false, kind, error: { code: error?.code || 'DIRECTIVE_PROVIDER_TEST_FAILED', message: error?.message || String(error) } };
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
