import {
  addTooltip,
  appendEmpty,
  appendSectionTitle,
  areDirectiveTooltipsDisabled,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createIcon,
  createIconFromDescriptor,
  createMetaRow,
  setDirectiveTooltipsDisabled
} from './runtime-ui-kit.js';
import {
  DIRECTIVE_BUNDLED_ICON_PACKS,
  resolveDirectiveIconSlot
} from '../theme/directive-icon-packs.mjs';
import { getDirectiveGuidancePreferences } from '../guidance/directive-guidance.js';
import { DIRECTIVE_TUTORIALS } from '../guidance/directive-guidance-content.mjs';
import {
  normalizeOutcomeIntegritySettings,
  OUTCOME_INTEGRITY_MODES,
  OUTCOME_INTEGRITY_REVIEW_PROVIDER_KINDS
} from '../runtime/outcome-integrity.mjs';

const SETTINGS_SYSTEMS_SECTION_ID = 'directive-settings-systems-section';
const SETTINGS_PROVIDERS_SECTION_ID = 'directive-settings-providers-section';
const SETTINGS_SAFETY_SECTION_ID = 'directive-settings-safety-section';
const DEFAULT_SETTINGS_SECTION_ID = SETTINGS_SYSTEMS_SECTION_ID;
export const DIRECTIVE_PRESET_SETTINGS_TARGET = 'directive-preset';

let activeSettingsSectionId = DEFAULT_SETTINGS_SECTION_ID;

export function resetSettingsPanelState() {
  activeSettingsSectionId = DEFAULT_SETTINGS_SECTION_ID;
}

function selectSettingsSection(sectionId) {
  activeSettingsSectionId = sectionId || DEFAULT_SETTINGS_SECTION_ID;
}

export function selectDirectivePresetSettingsSection() {
  selectSettingsSection(SETTINGS_PROVIDERS_SECTION_ID);
}

function waitForSettingsRenderFrame() {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => {
        globalThis.requestAnimationFrame(resolve);
      });
      return;
    }
    globalThis.setTimeout?.(resolve, 0);
  });
}

export async function highlightDirectivePresetSettingsCard({ timeoutMs = 2800 } = {}) {
  selectDirectivePresetSettingsSection();
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return false;
  await waitForSettingsRenderFrame();
  const target = document.querySelector(`[data-directive-settings-target="${DIRECTIVE_PRESET_SETTINGS_TARGET}"]`);
  if (!target) return false;
  target.classList?.add?.('directive-settings-focus-highlight');
  try {
    target.focus?.({ preventScroll: true });
  } catch (_) {
    target.focus?.();
  }
  target.scrollIntoView?.({
    block: 'center',
    inline: 'nearest',
    behavior: 'smooth'
  });
  const removeHighlight = () => target.classList?.remove?.('directive-settings-focus-highlight');
  globalThis.setTimeout?.(removeHighlight, Number(timeoutMs) || 2800);
  return true;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function displayValue(value, fallback = 'None') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
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

function createSettingsStatusBlock(label, value, tone = 'neutral', tooltip = '') {
  const block = createElement('div', `directive-lcars-status-block directive-settings-status-block directive-status-${tone}`);
  const key = createElement('span', 'directive-lcars-status-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-lcars-status-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  block.append(key, content);
  if (tooltip) addTooltip(block, tooltip);
  return block;
}

function createSettingsActionTile({ label, description, icon, iconSlot = '', tone = 'primary', disabled = false, onClick }) {
  const button = createElement('button', `directive-settings-action-tile directive-settings-action-${tone}`);
  button.type = 'button';
  button.disabled = disabled === true;
  button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-description', description || '');
  addTooltip(button, description || label);
  const iconFrame = createElement('span', 'directive-settings-action-icon');
  if (iconSlot) {
    iconFrame.appendChild(createIconFromDescriptor(resolveDirectiveIconSlot(DIRECTIVE_BUNDLED_ICON_PACKS[0], iconSlot), {
      slot: iconSlot,
      fallbackClass: icon || 'fa-solid fa-circle',
      className: 'directive-settings-action-icon-image'
    }));
  } else {
    iconFrame.appendChild(createIcon(icon || 'fa-solid fa-circle'));
  }
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
    if (section.tour) button.dataset.directiveTour = section.tour;
    button.setAttribute('aria-controls', section.id);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    addTooltip(button, section.tooltip || section.label);
    if (selected) {
      button.className = `${button.className} directive-settings-subtab-active`.trim();
    }
    button.addEventListener('click', () => {
      selectSettingsSection(section.id);
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
  if (id === SETTINGS_SYSTEMS_SECTION_ID) section.dataset.directiveTour = 'settings.systems';
  if (id === SETTINGS_PROVIDERS_SECTION_ID) section.dataset.directiveTour = 'settings.providers';
  if (id === SETTINGS_SAFETY_SECTION_ID) section.dataset.directiveTour = 'settings.safety';
  section.hidden = !active;
  if (active) {
    section.className = `${section.className} directive-settings-section-active`.trim();
  }
  const heading = createElement('h3', 'directive-settings-section-title');
  heading.textContent = label;
  section.appendChild(heading);
  return section;
}

function createProviderField({ label, value = '', type = 'text', options = null, placeholder = '', tooltip = '' } = {}) {
  const wrapper = createElement('label', 'directive-field directive-provider-field');
  const labelText = createElement('span', 'directive-field-label');
  labelText.textContent = label;
  let control;
  if (Array.isArray(options)) {
    control = createElement('select', 'directive-field-control');
    for (const option of options) {
      const item = createElement('option');
      item.value = option.id;
      item.textContent = option.label;
      item.selected = String(option.id) === String(value || '');
      if (option.tooltip) item.title = option.tooltip;
      control.appendChild(item);
    }
    control.value = value || options[0]?.id || '';
  } else {
    control = createElement('input', 'directive-field-control');
    control.type = type;
    control.value = value === undefined || value === null ? '' : String(value);
    control.placeholder = placeholder;
  }
  if (tooltip) {
    addTooltip(wrapper, tooltip);
    addTooltip(control, tooltip);
  }
  wrapper.append(labelText, control);
  return { wrapper, control };
}

function providerSourceOptions() {
  return [
    { id: 'st', label: 'Current Host Model', tooltip: 'Use the model already selected in the host application.' },
    { id: 'profile', label: 'Host Connection Profile', tooltip: 'Use a saved host connection profile for this provider lane.' },
    { id: 'openai_compatible', label: 'OpenAI-Compatible Endpoint', tooltip: 'Use a direct OpenAI-compatible API endpoint for this provider lane.' }
  ];
}

function providerKindLabel(kind) {
  return kind === 'utility' ? 'Utility Provider' : 'Reasoning Provider';
}

function compactNotificationText(value = '', maxLength = 260) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength).trim();
}

function notifyProviderTestResult(kind, result = {}) {
  const label = providerKindLabel(kind);
  const notifier = globalThis.toastr;
  if (!notifier) return;
  if (result?.ok) {
    const provider = compactNotificationText(result.providerId || result.text || '', 120);
    notifier.success?.(`${label} test passed${provider ? ` (${provider})` : ''}.`);
    return;
  }
  const message = compactNotificationText(
    result?.error?.message || result?.message || 'Provider test failed.'
  );
  notifier.error?.(`${label} test failed: ${message}`);
}

function providerLaneOptions(route = {}) {
  const defaultKind = route.defaultProviderKind || route.providerKind || 'utility';
  return [
    { id: 'default', label: `Default (${providerKindLabel(defaultKind).replace(' Provider', '')})`, tooltip: 'Use the built-in default lane for this model call role.' },
    { id: 'utility', label: 'Utility Provider', tooltip: 'Route this model call to the low-cost utility provider lane.' },
    { id: 'reasoning', label: 'Reasoning Provider', tooltip: 'Route this model call to the deeper reasoning provider lane.' }
  ];
}

const MODEL_CALL_ROUTING_GROUPS = Object.freeze([
  {
    id: 'story-output',
    label: 'Story Output',
    icon: 'fa-solid fa-feather-pointed',
    tooltip: 'Narration, campaign intros, conclusions, and high-level mission advising.',
    roles: Object.freeze(['narration', 'campaignIntro', 'campaignConclusion', 'missionDirectorAdvisor'])
  },
  {
    id: 'turn-reading',
    label: 'Turn Reading',
    icon: 'fa-solid fa-magnifying-glass-chart',
    tooltip: 'Fast classification and interpretation of player chat turns.',
    roles: Object.freeze(['utilityTurnClassifier', 'questActionInterpreter'])
  },
  {
    id: 'world-structure',
    label: 'World Structure',
    icon: 'fa-solid fa-diagram-project',
    tooltip: 'Quest, scene delta, and scene reconciliation structure extraction.',
    roles: Object.freeze(['questArchitect', 'sceneDeltaExtractor', 'sceneReconciliationExtractor'])
  },
  {
    id: 'state-sidecars',
    label: 'State Sidecars',
    icon: 'fa-solid fa-gears',
    tooltip: 'Background evaluators that update relationships, continuity, crew, and ship context.',
    roles: Object.freeze(['relationshipEvaluator', 'continuityTracker', 'crewDirector', 'shipDirector'])
  },
  {
    id: 'command-bearing',
    label: 'Command Bearing',
    icon: 'fa-solid fa-medal',
    tooltip: 'Fit checks, Readied spend validation, and Command Bearing evidence review.',
    roles: Object.freeze(['commandBearingFitChecker', 'commandBearingSpendValidator', 'commandBearingEvaluator'])
  },
  {
    id: 'outcome-integrity',
    label: 'Outcome Integrity',
    icon: 'fa-solid fa-shield-halved',
    tooltip: 'Protected edit review for Directive-owned committed assistant prose.',
    roles: Object.freeze(['outcomeIntegrityReview'])
  },
  {
    id: 'context-summaries',
    label: 'Context & Summaries',
    icon: 'fa-solid fa-list-check',
    tooltip: 'Prompt context, command logs, recaps, and structured utility JSON summaries.',
    roles: Object.freeze(['promptContextBuilder', 'commandLogSummarizer', 'recapSummarizer', 'utilityJson'])
  },
  {
    id: 'authoring-helpers',
    label: 'Authoring Helpers',
    icon: 'fa-solid fa-wand-magic-sparkles',
    tooltip: 'Character creator drafting and Directive Assist rewrite helpers.',
    roles: Object.freeze(['characterCreatorSectionDraft', 'directiveAssist'])
  }
]);

function groupedProviderRoutes(routes = []) {
  const byId = new Map(routes.map((route) => [route.roleId, route]));
  const used = new Set();
  const groups = MODEL_CALL_ROUTING_GROUPS.map((group) => {
    const items = group.roles.map((roleId) => byId.get(roleId)).filter(Boolean);
    for (const item of items) used.add(item.roleId);
    return { ...group, routes: items };
  }).filter((group) => group.routes.length > 0);
  const other = routes.filter((route) => !used.has(route.roleId));
  if (other.length > 0) {
    groups.push({
      id: 'other',
      label: 'Other Calls',
      icon: 'fa-solid fa-circle-nodes',
      routes: other
    });
  }
  return groups;
}

function modelCallGroupSummary(routes = []) {
  const count = routes.length;
  const overrideCount = routes.filter((route) => route.overridden === true).length;
  const callLabel = `${count} call${count === 1 ? '' : 's'}`;
  if (overrideCount > 0) {
    return `${callLabel} / ${overrideCount} override${overrideCount === 1 ? '' : 's'}`;
  }
  return `${callLabel} / default lanes`;
}

function appendProviderRoleRouting(body, view, actions = {}) {
  const routes = asArray(view?.providerConfiguration?.roleRouting);
  if (routes.length === 0) return false;
  const card = createCard('directive-settings-provider-routing-card directive-settings-control-card directive-lcars-panel');
  card.dataset.directiveTour = 'settings.provider-routing';
  addTooltip(card, 'Choose which provider lane handles each Directive background job.');
  const utilityCount = routes.filter((route) => route.providerKind === 'utility').length;
  const overrideCount = routes.filter((route) => route.overridden === true).length;
  card.append(
    createCardTitle('Model Call Routing'),
    createMetaRow('Utility Routes', `${utilityCount}/${routes.length}`),
    createMetaRow('Overrides', overrideCount)
  );

  const groups = createElement('div', 'directive-provider-role-routing-groups');
  for (const group of groupedProviderRoutes(routes)) {
    const overrideCount = group.routes.filter((route) => route.overridden === true).length;
    const folder = createElement('details', `directive-provider-role-folder${overrideCount > 0 ? ' directive-provider-role-folder-overridden' : ''}`);
    folder.dataset.modelCallRoutingGroup = group.id;
    if (overrideCount > 0) folder.open = true;

    const summary = createElement('summary', 'directive-provider-role-folder-summary');
    addTooltip(summary, group.tooltip || 'Model call routing group.');
    const disclosure = createElement('span', 'directive-provider-role-folder-disclosure');
    disclosure.appendChild(createIcon('fa-solid fa-chevron-right'));
    const icon = createElement('span', 'directive-provider-role-folder-icon');
    icon.appendChild(createIcon(group.icon || 'fa-solid fa-circle'));
    const copy = createElement('span', 'directive-provider-role-folder-copy');
    const title = createElement('strong');
    title.textContent = group.label;
    const detail = createElement('span');
    detail.textContent = modelCallGroupSummary(group.routes);
    copy.append(title, detail);
    const countBadge = createElement('span', 'directive-provider-role-folder-count');
    countBadge.textContent = overrideCount > 0 ? `${overrideCount} override${overrideCount === 1 ? '' : 's'}` : `${group.routes.length} calls`;
    summary.append(disclosure, icon, copy, countBadge);
    folder.appendChild(summary);

    const list = createElement('div', 'directive-provider-role-folder-list');
    const grid = createElement('div', 'directive-provider-role-select-grid');
    for (const route of group.routes) {
      const field = createProviderField({
        label: route.label || route.roleId || 'Model Call',
        value: route.overridden ? route.providerKind : 'default',
        options: providerLaneOptions(route),
        tooltip: route.description || `Choose which provider lane handles ${route.label || route.roleId || 'this model call'}.`
      });
      field.wrapper.className = `${field.wrapper.className} directive-provider-role-select${route.overridden ? ' directive-provider-role-select-overridden' : ''}`.trim();
      field.wrapper.dataset.roleId = route.roleId || '';
      const detail = createElement('span', 'directive-provider-role-select-detail');
      detail.textContent = `${route.roleId || 'unknown'} / ${route.output || 'output'} / ${route.fallback || 'no fallback'}`;
      field.wrapper.appendChild(detail);
      field.control.disabled = typeof actions.updateProviderRoleRouting !== 'function'
        && typeof actions.resetProviderRoleRouting !== 'function';
      field.control.addEventListener('change', async () => {
        selectSettingsSection(SETTINGS_PROVIDERS_SECTION_ID);
        if (field.control.value === 'default') {
          await actions.resetProviderRoleRouting?.({ roleId: route.roleId });
        } else {
          await actions.updateProviderRoleRouting?.({
            roleId: route.roleId,
            providerKind: field.control.value
          });
        }
        selectSettingsSection(SETTINGS_PROVIDERS_SECTION_ID);
        await actions.refresh?.();
      });
      grid.appendChild(field.wrapper);
    }
    list.appendChild(grid);
    folder.appendChild(list);
    groups.appendChild(folder);
  }
  card.appendChild(groups);
  body.appendChild(card);
  return true;
}

function presetStatusTone(state) {
  const value = String(state || '').toLowerCase();
  if (value === 'current' || value === 'ahead') return 'success';
  if (value === 'missing' || value === 'behind' || value === 'unknown' || value === 'legacy-name') return 'warning';
  if (value === 'error') return 'danger';
  return 'neutral';
}

function appendDirectivePresetSettings(body, view, actions = {}) {
  const preset = view?.directivePreset || {};
  const status = preset.status || null;
  const state = status?.state || 'unknown';
  const tone = presetStatusTone(state);
  const card = createCard(`directive-settings-preset-card directive-settings-control-card directive-lcars-panel directive-status-${tone}`);
  card.dataset.directiveSettingsTarget = DIRECTIVE_PRESET_SETTINGS_TARGET;
  card.tabIndex = -1;
  addTooltip(card, 'Bundled host preset status and installation controls for Directive.');
  card.append(
    createCardTitle('Directive Preset'),
    createMetaRow('Status', status?.pill || displayValue(state, 'Unknown')),
    createMetaRow('Installed', status?.installedVersion || 'unknown'),
    createMetaRow('Bundled', status?.bundledVersion || 'Directive-0.1.0-pre-alpha.7')
  );

  const message = createElement('p', 'directive-settings-preset-message');
  message.textContent = status?.message || 'Check whether the bundled Directive host preset is installed and current.';
  card.appendChild(message);

  if (preset.lastInstallResult?.selectionTouched) {
    card.appendChild(createMetaRow(
      'Selection',
      preset.lastInstallResult.restored
        ? 'Previous host preset selection restored after install.'
        : 'Verify the active host preset before generating.'
    ));
  }

  const autoCheck = preset.autoCheck || {};
  const autoCheckEnabled = autoCheck.enabled !== false;
  const autoCheckToggle = createElement('label', 'directive-lcars-toggle directive-settings-preset-autocheck-toggle');
  autoCheckToggle.dataset.toggleState = autoCheckEnabled ? 'enabled' : 'disabled';
  addTooltip(autoCheckToggle, 'At startup, remind me when the bundled Directive preset is missing or older.');
  const autoCheckCopy = createElement('span', 'directive-lcars-toggle-copy');
  const autoCheckTitle = createElement('strong', 'directive-lcars-toggle-title');
  autoCheckTitle.textContent = 'Auto-check preset updates';
  const autoCheckDetail = createElement('span', 'directive-lcars-toggle-detail');
  autoCheckDetail.textContent = 'At startup, remind me when the bundled Directive preset is missing or older.';
  autoCheckCopy.append(autoCheckTitle, autoCheckDetail);
  const autoCheckControl = createElement('span', 'directive-lcars-toggle-control');
  const autoCheckInput = createElement('input', 'directive-lcars-toggle-input');
  autoCheckInput.type = 'checkbox';
  autoCheckInput.role = 'switch';
  autoCheckInput.checked = autoCheckEnabled;
  autoCheckInput.disabled = typeof actions.updateDirectivePresetAutoCheck !== 'function';
  autoCheckInput.setAttribute('aria-label', 'Auto-check Directive preset updates at startup');
  autoCheckInput.setAttribute('aria-checked', autoCheckEnabled ? 'true' : 'false');
  const autoCheckSlider = createElement('span', 'directive-lcars-toggle-slider');
  const autoCheckKnob = createElement('span', 'directive-lcars-toggle-knob');
  autoCheckSlider.appendChild(autoCheckKnob);
  autoCheckControl.append(autoCheckInput, autoCheckSlider);
  autoCheckInput.addEventListener('change', async () => {
    const nextEnabled = autoCheckInput.checked === true;
    autoCheckInput.setAttribute('aria-checked', nextEnabled ? 'true' : 'false');
    autoCheckToggle.dataset.toggleState = nextEnabled ? 'enabled' : 'disabled';
    try {
      selectDirectivePresetSettingsSection();
      await actions.updateDirectivePresetAutoCheck?.({ enabled: nextEnabled });
      selectDirectivePresetSettingsSection();
      await actions.refresh?.();
    } catch (error) {
      autoCheckInput.checked = !nextEnabled;
      autoCheckInput.setAttribute('aria-checked', autoCheckInput.checked ? 'true' : 'false');
      autoCheckToggle.dataset.toggleState = autoCheckInput.checked ? 'enabled' : 'disabled';
      console.warn('[Directive] Could not update preset auto-check preference:', error);
    }
  });
  autoCheckToggle.append(autoCheckCopy, autoCheckControl);
  card.appendChild(autoCheckToggle);

  const row = createElement('div', 'directive-action-row directive-settings-action-row directive-settings-preset-actions');
  const canInstall = status?.canInstall === true && typeof actions.installDirectivePreset === 'function';
  const actionLabel = status?.actionLabel || (state === 'current' ? 'Reinstall Preset' : 'Install Preset');
  row.appendChild(createButton({
    label: actionLabel,
    icon: state === 'current' ? 'fa-solid fa-rotate' : 'fa-solid fa-download',
    className: status?.primaryAction ? 'directive-button directive-primary-command' : 'directive-button directive-secondary-command',
    disabled: !canInstall,
    title: `${actionLabel} from presets/sillytavern/directive.json`,
    onClick: async () => {
      if (state !== 'missing') {
        const confirmed = typeof globalThis.confirm === 'function'
          ? globalThis.confirm('Install the bundled Directive preset? This replaces the saved Directive preset with the bundled version, but will not intentionally switch your active preset.')
          : true;
        if (!confirmed) return;
      }
      selectSettingsSection(SETTINGS_PROVIDERS_SECTION_ID);
      await actions.installDirectivePreset?.();
      selectSettingsSection(SETTINGS_PROVIDERS_SECTION_ID);
      await actions.refresh?.();
    }
  }));
  row.appendChild(createButton({
    label: 'Refresh Status',
    icon: 'fa-solid fa-arrows-rotate',
    className: 'directive-button directive-secondary-command',
    disabled: typeof actions.refreshDirectivePresetStatus !== 'function',
    title: 'Check the installed Directive preset version.',
    onClick: async () => {
      selectSettingsSection(SETTINGS_PROVIDERS_SECTION_ID);
      await actions.refreshDirectivePresetStatus?.();
      selectSettingsSection(SETTINGS_PROVIDERS_SECTION_ID);
      await actions.refresh?.();
    }
  }));
  card.appendChild(row);
  body.appendChild(card);
  return true;
}

function appendProviderConfiguration(body, view, actions = {}) {
  const providerConfiguration = view?.providerConfiguration || {};
  if (providerConfiguration.error) {
    const card = createCard('directive-settings-provider-card directive-settings-control-card directive-lcars-panel');
    card.append(
      createCardTitle('Dual Provider Routing'),
      createMetaRow('Status', providerConfiguration.error.message || 'Provider configuration unavailable')
    );
    body.appendChild(card);
    return false;
  }

  const profiles = asArray(providerConfiguration.profiles);
  const settings = providerConfiguration.settings || {};
  const status = providerConfiguration.status || {};
  const intro = createCard('directive-settings-provider-intro directive-settings-control-card directive-lcars-panel');
  intro.dataset.directiveTour = 'settings.providers';
  addTooltip(intro, 'Dual Provider Routing separates low-cost utility work from deeper reasoning and narration work.');
  intro.append(
    createCardTitle('Dual Provider Routing'),
    createMetaRow('Utility Work', 'Classification, continuity, prompt assembly, summaries, and low-cost structured calls.'),
    createMetaRow('Reasoning Work', 'Mission adjudication, counsel, narration, and campaign-level reasoning.'),
    createMetaRow('API Keys', 'Stored for the current browser session only; never written into campaign saves.')
  );
  body.appendChild(intro);

  for (const kind of ['utility', 'reasoning']) {
    const config = settings[kind] || {};
    const providerStatus = status[kind] || {};
    const card = createCard(`directive-settings-provider-card directive-settings-provider-${kind} directive-settings-control-card directive-lcars-panel`);
    addTooltip(card, `${providerKindLabel(kind)} connection settings and generation defaults.`);
    card.append(
      createCardTitle(providerKindLabel(kind)),
      createMetaRow('Status', providerStatus.ready ? 'Ready' : 'Configuration required'),
      createMetaRow('Resolved Model', providerStatus.label || 'Not detected')
    );

    const grid = createElement('div', 'directive-provider-settings-grid');
    const source = createProviderField({
      label: 'Source',
      value: config.provider || 'st',
      options: providerSourceOptions(),
      tooltip: 'Where this provider lane gets its model connection.'
    });
    const profile = createProviderField({
      label: 'Connection Profile',
      value: config.profileId || '',
      options: [
        { id: '', label: 'Select a profile' },
        ...profiles.map((item) => ({ id: item.id, label: item.model ? `${item.label} / ${item.model}` : item.label }))
      ],
      tooltip: 'Saved host connection profile to use when Source is Host Connection Profile.'
    });
    const baseUrl = createProviderField({ label: 'Base URL', value: config.baseUrl || '', placeholder: 'https://provider.example/v1', tooltip: 'OpenAI-compatible API base URL for this provider lane.' });
    const model = createProviderField({ label: 'Model', value: config.model || '', placeholder: 'model-id', tooltip: 'Model identifier sent to the provider endpoint.' });
    const apiKey = createProviderField({
      label: config.apiKeySet ? 'Replace Session API Key' : 'Session API Key',
      value: '',
      type: 'password',
      placeholder: config.apiKeySet ? 'Key is set for this session' : 'Optional when endpoint does not require one',
      tooltip: 'Optional API key stored only in the current browser session.'
    });
    const temperature = createProviderField({ label: 'Temperature', value: config.temperature ?? (kind === 'utility' ? 0.1 : 0.7), type: 'number', tooltip: 'Sampling temperature for this provider lane.' });
    temperature.control.min = '0';
    temperature.control.max = '2';
    temperature.control.step = '0.05';
    const topP = createProviderField({ label: 'Top P', value: config.topP ?? 0.95, type: 'number', tooltip: 'Nucleus sampling limit for this provider lane.' });
    topP.control.min = '0';
    topP.control.max = '1';
    topP.control.step = '0.01';
    const maxTokens = createProviderField({ label: 'Maximum Tokens', value: config.maxTokens ?? 8192, type: 'number', tooltip: 'Maximum tokens allowed for a single provider response.' });
    maxTokens.control.min = '64';
    maxTokens.control.max = '131072';
    maxTokens.control.step = '64';

    const allProviderFields = [profile.wrapper, baseUrl.wrapper, model.wrapper, apiKey.wrapper];
    function syncVisibility() {
      const selected = source.control.value;
      profile.wrapper.hidden = selected !== 'profile';
      baseUrl.wrapper.hidden = selected !== 'openai_compatible';
      model.wrapper.hidden = selected !== 'openai_compatible';
      apiKey.wrapper.hidden = selected !== 'openai_compatible';
    }
    source.control.addEventListener('change', syncVisibility);
    grid.append(source.wrapper, ...allProviderFields, temperature.wrapper, topP.wrapper, maxTokens.wrapper);
    syncVisibility();
    card.appendChild(grid);

    const actionsRow = createElement('div', 'directive-action-row directive-provider-action-row');
    const saveProviderButton = createButton({
      label: 'Save Provider',
      icon: 'fa-solid fa-floppy-disk',
      className: 'directive-button directive-primary-command',
      title: `Save ${providerKindLabel(kind)} connection settings`,
      disabled: typeof actions.updateProviderSettings !== 'function',
      onClick: async () => {
        const patch = {
          provider: source.control.value,
          profileId: profile.control.value,
          baseUrl: baseUrl.control.value.trim(),
          model: model.control.value.trim(),
          temperature: Number(temperature.control.value),
          topP: Number(topP.control.value),
          maxTokens: Number(maxTokens.control.value)
        };
        if (apiKey.control.value) patch.apiKey = apiKey.control.value;
        await actions.updateProviderSettings({ kind, patch });
        apiKey.control.value = '';
        await actions.refresh();
      }
    });
    saveProviderButton.dataset.directiveTour = `settings.provider-save.${kind}`;
    const testProviderButton = createButton({
      label: 'Test Provider',
      icon: 'fa-solid fa-vial',
      className: 'directive-button directive-secondary-command',
      title: `Send a lightweight test call through the ${providerKindLabel(kind)}`,
      disabled: typeof actions.testProvider !== 'function',
      onClick: async () => {
        selectSettingsSection(SETTINGS_PROVIDERS_SECTION_ID);
        try {
          const result = await actions.testProvider({ kind });
          notifyProviderTestResult(kind, result);
        } catch (error) {
          notifyProviderTestResult(kind, {
            ok: false,
            error: { message: error?.message || String(error) }
          });
        }
        selectSettingsSection(SETTINGS_PROVIDERS_SECTION_ID);
        await actions.refresh?.();
      }
    });
    testProviderButton.dataset.directiveTour = kind === 'utility' ? 'settings.provider-test' : `settings.provider-test.${kind}`;
    actionsRow.append(saveProviderButton, testProviderButton);
    if (config.apiKeySet) {
      actionsRow.appendChild(createButton({
        label: 'Clear Session Key',
        icon: 'fa-solid fa-key',
        className: 'directive-button directive-secondary-command',
        title: 'Clear the temporary API key stored for this browser session',
        disabled: typeof actions.updateProviderSettings !== 'function',
        onClick: async () => {
          await actions.updateProviderSettings({ kind, patch: { apiKey: '' } });
          await actions.refresh();
        }
      }));
    }
    card.appendChild(actionsRow);
    body.appendChild(card);
  }
  return true;
}

function appendModelCallDiagnostics(body, view) {
  const calls = asArray(view?.chatNative?.modelCalls);
  const latestCalls = calls.slice(-6).reverse();
  const card = createCard('directive-settings-model-call-card directive-settings-control-card directive-lcars-panel');
  card.dataset.directiveTour = 'settings.model-calls';
  addTooltip(card, 'Recent Directive model-call telemetry by role, provider lane, status, latency, and request hash.');
  card.append(
    createCardTitle('Model Calls'),
    createMetaRow('Recorded', view?.chatNative?.tracking?.modelCallCount ?? calls.length),
    createMetaRow('Latest', latestCalls[0]?.roleId || 'None')
  );
  for (const call of latestCalls) {
    const row = createElement('div', 'directive-settings-model-call-row');
    row.append(
      createMetaRow('Role', call.roleId || 'unknown'),
      createMetaRow('Lane', call.providerKind || 'unknown'),
      createMetaRow('Status', call.status || 'recorded'),
      createMetaRow('Provider', call.providerId || call.model || 'not recorded'),
      createMetaRow('Latency', call.latencyMs === null || call.latencyMs === undefined ? 'n/a' : `${call.latencyMs}ms`),
      createMetaRow('Request', call.requestHash || 'not recorded')
    );
    if (call.errorCode) row.appendChild(createMetaRow('Error', call.errorCode));
    card.appendChild(row);
  }
  body.appendChild(card);
}

function historyLimitValue(state) {
  const value = Number(state?.settings?.maxTurnSaveHistory || state?.runtimeTracking?.historyLimit || 20);
  return Number.isFinite(value) ? value : 20;
}

function autosaveEveryMessagesValue(state) {
  const value = Number(state?.settings?.autosaveEveryMessages || 20);
  return Number.isFinite(value) ? value : 20;
}

function outcomeIntegritySettingsValue(state) {
  return normalizeOutcomeIntegritySettings(state?.settings || {});
}

function appendTooltipPreferenceSettings(body) {
  const disabled = areDirectiveTooltipsDisabled();
  const enabled = !disabled;
  const card = createCard('directive-settings-tooltip-card directive-settings-system-card directive-lcars-panel');
  card.dataset.directiveTour = 'settings.tooltips';
  addTooltip(card, 'Show or hide Directive explanatory hover and focus hints across the extension.');
  card.appendChild(createCardTitle('Interface Hints'));

  const toggle = createElement('label', 'directive-lcars-toggle directive-settings-tooltip-toggle');
  toggle.dataset.toggleState = enabled ? 'enabled' : 'disabled';
  addTooltip(toggle, 'Show or hide Directive explanatory hover and focus hints across the extension.');

  const copy = createElement('span', 'directive-lcars-toggle-copy');
  const title = createElement('strong', 'directive-lcars-toggle-title');
  title.textContent = 'Tooltips';
  const detail = createElement('span', 'directive-lcars-toggle-detail');
  detail.textContent = 'Explanatory hover and focus hints for Directive controls.';
  copy.append(title, detail);

  const control = createElement('span', 'directive-lcars-toggle-control');
  const input = createElement('input', 'directive-lcars-toggle-input');
  input.type = 'checkbox';
  input.role = 'switch';
  input.checked = enabled;
  input.setAttribute('aria-label', 'Show Directive tooltips');
  input.setAttribute('aria-checked', enabled ? 'true' : 'false');
  const slider = createElement('span', 'directive-lcars-toggle-slider');
  const knob = createElement('span', 'directive-lcars-toggle-knob');
  slider.appendChild(knob);
  control.append(input, slider);

  input.addEventListener('change', () => {
    const nextEnabled = input.checked === true;
    const nextDisabled = !nextEnabled;
    setDirectiveTooltipsDisabled(nextDisabled);
    input.setAttribute('aria-checked', nextEnabled ? 'true' : 'false');
    toggle.dataset.toggleState = nextEnabled ? 'enabled' : 'disabled';
  });

  toggle.append(copy, control);
  card.appendChild(toggle);
  body.appendChild(card);
  return true;
}

function appendGuidanceToggle(card, {
  title,
  detail,
  enabled,
  ariaLabel,
  key,
  tourTarget = '',
  actions = {}
}) {
  const toggle = createElement('label', 'directive-lcars-toggle directive-settings-guidance-toggle');
  toggle.dataset.toggleState = enabled ? 'enabled' : 'disabled';
  if (tourTarget) toggle.dataset.directiveTour = tourTarget;
  addTooltip(toggle, detail);

  const copy = createElement('span', 'directive-lcars-toggle-copy');
  const titleElement = createElement('strong', 'directive-lcars-toggle-title');
  titleElement.textContent = title;
  const detailElement = createElement('span', 'directive-lcars-toggle-detail');
  detailElement.textContent = detail;
  copy.append(titleElement, detailElement);

  const control = createElement('span', 'directive-lcars-toggle-control');
  const input = createElement('input', 'directive-lcars-toggle-input');
  input.type = 'checkbox';
  input.role = 'switch';
  input.checked = enabled;
  input.setAttribute('aria-label', ariaLabel);
  input.setAttribute('aria-checked', enabled ? 'true' : 'false');
  const slider = createElement('span', 'directive-lcars-toggle-slider');
  const knob = createElement('span', 'directive-lcars-toggle-knob');
  slider.appendChild(knob);
  control.append(input, slider);

  input.addEventListener('change', async () => {
    const nextEnabled = input.checked === true;
    input.setAttribute('aria-checked', nextEnabled ? 'true' : 'false');
    toggle.dataset.toggleState = nextEnabled ? 'enabled' : 'disabled';
    await actions.setGuidancePreference?.({ key, value: !nextEnabled });
  });

  toggle.append(copy, control);
  card.appendChild(toggle);
}

const GUIDANCE_TUTORIAL_ICON_BY_ID = Object.freeze({
  'tutorial.basic': 'fa-solid fa-route',
  'tutorial.advanced': 'fa-solid fa-sitemap',
  'tutorial.assist': 'fa-solid fa-wand-magic-sparkles',
  'tutorial.message-actions': 'fa-solid fa-message',
  'tutorial.campaign-records': 'fa-solid fa-box-archive',
  'tutorial.mission-outcomes': 'fa-solid fa-crosshairs',
  'tutorial.crew-ship-log': 'fa-solid fa-list-check',
  'tutorial.settings-safety': 'fa-solid fa-shield-halved'
});

function guidanceTutorialTourTarget(tutorialId = '') {
  return `settings.guidance.begin.${String(tutorialId || '')
    .replace(/^tutorial\./, '')
    .replace(/[^a-z0-9]+/gi, '-')}`;
}

function appendGuidanceTutorialLibrary(card, actions = {}) {
  const library = createElement('div', 'directive-settings-guidance-library');
  library.dataset.directiveTour = 'settings.guidance.library';
  const heading = createElement('div', 'directive-settings-guidance-library-heading');
  const title = createElement('strong');
  title.textContent = 'Tutorial Library';
  const summary = createElement('span');
  summary.textContent = 'Restart walkthroughs whenever you need them.';
  heading.append(title, summary);
  const grid = createElement('div', 'directive-settings-guidance-library-grid');
  for (const tutorial of DIRECTIVE_TUTORIALS) {
    const button = createButton({
      label: tutorial.title,
      icon: GUIDANCE_TUTORIAL_ICON_BY_ID[tutorial.id] || 'fa-solid fa-route',
      className: tutorial.id === 'tutorial.basic'
        ? 'directive-button directive-primary-command directive-settings-guidance-tutorial-button'
        : 'directive-button directive-secondary-command directive-settings-guidance-tutorial-button',
      title: tutorial.summary || tutorial.title,
      disabled: typeof actions.beginGuidanceTutorial !== 'function',
      onClick: async () => actions.beginGuidanceTutorial?.({ tutorialId: tutorial.id })
    });
    button.dataset.directiveTutorialId = tutorial.id;
    button.dataset.directiveTour = tutorial.id === 'tutorial.basic'
      ? `${guidanceTutorialTourTarget(tutorial.id)} settings.guidance.begin`
      : guidanceTutorialTourTarget(tutorial.id);
    grid.appendChild(button);
  }
  library.append(heading, grid);
  card.appendChild(library);
}

function appendGuidanceSettings(body, actions = {}) {
  const preferences = getDirectiveGuidancePreferences();
  const card = createCard('directive-settings-guidance-card directive-settings-system-card directive-lcars-panel');
  card.dataset.directiveTour = 'settings.guidance';
  addTooltip(card, 'Control Directive walkthroughs and rotating startup tips.');
  card.appendChild(createCardTitle('Tips & Tutorials'));

  appendGuidanceToggle(card, {
    title: 'Tutorial Prompts',
    detail: 'Offer the basic walkthrough until it is completed or disabled.',
    enabled: !preferences.tutorialPromptsDisabled,
    ariaLabel: 'Offer Directive tutorial prompts',
    key: 'tutorialPromptsDisabled',
    tourTarget: 'settings.guidance.tutorial-toggle',
    actions
  });
  appendGuidanceToggle(card, {
    title: 'Startup Tips',
    detail: 'Offer a short Directive tip on later starts.',
    enabled: !preferences.tipsDisabled,
    ariaLabel: 'Offer Directive startup tips',
    key: 'tipsDisabled',
    tourTarget: 'settings.guidance.tips-toggle',
    actions
  });

  appendGuidanceTutorialLibrary(card, actions);

  const row = createElement('div', 'directive-action-row directive-settings-action-row directive-settings-guidance-actions');
  const showTipButton = createButton({
    label: 'Show Tip',
    icon: 'fa-solid fa-circle-info',
    className: 'directive-button directive-secondary-command',
    title: 'Show a Directive tip now.',
    disabled: typeof actions.showGuidanceTip !== 'function',
    onClick: async () => actions.showGuidanceTip?.({ direction: 'next' })
  });
  showTipButton.dataset.directiveTour = 'settings.guidance.show-tip';
  const resetButton = createButton({
    label: 'Reset Tutorial Progress',
    icon: 'fa-solid fa-rotate-left',
    className: 'directive-button directive-secondary-command',
    title: 'Allow the first-run tutorial prompt to appear again.',
    disabled: typeof actions.resetGuidanceProgress !== 'function',
    onClick: async () => {
      await actions.resetGuidanceProgress?.();
      await actions.refresh?.();
    }
  });
  resetButton.dataset.directiveTour = 'settings.guidance.reset';
  row.append(showTipButton, resetButton);
  card.appendChild(row);
  body.appendChild(card);
  return true;
}

function appendRuntimeSettings(body, state, actions = {}) {
  const card = createCard('directive-settings-card directive-settings-system-card directive-lcars-panel');
  card.dataset.directiveTour = 'settings.runtime';
  addTooltip(card, 'Campaign-specific runtime controls for the active campaign state.');
  const maxTurnSaveHistory = historyLimitValue(state);
  const autosaveEveryMessages = autosaveEveryMessagesValue(state);
  const outcomeIntegrity = outcomeIntegritySettingsValue(state);
  card.appendChild(createCardTitle('Runtime'));
  const note = createElement('p', 'directive-settings-runtime-note');
  note.textContent = 'Campaign-specific settings for the current active campaign.';
  card.appendChild(note);
  const controls = createElement('div', 'directive-action-row directive-settings-action-row directive-runtime-history-controls');
  const historyField = createProviderField({
    label: 'Max Turn Save History',
    value: maxTurnSaveHistory,
    type: 'number',
    tooltip: 'Maximum number of turn-level recovery snapshots Directive keeps.'
  });
  historyField.wrapper.className = `${historyField.wrapper.className} directive-runtime-history-field`.trim();
  historyField.control.min = '2';
  historyField.control.max = '60';
  historyField.control.step = '1';
  historyField.control.dataset.inputPath = 'settings.maxTurnSaveHistory';

  const autosaveField = createProviderField({
    label: 'Autosave Every Messages',
    value: autosaveEveryMessages,
    type: 'number',
    tooltip: 'How often Directive writes an automatic campaign save during chat play.'
  });
  autosaveField.wrapper.className = `${autosaveField.wrapper.className} directive-runtime-history-field`.trim();
  autosaveField.control.min = '1';
  autosaveField.control.max = '200';
  autosaveField.control.step = '1';
  autosaveField.control.dataset.inputPath = 'settings.autosaveEveryMessages';

  const outcomeIntegrityField = createProviderField({
    label: 'Outcome Integrity',
    value: outcomeIntegrity.mode,
    options: OUTCOME_INTEGRITY_MODES.map((mode) => ({
      id: mode,
      label: mode === 'strict' ? 'Strict' : mode === 'relaxed' ? 'Relaxed' : 'Off',
      tooltip: mode === 'strict'
        ? 'Review prose edits before they can replace protected Directive replies.'
        : mode === 'relaxed'
          ? 'Allow native edits and review or mark them afterward.'
          : 'Allow native transcript edits without Outcome Integrity review.'
    })),
    tooltip: 'Campaign-specific setting. Controls whether protected Directive assistant replies can be edited as prose only.'
  });
  outcomeIntegrityField.wrapper.className = `${outcomeIntegrityField.wrapper.className} directive-runtime-history-field`.trim();
  outcomeIntegrityField.control.dataset.inputPath = 'settings.outcomeIntegrity.mode';

  const outcomeIntegrityProviderField = createProviderField({
    label: 'Review Provider',
    value: outcomeIntegrity.reviewProviderKind,
    options: OUTCOME_INTEGRITY_REVIEW_PROVIDER_KINDS.map((kind) => ({
      id: kind,
      label: kind === 'utility' ? 'Utility Provider' : 'Reasoning Provider',
      tooltip: kind === 'utility'
        ? 'Default. Uses the lower-cost utility provider lane for Outcome Integrity checks.'
        : 'Uses the reasoning provider lane for deeper Outcome Integrity checks.'
    })),
    tooltip: 'Campaign-specific setting. Changes review depth and cost only; it does not change Outcome Integrity authority.'
  });
  outcomeIntegrityProviderField.wrapper.className = `${outcomeIntegrityProviderField.wrapper.className} directive-runtime-history-field`.trim();
  outcomeIntegrityProviderField.control.dataset.inputPath = 'settings.outcomeIntegrity.reviewProviderKind';

  controls.append(
    historyField.wrapper,
    autosaveField.wrapper,
    outcomeIntegrityField.wrapper,
    outcomeIntegrityProviderField.wrapper,
    createButton({
      label: 'Apply',
      icon: 'fa-solid fa-floppy-disk',
      className: 'directive-button directive-primary-command directive-runtime-history-save',
      title: 'Apply runtime history and autosave settings',
      disabled: !state || (typeof actions.updateRuntimeSettings !== 'function' && typeof actions.updateRuntimeHistoryLimit !== 'function'),
      onClick: async () => {
        if (!state) return;
        selectSettingsSection(SETTINGS_SYSTEMS_SECTION_ID);
        if (typeof actions.updateRuntimeSettings === 'function') {
          await actions.updateRuntimeSettings({
            maxTurnSaveHistory: Number(historyField.control.value),
            autosaveEveryMessages: Number(autosaveField.control.value),
            outcomeIntegrityMode: outcomeIntegrityField.control.value,
            outcomeIntegrityReviewProviderKind: outcomeIntegrityProviderField.control.value
          });
        } else {
          await actions.updateRuntimeHistoryLimit?.({
            maxTurnSaveHistory: Number(historyField.control.value)
          });
        }
        selectSettingsSection(SETTINGS_SYSTEMS_SECTION_ID);
        await actions.refresh?.();
      }
    })
  );
  card.appendChild(controls);
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
  addTooltip(card, 'Verify, settle, export, and repair campaign records without exposing hidden simulation state.');
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
      iconSlot: 'action.close',
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
    createSettingsStatusBlock('Status', diagnostics?.status || 'unknown', storageStatusTone(diagnostics?.status), 'Overall local storage diagnostic status.'),
    createSettingsStatusBlock('Issues', Array.isArray(diagnostics?.issues) ? diagnostics.issues.length : 0, diagnostics?.issues?.length ? 'warning' : 'success', 'Storage records needing attention.'),
    createSettingsStatusBlock('Creator Drafts', diagnostics?.counts?.creatorDrafts ?? 0, 'neutral', 'Saved character creator drafts found in storage.'),
    createSettingsStatusBlock('Saves', diagnostics?.counts?.saves ?? 0, 'neutral', 'Campaign save records found in storage.')
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

export function renderSettingsPanel(body, view, actions = {}) {
  appendSectionTitle(body, 'Settings');
  const state = view?.campaignState;
  const consoleSurface = createElement('div', 'directive-settings-console directive-lcars-console');

  const sections = [
    { id: SETTINGS_SYSTEMS_SECTION_ID, label: 'Systems', icon: 'fa-solid fa-table-cells-large', tooltip: 'Runtime behavior, save history, and host preset status.', tour: 'settings.systems-tab' },
    { id: SETTINGS_PROVIDERS_SECTION_ID, label: 'Providers', icon: 'fa-solid fa-microchip', tooltip: 'Dual provider routing, provider lanes, and model-call diagnostics.', tour: 'settings.providers-tab' },
    { id: SETTINGS_SAFETY_SECTION_ID, label: 'Safety', icon: 'fa-solid fa-shield-halved', tooltip: 'Storage checks, active save repair, export, and cleanup controls.', tour: 'settings.safety-tab' }
  ];
  const activeSectionId = sections.some((section) => section.id === activeSettingsSectionId)
    ? activeSettingsSectionId
    : DEFAULT_SETTINGS_SECTION_ID;
  activeSettingsSectionId = activeSectionId;
  consoleSurface.appendChild(createSettingsSubtabs(sections, activeSectionId));

  const systemsSection = createSettingsSection({
    id: SETTINGS_SYSTEMS_SECTION_ID,
    label: 'Systems',
    active: activeSectionId === SETTINGS_SYSTEMS_SECTION_ID
  });
  appendRuntimeSettings(systemsSection, state, actions);
  appendTooltipPreferenceSettings(systemsSection);
  appendGuidanceSettings(systemsSection, actions);
  consoleSurface.appendChild(systemsSection);

  const providersSection = createSettingsSection({
    id: SETTINGS_PROVIDERS_SECTION_ID,
    label: 'Providers',
    active: activeSectionId === SETTINGS_PROVIDERS_SECTION_ID
  });
  appendDirectivePresetSettings(providersSection, view, actions);
  appendProviderConfiguration(providersSection, view, actions);
  appendProviderRoleRouting(providersSection, view, actions);
  appendModelCallDiagnostics(providersSection, view);
  consoleSurface.appendChild(providersSection);

  const safetySection = createSettingsSection({
    id: SETTINGS_SAFETY_SECTION_ID,
    label: 'Safety',
    active: activeSectionId === SETTINGS_SAFETY_SECTION_ID
  });
  appendStateSafetySettings(safetySection, view, actions);
  consoleSurface.appendChild(safetySection);

  body.appendChild(consoleSurface);
}
