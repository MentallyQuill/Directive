import assert from 'node:assert/strict';
import {
  createNativeBranchLineage,
  createNativeBranchTranscriptAttestation,
  verifyNativeBranchTranscriptAttestation
} from '../../src/runtime/native-branch-lineage.mjs';
import { createFakeChatAdapter } from '../../src/hosts/fake/fake-host.mjs';

function message(id, role, text, extra = {}) {
  return {
    id,
    role,
    is_user: role === 'user',
    mes: text,
    ...extra
  };
}

const parentBinding = Object.freeze({
  hostId: 'sillytavern',
  campaignId: 'campaign.ashes',
  saveId: 'save.parent',
  chatId: 'Ashes parent',
  entityType: 'character',
  entityId: '7',
  entityName: 'Ashes of Peace - Sam Vickers'
});

const parentMessages = [
  message('user.1', 'user', 'Take us through the checkpoint.'),
  message('assistant.1', 'assistant', 'The patrol waves you onward.'),
  message('user.2', 'user', 'Ask Whitaker about the signal.'),
  message('assistant.2', 'assistant', 'Whitaker lowers her voice.', {
    swipes: ['Whitaker changes the subject.', 'Whitaker lowers her voice.'],
    swipe_id: 1,
    extra: { branches: ['renamed-child'] }
  })
];

function lineage(overrides = {}) {
  return createNativeBranchLineage({
    parentBinding,
    childBinding: {
      ...parentBinding,
      saveId: null,
      chatId: 'renamed-child',
      mainChat: parentBinding.chatId
    },
    parentMessages,
    childMessages: structuredClone(parentMessages),
    parentBranchNames: ['renamed-child'],
    ...overrides
  });
}

const assistantEndpoint = lineage();
assert.equal(assistantEndpoint.ok, true);
assert.equal(assistantEndpoint.endpointHostMessageId, 'assistant.2');
assert.equal(assistantEndpoint.endpointRole, 'assistant');
assert.match(assistantEndpoint.lineageHash, /^[0-9a-f]{16}$/);
assert.equal(assistantEndpoint.normalizedChildMessages.at(-1).selectedSwipeId, '1');

const playerEndpoint = lineage({ childMessages: structuredClone(parentMessages.slice(0, 3)) });
assert.equal(playerEndpoint.ok, true);
assert.equal(playerEndpoint.endpointHostMessageId, 'user.2');
assert.equal(playerEndpoint.endpointRole, 'user');

const hostIntentEndpoint = lineage({
  childMessages: structuredClone(parentMessages.slice(0, 3)),
  parentBranchNames: [],
  branchIntent: {
    kind: 'directive.nativeBranchIntent.v1',
    parentChatId: parentBinding.chatId,
    endpointHostMessageId: 'user.2'
  }
});
assert.equal(hostIntentEndpoint.ok, true, 'a captured SillyTavern branch action replaces the unavailable reciprocal parent marker');
assert.equal(hostIntentEndpoint.lineageProof, 'host-branch-intent');
assert.equal(lineage({
  childMessages: structuredClone(parentMessages.slice(0, 3)),
  parentBranchNames: [],
  branchIntent: {
    kind: 'directive.nativeBranchIntent.v1',
    parentChatId: parentBinding.chatId,
    endpointHostMessageId: 'assistant.1'
  }
}).reasonCode, 'native-branch-intent-endpoint-mismatch');
const reciprocalWithStaleIntent = lineage({
  childMessages: structuredClone(parentMessages.slice(0, 3)),
  branchIntent: {
    kind: 'directive.nativeBranchIntent.v1',
    parentChatId: parentBinding.chatId,
    endpointHostMessageId: 'assistant.1'
  }
});
assert.equal(reciprocalWithStaleIntent.ok, true, 'the reciprocal parent link remains sufficient proof');
assert.equal(reciprocalWithStaleIntent.verifiedBranchIntent, null, 'a stale endpoint intent must not be journaled as verified');

const bookmarkOnlyParent = structuredClone(parentMessages);
bookmarkOnlyParent.at(-1).extra = { bookmark_link: 'bookmark-copy' };
assert.deepEqual(
  lineage({ parentMessages: bookmarkOnlyParent, childBinding: { ...parentBinding, saveId: null, chatId: 'bookmark-copy', mainChat: parentBinding.chatId }, parentBranchNames: [] }),
  { ok: false, reasonCode: 'native-branch-parent-link-missing' }
);

assert.equal(lineage({
  childBinding: { ...parentBinding, saveId: null, chatId: 'renamed-child', mainChat: parentBinding.chatId, entityId: '8' }
}).reasonCode, 'native-branch-entity-mismatch');

for (const [field, value] of [
  ['hostId', 'another-host'],
  ['campaignId', 'campaign.other'],
  ['entityType', 'group'],
  ['entityName', 'Another Character']
]) {
  assert.equal(lineage({
    childBinding: {
      ...parentBinding,
      saveId: null,
      chatId: 'renamed-child',
      mainChat: parentBinding.chatId,
      [field]: value
    }
  }).reasonCode, 'native-branch-entity-mismatch', `${field} must be exact branch authority`);
}

for (const field of ['hostId', 'campaignId', 'entityType', 'entityId', 'entityName']) {
  const incompleteParent = { ...parentBinding };
  delete incompleteParent[field];
  const incompleteChild = {
    ...incompleteParent,
    saveId: null,
    chatId: 'renamed-child',
    mainChat: parentBinding.chatId
  };
  assert.equal(lineage({
    parentBinding: incompleteParent,
    childBinding: incompleteChild
  }).reasonCode, 'native-branch-entity-mismatch', `missing ${field} must fail closed`);
}

assert.equal(lineage({
  childBinding: { ...parentBinding, saveId: null, chatId: 'copied-chat', mainChat: parentBinding.chatId },
  parentBranchNames: ['renamed-child']
}).reasonCode, 'native-branch-parent-link-missing');

const mutatedText = structuredClone(parentMessages);
mutatedText[1].mes = 'The patrol stops you.';
assert.equal(lineage({ childMessages: mutatedText }).reasonCode, 'native-branch-transcript-mismatch');

const mutatedSwipe = structuredClone(parentMessages);
mutatedSwipe.at(-1).swipe_id = 0;
mutatedSwipe.at(-1).mes = mutatedSwipe.at(-1).swipes[0];
assert.equal(lineage({ childMessages: mutatedSwipe }).reasonCode, 'native-branch-transcript-mismatch');

const hiddenMutation = structuredClone(parentMessages);
hiddenMutation[1].is_hidden = true;
assert.equal(lineage({ childMessages: hiddenMutation }).reasonCode, 'native-branch-transcript-mismatch');

const deletedMutation = structuredClone(parentMessages);
deletedMutation[1].extra = { ...(deletedMutation[1].extra || {}), directive: { deleted: true } };
assert.equal(lineage({ childMessages: deletedMutation }).reasonCode, 'native-branch-transcript-mismatch');

const attestation = createNativeBranchTranscriptAttestation(parentMessages);
assert.deepEqual(attestation, {
  kind: 'directive.nativeBranchTranscriptAttestation.v1',
  version: 1,
  messageCount: 4,
  lineageHash: assistantEndpoint.lineageHash
});
assert.deepEqual(verifyNativeBranchTranscriptAttestation(parentMessages, attestation), {
  ok: true,
  reasonCode: null
});
assert.equal(
  verifyNativeBranchTranscriptAttestation(hiddenMutation, attestation).reasonCode,
  'native-branch-transcript-attestation-mismatch'
);
assert.equal(
  verifyNativeBranchTranscriptAttestation(parentMessages.slice(0, 3), attestation).reasonCode,
  'native-branch-transcript-attestation-mismatch'
);
assert.equal(
  verifyNativeBranchTranscriptAttestation(parentMessages, { ...attestation, version: 2 }).reasonCode,
  'native-branch-transcript-attestation-invalid'
);

assert.equal(lineage({ parentBinding: null }).reasonCode, 'native-branch-parent-binding-missing');
assert.equal(lineage({
  childBinding: { ...parentBinding, saveId: null, chatId: 'renamed-child', mainChat: 'some-other-chat' }
}).reasonCode, 'native-branch-main-chat-mismatch');
assert.equal(lineage({ childMessages: [...structuredClone(parentMessages), message('user.3', 'user', 'Impossible extra')] }).reasonCode, 'native-branch-child-longer-than-parent');

const fake = createFakeChatAdapter({
  chatId: parentBinding.chatId,
  entityId: parentBinding.entityId,
  entityName: parentBinding.entityName,
  messages: parentMessages
});
const fakeParentBinding = { ...parentBinding, hostId: 'fake' };
await fake.updateBindingMetadata(fakeParentBinding);
fake.createNativeBranch({ endpointIndex: 2, childChatId: 'renamed-child' });
const inspected = await fake.inspectNativeBranchCandidate({ parentBinding: fakeParentBinding });
assert.equal(inspected.ok, true);
assert.equal(inspected.endpointHostMessageId, 'user.2');
assert.deepEqual(fake.calls().slice(-2).map((call) => call.type), ['createNativeBranch', 'inspectNativeBranchCandidate']);

const fakeClone = await fake.cloneCampaignChat({
  sourceChatId: fakeParentBinding.chatId,
  sourceBinding: fakeParentBinding,
  campaignId: fakeParentBinding.campaignId,
  saveId: fakeParentBinding.saveId,
  targetName: 'Immutable fake save',
  open: false
});
assert.equal(fakeClone.transcriptAttestation.messageCount, parentMessages.length);
assert.deepEqual(await fake.verifyCampaignChatSnapshot(fakeClone), { ok: true, reasonCode: null });
const changedFakeClone = fake.messagesForChat(fakeClone.chatId);
changedFakeClone[0].mes = 'Changed after saving.';
fake.setMessagesForChat(fakeClone.chatId, changedFakeClone);
assert.equal(
  (await fake.verifyCampaignChatSnapshot(fakeClone)).reasonCode,
  'native-branch-transcript-attestation-mismatch'
);

const longParent = Array.from({ length: 5000 }, (_, index) => message(
  `long.${index}`,
  index % 2 === 0 ? 'assistant' : 'user',
  `Campaign message ${index}`
));
const longLineage = createNativeBranchLineage({
  parentBinding,
  childBinding: { ...parentBinding, saveId: null, chatId: 'long-child', mainChat: parentBinding.chatId },
  parentMessages: longParent,
  childMessages: structuredClone(longParent.slice(0, 3750)),
  parentBranchNames: ['long-child']
});
assert.equal(longLineage.ok, true);
assert.equal(longLineage.normalizedParentMessages.length, 5000);
assert.equal(longLineage.normalizedChildMessages.length, 3750);
assert.equal(longLineage.endpointHostMessageId, 'long.3749');

console.log('native branch lineage tests passed');
