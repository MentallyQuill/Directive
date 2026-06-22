import {
  appendSectionTitle,
  clearElement,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createIcon
} from './runtime-ui-kit.js';
import { createPackageImage } from './directive-media.js';

let activeCampaignSection = '';
let activeLibraryPackageId = '';
let activeRecordSaveId = '';

export function resetCampaignPanelState() {
  activeCampaignSection = '';
  activeLibraryPackageId = '';
  activeRecordSaveId = '';
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
  if (/warning|issue|pending|draft/.test(label)) return 'warning';
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
  const packageId = view?.activePackage?.packageId || view?.activePackage?.package?.id || view?.activePackage?.manifest?.id;
  return packageId && packageId === pack.packageId ? view.activePackage : null;
}

function createStatusBlock(label, value, tone = statusTone(value), icon = '') {
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
  return block;
}

function createSectionHeading(kicker, title, summary = '') {
  const header = createElement('header', 'directive-campaign-section-heading');
  const titleBlock = createElement('div', 'directive-campaign-section-titleblock');
  const eyebrow = createElement('span', 'directive-lcars-kicker');
  eyebrow.textContent = kicker;
  const heading = createElement('h3', 'directive-campaign-section-title');
  heading.textContent = title;
  titleBlock.append(eyebrow, heading);
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
    button.setAttribute('aria-controls', item.id);
    button.setAttribute('role', 'tab');
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
  return createButton({
    label: command.label,
    icon: command.icon,
    className: `directive-button ${className || 'directive-secondary-command'}`,
    title: command.title || command.label,
    disabled: command.disabled === true,
    onClick: command.onClick
  });
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

function packageReady(pack) {
  return statusTone(pack?.diagnostics?.status) !== 'danger' && pack?.actions?.startNewCampaign !== false;
}

function expectedLength(pack) {
  return pack?.campaign?.structure?.expectedLength || 'Length pending';
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
      label: 'Create Character',
      icon: 'fa-solid fa-user-astronaut',
      title: pack.actions?.startNewCampaign ? 'Open Character Creator for this campaign' : 'Runtime assets are incomplete',
      disabled: !pack.actions?.startNewCampaign,
      onClick: async () => {
        await actions.startCreatorDraft({ packageId: pack.packageId });
        await actions.refresh();
      }
    },
    resume: pack.actions?.resumeDraft ? {
      label: 'Continue Character Setup',
      icon: 'fa-solid fa-user-pen',
      title: 'Continue the unfinished Character Creator setup',
      onClick: async () => {
        await actions.resumeCreatorDraft({ draftId: pack.actions.resumeDraft });
        await actions.refresh();
      }
    } : null,
    load: pack.actions?.loadLatestSave ? {
      label: 'Load Save',
      icon: 'fa-solid fa-folder-open',
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
    createActionButton({ label: 'Choose Campaign', icon: 'fa-solid fa-list', onClick: onOpenLibrary }, 'directive-primary-command'),
    createActionButton({
      label: 'Load Save',
      icon: 'fa-solid fa-folder-open',
      disabled: !asArray(campaign?.saves).length,
      onClick: onOpenRecords
    }, 'directive-secondary-command')
  );
  shell.append(copy, actionsRow);
  return shell;
}

function createCommandShipMasthead(view, ship = {}, save = null) {
  const packageData = view?.activePackage || null;
  const label = ship.name || packageData?.ship?.name || save?.metadata?.shipName || 'Active starship';
  const visual = createPackageImage(packageData, {
    kind: 'ship.hero',
    subjectId: ship.id || packageData?.ship?.id || save?.metadata?.shipId || 'active-starship',
    variant: 'thumb'
  }, {
    wrapperClass: 'directive-starship-command-masthead',
    className: 'directive-starship-command-masthead-image',
    label,
    icon: 'fa-solid fa-shuttle-space',
    loading: 'eager'
  });
  const caption = createElement('figcaption', 'directive-starship-command-masthead-label');
  caption.textContent = label;
  visual.appendChild(caption);
  return visual;
}

function campaignChatLabel(view) {
  const binding = view?.chatNative?.binding || {};
  return binding.chatName || binding.name || binding.chatId || 'Not bound';
}

function activationLabel(view, state) {
  const activation = view?.chatNative?.activation || {};
  if (state?.campaign?.status === 'active') return 'Active';
  if (state?.campaign?.status === 'concluding') return 'Finalizing';
  if (state?.campaign?.status === 'complete') return 'Complete';
  if (state?.campaign?.status === 'archived') return 'Archived';
  if (activation.status === 'failed') return 'Recovery required';
  if (state?.campaign?.status === 'activating') return 'Activating';
  return formatMissionLabel(state?.campaign?.status, 'Pending');
}

function promptContextLabel(view) {
  const prompt = view?.chatNative?.prompt || view?.promptInspection || {};
  const revision = prompt.revision ?? prompt.promptContextRevision ?? view?.chatNative?.binding?.promptContextRevision;
  if (prompt.active === false || prompt.installed === false) return 'Suspended';
  if (revision !== undefined && revision !== null) return `Revision ${revision}`;
  return view?.chatNative?.binding?.chatId ? 'Installed' : 'Not installed';
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

  const header = createElement('header', 'directive-starship-command-snapshot-header');
  const identity = createElement('div', 'directive-starship-command-identity');
  appendText(identity, 'span', 'directive-lcars-kicker', 'Active Campaign');
  appendText(identity, 'strong', 'directive-starship-command-title', campaign.title || save?.metadata?.campaignTitle || 'Campaign');
  appendText(identity, 'span', 'directive-starship-command-subtitle', `${player.name || 'Player Commander'} aboard ${ship.name || save?.metadata?.shipName || 'active ship'}`);
  const openMission = createActionButton({
    label: 'Open Campaign Chat',
    icon: 'fa-solid fa-comments',
    title: 'Open the chat bound to this campaign',
    disabled: !view?.chatNative?.binding?.chatId || typeof actions.openCampaignChat !== 'function',
    onClick: async () => {
      await actions.openCampaignChat();
      await actions.refresh();
    }
  }, 'directive-primary-command directive-starship-open-chat-command');
  header.append(identity, createCommandShipMasthead(view, ship, save), openMission);
  shell.appendChild(header);

  const statusGrid = createElement('div', 'directive-campaign-overview directive-starship-command-status-grid');
  statusGrid.append(
    createStatusBlock('Stardate', formatStardate(campaign.currentStardate ?? save?.metadata?.stardate), 'success', 'fa-solid fa-clock'),
    createStatusBlock('Mission', formatMissionLabel(mission.activeMissionId || save?.metadata?.activeMissionId), 'neutral', 'fa-solid fa-map'),
    createStatusBlock('Phase', formatMissionLabel(mission.activePhaseId || save?.metadata?.activePhaseId, 'Pending'), 'neutral', 'fa-solid fa-location-crosshairs'),
    createStatusBlock('Mode', state.settings?.simulationMode || save?.metadata?.simulationMode || 'Pending', 'neutral', 'fa-solid fa-sliders'),
    createStatusBlock('Campaign Chat', campaignChatLabel(view), view?.chatNative?.binding?.chatId ? 'success' : 'warning', 'fa-solid fa-comments'),
    createStatusBlock('Activation', activationLabel(view, state), statusTone(activationLabel(view, state)), 'fa-solid fa-power-off'),
    createStatusBlock('Prompt Context', promptContextLabel(view), statusTone(promptContextLabel(view)), 'fa-solid fa-layer-group')
  );
  const openWorld = openWorldSummary(view, state);
  if (openWorld && openWorld !== 'No foreground quest') {
    statusGrid.appendChild(createStatusBlock('Open World', openWorld, 'warning', 'fa-solid fa-compass'));
  }
  shell.appendChild(statusGrid);

  const briefing = createElement('div', 'directive-starship-command-briefing');
  const last = createElement('article', 'directive-starship-command-brief-card');
  appendText(last, 'span', 'directive-lcars-kicker', 'Last Playable Moment');
  appendText(last, 'p', '', commandLogSummary(logEntry));
  const saveCard = createElement('article', 'directive-starship-command-brief-card');
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
      title: 'Review active context, pending decisions, side work, and recovery',
      onClick: async () => {
        actions.setActiveTab('mission');
        await actions.refresh();
      }
    }, 'directive-secondary-command'),
    createActionButton({ label: 'View Records', icon: 'fa-solid fa-box-archive', onClick: onOpenRecords }, 'directive-secondary-command'),
    createActionButton({
      label: 'Rebuild Prompt',
      icon: 'fa-solid fa-arrows-rotate',
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

  if (state.campaign?.status === 'activating' || view?.chatNative?.activation?.status === 'failed') {
    footer.appendChild(createActionButton({
      label: 'Resume Activation',
      icon: 'fa-solid fa-play',
      title: 'Resume the idempotent campaign activation journal',
      disabled: typeof actions.retryCampaignActivation !== 'function',
      onClick: async () => {
        await actions.retryCampaignActivation();
        await actions.refresh();
      }
    }, 'directive-primary-command'));
  }

  if (['concluding', 'complete'].includes(state.campaign?.status) && state.conclusion?.recapStatus !== 'complete') {
    footer.appendChild(createActionButton({
      label: 'Retry Conclusion',
      icon: 'fa-solid fa-rotate-right',
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

function createCommandSection(campaign, view, actions, onOpenLibrary, onOpenRecords) {
  const section = createCampaignSection({ id: 'directive-campaign-command-section', label: 'Command' });
  section.appendChild(createSectionHeading('Command', 'Campaign Snapshot', 'Play in the bound host chat. Use this surface to inspect campaign state, recover activation, and open support charts.'));

  section.appendChild(view?.campaignState
    ? createCommandSnapshot(campaign, view, actions, onOpenRecords)
    : createCommandEmptyState(campaign, onOpenLibrary, onOpenRecords));
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
  grid.append(
    createStatusBlock('Era', eraLabel(pack), 'neutral', 'fa-solid fa-clock-rotate-left'),
    createStatusBlock('Stardate', formatStardate(pack.campaign?.openingStardate || pack.ship?.openingStardate), 'neutral', 'fa-solid fa-clock'),
    createStatusBlock('Length', expectedLength(pack), 'neutral', 'fa-solid fa-layer-group'),
    createStatusBlock('Role', playerRoleLabel(pack), 'neutral', 'fa-solid fa-user-tie'),
    createStatusBlock('Story Arcs', pack.storyArcs?.count ?? pack.campaign?.structure?.mainChapterCount ?? asArray(pack.campaign?.chapters).filter((chapter) => chapter.type === 'main').length, 'neutral', 'fa-solid fa-list-ol'),
    createStatusBlock('Quest Templates', (pack.questTemplates?.count ?? asArray(pack.questTemplates?.templates).length) || 'Pending', 'neutral', 'fa-solid fa-compass')
  );
  return grid;
}

function createSeniorStaffRoster(pack) {
  const roster = createElement('div', 'directive-starship-briefing-roster');
  const senior = asArray(pack.seniorCrewPreview).slice(0, 7);
  if (!senior.length) {
    appendText(roster, 'p', 'directive-runtime-empty', 'Senior staff preview is not available for this package.');
    return roster;
  }
  for (const officer of senior) {
    const card = createElement('article', 'directive-starship-briefing-officer');
    const marker = createElement('span', 'directive-starship-briefing-officer-marker');
    marker.appendChild(createIcon('fa-solid fa-user'));
    const copy = createElement('span');
    const name = createElement('strong');
    name.textContent = officer.name || officer.id;
    const billet = createElement('span');
    billet.textContent = [officer.rank, officer.billet].filter(Boolean).join(' / ');
    copy.append(name, billet);
    card.append(marker, copy);
    roster.appendChild(card);
  }
  return roster;
}

function createCampaignBriefing(pack, packageData, actions, onOpenRecords) {
  const commands = packageCommands(pack, actions);
  const briefing = createElement('section', 'directive-starship-campaign-briefing directive-lcars-panel');
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

function createSaveRow(save, selected, onSelect) {
  const row = createElement('button', `directive-starship-record-row directive-starship-save-row${save.current ? ' directive-starship-current-record' : ''}${selected ? ' directive-starship-record-row-selected' : ''}`);
  row.type = 'button';
  row.setAttribute('aria-pressed', selected ? 'true' : 'false');
  const marker = createElement('span', 'directive-starship-record-marker');
  marker.appendChild(createIcon(save.current ? 'fa-solid fa-play' : 'fa-solid fa-floppy-disk'));
  const copy = createElement('span', 'directive-starship-record-copy');
  const statusLine = createElement('span', 'directive-starship-record-status-line');
  const label = createElement('span', 'directive-lcars-kicker directive-starship-record-label');
  label.textContent = save.current ? 'Current Save' : (save.slotType || 'Save');
  const state = createElement('span', 'directive-starship-record-state');
  state.textContent = save.current ? 'Active' : 'Stored';
  statusLine.append(label, state);
  const title = createElement('strong', 'directive-starship-record-title');
  title.textContent = save.name || 'Untitled save';
  const meta = createElement('span', 'directive-starship-record-meta');
  meta.textContent = [save.metadata?.campaignTitle || 'Campaign', save.metadata?.stardate ? formatStardate(save.metadata.stardate) : '', formatTime(save.updatedAt)].filter(Boolean).join(' / ');
  copy.append(statusLine, title, meta);
  const actionCell = createElement('span', 'directive-starship-record-action-cell');
  actionCell.appendChild(createIcon('fa-solid fa-chevron-right'));
  row.append(marker, copy, actionCell);
  row.addEventListener('click', onSelect);
  return row;
}

function createSaveInspector(save, actions) {
  const inspector = createCard('directive-starship-save-inspector directive-lcars-panel');
  const header = createElement('div', 'directive-starship-library-detail-header');
  const titleBlock = createElement('div');
  appendText(titleBlock, 'span', 'directive-lcars-kicker', save ? 'Selected Save' : 'No Save Selected');
  appendText(titleBlock, 'strong', 'directive-starship-library-detail-title', save?.name || 'No campaign saves available');
  appendText(titleBlock, 'span', 'directive-starship-library-detail-subtitle', save ? formatTime(save.updatedAt) : 'Create or load a campaign to populate Records.');
  const state = createElement('span', `directive-starship-panel-state directive-status-${save ? 'success' : 'warning'}`);
  state.textContent = save ? (save.current ? 'Active' : 'Stored') : 'Empty';
  header.append(titleBlock, state);
  inspector.appendChild(header);

  if (!save) {
    appendText(inspector, 'p', 'directive-runtime-empty', 'Campaign saves will appear here after Character Creator begins a campaign or Mission writes a save.');
    return inspector;
  }

  const metadata = save.metadata || {};
  const grid = createElement('div', 'directive-starship-save-inspector-grid');
  grid.append(
    createStatusBlock('Campaign', metadata.campaignTitle || 'Campaign', 'neutral', 'fa-solid fa-scroll'),
    createStatusBlock('Stardate', formatStardate(metadata.stardate), 'neutral', 'fa-solid fa-clock'),
    createStatusBlock('Mission', formatMissionLabel(metadata.activeMissionId), 'neutral', 'fa-solid fa-map'),
    createStatusBlock('Phase', formatMissionLabel(metadata.activePhaseId, 'Pending'), 'neutral', 'fa-solid fa-location-crosshairs'),
    createStatusBlock('Mode', metadata.simulationMode || 'Pending', 'neutral', 'fa-solid fa-sliders')
  );
  inspector.appendChild(grid);

  const summary = createElement('article', 'directive-starship-save-summary');
  appendText(summary, 'span', 'directive-lcars-kicker', 'Snapshot');
  appendText(summary, 'p', '', compactText(metadata.summary, 'No save summary recorded yet.', 360));
  inspector.appendChild(summary);

  const actionRow = createElement('div', 'directive-starship-save-actions');
  actionRow.appendChild(createButton({
    label: 'Load Save',
    icon: 'fa-solid fa-folder-open',
    className: 'directive-button directive-primary-command directive-starship-record-action',
    title: 'Load selected save',
    onClick: async () => {
      await actions.loadGame({ saveId: save.id });
      actions.setActiveTab('mission');
      await actions.refresh();
    }
  }));
  actionRow.appendChild(createButton({
    label: 'Delete Save',
    icon: 'fa-solid fa-trash-can',
    className: 'directive-button directive-secondary-command directive-starship-record-action directive-starship-delete-save-command',
    title: 'Delete selected save',
    disabled: typeof actions.deleteCampaignSave !== 'function',
    onClick: async () => {
      const label = save.name || 'this save';
      const confirmed = typeof globalThis.confirm === 'function'
        ? globalThis.confirm(`Delete "${label}" from Records? This removes the saved campaign state and cannot be undone.`)
        : true;
      if (!confirmed) return;
      await actions.deleteCampaignSave({ saveId: save.id });
      activeRecordSaveId = '';
      actions.setActiveTab('campaign');
      await actions.refresh();
    }
  }));
  inspector.appendChild(actionRow);
  return inspector;
}

function createRecordsConsole(campaign, actions) {
  const saves = campaign.saves || [];
  const selected = selectedSave(campaign);
  const records = createElement('section', 'directive-records directive-starship-records-console directive-lcars-panel');

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

  if (saves.length) {
    const saveSection = createRecordTable('Save Files', saves.length);
    for (const save of saves) {
      saveSection.appendChild(createSaveRow(save, save.id === selected?.id, (event) => {
        activeRecordSaveId = save.id;
        for (const row of saveSection.querySelectorAll('.directive-starship-save-row')) {
          row.classList.remove('directive-starship-record-row-selected');
          row.setAttribute('aria-pressed', 'false');
        }
        event.currentTarget.classList.add('directive-starship-record-row-selected');
        event.currentTarget.setAttribute('aria-pressed', 'true');
        clearElement(inspectorSlot);
        inspectorSlot.appendChild(createSaveInspector(save, actions));
      }));
    }
    center.appendChild(saveSection);
  }

  const inspectorSlot = createElement('aside', 'directive-starship-records-inspector');
  inspectorSlot.appendChild(createSaveInspector(selected, actions));

  records.append(center, inspectorSlot);
  return records;
}

function createRecordsSection(campaign, actions) {
  const section = createCampaignSection({ id: 'directive-campaign-records-section', label: 'Records' });
  section.appendChild(createSectionHeading('Records', 'Save Library', 'Select a save file, review its snapshot, then load it into Mission.'));
  section.appendChild(createRecordsConsole(campaign, actions));
  return section;
}

export function renderCampaignPanel(body, view, actions) {
  appendSectionTitle(body, 'Campaign');
  const campaign = view?.campaign || {};
  const importControl = createImportControl(actions);
  const consoleSurface = createElement('div', 'directive-campaign-console directive-lcars-console');

  let selectCampaignSection = () => {};
  const openLibrary = () => selectCampaignSection('directive-campaign-library-section');
  const openRecords = () => selectCampaignSection('directive-campaign-records-section');
  const commandSection = createCommandSection(campaign, view, actions, openLibrary, openRecords);
  const librarySection = createLibrarySection(campaign, view, actions, importControl, openRecords);
  const recordsSection = createRecordsSection(campaign, actions);
  const sections = [
    { id: commandSection.id, label: 'Command', icon: 'fa-solid fa-rocket', section: commandSection },
    { id: librarySection.id, label: 'Library & Import', icon: 'fa-solid fa-file-import', section: librarySection },
    { id: recordsSection.id, label: 'Records', icon: 'fa-solid fa-box-archive', section: recordsSection }
  ];
  const fallback = campaign.packages?.length ? commandSection.id : librarySection.id;
  const preferred = sections.some((item) => item.id === activeCampaignSection) ? activeCampaignSection : fallback;
  const tabs = createCampaignSubtabs(sections, preferred);
  selectCampaignSection = tabs.select;
  consoleSurface.append(tabs.nav, commandSection, librarySection, recordsSection);
  body.appendChild(consoleSurface);
}
