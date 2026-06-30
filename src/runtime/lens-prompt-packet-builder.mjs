import {
  buildPlayerSafePromptContext,
  buildPlayerSafePromptContextWithContinuityPlanner
} from '../generation/player-safe-prompt-context-builder.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export function createLensPromptInput({
  campaignState = null,
  assets = {},
  promptFrame = {},
  createdAt = null
} = {}) {
  const frame = promptFrame && typeof promptFrame === 'object' ? promptFrame : {};
  return {
    campaignState,
    packageData: assets?.packageData || null,
    crewDataset: assets?.crewDataset || null,
    shipDataset: assets?.shipDataset || null,
    campaignProjection: assets?.projection || null,
    scene: frame.scene || null,
    playerText: frame.playerText || '',
    recentMessageSummary: frame.recentMessageSummary || null,
    recentChatMessages: Array.isArray(frame.recentChatMessages) ? frame.recentChatMessages : [],
    acceptedAssistantVariant: frame.acceptedAssistantVariant || null,
    createdAt
  };
}

export function lensPromptPacketProjectionSummary(packet = null) {
  const projection = packet?.continuityProjection || {};
  const plan = projection.plan || {};
  return {
    revision: Number(packet?.revision || 0) || null,
    blockCount: Array.isArray(packet?.blocks) ? packet.blocks.length : 0,
    contentHash: packet?.contentHash || packet?.hash || null,
    projectionHash: projection.hash || null,
    sourceHash: projection.sourceHash || null,
    selectedFactCount: Array.isArray(plan.selectedFactIds) ? plan.selectedFactIds.length : 0,
    guardedFactCount: Array.isArray(plan.guardFactIds) ? plan.guardFactIds.length : 0,
    auditFactCount: Array.isArray(plan.auditFactIds) ? plan.auditFactIds.length : 0
  };
}

export async function buildLensPromptPacket({
  promptInput = {},
  useContinuityPlanner = false,
  generationRouter = null,
  revision = null,
  cacheKey = null,
  dirtyDomains = [],
  externalPromptEnvironmentRef = null
} = {}) {
  const built = useContinuityPlanner
    ? await buildPlayerSafePromptContextWithContinuityPlanner(promptInput, { generationRouter })
    : buildPlayerSafePromptContext(promptInput);
  return compactObject({
    ...built,
    revision,
    cacheKey,
    externalPromptEnvironmentRef: cloneJson(externalPromptEnvironmentRef || null),
    lensDirtyDomains: cloneJson(Array.isArray(dirtyDomains) ? dirtyDomains : [])
  });
}

