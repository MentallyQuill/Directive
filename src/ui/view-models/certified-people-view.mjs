import { createV1CrewPanelModel } from '../v1-player-facing-panel-model.mjs';

const clone = (value) => value === undefined
  ? undefined
  : JSON.parse(JSON.stringify(value));

export function buildCertifiedPeopleView(projection) {
  const model = createV1CrewPanelModel(projection);
  return {
    player: {
      ...clone(model.player),
      id: model.player.playerId || model.player.id
    },
    people: clone(model.people),
    commandBearing: clone(model.commandBearing)
  };
}
