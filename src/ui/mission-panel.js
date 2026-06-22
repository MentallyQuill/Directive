import {
  appendBulletList,
  appendEmpty,
  appendSectionTitle,
  collectInputByPath,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createIcon,
  createInputField,
  createMetaRow
} from './runtime-ui-kit.js';

function chapterForMission(view, missionId) {
  return (view.activePackage?.campaign?.chapters || []).find((chapter) => chapter.id === missionId) || null;
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

function createMissionStatusBlock(label, value, tone = missionStatusTone(value), icon = '') {
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
  return block;
}

function activateMissionSection(scope, targetId) {
  if (!scope || !targetId) return;
  for (const item of scope.querySelectorAll?.('.directive-mission-subtab') || []) {
    const itemSelected = item.dataset.missionSubtabTarget === targetId;
    item.classList?.toggle?.('directive-mission-subtab-active', itemSelected);
    item.setAttribute('aria-selected', itemSelected ? 'true' : 'false');
  }
  for (const item of scope.querySelectorAll?.('.directive-mission-section') || []) {
    item.classList?.toggle?.('directive-mission-section-active', item.id === targetId);
  }
}

function createMissionSubtabs(sections, activeId = '') {
  const nav = createElement('nav', 'directive-mission-subtabs');
  nav.setAttribute('aria-label', 'Mission sections');
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
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (selected) {
      button.className = `${button.className} directive-mission-subtab-active`.trim();
    }
    button.addEventListener('click', () => {
      const root = typeof button.closest === 'function' ? button.closest('.directive-mission-console') : null;
      const scope = root || document;
      activateMissionSection(scope, section.id);
    });
    nav.appendChild(button);
  }
  return nav;
}

function createMissionSection({ id, label, className = '', active = false, showHeading = true }) {
  const section = createElement('section', `directive-mission-section${className ? ` ${className}` : ''}`);
  section.id = id;
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

function appendMissionListCard(container, title, items, className) {
  const safeItems = (items || []).filter(Boolean);
  if (safeItems.length === 0) return false;
  const card = createCard(`${className} directive-mission-list-card directive-lcars-panel`);
  card.appendChild(createCardTitle(title));
  appendBulletList(card, safeItems);
  container.appendChild(card);
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

function describePromptAction(action) {
  if (!action?.track) return action?.label || 'Accept Outcome';
  return `${action.label}: ${action.from} -> ${action.to}`;
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

function appendPressureLedger(body, state) {
  const records = (state?.pressureLedger?.records || [])
    .filter((record) => ['active', 'cooling', 'suppressed'].includes(record.status))
    .slice(0, 6);
  if (records.length === 0) return;
  const card = createCard('directive-pressure-ledger-card directive-mission-support-card directive-lcars-panel');
  card.appendChild(createCardTitle('Active Pressures'));
  appendBulletList(card, records.map((record) => {
    const status = record.status === 'active' ? 'Active' : record.status === 'cooling' ? 'Cooling' : 'Deferred';
    return `${status}: ${record.playerSummary || record.title}`;
  }));
  body.appendChild(card);
}

function isChapterCheckpointVisible(state, checkpointRecord) {
  const chapterId = checkpointRecord?.chapterId;
  const checkpoint = checkpointRecord?.checkpoint;
  if (!chapterId || checkpoint?.rawValuesHidden !== true) return false;
  const completed = new Set(state?.mainCampaign?.completedChapters || []);
  const available = new Set(state?.mainCampaign?.availableChapters || []);
  const chapterComplete = completed.has(chapterId)
    || state?.mission?.completedMissionId === chapterId
    || state?.mission?.endState === 'chapter-1-transition-to-false-colors';
  const nextOpen = available.has('chapter-2-false-colors')
    || state?.mission?.nextMissionId === 'chapter-2-false-colors'
    || state?.mainCampaign?.chapterCursor === 'chapter-2-false-colors';
  return chapterComplete && nextOpen;
}

function firstVisibleMvpCheckpoint(view, state) {
  return (view?.activePackage?.mvpCheckpoints || [])
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
  return 'Bind a campaign chat or use the fallback command input for this host.';
}

function sideWorkSnapshot(view) {
  const sideMissions = view?.campaignState?.sideMissions || {};
  const openOrderCandidates = view?.openOrdersReview?.candidates || [];
  const followUpCandidates = view?.sideMissionOpportunityReview?.candidates || [];
  const assignments = sideMissions.availableAssignments || [];
  const scheduled = sideMissions.scheduledOpportunities || [];
  const intervals = sideMissions.openOrdersIntervals || [];
  const activeAssignments = assignments.filter((assignment) => {
    return assignment?.status === 'active' || (sideMissions.activeAssignmentId && assignment?.id === sideMissions.activeAssignmentId);
  });
  const activeFollowUps = scheduled.filter((opportunity) => opportunity?.status === 'active');
  const openScheduled = scheduled.filter((opportunity) => !['completed', 'deferred'].includes(opportunity?.status));
  const completed = intervals.reduce((sum, interval) => {
    return sum + (Array.isArray(interval?.completedAssignmentIds) ? interval.completedAssignmentIds.length : 0);
  }, 0);
  const required = intervals.reduce((sum, interval) => {
    const intervalRequired = interval?.requiredCompletionCount || 2;
    const total = interval?.totalAssignmentCount || intervalRequired;
    return sum + Math.min(intervalRequired, total);
  }, 0);

  return {
    openOrders: openOrderCandidates.length + assignments.length,
    followUps: followUpCandidates.length + openScheduled.length,
    active: activeAssignments.length + activeFollowUps.length,
    intervals: intervals.length,
    completed,
    required
  };
}

function sideWorkTone(count, active = false) {
  if (active) return 'warning';
  return count > 0 ? 'success' : 'neutral';
}

function createMissionSideWorkStatusBlock(label, value, tone = 'neutral', icon = '', detail = '') {
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
  return block;
}

function createMissionSideWorkConsole(view) {
  const snapshot = sideWorkSnapshot(view);
  const totalWork = snapshot.openOrders + snapshot.followUps + snapshot.active + snapshot.intervals;
  const shell = createElement('div', 'directive-mission-sidework-console directive-lcars-panel');
  const header = createElement('div', 'directive-mission-sidework-console-header');
  const titleBlock = createElement('div', 'directive-mission-sidework-titleblock');
  const title = createElement('h4', 'directive-mission-sidework-console-title');
  title.textContent = 'Side Work';
  const summary = createElement('p', 'directive-mission-sidework-summary');
  summary.textContent = totalWork > 0
    ? 'Optional operational work is available without interrupting the primary mission thread.'
    : 'No optional work is active.';
  titleBlock.append(title, summary);
  header.appendChild(titleBlock);

  const body = createElement('div', 'directive-mission-sidework-body');
  shell.append(header, body);
  if (totalWork > 0) {
    const statusGrid = createElement('div', 'directive-mission-sidework-status-grid');
    statusGrid.append(
      createMissionSideWorkStatusBlock('Open Orders', snapshot.openOrders, sideWorkTone(snapshot.openOrders), 'fa-solid fa-list-ul', 'Active intervals'),
      createMissionSideWorkStatusBlock('Follow-Ups', snapshot.followUps, sideWorkTone(snapshot.followUps), 'fa-solid fa-clipboard-check', 'Scheduled'),
      createMissionSideWorkStatusBlock('Active Scenes', snapshot.active, sideWorkTone(snapshot.active, snapshot.active > 0), 'fa-solid fa-play', 'In progress'),
      createMissionSideWorkStatusBlock(
        'Review Queue',
        snapshot.openOrders + snapshot.followUps,
        sideWorkTone(snapshot.openOrders + snapshot.followUps),
        'fa-solid fa-circle-check',
        'Awaiting decisions'
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
  tone = 'neutral'
} = {}) {
  const card = createElement('article', `directive-mission-sidework-card${className ? ` ${className}` : ''}`);
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
  title.textContent = 'No Side Work Is Active';
  const summary = createElement('p');
  summary.textContent = 'No side work is active. Open Orders and Follow-Ups keep the ship moving between primary mission turns.';
  const hint = createElement('span');
  hint.textContent = 'New opportunities appear as pressure and conditions change.';
  const reviewButton = createButton({
    label: 'Review Command Brief',
    icon: 'fa-regular fa-file-lines',
    className: 'directive-button directive-secondary-command directive-mission-sidework-review-command',
    title: 'Return to the Mission command section',
    onClick: () => {
      const root = typeof empty.closest === 'function' ? empty.closest('.directive-mission-console') : null;
      activateMissionSection(root || document, 'directive-mission-command-section');
    }
  });
  empty.append(emblem, title, summary, hint, reviewButton);
  container.appendChild(empty);
}

function createMissionRecoveryStatusBlock(label, value, tone = missionStatusTone(value), icon = '', detail = '') {
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
  return block;
}

function createMissionRecoveryConsole(view, state) {
  const currentSave = currentSaveEntry(view, state);
  const latestLedger = latestLedgerEntry(state);
  const pendingNarration = state?.turnLedger?.pendingNarrationRecovery;
  const hasOutcome = Boolean(state?.turnLedger?.lastCommittedOutcomeId || view?.lastDirectorTurn);
  const shell = createElement('div', 'directive-mission-recovery-console directive-lcars-panel');
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
      statusGrid.appendChild(createMissionRecoveryStatusBlock('Save', 'Mounted', 'success', 'fa-solid fa-floppy-disk', currentSave.name || 'Active save'));
    }
    if (pendingNarration) {
      statusGrid.appendChild(createMissionRecoveryStatusBlock('Narration', 'Repair Available', 'danger', 'fa-solid fa-message', pendingNarration.message || 'Latest turn'));
    } else if (latestLedger?.narrationStatus && !/ready|complete/i.test(latestLedger.narrationStatus)) {
      statusGrid.appendChild(createMissionRecoveryStatusBlock('Narration', latestLedger.narrationStatus, missionStatusTone(latestLedger.narrationStatus), 'fa-solid fa-message', 'Latest turn'));
    }
    if (hasOutcome) {
      statusGrid.appendChild(createMissionRecoveryStatusBlock('Outcome', 'Recorded', 'success', 'fa-solid fa-crosshairs', 'Committed outcome'));
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
  tone = 'neutral'
} = {}) {
  const card = createElement('article', `directive-mission-recovery-card${className ? ` ${className}` : ''}`);
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

function appendMissionRecoverySaveControls(body, view, state, saveAsDefault, actions) {
  const currentSave = currentSaveEntry(view, state);
  const card = createMissionRecoveryCard({
    className: 'directive-mission-save-card',
    title: 'Save Controls',
    kicker: 'Safe Actions',
    status: currentSave ? 'Current' : 'Ready',
    tone: currentSave ? 'success' : 'neutral'
  });

  const saveAction = createButton({
    label: 'Save Game',
    icon: 'fa-solid fa-download',
    className: 'directive-button directive-primary-command directive-mission-save-command',
    title: 'Save game',
    onClick: async () => {
      await actions.saveCurrentGame({ summary: 'Manual runtime save.' });
      await actions.refresh();
    }
  });
  card.appendChild(createMissionRecoveryCommandRow({
    title: 'Save Game',
    summary: currentSave?.name ? `Overwrite ${currentSave.name}` : 'Write the current campaign state to its active save.',
    action: saveAction
  }));

  const nameField = createInputField({
    label: 'Save As Name',
    path: 'saveAs.name',
    value: saveAsDefault
  });
  const saveAsAction = createButton({
    label: 'Save As',
    icon: 'fa-solid fa-code-branch',
    className: 'directive-button directive-primary-command directive-mission-save-as-command',
    title: 'Create a new saved branch',
    onClick: async () => {
      const input = collectInputByPath(card);
      const name = input.saveAs?.name || saveAsDefault;
      await actions.saveCurrentGameAs({ name });
      await actions.refresh();
    }
  });
  card.appendChild(createMissionRecoveryCommandRow({
    title: 'Save As',
    summary: 'Create a new branch without overwriting the active save.',
    control: nameField,
    action: saveAsAction,
    className: 'directive-mission-recovery-save-as-row'
  }));
  body.appendChild(card);
}

function appendOpenOrdersReview(body, view, actions) {
  const review = view?.openOrdersReview;
  const candidates = review?.candidates || [];
  if (candidates.length === 0) return;

  for (const candidate of candidates) {
    const card = createMissionSideWorkCard({
      className: 'directive-open-orders-review-card directive-open-orders-candidate',
      title: candidate.sideAssignmentTitle || review.intervalTitle || 'Open Orders',
      kicker: review.intervalTitle || 'Open Orders',
      status: 'Candidate',
      tone: 'warning'
    });
    appendMissionSideWorkFacts(card, [
      ['Pressure', candidate.pressureTitle],
      ['Why Now', candidate.reason]
    ]);
    const row = createMissionSideWorkActionRow();
    row.append(
      createButton({
        label: 'Start',
        icon: 'fa-solid fa-play',
        title: `Start ${candidate.sideAssignmentTitle}`,
        onClick: async () => {
          await actions.commitOpenOrdersCandidateReview({
            candidateId: candidate.id,
            decision: 'start'
          });
          await actions.refresh();
        }
      }),
      createButton({
        label: 'Defer',
        icon: 'fa-solid fa-clock',
        title: `Defer ${candidate.sideAssignmentTitle}`,
        onClick: async () => {
          await actions.commitOpenOrdersCandidateReview({
            candidateId: candidate.id,
            decision: 'defer',
            reason: 'Player deferred this Open Orders candidate from the Mission panel.'
          });
          await actions.refresh();
        }
      })
    );
    card.appendChild(row);
    body.appendChild(card);
  }
}

function appendSideMissionOpportunityReview(body, view, actions) {
  const review = view?.sideMissionOpportunityReview;
  const candidates = review?.candidates || [];
  if (candidates.length === 0) return;

  for (const candidate of candidates) {
    const card = createMissionSideWorkCard({
      className: 'directive-side-opportunity-card directive-open-orders-candidate',
      title: candidate.title || 'Follow-Up Opportunity',
      kicker: 'Follow-Up Opportunity',
      status: 'Review',
      tone: 'warning'
    });
    appendMissionSideWorkFacts(card, [
      ['Scope', candidate.scope],
      ['Why Now', candidate.playerSummary],
      ['Command Question', candidate.reviewQuestion]
    ]);
    const row = createMissionSideWorkActionRow();
    row.append(
      createButton({
        label: 'Schedule',
        icon: 'fa-solid fa-calendar-plus',
        title: `Schedule ${candidate.title}`,
        onClick: async () => {
          await actions.commitSideMissionOpportunityReview({
            candidateId: candidate.id,
            decision: 'schedule'
          });
          await actions.refresh();
        }
      }),
      createButton({
        label: 'Defer',
        icon: 'fa-solid fa-clock',
        title: `Defer ${candidate.title}`,
        onClick: async () => {
          await actions.commitSideMissionOpportunityReview({
            candidateId: candidate.id,
            decision: 'defer',
            reason: 'Player deferred this follow-up opportunity from the Mission panel.'
          });
          await actions.refresh();
        }
      })
    );
    card.appendChild(row);
    body.appendChild(card);
  }
}

function appendScheduledSideMissionOpportunities(body, view, actions) {
  const scheduled = view?.campaignState?.sideMissions?.scheduledOpportunities || [];
  if (scheduled.length === 0) return;

  for (const opportunity of scheduled) {
    const sceneBrief = opportunity.sceneBrief || null;
    const sceneBeats = Array.isArray(opportunity.sceneBeats) ? opportunity.sceneBeats : [];
    const latestSceneBeat = sceneBeats.at(-1) || null;
    const isActive = opportunity.status === 'active';
    const isCompleted = opportunity.status === 'completed';
    const status = opportunity.status || 'scheduled';
    const card = createMissionSideWorkCard({
      className: 'directive-scheduled-opportunities-card directive-open-orders-candidate',
      title: opportunity.title || 'Follow-Up Work',
      kicker: 'Follow-Up Work',
      status,
      tone: isActive ? 'warning' : isCompleted ? 'success' : 'neutral'
    });
    appendMissionSideWorkFacts(card, [
      ['Scope', opportunity.scope],
      ['Why Now', opportunity.playerSummary],
      ['Command Question', opportunity.commandQuestion]
    ]);
    if (sceneBrief) {
      appendMissionSideWorkFacts(card, [
        ['Scene', sceneBrief.sceneStatus || opportunity.sceneStatus],
        ['Scene Question', sceneBrief.sceneQuestion],
        ['Context', sceneBrief.supportingContext || []],
        ['Scene Progress', sceneBeats.length ? `${sceneBeats.length} beat${sceneBeats.length === 1 ? '' : 's'}` : 'Briefing'],
        ['Latest Beat', latestSceneBeat?.playerSummary]
      ]);
      if ((sceneBrief.expectedOutputs || []).length > 0) {
        appendBulletList(card, sceneBrief.expectedOutputs, 'directive-runtime-list directive-mission-sidework-list');
      }
    }

    const row = createMissionSideWorkActionRow();
    if (opportunity.status === 'scheduled') {
      row.appendChild(createButton({
        label: 'Open Follow-Up',
        icon: 'fa-solid fa-folder-open',
        title: `Open ${opportunity.title || opportunity.id}`,
        onClick: async () => {
          await actions.startSideMissionOpportunityScene({
            opportunityId: opportunity.id,
            reason: 'Player opened this follow-up opportunity from the Mission panel.'
          });
          await actions.refresh();
        }
      }));
    } else if (isActive) {
      card.appendChild(createInputField({
        label: 'Follow-Up Intent',
        path: 'sideOpportunity.sceneIntent',
        value: 'Coordinate the next accountable step for this follow-up.',
        multiline: true
      }));
      row.append(
        createButton({
          label: 'Advance Follow-Up',
          icon: 'fa-solid fa-forward-step',
          title: `Advance ${opportunity.title || opportunity.id}`,
          onClick: async () => {
            const input = collectInputByPath(card);
            await actions.commitSideMissionOpportunitySceneBeat({
              opportunityId: opportunity.id,
              playerIntent: input.sideOpportunity?.sceneIntent,
              approach: 'coordination',
              reason: 'Player advanced this follow-up scene from the Mission panel.'
            });
            await actions.refresh();
          }
        }),
        createButton({
          label: 'Resolve Follow-Up',
          icon: 'fa-solid fa-check',
          title: `Resolve ${opportunity.title || opportunity.id}`,
          onClick: async () => {
            await actions.commitSideMissionOpportunityResolution({
              opportunityId: opportunity.id,
              outcomeBand: 'Success',
              assignmentMode: 'direct',
              reason: 'Player resolved this follow-up from the Mission panel.'
            });
            await actions.refresh();
          }
        }),
        createButton({
          label: 'Delegate',
          icon: 'fa-solid fa-share-nodes',
          title: `Delegate ${opportunity.title || opportunity.id}`,
          onClick: async () => {
            await actions.commitSideMissionOpportunityResolution({
              opportunityId: opportunity.id,
              outcomeBand: 'Success',
              assignmentMode: 'delegated',
              delegatedTo: 'accountable follow-up support',
              reason: 'Player delegated this follow-up from the Mission panel.'
            });
            await actions.refresh();
          }
        })
      );
    } else if (isCompleted) {
      appendMissionSideWorkFacts(card, [
        ['Completion', opportunity.visibleConsequences?.join(' ') || opportunity.playerSummary]
      ]);
    }
    if (row.children.length > 0) {
      card.appendChild(row);
    }
    body.appendChild(card);
  }
}

function appendOpenOrdersAssignment(body, view, actions) {
  const state = view?.campaignState;
  const activeId = state?.sideMissions?.activeAssignmentId;
  const assignments = state?.sideMissions?.availableAssignments || [];
  const assignment = assignments.find((item) => item.id === activeId) || assignments[0];
  if (!assignment) return;
  const sceneBrief = assignment.sceneBrief || null;
  const isActiveScene = assignment.status === 'active';

  const card = createMissionSideWorkCard({
    className: 'directive-open-orders-assignment-card directive-open-orders-candidate',
    title: assignment.title || 'Open Orders Assignment',
    kicker: 'Open Orders Assignment',
    status: assignment.status || 'available',
    tone: isActiveScene ? 'warning' : 'success'
  });
  appendMissionSideWorkFacts(card, [
    ['Pressure', assignment.pressureId],
    ['Summary', assignment.playerSummary]
  ]);
  if (sceneBrief) {
    const sceneBeats = Array.isArray(assignment.sceneBeats) ? assignment.sceneBeats : [];
    const latestSceneBeat = sceneBeats.at(-1) || null;
    appendMissionSideWorkFacts(card, [
      ['Scene', sceneBrief.sceneStatus || assignment.sceneStatus],
      ['Question', sceneBrief.sceneQuestion],
      ['Context', sceneBrief.supportingContext || []],
      ['Scene Progress', sceneBeats.length ? `${sceneBeats.length} beat${sceneBeats.length === 1 ? '' : 's'}` : 'Briefing'],
      ['Latest Beat', latestSceneBeat?.playerSummary]
    ]);
    if ((sceneBrief.expectedOutputs || []).length > 0) {
      appendBulletList(card, sceneBrief.expectedOutputs, 'directive-runtime-list directive-mission-sidework-list');
    }
  }
  const row = createMissionSideWorkActionRow();
  if (!isActiveScene) {
    row.appendChild(createButton({
      label: 'Open Assignment',
      icon: 'fa-solid fa-folder-open',
      title: `Open ${assignment.title || assignment.id}`,
      onClick: async () => {
        await actions.startOpenOrdersAssignmentScene({
          assignmentId: assignment.id,
          reason: 'Player opened this Open Orders assignment from the Mission panel.'
        });
        await actions.refresh();
      }
    }));
  } else {
    card.appendChild(createInputField({
      label: 'Scene Intent',
      path: 'openOrders.sceneIntent',
      value: 'Coordinate the next accountable step for this Open Orders assignment.',
      multiline: true
    }));
    row.append(
      createButton({
        label: 'Advance Scene',
        icon: 'fa-solid fa-forward-step',
        title: `Advance ${assignment.title || assignment.id}`,
        onClick: async () => {
          const input = collectInputByPath(card);
          await actions.commitOpenOrdersAssignmentSceneBeat({
            assignmentId: assignment.id,
            playerIntent: input.openOrders?.sceneIntent,
            approach: 'coordination',
            reason: 'Player advanced this Open Orders assignment scene from the Mission panel.'
          });
          await actions.refresh();
        }
      }),
      createButton({
        label: 'Resolve Assignment',
        icon: 'fa-solid fa-check',
        title: `Resolve ${assignment.title || assignment.id}`,
        onClick: async () => {
          await actions.commitOpenOrdersAssignmentResolution({
            assignmentId: assignment.id,
            outcomeBand: 'Success',
            assignmentMode: 'direct',
            reason: 'Player resolved this Open Orders assignment from the Mission panel.'
          });
          await actions.refresh();
        }
      }),
      createButton({
        label: 'Delegate',
        icon: 'fa-solid fa-share-nodes',
        title: `Delegate ${assignment.title || assignment.id}`,
        onClick: async () => {
          await actions.commitOpenOrdersAssignmentResolution({
            assignmentId: assignment.id,
            outcomeBand: 'Success',
            assignmentMode: 'delegated',
            delegatedTo: 'accountable Open Orders support',
            reason: 'Player delegated this Open Orders assignment from the Mission panel.'
          });
          await actions.refresh();
        }
      })
    );
  }
  card.appendChild(row);
  body.appendChild(card);
}

function appendOpenOrdersProgress(body, view) {
  const intervals = view?.campaignState?.sideMissions?.openOrdersIntervals || [];
  const activeIntervals = intervals.filter((interval) => interval?.id);
  if (activeIntervals.length === 0) return;

  for (const interval of activeIntervals) {
    const completed = Array.isArray(interval.completedAssignmentIds)
      ? interval.completedAssignmentIds.length
      : 0;
    const required = interval.requiredCompletionCount || 2;
    const total = interval.totalAssignmentCount || completed;
    const card = createMissionSideWorkCard({
      className: 'directive-open-orders-progress-card directive-open-orders-candidate',
      title: interval.title || interval.id,
      kicker: 'Open Orders Progress',
      status: interval.status || 'active',
      tone: completed >= Math.min(required, total || required) ? 'success' : 'neutral'
    });
    appendMissionSideWorkFacts(card, [
      ['Completed', `${completed}/${total || required}`],
      ['Required', `${Math.min(required, total || required)} assignment${Math.min(required, total || required) === 1 ? '' : 's'}`],
      ['Direct Load', String(interval.directCompletionCount || 0)],
      ['Summary', interval.playerSummary]
    ]);
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

function appendTurnInput(body, actions) {
  const card = createCard('directive-turn-input-card directive-mission-command-card directive-lcars-panel');
  const header = createElement('div', 'directive-mission-command-header');
  const headerCopy = createElement('div', 'directive-mission-command-header-copy');
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = 'Command Input';
  const title = createElement('h3', 'directive-mission-command-title');
  title.textContent = 'What does the XO do?';
  const guidance = createElement('p', 'directive-mission-command-guidance');
  guidance.textContent = 'State the objective, method, or order. The director will preview consequences before anything is committed.';
  headerCopy.append(kicker, title, guidance);
  const state = createElement('span', 'directive-mission-command-state');
  state.textContent = 'Awaiting Command';
  header.append(headerCopy, state);
  card.appendChild(header);

  const field = createInputField({
    label: 'XO intent',
    path: 'turn.playerInput',
    multiline: true
  });
  field.classList.add('directive-mission-intent-field');
  const control = field.querySelector?.('[data-input-path="turn.playerInput"]') || field.querySelector?.('textarea');
  if (control) {
    control.placeholder = 'Example: Press the Kriosan delegate for the names of the second cell, while Sato verifies the evidence chain.';
    control.maxLength = 500;
    control.setAttribute?.('maxlength', '500');
  }
  const counter = createElement('span', 'directive-mission-intent-counter');
  counter.textContent = '0 / 500';
  control?.addEventListener?.('input', () => {
    counter.textContent = `${String(control.value || '').length} / 500`;
  });
  field.appendChild(counter);
  card.appendChild(field);

  const row = createElement('div', 'directive-action-row directive-mission-preview-row');
  row.appendChild(createButton({
    label: 'Preview Outcome',
    icon: 'fa-solid fa-chevron-right',
    className: 'directive-button directive-primary-command directive-mission-preview-command',
    title: 'Preview outcome',
    onClick: async () => {
      const input = collectInputByPath(card);
      await actions.previewDirectorTurn({
        playerInput: input.turn?.playerInput
      });
      await actions.refresh();
    }
  }));
  card.appendChild(row);
  body.appendChild(card);
}

function pendingChatInteraction(view) {
  const interactions = view?.chatNative?.pendingInteractions || [];
  return [...interactions].reverse().find((interaction) => interaction?.status === 'pending') || null;
}

function appendChatPlaySurface(body, view, actions) {
  const binding = view?.chatNative?.binding || null;
  const prompt = view?.chatNative?.prompt || view?.promptInspection || null;
  const tracking = view?.chatNative?.tracking || null;
  const card = createCard('directive-chat-play-surface-card directive-mission-command-card directive-lcars-panel');
  const header = createElement('div', 'directive-mission-command-header');
  const copy = createElement('div', 'directive-mission-command-header-copy');
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = 'Play Surface';
  const title = createElement('h3', 'directive-mission-command-title');
  title.textContent = binding?.chatId ? 'Campaign Chat Bound' : 'Campaign Chat Unbound';
  const guidance = createElement('p', 'directive-mission-command-guidance');
  guidance.textContent = binding?.chatId
    ? 'Write normal in-character posts in the host chat. Directive interprets, records, injects context, and pauses only when a decision requires review.'
    : 'Chat-native play is unavailable until this campaign is bound to a host chat.';
  copy.append(kicker, title, guidance);
  const status = createElement('span', 'directive-mission-command-state');
  status.textContent = binding?.chatId ? 'Chat Native' : 'Fallback';
  header.append(copy, status);
  card.append(
    header,
    createMetaRow('Bound Chat', binding?.chatName || binding?.name || binding?.chatId || 'Not bound'),
    createMetaRow('Prompt Context', prompt?.revision !== undefined ? `Revision ${prompt.revision}` : (binding?.promptContextRevision !== undefined ? `Revision ${binding.promptContextRevision}` : 'Not installed')),
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
  if (!binding?.chatId && typeof actions.retryCampaignActivation === 'function') {
    row.appendChild(createButton({
      label: 'Resume Activation',
      icon: 'fa-solid fa-play',
      className: 'directive-button directive-secondary-command',
      title: 'Resume chat binding, intro posting, and prompt installation',
      onClick: async () => {
        await actions.retryCampaignActivation();
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

function appendPendingChatInteraction(body, view, actions) {
  const interaction = pendingChatInteraction(view);
  if (!interaction) return false;

  const card = createCard('directive-pending-chat-interaction-card directive-mission-command-card directive-lcars-panel');
  const title = interaction.kind === 'riskConfirmationNeeded'
    ? 'Risk Confirmation Required'
    : interaction.kind === 'commandBearing'
      ? 'Command Bearing Opportunity'
      : interaction.kind === 'clarificationNeeded'
        ? 'Clarification Required'
        : interactionLabel(interaction.kind);
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
    const track = option?.track || null;
    const action = option?.id || track || (option?.label === 'Accept Outcome' ? 'accept' : 'accept');
    row.appendChild(createButton({
      label: option?.label || interactionLabel(action),
      icon: track ? 'fa-solid fa-arrow-up' : action === 'revise' ? 'fa-solid fa-pen' : 'fa-solid fa-check',
      className: action === 'revise' ? 'directive-button directive-secondary-command' : 'directive-button directive-primary-command',
      title: option?.description || option?.reason || option?.label || 'Resolve pending interaction',
      onClick: async () => {
        await actions.resolvePendingChatInteraction({
          interactionId: interaction.id,
          action,
          spendTrack: track
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
  card.appendChild(createCardTitle(replacement ? 'Replacement Outcome' : 'Provisional Outcome'));
  if (replacement?.outcomeId) {
    card.appendChild(createMetaRow('Replaces', replacement.outcomeId));
  }
  appendCommandBrief(body, pending.competencePacket);
  const warningRequiresConfirmation = appendProceduralWarnings(body, pending, actions);
  appendOutcomeDetails(card, pending.provisionalOutcome || pending.outcomePacket);

  const prompt = pending.bearingEligibility?.interventionPrompt;
  if (prompt) {
    card.appendChild(createMetaRow('Command Bearing', prompt.reason));
  }

  const row = createElement('div', 'directive-action-row');
  if (!warningRequiresConfirmation) {
    for (const promptAction of prompt?.actions || [{ track: null, label: replacement ? 'Accept Replacement' : 'Accept Outcome' }]) {
      row.appendChild(createButton({
        label: promptAction.label,
        icon: promptAction.track ? 'fa-solid fa-arrow-up' : 'fa-solid fa-check',
        title: describePromptAction(promptAction),
        onClick: async () => {
          await actions.commitProvisionalDirectorTurn({
            spendTrack: promptAction.track,
            generateNarration: true
          });
          await actions.refresh();
        }
      }));
    }
  }
  row.appendChild(createButton({
    label: 'Discard Preview',
    icon: 'fa-solid fa-xmark',
    iconSlot: 'action.close',
    className: 'directive-button directive-secondary-command',
    title: 'Discard preview',
    onClick: async () => {
      await actions.discardProvisionalDirectorTurn();
      await actions.refresh();
    }
  }));
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
    tone: 'success'
  });
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
      tone: 'danger'
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
    tone: 'danger'
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
    tone: 'danger'
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
  appendSectionTitle(body, 'Mission');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, 'No active campaign.');
    return;
  }

  const chapter = chapterForMission(view, state.mission?.activeMissionId);
  const latestLedger = latestLedgerEntry(state);
  const saveAsDefault = defaultSaveAsName(view, state);
  const consoleSurface = createElement('div', 'directive-mission-console directive-lcars-console');
  const overview = createCard('directive-mission-overview-card directive-lcars-panel');
  const identity = createElement('div', 'directive-mission-identity');
  const identityTop = createElement('div', 'directive-mission-identity-top');
  const identityCopy = createElement('div', 'directive-mission-identity-copy');
  const chapterLabel = createElement('span', 'directive-lcars-kicker');
  chapterLabel.textContent = chapter?.type === 'main' ? 'Main Mission' : chapter?.type === 'openOrders' ? 'Open Orders' : 'Mission';
  const missionTitle = createCardTitle(chapter?.title || state.mission?.activeMissionId || 'Active Mission');
  identityCopy.append(chapterLabel, missionTitle);
  const activeBadge = createElement('span', 'directive-mission-active-badge');
  activeBadge.textContent = state.mission?.endState ? 'Transition' : 'Active';
  identityTop.append(identityCopy, activeBadge);

  const objective = createElement('p', 'directive-mission-objective-line');
  objective.textContent = chapter?.question || state.mission?.formalObjectives?.[0] || 'Continue the mission and protect the campaign state.';
  identity.append(identityTop, objective);

  const commandFacts = createElement('div', 'directive-mission-command-facts');
  commandFacts.append(
    createMissionStatusBlock('Player', `${state.player?.rank || ''} ${state.player?.name || ''}`.trim() || 'Commander', 'warning', 'fa-solid fa-user'),
    createMissionStatusBlock('Ship', state.ship?.name || 'Starship', 'neutral', 'fa-solid fa-shuttle-space'),
    createMissionStatusBlock('Campaign', state.campaign?.title || 'Campaign', 'neutral', 'fa-solid fa-layer-group')
  );

  const statusGrid = createElement('div', 'directive-mission-status-grid');
  const phaseLabel = formatMissionLabel(state.mission?.phase || state.mission?.activePhaseId);
  statusGrid.append(
    createMissionStatusBlock('Phase', phaseLabel, missionStatusTone(phaseLabel), 'fa-solid fa-location-crosshairs'),
    createMissionStatusBlock('Mode', state.settings?.simulationMode, missionStatusTone(state.settings?.simulationMode), 'fa-solid fa-compass')
  );
  if (state.turnLedger?.pendingNarrationRecovery) {
    statusGrid.appendChild(createMissionStatusBlock('Narration', 'Repair Available', 'danger', 'fa-solid fa-message'));
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
    { id: 'directive-mission-command-section', label: 'Active', icon: 'fa-solid fa-comments' },
    { id: 'directive-mission-context-section', label: 'Context', icon: 'fa-solid fa-circle-info' },
    { id: 'directive-mission-sidework-section', label: 'Side Work', icon: 'fa-solid fa-circle-plus' },
    { id: 'directive-mission-recovery-section', label: 'Recovery', icon: 'fa-solid fa-life-ring' }
  ];
  consoleSurface.appendChild(createMissionSubtabs(sections, 'directive-mission-command-section'));

  const commandSection = createMissionSection({
    id: 'directive-mission-command-section',
    label: 'Active Campaign',
    active: true,
    showHeading: false
  });
  appendChatPlaySurface(commandSection, view, actions);
  const hasPendingChatInteraction = appendPendingChatInteraction(commandSection, view, actions);
  const hasPendingTurn = hasPendingChatInteraction ? false : appendPendingTurn(commandSection, view, actions);
  appendCommittedChatOutcome(commandSection, view);
  const supportsChatNative = view?.host?.capabilities?.chat?.observeMessages === true
    && Boolean(view?.chatNative?.binding?.chatId);
  if (!hasPendingChatInteraction && !hasPendingTurn && !supportsChatNative) {
    appendTurnInput(commandSection, actions);
  }

  consoleSurface.appendChild(commandSection);

  const contextSection = createMissionSection({
    id: 'directive-mission-context-section',
    label: 'Mission Context',
    className: 'directive-mission-context-section'
  });
  appendMvpCheckpoint(contextSection, view, state);
  appendPressureLedger(contextSection, state);

  const objectives = state.mission?.formalObjectives || [];
  appendMissionListCard(contextSection, 'Formal Objectives', objectives, 'directive-mission-objectives-card');

  const directives = state.directives?.active || [];
  appendMissionListCard(contextSection, 'Active Directives', directives.slice(0, 5), 'directive-mission-directives-card');
  if (contextSection.children.length > 1) {
    consoleSurface.appendChild(contextSection);
  }

  const sideWorkSection = createMissionSection({
    id: 'directive-mission-sidework-section',
    label: 'Side Work',
    className: 'directive-mission-sidework-section'
  });
  const sideWorkConsole = createMissionSideWorkConsole(view);
  appendScheduledSideMissionOpportunities(sideWorkConsole.body, view, actions);
  appendOpenOrdersAssignment(sideWorkConsole.body, view, actions);
  appendOpenOrdersProgress(sideWorkConsole.body, view);
  appendOpenOrdersReview(sideWorkConsole.body, view, actions);
  appendSideMissionOpportunityReview(sideWorkConsole.body, view, actions);
  if (sideWorkConsole.body.children.length === 0) {
    appendMissionSideWorkEmpty(sideWorkConsole.body);
  }
  sideWorkSection.appendChild(sideWorkConsole.shell);
  consoleSurface.appendChild(sideWorkSection);

  const recoverySection = createMissionSection({
    id: 'directive-mission-recovery-section',
    label: 'Recovery',
    className: 'directive-mission-recovery-section'
  });
  const recoveryConsole = createMissionRecoveryConsole(view, state);
  appendMissionRecoverySaveControls(recoveryConsole.body, view, state, saveAsDefault, actions);
  appendChatResponseRetry(recoveryConsole.body, view, actions);
  appendNarrationRetry(recoveryConsole.body, view, actions);
  appendLastOutcome(recoveryConsole.body, view, actions);
  recoverySection.appendChild(recoveryConsole.shell);
  consoleSurface.appendChild(recoverySection);

  body.appendChild(consoleSurface);
}
