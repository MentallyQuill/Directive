import { activePackageForView } from './current-chat-scope-copy.js';
import { appendCurrentChatEmptyState } from './current-chat-empty-state.js';
import { requireV1PlayerProjection } from './v1-player-facing-panel-model.mjs';
import { buildCertifiedShipView } from './view-models/certified-ship-view.mjs';
import { createShipCohesionWorkspace } from './ship-journal.js';

export function renderShipPanel(body, view, actions = {}) {
  const projection = requireV1PlayerProjection(view);
  if (!projection) {
    appendCurrentChatEmptyState(body, view);
    return;
  }
  const ship = buildCertifiedShipView(projection);
  body.appendChild(createShipCohesionWorkspace(
    ship,
    activePackageForView(view),
    actions,
    projection.commandBearing || {},
  ));
}
