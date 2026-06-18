import {
  appendBulletList,
  appendEmpty,
  appendSectionTitle,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createMetaRow
} from './runtime-ui-kit.js';

function chapterForMission(view, missionId) {
  return (view.activePackage?.campaign?.chapters || []).find((chapter) => chapter.id === missionId) || null;
}

export function renderMissionPanel(body, view, actions) {
  appendSectionTitle(body, 'Mission');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, 'No active campaign.');
    return;
  }

  const chapter = chapterForMission(view, state.mission?.activeMissionId);
  const latestLedger = (state.turnLedger?.entries || []).at(-1);
  const card = createCard('directive-mission-card');
  card.append(
    createCardTitle(chapter?.title || state.mission?.activeMissionId || 'Active Mission'),
    createMetaRow('Player', `${state.player?.rank || ''} ${state.player?.name || ''}`.trim()),
    createMetaRow('Ship', state.ship?.name),
    createMetaRow('Campaign', state.campaign?.title),
    createMetaRow('Mission', state.mission?.activeMissionId),
    createMetaRow('Phase', state.mission?.phase || state.mission?.activePhaseId),
    createMetaRow('Stardate', state.campaign?.currentStardate),
    createMetaRow('Mode', state.settings?.simulationMode),
    createMetaRow('Last Outcome', state.turnLedger?.lastCommittedOutcomeId),
    createMetaRow('Narration', latestLedger?.narrationStatus)
  );

  const actionRow = createElement('div', 'directive-action-row');
  actionRow.append(
    createButton({
      label: 'Save Game',
      icon: 'fa-solid fa-floppy-disk',
      title: 'Save game',
      onClick: async () => {
        await actions.saveCurrentGame({ summary: 'Manual runtime save.' });
        await actions.refresh();
      }
    }),
    createButton({
      label: 'Save As',
      icon: 'fa-solid fa-copy',
      title: 'Save game as',
      onClick: async () => {
        const name = typeof globalThis.prompt === 'function'
          ? globalThis.prompt('Save name', '')
          : '';
        await actions.saveCurrentGameAs({ name });
        await actions.refresh();
      }
    })
  );
  card.appendChild(actionRow);
  body.appendChild(card);

  const objectives = state.mission?.formalObjectives || [];
  if (objectives.length > 0) {
    const objectiveCard = createCard('directive-mission-objectives-card');
    objectiveCard.appendChild(createCardTitle('Formal Objectives'));
    appendBulletList(objectiveCard, objectives);
    body.appendChild(objectiveCard);
  }

  const directives = state.directives?.active || [];
  if (directives.length > 0) {
    const directivesCard = createCard('directive-mission-directives-card');
    directivesCard.appendChild(createCardTitle('Active Directives'));
    appendBulletList(directivesCard, directives.slice(0, 5));
    body.appendChild(directivesCard);
  }
}
