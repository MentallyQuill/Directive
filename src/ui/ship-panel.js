import { appendEmpty } from './runtime-ui-kit.js';
import { activePackageForView, currentChatEmptyMessage } from './current-chat-scope-copy.js';
import { requireV1PlayerProjection } from './v1-player-facing-panel-model.mjs';
import { buildCertifiedShipView } from './view-models/certified-ship-view.mjs';
import { createShipCohesionWorkspace } from './ship-journal.js';

export function renderShipPanel(body, view, actions = {}) {
  const projection = requireV1PlayerProjection(view);
  if (!projection) {
    appendEmpty(body, currentChatEmptyMessage(view));
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
