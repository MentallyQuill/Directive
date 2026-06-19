import {
  createHostPromptInjectionPacket
} from '../../generation/prompt-injection-safety.mjs';

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireFunction(value, label) {
  if (typeof value !== 'function') {
    throw new Error(`${label} must be a function`);
  }
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function safeMessages(messages) {
  return Array.isArray(messages) ? cloneJson(messages) : [];
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return null;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return null;
}

function normalizeLumiverseInterceptorSource(context = {}) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return null;
  }
  const source = context.source && typeof context.source === 'object' && !Array.isArray(context.source)
    ? context.source
    : {};
  const normalized = {
    chatId: firstString(context.chatId, context.chat_id, source.chatId, source.chat_id),
    messageId: firstString(context.messageId, context.message_id, source.messageId, source.message_id),
    sourceId: firstString(context.sourceId, context.source_id, source.id, source.sourceId, source.source_id),
    sourceIndex: firstFiniteNumber(context.sourceIndex, context.source_index, source.index, source.sourceIndex, source.source_index),
    listingId: firstString(context.listingId, context.listing_id, source.listingId, source.listing_id),
    registryRef: firstString(context.registryRef, context.registry_ref, context.domRef, context.dom_ref, source.registryRef, source.registry_ref)
  };
  const entries = Object.entries(normalized).filter(([, value]) => value !== null);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function logInterceptorFailure(spindle, error) {
  const logger = spindle?.log;
  const message = `[Directive] Lumiverse interceptor skipped: ${error?.message || error}`;
  if (typeof logger?.warn === 'function') {
    logger.warn(message);
  } else if (typeof logger?.info === 'function') {
    logger.info(message);
  }
}

export function createLumiverseInterceptorHandler({
  buildPromptBlocks,
  attributionLabel = 'Directive Context',
  role = 'system',
  now = null,
  loggerSpindle = null
} = {}) {
  requireFunction(buildPromptBlocks, 'buildPromptBlocks');

  return async function directiveLumiverseInterceptor(messages = [], context = {}) {
    const originalMessages = safeMessages(messages);
    try {
      const blocks = await buildPromptBlocks({
        messages: originalMessages,
        context: cloneJson(context)
      });
      const packet = createHostPromptInjectionPacket({
        blocks: Array.isArray(blocks) ? blocks : [],
        attributionLabel,
        createdAt: typeof now === 'function' ? now() : now
      });
      if (packet.blocks.length === 0 || !packet.text.trim()) {
        return originalMessages;
      }
      const injected = {
        role,
        content: packet.text
      };
      const lumiverseSource = normalizeLumiverseInterceptorSource(context);
      const breakdownEntry = {
        messageIndex: 0,
        name: attributionLabel,
        blocks: packet.breakdown
      };
      if (lumiverseSource) {
        breakdownEntry.lumiverseSource = lumiverseSource;
      }
      return {
        messages: [
          injected,
          ...originalMessages
        ],
        breakdown: [breakdownEntry]
      };
    } catch (error) {
      logInterceptorFailure(loggerSpindle, error);
      return originalMessages;
    }
  };
}

export function registerLumiverseDirectiveInterceptor({
  spindle,
  priority = 80,
  ...handlerOptions
} = {}) {
  requireObject(spindle, 'spindle');
  requireFunction(spindle.registerInterceptor, 'spindle.registerInterceptor');
  const handler = createLumiverseInterceptorHandler({
    ...handlerOptions,
    loggerSpindle: handlerOptions.loggerSpindle || spindle
  });
  return spindle.registerInterceptor(handler, priority);
}
