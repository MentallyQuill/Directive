import {
  appendEmpty,
  appendSectionTitle,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createMetaRow
} from './runtime-ui-kit.js';

export function renderStarshipsPanel(body, view, actions) {
  appendSectionTitle(body, 'Starships');
  const starships = view?.starships;
  if (!starships?.packages?.length) {
    appendEmpty(body, 'No packages loaded.');
    return;
  }

  const list = createElement('div', 'directive-card-list');
  for (const pack of starships.packages) {
    const card = createCard('directive-starship-card');
    const meta = createElement('div', 'directive-card-meta');
    meta.append(
      createMetaRow('Ship', `${pack.ship?.name || 'Unknown'} (${pack.ship?.class || 'Unknown class'})`),
      createMetaRow('Campaign', pack.campaign?.title),
      createMetaRow('Role', pack.playerRole?.label),
      createMetaRow('Drafts', pack.counts?.drafts || 0),
      createMetaRow('Saves', pack.counts?.saves || 0)
    );

    const actionRow = createElement('div', 'directive-action-row');
    actionRow.appendChild(createButton({
      label: 'Start Campaign',
      icon: 'fa-solid fa-plus',
      title: 'Start campaign',
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
