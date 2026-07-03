import {
  normalizeRecallIndexEntry
} from './recall-index.mjs';
import { hashStableJson } from '../runtime/architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function byId(items = []) {
  return new Map((items || []).filter((item) => item?.id).map((item) => [item.id, item]));
}

function datasetCards(dataset = {}, datasetKind = 'dataset') {
  return cloneJson(dataset.cards || []).map((card) => ({
    ...card,
    datasetKind
  }));
}

function array(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function firstString(values = []) {
  return array(values).find((value) => typeof value === 'string' && value.trim()) || null;
}

function retrievalPriorityNumber(value = 'normal') {
  const priority = String(value || 'normal').toLowerCase();
  if (priority === 'critical') return 100;
  if (priority === 'high') return 80;
  if (priority === 'normal') return 60;
  if (priority === 'low') return 30;
  return 50;
}

function recallSubjectIdsForCard(card = {}) {
  return [
    card.id,
    card.type,
    ...(card.retrieval?.lanes || []),
    ...(card.scope?.systems || [])
  ].filter(Boolean);
}

export function buildRecallIndexEntriesFromDirectorDatasets({
  crewDataset = {},
  shipDataset = {},
  missionGraph = {},
  campaignId = null,
  saveId = null,
  branchId = 'main'
} = {}) {
  const cards = [
    ...datasetCards(crewDataset, 'crew'),
    ...datasetCards(shipDataset, 'ship')
  ];
  const missionId = missionGraph?.id || firstString(missionGraph?.scope?.missions);
  return cards
    .filter((card) => card?.id && card?.retrieval)
    .map((card) => {
      const scope = card.scope || {};
      const retrieval = card.retrieval || {};
      const effectiveCampaignId = campaignId || firstString(scope.campaigns) || missionGraph?.campaignId || null;
      const effectiveMissionIds = array(scope.missions || missionId);
      return normalizeRecallIndexEntry({
        id: `package-recall:${card.id}`,
        campaignId: effectiveCampaignId,
        saveId,
        branchId,
        authority: 'package',
        sourceFrameRef: null,
        coreEventRefs: [],
        sceneSealRef: null,
        phaseId: firstString(retrieval.phases || retrieval.phaseIds),
        sceneId: firstString(retrieval.scenes || retrieval.sceneIds),
        locationId: firstString(scope.locations),
        actorIds: array(scope.characters),
        subjectIds: recallSubjectIdsForCard(card),
        threadIds: array(scope.threads),
        missionIds: effectiveMissionIds,
        tags: array(retrieval.lanes),
        keywords: array(retrieval.keywords),
        retrieval: {
          mode: retrieval.mode || 'package',
          priority: retrievalPriorityNumber(retrieval.priority),
          audience: array(retrieval.audience || retrieval.audiences || card.audiences),
          knownBy: array(retrieval.knownBy || scope.characters),
          sourceAuthority: retrieval.sourceAuthority || 'package',
          ragHints: {
            cardId: card.id,
            cardType: card.type || null,
            datasetKind: card.datasetKind || null,
            lanes: array(retrieval.lanes),
            source: card.source || null
          }
        },
        textHash: hashStableJson({
          id: card.id,
          summary: card.payload?.summary || '',
          constraints: card.payload?.constraints || [],
          hardAnchors: card.payload?.hardAnchors || []
        }),
        preview: card.payload?.summary || card.title || card.id,
        metadataHash: hashStableJson({
          id: card.id,
          type: card.type || null,
          retrieval,
          scope
        })
      });
    });
}

const PHASE_ALIASES = Object.freeze({
  'ready-room-handoff': 'ready-room-handover'
});

export function normalizePhaseId(sceneSnapshot = {}) {
  const phaseId = sceneSnapshot.activePhaseId || sceneSnapshot.phaseId || sceneSnapshot.phase || null;
  return PHASE_ALIASES[phaseId] || phaseId;
}

export function normalizeMissionId(sceneSnapshot = {}) {
  return sceneSnapshot.missionId || sceneSnapshot.activeMissionId || null;
}

export function indexDirectorDatasets({ crewDataset = {}, shipDataset = {}, missionGraph = {} } = {}) {
  const cards = [
    ...datasetCards(crewDataset, 'crew'),
    ...datasetCards(shipDataset, 'ship')
  ];
  const cardsById = byId(cards);
  const hooks = cloneJson(missionGraph.retrievalHooks || []);
  return {
    crewDataset: cloneJson(crewDataset),
    shipDataset: cloneJson(shipDataset),
    missionGraph: cloneJson(missionGraph),
    cards,
    cardsById,
    hooks,
    hooksByPhase: new Map(hooks.filter((hook) => hook?.phaseId).map((hook) => [hook.phaseId, hook])),
    getCard(cardId) {
      return cardsById.get(cardId) || null;
    },
    getHookForScene(sceneSnapshot = {}) {
      return this.hooksByPhase.get(normalizePhaseId(sceneSnapshot)) || null;
    }
  };
}
