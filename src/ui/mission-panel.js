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

function latestAutosave(view, state) {
  return (view?.starships?.saves || [])
    .filter((save) => save.slotType === 'autosave')
    .find((save) => save.metadata?.campaignId === state?.campaign?.id) || null;
}

function missionStatusTone(value) {
  const label = String(value || '').toLowerCase();
  if (label.includes('fail') || label.includes('error') || label.includes('recovery')) return 'danger';
  if (label.includes('pending') || label.includes('warning') || label.includes('exploration')) return 'warning';
  if (label.includes('complete') || label.includes('ready') || label.includes('command')) return 'success';
  return 'neutral';
}

function formatCompactDate(value) {
  if (!value) return 'None';
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : text;
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

function createMissionSection({ id, label, className = '', active = false }) {
  const section = createElement('section', `directive-mission-section${className ? ` ${className}` : ''}`);
  section.id = id;
  if (active) {
    section.className = `${section.className} directive-mission-section-active`.trim();
  }
  const heading = createElement('h3', 'directive-mission-section-title');
  heading.textContent = label;
  section.appendChild(heading);
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
  return (view?.starships?.saves || []).find((save) => save.current === true && save.metadata?.campaignId === campaignId)
    || (view?.starships?.saves || []).find((save) => save.metadata?.campaignId === campaignId)
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

function createMissionSideWorkReadinessItem({ icon, label, value, detail, tone = 'neutral' }) {
  const item = createElement('div', `directive-mission-sidework-readiness-item directive-status-${tone}`);
  const iconFrame = createElement('span', 'directive-mission-sidework-readiness-icon');
  iconFrame.appendChild(createIcon(icon));
  const copy = createElement('span', 'directive-mission-sidework-readiness-copy');
  const title = createElement('strong');
  title.textContent = label;
  const state = createElement('span');
  state.textContent = value;
  const description = createElement('small');
  description.textContent = detail;
  copy.append(title, state, description);
  const indicator = createElement('span', 'directive-mission-sidework-readiness-indicator');
  indicator.setAttribute('aria-hidden', 'true');
  item.append(iconFrame, copy, indicator);
  return item;
}

function createMissionSideWorkConsole(view) {
  const snapshot = sideWorkSnapshot(view);
  const shell = createElement('div', 'directive-mission-sidework-console directive-lcars-panel');
  const header = createElement('div', 'directive-mission-sidework-console-header');
  const titleBlock = createElement('div', 'directive-mission-sidework-titleblock');
  const title = createElement('h4', 'directive-mission-sidework-console-title');
  title.textContent = 'Side Work Status';
  const summary = createElement('p', 'directive-mission-sidework-summary');
  summary.textContent = snapshot.openOrders + snapshot.followUps + snapshot.active + snapshot.intervals > 0
    ? 'Optional operational work is available without interrupting the primary mission thread.'
    : 'The support queue is standing by.';
  titleBlock.append(title, summary);
  header.appendChild(titleBlock);

  const statusGrid = createElement('div', 'directive-mission-sidework-status-grid');
  statusGrid.append(
    createMissionSideWorkStatusBlock('Open Orders', snapshot.openOrders, sideWorkTone(snapshot.openOrders), 'fa-solid fa-list-ul', 'Active intervals'),
    createMissionSideWorkStatusBlock('Follow-Ups', snapshot.followUps, sideWorkTone(snapshot.followUps), 'fa-solid fa-clipboard-check', 'Scheduled'),
    createMissionSideWorkStatusBlock('Active Scenes', snapshot.active, sideWorkTone(snapshot.active, snapshot.active > 0), 'fa-solid fa-play', 'In progress'),
    createMissionSideWorkStatusBlock(
      'Awaiting Review',
      snapshot.openOrders + snapshot.followUps,
      sideWorkTone(snapshot.openOrders + snapshot.followUps),
      'fa-solid fa-circle-check',
      'Outcomes'
    )
  );

  const readiness = createElement('div', 'directive-mission-sidework-readiness');
  const readinessTitle = createElement('h5', 'directive-mission-sidework-readiness-title');
  readinessTitle.textContent = 'Readiness Overview';
  const readinessGrid = createElement('div', 'directive-mission-sidework-readiness-grid');
  readinessGrid.append(
    createMissionSideWorkReadinessItem({
      icon: 'fa-solid fa-list-ul',
      label: 'Open Orders',
      value: snapshot.openOrders ? `${snapshot.openOrders} available` : 'No assignments',
      detail: 'Delegated work intervals',
      tone: sideWorkTone(snapshot.openOrders)
    }),
    createMissionSideWorkReadinessItem({
      icon: 'fa-solid fa-clipboard-star',
      label: 'Follow-Ups',
      value: snapshot.followUps ? `${snapshot.followUps} scheduled` : 'No follow-ups',
      detail: 'Post-mission opportunities',
      tone: sideWorkTone(snapshot.followUps)
    }),
    createMissionSideWorkReadinessItem({
      icon: 'fa-solid fa-circle-play',
      label: 'Active Scene',
      value: snapshot.active ? `${snapshot.active} in progress` : 'No scene in progress',
      detail: 'Optional support scene',
      tone: sideWorkTone(snapshot.active, snapshot.active > 0)
    }),
    createMissionSideWorkReadinessItem({
      icon: 'fa-solid fa-chart-simple',
      label: 'Progress Overview',
      value: snapshot.intervals ? `${snapshot.completed}/${snapshot.required || snapshot.completed} complete` : 'No intervals active',
      detail: 'Open Orders completion',
      tone: sideWorkTone(snapshot.intervals)
    })
  );
  readiness.append(readinessTitle, readinessGrid);

  const body = createElement('div', 'directive-mission-sidework-body');
  shell.append(header, statusGrid, body, readiness);
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
  const autosave = latestAutosave(view, state);
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

  const statusGrid = createElement('div', 'directive-mission-recovery-status-grid');
  statusGrid.append(
    createMissionRecoveryStatusBlock('Save Status', currentSave ? 'Active' : autosave ? 'Autosave' : 'Ready', currentSave || autosave ? 'success' : 'neutral', 'fa-solid fa-floppy-disk', currentSave?.name || (autosave ? 'Autosave available' : 'No active save')),
    createMissionRecoveryStatusBlock('Branch Status', currentSave ? 'Main Timeline' : 'None', currentSave ? 'success' : 'neutral', 'fa-solid fa-code-branch', currentSave ? 'Current branch' : 'No branches'),
    createMissionRecoveryStatusBlock('Narration Status', pendingNarration ? 'Recovery' : latestLedger?.narrationStatus || 'Ready', pendingNarration ? 'danger' : missionStatusTone(latestLedger?.narrationStatus || 'Ready'), 'fa-solid fa-message', pendingNarration ? 'Repair available' : 'Latest turn'),
    createMissionRecoveryStatusBlock('Outcome Status', hasOutcome ? 'Recorded' : 'None', hasOutcome ? 'success' : 'neutral', 'fa-solid fa-crosshairs', hasOutcome ? 'Committed outcome' : 'No outcome recorded')
  );

  const body = createElement('div', 'directive-mission-recovery-body');
  shell.append(header, statusGrid, body);
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
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = 'Command Input';
  const summary = createElement('strong');
  summary.textContent = 'Awaiting XO action';
  header.append(kicker, summary);
  card.appendChild(header);
  card.appendChild(createCardTitle('Player Action'));
  card.appendChild(createInputField({
    label: 'What does the XO do?',
    path: 'turn.playerInput',
    multiline: true
  }));
  const row = createElement('div', 'directive-action-row');
  row.appendChild(createButton({
    label: 'Preview Outcome',
    icon: 'fa-solid fa-play',
    className: 'directive-button directive-primary-command',
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
  const autosave = latestAutosave(view, state);
  const saveAsDefault = defaultSaveAsName(view, state);
  const consoleSurface = createElement('div', 'directive-mission-console directive-lcars-console');
  const overview = createCard('directive-mission-overview-card directive-lcars-panel');
  const identity = createElement('div', 'directive-mission-identity');
  identity.appendChild(createCardTitle(chapter?.title || state.mission?.activeMissionId || 'Active Mission'));
  const summary = createElement('p', 'directive-mission-summary');
  summary.textContent = [
    `${state.player?.rank || ''} ${state.player?.name || ''}`.trim(),
    state.ship?.name,
    state.campaign?.title
  ].filter(Boolean).join(' / ');
  identity.appendChild(summary);

  const statusGrid = createElement('div', 'directive-mission-status-grid');
  statusGrid.append(
    createMissionStatusBlock('Phase', state.mission?.phase || state.mission?.activePhaseId, missionStatusTone(state.mission?.phase || state.mission?.activePhaseId), 'fa-solid fa-location-crosshairs'),
    createMissionStatusBlock('Mode', state.settings?.simulationMode, missionStatusTone(state.settings?.simulationMode), 'fa-solid fa-compass'),
    createMissionStatusBlock('Narration', latestLedger?.narrationStatus || 'Ready', missionStatusTone(latestLedger?.narrationStatus || 'Ready'), 'fa-solid fa-message'),
    createMissionStatusBlock('Stardate', state.campaign?.currentStardate, 'neutral', 'fa-solid fa-clock'),
    createMissionStatusBlock('Autosave', autosave ? formatCompactDate(autosave.updatedAt) : 'None', autosave ? 'success' : 'neutral', 'fa-solid fa-floppy-disk')
  );

  const technical = createElement('div', 'directive-mission-technical-strip');
  technical.append(
    createMetaRow('Mission', state.mission?.activeMissionId),
    createMetaRow('Last Outcome', state.turnLedger?.lastCommittedOutcomeId ? 'Recorded' : 'None')
  );
  overview.append(identity, statusGrid, technical);
  consoleSurface.appendChild(overview);

  const sections = [
    { id: 'directive-mission-command-section', label: 'Command', icon: 'fa-solid fa-terminal' },
    { id: 'directive-mission-context-section', label: 'Context', icon: 'fa-solid fa-circle-info' },
    { id: 'directive-mission-sidework-section', label: 'Side Work', icon: 'fa-solid fa-circle-plus' },
    { id: 'directive-mission-recovery-section', label: 'Recovery', icon: 'fa-solid fa-life-ring' }
  ];
  consoleSurface.appendChild(createMissionSubtabs(sections, 'directive-mission-command-section'));

  const commandSection = createMissionSection({
    id: 'directive-mission-command-section',
    label: 'Command',
    active: true
  });
  const hasPendingTurn = appendPendingTurn(commandSection, view, actions);
  if (!hasPendingTurn) {
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
  appendNarrationRetry(recoveryConsole.body, view, actions);
  appendLastOutcome(recoveryConsole.body, view, actions);
  recoverySection.appendChild(recoveryConsole.shell);
  consoleSurface.appendChild(recoverySection);

  body.appendChild(consoleSurface);
}
