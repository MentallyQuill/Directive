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
      return {
        messages: [
          injected,
          ...originalMessages
        ],
        breakdown: [
          {
            messageIndex: 0,
            name: attributionLabel
          }
        ]
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
