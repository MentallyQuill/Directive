import { getActiveDecisionPoints, getActivePhase, unique } from './graph-lookup.mjs';

const cadenceScores = new Map([
  ['Crisis', 50],
  ['Escalation', 40],
  ['Signal', 30],
  ['Latent', 20],
  ['Consequence', 10]
]);

function textIncludesAny(text, values = []) {
  const normalized = String(text || '').toLowerCase();
  return values.some((value) => normalized.includes(String(value).toLowerCase()));
}

function readinessSummary(pressure) {
  const gates = pressure.readinessGates || {};
  const missing = ['motive', 'information', 'opportunity', 'resources', 'riskTolerance', 'timing']
    .filter((key) => typeof gates[key] !== 'string' || gates[key].trim() === '');
  return {
    ready: missing.length === 0,
    missing,
    gates
  };
}

function scorePressure({ pressure, sceneSnapshot, intentParse, activeDecisionPointIds }) {
  let score = cadenceScores.get(pressure.cadenceState) || 0;
  const input = sceneSnapshot?.playerInput || '';
  const intentText = [
    intentParse?.summary,
    intentParse?.primaryIntent,
    intentParse?.declaredMethod,
    input
  ].join(' ');

  if ((pressure.linkedDecisionPointIds || []).some((id) => activeDecisionPointIds.has(id))) {
    score += 20;
  }
  if (textIncludesAny(intentText, pressure.linkedFactIds || [])) {
    score += 8;
  }
  if (textIncludesAny(intentText, ['passenger', 'medical', 'transfer']) && pressure.id.includes('passenger')) {
    score += 15;
  }
  if (textIncludesAny(intentText, ['fraud', 'inspection', 'owner', 'inquiry', 'evidence']) && pressure.id.includes('fraud')) {
    score += 15;
  }
  if ((pressure.linkedCommandDecisionIds || []).length > 0) {
    score += 5;
  }

  return score;
}

export function selectPressureFocus({ graph, graphIndex, sceneSnapshot, intentParse }) {
  const phase = getActivePhase(graphIndex, sceneSnapshot);
  const activeDecisionPointIds = new Set(getActiveDecisionPoints(graphIndex, sceneSnapshot).map((decisionPoint) => decisionPoint.id));
  const focusRules = graph.directorFocusRules || {};
  const primaryMax = Number.isInteger(focusRules.primaryPressureMax) ? focusRules.primaryPressureMax : 1;
  const secondaryMax = Number.isInteger(focusRules.secondaryPressureMax) ? focusRules.secondaryPressureMax : 1;

  const candidates = (graph.pressures || [])
    .filter((pressure) => pressure.phaseId === phase?.id)
    .map((pressure) => {
      const readiness = readinessSummary(pressure);
      return {
        pressure,
        readiness,
        score: readiness.ready
          ? scorePressure({ pressure, sceneSnapshot, intentParse, activeDecisionPointIds })
          : -1
      };
    })
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score || left.pressure.id.localeCompare(right.pressure.id));

  const primary = candidates.slice(0, primaryMax);
  const secondary = candidates.slice(primary.length, primary.length + secondaryMax);
  const selected = [...primary, ...secondary];

  const fallbackDecisionPointIds = [...activeDecisionPointIds];
  const usedDecisionPointIds = unique([
    ...selected.flatMap((candidate) => candidate.pressure.linkedDecisionPointIds || []),
    ...fallbackDecisionPointIds
  ]);

  return {
    phaseId: phase?.id || null,
    focusBudget: {
      primaryPressureMax: primaryMax,
      secondaryPressureMax: secondaryMax,
      relationshipBeatMax: Number.isInteger(focusRules.relationshipBeatMax) ? focusRules.relationshipBeatMax : 1
    },
    primaryPressureIds: primary.map((candidate) => candidate.pressure.id),
    secondaryPressureIds: secondary.map((candidate) => candidate.pressure.id),
    selectedPressureIds: selected.map((candidate) => candidate.pressure.id),
    readiness: selected.map((candidate) => ({
      pressureId: candidate.pressure.id,
      ready: candidate.readiness.ready,
      missing: candidate.readiness.missing
    })),
    usedDecisionPointIds,
    usedFactIds: unique(selected.flatMap((candidate) => candidate.pressure.linkedFactIds || [])),
    usedClockIds: unique(selected.flatMap((candidate) => candidate.pressure.linkedClockIds || [])),
    commandDecisionCandidates: unique([
      ...selected.flatMap((candidate) => candidate.pressure.linkedCommandDecisionIds || []),
      ...getActiveDecisionPoints(graphIndex, sceneSnapshot).flatMap((decisionPoint) => decisionPoint.commandDecisionIds || [])
    ])
  };
}
