import {
  addTooltip,
  appendEmpty,
  appendSectionTitle,
  createCard,
  createCardTitle,
  createElement,
  createIcon
} from './runtime-ui-kit.js';
import { createPackageImage } from './directive-media.js';
import {
  activePackageForView,
  currentChatEmptyMessage
} from './current-chat-scope-copy.js';
import { buildPlayerFacingInformation } from './player-facing-information.mjs';

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

function createShipStatusBlock(label, value, tone = 'neutral', icon = '', tooltip = '') {
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
  if (tooltip) addTooltip(block, tooltip);
  return block;
}

function createReadinessItem(item, tone = 'warning', folderId = '') {
  const row = createElement('article', `directive-ship-readiness-item directive-ship-readiness-item-${tone}`);
  const tourByFolder = {
    'active-damage': 'ship.readiness.damage-record',
    'operating-restrictions': 'ship.readiness.restriction-record',
    'known-technical-debt': 'ship.readiness.technical-debt-record'
  };
  if (tourByFolder[folderId]) row.dataset.directiveTour = tourByFolder[folderId];
  addTooltip(row, [item.detail, item.status, item.severity, item.owner].filter(Boolean).join(' / ') || item.label);
  const marker = createElement('span', 'directive-ship-readiness-item-marker');
  marker.setAttribute('aria-hidden', 'true');
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
  const tourByFolder = {
    'active-damage': 'ship.readiness.damage',
    'operating-restrictions': 'ship.readiness.restrictions',
    'known-technical-debt': 'ship.readiness.technical-debt'
  };
  if (tourByFolder[folder.id]) details.dataset.directiveTour = tourByFolder[folder.id];
  if (count > 0) details.open = true;

  const summary = createElement('summary', 'directive-ship-readiness-folder-summary');
  addTooltip(summary, folder.tooltip || folder.title);
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
      list.appendChild(createReadinessItem(item, folder.tone, folder.id));
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
      tooltip: 'Player-visible damage currently affecting ship readiness.',
      activeSummary: (count) => `${count} damage record${count === 1 ? '' : 's'} affects ship readiness`,
      emptySummary: 'No active damage records.'
    },
    {
      id: 'operating-restrictions',
      title: 'Operating Restrictions',
      tone: 'warning',
      icon: 'fa-solid fa-ban',
      items: restrictions,
      tooltip: 'Limits on what the ship can safely or lawfully do right now.',
      activeSummary: (count) => `${count} restriction${count === 1 ? '' : 's'} affects current operations`,
      emptySummary: 'No operating restrictions active.'
    },
    {
      id: 'known-technical-debt',
      title: 'Known Technical Debt',
      tone: 'warning',
      icon: 'fa-solid fa-screwdriver-wrench',
      items: debt,
      tooltip: 'Known unresolved ship-system caveats that may affect risk calls, not software debt.',
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

function renderPlayerFacingShip(body, information) {
  const ship = information?.ship || {};
  const surface = createElement('section', 'directive-ship-journal');
  surface.dataset.directiveTour = 'ship.status';
  const identity = createElement('section', 'directive-ship-identity');
  const title = createElement('h2', 'directive-ship-identity-title');
  title.textContent = ship.name || 'Ship';
  identity.appendChild(title);
  if (ship.condition) {
    const condition = createElement('p', 'directive-ship-condition');
    condition.textContent = ship.condition;
    identity.appendChild(condition);
  }
  surface.appendChild(identity);

  const capabilities = asArray(ship.capabilities).filter((item) => item?.label);
  if (capabilities.length) {
    const section = createElement('section', 'directive-ship-detail-section');
    section.appendChild(createCardTitle('Capabilities'));
    const list = createElement('ul');
    capabilities.forEach((item) => {
      const row = createElement('li');
      row.textContent = item.value ? `${item.label}: ${item.value}` : item.label;
      list.appendChild(row);
    });
    section.appendChild(list);
    surface.appendChild(section);
  }

  const constraints = [
    ['Restrictions', asArray(ship.restrictions)],
    ['Damage', asArray(ship.damage).map((item) => item?.label || item).filter(Boolean)]
  ];
  constraints.filter(([, items]) => items.length).forEach(([label, items]) => {
    const section = createElement('section', 'directive-ship-detail-section');
    section.appendChild(createCardTitle(label));
    const list = createElement('ul');
    items.forEach((item) => {
      const row = createElement('li');
      row.textContent = typeof item === 'string' ? item : item.label;
      list.appendChild(row);
    });
    section.appendChild(list);
    surface.appendChild(section);
  });

  if (asArray(ship.history).length) {
    const history = createElement('details', 'directive-ship-history');
    const summary = createElement('summary');
    summary.textContent = 'Technical History';
    history.appendChild(summary);
    const list = createElement('ul');
    ship.history.map((entry) => entry.summary).filter(Boolean).forEach((summaryText) => {
      const row = createElement('li');
      row.textContent = summaryText;
      list.appendChild(row);
    });
    history.appendChild(list);
    surface.appendChild(history);
  }
  body.appendChild(surface);
}

export function renderShipPanel(body, view) {
  appendSectionTitle(body, 'Ship');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, currentChatEmptyMessage(view));
    return;
  }
  const information = view?.playerFacingInformation || buildPlayerFacingInformation({
    campaignState: state,
    runtimeView: view
  });
  renderPlayerFacingShip(body, information);
}
