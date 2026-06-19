import {
  appendEmpty,
  appendSectionTitle,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createMetaRow,
  joinList
} from './runtime-ui-kit.js';
import { simulationModeSettingsRows } from '../simulation/simulation-mode-policy.mjs';

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function latest(records = []) {
  return asArray(records).at(-1) || null;
}

function displayValue(value, fallback = 'None') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function providerAssistMessage(diagnostic) {
  const text = displayValue(diagnostic?.message || diagnostic?.code || diagnostic?.status, 'No diagnostic message recorded.');
  if (diagnostic?.hiddenLeakBlocked) {
    return 'Provider output was rejected by player-safe validation.';
  }
  return text;
}

function providerAssistCandidateCount(view) {
  return asArray(view?.sideMissionOpportunityReview?.candidates).length;
}

function hostCanRunProviderAssist(host) {
  const generation = host?.capabilities?.generation || {};
  return Boolean(
    generation.currentChatModel
    || generation.raw
    || generation.quiet
    || generation.structuredOutput
    || generation.batch
    || generation.batchConcurrent
  );
}

function canRunProviderAssist(view, actions) {
  return Boolean(
    view?.campaignState
    && providerAssistCandidateCount(view) > 0
    && hostCanRunProviderAssist(view?.host)
    && typeof actions.runSideMissionProviderAssistance === 'function'
  );
}

function appendProviderAssistDiagnostics(body, view, actions = {}) {
  const sideMissions = view?.campaignState?.sideMissions || {};
  const diagnostics = asArray(sideMissions.providerAssistDiagnostics);
  const proposals = asArray(sideMissions.providerAssistProposals);
  const lastResult = view?.lastSideMissionProviderAssistResult || null;
  const latestDiagnostic = latest(diagnostics) || latest(lastResult?.diagnostics) || latest(lastResult?.rejectedDiagnostics);
  const latestProposal = latest(proposals) || latest(lastResult?.proposals);
  const status = sideMissions.lastProviderAssistStatus || lastResult?.status || latestDiagnostic?.status;
  const candidateCount = providerAssistCandidateCount(view);
  const runnable = canRunProviderAssist(view, actions);

  if (!runnable && !lastResult && diagnostics.length === 0 && proposals.length === 0 && !status) {
    return;
  }

  const committed = lastResult?.committedDiagnostics || {};
  const card = createCard('directive-settings-provider-assist-card');
  card.append(
    createCardTitle('Provider Assist Diagnostics'),
    createMetaRow('Status', displayValue(status, 'No run recorded')),
    createMetaRow('Accepted Proposals', committed.acceptedProposalCount ?? proposals.length),
    createMetaRow('Diagnostics', committed.diagnosticCount ?? diagnostics.length),
    createMetaRow('Authority', 'Proposal-only; deterministic validators decide.')
  );
  if (candidateCount > 0) {
    card.appendChild(createMetaRow('Eligible Follow-Ups', candidateCount));
  }
  if (latestDiagnostic) {
    card.appendChild(createMetaRow('Last Result', providerAssistMessage(latestDiagnostic)));
  }
  if (latestProposal) {
    card.appendChild(createMetaRow('Latest Proposal', displayValue(latestProposal.title || latestProposal.opportunityId || latestProposal.candidateId)));
  }
  if (runnable) {
    const row = createElement('div', 'directive-action-row');
    row.appendChild(createButton({
      label: 'Run Provider Assist',
      icon: 'fa-solid fa-wand-magic-sparkles',
      title: 'Run provider assistance for eligible follow-up work',
      onClick: async () => {
        await actions.runSideMissionProviderAssistance?.();
        await actions.refresh?.();
      }
    }));
    card.appendChild(row);
  }
  body.appendChild(card);
}

export function renderSettingsPanel(body, view, actions = {}) {
  appendSectionTitle(body, 'Settings');
  const state = view?.campaignState;
  const packageContext = view?.activePackage;
  if (!state && !packageContext) {
    appendEmpty(body, 'No settings loaded.');
    return;
  }

  const card = createCard('directive-settings-card');
  const simulationPolicy = simulationModeSettingsRows(state?.settings?.simulationMode || 'Command');
  card.append(
    createCardTitle('Runtime'),
    createMetaRow('Active Package', packageContext?.title || state?.campaign?.packageTitle),
    createMetaRow('Package Version', packageContext?.version || state?.activeStarshipPackage?.packageVersion),
    createMetaRow('Active Save', view?.activeSaveId),
    createMetaRow('Simulation Mode', state?.settings?.simulationMode || 'Not started'),
    createMetaRow('Allowed Modes', joinList(state?.settings?.allowedSimulationModes || packageContext?.simulationModes)),
    createMetaRow('Consequence Policy', simulationPolicy.fatalityPolicy),
    createMetaRow('Mode Summary', simulationPolicy.summary),
    createMetaRow('Storage Mode', state?.settings?.storagePointerOnly ? 'Save payload plus package pointer' : 'Package only')
  );
  body.appendChild(card);

  if (state?.commandStyle) {
    const command = state.commandStyle;
    const reserveUsed = Number(command.inspiration?.points || 0) + Number(command.resolve?.points || 0);
    const bearing = createCard('directive-settings-command-card');
    bearing.append(
      createCardTitle(command.systemName || 'Command Bearing'),
      createMetaRow('Inspiration', `${command.inspiration?.rankTitle || 'Unrated'}; Marks ${command.inspiration?.marks ?? 0}; Points ${command.inspiration?.points ?? 0}/${command.inspiration?.pointCap ?? 0}`),
      createMetaRow('Resolve', `${command.resolve?.rankTitle || 'Unrated'}; Marks ${command.resolve?.marks ?? 0}; Points ${command.resolve?.points ?? 0}/${command.resolve?.pointCap ?? 0}`),
      createMetaRow('Shared Reserve', `${reserveUsed}/${command.reserve?.capacity ?? 0}`),
      createMetaRow('Morality Score', command.noMoralityScore ? 'None' : 'Enabled')
    );
    body.appendChild(bearing);
  }

  if (view?.storageDiagnostics) {
    const diagnostics = view.storageDiagnostics;
    const storage = createCard('directive-settings-storage-card');
    storage.append(
      createCardTitle('Storage Diagnostics'),
      createMetaRow('Status', diagnostics.status || 'unknown'),
      createMetaRow('Issues', Array.isArray(diagnostics.issues) ? diagnostics.issues.length : 0),
      createMetaRow('Creator Drafts', diagnostics.counts?.creatorDrafts),
      createMetaRow('Saves', diagnostics.counts?.saves)
    );
    const row = createElement('div', 'directive-action-row');
    row.appendChild(createButton({
      label: 'Refresh Diagnostics',
      icon: 'fa-solid fa-rotate-right',
      title: 'Refresh storage diagnostics',
      onClick: async () => {
        await actions.refreshStorageDiagnostics?.();
        await actions.refresh?.();
      }
    }));
    if (view?.activeSaveId) {
      row.appendChild(createButton({
        label: 'Reload Active Save',
        icon: 'fa-solid fa-folder-open',
        title: 'Reload the active save from storage',
        onClick: async () => {
          await actions.loadGame?.({ saveId: view.activeSaveId });
          await actions.refresh?.();
        }
      }));
    }
    if (view?.pendingDirectorTurn) {
      row.appendChild(createButton({
        label: 'Clear Preview',
        icon: 'fa-solid fa-xmark',
        title: 'Discard the current uncommitted preview',
        onClick: async () => {
          await actions.discardProvisionalDirectorTurn?.();
          await actions.refresh?.();
        }
      }));
    }
    storage.appendChild(row);
    body.appendChild(storage);
  }

  appendProviderAssistDiagnostics(body, view, actions);
}
