import {
  appendEmpty,
  appendSectionTitle,
  createCard,
  createCardTitle,
  createElement,
  createMetaRow,
  joinList
} from './runtime-ui-kit.js';

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
  const text = displayValue(value, '');
  if (!text) return 'None';
  const crew = packageCrewById(view).get(text);
  return crew?.name || text;
}

function conditionLabel(value) {
  const text = displayValue(value, 'None');
  if (/returned to service/i.test(text)) return 'Returned to service';
  return text.length > 32 ? `${text.slice(0, 29).trim()}...` : text;
}

function statusTone(value) {
  const label = String(value || '').toLowerCase();
  if (label.includes('damage') || label.includes('restriction') || label.includes('debt')) return 'warning';
  if (label.includes('none') || label.includes('0')) return 'success';
  return 'neutral';
}

function createShipStatusBlock(label, value, tone = statusTone(value)) {
  const block = createElement('div', `directive-lcars-status-block directive-ship-status-block directive-status-${tone}`);
  const key = createElement('span', 'directive-lcars-status-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-lcars-status-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  block.append(key, content);
  return block;
}

function createShipCommandRow(label, value) {
  const row = createElement('div', 'directive-ship-command-row');
  const key = createElement('span', 'directive-lcars-kicker');
  key.textContent = label;
  const content = createElement('strong', 'directive-ship-command-value');
  content.textContent = displayValue(value);
  row.append(key, content);
  return row;
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
  const consoleSurface = createElement('div', 'directive-ship-console directive-lcars-console');

  const identity = createCard('directive-ship-identity-card directive-lcars-panel');
  const identityCopy = createElement('div', 'directive-ship-identity-copy');
  identityCopy.appendChild(createCardTitle(ship.name || packageShip.name || 'Starship'));
  const summary = createElement('p', 'directive-ship-summary');
  summary.textContent = [
    ship.class || packageShip.class,
    packageShip.affiliation,
    ship.registry || packageShip.registry || 'Registry pending'
  ].filter(Boolean).join(' / ');
  identityCopy.appendChild(summary);

  const statusGrid = createElement('div', 'directive-ship-readiness-grid');
  statusGrid.append(
    createShipStatusBlock('Class', ship.class || packageShip.class),
    createShipStatusBlock('Registry', ship.registry || packageShip.registry || 'Pending'),
    createShipStatusBlock('Condition', conditionLabel(conditionText)),
    createShipStatusBlock('Restrictions', restrictions.length, restrictions.length > 0 ? 'warning' : 'success'),
    createShipStatusBlock('Damage', damage.length, damage.length > 0 ? 'danger' : 'success'),
    createShipStatusBlock('Tech Debt', debt.length, debt.length > 0 ? 'warning' : 'success')
  );
  identity.append(identityCopy, statusGrid);
  consoleSurface.appendChild(identity);

  const commandCard = createCard('directive-ship-command-card directive-lcars-panel');
  commandCard.appendChild(createCardTitle('Command Structure'));
  const commandGrid = createElement('div', 'directive-ship-command-grid');
  commandGrid.append(
    createShipCommandRow('Commanding Officer', commandLabel(view, command.commandingOfficer)),
    createShipCommandRow('Player Billet', command.playerBillet),
    createShipCommandRow('Player Rank', command.playerRank),
    createShipCommandRow('Prior Acting XO', commandLabel(view, command.actingXoBeforePlayer))
  );
  commandCard.appendChild(commandGrid);
  if (command.playerRole) {
    const playerRole = createElement('p', 'directive-ship-note');
    playerRole.textContent = command.playerRole;
    commandCard.appendChild(playerRole);
  }
  consoleSurface.appendChild(commandCard);

  const condition = createCard('directive-ship-condition-card directive-lcars-panel');
  condition.append(
    createCardTitle('Operational Condition'),
    createMetaRow('Current State', conditionText),
    createMetaRow('Damage', joinList(damage)),
    createMetaRow('Active Restrictions', joinList(restrictions))
  );
  consoleSurface.appendChild(condition);

  if (debt.length > 0) {
    const debtCard = createCard('directive-ship-debt-card directive-lcars-panel');
    debtCard.appendChild(createCardTitle('Known Technical Debt'));
    const list = createElement('div', 'directive-ship-caveat-list');
    for (const item of debt) {
      const caveat = createElement('p', 'directive-ship-caveat');
      caveat.textContent = item;
      list.appendChild(caveat);
    }
    debtCard.appendChild(list);
    consoleSurface.appendChild(debtCard);
  }

  body.appendChild(consoleSurface);
}
