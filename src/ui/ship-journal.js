import { clearElement, createElement } from './runtime-ui-kit.js';
import { createPackageImage } from './directive-media.js';
import { activePackageForView } from './current-chat-scope-copy.js';
import { bindPresentationReorderHandle } from './expanded-interface-reorder.js';

let issueOrder = [];
let capabilityOrder = [];
const expandedIssues = new Set();
let shipIssuesInitialized = false;

function asArray(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }

function ordered(records, order) {
  const ids = records.map((record) => record.id);
  order.splice(0, order.length, ...order.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.includes(id)));
  return order.map((id) => records.find((record) => record.id === id)).filter(Boolean);
}

function move(order, id, offset, rerender) {
  const index = order.indexOf(id);
  const next = Math.max(0, Math.min(order.length - 1, index + offset));
  if (index < 0 || next === index) return;
  const [record] = order.splice(index, 1);
  order.splice(next, 0, record);
  rerender();
  requestAnimationFrame(() => document.querySelector(`[data-ship-handle-id="${CSS.escape(id)}"]`)?.focus());
}

function handle(kind, record, order, rerender) {
  const button = createElement('button', 'ship-record-handle');
  button.type = 'button';
  button.dataset.shipListKind = kind;
  button.dataset.shipHandleId = record.id;
  button.setAttribute('aria-label', `Reorder ${record.title || record.label}`);
  return bindPresentationReorderHandle(button, {
    itemSelector: kind === 'issues' ? '.ship-issue' : '.ship-capability',
    listSelector: kind === 'issues' ? '.ship-issue-list' : '.ship-capability-list',
    idAttribute: 'data-ship-record-id',
    order: () => [...order],
    onCommit: (next) => {
      order.splice(0, order.length, ...next);
      rerender();
      requestAnimationFrame(() => document.querySelector(`[data-ship-handle-id="${CSS.escape(record.id)}"]`)?.focus());
    }
  });
}

function hero(view, ship, mobile = false) {
  const header = createElement('header', mobile ? 'mobile-ship-hero' : 'ship-hero');
  header.appendChild(createPackageImage(activePackageForView(view), {
    kind: 'ship.hero', subjectId: ship.id, variant: 'hero'
  }, { wrapperClass: 'ship-hero-image', label: ship.name, loading: 'eager' }));
  const copy = createElement('div', mobile ? 'mobile-ship-identity' : 'ship-hero-copy');
  const identity = createElement('div');
  const kicker = createElement('div', 'ship-identity-kicker');
  kicker.textContent = ['Starfleet', ship.className].filter(Boolean).join(' / ');
  const name = createElement(mobile ? 'strong' : 'div', 'ship-identity-name');
  name.textContent = ship.name;
  const registry = createElement('span', 'ship-identity-meta');
  registry.textContent = mobile
    ? [ship.className, ship.registry].filter(Boolean).join(' / ')
    : (ship.registry || ship.className || '');
  identity.append(kicker, name, registry);
  const condition = createElement('span', mobile ? 'mobile-ship-condition' : 'ship-condition');
  condition.textContent = ship.condition || '';
  if (mobile) {
    copy.append(name, registry);
    header.append(condition, copy);
  } else {
    copy.append(identity, condition);
    header.appendChild(copy);
  }
  return header;
}

function operation(ship, mobile = false) {
  const section = createElement('section', mobile ? 'mobile-ship-operation' : 'ship-operation');
  section.setAttribute('aria-label', 'Current operation');
  const entries = mobile
    ? [['Position', ship.mobilePosition || ship.position], ['Course', ship.course], ['Flight status', ship.flightStatus]]
    : [['Position', ship.position], ['Course', ship.course], ['Flight status', ship.flightStatus]];
  entries.forEach(([label, value]) => {
    if (!value) return;
    const item = createElement('div', 'ship-operation-item');
    const key = createElement('span'); key.textContent = label;
    const content = createElement('strong'); content.textContent = value;
    item.append(key, content);
    section.appendChild(item);
  });
  return section;
}

function issueRecord(issue, rerender) {
  const open = expandedIssues.has(issue.id);
  const article = createElement('article', `ship-issue${open ? ' is-expanded' : ''}`);
  article.dataset.shipRecordId = issue.id;
  const main = createElement('div', 'ship-issue-main');
  const toggle = createElement('button', 'ship-issue-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  const top = createElement('span', 'ship-issue-top');
  const title = createElement('strong', 'ship-issue-title'); title.textContent = issue.title;
  const typeRow = createElement('span', 'ship-issue-type-row');
  const type = createElement('span', 'ship-issue-type'); type.textContent = issue.severity || 'Known issue';
  const chevron = createElement('span', 'ship-issue-chevron');
  chevron.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  typeRow.append(type, chevron);
  top.append(title, typeRow);
  const meta = createElement('span', 'ship-issue-meta');
  [issue.owner, issue.status].filter(Boolean).forEach((value) => { const span = createElement('span'); span.textContent = value; meta.appendChild(span); });
  toggle.append(top, meta);
  toggle.addEventListener('click', () => { if (open) expandedIssues.delete(issue.id); else expandedIssues.add(issue.id); rerender(); });
  const detail = createElement('div', 'ship-issue-detail');
  detail.hidden = !open;
  const label = createElement('span', 'ship-detail-label'); label.textContent = 'Operational effect';
  const effect = createElement('p', 'ship-issue-effect'); effect.textContent = issue.effect || '';
  detail.append(label, effect);
  main.append(toggle, detail);
  article.append(main, handle('issues', issue, issueOrder, rerender));
  return article;
}

function capabilityRecord(capability, rerender) {
  const row = createElement('div', 'ship-capability');
  row.dataset.shipRecordId = capability.id;
  const copy = createElement('div', 'ship-capability-copy');
  const title = createElement('strong'); title.textContent = capability.label;
  const description = createElement('span'); description.textContent = capability.description || capability.value || '';
  copy.append(title, description);
  row.append(copy, handle('capabilities', { ...capability, title: capability.label }, capabilityOrder, rerender));
  return row;
}

function recordSection(title, count, records, className, contentClassName, open = false) {
  const section = createElement('details', className);
  section.open = open;
  const summary = createElement('summary');
  const label = createElement('span'); label.textContent = title;
  const tally = createElement('span'); tally.textContent = count;
  summary.append(label, tally);
  const content = createElement('div', `ship-mobile-content ${contentClassName}`);
  records.forEach((record) => content.appendChild(record));
  section.append(summary, content);
  return section;
}

export function renderShipJournal(body, information = {}, view = {}) {
  const host = createElement('div', 'directive-ship-journal-host');
  const rerender = () => {
    clearElement(host);
    const ship = information.ship || {};
    const fallbackIssues = [
      ...asArray(ship.damage).map((entry) => ({ id: entry.id, title: entry.label || entry.title, effect: entry.effect || entry.label, status: entry.status || 'active' })),
      ...asArray(ship.restrictions).map((entry, index) => ({ id: entry?.id || `restriction-${index}`, title: entry?.label || entry, effect: entry?.summary || entry, status: entry?.status || 'active' })),
      ...asArray(ship.history).map((entry) => ({ id: entry.id, title: entry.title || entry.summary, effect: entry.summary, status: entry.status || 'active' }))
    ];
    const issues = ordered(asArray(ship.issues).length ? asArray(ship.issues) : fallbackIssues, issueOrder);
    const capabilities = ordered(asArray(ship.capabilities), capabilityOrder);
    if (!shipIssuesInitialized) {
      if (issues[0]) expandedIssues.add(issues[0].id);
      shipIssuesInitialized = true;
    }

    const desktop = createElement('section', 'ship-journal');
    desktop.dataset.directiveTour = 'ship.status';
    desktop.append(hero(view, ship), operation(ship));
    const columns = createElement('div', 'ship-status-columns');
    const issuesPanel = createElement('section', 'ship-status-panel');
    const issuesTitle = createElement('h2');
    const issuesLabel = createElement('span'); issuesLabel.textContent = 'Operational Issues';
    const issuesCount = createElement('small'); issuesCount.textContent = `${issues.length} active`;
    issuesTitle.append(issuesLabel, issuesCount);
    const issueList = createElement('div', 'ship-issue-list ship-record-list');
    issues.forEach((issue) => issueList.appendChild(issueRecord(issue, rerender)));
    issuesPanel.append(issuesTitle, issueList);
    const capabilitiesPanel = createElement('section', 'ship-status-panel');
    const capabilitiesTitle = createElement('h2');
    const capabilitiesLabel = createElement('span'); capabilitiesLabel.textContent = 'Operational Capabilities';
    const capabilitiesCount = createElement('small'); capabilitiesCount.textContent = `${capabilities.length} relevant`;
    capabilitiesTitle.append(capabilitiesLabel, capabilitiesCount);
    const capabilityList = createElement('div', 'ship-capability-list ship-record-list');
    capabilities.forEach((capability) => capabilityList.appendChild(capabilityRecord(capability, rerender)));
    capabilitiesPanel.append(capabilitiesTitle, capabilityList);
    columns.append(issuesPanel, capabilitiesPanel);
    desktop.appendChild(columns);

    const mobile = createElement('section', 'mobile-ship-journal');
    mobile.setAttribute('aria-label', 'Ship status');
    mobile.append(hero(view, ship, true), operation(ship, true));
    mobile.append(
      recordSection('Operational Issues', `${issues.length} active`, issues.map((issue) => issueRecord(issue, rerender)), 'ship-mobile-section', 'ship-issue-list ship-record-list', true),
      recordSection('Operational Capabilities', `${capabilities.length} relevant`, capabilities.map((capability) => capabilityRecord(capability, rerender)), 'ship-mobile-section', 'ship-capability-list ship-record-list')
    );
    host.append(desktop, mobile);
  };
  rerender();
  body.appendChild(host);
}
