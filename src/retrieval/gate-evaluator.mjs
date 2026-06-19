import { normalizeMissionId } from './dataset-index.mjs';

export const KNOWLEDGE_RANK = Object.freeze({
  none: 0,
  serviceRecord: 1,
  professionalConversation: 2,
  highTrust: 3,
  crisisDisclosure: 3,
  revealed: 4
});

function primaryCharacter(card) {
  return (card?.scope?.characters || []).find((id) => id !== 'player-commander') || '';
}

function relationshipForCharacter(sceneSnapshot = {}, campaignState = {}, characterId) {
  if (!characterId) {
    return {};
  }
  const sceneRelationship = sceneSnapshot.relationships?.[characterId];
  if (sceneRelationship) {
    return sceneRelationship;
  }
  return (campaignState.relationships?.seniorCrew || []).find((item) => item.crewId === characterId) || {};
}

function developmentForCharacter(sceneSnapshot = {}, campaignState = {}, characterId) {
  if (!characterId) {
    return {};
  }
  const sceneDevelopment = sceneSnapshot.development?.[characterId];
  if (sceneDevelopment) {
    return sceneDevelopment;
  }
  return (campaignState.crewDevelopment?.seniorCrew || []).find((item) => item.crewId === characterId) || {};
}

function knownFactIds(sceneSnapshot = {}, campaignState = {}) {
  return new Set([
    ...(sceneSnapshot.knownFactIds || []),
    ...(sceneSnapshot.revealedFactIds || []),
    ...(campaignState.mission?.knownFacts || []),
    ...(campaignState.retrieval?.revealedFactIds || [])
  ].filter(Boolean));
}

function committedOutcomeIds(campaignState = {}) {
  return new Set([
    ...(campaignState.turnLedger?.entries || []).map((entry) => entry.outcomeId),
    ...(campaignState.retrieval?.committedOutcomeIds || [])
  ].filter(Boolean));
}

function defaultKnowledgeForCard(card) {
  if (card?.visibility === 'publicPackage') {
    return 'serviceRecord';
  }
  if (card?.visibility === 'playerKnown') {
    return 'professionalConversation';
  }
  return 'none';
}

function knowledgeForCard(card, sceneSnapshot = {}) {
  const characterId = primaryCharacter(card);
  if (sceneSnapshot.playerKnowledgeByCharacter && Object.hasOwn(sceneSnapshot.playerKnowledgeByCharacter, characterId)) {
    return sceneSnapshot.playerKnowledgeByCharacter[characterId] || 'none';
  }
  return defaultKnowledgeForCard(card);
}

export function scopeMatches(card, sceneSnapshot = {}, options = {}) {
  const present = new Set([
    ...(sceneSnapshot.presentCharacters || []),
    ...(options.implicatedCharacterIds || [])
  ].filter(Boolean));
  const implicatedCardIds = new Set(options.implicatedCardIds || []);
  const scopedCharacters = card.scope?.characters || [];
  if (!implicatedCardIds.has(card.id) && scopedCharacters.length && !scopedCharacters.some((id) => present.has(id))) {
    return { ok: false, reason: 'characterScope' };
  }

  const scopedMissions = card.scope?.missions || [];
  const missionId = normalizeMissionId(sceneSnapshot);
  if (scopedMissions.length && !scopedMissions.includes(missionId)) {
    return { ok: false, reason: 'missionScope' };
  }

  const scopedCampaigns = card.scope?.campaigns || [];
  if (scopedCampaigns.length && !scopedCampaigns.includes(sceneSnapshot.campaignId)) {
    return { ok: false, reason: 'campaignScope' };
  }

  const stardate = Number(sceneSnapshot.stardate);
  if (Number.isFinite(Number(card.scope?.stardateFrom)) && stardate < Number(card.scope.stardateFrom)) {
    return { ok: false, reason: 'stardateScope' };
  }
  if (Number.isFinite(Number(card.scope?.stardateTo)) && stardate > Number(card.scope.stardateTo)) {
    return { ok: false, reason: 'stardateScope' };
  }

  return { ok: true, reason: '' };
}

export function gateMatches(card, sceneSnapshot = {}, campaignState = {}) {
  const gates = card.gates || {};
  const requiredKnowledge = gates.playerKnowledge || 'none';
  const currentKnowledge = knowledgeForCard(card, sceneSnapshot);
  if ((KNOWLEDGE_RANK[currentKnowledge] ?? 0) < (KNOWLEDGE_RANK[requiredKnowledge] ?? 0)) {
    return { ok: false, reason: 'knowledgeGate' };
  }

  const characterId = primaryCharacter(card);
  if (gates.relationshipMin && characterId) {
    const relationship = relationshipForCharacter(sceneSnapshot, campaignState, characterId);
    for (const [dimension, minimum] of Object.entries(gates.relationshipMin)) {
      if ((Number(relationship[dimension]) || 0) < Number(minimum)) {
        return { ok: false, reason: 'relationshipGate' };
      }
    }
  }

  if (gates.developmentMin && characterId) {
    const development = developmentForCharacter(sceneSnapshot, campaignState, characterId);
    for (const [dimension, minimum] of Object.entries(gates.developmentMin)) {
      const actual = development[dimension];
      if (typeof minimum === 'number' && (Number(actual) || 0) < minimum) {
        return { ok: false, reason: 'developmentGate' };
      }
      if (typeof minimum === 'string' && actual !== minimum) {
        return { ok: false, reason: 'developmentGate' };
      }
    }
  }

  const facts = knownFactIds(sceneSnapshot, campaignState);
  for (const factId of gates.requiresRevealedFactIds || []) {
    if (!facts.has(factId)) {
      return { ok: false, reason: 'revealedFactGate' };
    }
  }
  for (const factId of gates.blocksUntilFactIds || []) {
    if (!facts.has(factId)) {
      return { ok: false, reason: 'blockedUntilFact' };
    }
  }

  const outcomes = committedOutcomeIds(campaignState);
  for (const outcomeId of gates.requiresOutcomeIds || []) {
    if (!outcomes.has(outcomeId)) {
      return { ok: false, reason: 'outcomeGate' };
    }
  }

  return { ok: true, reason: '' };
}

export function audienceSafetyMatches(card, audience) {
  if (!card.audiences?.includes(audience)) {
    return { ok: false, reason: 'wrongAudience', selectedCandidate: false };
  }
  if (audience === 'narrator') {
    if (card.visibility === 'directorOnly' || card.visibility === 'lockedHidden') {
      return { ok: false, reason: 'hiddenVisibility', selectedCandidate: true };
    }
    if (card.payload?.narratorSafe !== true) {
      return { ok: false, reason: 'narratorUnsafe', selectedCandidate: true };
    }
  }
  if (audience === 'commandLog' && card.visibility === 'lockedHidden') {
    return { ok: false, reason: 'hiddenVisibility', selectedCandidate: true };
  }
  return { ok: true, reason: '', selectedCandidate: true };
}

export function evaluateCardForAudience(card, audience, sceneSnapshot = {}, campaignState = {}, options = {}) {
  const safety = audienceSafetyMatches(card, audience);
  if (!safety.selectedCandidate) {
    return { ok: false, reason: safety.reason, selectedCandidate: false };
  }

  const scope = scopeMatches(card, sceneSnapshot, options);
  if (!scope.ok) {
    return { ok: false, reason: scope.reason, selectedCandidate: true };
  }

  const gate = gateMatches(card, sceneSnapshot, campaignState);
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, selectedCandidate: true };
  }

  if (!safety.ok) {
    return { ok: false, reason: safety.reason, selectedCandidate: true };
  }

  return { ok: true, reason: '', selectedCandidate: true };
}
