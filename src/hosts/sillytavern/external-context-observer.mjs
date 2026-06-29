import {
  hashStableJson,
  normalizeExternalPromptEnvironment,
  redactExternalDiagnostic
} from '../../runtime/architecture-redesign-contracts.mjs';

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function truthy(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function unique(values = []) {
  return [...new Set(asArray(values).map((value) => asString(value)).filter(Boolean))];
}

function safeHash(value) {
  const redactions = [];
  return hashStableJson(redactExternalDiagnostic(value || {}, redactions));
}

function objectKeyCount(value) {
  return value && typeof value === 'object' ? Object.keys(value).length : 0;
}

function promptKeysFrom(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return unique(value.map((entry) => (
      typeof entry === 'string'
        ? entry
        : entry?.identifier || entry?.id || entry?.name || entry?.key
    )));
  }
  return unique(Object.keys(value));
}

function extensionSettingsFrom(context = {}) {
  return asObject(
    context.extensionSettings
    || context.extension_settings
    || globalThis.extension_settings
  );
}

function chatMetadataFrom(context = {}) {
  return asObject(
    context.chatMetadata
    || context.chat_metadata
  );
}

function promptRegistryFrom(context = {}) {
  return context.extensionPrompts
    || context.extension_prompts
    || globalThis.extensionPrompts
    || globalThis.extension_prompts
    || null;
}

function worldInfoSettingsFrom(context = {}) {
  return asObject(
    context.worldInfoSettings
    || context.world_info_settings
    || globalThis.world_info_settings
  );
}

function activeWorldInfoNames(worldInfoSettings = {}) {
  return unique([
    ...asArray(worldInfoSettings.world_info?.globalSelect),
    ...asArray(worldInfoSettings.world_info?.global_select),
    ...asArray(worldInfoSettings.globalSelect),
    ...asArray(worldInfoSettings.selected_world_info)
  ]);
}

function extensionPromptPositions(promptKeys = []) {
  const positions = [];
  for (const key of promptKeys) {
    if (/^worldInfoBefore$/i.test(key)) positions.push('before');
    else if (/^worldInfoAfter$/i.test(key)) positions.push('after');
    else if (/^customDepthWI_/i.test(key)) positions.push('atDepth');
    else if (/^customWIOutlet_/i.test(key)) positions.push('outlet');
    else if (/author.?note/i.test(key) || /^2_floating_prompt$/i.test(key)) positions.push('authorNote');
    else if (/example/i.test(key)) positions.push('exampleMessages');
  }
  return unique(positions);
}

export function collectSillyTavernExternalPromptKeys(context = {}) {
  const promptKeys = promptKeysFrom(promptRegistryFrom(context));
  return unique(promptKeys.filter((key) => !/^directive\./i.test(key)));
}

export function summarizeSillyTavernExternalMessageMarkers(chat = []) {
  const counts = {
    summaryceptionGhosted: 0,
    memoryBooksHidden: 0,
    memoryBooksUnhidden: 0,
    vectFoxGhosted: 0,
    nativeHidden: 0
  };
  for (const message of asArray(chat)) {
    const extra = asObject(message?.extra);
    if (extra.sc_ghosted || extra.summaryception?.ghosted) counts.summaryceptionGhosted += 1;
    if (extra.stmb_hidden || extra.memoryBooks?.hidden) counts.memoryBooksHidden += 1;
    if (extra.stmb_unhidden || extra.memoryBooks?.unhidden) counts.memoryBooksUnhidden += 1;
    if (
      extra.vectfox_prompt_ghosted
      || extra.vectfoxGhosted
      || extra.vectfox?.promptGhosted
      || extra.vectfox?.promptExcluded
      || extra.eventbase_ghosted
    ) {
      counts.vectFoxGhosted += 1;
    }
    if (message?.is_hidden || message?.hidden) counts.nativeHidden += 1;
  }
  return counts;
}

export function observeSillyTavernExternalPromptEnvironment(context = null, options = {}) {
  const resolvedContext = context || globalThis.SillyTavern?.getContext?.() || null;
  const observedAt = options.observedAt || new Date().toISOString();
  if (!resolvedContext) {
    return normalizeExternalPromptEnvironment({
      host: 'sillytavern',
      userHandle: options.userHandle,
      observedAt,
      status: 'unavailable',
      unknownSignals: ['sillytavern-context-unavailable']
    });
  }

  const extensionSettings = extensionSettingsFrom(resolvedContext);
  const chatMetadata = chatMetadataFrom(resolvedContext);
  const chat = asArray(resolvedContext.chat);
  const promptRegistry = promptRegistryFrom(resolvedContext);
  const promptKeys = promptKeysFrom(promptRegistry);
  const worldInfoSettings = worldInfoSettingsFrom(resolvedContext);
  const worldInfoNames = activeWorldInfoNames(worldInfoSettings);
  const markers = summarizeSillyTavernExternalMessageMarkers(chat);
  const memoryBooksSettings = asObject(
    extensionSettings.STMemoryBooks
    || extensionSettings.stMemoryBooks
    || extensionSettings.memoryBooks
  );
  const memoryBooksModule = asObject(memoryBooksSettings.moduleSettings || memoryBooksSettings);
  const summaryceptionSettings = asObject(extensionSettings.summaryception);
  const summaryceptionMetadata = asObject(chatMetadata.summaryception);
  const vectFoxSettings = asObject(extensionSettings.vectfox || extensionSettings.VectFox);
  const vectFoxPromptKeys = promptKeys.filter((key) => /^3_vectfox/i.test(key));

  return normalizeExternalPromptEnvironment({
    host: 'sillytavern',
    userHandle: options.userHandle || resolvedContext.userHandle || resolvedContext.user?.handle,
    chatId: options.chatId || resolvedContext.chatId || resolvedContext.chat_id || resolvedContext.currentChatId,
    saveId: options.saveId,
    campaignId: options.campaignId,
    observedAt,
    status: 'observed',
    promptKeys,
    worldInfo: {
      installed: objectKeyCount(worldInfoSettings) > 0 || Boolean(globalThis.world_names || globalThis.world_info),
      enabled: worldInfoNames.length > 0 || Boolean(chatMetadata.world_info),
      active: worldInfoNames.length > 0 || Boolean(chatMetadata.world_info),
      activeNames: worldInfoNames,
      chatBoundName: chatMetadata.world_info || null,
      settingsHash: safeHash(worldInfoSettings),
      depth: worldInfoSettings.world_info_depth,
      budgetPercent: worldInfoSettings.world_info_budget,
      recursive: worldInfoSettings.world_info_recursive,
      promptPositions: extensionPromptPositions(promptKeys)
    },
    memoryBooks: {
      installed: objectKeyCount(memoryBooksSettings) > 0 || Boolean(globalThis.STMemoryBooks || globalThis.SillyTavernMemoryBooks),
      enabled: truthy(memoryBooksSettings.enabled) || truthy(memoryBooksModule.enabled),
      activeBookName: chatMetadata.world_info || null,
      entryCount: memoryBooksSettings.entryCount || memoryBooksModule.entryCount || chatMetadata.STMemoryBooks?.entryCount,
      entryHash: memoryBooksSettings.entryHash || memoryBooksModule.entryHash || (chatMetadata.STMemoryBooks ? safeHash(chatMetadata.STMemoryBooks) : null),
      riskyModes: {
        autoSummary: truthy(memoryBooksModule.autoSummaryEnabled) || truthy(memoryBooksModule.autoSummary?.enabled),
        autoCreate: truthy(memoryBooksModule.autoCreateEnabled),
        autoHideUnhide: truthy(memoryBooksModule.unhideBeforeMemory) || Boolean(memoryBooksModule.autoHideMode),
        sidePrompts: truthy(memoryBooksModule.sidePromptsEnabled) || truthy(memoryBooksModule.sidePrompts?.enabled),
        atDepthUserOrAssistant: Number(memoryBooksModule.summaryEntrySettings?.position) === 4
      }
    },
    summaryception: {
      installed: objectKeyCount(summaryceptionSettings) > 0 || Boolean(globalThis.Summaryception || globalThis.summaryception),
      enabled: truthy(summaryceptionSettings.enabled),
      promptKeyActive: promptKeys.includes('summaryception'),
      summarizedUpTo: summaryceptionMetadata.summarizedUpTo,
      layerCount: asArray(summaryceptionMetadata.layers).length || summaryceptionMetadata.layerCount,
      ghostedCount: Math.max(asArray(summaryceptionMetadata.ghostedIndices).length, Number(summaryceptionMetadata.ghostedCount || 0), markers.summaryceptionGhosted),
      injectionHash: objectKeyCount(summaryceptionSettings) > 0 ? safeHash(summaryceptionSettings) : null,
      externalModelCalls: Boolean(summaryceptionSettings.connectionSource && summaryceptionSettings.connectionSource !== 'profile')
    },
    vectFox: {
      installed: objectKeyCount(vectFoxSettings) > 0 || Boolean(globalThis.VectFox || globalThis.vectFox || globalThis.vectfox),
      enabled: truthy(vectFoxSettings.enabled),
      disabledPresent: vectFoxSettings.enabled === false,
      promptKeys: vectFoxPromptKeys,
      position: vectFoxSettings.position,
      depth: vectFoxSettings.depth,
      backendType: vectFoxSettings.vector_backend || vectFoxSettings.backendType,
      semanticWorldInfoEnabled: truthy(vectFoxSettings.enabled_world_info),
      summarizerInjectionEnabled: truthy(vectFoxSettings.summarizer_injection_enabled),
      ghostingEnabled: truthy(vectFoxSettings.eventbase_ghost_enabled) || markers.vectFoxGhosted > 0,
      generationInterceptorActive: objectKeyCount(vectFoxSettings) > 0,
      settingsHash: objectKeyCount(vectFoxSettings) > 0 ? safeHash(vectFoxSettings) : null
    },
    redactionSource: {
      worldInfoSettings,
      memoryBooksSettings,
      summaryceptionSettings,
      vectFoxSettings,
      chatMetadata: {
        STMemoryBooks: chatMetadata.STMemoryBooks,
        summaryception: chatMetadata.summaryception
      }
    },
    unknownSignals: [
      ...(promptRegistry ? [] : ['prompt-registry-unavailable']),
      ...(objectKeyCount(extensionSettings) > 0 ? [] : ['extension-settings-unavailable'])
    ]
  });
}
