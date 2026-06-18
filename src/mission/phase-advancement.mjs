export function evaluatePhaseAdvance({ graph, sceneSnapshot, intentParse, outcomePacket }) {
  const activePhaseId = sceneSnapshot?.activePhaseId;

  if (
    activePhaseId === 'hesperus-diversion'
    && intentParse.primaryIntent === 'resolve-hesperus-with-accountability'
    && ['Great Success', 'Success', 'Partial Success'].includes(outcomePacket.resultBand)
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'hesperus-aftermath');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'hesperus-aftermath',
      reason: 'The Hesperus rescue and accountability decisions have committed enough consequence to move into aftermath handling.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  return null;
}
