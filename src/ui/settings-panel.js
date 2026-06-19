import {
  appendEmpty,
  appendSectionTitle,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createIcon,
  createMetaRow,
  joinList
} from './runtime-ui-kit.js';
import { simulationModeSettingsRows } from '../simulation/simulation-mode-policy.mjs';
import {
  DIRECTIVE_BUNDLED_ICON_PACKS,
  DIRECTIVE_ICON_SLOTS,
  resolveDirectiveIconSlot
} from '../theme/directive-icon-packs.mjs';
import {
  DIRECTIVE_BUNDLED_THEME_PACKS,
  DIRECTIVE_THEME_TOKEN_ROLES
} from '../theme/directive-theme-packs.mjs';

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

function stateSafetyStatus(result) {
  if (!result) return 'No state-safety action recorded';
  return displayValue(result.summary || result.status || result.action, 'No state-safety action recorded');
}

function downloadJsonFile({ fileName, jsonText }) {
  if (!fileName || !jsonText || typeof document === 'undefined') return false;
  if (typeof Blob !== 'function' || !globalThis.URL?.createObjectURL) return false;
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body?.appendChild?.(link);
  link.click?.();
  link.remove?.();
  URL.revokeObjectURL?.(url);
  return true;
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

function appendThemePackSettings(body) {
  const theme = DIRECTIVE_BUNDLED_THEME_PACKS[0];
  const card = createCard('directive-settings-theme-pack-card');
  card.append(
    createCardTitle('Theme Pack'),
    createMetaRow('Active Pack', theme.label || theme.id),
    createMetaRow('Source', theme.source || 'bundled'),
    createMetaRow('Token Roles', DIRECTIVE_THEME_TOKEN_ROLES.length),
    createMetaRow('Status', 'Applied to runtime shell')
  );

  const swatches = createElement('div', 'directive-theme-swatch-row');
  for (const swatch of theme.swatches || []) {
    const item = createElement('span', 'directive-theme-swatch');
    if (item.style) {
      item.style.background = swatch;
    }
    item.dataset.swatch = swatch;
    item.title = swatch;
    item.setAttribute('aria-label', swatch);
    swatches.appendChild(item);
  }
  card.appendChild(swatches);
  body.appendChild(card);
}

function createIconPackPreview(slot, iconPack) {
  const resolved = resolveDirectiveIconSlot(iconPack, slot);
  const item = createElement('div', 'directive-icon-preview');
  item.dataset.iconSlot = slot;
  item.dataset.iconSource = resolved.source;

  const frame = createElement('span', 'directive-icon-preview-frame');
  frame.setAttribute('aria-hidden', 'true');
  if (resolved.type === 'image' && resolved.value) {
    const image = createElement('img', 'directive-icon-preview-image');
    image.src = resolved.value;
    image.alt = '';
    image.draggable = false;
    image.setAttribute('draggable', 'false');
    frame.appendChild(image);
  } else {
    frame.appendChild(createIcon(resolved.value || 'fa-solid fa-circle'));
  }

  const label = createElement('span', 'directive-icon-preview-label');
  label.textContent = resolved.label || slot;
  item.append(frame, label);
  return item;
}

function appendIconPackSettings(body) {
  const iconPack = DIRECTIVE_BUNDLED_ICON_PACKS[0];
  const resolvedSlots = DIRECTIVE_ICON_SLOTS.map((slot) => resolveDirectiveIconSlot(iconPack, slot));
  const fallbackCount = resolvedSlots.filter((slot) => slot.source === 'fallback').length;
  const previewSlots = [
    'route.starships',
    'route.mission',
    'route.crew',
    'route.ship',
    'route.log',
    'route.settings',
    'action.back',
    'action.close',
    'status.success',
    'status.warning',
    'status.danger'
  ];

  const card = createCard('directive-settings-icon-pack-card');
  card.append(
    createCardTitle('Icon Pack'),
    createMetaRow('Active Pack', iconPack.label || iconPack.id),
    createMetaRow('Source', iconPack.source || 'bundled'),
    createMetaRow('Slots', DIRECTIVE_ICON_SLOTS.length),
    createMetaRow('Fallback Slots', fallbackCount)
  );
  const preview = createElement('div', 'directive-icon-preview-grid');
  for (const slot of previewSlots) {
    preview.appendChild(createIconPackPreview(slot, iconPack));
  }
  card.appendChild(preview);
  body.appendChild(card);
}

function appendStateSafetySettings(body, view, actions = {}) {
  const diagnostics = view?.storageDiagnostics || null;
  const lastResult = view?.lastStateSafetyResult || null;
  const hasActiveSave = Boolean(view?.activeSaveId);
  const canVerify = hasActiveSave && typeof actions.verifyActiveSave === 'function';
  const canSettle = hasActiveSave && Boolean(view?.campaignState) && typeof actions.settleActiveState === 'function';
  const canExport = hasActiveSave && typeof actions.exportActiveSave === 'function';
  const canClean = typeof actions.cleanMissingStorageRecords === 'function';

  const card = createCard('directive-settings-state-safety-card');
  card.append(
    createCardTitle('State Safety'),
    createMetaRow('Active Save', view?.activeSaveId),
    createMetaRow('Storage Status', diagnostics?.status || 'unknown'),
    createMetaRow('Last Action', stateSafetyStatus(lastResult)),
    createMetaRow('Scope', 'Verify, settle, export, and clean missing index records.')
  );

  if (lastResult?.removed?.length > 0) {
    card.appendChild(createMetaRow('Cleaned Records', lastResult.removed.length));
  }
  if (Array.isArray(lastResult?.issues) && lastResult.issues.length > 0) {
    card.appendChild(createMetaRow('Action Issues', lastResult.issues.length));
  }
  if (Array.isArray(lastResult?.retainedIssues) && lastResult.retainedIssues.length > 0) {
    card.appendChild(createMetaRow('Retained Errors', lastResult.retainedIssues.length));
  }

  const row = createElement('div', 'directive-action-row');
  row.append(
    createButton({
      label: 'Verify Active Save',
      icon: 'fa-solid fa-shield-halved',
      title: 'Read and validate the indexed active save payload',
      disabled: !canVerify,
      onClick: async () => {
        await actions.verifyActiveSave?.();
        await actions.refresh?.();
      }
    }),
    createButton({
      label: 'Settle Active State',
      icon: 'fa-solid fa-floppy-disk',
      title: 'Overwrite the active save with the current campaign state',
      disabled: !canSettle,
      onClick: async () => {
        await actions.settleActiveState?.();
        await actions.refresh?.();
      }
    }),
    createButton({
      label: 'Export Active Save',
      icon: 'fa-solid fa-download',
      title: 'Export the active save as passive JSON',
      disabled: !canExport,
      onClick: async () => {
        const result = await actions.exportActiveSave?.();
        downloadJsonFile({
          fileName: result?.fileName,
          jsonText: result?.jsonText
        });
        await actions.refresh?.();
      }
    }),
    createButton({
      label: 'Clean Missing Records',
      icon: 'fa-solid fa-broom',
      title: 'Remove index entries whose payload files are missing',
      disabled: !canClean,
      onClick: async () => {
        await actions.cleanMissingStorageRecords?.();
        await actions.refresh?.();
      }
    })
  );
  card.appendChild(row);
  body.appendChild(card);
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

  appendStateSafetySettings(body, view, actions);
  appendThemePackSettings(body);
  appendIconPackSettings(body);
  appendProviderAssistDiagnostics(body, view, actions);
}
