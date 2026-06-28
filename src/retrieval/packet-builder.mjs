import { indexDirectorDatasets } from './dataset-index.mjs';
import { evaluateCardForAudience } from './gate-evaluator.mjs';
import { collectRecallCandidates, narratorHintCardIds } from './recall-lanes.mjs';
import { createRetrievalJournal, createRetrievalRunId } from './run-journal.mjs';
import { hydrateDirectorCards } from './card-hydration.mjs';

export const DIRECTOR_RETRIEVAL_AUDIENCES = Object.freeze([
  'missionDirector',
  'crewDirector',
  'shipDirector',
  'commandDirector',
  'narrator',
  'commandLog'
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function cardIdsFromCandidates(candidates = []) {
  return candidates.map((candidate) => candidate.cardId).filter(Boolean);
}

function narratorCandidateAllowed(candidate = {}, allowedHintIds = new Set()) {
  if (allowedHintIds.has(candidate.cardId)) return true;
  const card = candidate.card || {};
  if (!card.type?.startsWith('ship.')) return false;
  if (card.payload?.narratorSafe !== true) return false;
  return (candidate.lanes || []).some((lane) => (
    String(lane).startsWith('keyword:')
    || String(lane).startsWith('scope:location:')
    || String(lane).includes(':required')
  ));
}

function buildPacket({ audience, candidates, sceneSnapshot, campaignState, implicatedCardIds = [], maxCards = 12 }) {
  const selected = [];
  const blocked = [];
  const seen = new Set();

  for (const candidate of candidates || []) {
    if (!candidate?.card || seen.has(candidate.cardId)) {
      continue;
    }
    seen.add(candidate.cardId);
    const evaluation = evaluateCardForAudience(candidate.card, audience, sceneSnapshot, campaignState, {
      implicatedCardIds
    });
    if (evaluation.ok) {
      selected.push(candidate.cardId);
    } else if (evaluation.selectedCandidate) {
      blocked.push({
        id: candidate.cardId,
        reason: evaluation.reason,
        lanes: cloneJson(candidate.lanes || [])
      });
    }
    if (selected.length >= maxCards) {
      break;
    }
  }

  return {
    audience,
    cardIds: selected,
    blocked,
    candidateCardIds: cardIdsFromCandidates(candidates)
  };
}

export function buildAudienceGateReport({ cards = [], sceneSnapshot = {}, campaignState = {}, audiences = [] } = {}) {
  const selectedByAudience = {};
  const blockedByAudience = {};
  for (const audience of audiences || sceneSnapshot.audiences || []) {
    selectedByAudience[audience] = [];
    blockedByAudience[audience] = [];
  }

  for (const card of cards || []) {
    for (const audience of Object.keys(selectedByAudience)) {
      const evaluation = evaluateCardForAudience(card, audience, sceneSnapshot, campaignState);
      if (evaluation.ok) {
        selectedByAudience[audience].push(card.id);
      } else if (evaluation.selectedCandidate) {
        blockedByAudience[audience].push({ id: card.id, reason: evaluation.reason });
      }
    }
  }

  return { selectedByAudience, blockedByAudience };
}

export function runDirectorRetrieval({
  crewDataset = {},
  shipDataset = {},
  missionGraph = {},
  sceneSnapshot = {},
  campaignState = {},
  intentParse = {},
  turnId = null,
  outcomeId = null,
  audiences = DIRECTOR_RETRIEVAL_AUDIENCES
} = {}) {
  const index = indexDirectorDatasets({ crewDataset, shipDataset, missionGraph });
  const runId = createRetrievalRunId({ turnId, outcomeId, sceneSnapshot, intentParse });
  const narratorHints = narratorHintCardIds({ sceneSnapshot, intentParse });
  const packets = {};
  const candidateIdsByAudience = {};
  const selectedByAudience = {};
  const blockedByAudience = {};

  for (const audience of audiences) {
    let candidates = collectRecallCandidates({ index, sceneSnapshot, intentParse, audience });
    if (audience === 'narrator') {
      const allowedHintIds = new Set(narratorHints);
      const hintOrder = new Map(narratorHints.map((cardId, index) => [cardId, index]));
      candidates = candidates
        .filter((candidate) => narratorCandidateAllowed(candidate, allowedHintIds))
        .sort((left, right) => {
          const leftHint = hintOrder.has(left.cardId) ? hintOrder.get(left.cardId) : 1000;
          const rightHint = hintOrder.has(right.cardId) ? hintOrder.get(right.cardId) : 1000;
          if (leftHint !== rightHint) return leftHint - rightHint;
          if (right.score !== left.score) return right.score - left.score;
          return left.cardId.localeCompare(right.cardId);
        });
    }
    const packet = buildPacket({
      audience,
      candidates,
      sceneSnapshot,
      campaignState,
      implicatedCardIds: audience === 'narrator' ? narratorHints : [],
      maxCards: audience === 'narrator' ? 8 : 12
    });
    const hydration = hydrateDirectorCards({
      index,
      cardIds: packet.cardIds,
      audience
    });
    packets[audience] = {
      audience,
      runId,
      cardIds: packet.cardIds,
      hydratedCards: hydration.cards,
      omittedHydrationCardIds: hydration.omittedCardIds
    };
    candidateIdsByAudience[audience] = unique(packet.candidateCardIds);
    selectedByAudience[audience] = cloneJson(packet.cardIds);
    blockedByAudience[audience] = cloneJson(packet.blocked);
  }

  const journal = createRetrievalJournal({
    runId,
    turnId,
    outcomeId,
    sceneSnapshot,
    intentParse,
    candidateIdsByAudience,
    blockedByAudience,
    selectedByAudience,
    providerStatus: 'not-used'
  });

  return {
    kind: 'directive.directorRetrievalRun',
    runId,
    packets,
    diagnostics: {
      candidateIdsByAudience,
      blockedByAudience
    },
    journal
  };
}
