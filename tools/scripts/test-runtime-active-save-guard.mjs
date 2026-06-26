import assert from 'node:assert/strict';

import {
  activeSaveGuardRecoveryActions,
  activeSaveGuardSummary,
  createActiveSaveGuard
} from '../../src/runtime/active-save-guard.mjs';

function campaignState(overrides = {}) {
  return {
    campaign: { id: 'campaign-a' },
    campaignChatBinding: {
      hostId: 'sillytavern',
      chatId: 'chat-a',
      campaignId: 'campaign-a',
      saveId: 'save-a',
      ...overrides.binding
    },
    ...overrides.state
  };
}

function guardFor({ activeChatId = 'chat-a', binding = null, metadata = null, metadataError = null } = {}) {
  return createActiveSaveGuard({
    runtimeHost: {
      chat: {
        getCurrentChatId: async () => activeChatId,
        getCurrentBinding: async () => binding,
        getBindingMetadata: async () => {
          if (metadataError) throw metadataError;
          return metadata;
        }
      }
    }
  });
}

assert.equal(activeSaveGuardSummary('ok'), 'Ready to save: the active chat matches this save.');
assert.deepEqual(activeSaveGuardRecoveryActions('different-directive-save', { chatId: 'chat-a' }), ['loadActiveChatSave', 'openCampaignChat']);
assert.deepEqual(activeSaveGuardRecoveryActions('missing-host-identity-capability', { chatId: 'chat-a' }), ['hostCapabilityDiagnostic']);

let result = await createActiveSaveGuard({ runtimeHost: {} }).evaluate(campaignState());
assert.equal(result.reason, 'missing-host-identity-capability');
assert.equal(result.ok, false);

result = await guardFor({ activeChatId: '' }).evaluate(campaignState());
assert.equal(result.reason, 'no-active-chat-selected');
assert.equal(result.boundChatId, 'chat-a');

result = await guardFor({
  activeChatId: 'chat-a',
  metadata: { campaignId: 'campaign-a', saveId: 'save-a' }
}).evaluate(campaignState(), { expectedSaveId: 'save-a' });
assert.equal(result.reason, 'ok');
assert.equal(result.ok, true);
assert.equal(result.activeChatId, 'chat-a');
assert.equal(result.activeCampaignId, 'campaign-a');
assert.equal(result.activeSaveId, 'save-a');

result = await guardFor({
  activeChatId: 'chat-b',
  metadata: { campaignId: 'campaign-b', saveId: 'save-b' }
}).evaluate(campaignState());
assert.equal(result.reason, 'different-directive-campaign');
assert.deepEqual(result.recoveryActions, ['openCampaignChat']);

result = await guardFor({
  activeChatId: 'chat-b',
  metadata: { campaignId: 'campaign-a', saveId: 'save-b' }
}).evaluate(campaignState());
assert.equal(result.reason, 'different-directive-save');
assert.deepEqual(result.recoveryActions, ['loadActiveChatSave', 'openCampaignChat']);

result = await guardFor({
  activeChatId: 'chat-a',
  metadata: { campaignId: 'campaign-b', saveId: 'save-a' }
}).evaluate(campaignState());
assert.equal(result.reason, 'corrupt-metadata');
assert.deepEqual(result.recoveryActions, ['rebindChat']);

result = await guardFor({
  activeChatId: 'chat-a',
  metadataError: new Error('metadata unavailable')
}).evaluate(campaignState());
assert.equal(result.reason, 'metadata-unreadable');
assert.equal(result.metadataError.message, 'metadata unavailable');

result = await guardFor().evaluate(campaignState(), { expectedSaveId: 'save-other' });
assert.equal(result.reason, 'binding-save-mismatch');
assert.deepEqual(result.recoveryActions, ['rebindChat']);

result = await guardFor().evaluate({ campaign: { id: 'campaign-a' } });
assert.equal(result.reason, 'campaign-chat-unbound');
