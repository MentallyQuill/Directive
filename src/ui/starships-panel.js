import {
  appendSectionTitle,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createIcon
} from './runtime-ui-kit.js';
import { createPackageImage } from './directive-media.js';

let activeStarshipsSection = '';

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

function packageCommands(pack, actions) {
  return {
    start: {
      label: 'Start Campaign',
      icon: 'fa-solid fa-chevron-right',
      title: pack.actions?.startNewCampaign ? 'Create a new campaign' : 'Runtime assets are incomplete',
      disabled: !pack.actions?.startNewCampaign,
      onClick: async () => {
        await actions.startCreatorDraft({ packageId: pack.packageId });
        await actions.refresh();
      }
    },
    resume: pack.actions?.resumeDraft ? {
      label: 'Resume Draft',
      icon: 'fa-solid fa-play',
      title: 'Resume the current Character Creator draft',
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

function readinessItems(pack, packageData) {
  const imageCount = asArray(packageData?.assets?.images).length;
  const crewCount = asArray(packageData?.crew?.senior).filter((crew) => crew.id !== 'player-commander').length;
  const missionCount = Number(pack.runtimeAssets?.missionGraphCount || 0);
  return [
    {
      label: 'Campaign Package',
      detail: `${pack.ship?.name || 'Starship'} / ${pack.campaign?.title || 'Campaign'}`,
      ready: statusTone(pack.diagnostics?.status) !== 'danger',
      icon: 'fa-solid fa-shield-halved',
      tone: 'operations'
    },
    {
      label: 'Required Content',
      detail: `Crew, ship, missions, and systems / ${crewCount || 'package'} staff records`,
      ready: pack.runtimeAssets?.hasCrewDataset !== false && missionCount > 0,
      icon: 'fa-solid fa-people-group',
      tone: 'command'
    },
    {
      label: 'Rules & Systems',
      detail: `Directive core / ${asArray(pack.simulationModes).join(' + ') || 'simulation modes'}`,
      ready: true,
      icon: 'fa-solid fa-rectangle-list',
      tone: 'science'
    },
    {
      label: 'Visual Assets',
      detail: imageCount ? `${imageCount} package-owned image records` : 'Fallback visuals available',
      ready: imageCount > 0,
      icon: 'fa-solid fa-images',
      tone: 'operations'
    }
  ];
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

function createAssetMeter(label, detail, current, total, tone, icon) {
  const row = createElement('article', `directive-starship-asset-row directive-asset-${tone}`);
  const iconFrame = createElement('span', 'directive-starship-asset-icon');
  iconFrame.appendChild(createIcon(icon));
  const copy = createElement('div', 'directive-starship-asset-copy');
  const title = createElement('strong');
  title.textContent = label;
  const summary = createElement('span');
  summary.textContent = detail;
  copy.append(title, summary);
  const meter = createElement('div', 'directive-starship-asset-meter');
  const value = createElement('strong');
  value.textContent = `${current} / ${total}`;
  const track = createElement('span', 'directive-starship-asset-track');
  const fill = createElement('span', 'directive-starship-asset-fill');
  fill.setAttribute('style', `width: ${total > 0 ? Math.max(0, Math.min(100, current / total * 100)) : 0}%`);
  track.appendChild(fill);
  meter.append(value, track);
  row.append(iconFrame, copy, meter);
  return row;
}

function createPackageHome(pack, packageData, actions, onImport) {
  const commands = packageCommands(pack, actions);
  const shell = createElement('div', 'directive-starship-package-home');

  const hero = createElement('section', 'directive-starship-package-hero directive-lcars-panel');
  const visual = createPackageImage(packageData, {
    kind: 'ship.hero',
    subjectId: pack.ship?.id || 'uss-breckenridge',
    variant: 'card'
  }, {
    wrapperClass: 'directive-starship-package-visual',
    label: pack.ship?.name || pack.title,
    icon: 'fa-solid fa-shuttle-space',
    loading: 'eager'
  });
  const copy = createElement('div', 'directive-starship-package-copy');
  const statusLine = createElement('div', 'directive-starship-package-status-line');
  const label = createElement('span');
  label.textContent = 'Package Status';
  const state = createElement('strong');
  const ready = statusTone(pack.diagnostics?.status) !== 'danger' && pack.actions?.startNewCampaign !== false;
  state.textContent = ready ? 'Ready' : 'Review';
  state.appendChild(createElement('span', ready ? 'directive-status-dot-success' : 'directive-status-dot-warning'));
  statusLine.append(label, state);

  const title = createElement('h3', 'directive-starship-package-title');
  title.textContent = pack.ship?.name || pack.title;
  const campaign = createElement('p', 'directive-starship-package-campaign');
  campaign.textContent = pack.campaign?.title || pack.title;
  const accessiblePackageName = createElement('span', 'directive-assistive-copy');
  accessiblePackageName.textContent = `${pack.ship?.name || pack.title}: ${pack.campaign?.title || pack.title}`;
  const tagRow = createElement('div', 'directive-starship-package-tags');
  for (const tag of [`Starships Package`, pack.version || 'Version pending', pack.ship?.class || 'Starship']) {
    const pill = createElement('span');
    pill.textContent = tag;
    tagRow.appendChild(pill);
  }
  const description = createElement('p', 'directive-starship-package-description');
  description.textContent = packageData?.mainCampaign?.highConcept
    ? String(packageData.mainCampaign.highConcept).split('. ').slice(0, 2).join('. ').trim()
    : 'A Directive campaign of diplomacy, duty, and difficult choices. Your ship. Your crew. Your call.';
  copy.append(statusLine, title, campaign, accessiblePackageName, tagRow, description);
  hero.append(visual, copy);
  shell.appendChild(hero);

  const primary = createElement('div', 'directive-primary-command-zone directive-starship-primary-command');
  const next = commands.load || commands.resume || commands.start;
  const nextButton = createActionButton({
    ...next,
    label: commands.load ? 'Continue Campaign' : commands.resume ? 'Resume Draft' : 'Start Campaign'
  }, 'directive-primary-command directive-starship-start-command');
  primary.appendChild(nextButton);
  shell.appendChild(primary);

  const secondary = createElement('div', 'directive-starship-secondary-actions');
  secondary.append(
    createActionButton({
      label: 'Import Package',
      icon: 'fa-solid fa-download',
      title: 'Import a Directive starship package',
      onClick: onImport
    }, 'directive-starship-secondary-command directive-starship-import-shortcut')
  );
  if (commands.resume && next !== commands.resume) secondary.appendChild(createActionButton(commands.resume, 'directive-starship-secondary-command'));
  if (commands.load) secondary.appendChild(createActionButton(commands.load, 'directive-starship-secondary-command'));
  if (!commands.resume && !commands.load) {
    secondary.appendChild(createActionButton({
      label: 'New Draft',
      icon: 'fa-solid fa-user-pen',
      title: 'Create a new Character Creator draft',
      disabled: commands.start.disabled,
      onClick: commands.start.onClick
    }, 'directive-starship-secondary-command'));
  }
  shell.appendChild(secondary);

  const contentGrid = createElement('div', 'directive-starship-home-content-grid');
  const readiness = createCard('directive-starship-package-readiness directive-lcars-panel');
  const readinessHeader = createElement('div', 'directive-starship-panel-header');
  readinessHeader.append(createCardTitle('Package Readiness'));
  const readinessBadge = createElement('span', `directive-starship-panel-state ${ready ? 'directive-status-success' : 'directive-status-warning'}`);
  readinessBadge.textContent = ready ? 'Ready' : 'Review';
  readinessHeader.appendChild(readinessBadge);
  readiness.appendChild(readinessHeader);
  const readinessList = createElement('div', 'directive-starship-readiness-list');
  for (const item of readinessItems(pack, packageData)) readinessList.appendChild(createReadinessRow(item));
  readiness.appendChild(readinessList);

  const assets = createCard('directive-starship-runtime-assets directive-lcars-panel');
  const assetHeader = createElement('div', 'directive-starship-panel-header');
  assetHeader.append(createCardTitle('Runtime Asset Status'));
  const assetBadge = createElement('span', 'directive-starship-panel-state directive-status-success');
  assetBadge.textContent = 'All systems go';
  assetHeader.appendChild(assetBadge);
  assets.appendChild(assetHeader);
  const imageRecords = asArray(packageData?.assets?.images);
  const crewImages = imageRecords.filter((entry) => String(entry.kind || '').startsWith('crew.')).length;
  const shipImages = imageRecords.filter((entry) => String(entry.kind || '').startsWith('ship.')).length;
  const missionGraphs = Number(pack.runtimeAssets?.missionGraphCount || 0);
  const datasets = Number(pack.datasetCount || 0);
  const assetList = createElement('div', 'directive-starship-asset-list');
  assetList.append(
    createAssetMeter('Ship Assets', 'Primary vessel visuals and package identity', shipImages, Math.max(1, shipImages), 'science', 'fa-solid fa-shuttle-space'),
    createAssetMeter('Crew Portraits', 'Senior staff formal records', crewImages, Math.max(7, crewImages), 'command', 'fa-solid fa-user-group'),
    createAssetMeter('Mission Content', 'Mission graphs and authored scenes', missionGraphs, Math.max(3, missionGraphs), 'operations', 'fa-solid fa-map'),
    createAssetMeter('Package Datasets', 'Crew, projection, and package contracts', datasets, Math.max(4, datasets), 'science', 'fa-solid fa-cubes')
  );
  assets.appendChild(assetList);
  contentGrid.append(readiness, assets);
  shell.appendChild(contentGrid);

  const footer = createElement('footer', 'directive-starship-package-footer');
  const checked = createElement('span');
  checked.innerHTML = '<strong>Last check</strong><span>Current runtime view</span>';
  const refresh = createButton({
    label: 'Refresh Status',
    icon: 'fa-solid fa-rotate',
    className: 'directive-button directive-secondary-command directive-starship-refresh-command',
    title: 'Refresh package readiness',
    onClick: actions.refresh
  });
  footer.append(checked, refresh);
  shell.appendChild(footer);
  return shell;
}

function createCommandSection(starships, view, actions, onOpenLibrary) {
  const section = createStarshipsSection({ id: 'directive-starships-command-section', label: 'Command' });
  section.appendChild(createSectionHeading('Starship Command', 'Package Operations', 'Select the next safe campaign action from the loaded package library.'));
  const overview = createElement('div', 'directive-starships-overview');
  overview.append(
    createStatusBlock('Packages', starships.packages?.length || 0, starships.packages?.length ? 'success' : 'warning', 'fa-solid fa-boxes-stacked'),
    createStatusBlock('Drafts', starships.drafts?.length || 0, starships.drafts?.length ? 'warning' : 'neutral', 'fa-solid fa-user-pen'),
    createStatusBlock('Saves', starships.saves?.length || 0, starships.saves?.length ? 'success' : 'neutral', 'fa-solid fa-floppy-disk')
  );
  section.appendChild(overview);

  if (!starships.packages?.length) {
    const empty = createCard('directive-starship-empty-state directive-lcars-panel');
    empty.append(createIcon('fa-solid fa-box-open'), createCardTitle('No Packages Loaded'));
    const message = createElement('p');
    message.textContent = 'Import a Directive starship package to begin.';
    empty.appendChild(message);
    empty.appendChild(createActionButton({ label: 'Open Package Import', icon: 'fa-solid fa-file-import', onClick: onOpenLibrary }, 'directive-primary-command'));
    section.appendChild(empty);
    return section;
  }

  for (const pack of starships.packages) {
    section.appendChild(createPackageHome(pack, packageDataFor(view, pack), actions, onOpenLibrary));
  }
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

function createLibrarySection(starships, importControl) {
  const section = createStarshipsSection({ id: 'directive-starships-library-section', label: 'Library & Import' });
  section.appendChild(createSectionHeading('Package Library', 'Import & Diagnostics', 'Validate data-only starship packages before they enter the active library.'));

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
    createStatusBlock('Saved Campaigns', starships.saves?.length || 0, starships.saves?.length ? 'success' : 'neutral', 'fa-solid fa-floppy-disk')
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
  columns.innerHTML = '<span>Name</span><span>Context / Updated</span><span>Actions</span>';
  section.append(header, columns);
  return section;
}

function createRecordsConsole(starships, actions, importControl) {
  const drafts = starships.drafts || [];
  const saves = starships.saves || [];
  const records = createElement('section', 'directive-records directive-starship-records-console directive-lcars-panel');

  const left = createElement('aside', 'directive-starship-records-sidebar');
  left.appendChild(createCardTitle('Status Overview'));
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
    createRecordStatusBlock('Drafts', drafts.length, drafts.length ? 'warning' : 'neutral'),
    createRecordStatusBlock('Accepted', drafts.filter((draft) => draft.status === 'accepted').length, drafts.some((draft) => draft.status === 'accepted') ? 'success' : 'neutral'),
    createRecordStatusBlock('Saves', saves.length, saves.length ? 'success' : 'neutral'),
    createRecordStatusBlock('Current', current ? 'Ready' : 'None', current ? 'success' : 'warning')
  );
  left.appendChild(statusGrid);
  const quickTitle = createElement('h4', 'directive-inline-title');
  quickTitle.textContent = 'Quick Actions';
  left.appendChild(quickTitle);
  const quickActions = createElement('div', 'directive-starship-record-quick-actions');
  quickActions.append(
    createActionButton({ label: 'New Save', icon: 'fa-solid fa-floppy-disk', disabled: typeof actions.saveCurrentGame !== 'function', onClick: async () => { await actions.saveCurrentGame({ summary: 'Manual save from Records.' }); await actions.refresh(); } }),
    createActionButton({ label: 'Save As', icon: 'fa-solid fa-code-branch', disabled: typeof actions.saveCurrentGameAs !== 'function', onClick: async () => { await actions.saveCurrentGameAs({ name: `Directive Branch ${new Date().toLocaleString()}` }); await actions.refresh(); } }),
    createActionButton({ label: 'Import Package', icon: 'fa-solid fa-file-import', onClick: () => importControl.fileInput.click() })
  );
  left.appendChild(quickActions);

  const center = createElement('div', 'directive-starship-records-main');
  if (!drafts.length && !saves.length) {
    const empty = createElement('div', 'directive-starship-records-empty');
    empty.appendChild(createIcon('fa-solid fa-box-archive'));
    const emptyTitle = createElement('strong');
    emptyTitle.textContent = 'No Records Available';
    const emptySummary = createElement('span');
    emptySummary.textContent = 'Creator drafts and campaign saves will appear here.';
    empty.append(emptyTitle, emptySummary);
    center.appendChild(empty);
  }

  if (saves.length) {
    const saveSection = createRecordTable('Saves', saves.length);
    for (const save of saves) {
      const metaText = [save.metadata?.campaignTitle || save.metadata?.missionTitle || 'Campaign', save.metadata?.stardate ? `SD ${save.metadata.stardate}` : '', formatTime(save.updatedAt)].filter(Boolean).join(' / ');
      saveSection.appendChild(createRecordRow({
        label: save.current ? 'Current Save' : (save.slotType || 'Save'),
        state: save.current ? 'Active' : 'Stored',
        title: save.name,
        meta: metaText,
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
    center.appendChild(saveSection);
  }

  if (drafts.length) {
    const draftSection = createRecordTable('Creator Drafts', drafts.length);
    for (const draft of drafts) {
      const accepted = draft.status === 'accepted';
      const metaText = [draft.campaignTitle || draft.packageTitle, draft.activeStep ? `Step ${draft.activeStep}` : '', formatTime(draft.updatedAt || draft.acceptedAt)].filter(Boolean).join(' / ');
      draftSection.appendChild(createRecordRow({
        label: accepted ? 'Accepted' : 'Draft',
        state: accepted ? 'Accepted' : 'Resume',
        title: draft.packageTitle,
        meta: metaText,
        accepted,
        action: createButton({
          label: accepted ? 'View' : 'Resume',
          icon: accepted ? 'fa-solid fa-eye' : 'fa-solid fa-pen-to-square',
          className: 'directive-button directive-secondary-command directive-starship-record-action',
          title: accepted ? 'Accepted draft cannot be edited' : 'Resume draft',
          disabled: accepted,
          onClick: async () => {
            await actions.resumeCreatorDraft({ draftId: draft.id });
            await actions.refresh();
          }
        })
      }));
    }
    center.appendChild(draftSection);
  }

  const right = createElement('aside', 'directive-starship-records-import-panel');
  right.appendChild(createCardTitle('Package Import'));
  const miniDropzone = createElement('div', 'directive-starship-record-mini-dropzone');
  miniDropzone.append(createIcon('fa-solid fa-download'));
  const miniTitle = createElement('strong');
  miniTitle.textContent = 'Drag & Drop Package';
  const miniText = createElement('span');
  miniText.textContent = '.directive-starship.zip';
  miniDropzone.append(miniTitle, miniText, importControl.browseButton);
  miniDropzone.addEventListener('dragover', (event) => event.preventDefault());
  miniDropzone.addEventListener('drop', async (event) => {
    event.preventDefault();
    await importControl.importFile(event.dataTransfer?.files?.[0]);
  });
  right.append(miniDropzone, importControl.fileInput);
  const diagnostics = starships.lastImportResult;
  const last = createElement('div', 'directive-starship-record-last-import');
  const lastLabel = createElement('span', 'directive-lcars-kicker');
  lastLabel.textContent = 'Last Import Result';
  const lastTitle = createElement('strong');
  lastTitle.textContent = diagnostics?.fileName || diagnostics?.packageTitle || 'No import recorded';
  const lastStatus = createElement('span', `directive-status-${statusTone(diagnostics?.status)}`);
  lastStatus.textContent = diagnostics ? diagnostics.status || 'Complete' : 'Awaiting package';
  last.append(lastLabel, lastTitle, lastStatus);
  right.appendChild(last);

  records.append(left, center, right);
  return records;
}

function createRecordsSection(starships, actions, importControl) {
  const section = createStarshipsSection({ id: 'directive-starships-records-section', label: 'Records' });
  section.appendChild(createSectionHeading('Continuity Records', 'Record Management', 'Manage campaign saves, creator drafts, and package imports from one operational surface.'));
  section.appendChild(createRecordsConsole(starships, actions, importControl));
  return section;
}

export function renderStarshipsPanel(body, view, actions) {
  appendSectionTitle(body, 'Starships');
  const starships = view?.starships || {};
  const importControl = createImportControl(actions);
  const consoleSurface = createElement('div', 'directive-starships-console directive-lcars-console');

  let selectStarshipsSection = () => {};
  const commandSection = createCommandSection(starships, view, actions, () => selectStarshipsSection('directive-starships-library-section'));
  const librarySection = createLibrarySection(starships, importControl);
  const recordsSection = createRecordsSection(starships, actions, importControl);
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
