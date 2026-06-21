import {
  appendEmpty,
  appendSectionTitle,
  createCard,
  createCardTitle,
  createElement,
  createIcon
} from './runtime-ui-kit.js';
import { createPackageImage } from './directive-media.js';

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function displayValue(value, fallback = 'None') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function packageCrewById(view) {
  return new Map((view.activePackage?.crew?.senior || []).map((crew) => [crew.id, crew]));
}

function commandLabel(view, value) {
  const id = displayValue(value, '');
  if (!id) return 'None';
  return packageCrewById(view).get(id)?.name || id;
}

function commandCrew(view, value) {
  const id = displayValue(value, '');
  if (!id) return null;
  return packageCrewById(view).get(id) || { id, name: commandLabel(view, id) };
}

function conditionLabel(value) {
  const text = displayValue(value, 'Nominal');
  if (/returned to service/i.test(text)) return 'Post-refit shakedown';
  return text.length > 44 ? `${text.slice(0, 41).trim()}...` : text;
}

function createShipStatusBlock(label, value, tone = 'neutral', icon = '') {
  const block = createElement('div', `directive-lcars-status-block directive-ship-status-block directive-status-${tone}`);
  if (icon) {
    const iconFrame = createElement('span', 'directive-lcars-status-icon');
    iconFrame.appendChild(createIcon(icon));
    block.appendChild(iconFrame);
  }
  const copy = createElement('span', 'directive-lcars-status-copy');
  const key = createElement('span', 'directive-lcars-status-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-lcars-status-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  copy.append(key, content);
  block.appendChild(copy);
  return block;
}

function createCommandOfficer(view, label, crew, fallback) {
  const row = createElement('article', 'directive-ship-command-officer');
  const portrait = createPackageImage(view.activePackage, {
    kind: 'crew.portrait.formal',
    subjectId: crew?.id || '',
    variant: 'thumb'
  }, {
    wrapperClass: 'directive-ship-command-portrait',
    label: crew?.name || fallback,
    icon: 'fa-solid fa-user'
  });
  const copy = createElement('div');
  const key = createElement('span', 'directive-lcars-kicker');
  key.textContent = label;
  const value = createElement('strong');
  value.textContent = crew?.name || fallback || 'Unassigned';
  const role = createElement('span');
  role.textContent = crew?.billet || crew?.rank || 'Command assignment';
  copy.append(key, value, role);
  row.append(portrait, copy);
  return row;
}

function createShipAdvisory(label, detail, tone = 'science', icon = '') {
  const row = createElement('div', `directive-ship-meter directive-ship-meter-${tone}`);
  const identity = createElement('div', 'directive-ship-meter-identity');
  if (icon) {
    const iconFrame = createElement('span', 'directive-ship-meter-icon');
    iconFrame.appendChild(createIcon(icon));
    identity.appendChild(iconFrame);
  }
  const copy = createElement('span');
  const title = createElement('strong');
  title.textContent = label;
  const summary = createElement('span');
  summary.textContent = detail;
  copy.append(title, summary);
  identity.appendChild(copy);
  row.appendChild(identity);
  return row;
}

function createCaveatList(title, items, tone = 'warning') {
  const card = createCard(`directive-ship-caveat-card directive-ship-caveat-${tone} directive-lcars-panel`);
  const header = createElement('div', 'directive-ship-caveat-header');
  header.append(createIcon(tone === 'danger' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-wrench'), createCardTitle(title));
  card.appendChild(header);
  const list = createElement('div', 'directive-ship-caveat-list');
  for (const item of items) {
    const caveat = createElement('p', 'directive-ship-caveat');
    caveat.appendChild(createIcon('fa-solid fa-angle-right'));
    const text = createElement('span');
    text.textContent = item;
    caveat.appendChild(text);
    list.appendChild(caveat);
  }
  card.appendChild(list);
  return card;
}

export function renderShipPanel(body, view) {
  appendSectionTitle(body, 'Ship');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, 'No ship state loaded.');
    return;
  }

  const ship = state.ship || {};
  const packageShip = view.activePackage?.ship || {};
  const command = packageShip.commandStructure || {};
  const conditionText = ship.condition || packageShip.openingCondition;
  const damage = asArray(ship.damage);
  const restrictions = asArray(ship.activeRestrictions);
  const debt = asArray(ship.technicalDebt || packageShip.systems?.knownTechnicalDebt);
  const advisoryCount = damage.length + restrictions.length + debt.length;
  const shipName = ship.name || packageShip.name || 'Starship';
  const registry = ship.registry || packageShip.registry || 'Registry pending';

  const consoleSurface = createElement('div', 'directive-ship-console directive-lcars-console');
  const hero = createElement('section', 'directive-ship-hero directive-lcars-panel');
  const visual = createPackageImage(view.activePackage, {
    kind: 'ship.hero',
    subjectId: packageShip.id || ship.id || 'uss-breckenridge',
    variant: 'hero'
  }, {
    wrapperClass: 'directive-ship-hero-media',
    label: shipName,
    icon: 'fa-solid fa-shuttle-space',
    loading: 'eager'
  });
  const heroCopy = createElement('div', 'directive-ship-hero-copy');
  const eyebrow = createElement('span', 'directive-lcars-kicker');
  eyebrow.textContent = 'Starfleet Vessel';
  const title = createElement('h3', 'directive-ship-hero-title');
  title.textContent = shipName;
  const subtitle = createElement('p', 'directive-ship-hero-subtitle');
  subtitle.textContent = `${ship.class || packageShip.class || 'Class pending'} / ${registry}`;
  const mission = createElement('p', 'directive-ship-hero-mission');
  mission.textContent = packageShip.affiliation
    ? `${packageShip.affiliation} operational command / ${state.campaign?.title || 'Active campaign'}`
    : state.campaign?.title || 'Active campaign';
  heroCopy.append(eyebrow, title, subtitle, mission);
  if (advisoryCount) {
    const badge = createElement('span', 'directive-ship-hero-badge directive-ship-hero-badge-warning');
    const badgeText = createElement('span');
    badgeText.textContent = `${advisoryCount} mission ${advisoryCount === 1 ? 'advisory' : 'advisories'}`;
    badge.append(createIcon('fa-solid fa-triangle-exclamation'), badgeText);
    heroCopy.appendChild(badge);
  }
  hero.append(visual, heroCopy);
  consoleSurface.appendChild(hero);

  const statusGrid = createElement('div', 'directive-ship-readiness-grid');
  statusGrid.append(
    createShipStatusBlock('Condition', conditionLabel(conditionText), restrictions.length || damage.length ? 'warning' : 'success', 'fa-solid fa-gauge-high'),
    createShipStatusBlock('Restrictions', restrictions.length, restrictions.length ? 'warning' : 'success', 'fa-solid fa-ban'),
    createShipStatusBlock('Damage', damage.length, damage.length ? 'danger' : 'success', 'fa-solid fa-shield-halved'),
    createShipStatusBlock('Technical Debt', debt.length, debt.length ? 'warning' : 'success', 'fa-solid fa-screwdriver-wrench')
  );
  consoleSurface.appendChild(statusGrid);

  const operationalGrid = createElement('div', 'directive-ship-operational-grid');
  const systemsCard = createCard('directive-ship-systems-card directive-lcars-panel');
  const systemsHeader = createElement('div', 'directive-ship-panel-header');
  const systemsCopy = createElement('div');
  const systemsKicker = createElement('span', 'directive-lcars-kicker');
  systemsKicker.textContent = 'Runtime Asset Status';
  const systemsTitle = createCardTitle('Operational Readiness');
  systemsCopy.append(systemsKicker, systemsTitle);
  systemsHeader.appendChild(systemsCopy);
  if (advisoryCount) {
    const systemsBadge = createElement('span', 'directive-ship-panel-badge');
    systemsBadge.textContent = `${advisoryCount} active`;
    systemsHeader.appendChild(systemsBadge);
  }
  systemsCard.appendChild(systemsHeader);

  const advisories = createElement('div', 'directive-ship-meter-list');
  if (damage.length) {
    advisories.appendChild(createShipAdvisory('Damage Advisory', `${damage.length} active damage record${damage.length === 1 ? '' : 's'}`, 'science', 'fa-solid fa-shield'));
  }
  if (restrictions.length) {
    advisories.appendChild(createShipAdvisory('Operating Restrictions', `${restrictions.length} restriction${restrictions.length === 1 ? '' : 's'} affects current operations`, 'operations', 'fa-solid fa-ban'));
  }
  if (debt.length) {
    advisories.appendChild(createShipAdvisory('Technical Debt', `${debt.length} validation item${debt.length === 1 ? '' : 's'} may shape risk calls`, 'command', 'fa-solid fa-screwdriver-wrench'));
  }
  if (!advisories.children.length) {
    advisories.appendChild(createShipAdvisory('Mission Advisories', 'No mission-impacting ship caveats are active.', 'science', 'fa-solid fa-circle-check'));
  }
  systemsCard.appendChild(advisories);

  const commandCard = createCard('directive-ship-command-card directive-lcars-panel');
  const commandHeader = createElement('div', 'directive-ship-panel-header');
  const commandCopy = createElement('div');
  const commandKicker = createElement('span', 'directive-lcars-kicker');
  commandKicker.textContent = 'Command Structure';
  commandCopy.append(commandKicker, createCardTitle('Bridge Authority'));
  const authority = createElement('span', 'directive-ship-panel-badge directive-ship-panel-badge-command');
  authority.textContent = command.captainRetainsFinalAuthority ? 'Captain retains final authority' : 'Delegated authority';
  commandHeader.append(commandCopy, authority);
  commandCard.appendChild(commandHeader);

  const commandingOfficer = commandCrew(view, command.commandingOfficer);
  const actingXo = commandCrew(view, command.actingXoBeforePlayer);
  const officerList = createElement('div', 'directive-ship-command-officer-list');
  officerList.append(
    createCommandOfficer(view, 'Commanding Officer', commandingOfficer, 'Captain'),
    createCommandOfficer(view, 'Executive Officer', {
      id: 'player-commander',
      name: state.player?.name || 'Player Commander',
      rank: state.player?.rank || command.playerRank,
      billet: state.player?.billet || command.playerBillet
    }, 'Player Commander')
  );
  if (actingXo) {
    officerList.appendChild(createCommandOfficer(view, 'Prior Acting XO', actingXo, 'None'));
  }
  commandCard.appendChild(officerList);
  if (command.playerRole) {
    const role = createElement('p', 'directive-ship-note');
    role.textContent = command.playerRole;
    commandCard.appendChild(role);
  }

  operationalGrid.append(systemsCard, commandCard);
  consoleSurface.appendChild(operationalGrid);

  const conditionCard = createCard('directive-ship-condition-card directive-lcars-panel');
  const conditionHeader = createElement('div', 'directive-ship-panel-header');
  const conditionCopy = createElement('div');
  const conditionKicker = createElement('span', 'directive-lcars-kicker');
  conditionKicker.textContent = 'Engineering Report';
  conditionCopy.append(conditionKicker, createCardTitle('Current Operational Condition'));
  conditionHeader.appendChild(conditionCopy);
  conditionCard.appendChild(conditionHeader);
  const conditionBody = createElement('p', 'directive-ship-condition-copy');
  conditionBody.textContent = displayValue(conditionText, 'No condition report available.');
  conditionCard.appendChild(conditionBody);
  consoleSurface.appendChild(conditionCard);

  const caveatGrid = createElement('div', 'directive-ship-caveat-grid');
  if (damage.length) caveatGrid.appendChild(createCaveatList('Active Damage', damage, 'danger'));
  if (restrictions.length) caveatGrid.appendChild(createCaveatList('Operating Restrictions', restrictions, 'warning'));
  if (debt.length) caveatGrid.appendChild(createCaveatList('Known Technical Debt', debt, 'warning'));
  if (caveatGrid.children.length) consoleSurface.appendChild(caveatGrid);

  body.appendChild(consoleSurface);
}
