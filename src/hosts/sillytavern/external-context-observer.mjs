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

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
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

function boundedInteger(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
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
    || globalThis.extensionSettings
    || globalThis.extension_settings
  );
}

function chatMetadataFrom(context = {}) {
  return asObject(
    context.chatMetadata
    || context.chat_metadata
    || globalThis.chatMetadata
    || globalThis.chat_metadata
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
    || globalThis.worldInfoSettings
    || globalThis.world_info_settings
  );
}

function worldEntriesFrom(context = {}) {
  return asObject(
    context.worldInfoEntries
    || context.worldEntries
    || context.world_info_entries
    || context.world_info?.entries
    || context.worldInfo?.entries
    || globalThis.worldInfoEntries
    || globalThis.worldEntries
    || globalThis.world_info_entries
    || globalThis.world_info?.entries
    || globalThis.worldInfo?.entries
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
    summaryceptionGhostedSystemVisible: 0,
    memoryBooksHidden: 0,
    memoryBooksUnhidden: 0,
    vectFoxGhosted: 0,
    nativeHidden: 0
  };
  for (const message of asArray(chat)) {
    const extra = asObject(message?.extra);
    if (extra.sc_ghosted || extra.summaryception?.ghosted) {
      counts.summaryceptionGhosted += 1;
      if ((message?.is_system === true || message?.role === 'system') && message?.is_hidden !== true && message?.hidden !== true) {
        counts.summaryceptionGhostedSystemVisible += 1;
      }
    }
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

function rangeRecord(source, start, end, chatLength = 0) {
  const numericStart = boundedInteger(start);
  const numericEnd = boundedInteger(end);
  if (numericStart === null || numericEnd === null) return null;
  const inverted = numericStart > numericEnd;
  const outOfBounds = numericStart < 0 || (chatLength > 0 && numericEnd >= chatLength);
  return {
    source,
    start: numericStart,
    end: numericEnd,
    inverted,
    outOfBounds
  };
}

function stMemoryBookRangeDiagnostics({
  chatMetadata = {},
  memoryBooksSettings = {},
  memoryBooksModule = {},
  worldEntries = {},
  chatLength = 0
} = {}) {
  const ranges = [];
  const metadata = asObject(chatMetadata.STMemoryBooks);
  const metadataRange = rangeRecord('chat-metadata-scene', metadata.sceneStart, metadata.sceneEnd, chatLength);
  if (metadataRange) ranges.push(metadataRange);
  for (const entry of Object.values(worldEntries || {})) {
    const record = asObject(entry);
    if (record.stmemorybooks === true || record.extensions?.stmemorybooks === true) {
      const entryRange = rangeRecord(`world-entry:${record.uid ?? ranges.length}`, record.STMB_start, record.STMB_end, chatLength);
      if (entryRange) ranges.push(entryRange);
    }
  }
  for (const entry of asArray(memoryBooksSettings.ranges || memoryBooksModule.ranges || memoryBooksSettings.entryRanges || memoryBooksModule.entryRanges)) {
    const record = rangeRecord('settings-range', entry?.STMB_start ?? entry?.start, entry?.STMB_end ?? entry?.end, chatLength);
    if (record) ranges.push(record);
  }
  const invertedRangeCount = ranges.filter((entry) => entry.inverted).length;
  const outOfBoundsRangeCount = ranges.filter((entry) => entry.outOfBounds).length;
  const validRangeCount = ranges.filter((entry) => !entry.inverted && !entry.outOfBounds).length;
  const staleRangeCount = outOfBoundsRangeCount
    + (boundedInteger(metadata.highestMemoryProcessed, -1) >= chatLength && chatLength > 0 ? 1 : 0);
  const status = !ranges.length
    ? 'missing'
    : invertedRangeCount > 0
      ? 'inverted'
      : staleRangeCount > 0
        ? 'stale'
        : 'valid';
  return {
    status,
    entryRangeCount: ranges.filter((entry) => entry.source.startsWith('world-entry:')).length,
    chatRangeCount: metadataRange ? 1 : 0,
    validRangeCount,
    invertedRangeCount,
    outOfBoundsRangeCount,
    staleRangeCount,
    rangeHash: ranges.length ? safeHash(ranges.map((entry) => ({
      source: entry.source,
      start: entry.start,
      end: entry.end,
      inverted: entry.inverted,
      outOfBounds: entry.outOfBounds
    }))) : null
  };
}

function summaryceptionStalenessDiagnostics({
  summaryceptionMetadata = {},
  markers = {},
  chatLength = 0
} = {}) {
  const explicitStaleness = asObject(summaryceptionMetadata.staleness || summaryceptionMetadata.visibilityDiagnostics);
  if (explicitStaleness.status) {
    return {
      status: asString(explicitStaleness.status) || 'unknown',
      chatLength: boundedInteger(explicitStaleness.chatLength, chatLength),
      summarizedRangeBeyondChat: explicitStaleness.summarizedRangeBeyondChat === true,
      staleAfterMutation: explicitStaleness.staleAfterMutation === true,
      ghostedSystemVisibleCount: boundedInteger(explicitStaleness.ghostedSystemVisibleCount, markers.summaryceptionGhostedSystemVisible || 0),
      summarizedOnlyCount: boundedInteger(explicitStaleness.summarizedOnlyCount, 0)
    };
  }
  const summarizedUpTo = boundedInteger(summaryceptionMetadata.summarizedUpTo, -1);
  const summarizedRangeBeyondChat = summarizedUpTo >= chatLength && chatLength > 0;
  const staleAfterMutation = summaryceptionMetadata.stale === true || summaryceptionMetadata.staleAfterMutation === true;
  const ghostedSystemVisibleCount = markers.summaryceptionGhostedSystemVisible || 0;
  const summarizedOnlyCount = Math.max(0, Number(summaryceptionMetadata.summarizedOnlyCount || 0));
  const status = summarizedRangeBeyondChat || staleAfterMutation
    ? 'stale'
    : ghostedSystemVisibleCount > 0
      ? 'ghosted-system-visible'
      : summarizedUpTo >= 0 || asArray(summaryceptionMetadata.layers).length || markers.summaryceptionGhosted
        ? 'observed'
        : 'unknown';
  return {
    status,
    chatLength,
    summarizedRangeBeyondChat,
    staleAfterMutation,
    ghostedSystemVisibleCount,
    summarizedOnlyCount
  };
}

function vectFoxBackendDiagnostics(vectFoxSettings = {}, markers = {}) {
  const backendType = asString(vectFoxSettings.vector_backend || vectFoxSettings.backendType || vectFoxSettings.backend);
  const unavailable = truthy(vectFoxSettings.unavailable)
    || truthy(vectFoxSettings.backendUnavailable)
    || truthy(vectFoxSettings.qdrantUnavailable);
  const disabled = vectFoxSettings.enabled === false;
  const externalBackend = /qdrant|cloud|remote/i.test(backendType || '');
  const localBackend = /local|fixture/i.test(backendType || '');
  const retrievalLatencyMs = boundedInteger(
    vectFoxSettings.retrievalLatencyMs
    ?? vectFoxSettings.lastRetrievalLatencyMs
    ?? vectFoxSettings.timing?.retrievalLatencyMs
  );
  const interceptorLatencyMs = boundedInteger(
    vectFoxSettings.interceptorLatencyMs
    ?? vectFoxSettings.lastInterceptorLatencyMs
    ?? vectFoxSettings.timing?.interceptorLatencyMs
  );
  const timingSeen = retrievalLatencyMs !== null || interceptorLatencyMs !== null || truthy(vectFoxSettings.timing?.observed);
  const status = disabled
    ? 'disabled'
    : unavailable
      ? 'unavailable'
      : externalBackend
        ? 'external-backend-configured'
        : localBackend
          ? 'local-backend-configured'
          : backendType
            ? 'configured'
            : objectKeyCount(vectFoxSettings) > 0 || markers.vectFoxGhosted > 0
              ? 'observed'
              : 'unknown';
  return {
    status,
    backendType,
    unavailable,
    externalTimingObserved: timingSeen,
    interceptorLatencyMs,
    retrievalLatencyMs,
    timingHash: timingSeen ? safeHash({ interceptorLatencyMs, retrievalLatencyMs }) : null
  };
}

function externalTimingDiagnostics(input = {}, source = null) {
  const timing = asObject(input.timing);
  const diagnostics = compactObject(Object.fromEntries(Object.entries({
    observed: truthy(input.timingObserved) || truthy(timing.observed),
    composeLatencyMs: boundedInteger(input.composeLatencyMs ?? input.promptComposeLatencyMs ?? timing.composeLatencyMs ?? timing.promptComposeLatencyMs),
    scanLatencyMs: boundedInteger(input.scanLatencyMs ?? input.worldInfoScanLatencyMs ?? input.memoryScanLatencyMs ?? timing.scanLatencyMs ?? timing.worldInfoScanLatencyMs ?? timing.memoryScanLatencyMs),
    retrievalLatencyMs: boundedInteger(input.retrievalLatencyMs ?? input.lastRetrievalLatencyMs ?? timing.retrievalLatencyMs ?? timing.lastRetrievalLatencyMs),
    summaryLatencyMs: boundedInteger(input.summaryLatencyMs ?? input.lastSummaryLatencyMs ?? timing.summaryLatencyMs ?? timing.lastSummaryLatencyMs),
    interceptorLatencyMs: boundedInteger(input.interceptorLatencyMs ?? input.lastInterceptorLatencyMs ?? timing.interceptorLatencyMs ?? timing.lastInterceptorLatencyMs),
    source
  }).filter(([, value]) => value !== null)));
  const observed = diagnostics.observed
    || diagnostics.composeLatencyMs !== null
    || diagnostics.scanLatencyMs !== null
    || diagnostics.retrievalLatencyMs !== null
    || diagnostics.summaryLatencyMs !== null
    || diagnostics.interceptorLatencyMs !== null;
  return observed ? diagnostics : undefined;
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
  const worldEntries = worldEntriesFrom(resolvedContext);
  const worldInfoNames = activeWorldInfoNames(worldInfoSettings);
  const markers = summarizeSillyTavernExternalMessageMarkers(chat);
  const memoryBooksSettings = asObject(
    extensionSettings.STMemoryBooks
    || extensionSettings.stMemoryBooks
    || extensionSettings.memoryBooks
  );
  const memoryBooksModule = asObject(memoryBooksSettings.moduleSettings || memoryBooksSettings);
  const summaryceptionSettings = asObject(extensionSettings.summaryception);
  const summaryceptionMetadata = asObject(
    chatMetadata.summaryception
    || summaryceptionSettings.fixtureDiagnostics
    || (
      summaryceptionSettings.staleness
      || summaryceptionSettings.summarizedUpTo !== undefined
      || summaryceptionSettings.layerCount !== undefined
      || summaryceptionSettings.ghostedCount !== undefined
        ? summaryceptionSettings
        : {}
    )
  );
  const vectFoxSettings = asObject(extensionSettings.vectfox || extensionSettings.VectFox);
  const vectFoxPromptKeys = promptKeys.filter((key) => /^3_vectfox/i.test(key));
  const chatLength = chat.length;

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
      promptPositions: extensionPromptPositions(promptKeys),
      timingDiagnostics: externalTimingDiagnostics(worldInfoSettings, 'stLorebooks')
    },
    memoryBooks: {
      installed: objectKeyCount(memoryBooksSettings) > 0 || Boolean(globalThis.STMemoryBooks || globalThis.SillyTavernMemoryBooks),
      enabled: truthy(memoryBooksSettings.enabled) || truthy(memoryBooksModule.enabled),
      activeBookName: chatMetadata.world_info || null,
      entryCount: memoryBooksSettings.entryCount || memoryBooksModule.entryCount || chatMetadata.STMemoryBooks?.entryCount,
      entryHash: memoryBooksSettings.entryHash || memoryBooksModule.entryHash || (chatMetadata.STMemoryBooks ? safeHash(chatMetadata.STMemoryBooks) : null),
      rangeDiagnostics: stMemoryBookRangeDiagnostics({
        chatMetadata,
        memoryBooksSettings,
        memoryBooksModule,
        worldEntries,
        chatLength
      }),
      riskyModes: {
        autoSummary: truthy(memoryBooksModule.autoSummaryEnabled) || truthy(memoryBooksModule.autoSummary?.enabled),
        autoCreate: truthy(memoryBooksModule.autoCreateEnabled),
        autoHideUnhide: truthy(memoryBooksModule.unhideBeforeMemory) || Boolean(memoryBooksModule.autoHideMode),
        sidePrompts: truthy(memoryBooksModule.sidePromptsEnabled) || truthy(memoryBooksModule.sidePrompts?.enabled),
        atDepthUserOrAssistant: Number(memoryBooksModule.summaryEntrySettings?.position) === 4
      },
      timingDiagnostics: externalTimingDiagnostics({
        ...memoryBooksSettings,
        ...memoryBooksModule,
        timing: memoryBooksSettings.timing || memoryBooksModule.timing
      }, 'memoryBooks')
    },
    summaryception: {
      installed: objectKeyCount(summaryceptionSettings) > 0 || Boolean(globalThis.Summaryception || globalThis.summaryception),
      enabled: truthy(summaryceptionSettings.enabled),
      promptKeyActive: promptKeys.includes('summaryception'),
      summarizedUpTo: summaryceptionMetadata.summarizedUpTo,
      layerCount: asArray(summaryceptionMetadata.layers).length || summaryceptionMetadata.layerCount,
      ghostedCount: Math.max(asArray(summaryceptionMetadata.ghostedIndices).length, Number(summaryceptionMetadata.ghostedCount || 0), markers.summaryceptionGhosted),
      staleness: summaryceptionStalenessDiagnostics({
        summaryceptionMetadata,
        markers,
        chatLength
      }),
      injectionHash: objectKeyCount(summaryceptionSettings) > 0 ? safeHash(summaryceptionSettings) : null,
      externalModelCalls: Boolean(summaryceptionSettings.connectionSource && summaryceptionSettings.connectionSource !== 'profile'),
      timingDiagnostics: externalTimingDiagnostics({
        ...summaryceptionSettings,
        ...summaryceptionMetadata,
        timing: summaryceptionSettings.timing || summaryceptionMetadata.timing
      }, 'summaryception')
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
      backendDiagnostics: vectFoxBackendDiagnostics(vectFoxSettings, markers),
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
