import { hashStableJson } from './architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compactString(value) {
  return String(value ?? '').trim();
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => (
    entry !== undefined
    && entry !== null
    && entry !== ''
    && !(Array.isArray(entry) && entry.length === 0)
  )));
}

function promptKeysFromPacket(packet = null, installed = null) {
  if (Array.isArray(installed?.promptKeys)) {
    return installed.promptKeys.map(compactString).filter(Boolean);
  }
  if (!Array.isArray(packet?.blocks)) return [];
  return packet.blocks
    .map((block) => compactString(block?.promptKey))
    .filter(Boolean);
}

function directivePromptKeys(promptKeys = []) {
  return promptKeys.filter((key) => key.startsWith('directive.'));
}

function safeExternalPromptEnvironmentRef(ref = null) {
  if (!ref || typeof ref !== 'object') return null;
  return compactObject({
    kind: compactString(ref.kind) || 'directive.externalPromptEnvironmentRef.v1',
    hash: compactString(ref.hash) || null,
    status: compactString(ref.status) || null,
    observedAt: ref.observedAt || null,
    byteLength: Number.isFinite(Number(ref.byteLength)) ? Number(ref.byteLength) : null,
    knownExternalPromptKeyCount: Array.isArray(ref.knownExternalPromptKeys)
      ? ref.knownExternalPromptKeys.length
      : null,
    knownExternalPromptKeyHash: Array.isArray(ref.knownExternalPromptKeys)
      ? hashStableJson(ref.knownExternalPromptKeys.map(compactString).filter(Boolean).sort())
      : null
  });
}

export function createLensPromptRevisionRecord({
  packet = null,
  installed = null,
  status = 'active',
  lane = null,
  installedAt = null,
  cacheKey = null,
  dirtyDomains = [],
  externalPromptEnvironmentRef = null,
  promptBudgetTraceRef = null,
  promptBudgetEnforcement = null
} = {}) {
  const revision = Number(
    packet?.revision
    || installed?.directiveOwnedRevision
    || installed?.revision
    || 0
  ) || 0;
  const promptHash = compactString(
    packet?.hash
    || packet?.contentHash
    || installed?.promptHash
    || installed?.packetHash
    || ''
  ) || null;
  const promptKeys = promptKeysFromPacket(packet, installed);
  const directiveKeys = directivePromptKeys(promptKeys);
  const record = compactObject({
    kind: 'directive.lensPromptRevisionRecord.v1',
    status: compactString(status) || 'active',
    lane: compactString(lane || installed?.lane) || null,
    revision,
    hash: promptHash,
    packetHash: promptHash,
    blockCount: Array.isArray(packet?.blocks)
      ? packet.blocks.length
      : (Number.isFinite(Number(installed?.blockCount)) ? Number(installed.blockCount) : null),
    promptKeyCount: promptKeys.length || null,
    promptKeyHash: promptKeys.length ? hashStableJson(promptKeys) : null,
    directiveOwnedPromptKeyCount: directiveKeys.length || null,
    directiveOwnedPromptKeyHash: directiveKeys.length ? hashStableJson(directiveKeys) : null,
    cacheKey: compactString(cacheKey || installed?.cacheKey) || null,
    dirtyDomains: Array.isArray(dirtyDomains) ? dirtyDomains.map(compactString).filter(Boolean).sort() : [],
    externalPromptEnvironmentRef: safeExternalPromptEnvironmentRef(
      externalPromptEnvironmentRef || installed?.externalPromptEnvironmentRef || null
    ),
    promptBudgetTraceRef: promptBudgetTraceRef || installed?.promptBudgetTraceRef || null,
    promptBudgetEnforcement: promptBudgetEnforcement || installed?.promptBudgetEnforcement || null,
    installedAt: installedAt || installed?.installedAt || null
  });
  record.recordHash = hashStableJson(record);
  return record;
}

export function applyLensPromptRevisionRecord(campaignState = null, record = null) {
  if (!campaignState || typeof campaignState !== 'object' || !record) return cloneJson(campaignState);
  const next = cloneJson(campaignState);
  next.directiveRuntimeEvidence = {
    ...cloneJson(next.directiveRuntimeEvidence || {}),
    lensPromptRevisionRecord: cloneJson(record)
  };
  if (next.campaignChatBinding) {
    next.campaignChatBinding.promptContextRevision = Number(record.revision || 0);
    next.campaignChatBinding.promptContextHash = record.hash || record.packetHash || null;
  }
  next.runtimeResume = {
    ...cloneJson(next.runtimeResume || {}),
    promptContextRevision: Number(record.revision || 0) || next.runtimeResume?.promptContextRevision || null,
    externalPromptEnvironmentRef: cloneJson(record.externalPromptEnvironmentRef || next.runtimeResume?.externalPromptEnvironmentRef || null)
  };
  return next;
}
