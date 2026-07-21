import {
  addTooltip,
  appendEmpty,
  appendSectionTitle,
  clearElement,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createIcon
} from './runtime-ui-kit.js';
import { DIRECTIVE_COMM_BADGE_ICON, createDirectiveMaskIcon, createPackageImage, crewDivision } from './directive-media.js';
import { appendDirectiveOverlay } from './directive-overlay-root.js';
import {
  normalizeSimulationMode,
  simulationModeDifficultyOption,
  simulationModeDifficultyOptions
} from '../simulation/simulation-mode-policy.mjs';

let activeCampaignSection = '';
let activeLibraryPackageId = '';
let activeRecordSaveId = '';
let selectedRecordSaveIds = new Set();
let lastRecordSelectionAnchorId = '';
let collapsedRecordCampaignIds = new Set();
let expandedCommandSessionKeys = new Set();
let showHiddenCommandSessions = false;
let commandSessionSearchQuery = '';

export function resetCampaignPanelState() {
  activeCampaignSection = '';
  activeLibraryPackageId = '';
  activeRecordSaveId = '';
  selectedRecordSaveIds = new Set();
  lastRecordSelectionAnchorId = '';
  collapsedRecordCampaignIds = new Set();
  expandedCommandSessionKeys = new Set();
  showHiddenCommandSessions = false;
  commandSessionSearchQuery = '';
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function issueCount(diagnostics) {
  return Array.isArray(diagnostics?.issues) ? diagnostics.issues.length : Number(diagnostics?.issueCount || 0);
}

function readFileBytes(file) {
  if (file && typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  if (typeof FileReader !== 'function') throw new Error('This browser cannot read local package files.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error || new Error('Package file could not be read.')));
    reader.readAsArrayBuffer(file);
  });
}

function statusTone(value) {
  const label = String(value || '').toLowerCase();
  if (/error|rejected|missing|failed|invalid/.test(label)) return 'danger';
  if (/warning|issue|pending|draft|required|needed|incomplete|blocked/.test(label)) return 'warning';
  if (/ready|healthy|ok|stored|success|current|active|passed/.test(label)) return 'success';
  return 'neutral';
}

function formatTime(value, fallback = 'No activity') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function packageDataFor(view, pack) {
  const packId = pack?.packageId || pack?.package?.id || pack?.manifest?.id || '';
  const activePackageId = view?.activePackage?.packageId
    || view?.activePackage?.package?.id
    || view?.activePackage?.manifest?.id
    || '';
  if (packId && activePackageId === packId) return view.activePackage;
  return pack || null;
}

function createStatusBlock(label, value, tone = statusTone(value), icon = '', tooltip = '') {
  const block = createElement('div', `directive-lcars-status-block directive-status-${tone}`);
  if (icon) {
    const iconFrame = createElement('span', 'directive-lcars-status-icon');
    iconFrame.appendChild(createIcon(icon));
    block.appendChild(iconFrame);
  }
  const copy = createElement('span', 'directive-lcars-status-copy');
  const key = createElement('span', 'directive-lcars-status-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-lcars-status-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  copy.append(key, content);
  block.appendChild(copy);
  if (tooltip) addTooltip(block, tooltip);
  return block;
}

function createSectionHeading(kicker, title, summary = '') {
  const header = createElement('header', 'directive-campaign-section-heading');
  const titleBlock = createElement('div', 'directive-campaign-section-titleblock');
  if (kicker) {
    const eyebrow = createElement('span', 'directive-lcars-kicker');
    eyebrow.textContent = kicker;
    titleBlock.appendChild(eyebrow);
  }
  const heading = createElement('h3', 'directive-campaign-section-title');
  heading.textContent = title;
  titleBlock.appendChild(heading);
  if (summary) {
    const copy = createElement('p', 'directive-campaign-section-summary');
    copy.textContent = summary;
    titleBlock.appendChild(copy);
  }
  header.appendChild(titleBlock);
  return header;
}

function createCampaignSection({ id, label, className = '', active = false }) {
  const section = createElement('section', `directive-campaign-section${className ? ` ${className}` : ''}`);
  section.id = id;
  section.dataset.campaignSection = id;
  const tourById = {
    'directive-campaign-command-section': 'campaign.command',
    'directive-campaign-library-section': 'campaign.library',
    'directive-campaign-records-section': 'campaign.records'
  };
  if (tourById[id]) section.dataset.directiveTour = tourById[id];
  section.setAttribute('aria-label', label);
  if (active) section.classList.add('directive-campaign-section-active');
  return section;
}

function createCampaignSubtabs(items, activeId) {
  const nav = createElement('nav', 'directive-campaign-subtabs');
  nav.setAttribute('aria-label', 'Campaign sections');
  nav.setAttribute('role', 'tablist');
  const buttons = [];

  const select = (targetId) => {
    const target = items.some((item) => item.id === targetId) ? targetId : items[0]?.id;
    if (!target) return;
    activeCampaignSection = target;
    for (const item of items) {
      const selected = item.id === target;
      item.section.classList.toggle('directive-campaign-section-active', selected);
      item.section.setAttribute('aria-hidden', selected ? 'false' : 'true');
    }
    for (const button of buttons) {
      const selected = button.dataset.campaignSubtabTarget === target;
      button.classList.toggle('directive-campaign-subtab-active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute?.('aria-current');
    }
  };

  for (const item of items) {
    const button = createElement('button', 'directive-campaign-subtab');
    button.type = 'button';
    button.dataset.campaignSubtabTarget = item.id;
    const tourById = {
      'directive-campaign-command-section': 'campaign.subtab.command',
      'directive-campaign-library-section': 'campaign.subtab.library',
      'directive-campaign-records-section': 'campaign.subtab.records'
    };
    if (tourById[item.id]) button.dataset.directiveTour = tourById[item.id];
    button.setAttribute('aria-controls', item.id);
    button.setAttribute('role', 'tab');
    addTooltip(button, item.tooltip || item.summary || item.label);
    const icon = createElement('span', 'directive-campaign-subtab-icon');
    icon.appendChild(createIcon(item.icon));
    const label = createElement('span');
    label.textContent = item.label;
    button.append(icon, label);
    button.addEventListener('click', () => select(item.id));
    nav.appendChild(button);
    buttons.push(button);
  }

  select(activeId);
  return { nav, select };
}

function createImportControl(actions) {
  const fileInput = createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.directive-campaign.zip,.zip,application/zip';
  fileInput.hidden = true;

  const importFile = async (file) => {
    if (!file || typeof actions.importCampaignPackageArchive !== 'function') return;
    activeCampaignSection = 'directive-campaign-library-section';
    const bytes = await readFileBytes(file);
    await actions.importCampaignPackageArchive({ fileName: file.name, bytes });
    fileInput.value = '';
    await actions.refresh();
  };

  fileInput.addEventListener('change', async () => importFile(fileInput.files?.[0]));
  return {
    fileInput,
    browseButton: createButton({
      label: 'Choose File',
      icon: 'fa-solid fa-folder-open',
      className: 'directive-button directive-secondary-command directive-import-browse-command',
      title: 'Choose a .directive-campaign.zip package',
      disabled: typeof actions.importCampaignPackageArchive !== 'function',
      onClick: () => fileInput.click()
    }),
    importFile
  };
}

function createActionButton(command, className = '') {
  const button = createButton({
    label: command.label,
    icon: command.icon,
    className: `directive-button ${className || 'directive-secondary-command'}`,
    title: command.title || command.label,
    disabled: command.disabled === true,
    onClick: command.onClick
  });
  if (command.tourTarget) button.dataset.directiveTour = command.tourTarget;
  return button;
}

function formatStardate(value) {
  return value === undefined || value === null || value === '' ? 'Pending' : `SD ${value}`;
}

function formatMissionLabel(value, fallback = 'Not started') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function compactText(value, fallback = 'Details pending.', maxLength = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function safeDomId(value, fallback = 'item') {
  const text = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return text || fallback;
}

function storyParagraphs(value, fallback = 'Story hook pending.') {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [fallback];
  return text
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function setHookToggleContent(button, expanded) {
  clearElement(button);
  const label = createElement('span');
  label.textContent = expanded ? 'Less' : 'More...';
  button.append(createIcon(expanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'), label);
}

function createCampaignHook(value) {
  const hook = createElement('div', 'directive-starship-briefing-hook');
  const paragraphs = storyParagraphs(value);
  const opening = createElement('p', 'directive-starship-briefing-hook-paragraph');
  opening.textContent = paragraphs[0];
  hook.appendChild(opening);
  if (paragraphs.length <= 1) return hook;

  const more = createElement('div', 'directive-starship-briefing-hook-more');
  more.hidden = true;
  for (const paragraph of paragraphs.slice(1)) {
    const item = createElement('p', 'directive-starship-briefing-hook-paragraph');
    item.textContent = paragraph;
    more.appendChild(item);
  }

  const toggle = createElement('button', 'directive-starship-briefing-hook-toggle directive-secondary-command');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Show full campaign hook');
  setHookToggleContent(toggle, false);
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    more.hidden = !expanded;
    hook.classList.toggle('directive-starship-briefing-hook-expanded', expanded);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.setAttribute('aria-label', expanded ? 'Collapse campaign hook' : 'Show full campaign hook');
    setHookToggleContent(toggle, expanded);
  });

  hook.append(more, toggle);
  return hook;
}

function setRosterToggleContent(button, expanded, count) {
  clearElement(button);
  button.appendChild(createIcon(expanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'));
  const copy = createElement('span', 'directive-starship-briefing-roster-toggle-copy');
  appendText(copy, 'strong', 'directive-starship-briefing-roster-toggle-title', 'Crew Roster');
  appendText(
    copy,
    'span',
    'directive-starship-briefing-roster-toggle-meta',
    count ? `${count} roster slot${count === 1 ? '' : 's'}` : 'No roster slots'
  );
  button.appendChild(copy);
}

function briefingOfficerRoleTone(officer = {}) {
  return crewDivision(officer);
}

function createPlayerCharacterRosterSlot(pack = {}) {
  const role = pack.playerRole || {};
  return {
    id: 'player-commander',
    name: 'Player Character',
    rank: role.rank || 'Player-defined',
    billet: role.billet || role.label || 'Campaign role',
    packageRole: role.authority || role.label || 'Player command role',
    playerSlot: true
  };
}

function orderedRosterEntries(pack = {}) {
  const preview = asArray(pack.seniorCrewPreview);
  const playerSlot = createPlayerCharacterRosterSlot(pack);
  const entries = [];
  let includedPlayer = false;
  const seen = new Set();
  for (const officer of preview) {
    const id = String(officer?.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (id === 'player-commander' || id === 'player-character') {
      if (!includedPlayer) {
        entries.push(playerSlot);
        includedPlayer = true;
      }
      continue;
    }
    entries.push(officer);
  }
  if (!includedPlayer) {
    entries.splice(entries.length ? 1 : 0, 0, playerSlot);
  }
  return entries;
}

function packageReady(pack) {
  return statusTone(pack?.diagnostics?.status) !== 'danger' && pack?.actions?.startNewCampaign !== false;
}

function expectedSessionsLabel(pack) {
  const sessions = pack?.campaign?.structure?.expectedSessions;
  if (!sessions) return 'Length pending';
  const label = String(sessions).trim();
  return /\bsessions?\b/i.test(label) ? label : `${label} Sessions`;
}

function packageMetadataCount(value) {
  if (value === undefined || value === null || value === '') return 'Pending';
  const count = Number(value);
  return Number.isFinite(count) ? count : 'Pending';
}

function eraLabel(pack) {
  return pack?.campaign?.eraLabel || (pack?.campaign?.openingYear ? String(pack.campaign.openingYear) : 'Era pending');
}

function playerRoleLabel(pack) {
  const role = pack?.playerRole || {};
  const rankAndBillet = [role.rank, role.billet].filter(Boolean).join(' / ');
  return rankAndBillet || role.label || 'Role pending';
}

function currentSave(campaign) {
  const saves = asArray(campaign?.saves);
  return saves.find((save) => save.current) || saves.find((save) => save.id === campaign?.activeSaveId) || null;
}

function selectedPackage(campaign) {
  const packages = asArray(campaign?.packages);
  const selected = packages.find((pack) => pack.packageId === activeLibraryPackageId)
    || packages.find((pack) => pack.selected)
    || packages[0]
    || null;
  activeLibraryPackageId = selected?.packageId || '';
  return selected;
}

function selectedSave(campaign) {
  const saves = asArray(campaign?.saves);
  const selected = saves.find((save) => save.id === activeRecordSaveId)
    || currentSave(campaign)
    || saves[0]
    || null;
  activeRecordSaveId = selected?.id || '';
  return selected;
}

function saveTime(save) {
  const timestamp = Date.parse(save?.updatedAt || save?.metadata?.lastUpdatedAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function saveSlotKind(save) {
  return String(save?.slotType || '').trim().toLowerCase();
}

function isAutosave(save) {
  return saveSlotKind(save) === 'autosave';
}

function saveBranchMetadata(save) {
  return save?.metadata?.branch || null;
}

function isTerminalTimelineSave(save) {
  return String(saveBranchMetadata(save)?.kind || '') === 'terminalTimeline';
}

function isBranchSave(save) {
  return Boolean(saveBranchMetadata(save));
}

function saveKindClass(save) {
  if (isTerminalTimelineSave(save)) return 'directive-starship-save-row-terminal directive-starship-save-row-user';
  return isAutosave(save) ? 'directive-starship-save-row-autosave' : 'directive-starship-save-row-user';
}

function saveSlotLabel(save) {
  if (save?.current) return 'Current Save';
  if (isTerminalTimelineSave(save)) return 'Terminal Timeline';
  if (isAutosave(save)) return 'Autosave';
  if (isBranchSave(save)) return 'Branch Save';
  if (saveSlotKind(save) === 'firstsave') return 'User Save';
  if (saveSlotKind(save) === 'manual') return 'User Save';
  return save?.slotType || 'Save';
}

function labelFromId(value, fallback = 'None') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text
    .split('.')
    .at(-1)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ') || fallback;
}

function saveMarkerIcon(save) {
  if (isTerminalTimelineSave(save)) return 'fa-solid fa-code-branch';
  if (isAutosave(save)) return 'fa-solid fa-clock-rotate-left';
  if (save?.current) return 'fa-solid fa-play';
  if (isBranchSave(save)) return 'fa-solid fa-code-branch';
  return 'fa-solid fa-floppy-disk';
}

function campaignFolderKeyForSave(save) {
  const metadata = save?.metadata || {};
  return String(metadata.campaignId || metadata.campaignTitle || metadata.packageId || 'campaign').trim() || 'campaign';
}

function campaignFolderTitleForSave(save) {
  const metadata = save?.metadata || {};
  return String(metadata.campaignTitle || metadata.packageTitle || 'Campaign').trim() || 'Campaign';
}

function groupSavesByCampaign(saves = []) {
  const groups = new Map();
  for (const save of asArray(saves)) {
    const id = campaignFolderKeyForSave(save);
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        title: campaignFolderTitleForSave(save),
        saves: [],
        updatedAt: 0,
        autosaveCount: 0,
        userSaveCount: 0
      });
    }
    const group = groups.get(id);
    group.saves.push(save);
    group.updatedAt = Math.max(group.updatedAt, saveTime(save));
    if (isAutosave(save)) group.autosaveCount += 1;
    else group.userSaveCount += 1;
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      saves: group.saves.slice().sort((a, b) => saveTime(b) - saveTime(a))
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title));
}

function visibleSavesFromGroups(groups = [], { includeCollapsed = true } = {}) {
  return groups.flatMap((group) => {
    if (!includeCollapsed && collapsedRecordCampaignIds.has(group.id)) return [];
    return group.saves;
  });
}

function normalizeRecordSelection(saves = []) {
  const ids = new Set(asArray(saves).map((save) => save.id).filter(Boolean));
  selectedRecordSaveIds = new Set([...selectedRecordSaveIds].filter((id) => ids.has(id)));
  if (activeRecordSaveId && !ids.has(activeRecordSaveId)) activeRecordSaveId = '';
  if (lastRecordSelectionAnchorId && !ids.has(lastRecordSelectionAnchorId)) lastRecordSelectionAnchorId = '';

  const fallback = saves.find((save) => save.current) || saves[0] || null;
  if (!activeRecordSaveId && fallback?.id) activeRecordSaveId = fallback.id;
  if (!selectedRecordSaveIds.size && activeRecordSaveId) selectedRecordSaveIds = new Set([activeRecordSaveId]);
  if (!lastRecordSelectionAnchorId && activeRecordSaveId) lastRecordSelectionAnchorId = activeRecordSaveId;
}

function selectedRecordSaves(saves = []) {
  const selectedIds = selectedRecordSaveIds;
  return asArray(saves).filter((save) => selectedIds.has(save.id));
}

function clearRecordNativeSelection() {
  const selection = typeof document !== 'undefined' && typeof document.getSelection === 'function'
    ? document.getSelection()
    : null;
  if (selection?.removeAllRanges) selection.removeAllRanges();
}

function suppressRecordRangeTextSelection(event) {
  if (!event?.shiftKey || event.defaultPrevented) return;
  if (event.button != null && event.button !== 0) return;
  event.preventDefault?.();
  try {
    event.currentTarget?.focus?.({ preventScroll: true });
  } catch (_error) {
    event.currentTarget?.focus?.();
  }
  clearRecordNativeSelection();
}

function handleRecordSaveSelection(save, event = null, visibleSaves = []) {
  const id = String(save?.id || '').trim();
  if (!id) return;
  const visibleIds = visibleSaves.map((entry) => entry.id).filter(Boolean);
  activeRecordSaveId = id;

  if (event?.shiftKey && visibleIds.length) {
    clearRecordNativeSelection();
    const anchor = visibleIds.includes(lastRecordSelectionAnchorId)
      ? lastRecordSelectionAnchorId
      : ([...selectedRecordSaveIds].find((selectedId) => visibleIds.includes(selectedId)) || id);
    const start = visibleIds.indexOf(anchor);
    const end = visibleIds.indexOf(id);
    if (start >= 0 && end >= 0) {
      const [from, to] = start <= end ? [start, end] : [end, start];
      selectedRecordSaveIds = new Set(visibleIds.slice(from, to + 1));
      lastRecordSelectionAnchorId = anchor;
    } else {
      selectedRecordSaveIds = new Set([id]);
      lastRecordSelectionAnchorId = id;
    }
  } else if (event?.ctrlKey || event?.metaKey) {
    const next = new Set(selectedRecordSaveIds);
    if (next.has(id) && next.size > 1) next.delete(id);
    else next.add(id);
    selectedRecordSaveIds = next;
    lastRecordSelectionAnchorId = id;
  } else {
    selectedRecordSaveIds = new Set([id]);
    lastRecordSelectionAnchorId = id;
  }
}

async function deleteSelectedCampaignSaves(saves = [], actions) {
  const targets = asArray(saves).filter((save) => save?.id);
  if (!targets.length || typeof actions?.deleteCampaignSave !== 'function') return;
  const confirmed = typeof globalThis.confirm === 'function'
    ? globalThis.confirm(targets.length === 1
      ? `Delete "${targets[0].name || 'this save'}" from Records? This removes the saved campaign state and cannot be undone.`
      : `Delete ${targets.length} selected saves from Records? This removes the saved campaign states and cannot be undone.`)
    : true;
  if (!confirmed) return;
  for (const save of targets) {
    await actions.deleteCampaignSave({ saveId: save.id });
  }
  selectedRecordSaveIds = new Set();
  activeRecordSaveId = '';
  lastRecordSelectionAnchorId = '';
  actions?.setActiveTab?.('campaign');
  await actions?.refresh?.();
}

function defaultRecordSaveAsName(campaign, fallbackSave = null) {
  const source = currentSave(campaign) || fallbackSave;
  if (source?.name) return `${source.name} Copy`;
  const metadata = source?.metadata || {};
  return `${metadata.campaignTitle || metadata.packageTitle || 'Campaign Save'} Copy`;
}

function closeRecordSaveAsDialog() {
  const overlay = document.querySelector?.('.directive-record-save-as-dialog-overlay')
    || document.body?.querySelector?.('.directive-record-save-as-dialog-overlay');
  overlay?.remove?.();
}

function openRecordSaveAsDialog({ defaultName = '', onSave } = {}) {
  if (typeof document === 'undefined' || typeof onSave !== 'function') return;
  closeRecordSaveAsDialog();

  const overlay = createElement('div', 'directive-record-save-as-dialog-overlay');
  const dialog = createElement('section', 'directive-record-save-as-dialog directive-lcars-panel');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Save Game As');

  const header = createElement('div', 'directive-record-save-as-dialog-header');
  const titleBlock = createElement('div');
  appendText(titleBlock, 'span', 'directive-lcars-kicker', 'Campaign Records');
  appendText(titleBlock, 'h3', 'directive-record-save-as-dialog-title', 'Save Game As');
  const closeButton = createButton({
    label: '',
    icon: 'fa-solid fa-xmark',
    className: 'directive-button directive-secondary-command directive-record-save-as-dialog-close',
    title: 'Cancel Save Game As',
    onClick: closeRecordSaveAsDialog
  });
  closeButton.setAttribute('aria-label', 'Cancel');
  header.append(titleBlock, closeButton);

  const field = createElement('label', 'directive-field directive-record-save-as-field');
  const fieldLabel = createElement('span', 'directive-field-label');
  fieldLabel.textContent = 'Save Name';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'directive-field-control directive-record-save-as-name-input';
  input.value = defaultName || '';
  input.setAttribute('autocomplete', 'off');
  field.append(fieldLabel, input);

  const actions = createElement('div', 'directive-record-save-as-dialog-actions');
  actions.append(
    createButton({
      label: 'Cancel',
      icon: 'fa-solid fa-xmark',
      className: 'directive-button directive-secondary-command',
      title: 'Cancel Save Game As',
      onClick: closeRecordSaveAsDialog
    }),
    createButton({
      label: 'Save',
      icon: 'fa-solid fa-floppy-disk',
      className: 'directive-button directive-primary-command',
      title: 'Create this save branch',
      onClick: async () => {
        const name = String(input.value || '').trim();
        if (!name) {
          input.classList.add('directive-field-control-invalid');
          input.focus?.();
          return;
        }
        input.classList.remove('directive-field-control-invalid');
        await onSave(name);
        closeRecordSaveAsDialog();
      }
    })
  );

  dialog.append(header, field, actions);
  overlay.appendChild(dialog);
  (document.body || document.documentElement)?.appendChild?.(overlay);
  input.focus?.();
  input.select?.();
}

async function saveCurrentGameFromRecords(actions) {
  if (typeof actions?.saveCurrentGame !== 'function') return;
  activeCampaignSection = 'directive-campaign-records-section';
  await actions.saveCurrentGame({ summary: 'Manual records save.' });
  actions?.setActiveTab?.('campaign');
  await actions?.refresh?.();
}

async function saveCurrentGameAsFromRecords(actions, name) {
  if (typeof actions?.saveCurrentGameAs !== 'function') return;
  activeCampaignSection = 'directive-campaign-records-section';
  await actions.saveCurrentGameAs({ name });
  actions?.setActiveTab?.('campaign');
  await actions?.refresh?.();
}

function latestCommandLogEntry(campaignState) {
  const entries = asArray(campaignState?.commandLog?.entries);
  return entries.at(-1) || null;
}

function parseJsonText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function playerFacingSummary(value) {
  const parsed = parseJsonText(value);
  if (parsed) {
    return parsed.summary
      || parsed.title
      || asArray(parsed.highlights)[0]
      || asArray(parsed.visibleConsequences)[0]
      || '';
  }
  if (typeof value === 'string' && value.trim().startsWith('{')) return '';
  return value;
}

function commandLogSummary(entry) {
  if (!entry) return 'No committed command-log entry yet.';
  const assisted = typeof entry.assistedSummary === 'string'
    ? parseJsonText(entry.assistedSummary)
    : entry.assistedSummary;
  const nestedSummary = assisted?.summary ? playerFacingSummary(assisted.summary) : '';
  return compactText(
    nestedSummary
      || assisted?.summary
      || assisted?.title
      || playerFacingSummary(entry.summary)
      || entry.summaryInputs?.[0]
      || asArray(entry.visibleConsequences)[0],
    'Committed outcome recorded.'
  );
}

function openWorldSummary(view, campaignState) {
  const openWorld = view?.openWorld || {};
  const foregroundId = openWorld.foregroundQuestId
    || campaignState?.questLedger?.foregroundQuestId
    || campaignState?.attentionState?.foregroundQuestId;
  const quests = asArray(openWorld.quests);
  const foreground = quests.find((quest) => quest.id === foregroundId);
  if (foreground) return foreground.title || foreground.id;
  const available = quests.find((quest) => ['available', 'offered', 'accepted', 'active', 'delegated'].includes(String(quest.status || '').toLowerCase()));
  if (available) return available.title || available.id;
  return 'No foreground quest';
}

function appendText(container, tagName, className, text) {
  const element = createElement(tagName, className);
  element.textContent = text;
  container.appendChild(element);
  return element;
}

function packageCommands(pack, actions) {
  return {
    start: {
      label: 'New Campaign',
      icon: 'fa-solid fa-wand-magic-sparkles',
      tourTarget: 'campaign.start',
      title: pack.actions?.startNewCampaign ? 'Start a new campaign by opening Character Creator' : 'Runtime assets are incomplete',
      disabled: !pack.actions?.startNewCampaign,
      onClick: async () => {
        await actions.startCreatorDraft({ packageId: pack.packageId });
        await actions.refresh();
      }
    },
    resume: pack.actions?.resumeDraft ? {
      label: 'Continue Character Setup',
      icon: 'fa-solid fa-user-pen',
      tourTarget: 'campaign.continue',
      title: 'Continue the unfinished Character Creator setup',
      onClick: async () => {
        await actions.resumeCreatorDraft({ draftId: pack.actions.resumeDraft });
        await actions.refresh();
      }
    } : null,
    load: pack.actions?.loadLatestSave ? {
      label: 'Load Save',
      icon: 'fa-solid fa-folder-open',
      tourTarget: 'campaign.load',
      title: 'Load the latest campaign save',
      onClick: async () => {
        await actions.loadGame({ saveId: pack.actions.loadLatestSave });
        actions.setActiveTab('mission');
        await actions.refresh();
      }
    } : null
  };
}

function createCommandEmptyState(campaign, onOpenLibrary, onOpenRecords) {
  const shell = createCard('directive-starship-command-snapshot directive-lcars-panel directive-starship-command-empty-state');
  const copy = createElement('div', 'directive-starship-command-empty-copy');
  appendText(copy, 'span', 'directive-lcars-kicker', 'No Campaign Loaded');
  appendText(copy, 'strong', 'directive-starship-command-title', 'Choose a campaign package or load a save.');
  appendText(copy, 'p', 'directive-starship-command-summary', 'Directive will manage structured state here. The live campaign continues through Mission and the active chat once a save is loaded or a new commander is created.');
  const actionsRow = createElement('div', 'directive-starship-command-actions');
  actionsRow.append(
    createActionButton({ label: 'Choose Campaign', icon: 'fa-solid fa-list', tourTarget: 'campaign.choose', onClick: onOpenLibrary }, 'directive-primary-command'),
    createActionButton({
      label: 'Load Save',
      icon: 'fa-solid fa-folder-open',
      tourTarget: 'campaign.load',
      disabled: !asArray(campaign?.saves).length,
      onClick: onOpenRecords
    }, 'directive-secondary-command')
  );
  shell.append(copy, actionsRow);
  return shell;
}

function createCommandShipBackdrop(view, ship = {}, save = null) {
  const packageData = view?.activePackage || null;
  const label = ship.name || packageData?.ship?.name || save?.metadata?.shipName || 'Active starship';
  return createPackageImage(packageData, {
    kind: 'ship.hero',
    subjectId: ship.id || packageData?.ship?.id || save?.metadata?.shipId || 'active-starship',
    variant: 'hero'
  }, {
    wrapperClass: 'directive-starship-command-backdrop',
    className: 'directive-starship-command-backdrop-image',
    label,
    icon: 'fa-solid fa-shuttle-space',
    loading: 'eager'
  });
}

function packageIdFromPackageData(packageData = null) {
  return packageData?.packageId
    || packageData?.manifest?.id
    || packageData?.package?.id
    || packageData?.sourcePackage?.packageId
    || null;
}

function packageDataForSession(view, session = {}) {
  const packageId = session.packageId || '';
  const candidates = [
    view?.currentChatActivePackage,
    view?.activePackage
  ].filter(Boolean);
  return candidates.find((packageData) => packageId && packageIdFromPackageData(packageData) === packageId)
    || candidates[0]
    || null;
}

function createCommandSessionBackdrop(session, view) {
  const packageData = packageDataForSession(view, session);
  const label = packageData?.locations?.find?.((location) => location.id === 'asterion-station')?.name || 'Asterion Station';
  return createPackageImage(packageData, {
    kind: 'location.hero',
    subjectId: 'asterion-station',
    variant: 'hero'
  }, {
    wrapperClass: 'directive-starship-command-backdrop directive-campaign-session-backdrop',
    className: 'directive-starship-command-backdrop-image directive-campaign-session-backdrop-image',
    label,
    icon: 'fa-solid fa-shuttle-space',
    loading: 'lazy'
  });
}

function createCommandSessionHeroVisual(session, view) {
  const packageData = packageDataForSession(view, session);
  const label = session.shipName || packageData?.ship?.name || 'Campaign starship';
  const visual = createPackageImage(packageData, {
    kind: 'ship.hero',
    subjectId: packageData?.ship?.id || session.shipId || 'campaign-starship',
    variant: 'card'
  }, {
    wrapperClass: 'directive-campaign-session-hero-visual',
    className: 'directive-campaign-session-hero-image',
    label,
    icon: 'fa-solid fa-shuttle-space',
    loading: 'lazy'
  });
  const caption = createElement('figcaption', 'directive-campaign-session-hero-caption');
  appendText(caption, 'span', 'directive-lcars-kicker', session.packageTitle || 'Campaign Package');
  appendText(caption, 'strong', 'directive-campaign-session-hero-title', label);
  appendText(caption, 'span', 'directive-campaign-session-hero-subtitle', commandSessionHeroSubtitle(session, view));
  visual.appendChild(caption);
  return visual;
}

function campaignChatLabel(view) {
  const binding = view?.chatNative?.binding || {};
  return binding.chatName || binding.name || binding.chatId || 'Not bound';
}

function openingSceneStatus(view) {
  return view?.chatNative?.openingScene || null;
}

function openingSceneLabel(view) {
  const status = openingSceneStatus(view);
  if (!status) return 'Unknown';
  if (status.ready) return 'Posted';
  if (status.reason === 'activation-incomplete') return 'Setup incomplete';
  if (/failed/i.test(status.reason || '')) return 'Build failed';
  return 'Required';
}

async function buildOpeningScene(actions) {
  const action = actions?.buildCampaignOpeningScene || actions?.retryCampaignActivation;
  if (typeof action !== 'function') return null;
  return action();
}

function createOpeningSceneNotice(view, actions = {}) {
  const status = openingSceneStatus(view);
  if (!status?.blocked) return null;
  const notice = createElement('article', `directive-starship-save-summary directive-starship-save-guard directive-status-${statusTone(openingSceneLabel(view))}`);
  appendText(notice, 'span', 'directive-lcars-kicker', 'Opening Scene Required');
  appendText(notice, 'p', '', status.summary || 'The campaign needs its opening scene before play can continue.');
  const actionRow = createElement('div', 'directive-starship-save-guard-actions');
  actionRow.appendChild(createButton({
    label: status.actionLabel || 'Build Opening Scene',
    icon: status.reason === 'activation-incomplete' ? 'fa-solid fa-play' : 'fa-solid fa-wand-magic-sparkles',
    className: 'directive-button directive-primary-command directive-starship-record-action',
    title: status.summary || 'Build the campaign opening scene',
    disabled: typeof (actions?.buildCampaignOpeningScene || actions?.retryCampaignActivation) !== 'function',
    onClick: async () => {
      await buildOpeningScene(actions);
      await actions?.refresh?.();
    }
  }));
  notice.appendChild(actionRow);
  return notice;
}

function activationLabel(view, state) {
  const openingScene = openingSceneStatus(view);
  if (openingScene?.blocked) return openingSceneLabel(view);
  const activation = view?.chatNative?.activation || {};
  if (state?.campaign?.status === 'active') return 'Active';
  if (state?.campaign?.status === 'concluding') return 'Finalizing';
  if (state?.campaign?.status === 'complete') return 'Complete';
  if (state?.campaign?.status === 'archived') return 'Archived';
  if (activation.status === 'failed') return 'Recovery required';
  if (state?.campaign?.status === 'activating') return 'Activating';
  return formatMissionLabel(state?.campaign?.status, 'Pending');
}

function activationRecoveryCommand(view, state) {
  const openingScene = openingSceneStatus(view);
  if (openingScene?.blocked) {
    return {
      label: openingScene.actionLabel || 'Build Opening Scene',
      icon: openingScene.reason === 'activation-incomplete' ? 'fa-solid fa-play' : 'fa-solid fa-wand-magic-sparkles',
      title: openingScene.summary || 'Build the campaign opening scene before play can continue.'
    };
  }
  const failed = view?.chatNative?.activation?.status === 'failed'
    || state?.campaign?.status === 'activationFailed';
  return {
    label: failed ? 'Retry Chat Setup' : 'Finish Chat Setup',
    icon: failed ? 'fa-solid fa-rotate-right' : 'fa-solid fa-play',
    title: failed
      ? 'Retry campaign chat setup without duplicating completed activation steps'
      : 'Finish campaign chat setup: create or open the bound chat, post the intro once, and install prompt context'
  };
}

function promptContextLabel(view) {
  const prompt = view?.chatNative?.prompt || view?.promptInspection || {};
  const revision = prompt.revision ?? prompt.promptContextRevision ?? view?.chatNative?.binding?.promptContextRevision;
  if (prompt.active === false || prompt.installed === false) return 'Suspended';
  if (revision !== undefined && revision !== null) return `Revision ${revision}`;
  return view?.chatNative?.binding?.chatId ? 'Installed' : 'Not installed';
}

function allowedSimulationModesForCampaign(view, state) {
  const rawModes = Array.isArray(state?.settings?.allowedSimulationModes) && state.settings.allowedSimulationModes.length
    ? state.settings.allowedSimulationModes
    : view?.currentChatActivePackage?.simulationModes || view?.activePackage?.simulationModes;
  return (Array.isArray(rawModes) && rawModes.length ? rawModes : ['Exploration', 'Command']);
}

function removeCampaignDifficultyDialog() {
  const overlay = document.querySelector?.('.directive-campaign-difficulty-dialog-overlay')
    || document.body?.querySelector?.('.directive-campaign-difficulty-dialog-overlay');
  overlay?.remove?.();
}

function createCampaignDifficultyOptionButton(option, selectedMode, onSelect) {
  const button = createElement('button', `directive-campaign-difficulty-option${option.mode === selectedMode ? ' directive-campaign-difficulty-option-active' : ''}`);
  button.type = 'button';
  button.dataset.campaignDifficultyOption = option.mode;
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', option.mode === selectedMode ? 'true' : 'false');
  const label = createElement('strong');
  label.textContent = option.label;
  const badge = createElement('span', 'directive-campaign-difficulty-option-badge');
  badge.textContent = option.difficultyLabel;
  const policy = createElement('span', 'directive-campaign-difficulty-option-policy');
  policy.textContent = option.fatalityPolicy;
  button.append(label, badge, policy);
  button.addEventListener('click', () => onSelect(option.mode));
  return button;
}

function appendCampaignDifficultySummary(container, option) {
  clearElement(container);
  appendText(container, 'span', 'directive-lcars-kicker', 'Selected Mode Summary');
  appendText(container, 'strong', 'directive-campaign-difficulty-summary-title', option.label);
  appendText(container, 'span', 'directive-campaign-difficulty-summary-badge', option.difficultyLabel);
  appendText(container, 'p', 'directive-campaign-difficulty-summary-copy', option.summary);
  appendText(container, 'p', 'directive-campaign-difficulty-best-fit', option.bestFit);
  appendText(container, 'span', 'directive-campaign-difficulty-fatality', option.fatalityPolicy);
}

function openCampaignDifficultyDialog(view, state, actions) {
  removeCampaignDifficultyDialog();
  const currentMode = normalizeSimulationMode(state.settings?.simulationMode);
  const options = simulationModeDifficultyOptions(allowedSimulationModesForCampaign(view, state));
  let selectedMode = options.some((option) => option.mode === currentMode) ? currentMode : options[0]?.mode || 'Command';
  const pendingOutcome = Boolean(view?.pendingDirectorTurn || view?.pendingOutcomeReplacement);

  const overlay = createElement('div', 'directive-campaign-difficulty-dialog-overlay');
  const dialog = createElement('section', 'directive-campaign-difficulty-dialog directive-lcars-panel');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Change Campaign Difficulty');

  const header = createElement('div', 'directive-campaign-difficulty-dialog-header');
  const titleBlock = createElement('div');
  appendText(titleBlock, 'span', 'directive-lcars-kicker', 'Campaign Control');
  appendText(titleBlock, 'h3', 'directive-campaign-difficulty-dialog-title', 'Change Campaign Difficulty');
  appendText(titleBlock, 'p', 'directive-campaign-difficulty-dialog-copy', 'Applies to future outcomes only. Existing Command Log entries and committed consequences are not rewritten.');
  header.append(
    titleBlock,
    createButton({
      label: '',
      icon: 'fa-solid fa-xmark',
      className: 'directive-icon-button directive-campaign-difficulty-dialog-close',
      title: 'Close Campaign Difficulty',
      onClick: removeCampaignDifficultyDialog
    })
  );

  const body = createElement('div', 'directive-campaign-difficulty-dialog-body');
  const rail = createElement('div', 'directive-campaign-difficulty-dialog-options');
  rail.setAttribute('role', 'radiogroup');
  rail.setAttribute('aria-label', 'Campaign Difficulty');
  const summary = createElement('article', 'directive-campaign-difficulty-dialog-summary');
  summary.setAttribute('aria-live', 'polite');
  const message = createElement('p', 'directive-campaign-difficulty-dialog-message');
  message.setAttribute('role', 'status');
  message.hidden = !pendingOutcome;
  message.textContent = pendingOutcome
    ? 'Resolve or discard the pending outcome before changing campaign difficulty.'
    : '';

  const buttons = [];
  const sync = (mode) => {
    selectedMode = normalizeSimulationMode(mode);
    for (const button of buttons) {
      const active = button.dataset.campaignDifficultyOption === selectedMode;
      button.classList.toggle('directive-campaign-difficulty-option-active', active);
      button.setAttribute('aria-checked', active ? 'true' : 'false');
    }
    appendCampaignDifficultySummary(
      summary,
      options.find((option) => option.mode === selectedMode) || options[0]
    );
  };

  for (const option of options) {
    const button = createCampaignDifficultyOptionButton(option, selectedMode, sync);
    rail.appendChild(button);
    buttons.push(button);
  }
  sync(selectedMode);
  body.append(rail, summary, message);

  const footer = createElement('footer', 'directive-campaign-difficulty-dialog-actions');
  footer.append(
    createButton({
      label: 'Cancel',
      icon: 'fa-solid fa-xmark',
      className: 'directive-button directive-secondary-command',
      title: 'Cancel difficulty change',
      onClick: removeCampaignDifficultyDialog
    }),
    createButton({
      label: 'Apply',
      icon: 'fa-solid fa-check',
      className: 'directive-button directive-primary-command',
      title: pendingOutcome ? 'Resolve or discard the pending outcome before changing campaign difficulty' : 'Apply campaign difficulty',
      disabled: pendingOutcome || typeof actions.updateCampaignDifficulty !== 'function',
      onClick: async () => {
        message.hidden = true;
        message.textContent = '';
        if (currentMode === 'Exploration' && selectedMode === 'Command') {
          const proceed = typeof globalThis.confirm === 'function'
            ? globalThis.confirm('Switch to Command difficulty? Future outcomes may use full causal severity, including severe or fatal consequences when clearly established.')
            : true;
          if (!proceed) return;
        }
        try {
          await actions.updateCampaignDifficulty({
            simulationMode: selectedMode,
            reason: 'player-campaign-command-control'
          });
          removeCampaignDifficultyDialog();
          await actions.refresh();
        } catch (error) {
          message.textContent = error?.message || 'Campaign difficulty could not be changed.';
          message.hidden = false;
        }
      }
    })
  );

  dialog.append(header, body, footer);
  overlay.appendChild(dialog);
  appendDirectiveOverlay(overlay, { fallbackParent: document.body || document.documentElement });
}

function createCampaignDifficultyBlock(view, state, actions) {
  const currentMode = normalizeSimulationMode(state.settings?.simulationMode);
  const option = simulationModeDifficultyOption(currentMode);
  const block = createElement('div', 'directive-campaign-difficulty-block directive-lcars-status-block directive-status-neutral');
  const iconFrame = createElement('span', 'directive-lcars-status-icon');
  iconFrame.appendChild(createIcon('fa-solid fa-sliders'));
  const copy = createElement('span', 'directive-lcars-status-copy directive-campaign-difficulty-copy');
  appendText(copy, 'span', 'directive-lcars-status-label', 'Campaign Difficulty');
  appendText(copy, 'strong', 'directive-lcars-status-value', option.label);
  appendText(copy, 'span', 'directive-campaign-difficulty-inline-summary', option.difficultyLabel);
  const change = createButton({
    label: 'Change',
    icon: 'fa-solid fa-sliders',
    className: 'directive-button directive-campaign-difficulty-change-command',
    title: 'Change this campaign difficulty for future outcomes',
    disabled: typeof actions.updateCampaignDifficulty !== 'function',
    onClick: () => openCampaignDifficultyDialog(view, state, actions)
  });
  block.append(iconFrame, copy, change);
  addTooltip(block, 'Campaign-level consequence style. It affects future risk and outcomes, not prior Command Log entries.');
  return block;
}

function createCommandSnapshot(campaignView, view, actions, onOpenRecords) {
  const state = view?.campaignState || {};
  const mission = state.mission || {};
  const campaign = state.campaign || {};
  const ship = state.ship || {};
  const player = state.player || {};
  const save = currentSave(campaignView);
  const logEntry = latestCommandLogEntry(state);
  const shell = createCard('directive-starship-command-snapshot directive-lcars-panel');
  shell.dataset.directiveTour = 'campaign.session';
  shell.appendChild(createCommandShipBackdrop(view, ship, save));

  const header = createElement('header', 'directive-starship-command-snapshot-header');
  const identity = createElement('div', 'directive-starship-command-identity');
  appendText(identity, 'span', 'directive-lcars-kicker', 'Active Campaign');
  appendText(identity, 'strong', 'directive-starship-command-title', campaign.title || save?.metadata?.campaignTitle || 'Campaign');
  appendText(identity, 'span', 'directive-starship-command-subtitle', `${player.name || 'Player Commander'} aboard ${ship.name || save?.metadata?.shipName || 'active ship'}`);
  const openMission = createActionButton({
    label: 'Open Campaign Chat',
    icon: 'fa-solid fa-comments',
    tourTarget: 'campaign.open-chat',
    title: 'Open the chat bound to this campaign',
    disabled: !view?.chatNative?.binding?.chatId || typeof actions.openCampaignChat !== 'function',
    onClick: async () => {
      await actions.openCampaignChat();
      await actions.refresh();
    }
  }, 'directive-primary-command directive-starship-open-chat-command');
  header.append(identity, openMission);
  shell.appendChild(header);

  const statusGrid = createElement('div', 'directive-campaign-overview directive-starship-command-status-grid');
  const stardateBlock = createStatusBlock('Stardate', formatStardate(campaign.currentStardate ?? save?.metadata?.stardate), 'success', 'fa-solid fa-clock', 'In-fiction campaign time used by saves, mission context, and command history.');
  stardateBlock.dataset.directiveTour = 'campaign.stardate';
  const missionBlock = createStatusBlock('Mission', formatMissionLabel(mission.activeMissionId || save?.metadata?.activeMissionId), 'neutral', 'fa-solid fa-map', 'The active chapter or mission package currently driving play.');
  missionBlock.dataset.directiveTour = 'campaign.mission';
  const phaseBlock = createStatusBlock('Phase', formatMissionLabel(mission.activePhaseId || save?.metadata?.activePhaseId, 'Pending'), 'neutral', 'fa-solid fa-location-crosshairs', 'The current beat inside the active mission. Pending means no mission beat is committed yet.');
  phaseBlock.dataset.directiveTour = 'campaign.phase';
  const difficultyBlock = createCampaignDifficultyBlock(view, state, actions);
  difficultyBlock.dataset.directiveTour = 'campaign.difficulty';
  const chatBlock = createStatusBlock('Campaign Chat', campaignChatLabel(view), view?.chatNative?.binding?.chatId ? 'success' : 'warning', 'fa-solid fa-comments', 'The host chat bound to this campaign. Play continues there instead of inside this drawer.');
  chatBlock.dataset.directiveTour = 'campaign.chat-binding';
  const activationBlock = createStatusBlock('Activation', activationLabel(view, state), statusTone(activationLabel(view, state)), 'fa-solid fa-power-off', 'Whether the campaign has completed first-start setup and mounted its save, chat binding, and prompt context.');
  activationBlock.dataset.directiveTour = 'campaign.activation';
  const openingBlock = createStatusBlock('Opening Scene', openingSceneLabel(view), statusTone(openingSceneLabel(view)), 'fa-solid fa-scroll', 'Campaign play requires a posted opening scene in the bound host chat.');
  openingBlock.dataset.directiveTour = 'campaign.opening-scene';
  const promptBlock = createStatusBlock('Prompt Context', promptContextLabel(view), statusTone(promptContextLabel(view)), 'fa-solid fa-layer-group', 'Player-safe campaign context currently installed into the bound host chat prompt.');
  promptBlock.dataset.directiveTour = 'campaign.prompt-context';
  statusGrid.append(
    stardateBlock,
    missionBlock,
    phaseBlock,
    difficultyBlock,
    chatBlock,
    activationBlock,
    openingBlock,
    promptBlock
  );
  const openWorld = openWorldSummary(view, state);
  if (openWorld && openWorld !== 'No foreground quest') {
    const openWorldBlock = createStatusBlock('Open World', openWorld, 'warning', 'fa-solid fa-compass', 'Foreground open-world or side-work thread currently available to pursue.');
    openWorldBlock.dataset.directiveTour = 'campaign.open-world';
    statusGrid.appendChild(openWorldBlock);
  }
  shell.appendChild(statusGrid);

  const openingNotice = createOpeningSceneNotice(view, actions);
  if (openingNotice) shell.appendChild(openingNotice);

  const briefing = createElement('div', 'directive-starship-command-briefing');
  const last = createElement('article', 'directive-starship-command-brief-card');
  appendText(last, 'span', 'directive-lcars-kicker', 'Last Playable Moment');
  appendText(last, 'p', '', commandLogSummary(logEntry));
  const saveCard = createElement('article', 'directive-starship-command-brief-card');
  saveCard.dataset.directiveTour = 'campaign.active-save';
  appendText(saveCard, 'span', 'directive-lcars-kicker', 'Active Save');
  appendText(saveCard, 'strong', '', save?.name || 'No active save name');
  appendText(saveCard, 'span', '', save ? formatTime(save.updatedAt) : 'State has not been saved in this session.');
  briefing.append(last, saveCard);
  shell.appendChild(briefing);

  const footer = createElement('footer', 'directive-starship-command-footer');
  footer.append(
    createActionButton({
      label: 'Mission Review',
      icon: 'fa-solid fa-list-check',
      tourTarget: 'campaign.mission-review',
      title: 'Review active context, pending decisions, side work, and recovery',
      onClick: async () => {
        actions.setActiveTab('mission');
        await actions.refresh();
      }
    }, 'directive-secondary-command'),
    createActionButton({
      label: 'View Records',
      icon: 'fa-solid fa-box-archive',
      tourTarget: 'campaign.records.open',
      title: 'Open campaign saves and branch records',
      onClick: onOpenRecords
    }, 'directive-secondary-command'),
    createActionButton({
      label: 'Rebuild Prompt',
      icon: 'fa-solid fa-arrows-rotate',
      tourTarget: 'campaign.rebuild-prompt',
      title: 'Rebuild player-safe prompt context from authoritative campaign state',
      disabled: typeof actions.rebuildPromptContext !== 'function' || !view?.chatNative?.binding?.chatId,
      onClick: async () => {
        await actions.rebuildPromptContext();
        await actions.refresh();
      }
    }, 'directive-secondary-command'),
    createActionButton({
      label: 'Rebind Chat',
      icon: 'fa-solid fa-link',
      tourTarget: 'campaign.rebind-chat',
      title: 'Rebind this campaign to the currently open host chat and rebuild prompt context',
      disabled: typeof actions.rebindCampaignChat !== 'function',
      onClick: async () => {
        const proceed = typeof globalThis.confirm === 'function'
          ? globalThis.confirm('Rebind this campaign to the currently open chat? Directive will use this chat for future campaign turns and prompt context.')
          : true;
        if (!proceed) return;
        await actions.rebindCampaignChat();
        await actions.refresh();
      }
    }, 'directive-secondary-command')
  );

  if (openingSceneStatus(view)?.blocked || ['activating', 'activationFailed'].includes(state.campaign?.status) || view?.chatNative?.activation?.status === 'failed') {
    const recoveryCommand = activationRecoveryCommand(view, state);
    footer.appendChild(createActionButton({
      label: recoveryCommand.label,
      icon: recoveryCommand.icon,
      tourTarget: 'campaign.activation-retry',
      title: recoveryCommand.title,
      disabled: typeof (actions?.buildCampaignOpeningScene || actions?.retryCampaignActivation) !== 'function',
      onClick: async () => {
        await buildOpeningScene(actions);
        await actions.refresh();
      }
    }, 'directive-primary-command'));
  }

  if (['concluding', 'complete'].includes(state.campaign?.status) && state.conclusion?.recapStatus !== 'complete') {
    footer.appendChild(createActionButton({
      label: 'Retry Conclusion',
      icon: 'fa-solid fa-rotate-right',
      tourTarget: 'campaign.conclusion.retry',
      title: 'Retry final narration or chat posting without rerunning committed campaign mechanics',
      disabled: typeof actions.concludeCampaign !== 'function',
      onClick: async () => {
        await actions.concludeCampaign({
          type: state.conclusion?.type || state.campaign?.completionType || 'authoredCompletion',
          reason: state.conclusion?.reason || state.campaign?.completionReason || 'The campaign reached its conclusion.'
        });
        await actions.refresh();
      }
    }, 'directive-primary-command'));
  } else if (state.campaign?.status === 'complete') {
    footer.appendChild(createActionButton({
      label: 'Archive Campaign',
      icon: 'fa-solid fa-box-archive',
      tourTarget: 'campaign.conclusion.archive',
      title: 'Archive the completed campaign without deleting its save record',
      disabled: typeof actions.archiveCompletedCampaign !== 'function',
      onClick: async () => {
        await actions.archiveCompletedCampaign();
        await actions.refresh();
      }
    }, 'directive-secondary-command'));
  } else if (state.campaign?.status === 'active') {
    footer.appendChild(createActionButton({
      label: 'Conclude Campaign',
      icon: 'fa-solid fa-flag-checkered',
      tourTarget: 'campaign.conclusion',
      title: 'Commit a final scene, recap, and completed campaign save',
      disabled: typeof actions.concludeCampaign !== 'function',
      onClick: async () => {
        const proceed = typeof globalThis.confirm === 'function'
          ? globalThis.confirm('Conclude this campaign and mark the active save complete?')
          : true;
        if (!proceed) return;
        await actions.concludeCampaign({
          type: 'playerChoice',
          reason: 'The player chose to conclude the campaign.'
        });
        await actions.refresh();
      }
    }, 'directive-secondary-command'));
  }
  shell.appendChild(footer);
  return shell;
}

function commandSessionSearchText(session = {}) {
  return [
    session.campaignTitle,
    session.playerName,
    session.shipName,
    session.binding?.chatName,
    session.binding?.chatId,
    session.packageTitle,
    session.saveName,
    session.summary
  ].filter(Boolean).join(' ').toLowerCase();
}

function commandSessionMatchesSearch(session, query) {
  const text = String(query || '').trim().toLowerCase();
  if (!text) return true;
  return commandSessionSearchText(session).includes(text);
}

function commandSessionIsSelectedChat(session = {}, view = null) {
  if (typeof session.currentChat === 'boolean') return session.currentChat;
  const boundChatId = String(session.binding?.chatId || '').trim();
  const selectedChatId = String(view?.currentChat?.chatId || '').trim();
  if (boundChatId && selectedChatId) return boundChatId === selectedChatId;
  if (view?.currentChat && !selectedChatId) return false;
  return false;
}

function commandSessionStatusLabel(session = {}, view = null) {
  if (commandSessionIsSelectedChat(session, view)) return 'Current Chat';
  if (session.attention === 'missing-chat') return 'Needs Chat';
  return formatMissionLabel(session.status || session.slotType || 'Stored', 'Stored');
}

function commandSessionTone(session = {}, view = null) {
  if (commandSessionIsSelectedChat(session, view)) return 'success';
  if (session.attention) return 'warning';
  return statusTone(session.status || session.slotType);
}

function commandSessionChatLabel(session = {}) {
  return session.binding?.chatName || session.binding?.chatId || 'No bound chat';
}

function commandSessionHeroSubtitle(session = {}, view = null) {
  if (session.binding?.chatId) return commandSessionChatLabel(session);
  return commandSessionStatusLabel(session, view);
}

function createCommandSessionBadge(label, tone = 'neutral') {
  const badge = createElement('span', `directive-campaign-session-badge directive-status-${tone}`);
  badge.textContent = label;
  return badge;
}

function createCommandSessionMetaTile(label, value, tone = 'neutral', tooltip = '') {
  const tile = createElement('div', `directive-campaign-session-fact directive-status-${tone}`);
  const key = createElement('span', 'directive-campaign-session-fact-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-campaign-session-fact-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  tile.append(key, content);
  if (tooltip) addTooltip(tile, tooltip);
  return tile;
}

function createCommandSessionDifficultyTile(session, view, actions) {
  const option = simulationModeDifficultyOption(session.simulationMode || 'Command');
  const tile = createElement('div', 'directive-campaign-session-fact directive-campaign-session-difficulty-fact directive-status-neutral');
  const key = createElement('span', 'directive-campaign-session-fact-label');
  key.textContent = 'Campaign Difficulty';
  const value = createElement('strong', 'directive-campaign-session-fact-value');
  value.textContent = option.label;
  const summary = createElement('span', 'directive-campaign-session-difficulty-summary');
  summary.textContent = option.difficultyLabel;
  tile.append(key, value, summary);
  const state = {
    settings: {
      simulationMode: option.mode,
      allowedSimulationModes: ['Exploration', 'Command']
    }
  };
  if (session.current && typeof actions.updateCampaignDifficulty === 'function') {
    tile.appendChild(createButton({
      label: 'Change',
      icon: 'fa-solid fa-sliders',
      className: 'directive-button directive-campaign-session-difficulty-change',
      title: 'Change this loaded campaign difficulty for future outcomes',
      onClick: () => openCampaignDifficultyDialog(view, state, actions)
    }));
    addTooltip(tile, 'Current loaded campaign difficulty. Changes affect future outcomes only.');
  } else {
    const hint = createElement('span', 'directive-campaign-session-difficulty-hint');
    hint.textContent = 'Load save to change';
    tile.appendChild(hint);
    addTooltip(tile, 'Campaign Difficulty is changed at the campaign level after this save is loaded.');
  }
  return tile;
}

function createCommandSessionRow(session, view, actions, onOpenRecords, { collapseByDefault = false } = {}) {
  const key = session.key || `${session.campaignId || 'campaign'}:${session.saveId || 'save'}`;
  const expanded = expandedCommandSessionKeys.has(key);
  const collapsed = collapseByDefault && !expanded && !session.current;
  const selectedChat = commandSessionIsSelectedChat(session, view);
  const difficultyOption = simulationModeDifficultyOption(session.simulationMode || 'Command');
  const row = createElement('article', `directive-campaign-session-row directive-lcars-panel${selectedChat ? ' directive-campaign-session-current' : ''}${session.hidden ? ' directive-campaign-session-hidden' : ''}`);
  row.dataset.campaignSessionKey = key;
  row.dataset.directiveTour = 'campaign.session campaign.session-row';

  const summary = createElement('header', 'directive-campaign-session-summary');
  const toggle = createElement('button', 'directive-campaign-session-toggle directive-secondary-command');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  toggle.appendChild(createIcon(collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'));
  addTooltip(toggle, collapsed ? 'Expand campaign' : 'Collapse campaign');
  const titleBlock = createElement('div', 'directive-campaign-session-titleblock');
  appendText(titleBlock, 'span', 'directive-lcars-kicker', session.packageTitle || 'Campaign');
  appendText(titleBlock, 'strong', 'directive-campaign-session-title', session.campaignTitle || 'Campaign');
  appendText(titleBlock, 'span', 'directive-campaign-session-subtitle', `${session.playerName || 'Player Commander'} aboard ${session.shipName || 'assigned ship'}`);
  const meta = createElement('div', 'directive-campaign-session-meta');
  const statusBadge = createCommandSessionBadge(commandSessionStatusLabel(session, view), commandSessionTone(session, view));
  statusBadge.dataset.directiveTour = 'campaign.activation';
  const chatBadge = createCommandSessionBadge(commandSessionChatLabel(session), session.binding?.chatId ? 'success' : 'warning');
  chatBadge.dataset.directiveTour = 'campaign.chat-binding';
  const difficultyBadge = createCommandSessionBadge(`Difficulty: ${difficultyOption.label}`, 'neutral');
  difficultyBadge.dataset.directiveTour = 'campaign.difficulty';
  const updatedBadge = createCommandSessionBadge(formatTime(session.updatedAt), 'neutral');
  updatedBadge.dataset.directiveTour = 'campaign.updated';
  meta.append(
    statusBadge,
    chatBadge,
    difficultyBadge,
    updatedBadge
  );
  summary.append(toggle, titleBlock, meta);

  const details = createElement('div', 'directive-campaign-session-details');
  details.hidden = collapsed;
  details.appendChild(createCommandSessionBackdrop(session, view));
  const startScreen = createElement('section', 'directive-campaign-session-start-screen');
  const facts = createElement('div', 'directive-campaign-session-facts');
  facts.append(
    createCommandSessionMetaTile('Latest Save', session.saveName || 'Stored save', 'neutral', 'Newest save for this campaign, including autosaves.'),
    createCommandSessionMetaTile('Saves', `${Number(session.saveCount || 0)} total`, 'neutral', 'Individual saves and branches remain available in Records.'),
    createCommandSessionMetaTile('Mission', formatMissionLabel(session.activeMissionId), 'neutral', 'Indexed active mission from the latest save.'),
    createCommandSessionMetaTile('Phase', formatMissionLabel(session.activePhaseId, 'Pending'), 'neutral', 'Indexed mission phase from the latest save.'),
    createCommandSessionMetaTile('Stardate', formatStardate(session.stardate), 'success', 'Last indexed in-fiction campaign time.'),
    createCommandSessionDifficultyTile(session, view, actions)
  );
  const brief = createElement('p', 'directive-campaign-session-brief');
  brief.textContent = compactText(session.summary, 'No player-safe session summary is indexed yet.', 280);
  const copy = createElement('div', 'directive-campaign-session-start-copy');
  const copyHeader = createElement('div', 'directive-campaign-session-start-header');
  appendText(copyHeader, 'span', 'directive-lcars-kicker', selectedChat ? 'Current Campaign' : 'Command Snapshot');
  appendText(copyHeader, 'strong', 'directive-campaign-session-start-title', session.campaignTitle || 'Campaign');
  appendText(copyHeader, 'span', 'directive-campaign-session-start-subtitle', `${session.playerName || 'Player Commander'} aboard ${session.shipName || 'assigned ship'}`);
  copy.append(copyHeader, brief, facts);
  startScreen.append(createCommandSessionHeroVisual(session, view), copy);
  const actionsRow = createElement('footer', 'directive-campaign-session-actions');
  actionsRow.append(
    createActionButton({
      label: 'Open Campaign Chat',
      icon: 'fa-solid fa-comments',
      tourTarget: 'campaign.continue',
      title: 'Open the host chat bound to this campaign\'s latest save',
      disabled: !session.binding?.chatId || typeof actions.openCampaignChat !== 'function',
      onClick: async () => {
        actions.setActiveTab('mission');
        await actions.openCampaignChat({ saveId: session.saveId, binding: session.binding });
        await actions.refresh();
      }
    }, 'directive-primary-command'),
    createActionButton({
      label: 'Load Latest Save',
      icon: 'fa-solid fa-folder-open',
      tourTarget: 'campaign.load',
      title: 'Load this campaign\'s latest save and open its bound campaign chat when available',
      disabled: !session.saveId || typeof actions.loadGame !== 'function',
      onClick: async () => {
        await actions.loadGame({ saveId: session.saveId });
        actions.setActiveTab('mission');
        await actions.refresh();
      }
    }, 'directive-secondary-command'),
    createActionButton({
      label: 'Records',
      icon: 'fa-solid fa-box-archive',
      tourTarget: 'campaign.records.open',
      title: 'Inspect this campaign\'s saves and branches in Campaign Records',
      onClick: async () => {
        activeRecordSaveId = session.saveId || activeRecordSaveId;
        onOpenRecords?.();
      }
    }, 'directive-secondary-command'),
    createActionButton({
      label: session.hidden ? 'Show In Command' : 'Hide From Command',
      icon: session.hidden ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash',
      tourTarget: 'campaign.session.visibility',
      title: session.hidden
        ? 'Restore this campaign to the default Command list'
        : 'Hide this campaign from the default Command list without deleting anything',
      disabled: !(session.hidden ? actions.showCampaignSession : actions.hideCampaignSession),
      onClick: async () => {
        if (session.hidden) {
          await actions.showCampaignSession({ key });
          showHiddenCommandSessions = false;
        } else {
          await actions.hideCampaignSession({ key });
        }
        await actions.refresh();
      }
    }, 'directive-secondary-command')
  );
  if (openingSceneStatus(view)?.blocked || ['activating', 'activationFailed'].includes(session.status) || ['failed', 'interrupted'].includes(view?.chatNative?.activation?.status)) {
    const recoveryCommand = activationRecoveryCommand(view, view?.campaignState || {});
    actionsRow.appendChild(createActionButton({
      label: recoveryCommand.label,
      icon: recoveryCommand.icon,
      tourTarget: 'campaign.activation-retry',
      title: recoveryCommand.title,
      disabled: typeof (actions?.buildCampaignOpeningScene || actions?.retryCampaignActivation) !== 'function',
      onClick: async () => {
        await buildOpeningScene(actions);
        await actions.refresh();
      }
    }, 'directive-primary-command'));
  }
  details.append(startScreen, actionsRow);

  toggle.addEventListener('click', () => {
    const nextExpanded = details.hidden;
    details.hidden = !nextExpanded;
    if (nextExpanded) expandedCommandSessionKeys.add(key);
    else expandedCommandSessionKeys.delete(key);
    toggle.replaceChildren(createIcon(nextExpanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'));
    toggle.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
    addTooltip(toggle, nextExpanded ? 'Collapse campaign' : 'Expand campaign');
  });

  row.append(summary, details);
  return row;
}

function createCommandSessionControls(view, rerender) {
  const controls = createElement('div', 'directive-campaign-session-controls');
  const search = createElement('input', 'directive-campaign-session-search');
  search.type = 'search';
  search.placeholder = 'Search campaigns';
  search.value = commandSessionSearchQuery;
  search.setAttribute('aria-label', 'Search campaigns');
  search.addEventListener('input', () => {
    commandSessionSearchQuery = search.value || '';
    rerender();
  });
  const hiddenCount = Number(view?.campaignIndex?.counts?.hidden || 0);
  const hiddenToggle = createButton({
    label: showHiddenCommandSessions ? 'Visible' : `Hidden${hiddenCount ? ` (${hiddenCount})` : ''}`,
    icon: showHiddenCommandSessions ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash',
    className: 'directive-button directive-secondary-command directive-campaign-session-hidden-toggle',
    title: showHiddenCommandSessions ? 'Show visible Command rows' : 'Show hidden Command rows',
    disabled: hiddenCount === 0,
    onClick: async () => {
      showHiddenCommandSessions = !showHiddenCommandSessions;
      rerender();
    }
  });
  controls.append(search, hiddenToggle);
  return controls;
}

function createCommandSessionIndex(campaign, view, actions, onOpenLibrary, onOpenRecords) {
  const shell = createElement('div', 'directive-campaign-session-index');
  const render = () => {
    shell.replaceChildren();
    const sessions = showHiddenCommandSessions
      ? asArray(view?.campaignIndex?.sessions).filter((session) => session.hidden)
      : asArray(view?.campaignIndex?.visibleSessions);
    const filtered = sessions.filter((session) => commandSessionMatchesSearch(session, commandSessionSearchQuery));
    if (asArray(view?.campaignIndex?.sessions).length) {
      shell.appendChild(createCommandSessionControls(view, render));
    }
    if (!filtered.length) {
      shell.appendChild(createCommandEmptyState(campaign, onOpenLibrary, onOpenRecords));
      return;
    }
    const list = createElement('div', 'directive-campaign-session-list');
    const collapseByDefault = filtered.length > 1;
    for (const session of filtered) {
      list.appendChild(createCommandSessionRow(session, view, actions, onOpenRecords, { collapseByDefault }));
    }
    shell.appendChild(list);
  };
  render();
  return shell;
}

function createCommandSection(campaign, view, actions, onOpenLibrary, onOpenRecords) {
  const section = createCampaignSection({ id: 'directive-campaign-command-section', label: 'Command' });
  section.appendChild(createSectionHeading('', 'Active Campaigns', 'Campaign lists one card per playthrough. Each card opens the latest save; Records contains individual saves and branches.'));

  section.appendChild(createCommandSessionIndex(campaign, view, actions, onOpenLibrary, onOpenRecords));
  return section;
}

function diagnosticTone(severity = '') {
  return /error|fatal/i.test(severity) ? 'danger' : /warn/i.test(severity) ? 'warning' : 'neutral';
}

function createDiagnosticIssueRow(issue) {
  const tone = diagnosticTone(issue.severity || issue.type);
  const row = createElement('article', `directive-import-issue-row directive-status-${tone}`);
  const icon = createElement('span', 'directive-import-issue-icon');
  icon.appendChild(createIcon(tone === 'danger' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-exclamation'));
  const severity = createElement('strong', 'directive-import-issue-severity');
  severity.textContent = issue.severity || issue.type || 'Notice';
  const copy = createElement('div');
  const title = createElement('strong');
  title.textContent = issue.item || issue.path || issue.code || 'Package record';
  const detail = createElement('span', 'directive-import-issue-detail');
  detail.textContent = issue.details || issue.message || issue.summary || 'Review the package import log.';
  copy.append(title, detail);
  row.append(icon, severity, copy);
  return row;
}

function createImportDiagnostics(result) {
  if (!result) return null;

  const card = createCard('directive-import-diagnostics-bay directive-lcars-panel');
  const header = createElement('div', 'directive-starship-panel-header');
  header.append(createCardTitle('Latest Import Diagnostics'));
  const badge = createElement('span', `directive-starship-panel-state directive-status-${statusTone(result?.status || (result ? 'success' : 'neutral'))}`);
  badge.textContent = result?.status || (result ? 'Complete' : 'No import');
  header.appendChild(badge);
  card.appendChild(header);

  const packageRow = createElement('div', 'directive-import-package-result');
  const packageCopy = createElement('div');
  const label = createElement('span', 'directive-lcars-kicker');
  label.textContent = 'Package';
  const name = createElement('strong');
  name.textContent = result.fileName || result.packageTitle || result.packageId || 'Imported package';
  packageCopy.append(label, name);
  const status = createElement('span', `directive-campaign-import-result-status directive-status-${statusTone(result.status)}`);
  const statusText = createElement('span');
  statusText.textContent = result.status || 'Complete';
  status.append(createIcon(statusTone(result.status) === 'danger' ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-circle-check'), statusText);
  packageRow.append(packageCopy, status);
  card.appendChild(packageRow);

  const diagnostics = result.diagnostics || result;
  const issues = asArray(diagnostics.issues || result.issues);
  const metrics = createElement('div', 'directive-import-diagnostics-status-grid');
  addTooltip(metrics, 'Latest package import counts: files inspected, records stored, warnings, errors, and storage source.');
  metrics.append(
    createStatusBlock('Files', diagnostics.filesProcessed ?? diagnostics.totalItems ?? '—', 'neutral', 'fa-solid fa-file'),
    createStatusBlock('Imported', diagnostics.entitiesAdded ?? diagnostics.imported ?? '—', 'success', 'fa-solid fa-circle-check'),
    createStatusBlock('Warnings', diagnostics.warningCount ?? issues.filter((item) => /warn/i.test(item.severity || item.type)).length, 'warning', 'fa-solid fa-triangle-exclamation'),
    createStatusBlock('Errors', diagnostics.errorCount ?? issues.filter((item) => /error/i.test(item.severity || item.type)).length, issues.some((item) => /error/i.test(item.severity || item.type)) ? 'danger' : 'success', 'fa-solid fa-circle-xmark'),
    createStatusBlock('Last Import', result.ok === false || /reject|error|failed/i.test(result.status || '') ? 'Rejected' : 'Stored', result.ok === false ? 'danger' : 'success', 'fa-solid fa-box-archive'),
    createStatusBlock('Source', result.source || 'imported', 'neutral', 'fa-solid fa-database')
  );
  card.appendChild(metrics);
  const list = createElement('div', 'directive-import-issue-list');
  if (issues.length) for (const issue of issues.slice(0, 6)) list.appendChild(createDiagnosticIssueRow(issue));
  else {
    const clear = createElement('div', 'directive-import-validation-clear');
    const clearText = createElement('span');
    clearText.textContent = 'The package passed validation with no reported issues.';
    clear.append(createIcon('fa-solid fa-circle-check'), clearText);
    list.appendChild(clear);
  }
  card.appendChild(list);
  return card;
}

function createPackageListButton(pack, selected, onSelect) {
  const button = createElement('button', `directive-starship-library-row${selected ? ' directive-starship-library-row-selected' : ''}`);
  button.type = 'button';
  button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  addTooltip(button, `Select the ${pack.campaign?.title || pack.title || 'campaign'} briefing. This does not start or change the active campaign.`);
  const marker = createElement('span', 'directive-starship-library-marker');
  marker.appendChild(createIcon(packageReady(pack) ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation'));
  const copy = createElement('span', 'directive-starship-library-row-copy');
  const title = createElement('strong');
  title.textContent = pack.campaign?.title || pack.title || 'Campaign';
  const meta = createElement('span');
  meta.textContent = [pack.ship?.name, pack.ship?.class, pack.source].filter(Boolean).join(' / ');
  copy.append(title, meta);
  const state = createElement('span', `directive-starship-library-state directive-status-${packageReady(pack) ? 'success' : 'warning'}`);
  state.textContent = packageReady(pack) ? 'Playable' : 'Review';
  button.append(marker, copy, state);
  button.addEventListener('click', onSelect);
  return button;
}

function createPackageMetaGrid(pack) {
  const grid = createElement('div', 'directive-campaign-package-detail-grid');
  const structure = pack?.campaign?.structure || {};
  grid.append(
    createStatusBlock('Era', eraLabel(pack), 'neutral', 'fa-solid fa-clock-rotate-left', 'Fictional timeframe for the package.'),
    createStatusBlock('Stardate', formatStardate(pack.campaign?.openingStardate || pack.ship?.openingStardate), 'neutral', 'fa-solid fa-clock', 'Opening in-fiction time for this campaign package.'),
    createStatusBlock('Length', expectedSessionsLabel(pack), 'neutral', 'fa-solid fa-layer-group', 'Expected campaign scope from the package metadata.'),
    createStatusBlock('Role', playerRoleLabel(pack), 'neutral', 'fa-solid fa-user-tie', 'The player officer role this package expects.'),
    createStatusBlock('Story Arcs', packageMetadataCount(structure.storyArcCount), 'neutral', 'fa-solid fa-list-ol', 'Main story arcs bundled with the package.'),
    createStatusBlock('Quest Templates', packageMetadataCount(structure.questTemplateCount), 'neutral', 'fa-solid fa-compass', 'Reusable side-work or open-world templates bundled with the package.')
  );
  return grid;
}

function createSeniorStaffRoster(pack) {
  const rosterEntries = orderedRosterEntries(pack);
  const wrapper = createElement('section', 'directive-starship-briefing-roster-disclosure');
  const rosterId = `directive-${safeDomId(pack.packageId || pack.campaign?.id || pack.title, 'campaign')}-briefing-crew-roster`;
  const toggle = createElement('button', 'directive-starship-briefing-roster-toggle directive-secondary-command');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', rosterId);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Show crew roster');
  addTooltip(toggle, 'Show or hide the senior crew preview for this campaign package.');
  setRosterToggleContent(toggle, false, rosterEntries.length);

  const roster = createElement('div', 'directive-starship-briefing-roster');
  roster.id = rosterId;
  roster.hidden = true;
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    roster.hidden = !expanded;
    wrapper.classList.toggle('directive-starship-briefing-roster-disclosure-open', expanded);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.setAttribute('aria-label', expanded ? 'Hide crew roster' : 'Show crew roster');
    setRosterToggleContent(toggle, expanded, rosterEntries.length);
  });
  if (!rosterEntries.length) {
    appendText(roster, 'p', 'directive-runtime-empty', 'Senior staff preview is not available for this package.');
    wrapper.append(toggle, roster);
    return wrapper;
  }
  for (const officer of rosterEntries) {
    const roleTone = briefingOfficerRoleTone(officer);
    const card = createElement('article', `directive-starship-briefing-officer directive-starship-briefing-officer-${roleTone}${officer.playerSlot ? ' directive-starship-briefing-officer-player' : ''}`);
    card.dataset.crewRoleTone = roleTone;
    const marker = createElement('span', `directive-starship-briefing-officer-marker directive-starship-briefing-officer-marker-${roleTone}`);
    marker.appendChild(createDirectiveMaskIcon(DIRECTIVE_COMM_BADGE_ICON, 'directive-starship-briefing-officer-badge'));
    const copy = createElement('span');
    const name = createElement('strong');
    name.textContent = officer.name || officer.id;
    const billet = createElement('span');
    billet.textContent = [officer.rank, officer.billet].filter(Boolean).join(' / ');
    copy.append(name, billet);
    card.append(marker, copy);
    roster.appendChild(card);
  }

  wrapper.append(toggle, roster);
  return wrapper;
}

function createCampaignBriefingBackdrop(pack, packageData) {
  const label = packageData?.locations?.find?.((location) => location.id === 'asterion-station')?.name
    || pack?.locations?.find?.((location) => location.id === 'asterion-station')?.name
    || 'Asterion Station';
  return createPackageImage(packageData, {
    kind: 'location.hero',
    subjectId: 'asterion-station',
    variant: 'hero'
  }, {
    wrapperClass: 'directive-starship-command-backdrop directive-starship-briefing-backdrop',
    className: 'directive-starship-command-backdrop-image directive-starship-briefing-backdrop-image',
    label,
    icon: 'fa-solid fa-building-shield',
    loading: 'lazy'
  });
}

function createCampaignBriefing(pack, packageData, actions, onOpenRecords) {
  const commands = packageCommands(pack, actions);
  const briefing = createElement('section', 'directive-starship-campaign-briefing directive-lcars-panel');
  briefing.dataset.directiveTour = 'campaign.package';
  briefing.appendChild(createCampaignBriefingBackdrop(pack, packageData));
  const visual = createPackageImage(packageData, {
    kind: 'ship.hero',
    subjectId: pack.ship?.id || 'starship',
    variant: 'card'
  }, {
    wrapperClass: 'directive-starship-briefing-visual',
    label: pack.ship?.name || pack.title,
    icon: 'fa-solid fa-shuttle-space'
  });
  const copy = createElement('div', 'directive-starship-briefing-copy');
  appendText(copy, 'span', 'directive-lcars-kicker', 'Campaign Briefing');
  appendText(copy, 'strong', 'directive-starship-briefing-title', pack.campaign?.title || pack.title || 'Campaign');
  copy.appendChild(createCampaignHook(pack.campaign?.highConcept));
  const actionsRow = createElement('div', 'directive-starship-briefing-actions');
  actionsRow.appendChild(createActionButton(commands.start, 'directive-primary-command directive-starship-create-commander-command'));
  if (commands.resume) {
    actionsRow.appendChild(createActionButton(commands.resume, 'directive-secondary-command'));
  }
  if (pack.counts?.saves) {
    actionsRow.appendChild(createActionButton({
      label: 'View Saves',
      icon: 'fa-solid fa-box-archive',
      tourTarget: 'campaign.records.open',
      title: 'Open saved campaigns for this package',
      onClick: onOpenRecords
    }, 'directive-secondary-command'));
  }
  copy.append(createPackageMetaGrid(pack), createSeniorStaffRoster(pack), actionsRow);
  briefing.append(visual, copy);
  return briefing;
}

function renderPackageBriefing(container, pack, packageData, actions, onOpenRecords) {
  clearElement(container);
  if (!pack) {
    const empty = createCard('directive-starship-library-controls directive-lcars-panel');
    empty.append(createIcon('fa-solid fa-box-open'), createCardTitle('No Campaign Packages'));
    appendText(empty, 'p', 'directive-runtime-empty', 'Import a Directive campaign package to begin.');
    container.appendChild(empty);
    return;
  }

  container.appendChild(createCampaignBriefing(pack, packageData, actions, onOpenRecords));
}

function createPackageBrowser(campaign, view, actions, onOpenRecords) {
  const browser = createElement('div', 'directive-campaign-library-browser');
  const list = createCard('directive-starship-library-list directive-lcars-panel');
  const listHeader = createElement('div', 'directive-starship-panel-header');
  listHeader.append(createCardTitle('Campaign Library'));
  const listState = createElement('span', `directive-starship-panel-state directive-status-${campaign.packages?.length ? 'success' : 'warning'}`);
  listState.textContent = campaign.packages?.length ? `${campaign.packages.length} Ready` : 'Empty';
  listHeader.appendChild(listState);
  list.appendChild(listHeader);

  const detailSlot = createElement('div', 'directive-starship-library-detail-slot');
  const selected = selectedPackage(campaign);
  for (const pack of asArray(campaign.packages)) {
    list.appendChild(createPackageListButton(pack, pack.packageId === selected?.packageId, (event) => {
      activeLibraryPackageId = pack.packageId;
      for (const button of list.querySelectorAll('.directive-starship-library-row')) {
        button.classList.remove('directive-starship-library-row-selected');
        button.setAttribute('aria-pressed', 'false');
      }
      event.currentTarget.classList.add('directive-starship-library-row-selected');
      event.currentTarget.setAttribute('aria-pressed', 'true');
      renderPackageBriefing(detailSlot, pack, packageDataFor(view, pack), actions, onOpenRecords);
    }));
  }
  if (!campaign.packages?.length) {
    appendText(list, 'p', 'directive-runtime-empty', 'No campaign packages are installed.');
  }
  renderPackageBriefing(detailSlot, selected, selected ? packageDataFor(view, selected) : null, actions, onOpenRecords);
  browser.append(list, detailSlot);
  return browser;
}

function createLibrarySection(campaign, view, actions, importControl, onOpenRecords) {
  const section = createCampaignSection({ id: 'directive-campaign-library-section', label: 'Library & Import' });
  section.appendChild(createSectionHeading('Library & Import', 'Campaign Library', 'Choose a campaign package, review the briefing, or import data-only packages.'));
  section.appendChild(createPackageBrowser(campaign, view, actions, onOpenRecords));

  const layout = createElement('div', 'directive-campaign-library-grid');
  const workbench = createCard('directive-import-workbench directive-lcars-panel');
  const band = createElement('div', 'directive-lcars-panel-band');
  band.textContent = 'Import Campaign Package';
  workbench.appendChild(band);
  const dropzone = createElement('div', 'directive-import-dropzone');
  dropzone.tabIndex = 0;
  dropzone.setAttribute('role', 'button');
  dropzone.setAttribute('aria-label', 'Drop a Directive package archive here or choose a file');
  const icon = createElement('span', 'directive-import-dropzone-icon');
  icon.appendChild(createIcon('fa-solid fa-download'));
  const title = createElement('strong');
  title.textContent = 'Drop Package File Here';
  const detail = createElement('span');
  detail.textContent = '.directive-campaign.zip or .zip';
  const divider = createElement('span', 'directive-import-or');
  divider.textContent = 'or';
  dropzone.append(icon, title, detail, divider, importControl.browseButton);
  dropzone.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    importControl.fileInput.click();
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('directive-import-dropzone-active');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('directive-import-dropzone-active'));
  dropzone.addEventListener('drop', async (event) => {
    event.preventDefault();
    dropzone.classList.remove('directive-import-dropzone-active');
    await importControl.importFile(event.dataTransfer?.files?.[0]);
  });
  workbench.append(dropzone, importControl.fileInput);

  layout.appendChild(workbench);
  const importDiagnostics = createImportDiagnostics(campaign.lastImportResult);
  if (importDiagnostics) layout.appendChild(importDiagnostics);
  section.appendChild(layout);
  const note = createElement('p', 'directive-import-safety-note');
  const noteText = createElement('span');
  noteText.textContent = 'Packages are validated before storage. Active content and unsafe paths are rejected.';
  note.append(createIcon('fa-solid fa-circle-info'), noteText);
  section.appendChild(note);
  return section;
}

function createRecordTable(title, count) {
  const section = createElement('section', 'directive-starship-record-section');
  const header = createElement('div', 'directive-starship-record-section-header');
  const heading = createElement('h3', 'directive-subsection-title');
  heading.textContent = title;
  const countPill = createElement('span', 'directive-starship-record-count');
  countPill.textContent = String(count || 0);
  header.append(heading, countPill);
  section.appendChild(header);
  return section;
}

function createSaveRow(save, { detailSelected = false, bulkSelected = false, onSelect = null } = {}) {
  const row = createElement('button', `directive-starship-record-row directive-starship-save-row ${saveKindClass(save)}${save.current ? ' directive-starship-current-record' : ''}${detailSelected ? ' directive-starship-record-row-selected' : ''}${bulkSelected ? ' directive-starship-record-row-bulk-selected' : ''}`);
  row.type = 'button';
  row.dataset.saveId = save.id || '';
  row.dataset.saveKind = isAutosave(save) ? 'autosave' : (isTerminalTimelineSave(save) ? 'terminal-timeline' : 'user');
  row.dataset.directiveTour = save.current ? 'campaign.records.save-row campaign.records.current-save' : 'campaign.records.save-row';
  row.setAttribute('aria-pressed', bulkSelected ? 'true' : 'false');
  row.setAttribute('aria-current', detailSelected ? 'true' : 'false');
  addTooltip(row, `${save.current ? 'Active' : 'Stored'} ${saveSlotLabel(save).toLowerCase()}: select to inspect, Shift-click for a range, or Ctrl-click to add to selection.`);
  const marker = createElement('span', 'directive-starship-record-marker');
  marker.appendChild(createIcon(saveMarkerIcon(save)));
  const copy = createElement('span', 'directive-starship-record-copy');
  const statusLine = createElement('span', 'directive-starship-record-status-line');
  const label = createElement('span', 'directive-lcars-kicker directive-starship-record-label');
  label.textContent = saveSlotLabel(save);
  const state = createElement('span', 'directive-starship-record-state');
  state.textContent = save.current ? 'Active' : 'Stored';
  statusLine.append(label, state);
  const title = createElement('strong', 'directive-starship-record-title');
  title.textContent = save.name || 'Untitled save';
  const meta = createElement('span', 'directive-starship-record-meta');
  meta.textContent = [
    save.metadata?.campaignTitle || 'Campaign',
    isTerminalTimelineSave(save) ? 'Terminal timeline preserved' : '',
    save.metadata?.stardate ? formatStardate(save.metadata.stardate) : '',
    formatTime(save.updatedAt)
  ].filter(Boolean).join(' / ');
  copy.append(statusLine, title, meta);
  const actionCell = createElement('span', 'directive-starship-record-action-cell');
  actionCell.appendChild(createIcon('fa-solid fa-chevron-right'));
  row.append(marker, copy, actionCell);
  row.addEventListener('mousedown', suppressRecordRangeTextSelection);
  if (typeof onSelect === 'function') row.addEventListener('click', onSelect);
  return row;
}

function createSaveFolder(group, getVisibleSaves, onSelect) {
  const collapsed = collapsedRecordCampaignIds.has(group.id);
  const section = createElement('section', 'directive-starship-save-folder');
  section.dataset.campaignFolderId = group.id;

  const header = createElement('button', `directive-starship-save-folder-row${collapsed ? ' directive-starship-save-folder-collapsed' : ''}`);
  header.type = 'button';
  header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  addTooltip(header, `Expand or collapse saves for ${group.title}.`);
  const disclosure = createElement('span', 'directive-starship-save-folder-disclosure');
  disclosure.appendChild(createIcon(collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'));
  const main = createElement('span', 'directive-starship-save-folder-main');
  appendText(main, 'strong', 'directive-starship-save-folder-title', group.title);
  appendText(main, 'span', 'directive-starship-save-folder-meta', [
    `${group.saves.length} save${group.saves.length === 1 ? '' : 's'}`,
    `${group.userSaveCount} user`,
    `${group.autosaveCount} auto`,
    formatTime(group.updatedAt)
  ].join(' / '));
  const state = createElement('span', 'directive-starship-save-folder-count');
  state.textContent = String(group.saves.length);
  header.append(disclosure, main, state);

  const list = createElement('div', 'directive-starship-save-folder-list');
  list.hidden = collapsed;
  for (const save of group.saves) {
    list.appendChild(createSaveRow(save, {
      detailSelected: save.id === activeRecordSaveId,
      bulkSelected: selectedRecordSaveIds.has(save.id),
      onSelect: (event) => onSelect(save, event, getVisibleSaves())
    }));
  }

  header.addEventListener('click', () => {
    const nextCollapsed = !collapsedRecordCampaignIds.has(group.id);
    if (nextCollapsed) collapsedRecordCampaignIds.add(group.id);
    else collapsedRecordCampaignIds.delete(group.id);
    list.hidden = nextCollapsed;
    header.classList.toggle('directive-starship-save-folder-collapsed', nextCollapsed);
    header.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
    disclosure.replaceChildren(createIcon(nextCollapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'));
  });

  section.append(header, list);
  return section;
}

function createSaveSelectionSummary(selectedSaves) {
  const toolbar = createElement('div', 'directive-starship-record-selection-toolbar');
  const count = selectedSaves.length;
  const autosaveCount = selectedSaves.filter(isAutosave).length;
  const userSaveCount = count - autosaveCount;
  const summary = createElement('span', 'directive-starship-record-selection-summary');
  summary.textContent = count === 1
    ? '1 save selected'
    : `${count} saves selected`;
  const detail = createElement('span', 'directive-starship-record-selection-detail');
  detail.textContent = `${userSaveCount} user / ${autosaveCount} auto`;
  toolbar.append(summary, detail);
  return toolbar;
}

function manualSaveGuardForView(view) {
  return view?.chatNative?.manualSaveGuard || null;
}

function manualSaveGuardTone(guard) {
  if (!guard) return 'warning';
  if (guard.ok) return 'success';
  if (['different-directive-campaign', 'corrupt-metadata', 'binding-save-mismatch'].includes(guard.reason)) return 'danger';
  return 'warning';
}

function manualSaveGuardLabel(guard) {
  if (!guard) return 'Unknown';
  return guard.ok ? 'Ready' : 'Blocked';
}

function createManualSaveGuardNotice(guard, actions = {}) {
  if (!guard) return null;
  const notice = createElement('article', `directive-starship-save-summary directive-starship-save-guard directive-status-${manualSaveGuardTone(guard)}`);
  appendText(notice, 'span', 'directive-lcars-kicker', 'Save Check');
  appendText(notice, 'p', '', guard.summary || (guard.ok ? 'Ready to save: the active chat matches this save.' : 'Save Game is disabled until Directive can confirm the active chat belongs to this save.'));
  if (!guard.ok && guard.recoveryActions?.includes('buildOpeningScene')) {
    const actionRow = createElement('div', 'directive-starship-save-guard-actions');
    const openingScene = guard.openingScene || {};
    actionRow.appendChild(createButton({
      label: openingScene.actionLabel || 'Build Opening Scene',
      icon: openingScene.reason === 'activation-incomplete' ? 'fa-solid fa-play' : 'fa-solid fa-wand-magic-sparkles',
      className: 'directive-button directive-primary-command directive-starship-record-action',
      title: openingScene.summary || guard.summary || 'Build the campaign opening scene',
      disabled: typeof (actions?.buildCampaignOpeningScene || actions?.retryCampaignActivation) !== 'function',
      onClick: async () => {
        await buildOpeningScene(actions);
        await actions?.refresh?.();
      }
    }));
    notice.appendChild(actionRow);
  } else if (!guard.ok && guard.recoveryActions?.includes('openCampaignChat') && typeof actions.openCampaignChat === 'function') {
    const actionRow = createElement('div', 'directive-starship-save-guard-actions');
    actionRow.appendChild(createButton({
      label: 'Open Campaign Chat',
      icon: 'fa-solid fa-comments',
      className: 'directive-button directive-primary-command directive-starship-record-action',
      title: 'Open the host chat linked to this save',
      onClick: async () => {
        activeCampaignSection = 'directive-campaign-records-section';
        actions?.setActiveTab?.('campaign');
        await actions.openCampaignChat();
        await actions?.refresh?.();
      }
    }));
    notice.appendChild(actionRow);
  }
  return notice;
}

function createSaveInspector(campaign, save, actions, selectedSaves = [], view = null) {
  const inspector = createCard('directive-starship-save-inspector directive-lcars-panel');
  inspector.dataset.directiveTour = 'campaign.records.inspector';
  const header = createElement('div', 'directive-starship-library-detail-header');
  const titleBlock = createElement('div');
  const selectedCount = selectedSaves.length;
  const multiSelected = selectedCount > 1;
  const activeSave = currentSave(campaign);
  const saveGuard = manualSaveGuardForView(view);
  const manualSaveReady = saveGuard?.ok === true;
  const canSaveActiveGame = Boolean(activeSave) && manualSaveReady && typeof actions?.saveCurrentGame === 'function';
  const canSaveActiveGameAs = Boolean(activeSave) && manualSaveReady && typeof actions?.saveCurrentGameAs === 'function';
  appendText(titleBlock, 'span', 'directive-lcars-kicker', multiSelected ? 'Selected Saves' : (save ? 'Selected Save' : 'No Save Selected'));
  appendText(titleBlock, 'strong', 'directive-starship-library-detail-title', multiSelected ? `${selectedCount} saves selected` : (save?.name || 'No campaign saves available'));
  appendText(titleBlock, 'span', 'directive-starship-library-detail-subtitle', multiSelected ? 'Bulk Records action ready.' : (save ? formatTime(save.updatedAt) : 'Create or load a campaign to populate Records.'));
  const state = createElement('span', `directive-starship-panel-state directive-status-${save ? 'success' : 'warning'}`);
  state.textContent = multiSelected ? 'Selected' : (save ? (save.current ? 'Active' : 'Stored') : 'Empty');
  header.append(titleBlock, state);
  inspector.appendChild(header);

  if (!save) {
    appendText(inspector, 'p', 'directive-runtime-empty', 'Campaign saves will appear here after Character Creator begins a campaign or Mission writes a save.');
    return inspector;
  }

  if (multiSelected) {
    const autosaveCount = selectedSaves.filter(isAutosave).length;
    const userSaveCount = selectedCount - autosaveCount;
    const campaignCount = new Set(selectedSaves.map(campaignFolderKeyForSave)).size;
    const latest = selectedSaves.slice().sort((a, b) => saveTime(b) - saveTime(a))[0] || save;
    const grid = createElement('div', 'directive-starship-save-inspector-grid');
    grid.append(
      createStatusBlock('Selected', String(selectedCount), 'success', 'fa-solid fa-list-check', 'Number of saves selected for a bulk Records action.'),
      createStatusBlock('Campaigns', String(campaignCount), 'neutral', 'fa-solid fa-folder', 'How many campaign folders are represented in the current selection.'),
      createStatusBlock('User Saves', String(userSaveCount), 'neutral', 'fa-solid fa-floppy-disk', 'Saves explicitly created by the player or command flow.'),
      createStatusBlock('Autosaves', String(autosaveCount), 'neutral', 'fa-solid fa-clock-rotate-left', 'Automatic recovery points created by Directive.')
    );
    inspector.appendChild(grid);
    const summary = createElement('article', 'directive-starship-save-summary');
    appendText(summary, 'span', 'directive-lcars-kicker', 'Latest Selected');
    appendText(summary, 'p', '', `${latest.name || 'Untitled save'} / ${formatTime(latest.updatedAt)}`);
    inspector.appendChild(summary);
    const actionRow = createElement('div', 'directive-starship-save-actions');
    actionRow.appendChild(createButton({
      label: `Delete Selected (${selectedCount})`,
      icon: 'fa-solid fa-trash-can',
      className: 'directive-button directive-secondary-command directive-starship-record-action directive-starship-delete-save-command',
      title: 'Delete selected saves',
      disabled: typeof actions.deleteCampaignSave !== 'function',
      onClick: async () => deleteSelectedCampaignSaves(selectedSaves, actions)
    }));
    inspector.appendChild(actionRow);
    return inspector;
  }

  const metadata = save.metadata || {};
  const branch = saveBranchMetadata(save);
  const grid = createElement('div', 'directive-starship-save-inspector-grid');
  grid.append(
    createStatusBlock('Campaign', metadata.campaignTitle || 'Campaign', 'neutral', 'fa-solid fa-scroll', 'Campaign title stored in this save snapshot.'),
    createStatusBlock('Stardate', formatStardate(metadata.stardate), 'neutral', 'fa-solid fa-clock', 'In-fiction time stored in this save snapshot.'),
    createStatusBlock('Mission', formatMissionLabel(metadata.activeMissionId), 'neutral', 'fa-solid fa-map', 'Active mission stored in this save snapshot.'),
    createStatusBlock('Phase', formatMissionLabel(metadata.activePhaseId, 'Pending'), 'neutral', 'fa-solid fa-location-crosshairs', 'Active mission beat stored in this save snapshot.'),
    createStatusBlock('Mode', metadata.simulationMode || 'Pending', 'neutral', 'fa-solid fa-sliders', 'Simulation style stored in this save snapshot.')
  );
  if (branch) {
    grid.appendChild(createStatusBlock(
      'Branch',
      isTerminalTimelineSave(save) ? 'Terminal Timeline' : 'Save Branch',
      isTerminalTimelineSave(save) ? 'danger' : 'warning',
      'fa-solid fa-code-branch',
      isTerminalTimelineSave(save)
        ? 'This save preserves a terminal outcome timeline without making it the active branch.'
        : 'This save was branched from another campaign save.'
    ));
  }
  inspector.appendChild(grid);

  const summary = createElement('article', 'directive-starship-save-summary');
  appendText(summary, 'span', 'directive-lcars-kicker', 'Snapshot');
  appendText(summary, 'p', '', compactText(metadata.summary, 'No save summary recorded yet.', 360));
  inspector.appendChild(summary);

  if (branch) {
    const branchSummary = createElement('article', `directive-starship-save-summary${isTerminalTimelineSave(save) ? ' directive-starship-terminal-branch-summary' : ''}`);
    appendText(branchSummary, 'span', 'directive-lcars-kicker', isTerminalTimelineSave(save) ? 'Terminal Branch' : 'Branch');
    appendText(
      branchSummary,
      'p',
      '',
      isTerminalTimelineSave(save)
        ? 'This branch preserves the terminal timeline so the active campaign can replay, push on, or keep the ending without losing the committed consequence record.'
        : 'This branch preserves a divergent campaign state from another save.'
    );
    const branchFacts = createElement('div', 'directive-starship-save-inspector-grid');
    branchFacts.append(
      createStatusBlock('Parent', branch.parentSaveName || branch.parentSaveId || 'Unknown', 'neutral', 'fa-solid fa-folder-tree', 'Save this branch diverged from.'),
      createStatusBlock('Divergence', labelFromId(branch.divergenceOutcomeId, 'Latest outcome'), 'neutral', 'fa-solid fa-code-commit', 'Committed outcome used as the branch point.')
    );
    if (isTerminalTimelineSave(save)) {
      branchFacts.appendChild(createStatusBlock(
        'Terminal Outcome',
        labelFromId(branch.terminalOutcomeId || branch.terminalConditionId, 'Terminal outcome'),
        'danger',
        'fa-solid fa-triangle-exclamation',
        'Terminal condition preserved in this branch.'
      ));
    }
    branchSummary.appendChild(branchFacts);
    inspector.appendChild(branchSummary);
  }

  const guardNotice = createManualSaveGuardNotice(saveGuard, actions);
  if (guardNotice) inspector.appendChild(guardNotice);

  const actionRow = createElement('div', 'directive-starship-save-actions directive-starship-save-actions-grid');
  const saveGameButton = createButton({
    label: 'Save Game',
    icon: 'fa-solid fa-download',
    className: 'directive-button directive-primary-command directive-starship-record-action directive-starship-save-game-command',
    title: canSaveActiveGame
      ? (activeSave?.name ? `Overwrite ${activeSave.name}` : 'Overwrite the active campaign save')
      : (saveGuard?.summary || 'Open this save\'s campaign chat before saving.'),
    disabled: !canSaveActiveGame,
    onClick: async () => saveCurrentGameFromRecords(actions)
  });
  saveGameButton.dataset.directiveTour = 'campaign.records.save';
  const saveGameAsButton = createButton({
    label: 'Save Game As...',
    icon: 'fa-solid fa-code-branch',
    className: 'directive-button directive-primary-command directive-starship-record-action directive-starship-save-game-as-command',
    title: canSaveActiveGameAs
      ? 'Create a named branch from the active campaign state'
      : (saveGuard?.summary || 'Open this save\'s campaign chat before creating a branch.'),
    disabled: !canSaveActiveGameAs,
    onClick: () => openRecordSaveAsDialog({
      defaultName: defaultRecordSaveAsName(campaign, save),
      onSave: (name) => saveCurrentGameAsFromRecords(actions, name)
    })
  });
  saveGameAsButton.dataset.directiveTour = 'campaign.records.save-as';
  const loadSaveButton = createButton({
    label: 'Load Save',
    icon: 'fa-solid fa-folder-open',
    className: 'directive-button directive-primary-command directive-starship-record-action',
    title: 'Load selected save',
    onClick: async () => {
      await actions.loadGame({ saveId: save.id });
      actions.setActiveTab('mission');
      await actions.refresh();
    }
  });
  loadSaveButton.dataset.directiveTour = 'campaign.records.load';
  const deleteSaveButton = createButton({
    label: 'Delete Save',
    icon: 'fa-solid fa-trash-can',
    className: 'directive-button directive-secondary-command directive-starship-record-action directive-starship-delete-save-command',
    title: 'Delete selected save',
    disabled: typeof actions.deleteCampaignSave !== 'function',
    onClick: async () => deleteSelectedCampaignSaves([save], actions)
  });
  deleteSaveButton.dataset.directiveTour = 'campaign.records.delete';
  actionRow.append(saveGameButton, saveGameAsButton, loadSaveButton, deleteSaveButton);
  inspector.appendChild(actionRow);
  return inspector;
}

function createRecordsConsole(campaign, view, actions) {
  const groups = groupSavesByCampaign(campaign.saves || []);
  const saves = visibleSavesFromGroups(groups);
  const selectableSaves = () => visibleSavesFromGroups(groups, { includeCollapsed: false });
  const selected = selectedSave({ ...campaign, saves });
  normalizeRecordSelection(saves);
  const records = createElement('section', 'directive-records directive-starship-records-console directive-lcars-panel');
  records.dataset.directiveTour = 'campaign.records';

  const center = createElement('div', 'directive-starship-records-main');
  if (!saves.length) {
    const empty = createElement('div', 'directive-starship-records-empty');
    empty.appendChild(createIcon('fa-solid fa-box-archive'));
    const emptyTitle = createElement('strong');
    emptyTitle.textContent = 'No Saves Available';
    const emptySummary = createElement('span');
    emptySummary.textContent = 'Campaign saves will appear here after setup begins a campaign.';
    empty.append(emptyTitle, emptySummary);
    center.appendChild(empty);
  }

  const inspectorSlot = createElement('aside', 'directive-starship-records-inspector');
  const toolbarSlot = createElement('div', 'directive-starship-record-selection-slot');

  const refreshSelectionSurfaces = () => {
    const activeSave = saves.find((save) => save.id === activeRecordSaveId) || selectedSave({ ...campaign, saves });
    const selectedSaves = selectedRecordSaves(saves);
    for (const row of center.querySelectorAll('.directive-starship-save-row')) {
      const saveId = row.dataset.saveId || '';
      const detailSelected = saveId === activeSave?.id;
      const bulkSelected = selectedRecordSaveIds.has(saveId);
      row.classList.toggle('directive-starship-record-row-selected', detailSelected);
      row.classList.toggle('directive-starship-record-row-bulk-selected', bulkSelected);
      row.setAttribute('aria-current', detailSelected ? 'true' : 'false');
      row.setAttribute('aria-pressed', bulkSelected ? 'true' : 'false');
    }
    clearElement(toolbarSlot);
    toolbarSlot.appendChild(createSaveSelectionSummary(selectedSaves));
    clearElement(inspectorSlot);
    inspectorSlot.appendChild(createSaveInspector({ ...campaign, saves }, activeSave, actions, selectedSaves, view));
  };

  if (saves.length) {
    const saveSection = createRecordTable('Save Files', saves.length);
    saveSection.appendChild(toolbarSlot);
    for (const group of groups) {
      saveSection.appendChild(createSaveFolder(group, selectableSaves, (save, event, visibleSaves) => {
        handleRecordSaveSelection(save, event, visibleSaves);
        refreshSelectionSurfaces();
      }));
    }
    center.appendChild(saveSection);
  }

  inspectorSlot.appendChild(createSaveInspector({ ...campaign, saves }, selected, actions, selectedRecordSaves(saves), view));
  if (saves.length) toolbarSlot.appendChild(createSaveSelectionSummary(selectedRecordSaves(saves)));

  records.append(center, inspectorSlot);
  return records;
}

function createRecordsSection(campaign, view, actions) {
  const section = createCampaignSection({ id: 'directive-campaign-records-section', label: 'Records' });
  section.appendChild(createSectionHeading('Records', 'Save Library', 'Review, load, or delete saved campaign state by campaign folder.'));
  section.appendChild(createRecordsConsole(campaign, view, actions));
  return section;
}

export function renderCampaignPanel(body, view, actions) {
  appendSectionTitle(body, 'Campaign');
  const campaign = view?.campaign || {};
  const state = view?.campaignState || null;
  const surface = createElement('section', 'directive-campaign-launcher');
  surface.dataset.directiveTour = 'campaign.command';
  const identity = createElement('header', 'directive-campaign-launcher-header');
  const title = createElement('h2', 'directive-campaign-launcher-title');
  title.textContent = state?.campaign?.title || campaign?.title || 'Campaign Library';
  identity.appendChild(title);
  const summary = createElement('p', 'directive-campaign-launcher-summary');
  summary.textContent = state ? 'Continue the current story or manage campaign records.' : 'Choose a campaign to begin.';
  identity.appendChild(summary);
  surface.appendChild(identity);

  const commands = createElement('div', 'directive-campaign-launcher-actions');
  if (state && typeof actions?.setActiveTab === 'function') {
    commands.appendChild(createActionButton({
      label: 'Open Mission',
      icon: 'fa-solid fa-compass',
      title: 'Open the quest journal for this campaign.',
      onClick: async () => {
        actions.setActiveTab('mission');
        await actions.refresh?.();
      }
    }, 'directive-primary-command'));
  }
  const packageSource = campaign.packages || campaign.packageOptions || (view?.activePackage ? [view.activePackage] : []);
  const packageOptions = asArray(packageSource);
  const firstPackage = packageOptions.find((pack) => pack?.packageId || pack?.id);
  if (firstPackage && typeof actions?.startCreatorDraft === 'function') {
    commands.appendChild(createActionButton({
      label: 'New Campaign',
      icon: 'fa-solid fa-plus',
      tourTarget: 'campaign.start',
      title: 'Start a new campaign from the selected package.',
      onClick: async () => {
        await actions.startCreatorDraft({ packageId: firstPackage.packageId || firstPackage.id });
        await actions.refresh?.();
      }
    }, 'directive-secondary-command'));
  }
  const importControl = createImportControl(actions || {});
  commands.appendChild(importControl.browseButton);
  surface.appendChild(commands);
  surface.appendChild(importControl.fileInput);

  const library = createElement('details', 'directive-campaign-disclosure');
  library.dataset.directiveTour = 'campaign.library';
  const librarySummary = createElement('summary');
  librarySummary.textContent = 'Campaign Library';
  library.appendChild(librarySummary);
  const libraryList = createElement('div', 'directive-campaign-library-list');
  packageOptions.forEach((pack) => {
    const row = createElement('article', 'directive-campaign-library-row');
    const rowTitle = createElement('strong');
    rowTitle.textContent = pack?.campaign?.title || pack?.title || pack?.packageId || pack?.id || 'Campaign package';
    row.appendChild(rowTitle);
    if (typeof actions?.startCreatorDraft === 'function') {
      row.appendChild(createActionButton({
        label: 'New Campaign',
        icon: 'fa-solid fa-plus',
        tourTarget: 'campaign.start',
        title: 'Start a new campaign from this package.',
        onClick: async () => {
          await actions.startCreatorDraft({ packageId: pack.packageId || pack.id });
          await actions.refresh?.();
        }
      }, 'directive-secondary-command'));
    }
    if (pack?.actions?.resumeDraft && typeof actions?.resumeCreatorDraft === 'function') {
      row.appendChild(createActionButton({
        label: 'Continue Character Setup',
        icon: 'fa-solid fa-user-pen',
        title: 'Continue the unfinished Character Creator setup.',
        onClick: async () => {
          await actions.resumeCreatorDraft({ draftId: pack.actions.resumeDraft });
          await actions.refresh?.();
        }
      }, 'directive-secondary-command'));
    }
    libraryList.appendChild(row);
  });
  if (!libraryList.children.length) appendEmpty(libraryList, 'No campaign packages are available.');
  library.appendChild(libraryList);
  surface.appendChild(library);

  const records = createElement('details', 'directive-campaign-disclosure');
  records.dataset.directiveTour = 'campaign.records';
  const recordsSummary = createElement('summary');
  recordsSummary.textContent = 'Saved Campaigns';
  records.appendChild(recordsSummary);
  const sessions = asArray(campaign.visibleSessions || campaign.sessions || campaign.saves || view?.campaignIndex?.visibleSessions);
  const recordList = createElement('div', 'directive-campaign-record-list');
  sessions.forEach((session) => {
    const row = createElement('article', 'directive-campaign-record-row');
    const rowTitle = createElement('strong');
    rowTitle.textContent = session.campaignTitle || session.metadata?.campaignTitle || session.saveName || session.name || 'Saved campaign';
    row.appendChild(rowTitle);
    const saveLabel = session.saveName || session.name;
    if (saveLabel && saveLabel !== rowTitle.textContent) {
      const saveName = createElement('span');
      saveName.textContent = saveLabel;
      row.appendChild(saveName);
    }
    const metadata = createElement('span');
    metadata.textContent = session.updatedAt || session.slotType || 'Saved record';
    row.appendChild(metadata);
    if (session.metadata?.summary) {
      const summary = createElement('span');
      summary.textContent = session.metadata.summary;
      row.appendChild(summary);
    }
    if (session.metadata?.branch?.kind === 'terminalTimeline') {
      const branch = createElement('span');
      branch.textContent = 'Terminal Branch';
      row.appendChild(branch);
      const condition = String(session.metadata.branch.terminalConditionId || '')
        .replace(/^terminal\./, '')
        .replace(/^[^.]+\./, '')
        .replace(/[-_.]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
      if (condition) {
        const branchCondition = createElement('span');
        branchCondition.textContent = condition;
        row.appendChild(branchCondition);
      }
      if (session.metadata.branch.parentSaveName) {
        const parent = createElement('span');
        parent.textContent = `From ${session.metadata.branch.parentSaveName}`;
        row.appendChild(parent);
      }
    }
    if (session.saveId && typeof actions?.loadGame === 'function') {
      row.appendChild(createActionButton({
        label: 'Load',
        icon: 'fa-solid fa-folder-open',
        title: 'Load this saved campaign.',
        onClick: async () => {
          await actions.loadGame({ saveId: session.saveId });
          actions.setActiveTab?.('mission');
          await actions.refresh?.();
        }
      }, 'directive-secondary-command'));
    }
    recordList.appendChild(row);
  });
  if (!recordList.children.length) appendEmpty(recordList, 'No saved campaigns are available.');
  records.appendChild(recordList);
  surface.appendChild(records);
  body.appendChild(surface);
}
