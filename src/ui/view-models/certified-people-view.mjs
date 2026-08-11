import { createV1CrewPanelModel } from '../v1-player-facing-panel-model.mjs';
import { activePackageForView } from '../current-chat-scope-copy.js';
import { peoplePreferenceScopeKey } from '../people-collection-preferences.js';

const clone = (value) => value === undefined
  ? undefined
  : JSON.parse(JSON.stringify(value));

export function buildCertifiedPeopleView(projection, view = {}) {
  const model = createV1CrewPanelModel(projection);
  const player = {
    ...clone(model.player),
    id: model.player.playerId || model.player.id,
    categoryId: model.player.categoryId || 'ships-company',
    isPlayer: true
  };
  const people = clone(model.people).map((person) => ({ ...person, isPlayer: false }));
  return {
    scopeKey: peoplePreferenceScopeKey(view, projection),
    packageData: activePackageForView(view),
    player,
    people,
    records: [player, ...people],
    commandBearing: clone(model.commandBearing)
  };
}
