import { normalizePhaseId } from './dataset-index.mjs';
import { countBlockedReasons, countByAudience } from './diagnostics.mjs';

function stableString(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableString).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableString(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value) {
  const text = stableString(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function safeSegment(value) {
  return String(value || 'none')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'none';
}

export function createRetrievalRunId({ turnId = null, outcomeId = null, sceneSnapshot = {}, intentParse = {} } = {}) {
  const basis = outcomeId || turnId || `${normalizePhaseId(sceneSnapshot)}:${intentParse.primaryIntent || 'unknown'}`;
  return `retrieval.${safeSegment(basis)}.${safeSegment(normalizePhaseId(sceneSnapshot))}.${safeSegment(intentParse.primaryIntent || 'unknown')}`;
}

export function createRetrievalJournal({
  runId,
  turnId = null,
  outcomeId = null,
  sceneSnapshot = {},
  intentParse = {},
  candidateIdsByAudience = {},
  blockedByAudience = {},
  selectedByAudience = {},
  providerStatus = 'not-used'
} = {}) {
  const blockedCountsByAudience = {};
  const blockedCountsByReason = {};
  for (const [audience, blocked] of Object.entries(blockedByAudience || {})) {
    blockedCountsByAudience[audience] = countBlockedReasons(blocked);
    for (const [reason, count] of Object.entries(blockedCountsByAudience[audience])) {
      blockedCountsByReason[reason] = (blockedCountsByReason[reason] || 0) + count;
    }
  }

  return {
    runId,
    turnId,
    outcomeId,
    packageId: sceneSnapshot.packageId || null,
    campaignId: sceneSnapshot.campaignId || null,
    missionId: sceneSnapshot.missionId || sceneSnapshot.activeMissionId || null,
    phaseId: normalizePhaseId(sceneSnapshot),
    primaryIntent: intentParse.primaryIntent || null,
    sceneSnapshotHash: stableHash({
      campaignId: sceneSnapshot.campaignId,
      missionId: sceneSnapshot.missionId || sceneSnapshot.activeMissionId,
      phaseId: normalizePhaseId(sceneSnapshot),
      stardate: sceneSnapshot.stardate,
      presentCharacters: sceneSnapshot.presentCharacters || [],
      knownFactIds: sceneSnapshot.knownFactIds || [],
      activeDecisionPointIds: sceneSnapshot.activeDecisionPointIds || [],
      simulationMode: sceneSnapshot.simulationMode || null,
      playerInput: sceneSnapshot.playerInput || ''
    }),
    candidateCountsByAudience: countByAudience(candidateIdsByAudience),
    selectedCountsByAudience: countByAudience(selectedByAudience),
    selectedCardIdsByAudience: selectedByAudience,
    blockedCountsByAudience,
    blockedCountsByReason,
    providerStatus,
    packetHashesByAudience: Object.fromEntries(
      Object.entries(selectedByAudience || {}).map(([audience, cardIds]) => [audience, stableHash(cardIds || [])])
    )
  };
}
