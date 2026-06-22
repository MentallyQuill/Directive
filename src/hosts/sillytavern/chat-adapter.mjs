const DIRECTIVE_MESSAGE_METADATA_KEY = 'directive';
const DIRECTIVE_CHAT_METADATA_KEY = 'directiveCampaignBinding';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function nonEmptyString(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function messageText(message) {
  const value = message?.mes ?? message?.content ?? message?.text ?? '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .filter((part) => part && (part.type === 'text' || typeof part.text === 'string'))
      .map((part) => part.text || '')
      .join('\n');
  }
  return String(value || '');
}

function getChatArray(context) {
  return Array.isArray(context?.chat) ? context.chat : [];
}

function contextChatId(context) {
  const direct = [
    context?.chatId,
    context?.chat_id,
    context?.currentChatId,
    context?.current_chat_id,
    typeof context?.getCurrentChatId === 'function' ? context.getCurrentChatId() : null
  ];
  for (const value of direct) {
    const normalized = nonEmptyString(value);
    if (normalized) return normalized;
  }
  const metadataId = nonEmptyString(context?.chatMetadata?.chat_id || context?.chat_metadata?.chat_id);
  if (metadataId) return metadataId;
  return null;
}

function currentEntity(context) {
  const groupId = nonEmptyString(context?.groupId || context?.group_id || context?.selectedGroupId);
  if (groupId) {
    return {
      entityType: 'group',
      entityId: groupId,
      entityName: nonEmptyString(context?.groups?.find?.((group) => String(group?.id) === groupId)?.name) || 'Group'
    };
  }
  const characterId = nonEmptyString(
    context?.characterId
    ?? context?.character_id
    ?? context?.this_chid
    ?? context?.selectedCharacterId
  );
  return {
    entityType: 'character',
    entityId: characterId,
    entityName: nonEmptyString(context?.name2 || context?.characterName) || 'Character'
  };
}

function hasSelectedChatEntity(entity) {
  return Boolean(entity?.entityId && ['character', 'group'].includes(entity.entityType));
}

function chatMetadataObject(context) {
  if (context?.chatMetadata && typeof context.chatMetadata === 'object') return context.chatMetadata;
  if (context?.chat_metadata && typeof context.chat_metadata === 'object') return context.chat_metadata;
  if (context && typeof context === 'object') {
    context.chatMetadata = {};
    return context.chatMetadata;
  }
  return null;
}

async function saveChat(context) {
  const save = context?.saveChat
    || context?.saveChatConditional
    || globalThis.saveChat
    || globalThis.SillyTavern?.getContext?.()?.saveChat;
  if (typeof save === 'function') {
    await save.call(context);
  }
}

async function saveMetadata(context) {
  const save = context?.saveMetadata
    || globalThis.saveMetadata
    || globalThis.SillyTavern?.getContext?.()?.saveMetadata;
  if (typeof save === 'function') {
    await save.call(context);
    return;
  }
  await saveChat(context);
}

async function tryCreateChat(context, name) {
  const attempts = [
    ['createNewChat', [{ name }]],
    ['createNewChat', [name]],
    ['createChat', [{ name }]],
    ['createChat', [name]],
    ['newChat', [{ name }]],
    ['newChat', [name]]
  ];
  const errors = [];
  const beforeId = contextChatId(context);
  for (const [methodName, args] of attempts) {
    const method = context?.[methodName];
    if (typeof method !== 'function') continue;
    try {
      const result = await method.apply(context, args);
      const chatId = nonEmptyString(
        result?.chatId
        || result?.chat_id
        || result?.id
        || (typeof result === 'string' ? result : null)
        || contextChatId(context)
      );
      if (chatId && (chatId !== beforeId || result)) {
        return {
          created: true,
          method: methodName,
          chatId,
          result: cloneJson(result)
        };
      }
    } catch (error) {
      errors.push(`${methodName}: ${error?.message || String(error)}`);
    }
  }

  const executeSlash = context?.executeSlashCommandsWithOptions
    || context?.executeSlashCommands
    || globalThis.executeSlashCommandsWithOptions;
  if (typeof executeSlash === 'function') {
    const commands = [
      `/newchat name=${JSON.stringify(name)}`,
      `/newchat ${name}`
    ];
    for (const command of commands) {
      try {
        const result = await executeSlash.call(context, command, {
          handleParserErrors: false,
          showOutput: false
        });
        const chatId = contextChatId(context);
        if (chatId && chatId !== beforeId) {
          return {
            created: true,
            method: 'slash:/newchat',
            chatId,
            result: cloneJson(result)
          };
        }
      } catch (error) {
        errors.push(`slash:/newchat: ${error?.message || String(error)}`);
      }
    }
  }

  return {
    created: false,
    method: null,
    chatId: contextChatId(context),
    errors
  };
}

async function clearFreshDirectiveChatOpeningMessages(context) {
  const chat = getChatArray(context);
  if (!chat.length) {
    return { removedMessageCount: 0, status: 'empty' };
  }
  const canClear = chat.every((message) => (
    message?.is_user !== true
    && message?.role !== 'user'
    && !directiveMetadata(message)
  ));
  if (!canClear) {
    return {
      removedMessageCount: 0,
      preservedMessageCount: chat.length,
      status: 'preserved',
      reason: 'unexpected-fresh-chat-history'
    };
  }
  const removedMessageCount = chat.length;
  chat.splice(0, chat.length);
  await saveChat(context);
  return {
    removedMessageCount,
    status: 'cleared',
    reason: 'host-opening-greeting'
  };
}

function normalizeMessageId(message, index = null) {
  return nonEmptyString(
    message?.id
    ?? message?.messageId
    ?? message?.message_id
    ?? message?.uuid
    ?? message?.extra?.messageId
  ) || (Number.isInteger(index) ? String(index) : null);
}

function directiveMetadata(message) {
  return message?.extra?.[DIRECTIVE_MESSAGE_METADATA_KEY]
    || message?.metadata?.[DIRECTIVE_MESSAGE_METADATA_KEY]
    || null;
}


export function normalizeSillyTavernMessage(message, index = null) {
  if (!message || typeof message !== 'object') return null;
  const metadata = directiveMetadata(message);
  return {
    id: normalizeMessageId(message, Number.isInteger(index) ? index : null),
    hostMessageId: normalizeMessageId(message, Number.isInteger(index) ? index : null),
    index: Number.isInteger(index) ? index : null,
    text: messageText(message),
    isUser: message.is_user === true || message.role === 'user',
    isSystem: message.is_system === true || message.role === 'system',
    directiveOwned: Boolean(metadata),
    isDirectiveOwned: Boolean(metadata),
    metadata: cloneJson(metadata),
    raw: cloneJson(message)
  };
}

export function findLatestSillyTavernUserMessage(chat = []) {
  const source = Array.isArray(chat) ? chat : [];
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const normalized = normalizeSillyTavernMessage(source[index], index);
    if (normalized?.isUser && !normalized.directiveOwned) return normalized;
  }
  return null;
}

export function normalizeSillyTavernMessagePayload(context, payload = null) {
  const chat = getChatArray(context);
  let index = null;
  if (Number.isInteger(payload)) index = payload;
  if (Number.isInteger(payload?.messageId)) index = payload.messageId;
  if (Number.isInteger(payload?.message_id)) index = payload.message_id;
  if (Number.isInteger(payload?.index)) index = payload.index;

  let message = payload?.message && typeof payload.message === 'object'
    ? payload.message
    : null;
  if (!message && Number.isInteger(index)) message = chat[index] || null;
  if (!message && payload && typeof payload === 'object' && (
    'mes' in payload || 'content' in payload || 'is_user' in payload
  )) {
    message = payload;
  }
  if (!message) {
    for (let cursor = chat.length - 1; cursor >= 0; cursor -= 1) {
      if (chat[cursor]?.is_user === true) {
        message = chat[cursor];
        index = cursor;
        break;
      }
    }
  }
  if (!message) return null;
  if (!Number.isInteger(index)) index = chat.indexOf(message);

  return {
    hostMessageId: normalizeMessageId(message, index >= 0 ? index : null),
    index: index >= 0 ? index : null,
    chatId: contextChatId(context),
    text: messageText(message),
    isUser: message.is_user === true || message.role === 'user',
    isSystem: message.is_system === true || message.role === 'system',
    isDirectiveOwned: Boolean(directiveMetadata(message)),
    metadata: cloneJson(directiveMetadata(message)),
    raw: cloneJson(message)
  };
}

export function createSillyTavernChatAdapter({
  contextFactory = () => globalThis.SillyTavern?.getContext?.() || null,
  now = () => new Date().toISOString()
} = {}) {
  function context() {
    return contextFactory?.() || null;
  }

  function getCurrentBinding() {
    const ctx = context();
    if (!ctx) return null;
    const entity = currentEntity(ctx);
    return {
      hostId: 'sillytavern',
      chatId: contextChatId(ctx),
      ...entity,
      chatName: nonEmptyString(ctx?.chatName || ctx?.chat?.name || ctx?.chatMetadata?.name) || null
    };
  }

  async function createOrBindCampaignChat({
    name,
    fallbackName = 'Directive',
    campaignId,
    saveId,
    existingChatId = null,
    createNew = true
  } = {}) {
    let ctx = context();
    if (!ctx) throw new Error('SillyTavern context is unavailable for chat binding.');
    const initialEntity = currentEntity(ctx);
    const requestedChatId = nonEmptyString(existingChatId);
    let result = {
      created: false,
      method: 'bind-current',
      chatId: requestedChatId || contextChatId(ctx),
      errors: [],
      name: nonEmptyString(name)
    };
    let freshChatCleanup = null;

    if (requestedChatId && requestedChatId !== contextChatId(ctx)) {
      const opened = await open({
        chatId: requestedChatId,
        entityType: initialEntity.entityType,
        entityId: initialEntity.entityId
      });
      ctx = context();
      if (!opened || contextChatId(ctx) !== requestedChatId) {
        const error = new Error(`Directive could not open the requested SillyTavern chat ${requestedChatId}.`);
        error.code = 'DIRECTIVE_CHAT_BINDING_OPEN_FAILED';
        error.details = { chatId: requestedChatId };
        throw error;
      }
    }

    if (createNew && !requestedChatId) {
      if (!hasSelectedChatEntity(initialEntity)) {
        const error = new Error('Select the character or group Directive should use for this campaign chat, then start the campaign.');
        error.code = 'DIRECTIVE_CHAT_ENTITY_REQUIRED';
        error.details = { entityType: initialEntity.entityType };
        throw error;
      }
      const requestedName = nonEmptyString(name) || nonEmptyString(fallbackName) || 'Directive';
      const fallback = nonEmptyString(fallbackName);
      const names = [...new Set([requestedName, fallback].filter(Boolean))];
      let created = null;
      const allErrors = [];
      for (const candidateName of names) {
        created = await tryCreateChat(ctx, candidateName);
        if (created.created && created.chatId) {
          created.name = candidateName;
          break;
        }
        allErrors.push(...(created.errors || []));
      }
      if (!created.created || !created.chatId) {
        const error = new Error('Directive could not create a fresh SillyTavern campaign chat. Select the intended character or group, then resume activation.');
        error.code = 'DIRECTIVE_CHAT_CREATE_FAILED';
        error.details = { attempts: allErrors };
        throw error;
      }
      result = created;
      ctx = context();
      const rename = ctx?.renameChat || globalThis.renameChat;
      if (typeof rename === 'function' && nonEmptyString(result.name)) {
        try {
          await rename.call(ctx, nonEmptyString(result.name));
        } catch {
          // Chat creation remains valid when the host refuses an automatic rename.
        }
      }
      freshChatCleanup = await clearFreshDirectiveChatOpeningMessages(ctx);
    }

    const chatId = nonEmptyString(result.chatId) || contextChatId(ctx);
    if (!chatId) {
      const error = new Error('Directive could not create or identify a SillyTavern chat. Select a character or group and open a chat first.');
      error.code = 'DIRECTIVE_CHAT_BINDING_UNAVAILABLE';
      error.details = { attempts: result.errors || [] };
      throw error;
    }

    ctx = context();
    if (contextChatId(ctx) !== chatId) {
      const opened = await open({
        chatId,
        entityType: initialEntity.entityType,
        entityId: initialEntity.entityId
      });
      ctx = context();
      if (!opened || contextChatId(ctx) !== chatId) {
        const error = new Error(`Directive identified chat ${chatId}, but SillyTavern did not make it the active chat.`);
        error.code = 'DIRECTIVE_CHAT_BINDING_NOT_ACTIVE';
        error.details = { chatId, creationMethod: result.method || null };
        throw error;
      }
    }

    const entity = currentEntity(ctx);

    const binding = {
      hostId: 'sillytavern',
      chatId,
      campaignId: nonEmptyString(campaignId),
      saveId: nonEmptyString(saveId),
      createdOrBoundAt: now(),
      entityType: entity.entityType,
      entityId: entity.entityId,
      entityName: entity.entityName,
      chatName: nonEmptyString(result.name)
        || nonEmptyString(name)
        || nonEmptyString(ctx?.chatName || ctx?.chat?.name || ctx?.chatMetadata?.name)
        || null,
      createdByDirective: result.created === true,
      creationMethod: result.method || 'bind-current',
      freshChatCleanup: cloneJson(freshChatCleanup)
    };
    const metadata = chatMetadataObject(ctx);
    if (metadata) metadata[DIRECTIVE_CHAT_METADATA_KEY] = cloneJson(binding);
    await saveMetadata(ctx);
    return binding;
  }

  function isCurrentChat(chatId) {
    const expected = nonEmptyString(chatId);
    return Boolean(expected && expected === contextChatId(context()));
  }

  function getRecentMessages(options = {}) {
    const { limit = 12, playerSafeOnly = true } = typeof options === 'number'
      ? { limit: options, playerSafeOnly: false }
      : (options || {});
    const chat = getChatArray(context());
    return chat.slice(Math.max(0, chat.length - Math.max(1, Number(limit) || 12))).map((message, offset) => {
      const index = chat.length - Math.min(chat.length, Math.max(1, Number(limit) || 12)) + offset;
      const normalized = normalizeSillyTavernMessagePayload(context(), { message, index });
      if (!normalized) return null;
      if (playerSafeOnly) delete normalized.raw;
      return normalized;
    }).filter(Boolean);
  }

  function getLatestPlayerMessage() {
    const ctx = context();
    const chat = getChatArray(ctx);
    for (let index = chat.length - 1; index >= 0; index -= 1) {
      const message = normalizeSillyTavernMessagePayload(ctx, { message: chat[index], index });
      if (message?.isUser && !message.isDirectiveOwned) return message;
    }
    return null;
  }

  function getMessage(hostMessageId) {
    const ctx = context();
    const chat = getChatArray(ctx);
    const id = nonEmptyString(hostMessageId);
    if (!id) return null;
    const numericIndex = Number(id);
    if (Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < chat.length) {
      return normalizeSillyTavernMessagePayload(ctx, {
        message: chat[numericIndex],
        index: numericIndex
      });
    }
    for (let index = 0; index < chat.length; index += 1) {
      if (normalizeMessageId(chat[index], index) === id) {
        return normalizeSillyTavernMessagePayload(ctx, { message: chat[index], index });
      }
    }
    return null;
  }

  async function postAssistantMessage({
    text,
    campaignId = null,
    turnId = null,
    outcomeId = null,
    responseKind = 'narration',
    idempotencyKey,
    extra = {}
  } = {}) {
    const ctx = context();
    if (!ctx) throw new Error('SillyTavern context is unavailable for message posting.');
    const normalizedText = String(text || '').trim();
    if (!normalizedText) throw new Error('Assistant message text must be non-empty.');
    const key = nonEmptyString(idempotencyKey)
      || `${campaignId || 'campaign'}:${turnId || outcomeId || Date.now()}:${responseKind}`;
    const chat = getChatArray(ctx);
    const existingIndex = chat.findIndex((message) => directiveMetadata(message)?.idempotencyKey === key);
    if (existingIndex >= 0) {
      return {
        posted: false,
        duplicate: true,
        hostMessageId: normalizeMessageId(chat[existingIndex], existingIndex),
        index: existingIndex,
        idempotencyKey: key
      };
    }

    const directive = {
      owner: 'directive',
      campaignId,
      turnId,
      outcomeId,
      responseKind,
      idempotencyKey: key,
      postedAt: now()
    };
    const message = {
      name: nonEmptyString(ctx.name2) || 'Narrator',
      is_user: false,
      is_system: false,
      send_date: now(),
      mes: normalizedText,
      extra: {
        ...cloneJson(extra),
        [DIRECTIVE_MESSAGE_METADATA_KEY]: directive
      }
    };
    chat.push(message);
    const index = chat.length - 1;
    const add = ctx.addOneMessage || globalThis.addOneMessage;
    if (typeof add === 'function') {
      try {
        await add.call(ctx, message, { scroll: true });
      } catch {
        await add.call(ctx, message);
      }
    }
    await saveChat(ctx);
    return {
      posted: true,
      duplicate: false,
      hostMessageId: normalizeMessageId(message, index),
      index,
      idempotencyKey: key,
      message: cloneJson(message)
    };
  }

  async function updateBindingMetadata(binding) {
    const ctx = context();
    if (!ctx) return false;
    const metadata = chatMetadataObject(ctx);
    if (!metadata) return false;
    metadata[DIRECTIVE_CHAT_METADATA_KEY] = cloneJson(binding);
    await saveMetadata(ctx);
    return true;
  }

  function getBindingMetadata() {
    const metadata = chatMetadataObject(context());
    return cloneJson(metadata?.[DIRECTIVE_CHAT_METADATA_KEY] || null);
  }

  async function open(binding) {
    const ctx = context();
    if (!ctx || !binding) return false;
    if (isCurrentChat(binding.chatId)) return true;

    const entityType = nonEmptyString(binding.entityType) || (binding.entityId ? 'character' : null);
    const methods = [
      ['openChat', [binding.chatId]],
      ...(entityType === 'group'
        ? [['openGroupChat', [binding.entityId, binding.chatId]]]
        : [['openCharacterChat', [binding.chatId]]]),
      ['selectChat', [binding.chatId]]
    ];
    for (const [methodName, args] of methods) {
      if (typeof ctx[methodName] !== 'function') continue;
      try {
        await ctx[methodName](...args);
        if (isCurrentChat(binding.chatId)) return true;
      } catch {
        // Try the next host API shape.
      }
    }
    return false;
  }

  return {
    id: 'sillytavern-chat-adapter',
    getCurrentChatId: () => contextChatId(context()),
    getCurrentBinding,
    createOrBindCampaignChat,
    isCurrentChat,
    getRecentMessages,
    getLatestPlayerMessage,
    getMessage,
    normalizeMessagePayload: (payload) => normalizeSillyTavernMessagePayload(context(), payload),
    postAssistantMessage,
    updateBindingMetadata,
    getBindingMetadata,
    open,
    save: () => saveChat(context())
  };
}

export const __sillyTavernChatAdapterTestHooks = Object.freeze({
  contextChatId,
  currentEntity,
  normalizeMessageId,
  directiveMetadata,
  tryCreateChat,
  clearFreshDirectiveChatOpeningMessages
});
