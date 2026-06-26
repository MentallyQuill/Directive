function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compactString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function activeSaveGuardSummary(reason) {
  switch (reason) {
    case 'ok':
      return 'Ready to save: the active chat matches this save.';
    case 'no-campaign-state':
      return 'Load a campaign save before saving.';
    case 'campaign-chat-unbound':
      return 'This save is not linked to a campaign chat yet. Use Rebind Chat, then save from that chat.';
    case 'no-active-chat-selected':
      return 'Choose the campaign chat for this save before saving. Save Game is disabled until that chat is active.';
    case 'missing-host-identity-capability':
      return 'This host cannot tell Directive which chat is active, so Save Game is disabled here.';
    case 'different-directive-save':
      return 'The active chat is linked to a different save branch of this campaign. Load that branch, or open this save\'s campaign chat before saving.';
    case 'different-directive-campaign':
      return 'The active chat is linked to a different Directive campaign. Open this save\'s campaign chat before saving.';
    case 'unbound-chat':
      return 'The active chat is not linked to this save. Open this save\'s campaign chat before saving.';
    case 'binding-save-mismatch':
      return 'This save\'s chat link points to a different save id. Load the save again or use Rebind Chat before saving.';
    case 'corrupt-metadata':
      return 'The active chat has conflicting Directive save data. Use Rebind Chat before saving.';
    case 'metadata-unreadable':
      return 'Directive could not read the active chat\'s save data. Open this save\'s campaign chat and try again.';
    default:
      return 'Save Game is disabled until Directive can confirm the active chat belongs to this save.';
  }
}

export function activeSaveGuardRecoveryActions(reason, binding = null) {
  switch (reason) {
    case 'ok':
      return [];
    case 'different-directive-save':
      return ['loadActiveChatSave', 'openCampaignChat'];
    case 'campaign-chat-unbound':
    case 'corrupt-metadata':
    case 'binding-save-mismatch':
      return ['rebindChat'];
    case 'missing-host-identity-capability':
      return ['hostCapabilityDiagnostic'];
    case 'no-active-chat-selected':
    case 'different-directive-campaign':
    case 'unbound-chat':
    case 'metadata-unreadable':
    default:
      return binding?.chatId ? ['openCampaignChat'] : [];
  }
}

export function activeSaveGuardResult(reason, {
  state = null,
  binding = state?.campaignChatBinding || null,
  expectedSaveId = null,
  activeChatId = '',
  activeMetadata = null,
  metadataError = null
} = {}) {
  const boundCampaignId = compactString(binding?.campaignId) || compactString(state?.campaign?.id);
  const boundSaveId = compactString(binding?.saveId) || compactString(expectedSaveId);
  const activeCampaignId = compactString(activeMetadata?.campaignId);
  const activeSaveId = compactString(activeMetadata?.saveId);
  const summary = activeSaveGuardSummary(reason);
  return {
    ok: reason === 'ok',
    reason,
    summary,
    activeChatId: compactString(activeChatId) || null,
    boundChatId: compactString(binding?.chatId) || null,
    activeMetadata: cloneJson(activeMetadata || null),
    metadataError: metadataError ? { message: metadataError?.message || String(metadataError) } : null,
    boundCampaignId: boundCampaignId || null,
    boundSaveId: boundSaveId || null,
    activeCampaignId: activeCampaignId || null,
    activeSaveId: activeSaveId || null,
    recoveryActions: activeSaveGuardRecoveryActions(reason, binding)
  };
}

export function createActiveSaveGuard({ runtimeHost = null } = {}) {
  async function currentHostChat() {
    const chat = runtimeHost?.chat || null;
    const hasCurrentChatId = typeof chat?.getCurrentChatId === 'function';
    const hasCurrentBinding = typeof chat?.getCurrentBinding === 'function';
    if (!chat || (!hasCurrentChatId && !hasCurrentBinding)) {
      return { capability: false, activeChatId: '', activeIdentity: null };
    }
    let activeChatId = '';
    let activeIdentity = null;
    if (hasCurrentChatId) {
      activeChatId = compactString(await chat.getCurrentChatId());
    }
    if ((!activeChatId || hasCurrentBinding) && hasCurrentBinding) {
      activeIdentity = await chat.getCurrentBinding();
      if (!activeChatId) activeChatId = compactString(activeIdentity?.chatId);
    }
    return {
      capability: true,
      activeChatId,
      activeIdentity: cloneJson(activeIdentity || null)
    };
  }

  async function currentHostChatMetadata() {
    if (typeof runtimeHost?.chat?.getBindingMetadata !== 'function') {
      return { metadata: null, error: null };
    }
    try {
      return {
        metadata: cloneJson(await runtimeHost.chat.getBindingMetadata()),
        error: null
      };
    } catch (error) {
      return { metadata: null, error };
    }
  }

  async function evaluate(state = null, {
    expectedSaveId = null
  } = {}) {
    if (!state) {
      return activeSaveGuardResult('no-campaign-state', { state, expectedSaveId });
    }
    const binding = state.campaignChatBinding || null;
    if (!binding?.chatId) {
      return activeSaveGuardResult('campaign-chat-unbound', { state, binding, expectedSaveId });
    }

    const boundSaveId = compactString(binding.saveId) || compactString(expectedSaveId);
    const loadedSaveId = compactString(expectedSaveId);
    if (loadedSaveId && boundSaveId && loadedSaveId !== boundSaveId) {
      return activeSaveGuardResult('binding-save-mismatch', { state, binding, expectedSaveId });
    }

    const current = await currentHostChat();
    if (!current.capability) {
      return activeSaveGuardResult('missing-host-identity-capability', { state, binding, expectedSaveId });
    }
    if (!current.activeChatId) {
      return activeSaveGuardResult('no-active-chat-selected', { state, binding, expectedSaveId });
    }

    const { metadata, error } = await currentHostChatMetadata();
    if (error) {
      return activeSaveGuardResult('metadata-unreadable', {
        state,
        binding,
        expectedSaveId,
        activeChatId: current.activeChatId,
        metadataError: error
      });
    }

    const boundCampaignId = compactString(binding.campaignId) || compactString(state.campaign?.id);
    const activeCampaignId = compactString(metadata?.campaignId);
    const activeSaveId = compactString(metadata?.saveId);
    const activeChatMatches = current.activeChatId === compactString(binding.chatId);
    if (!activeChatMatches) {
      if (activeCampaignId && boundCampaignId && activeCampaignId !== boundCampaignId) {
        return activeSaveGuardResult('different-directive-campaign', {
          state,
          binding,
          expectedSaveId,
          activeChatId: current.activeChatId,
          activeMetadata: metadata
        });
      }
      if (activeCampaignId && activeCampaignId === boundCampaignId && activeSaveId && activeSaveId !== boundSaveId) {
        return activeSaveGuardResult('different-directive-save', {
          state,
          binding,
          expectedSaveId,
          activeChatId: current.activeChatId,
          activeMetadata: metadata
        });
      }
      return activeSaveGuardResult('unbound-chat', {
        state,
        binding,
        expectedSaveId,
        activeChatId: current.activeChatId,
        activeMetadata: metadata
      });
    }

    if (metadata) {
      if (
        activeCampaignId
        && boundCampaignId
        && activeCampaignId !== boundCampaignId
      ) {
        return activeSaveGuardResult('corrupt-metadata', {
          state,
          binding,
          expectedSaveId,
          activeChatId: current.activeChatId,
          activeMetadata: metadata
        });
      }
      if (activeSaveId && boundSaveId && activeSaveId !== boundSaveId) {
        return activeSaveGuardResult('different-directive-save', {
          state,
          binding,
          expectedSaveId,
          activeChatId: current.activeChatId,
          activeMetadata: metadata
        });
      }
    }

    return activeSaveGuardResult('ok', {
      state,
      binding,
      expectedSaveId,
      activeChatId: current.activeChatId,
      activeMetadata: metadata
    });
  }

  return Object.freeze({
    currentHostChat,
    currentHostChatMetadata,
    evaluate
  });
}
