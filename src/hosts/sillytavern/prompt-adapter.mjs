export const DIRECTIVE_V1_PROMPT_KEY = 'directive.campaign.v1';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function contextChatId(context) {
  const value = context?.chatId
    ?? context?.chat_id
    ?? context?.currentChatId
    ?? context?.current_chat_id
    ?? context?.getCurrentChatId?.()
    ?? context?.chatMetadata?.chat_id
    ?? context?.chat_metadata?.chat_id;
  return String(value ?? '').trim() || null;
}

function api(context) {
  return {
    set: context?.setExtensionPrompt || globalThis.setExtensionPrompt,
    types: context?.extension_prompt_types || globalThis.extension_prompt_types || {},
    roles: context?.extension_prompt_roles || globalThis.extension_prompt_roles || {}
  };
}

function requireApi(context) {
  const promptApi = api(context);
  if (typeof promptApi.set !== 'function') {
    const error = new Error('SillyTavern setExtensionPrompt is unavailable.');
    error.code = 'DIRECTIVE_PROMPT_API_UNAVAILABLE';
    throw error;
  }
  return promptApi;
}

function packetText(packet) {
  if (typeof packet?.text === 'string' && packet.text.trim()) return packet.text.trim();
  const blocks = Array.isArray(packet?.blocks) ? packet.blocks : [];
  return blocks.map((block) => String(block?.text || block?.content || '').trim()).filter(Boolean).join('\n\n');
}

function packetRevision(packet) {
  const value = Number(packet?.revision);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function stableHash(value = '') {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createSillyTavernPromptAdapter({ contextFactory } = {}) {
  const getContext = typeof contextFactory === 'function'
    ? contextFactory
    : () => globalThis.SillyTavern?.getContext?.() || null;
  let activeBinding = null;
  let activePacket = null;
  let installed = false;
  let updatedAt = null;
  let lastError = null;

  function set(text) {
    const context = getContext();
    const promptApi = requireApi(context);
    promptApi.set(
      DIRECTIVE_V1_PROMPT_KEY,
      text,
      Number.isFinite(Number(promptApi.types.IN_CHAT)) ? promptApi.types.IN_CHAT : 1,
      0,
      false,
      Number.isFinite(Number(promptApi.roles.SYSTEM)) ? promptApi.roles.SYSTEM : 0
    );
  }

  async function clear({ reason = 'clear', preservePacket = false } = {}) {
    try {
      if (getContext()) set('');
      installed = false;
      if (!preservePacket) {
        activeBinding = null;
        activePacket = null;
      }
      updatedAt = new Date().toISOString();
      lastError = null;
      return { ok: true, reason, cleared: true };
    } catch (error) {
      installed = false;
      lastError = error;
      return { ok: false, reason, error: { message: error?.message || String(error) } };
    }
  }

  async function install({ binding, packet } = {}) {
    const context = getContext();
    if (!context) throw new Error('SillyTavern context is unavailable for prompt installation.');
    const chatId = String(binding?.chatId ?? '').trim();
    if (!chatId) throw new Error('A V1 campaign chat binding is required for prompt installation.');
    const current = contextChatId(context);
    if (current && current !== chatId) {
      const error = new Error(`Refusing to install Directive V1 context into unbound chat ${current}.`);
      error.code = 'DIRECTIVE_PROMPT_CHAT_MISMATCH';
      throw error;
    }
    const text = packetText(packet);
    if (!text) throw new Error('Directive V1 prompt packet text is required.');
    try {
      set(text);
      activeBinding = clone(binding);
      activePacket = {
        kind: 'directive.promptPacket.v1',
        revision: packetRevision(packet),
        hash: packet?.hash || stableHash(text),
        text
      };
      installed = true;
      updatedAt = new Date().toISOString();
      lastError = null;
      return {
        ok: true,
        status: 'active',
        chatId,
        revision: activePacket.revision,
        hash: activePacket.hash,
        blockCount: 1
      };
    } catch (error) {
      lastError = error;
      installed = false;
      throw error;
    }
  }

  async function rebuild(options = {}) {
    await clear({ reason: 'rebuild', preservePacket: true });
    return install(options);
  }

  async function syncForChat(identity = {}) {
    if (!activeBinding?.chatId || String(identity?.chatId || '') !== String(activeBinding.chatId)) {
      if (installed) await clear({ reason: 'unbound-chat', preservePacket: true });
      return { ok: true, active: false, reason: 'unbound-chat' };
    }
    if (!installed && activePacket) return install({ binding: activeBinding, packet: activePacket });
    return { ok: true, active: installed, chatId: activeBinding.chatId };
  }

  return {
    id: 'sillytavern-v1-prompt-adapter',
    isAvailable: () => typeof api(getContext()).set === 'function',
    install,
    update: install,
    clear,
    rebuild,
    syncForChat,
    inspect({ includeText = false } = {}) {
      return {
        kind: 'directive.promptInspection.v1',
        status: installed ? 'active' : 'inactive',
        key: DIRECTIVE_V1_PROMPT_KEY,
        binding: clone(activeBinding),
        revision: activePacket?.revision ?? null,
        hash: activePacket?.hash || null,
        blockCount: installed ? 1 : 0,
        updatedAt,
        lastError: lastError ? { message: lastError.message || String(lastError) } : null,
        ...(includeText ? { text: activePacket?.text || '' } : {})
      };
    }
  };
}

export const __sillyTavernPromptAdapterTestHooks = Object.freeze({
  contextChatId,
  packetText,
  stableHash
});
