import {
  appendEmpty,
  appendSectionTitle,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createIcon,
  createIconFromDescriptor,
  createMetaRow,
  joinList
} from './runtime-ui-kit.js';
import { simulationModeSettingsRows } from '../simulation/simulation-mode-policy.mjs';
import {
  DIRECTIVE_BUNDLED_ICON_PACKS,
  resolveDirectiveIconSlot
} from '../theme/directive-icon-packs.mjs';
import {
  DIRECTIVE_BUNDLED_THEME_PACKS
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

function storageStatusTone(status) {
  const label = String(status || '').toLowerCase();
  if (label.includes('error') || label.includes('missing') || label.includes('fail')) return 'danger';
  if (label.includes('warning') || label.includes('pending')) return 'warning';
  if (label === 'ok' || label.includes('ready') || label.includes('active')) return 'success';
  return 'neutral';
}

function activeSaveLabel(view) {
  return view?.activeSaveId ? 'Active save mounted' : 'No active save mounted';
}

function storageCountsLabel(diagnostics) {
  const saves = diagnostics?.counts?.saves ?? 0;
  const drafts = diagnostics?.counts?.creatorDrafts ?? 0;
  return `${saves} saves / ${drafts} drafts`;
}

function assistStatus(view, actions) {
  const sideMissions = view?.campaignState?.sideMissions || {};
  const lastResult = view?.lastSideMissionProviderAssistResult || null;
  const status = sideMissions.lastProviderAssistStatus || lastResult?.status;
  if (status) return displayValue(status);
  if (canRunProviderAssist(view, actions)) return 'Ready';
  if (providerAssistCandidateCount(view) > 0) return 'Waiting';
  return 'Idle';
}

function hasProviderAssistSurface(view, actions = {}) {
  const sideMissions = view?.campaignState?.sideMissions || {};
  return Boolean(
    canRunProviderAssist(view, actions)
    || view?.lastSideMissionProviderAssistResult
    || asArray(sideMissions.providerAssistDiagnostics).length
    || asArray(sideMissions.providerAssistProposals).length
    || sideMissions.lastProviderAssistStatus
    || providerAssistCandidateCount(view) > 0
  );
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

function createSettingsStatusBlock(label, value, tone = 'neutral') {
  const block = createElement('div', `directive-lcars-status-block directive-settings-status-block directive-status-${tone}`);
  const key = createElement('span', 'directive-lcars-status-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-lcars-status-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  block.append(key, content);
  return block;
}

function createSettingsOverviewTile({ label, value, detail = '', icon = 'fa-solid fa-circle', tone = 'neutral' }) {
  const card = createElement('article', `directive-settings-overview-tile directive-settings-overview-${tone}`);
  const iconFrame = createElement('span', 'directive-settings-overview-icon');
  iconFrame.appendChild(createIcon(icon));
  const copy = createElement('div', 'directive-settings-overview-copy');
  const title = createElement('span', 'directive-settings-overview-label');
  title.textContent = label;
  const primary = createElement('strong', 'directive-settings-overview-value');
  primary.textContent = displayValue(value);
  copy.append(title, primary);
  if (detail) {
    const secondary = createElement('span', 'directive-settings-overview-detail');
    secondary.textContent = detail;
    copy.appendChild(secondary);
  }
  const bars = createElement('span', 'directive-settings-overview-bars');
  bars.setAttribute('aria-hidden', 'true');
  bars.append(createElement('span'), createElement('span'), createElement('span'));
  card.append(iconFrame, copy, bars);
  return card;
}

function createSettingsActionTile({ label, description, icon, tone = 'primary', disabled = false, onClick }) {
  const button = createElement('button', `directive-settings-action-tile directive-settings-action-${tone}`);
  button.type = 'button';
  button.disabled = disabled === true;
  button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-description', description || '');
  const iconFrame = createElement('span', 'directive-settings-action-icon');
  iconFrame.appendChild(createIcon(icon || 'fa-solid fa-circle'));
  const copy = createElement('span', 'directive-settings-action-copy');
  const title = createElement('strong', 'directive-settings-action-title');
  title.textContent = label;
  const summary = createElement('span', 'directive-settings-action-description');
  summary.dataset.description = description || '';
  copy.append(title, summary);
  const chevron = createElement('span', 'directive-settings-action-chevron');
  chevron.appendChild(createIcon('fa-solid fa-chevron-right'));
  button.append(iconFrame, copy, chevron);
  button.addEventListener('click', async (event) => {
    if (button.disabled) {
      event?.preventDefault?.();
      return;
    }
    await onClick?.(event);
  });
  return button;
}

function createSettingsSubtabs(sections, activeId = '') {
  const nav = createElement('nav', 'directive-settings-subtabs');
  nav.setAttribute('aria-label', 'Settings sections');
  for (const section of sections.filter((item) => item?.id && item?.label)) {
    const selected = section.id === activeId;
    const button = createElement('button', 'directive-settings-subtab');
    button.type = 'button';
    const icon = createElement('span', 'directive-settings-subtab-icon');
    icon.appendChild(createIcon(section.icon || 'fa-solid fa-circle'));
    const label = createElement('span');
    label.textContent = section.label;
    button.append(icon, label);
    button.dataset.settingsSubtabTarget = section.id;
    button.setAttribute('aria-controls', section.id);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (selected) {
      button.className = `${button.className} directive-settings-subtab-active`.trim();
    }
    button.addEventListener('click', () => {
      const root = typeof button.closest === 'function' ? button.closest('.directive-settings-console') : null;
      const scope = root || document;
      for (const item of scope.querySelectorAll?.('.directive-settings-subtab') || []) {
        const itemSelected = item.dataset.settingsSubtabTarget === section.id;
        item.classList?.toggle?.('directive-settings-subtab-active', itemSelected);
        item.setAttribute('aria-selected', itemSelected ? 'true' : 'false');
      }
      for (const item of scope.querySelectorAll?.('.directive-settings-section') || []) {
        const itemSelected = item.id === section.id;
        item.classList?.toggle?.('directive-settings-section-active', itemSelected);
        item.hidden = !itemSelected;
      }
    });
    nav.appendChild(button);
  }
  return nav;
}

function createSettingsSection({ id, label, className = '', active = false }) {
  const section = createElement('section', `directive-settings-section${className ? ` ${className}` : ''}`);
  section.id = id;
  section.hidden = !active;
  if (active) {
    section.className = `${section.className} directive-settings-section-active`.trim();
  }
  const heading = createElement('h3', 'directive-settings-section-title');
  heading.textContent = label;
  section.appendChild(heading);
  return section;
}

function appendRuntimeSettings(body, state, packageContext, view) {
  const card = createCard('directive-settings-card directive-settings-system-card directive-lcars-panel');
  const simulationPolicy = simulationModeSettingsRows(state?.settings?.simulationMode || 'Command');
  card.append(
    createCardTitle('Runtime'),
    createMetaRow('Active Package', packageContext?.title || state?.campaign?.packageTitle),
    createMetaRow('Package Version', packageContext?.version || state?.activeStarshipPackage?.packageVersion),
    createMetaRow('Active Save', activeSaveLabel(view)),
    createMetaRow('Simulation Mode', state?.settings?.simulationMode || 'Not started'),
    createMetaRow('Allowed Modes', joinList(state?.settings?.allowedSimulationModes || packageContext?.simulationModes)),
    createMetaRow('Consequence Policy', simulationPolicy.fatalityPolicy),
    createMetaRow('Mode Summary', simulationPolicy.summary)
  );
  body.appendChild(card);
  return true;
}

function appendCommandBearingSettings(body, state) {
  if (!state?.commandStyle) return false;
  const command = state.commandStyle;
  const reserveUsed = Number(command.inspiration?.points || 0) + Number(command.resolve?.points || 0);
  const bearing = createCard('directive-settings-command-card directive-settings-system-card directive-lcars-panel');
  bearing.append(
    createCardTitle(command.systemName || 'Command Bearing'),
    createMetaRow('Inspiration', `${command.inspiration?.rankTitle || 'Unrated'}; Marks ${command.inspiration?.marks ?? 0}; Points ${command.inspiration?.points ?? 0}/${command.inspiration?.pointCap ?? 0}`),
    createMetaRow('Resolve', `${command.resolve?.rankTitle || 'Unrated'}; Marks ${command.resolve?.marks ?? 0}; Points ${command.resolve?.points ?? 0}/${command.resolve?.pointCap ?? 0}`),
    createMetaRow('Shared Reserve', `${reserveUsed}/${command.reserve?.capacity ?? 0}`),
    createMetaRow('Morality Score', command.noMoralityScore ? 'None' : 'Enabled')
  );
  body.appendChild(bearing);
  return true;
}

function appendThemePackSettings(body) {
  const theme = DIRECTIVE_BUNDLED_THEME_PACKS[0];
  const card = createCard('directive-settings-theme-pack-card directive-settings-pack-card directive-lcars-panel');
  card.append(
    createCardTitle('Theme Pack'),
    createMetaRow('Active Pack', theme.label || theme.id),
    createMetaRow('Source', theme.source || 'bundled')
  );

  const swatches = createElement('div', 'directive-theme-swatch-row');
  for (const swatch of theme.swatches || []) {
    const item = createElement('span', 'directive-theme-swatch');
    if (item.style) {
      item.setAttribute('style', `background: ${swatch}`);
    }
    item.dataset.swatch = swatch;
    item.title = swatch;
    item.setAttribute('aria-label', swatch);
    swatches.appendChild(item);
  }
  card.appendChild(swatches);
  body.appendChild(card);
  return true;
}

function createIconPackPreview(slot, iconPack) {
  const resolved = resolveDirectiveIconSlot(iconPack, slot);
  const item = createElement('div', 'directive-icon-preview');
  item.dataset.iconSlot = slot;
  item.dataset.iconSource = resolved.source;

  const frame = createElement('span', 'directive-icon-preview-frame');
  frame.setAttribute('aria-hidden', 'true');
  frame.appendChild(createIconFromDescriptor(resolved, {
    slot,
    fallbackClass: 'fa-solid fa-circle',
    className: 'directive-icon-preview-image'
  }));

  const label = createElement('span', 'directive-icon-preview-label');
  label.textContent = resolved.label || slot;
  item.append(frame, label);
  return item;
}

function appendIconPackSettings(body) {
  const iconPack = DIRECTIVE_BUNDLED_ICON_PACKS[0];
  const previewSlots = [
    'route.starships',
    'route.mission',
    'route.crew',
    'route.ship',
    'route.log',
    'route.settings',
    'action.drawerCollapse',
    'action.fullscreen',
    'action.densityCompact',
    'action.refresh',
    'action.close',
    'status.success',
    'status.warning',
    'status.danger'
  ];

  const card = createCard('directive-settings-icon-pack-card directive-settings-pack-card directive-lcars-panel');
  card.append(
    createCardTitle('Icon Pack'),
    createMetaRow('Active Pack', iconPack.label || iconPack.id),
    createMetaRow('Source', iconPack.source || 'bundled')
  );
  const preview = createElement('div', 'directive-icon-preview-grid');
  for (const slot of previewSlots) {
    preview.appendChild(createIconPackPreview(slot, iconPack));
  }
  card.appendChild(preview);
  body.appendChild(card);
  return true;
}

function appendStateSafetySettings(body, view, actions = {}) {
  const diagnostics = view?.storageDiagnostics || null;
  const lastResult = view?.lastStateSafetyResult || null;
  const hasActiveSave = Boolean(view?.activeSaveId);
  const canVerify = hasActiveSave && typeof actions.verifyActiveSave === 'function';
  const canSettle = hasActiveSave && Boolean(view?.campaignState) && typeof actions.settleActiveState === 'function';
  const canExport = hasActiveSave && typeof actions.exportActiveSave === 'function';
  const canClean = typeof actions.cleanMissingStorageRecords === 'function';

  const card = createCard('directive-settings-state-safety-card directive-settings-control-card directive-lcars-panel');
  const header = createElement('header', 'directive-settings-safety-header');
  const headerCopy = createElement('div');
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = 'Safety & State';
  const title = createCardTitle('Campaign State Controls');
  const summary = createElement('p', 'directive-settings-safety-summary');
  summary.textContent = 'Verify, settle, export, and repair campaign records without exposing hidden simulation state.';
  headerCopy.append(kicker, title, summary);
  const shield = createElement('span', 'directive-settings-safety-emblem');
  shield.appendChild(createIcon('fa-solid fa-shield-halved'));
  header.append(headerCopy, shield);
  card.appendChild(header);

  const grid = createElement('div', 'directive-settings-safety-action-grid directive-settings-safety-actions');
  grid.append(
    createSettingsActionTile({
      label: 'Verify Active Save',
      description: 'Validate the active save integrity and package pointer.',
      icon: 'fa-solid fa-circle-check',
      disabled: !canVerify,
      onClick: async () => {
        await actions.verifyActiveSave?.();
        await actions.refresh?.();
      }
    }),
    createSettingsActionTile({
      label: 'Settle Active State',
      description: 'Commit pending changes and stabilize the active record.',
      icon: 'fa-solid fa-bars-staggered',
      disabled: !canSettle,
      onClick: async () => {
        await actions.settleActiveState?.();
        await actions.refresh?.();
      }
    }),
    createSettingsActionTile({
      label: 'Export Active Save',
      description: 'Create a passive JSON backup of the current save.',
      icon: 'fa-solid fa-arrow-up-from-bracket',
      disabled: !canExport,
      onClick: async () => {
        const result = await actions.exportActiveSave?.();
        downloadJsonFile({ fileName: result?.fileName, jsonText: result?.jsonText });
        await actions.refresh?.();
      }
    }),
    createSettingsActionTile({
      label: 'Clean Missing Records',
      description: 'Remove orphaned index entries and missing references.',
      icon: 'fa-solid fa-broom',
      disabled: !canClean,
      onClick: async () => {
        await actions.cleanMissingStorageRecords?.();
        await actions.refresh?.();
      }
    }),
    createSettingsActionTile({
      label: 'Refresh Diagnostics',
      description: 'Rescan local storage and update the diagnostic summary.',
      icon: 'fa-solid fa-rotate',
      tone: 'secondary',
      disabled: typeof actions.refreshStorageDiagnostics !== 'function',
      onClick: async () => {
        await actions.refreshStorageDiagnostics?.();
        await actions.refresh?.();
      }
    }),
    createSettingsActionTile({
      label: 'Reload Active Save',
      description: 'Reload the indexed save payload from storage.',
      icon: 'fa-solid fa-arrows-rotate',
      tone: 'secondary',
      disabled: !hasActiveSave || typeof actions.loadGame !== 'function',
      onClick: async () => {
        await actions.loadGame?.({ saveId: view.activeSaveId });
        await actions.refresh?.();
      }
    })
  );
  if (view?.pendingDirectorTurn) {
    grid.appendChild(createSettingsActionTile({
      label: 'Clear Preview',
      description: 'Discard the current uncommitted preview.',
      icon: 'fa-solid fa-xmark',
      tone: 'secondary',
      disabled: typeof actions.discardProvisionalDirectorTurn !== 'function',
      onClick: async () => {
        await actions.discardProvisionalDirectorTurn?.();
        await actions.refresh?.();
      }
    }));
  }
  card.appendChild(grid);

  const summaryPanel = createElement('section', 'directive-settings-diagnostics-summary');
  const summaryTitle = createElement('h4', 'directive-inline-title');
  summaryTitle.textContent = 'Storage Check';
  const summaryGrid = createElement('div', 'directive-settings-diagnostics-grid');
  summaryGrid.append(
    createSettingsStatusBlock('Status', diagnostics?.status || 'unknown', storageStatusTone(diagnostics?.status)),
    createSettingsStatusBlock('Issues', Array.isArray(diagnostics?.issues) ? diagnostics.issues.length : 0, diagnostics?.issues?.length ? 'warning' : 'success'),
    createSettingsStatusBlock('Creator Drafts', diagnostics?.counts?.creatorDrafts ?? 0, 'neutral'),
    createSettingsStatusBlock('Saves', diagnostics?.counts?.saves ?? 0, 'neutral')
  );
  summaryPanel.append(summaryTitle, summaryGrid);
  card.appendChild(summaryPanel);

  const footer = createElement('div', 'directive-settings-safety-footer');
  footer.append(
    createMetaRow('Active Save', activeSaveLabel(view)),
    createMetaRow('Last Action', stateSafetyStatus(lastResult))
  );
  if (lastResult?.removed?.length > 0) footer.appendChild(createMetaRow('Cleaned Records', lastResult.removed.length));
  if (Array.isArray(lastResult?.issues) && lastResult.issues.length > 0) footer.appendChild(createMetaRow('Action Issues', lastResult.issues.length));
  card.appendChild(footer);
  body.appendChild(card);
  return true;
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
    return false;
  }

  const committed = lastResult?.committedDiagnostics || {};
  const card = createCard('directive-settings-provider-assist-card directive-settings-assist-card directive-lcars-panel');
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
    const row = createElement('div', 'directive-action-row directive-settings-action-row');
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
  return true;
}

export function renderSettingsPanel(body, view, actions = {}) {
  appendSectionTitle(body, 'Settings');
  const state = view?.campaignState;
  const packageContext = view?.activePackage;
  const theme = DIRECTIVE_BUNDLED_THEME_PACKS[0];
  const iconPack = DIRECTIVE_BUNDLED_ICON_PACKS[0];
  const packageTitle = packageContext?.title || state?.campaign?.packageTitle || 'No package';
  const storageStatus = view?.storageDiagnostics?.status || 'unknown';
  const assist = assistStatus(view, actions);

  const consoleSurface = createElement('div', 'directive-settings-console directive-lcars-console');
  const overview = createElement('section', 'directive-settings-overview-card');
  const identity = createElement('header', 'directive-settings-identity');
  const identityCopy = createElement('div');
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = 'Control Plane';
  const identityTitle = createCardTitle('Runtime & State Safety');
  const summary = createElement('p', 'directive-settings-summary');
  summary.textContent = `${packageTitle} / ${view?.activeSaveId ? 'Active save mounted' : 'No active save mounted'}`;
  identityCopy.append(kicker, identityTitle, summary);
  identity.appendChild(identityCopy);
  const overallTone = storageStatusTone(storageStatus);
  if (overallTone !== 'success') {
    const status = createElement('span', `directive-settings-overall-status directive-status-${overallTone}`);
    status.textContent = displayValue(storageStatus, 'Review');
    identity.appendChild(status);
  }

  const overviewGrid = createElement('div', 'directive-settings-overview-grid');
  overviewGrid.append(
    createSettingsOverviewTile({
      label: 'Runtime',
      value: packageTitle,
      detail: activeSaveLabel(view),
      icon: 'fa-solid fa-folder-open',
      tone: 'operations'
    }),
    createSettingsOverviewTile({
      label: 'Simulation',
      value: state?.settings?.simulationMode || 'Not started',
      detail: `Allowed: ${joinList(state?.settings?.allowedSimulationModes || packageContext?.simulationModes)}`,
      icon: 'fa-solid fa-circle-notch',
      tone: 'science'
    }),
    createSettingsOverviewTile({
      label: 'Storage',
      value: storageCountsLabel(view?.storageDiagnostics),
      detail: overallTone === 'success' ? 'No storage issues' : displayValue(storageStatus, 'Review storage'),
      icon: 'fa-solid fa-database',
      tone: overallTone
    }),
    createSettingsOverviewTile({
      label: 'Appearance',
      value: theme.label || theme.id,
      detail: iconPack.label || iconPack.id,
      icon: 'fa-solid fa-palette',
      tone: 'command'
    })
  );

  overview.append(identity, overviewGrid);
  if (hasProviderAssistSurface(view, actions)) {
    const assistStrip = createElement('div', 'directive-settings-assist-strip');
    const assistIcon = createElement('span');
    assistIcon.appendChild(createIcon('fa-solid fa-people-group'));
    const assistCopy = createElement('div');
    const assistLabel = createElement('span', 'directive-lcars-kicker');
    assistLabel.textContent = 'Provider Assist';
    const assistValue = createElement('strong');
    assistValue.textContent = assist;
    assistCopy.append(assistLabel, assistValue);
    const assistHint = createElement('span');
    assistHint.textContent = providerAssistCandidateCount(view) ? `${providerAssistCandidateCount(view)} eligible follow-ups` : 'Recent assist activity';
    assistStrip.append(assistIcon, assistCopy, assistHint);
    overview.appendChild(assistStrip);
  }
  consoleSurface.appendChild(overview);

  const sections = [
    { id: 'directive-settings-systems-section', label: 'Systems', icon: 'fa-solid fa-table-cells-large' },
    { id: 'directive-settings-safety-section', label: 'Safety', icon: 'fa-solid fa-shield-halved' },
    { id: 'directive-settings-packs-section', label: 'Appearance', icon: 'fa-solid fa-palette' }
  ];
  if (hasProviderAssistSurface(view, actions)) {
    sections.push({ id: 'directive-settings-assist-section', label: 'Assist', icon: 'fa-solid fa-wave-square' });
  }
  const activeSectionId = 'directive-settings-safety-section';
  consoleSurface.appendChild(createSettingsSubtabs(sections, activeSectionId));

  const systemsSection = createSettingsSection({
    id: 'directive-settings-systems-section',
    label: 'Systems'
  });
  appendRuntimeSettings(systemsSection, state, packageContext, view);
  appendCommandBearingSettings(systemsSection, state);
  consoleSurface.appendChild(systemsSection);

  const safetySection = createSettingsSection({
    id: 'directive-settings-safety-section',
    label: 'Safety',
    active: true
  });
  appendStateSafetySettings(safetySection, view, actions);
  consoleSurface.appendChild(safetySection);

  const packsSection = createSettingsSection({
    id: 'directive-settings-packs-section',
    label: 'Appearance'
  });
  appendThemePackSettings(packsSection);
  appendIconPackSettings(packsSection);
  consoleSurface.appendChild(packsSection);

  if (hasProviderAssistSurface(view, actions)) {
    const assistSection = createSettingsSection({
      id: 'directive-settings-assist-section',
      label: 'Assist'
    });
    appendProviderAssistDiagnostics(assistSection, view, actions);
    consoleSurface.appendChild(assistSection);
  }

  body.appendChild(consoleSurface);
}
