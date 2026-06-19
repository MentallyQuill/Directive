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

function appendImportDiagnostics(body, result) {
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
  body.appendChild(card);
}

export function renderStarshipsPanel(body, view, actions) {
  appendSectionTitle(body, 'Starships');
  const starships = view?.starships;
  if (!starships?.packages?.length) {
    appendEmpty(body, 'No packages loaded.');
    return;
  }

  const libraryCard = createCard('directive-starship-library-card');
  const libraryMeta = createElement('div', 'directive-card-meta');
  libraryMeta.append(
    createMetaRow('Loaded Packages', starships.packages.length),
    createMetaRow('Imported Packages', starships.imports?.length || 0),
    createMetaRow('Import Status', 'Ready')
  );
  const libraryActions = createElement('div', 'directive-action-row');
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
  libraryActions.appendChild(createButton({
    label: 'Import Package',
    icon: 'fa-solid fa-file-import',
    title: 'Import a data-only .directive-starship.zip package',
    disabled: typeof actions.importStarshipPackageArchive !== 'function',
    onClick: () => fileInput.click()
  }));
  libraryCard.append(createCardTitle('Package Library'), libraryMeta, libraryActions, fileInput);
  body.appendChild(libraryCard);
  appendImportDiagnostics(body, starships.lastImportResult);

  const list = createElement('div', 'directive-card-list');
  for (const pack of starships.packages) {
    const card = createCard('directive-starship-card');
    const meta = createElement('div', 'directive-card-meta');
    meta.append(
      createMetaRow('Ship', `${pack.ship?.name || 'Unknown'} (${pack.ship?.class || 'Unknown class'})`),
      createMetaRow('Campaign', pack.campaign?.title),
      createMetaRow('Role', pack.playerRole?.label),
      createMetaRow('Source', pack.source || (pack.bundled ? 'bundled' : 'imported')),
      createMetaRow('Runtime Assets', `${pack.runtimeAssets?.missionGraphCount || 0} graphs`),
      createMetaRow('Package Health', pack.diagnostics?.status || 'unknown'),
      createMetaRow('Package Issues', pack.diagnostics?.issueCount ?? 0),
      createMetaRow('Drafts', pack.counts?.drafts || 0),
      createMetaRow('Saves', pack.counts?.saves || 0)
    );

    const actionRow = createElement('div', 'directive-action-row');
    actionRow.appendChild(createButton({
      label: 'Start Campaign',
      icon: 'fa-solid fa-plus',
      title: pack.actions?.startNewCampaign ? 'Start campaign' : 'Runtime assets are required before this package can start a campaign',
      disabled: pack.actions?.startNewCampaign !== true,
      onClick: async () => {
        await actions.startCreatorDraft({ packageId: pack.packageId });
        await actions.refresh();
      }
    }));
    if (pack.actions?.resumeDraft) {
      actionRow.appendChild(createButton({
        label: 'Resume Draft',
        icon: 'fa-solid fa-pen-to-square',
        title: 'Resume Character Creator draft',
        onClick: async () => {
          await actions.resumeCreatorDraft({ draftId: pack.actions.resumeDraft });
          await actions.refresh();
        }
      }));
    }
    if (pack.actions?.loadLatestSave) {
      actionRow.appendChild(createButton({
        label: 'Load Save',
        icon: 'fa-solid fa-folder-open',
        title: 'Load latest save',
        onClick: async () => {
          await actions.loadGame({ saveId: pack.actions.loadLatestSave });
          actions.setActiveTab('mission');
          await actions.refresh();
        }
      }));
    }

    card.append(createCardTitle(pack.title), meta, actionRow);
    list.appendChild(card);
  }
  body.appendChild(list);

  if (starships.drafts?.length || starships.saves?.length) {
    const records = createElement('section', 'directive-records');
    if (starships.drafts?.length) {
      const draftTitle = createElement('h3', 'directive-subsection-title');
      draftTitle.textContent = 'Creator Drafts';
      records.appendChild(draftTitle);
      for (const draft of starships.drafts) {
        const row = createElement('div', 'directive-record-row');
        row.append(
          createMetaRow(draft.status === 'accepted' ? 'Accepted' : 'Draft', `${draft.packageTitle} - ${draft.roleLabel}`),
          createButton({
            label: 'Resume',
            icon: 'fa-solid fa-pen-to-square',
            title: 'Resume draft',
            disabled: draft.status === 'accepted',
            onClick: async () => {
              await actions.resumeCreatorDraft({ draftId: draft.id });
              await actions.refresh();
            }
          })
        );
        records.appendChild(row);
      }
    }

    if (starships.saves?.length) {
      const saveTitle = createElement('h3', 'directive-subsection-title');
      saveTitle.textContent = 'Saves';
      records.appendChild(saveTitle);
      for (const save of starships.saves) {
        const row = createElement('div', 'directive-record-row');
        row.append(
          createMetaRow(save.current ? 'Current Save' : 'Save', save.name),
          createButton({
            label: 'Load',
            icon: 'fa-solid fa-folder-open',
            title: 'Load save',
            onClick: async () => {
              await actions.loadGame({ saveId: save.id });
              actions.setActiveTab('mission');
              await actions.refresh();
            }
          })
        );
        records.appendChild(row);
      }
    }
    body.appendChild(records);
  }
}
