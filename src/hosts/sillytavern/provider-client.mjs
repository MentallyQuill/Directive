import { providerKindForRole } from '../../providers/directive-provider-settings.mjs';
import {
  directiveProviderConfigFingerprint,
  directiveSourceConfigurationDigest,
  resolveDirectiveGenerationPolicy
} from '../../providers/generation-policy.mjs';
import {
  PROVIDER_RESPONSE_ERROR_CODES,
  assertProviderResponseText
} from '../../providers/provider-response-normalizer.mjs';
import { projectSillyTavernSamplerPayload } from './profile-samplers.mjs';

export const DIRECTIVE_PROVIDER_TEST_MAX_TOKENS = 512;
const FINAL_VISIBLE_OUTPUT_RETRY_MESSAGE = 'Return the final visible answer now. Do not return private reasoning, analysis tags, or planning notes.';
const SAFE_PROVIDER_ERROR = Symbol('directiveSafeProviderError');
const SAFE_RESPONSE_ERROR_CODES = new Set(Object.values(PROVIDER_RESPONSE_ERROR_CODES));

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function textValue(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function providerError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = cloneJson(details);
  Object.defineProperty(error, SAFE_PROVIDER_ERROR, { value: true });
  return error;
}

function requireConnectionManagerService(context = {}) {
  const service = context?.ConnectionManagerRequestService || globalThis.ConnectionManagerRequestService;
  const required = ['getSupportedProfiles', 'getProfile', 'validateProfile', 'sendRequest'];
  const missing = required.filter((name) => typeof service?.[name] !== 'function');
  if (missing.length) {
    throw providerError(
      'DIRECTIVE_CONNECTION_MANAGER_UNAVAILABLE',
      `SillyTavern Connection Manager API is missing: ${missing.join(', ')}.`
    );
  }
  return service;
}

export function completionModeFromApiMap(apiMap = {}) {
  const selected = textValue(apiMap?.selected).toLowerCase();
  if (selected === 'openai') return 'chat';
  if (selected === 'textgenerationwebui') return 'text';
  return 'unknown';
}

function supportedProfiles(service) {
  const profiles = service.getSupportedProfiles();
  if (Array.isArray(profiles)) return profiles;
  if (profiles && typeof profiles === 'object') return Object.values(profiles);
  return [];
}

function profileMetadata(service, profile) {
  if (!profile || typeof profile !== 'object') return null;
  const completionMode = completionModeFromApiMap(service.validateProfile(profile) || {});
  const id = textValue(profile.id);
  if (!id || completionMode === 'unknown') return null;
  const name = textValue(profile.name || profile.label || id, id);
  const model = textValue(profile.model);
  return {
    id,
    label: model ? `${name} / ${model}` : name,
    name,
    model,
    completionMode,
    presetName: textValue(profile.preset),
    instructName: textValue(profile.instruct)
  };
}

export function listSillyTavernConnectionProfiles(context = null) {
  try {
    const service = requireConnectionManagerService(context || {});
    return supportedProfiles(service)
      .map((profile) => profileMetadata(service, profile))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function currentSillyTavernModelName(context = null) {
  let resolvedModel = '';
  if (typeof context?.getChatCompletionModel === 'function') {
    try { resolvedModel = context.getChatCompletionModel() || ''; } catch { /* use passive fields */ }
  }
  return textValue(
    resolvedModel
    || context?.onlineApiModel
    || context?.model
    || context?.modelName
    || context?.apiModel
    || context?.selectedModel
    || globalThis.onlineApiModel
    || globalThis.selectedModel
  );
}

function currentCompletionMode(context = {}) {
  const api = textValue(context?.mainApi || context?.main_api).toLowerCase();
  if (api === 'openai') return 'chat';
  if (api === 'textgenerationwebui' || api === 'kobold' || api === 'koboldhorde' || api === 'novel') return 'text';
  return 'unknown';
}

function currentIdentity(context = {}) {
  const api = textValue(context?.mainApi || context?.main_api, 'unknown').toLowerCase();
  const source = api === 'openai'
    ? textValue(context?.chatCompletionSettings?.chat_completion_source, 'unknown')
    : textValue(context?.textCompletionSettings?.type || context?.textGenType, 'unknown');
  return `current:${api}:${source}:${currentSillyTavernModelName(context) || 'unknown'}`;
}

function currentPresetName(context = {}, completionMode = 'unknown') {
  if (completionMode === 'chat') {
    return textValue(context?.chatCompletionSettings?.preset_settings_openai);
  }
  return textValue(
    context?.textCompletionSettings?.preset_settings
    || context?.textCompletionSettings?.preset
    || context?.textGenerationSettings?.preset
  );
}

function currentInstructName(context = {}) {
  return textValue(
    context?.powerUserSettings?.instruct?.preset
    || context?.power_user?.instruct?.preset
    || context?.instructSettings?.preset
  );
}

function fingerprintKeyIsSensitive(key) {
  const normalized = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return [
    'apikey', 'key', 'token', 'accesstoken', 'authtoken', 'bearertoken',
    'secret', 'clientsecret', 'password', 'proxypassword', 'credential',
    'credentials', 'authorization', 'cookie', 'cookies', 'header', 'headers'
  ].includes(normalized) || normalized.endsWith('apikey') || normalized.endsWith('password');
}

function sanitizedFingerprintUrl(value) {
  try {
    const url = new URL(String(value));
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().slice(0, 600);
  } catch {
    return String(value || '').split(/[?#]/, 1)[0].slice(0, 600);
  }
}

function sanitizeFingerprintValue(value, key = '', depth = 0, seen = new Set()) {
  if (fingerprintKeyIsSensitive(key) || depth > 6) return undefined;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return /(url|endpoint|server|proxy)/i.test(key)
      ? sanitizedFingerprintUrl(value)
      : value.slice(0, 600);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 64)
      .map((entry) => sanitizeFingerprintValue(entry, key, depth + 1, seen))
      .filter((entry) => entry !== undefined);
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return undefined;
  seen.add(value);
  const sanitized = Object.fromEntries(Object.keys(value).sort().flatMap((childKey) => {
    const child = sanitizeFingerprintValue(value[childKey], childKey, depth + 1, seen);
    return child === undefined ? [] : [[childKey, child]];
  }));
  seen.delete(value);
  return sanitized;
}

function presetSnapshot(context, type, name) {
  if (!name || typeof context?.getPresetManager !== 'function') return null;
  try {
    return context.getPresetManager(type)?.getCompletionPresetByName?.(name) || null;
  } catch {
    return null;
  }
}

function sourceConfigurationDigest(context, {
  completionMode,
  profile = null,
  apiMap = null
} = {}) {
  const presetName = profile
    ? textValue(profile.preset)
    : currentPresetName(context, completionMode);
  const instructName = profile
    ? textValue(profile.instruct)
    : currentInstructName(context);
  const presetType = completionMode === 'chat' ? 'openai' : 'textgenerationwebui';
  return directiveSourceConfigurationDigest(sanitizeFingerprintValue({
    completionMode,
    profile,
    apiMap,
    currentSettings: profile ? null : (
      completionMode === 'chat'
        ? context?.chatCompletionSettings
        : context?.textCompletionSettings || context?.textGenerationSettings
    ),
    presetName,
    preset: presetSnapshot(context, presetType, presetName),
    instructName,
    instruct: presetSnapshot(context, 'instruct', instructName)
  }));
}

function resolveProfile(context, profileId) {
  const service = requireConnectionManagerService(context || {});
  const profile = service.getProfile(profileId);
  const apiMap = profile ? (service.validateProfile(profile) || {}) : {};
  const metadata = profileMetadata({ validateProfile: () => apiMap }, profile);
  if (!metadata) {
    throw providerError(
      'DIRECTIVE_PROFILE_UNAVAILABLE',
      'The selected SillyTavern Connection Profile is unavailable or unsupported.',
      { profileId: textValue(profileId) || null }
    );
  }
  return { service, profile, metadata, apiMap };
}

function requestMessages(request = {}) {
  if (Array.isArray(request.messages) && request.messages.length) {
    return request.messages.map((message) => ({
      role: ['system', 'assistant', 'user'].includes(textValue(message?.role)) ? textValue(message.role) : 'user',
      content: String(message?.content ?? message?.text ?? '')
    })).filter((message) => message.content.trim());
  }
  const system = String(request.systemPrompt || '').trim();
  const prompt = String(request.prompt || '').trim();
  return [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...(prompt ? [{ role: 'user', content: prompt }] : [])
  ];
}

function requestPrompts(request = {}) {
  const messages = requestMessages(request);
  const system = String(messages.find((message) => message.role === 'system')?.content || '').trim();
  const prompt = messages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n')
    .trim();
  return { messages, system, prompt };
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function requestMaxTokens(request = {}, config = {}) {
  const ceiling = positiveInteger(config.maxTokens);
  const requested = positiveInteger(request.parameters?.max_tokens)
    || positiveInteger(request.max_tokens)
    || positiveInteger(request.maxTokens);
  if (ceiling && requested) return Math.min(ceiling, requested);
  return ceiling || requested || 8192;
}

function schemaContract(request = {}) {
  const schema = request?.jsonSchema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null;
  const name = String(request.kind || 'directive_structured_output')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 64) || 'directive_structured_output';
  return { name, value: schema, strict: true };
}

function normalizeSillyTavernResponse(response) {
  const content = response?.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) return response;
  try { return { ...response, content: JSON.stringify(content) }; } catch { return response; }
}

function extractText(value, options = {}) {
  return assertProviderResponseText(value, options).trim();
}

function isAbortLikeError(error) {
  return error?.code === 'DIRECTIVE_GENERATION_ABORTED'
    || error?.name === 'AbortError'
    || error?.code === 'ABORT_ERR';
}

const TRANSPORT_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND',
  'EAI_AGAIN', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_ABORTED'
]);

function transportErrorCode(error) {
  return textValue(error?.code || error?.errno || error?.cause?.code).toUpperCase();
}

function isTransportError(error) {
  const code = transportErrorCode(error);
  if (TRANSPORT_CODES.has(code)) return true;
  return /\b(socket hang up|network error|connection reset|connection refused|timed out|dns|econnreset|etimedout|enotfound|eai_again)\b/i.test(
    [error?.message, error?.cause?.message].filter(Boolean).join(' ')
  );
}

function normalizeThrownError(error, providerKind) {
  if (error?.[SAFE_PROVIDER_ERROR] === true) {
    error.providerKind = providerKind;
    return error;
  }
  if (isAbortLikeError(error) || error?.code === 'DIRECTIVE_GENERATION_TIMEOUT') {
    const code = error?.code === 'DIRECTIVE_GENERATION_TIMEOUT'
      ? 'DIRECTIVE_GENERATION_TIMEOUT'
      : 'DIRECTIVE_GENERATION_ABORTED';
    const wrapped = providerError(
      code,
      code === 'DIRECTIVE_GENERATION_TIMEOUT' ? 'Generation timed out.' : 'Generation canceled.'
    );
    wrapped.providerKind = providerKind;
    wrapped.retryable = code === 'DIRECTIVE_GENERATION_TIMEOUT';
    return wrapped;
  }
  if (isTransportError(error)) {
    const code = transportErrorCode(error) || 'TRANSPORT';
    const wrapped = providerError(
      'DIRECTIVE_PROVIDER_TRANSPORT_ERROR',
      `Provider ${providerKind} connection failed (${code}).`,
      { providerKind, transportCode: code }
    );
    wrapped.providerKind = providerKind;
    wrapped.retryable = true;
    return wrapped;
  }
  if (SAFE_RESPONSE_ERROR_CODES.has(String(error?.code || ''))) {
    const wrapped = providerError(error.code, String(error.message || 'Provider response was not usable.'), {
      providerKind,
      finishReason: textValue(error?.details?.finishReason) || null,
      maxTokens: positiveInteger(error?.details?.maxTokens),
      visibleContentLength: positiveInteger(error?.details?.visibleContentLength) || 0,
      reasoningLength: positiveInteger(error?.details?.reasoningLength) || 0
    });
    wrapped.providerKind = providerKind;
    return wrapped;
  }
  const status = Number(error?.status || error?.statusCode || error?.response?.status);
  const wrapped = providerError(
    'DIRECTIVE_PROVIDER_REQUEST_FAILED',
    `Provider ${providerKind} request failed.`,
    { providerKind, ...(Number.isInteger(status) ? { status } : {}) }
  );
  wrapped.providerKind = providerKind;
  return wrapped;
}

function createGenerationControl(request = {}, options = {}) {
  const externalSignal = options?.signal || request?.signal || null;
  const timeoutMs = Number(options?.timeoutMs);
  const boundedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.max(1, Math.floor(timeoutMs)) : 0;
  if (!externalSignal && !boundedTimeoutMs) {
    return { request, run: (promise) => promise, cleanup() {} };
  }
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId = null;
  let rejectAbort = null;
  const abortPromise = new Promise((_resolve, reject) => { rejectAbort = reject; });
  const onControlledAbort = () => {
    const error = providerError(
      timedOut ? 'DIRECTIVE_GENERATION_TIMEOUT' : 'DIRECTIVE_GENERATION_ABORTED',
      timedOut ? `Generation timed out after ${boundedTimeoutMs}ms.` : 'Generation canceled.',
      timedOut ? { timeoutMs: boundedTimeoutMs } : {}
    );
    error.retryable = timedOut;
    rejectAbort(error);
  };
  const onExternalAbort = () => controller.abort();
  controller.signal.addEventListener('abort', onControlledAbort, { once: true });
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener?.('abort', onExternalAbort, { once: true });
  if (boundedTimeoutMs && !controller.signal.aborted) {
    timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, boundedTimeoutMs);
  }
  return {
    request: { ...request, signal: controller.signal },
    run: (promise) => Promise.race([promise, abortPromise]),
    cleanup() {
      if (timeoutId !== null) clearTimeout(timeoutId);
      externalSignal?.removeEventListener?.('abort', onExternalAbort);
      controller.signal.removeEventListener?.('abort', onControlledAbort);
    }
  };
}

function visibleOutputRetryRequest(request = {}) {
  if (Array.isArray(request.messages) && request.messages.length) {
    return { ...request, messages: [...request.messages, { role: 'user', content: FINAL_VISIBLE_OUTPUT_RETRY_MESSAGE }] };
  }
  return {
    ...request,
    prompt: [String(request.prompt || '').trim(), FINAL_VISIBLE_OUTPUT_RETRY_MESSAGE].filter(Boolean).join('\n\n')
  };
}

function shouldRetryVisibleOutput(error) {
  return [PROVIDER_RESPONSE_ERROR_CODES.EMPTY_CONTENT, PROVIDER_RESPONSE_ERROR_CODES.REASONING_ONLY]
    .includes(String(error?.code || ''));
}

function providerIdentity(context, config) {
  if (config.provider === 'profile') {
    const { metadata, profile, apiMap } = resolveProfile(context, config.profileId);
    return {
      identity: `profile:${metadata.id}:${metadata.model || 'unknown'}`,
      completionMode: metadata.completionMode,
      profile: metadata,
      sourceConfigurationDigest: sourceConfigurationDigest(context, {
        completionMode: metadata.completionMode,
        profile,
        apiMap
      })
    };
  }
  const completionMode = currentCompletionMode(context);
  return {
    identity: currentIdentity(context),
    completionMode,
    profile: null,
    sourceConfigurationDigest: sourceConfigurationDigest(context, { completionMode })
  };
}

function certificationState(kind, config, context) {
  let identity;
  try { identity = providerIdentity(context, config); } catch { return { status: 'not-run' }; }
  const configHash = directiveProviderConfigFingerprint({ kind, provider: config, ...identity });
  const certification = config.certification || { status: 'not-run' };
  return certification.status === 'passed' && certification.configHash === configHash
    ? { ...certification }
    : { status: 'not-run' };
}

function policyFor(kind, config, context, { forceStructuredOutput = null } = {}) {
  const identity = providerIdentity(context, config);
  const certification = certificationState(kind, config, context);
  const policyConfig = forceStructuredOutput
    ? { ...config, structuredOutputMode: forceStructuredOutput }
    : config;
  const policy = resolveDirectiveGenerationPolicy({
    provider: policyConfig,
    completionMode: identity.completionMode,
    certifiedNativeSchema: certification.structuredOutput === 'native-schema'
  });
  return { ...identity, certification, policy };
}

async function sendViaConnectionProfile(context, config, request, resolved) {
  const { service, profile, metadata, apiMap } = resolveProfile(context, config.profileId);
  const schema = resolved.policy.structuredOutputMethod === 'native-schema' ? schemaContract(request) : null;
  let samplerPayload = resolved.policy.samplerOverrides || {};
  let samplerSource = resolved.policy.samplerMode;
  let samplerDiagnosticCode = '';
  if (resolved.policy.samplerMode === 'profile' && !resolved.policy.includePreset) {
    try {
      samplerPayload = await projectSillyTavernSamplerPayload({ context, profile, apiMap });
    } catch {
      samplerSource = 'directive-fallback';
      samplerDiagnosticCode = 'profile-sampler-projection-failed';
      samplerPayload = { temperature: config.temperature, top_p: config.topP };
    }
  }
  const payload = {
    ...samplerPayload,
    ...(schema ? { json_schema: schema } : {})
  };
  const response = await service.sendRequest(
    config.profileId,
    requestMessages(request),
    requestMaxTokens(request, config),
    {
      stream: false,
      extractData: true,
      includePreset: resolved.policy.includePreset,
      includeInstruct: resolved.policy.includeInstruct,
      signal: request.signal
    },
    payload
  );
  return {
    response,
    providerId: `sillytavern-profile:${metadata.id}`,
    model: metadata.model || null,
    samplerSource,
    samplerDiagnosticCode
  };
}

async function sendViaCurrentModel(context, config, request, resolved) {
  const { messages } = requestPrompts(request);
  const schema = resolved.policy.structuredOutputMethod === 'native-schema' ? schemaContract(request) : null;
  const maxTokens = requestMaxTokens(request, config);
  const model = currentSillyTavernModelName(context);
  const presetName = currentPresetName(context, resolved.completionMode);
  let samplers = resolved.policy.samplerOverrides || {};
  let samplerSource = resolved.policy.samplerMode;
  let samplerDiagnosticCode = '';
  if (resolved.policy.samplerMode === 'profile' && !resolved.policy.includePreset) {
    const apiMap = resolved.completionMode === 'chat'
      ? { selected: 'openai', source: textValue(context?.chatCompletionSettings?.chat_completion_source) }
      : { selected: 'textgenerationwebui', type: textValue(context?.textCompletionSettings?.type || context?.textGenType) };
    try {
      samplers = await projectSillyTavernSamplerPayload({
        context,
        profile: { model, preset: presetName },
        apiMap
      });
    } catch {
      samplerSource = 'directive-fallback';
      samplerDiagnosticCode = 'current-sampler-projection-failed';
      samplers = { temperature: config.temperature, top_p: config.topP };
    }
  }
  let response;
  if (resolved.completionMode === 'chat' && typeof context?.ChatCompletionService?.processRequest === 'function') {
    const source = textValue(context?.chatCompletionSettings?.chat_completion_source);
    const appliedPresetName = resolved.policy.includePreset ? presetName : '';
    response = await context.ChatCompletionService.processRequest({
      stream: false,
      messages,
      ...(model ? { model } : {}),
      ...(source ? { chat_completion_source: source } : {}),
      max_tokens: maxTokens,
      ...samplers,
      ...(schema ? { json_schema: schema } : {})
    }, appliedPresetName ? { presetName: appliedPresetName } : {}, true, request.signal);
  } else if (resolved.completionMode === 'text' && typeof context?.TextCompletionService?.processRequest === 'function') {
    const appliedPresetName = resolved.policy.includePreset ? presetName : '';
    const instructName = resolved.policy.includeInstruct ? currentInstructName(context) : '';
    response = await context.TextCompletionService.processRequest({
      stream: false,
      prompt: messages,
      ...(model ? { model } : {}),
      max_tokens: maxTokens,
      api_type: textValue(context?.textCompletionSettings?.type || context?.textGenType),
      ...samplers,
      ...(schema ? { json_schema: schema } : {})
    }, {
      ...(appliedPresetName ? { presetName: appliedPresetName } : {}),
      ...(instructName ? { instructName } : {})
    }, true, request.signal);
  } else {
    throw providerError(
      'DIRECTIVE_PROVIDER_UNAVAILABLE',
      'SillyTavern does not expose the native current-model request service required for Directive provider policy.'
    );
  }
  return {
    response,
    providerId: 'sillytavern-current-model',
    model: model || null,
    samplerSource,
    samplerDiagnosticCode
  };
}

export function createDirectiveProviderClient({
  contextFactory = () => globalThis.SillyTavern?.getContext?.() || null,
  settingsStore,
  now = () => new Date().toISOString()
} = {}) {
  if (!settingsStore || typeof settingsStore.get !== 'function') {
    throw new Error('settingsStore with get(kind) is required');
  }

  async function sendTransport(kind, config, request, options = {}) {
    const context = contextFactory();
    if (!context) throw providerError('DIRECTIVE_PROVIDER_UNAVAILABLE', 'SillyTavern context is unavailable.');
    const resolved = policyFor(kind, config, context, { forceStructuredOutput: options.forceStructuredOutput });
    const schema = schemaContract(request);
    if (
      schema
      && resolved.policy.structuredOutputMethod === 'native-schema'
      && !options.allowUncertifiedNative
      && resolved.certification.structuredOutput !== 'native-schema'
    ) {
      throw providerError(
        'DIRECTIVE_NATIVE_SCHEMA_UNCERTIFIED',
        'Test this provider configuration before using Native schema output.',
        { providerKind: kind }
      );
    }
    const sent = config.provider === 'profile'
      ? await sendViaConnectionProfile(context, config, request, resolved)
      : await sendViaCurrentModel(context, config, request, resolved);
    const response = normalizeSillyTavernResponse(sent.response);
    const text = extractText(response, {
      providerTitle: config.provider === 'profile' ? 'Connection profile' : 'SillyTavern',
      maxTokens: requestMaxTokens(request, config),
      retried: options.retriedForVisibleOutput === true
    });
    return {
      text,
      raw: sent.response,
      providerId: sent.providerId,
      model: sent.model,
      generationPolicy: {
        includePreset: resolved.policy.includePreset,
        includeInstruct: resolved.policy.includeInstruct,
        samplerMode: resolved.policy.samplerMode,
        samplerSource: sent.samplerSource || resolved.policy.samplerMode,
        structuredOutputMethod: resolved.policy.structuredOutputMethod,
        diagnosticCodes: sent.samplerDiagnosticCode ? [sent.samplerDiagnosticCode] : []
      },
      identity: resolved.identity,
      completionMode: resolved.completionMode
    };
  }

  async function generate(roleId, request = {}, options = {}) {
    const requestedKind = textValue(options?.providerKind);
    if (requestedKind && !['utility', 'reasoning'].includes(requestedKind)) {
      throw providerError('DIRECTIVE_PROVIDER_CONFIGURATION', `Unknown Directive provider kind "${requestedKind}".`);
    }
    const kind = requestedKind
      || settingsStore.getRoleProviderKind?.(roleId)
      || providerKindForRole(roleId);
    const config = settingsStore.get(kind);
    const control = createGenerationControl(request, options);
    let result;
    let retriedForVisibleOutput = false;
    try {
      try {
        result = await control.run(sendTransport(kind, config, control.request));
      } catch (error) {
        if (options.allowVisibleOutputRetry === false || !shouldRetryVisibleOutput(error)) throw error;
        retriedForVisibleOutput = true;
        result = await control.run(sendTransport(
          kind,
          config,
          visibleOutputRetryRequest(control.request),
          { retriedForVisibleOutput: true }
        ));
      }
    } catch (error) {
      throw normalizeThrownError(error, kind);
    } finally {
      control.cleanup();
    }
    return {
      ...result,
      roleId,
      providerKind: kind,
      retriedForVisibleOutput,
      configuration: {
        provider: config.provider,
        profileId: config.profileId || null,
        identity: result.identity,
        completionMode: result.completionMode
      }
    };
  }

  async function test(kind) {
    const id = textValue(kind);
    const config = settingsStore.get(id);
    const context = contextFactory();
    let identity;
    try {
      identity = providerIdentity(context, config);
      const configHash = directiveProviderConfigFingerprint({ kind: id, provider: config, ...identity });
      await sendTransport(id, config, {
        systemPrompt: 'Connectivity test only. Return exactly DIRECTIVE_PROVIDER_OK.',
        prompt: 'Reply with DIRECTIVE_PROVIDER_OK.',
        maxTokens: DIRECTIVE_PROVIDER_TEST_MAX_TOKENS
      }, { forceStructuredOutput: 'prompt-json' });

      let structuredOutput = 'prompt-json';
      try {
        const nativeProbe = await sendTransport(id, config, {
          systemPrompt: 'Native schema capability test.',
          prompt: 'Return the requested object.',
          maxTokens: DIRECTIVE_PROVIDER_TEST_MAX_TOKENS,
          jsonSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['ok'],
            properties: { ok: { type: 'boolean' } }
          }
        }, { forceStructuredOutput: 'native-schema', allowUncertifiedNative: true });
        const parsed = JSON.parse(nativeProbe.text);
        if (
          !parsed
          || typeof parsed !== 'object'
          || Array.isArray(parsed)
          || parsed.ok !== true
          || Object.keys(parsed).some((key) => key !== 'ok')
        ) {
          throw providerError('DIRECTIVE_NATIVE_SCHEMA_PROBE_FAILED', 'Native schema probe returned an invalid object.');
        }
        structuredOutput = 'native-schema';
      } catch {
        structuredOutput = 'prompt-json';
      }
      const certification = {
        status: 'passed',
        configHash,
        structuredOutput,
        testedAt: now()
      };
      settingsStore.update(id, { certification });
      return {
        ok: true,
        kind: id,
        providerId: config.provider === 'profile' ? `sillytavern-profile:${config.profileId}` : 'sillytavern-current-model',
        maxTokens: DIRECTIVE_PROVIDER_TEST_MAX_TOKENS,
        configHash,
        capabilities: { connectivity: true, structuredOutput }
      };
    } catch (error) {
      const safeError = normalizeThrownError(error, id);
      settingsStore.update(id, {
        certification: { status: 'failed', testedAt: now() }
      });
      return {
        ok: false,
        kind: id,
        maxTokens: DIRECTIVE_PROVIDER_TEST_MAX_TOKENS,
        error: {
          code: safeError?.code || 'DIRECTIVE_PROVIDER_TEST_FAILED',
          message: safeError?.message || 'Provider test failed.',
          details: cloneJson(safeError?.details || null)
        }
      };
    }
  }

  function status(kind) {
    const id = textValue(kind);
    const config = settingsStore.get(id);
    const context = contextFactory();
    if (config.provider === 'profile') {
      try {
        const { metadata } = resolveProfile(context, config.profileId);
        const identity = `profile:${metadata.id}:${metadata.model || 'unknown'}`;
        return {
          kind: id,
          provider: 'profile',
          ready: true,
          label: metadata.label,
          sourceLabel: 'Connection Profile',
          completionMode: metadata.completionMode,
          identity,
          profile: metadata,
          certification: certificationState(id, config, context)
        };
      } catch (error) {
        return {
          kind: id,
          provider: 'profile',
          ready: false,
          label: config.profileId ? 'Profile unavailable' : 'Select a profile',
          sourceLabel: 'Connection Profile',
          completionMode: 'unknown',
          identity: null,
          profile: null,
          certification: { status: 'not-run' },
          error: { code: error?.code || 'DIRECTIVE_PROFILE_UNAVAILABLE', message: error?.message || 'Profile unavailable.' }
        };
      }
    }
    const completionMode = currentCompletionMode(context || {});
    const model = currentSillyTavernModelName(context);
    const ready = completionMode === 'chat'
      ? typeof context?.ChatCompletionService?.processRequest === 'function'
      : completionMode === 'text'
        ? typeof context?.TextCompletionService?.processRequest === 'function'
        : false;
    return {
      kind: id,
      provider: 'st',
      ready,
      label: model || 'Current SillyTavern model',
      sourceLabel: 'Current Model',
      completionMode,
      identity: currentIdentity(context || {}),
      profile: null,
      certification: certificationState(id, config, context || {})
    };
  }

  return {
    id: 'directive-native-provider-client',
    generate,
    test,
    status,
    listProfiles: () => listSillyTavernConnectionProfiles(contextFactory()),
    settings: () => settingsStore.getAll?.() || null
  };
}
