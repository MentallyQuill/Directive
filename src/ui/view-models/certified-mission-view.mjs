import { createV1MissionPanelModel } from '../v1-player-facing-panel-model.mjs';

const clone = (value) => value === undefined
  ? undefined
  : JSON.parse(JSON.stringify(value));

function objectiveView(objective) {
  return {
    id: objective.id,
    title: objective.title,
    summary: objective.summary,
    status: objective.status,
    disposition: objective.disposition ?? null,
    terminalText: objective.terminalText ?? null
  };
}

export function buildCertifiedMissionView(projection) {
  const mission = createV1MissionPanelModel(projection);
  const record = {
    id: mission.missionId,
    title: mission.title,
    summary: mission.summary,
    status: mission.status,
    requiredObjectives: mission.primaryObjectives.map(objectiveView),
    optionalObjectives: mission.optionalObjectives.map(objectiveView),
    knownFacts: clone(mission.knownFacts),
    clocks: clone(mission.clocks),
    capabilities: clone(mission.capabilities),
    terminal: clone(mission.terminal)
  };
  return { time: clone(projection.time), selectedMissionId: record.id, missions: [record] };
}
