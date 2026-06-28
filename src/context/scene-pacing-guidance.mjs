function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compact(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function decisionIds(campaignState, scene) {
  return new Set([
    ...asArray(scene?.availableDecisionPointIds),
    ...asArray(campaignState?.mission?.availableDecisionPointIds)
  ].map(compact).filter(Boolean));
}

function activeMissionId(campaignState, scene) {
  return compact(
    scene?.activeMissionId
    || scene?.missionId
    || campaignState?.mission?.activeMissionId
    || campaignState?.mission?.activeMissionGraphId
  );
}

function activePhaseId(campaignState, scene) {
  return compact(
    scene?.activePhaseId
    || scene?.phaseId
    || campaignState?.mission?.activePhaseId
    || campaignState?.mission?.phase
  );
}

function isAshesOfPeace(packageData) {
  return packageData?.manifest?.id === 'directive:campaign-package:breckenridge-ashes-of-peace';
}

const GLOBAL_SCENE_PACING_LINES = Object.freeze([
  'A named location change is a playable scene boundary, not permission to montage through the location.',
  'If narration moves characters to a named room, deck, bridge, shuttlebay, corridor junction, ready room, Engineering, Sickbay, or similar place, stop on departure, route, threshold, arrival, or the first interaction there.',
  'Do not enter a named location, resolve its purpose, and leave it in the same reply unless the player explicitly asks to cut, summarize, fast-forward, or move to a future event.',
  'Walking, turbolifts, docking ramps, corridors, handoffs, and first looks take scene time; give the player a chance to observe, speak, or act before the scene moves on.'
]);

export function globalScenePacingLines() {
  return [...GLOBAL_SCENE_PACING_LINES];
}

export function scenePacingGuidance({
  campaignState,
  packageData = null,
  scene = null
} = {}) {
  const missionId = activeMissionId(campaignState, scene);
  const phaseId = activePhaseId(campaignState, scene);
  const decisions = decisionIds(campaignState, scene);
  const shuttleApproach = compact(packageData?.ship?.travelContinuity?.openingShuttleApproach);

  if (isAshesOfPeace(packageData) && missionId === 'prelude-a-ship-underway') {
    if (phaseId === 'shuttle-rendezvous' || decisions.has('decision.arrival-tone')) {
      return {
        id: 'ashes-prelude-shuttle-rendezvous',
        title: 'Ashes Opening Arrival Pacing',
        lines: [
          'Keep the first playable prompt local to the shuttle rendezvous and working arrival tone.',
          shuttleApproach ? `Use the authored shuttle approach: ${shuttleApproach}` : null,
          'The player is choosing how to board, report, inspect, defer, or let the transfer process complete; do not force the full Asterion Reach strategy conversation yet.',
          'Captain Whitaker may be foreshadowed or briefly encountered, but broad questions about what the player knows or thinks about the Asterion Reach belong in a later private handover or briefing after the player chooses that beat.'
        ].filter(Boolean)
      };
    }
    if (phaseId === 'ready-room-handover' || decisions.has('decision.handover-value')) {
      return {
        id: 'ashes-prelude-ready-room-handover',
        title: 'Ashes Ready-Room Handover Pacing',
        lines: [
          'Treat the handover as a private professional calibration, not a public bridge interrogation or full strategic exam.',
          'Whitaker should test the XO through immediate command expectations, support needs, delegation boundaries, or one concrete value; anchor any broader Reach question in the player\'s prior words.',
          'Do not turn the first captain meeting into a broad Asterion Reach thesis interview unless the player explicitly invited that topic; let trust and strategic depth build over a few exchanges.'
        ]
      };
    }
  }

  return null;
}

export function scenePacingLines(input = {}) {
  return [
    ...globalScenePacingLines(),
    ...(scenePacingGuidance(input)?.lines || [])
  ];
}
