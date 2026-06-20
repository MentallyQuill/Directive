import {
  appendSectionTitle,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createIcon,
  createMetaRow
} from './runtime-ui-kit.js';

let activeStarshipsSection = '';

function issueCount(diagnostics) {
  return Array.isArray(diagnostics?.issues) ? diagnostics.issues.length : 0;
}

function diagnosticStatusLabel(diagnostics) {
  return diagnostics?.status || 'none';
}

function readFileBytes(file) {
  if (file && typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  if (typeof FileReader !== 'function') {
    throw new Error('This browser cannot read local package files.');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error || new Error('Package file could not be read.')));
    reader.readAsArrayBuffer(file);
  });
}

function statusTone(value) {
  const label = String(value || '').toLowerCase();
  if (label.includes('error') || label.includes('rejected') || label.includes('missing')) return 'danger';
  if (label.includes('warning') || label.includes('issue')) return 'warning';
  if (label.includes('ready') || label.includes('healthy') || label.includes('ok') || label.includes('stored') || label.includes('success')) return 'success';
  return 'neutral';
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

function createRecordStatusBlock(label, value, tone = statusTone(value)) {
  const block = createStatusBlock(label, value, tone);
  block.classList.add('directive-starship-record-status-block');
  return block;
}

function formatRecordTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDiagnosticTime(value) {
  if (!value) return 'No import recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function createRecordSection(title, count) {
  const section = createElement('section', 'directive-starship-record-section');
  const header = createElement('div', 'directive-starship-record-section-header');
  const heading = createElement('h3', 'directive-subsection-title');
  heading.textContent = title;
  const countPill = createElement('span', 'directive-starship-record-count');
  countPill.textContent = String(count || 0);
  header.append(heading, countPill);
  section.appendChild(header);
  return section;
}

function createRecordRow({
  title,
  label,
  meta = '',
  state = '',
  current = false,
  accepted = false,
  action
}) {
  const row = createElement('article', `directive-starship-record-row${current ? ' directive-starship-current-record' : ''}${accepted ? ' directive-starship-accepted-record' : ''}`);
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
  if (action) {
    actionCell.appendChild(action);
  }
  row.append(copy, actionCell);
  return row;
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
    await actions.importStarshipPackageArchive({
      fileName: file.name,
      bytes
    });
    fileInput.value = '';
    await actions.refresh();
  };

  fileInput.addEventListener('change', async () => {
    await importFile(fileInput.files?.[0]);
  });

  const browseButton = createButton({
    label: 'Browse to Select File',
    icon: 'fa-solid fa-folder-open',
    className: 'directive-button directive-import-browse-command',
    title: 'Choose a .directive-starship.zip package',
    disabled: typeof actions.importStarshipPackageArchive !== 'function',
    onClick: () => fileInput.click()
  });

  const button = createButton({
    label: 'Import Package',
    icon: 'fa-solid fa-file-import',
    className: 'directive-button directive-primary-command directive-import-package-command',
    title: 'Import a data-only .directive-starship.zip package',
    disabled: typeof actions.importStarshipPackageArchive !== 'function',
    onClick: () => fileInput.click()
  });

  return {
    fileInput,
    browseButton,
    button,
    importFile
  };
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
    }
  };

  for (const item of items) {
    const button = createElement('button', 'directive-starships-subtab');
    button.type = 'button';
    button.dataset.starshipsSubtabTarget = item.id;
    button.setAttribute('aria-controls', item.id);
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

function createPackageCommand(pack, actions) {
  const loadAction = pack.actions?.loadLatestSave
    ? {
        id: 'load',
        label: 'Load Save',
        icon: 'fa-solid fa-folder-open',
        title: 'Load latest save',
        onClick: async () => {
          await actions.loadGame({ saveId: pack.actions.loadLatestSave });
          actions.setActiveTab('mission');
          await actions.refresh();
        }
      }
    : null;
  const resumeAction = pack.actions?.resumeDraft
    ? {
        id: 'resume',
        label: 'Resume Draft',
        icon: 'fa-solid fa-pen-to-square',
        title: 'Resume Character Creator draft',
        onClick: async () => {
          await actions.resumeCreatorDraft({ draftId: pack.actions.resumeDraft });
          await actions.refresh();
        }
      }
    : null;
  const startAction = {
    id: 'start',
    label: 'Start Campaign',
    icon: 'fa-solid fa-plus',
    title: pack.actions?.startNewCampaign ? 'Start campaign' : 'Runtime assets are required before this package can start a campaign',
    disabled: pack.actions?.startNewCampaign !== true,
    onClick: async () => {
      await actions.startCreatorDraft({ packageId: pack.packageId });
      await actions.refresh();
    }
  };

  const orderedActions = [loadAction, resumeAction, startAction].filter(Boolean);
  const primary = orderedActions.find((item) => item.disabled !== true) || startAction;
  const secondary = orderedActions.filter((item) => item !== primary);

  return {
    primary,
    secondary
  };
}

function appendCommandButton(container, command, className) {
  container.appendChild(createButton({
    ...command,
    className
  }));
}

function createPackageCard(pack, actions) {
  const card = createCard('directive-starship-card directive-starship-command-card directive-lcars-panel');
  const command = createPackageCommand(pack, actions);

  const header = createElement('div', 'directive-starship-command-header');
  const identity = createElement('div', 'directive-starship-identity');
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = pack.bundled ? 'Bundled Package' : 'Imported Package';
  identity.append(kicker, createCardTitle(pack.title));
  const summary = createElement('p', 'directive-starship-identity-summary');
  summary.textContent = `${pack.ship?.name || 'Unknown starship'} / ${pack.ship?.class || 'Unknown class'} / ${pack.campaign?.title || 'No campaign title'}`;
  identity.appendChild(summary);

  const source = pack.source || (pack.bundled ? 'bundled' : 'imported');
  const statusRail = createElement('div', 'directive-starship-status-rail');
  statusRail.append(
    createStatusBlock('Health', pack.diagnostics?.status || 'unknown', statusTone(pack.diagnostics?.status), 'fa-solid fa-heart-pulse'),
    createStatusBlock('Source', source, 'neutral', 'fa-solid fa-box-archive'),
    createStatusBlock('Issues', pack.diagnostics?.issueCount ?? 0, Number(pack.diagnostics?.issueCount || 0) > 0 ? 'warning' : 'success', 'fa-solid fa-triangle-exclamation')
  );
  header.append(identity, statusRail);

  const commandZone = createElement('div', 'directive-primary-command-zone');
  const commandText = createElement('div', 'directive-primary-command-copy');
  const commandLabel = createElement('span', 'directive-lcars-kicker');
  commandLabel.textContent = 'Next Safe Command';
  const commandTitle = createElement('strong');
  commandTitle.textContent = command.primary.label;
  const commandHint = createElement('span', 'directive-primary-command-hint');
  commandHint.textContent = command.primary.title || 'Continue with this package.';
  commandText.append(commandLabel, commandTitle, commandHint);
  const primaryAction = createElement('div', 'directive-primary-command-action');
  appendCommandButton(primaryAction, command.primary, 'directive-button directive-primary-command');
  commandZone.append(commandText, primaryAction);

  const readiness = createElement('div', 'directive-lcars-readiness-grid');
  readiness.append(
    createStatusBlock('Mission Graphs', `${pack.runtimeAssets?.missionGraphCount || 0}`, 'neutral', 'fa-solid fa-diagram-project'),
    createStatusBlock('Projection', pack.runtimeAssets?.hasProjection ? 'Ready' : 'Missing', pack.runtimeAssets?.hasProjection ? 'success' : 'danger', 'fa-solid fa-chart-line'),
    createStatusBlock('Crew Data', pack.runtimeAssets?.hasCrewDataset ? 'Ready' : 'Missing', pack.runtimeAssets?.hasCrewDataset ? 'success' : 'warning', 'fa-solid fa-users'),
    createStatusBlock('Drafts', pack.counts?.drafts || 0, Number(pack.counts?.drafts || 0) > 0 ? 'warning' : 'neutral', 'fa-solid fa-pen-ruler'),
    createStatusBlock('Saves', pack.counts?.saves || 0, Number(pack.counts?.saves || 0) > 0 ? 'success' : 'neutral', 'fa-solid fa-floppy-disk')
  );

  const meta = createElement('div', 'directive-card-meta directive-starship-meta');
  meta.append(
    createMetaRow('Role', pack.playerRole?.label),
    createMetaRow('Runtime Assets', `${pack.runtimeAssets?.missionGraphCount || 0} graphs`),
    createMetaRow('Package Health', pack.diagnostics?.status || 'unknown'),
    createMetaRow('Package Issues', pack.diagnostics?.issueCount ?? 0)
  );

  const secondaryActions = createElement('div', 'directive-action-row directive-secondary-command-row');
  for (const item of command.secondary) {
    appendCommandButton(secondaryActions, item, 'directive-button directive-secondary-command');
  }

  card.append(header, commandZone, readiness, meta);
  if (secondaryActions.children.length > 0) {
    card.appendChild(secondaryActions);
  }
  return card;
}

function librarySnapshot(starships = {}) {
  const packages = starships.packages || [];
  const drafts = starships.drafts || [];
  const saves = starships.saves || [];
  const issuePackages = packages.filter((pack) => Number(pack.diagnostics?.issueCount || 0) > 0);
  const readyPackages = packages.filter((pack) => {
    return pack.runtimeAssets?.missionGraphCount > 0
      && pack.runtimeAssets?.hasProjection
      && pack.runtimeAssets?.hasCrewDataset
      && pack.diagnostics?.status !== 'error';
  });
  return {
    packages: packages.length,
    ready: readyPackages.length,
    issuePackages: issuePackages.length,
    imports: (starships.imports || []).length,
    drafts: drafts.length,
    saves: saves.length,
    status: issuePackages.some((pack) => pack.diagnostics?.status === 'error') ? 'Needs Attention' : 'Nominal'
  };
}

function createLibraryMetric(label, value, tone = 'neutral') {
  const row = createElement('div', `directive-library-health-row directive-status-${tone}`);
  const key = createElement('span', 'directive-library-health-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-library-health-value');
  content.textContent = String(value ?? 0);
  row.append(key, content);
  return row;
}

function createLibraryHealthPanel(starships, onOpenRecords) {
  const snapshot = librarySnapshot(starships);
  const panel = createElement('section', 'directive-library-health-panel directive-lcars-panel');
  const band = createElement('div', 'directive-lcars-panel-band directive-library-health-band');
  band.textContent = 'Library Health';
  const metrics = createElement('div', 'directive-library-health-metrics');
  metrics.append(
    createLibraryMetric('Loaded Packages', snapshot.packages, snapshot.packages ? 'warning' : 'neutral'),
    createLibraryMetric('Ready for Use', snapshot.ready, snapshot.ready ? 'success' : 'neutral'),
    createLibraryMetric('With Issues', snapshot.issuePackages, snapshot.issuePackages ? 'danger' : 'success'),
    createLibraryMetric('Imported Packages', snapshot.imports, snapshot.imports ? 'warning' : 'neutral'),
    createLibraryMetric('Import Status', 'Ready', 'success'),
    createLibraryMetric('Creator Drafts', snapshot.drafts, snapshot.drafts ? 'warning' : 'neutral'),
    createLibraryMetric('Saved Branches', snapshot.saves, snapshot.saves ? 'success' : 'neutral')
  );
  const status = createElement('div', 'directive-library-health-status');
  const dot = createElement('span', 'directive-library-health-dot');
  dot.setAttribute('aria-hidden', 'true');
  const statusLabel = createElement('span');
  statusLabel.textContent = 'Library Status';
  const statusValue = createElement('strong');
  statusValue.textContent = snapshot.status;
  status.append(dot, statusLabel, statusValue);

  const recordsButton = createButton({
    label: 'Open Records Manager',
    icon: 'fa-solid fa-arrow-right-to-bracket',
    className: 'directive-button directive-secondary-command directive-open-records-command',
    title: 'Review creator drafts and saved branches',
    onClick: onOpenRecords
  });
  panel.append(band, metrics, status, recordsButton);
  return panel;
}

function createImportWorkbench(importControl) {
  const panel = createElement('section', 'directive-import-workbench directive-lcars-panel');
  const band = createElement('div', 'directive-lcars-panel-band directive-import-workbench-band');
  band.textContent = 'Import Package';

  const dropzone = createElement('div', 'directive-import-dropzone');
  dropzone.tabIndex = 0;
  dropzone.setAttribute('role', 'button');
  dropzone.setAttribute('aria-label', 'Drop a Directive starship package here or open the file picker');
  const icon = createElement('span', 'directive-import-dropzone-icon');
  icon.appendChild(createIcon('fa-solid fa-arrow-down-to-bracket'));
  const title = createElement('strong', 'directive-import-dropzone-title');
  title.textContent = 'Drop Package File Here';
  const extension = createElement('span', 'directive-import-dropzone-extension');
  extension.textContent = '.DIRECTIVE-STARSHIP.ZIP';
  const divider = createElement('span', 'directive-import-dropzone-divider');
  divider.textContent = 'OR';
  dropzone.append(icon, title, extension, divider, importControl.browseButton);

  const openPicker = (event) => {
    if (event?.target !== dropzone && event?.type === 'click') return;
    importControl.fileInput.click();
  };
  dropzone.addEventListener('click', openPicker);
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault?.();
      importControl.fileInput.click();
    }
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault?.();
    dropzone.classList.add('directive-import-dropzone-active');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('directive-import-dropzone-active');
  });
  dropzone.addEventListener('drop', async (event) => {
    event.preventDefault?.();
    dropzone.classList.remove('directive-import-dropzone-active');
    await importControl.importFile(event.dataTransfer?.files?.[0]);
  });

  const source = createElement('div', 'directive-import-source-row');
  const sourceLabel = createElement('span');
  sourceLabel.textContent = 'Package Source';
  const sourceValue = createElement('strong');
  sourceValue.textContent = 'Local File System';
  source.append(sourceLabel, sourceValue);

  const action = createElement('div', 'directive-import-command-row');
  action.appendChild(importControl.button);
  panel.append(band, dropzone, source, action, importControl.fileInput);
  return panel;
}

function diagnosticTone(severity = '') {
  return severity === 'error' ? 'danger' : severity === 'warning' ? 'warning' : 'neutral';
}

function createDiagnosticIssueRow(issue) {
  const row = createElement('div', `directive-import-issue-row directive-status-${diagnosticTone(issue?.severity)}`);
  const icon = createElement('span', 'directive-import-issue-icon');
  icon.appendChild(createIcon(issue?.severity === 'error' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-exclamation'));
  const severity = createElement('strong', 'directive-import-issue-severity');
  severity.textContent = String(issue?.severity || 'info').toUpperCase();
  const type = createElement('span', 'directive-import-issue-type');
  type.textContent = String(issue?.code || 'diagnostic').replaceAll('-', ' ');
  const detail = createElement('span', 'directive-import-issue-detail');
  detail.textContent = issue?.message || 'Package diagnostic issue.';
  row.append(icon, severity, type, detail);
  return row;
}

function createImportDiagnosticsBay(result) {
  const panel = createElement('section', 'directive-import-diagnostics-bay directive-lcars-panel');
  const band = createElement('div', 'directive-lcars-panel-band directive-import-diagnostics-band');
  const bandTitle = createElement('span');
  bandTitle.textContent = 'Latest Import Diagnostics';
  const time = createElement('span', 'directive-import-diagnostics-time');
  time.textContent = formatDiagnosticTime(result?.importedAt);
  band.append(bandTitle, time);
  panel.appendChild(band);

  if (!result) {
    const empty = createElement('div', 'directive-import-diagnostics-empty');
    const icon = createElement('span', 'directive-import-diagnostics-empty-icon');
    icon.appendChild(createIcon('fa-solid fa-box-open'));
    const title = createElement('strong');
    title.textContent = 'No Import Recorded';
    const summary = createElement('span');
    summary.textContent = 'Choose a package archive to run validation and storage diagnostics.';
    empty.append(icon, title, summary);
    panel.appendChild(empty);
    return panel;
  }

  const diagnostics = result.diagnostics || {};
  const issues = diagnostics.issues || [];
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  const resultTone = result.ok ? 'success' : 'danger';

  const identity = createElement('div', 'directive-import-diagnostics-identity');
  const packageBlock = createElement('div');
  const packageLabel = createElement('span');
  packageLabel.textContent = 'Package';
  const packageValue = createElement('strong');
  packageValue.textContent = result.packageId || diagnostics.sourceFileName || 'Unresolved package';
  packageBlock.append(packageLabel, packageValue);
  const outcome = createElement('div', `directive-import-result directive-status-${resultTone}`);
  outcome.appendChild(createIcon(result.ok ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark'));
  const outcomeText = createElement('strong');
  outcomeText.textContent = result.ok ? 'SUCCESS' : 'REJECTED';
  outcome.appendChild(outcomeText);
  identity.append(packageBlock, outcome);

  const statusGrid = createElement('div', 'directive-import-diagnostics-status-grid');
  statusGrid.append(
    createStatusBlock('Status', diagnosticStatusLabel(diagnostics), resultTone, 'fa-solid fa-wave-square'),
    createStatusBlock('Issues', issues.length, issues.length ? 'warning' : 'success', 'fa-solid fa-list-check'),
    createStatusBlock('Errors', errors, errors ? 'danger' : 'success', 'fa-solid fa-circle-xmark'),
    createStatusBlock('Warnings', warnings, warnings ? 'warning' : 'success', 'fa-solid fa-triangle-exclamation'),
    createStatusBlock('Last Import', result.ok ? 'Stored' : 'Rejected', resultTone, 'fa-solid fa-box-archive'),
    createStatusBlock('Source', result.source || 'imported', 'neutral', 'fa-solid fa-database')
  );
  panel.append(identity, statusGrid);

  const issuesHeader = createElement('div', 'directive-import-issues-header');
  const issuesTitle = createElement('strong');
  issuesTitle.textContent = issues.length ? 'Issues Detected' : 'Validation Complete';
  const issuesCount = createElement('span');
  issuesCount.textContent = `${issues.length} issue${issues.length === 1 ? '' : 's'}`;
  issuesHeader.append(issuesTitle, issuesCount);
  panel.appendChild(issuesHeader);

  const issueList = createElement('div', 'directive-import-issue-list');
  if (issues.length > 0) {
    for (const issue of issues.slice(0, 5)) {
      issueList.appendChild(createDiagnosticIssueRow(issue));
    }
  } else {
    const clear = createElement('div', 'directive-import-validation-clear');
    clear.appendChild(createIcon('fa-solid fa-circle-check'));
    const copy = createElement('span');
    copy.textContent = 'The package passed import validation with no reported issues.';
    clear.appendChild(copy);
    issueList.appendChild(clear);
  }
  panel.appendChild(issueList);
  return panel;
}

function createLibraryImportConsole(starships, importControl, onOpenRecords) {
  const console = createElement('div', 'directive-starships-library-console');
  console.appendChild(createSectionHeading(
    'Package Library',
    'Import & Diagnostics',
    'Validate data-only starship packages before they enter the active library.'
  ));
  const grid = createElement('div', 'directive-starships-library-grid');
  grid.append(
    createLibraryHealthPanel(starships, onOpenRecords),
    createImportWorkbench(importControl),
    createImportDiagnosticsBay(starships.lastImportResult)
  );
  const note = createElement('p', 'directive-import-safety-note');
  note.appendChild(createIcon('fa-solid fa-circle-info'));
  const text = createElement('span');
  text.textContent = 'Packages are validated before storage. Errors reject the import; warnings remain visible for review.';
  note.appendChild(text);
  console.append(grid, note);
  return console;
}

function createCommandSection(starships, actions) {
  const section = createStarshipsSection({
    id: 'directive-starships-command-section',
    label: 'Command'
  });
  section.appendChild(createSectionHeading(
    'Starship Command',
    'Package Operations',
    'Select the next safe campaign action from the loaded package library.'
  ));

  const overview = createElement('div', 'directive-starships-overview');
  overview.append(
    createStatusBlock('Packages', starships?.packages?.length || 0, starships?.packages?.length ? 'success' : 'warning', 'fa-solid fa-boxes-stacked'),
    createStatusBlock('Imports', starships?.imports?.length || 0, 'neutral', 'fa-solid fa-file-import'),
    createStatusBlock('Library', starships?.packages?.length ? 'Ready' : 'Empty', starships?.packages?.length ? 'success' : 'warning', 'fa-solid fa-database')
  );
  section.appendChild(overview);

  if (!starships?.packages?.length) {
    const empty = createElement('div', 'directive-starships-command-empty directive-lcars-panel');
    const icon = createElement('span');
    icon.appendChild(createIcon('fa-solid fa-box-open'));
    const title = createElement('strong');
    title.textContent = 'No Packages Loaded';
    const summary = createElement('span');
    summary.textContent = 'Open Library & Import to add a Directive starship package.';
    empty.append(icon, title, summary);
    section.appendChild(empty);
    return section;
  }

  const list = createElement('div', 'directive-card-list directive-starship-command-list');
  for (const pack of starships.packages) {
    list.appendChild(createPackageCard(pack, actions));
  }
  section.appendChild(list);
  return section;
}

function createRecordsConsole(starships, actions) {
  const drafts = starships.drafts || [];
  const saves = starships.saves || [];
  const records = createElement('section', 'directive-records directive-starship-records-console directive-lcars-panel');
  const overview = createElement('div', 'directive-starship-records-header');
  const copy = createElement('div', 'directive-starship-records-copy');
  const heading = createElement('h3', 'directive-card-title');
  heading.textContent = 'Records Manager';
  const summary = createElement('p', 'directive-starship-records-summary');
  summary.textContent = 'Resume creator drafts and load saved branches without leaving Starships.';
  copy.append(heading, summary);

  const statusGrid = createElement('div', 'directive-starship-records-status-grid');
  statusGrid.append(
    createRecordStatusBlock('Drafts', drafts.length, drafts.length ? 'warning' : 'neutral'),
    createRecordStatusBlock('Accepted', drafts.filter((draft) => draft.status === 'accepted').length, drafts.some((draft) => draft.status === 'accepted') ? 'success' : 'neutral'),
    createRecordStatusBlock('Saves', saves.length, saves.length ? 'success' : 'neutral'),
    createRecordStatusBlock('Current', saves.some((save) => save.current) ? 'Ready' : 'None', saves.some((save) => save.current) ? 'success' : 'warning')
  );
  overview.append(copy, statusGrid);
  records.appendChild(overview);

  if (!drafts.length && !saves.length) {
    const empty = createElement('div', 'directive-starship-records-empty');
    const icon = createElement('span');
    icon.appendChild(createIcon('fa-solid fa-box-archive'));
    const title = createElement('strong');
    title.textContent = 'No Records Available';
    const summaryText = createElement('span');
    summaryText.textContent = 'Creator drafts and campaign saves will appear here.';
    empty.append(icon, title, summaryText);
    records.appendChild(empty);
    return records;
  }

  if (drafts.length) {
    const draftSection = createRecordSection('Creator Drafts', drafts.length);
    for (const draft of drafts) {
      const accepted = draft.status === 'accepted';
      const meta = [
        draft.roleLabel || 'Package role',
        draft.revision ? `rev ${draft.revision}` : '',
        formatRecordTime(draft.updatedAt || draft.acceptedAt)
      ].filter(Boolean).join(' / ');
      draftSection.appendChild(createRecordRow({
        label: accepted ? 'Accepted' : 'Draft',
        state: accepted ? 'Accepted' : draft.activeStep ? `Step ${draft.activeStep}` : 'In progress',
        title: draft.packageTitle,
        meta,
        accepted,
        action: createButton({
          label: 'Resume',
          icon: 'fa-solid fa-pen-to-square',
          className: 'directive-button directive-secondary-command directive-starship-record-action',
          title: 'Resume draft',
          disabled: accepted,
          onClick: async () => {
            await actions.resumeCreatorDraft({ draftId: draft.id });
            await actions.refresh();
          }
        })
      }));
    }
    records.appendChild(draftSection);
  }

  if (saves.length) {
    const saveSection = createRecordSection('Saves', saves.length);
    for (const save of saves) {
      const meta = [
        save.slotType || 'save',
        save.revision ? `rev ${save.revision}` : '',
        formatRecordTime(save.updatedAt),
        save.metadata?.stardate ? `SD ${save.metadata.stardate}` : ''
      ].filter(Boolean).join(' / ');
      saveSection.appendChild(createRecordRow({
        label: save.current ? 'Current Save' : 'Save',
        state: save.current ? 'Active' : 'Stored',
        title: save.name,
        meta,
        current: save.current === true,
        action: createButton({
          label: 'Load',
          icon: 'fa-solid fa-folder-open',
          className: 'directive-button directive-secondary-command directive-starship-record-action',
          title: 'Load save',
          onClick: async () => {
            await actions.loadGame({ saveId: save.id });
            actions.setActiveTab('mission');
            await actions.refresh();
          }
        })
      }));
    }
    records.appendChild(saveSection);
  }
  return records;
}

function createRecordsSection(starships, actions) {
  const section = createStarshipsSection({
    id: 'directive-starships-records-section',
    label: 'Records'
  });
  section.appendChild(createSectionHeading(
    'Continuity Records',
    'Drafts & Saved Branches',
    'Manage player-visible campaign continuity without exposing hidden simulation state.'
  ));
  section.appendChild(createRecordsConsole(starships, actions));
  return section;
}

export function renderStarshipsPanel(body, view, actions) {
  appendSectionTitle(body, 'Starships');
  const starships = view?.starships || {};
  const importControl = createImportControl(actions);
  const consoleSurface = createElement('div', 'directive-starships-console directive-lcars-console');

  const commandSection = createCommandSection(starships, actions);
  let selectStarshipsSection = () => {};
  const librarySection = createStarshipsSection({
    id: 'directive-starships-library-section',
    label: 'Library & Import'
  });
  librarySection.appendChild(createLibraryImportConsole(starships, importControl, () => {
    selectStarshipsSection('directive-starships-records-section');
  }));
  const recordsSection = createRecordsSection(starships, actions);

  const sections = [
    {
      id: commandSection.id,
      label: 'Command',
      icon: 'fa-solid fa-rocket',
      section: commandSection
    },
    {
      id: librarySection.id,
      label: 'Library & Import',
      icon: 'fa-solid fa-file-import',
      section: librarySection
    },
    {
      id: recordsSection.id,
      label: 'Records',
      icon: 'fa-solid fa-box-archive',
      section: recordsSection
    }
  ];

  const fallbackSection = starships.packages?.length
    ? 'directive-starships-command-section'
    : 'directive-starships-library-section';
  const preferredSection = sections.some((item) => item.id === activeStarshipsSection)
    ? activeStarshipsSection
    : fallbackSection;
  const tabs = createStarshipsSubtabs(sections, preferredSection);
  selectStarshipsSection = tabs.select;

  consoleSurface.append(tabs.nav, commandSection, librarySection, recordsSection);
  body.appendChild(consoleSurface);
}
