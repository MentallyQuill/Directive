import {
  hashStableJson,
  normalizeHostMessageVisibility,
  stableJsonByteLength
} from '../../runtime/architecture-redesign-contracts.mjs';

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

function isSillyTavernSystemName(value) {
  return /sillytavern\s+system/i.test(String(value || ''));
}

const RESERVED_ASSISTANT_DISPLAY_NAMES = new Set([
  'character',
  'narrator',
  'null',
  'system',
  'undefined',
  'unused',
  'user'
]);

function safeAssistantDisplayName(value) {
  const name = nonEmptyString(value);
  if (!name) return null;
  const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (isSillyTavernSystemName(normalized)) return null;
  if (RESERVED_ASSISTANT_DISPLAY_NAMES.has(normalized)) return null;
  return name;
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

function hydrateSkeletalEventMessage(chatMessage = null, eventMessage = null) {
  if (!chatMessage || typeof chatMessage !== 'object' || !eventMessage || typeof eventMessage !== 'object') {
    return eventMessage;
  }
  if (messageText(eventMessage)) return eventMessage;
  const merged = {
    ...cloneJson(chatMessage),
    ...cloneJson(eventMessage)
  };
  if (!messageText(merged)) {
    for (const key of ['mes', 'content', 'text']) {
      if (messageText({ [key]: chatMessage[key] })) merged[key] = chatMessage[key];
    }
  }
  return merged;
}

function getChatArray(context) {
  const contextChat = Array.isArray(context?.chat) ? context.chat : [];
  const globalChat = Array.isArray(globalThis.chat) ? globalThis.chat : [];
  return globalChat.length > contextChat.length ? globalChat : contextChat;
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
  const selectedCharacterName = characterEntryName(characters?.[resolvedCharacterId]);
  return {
    entityType: 'character',
    entityId: resolvedCharacterId,
    entityName: nonEmptyString(
      (isSillyTavernSystemName(characterName) ? null : characterName)
      || selectedCharacterName
      || characterName
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
  return isSillyTavernSystemName(entity?.entityName);
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

function readChatMetadataObject(context) {
  const camel = context?.chatMetadata && typeof context.chatMetadata === 'object' ? context.chatMetadata : null;
  const snake = context?.chat_metadata && typeof context.chat_metadata === 'object' ? context.chat_metadata : null;
  if (camel && snake && camel !== snake) {
    return {
      ...cloneJson(camel),
      ...cloneJson(snake),
      [DIRECTIVE_CHAT_METADATA_KEY]: snake[DIRECTIVE_CHAT_METADATA_KEY] || camel[DIRECTIVE_CHAT_METADATA_KEY] || null
    };
  }
  if (snake) return snake;
  if (camel) return camel;
  return null;
}

function chatMetadataObject(context) {
  if (!context || typeof context !== 'object') return null;
  const camel = context.chatMetadata && typeof context.chatMetadata === 'object' ? context.chatMetadata : null;
  const snake = context.chat_metadata && typeof context.chat_metadata === 'object' ? context.chat_metadata : null;
  if (snake && camel && snake !== camel) {
    for (const [key, value] of Object.entries(camel)) {
      if (snake[key] === undefined) snake[key] = cloneJson(value);
    }
    context.chatMetadata = snake;
    return snake;
  }
  if (snake) {
    context.chatMetadata = snake;
    return snake;
  }
  if (camel) {
    context.chat_metadata = camel;
    return camel;
  }
  const metadata = {};
  context.chat_metadata = metadata;
  context.chatMetadata = metadata;
  return metadata;
}

function currentDirectiveBinding(context) {
  const binding = readChatMetadataObject(context)?.[DIRECTIVE_CHAT_METADATA_KEY];
  if (!binding || typeof binding !== 'object') return null;
  const bindingChatId = nonEmptyString(binding.chatId);
  const chatId = contextChatId(context);
  if (bindingChatId && chatId && bindingChatId !== chatId) return null;
  return binding;
}

function directiveAssistantDisplayName(context) {
  const binding = currentDirectiveBinding(context);
  const chatId = contextChatId(context);
  const inferred = entityFromChatId(context, chatId);
  const current = currentEntity(context);
  const candidates = [
    binding?.entityName,
    binding?.chatName,
    inferred?.entityName,
    current?.entityName,
    context?.name2,
    context?.characterName,
    globalThis.name2,
    DIRECTIVE_CHARACTER_CREATOR
  ];
  return candidates.map(safeAssistantDisplayName).find(Boolean) || DIRECTIVE_CHARACTER_CREATOR;
}

async function repairDirectiveMessageDisplayName(context, index, message, displayName) {
  if (!message || safeAssistantDisplayName(message.name)) return false;
  const safeName = safeAssistantDisplayName(displayName) || DIRECTIVE_CHARACTER_CREATOR;
  if (message.name === safeName) return false;
  message.name = safeName;
  await refreshMessageDisplay(context, index, message);
  await saveChat(context);
  return true;
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

function retargetChatIds(value, sourceChatId, targetChatId) {
  if (!sourceChatId || !targetChatId || value === null || value === undefined) return cloneJson(value);
  if (Array.isArray(value)) return value.map((entry) => retargetChatIds(entry, sourceChatId, targetChatId));
  if (typeof value !== 'object') return cloneJson(value);
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if ((key === 'chatId' || key === 'currentChatId' || key === 'chat_id') && String(entry || '') === String(sourceChatId)) {
      next[key] = targetChatId;
    } else {
      next[key] = retargetChatIds(entry, sourceChatId, targetChatId);
    }
  }
  return next;
}

function sanitizeChatFileName(value) {
  const name = nonEmptyString(value) || 'Directive Save Branch';
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.jsonl$/i, '')
    .trim()
    .slice(0, 180)
    || 'Directive Save Branch';
}

function uniqueChatFileName(baseName, existingNames = []) {
  const base = sanitizeChatFileName(baseName);
  const used = new Set((Array.isArray(existingNames) ? existingNames : []).map((entry) => String(entry || '').toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let index = 2; index < 10000; index += 1) {
    const candidate = sanitizeChatFileName(`${base} ${index}`);
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return sanitizeChatFileName(`${base} ${Date.now()}`);
}

function characterForEntity(context, entity) {
  const characters = getCharactersArray(context);
  const id = nonEmptyString(entity?.entityId ?? currentEntity(context)?.entityId);
  const index = id === null ? null : Number(id);
  if (!Number.isInteger(index) || index < 0) return null;
  const character = characters[index];
  if (!character) return null;
  return { index, character };
}

async function existingCharacterChatNames(context, entity) {
  const target = characterForEntity(context, entity);
  const fetchFn = context?.fetch || globalThis.fetch;
  if (!target?.character || typeof fetchFn !== 'function') return [];
  const getHeaders = context?.getRequestHeaders || globalThis.SillyTavern?.getContext?.()?.getRequestHeaders;
  const headers = typeof getHeaders === 'function' ? getHeaders.call(context) : {};
  const response = await fetchFn('/api/characters/chats', {
    method: 'POST',
    headers,
    body: JSON.stringify({ avatar_url: target.character.avatar, simple: true })
  }).catch(() => null);
  if (!response?.ok) return [];
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') return [];
  return Object.values(data)
    .map((entry) => nonEmptyString(entry?.file_name || entry))
    .filter(Boolean)
    .map((entry) => entry.replace(/\.jsonl$/i, ''));
}

async function saveChatSnapshot(context, { chatName, withMetadata, chatData } = {}) {
  if (typeof context?.saveChatSnapshot === 'function') {
    return context.saveChatSnapshot.call(context, { chatName, withMetadata, chatData });
  }
  let script = null;
  try {
    script = await import('/script.js');
  } catch {
    script = null;
  }
  if (typeof script?.saveChat === 'function') {
    return script.saveChat({ chatName, withMetadata, chatData });
  }
  const error = new Error('SillyTavern chat snapshot saving is unavailable; the checkpoint chat cannot be created.');
  error.code = 'DIRECTIVE_CHAT_CLONE_UNAVAILABLE';
  throw error;
}

async function loadCharacterChatSnapshot(context, { chatId, entity } = {}) {
  const target = characterForEntity(context, entity);
  const fetchFn = context?.fetch || globalThis.fetch;
  if (!target?.character || typeof fetchFn !== 'function') {
    const error = new Error('SillyTavern chat snapshot loading is unavailable for checkpoint cloning.');
    error.code = 'DIRECTIVE_CHAT_SNAPSHOT_LOAD_UNAVAILABLE';
    throw error;
  }
  const getHeaders = context?.getRequestHeaders || globalThis.SillyTavern?.getContext?.()?.getRequestHeaders;
  const headers = typeof getHeaders === 'function' ? getHeaders.call(context) : {};
  const sourceChatId = nonEmptyString(chatId);
  const response = await fetchFn('/api/chats/get', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ch_name: target.character.name,
      file_name: sourceChatId?.replace(/\.jsonl$/i, ''),
      avatar_url: target.character.avatar
    }),
    cache: 'no-cache'
  });
  if (!response?.ok) {
    const error = new Error(`SillyTavern could not load checkpoint chat "${sourceChatId}".`);
    error.code = 'DIRECTIVE_CHAT_SNAPSHOT_LOAD_FAILED';
    throw error;
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    const error = new Error(`SillyTavern checkpoint chat "${sourceChatId}" is empty or unreadable.`);
    error.code = 'DIRECTIVE_CHAT_SNAPSHOT_INVALID';
    throw error;
  }
  const [header, ...messages] = rows;
  return {
    metadata: cloneJson(header?.chat_metadata || {}),
    messages: cloneJson(messages)
  };
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

function payloadMessageReference(payload = null) {
  if (typeof payload === 'string' || typeof payload === 'number') {
    const id = nonEmptyString(payload);
    return id ? { id, explicit: true } : { id: null, explicit: false };
  }
  if (!payload || typeof payload !== 'object') return { id: null, explicit: false };
  const raw = payload.hostMessageId
    ?? payload.messageId
    ?? payload.message_id
    ?? payload.id
    ?? payload.index
    ?? payload.message?.id
    ?? payload.message?.messageId
    ?? payload.message?.message_id
    ?? null;
  const id = nonEmptyString(raw);
  return {
    id,
    explicit: raw !== null && raw !== undefined && id !== null
  };
}

function numericMessageIndex(value) {
  if (Number.isInteger(value)) return value;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : null;
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


export function normalizeSillyTavernMessage(message, index = null, options = {}) {
  if (!message || typeof message !== 'object') return null;
  const metadata = directiveMetadata(message);
  const hostMessageId = normalizeMessageId(message, Number.isInteger(index) ? index : null);
  const text = messageText(message);
  return {
    id: hostMessageId,
    hostMessageId,
    index: Number.isInteger(index) ? index : null,
    text,
    textHash: text ? hashStableJson({ text }) : null,
    textLength: text.length,
    textByteLength: text ? stableJsonByteLength({ text }) : 0,
    isUser: message.is_user === true || message.role === 'user',
    isSystem: message.is_system === true || message.role === 'system',
    directiveOwned: Boolean(metadata),
    isDirectiveOwned: Boolean(metadata),
    visibility: normalizeHostMessageVisibility(message, {
      index: Number.isInteger(index) ? index : null,
      hostMessageId,
      chatMetadata: options.chatMetadata || options.chat_metadata || null,
      visibilityMap: options.visibilityMap || null
    }),
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
  const chatMetadata = readChatMetadataObject(context);
  const reference = payloadMessageReference(payload);
  let index = null;
  if (Number.isInteger(payload)) index = payload;
  if (Number.isInteger(payload?.messageId)) index = payload.messageId;
  if (Number.isInteger(payload?.message_id)) index = payload.message_id;
  if (Number.isInteger(payload?.index)) index = payload.index;
  if (!Number.isInteger(index) && reference.id) {
    const numericIndex = numericMessageIndex(reference.id);
    if (numericIndex !== null) index = numericIndex;
  }

  const payloadMessage = payload?.message && typeof payload.message === 'object'
    ? payload.message
    : null;
  let message = payloadMessage
    ? hydrateSkeletalEventMessage(Number.isInteger(index) ? chat[index] : null, payloadMessage)
    : null;
  if (!message && Number.isInteger(index)) message = chat[index] || null;
  if (!message && reference.id) {
    const targetId = reference.id;
    for (let cursor = 0; cursor < chat.length; cursor += 1) {
      if (normalizeMessageId(chat[cursor], cursor) === targetId) {
        message = chat[cursor];
        index = cursor;
        break;
      }
    }
  }
  if (!message && payload && typeof payload === 'object' && (
    'mes' in payload || 'content' in payload || 'is_user' in payload
  )) {
    message = payload;
  }
  if (!message && !reference.explicit) {
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
  const text = messageText(message);

  return {
    hostMessageId: normalizeMessageId(message, index >= 0 ? index : null),
    index: index >= 0 ? index : null,
    chatId: contextChatId(context),
    text,
    textHash: text ? hashStableJson({ text }) : null,
    textLength: text.length,
    textByteLength: text ? stableJsonByteLength({ text }) : 0,
    isUser: message.is_user === true || message.role === 'user',
    isSystem: message.is_system === true || message.role === 'system',
    isDirectiveOwned: Boolean(directiveMetadata(message)),
    visibility: normalizeHostMessageVisibility(message, {
      index: index >= 0 ? index : null,
      hostMessageId: normalizeMessageId(message, index >= 0 ? index : null),
      chatMetadata,
      visibilityMap: payload?.visibilityMap || payload?.visibility_map || null
    }),
    metadata: cloneJson(directiveMetadata(message)),
    raw: cloneJson(message)
  };
}

export function createSillyTavernChatAdapter({
  contextFactory = () => globalThis.SillyTavern?.getContext?.() || null,
  now = () => new Date().toISOString(),
  scriptModule = null,
  importScript = null
} = {}) {
  function context() {
    return contextFactory?.() || null;
  }

  function getCurrentBinding() {
    const ctx = context();
    if (!ctx) return null;
    const metadataBinding = currentDirectiveBinding(ctx);
    const chatId = contextChatId(ctx) || nonEmptyString(metadataBinding?.chatId);
    const entity = metadataBinding
      ? bestEntityForBinding(ctx, chatId, metadataBinding)
      : currentEntity(ctx);
    const safeEntityName = safeAssistantDisplayName(metadataBinding?.entityName)
      || safeAssistantDisplayName(entity?.entityName)
      || safeAssistantDisplayName(metadataBinding?.chatName)
      || entity?.entityName;
    return {
      hostId: 'sillytavern',
      ...cloneJson(metadataBinding || {}),
      chatId,
      entityType: entity?.entityType || metadataBinding?.entityType || null,
      entityId: entity?.entityId || metadataBinding?.entityId || null,
      entityName: safeEntityName || null,
      chatName: nonEmptyString(
        metadataBinding?.chatName
        || ctx?.chatName
        || ctx?.chat?.name
        || ctx?.chatMetadata?.name
      ) || null
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

  async function cloneCampaignChat({
    sourceChatId: requestedSourceChatId = null,
    targetName = null,
    open: shouldOpen = false,
    name = null,
    campaignId = null,
    saveId = null,
    sourceBinding = null
  } = {}) {
    let ctx = context();
    if (!ctx) throw new Error('SillyTavern context is unavailable for checkpoint chat cloning.');
    const sourceChatId = nonEmptyString(requestedSourceChatId) || contextChatId(ctx);
    if (!sourceChatId) {
      const error = new Error('Directive cannot clone a checkpoint chat because no source SillyTavern chat was provided.');
      error.code = 'DIRECTIVE_CHAT_CLONE_NO_ACTIVE_CHAT';
      throw error;
    }
    const source = sourceBinding && typeof sourceBinding === 'object'
      ? sourceBinding
      : (currentDirectiveBinding(ctx) || getCurrentBinding() || {});
    const entity = bestEntityForBinding(ctx, sourceChatId, source);
    if (entity?.entityType !== 'character' || !entity.entityId) {
      const error = new Error('Directive checkpoints require a character-bound SillyTavern chat.');
      error.code = 'DIRECTIVE_CHAT_CLONE_ENTITY_UNSUPPORTED';
      error.details = { entity };
      throw error;
    }

    const selected = currentEntity(ctx);
    if (String(selected?.entityId || '') !== String(entity.entityId || '')) {
      const selectCharacter = ctx.selectCharacterById || globalThis.selectCharacterById;
      if (typeof selectCharacter === 'function') {
        await selectCharacter.call(ctx, Number(entity.entityId), { switchMenu: false });
        ctx = context();
      }
    }

    const sourceIsCurrent = sourceChatId === contextChatId(ctx);
    const sourceSnapshot = sourceIsCurrent
      ? {
          metadata: cloneJson(chatMetadataObject(ctx) || {}),
          messages: cloneJson(getChatArray(ctx))
        }
      : await loadCharacterChatSnapshot(ctx, {
          chatId: sourceChatId,
          entity
        });
    const sourceMessages = sourceSnapshot.messages;
    const existingNames = await existingCharacterChatNames(ctx, entity);
    const requestedName = nonEmptyString(targetName)
      || nonEmptyString(name)
      || nonEmptyString(source.chatName)
      || nonEmptyString(sourceChatId)
      || 'Directive Checkpoint';
    const branchChatName = uniqueChatFileName(requestedName, existingNames);
    const branchBinding = {
      ...cloneJson(source || {}),
      hostId: 'sillytavern',
      chatId: branchChatName,
      chatName: branchChatName,
      campaignId: nonEmptyString(campaignId) || nonEmptyString(source.campaignId) || null,
      saveId: nonEmptyString(saveId) || nonEmptyString(source.saveId) || null,
      entityType: entity.entityType,
      entityId: entity.entityId,
      entityName: entity.entityName,
      status: source.status || 'bound',
      createdByDirective: true,
      creationMethod: 'clone-campaign-chat',
      clonedFromChatId: sourceChatId,
      clonedAt: now()
    };
    const branchMessages = sourceMessages.map((message) => retargetChatIds(message, sourceChatId, branchChatName));
    await saveChatSnapshot(ctx, {
      chatName: branchChatName,
      withMetadata: {
        ...cloneJson(sourceSnapshot.metadata || {}),
        [DIRECTIVE_CHAT_METADATA_KEY]: cloneJson(branchBinding)
      },
      chatData: branchMessages
    });
    if (shouldOpen) {
      const opened = await open({
        chatId: branchChatName,
        entityType: entity.entityType,
        entityId: entity.entityId,
        entityName: entity.entityName
      });
      ctx = context();
      if (!opened || contextChatId(ctx) !== branchChatName) {
        const error = new Error(`Directive created checkpoint chat ${branchChatName}, but SillyTavern did not make it active.`);
        error.code = 'DIRECTIVE_CHAT_CLONE_OPEN_FAILED';
        error.details = { sourceChatId, branchChatId: branchChatName };
        throw error;
      }
      await updateBindingMetadata(branchBinding);
    }
    return {
      ...cloneJson(branchBinding),
      sourceChatId,
      messageCount: branchMessages.length
    };
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

  async function refreshCurrentChat({ reason = 'directive-refresh-current-chat' } = {}) {
    const ctx = context();
    const refreshers = [
      ctx?.reloadCurrentChat,
      globalThis.reloadCurrentChat
    ];
    for (const refresh of refreshers) {
      if (typeof refresh !== 'function') continue;
      try {
        await refresh.call(ctx, { reason });
        return { ok: true, refreshed: true, reason };
      } catch {
        try {
          await refresh.call(ctx);
          return { ok: true, refreshed: true, reason };
        } catch {
          // Try the next available host hook.
        }
      }
    }
    return { ok: false, refreshed: false, reason: 'refresh-current-chat-unavailable' };
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
    const displayName = directiveAssistantDisplayName(ctx);
    const existingIndex = chat.findIndex((message) => directiveMetadata(message)?.idempotencyKey === key);
    if (existingIndex >= 0) {
      await repairDirectiveMessageDisplayName(ctx, existingIndex, chat[existingIndex], displayName);
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
      name: displayName,
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
    extra = {},
    select = true,
    allowUnownedAssistant = false
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
    const assistantMessage = message?.is_user !== true && message?.role !== 'user' && message?.is_system !== true && message?.role !== 'system';
    const metadata = directiveMetadata(message);
    if (!metadata) {
      if (!allowUnownedAssistant || !assistantMessage) {
        throw new Error('Only Directive-owned assistant messages can receive Directive swipes.');
      }
    }
    let swipeMetadata = metadata || {
      campaignId: campaignId || null,
      responseKind: responseKind || 'narration'
    };
    if (campaignId && swipeMetadata.campaignId && String(swipeMetadata.campaignId) !== String(campaignId)) {
      throw new Error('Directive swipe campaign id does not match the target message.');
    }
    if (responseKind && swipeMetadata.responseKind && String(swipeMetadata.responseKind) !== String(responseKind)) {
      throw new Error('Directive swipe response kind does not match the target message.');
    }

    const swipes = ensureMessageSwipes(message);
    let swipeIndex = swipes.findIndex((entry) => entry === normalizedText);
    const duplicate = swipeIndex >= 0;
    if (swipeIndex < 0) {
      swipeIndex = swipes.length;
      swipes.push(normalizedText);
    }
    const selectedSwipeAt = now();
    const extraPatch = extra && typeof extra === 'object' && !Array.isArray(extra)
      ? cloneJson(extra)
      : {};
    delete extraPatch.directive;
    delete extraPatch[DIRECTIVE_MESSAGE_METADATA_KEY];
    const swipeInfo = ensureMessageSwipeInfo(message);
    const selected = select !== false;
    if (selected) {
      message.swipe_id = swipeIndex;
      message.mes = normalizedText;
      message.extra = {
        ...(message.extra && typeof message.extra === 'object' && !Array.isArray(message.extra)
          ? message.extra
          : {}),
        ...extraPatch
      };
      swipeMetadata = setDirectiveMetadata(message, {
        selectedSwipeIndex: swipeIndex,
        selectedSwipeAt,
        swipeCount: swipes.length,
        ...(extra?.directive || extra?.[DIRECTIVE_MESSAGE_METADATA_KEY] || {})
      });
    } else {
      swipeMetadata = setDirectiveMetadata(message, {
        swipeCount: swipes.length
      });
    }
    swipeInfo[swipeIndex] = createSwipeInfo(message, {
      sendDate: selectedSwipeAt,
      extra: selected ? message.extra : extraPatch
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
      selected,
      text: normalizedText,
      metadata: cloneJson(swipeMetadata),
      message: cloneJson(message)
    };
  }

  function observeNewHostAssistantMessage(ctx, beforeIds = new Set()) {
    const afterChat = getChatArray(ctx);
    for (let index = afterChat.length - 1; index >= 0; index -= 1) {
      const messageId = normalizeMessageId(afterChat[index], index);
      if (beforeIds.has(messageId)) continue;
      const normalized = normalizeSillyTavernMessagePayload(ctx, { message: afterChat[index], index });
      if (normalized && !normalized.isUser && !normalized.isDirectiveOwned) {
        delete normalized.raw;
        return normalized;
      }
    }
    return null;
  }

  async function waitForNewHostAssistantMessage(beforeIds = new Set(), {
    timeoutMs = 240000,
    pollIntervalMs = 250,
    shouldStop = null
  } = {}) {
    const startedAt = Date.now();
    const deadlineAt = startedAt + Math.max(0, Number(timeoutMs || 0));
    const interval = Math.max(10, Number(pollIntervalMs || 0));
    while (true) {
      if (typeof shouldStop === 'function' && shouldStop()) return null;
      const observedMessage = observeNewHostAssistantMessage(context(), beforeIds);
      if (observedMessage) return observedMessage;
      if (Date.now() >= deadlineAt) return null;
      await delay(Math.min(interval, Math.max(0, deadlineAt - Date.now())));
    }
  }

  function hostGenerationObservationMessageRef(message = null) {
    if (!message) return null;
    const text = message.text || '';
    return {
      hostMessageId: message.hostMessageId || message.id || null,
      index: message.index ?? null,
      chatId: message.chatId || null,
      textHash: text ? hashStableJson({ text }) : null,
      textLength: typeof text === 'string' ? text.length : 0,
      textByteLength: text ? stableJsonByteLength({ text }) : 0
    };
  }

  function scheduleHostGenerationSettlement(callback, payload) {
    if (typeof callback !== 'function') return;
    const run = () => {
      Promise.resolve()
        .then(() => callback(cloneJson(payload)))
        .catch(() => {});
    };
    if (typeof setTimeout === 'function') {
      setTimeout(run, 0);
    } else {
      Promise.resolve().then(run);
    }
  }

  function scheduleHostGenerationObservation({
    beforeIds,
    callback,
    observationId,
    ingressId = null,
    turnId = null,
    outcomeId = null,
    reason,
    type,
    generationStartedAt,
    observationTimeoutMs,
    observationPollIntervalMs
  } = {}) {
    if (typeof callback !== 'function') return null;
    let settled = false;
    const settleOnce = (payload) => {
      if (settled) return;
      settled = true;
      scheduleHostGenerationSettlement(callback, payload);
    };
    waitForNewHostAssistantMessage(beforeIds, {
      timeoutMs: observationTimeoutMs,
      pollIntervalMs: observationPollIntervalMs,
      shouldStop: () => settled
    })
      .then((observedMessage) => {
        settleOnce({
          kind: 'directive.hostGenerationObservation.v1',
          observationId,
          ingressId,
          turnId,
          outcomeId,
          status: observedMessage ? 'completed' : 'unavailable',
          ok: Boolean(observedMessage),
          released: true,
          waitForCompletion: false,
          reason,
          type: type || 'normal',
          generationStartedAt,
          hostGenerationReleasedAt: generationStartedAt,
          completedAt: now(),
          observedMessage: hostGenerationObservationMessageRef(observedMessage)
        });
      })
      .catch((error) => {
        settleOnce({
          kind: 'directive.hostGenerationObservation.v1',
          observationId,
          ingressId,
          turnId,
          outcomeId,
          ok: false,
          status: 'failed',
          released: true,
          waitForCompletion: false,
          reason,
          type: type || 'normal',
          generationStartedAt,
          hostGenerationReleasedAt: generationStartedAt,
          failedAt: now(),
          error: {
            code: error?.code || 'DIRECTIVE_HOST_GENERATION_OBSERVATION_FAILED',
            message: error?.message || String(error)
          }
        });
      });
    return settleOnce;
  }

  async function continueHostGeneration({
    reason = 'directive-inject-and-continue',
    type = 'normal',
    automaticTrigger = true,
    waitForCompletion = true,
    observationTimeoutMs = 240000,
    observationPollIntervalMs = 250,
    onSettled = null,
    onHostGenerationObserved = null,
    ingressId = null,
    turnId = null,
    outcomeId = null
  } = {}) {
    try {
      const beforeContext = context();
      const beforeChat = getChatArray(beforeContext);
      const beforeIds = new Set(beforeChat.map((message, index) => normalizeMessageId(message, index)));
      const script = scriptModule || (typeof importScript === 'function'
        ? await importScript()
        : await import('/script.js'));
      const generating = typeof script.isGenerating === 'function'
        ? script.isGenerating() === true
        : script.is_send_press === true;
      if (generating) {
        const generationStartedAt = now();
        const observationId = `host-generation:${generationStartedAt}:${ingressId || turnId || outcomeId || reason}`;
        const callback = typeof onHostGenerationObserved === 'function' ? onHostGenerationObserved : onSettled;
        const observationSettler = scheduleHostGenerationObservation({
          beforeIds,
          callback,
          observationId,
          ingressId,
          turnId,
          outcomeId,
          reason: 'host-already-generating',
          type,
          generationStartedAt,
          observationTimeoutMs,
          observationPollIntervalMs
        });
        return {
          ok: true,
          skipped: true,
          released: true,
          waitForCompletion: false,
          alreadyGenerating: true,
          reason: 'host-already-generating',
          type: type || 'normal',
          observationId,
          observationStatus: observationSettler ? 'pending' : 'unavailable',
          generationStartedAt,
          hostGenerationReleasedAt: generationStartedAt,
          observedMessage: null
        };
      }
      if (typeof script.Generate !== 'function') {
        return {
          ok: false,
          skipped: true,
          reason: 'generate-api-unavailable'
        };
      }
      const generationStartedAt = now();
      const observationId = `host-generation:${generationStartedAt}:${ingressId || turnId || outcomeId || reason}`;
      const callback = typeof onHostGenerationObserved === 'function' ? onHostGenerationObserved : onSettled;
      const generationPromise = script.Generate(type || 'normal', {
        automatic_trigger: automaticTrigger !== false
      });
      if (waitForCompletion === false) {
        const release = {
          ok: true,
          skipped: false,
          released: true,
          waitForCompletion: false,
          reason,
          type: type || 'normal',
          observationId,
          observationStatus: 'pending',
          generationStartedAt,
          hostGenerationReleasedAt: generationStartedAt,
          observedMessage: null
        };
        if (typeof callback !== 'function') {
          Promise.resolve(generationPromise).catch(() => {});
          return release;
        }
        const observationSettler = scheduleHostGenerationObservation({
          beforeIds,
          callback,
          observationId,
          ingressId,
          turnId,
          outcomeId,
          reason,
          type,
          generationStartedAt,
          observationTimeoutMs,
          observationPollIntervalMs
        });
        Promise.resolve(generationPromise)
          .catch((error) => {
            observationSettler?.({
              kind: 'directive.hostGenerationObservation.v1',
              observationId,
              ingressId,
              turnId,
              outcomeId,
              ok: false,
              status: 'failed',
              released: true,
              waitForCompletion: false,
              reason,
              type: type || 'normal',
              generationStartedAt,
              hostGenerationReleasedAt: generationStartedAt,
              failedAt: now(),
              error: {
                code: error?.code || 'DIRECTIVE_HOST_GENERATION_CONTINUE_FAILED',
                message: error?.message || String(error)
              }
            });
          });
        return release;
      }
      const result = await generationPromise;
      const observedMessage = await waitForNewHostAssistantMessage(beforeIds, {
        timeoutMs: observationTimeoutMs,
        pollIntervalMs: observationPollIntervalMs
      });
      return {
        ok: true,
        skipped: false,
        released: true,
        waitForCompletion: true,
        reason,
        type: type || 'normal',
        generationStartedAt,
        hostGenerationReleasedAt: generationStartedAt,
        completedAt: now(),
        result: cloneJson(result),
        observedMessage: cloneJson(observedMessage)
      };
    } catch (error) {
      return {
        ok: false,
        skipped: false,
        reason,
        error: {
          code: error?.code || 'DIRECTIVE_HOST_GENERATION_CONTINUE_FAILED',
          message: error?.message || String(error)
        }
      };
    }
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

  async function deleteCampaignChat(binding) {
    const ctx = context();
    const chatId = nonEmptyString(binding?.chatId);
    if (!ctx || !chatId) {
      return { deleted: false, reason: 'missing-chat-binding' };
    }
    if (isCurrentChat(chatId)) {
      const error = new Error('Directive will not delete the currently active campaign chat through checkpoint deletion.');
      error.code = 'DIRECTIVE_CHECKPOINT_CHAT_DELETE_ACTIVE';
      throw error;
    }
    const entity = bestEntityForBinding(ctx, chatId, binding);
    const target = characterForEntity(ctx, entity);
    const fetchFn = ctx?.fetch || globalThis.fetch;
    if (!target?.character || typeof fetchFn !== 'function') {
      return { deleted: false, reason: 'chat-delete-unavailable' };
    }
    const getHeaders = ctx?.getRequestHeaders || globalThis.SillyTavern?.getContext?.()?.getRequestHeaders;
    const headers = typeof getHeaders === 'function' ? getHeaders.call(ctx) : {};
    const response = await fetchFn('/api/chats/delete', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        chatfile: `${chatId.replace(/\.jsonl$/i, '')}.jsonl`,
        avatar_url: target.character.avatar
      })
    });
    if (!response?.ok) {
      const error = new Error(`SillyTavern could not delete checkpoint chat "${chatId}".`);
      error.code = 'DIRECTIVE_CHECKPOINT_CHAT_DELETE_FAILED';
      throw error;
    }
    return { deleted: true, chatId };
  }

  return {
    id: 'sillytavern-chat-adapter',
    getCurrentChatId: () => contextChatId(context()),
    getCurrentBinding,
    createOrBindCampaignChat,
    cloneCampaignChat,
    openCampaignChat: open,
    deleteCampaignChat,
    isCurrentChat,
    getRecentMessages,
    refreshCurrentChat,
    getLatestPlayerMessage,
    getMessage,
    normalizeMessagePayload: (payload) => normalizeSillyTavernMessagePayload(context(), payload),
    postAssistantMessage,
    appendAssistantMessageSwipe,
    continueHostGeneration,
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
