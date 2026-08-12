import {
  hashStableJson,
  normalizeV1HostMessageVisibility
} from './v1-host-message-contracts.mjs';

const NATIVE_BRANCH_TRANSCRIPT_ATTESTATION_KIND = 'directive.nativeBranchTranscriptAttestation.v1';

function nonEmptyString(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function failed(reasonCode) {
  return { ok: false, reasonCode };
}

function selectedText(message = {}) {
  const swipes = Array.isArray(message.swipes) ? message.swipes : null;
  const selected = Number.isInteger(message.swipe_id) ? message.swipe_id : null;
  if (swipes && selected !== null && selected >= 0 && selected < swipes.length) {
    return String(swipes[selected] ?? '');
  }
  return String(message.mes ?? message.text ?? message.content ?? '');
}

function messageRole(message = {}) {
  if (message.is_user === true || message.isUser === true || message.role === 'user') return 'user';
  if (message.is_system === true || message.isSystem === true || message.role === 'system') return 'system';
  return 'assistant';
}

export function normalizeNativeBranchMessage(message = {}, index = null) {
  const hostMessageId = nonEmptyString(
    message.hostMessageId
    ?? message.id
    ?? message.messageId
    ?? message.message_id
    ?? message.uuid
    ?? message.extra?.messageId
  ) || (Number.isInteger(index) ? String(index) : null);
  const text = selectedText(message);
  const selectedSwipeId = Array.isArray(message.swipes)
    ? String(Number.isInteger(message.swipe_id) ? message.swipe_id : 0)
    : null;
  return {
    hostMessageId,
    role: messageRole(message),
    selectedSwipeId,
    text,
    textHash: hashStableJson({ text }),
    visibility: normalizeV1HostMessageVisibility(message)
  };
}

function normalizeNativeBranchTranscript(messages = []) {
  return messages.map(normalizeNativeBranchMessage);
}

export function createNativeBranchTranscriptAttestation(messages = []) {
  if (!Array.isArray(messages)) throw new TypeError('Native branch transcript messages must be an array.');
  const normalizedMessages = normalizeNativeBranchTranscript(messages);
  return {
    kind: NATIVE_BRANCH_TRANSCRIPT_ATTESTATION_KIND,
    version: 1,
    messageCount: normalizedMessages.length,
    lineageHash: hashStableJson(normalizedMessages)
  };
}

export function verifyNativeBranchTranscriptAttestation(messages = [], attestation = null) {
  if (!Array.isArray(messages)
    || !attestation
    || attestation.kind !== NATIVE_BRANCH_TRANSCRIPT_ATTESTATION_KIND
    || attestation.version !== 1
    || !Number.isInteger(attestation.messageCount)
    || attestation.messageCount < 0
    || !/^[0-9a-f]{16}$/.test(String(attestation.lineageHash || ''))) {
    return failed('native-branch-transcript-attestation-invalid');
  }
  const actual = createNativeBranchTranscriptAttestation(messages);
  if (actual.messageCount !== attestation.messageCount || actual.lineageHash !== attestation.lineageHash) {
    return failed('native-branch-transcript-attestation-mismatch');
  }
  return { ok: true, reasonCode: null };
}

function sameBindingAuthority(parentBinding, childBinding) {
  return ['hostId', 'campaignId', 'entityType', 'entityId', 'entityName'].every((key) => {
    const parentValue = nonEmptyString(parentBinding?.[key]);
    const childValue = nonEmptyString(childBinding?.[key]);
    return Boolean(parentValue && childValue && parentValue === childValue);
  });
}

function sameMessage(left, right) {
  return left.hostMessageId === right.hostMessageId
    && left.role === right.role
    && left.selectedSwipeId === right.selectedSwipeId
    && left.textHash === right.textHash
    && hashStableJson(left.visibility) === hashStableJson(right.visibility);
}

export function createNativeBranchLineage(input = {}) {
  const parentBinding = input.parentBinding;
  const childBinding = input.childBinding;
  if (!parentBinding || typeof parentBinding !== 'object') return failed('native-branch-parent-binding-missing');
  if (!childBinding || typeof childBinding !== 'object') return failed('native-branch-child-binding-missing');

  const parentChatId = nonEmptyString(parentBinding.chatId);
  const childChatId = nonEmptyString(childBinding.chatId);
  if (!parentChatId) return failed('native-branch-parent-chat-missing');
  if (!childChatId) return failed('native-branch-child-chat-missing');
  if (nonEmptyString(childBinding.mainChat) !== parentChatId) return failed('native-branch-main-chat-mismatch');
  if (!sameBindingAuthority(parentBinding, childBinding)) return failed('native-branch-entity-mismatch');

  const parentBranchNames = Array.isArray(input.parentBranchNames)
    ? input.parentBranchNames.map(nonEmptyString).filter(Boolean)
    : [];
  const branchIntent = input.branchIntent;
  const parentLinkProvesLineage = parentBranchNames.includes(childChatId);
  const hostIntentProvesLineage = branchIntent?.kind === 'directive.nativeBranchIntent.v1'
    && nonEmptyString(branchIntent.parentChatId) === parentChatId;
  if (!parentLinkProvesLineage && !hostIntentProvesLineage) return failed('native-branch-parent-link-missing');

  const parentMessages = Array.isArray(input.parentMessages) ? input.parentMessages : null;
  const childMessages = Array.isArray(input.childMessages) ? input.childMessages : null;
  if (!parentMessages) return failed('native-branch-parent-transcript-missing');
  if (!childMessages || childMessages.length === 0) return failed('native-branch-child-transcript-missing');
  if (childMessages.length > parentMessages.length) return failed('native-branch-child-longer-than-parent');

  const normalizedParentMessages = normalizeNativeBranchTranscript(parentMessages);
  const normalizedChildMessages = normalizeNativeBranchTranscript(childMessages);
  for (let index = 0; index < normalizedChildMessages.length; index += 1) {
    if (!sameMessage(normalizedParentMessages[index], normalizedChildMessages[index])) {
      return failed('native-branch-transcript-mismatch');
    }
  }

  const endpoint = normalizedChildMessages.at(-1);
  if (!endpoint?.hostMessageId) return failed('native-branch-endpoint-id-missing');
  if (!parentLinkProvesLineage
    && nonEmptyString(branchIntent.endpointHostMessageId) !== endpoint.hostMessageId) {
    return failed('native-branch-intent-endpoint-mismatch');
  }
  return {
    ok: true,
    reasonCode: null,
    parentBinding: structuredClone(parentBinding),
    childBinding: structuredClone(childBinding),
    parentMessages: structuredClone(parentMessages),
    childMessages: structuredClone(childMessages),
    normalizedParentMessages,
    normalizedChildMessages,
    endpointHostMessageId: endpoint.hostMessageId,
    endpointRole: endpoint.role,
    lineageProof: parentLinkProvesLineage ? 'parent-reciprocal-link' : 'host-branch-intent',
    verifiedBranchIntent: hostIntentProvesLineage ? structuredClone(branchIntent) : null,
    lineageHash: hashStableJson(normalizedChildMessages)
  };
}
