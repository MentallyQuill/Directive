import { appendEmpty, createElement } from './runtime-ui-kit.js';
import { currentChatEmptyMessage } from './current-chat-scope-copy.js';
import {
  createV1CrewPanelModel,
  requireV1PlayerProjection
} from './v1-player-facing-panel-model.mjs';

export function resetCrewPanelState() {
  // V1 Crew has no hidden route-local selection or edit state.
}

function createCommandBearingCard(commandBearing) {
  const card = createElement('section', 'directive-v1-command-bearing');
  card.dataset.directiveTour = 'crew.command-bearing';
  const copy = createElement('div');
  const kicker = createElement('span', 'directive-v1-kicker');
  kicker.textContent = 'Command Bearing';
  const title = createElement('h2');
  title.textContent = `${commandBearing.balance} of ${commandBearing.capacity} available`;
  const summary = createElement('p');
  summary.textContent = 'A small reserve earned through meaningful command decisions.';
  copy.append(kicker, title, summary);

  const pips = createElement('div', 'directive-v1-command-bearing-pips');
  pips.setAttribute('aria-label', `${commandBearing.balance} of ${commandBearing.capacity} Command Bearing available`);
  for (let index = 0; index < commandBearing.capacity; index += 1) {
    const pip = createElement('span', index < commandBearing.balance ? 'is-filled' : '');
    pip.setAttribute('aria-hidden', 'true');
    pips.appendChild(pip);
  }
  card.append(copy, pips);
  if (commandBearing.latestAwardReason) {
    const reason = createElement('p', 'directive-v1-command-bearing-reason');
    reason.textContent = `Most recently earned: ${commandBearing.latestAwardReason}`;
    card.appendChild(reason);
  }
  if (commandBearing.latestSpend?.status === 'committed') {
    const spend = createElement('p', 'directive-v1-command-bearing-reason');
    spend.textContent = `Most recently used: ${commandBearing.latestSpend.reason}`;
    card.appendChild(spend);
  }
  return card;
}

function createPersonCard(person) {
  const card = createElement('article', 'directive-v1-person');
  card.dataset.personId = person.id;
  const heading = createElement('header');
  const identity = createElement('div');
  const title = createElement('h3');
  title.textContent = person.name;
  const billet = createElement('span');
  billet.textContent = person.billet;
  identity.append(title, billet);
  heading.appendChild(identity);
  card.appendChild(heading);

  if (person.profileSummary) {
    const profile = createElement('p', 'directive-v1-person-profile');
    profile.textContent = person.profileSummary;
    card.appendChild(profile);
  }
  if (person.relationshipPosture) {
    const posture = createElement('div', 'directive-v1-person-posture');
    const label = createElement('span');
    label.textContent = 'Current posture';
    const value = createElement('strong');
    value.textContent = person.relationshipPosture;
    posture.append(label, value);
    card.appendChild(posture);
  }
  if (person.missionLink?.title) {
    const link = createElement('p', 'directive-v1-person-mission');
    link.textContent = `Current mission: ${person.missionLink.title}`;
    card.appendChild(link);
  }
  if (person.moments?.length) {
    const moments = createElement('section', 'directive-v1-person-moments');
    const label = createElement('h4');
    label.textContent = 'Defining moments';
    const list = createElement('ul');
    person.moments.forEach((moment) => {
      const item = createElement('li');
      item.textContent = moment.summary;
      list.appendChild(item);
    });
    moments.append(label, list);
    card.appendChild(moments);
  }
  return card;
}

export function renderCrewPanel(body, view) {
  const projection = requireV1PlayerProjection(view);
  if (!projection) {
    appendEmpty(body, currentChatEmptyMessage(view));
    return;
  }
  const model = createV1CrewPanelModel(projection);
  const surface = createElement('div', 'directive-v1-crew');
  surface.appendChild(createCommandBearingCard(model.commandBearing));

  const heading = createElement('header', 'directive-v1-roster-heading');
  const kicker = createElement('span', 'directive-v1-kicker');
  kicker.textContent = 'Senior staff';
  const title = createElement('h2');
  title.textContent = 'Crew';
  heading.append(kicker, title);
  surface.appendChild(heading);

  const roster = createElement('div', 'directive-v1-roster');
  model.people.forEach((person) => roster.appendChild(createPersonCard(person)));
  if (!model.people.length) appendEmpty(roster, 'No crew profiles are available for this mission.');
  surface.appendChild(roster);
  body.appendChild(surface);
}
