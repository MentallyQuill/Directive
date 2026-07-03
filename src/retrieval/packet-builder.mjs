import {
  buildRecallIndexEntriesFromDirectorDatasets,
  indexDirectorDatasets
} from './dataset-index.mjs';
import { evaluateCardForAudience } from './gate-evaluator.mjs';
import { collectRecallCandidates, narratorHintCardIds } from './recall-lanes.mjs';
import { createRetrievalJournal, createRetrievalRunId } from './run-journal.mjs';
import { hydrateDirectorCards } from './card-hydration.mjs';
import { createRecallQuery, queryRecallIndex } from './recall-index.mjs';

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

function mergeRecallEntries(...sources) {
  const out = [];
  const seen = new Set();
  for (const source of sources) {
    for (const entry of Array.isArray(source) ? source : []) {
      const key = entry?.id || entry?.hash || entry?.textHash || entry?.metadataHash;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(cloneJson(entry));
    }
  }
  return out;
}

function compact(value = '') {
  return String(value ?? '').trim();
}

function recallKeywordsFor(sceneSnapshot = {}, intentParse = {}) {
  return unique([
    sceneSnapshot.activePhaseId,
    sceneSnapshot.phaseId,
    sceneSnapshot.locationId,
    intentParse.primaryIntent,
    ...(Array.isArray(intentParse.targetIds) ? intentParse.targetIds : []),
    ...(Array.isArray(sceneSnapshot.relevantLocationIds) ? sceneSnapshot.relevantLocationIds : []),
    ...(Array.isArray(sceneSnapshot.relevantSystemIds) ? sceneSnapshot.relevantSystemIds : [])
  ].map(compact).filter((value) => value.length >= 3));
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
  coreRecallEntries = [],
  audiences = DIRECTOR_RETRIEVAL_AUDIENCES
} = {}) {
  const index = indexDirectorDatasets({ crewDataset, shipDataset, missionGraph });
  const packageRecallEntries = buildRecallIndexEntriesFromDirectorDatasets({
    crewDataset,
    shipDataset,
    missionGraph,
    campaignId: sceneSnapshot.campaignId || campaignState?.campaign?.id || null,
    saveId: campaignState?.campaignChatBinding?.saveId || campaignState?.saveId || null
  });
  const recallEntries = mergeRecallEntries(coreRecallEntries, packageRecallEntries);
  const runId = createRetrievalRunId({ turnId, outcomeId, sceneSnapshot, intentParse });
  const narratorHints = narratorHintCardIds({ sceneSnapshot, intentParse });
  const packets = {};
  const candidateIdsByAudience = {};
  const selectedByAudience = {};
  const blockedByAudience = {};
  const recallByAudience = {};

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
    const recallQuery = createRecallQuery({
      campaignId: sceneSnapshot.campaignId || campaignState?.campaign?.id || null,
      saveId: campaignState?.campaignChatBinding?.saveId || campaignState?.saveId || null,
      branchId: campaignState?.branchId || 'main',
      actorIds: sceneSnapshot.presentCharacters || [],
      locationId: sceneSnapshot.locationId || null,
      missionId: sceneSnapshot.missionId || sceneSnapshot.activeMissionId || null,
      phaseId: sceneSnapshot.activePhaseId || sceneSnapshot.phaseId || null,
      retrievalModes: ['deterministic', 'sceneSeal', 'reviewedImport', 'package'],
      audience,
      keywords: recallKeywordsFor(sceneSnapshot, intentParse),
      limit: audience === 'narrator' ? 8 : 12
    });
    const recallResult = queryRecallIndex({
      entries: recallEntries,
      query: recallQuery
    });
    packets[audience] = {
      audience,
      runId,
      cardIds: packet.cardIds,
      hydratedCards: hydration.cards,
      omittedHydrationCardIds: hydration.omittedCardIds,
      recallRefs: recallResult.includedRefs
    };
    recallByAudience[audience] = {
      queryHash: recallResult.queryHash,
      recallIndexRevision: recallResult.recallIndexRevision,
      includedRefs: recallResult.includedRefs,
      omittedRefs: recallResult.omittedRefs,
      trace: recallResult.trace
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
      blockedByAudience,
      recallIndex: {
        entryCount: recallEntries.length,
        byAudience: recallByAudience
      }
    },
    journal
  };
}
