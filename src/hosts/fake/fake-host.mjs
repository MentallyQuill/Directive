import {
  createHostCapabilities,
  createHostContractError,
  normalizeDirectiveHost
} from '../host-contract.mjs';
import {
  listProviderRoleRouting,
  providerKindForRole
} from '../../providers/directive-provider-settings.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMissingFileError(filePath) {
  return createHostContractError(
    'DIRECTIVE_FAKE_HOST_FILE_MISSING',
    `Fake host file not found: ${filePath}`,
    { filePath }
  );
}

export function createFakeJsonStorage(initialFiles = {}) {
  const files = new Map();
  for (const [filePath, value] of Object.entries(initialFiles)) {
    files.set(filePath, cloneJson(value));
  }
  return {
    async readJson(filePath) {
      if (!files.has(filePath)) {
        throw createMissingFileError(filePath);
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      files.set(filePath, cloneJson(value));
      return { ok: true, path: filePath };
    },
    async verifyJsonFiles(paths = []) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    },
    async deleteJsonFile(filePath) {
      const deleted = files.delete(filePath);
      return { ok: deleted, path: filePath };
    },
    async listJsonFiles(prefix = '') {
      return [...files.keys()].filter((filePath) => filePath.startsWith(prefix));
    },
    snapshot() {
      return Object.fromEntries([...files.entries()].map(([filePath, value]) => [filePath, cloneJson(value)]));
    }
  };
}

export function createFakeEventAdapter() {
  const handlers = new Map();
  return {
    on(eventName, handler) {
      if (!handlers.has(eventName)) {
        handlers.set(eventName, new Set());
      }
      handlers.get(eventName).add(handler);
      return () => handlers.get(eventName)?.delete(handler);
    },
    emit(eventName, payload) {
      for (const handler of handlers.get(eventName) || []) {
        handler(payload);
      }
    },
    listenerCount(eventName) {
      return handlers.get(eventName)?.size || 0;
    }
  };
}

export function createFakeGenerationClient({ responses = {}, defaultText = 'Fake generation response.' } = {}) {
  const calls = [];
  async function generate(role, request = {}) {
    calls.push({ role, request: cloneJson(request) });
    const configured = responses[role] ?? { text: defaultText, providerId: `fake-${role}` };
    const response = typeof configured === 'function'
      ? await configured({ role, request: cloneJson(request), rawRequest: request, calls: cloneJson(calls) })
      : configured;
    return cloneJson(response);
  }
  return {
    generate,
    role(roleName) {
      return {
        id: `fake-${roleName}`,
        async generateNarration(request = {}) {
          return generate(roleName, request);
        }
      };
    },
    calls() {
      return cloneJson(calls);
    }
  };
}

export function createFakeUiAdapter() {
  const messages = [];
  return {
    async mount() {
      messages.push({ type: 'mount' });
      return { ok: true };
    },
    send(payload) {
      messages.push({ type: 'send', payload: cloneJson(payload) });
    },
    reportProgress(payload) {
      messages.push({ type: 'progress', payload: cloneJson(payload) });
    },
    messages() {
      return cloneJson(messages);
    }
  };
}


export function createFakeChatAdapter({
  chatId = 'fake-chat-1',
  entityId = 'fake-character-1',
  entityName = 'Fake Character',
  messages = []
} = {}) {
  let currentChatId = chatId;
  let binding = null;
  const metadataByChatId = new Map();
  const chatsById = new Map([[String(chatId || ''), messages.map(cloneJson)]]);
  const calls = [];
  function messagesForChat(id = currentChatId) {
    const key = String(id || '');
    if (!chatsById.has(key)) chatsById.set(key, []);
    return chatsById.get(key);
  }
  function retargetChatIds(value, sourceChatId, targetChatId) {
    if (!sourceChatId || !targetChatId || value === null || value === undefined) return cloneJson(value);
    if (Array.isArray(value)) return value.map((entry) => retargetChatIds(entry, sourceChatId, targetChatId));
    if (typeof value !== 'object') return cloneJson(value);
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      if ((key === 'chatId' || key === 'currentChatId') && String(entry || '') === String(sourceChatId)) {
        next[key] = targetChatId;
      } else {
        next[key] = retargetChatIds(entry, sourceChatId, targetChatId);
      }
    }
    return next;
  }
  function uniqueBranchChatId({ saveId = null, name = null } = {}) {
    const rawBase = String(saveId || name || `branch-${chatsById.size + 1}`).trim() || `branch-${chatsById.size + 1}`;
    const base = rawBase.startsWith('fake-chat-') ? rawBase : `fake-chat-${rawBase}`;
    let candidate = base;
    for (let index = 2; chatsById.has(candidate); index += 1) {
      candidate = `${base}-${index}`;
    }
    return candidate;
  }
  function storeBinding(nextBinding) {
    binding = cloneJson(nextBinding);
    const targetChatId = binding?.chatId || currentChatId;
    if (targetChatId) metadataByChatId.set(String(targetChatId), cloneJson(binding));
    return cloneJson(binding);
  }
  return {
    getCurrentChatId() {
      return currentChatId;
    },
    getCurrentChatIdentity() {
      const metadata = metadataByChatId.get(String(currentChatId)) || binding;
      return {
        hostId: 'fake',
        campaignId: metadata?.campaignId || null,
        saveId: metadata?.saveId || null,
        chatId: currentChatId,
        entityType: 'character',
        entityId,
        entityName,
        status: metadata?.status || null,
        chatName: metadata?.chatName || null
      };
    },
    getCurrentBinding() {
      return this.getCurrentChatIdentity();
    },
    async createOrBindCampaignChat(options = {}) {
      const requestedChatId = typeof options.existingChatId === 'string' && options.existingChatId.trim()
        ? options.existingChatId.trim()
        : null;
      const createsFreshChat = options.createNew !== false && !requestedChatId;
      currentChatId = requestedChatId
        || (createsFreshChat ? `fake-chat-${options.campaignId || 'campaign'}` : currentChatId);
      if (createsFreshChat) {
        chatsById.set(String(currentChatId), []);
      } else {
        messagesForChat(currentChatId);
      }
      const nextBinding = {
        hostId: 'fake',
        chatId: currentChatId,
        campaignId: options.campaignId || null,
        saveId: options.saveId || null,
        entityType: 'character',
        entityId,
        entityName,
        chatName: options.name || null,
        createdByDirective: createsFreshChat,
        creationMethod: createsFreshChat ? 'create-fresh' : 'bind-current',
        createdOrBoundAt: '2026-06-22T00:00:00.000Z'
      };
      storeBinding(nextBinding);
      calls.push({ type: 'createOrBindCampaignChat', options: cloneJson(options) });
      return cloneJson(binding);
    },
    async createCampaignChat(options = {}) {
      return this.createOrBindCampaignChat(options);
    },
    async bindCurrentChat(options = {}) {
      const identity = this.getCurrentChatIdentity();
      const nextBinding = {
        ...identity,
        campaignId: options.campaignId || binding?.campaignId || null,
        saveId: options.saveId || binding?.saveId || null,
        createdByDirective: false,
        createdOrBoundAt: '2026-06-22T00:00:00.000Z'
      };
      return storeBinding(nextBinding);
    },
    isCurrentChat(value) {
      return value === currentChatId;
    },
    getRecentMessages(options = 12) {
      const chatMessages = messagesForChat();
      const limit = typeof options === 'number' ? options : Number(options?.limit || 12);
      const slice = chatMessages.slice(-Math.max(1, limit));
      const offset = chatMessages.length - slice.length;
      return cloneJson(slice.map((message, index) => ({
        id: message.id || message.hostMessageId || String(offset + index),
        hostMessageId: message.hostMessageId || message.id || String(offset + index),
        index: offset + index,
        role: message.isUser ? 'user' : 'assistant',
        text: message.text || '',
        isUser: message.isUser === true,
        isDirectiveOwned: message.isDirectiveOwned === true,
        directiveOwned: message.isDirectiveOwned === true,
        metadata: cloneJson(message.metadata || null),
        raw: message
      })));
    },
    getLatestUserMessage() {
      const chatMessages = messagesForChat();
      const index = [...chatMessages].map((message, i) => ({ message, i })).reverse().find((entry) => entry.message.isUser && !entry.message.isDirectiveOwned);
      if (!index) return null;
      return cloneJson({
        id: index.message.id || index.message.hostMessageId || String(index.i),
        index: index.i,
        role: 'user',
        text: index.message.text || '',
        directiveOwned: false,
        raw: index.message
      });
    },
    getLatestPlayerMessage() {
      return this.getLatestUserMessage();
    },
    getMessage(hostMessageId) {
      const chatMessages = messagesForChat();
      return cloneJson(chatMessages.find((message) => String(message.hostMessageId || message.id) === String(hostMessageId)) || null);
    },
    normalizeMessagePayload(payload) {
      const chatMessages = messagesForChat();
      const raw = payload?.message || payload || null;
      if (!raw || typeof raw !== 'object') return null;
      const index = Number.isInteger(payload?.index) ? payload.index : (Number.isInteger(payload?.messageIndex) ? payload.messageIndex : chatMessages.indexOf(raw));
      const hostMessageId = String(raw.hostMessageId || raw.id || (index >= 0 ? index : '')).trim() || null;
      return cloneJson({
        hostMessageId,
        id: hostMessageId,
        index: index >= 0 ? index : null,
        chatId: raw.chatId || currentChatId,
        text: raw.text || raw.mes || raw.content || '',
        isUser: raw.isUser === true || raw.is_user === true || raw.role === 'user',
        isDirectiveOwned: raw.isDirectiveOwned === true || Boolean(raw.metadata?.idempotencyKey || raw.extra?.directive),
        raw
      });
    },
    async postAssistantMessage(options = {}) {
      const chatMessages = messagesForChat();
      const existing = chatMessages.find((message) => message.metadata?.idempotencyKey === options.idempotencyKey);
      if (existing) {
        return {
          posted: false,
          duplicate: true,
          hostMessageId: existing.hostMessageId,
          idempotencyKey: options.idempotencyKey,
          message: {
            id: existing.id || existing.hostMessageId,
            index: chatMessages.indexOf(existing),
            role: 'assistant',
            text: existing.text || '',
            directiveOwned: true,
            raw: cloneJson(existing)
          }
        };
      }
      const message = {
        id: `fake-message-${chatMessages.length + 1}`,
        hostMessageId: `fake-message-${chatMessages.length + 1}`,
        chatId: currentChatId,
        text: String(options.text || ''),
        swipes: [String(options.text || '')].filter(Boolean),
        swipe_id: 0,
        isUser: false,
        isDirectiveOwned: true,
        metadata: {
          campaignId: options.campaignId || null,
          turnId: options.turnId || null,
          outcomeId: options.outcomeId || null,
          responseKind: options.responseKind || 'narration',
          idempotencyKey: options.idempotencyKey || null
        }
      };
      chatMessages.push(message);
      calls.push({ type: 'postAssistantMessage', options: cloneJson(options) });
      return {
        ok: true,
        posted: true,
        duplicate: false,
        hostMessageId: message.hostMessageId,
        idempotencyKey: message.metadata.idempotencyKey,
        message: {
          id: message.id,
          index: chatMessages.length - 1,
          role: 'assistant',
          text: message.text,
          directiveOwned: true,
          raw: cloneJson(message)
        }
      };
    },
    async appendAssistantMessageSwipe(options = {}) {
      const chatMessages = messagesForChat();
      const id = String(options.hostMessageId || '').trim();
      const index = chatMessages.findIndex((message, cursor) => (
        String(message.hostMessageId || message.id || cursor) === id
      ));
      if (index < 0) throw new Error(`Fake chat message ${id || '(missing)'} could not be found for swipe update.`);
      const message = chatMessages[index];
      if (!message.isDirectiveOwned && !message.metadata?.idempotencyKey) {
        throw new Error('Only Directive-owned assistant messages can receive Directive swipes.');
      }
      const text = String(options.text || '').trim();
      if (!text) throw new Error('Assistant swipe text must be non-empty.');
      if (!Array.isArray(message.swipes)) message.swipes = [message.text || ''].filter(Boolean);
      let swipeIndex = message.swipes.findIndex((entry) => entry === text);
      const duplicate = swipeIndex >= 0;
      if (swipeIndex < 0) {
        swipeIndex = message.swipes.length;
        message.swipes.push(text);
      }
      message.swipe_id = swipeIndex;
      message.text = text;
      message.metadata = {
        ...(message.metadata || {}),
        selectedSwipeIndex: swipeIndex,
        selectedSwipeAt: '2026-06-22T00:00:00.000Z',
        swipeCount: message.swipes.length,
        ...(options.extra?.directive || {})
      };
      if (options.extra && typeof options.extra === 'object') {
        const extraPatch = cloneJson(options.extra);
        delete extraPatch.directive;
        message.extra = {
          ...(message.extra || {}),
          ...extraPatch
        };
      }
      calls.push({ type: 'appendAssistantMessageSwipe', options: cloneJson(options) });
      return {
        ok: true,
        hostMessageId: message.hostMessageId || message.id,
        index,
        swipeIndex,
        swipeCount: message.swipes.length,
        duplicate,
        text,
        metadata: cloneJson(message.metadata),
        message: cloneJson(message)
      };
    },
    async cloneCurrentChatForSaveBranch(options = {}) {
      const sourceChatId = currentChatId;
      const branchChatId = uniqueBranchChatId({
        saveId: options.saveId,
        name: options.name
      });
      const sourceMessages = messagesForChat(sourceChatId);
      const branchMessages = sourceMessages.map((message) => retargetChatIds(message, sourceChatId, branchChatId));
      chatsById.set(String(branchChatId), branchMessages);
      currentChatId = branchChatId;
      const sourceBinding = options.sourceBinding && typeof options.sourceBinding === 'object'
        ? options.sourceBinding
        : (metadataByChatId.get(String(sourceChatId)) || binding || {});
      const nextBinding = {
        ...cloneJson(sourceBinding),
        hostId: 'fake',
        chatId: branchChatId,
        campaignId: options.campaignId || sourceBinding.campaignId || null,
        saveId: options.saveId || sourceBinding.saveId || null,
        entityType: sourceBinding.entityType || 'character',
        entityId: sourceBinding.entityId || entityId,
        entityName: sourceBinding.entityName || entityName,
        chatName: options.name || sourceBinding.chatName || null,
        status: sourceBinding.status || 'bound',
        createdByDirective: true,
        creationMethod: 'clone-current-chat',
        clonedFromChatId: sourceChatId,
        clonedAt: '2026-06-22T00:00:00.000Z'
      };
      storeBinding(nextBinding);
      calls.push({
        type: 'cloneCurrentChatForSaveBranch',
        options: cloneJson(options),
        sourceChatId,
        branchChatId,
        messageCount: branchMessages.length
      });
      return {
        ...cloneJson(binding),
        sourceChatId,
        messageCount: branchMessages.length
      };
    },
    async updateBindingMetadata(nextBinding) {
      storeBinding({
        ...cloneJson(nextBinding),
        chatId: nextBinding?.chatId || currentChatId
      });
      return true;
    },
    getBindingMetadata() {
      return cloneJson(metadataByChatId.get(String(currentChatId)) || null);
    },
    async open(nextBinding) {
      if (nextBinding?.chatId) currentChatId = nextBinding.chatId;
      messagesForChat(currentChatId);
      return true;
    },
    setCurrentChatId(nextChatId, metadata = undefined) {
      currentChatId = nextChatId || '';
      messagesForChat(currentChatId);
      if (metadata !== undefined && currentChatId) {
        metadataByChatId.set(String(currentChatId), cloneJson(metadata));
      }
      return this.getCurrentChatIdentity();
    },
    async openChat(nextBinding) {
      await this.open(nextBinding);
      return { ok: true, chatId: currentChatId };
    },
    pushPlayerMessage({ text, hostMessageId = null } = {}) {
      const chatMessages = messagesForChat();
      const resolvedId = hostMessageId || `fake-message-${chatMessages.length + 1}`;
      const message = {
        id: resolvedId,
        hostMessageId: resolvedId,
        chatId: currentChatId,
        text: String(text || ''),
        isUser: true,
        isDirectiveOwned: false
      };
      chatMessages.push(message);
      return cloneJson(message);
    },
    pushAssistantMessage({ text, hostMessageId = null, directiveOwned = false, metadata = null, isSystem = false, swipes = null, swipeId = null } = {}) {
      const chatMessages = messagesForChat();
      const resolvedId = hostMessageId || `fake-message-${chatMessages.length + 1}`;
      const normalizedSwipes = Array.isArray(swipes) ? swipes.map((entry) => String(entry || '')).filter(Boolean) : null;
      const selectedSwipeIndex = Number.isInteger(swipeId) && normalizedSwipes && swipeId >= 0 && swipeId < normalizedSwipes.length
        ? swipeId
        : null;
      const message = {
        id: resolvedId,
        hostMessageId: resolvedId,
        chatId: currentChatId,
        text: selectedSwipeIndex !== null ? normalizedSwipes[selectedSwipeIndex] : String(text || ''),
        isUser: false,
        isSystem: isSystem === true,
        role: isSystem === true ? 'system' : 'assistant',
        isDirectiveOwned: directiveOwned === true,
        metadata: cloneJson(metadata || null)
      };
      if (normalizedSwipes) {
        message.swipes = normalizedSwipes;
        message.swipe_id = selectedSwipeIndex ?? 0;
      }
      chatMessages.push(message);
      return cloneJson(message);
    },
    messages() {
      return cloneJson(messagesForChat());
    },
    messagesForChat(chatId) {
      return cloneJson(messagesForChat(chatId));
    },
    setMessagesForChat(chatId, nextMessages = []) {
      const id = String(chatId || '');
      chatsById.set(id, cloneJson(Array.isArray(nextMessages) ? nextMessages : []));
      return cloneJson(chatsById.get(id));
    },
    chats() {
      return Object.fromEntries([...chatsById.entries()].map(([id, value]) => [id, cloneJson(value)]));
    },
    calls() {
      return cloneJson(calls);
    }
  };
}

export function createFakePromptAdapter() {
  let blocks = [];
  let binding = null;
  let revision = 0;
  const calls = [];
  async function sync(options = {}) {
    const packet = options.packet || null;
    binding = cloneJson(options.binding || binding);
    blocks = cloneJson(packet?.blocks || options.blocks || []);
    revision = Number.isInteger(packet?.revision)
      ? packet.revision
      : (Number.isInteger(options.contextRevision) ? options.contextRevision : revision + 1);
    calls.push({ type: 'sync', options: cloneJson(options) });
    return {
      ok: true,
      status: 'installed',
      revision,
      blockCount: blocks.length,
      binding: cloneJson(binding)
    };
  }
  return {
    isAvailable: () => true,
    install: sync,
    update: sync,
    rebuild: sync,
    async clear() {
      blocks = [];
      calls.push({ type: 'clear' });
      return { ok: true, status: 'cleared' };
    },
    async syncForChat(identity = {}) {
      return { ok: true, active: !binding?.chatId || String(binding.chatId) === String(identity.chatId || '') };
    },
    inspect() {
      return {
        available: true,
        status: blocks.length ? 'installed' : 'clear',
        revision,
        blockCount: blocks.length,
        blocks: cloneJson(blocks),
        binding: cloneJson(binding)
      };
    },
    calls() {
      return cloneJson(calls);
    }
  };
}

export function createFakeProviderAdapter(initial = {}) {
  let settings = {
    utility: {
      provider: 'st',
      profileId: '',
      baseUrl: '',
      model: '',
      apiKeySet: false,
      maxTokens: 8192,
      temperature: 0.1,
      topP: 0.95,
      ...(initial.utility || {})
    },
    reasoning: {
      provider: 'st',
      profileId: '',
      baseUrl: '',
      model: '',
      apiKeySet: false,
      maxTokens: 8192,
      temperature: 0.7,
      topP: 0.98,
      ...(initial.reasoning || {})
    },
    roleProviderKinds: cloneJson(initial.roleProviderKinds || {})
  };
  const profiles = cloneJson(initial.profiles || []);

  function requireKind(kind) {
    const id = String(kind || '');
    if (!settings[id]) throw new Error(`Unknown fake provider kind ${id}`);
    return id;
  }

  function roleKind(roleId) {
    return providerKindForRole(roleId, settings);
  }

  return {
    getSettings: () => cloneJson(settings),
    getAll: () => cloneJson(settings),
    update(kind, patch = {}) {
      const id = requireKind(kind);
      settings[id] = { ...settings[id], ...cloneJson(patch) };
      if (Object.prototype.hasOwnProperty.call(patch, 'apiKey')) {
        settings[id].apiKeySet = Boolean(String(patch.apiKey || '').trim());
        delete settings[id].apiKey;
      }
      return cloneJson(settings[id]);
    },
    updateSettings(kind, patch = {}) {
      if (typeof kind === 'string') return this.update(kind, patch);
      const update = kind && typeof kind === 'object' ? kind : {};
      for (const id of ['utility', 'reasoning']) {
        if (update[id]) settings[id] = { ...settings[id], ...cloneJson(update[id]) };
      }
      if (update.roleProviderKinds && typeof update.roleProviderKinds === 'object' && !Array.isArray(update.roleProviderKinds)) {
        settings.roleProviderKinds = { ...(settings.roleProviderKinds || {}), ...cloneJson(update.roleProviderKinds) };
      }
      return cloneJson(settings);
    },
    updateRoleProviderKind(roleId, providerKind) {
      const roleDefault = providerKindForRole(roleId);
      const kind = String(providerKind || '').toLowerCase() === 'reasoning' ? 'reasoning' : 'utility';
      settings.roleProviderKinds = { ...(settings.roleProviderKinds || {}) };
      if (kind === roleDefault) delete settings.roleProviderKinds[roleId];
      else settings.roleProviderKinds[roleId] = kind;
      return listProviderRoleRouting(settings).find((entry) => entry.roleId === roleId);
    },
    resetRoleProviderKind(roleId) {
      settings.roleProviderKinds = { ...(settings.roleProviderKinds || {}) };
      delete settings.roleProviderKinds[roleId];
      return listProviderRoleRouting(settings).find((entry) => entry.roleId === roleId);
    },
    listRoleRouting() {
      return listProviderRoleRouting(settings);
    },
    listConnectionProfiles() {
      return cloneJson(profiles);
    },
    listProfiles() {
      return cloneJson(profiles);
    },
    validate(kind = null) {
      const ids = kind ? [requireKind(kind)] : ['utility', 'reasoning'];
      const diagnostics = [];
      for (const id of ids) {
        const config = settings[id];
        if (config.provider === 'profile' && !config.profileId) {
          diagnostics.push({ kind: id, severity: 'error', code: 'profile-required' });
        }
        if (config.provider === 'openai_compatible' && (!config.baseUrl || !config.model)) {
          diagnostics.push({ kind: id, severity: 'error', code: 'endpoint-required' });
        }
      }
      return { ok: diagnostics.length === 0, settings: cloneJson(settings), diagnostics };
    },
    status(kind = 'utility') {
      const id = requireKind(kind);
      const config = settings[id];
      const profile = profiles.find((entry) => entry.id === config.profileId) || null;
      return {
        kind: id,
        provider: config.provider,
        ready: config.provider === 'profile'
          ? Boolean(profile)
          : config.provider === 'openai_compatible'
            ? Boolean(config.baseUrl && config.model)
            : true,
        label: config.provider === 'profile'
          ? (profile?.model || profile?.label || config.profileId || 'Profile not selected')
          : (config.model || 'Current fake chat model'),
        sourceLabel: config.provider === 'profile'
          ? 'Fake Connection Profile'
          : config.provider === 'openai_compatible'
            ? 'Fake OpenAI-compatible endpoint'
            : 'Current fake chat model'
      };
    },
    resolve(roleId) {
      const kind = roleKind(roleId);
      return { kind, roleId, ...cloneJson(settings[kind]) };
    },
    async test(kind) {
      const id = requireKind(kind);
      return { ok: this.status(id).ready, kind: id, providerId: `fake:${id}`, text: 'DIRECTIVE_PROVIDER_OK' };
    }
  };
}

export function createFakeDirectiveHost(options = {}) {
  const chatNative = options.chatNative === true;
  return normalizeDirectiveHost({
    id: 'fake',
    displayName: options.displayName || 'Fake Host',
    capabilities: createHostCapabilities({
      storage: {
        list: true,
        delete: true,
        verify: true,
        userScoped: true
      },
      generation: {
        currentChatModel: true,
        quiet: true,
        raw: true,
        batch: true,
        batchConcurrent: true,
        structuredOutput: true,
        toolCalling: true,
        observeMainGeneration: chatNative,
        connectionProfiles: true
      },
      prompt: {
        contextHandlers: chatNative,
        interceptors: chatNative,
        install: chatNative,
        update: chatNative,
        clear: chatNative,
        rebuild: chatNative,
        lifecycle: chatNative,
        scopedToChat: chatNative
      },
      chat: {
        identity: chatNative,
        create: chatNative,
        bind: chatNative,
        open: chatNative,
        clone: chatNative,
        postAssistant: chatNative,
        postAssistantMessage: chatNative,
        observeMessages: chatNative,
        messageObservation: chatNative,
        editRecovery: chatNative,
        assistantSwipes: chatNative,
        messageEditObservation: chatNative,
        messageDeleteObservation: chatNative,
        metadata: chatNative
      },
      ui: {
        panelMount: true,
        backendToFrontendMessages: true
      },
      presets: {
        narrationContext: typeof options.presets?.getNarrationContext === 'function',
        install: typeof options.presets?.installBundledPreset === 'function',
        versionedInstall: typeof options.presets?.installBundledPreset === 'function'
      }
    }),
    logger: options.logger || console,
    storage: options.storage || createFakeJsonStorage(options.files),
    events: options.events || createFakeEventAdapter(),
    generation: options.generation || createFakeGenerationClient(options.generationOptions),
    providers: options.providers || createFakeProviderAdapter(options.providerOptions),
    presets: options.presets,
    chat: options.chat || createFakeChatAdapter(options.chatOptions),
    prompt: options.prompt || createFakePromptAdapter(),
    ui: options.ui || createFakeUiAdapter(),
    jobs: options.jobs || {}
  });
}
