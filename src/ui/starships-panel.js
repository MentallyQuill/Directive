import {
  appendEmpty,
  appendBulletList,
  appendSectionTitle,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createMetaRow
} from './runtime-ui-kit.js';

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
  if (label.includes('ready') || label.includes('healthy') || label.includes('ok') || label.includes('stored')) return 'success';
  return 'neutral';
}

function createStatusBlock(label, value, tone = statusTone(value)) {
  const block = createElement('div', `directive-lcars-status-block directive-status-${tone}`);
  const key = createElement('span', 'directive-lcars-status-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-lcars-status-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  block.append(key, content);
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
  fileInput.accept = '.directive-starship.zip,application/zip';
  fileInput.hidden = true;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const bytes = await readFileBytes(file);
    await actions.importStarshipPackageArchive({
      fileName: file.name,
      bytes
    });
    fileInput.value = '';
    await actions.refresh();
  });

  return {
    fileInput,
    button: createButton({
      label: 'Import Package',
      icon: 'fa-solid fa-file-import',
      className: 'directive-button directive-secondary-command',
      title: 'Import a data-only .directive-starship.zip package',
      disabled: typeof actions.importStarshipPackageArchive !== 'function',
      onClick: () => fileInput.click()
    })
  };
}

function appendImportDiagnostics(container, result) {
  if (!result) return;
  const card = createCard('directive-starship-import-result-card');
  const diagnostics = result.diagnostics || {};
  const meta = createElement('div', 'directive-card-meta');
  meta.append(
    createMetaRow('Last Import', result.ok ? 'Stored' : 'Rejected'),
    createMetaRow('Status', diagnosticStatusLabel(diagnostics)),
    createMetaRow('Issues', issueCount(diagnostics)),
    createMetaRow('Package', result.packageId || 'None')
  );
  card.append(createCardTitle('Import Diagnostics'), meta);
  const issues = (diagnostics.issues || []).slice(0, 4).map((issue) => `${issue.severity || 'info'}: ${issue.message || issue.code || 'Package issue'}`);
  if (issues.length > 0) {
    appendBulletList(card, issues);
  }
  container.appendChild(card);
}

function createLibraryCard(starships, importControl) {
  const libraryCard = createCard('directive-starship-library-card directive-lcars-panel');
  const libraryMeta = createElement('div', 'directive-card-meta');
  libraryMeta.append(
    createMetaRow('Loaded Packages', starships?.packages?.length || 0),
    createMetaRow('Imported Packages', starships.imports?.length || 0),
    createMetaRow('Import Status', 'Ready')
  );
  const libraryActions = createElement('div', 'directive-action-row directive-library-action-row');
  libraryActions.append(importControl.button);
  libraryCard.append(createCardTitle('Package Library'), libraryMeta, libraryActions, importControl.fileInput);
  return libraryCard;
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
  identity.appendChild(createCardTitle(pack.title));
  const summary = createElement('p', 'directive-starship-identity-summary');
  summary.textContent = `${pack.ship?.name || 'Unknown starship'} / ${pack.ship?.class || 'Unknown class'} / ${pack.campaign?.title || 'No campaign title'}`;
  identity.appendChild(summary);

  const source = pack.source || (pack.bundled ? 'bundled' : 'imported');
  const statusRail = createElement('div', 'directive-starship-status-rail');
  statusRail.append(
    createStatusBlock('Health', pack.diagnostics?.status || 'unknown'),
    createStatusBlock('Source', source),
    createStatusBlock('Issues', pack.diagnostics?.issueCount ?? 0, Number(pack.diagnostics?.issueCount || 0) > 0 ? 'warning' : 'success')
  );
  header.append(identity, statusRail);

  const commandZone = createElement('div', 'directive-primary-command-zone');
  const commandText = createElement('div', 'directive-primary-command-copy');
  const commandLabel = createElement('span', 'directive-lcars-kicker');
  commandLabel.textContent = 'Next Command';
  const commandTitle = createElement('strong');
  commandTitle.textContent = command.primary.label;
  commandText.append(commandLabel, commandTitle);
  const primaryAction = createElement('div', 'directive-primary-command-action');
  appendCommandButton(primaryAction, command.primary, 'directive-button directive-primary-command');
  commandZone.append(commandText, primaryAction);

  const readiness = createElement('div', 'directive-lcars-readiness-grid');
  readiness.append(
    createStatusBlock('Mission Graphs', `${pack.runtimeAssets?.missionGraphCount || 0}`),
    createStatusBlock('Projection', pack.runtimeAssets?.hasProjection ? 'Ready' : 'Missing', pack.runtimeAssets?.hasProjection ? 'success' : 'danger'),
    createStatusBlock('Crew Data', pack.runtimeAssets?.hasCrewDataset ? 'Ready' : 'Missing', pack.runtimeAssets?.hasCrewDataset ? 'success' : 'warning'),
    createStatusBlock('Drafts', pack.counts?.drafts || 0, Number(pack.counts?.drafts || 0) > 0 ? 'warning' : 'neutral'),
    createStatusBlock('Saves', pack.counts?.saves || 0, Number(pack.counts?.saves || 0) > 0 ? 'success' : 'neutral')
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

function appendRecords(body, starships, actions) {
  const drafts = starships.drafts || [];
  const saves = starships.saves || [];
  if (!drafts.length && !saves.length) return;

  const records = createElement('section', 'directive-records directive-starship-records-console directive-lcars-panel');
  const overview = createElement('div', 'directive-starship-records-header');
  const copy = createElement('div', 'directive-starship-records-copy');
  const heading = createElement('h3', 'directive-card-title');
  heading.textContent = 'Records';
  const summary = createElement('p', 'directive-starship-records-summary');
  summary.textContent = 'Resume drafts and load saved branches without leaving Starships.';
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
  body.appendChild(records);
}

export function renderStarshipsPanel(body, view, actions) {
  appendSectionTitle(body, 'Starships');
  const starships = view?.starships;
  const importControl = createImportControl(actions);
  const consoleSurface = createElement('div', 'directive-starships-console directive-lcars-console');

  const overview = createElement('div', 'directive-starships-overview');
  overview.append(
    createStatusBlock('Packages', starships?.packages?.length || 0, starships?.packages?.length ? 'success' : 'warning'),
    createStatusBlock('Imports', starships?.imports?.length || 0),
    createStatusBlock('Library', 'Ready', 'success')
  );
  consoleSurface.appendChild(overview);

  if (!starships?.packages?.length) {
    consoleSurface.appendChild(createLibraryCard(starships || {}, importControl));
    appendEmpty(consoleSurface, 'No packages loaded.');
    body.appendChild(consoleSurface);
    return;
  }

  const list = createElement('div', 'directive-card-list directive-starship-command-list');
  for (const pack of starships.packages) {
    list.appendChild(createPackageCard(pack, actions));
  }
  consoleSurface.appendChild(list);
  consoleSurface.appendChild(createLibraryCard(starships, importControl));
  appendImportDiagnostics(consoleSurface, starships.lastImportResult);
  body.appendChild(consoleSurface);
  appendRecords(body, starships, actions);
}
