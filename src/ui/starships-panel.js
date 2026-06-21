import {
  appendSectionTitle,
  clearElement,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createIcon
} from './runtime-ui-kit.js';
import { createPackageImage } from './directive-media.js';

let activeStarshipsSection = '';
let activeLibraryPackageId = '';
let activeLibraryBriefingPackageId = '';
let activeRecordSaveId = '';

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function issueCount(diagnostics) {
  return Array.isArray(diagnostics?.issues) ? diagnostics.issues.length : Number(diagnostics?.issueCount || 0);
}

function readFileBytes(file) {
  if (file && typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  if (typeof FileReader !== 'function') throw new Error('This browser cannot read local package files.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error || new Error('Package file could not be read.')));
    reader.readAsArrayBuffer(file);
  });
}

function statusTone(value) {
  const label = String(value || '').toLowerCase();
  if (/error|rejected|missing|failed|invalid/.test(label)) return 'danger';
  if (/warning|issue|pending|draft/.test(label)) return 'warning';
  if (/ready|healthy|ok|stored|success|current|active|passed/.test(label)) return 'success';
  return 'neutral';
}

function formatTime(value, fallback = 'No activity') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function packageDataFor(view, pack) {
  const packageId = view?.activePackage?.packageId || view?.activePackage?.package?.id || view?.activePackage?.manifest?.id;
  return packageId && packageId === pack.packageId ? view.activePackage : null;
}

function createStatusBlock(label, value, tone = statusTone(value), icon = '') {
  const block = createElement('div', `directive-lcars-status-block directive-status-${tone}`);
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

function createSectionHeading(kicker, title, summary = '') {
  const header = createElement('header', 'directive-starships-section-heading');
  const titleBlock = createElement('div', 'directive-starships-section-titleblock');
  const eyebrow = createElement('span', 'directive-lcars-kicker');
  eyebrow.textContent = kicker;
  const heading = createElement('h3', 'directive-starships-section-title');
  heading.textContent = title;
  titleBlock.append(eyebrow, heading);
  if (summary) {
    const copy = createElement('p', 'directive-starships-section-summary');
    copy.textContent = summary;
    titleBlock.appendChild(copy);
  }
  header.appendChild(titleBlock);
  return header;
}

function createStarshipsSection({ id, label, className = '', active = false }) {
  const section = createElement('section', `directive-starships-section${className ? ` ${className}` : ''}`);
  section.id = id;
  section.dataset.starshipsSection = id;
  section.setAttribute('aria-label', label);
  if (active) section.classList.add('directive-starships-section-active');
  return section;
}

function createStarshipsSubtabs(items, activeId) {
  const nav = createElement('nav', 'directive-starships-subtabs');
  nav.setAttribute('aria-label', 'Starships sections');
  nav.setAttribute('role', 'tablist');
  const buttons = [];

  const select = (targetId) => {
    const target = items.some((item) => item.id === targetId) ? targetId : items[0]?.id;
    if (!target) return;
    activeStarshipsSection = target;
    for (const item of items) {
      const selected = item.id === target;
      item.section.classList.toggle('directive-starships-section-active', selected);
      item.section.setAttribute('aria-hidden', selected ? 'false' : 'true');
    }
    for (const button of buttons) {
      const selected = button.dataset.starshipsSubtabTarget === target;
      button.classList.toggle('directive-starships-subtab-active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute?.('aria-current');
    }
  };

  for (const item of items) {
    const button = createElement('button', 'directive-starships-subtab');
    button.type = 'button';
    button.dataset.starshipsSubtabTarget = item.id;
    button.setAttribute('aria-controls', item.id);
    button.setAttribute('role', 'tab');
    const icon = createElement('span', 'directive-starships-subtab-icon');
    icon.appendChild(createIcon(item.icon));
    const label = createElement('span');
    label.textContent = item.label;
    button.append(icon, label);
    button.addEventListener('click', () => select(item.id));
    nav.appendChild(button);
    buttons.push(button);
  }

  select(activeId);
  return { nav, select };
}

function createImportControl(actions) {
  const fileInput = createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.directive-starship.zip,.zip,application/zip';
  fileInput.hidden = true;

  const importFile = async (file) => {
    if (!file || typeof actions.importStarshipPackageArchive !== 'function') return;
    activeStarshipsSection = 'directive-starships-library-section';
    const bytes = await readFileBytes(file);
    await actions.importStarshipPackageArchive({ fileName: file.name, bytes });
    fileInput.value = '';
    await actions.refresh();
  };

  fileInput.addEventListener('change', async () => importFile(fileInput.files?.[0]));
  return {
    fileInput,
    browseButton: createButton({
      label: 'Choose File',
      icon: 'fa-solid fa-folder-open',
      className: 'directive-button directive-secondary-command directive-import-browse-command',
      title: 'Choose a .directive-starship.zip package',
      disabled: typeof actions.importStarshipPackageArchive !== 'function',
      onClick: () => fileInput.click()
    }),
    importButton: createButton({
      label: 'Import Package',
      icon: 'fa-solid fa-file-import',
      className: 'directive-button directive-primary-command directive-import-package-command',
      title: 'Import a data-only Directive starship package',
      disabled: typeof actions.importStarshipPackageArchive !== 'function',
      onClick: () => fileInput.click()
    }),
    importFile
  };
}

function createActionButton(command, className = '') {
  return createButton({
    label: command.label,
    icon: command.icon,
    className: `directive-button ${className || 'directive-secondary-command'}`,
    title: command.title || command.label,
    disabled: command.disabled === true,
    onClick: command.onClick
  });
}

function formatStardate(value) {
  return value === undefined || value === null || value === '' ? 'Pending' : `SD ${value}`;
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

function compactText(value, fallback = 'Details pending.', maxLength = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function packageReady(pack) {
  return statusTone(pack?.diagnostics?.status) !== 'danger' && pack?.actions?.startNewCampaign !== false;
}

function expectedLength(pack) {
  return pack?.campaign?.structure?.expectedLength || 'Length pending';
}

function eraLabel(pack) {
  return pack?.campaign?.eraLabel || (pack?.campaign?.openingYear ? String(pack.campaign.openingYear) : 'Era pending');
}

function playerRoleLabel(pack) {
  const role = pack?.playerRole || {};
  const rankAndBillet = [role.rank, role.billet].filter(Boolean).join(' / ');
  return rankAndBillet || role.label || 'Role pending';
}

function currentSave(starships) {
  const saves = asArray(starships?.saves);
  return saves.find((save) => save.current) || saves.find((save) => save.id === starships?.activeSaveId) || null;
}

function selectedPackage(starships) {
  const packages = asArray(starships?.packages);
  const selected = packages.find((pack) => pack.packageId === activeLibraryPackageId)
    || packages.find((pack) => pack.selected)
    || packages[0]
    || null;
  activeLibraryPackageId = selected?.packageId || '';
  return selected;
}

function selectedSave(starships) {
  const saves = asArray(starships?.saves);
  const selected = saves.find((save) => save.id === activeRecordSaveId)
    || currentSave(starships)
    || saves[0]
    || null;
  activeRecordSaveId = selected?.id || '';
  return selected;
}

function latestCommandLogEntry(campaignState) {
  const entries = asArray(campaignState?.commandLog?.entries);
  return entries.at(-1) || null;
}

function commandLogSummary(entry) {
  if (!entry) return 'No committed command-log entry yet.';
  return compactText(
    entry.assistedSummary?.summary
      || entry.summary
      || entry.summaryInputs?.[0]
      || asArray(entry.visibleConsequences)[0],
    'Committed outcome recorded.'
  );
}

function openOrdersSummary(view, campaignState) {
  const activeId = campaignState?.sideMissions?.activeAssignmentId;
  const activeAssignment = asArray(campaignState?.sideMissions?.availableAssignments)
    .find((assignment) => assignment.id === activeId);
  if (activeAssignment) return activeAssignment.title || activeAssignment.id;
  const reviewCandidate = asArray(view?.openOrdersReview?.candidates)[0];
  if (reviewCandidate) return reviewCandidate.sideAssignmentTitle || view.openOrdersReview.intervalTitle || 'Open Orders available';
  return 'No active Open Orders';
}

function appendText(container, tagName, className, text) {
  const element = createElement(tagName, className);
  element.textContent = text;
  container.appendChild(element);
  return element;
}

function packageCommands(pack, actions) {
  return {
    start: {
      label: 'Create Commander',
      icon: 'fa-solid fa-user-astronaut',
      title: pack.actions?.startNewCampaign ? 'Open Character Creator for this campaign' : 'Runtime assets are incomplete',
      disabled: !pack.actions?.startNewCampaign,
      onClick: async () => {
        await actions.startCreatorDraft({ packageId: pack.packageId });
        await actions.refresh();
      }
    },
    resume: pack.actions?.resumeDraft ? {
      label: 'Continue Character Setup',
      icon: 'fa-solid fa-user-pen',
      title: 'Continue the unfinished Character Creator setup',
      onClick: async () => {
        await actions.resumeCreatorDraft({ draftId: pack.actions.resumeDraft });
        await actions.refresh();
      }
    } : null,
    load: pack.actions?.loadLatestSave ? {
      label: 'Load Save',
      icon: 'fa-solid fa-folder-open',
      title: 'Load the latest campaign save',
      onClick: async () => {
        await actions.loadGame({ saveId: pack.actions.loadLatestSave });
        actions.setActiveTab('mission');
        await actions.refresh();
      }
    } : null
  };
}

function createReadinessRow(item) {
  const row = createElement('article', `directive-starship-readiness-row directive-readiness-${item.tone}`);
  const icon = createElement('span', 'directive-starship-readiness-icon');
  icon.appendChild(createIcon(item.icon));
  const copy = createElement('div');
  const title = createElement('strong');
  title.textContent = item.label;
  const detail = createElement('span');
  detail.textContent = item.detail;
  copy.append(title, detail);
  const status = createElement('span', `directive-starship-readiness-state ${item.ready ? 'directive-status-success' : 'directive-status-warning'}`);
  const statusText = createElement('span');
  statusText.textContent = item.ready ? 'Ready' : 'Review';
  status.append(createIcon(item.ready ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation'), statusText);
  row.append(icon, copy, status);
  return row;
}

function createCommandEmptyState(starships, onOpenLibrary, onOpenRecords) {
  const shell = createCard('directive-starship-command-snapshot directive-lcars-panel directive-starship-command-empty-state');
  const copy = createElement('div', 'directive-starship-command-empty-copy');
  appendText(copy, 'span', 'directive-lcars-kicker', 'No Campaign Loaded');
  appendText(copy, 'strong', 'directive-starship-command-title', 'Choose a campaign package or load a save.');
  appendText(copy, 'p', 'directive-starship-command-summary', 'Directive will manage structured state here. The live campaign continues through Mission and the active chat once a save is loaded or a new commander is created.');
  const actionsRow = createElement('div', 'directive-starship-command-actions');
  actionsRow.append(
    createActionButton({ label: 'Choose Campaign', icon: 'fa-solid fa-list', onClick: onOpenLibrary }, 'directive-primary-command'),
    createActionButton({
      label: 'Load Save',
      icon: 'fa-solid fa-folder-open',
      disabled: !asArray(starships?.saves).length,
      onClick: onOpenRecords
    }, 'directive-secondary-command')
  );
  shell.append(copy, actionsRow);
  return shell;
}

function createCommandSnapshot(starships, view, actions, onOpenRecords) {
  const state = view?.campaignState || {};
  const mission = state.mission || {};
  const campaign = state.campaign || {};
  const ship = state.ship || {};
  const player = state.player || {};
  const save = currentSave(starships);
  const logEntry = latestCommandLogEntry(state);
  const shell = createCard('directive-starship-command-snapshot directive-lcars-panel');

  const header = createElement('header', 'directive-starship-command-snapshot-header');
  const identity = createElement('div', 'directive-starship-command-identity');
  appendText(identity, 'span', 'directive-lcars-kicker', 'Active Campaign');
  appendText(identity, 'strong', 'directive-starship-command-title', campaign.title || save?.metadata?.campaignTitle || 'Campaign');
  appendText(identity, 'span', 'directive-starship-command-subtitle', `${player.name || 'Player Commander'} aboard ${ship.name || save?.metadata?.shipName || 'active ship'}`);
  const openMission = createActionButton({
    label: 'Open Mission',
    icon: 'fa-solid fa-arrow-right-to-bracket',
    title: 'Open the Mission route for active play context',
    onClick: async () => {
      actions.setActiveTab('mission');
      await actions.refresh();
    }
  }, 'directive-primary-command directive-starship-open-mission-command');
  header.append(identity, openMission);
  shell.appendChild(header);

  const statusGrid = createElement('div', 'directive-starships-overview directive-starship-command-status-grid');
  statusGrid.append(
    createStatusBlock('Stardate', formatStardate(campaign.currentStardate ?? save?.metadata?.stardate), 'success', 'fa-solid fa-clock'),
    createStatusBlock('Mission', formatMissionLabel(mission.activeMissionId || save?.metadata?.activeMissionId), 'neutral', 'fa-solid fa-map'),
    createStatusBlock('Phase', formatMissionLabel(mission.activePhaseId || save?.metadata?.activePhaseId, 'Pending'), 'neutral', 'fa-solid fa-location-crosshairs'),
    createStatusBlock('Mode', state.settings?.simulationMode || save?.metadata?.simulationMode || 'Pending', 'neutral', 'fa-solid fa-sliders'),
    createStatusBlock('Save', save?.slotType || 'Active', save ? 'success' : 'warning', 'fa-solid fa-floppy-disk'),
    createStatusBlock('Open Orders', openOrdersSummary(view, state), 'neutral', 'fa-solid fa-clipboard-list')
  );
  shell.appendChild(statusGrid);

  const briefing = createElement('div', 'directive-starship-command-briefing');
  const last = createElement('article', 'directive-starship-command-brief-card');
  appendText(last, 'span', 'directive-lcars-kicker', 'Last Committed Context');
  appendText(last, 'p', '', commandLogSummary(logEntry));
  const saveCard = createElement('article', 'directive-starship-command-brief-card');
  appendText(saveCard, 'span', 'directive-lcars-kicker', 'Current Save');
  appendText(saveCard, 'strong', '', save?.name || 'No active save name');
  appendText(saveCard, 'span', '', save ? formatTime(save.updatedAt) : 'State has not been saved in this session.');
  briefing.append(last, saveCard);
  shell.appendChild(briefing);

  const footer = createElement('footer', 'directive-starship-command-footer');
  footer.append(
    createActionButton({ label: 'View Records', icon: 'fa-solid fa-box-archive', onClick: onOpenRecords }, 'directive-secondary-command'),
    createActionButton({ label: 'Refresh Snapshot', icon: 'fa-solid fa-rotate', onClick: actions.refresh }, 'directive-secondary-command')
  );
  shell.appendChild(footer);
  return shell;
}

function createCommandSection(starships, view, actions, onOpenLibrary, onOpenRecords) {
  const section = createStarshipsSection({ id: 'directive-starships-command-section', label: 'Command' });
  section.appendChild(createSectionHeading('Command', 'Campaign Snapshot', 'Review the current campaign state. Open Mission to continue play through the active chat.'));
  const overview = createElement('div', 'directive-starships-overview');
  const save = currentSave(starships);
  overview.append(
    createStatusBlock('Campaign', view?.campaignState ? 'Loaded' : 'None', view?.campaignState ? 'success' : 'warning', 'fa-solid fa-satellite-dish'),
    createStatusBlock('Current Save', save?.name || 'None', save ? 'success' : 'neutral', 'fa-solid fa-floppy-disk'),
    createStatusBlock('Packages', starships.packages?.length || 0, starships.packages?.length ? 'success' : 'warning', 'fa-solid fa-boxes-stacked')
  );
  section.appendChild(overview);

  section.appendChild(view?.campaignState
    ? createCommandSnapshot(starships, view, actions, onOpenRecords)
    : createCommandEmptyState(starships, onOpenLibrary, onOpenRecords));
  return section;
}

function diagnosticTone(severity = '') {
  return /error|fatal/i.test(severity) ? 'danger' : /warn/i.test(severity) ? 'warning' : 'neutral';
}

function createDiagnosticIssueRow(issue) {
  const tone = diagnosticTone(issue.severity || issue.type);
  const row = createElement('article', `directive-import-issue-row directive-status-${tone}`);
  const icon = createElement('span', 'directive-import-issue-icon');
  icon.appendChild(createIcon(tone === 'danger' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-exclamation'));
  const severity = createElement('strong', 'directive-import-issue-severity');
  severity.textContent = issue.severity || issue.type || 'Notice';
  const copy = createElement('div');
  const title = createElement('strong');
  title.textContent = issue.item || issue.path || issue.code || 'Package record';
  const detail = createElement('span', 'directive-import-issue-detail');
  detail.textContent = issue.details || issue.message || issue.summary || 'Review the package import log.';
  copy.append(title, detail);
  row.append(icon, severity, copy);
  return row;
}

function createImportDiagnostics(result) {
  const card = createCard('directive-import-diagnostics-bay directive-lcars-panel');
  const header = createElement('div', 'directive-starship-panel-header');
  header.append(createCardTitle('Latest Import Diagnostics'));
  const badge = createElement('span', `directive-starship-panel-state directive-status-${statusTone(result?.status || (result ? 'success' : 'neutral'))}`);
  badge.textContent = result?.status || (result ? 'Complete' : 'No import');
  header.appendChild(badge);
  card.appendChild(header);

  if (!result) {
    const empty = createElement('div', 'directive-import-diagnostics-empty');
    empty.appendChild(createIcon('fa-solid fa-file-circle-question'));
    const title = createElement('strong');
    title.textContent = 'No Import Recorded';
    const summary = createElement('span');
    summary.textContent = 'Choose a package archive to run validation and storage diagnostics.';
    empty.append(title, summary);
    card.appendChild(empty);
    return card;
  }

  const packageRow = createElement('div', 'directive-import-package-result');
  const packageCopy = createElement('div');
  const label = createElement('span', 'directive-lcars-kicker');
  label.textContent = 'Package';
  const name = createElement('strong');
  name.textContent = result.fileName || result.packageTitle || result.packageId || 'Imported package';
  packageCopy.append(label, name);
  const status = createElement('span', `directive-starship-import-result-status directive-status-${statusTone(result.status)}`);
  const statusText = createElement('span');
  statusText.textContent = result.status || 'Complete';
  status.append(createIcon(statusTone(result.status) === 'danger' ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-circle-check'), statusText);
  packageRow.append(packageCopy, status);
  card.appendChild(packageRow);

  const diagnostics = result.diagnostics || result;
  const issues = asArray(diagnostics.issues || result.issues);
  const metrics = createElement('div', 'directive-import-diagnostics-status-grid');
  metrics.append(
    createStatusBlock('Files', diagnostics.filesProcessed ?? diagnostics.totalItems ?? '—', 'neutral', 'fa-solid fa-file'),
    createStatusBlock('Imported', diagnostics.entitiesAdded ?? diagnostics.imported ?? '—', 'success', 'fa-solid fa-circle-check'),
    createStatusBlock('Warnings', diagnostics.warningCount ?? issues.filter((item) => /warn/i.test(item.severity || item.type)).length, 'warning', 'fa-solid fa-triangle-exclamation'),
    createStatusBlock('Errors', diagnostics.errorCount ?? issues.filter((item) => /error/i.test(item.severity || item.type)).length, issues.some((item) => /error/i.test(item.severity || item.type)) ? 'danger' : 'success', 'fa-solid fa-circle-xmark'),
    createStatusBlock('Last Import', result.ok === false || /reject|error|failed/i.test(result.status || '') ? 'Rejected' : 'Stored', result.ok === false ? 'danger' : 'success', 'fa-solid fa-box-archive'),
    createStatusBlock('Source', result.source || 'imported', 'neutral', 'fa-solid fa-database')
  );
  card.appendChild(metrics);
  const list = createElement('div', 'directive-import-issue-list');
  if (issues.length) for (const issue of issues.slice(0, 6)) list.appendChild(createDiagnosticIssueRow(issue));
  else {
    const clear = createElement('div', 'directive-import-validation-clear');
    const clearText = createElement('span');
    clearText.textContent = 'The package passed validation with no reported issues.';
    clear.append(createIcon('fa-solid fa-circle-check'), clearText);
    list.appendChild(clear);
  }
  card.appendChild(list);
  return card;
}

function createPackageListButton(pack, selected, onSelect) {
  const button = createElement('button', `directive-starship-library-row${selected ? ' directive-starship-library-row-selected' : ''}`);
  button.type = 'button';
  button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  const marker = createElement('span', 'directive-starship-library-marker');
  marker.appendChild(createIcon(packageReady(pack) ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation'));
  const copy = createElement('span', 'directive-starship-library-row-copy');
  const title = createElement('strong');
  title.textContent = pack.campaign?.title || pack.title || 'Campaign';
  const meta = createElement('span');
  meta.textContent = [pack.ship?.name, pack.ship?.class, pack.source].filter(Boolean).join(' / ');
  copy.append(title, meta);
  const state = createElement('span', `directive-starship-library-state directive-status-${packageReady(pack) ? 'success' : 'warning'}`);
  state.textContent = packageReady(pack) ? 'Playable' : 'Review';
  button.append(marker, copy, state);
  button.addEventListener('click', onSelect);
  return button;
}

function createPackageMetaGrid(pack) {
  const grid = createElement('div', 'directive-starship-package-detail-grid');
  grid.append(
    createStatusBlock('Era', eraLabel(pack), 'neutral', 'fa-solid fa-calendar-star'),
    createStatusBlock('Stardate', formatStardate(pack.campaign?.openingStardate || pack.ship?.openingStardate), 'neutral', 'fa-solid fa-clock'),
    createStatusBlock('Length', expectedLength(pack), 'neutral', 'fa-solid fa-layer-group'),
    createStatusBlock('Role', playerRoleLabel(pack), 'neutral', 'fa-solid fa-user-tie'),
    createStatusBlock('Chapters', pack.campaign?.structure?.mainChapterCount ?? asArray(pack.campaign?.chapters).filter((chapter) => chapter.type === 'main').length, 'neutral', 'fa-solid fa-list-ol'),
    createStatusBlock('Open Orders', pack.campaign?.structure?.openOrdersCount ?? 'Pending', 'neutral', 'fa-solid fa-clipboard-list')
  );
  return grid;
}

function createSeniorStaffRoster(pack) {
  const roster = createElement('div', 'directive-starship-briefing-roster');
  const senior = asArray(pack.seniorCrewPreview).slice(0, 7);
  if (!senior.length) {
    appendText(roster, 'p', 'directive-runtime-empty', 'Senior staff preview is not available for this package.');
    return roster;
  }
  for (const officer of senior) {
    const card = createElement('article', 'directive-starship-briefing-officer');
    const marker = createElement('span', 'directive-starship-briefing-officer-marker');
    marker.appendChild(createIcon('fa-solid fa-user'));
    const copy = createElement('span');
    const name = createElement('strong');
    name.textContent = officer.name || officer.id;
    const billet = createElement('span');
    billet.textContent = [officer.rank, officer.billet].filter(Boolean).join(' / ');
    copy.append(name, billet);
    card.append(marker, copy);
    roster.appendChild(card);
  }
  return roster;
}

function createCampaignBriefing(pack, packageData, actions) {
  const commands = packageCommands(pack, actions);
  const briefing = createElement('section', 'directive-starship-campaign-briefing directive-lcars-panel');
  const visual = createPackageImage(packageData, {
    kind: 'ship.hero',
    subjectId: pack.ship?.id || 'starship',
    variant: 'card'
  }, {
    wrapperClass: 'directive-starship-briefing-visual',
    label: pack.ship?.name || pack.title,
    icon: 'fa-solid fa-shuttle-space'
  });
  const copy = createElement('div', 'directive-starship-briefing-copy');
  appendText(copy, 'span', 'directive-lcars-kicker', 'Campaign Briefing');
  appendText(copy, 'strong', 'directive-starship-briefing-title', pack.campaign?.title || pack.title || 'Campaign');
  appendText(copy, 'p', 'directive-starship-briefing-hook', compactText(pack.campaign?.highConcept, 'Story hook pending.', 520));
  appendText(copy, 'p', 'directive-starship-briefing-ship', compactText(pack.ship?.openingCondition, 'Ship readiness context pending.', 300));
  const actionsRow = createElement('div', 'directive-starship-briefing-actions');
  actionsRow.append(
    createActionButton(commands.start, 'directive-primary-command directive-starship-create-commander-command'),
    commands.resume
      ? createActionButton(commands.resume, 'directive-secondary-command')
      : createActionButton({
        label: 'Review Package',
        icon: 'fa-solid fa-arrow-left',
        onClick: async () => {
          activeLibraryBriefingPackageId = '';
          await actions.refresh();
        }
      }, 'directive-secondary-command')
  );
  copy.append(createPackageMetaGrid(pack), createSeniorStaffRoster(pack), actionsRow);
  briefing.append(visual, copy);
  return briefing;
}

function renderPackageDetails(container, pack, packageData, actions, onOpenRecords) {
  clearElement(container);
  if (!pack) {
    const empty = createCard('directive-starship-library-detail directive-lcars-panel');
    empty.append(createIcon('fa-solid fa-box-open'), createCardTitle('No Campaign Packages'));
    appendText(empty, 'p', 'directive-runtime-empty', 'Import a Directive starship package to begin.');
    container.appendChild(empty);
    return;
  }

  const commands = packageCommands(pack, actions);
  const detail = createCard('directive-starship-library-detail directive-lcars-panel');
  const header = createElement('div', 'directive-starship-library-detail-header');
  const titleBlock = createElement('div');
  appendText(titleBlock, 'span', 'directive-lcars-kicker', pack.source === 'bundled' ? 'Bundled Campaign' : 'Imported Campaign');
  appendText(titleBlock, 'strong', 'directive-starship-library-detail-title', pack.campaign?.title || pack.title || 'Campaign');
  appendText(titleBlock, 'span', 'directive-starship-library-detail-subtitle', `${pack.ship?.name || 'Starship'} / ${pack.ship?.class || 'Class pending'}`);
  const status = createElement('span', `directive-starship-panel-state directive-status-${packageReady(pack) ? 'success' : 'warning'}`);
  status.textContent = packageReady(pack) ? 'Playable' : 'Review';
  header.append(titleBlock, status);
  detail.appendChild(header);

  const hook = createElement('p', 'directive-starship-library-hook');
  hook.textContent = compactText(pack.campaign?.highConcept, 'Story hook pending.');
  detail.append(hook, createPackageMetaGrid(pack));

  const readiness = createElement('div', 'directive-starship-library-readiness');
  readiness.append(
    createReadinessRow({
      label: 'Runtime Projection',
      detail: pack.runtimeAssets?.hasProjection ? 'Campaign state can be created from this package.' : 'Campaign projection is missing.',
      ready: pack.runtimeAssets?.hasProjection === true,
      icon: 'fa-solid fa-diagram-project',
      tone: 'operations'
    }),
    createReadinessRow({
      label: 'Mission Graphs',
      detail: `${Number(pack.runtimeAssets?.missionGraphCount || 0)} playable graph records`,
      ready: Number(pack.runtimeAssets?.missionGraphCount || 0) > 0,
      icon: 'fa-solid fa-map',
      tone: 'science'
    }),
    createReadinessRow({
      label: 'Package Health',
      detail: `${pack.diagnostics?.issueCount || 0} reported issues`,
      ready: statusTone(pack.diagnostics?.status) !== 'danger',
      icon: 'fa-solid fa-shield-halved',
      tone: 'command'
    })
  );
  detail.appendChild(readiness);

  const actionsRow = createElement('div', 'directive-starship-library-actions');
  actionsRow.append(
    createActionButton({
      label: 'New Campaign',
      icon: 'fa-solid fa-plus',
      title: packageReady(pack) ? 'Open the campaign briefing' : 'Runtime assets are incomplete',
      disabled: !packageReady(pack),
      onClick: async () => {
        activeLibraryBriefingPackageId = pack.packageId;
        await actions.refresh();
      }
    }, 'directive-primary-command'),
    commands.resume ? createActionButton(commands.resume, 'directive-secondary-command') : createActionButton({
      label: 'No Setup Draft',
      icon: 'fa-solid fa-user-pen',
      disabled: true
    }, 'directive-secondary-command'),
    createActionButton({
      label: pack.counts?.saves ? 'View Saves' : 'No Saves',
      icon: 'fa-solid fa-box-archive',
      disabled: !pack.counts?.saves,
      onClick: onOpenRecords
    }, 'directive-secondary-command')
  );
  detail.appendChild(actionsRow);
  container.appendChild(detail);

  if (activeLibraryBriefingPackageId === pack.packageId) {
    container.appendChild(createCampaignBriefing(pack, packageData, actions));
  }
}

function createPackageBrowser(starships, view, actions, onOpenRecords) {
  const browser = createElement('div', 'directive-starships-library-browser');
  const list = createCard('directive-starship-library-list directive-lcars-panel');
  const listHeader = createElement('div', 'directive-starship-panel-header');
  listHeader.append(createCardTitle('Campaign Library'));
  const listState = createElement('span', `directive-starship-panel-state directive-status-${starships.packages?.length ? 'success' : 'warning'}`);
  listState.textContent = starships.packages?.length ? `${starships.packages.length} Ready` : 'Empty';
  listHeader.appendChild(listState);
  list.appendChild(listHeader);

  const detailSlot = createElement('div', 'directive-starship-library-detail-slot');
  const selected = selectedPackage(starships);
  for (const pack of asArray(starships.packages)) {
    list.appendChild(createPackageListButton(pack, pack.packageId === selected?.packageId, (event) => {
      activeLibraryPackageId = pack.packageId;
      activeLibraryBriefingPackageId = '';
      for (const button of list.querySelectorAll('.directive-starship-library-row')) {
        button.classList.remove('directive-starship-library-row-selected');
        button.setAttribute('aria-pressed', 'false');
      }
      event.currentTarget.classList.add('directive-starship-library-row-selected');
      event.currentTarget.setAttribute('aria-pressed', 'true');
      renderPackageDetails(detailSlot, pack, packageDataFor(view, pack), actions, onOpenRecords);
    }));
  }
  if (!starships.packages?.length) {
    appendText(list, 'p', 'directive-runtime-empty', 'No campaign packages are installed.');
  }
  renderPackageDetails(detailSlot, selected, selected ? packageDataFor(view, selected) : null, actions, onOpenRecords);
  browser.append(list, detailSlot);
  return browser;
}

function createLibrarySection(starships, view, actions, importControl, onOpenRecords) {
  const section = createStarshipsSection({ id: 'directive-starships-library-section', label: 'Library & Import' });
  section.appendChild(createSectionHeading('Library & Import', 'Campaign Library', 'Choose a campaign package, review the briefing, or import data-only packages.'));
  section.appendChild(createPackageBrowser(starships, view, actions, onOpenRecords));

  const layout = createElement('div', 'directive-starships-library-grid');
  const health = createCard('directive-starship-library-health directive-lcars-panel');
  const healthHeader = createElement('div', 'directive-starship-panel-header');
  healthHeader.append(createCardTitle('Library Health'));
  const healthState = createElement('span', `directive-starship-panel-state directive-status-${starships.packages?.length ? 'success' : 'warning'}`);
  healthState.textContent = starships.packages?.length ? 'Nominal' : 'Empty';
  healthHeader.appendChild(healthState);
  health.appendChild(healthHeader);
  const healthMetrics = createElement('div', 'directive-lcars-readiness-grid');
  const issues = (starships.packages || []).reduce((sum, pack) => sum + Number(pack.diagnostics?.issueCount || 0), 0);
  healthMetrics.append(
    createStatusBlock('Installed Packages', starships.packages?.length || 0, starships.packages?.length ? 'success' : 'warning', 'fa-solid fa-boxes-stacked'),
    createStatusBlock('Ready for Use', (starships.packages || []).filter((pack) => statusTone(pack.diagnostics?.status) !== 'danger').length, 'success', 'fa-solid fa-circle-check'),
    createStatusBlock('With Issues', issues, issues ? 'warning' : 'success', 'fa-solid fa-triangle-exclamation'),
    createStatusBlock('Imported Packages', starships.imports?.length || 0, starships.imports?.length ? 'warning' : 'neutral', 'fa-solid fa-file-import'),
    createStatusBlock('Import Status', 'Ready', 'success', 'fa-solid fa-circle-check'),
    createStatusBlock('Setup Drafts', starships.drafts?.filter?.((draft) => draft.status !== 'accepted').length || 0, starships.drafts?.length ? 'warning' : 'neutral', 'fa-solid fa-user-pen')
  );
  health.appendChild(healthMetrics);

  const workbench = createCard('directive-import-workbench directive-lcars-panel');
  const band = createElement('div', 'directive-lcars-panel-band');
  band.textContent = 'Import Package';
  workbench.appendChild(band);
  const dropzone = createElement('div', 'directive-import-dropzone');
  dropzone.tabIndex = 0;
  dropzone.setAttribute('role', 'button');
  dropzone.setAttribute('aria-label', 'Drop a Directive package archive here or choose a file');
  const icon = createElement('span', 'directive-import-dropzone-icon');
  icon.appendChild(createIcon('fa-solid fa-download'));
  const title = createElement('strong');
  title.textContent = 'Drop Package File Here';
  const detail = createElement('span');
  detail.textContent = '.directive-starship.zip or .zip';
  const divider = createElement('span', 'directive-import-or');
  divider.textContent = 'or';
  dropzone.append(icon, title, detail, divider, importControl.browseButton);
  dropzone.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    importControl.fileInput.click();
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('directive-import-dropzone-active');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('directive-import-dropzone-active'));
  dropzone.addEventListener('drop', async (event) => {
    event.preventDefault();
    dropzone.classList.remove('directive-import-dropzone-active');
    await importControl.importFile(event.dataTransfer?.files?.[0]);
  });
  workbench.append(dropzone, importControl.fileInput, importControl.importButton);

  layout.append(health, workbench, createImportDiagnostics(starships.lastImportResult));
  section.appendChild(layout);
  const note = createElement('p', 'directive-import-safety-note');
  const noteText = createElement('span');
  noteText.textContent = 'Packages are validated before storage. Active content and unsafe paths are rejected.';
  note.append(createIcon('fa-solid fa-circle-info'), noteText);
  section.appendChild(note);
  return section;
}

function createRecordStatusBlock(label, value, tone = 'neutral') {
  const block = createStatusBlock(label, value, tone);
  block.classList.add('directive-starship-record-status-block');
  return block;
}

function createRecordRow({ title, label, meta = '', state = '', current = false, accepted = false, action }) {
  const row = createElement('article', `directive-starship-record-row${current ? ' directive-starship-current-record' : ''}${accepted ? ' directive-starship-accepted-record' : ''}`);
  const marker = createElement('span', 'directive-starship-record-marker');
  marker.appendChild(createIcon(current ? 'fa-solid fa-play' : accepted ? 'fa-solid fa-check' : 'fa-solid fa-circle'));
  const copy = createElement('div', 'directive-starship-record-copy');
  const statusLine = createElement('div', 'directive-starship-record-status-line');
  const labelElement = createElement('span', 'directive-lcars-kicker directive-starship-record-label');
  labelElement.textContent = label;
  const stateElement = createElement('span', 'directive-starship-record-state');
  stateElement.textContent = state || 'Available';
  statusLine.append(labelElement, stateElement);
  const titleElement = createElement('strong', 'directive-starship-record-title');
  titleElement.textContent = title || 'Untitled record';
  copy.append(statusLine, titleElement);
  if (meta) {
    const metaElement = createElement('span', 'directive-starship-record-meta');
    metaElement.textContent = meta;
    copy.appendChild(metaElement);
  }
  const actionCell = createElement('div', 'directive-starship-record-action-cell');
  if (action) actionCell.appendChild(action);
  row.append(marker, copy, actionCell);
  return row;
}

function createRecordTable(title, count) {
  const section = createElement('section', 'directive-starship-record-section');
  const header = createElement('div', 'directive-starship-record-section-header');
  const heading = createElement('h3', 'directive-subsection-title');
  heading.textContent = title;
  const countPill = createElement('span', 'directive-starship-record-count');
  countPill.textContent = String(count || 0);
  header.append(heading, countPill);
  const columns = createElement('div', 'directive-starship-record-columns');
  columns.innerHTML = '<span>Record</span><span>Action</span>';
  section.append(header, columns);
  return section;
}

function createSaveRow(save, selected, onSelect) {
  const row = createElement('button', `directive-starship-record-row directive-starship-save-row${save.current ? ' directive-starship-current-record' : ''}${selected ? ' directive-starship-record-row-selected' : ''}`);
  row.type = 'button';
  row.setAttribute('aria-pressed', selected ? 'true' : 'false');
  const marker = createElement('span', 'directive-starship-record-marker');
  marker.appendChild(createIcon(save.current ? 'fa-solid fa-play' : 'fa-solid fa-floppy-disk'));
  const copy = createElement('span', 'directive-starship-record-copy');
  const statusLine = createElement('span', 'directive-starship-record-status-line');
  const label = createElement('span', 'directive-lcars-kicker directive-starship-record-label');
  label.textContent = save.current ? 'Current Save' : (save.slotType || 'Save');
  const state = createElement('span', 'directive-starship-record-state');
  state.textContent = save.current ? 'Active' : 'Stored';
  statusLine.append(label, state);
  const title = createElement('strong', 'directive-starship-record-title');
  title.textContent = save.name || 'Untitled save';
  const meta = createElement('span', 'directive-starship-record-meta');
  meta.textContent = [save.metadata?.campaignTitle || 'Campaign', save.metadata?.stardate ? formatStardate(save.metadata.stardate) : '', formatTime(save.updatedAt)].filter(Boolean).join(' / ');
  copy.append(statusLine, title, meta);
  const actionCell = createElement('span', 'directive-starship-record-action-cell');
  actionCell.appendChild(createIcon('fa-solid fa-chevron-right'));
  row.append(marker, copy, actionCell);
  row.addEventListener('click', onSelect);
  return row;
}

function createSaveInspector(save, actions) {
  const inspector = createCard('directive-starship-save-inspector directive-lcars-panel');
  const header = createElement('div', 'directive-starship-library-detail-header');
  const titleBlock = createElement('div');
  appendText(titleBlock, 'span', 'directive-lcars-kicker', save ? 'Selected Save' : 'No Save Selected');
  appendText(titleBlock, 'strong', 'directive-starship-library-detail-title', save?.name || 'No campaign saves available');
  appendText(titleBlock, 'span', 'directive-starship-library-detail-subtitle', save ? formatTime(save.updatedAt) : 'Create or load a campaign to populate Records.');
  const state = createElement('span', `directive-starship-panel-state directive-status-${save ? 'success' : 'warning'}`);
  state.textContent = save ? (save.current ? 'Active' : 'Stored') : 'Empty';
  header.append(titleBlock, state);
  inspector.appendChild(header);

  if (!save) {
    appendText(inspector, 'p', 'directive-runtime-empty', 'Campaign saves will appear here after Character Creator begins a campaign or Mission writes a save.');
    return inspector;
  }

  const metadata = save.metadata || {};
  const grid = createElement('div', 'directive-starship-save-inspector-grid');
  grid.append(
    createStatusBlock('Campaign', metadata.campaignTitle || 'Campaign', 'neutral', 'fa-solid fa-scroll'),
    createStatusBlock('Player', metadata.playerName || 'Player Commander', 'neutral', 'fa-solid fa-user'),
    createStatusBlock('Ship', metadata.shipName || 'Starship', 'neutral', 'fa-solid fa-shuttle-space'),
    createStatusBlock('Stardate', formatStardate(metadata.stardate), 'neutral', 'fa-solid fa-clock'),
    createStatusBlock('Mission', formatMissionLabel(metadata.activeMissionId), 'neutral', 'fa-solid fa-map'),
    createStatusBlock('Phase', formatMissionLabel(metadata.activePhaseId, 'Pending'), 'neutral', 'fa-solid fa-location-crosshairs'),
    createStatusBlock('Mode', metadata.simulationMode || 'Pending', 'neutral', 'fa-solid fa-sliders'),
    createStatusBlock('Revision', save.revision ?? 1, 'neutral', 'fa-solid fa-code-branch')
  );
  inspector.appendChild(grid);

  const summary = createElement('article', 'directive-starship-save-summary');
  appendText(summary, 'span', 'directive-lcars-kicker', 'Snapshot');
  appendText(summary, 'p', '', compactText(metadata.summary, 'No save summary recorded yet.', 360));
  inspector.appendChild(summary);

  const actionRow = createElement('div', 'directive-starship-save-actions');
  actionRow.appendChild(createButton({
    label: 'Load Save',
    icon: 'fa-solid fa-folder-open',
    className: 'directive-button directive-primary-command directive-starship-record-action',
    title: 'Load selected save',
    onClick: async () => {
      await actions.loadGame({ saveId: save.id });
      actions.setActiveTab('mission');
      await actions.refresh();
    }
  }));
  inspector.appendChild(actionRow);
  return inspector;
}

function createDraftSetupSection(drafts, actions) {
  const pendingDrafts = asArray(drafts).filter((draft) => draft.status !== 'accepted');
  const section = createElement('section', 'directive-starship-setup-drafts');
  const header = createElement('div', 'directive-starship-record-section-header');
  const heading = createElement('h3', 'directive-subsection-title');
  heading.textContent = 'Character Setup Drafts';
  const count = createElement('span', 'directive-starship-record-count');
  count.textContent = String(pendingDrafts.length);
  header.append(heading, count);
  section.appendChild(header);
  if (!pendingDrafts.length) {
    appendText(section, 'p', 'directive-runtime-empty', 'No unfinished character setup is waiting.');
    return section;
  }
  for (const draft of pendingDrafts) {
    section.appendChild(createRecordRow({
      label: 'Setup Draft',
      state: 'Unfinished',
      title: draft.campaignTitle || draft.packageTitle,
      meta: [draft.roleLabel, draft.activeStep ? `Step ${draft.activeStep}` : '', formatTime(draft.updatedAt)].filter(Boolean).join(' / '),
      action: createButton({
        label: 'Continue Character Setup',
        icon: 'fa-solid fa-user-pen',
        className: 'directive-button directive-secondary-command directive-starship-record-action',
        title: 'Continue unfinished character setup',
        onClick: async () => {
          await actions.resumeCreatorDraft({ draftId: draft.id });
          await actions.refresh();
        }
      })
    }));
  }
  return section;
}

function createRecordsConsole(starships, actions) {
  const drafts = starships.drafts || [];
  const saves = starships.saves || [];
  const selected = selectedSave(starships);
  const records = createElement('section', 'directive-records directive-starship-records-console directive-lcars-panel');

  const left = createElement('aside', 'directive-starship-records-sidebar');
  left.appendChild(createCardTitle('Save Records'));
  const current = saves.find((save) => save.current);
  const currentCard = createElement('div', 'directive-starship-current-save-summary');
  const label = createElement('span', 'directive-lcars-kicker');
  label.textContent = 'Current Save';
  const name = createElement('strong');
  name.textContent = current?.name || 'No active save';
  const meta = createElement('span');
  meta.textContent = current ? `${current.metadata?.campaignTitle || 'Campaign'} / ${formatTime(current.updatedAt)}` : 'Load or begin a campaign';
  currentCard.append(label, name, meta);
  left.appendChild(currentCard);

  const statusGrid = createElement('div', 'directive-starship-records-status-grid');
  statusGrid.append(
    createRecordStatusBlock('Saves', saves.length, saves.length ? 'success' : 'neutral'),
    createRecordStatusBlock('Current', current ? 'Ready' : 'None', current ? 'success' : 'warning'),
    createRecordStatusBlock('Manual', saves.filter((save) => save.slotType !== 'autosave').length, saves.length ? 'neutral' : 'warning'),
    createRecordStatusBlock('Autosaves', saves.filter((save) => save.slotType === 'autosave').length, 'neutral')
  );
  left.appendChild(statusGrid);

  const center = createElement('div', 'directive-starship-records-main');
  if (!saves.length) {
    const empty = createElement('div', 'directive-starship-records-empty');
    empty.appendChild(createIcon('fa-solid fa-box-archive'));
    const emptyTitle = createElement('strong');
    emptyTitle.textContent = 'No Saves Available';
    const emptySummary = createElement('span');
    emptySummary.textContent = 'Campaign saves will appear here after setup begins a campaign.';
    empty.append(emptyTitle, emptySummary);
    center.appendChild(empty);
  }

  if (saves.length) {
    const saveSection = createRecordTable('Save Files', saves.length);
    for (const save of saves) {
      saveSection.appendChild(createSaveRow(save, save.id === selected?.id, (event) => {
        activeRecordSaveId = save.id;
        for (const row of saveSection.querySelectorAll('.directive-starship-save-row')) {
          row.classList.remove('directive-starship-record-row-selected');
          row.setAttribute('aria-pressed', 'false');
        }
        event.currentTarget.classList.add('directive-starship-record-row-selected');
        event.currentTarget.setAttribute('aria-pressed', 'true');
        clearElement(inspectorSlot);
        inspectorSlot.appendChild(createSaveInspector(save, actions));
      }));
    }
    center.appendChild(saveSection);
  }

  center.appendChild(createDraftSetupSection(drafts, actions));
  const inspectorSlot = createElement('aside', 'directive-starship-records-inspector');
  inspectorSlot.appendChild(createSaveInspector(selected, actions));

  records.append(left, center, inspectorSlot);
  return records;
}

function createRecordsSection(starships, actions) {
  const section = createStarshipsSection({ id: 'directive-starships-records-section', label: 'Records' });
  section.appendChild(createSectionHeading('Records', 'Save Library', 'Select a save file, review its snapshot, then load it into Mission.'));
  section.appendChild(createRecordsConsole(starships, actions));
  return section;
}

export function renderStarshipsPanel(body, view, actions) {
  appendSectionTitle(body, 'Starships');
  const starships = view?.starships || {};
  const importControl = createImportControl(actions);
  const consoleSurface = createElement('div', 'directive-starships-console directive-lcars-console');

  let selectStarshipsSection = () => {};
  const openLibrary = () => selectStarshipsSection('directive-starships-library-section');
  const openRecords = () => selectStarshipsSection('directive-starships-records-section');
  const commandSection = createCommandSection(starships, view, actions, openLibrary, openRecords);
  const librarySection = createLibrarySection(starships, view, actions, importControl, openRecords);
  const recordsSection = createRecordsSection(starships, actions);
  const sections = [
    { id: commandSection.id, label: 'Command', icon: 'fa-solid fa-rocket', section: commandSection },
    { id: librarySection.id, label: 'Library & Import', icon: 'fa-solid fa-file-import', section: librarySection },
    { id: recordsSection.id, label: 'Records', icon: 'fa-solid fa-box-archive', section: recordsSection }
  ];
  const fallback = starships.packages?.length ? commandSection.id : librarySection.id;
  const preferred = sections.some((item) => item.id === activeStarshipsSection) ? activeStarshipsSection : fallback;
  const tabs = createStarshipsSubtabs(sections, preferred);
  selectStarshipsSection = tabs.select;
  consoleSurface.append(tabs.nav, commandSection, librarySection, recordsSection);
  body.appendChild(consoleSurface);
}
