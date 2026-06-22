import {
  appendEmpty,
  appendSectionTitle,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createIcon,
  createIconFromDescriptor,
  createMetaRow
} from './runtime-ui-kit.js';
import {
  DIRECTIVE_BUNDLED_ICON_PACKS,
  resolveDirectiveIconSlot
} from '../theme/directive-icon-packs.mjs';

const SETTINGS_SYSTEMS_SECTION_ID = 'directive-settings-systems-section';
const SETTINGS_PROVIDERS_SECTION_ID = 'directive-settings-providers-section';
const SETTINGS_SAFETY_SECTION_ID = 'directive-settings-safety-section';
const DEFAULT_SETTINGS_SECTION_ID = SETTINGS_SYSTEMS_SECTION_ID;

let activeSettingsSectionId = DEFAULT_SETTINGS_SECTION_ID;

export function resetSettingsPanelState() {
  activeSettingsSectionId = DEFAULT_SETTINGS_SECTION_ID;
}

function selectSettingsSection(sectionId) {
  activeSettingsSectionId = sectionId || DEFAULT_SETTINGS_SECTION_ID;
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

function createSettingsStatusBlock(label, value, tone = 'neutral') {
  const block = createElement('div', `directive-lcars-status-block directive-settings-status-block directive-status-${tone}`);
  const key = createElement('span', 'directive-lcars-status-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-lcars-status-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  block.append(key, content);
  return block;
}

function createSettingsActionTile({ label, description, icon, iconSlot = '', tone = 'primary', disabled = false, onClick }) {
  const button = createElement('button', `directive-settings-action-tile directive-settings-action-${tone}`);
  button.type = 'button';
  button.disabled = disabled === true;
  button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-description', description || '');
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
    button.setAttribute('aria-controls', section.id);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
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
  section.hidden = !active;
  if (active) {
    section.className = `${section.className} directive-settings-section-active`.trim();
  }
  const heading = createElement('h3', 'directive-settings-section-title');
  heading.textContent = label;
  section.appendChild(heading);
  return section;
}

function createProviderField({ label, value = '', type = 'text', options = null, placeholder = '' } = {}) {
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
      control.appendChild(item);
    }
    control.value = value || options[0]?.id || '';
  } else {
    control = createElement('input', 'directive-field-control');
    control.type = type;
    control.value = value === undefined || value === null ? '' : String(value);
    control.placeholder = placeholder;
  }
  wrapper.append(labelText, control);
  return { wrapper, control };
}

function providerSourceOptions() {
  return [
    { id: 'st', label: 'Current Host Model' },
    { id: 'profile', label: 'Host Connection Profile' },
    { id: 'openai_compatible', label: 'OpenAI-Compatible Endpoint' }
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
    { id: 'default', label: `Default (${providerKindLabel(defaultKind).replace(' Provider', '')})` },
    { id: 'utility', label: 'Utility Provider' },
    { id: 'reasoning', label: 'Reasoning Provider' }
  ];
}

const MODEL_CALL_ROUTING_GROUPS = Object.freeze([
  {
    id: 'story-output',
    label: 'Story Output',
    icon: 'fa-solid fa-feather-pointed',
    roles: Object.freeze(['narration', 'campaignIntro', 'campaignConclusion', 'missionDirectorAdvisor'])
  },
  {
    id: 'turn-reading',
    label: 'Turn Reading',
    icon: 'fa-solid fa-magnifying-glass-chart',
    roles: Object.freeze(['utilityTurnClassifier', 'questActionInterpreter'])
  },
  {
    id: 'world-structure',
    label: 'World Structure',
    icon: 'fa-solid fa-diagram-project',
    roles: Object.freeze(['questArchitect', 'sceneDeltaExtractor', 'sceneReconciliationExtractor'])
  },
  {
    id: 'state-sidecars',
    label: 'State Sidecars',
    icon: 'fa-solid fa-gears',
    roles: Object.freeze(['relationshipEvaluator', 'commandBearingEvaluator', 'continuityTracker', 'crewDirector', 'shipDirector'])
  },
  {
    id: 'context-summaries',
    label: 'Context & Summaries',
    icon: 'fa-solid fa-list-check',
    roles: Object.freeze(['promptContextBuilder', 'commandLogSummarizer', 'recapSummarizer', 'utilityJson'])
  },
  {
    id: 'authoring-helpers',
    label: 'Authoring Helpers',
    icon: 'fa-solid fa-wand-magic-sparkles',
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
        options: providerLaneOptions(route)
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
  card.append(
    createCardTitle('Directive Preset'),
    createMetaRow('Status', status?.pill || displayValue(state, 'Unknown')),
    createMetaRow('Installed', status?.installedVersion || 'unknown'),
    createMetaRow('Bundled', status?.bundledVersion || 'Directive-0.1.0-pre-alpha.4')
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
    card.append(
      createCardTitle(providerKindLabel(kind)),
      createMetaRow('Status', providerStatus.ready ? 'Ready' : 'Configuration required'),
      createMetaRow('Resolved Model', providerStatus.label || 'Not detected')
    );

    const grid = createElement('div', 'directive-provider-settings-grid');
    const source = createProviderField({
      label: 'Source',
      value: config.provider || 'st',
      options: providerSourceOptions()
    });
    const profile = createProviderField({
      label: 'Connection Profile',
      value: config.profileId || '',
      options: [
        { id: '', label: 'Select a profile' },
        ...profiles.map((item) => ({ id: item.id, label: item.model ? `${item.label} / ${item.model}` : item.label }))
      ]
    });
    const baseUrl = createProviderField({ label: 'Base URL', value: config.baseUrl || '', placeholder: 'https://provider.example/v1' });
    const model = createProviderField({ label: 'Model', value: config.model || '', placeholder: 'model-id' });
    const apiKey = createProviderField({
      label: config.apiKeySet ? 'Replace Session API Key' : 'Session API Key',
      value: '',
      type: 'password',
      placeholder: config.apiKeySet ? 'Key is set for this session' : 'Optional when endpoint does not require one'
    });
    const temperature = createProviderField({ label: 'Temperature', value: config.temperature ?? (kind === 'utility' ? 0.1 : 0.7), type: 'number' });
    temperature.control.min = '0';
    temperature.control.max = '2';
    temperature.control.step = '0.05';
    const topP = createProviderField({ label: 'Top P', value: config.topP ?? 0.95, type: 'number' });
    topP.control.min = '0';
    topP.control.max = '1';
    topP.control.step = '0.01';
    const maxTokens = createProviderField({ label: 'Maximum Tokens', value: config.maxTokens ?? 8192, type: 'number' });
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
    actionsRow.append(
      createButton({
        label: 'Save Provider',
        icon: 'fa-solid fa-floppy-disk',
        className: 'directive-button directive-primary-command',
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
      }),
      createButton({
        label: 'Test Provider',
        icon: 'fa-solid fa-vial',
        className: 'directive-button directive-secondary-command',
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
      })
    );
    if (config.apiKeySet) {
      actionsRow.appendChild(createButton({
        label: 'Clear Session Key',
        icon: 'fa-solid fa-key',
        className: 'directive-button directive-secondary-command',
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

function appendRuntimeSettings(body, state, actions = {}) {
  const card = createCard('directive-settings-card directive-settings-system-card directive-lcars-panel');
  const maxTurnSaveHistory = historyLimitValue(state);
  card.appendChild(createCardTitle('Runtime'));
  const controls = createElement('div', 'directive-action-row directive-settings-action-row directive-runtime-history-controls');
  const field = createProviderField({
    label: 'Max Turn Save History',
    value: maxTurnSaveHistory,
    type: 'number'
  });
  field.wrapper.className = `${field.wrapper.className} directive-runtime-history-field`.trim();
  field.control.min = '2';
  field.control.max = '60';
  field.control.step = '1';
  field.control.dataset.inputPath = 'settings.maxTurnSaveHistory';
  controls.append(
    field.wrapper,
    createButton({
      label: 'Apply',
      icon: 'fa-solid fa-floppy-disk',
      className: 'directive-button directive-primary-command directive-runtime-history-save',
      disabled: !state || typeof actions.updateRuntimeHistoryLimit !== 'function',
      onClick: async () => {
        if (!state) return;
        selectSettingsSection(SETTINGS_SYSTEMS_SECTION_ID);
        await actions.updateRuntimeHistoryLimit?.({
          maxTurnSaveHistory: Number(field.control.value)
        });
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

export function renderSettingsPanel(body, view, actions = {}) {
  appendSectionTitle(body, 'Settings');
  const state = view?.campaignState;
  const consoleSurface = createElement('div', 'directive-settings-console directive-lcars-console');

  const sections = [
    { id: SETTINGS_SYSTEMS_SECTION_ID, label: 'Systems', icon: 'fa-solid fa-table-cells-large' },
    { id: SETTINGS_PROVIDERS_SECTION_ID, label: 'Providers', icon: 'fa-solid fa-microchip' },
    { id: SETTINGS_SAFETY_SECTION_ID, label: 'Safety', icon: 'fa-solid fa-shield-halved' }
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
