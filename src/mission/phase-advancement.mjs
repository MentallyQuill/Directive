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

  if (
    activePhaseId === 'senior-readiness-conference'
    && intentParse.primaryIntent === 'set-readiness-priorities'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'fallback-command-drill');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'fallback-command-drill',
      reason: 'The senior staff conference has produced enough priority, ownership, and accepted risk to move into the fallback-command drill.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'fallback-command-drill'
    && intentParse.primaryIntent === 'set-fallback-command-procedure'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'command-rhythm-scenes');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'command-rhythm-scenes',
      reason: 'The fallback-command drill has produced an executable command-continuity policy and a committed technical follow-up posture.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'command-rhythm-scenes'
    && intentParse.primaryIntent === 'establish-command-rhythm'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'hesperus-diversion');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'hesperus-diversion',
      reason: 'The player has created enough senior staff contact and command-culture signal for the Prelude to move into the Hesperus diversion.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'hesperus-aftermath'
    && intentParse.primaryIntent === 'assign-hesperus-aftermath'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'combined-load-test');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'combined-load-test',
      reason: 'The Hesperus aftermath has enough assigned follow-up for the ship to resume shakedown work.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'combined-load-test'
    && intentParse.primaryIntent === 'resolve-combined-load-test'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'final-command-review');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'final-command-review',
      reason: 'The combined-load test has a committed readiness status and any accepted technical debt is recorded for final review.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'final-command-review'
    && intentParse.primaryIntent === 'complete-final-command-review'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'arrival-at-reach');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'arrival-at-reach',
      reason: 'The final command review has set the arrival posture and the Breckinridge is ready to transition into the Reach.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  return null;
}
