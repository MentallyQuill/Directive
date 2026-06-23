const DIRECTIVE_MESSAGE_METADATA_KEY = 'directive';
const DIRECTIVE_CHAT_METADATA_KEY = 'directiveCampaignBinding';
const DIRECTIVE_CHARACTER_CREATOR = 'Directive';
const DIRECTIVE_CHARACTER_CREATOR_NOTES = 'Created automatically by Directive so a campaign can start in its own SillyTavern character card and chat.';
const SILLYTAVERN_REGENERATE_OVERSWIPE_BEHAVIOR = 'regenerate';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function getCharactersArray(context) {
  if (Array.isArray(context?.characters)) return context.characters;
  if (Array.isArray(globalThis.characters)) return globalThis.characters;
  return [];
}

function characterEntryName(entry) {
  return nonEmptyString(entry?.name || entry?.data?.name);
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
  const groupId = nonEmptyString(
    context?.groupId
    || context?.group_id
    || context?.selectedGroupId
    || globalThis.selected_group
  );
  if (groupId) {
    const groups = Array.isArray(context?.groups)
      ? context.groups
      : (Array.isArray(globalThis.groups) ? globalThis.groups : []);
    return {
      entityType: 'group',
      entityId: groupId,
      entityName: nonEmptyString(groups.find?.((group) => String(group?.id) === groupId)?.name) || 'Group'
    };
  }
  const characterId = nonEmptyString(
    context?.characterId
    ?? context?.character_id
    ?? context?.this_chid
    ?? context?.selectedCharacterId
    ?? globalThis.this_chid
  );
  const characters = getCharactersArray(context);
  const characterName = nonEmptyString(context?.name2 || context?.characterName || globalThis.name2);
  const resolvedCharacterId = characterId || (() => {
    if (!characterName || !Array.isArray(characters)) return null;
    const normalizedName = characterName.toLowerCase();
    const index = characters.findIndex((entry) => nonEmptyString(entry?.name)?.toLowerCase() === normalizedName);
    return index >= 0 ? String(index) : null;
  })();
  return {
    entityType: 'character',
    entityId: resolvedCharacterId,
    entityName: nonEmptyString(
      characterName
      || characters?.[resolvedCharacterId]?.name
    ) || 'Character'
  };
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function directiveNameOrdinal(name, baseName) {
  const normalizedName = nonEmptyString(name);
  const normalizedBase = nonEmptyString(baseName);
  if (!normalizedName || !normalizedBase) return null;
  if (normalizedName.toLowerCase() === normalizedBase.toLowerCase()) return 0;
  const match = normalizedName.match(new RegExp(`^${escapeRegExp(normalizedBase)} \\((\\d+)\\)$`, 'i'));
  if (!match) return null;
  const ordinal = Number(match[1]);
  return Number.isInteger(ordinal) && ordinal >= 1 ? ordinal : null;
}

function nextAvailableDirectiveCharacterName(context, baseName) {
  const base = nonEmptyString(baseName) || 'Directive';
  const used = new Set();
  for (const entry of getCharactersArray(context)) {
    const ordinal = directiveNameOrdinal(characterEntryName(entry), base);
    if (ordinal !== null) used.add(ordinal);
  }
  if (!used.has(0)) return base;
  for (let ordinal = 1; ordinal < 10000; ordinal += 1) {
    if (!used.has(ordinal)) return `${base} (${ordinal})`;
  }
  return `${base} (${Date.now()})`;
}

function findCharacterReference(context, { name = null, avatar = null } = {}) {
  const characters = getCharactersArray(context);
  const normalizedName = nonEmptyString(name)?.toLowerCase() || null;
  const normalizedAvatar = nonEmptyString(avatar)?.toLowerCase() || null;
  for (let index = 0; index < characters.length; index += 1) {
    const entry = characters[index];
    const entryName = characterEntryName(entry)?.toLowerCase() || null;
    const entryAvatar = nonEmptyString(entry?.avatar || entry?.avatar_url || entry?.filename)?.toLowerCase() || null;
    if ((normalizedAvatar && entryAvatar === normalizedAvatar) || (normalizedName && entryName === normalizedName)) {
      return {
        entityType: 'character',
        entityId: String(index),
        entityName: characterEntryName(entry) || nonEmptyString(name) || 'Directive'
      };
    }
  }
  return null;
}

function directiveCharacterPayload({ name, campaignId = null, saveId = null } = {}) {
  return {
    ch_name: nonEmptyString(name) || 'Directive',
    description: '',
    first_mes: '',
    personality: '',
    scenario: '',
    mes_example: '',
    creator_notes: DIRECTIVE_CHARACTER_CREATOR_NOTES,
    creator: DIRECTIVE_CHARACTER_CREATOR,
    character_version: '1',
    tags: ['Directive'],
    talkativeness: '0.5',
    extensions: JSON.stringify({
      directive: {
        kind: 'campaign-shell',
        campaignId: nonEmptyString(campaignId),
        saveId: nonEmptyString(saveId)
      }
    })
  };
}

function hasSelectedChatEntity(entity) {
  return Boolean(entity?.entityId && ['character', 'group'].includes(entity.entityType));
}

function isSystemEntityName(entity) {
  return /sillytavern\s+system/i.test(String(entity?.entityName || ''));
}

function entityFromChatId(context, chatId) {
  const id = nonEmptyString(chatId);
  if (!id) return null;
  const characters = getCharactersArray(context);
  if (!Array.isArray(characters) || characters.length === 0) return null;
  const normalizedChatId = id.toLowerCase();
  let best = null;
  for (let index = 0; index < characters.length; index += 1) {
    const name = characterEntryName(characters[index]);
    if (!name || !normalizedChatId.startsWith(name.toLowerCase())) continue;
    if (!best || name.length > best.entityName.length) {
      best = {
        entityType: 'character',
        entityId: String(index),
        entityName: name
      };
    }
  }
  return best;
}

function bestEntityForBinding(context, chatId, initialEntity = null) {
  const current = currentEntity(context);
  if (hasSelectedChatEntity(current) && !isSystemEntityName(current)) return current;
  const inferred = entityFromChatId(context, chatId);
  if (hasSelectedChatEntity(inferred)) return inferred;
  if (hasSelectedChatEntity(initialEntity) && !isSystemEntityName(initialEntity)) return initialEntity;
  return current;
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

function canAttemptHostChatCreation(context) {
  if (!context) return false;
  if (['createNewChat', 'createChat', 'newChat'].some((methodName) => typeof context?.[methodName] === 'function')) return true;
  return Boolean(
    typeof context?.executeSlashCommandsWithOptions === 'function'
    || typeof context?.executeSlashCommands === 'function'
    || typeof globalThis.executeSlashCommandsWithOptions === 'function'
  );
}

function directiveCharacterCreator(context) {
  const method = context?.createDirectiveCharacterCard
    || context?.createCharacterCard
    || context?.createCharacter;
  if (typeof method === 'function') return { type: 'context', method };
  const fetch = context?.fetch || globalThis.fetch;
  const canUseBrowserFetch = typeof fetch === 'function'
    && typeof globalThis.location?.origin === 'string';
  if (canUseBrowserFetch) return { type: 'fetch', method: fetch };
  return null;
}

function canAttemptDirectiveCharacterCreation(context) {
  return Boolean(directiveCharacterCreator(context));
}

async function refreshCharacters(context) {
  const getCharacters = context?.getCharacters
    || globalThis.getCharacters
    || globalThis.SillyTavern?.getContext?.()?.getCharacters;
  if (typeof getCharacters === 'function') {
    await getCharacters.call(context);
  }
}

async function createDirectiveCharacterCard(context, payload) {
  const creator = directiveCharacterCreator(context);
  if (!creator) {
    return {
      created: false,
      errors: ['No SillyTavern character creation API is available.']
    };
  }
  try {
    if (creator.type === 'context') {
      const result = await creator.method.call(context, payload);
      const avatar = nonEmptyString(
        typeof result === 'string'
          ? result
          : (result?.avatar || result?.avatarKey || result?.avatarName || result?.fileName || result?.filename)
      );
      const entity = nonEmptyString(result?.characterId ?? result?.character_id ?? result?.id) !== null
        ? {
          entityType: 'character',
          entityId: nonEmptyString(result?.characterId ?? result?.character_id ?? result?.id),
          entityName: nonEmptyString(result?.name || payload?.ch_name) || 'Directive'
        }
        : null;
      if (result === false || result === null) {
        return {
          created: false,
          errors: ['Host character creation returned no result.']
        };
      }
      await refreshCharacters(context);
      return {
        created: true,
        method: 'context:createCharacterCard',
        avatar,
        entity: entity || findCharacterReference(context, { name: payload?.ch_name, avatar }),
        result: cloneJson(result)
      };
    }

    const getRequestHeaders = context?.getRequestHeaders
      || globalThis.getRequestHeaders
      || globalThis.SillyTavern?.getContext?.()?.getRequestHeaders;
    const headers = typeof getRequestHeaders === 'function'
      ? getRequestHeaders.call(context)
      : { 'Content-Type': 'application/json' };
    const response = await creator.method.call(globalThis, '/api/characters/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!response?.ok) {
      const text = typeof response?.text === 'function' ? await response.text() : '';
      return {
        created: false,
        errors: [`/api/characters/create failed: ${response?.status || 'unknown'} ${text}`.trim()]
      };
    }
    const avatar = typeof response.text === 'function' ? nonEmptyString(await response.text()) : null;
    await refreshCharacters(context);
    return {
      created: true,
      method: 'fetch:/api/characters/create',
      avatar,
      entity: findCharacterReference(context, { name: payload?.ch_name, avatar })
    };
  } catch (error) {
    return {
      created: false,
      errors: [error?.message || String(error)]
    };
  }
}

async function selectDirectiveCharacter(context, entity) {
  if (!hasSelectedChatEntity(entity)) return false;
  const selectCharacter = context?.selectCharacterById
    || globalThis.selectCharacterById
    || globalThis.SillyTavern?.getContext?.()?.selectCharacterById;
  if (typeof selectCharacter !== 'function') return false;
  try {
    await selectCharacter.call(context, Number(entity.entityId), { switchMenu: false });
    return true;
  } catch {
    return false;
  }
}

async function createAndSelectDirectiveCharacter(context, {
  name,
  fallbackName = 'Directive',
  campaignId = null,
  saveId = null
} = {}) {
  const baseNames = [...new Set([
    nonEmptyString(name),
    nonEmptyString(fallbackName),
    'Directive'
  ].filter(Boolean))];
  const errors = [];
  for (const baseName of baseNames) {
    const characterName = nextAvailableDirectiveCharacterName(context, baseName);
    const payload = directiveCharacterPayload({ name: characterName, campaignId, saveId });
    const created = await createDirectiveCharacterCard(context, payload);
    if (!created.created) {
      errors.push(...(created.errors || []));
      continue;
    }
    let entity = created.entity || findCharacterReference(context, { name: characterName, avatar: created.avatar });
    if (!entity) {
      await refreshCharacters(context);
      entity = findCharacterReference(context, { name: characterName, avatar: created.avatar });
    }
    if (!hasSelectedChatEntity(entity)) {
      errors.push(`Created Directive character "${characterName}", but it was not found in SillyTavern's character list.`);
      return {
        created: false,
        method: created.method,
        entity: null,
        name: characterName,
        avatar: created.avatar,
        errors
      };
    }
    const selected = await selectDirectiveCharacter(context, entity);
    if (!selected) {
      errors.push(`Created Directive character "${characterName}", but SillyTavern did not expose a character-selection API.`);
      return {
        created: false,
        method: created.method,
        entity,
        name: characterName,
        avatar: created.avatar,
        errors
      };
    }
    return {
      created: true,
      method: created.method,
      entity,
      name: characterName,
      avatar: created.avatar,
      errors
    };
  }
  return {
    created: false,
    method: null,
    entity: null,
    name: null,
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

function setDirectiveMetadata(message, patch = {}) {
  if (!message || typeof message !== 'object') return null;
  message.extra = message.extra && typeof message.extra === 'object' && !Array.isArray(message.extra)
    ? message.extra
    : {};
  const current = directiveMetadata(message) || {};
  const next = {
    ...cloneJson(current),
    ...cloneJson(patch)
  };
  message.extra[DIRECTIVE_MESSAGE_METADATA_KEY] = next;
  return next;
}

function normalizeSwipeText(value) {
  return String(value || '').trim();
}

function swipeInfoExtra(extra = {}) {
  const normalized = extra && typeof extra === 'object' && !Array.isArray(extra)
    ? cloneJson(extra)
    : {};
  delete normalized.token_count;
  delete normalized.reasoning;
  delete normalized.reasoning_duration;
  return normalized;
}

function createSwipeInfo(message, { sendDate = null, extra = null } = {}) {
  return {
    send_date: sendDate || message?.send_date || null,
    gen_started: message?.gen_started || null,
    gen_finished: message?.gen_finished || null,
    extra: swipeInfoExtra(extra || message?.extra || {})
  };
}

function ensureMessageSwipeInfo(message) {
  if (!message || typeof message !== 'object') return [];
  if (!Array.isArray(message.swipe_info)) {
    message.swipe_info = (Array.isArray(message.swipes) ? message.swipes : []).map(() => createSwipeInfo(message));
  } else {
    message.swipe_info = message.swipe_info.map((info) => (
      info && typeof info === 'object' && !Array.isArray(info)
        ? info
        : createSwipeInfo(message)
    ));
  }
  while (message.swipe_info.length < (message.swipes?.length || 0)) {
    message.swipe_info.push(createSwipeInfo(message));
  }
  if (message.swipe_info.length > (message.swipes?.length || 0)) {
    message.swipe_info.length = message.swipes.length;
  }
  return message.swipe_info;
}

function ensureMessageSwipes(message) {
  if (!message || typeof message !== 'object') return [];
  const currentText = normalizeSwipeText(messageText(message));
  if (!Array.isArray(message.swipes)) {
    message.swipes = currentText ? [currentText] : [];
  } else {
    message.swipes = message.swipes.map(normalizeSwipeText).filter(Boolean);
    if (currentText && !message.swipes.includes(currentText)) {
      const index = Number.isInteger(message.swipe_id) ? message.swipe_id : message.swipes.length;
      const insertIndex = Math.max(0, Math.min(index, message.swipes.length));
      message.swipes.splice(insertIndex, 0, currentText);
      if (Array.isArray(message.swipe_info)) {
        message.swipe_info.splice(insertIndex, 0, createSwipeInfo(message));
      }
    }
  }
  ensureMessageSwipeInfo(message);
  if (!Number.isInteger(message.swipe_id) || message.swipe_id < 0 || message.swipe_id >= message.swipes.length) {
    message.swipe_id = Math.max(0, message.swipes.length - 1);
  }
  return message.swipes;
}

async function refreshMessageDisplay(context, index, message) {
  const candidates = [
    [context?.updateMessageBlock, [index, message]],
    [globalThis.updateMessageBlock, [index, message]],
    [context?.updateMessage, [index, message]],
    [globalThis.updateMessage, [index, message]],
    [context?.reloadCurrentChat, []],
    [globalThis.reloadCurrentChat, []]
  ];
  for (const [fn, args] of candidates) {
    if (typeof fn !== 'function') continue;
    try {
      await fn.apply(context, args);
      return true;
    } catch {
      // Best effort: the saved chat state remains authoritative.
    }
  }
  return false;
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
    let directiveEntity = null;

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
      if (!canAttemptDirectiveCharacterCreation(ctx)) {
        const error = new Error('Directive could not create a SillyTavern character card for this campaign. Start Campaign requires a Directive-owned character shell.');
        error.code = 'DIRECTIVE_CHARACTER_CREATE_UNAVAILABLE';
        error.details = { entityType: initialEntity.entityType };
        throw error;
      }
      if (!canAttemptHostChatCreation(ctx)) {
        const error = new Error('Directive could not create a fresh SillyTavern campaign chat because no host chat creation API is available.');
        error.code = 'DIRECTIVE_CHAT_CREATE_FAILED';
        error.details = { attempts: [] };
        throw error;
      }
      const requestedName = nonEmptyString(name) || nonEmptyString(fallbackName) || 'Directive';
      const fallback = nonEmptyString(fallbackName);
      const character = await createAndSelectDirectiveCharacter(ctx, {
        name: requestedName,
        fallbackName: fallback,
        campaignId,
        saveId
      });
      if (!character.created || !hasSelectedChatEntity(character.entity)) {
        const error = new Error('Directive could not create and select its SillyTavern campaign character card.');
        error.code = 'DIRECTIVE_CHARACTER_CREATE_FAILED';
        error.details = { attempts: character.errors || [] };
        throw error;
      }
      directiveEntity = character.entity;
      ctx = context();
      const names = [...new Set([character.name, fallback].filter(Boolean))];
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
        const error = new Error('Directive could not create a fresh SillyTavern campaign chat for its Directive-owned character card. Restore SillyTavern chat creation and use Retry Chat Setup.');
        error.code = 'DIRECTIVE_CHAT_CREATE_FAILED';
        error.details = { attempts: allErrors, character: directiveEntity };
        throw error;
      }
      result = created;
      result.characterCreationMethod = character.method;
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
      const error = new Error('Directive could not create or identify a SillyTavern chat. Open an existing bound chat or resume first-start activation after SillyTavern is ready.');
      error.code = 'DIRECTIVE_CHAT_BINDING_UNAVAILABLE';
      error.details = { attempts: result.errors || [] };
      throw error;
    }

    ctx = context();
    if (contextChatId(ctx) !== chatId) {
      const openEntity = directiveEntity || initialEntity;
      const opened = await open({
        chatId,
        entityType: openEntity.entityType,
        entityId: openEntity.entityId
      });
      ctx = context();
      if (!opened || contextChatId(ctx) !== chatId) {
        const error = new Error(`Directive identified chat ${chatId}, but SillyTavern did not make it the active chat.`);
        error.code = 'DIRECTIVE_CHAT_BINDING_NOT_ACTIVE';
        error.details = { chatId, creationMethod: result.method || null };
        throw error;
      }
    }

    const entity = hasSelectedChatEntity(directiveEntity)
      ? directiveEntity
      : bestEntityForBinding(ctx, chatId, initialEntity);

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
      characterCreationMethod: result.characterCreationMethod || null,
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

    const postedAt = now();
    const directive = {
      owner: 'directive',
      campaignId,
      turnId,
      outcomeId,
      responseKind,
      idempotencyKey: key,
      postedAt
    };
    const messageExtra = {
      overswipe_behavior: SILLYTAVERN_REGENERATE_OVERSWIPE_BEHAVIOR,
      ...cloneJson(extra),
      [DIRECTIVE_MESSAGE_METADATA_KEY]: directive
    };
    const message = {
      name: nonEmptyString(ctx.name2) || 'Narrator',
      is_user: false,
      is_system: false,
      send_date: postedAt,
      mes: normalizedText,
      swipes: [normalizedText],
      swipe_id: 0,
      swipe_info: [{
        send_date: postedAt,
        gen_started: null,
        gen_finished: null,
        extra: swipeInfoExtra(messageExtra)
      }],
      extra: messageExtra
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

  async function appendAssistantMessageSwipe({
    hostMessageId,
    text,
    campaignId = null,
    responseKind = 'narration',
    extra = {}
  } = {}) {
    const ctx = context();
    if (!ctx) throw new Error('SillyTavern context is unavailable for message swipe updates.');
    const normalizedText = normalizeSwipeText(text);
    if (!normalizedText) throw new Error('Assistant swipe text must be non-empty.');
    const chat = getChatArray(ctx);
    const id = nonEmptyString(hostMessageId);
    let index = Number(id);
    if (!Number.isInteger(index) || index < 0 || index >= chat.length) {
      index = chat.findIndex((message, cursor) => normalizeMessageId(message, cursor) === id);
    }
    if (!Number.isInteger(index) || index < 0 || index >= chat.length) {
      throw new Error(`SillyTavern message ${id || '(missing)'} could not be found for swipe update.`);
    }
    const message = chat[index];
    const metadata = directiveMetadata(message);
    if (!metadata) {
      throw new Error('Only Directive-owned assistant messages can receive Directive swipes.');
    }
    if (campaignId && metadata.campaignId && String(metadata.campaignId) !== String(campaignId)) {
      throw new Error('Directive swipe campaign id does not match the target message.');
    }
    if (responseKind && metadata.responseKind && String(metadata.responseKind) !== String(responseKind)) {
      throw new Error('Directive swipe response kind does not match the target message.');
    }

    const swipes = ensureMessageSwipes(message);
    let swipeIndex = swipes.findIndex((entry) => entry === normalizedText);
    const duplicate = swipeIndex >= 0;
    if (swipeIndex < 0) {
      swipeIndex = swipes.length;
      swipes.push(normalizedText);
    }
    message.swipe_id = swipeIndex;
    message.mes = normalizedText;
    const selectedSwipeAt = now();
    const extraPatch = extra && typeof extra === 'object' && !Array.isArray(extra)
      ? cloneJson(extra)
      : {};
    delete extraPatch.directive;
    delete extraPatch[DIRECTIVE_MESSAGE_METADATA_KEY];
    message.extra = {
      ...(message.extra && typeof message.extra === 'object' && !Array.isArray(message.extra)
        ? message.extra
        : {}),
      ...extraPatch
    };
    const swipeMetadata = setDirectiveMetadata(message, {
      selectedSwipeIndex: swipeIndex,
      selectedSwipeAt,
      swipeCount: swipes.length,
      ...(extra?.directive || extra?.[DIRECTIVE_MESSAGE_METADATA_KEY] || {})
    });
    const swipeInfo = ensureMessageSwipeInfo(message);
    swipeInfo[swipeIndex] = createSwipeInfo(message, {
      sendDate: selectedSwipeAt,
      extra: message.extra
    });
    await refreshMessageDisplay(ctx, index, message);
    await saveChat(ctx);
    return {
      ok: true,
      hostMessageId: normalizeMessageId(message, index),
      index,
      swipeIndex,
      swipeCount: swipes.length,
      duplicate,
      text: normalizedText,
      metadata: cloneJson(swipeMetadata),
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

  async function waitForCurrentChat(chatId, timeoutMs = 2500) {
    const expected = nonEmptyString(chatId);
    if (!expected) return false;
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      if (isCurrentChat(expected)) return true;
      await delay(50);
    }
    return isCurrentChat(expected);
  }

  async function open(binding) {
    let ctx = context();
    if (!ctx || !binding) return false;
    if (isCurrentChat(binding.chatId)) return true;

    const chatFileEntity = entityFromChatId(ctx, binding.chatId);
    const inferredEntity = bestEntityForBinding(ctx, binding.chatId, binding);
    const entityType = nonEmptyString(binding.entityType)
      || nonEmptyString(chatFileEntity?.entityType)
      || nonEmptyString(inferredEntity?.entityType)
      || (binding.entityId ? 'character' : null);
    const entityId = nonEmptyString(chatFileEntity?.entityId)
      || nonEmptyString(binding.entityId)
      || nonEmptyString(inferredEntity?.entityId);
    if (entityType === 'character' && entityId) {
      const selected = currentEntity(ctx);
      if (String(selected.entityId || '') !== String(entityId)) {
        const selectCharacter = ctx.selectCharacterById || globalThis.selectCharacterById;
        if (typeof selectCharacter === 'function') {
          try {
            await selectCharacter.call(ctx, Number(entityId), { switchMenu: false });
            ctx = context();
          } catch {
            // Fall through to the host open APIs; some hosts can open by file name alone.
          }
        }
      }
    }
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
        if (await waitForCurrentChat(binding.chatId)) return true;
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
    appendAssistantMessageSwipe,
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
