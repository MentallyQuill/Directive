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
