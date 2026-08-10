import { appendEmpty, createButton, createElement } from './runtime-ui-kit.js';
import { currentChatEmptyMessage } from './current-chat-scope-copy.js';
import { requireV1PlayerProjection } from './v1-player-facing-panel-model.mjs';
import { buildCertifiedPeopleView } from './view-models/certified-people-view.mjs';
import { createPeopleDetail, createPeopleRoster } from './people-journal.js';

let selectedPersonId = null;

export function resetCrewPanelState() {
  selectedPersonId = null;
}

function createCommandBearingStrip(commandBearing, actions) {
  const strip = createElement('section', 'directive-command-bearing-strip');
  strip.dataset.directiveTour = 'crew.command-bearing';
  const copy = createElement('div', 'directive-command-bearing-copy');
  const kicker = createElement('span');
  kicker.textContent = 'Command Bearing';
  const title = createElement('h2');
  title.textContent = `${commandBearing.balance} of ${commandBearing.capacity} available`;
  const summary = createElement('p');
  summary.textContent = commandBearing.pendingEdge
    ? (commandBearing.pendingEdge.status === 'armed' ? 'A favorable edge is armed for the current response.' : 'A favorable edge is reserved for the next response.')
    : 'A small reserve earned through meaningful command decisions.';
  copy.append(kicker, title, summary);

  const pips = createElement('div', 'directive-command-bearing-pips');
  pips.setAttribute('aria-label', `${commandBearing.balance} of ${commandBearing.capacity} Command Bearing available`);
  for (let index = 0; index < commandBearing.capacity; index += 1) {
    const pip = createElement('span', index < commandBearing.balance ? 'is-filled' : '');
    pip.setAttribute('aria-hidden', 'true');
    pips.appendChild(pip);
  }

  const commands = createElement('div', 'directive-command-bearing-actions');
  if (commandBearing.pendingEdge) {
    commands.appendChild(createButton({
      label: 'Cancel edge',
      className: 'people-command',
      disabled: typeof actions.cancelCommandBearingEdge !== 'function',
      onClick: async () => {
        await actions.cancelCommandBearingEdge();
        await actions.refresh?.();
      }
    }));
  } else {
    const canReserve = commandBearing.balance > 0
      && !commandBearing.pendingEdge
      && typeof actions.reserveCommandBearingEdge === 'function';
    commands.appendChild(createButton({
      label: 'Use Command Bearing',
      className: 'people-command people-command-primary',
      disabled: !canReserve,
      onClick: async () => {
        await actions.reserveCommandBearingEdge();
        await actions.refresh?.();
      }
    }));
  }
  strip.append(copy, pips, commands);
  return strip;
}

export function renderCrewPanel(body, view, actions = {}) {
  const projection = requireV1PlayerProjection(view);
  if (!projection) {
    appendEmpty(body, currentChatEmptyMessage(view));
    return;
  }
  const model = buildCertifiedPeopleView(projection);
  const records = [
    { ...model.player, isPlayer: true },
    ...model.people.map((person) => ({ ...person, isPlayer: false }))
  ];
  if (!selectedPersonId || !records.some((record) => record.id === selectedPersonId)) {
    selectedPersonId = records[0]?.id || null;
  }

  const surface = createElement('div', 'directive-expanded-people people-route');
  surface.appendChild(createCommandBearingStrip(model.commandBearing, actions));
  const layout = createElement('div', 'people-layout people-journal');
  const select = (id) => {
    selectedPersonId = id;
    body.replaceChildren?.();
    renderCrewPanel(body, view, actions);
  };
  layout.append(
    createPeopleRoster(records, selectedPersonId, select),
    createPeopleDetail(records.find((record) => record.id === selectedPersonId))
  );
  surface.appendChild(layout);
  body.appendChild(surface);
}
