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

function isVisibleStateRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  return value.visibility !== 'hidden'
    && value.playerVisible !== false
    && value.visibleToPlayer !== false;
}

function displayValue(value, fallback = 'None') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function compareText(a = '', b = '') {
  return String(a || '').localeCompare(String(b || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function stateRecordDisplay(value) {
  if (typeof value === 'string') {
    const label = displayValue(value, '');
    return label ? { label, detail: '', status: '', severity: '', owner: '' } : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const label = displayValue(value, '');
    return label ? { label, detail: '', status: '', severity: '', owner: '' } : null;
  }

  const label = displayValue(
    value.label
    || value.title
    || value.name
    || value.playerSafeSummary
    || value.playerSummary
    || value.summary
    || value.id,
    ''
  );
  if (!label) return null;
  const detail = displayValue(
    value.playerSafeSummary
    || value.playerSummary
    || value.summary
    || value.detail
    || value.description
    || value.effect,
    ''
  );
  return {
    id: displayValue(value.id, ''),
    label,
    detail: detail && detail !== label ? detail : '',
    status: displayValue(value.status || value.state, ''),
    severity: displayValue(value.severity || value.condition, ''),
    owner: displayValue(value.ownerName || value.department || value.assignee, '')
  };
}

function visibleStateRecordDisplays(value) {
  return asArray(value)
    .filter(isVisibleStateRecord)
    .map(stateRecordDisplay)
    .filter(Boolean)
    .sort((a, b) => compareText(a.label, b.label) || compareText(a.id, b.id));
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

function createReadinessItem(item, tone = 'warning') {
  const row = createElement('article', `directive-ship-readiness-item directive-ship-readiness-item-${tone}`);
  const marker = createElement('span', 'directive-ship-readiness-item-marker');
  marker.appendChild(createIcon('fa-solid fa-angle-right'));
  const copy = createElement('span', 'directive-ship-readiness-item-copy');
  const title = createElement('strong');
  title.textContent = item.label;
  copy.appendChild(title);
  if (item.detail) {
    const detail = createElement('span', 'directive-ship-readiness-item-detail');
    detail.textContent = item.detail;
    copy.appendChild(detail);
  }
  const metaValues = [item.status, item.severity, item.owner].filter(Boolean);
  if (metaValues.length) {
    const meta = createElement('span', 'directive-ship-readiness-item-meta');
    meta.textContent = metaValues.join(' / ');
    copy.appendChild(meta);
  }
  row.append(marker, copy);
  return row;
}

function createReadinessFolder(folder) {
  const count = folder.items.length;
  const details = createElement('details', `directive-ship-readiness-folder directive-ship-readiness-folder-${folder.tone}`);
  details.dataset.folderId = folder.id;
  if (count > 0) details.open = true;

  const summary = createElement('summary', 'directive-ship-readiness-folder-summary');
  const disclosure = createElement('span', 'directive-ship-readiness-folder-disclosure');
  disclosure.appendChild(createIcon('fa-solid fa-chevron-right'));
  const icon = createElement('span', 'directive-ship-readiness-folder-icon');
  icon.appendChild(createIcon(folder.icon));
  const copy = createElement('span', 'directive-ship-readiness-folder-copy');
  const title = createElement('strong');
  title.textContent = folder.title;
  const description = createElement('span');
  description.textContent = count ? folder.activeSummary(count) : folder.emptySummary;
  copy.append(title, description);
  const countBadge = createElement('span', 'directive-ship-readiness-folder-count');
  countBadge.textContent = count ? `${count} active` : 'Clear';
  summary.append(disclosure, icon, copy, countBadge);
  details.appendChild(summary);

  const list = createElement('div', 'directive-ship-readiness-folder-list');
  if (count) {
    for (const item of folder.items) {
      list.appendChild(createReadinessItem(item, folder.tone));
    }
  } else {
    const empty = createElement('p', 'directive-ship-readiness-folder-empty');
    empty.textContent = folder.emptySummary;
    list.appendChild(empty);
  }
  details.appendChild(list);
  return details;
}

function createReadinessFolderView({ damage, restrictions, debt }) {
  const folders = [
    {
      id: 'active-damage',
      title: 'Active Damage',
      tone: 'danger',
      icon: 'fa-solid fa-shield-halved',
      items: damage,
      activeSummary: (count) => `${count} damage record${count === 1 ? '' : 's'} affects ship readiness`,
      emptySummary: 'No active damage records.'
    },
    {
      id: 'operating-restrictions',
      title: 'Operating Restrictions',
      tone: 'warning',
      icon: 'fa-solid fa-ban',
      items: restrictions,
      activeSummary: (count) => `${count} restriction${count === 1 ? '' : 's'} affects current operations`,
      emptySummary: 'No operating restrictions active.'
    },
    {
      id: 'known-technical-debt',
      title: 'Known Technical Debt',
      tone: 'warning',
      icon: 'fa-solid fa-screwdriver-wrench',
      items: debt,
      activeSummary: (count) => `${count} validation item${count === 1 ? '' : 's'} may shape risk calls`,
      emptySummary: 'No known technical debt recorded.'
    }
  ].sort((a, b) => compareText(a.title, b.title));

  const view = createElement('div', 'directive-ship-readiness-folders');
  for (const folder of folders) {
    view.appendChild(createReadinessFolder(folder));
  }
  return view;
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
  const conditionText = ship.condition || packageShip.openingCondition;
  const damage = visibleStateRecordDisplays(ship.damage);
  const restrictions = visibleStateRecordDisplays(ship.activeRestrictions);
  const debt = visibleStateRecordDisplays(ship.technicalDebt || packageShip.systems?.knownTechnicalDebt);
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
  systemsCard.appendChild(createReadinessFolderView({ damage, restrictions, debt }));

  operationalGrid.appendChild(systemsCard);
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

  body.appendChild(consoleSurface);
}
