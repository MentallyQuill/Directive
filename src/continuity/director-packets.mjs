import {
  CONTINUITY_VISIBILITY,
  asArray,
  cloneJson,
  compact,
  hashContinuityText
} from './fact-schema.mjs';
import { buildContinuityFactIndex } from './fact-index.mjs';
import { buildContinuitySourceFrame } from './source-frame.mjs';

const DIRECTOR_AUDIENCES = Object.freeze({
  narrator: CONTINUITY_VISIBILITY.narratorSafe,
  missionDirector: CONTINUITY_VISIBILITY.directorOnly,
  crewDirector: CONTINUITY_VISIBILITY.directorOnly,
  shipDirector: CONTINUITY_VISIBILITY.directorOnly,
  commandDirector: CONTINUITY_VISIBILITY.directorOnly,
  narrativeThreadDirector: CONTINUITY_VISIBILITY.directorOnly,
  continuityTracker: CONTINUITY_VISIBILITY.directorOnly,
  contradictionGuard: CONTINUITY_VISIBILITY.narratorSafe,
  diagnostic: CONTINUITY_VISIBILITY.directorOnly
});

function directorTagsFor(audience) {
  if (audience === 'missionDirector') return new Set(['mission', 'quest', 'objective', 'scene']);
  if (audience === 'crewDirector') return new Set(['crew', 'relationship', 'identity']);
  if (audience === 'shipDirector') return new Set(['ship', 'travel', 'location']);
  if (audience === 'commandDirector') return new Set(['command', 'command-bearing', 'directive']);
  if (audience === 'narrativeThreadDirector') return new Set(['thread', 'pressure', 'world']);
  if (audience === 'contradictionGuard') return new Set(['contradiction-guard', 'identity', 'travel', 'ship', 'crew']);
  return null;
}

function matchesAudience(fact, audience) {
  const tags = new Set(asArray(fact?.tags).map((tag) => compact(tag).toLowerCase()));
  const required = directorTagsFor(audience);
  if (!required) return true;
  if (compact(fact?.criticality).toLowerCase() === 'hard') return true;
  for (const tag of tags) {
    if (required.has(tag)) return true;
  }
  return false;
}

export function buildContinuityDirectorPacket({
  audience = 'missionDirector',
  campaignState,
  packageData = null,
  crewDataset = null,
  shipDataset = null,
  campaignProjection = null,
  scene = {},
  playerText = '',
  recentMessageSummary = '',
  recentChatMessages = [],
  acceptedAssistantVariant = null,
  limit = 40
} = {}) {
  if (!campaignState || typeof campaignState !== 'object') throw new Error('campaignState must be an object.');
  const visibilityAudience = DIRECTOR_AUDIENCES[audience] || CONTINUITY_VISIBILITY.directorOnly;
  const sourceFrame = buildContinuitySourceFrame({
    campaignState,
    packageData,
    crewDataset,
    shipDataset,
    campaignProjection,
    scene,
    playerText,
    recentMessageSummary,
    recentChatMessages,
    acceptedAssistantVariant
  });
  const factIndex = buildContinuityFactIndex({
    campaignState,
    packageData,
    crewDataset,
    shipDataset,
    campaignProjection,
    audience: visibilityAudience,
    sourceFrame
  });
  const facts = factIndex.facts
    .filter((fact) => matchesAudience(fact, audience))
    .slice(0, Math.max(1, Number(limit) || 40))
    .map((fact) => ({
      id: fact.id,
      kind: fact.kind,
      subject: fact.subject,
      predicate: fact.predicate,
      summary: fact.render?.director || fact.summary,
      authority: fact.authority,
      authorityRank: fact.authorityRank,
      visibility: fact.visibility,
      criticality: fact.criticality,
      tags: cloneJson(fact.tags || []),
      source: cloneJson(fact.source || null),
      conflictKey: fact.conflictKey
    }));
  const packet = {
    kind: 'directive.continuityDirectorPacket.v1',
    audience,
    visibilityAudience,
    sourceHash: sourceFrame.sourceHash,
    campaignRevision: sourceFrame.revision,
    facts,
    audit: {
      sourceFactCount: factIndex.sourceCount,
      selectedFactCount: facts.length,
      conflictCount: factIndex.conflicts.length,
      blockedByAudienceCount: factIndex.rejected.length
    }
  };
  packet.hash = hashContinuityText(packet);
  return packet;
}

export function buildContinuityDirectorPackets(input = {}) {
  const audiences = asArray(input.audiences).length
    ? input.audiences
    : ['missionDirector', 'crewDirector', 'shipDirector', 'commandDirector', 'narrativeThreadDirector', 'contradictionGuard'];
  return Object.fromEntries(audiences.map((audience) => [
    audience,
    buildContinuityDirectorPacket({ ...input, audience })
  ]));
}

export function compactContinuityDirectorPacket(packet = null) {
  if (!packet || typeof packet !== 'object') return null;
  return {
    kind: 'directive.continuityDirectorPacketDigest.v1',
    audience: packet.audience || null,
    visibilityAudience: packet.visibilityAudience || null,
    sourceHash: packet.sourceHash || null,
    hash: packet.hash || null,
    selectedFactCount: asArray(packet.facts).length,
    selectedFactIdHashes: asArray(packet.facts).map((fact) => hashContinuityText(fact?.id || '')),
    criticalFactCount: asArray(packet.facts).filter((fact) => ['hard', 'critical'].includes(String(fact?.criticality || '').toLowerCase())).length,
    conflictCount: Number(packet.audit?.conflictCount || 0),
    blockedByAudienceCount: Number(packet.audit?.blockedByAudienceCount || 0),
    campaignRevision: packet.campaignRevision ?? null
  };
}

export const __continuityDirectorPacketsTestHooks = Object.freeze({
  matchesAudience,
  directorTagsFor
});
