import { appendEmpty, createElement } from './runtime-ui-kit.js';
import { createPackageImage } from './directive-media.js';
import { currentChatEmptyMessage } from './current-chat-scope-copy.js';
import {
  createV1ShipPanelModel,
  requireV1PlayerProjection
} from './v1-player-facing-panel-model.mjs';

function statusText(value) {
  return String(value || 'unknown').replace(/[-_]+/g, ' ');
}

export function renderShipPanel(body, view) {
  const projection = requireV1PlayerProjection(view);
  if (!projection) {
    appendEmpty(body, currentChatEmptyMessage(view));
    return;
  }
  const ship = createV1ShipPanelModel(projection);
  const surface = createElement('div', 'directive-v1-ship');
  surface.dataset.directiveTour = 'ship.status';

  const hero = createPackageImage(view?.activePackage || {}, {
    kind: 'ship.hero',
    subjectId: ship.shipId,
    variant: 'hero'
  }, {
    wrapperClass: 'directive-v1-ship-hero',
    label: ship.name,
    loading: 'eager'
  });
  const identity = createElement('div', 'directive-v1-ship-identity');
  const kicker = createElement('span', 'directive-v1-kicker');
  kicker.textContent = `${ship.class} / ${ship.registry}`;
  const title = createElement('h2');
  title.textContent = ship.name;
  identity.append(kicker, title);
  if (ship.capabilitySummary) {
    const capability = createElement('p');
    capability.textContent = ship.capabilitySummary;
    identity.appendChild(capability);
  }
  hero.appendChild(identity);
  surface.appendChild(hero);

  const status = ship.operationalStatus;
  const card = createElement('section', 'directive-v1-operational-status');
  const header = createElement('header');
  const heading = createElement('div');
  const label = createElement('span', 'directive-v1-kicker');
  label.textContent = 'Operational status';
  const statusTitle = createElement('h3');
  statusTitle.textContent = statusText(status.status);
  heading.append(label, statusTitle);
  header.appendChild(heading);
  card.appendChild(header);

  const summary = createElement('p', 'directive-v1-operational-summary');
  summary.textContent = status.summary;
  card.appendChild(summary);

  if (status.readiness) {
    const readiness = createElement('div', 'directive-v1-ship-readiness');
    const readinessLabel = createElement('span');
    readinessLabel.textContent = status.readiness.label;
    const value = createElement('strong');
    value.textContent = String(status.readiness.value);
    readiness.append(readinessLabel, value);
    card.appendChild(readiness);
  }

  if (status.materialLimitations.length) {
    const limitations = createElement('section', 'directive-v1-material-limitations');
    const limitationsTitle = createElement('h4');
    limitationsTitle.textContent = 'Material limitations';
    const list = createElement('ul');
    status.materialLimitations.forEach((limitation) => {
      const item = createElement('li');
      item.textContent = limitation.summary;
      list.appendChild(item);
    });
    limitations.append(limitationsTitle, list);
    card.appendChild(limitations);
  }

  surface.appendChild(card);
  body.appendChild(surface);
}
