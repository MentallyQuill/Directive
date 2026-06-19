import {
  appendBulletList,
  appendEmpty,
  appendSectionTitle,
  createCard,
  createCardTitle,
  createElement,
  createMetaRow
} from './runtime-ui-kit.js';

export function renderCommandLogPanel(body, view) {
  appendSectionTitle(body, 'Log');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, 'No command log entries.');
    return;
  }

  const entries = state.commandLog?.entries || [];
  if (entries.length === 0) {
    appendEmpty(body, 'No command log entries.');
    return;
  }

  const list = createElement('div', 'directive-card-list');
  for (const entry of entries.slice().reverse()) {
    const card = createCard('directive-log-card');
    card.append(
      createCardTitle(entry.id || entry.type || 'Command Log Entry'),
      createMetaRow('Type', entry.type),
      createMetaRow('Stardate', entry.stardate),
      createMetaRow('Source', entry.source || entry.sourceOutcomeId)
    );
    if (entry.assistedSummary?.summary) {
      card.appendChild(createMetaRow('Assisted Summary', entry.assistedSummary.summary));
    } else if (entry.assistedSummary?.status && entry.assistedSummary.status !== 'complete') {
      card.appendChild(createMetaRow('Assisted Summary', entry.assistedSummary.status));
    }
    if (entry.assistedSummary?.highlights?.length) {
      const highlightTitle = createElement('h4', 'directive-inline-title');
      highlightTitle.textContent = 'Highlights';
      card.appendChild(highlightTitle);
      appendBulletList(card, entry.assistedSummary.highlights);
    }
    if (entry.summaryInputs?.length) {
      const summaryTitle = createElement('h4', 'directive-inline-title');
      summaryTitle.textContent = 'Committed Inputs';
      card.appendChild(summaryTitle);
      appendBulletList(card, entry.summaryInputs);
    }
    if (entry.visibleConsequences?.length) {
      const consequenceTitle = createElement('h4', 'directive-inline-title');
      consequenceTitle.textContent = 'Visible Consequences';
      card.appendChild(consequenceTitle);
      appendBulletList(card, entry.visibleConsequences);
    }
    list.appendChild(card);
  }
  body.appendChild(list);
}
