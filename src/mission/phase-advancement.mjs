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
      reason: 'The final command review has set the arrival posture and the Breckenridge is ready to transition into the Reach.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'convoy-approach'
    && intentParse.primaryIntent === 'set-first-boarding-threshold'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'first-committed-response');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'first-committed-response',
      reason: 'The first boarding or rescue-contact threshold is committed and the opening response can move into consequence review.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'first-committed-response'
    && intentParse.primaryIntent === 'execute-first-contact-response'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'convoy-contact-execution');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'convoy-contact-execution',
      reason: 'The first contact execution route is committed and the convoy response can move from threshold review into active contact.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'convoy-contact-execution'
    && intentParse.primaryIntent === 'frame-offsite-custody-cargo-leads'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'offsite-custody-cargo-leads');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'offsite-custody-cargo-leads',
      reason: 'First contact has produced enough shelter, custody, and cargo evidence to frame the next Chapter 1 leads.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'offsite-custody-cargo-leads'
    && intentParse.primaryIntent === 'set-pell-contact-terms'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'pell-contact-terms');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'pell-contact-terms',
      reason: 'Pell contact, release posture, and cargo recovery route have enough terms to frame the next negotiation or recovery beat.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'pell-contact-terms'
    && intentParse.primaryIntent === 'execute-joint-inspection-release'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'joint-inspection-release-cargo');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'joint-inspection-release-cargo',
      reason: 'The opened Pell terms have become a shared inspection, supervised Ivers release route, and preserved cargo evidence path.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'joint-inspection-release-cargo'
    && intentParse.primaryIntent === 'trace-cargo-diagnostic-pulse'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'cargo-diagnostic-pulse');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'cargo-diagnostic-pulse',
      reason: 'The weak cargo signal has been traced and the recovery locus is preserved for the next Chapter 1 recovery beat.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'cargo-diagnostic-pulse'
    && intentParse.primaryIntent === 'recover-hardware-under-seal'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'hardware-recovery-under-seal');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'hardware-recovery-under-seal',
      reason: 'The missing emergency hardware is recovered or contested under the joint inspection record for Chapter 1 resolution follow-up.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'hardware-recovery-under-seal'
    && intentParse.primaryIntent === 'set-chapter1-resolution-terms'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'chapter-1-resolution-terms');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'chapter-1-resolution-terms',
      reason: 'The recovered-hardware record has been closed into durable Chapter 1 resolution terms.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'chapter-1-resolution-terms'
    && intentParse.primaryIntent === 'transition-chapter1-to-false-colors'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'asterion-arrival-false-colors');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'asterion-arrival-false-colors',
      reason: 'The Chapter 1 record has reached Asterion and the Compact patrol report opens the False Colors transition.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'false-colors-arrival-briefing'
    && intentParse.primaryIntent === 'set-false-colors-transparency-terms'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'transparency-terms-set');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'transparency-terms-set',
      reason: 'The first False Colors transparency, medical, audit, and tactical-access terms have been recorded.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'transparency-terms-set'
    && intentParse.primaryIntent === 'establish-orison-evidence-baseline'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'orison-evidence-baseline');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'orison-evidence-baseline',
      reason: 'The Orison sensor baseline, alibi evidence, and attacker-route reconstruction have been preserved for Chapter 2 follow-up.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'orison-evidence-baseline'
    && intentParse.primaryIntent === 'stabilize-aegis-medical-trust'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'aegis-medical-trust');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'aegis-medical-trust',
      reason: 'Aegis Two medical care, consent, and voluntary testimony have been recorded for Chapter 2 follow-up.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'aegis-medical-trust'
    && intentParse.primaryIntent === 'set-security-access-demonstration'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'security-access-demonstration');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'security-access-demonstration',
      reason: 'Command-authentication access, Bronn security demonstration, and Kessler-facing alternatives have been recorded for Chapter 2 follow-up.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  if (
    activePhaseId === 'security-access-demonstration'
    && intentParse.primaryIntent === 'frame-joint-investigation-charter'
    && successfulEnough
  ) {
    const nextPhase = (graph.phases || []).find((phase) => phase.id === 'joint-investigation-charter');
    return {
      from: activePhaseId,
      to: nextPhase?.id || 'joint-investigation-charter',
      reason: 'The first False Colors crisis has been converted into a joint investigation charter and Open Orders I transition.',
      availableDecisionPointIds: nextPhase?.decisionPointIds || []
    };
  }

  return null;
}
