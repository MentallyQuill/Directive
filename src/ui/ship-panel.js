import { appendEmpty, createElement } from './runtime-ui-kit.js';
import { currentChatEmptyMessage } from './current-chat-scope-copy.js';
import { requireV1PlayerProjection } from './v1-player-facing-panel-model.mjs';
import { buildCertifiedShipView } from './view-models/certified-ship-view.mjs';
import { createShipBoard, createShipHero } from './ship-journal.js';

export function renderShipPanel(body, view) {
  const projection = requireV1PlayerProjection(view);
  if (!projection) {
    appendEmpty(body, currentChatEmptyMessage(view));
    return;
  }
  const ship = buildCertifiedShipView(projection);
  const surface = createElement('div', 'directive-expanded-ship ship-layout');
  surface.dataset.directiveTour = 'ship.status';
  surface.append(
    createShipHero(ship, view?.activePackage),
    createShipBoard(ship)
  );
  body.appendChild(surface);
}
