export function byId(items = []) {
  return new Map(items.filter((item) => item?.id).map((item) => [item.id, item]));
}

export function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export function indexMissionGraph(graph) {
  return {
    phases: byId(graph.phases),
    facts: byId(graph.facts),
    clocks: byId(graph.clocks),
    actorIntentions: byId(graph.actorIntentions),
    pressures: byId(graph.pressures),
    decisionPoints: byId(graph.decisionPoints),
    commandDecisions: byId(graph.commandDecisions),
    outcomeFlags: byId(graph.outcomeFlags),
    retrievalHooksByPhase: new Map((graph.retrievalHooks || []).map((hook) => [hook.phaseId, hook]))
  };
}

export function getActivePhase(graphIndex, sceneSnapshot) {
  const phaseId = sceneSnapshot?.activePhaseId || sceneSnapshot?.phaseId;
  return graphIndex.phases.get(phaseId) || null;
}

export function getActiveDecisionPoints(graphIndex, sceneSnapshot) {
  const activeIds = sceneSnapshot?.activeDecisionPointIds || [];
  const phase = getActivePhase(graphIndex, sceneSnapshot);
  const ids = activeIds.length > 0 ? activeIds : phase?.decisionPointIds || [];
  return ids.map((id) => graphIndex.decisionPoints.get(id)).filter(Boolean);
}

export function getFactsByVisibility(graphIndex, factIds = [], visibility) {
  return factIds
    .map((id) => graphIndex.facts.get(id))
    .filter((fact) => fact && (!visibility || fact.visibility === visibility));
}

export function getClockValue(campaignState, clockId, fallbackValue = 0) {
  const clock = (campaignState?.clocks || []).find((item) => item.id === clockId);
  return typeof clock?.value === 'number' ? clock.value : fallbackValue;
}

export function clampClockValue(graphIndex, clockId, value) {
  const graphClock = graphIndex.clocks.get(clockId);
  if (!graphClock) {
    return value;
  }
  return Math.max(graphClock.min, Math.min(graphClock.max, value));
}
