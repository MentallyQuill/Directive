import {
  appendBulletList,
  appendEmpty,
  appendSectionTitle,
  createCard,
  createCardTitle,
  createMetaRow,
  joinList
} from './runtime-ui-kit.js';

export function renderShipPanel(body, view) {
  appendSectionTitle(body, 'Ship');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, 'No ship state loaded.');
    return;
  }

  const ship = state.ship || {};
  const packageShip = view.activePackage?.ship || {};
  const card = createCard('directive-ship-card');
  card.append(
    createCardTitle(ship.name || packageShip.name || 'Starship'),
    createMetaRow('Class', ship.class || packageShip.class),
    createMetaRow('Affiliation', packageShip.affiliation),
    createMetaRow('Registry', ship.registry || packageShip.registry),
    createMetaRow('Commanding Officer', view.activePackage?.ship?.commandStructure?.commandingOfficer),
    createMetaRow('Player Billet', view.activePackage?.ship?.commandStructure?.playerBillet),
    createMetaRow('Acting XO Before Player', view.activePackage?.ship?.commandStructure?.actingXoBeforePlayer)
  );
  body.appendChild(card);

  const condition = createCard('directive-ship-condition-card');
  condition.append(
    createCardTitle('Condition'),
    createMetaRow('Current State', ship.condition || packageShip.openingCondition),
    createMetaRow('Damage', joinList(ship.damage)),
    createMetaRow('Active Restrictions', joinList(ship.activeRestrictions))
  );
  body.appendChild(condition);

  const debt = ship.technicalDebt || packageShip.systems?.knownTechnicalDebt || [];
  if (debt.length > 0) {
    const debtCard = createCard('directive-ship-debt-card');
    debtCard.appendChild(createCardTitle('Known Technical Debt'));
    appendBulletList(debtCard, debt);
    body.appendChild(debtCard);
  }
}
