import {
  addTooltip,
  appendBulletList,
  appendEmpty,
  appendSectionTitle,
  clearElement,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createIcon,
  createMetaRow
} from './runtime-ui-kit.js';
import {
  activePackageForView,
  currentChatEmptyMessage
} from './current-chat-scope-copy.js';
import { playerSafeAdvisoryRecords } from './advisory-records.js';
import { renderMissionComponentsPanel } from './mission-components-panel.js';

const OPEN_THREAD_STATUSES = new Set(['engaged', 'active']);
const OPEN_THREAD_SUMMARY_COLLAPSE_LENGTH = 230;
const MISSION_SUBTAB_TOOLTIPS = Object.freeze({
  'directive-mission-command-section': 'Current play surface: open chat, pending decisions, and fallback command input.',
  'directive-mission-context-section': 'Player-visible objectives, directives, pressure, and guidance.',
  'directive-mission-open-threads-section': 'Ongoing visible crew, ship, or story concerns. Hidden thread material stays private.',
  'directive-mission-sidework-section': 'Optional side assignments and opportunities that can be accepted, delegated, or paused.',
  'directive-mission-components-section': 'Player-curated source evidence, items, claims, notes, and ship issues captured from chat.'
});

let activeMissionSubtabId = 'directive-mission-command-section';
let missionSubtabEventListenerInstalled = false;

function ensureMissionSubtabEventListener() {
  if (missionSubtabEventListenerInstalled || typeof document === 'undefined') return;
  document.addEventListener?.('directive:mission-subtab', (event) => {
    const targetId = cleanText(event?.detail?.targetId || event?.targetId);
    if (targetId) activeMissionSubtabId = targetId;
  });
  missionSubtabEventListenerInstalled = true;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactText(value, maxLength = 220) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function chapterForMission(view, missionId) {
  return (activePackageForView(view)?.campaign?.chapters || []).find((chapter) => chapter.id === missionId) || null;
}

function latestLedgerEntry(state) {
  return (state?.turnLedger?.entries || []).at(-1) || null;
}

function parseJsonText(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const unfenced = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  if (!/^[{[]/.test(unfenced)) return null;
  try {
    return JSON.parse(unfenced);
  } catch {
    return null;
  }
}

function playerFacingSummary(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    const parsed = parseJsonText(value);
    if (parsed) return playerFacingSummary(parsed);
    const text = value.trim();
    return /^[{[]/.test(text) ? '' : text;
  }
  if (Array.isArray(value)) {
    return value.map((item) => playerFacingSummary(item)).find(Boolean) || '';
  }
  if (typeof value === 'object') {
    return playerFacingSummary(value.summary)
      || playerFacingSummary(value.title)
      || playerFacingSummary(value.assisted?.summary)
      || playerFacingSummary(value.finalOutcome?.summary)
      || playerFacingSummary(value.outcomePacket?.summary)
      || playerFacingSummary(value.highlights)
      || playerFacingSummary(value.visibleConsequences);
  }
  return String(value).trim();
}

function missionOutcomeSummary(entry) {
  if (!entry) return '';
  const assisted = typeof entry.assistedSummary === 'string'
    ? parseJsonText(entry.assistedSummary)
    : entry.assistedSummary;
  return playerFacingSummary([
    entry.finalOutcome,
    entry.outcomePacket,
    assisted,
    entry.summary,
    entry.visibleConsequences
  ]);
}

function missionStatusTone(value) {
  const label = String(value || '').toLowerCase();
  if (label.includes('fail') || label.includes('error') || label.includes('recovery')) return 'danger';
  if (label.includes('pending') || label.includes('warning') || label.includes('exploration')) return 'warning';
  if (label.includes('complete') || label.includes('ready') || label.includes('command')) return 'success';
  return 'neutral';
}

function formatMissionLabel(value, fallback = 'Not started') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function createMissionStatusBlock(label, value, tone = missionStatusTone(value), icon = '', tooltip = '') {
  const block = createElement('div', `directive-lcars-status-block directive-mission-status-block directive-status-${tone}`);
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

function missionScrollContainer(element) {
  return element?.closest?.('.directive-command-drawer-body, .directive-runtime-body') || null;
}

function preserveMissionSubtabScroll(scrollContainer, anchor, beforeTop) {
  if (!scrollContainer || !anchor || !Number.isFinite(beforeTop)) return;
  const restore = () => {
    const afterTop = Number(anchor.getBoundingClientRect?.().top);
    if (!Number.isFinite(afterTop)) return;
    const delta = afterTop - beforeTop;
    if (Math.abs(delta) > 0.5) {
      scrollContainer.scrollTop = Math.max(0, Number(scrollContainer.scrollTop || 0) + delta);
    }
  };
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(restore);
  } else {
    restore();
  }
}

function activateMissionSection(scope, targetId, { scrollContainer = null, anchor = null } = {}) {
  if (!scope || !targetId) return;
  activeMissionSubtabId = targetId;
  const beforeTop = Number(anchor?.getBoundingClientRect?.().top);
  for (const item of scope.querySelectorAll?.('.directive-mission-subtab') || []) {
    const itemSelected = item.dataset.missionSubtabTarget === targetId;
    item.classList?.toggle?.('directive-mission-subtab-active', itemSelected);
    item.setAttribute('aria-selected', itemSelected ? 'true' : 'false');
  }
  for (const item of scope.querySelectorAll?.('.directive-mission-section') || []) {
    item.classList?.toggle?.('directive-mission-section-active', item.id === targetId);
  }
  preserveMissionSubtabScroll(scrollContainer, anchor, beforeTop);
}

function createMissionSubtabs(sections, activeId = '') {
  const nav = createElement('nav', 'directive-mission-subtabs');
  nav.setAttribute('aria-label', 'Mission sections');
  const tourById = {
    'directive-mission-command-section': 'mission.subtab.active',
    'directive-mission-context-section': 'mission.subtab.context',
    'directive-mission-open-threads-section': 'mission.subtab.open-threads',
    'directive-mission-sidework-section': 'mission.subtab.open-world',
    'directive-mission-components-section': 'mission.subtab.components'
  };
  for (const section of sections.filter((item) => item?.id && item?.label)) {
    const selected = section.id === activeId;
    const button = createElement('button', 'directive-mission-subtab');
    button.type = 'button';
    const icon = createElement('span', 'directive-mission-subtab-icon');
    icon.appendChild(createIcon(section.icon || 'fa-solid fa-circle'));
    const label = createElement('span', 'directive-mission-subtab-label');
    label.textContent = section.label;
    button.append(icon, label);
    button.dataset.missionSubtabTarget = section.id;
    if (tourById[section.id]) button.dataset.directiveTour = tourById[section.id];
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    addTooltip(button, section.tooltip || MISSION_SUBTAB_TOOLTIPS[section.id] || section.label);
    if (selected) {
      button.className = `${button.className} directive-mission-subtab-active`.trim();
    }
    button.addEventListener('click', (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const root = typeof button.closest === 'function' ? button.closest('.directive-mission-console') : null;
      const scope = root || document;
      activateMissionSection(scope, section.id, {
        scrollContainer: missionScrollContainer(button),
        anchor: button.closest?.('.directive-mission-subtabs') || button
      });
    });
    nav.appendChild(button);
  }
  return nav;
}

function createMissionSection({ id, label, className = '', active = false, showHeading = true }) {
  const section = createElement('section', `directive-mission-section${className ? ` ${className}` : ''}`);
  section.id = id;
  const tourById = {
    'directive-mission-command-section': 'mission.command-surface',
    'directive-mission-context-section': 'mission.context',
    'directive-mission-open-threads-section': 'mission.open-threads',
    'directive-mission-sidework-section': 'mission.open-world',
    'directive-mission-components-section': 'mission.components'
  };
  if (tourById[id]) section.dataset.directiveTour = tourById[id];
  if (active) {
    section.className = `${section.className} directive-mission-section-active`.trim();
  }
  if (showHeading) {
    const heading = createElement('h3', 'directive-mission-section-title');
    heading.textContent = label;
    section.appendChild(heading);
  }
  return section;
}

function appendMissionListCard(container, title, items, className, tooltip = '') {
  const safeItems = (items || []).map(missionRecordText).filter(Boolean);
  if (safeItems.length === 0) return false;
  const card = createCard(`${className} directive-mission-list-card directive-lcars-panel`);
  if (tooltip) addTooltip(card, tooltip);
  card.appendChild(createCardTitle(title));
  appendBulletList(card, safeItems);
  container.appendChild(card);
  return true;
}

function missionRecordFieldText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (Array.isArray(value)) return value.map(missionRecordFieldText).filter(Boolean).join(', ');
  if (typeof value !== 'object') return '';
  for (const key of ['text', 'playerSafeText', 'playerSafeSummary', 'summary', 'detail', 'description', 'label', 'name', 'title', 'value', 'id']) {
    const text = missionRecordFieldText(value[key]);
    if (text) return text;
  }
  return '';
}

function missionRecordText(item) {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object') return '';
  const title = missionRecordFieldText(item.title || item.label || item.name);
  const summary = compactText(missionRecordFieldText(item.playerSafeSummary || item.summary || item.text || item.detail || item.description), 180);
  const fallback = missionRecordFieldText(item.id);
  const base = title && summary && title !== summary
    ? `${title}: ${summary}`
    : (summary || title || fallback);
  if (!base) return '';
  const status = missionRecordFieldText(item.status);
  const priority = missionRecordFieldText(item.priority);
  const meta = [
    status && !['open', 'current', 'accepted'].includes(status.toLowerCase()) ? `Status: ${status}` : '',
    priority && priority.toLowerCase() !== 'current' ? `Priority: ${priority}` : '',
    missionRecordFieldText(item.dueWindow || item.deadline || item.timeWindow) ? `Due: ${missionRecordFieldText(item.dueWindow || item.deadline || item.timeWindow)}` : '',
    missionRecordFieldText(item.owner) ? `Owner: ${missionRecordFieldText(item.owner)}` : ''
  ].filter(Boolean);
  return meta.length ? `${base} (${meta.join('; ')})` : base;
}

function playerActorIdsForState(state = {}) {
  return new Set([
    state.player?.id,
    state.player?.name,
    'player-commander'
  ].map((value) => cleanText(value).toLowerCase()).filter(Boolean));
}

function recordActorIds(record = {}) {
  return [
    ...asArray(record.assignedActorIds),
    ...asArray(record.assignedToActorIds),
    ...asArray(record.assignees)
  ].map((value) => cleanText(value).toLowerCase()).filter(Boolean);
}

function recordActorMatchesPlayer(value = '', playerIds = new Set()) {
  const text = cleanText(value).toLowerCase();
  return Boolean(text && playerIds.has(text));
}

function looksLikeDelegatedCrewOrder(record = {}) {
  const text = `${record.title || ''} ${record.summary || ''} ${record.detail || ''}`;
  return /\b(?:nayar|bronn|vale|cross|sato|saye|lieutenant|commander|ensign)\s+to\b/i.test(text)
    || /\b(?:draft by|complete within|pull ensigns|run a level|conduct a full|inspect every)\b/i.test(text);
}

function currentOrderAppliesToPlayer(record = {}, state = {}) {
  if (!record || typeof record !== 'object') return true;
  const playerIds = playerActorIdsForState(state);
  const assignedBy = record.assignedByActorId || record.assignedBy;
  if (record.assignmentScope === 'playerCurrentOrder') return true;
  if (record.assignmentScope && record.assignmentScope !== 'playerCurrentOrder') return false;
  const targets = recordActorIds(record);
  if (targets.length) return targets.some((target) => playerIds.has(target));
  if (recordActorMatchesPlayer(assignedBy, playerIds)) return false;
  if (looksLikeDelegatedCrewOrder(record)) return false;
  return true;
}

function currentSaveEntry(view, state) {
  const campaignId = state?.campaign?.id;
  return (view?.campaign?.saves || []).find((save) => save.current === true && save.metadata?.campaignId === campaignId)
    || (view?.campaign?.saves || []).find((save) => save.metadata?.campaignId === campaignId)
    || null;
}

function defaultSaveAsName(view, state) {
  const source = currentSaveEntry(view, state);
  if (source?.name) return `${source.name} Copy`;
  const playerName = state?.player?.name || 'Campaign';
  const title = state?.campaign?.title || 'Save';
  return `${playerName} - ${title} Copy`;
}

function appendOutcomeDetails(container, outcome) {
  container.append(
    createMetaRow('Result', outcome?.resultBand),
    createMetaRow('Summary', outcome?.summary)
  );
  if (outcome?.costs?.length) {
    const costTitle = createElement('h4', 'directive-inline-title');
    costTitle.textContent = 'Anchored Consequences';
    container.appendChild(costTitle);
    appendBulletList(container, outcome.costs);
  }
}

function summaryList(records = []) {
  return records.map((record) => record.summary).filter(Boolean);
}

function appendBriefSection(container, label, records = []) {
  const summaries = summaryList(records);
  if (summaries.length === 0) return;
  const title = createElement('h4', 'directive-inline-title');
  title.textContent = label;
  container.appendChild(title);
  appendBulletList(container, summaries);
}

function appendCommandBrief(container, competencePacket) {
  const brief = competencePacket?.commandBrief;
  if (!brief) return;
  const card = createCard('directive-command-brief-card directive-mission-support-card directive-lcars-panel');
  card.dataset.directiveTour = 'mission.command-brief';
  addTooltip(card, 'Professional-competence summary generated from visible facts, uncertainty, officer reports, and operational pressure.');
  card.appendChild(createCardTitle('Command Brief'));
  appendBriefSection(card, 'Routine Response', brief.routineResponse || []);
  appendBriefSection(card, 'Known Facts', brief.knownFacts || []);
  appendBriefSection(card, 'Uncertainty', brief.uncertainty || []);
  appendBriefSection(card, 'Operational Pressure', brief.operationalPressure || []);
  if (brief.commandQuestion?.summary) {
    card.appendChild(createMetaRow('Command Question', brief.commandQuestion.summary));
  }
  const reports = summaryList(competencePacket.domainReports || []);
  if (reports.length > 0) {
    appendBriefSection(card, 'Officer Reports', reports.map((summary) => ({ summary })));
  }
  container.appendChild(card);
}

function appendAdvisoryBrief(container, state) {
  const records = playerSafeAdvisoryRecords(state, { limit: 3 });
  if (records.length === 0) return false;
  const card = createCard('directive-advisory-brief-card directive-mission-support-card directive-lcars-panel');
  card.dataset.directiveTour = 'mission.advisory-notes';
  addTooltip(card, 'Player-safe advisory notes recorded from counsel requests. The scene response remains in the host chat.');
  card.appendChild(createCardTitle('Advisory Notes'));
  const list = createElement('div', 'directive-advisory-record-list');
  for (const record of records) {
    const item = createElement('article', 'directive-advisory-record');
    const label = createElement('span', 'directive-lcars-kicker');
    label.textContent = record.meta || 'Advisory';
    const title = createElement('h4', 'directive-inline-title');
    title.textContent = record.subject || 'Advisory note';
    const summary = createElement('p', 'directive-advisory-record-summary');
    summary.textContent = record.missionBrief || record.logSummary;
    item.append(label, title, summary);
    if (record.options.length) {
      appendBulletList(item, record.options.slice(0, 3));
    }
    list.appendChild(item);
  }
  card.appendChild(list);
  container.appendChild(card);
  return true;
}

function appendPressureLedger(body, state) {
  const records = (state?.pressureLedger?.records || [])
    .filter((record) => ['active', 'cooling', 'suppressed'].includes(record.status))
    .slice(0, 6);
  if (records.length === 0) return;
  const card = createCard('directive-pressure-ledger-card directive-mission-support-card directive-lcars-panel');
  card.dataset.directiveTour = 'mission.pressure';
  addTooltip(card, 'Visible obligations or deadlines that can shape future scenes.');
  card.appendChild(createCardTitle('Active Pressures'));
  appendBulletList(card, records.map((record) => {
    const status = record.status === 'active' ? 'Active' : record.status === 'cooling' ? 'Cooling' : 'Deferred';
    return `${status}: ${record.playerSummary || record.title}`;
  }));
  body.appendChild(card);
}

function crewNameMap(view, state) {
  const names = new Map();
  for (const crew of asArray(activePackageForView(view)?.crew?.senior)) {
    if (crew?.id) names.set(crew.id, crew.name || crew.id);
  }
  if (state?.player) {
    names.set('player-commander', state.player.name || 'Player Commander');
  }
  return names;
}

function threadParticipantsLabel(record, names) {
  const ids = [...new Set([
    ...asArray(record?.participants),
    ...asArray(record?.linkedCrewIds)
  ].map((id) => String(id)).filter(Boolean))];
  if (ids.length === 0) return '';
  return ids.map((id) => names.get(id) || id).join(', ');
}

function visibleOpenThreads(view, state) {
  const names = crewNameMap(view, state);
  return asArray(state?.threadLedger?.records)
    .filter((record) => record?.visibility !== 'hidden')
    .filter((record) => OPEN_THREAD_STATUSES.has(String(record.status || '').toLowerCase()))
    .map((record) => ({
      id: record.id,
      title: compactText(record.title || record.playerSummary || 'Ongoing concern', 120),
      status: formatMissionLabel(record.status, 'Open'),
      participants: threadParticipantsLabel(record, names),
      shape: formatMissionLabel(record.shape || record.type, ''),
      summary: cleanText(record.playerSummary || record.observableSeed || record.title),
      source: record.source?.id || record.originSceneId || record.lastUpdatedByOutcomeId || ''
    }));
}

function setOpenThreadToggleContent(button, expanded) {
  clearElement(button);
  const label = createElement('span');
  label.textContent = expanded ? 'Less' : 'More...';
  button.append(createIcon(expanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'), label);
}

function createOpenThreadSummary(summaryText) {
  const fullText = cleanText(summaryText);
  if (!fullText) return null;
  const wrapper = createElement('div', 'directive-mission-open-thread-summary-disclosure');
  const summary = createElement('p', 'directive-mission-open-thread-summary');
  wrapper.appendChild(summary);
  if (fullText.length <= OPEN_THREAD_SUMMARY_COLLAPSE_LENGTH) {
    summary.textContent = fullText;
    return wrapper;
  }

  summary.textContent = compactText(fullText, OPEN_THREAD_SUMMARY_COLLAPSE_LENGTH);
  const toggle = createElement('button', 'directive-mission-open-thread-summary-toggle directive-secondary-command');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Show full open thread summary');
  setOpenThreadToggleContent(toggle, false);
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    summary.textContent = expanded ? fullText : compactText(fullText, OPEN_THREAD_SUMMARY_COLLAPSE_LENGTH);
    wrapper.classList.toggle('directive-mission-open-thread-summary-expanded', expanded);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.setAttribute('aria-label', expanded ? 'Collapse open thread summary' : 'Show full open thread summary');
    setOpenThreadToggleContent(toggle, expanded);
  });
  wrapper.appendChild(toggle);
  return wrapper;
}

function createOpenThreadCard(thread) {
  const card = createElement('article', 'directive-mission-open-thread-card');
  addTooltip(card, 'Visible ongoing concern that can influence future scenes. Hidden thread material is not shown here.');
  const header = createElement('div', 'directive-mission-open-thread-card-header');
  const titleBlock = createElement('div', 'directive-mission-open-thread-titleblock');
  const kicker = createElement('span', 'directive-mission-open-thread-kicker');
  kicker.textContent = thread.shape || 'Open Thread';
  const title = createElement('h4', 'directive-mission-open-thread-title');
  title.textContent = thread.title;
  titleBlock.append(kicker, title);
  const status = createElement('span', 'directive-mission-open-thread-status');
  status.textContent = thread.status;
  header.append(titleBlock, status);
  card.appendChild(header);

  const facts = [
    ['Participants', thread.participants],
    ['Source', thread.source]
  ].filter(([, value]) => value);
  if (facts.length) {
    const factGrid = createElement('div', 'directive-mission-open-thread-fact-grid');
    for (const [label, value] of facts) {
      const fact = createElement('div', 'directive-mission-open-thread-fact');
      const key = createElement('span', 'directive-mission-open-thread-fact-label');
      key.textContent = label;
      const content = createElement('span', 'directive-mission-open-thread-fact-value');
      content.textContent = value;
      fact.append(key, content);
      factGrid.appendChild(fact);
    }
    card.appendChild(factGrid);
  }

  const summary = createOpenThreadSummary(thread.summary);
  if (summary) card.appendChild(summary);
  return card;
}

function appendOpenThreadsLedger(body, view, state) {
  const threads = visibleOpenThreads(view, state);
  const console = createElement('div', 'directive-mission-open-threads-console directive-lcars-panel');
  addTooltip(console, 'Open Threads are player-visible ongoing crew, ship, or story concerns.');
  const header = createElement('div', 'directive-mission-open-threads-header');
  const titleBlock = createElement('div', 'directive-mission-open-threads-titleblock');
  const title = createElement('h4', 'directive-mission-open-threads-title');
  title.textContent = 'Open Threads';
  const summary = createElement('p', 'directive-mission-open-threads-summary');
  summary.textContent = threads.length
    ? `${threads.length} visible ongoing concern${threads.length === 1 ? '' : 's'} currently active or engaged.`
    : 'No visible ongoing concerns are currently active or engaged.';
  titleBlock.append(title, summary);
  header.appendChild(titleBlock);
  console.appendChild(header);

  const list = createElement('div', 'directive-mission-open-threads-list');
  if (threads.length) {
    for (const thread of threads) list.appendChild(createOpenThreadCard(thread));
  } else {
    const empty = createElement('div', 'directive-mission-open-threads-empty');
    const emptyTitle = createElement('strong');
    emptyTitle.textContent = 'No Open Threads';
    const emptyCopy = createElement('p');
    emptyCopy.textContent = 'Latent, watchlisted, and hidden thread material stays out of the player-facing view until it becomes active or engaged.';
    empty.append(emptyTitle, emptyCopy);
    list.appendChild(empty);
  }
  console.appendChild(list);
  body.appendChild(console);
}

function isChapterCheckpointVisible(state, checkpointRecord) {
  const chapterId = checkpointRecord?.chapterId;
  const checkpoint = checkpointRecord?.checkpoint;
  if (!chapterId || checkpoint?.rawValuesHidden !== true) return false;
  return asArray(state?.storyArcLedger?.completedMilestoneIds).includes(chapterId)
    || asArray(state?.storyArcLedger?.arcs).some((arc) => arc?.completedMilestoneIds?.includes?.(chapterId));
}

function firstVisibleMvpCheckpoint(view, state) {
  return (activePackageForView(view)?.mvpCheckpoints || [])
    .find((checkpointRecord) => isChapterCheckpointVisible(state, checkpointRecord)) || null;
}

function appendCheckpointSection(card, label, items = []) {
  const safeItems = (items || []).filter(Boolean);
  if (safeItems.length === 0) return;
  const title = createElement('h4', 'directive-inline-title');
  title.textContent = label;
  card.appendChild(title);
  appendBulletList(card, safeItems);
}

function appendMvpCheckpoint(body, view, state) {
  const record = firstVisibleMvpCheckpoint(view, state);
  const checkpoint = record?.checkpoint;
  if (!checkpoint) return;

  const card = createCard('directive-mvp-checkpoint-card directive-mission-support-card directive-lcars-panel');
  card.append(
    createCardTitle(checkpoint.label || `${record.title || 'Chapter'} Complete`),
    createMetaRow('Status', 'Chapter 1 complete'),
    createMetaRow('Next', checkpoint.chapter2OpenReason || 'Chapter 2 can open from the completed record.')
  );
  appendCheckpointSection(card, 'Established', checkpoint.established);
  appendCheckpointSection(card, 'Unresolved', checkpoint.unresolved);
  appendCheckpointSection(card, 'Carry Forward', checkpoint.carryForward);
  card.appendChild(createMetaRow('Safe Alpha Actions', 'Save, review the Log, schedule Follow-Up Opportunities, or continue into False Colors when ready.'));
  body.appendChild(card);
}

function missionNextAction(view, state) {
  const pendingChat = (view?.chatNative?.pendingInteractions || [])
    .findLast?.((interaction) => interaction?.status === 'pending')
    || [...(view?.chatNative?.pendingInteractions || [])].reverse().find((interaction) => interaction?.status === 'pending');
  if (pendingChat) return 'Resolve the pending campaign interaction here, then continue play in the bound chat.';
  if (view?.pendingDirectorTurn) return 'Review the provisional outcome, then accept it, invoke an eligible command option, or discard it.';
  if (state?.turnLedger?.pendingNarrationRecovery) return 'Repair the pending narration before continuing the mission.';
  if (view?.pendingOutcomeReplacement) return 'Review the replacement outcome before changing the committed record.';
  if (view?.chatNative?.binding?.chatId) return 'Continue play in the bound campaign chat. Directive will classify each player post and escalate consequential turns.';
  return 'Bind a campaign chat before continuing play.';
}

function sideWorkSnapshot(view) {
  const quests = asArray(view?.openWorld?.quests);
  const opportunities = asArray(view?.openWorld?.opportunities);
  const active = quests.filter((quest) => ['active', 'accepted'].includes(String(quest.status || '').toLowerCase())).length;
  const delegated = quests.filter((quest) => String(quest.status || '').toLowerCase() === 'delegated').length;
  const available = quests.filter((quest) => ['available', 'offered'].includes(String(quest.status || '').toLowerCase())).length;

  return {
    quests: quests.length,
    opportunities: opportunities.length,
    active,
    delegated,
    available
  };
}

function sideWorkTone(count, active = false) {
  if (active) return 'warning';
  return count > 0 ? 'success' : 'neutral';
}

function createMissionSideWorkStatusBlock(label, value, tone = 'neutral', icon = '', detail = '', tooltip = '') {
  const block = createElement('div', `directive-lcars-status-block directive-mission-sidework-status-block directive-status-${tone}`);
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
  if (detail) {
    const description = createElement('span', 'directive-lcars-status-detail');
    description.textContent = detail;
    copy.appendChild(description);
  }
  block.appendChild(copy);
  if (tooltip) addTooltip(block, tooltip);
  return block;
}

function createMissionSideWorkConsole(view) {
  const snapshot = sideWorkSnapshot(view);
  const totalWork = snapshot.quests + snapshot.opportunities;
  const shell = createElement('div', 'directive-mission-sidework-console directive-lcars-panel');
  addTooltip(shell, 'Optional side assignments and opportunities outside the active mission thread.');
  const header = createElement('div', 'directive-mission-sidework-console-header');
  const titleBlock = createElement('div', 'directive-mission-sidework-titleblock');
  const title = createElement('h4', 'directive-mission-sidework-console-title');
  title.textContent = 'Open World';
  const summary = createElement('p', 'directive-mission-sidework-summary');
  summary.textContent = totalWork > 0
    ? 'Open-world quests and opportunities are available without interrupting the active campaign thread.'
    : 'No open-world quest work is currently visible.';
  titleBlock.append(title, summary);
  header.appendChild(titleBlock);

  const body = createElement('div', 'directive-mission-sidework-body');
  shell.append(header, body);
  if (totalWork > 0) {
    const statusGrid = createElement('div', 'directive-mission-sidework-status-grid');
    statusGrid.append(
      createMissionSideWorkStatusBlock('Visible Quests', snapshot.quests, sideWorkTone(snapshot.quests), 'fa-solid fa-compass', 'Player-safe', 'Open-world quest records currently safe for the player to see.'),
      createMissionSideWorkStatusBlock('Available', snapshot.available, sideWorkTone(snapshot.available), 'fa-solid fa-clipboard-check', 'Offer or accept', 'Side work available to accept or offer without interrupting the active mission.'),
      createMissionSideWorkStatusBlock('Active', snapshot.active, sideWorkTone(snapshot.active, snapshot.active > 0), 'fa-solid fa-play', 'Foreground', 'Open-world quest work currently in the foreground.'),
      createMissionSideWorkStatusBlock(
        'Delegated',
        snapshot.delegated,
        sideWorkTone(snapshot.delegated),
        'fa-solid fa-circle-check',
        'Offscreen progress',
        'Side work assigned away from the player for offscreen progress.'
      )
    );
    shell.appendChild(statusGrid);
  }
  return { shell, body };
}

function createMissionSideWorkCard({
  className = '',
  title = 'Side Work',
  kicker = '',
  status = '',
  tone = 'neutral',
  tooltip = ''
} = {}) {
  const card = createElement('article', `directive-mission-sidework-card${className ? ` ${className}` : ''}`);
  if (tooltip) addTooltip(card, tooltip);
  const header = createElement('div', 'directive-mission-sidework-card-header');
  const text = createElement('div', 'directive-mission-sidework-card-titleblock');
  if (kicker) {
    const label = createElement('span', 'directive-mission-sidework-kicker');
    label.textContent = kicker;
    text.appendChild(label);
  }
  const heading = createElement('h4', 'directive-mission-sidework-card-title');
  heading.textContent = title;
  text.appendChild(heading);
  header.appendChild(text);
  if (status) {
    const badge = createElement('span', `directive-mission-sidework-badge directive-status-${tone}`);
    badge.textContent = status;
    header.appendChild(badge);
  }
  card.appendChild(header);
  return card;
}

function appendMissionSideWorkFacts(container, entries = []) {
  const safeEntries = entries.filter(([label, value]) => {
    return label && value !== undefined && value !== null && String(value).trim() !== '';
  });
  if (safeEntries.length === 0) return null;

  const grid = createElement('div', 'directive-mission-sidework-fact-grid');
  for (const [label, value] of safeEntries) {
    const item = createElement('div', 'directive-mission-sidework-fact');
    const key = createElement('span', 'directive-mission-sidework-fact-label');
    key.textContent = label;
    const content = createElement('span', 'directive-mission-sidework-fact-value');
    content.textContent = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
    item.append(key, content);
    grid.appendChild(item);
  }
  container.appendChild(grid);
  return grid;
}

function createMissionSideWorkActionRow() {
  return createElement('div', 'directive-action-row directive-mission-sidework-action-row');
}

function appendMissionSideWorkEmpty(container) {
  const empty = createElement('div', 'directive-mission-sidework-empty');
  const emblem = createElement('span', 'directive-mission-sidework-empty-emblem');
  emblem.appendChild(createIcon('fa-solid fa-star'));
  const title = createElement('strong');
  title.textContent = 'No Open-World Work Is Active';
  const summary = createElement('p');
  summary.textContent = 'No quest opportunities are currently active or visible.';
  const hint = createElement('span');
  hint.textContent = 'New opportunities appear as threads, pressures, and locations change.';
  const reviewButton = createButton({
    label: 'Review Command Brief',
    icon: 'fa-regular fa-file-lines',
    className: 'directive-button directive-secondary-command directive-mission-sidework-review-command',
    title: 'Return to the Mission command section',
    onClick: (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const root = typeof empty.closest === 'function' ? empty.closest('.directive-mission-console') : null;
      activateMissionSection(root || document, 'directive-mission-command-section', {
        scrollContainer: missionScrollContainer(empty),
        anchor: root?.querySelector?.('.directive-mission-subtabs') || empty
      });
    }
  });
  empty.append(emblem, title, summary, hint, reviewButton);
  container.appendChild(empty);
}

function createMissionRecoveryStatusBlock(label, value, tone = missionStatusTone(value), icon = '', detail = '', tooltip = '') {
  const block = createElement('div', `directive-lcars-status-block directive-mission-recovery-status-block directive-status-${tone}`);
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
  if (detail) {
    const description = createElement('span', 'directive-lcars-status-detail');
    description.textContent = detail;
    copy.appendChild(description);
  }
  block.appendChild(copy);
  if (tooltip) addTooltip(block, tooltip);
  return block;
}

function createMissionRecoveryConsole(view, state) {
  const currentSave = currentSaveEntry(view, state);
  const latestLedger = latestLedgerEntry(state);
  const pendingNarration = state?.turnLedger?.pendingNarrationRecovery;
  const hasOutcome = Boolean(state?.turnLedger?.lastCommittedOutcomeId || view?.lastDirectorTurn);
  const shell = createElement('div', 'directive-mission-recovery-console directive-lcars-panel');
  shell.dataset.directiveTour = 'mission.recovery';
  addTooltip(shell, 'Save, narration retry, reconciliation, and outcome repair tools.');
  const header = createElement('div', 'directive-mission-recovery-console-header');
  const titleBlock = createElement('div', 'directive-mission-recovery-titleblock');
  const title = createElement('h4', 'directive-mission-recovery-console-title');
  title.textContent = 'Recovery Console';
  const summary = createElement('p', 'directive-mission-recovery-summary');
  summary.textContent = 'Save and repair actions are grouped away from normal mission command.';
  titleBlock.append(title, summary);
  header.appendChild(titleBlock);

  const body = createElement('div', 'directive-mission-recovery-body');
  shell.append(header);
  if (pendingNarration || hasOutcome || currentSave) {
    const statusGrid = createElement('div', 'directive-mission-recovery-status-grid');
    if (currentSave) {
      statusGrid.appendChild(createMissionRecoveryStatusBlock('Save', 'Mounted', 'success', 'fa-solid fa-floppy-disk', currentSave.name || 'Active save', 'The active campaign save mounted in runtime state.'));
    }
    if (pendingNarration) {
      statusGrid.appendChild(createMissionRecoveryStatusBlock('Narration', 'Repair Available', 'danger', 'fa-solid fa-message', pendingNarration.message || 'Latest turn', 'A committed outcome needs narration repair before play should continue.'));
    } else if (latestLedger?.narrationStatus && !/ready|complete/i.test(latestLedger.narrationStatus)) {
      statusGrid.appendChild(createMissionRecoveryStatusBlock('Narration', latestLedger.narrationStatus, missionStatusTone(latestLedger.narrationStatus), 'fa-solid fa-message', 'Latest turn', 'Narration status for the latest committed turn.'));
    }
    if (hasOutcome) {
      statusGrid.appendChild(createMissionRecoveryStatusBlock('Outcome', 'Recorded', 'success', 'fa-solid fa-crosshairs', 'Committed outcome', 'A mechanics outcome is already committed and can be reviewed or repaired without rerolling by default.'));
    }
    shell.appendChild(statusGrid);
  }
  shell.appendChild(body);
  return { shell, body };
}

function createMissionRecoveryCard({
  className = '',
  title = 'Recovery',
  kicker = '',
  status = '',
  tone = 'neutral',
  tooltip = ''
} = {}) {
  const card = createElement('article', `directive-mission-recovery-card${className ? ` ${className}` : ''}`);
  if (tooltip) addTooltip(card, tooltip);
  const header = createElement('div', 'directive-mission-recovery-card-header');
  const text = createElement('div', 'directive-mission-recovery-card-titleblock');
  if (kicker) {
    const label = createElement('span', 'directive-mission-recovery-kicker');
    label.textContent = kicker;
    text.appendChild(label);
  }
  const heading = createElement('h4', 'directive-mission-recovery-card-title');
  heading.textContent = title;
  text.appendChild(heading);
  header.appendChild(text);
  if (status) {
    const badge = createElement('span', `directive-mission-recovery-badge directive-status-${tone}`);
    badge.textContent = status;
    header.appendChild(badge);
  }
  card.appendChild(header);
  return card;
}

function appendMissionRecoveryFacts(container, entries = []) {
  const safeEntries = entries.filter(([label, value]) => {
    return label && value !== undefined && value !== null && String(value).trim() !== '';
  });
  if (safeEntries.length === 0) return null;

  const grid = createElement('div', 'directive-mission-recovery-fact-grid');
  for (const [label, value] of safeEntries) {
    const item = createElement('div', 'directive-mission-recovery-fact');
    const key = createElement('span', 'directive-mission-recovery-fact-label');
    key.textContent = label;
    const content = createElement('span', 'directive-mission-recovery-fact-value');
    content.textContent = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
    item.append(key, content);
    grid.appendChild(item);
  }
  container.appendChild(grid);
  return grid;
}

function createMissionRecoveryActionRow(className = '') {
  return createElement('div', `directive-action-row directive-mission-recovery-action-row${className ? ` ${className}` : ''}`);
}

function createMissionRecoveryCommandRow({
  title,
  summary,
  control = null,
  action = null,
  className = ''
} = {}) {
  const row = createElement('div', `directive-mission-recovery-command-row${className ? ` ${className}` : ''}`);
  const copy = createElement('div', 'directive-mission-recovery-command-copy');
  const heading = createElement('strong');
  heading.textContent = title || 'Recovery action';
  const description = createElement('span');
  description.textContent = summary || '';
  copy.append(heading, description);
  const controls = createElement('div', 'directive-mission-recovery-command-controls');
  if (control) controls.appendChild(control);
  if (action) controls.appendChild(action);
  row.append(copy, controls);
  return row;
}

function pendingSceneReconciliationItems(view, state) {
  const reconciliation = view?.chatNative?.sceneReconciliation || state?.runtimeTracking?.sceneReconciliation || null;
  const pending = Array.isArray(reconciliation?.pending)
    ? reconciliation.pending.filter((item) => item?.status === 'pending')
    : [];
  return {
    reconciliation,
    pending,
    lastResult: reconciliation?.lastResult || view?.lastSceneReconciliationResult?.result || view?.lastSceneReconciliationResult || null
  };
}

function proposalRootSummary(item) {
  const roots = Array.isArray(item?.allowedRoots) && item.allowedRoots.length
    ? item.allowedRoots
    : [...new Set((item?.operations || [])
      .map((operation) => String(operation?.path || '').split('.')[0])
      .filter(Boolean))];
  return roots.length ? roots.join(', ') : 'Directive state';
}

function appendSceneReconciliationReview(body, view, state, actions) {
  const { reconciliation, pending, lastResult } = pendingSceneReconciliationItems(view, state);
  if (!reconciliation && !lastResult) return;
  if (!pending.length && !lastResult) return;

  const card = createMissionRecoveryCard({
    className: 'directive-scene-reconciliation-card',
    title: 'Scene Reconciliation',
    kicker: 'Changed Passage',
    status: pending.length ? `${pending.length} Pending` : 'Ready',
    tone: pending.length ? 'warning' : 'success',
    tooltip: 'Review proposed state updates when a host chat passage changes after Directive has already tracked it.'
  });

  appendMissionRecoveryFacts(card, [
    ['Last Result', lastResult?.summary],
    ['Start Marker', reconciliation?.markers?.start?.textPreview],
    ['End Marker', reconciliation?.markers?.end?.textPreview]
  ]);

  const visiblePending = pending.slice(-4);
  for (const item of visiblePending) {
    const applyAction = createButton({
      label: 'Apply',
      icon: 'fa-solid fa-check',
      className: 'directive-button directive-primary-command',
      title: 'Apply this pending reconciliation item.',
      disabled: typeof actions.applyPendingReconciliation !== 'function',
      onClick: async () => {
        await actions.applyPendingReconciliation({ proposalId: item.id });
        await actions.refresh();
      }
    });
    const rejectAction = createButton({
      label: 'Reject',
      icon: 'fa-solid fa-xmark',
      className: 'directive-button',
      title: 'Reject this pending reconciliation item.',
      disabled: typeof actions.rejectPendingReconciliation !== 'function',
      onClick: async () => {
        await actions.rejectPendingReconciliation({ proposalId: item.id });
        await actions.refresh();
      }
    });
    const controls = createMissionRecoveryActionRow('directive-scene-reconciliation-review-actions');
    controls.append(applyAction, rejectAction);
    card.appendChild(createMissionRecoveryCommandRow({
      title: item.summary || 'Pending reconciliation item',
      summary: `${proposalRootSummary(item)} - ${item.reviewReason || 'needs review'}`,
      action: controls,
      className: 'directive-scene-reconciliation-review-row'
    }));
  }

  if (pending.length > visiblePending.length) {
    const more = createElement('p', 'directive-runtime-empty directive-scene-reconciliation-more');
    more.textContent = `${pending.length - visiblePending.length} older pending item${pending.length - visiblePending.length === 1 ? '' : 's'} hidden.`;
    card.appendChild(more);
  }

  body.appendChild(card);
}

function appendOpenWorldQuestCards(body, view, actions) {
  const quests = asArray(view?.openWorld?.quests);
  if (quests.length === 0) return;

  for (const quest of quests) {
    const status = String(quest.status || '').toLowerCase();
    const card = createMissionSideWorkCard({
      className: 'directive-open-world-quest-card directive-open-orders-candidate',
      title: quest.title || quest.id || 'Open-World Quest',
      kicker: quest.kind ? formatMissionLabel(quest.kind, 'Quest') : 'Quest',
      status: quest.foreground ? 'Foreground' : formatMissionLabel(quest.status, 'Visible'),
      tone: quest.foreground || status === 'active' ? 'warning' : status === 'delegated' ? 'success' : 'neutral',
      tooltip: 'Optional side assignment that can be accepted, focused, delegated, paused, or abandoned depending on status.'
    });
    appendMissionSideWorkFacts(card, [
      ['Status', formatMissionLabel(quest.status, 'Visible')],
      ['Summary', quest.playerSummary],
      ['Objectives', asArray(quest.currentObjectiveIds).join(', ')],
      ['Actors', asArray(quest.assignedActorIds).join(', ')],
      ['Locations', asArray(quest.locationIds).join(', ')]
    ]);

    const row = createMissionSideWorkActionRow();
    if (['available', 'offered'].includes(status) && typeof actions.acceptOpenWorldQuest === 'function') {
      row.appendChild(createButton({
        label: 'Accept',
        icon: 'fa-solid fa-check',
        title: `Accept ${quest.title || quest.id}`,
        onClick: async () => {
          await actions.acceptOpenWorldQuest({ questId: quest.id, makeForeground: true });
          await actions.refresh();
        }
      }));
    }
    if (!quest.foreground && ['available', 'offered', 'accepted', 'active'].includes(status) && typeof actions.activateOpenWorldQuest === 'function') {
      row.appendChild(createButton({
        label: 'Focus',
        icon: 'fa-solid fa-location-crosshairs',
        title: `Make ${quest.title || quest.id} the foreground quest`,
        onClick: async () => {
          await actions.activateOpenWorldQuest({ questId: quest.id });
          await actions.refresh();
        }
      }));
    }
    if (['accepted', 'active'].includes(status) && typeof actions.delegateOpenWorldQuest === 'function') {
      row.appendChild(createButton({
        label: 'Delegate',
        icon: 'fa-solid fa-share-nodes',
        title: `Delegate ${quest.title || quest.id}`,
        onClick: async () => {
          await actions.delegateOpenWorldQuest({ questId: quest.id, actorIds: asArray(quest.assignedActorIds) });
          await actions.refresh();
        }
      }));
    }
    if (quest.foreground && typeof actions.pauseOpenWorldQuest === 'function') {
      row.appendChild(createButton({
        label: 'Pause',
        icon: 'fa-solid fa-pause',
        title: `Pause ${quest.title || quest.id}`,
        onClick: async () => {
          await actions.pauseOpenWorldQuest();
          await actions.refresh();
        }
      }));
    }
    if (!['resolved', 'failed', 'abandoned', 'expired', 'transformed'].includes(status) && typeof actions.abandonOpenWorldQuest === 'function') {
      row.appendChild(createButton({
        label: 'Abandon',
        icon: 'fa-solid fa-ban',
        title: `Abandon ${quest.title || quest.id}`,
        onClick: async () => {
          await actions.abandonOpenWorldQuest({ questId: quest.id });
          await actions.refresh();
        }
      }));
    }
    if (row.children.length > 0) card.appendChild(row);
    body.appendChild(card);
  }
}

function appendProceduralWarnings(container, pending, actions) {
  const warnings = pending?.competencePacket?.proceduralWarnings || [];
  const confirmation = pending?.warningConfirmation || {};
  if (warnings.length === 0) return false;

  const card = createCard('directive-procedural-warning-card directive-mission-support-card directive-lcars-panel');
  card.appendChild(createCardTitle(confirmation.required ? 'Procedure Check' : 'Procedure Note'));
  if (confirmation.message) {
    card.appendChild(createMetaRow('Status', confirmation.message));
  }
  for (const warning of warnings) {
    const section = createElement('div', 'directive-warning-block');
    section.append(
      createMetaRow('Severity', warning.severity),
      createMetaRow('Proposed Action', warning.proposedAction),
      createMetaRow('Standard Concern', warning.standardConcern),
      createMetaRow('Known Consequence', warning.knownConsequence),
      createMetaRow('Exception Basis', warning.availableBasisForException)
    );
    card.appendChild(section);
  }

  if (confirmation.required) {
    const row = createElement('div', 'directive-action-row');
    row.append(
      createButton({
        label: 'Confirm Risk',
        icon: 'fa-solid fa-triangle-exclamation',
        title: 'Confirm informed intent and accept this risk',
        onClick: async () => {
          await actions.commitProvisionalDirectorTurn({
            confirmWarnings: true,
            confirmedWarningIds: confirmation.warningIds || [],
            generateNarration: true
          });
          await actions.refresh();
        }
      }),
      createButton({
        label: 'Revise Order',
        icon: 'fa-solid fa-pen-to-square',
        title: 'Discard this preview and revise the order',
        onClick: async () => {
          await actions.discardProvisionalDirectorTurn();
          await actions.refresh();
        }
      }),
      createButton({
        label: 'Request Counsel',
        icon: 'fa-solid fa-comments',
        title: 'Ask officers for compact counsel before deciding',
        onClick: async () => {
          await actions.previewDirectorTurn({
            playerInput: 'Recommendations? What am I overlooking before I confirm this risk?'
          });
          await actions.refresh();
        }
      })
    );
    card.appendChild(row);
  }

  container.appendChild(card);
  return confirmation.required === true;
}

function pendingChatInteraction(view) {
  const interactions = view?.chatNative?.pendingInteractions || [];
  return [...interactions].reverse().find((interaction) => interaction?.status === 'pending') || null;
}

function chatSetupRecoveryCommand(view) {
  const openingScene = view?.chatNative?.openingScene || null;
  if (openingScene?.blocked) {
    return {
      label: openingScene.actionLabel || 'Build Opening Scene',
      icon: openingScene.reason === 'activation-incomplete' ? 'fa-solid fa-play' : 'fa-solid fa-wand-magic-sparkles',
      title: openingScene.summary || 'Build the campaign opening scene before play can continue.'
    };
  }
  const failed = view?.chatNative?.activation?.status === 'failed'
    || view?.campaignState?.campaign?.status === 'activationFailed';
  return {
    label: failed ? 'Retry Chat Setup' : 'Finish Chat Setup',
    icon: failed ? 'fa-solid fa-rotate-right' : 'fa-solid fa-play',
    title: failed
      ? 'Retry campaign chat setup without duplicating completed activation steps'
      : 'Finish campaign chat setup: create or open the bound chat, post the intro once, and install prompt context'
  };
}

async function buildOpeningScene(actions) {
  const action = actions?.buildCampaignOpeningScene || actions?.retryCampaignActivation;
  if (typeof action !== 'function') return null;
  return action();
}

function appendChatPlaySurface(body, view, actions) {
  const binding = view?.chatNative?.binding || null;
  const openingScene = view?.chatNative?.openingScene || null;
  const prompt = view?.chatNative?.prompt || view?.promptInspection || null;
  const continuity = view?.continuityProjectionDiagnostics || null;
  const tracking = view?.chatNative?.tracking || null;
  const card = createCard('directive-chat-play-surface-card directive-mission-command-card directive-lcars-panel');
  card.dataset.directiveTour = 'mission.chat-play';
  addTooltip(card, 'Bound campaign chat status, installed prompt context, and tracked turn counters.');
  const header = createElement('div', 'directive-mission-command-header');
  const copy = createElement('div', 'directive-mission-command-header-copy');
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = 'Play Surface';
  const title = createElement('h3', 'directive-mission-command-title');
  title.textContent = openingScene?.blocked
    ? 'Opening Scene Required'
    : (binding?.chatId ? 'Campaign Chat Bound' : 'Campaign Chat Unbound');
  const guidance = createElement('p', 'directive-mission-command-guidance');
  guidance.textContent = openingScene?.blocked
    ? (openingScene.summary || 'The campaign needs its opening scene before play can continue.')
    : (binding?.chatId
    ? 'Write normal in-character posts in the host chat. Directive interprets, records, injects context, and pauses only when a decision requires review.'
    : 'Chat-native play is unavailable until this campaign is bound to a host chat.');
  copy.append(kicker, title, guidance);
  const status = createElement('span', 'directive-mission-command-state');
  status.textContent = openingScene?.blocked ? 'Setup Required' : (binding?.chatId ? 'Chat Native' : 'Fallback');
  header.append(copy, status);
  const continuityRow = createMetaRow(
    'Continuity Matrix',
    continuity
      ? `${formatMissionLabel(continuity.status, 'Unknown')} / ${continuity.blockCount ?? 0} blocks / ${continuity.conflictCount ?? 0} conflicts`
      : 'Not installed'
  );
  continuityRow.className = `${continuityRow.className || ''} directive-mission-continuity-state`.trim();
  card.append(
    header,
    createMetaRow('Bound Chat', binding?.chatName || binding?.name || binding?.chatId || 'Not bound'),
    createMetaRow('Prompt Context', prompt?.revision !== undefined ? `Revision ${prompt.revision}` : (binding?.promptContextRevision !== undefined ? `Revision ${binding.promptContextRevision}` : 'Not installed')),
    continuityRow,
    createMetaRow('Tracked Turns', tracking?.ingressCount ?? 0),
    createMetaRow('Committed Revision', tracking?.lastStableRevision ?? tracking?.revision ?? 0)
  );

  const row = createElement('div', 'directive-action-row');
  row.appendChild(createButton({
    label: 'Open Campaign Chat',
    icon: 'fa-solid fa-comments',
    className: 'directive-button directive-primary-command',
    title: 'Open the chat bound to this campaign',
    disabled: !binding?.chatId || typeof actions.openCampaignChat !== 'function',
    onClick: async () => {
      await actions.openCampaignChat();
      await actions.refresh();
    }
  }));
  if ((openingScene?.blocked || !binding?.chatId) && typeof (actions?.buildCampaignOpeningScene || actions?.retryCampaignActivation) === 'function') {
    const recoveryCommand = chatSetupRecoveryCommand(view);
    row.appendChild(createButton({
      label: recoveryCommand.label,
      icon: recoveryCommand.icon,
      className: 'directive-button directive-secondary-command',
      title: recoveryCommand.title,
      onClick: async () => {
        await buildOpeningScene(actions);
        await actions.refresh();
      }
    }));
  }
  card.appendChild(row);
  body.appendChild(card);
}

function interactionLabel(kind) {
  return formatMissionLabel(kind, 'Campaign Decision');
}

function terminalDecisionRecord(view, interaction) {
  const ledger = view?.campaignState?.runtimeTracking?.endConditionLedger || {};
  const decisionId = interaction?.metadata?.decisionId || interaction?.id || ledger.activeDecisionId || null;
  return asArray(ledger.decisions).find((decision) => decision.id === decisionId)
    || asArray(ledger.decisions).find((decision) => decision.id === ledger.activeDecisionId)
    || null;
}

function terminalBranchCount(view, interaction) {
  const ledger = view?.campaignState?.runtimeTracking?.endConditionLedger || {};
  const decisionId = interaction?.metadata?.decisionId || interaction?.id || null;
  return asArray(ledger.branchRecords).filter((record) => !decisionId || record.decisionId === decisionId).length;
}

function checkpointLabel(checkpoint = {}) {
  const source = formatMissionLabel(checkpoint.source, 'Checkpoint');
  return checkpoint.retained === false ? `${source} fallback` : source;
}

function terminalActionIcon(action) {
  switch (action) {
    case 'replay':
    case 'replayFromCheckpoint':
      return 'fa-solid fa-clock-rotate-left';
    case 'pushOn':
    case 'push-on':
      return 'fa-solid fa-forward';
    case 'keep':
    case 'keepEnding':
      return 'fa-solid fa-flag-checkered';
    case 'saveBranch':
    case 'saveTerminalBranch':
      return 'fa-solid fa-code-branch';
    default:
      return 'fa-solid fa-check';
  }
}

function terminalActionClass(action) {
  if (action === 'keepEnding' || action === 'keep') return 'directive-button directive-secondary-command';
  if (action === 'saveTerminalBranch' || action === 'saveBranch') return 'directive-button directive-secondary-command';
  return 'directive-button directive-primary-command';
}

function appendTerminalOutcomeDecision(body, view, actions, interaction) {
  const metadata = interaction?.metadata || {};
  const decision = terminalDecisionRecord(view, interaction);
  const savedBranchCount = terminalBranchCount(view, interaction);
  const card = createCard('directive-pending-chat-interaction-card directive-terminal-outcome-card directive-mission-command-card directive-lcars-panel');
  card.dataset.directiveTour = 'mission.pending-interaction';
  addTooltip(card, 'Terminal checkpoint decision. The outcome is committed in this timeline until you replay, push on, keep the ending, or save the terminal timeline as a branch.');
  card.append(
    createCardTitle('Directive Checkpoint'),
    createMetaRow('Status', 'Terminal decision'),
    createMetaRow('Terminal Band', metadata.terminalOutcomeBand || decision?.terminalOutcomeBand || 'Pending'),
    createMetaRow('Final Band Candidate', metadata.finalCampaignBandCandidate || decision?.finalCampaignBand || 'Pending'),
    createMetaRow('Checkpoint', checkpointLabel(metadata.checkpoint || decision?.checkpoint || {}))
  );
  if (savedBranchCount > 0) {
    card.appendChild(createMetaRow('Saved Terminal Branches', savedBranchCount));
  }
  const prompt = createElement('p', 'directive-mission-command-guidance');
  prompt.textContent = metadata.reason || decision?.playerFacingSummary || interaction?.prompt || 'This timeline has reached a potential ending. Choose how Directive should proceed.';
  card.appendChild(prompt);

  const frameIds = asArray(metadata.continuationFrameIds || decision?.condition?.continuationFrameIds);
  if (frameIds.length > 0) {
    const frameNote = createElement('p', 'directive-mission-command-guidance');
    frameNote.textContent = `${frameIds.length} Push On frame${frameIds.length === 1 ? '' : 's'} available if the committed consequence still leaves a playable campaign.`;
    card.appendChild(frameNote);
  }

  const row = createElement('div', 'directive-action-row');
  const options = asArray(interaction.options);
  for (const option of options) {
    const action = option?.action || option?.id || 'replayFromCheckpoint';
    row.appendChild(createButton({
      label: option?.label || interactionLabel(action),
      icon: terminalActionIcon(action),
      className: terminalActionClass(action),
      title: option?.description || option?.reason || option?.label || 'Resolve terminal checkpoint decision',
      disabled: typeof actions.resolveTerminalOutcomeDecision !== 'function',
      onClick: async () => {
        await actions.resolveTerminalOutcomeDecision({
          interactionId: interaction.id,
          action
        });
        await actions.refresh();
      }
    }));
  }

  if (options.length === 0) {
    row.appendChild(createButton({
      label: 'Open Campaign Chat',
      icon: 'fa-solid fa-comments',
      className: 'directive-button directive-primary-command',
      disabled: typeof actions.openCampaignChat !== 'function',
      onClick: async () => {
        await actions.openCampaignChat();
        await actions.refresh();
      }
    }));
  }

  card.appendChild(row);
  body.appendChild(card);
  return true;
}

function appendPendingChatInteraction(body, view, actions) {
  const interaction = pendingChatInteraction(view);
  if (!interaction) return false;
  if (interaction.kind === 'terminalOutcomeDecision') {
    return appendTerminalOutcomeDecision(body, view, actions, interaction);
  }

  const card = createCard('directive-pending-chat-interaction-card directive-mission-command-card directive-lcars-panel');
  card.dataset.directiveTour = 'mission.pending-interaction';
  const title = interaction.kind === 'riskConfirmationNeeded'
    ? 'Risk Confirmation Required'
    : interaction.kind === 'clarificationNeeded'
        ? 'Clarification Required'
      : interactionLabel(interaction.kind);
  addTooltip(card, 'Directive paused the campaign chat because this turn needs a player decision before final narration.');
  card.append(
    createCardTitle(title),
    createMetaRow('Status', 'Paused before final narration'),
    createMetaRow('Turn', interaction.turnId || interaction.ingressId || 'Pending')
  );
  const prompt = createElement('p', 'directive-mission-command-guidance');
  prompt.textContent = interaction.prompt || 'Directive requires a player decision before the campaign can continue.';
  card.appendChild(prompt);

  const row = createElement('div', 'directive-action-row');
  const options = Array.isArray(interaction.options) ? interaction.options : [];
  for (const option of options) {
    const action = option?.id || (option?.label === 'Accept Outcome' ? 'accept' : 'accept');
    row.appendChild(createButton({
      label: option?.label || interactionLabel(action),
      icon: action === 'revise' ? 'fa-solid fa-pen' : 'fa-solid fa-check',
      className: action === 'revise' ? 'directive-button directive-secondary-command' : 'directive-button directive-primary-command',
      title: option?.description || option?.reason || option?.label || 'Resolve pending interaction',
      onClick: async () => {
        await actions.resolvePendingChatInteraction({
          interactionId: interaction.id,
          action
        });
        await actions.refresh();
      }
    }));
  }

  if (options.length === 0) {
    row.appendChild(createButton({
      label: 'Open Chat to Clarify',
      icon: 'fa-solid fa-comments',
      className: 'directive-button directive-primary-command',
      disabled: typeof actions.openCampaignChat !== 'function',
      onClick: async () => {
        await actions.openCampaignChat();
        await actions.refresh();
      }
    }));
  }

  if (!options.some((option) => option?.id === 'revise')) {
    row.appendChild(createButton({
      label: interaction.kind === 'clarificationNeeded' ? 'Dismiss Prompt' : 'Revise Order',
      icon: 'fa-solid fa-pen',
      className: 'directive-button directive-secondary-command',
      onClick: async () => {
        await actions.resolvePendingChatInteraction({
          interactionId: interaction.id,
          action: interaction.kind === 'clarificationNeeded' ? 'cancel' : 'revise'
        });
        await actions.refresh();
      }
    }));
  }

  card.appendChild(row);
  body.appendChild(card);
  return true;
}

function appendCommittedChatOutcome(body, view) {
  const turn = view?.chatNative?.tracking?.lastCommittedTurn;
  if (!turn) return false;
  const card = createCard('directive-committed-chat-outcome-card directive-mission-command-card directive-lcars-panel');
  addTooltip(card, 'Committed mechanics and response status for the latest chat turn.');
  card.append(
    createCardTitle('Latest Committed Outcome'),
    createMetaRow('Outcome', turn.outcomeId),
    createMetaRow('Result', turn.resultBand || 'Committed'),
    createMetaRow('Mechanics', 'Durable'),
    createMetaRow('Narration', formatMissionLabel(turn.narrationStatus, 'Pending')),
    createMetaRow('Chat Response', formatMissionLabel(turn.responseStatus, 'Pending'))
  );
  const note = createElement('p', 'directive-mission-command-guidance');
  note.textContent = 'Narration retries use this committed packet and do not reroll mechanics.';
  card.appendChild(note);
  body.appendChild(card);
  return true;
}

function appendPendingTurn(body, view, actions) {
  const pending = view?.pendingDirectorTurn;
  if (!pending) return false;
  const replacement = view?.pendingOutcomeReplacement;

  const card = createCard('directive-provisional-outcome-card directive-mission-command-card directive-lcars-panel');
  card.dataset.directiveTour = 'mission.pending-outcome';
  addTooltip(card, replacement
    ? 'Previewed replacement mechanics that are not committed until accepted.'
    : 'Previewed mechanics that are not committed yet.');
  card.appendChild(createCardTitle(replacement ? 'Replacement Outcome' : 'Provisional Outcome'));
  if (replacement?.outcomeId) {
    card.appendChild(createMetaRow('Replaces', replacement.outcomeId));
  }
  appendCommandBrief(body, pending.competencePacket);
  const warningRequiresConfirmation = appendProceduralWarnings(body, pending, actions);
  appendOutcomeDetails(card, pending.provisionalOutcome || pending.outcomePacket);

  const prompt = pending.bearingEligibility?.interventionPrompt;
  if (prompt) {
    const bearingRow = createMetaRow('Command Bearing', prompt.reason || 'Spend points from Assist before sending the player post.');
    bearingRow.dataset.directiveTour = 'mission.command-bearing';
    card.appendChild(bearingRow);
  }

  const row = createElement('div', 'directive-action-row');
  if (!warningRequiresConfirmation) {
    const acceptLabel = replacement ? 'Accept Replacement' : 'Accept Outcome';
    const acceptButton = createButton({
      label: acceptLabel,
      icon: 'fa-solid fa-check',
      title: acceptLabel,
      onClick: async () => {
        await actions.commitProvisionalDirectorTurn({
          generateNarration: true
        });
        await actions.refresh();
      }
    });
    acceptButton.dataset.directiveTour = 'mission.outcome.accept';
    row.appendChild(acceptButton);
  }
  const discardButton = createButton({
    label: 'Discard Preview',
    icon: 'fa-solid fa-xmark',
    iconSlot: 'action.close',
    className: 'directive-button directive-secondary-command',
    title: 'Discard preview',
    onClick: async () => {
      await actions.discardProvisionalDirectorTurn();
      await actions.refresh();
    }
  });
  discardButton.dataset.directiveTour = 'mission.outcome.discard';
  row.appendChild(discardButton);
  card.appendChild(row);
  body.appendChild(card);
  return true;
}

function appendLastOutcome(body, view, actions) {
  const turn = view?.lastDirectorTurn;
  if (!turn) return;
  let riskCard = null;
  const card = createMissionRecoveryCard({
    className: 'directive-last-outcome-card',
    title: 'Last Outcome',
    kicker: 'Outcome Review',
    status: 'Recorded',
    tone: 'success',
    tooltip: 'Committed mechanics and narration recovery options for the latest resolved turn.'
  });
  card.dataset.directiveTour = 'mission.latest-outcome';
  if (turn.provisionalOutcome && turn.finalOutcome) {
    appendMissionRecoveryFacts(card, [
      ['Provisional', turn.provisionalOutcome.resultBand],
      ['Final', turn.finalOutcome.resultBand]
    ]);
  }
  if (turn.bearingSpend) {
    appendMissionRecoveryFacts(card, [
      ['Bearing', `${turn.bearingSpend.label} invoked`]
    ]);
  }
  appendOutcomeDetails(card, turn.finalOutcome || turn.outcomePacket);
  const outcomeId = turn.outcomePacket?.id;
  if (outcomeId) {
    const row = createMissionRecoveryActionRow();
    row.append(
      createButton({
        label: 'Rewrite Narration',
        icon: 'fa-solid fa-pen',
        className: 'directive-button directive-secondary-command',
        title: 'Retry narration without rerunning mechanics',
        onClick: async () => {
          await actions.retryNarrationForLastTurn();
          await actions.refresh();
        }
      }),
      createButton({
        label: 'Rerun Outcome',
        icon: 'fa-solid fa-rotate',
        className: 'directive-button directive-secondary-command',
        title: 'Preview new mechanics from the original pre-outcome snapshot',
        onClick: async () => {
          await actions.previewOutcomeReplacement({
            outcomeId,
            playerInput: turn.sceneSnapshot?.playerInput || ''
          });
          await actions.refresh();
        }
      })
    );
    card.appendChild(row);

    riskCard = createMissionRecoveryCard({
      className: 'directive-mission-risk-card',
      title: 'Risk Actions',
      kicker: 'Irreversible Recovery',
      status: 'Use With Care',
      tone: 'danger',
      tooltip: 'Dangerous recovery tools that can remove a committed outcome and restore a prior snapshot.'
    });
    const warning = createElement('div', 'directive-mission-recovery-risk-copy');
    const warningIcon = createElement('span');
    warningIcon.appendChild(createIcon('fa-solid fa-triangle-exclamation'));
    const warningText = createElement('span');
    warningText.textContent = 'Deleting the last outcome restores the campaign to its pre-outcome snapshot and cannot be undone.';
    warning.append(warningIcon, warningText);
    const riskRow = createMissionRecoveryActionRow('directive-mission-recovery-risk-row');
    riskRow.appendChild(
      createButton({
        label: 'Delete Outcome',
        icon: 'fa-solid fa-trash',
        className: 'directive-button directive-secondary-command directive-mission-recovery-danger-command',
        title: 'Restore the campaign to before this outcome',
        onClick: async () => {
          const proceed = typeof globalThis.confirm === 'function'
            ? globalThis.confirm('Delete this outcome and restore the campaign to the prior snapshot?')
            : true;
          if (!proceed) return;
          await actions.deleteCommittedOutcome({ outcomeId });
          await actions.refresh();
        }
      })
    );
    riskCard.append(warning, riskRow);
  }
  body.appendChild(card);
  if (riskCard) body.appendChild(riskCard);
}

function appendChatResponseRetry(body, view, actions) {
  const recovery = [...(view?.chatNative?.recovery || [])].reverse().find((entry) => (
    entry?.type === 'hostResponsePostFailure' && entry?.status === 'open'
  ));
  if (!recovery || typeof actions.retryCommittedChatResponse !== 'function') return;
  const card = createMissionRecoveryCard({
    className: 'directive-chat-response-retry-card',
    title: 'Chat Response Recovery',
    kicker: 'Committed Outcome',
    status: 'Pending',
    tone: 'danger',
    tooltip: 'Retry posting an already committed chat response without rerunning mechanics.'
  });
  appendMissionRecoveryFacts(card, [
    ['Outcome', recovery.outcomeId || 'No mechanics outcome'],
    ['Response', recovery.details?.responseKind || 'Campaign response'],
    ['Failure', recovery.details?.error?.message || 'The host did not confirm the chat response.']
  ]);
  const row = createMissionRecoveryActionRow();
  row.appendChild(createButton({
    label: 'Retry Chat Response',
    icon: 'fa-solid fa-rotate-right',
    title: 'Post the already committed response without rerunning mechanics',
    onClick: async () => {
      await actions.retryCommittedChatResponse({ recoveryId: recovery.id });
      await actions.refresh();
    }
  }));
  card.appendChild(row);
  body.appendChild(card);
}

function appendNarrationRetry(body, view, actions) {
  const recovery = view?.campaignState?.turnLedger?.pendingNarrationRecovery;
  if (!recovery) return;
  const card = createMissionRecoveryCard({
    className: 'directive-narration-retry-card',
    title: 'Narration Recovery',
    kicker: 'Repair Action',
    status: 'Pending',
    tone: 'danger',
    tooltip: 'Retry narration for an already committed mechanics outcome.'
  });
  appendMissionRecoveryFacts(card, [
    ['Outcome', recovery.outcomeId],
    ['Provider', recovery.providerId],
    ['Failure', recovery.message]
  ]);
  const row = createMissionRecoveryActionRow();
  row.appendChild(createButton({
    label: 'Retry Narration',
    icon: 'fa-solid fa-rotate-right',
    title: 'Retry narration without rerolling mechanics',
    onClick: async () => {
      await actions.retryNarrationForLastTurn();
      await actions.refresh();
    }
  }));
  card.appendChild(row);
  body.appendChild(card);
}

export function renderMissionPanel(body, view, actions) {
  ensureMissionSubtabEventListener();
  appendSectionTitle(body, 'Mission');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, currentChatEmptyMessage(view));
    return;
  }

  const chapter = chapterForMission(view, state.mission?.activeMissionId);
  const latestLedger = latestLedgerEntry(state);
  const consoleSurface = createElement('div', 'directive-mission-console directive-lcars-console');
  const overview = createCard('directive-mission-overview-card directive-lcars-panel');
  overview.dataset.directiveTour = 'mission.overview';
  const identity = createElement('div', 'directive-mission-identity');
  const identityTop = createElement('div', 'directive-mission-identity-top');
  const identityCopy = createElement('div', 'directive-mission-identity-copy');
  const chapterLabel = createElement('span', 'directive-lcars-kicker');
  chapterLabel.textContent = state.mission?.openWorldManaged ? 'Open World' : chapter?.type === 'main' ? 'Main Mission' : 'Mission';
  const missionTitle = createCardTitle(chapter?.title || state.mission?.activeMissionId || 'Active Mission');
  identityCopy.append(chapterLabel, missionTitle);
  const activeBadge = createElement('span', 'directive-mission-active-badge');
  activeBadge.textContent = state.mission?.endState ? 'Transition' : 'Active';
  identityTop.append(identityCopy, activeBadge);

  const objective = createElement('p', 'directive-mission-objective-line');
  objective.textContent = missionRecordText(chapter?.question) || missionRecordText(state.mission?.formalObjectives?.[0]) || 'Continue the mission and protect the campaign state.';
  identity.append(identityTop, objective);

  const commandFacts = createElement('div', 'directive-mission-command-facts');
  commandFacts.append(
    createMissionStatusBlock('Player', `${state.player?.rank || ''} ${state.player?.name || ''}`.trim() || 'Commander', 'warning', 'fa-solid fa-user', 'Player officer currently mounted in campaign state.'),
    createMissionStatusBlock('Ship', state.ship?.name || 'Starship', 'neutral', 'fa-solid fa-shuttle-space', 'Assigned ship currently mounted in campaign state.'),
    createMissionStatusBlock('Campaign', state.campaign?.title || 'Campaign', 'neutral', 'fa-solid fa-layer-group', 'Campaign package and save currently driving play.')
  );

  const statusGrid = createElement('div', 'directive-mission-status-grid');
  const phaseLabel = formatMissionLabel(state.mission?.phase || state.mission?.activePhaseId);
  statusGrid.append(
    createMissionStatusBlock('Phase', phaseLabel, missionStatusTone(phaseLabel), 'fa-solid fa-location-crosshairs', 'Current mission beat or runtime phase.'),
    createMissionStatusBlock('Mode', state.settings?.simulationMode, missionStatusTone(state.settings?.simulationMode), 'fa-solid fa-compass', 'Simulation style selected for mission resolution.')
  );
  if (state.turnLedger?.pendingNarrationRecovery) {
    statusGrid.appendChild(createMissionStatusBlock('Narration', 'Repair Available', 'danger', 'fa-solid fa-message', 'A committed mechanics outcome needs narration repair before continuing.'));
  }

  const nextAction = createElement('p', 'directive-mission-next-action');
  nextAction.textContent = missionNextAction(view, state);
  overview.append(identity, commandFacts, statusGrid);
  const outcomeSummary = missionOutcomeSummary(latestLedger);
  if (outcomeSummary) {
    const lastOutcome = createElement('div', 'directive-mission-last-outcome-strip');
    const outcomeLabel = createElement('span', 'directive-lcars-kicker');
    outcomeLabel.textContent = 'Last Outcome';
    const outcomeText = createElement('strong');
    outcomeText.textContent = outcomeSummary;
    lastOutcome.append(outcomeLabel, outcomeText);
    if (latestLedger?.stardate) {
      const outcomeTime = createElement('span', 'directive-mission-last-outcome-time');
      outcomeTime.textContent = `SD ${latestLedger.stardate}`;
      lastOutcome.appendChild(outcomeTime);
    }
    overview.appendChild(lastOutcome);
  }
  overview.appendChild(nextAction);
  consoleSurface.appendChild(overview);

  const sections = [
    { id: 'directive-mission-command-section', label: 'Active', icon: 'fa-solid fa-comments', tooltip: MISSION_SUBTAB_TOOLTIPS['directive-mission-command-section'] },
    { id: 'directive-mission-context-section', label: 'Context', icon: 'fa-solid fa-circle-info', tooltip: MISSION_SUBTAB_TOOLTIPS['directive-mission-context-section'] },
    { id: 'directive-mission-open-threads-section', label: 'Open Threads', icon: 'fa-solid fa-diagram-project', tooltip: MISSION_SUBTAB_TOOLTIPS['directive-mission-open-threads-section'] },
    { id: 'directive-mission-sidework-section', label: 'Open World', icon: 'fa-solid fa-compass', tooltip: MISSION_SUBTAB_TOOLTIPS['directive-mission-sidework-section'] },
    { id: 'directive-mission-components-section', label: 'Components', icon: 'fa-solid fa-layer-group', tooltip: MISSION_SUBTAB_TOOLTIPS['directive-mission-components-section'] }
  ];
  if (!sections.some((section) => section.id === activeMissionSubtabId)) {
    activeMissionSubtabId = 'directive-mission-command-section';
  }
  consoleSurface.appendChild(createMissionSubtabs(sections, activeMissionSubtabId));

  const commandSection = createMissionSection({
    id: 'directive-mission-command-section',
    label: 'Active Campaign',
    active: activeMissionSubtabId === 'directive-mission-command-section',
    showHeading: false
  });
  appendChatPlaySurface(commandSection, view, actions);
  appendAdvisoryBrief(commandSection, state);
  const hasPendingChatInteraction = appendPendingChatInteraction(commandSection, view, actions);
  const hasPendingTurn = hasPendingChatInteraction ? false : appendPendingTurn(commandSection, view, actions);
  appendCommittedChatOutcome(commandSection, view);
  const recoveryConsole = createMissionRecoveryConsole(view, state);
  appendLastOutcome(recoveryConsole.body, view, actions);
  appendChatResponseRetry(recoveryConsole.body, view, actions);
  appendNarrationRetry(recoveryConsole.body, view, actions);
  appendSceneReconciliationReview(recoveryConsole.body, view, state, actions);
  if (recoveryConsole.body.children.length > 0 || recoveryConsole.shell.querySelector?.('.directive-mission-recovery-status-grid')) {
    commandSection.appendChild(recoveryConsole.shell);
  }

  consoleSurface.appendChild(commandSection);

  const contextSection = createMissionSection({
    id: 'directive-mission-context-section',
    label: 'Mission Context',
    className: 'directive-mission-context-section',
    active: activeMissionSubtabId === 'directive-mission-context-section'
  });
  appendMvpCheckpoint(contextSection, view, state);
  appendPressureLedger(contextSection, state);

  const openAssignments = (state.mission?.openAssignments || [])
    .filter((record) => currentOrderAppliesToPlayer(record, state));
  appendMissionListCard(contextSection, 'Current Orders', openAssignments.slice(0, 8), 'directive-mission-open-assignments-card', 'Player-visible orders accepted from the current scene.');

  const objectives = state.mission?.formalObjectives || [];
  appendMissionListCard(contextSection, 'Formal Objectives', objectives, 'directive-mission-objectives-card', 'Player-visible mission objectives from current campaign state.');

  const directives = state.directives?.active || [];
  appendMissionListCard(contextSection, 'Active Directives', directives.slice(0, 5), 'directive-mission-directives-card', 'Active standing instructions currently shaping mission play.');
  if (contextSection.children.length > 1) {
    consoleSurface.appendChild(contextSection);
  }

  const openThreadsSection = createMissionSection({
    id: 'directive-mission-open-threads-section',
    label: 'Open Threads',
    className: 'directive-mission-open-threads-section',
    active: activeMissionSubtabId === 'directive-mission-open-threads-section'
  });
  appendOpenThreadsLedger(openThreadsSection, view, state);
  openThreadsSection.dataset.directiveTour = 'mission.open-threads';
  consoleSurface.appendChild(openThreadsSection);

  const sideWorkSection = createMissionSection({
    id: 'directive-mission-sidework-section',
    label: 'Open World',
    className: 'directive-mission-sidework-section',
    active: activeMissionSubtabId === 'directive-mission-sidework-section'
  });
  const sideWorkConsole = createMissionSideWorkConsole(view);
  sideWorkConsole.shell.dataset.directiveTour = 'mission.open-world';
  appendOpenWorldQuestCards(sideWorkConsole.body, view, actions);
  if (sideWorkConsole.body.children.length === 0) {
    appendMissionSideWorkEmpty(sideWorkConsole.body);
  }
  sideWorkSection.appendChild(sideWorkConsole.shell);
  consoleSurface.appendChild(sideWorkSection);

  const componentsSection = createMissionSection({
    id: 'directive-mission-components-section',
    label: 'Components',
    className: 'directive-mission-components-section',
    active: activeMissionSubtabId === 'directive-mission-components-section',
    showHeading: false
  });
  renderMissionComponentsPanel(componentsSection, view, state, actions);
  consoleSurface.appendChild(componentsSection);

  body.appendChild(consoleSurface);
}
