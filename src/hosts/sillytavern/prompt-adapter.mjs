import { DIRECTIVE_STATIC_PROMPT_KEYS } from '../../continuity/prompt-keys.mjs';
import {
  createExternalPromptEnvironmentRef,
  isDirectivePromptKey,
  summarizeExternalPromptEnvironmentTargets
} from '../../runtime/architecture-redesign-contracts.mjs';
import {
  observeSillyTavernExternalPromptEnvironment
} from './external-context-observer.mjs';

const PROMPT_KEY_PREFIX = 'directive.campaign';

export { DIRECTIVE_STATIC_PROMPT_KEYS };

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function promptApi(context) {
  const setExtensionPrompt = context?.setExtensionPrompt || globalThis.setExtensionPrompt;
  const types = context?.extension_prompt_types || globalThis.extension_prompt_types || {};
  const roles = context?.extension_prompt_roles || globalThis.extension_prompt_roles || {};
  return {
    setExtensionPrompt,
    types,
    roles
  };
}

function normalizePosition(api, placement) {
  const value = String(placement || '').toLowerCase();
  if (value === 'beforeprompt' || value === 'before_prompt') {
    return Number.isFinite(Number(api.types.BEFORE_PROMPT)) ? api.types.BEFORE_PROMPT : 0;
  }
  if (value === 'inprompt' || value === 'in_prompt') {
    return Number.isFinite(Number(api.types.IN_PROMPT)) ? api.types.IN_PROMPT : 0;
  }
  return Number.isFinite(Number(api.types.IN_CHAT)) ? api.types.IN_CHAT : 1;
}

function normalizeRole(api, role) {
  const value = String(role || 'system').toLowerCase();
  if (value === 'user') return Number.isFinite(Number(api.roles.USER)) ? api.roles.USER : 1;
  if (value === 'assistant') return Number.isFinite(Number(api.roles.ASSISTANT)) ? api.roles.ASSISTANT : 2;
  return Number.isFinite(Number(api.roles.SYSTEM)) ? api.roles.SYSTEM : 0;
}

function promptKey(blockId) {
  return `${PROMPT_KEY_PREFIX}.${String(blockId || '').replace(/[^a-zA-Z0-9_.-]/g, '-')}`;
}

function blockPromptKey(block = {}) {
  const explicit = String(block.promptKey || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '-');
  return explicit.startsWith('directive.') ? explicit : promptKey(block.id);
}

function directivePromptKeySet(keys = []) {
  return new Set([...keys].filter(isDirectivePromptKey));
}

function externalEnvironmentMayInfluencePrompt(environment = {}) {
  return Boolean(
    environment.worldInfo?.active
    || environment.memoryBooks?.enabled
    || environment.summaryception?.enabled
    || environment.summaryception?.promptKeyActive
    || environment.vectFox?.enabled
    || environment.vectFox?.generationInterceptorActive
    || (environment.knownExternalPromptKeys || []).length > 0
  );
}

function externalPromptInspectionMetadata(context, binding = {}) {
  try {
    const environment = observeSillyTavernExternalPromptEnvironment(context, {
      userHandle: binding?.userHandle,
      chatId: binding?.chatId || contextChatId(context),
      campaignId: binding?.campaignId,
      saveId: binding?.saveId
    });
    const ref = createExternalPromptEnvironmentRef(environment);
    return {
      externalPromptEnvironmentRef: ref,
      knownExternalPromptKeys: ref.knownExternalPromptKeys || [],
      finalHostPromptMayIncludeExternal: externalEnvironmentMayInfluencePrompt(environment),
      externalPromptEnvironmentTargets: summarizeExternalPromptEnvironmentTargets(environment),
      externalPromptDiagnostics: Array.isArray(environment.diagnostics) ? cloneJson(environment.diagnostics) : [],
      unavailableSignals: Array.isArray(environment.unknownSignals) ? [...environment.unknownSignals] : [],
      redactions: Array.isArray(environment.redactions) ? [...environment.redactions] : []
    };
  } catch (error) {
    return {
      externalPromptEnvironmentRef: null,
      knownExternalPromptKeys: [],
      finalHostPromptMayIncludeExternal: null,
      externalPromptEnvironmentTargets: null,
      unavailableSignals: ['external-prompt-environment-observation-failed'],
      redactions: [],
      externalPromptEnvironmentError: { message: error?.message || String(error) }
    };
  }
}

function contextChatId(context) {
  const value = context?.chatId
    ?? context?.chat_id
    ?? context?.currentChatId
    ?? context?.current_chat_id
    ?? (typeof context?.getCurrentChatId === 'function' ? context.getCurrentChatId() : null)
    ?? context?.chatMetadata?.chat_id
    ?? context?.chat_metadata?.chat_id;
  return value === null || value === undefined ? null : String(value).trim() || null;
}

function ensurePromptApi(context) {
  const api = promptApi(context);
  if (typeof api.setExtensionPrompt !== 'function') {
    const error = new Error('SillyTavern setExtensionPrompt is unavailable.');
    error.code = 'DIRECTIVE_PROMPT_API_UNAVAILABLE';
    throw error;
  }
  return api;
}

export function createSillyTavernPromptAdapter({ contextFactory } = {}) {
  const getContext = typeof contextFactory === 'function'
    ? contextFactory
    : () => globalThis.SillyTavern?.getContext?.() || null;
  const installed = new Map();
  let activeBinding = null;
  let activePacket = null;
  let status = 'inactive';
  let updatedAt = null;
  let lastError = null;

  function setBlock(context, block) {
    const api = ensurePromptApi(context);
    const key = blockPromptKey(block);
    if (!isDirectivePromptKey(key)) {
      const error = new Error(`Refusing to install non-Directive prompt key ${key}.`);
      error.code = 'DIRECTIVE_PROMPT_KEY_SCOPE';
      error.details = { key };
      throw error;
    }
    api.setExtensionPrompt(
      key,
      block.text || String(block.content || ''),
      normalizePosition(api, block.placement),
      Math.max(0, Math.min(1000, Number(block.depth) || 0)),
      false,
      normalizeRole(api, block.role)
    );
    installed.set(key, {
      key,
      id: block.id,
      promptKey: key,
      title: block.title,
      hash: block.hash || null,
      priority: block.priority,
      depth: block.depth,
      sourceIds: Array.isArray(block.sourceIds) ? [...block.sourceIds] : [],
      sourceRevision: block.source?.revision ?? null
    });
  }

  function clearKey(context, key) {
    if (!isDirectivePromptKey(key)) {
      installed.delete(key);
      return { skipped: true, reason: 'non-directive-prompt-key', key };
    }
    const api = ensurePromptApi(context);
    api.setExtensionPrompt(
      key,
      '',
      Number.isFinite(Number(api.types.IN_CHAT)) ? api.types.IN_CHAT : 1,
      4,
      false,
      Number.isFinite(Number(api.roles.SYSTEM)) ? api.roles.SYSTEM : 0
    );
    installed.delete(key);
  }

  async function clear({ reason = 'clear', preservePacket = false } = {}) {
    const context = getContext();
    if (!context) {
      installed.clear();
      if (!preservePacket) activeBinding = null;
      if (!preservePacket) activePacket = null;
      status = 'inactive';
      return { ok: true, reason, transport: 'no-context' };
    }
    try {
      for (const key of directivePromptKeySet([...DIRECTIVE_STATIC_PROMPT_KEYS, ...installed.keys()])) clearKey(context, key);
      if (!preservePacket) activeBinding = null;
      if (!preservePacket) activePacket = null;
      status = 'inactive';
      updatedAt = new Date().toISOString();
      lastError = null;
      return { ok: true, reason, cleared: true };
    } catch (error) {
      lastError = error;
      status = 'error';
      return { ok: false, reason, error: { message: error?.message || String(error) } };
    }
  }

  async function install(options = {}) {
    const binding = options.binding;
    const packet = options.packet || (Array.isArray(options.blocks) ? {
      kind: 'directive.playerSafePromptContext',
      blocks: options.blocks,
      revision: Number(options.contextRevision || 0),
      hash: options.hash || null,
      text: options.text || ''
    } : null);
    const context = getContext();
    if (!context) throw new Error('SillyTavern context is unavailable for prompt installation.');
    if (!binding?.chatId) throw new Error('Campaign chat binding is required for prompt installation.');
    if (!packet || !Array.isArray(packet.blocks)) throw new Error('Prompt packet with blocks is required.');
    const activeChatId = contextChatId(context);
    if (activeChatId && String(binding.chatId) !== activeChatId) {
      const error = new Error(`Refusing to install Directive campaign context into unbound chat ${activeChatId}.`);
      error.code = 'DIRECTIVE_PROMPT_CHAT_MISMATCH';
      error.details = { activeChatId, boundChatId: String(binding.chatId) };
      throw error;
    }
    try {
      const desiredKeys = directivePromptKeySet(packet.blocks.map(blockPromptKey));
      for (const key of directivePromptKeySet([...DIRECTIVE_STATIC_PROMPT_KEYS, ...installed.keys()])) {
        if (!desiredKeys.has(key)) clearKey(context, key);
      }
      for (const block of packet.blocks) setBlock(context, block);
      const externalMetadata = externalPromptInspectionMetadata(context, binding);
      activeBinding = cloneJson(binding);
      activePacket = {
        ...cloneJson(packet),
        ...cloneJson(externalMetadata)
      };
      status = 'active';
      updatedAt = new Date().toISOString();
      lastError = null;
      return {
        ok: true,
        status,
        chatId: binding.chatId,
        revision: packet.revision,
        hash: packet.hash,
        blockCount: packet.blocks.length,
        externalPromptEnvironmentRef: cloneJson(externalMetadata.externalPromptEnvironmentRef),
        knownExternalPromptKeys: cloneJson(externalMetadata.knownExternalPromptKeys)
      };
    } catch (error) {
      await clear({ reason: 'install-failed', preservePacket: true });
      status = 'error';
      lastError = error;
      throw error;
    }
  }

  async function update(options = {}) {
    return install(options);
  }

  async function rebuild(options = {}) {
    await clear({ reason: 'rebuild', preservePacket: true });
    return install(options);
  }

  async function syncForChat(identity = {}) {
    const boundChatId = activeBinding?.chatId;
    if (!boundChatId || String(identity?.chatId || '') !== String(boundChatId)) {
      if (installed.size > 0) await clear({ reason: 'unbound-chat', preservePacket: true });
      return {
        ok: true,
        active: false,
        reason: 'unbound-chat'
      };
    }
    if (installed.size === 0 && activePacket) {
      return install({ binding: activeBinding, packet: activePacket });
    }
    return {
      ok: true,
      active: true,
      chatId: boundChatId
    };
  }

  function inspect({ includeText = false } = {}) {
    const context = getContext();
    const externalMetadata = context
      ? externalPromptInspectionMetadata(context, activeBinding || {})
      : {
          externalPromptEnvironmentRef: activePacket?.externalPromptEnvironmentRef || null,
          knownExternalPromptKeys: activePacket?.knownExternalPromptKeys || [],
          finalHostPromptMayIncludeExternal: activePacket?.finalHostPromptMayIncludeExternal ?? null,
          externalPromptEnvironmentTargets: activePacket?.externalPromptEnvironmentTargets || null,
          externalPromptDiagnostics: activePacket?.externalPromptDiagnostics || [],
          unavailableSignals: activePacket?.unavailableSignals || [],
          redactions: activePacket?.redactions || []
        };
    return {
      kind: 'directive.promptInspection',
      status,
      binding: cloneJson(activeBinding),
      revision: activePacket?.revision ?? null,
      hash: activePacket?.hash || null,
      blockCount: installed.size,
      blocks: [...installed.values()].map(cloneJson),
      externalPromptEnvironmentRef: cloneJson(externalMetadata.externalPromptEnvironmentRef),
      knownExternalPromptKeys: cloneJson(externalMetadata.knownExternalPromptKeys || []),
      directiveOwnedPromptKeys: [...installed.keys()].filter(isDirectivePromptKey).sort(),
      finalHostPromptMayIncludeExternal: externalMetadata.finalHostPromptMayIncludeExternal ?? null,
      externalPromptEnvironmentTargets: cloneJson(externalMetadata.externalPromptEnvironmentTargets || null),
      externalPromptDiagnostics: cloneJson(externalMetadata.externalPromptDiagnostics || []),
      unavailableSignals: cloneJson(externalMetadata.unavailableSignals || []),
      redactions: cloneJson(externalMetadata.redactions || []),
      ...(externalMetadata.externalPromptEnvironmentError ? { externalPromptEnvironmentError: cloneJson(externalMetadata.externalPromptEnvironmentError) } : {}),
      updatedAt,
      lastError: lastError ? { message: lastError.message || String(lastError) } : null,
      ...(includeText ? { text: activePacket?.text || '' } : {})
    };
  }

  function isAvailable() {
    return typeof promptApi(getContext()).setExtensionPrompt === 'function';
  }

  return {
    id: 'sillytavern-prompt-adapter',
    isAvailable,
    install,
    update,
    clear,
    rebuild,
    inspect,
    syncForChat
  };
}

export const __sillyTavernPromptAdapterTestHooks = Object.freeze({
  promptKey,
  blockPromptKey,
  DIRECTIVE_STATIC_PROMPT_KEYS,
  normalizePosition,
  normalizeRole,
  contextChatId
});
