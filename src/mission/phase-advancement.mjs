export function evaluatePhaseAdvance({ graph, sceneSnapshot, intentParse, outcomePacket }) {
  const activePhaseId = sceneSnapshot?.activePhaseId;
  const successfulEnough = ['Great Success', 'Success', 'Partial Success'].includes(outcomePacket.resultBand);

  if (
    activePhaseId === 'shuttle-rendezvous'
    && intentParse.primaryIntent === 'establish-arrival-tone'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'ready-room-handover');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'ready-room-handover',
      reason: 'The XO has boarded and created enough initial command signal to move into the private command handover.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'ready-room-handover'
    && intentParse.primaryIntent === 'complete-ready-room-handover'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'senior-readiness-conference');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'senior-readiness-conference',
      reason: 'The Captain and acting XO handoff is sufficiently complete to move into senior staff readiness work.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'hesperus-diversion'
    && intentParse.primaryIntent === 'resolve-hesperus-with-accountability'
    && successfulEnough
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
