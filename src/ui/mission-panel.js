import {
  appendBulletList,
  appendEmpty,
  appendSectionTitle,
  collectInputByPath,
  createButton,
  createCard,
  createCardTitle,
  createElement,
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
  const card = createCard('directive-command-brief-card');
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
  const card = createCard('directive-pressure-ledger-card');
  card.appendChild(createCardTitle('Active Pressures'));
  appendBulletList(card, records.map((record) => {
    const status = record.status === 'active' ? 'Active' : record.status === 'cooling' ? 'Cooling' : 'Deferred';
    return `${status}: ${record.playerSummary || record.title}`;
  }));
  body.appendChild(card);
}

function appendProceduralWarnings(container, pending, actions) {
  const warnings = pending?.competencePacket?.proceduralWarnings || [];
  const confirmation = pending?.warningConfirmation || {};
  if (warnings.length === 0) return false;

  const card = createCard('directive-procedural-warning-card');
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
  const card = createCard('directive-turn-input-card');
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

  const card = createCard('directive-provisional-outcome-card');
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
  const card = createCard('directive-last-outcome-card');
  card.appendChild(createCardTitle('Last Outcome'));
  if (turn.provisionalOutcome && turn.finalOutcome) {
    card.append(
      createMetaRow('Provisional', turn.provisionalOutcome.resultBand),
      createMetaRow('Final', turn.finalOutcome.resultBand)
    );
  }
  if (turn.bearingSpend) {
    card.appendChild(createMetaRow('Bearing', `${turn.bearingSpend.label} invoked`));
  }
  appendOutcomeDetails(card, turn.finalOutcome || turn.outcomePacket);
  const outcomeId = turn.outcomePacket?.id;
  if (outcomeId) {
    const row = createElement('div', 'directive-action-row');
    row.append(
      createButton({
        label: 'Rewrite Narration',
        icon: 'fa-solid fa-rotate-right',
        title: 'Retry narration without rerunning mechanics',
        onClick: async () => {
          await actions.retryNarrationForLastTurn();
          await actions.refresh();
        }
      }),
      createButton({
        label: 'Rerun Outcome',
        icon: 'fa-solid fa-dice',
        title: 'Preview new mechanics from the original pre-outcome snapshot',
        onClick: async () => {
          await actions.previewOutcomeReplacement({
            outcomeId,
            playerInput: turn.sceneSnapshot?.playerInput || ''
          });
          await actions.refresh();
        }
      }),
      createButton({
        label: 'Delete Outcome',
        icon: 'fa-solid fa-trash',
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
    card.appendChild(row);
  }
  body.appendChild(card);
}

function appendNarrationRetry(body, view, actions) {
  const recovery = view?.campaignState?.turnLedger?.pendingNarrationRecovery;
  if (!recovery) return;
  const card = createCard('directive-narration-retry-card');
  card.append(
    createCardTitle('Narration Recovery'),
    createMetaRow('Outcome', recovery.outcomeId),
    createMetaRow('Provider', recovery.providerId),
    createMetaRow('Failure', recovery.message)
  );
  const row = createElement('div', 'directive-action-row');
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
    createMetaRow('Narration', latestLedger?.narrationStatus),
    createMetaRow('Autosave', autosave ? autosave.updatedAt : 'None')
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
  appendPressureLedger(body, state);

  const hasPendingTurn = appendPendingTurn(body, view, actions);
  if (!hasPendingTurn) {
    appendTurnInput(body, actions);
  }
  appendNarrationRetry(body, view, actions);
  appendLastOutcome(body, view, actions);

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
