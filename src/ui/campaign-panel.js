import {
  appendEmpty,
  appendSectionTitle,
  createButton,
  createElement,
  createIcon
} from './runtime-ui-kit.js';
import { createPackageImage } from './directive-media.js';
import { appendDirectiveOverlay, removeDirectiveOverlay } from './directive-overlay-root.js';
import { bindRovingFocus, restoreFocus } from './expanded-interface-focus.js';

let selectedCheckpointByCampaign = new Map();
let openMobileCampaignId = '';
let openMobileCheckpointByCampaign = new Map();

export function resetCampaignPanelState() {
  selectedCheckpointByCampaign = new Map();
  openMobileCampaignId = '';
  openMobileCheckpointByCampaign = new Map();
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function formatDate(value, fallback = 'Not yet played') {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function campaignStateLabel(campaign) {
  if (campaign?.active) return 'Active Campaign';
  if (String(campaign?.status || '').toLowerCase() === 'complete') return 'Complete';
  return '';
}

function packageForCampaign(view, campaign) {
  const packageContext = asArray(view?.campaignIndex?.packageMedia)
    .find((entry) => entry?.packageId === campaign?.packageId);
  if (packageContext) return packageContext;
  const activeId = view?.activePackage?.packageId || view?.activePackage?.package?.id;
  if (activeId && activeId === campaign?.packageId) return view.activePackage;
  return {
    packageId: campaign?.packageId,
    assets: campaign?.mediaPackage?.assets || {}
  };
}

function imageQuery(campaign, variant) {
  const descriptor = campaign?.image || {};
  return {
    kind: descriptor.kind || 'ship.hero',
    subjectId: descriptor.subjectId || campaign?.mediaPackage?.ship?.id || campaign?.packageId || campaign?.id,
    variant
  };
}

function createCampaignImage(view, campaign, variant, wrapperClass) {
  return createPackageImage(packageForCampaign(view, campaign), imageQuery(campaign, variant), {
    wrapperClass,
    label: campaign?.title || 'Campaign',
    icon: 'fa-solid fa-shuttle-space',
    loading: variant === 'hero' ? 'eager' : 'lazy'
  });
}

async function invoke(action, payload, actions) {
  await action?.(payload);
  await actions?.refresh?.();
}

function createCommand(label, className, onClick, {
  icon = '',
  disabled = false
} = {}) {
  return createButton({
    label,
    icon,
    className: `campaign-command${className ? ` ${className}` : ''}`,
    disabled,
    onClick
  });
}

function dialogFocusable(dialog) {
  return [...(dialog.querySelectorAll?.(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ) || [])];
}

function openDialog({ title, description = '', opener = null, build }) {
  const overlay = createElement('div', 'directive-campaign-dialog-overlay');
  const dialog = createElement('section', 'directive-campaign-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const headingId = `directive-campaign-dialog-${Date.now().toString(36)}`;
  dialog.setAttribute('aria-labelledby', headingId);

  const heading = createElement('h3');
  heading.id = headingId;
  heading.textContent = title;
  dialog.appendChild(heading);
  if (description) {
    const copy = createElement('p');
    copy.textContent = description;
    dialog.appendChild(copy);
  }

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener?.('keydown', onDocumentKeyDown);
    removeDirectiveOverlay(overlay);
    restoreFocus(opener);
  };
  const onDocumentKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault?.();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogFocusable(dialog);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault?.();
      last.focus?.();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault?.();
      first.focus?.();
    }
  };

  build(dialog, close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  overlay.appendChild(dialog);
  appendDirectiveOverlay(overlay, { fallbackParent: document.body || document.documentElement });
  document.addEventListener?.('keydown', onDocumentKeyDown);
  queueMicrotask(() => dialogFocusable(dialog)[0]?.focus?.());
  return close;
}

function openNewCampaignDialog(view, actions, opener) {
  const packages = asArray(view?.campaign?.packages);
  openDialog({
    title: 'New Campaign',
    description: 'Choose a campaign package to begin character setup.',
    opener,
    build(dialog, close) {
      const list = createElement('div', 'campaign-package-chooser');
      for (const pack of packages) {
        const option = createElement('article', 'campaign-package-choice');
        const button = createElement('button', 'campaign-package-option');
        button.type = 'button';
        const title = createElement('strong');
        title.textContent = pack?.campaign?.title || pack?.title || pack?.packageId || 'Campaign';
        const summary = createElement('span');
        summary.textContent = pack?.campaign?.premise || pack?.premise || pack?.summary || '';
        button.append(title, summary);
        button.addEventListener('click', async () => {
          await invoke(actions?.startCreatorDraft, { packageId: pack.packageId || pack.id }, actions);
          close();
        });
        option.appendChild(button);
        if (pack?.actions?.resumeDraft && typeof actions?.resumeCreatorDraft === 'function') {
          option.appendChild(createCommand('Continue Character Setup', 'secondary', async () => {
            await invoke(actions.resumeCreatorDraft, { draftId: pack.actions.resumeDraft }, actions);
            close();
          }, { icon: 'fa-solid fa-user-pen' }));
        }
        list.appendChild(option);
      }
      if (!packages.length) appendEmpty(list, 'No campaign packages are available.');
      dialog.appendChild(list);
      dialog.appendChild(createCommand('Cancel', 'secondary', close));
    }
  });
}

function openSaveDialog(campaign, actions, opener) {
  openDialog({
    title: 'Save Game',
    description: 'Create an immutable checkpoint without leaving the active chat.',
    opener,
    build(dialog, close) {
      const label = createElement('label', 'directive-campaign-dialog-field');
      const caption = createElement('span');
      caption.textContent = 'Checkpoint name';
      const input = createElement('input');
      input.type = 'text';
      input.maxLength = 80;
      input.autocomplete = 'off';
      input.value = campaign?.chapter ? `Before ${campaign.chapter}` : '';
      label.append(caption, input);
      const feedback = createElement('div', 'campaign-feedback');
      feedback.setAttribute('role', 'status');
      feedback.setAttribute('aria-live', 'polite');
      const commands = createElement('div', 'campaign-save-command-row');
      commands.append(
        createCommand('Save Game', '', async () => {
          const name = String(input.value || '').trim();
          if (!name) {
            feedback.textContent = 'Enter a checkpoint name.';
            input.focus?.();
            return;
          }
          await invoke(actions?.saveGame, { name }, actions);
          close();
        }, { icon: 'fa-solid fa-floppy-disk' }),
        createCommand('Cancel', 'secondary', close)
      );
      dialog.append(label, feedback, commands);
    }
  });
}

function openDeleteDialog(campaign, checkpoint, actions, opener) {
  openDialog({
    title: 'Delete Save',
    description: `Delete “${checkpoint.name}”? This checkpoint and its preserved chat will be removed.`,
    opener,
    build(dialog, close) {
      const commands = createElement('div', 'campaign-save-command-row');
      commands.append(
        createCommand('Delete Save', 'danger', async () => {
          await invoke(actions?.deleteSave, {
            campaignId: campaign.id,
            checkpointId: checkpoint.id
          }, actions);
          selectedCheckpointByCampaign.delete(campaign.id);
          openMobileCheckpointByCampaign.delete(campaign.id);
          close();
        }, { icon: 'fa-solid fa-trash' }),
        createCommand('Cancel', 'secondary', close)
      );
      dialog.appendChild(commands);
    }
  });
}

function createFact(label, value) {
  const fact = createElement('div', 'campaign-fact');
  const key = createElement('span');
  key.textContent = label;
  const content = createElement('strong');
  content.textContent = value || '—';
  fact.append(key, content);
  return fact;
}

function createFacts(campaign) {
  const facts = createElement('div', 'campaign-facts');
  facts.append(
    createFact('Assignment', campaign.setting),
    createFact('Current Chapter', campaign.chapter),
    createFact('Last Played', formatDate(campaign.lastPlayedAt))
  );
  return facts;
}

function createCampaignCommands(campaign, actions) {
  const row = createElement('div', 'campaign-command-row');
  if (campaign.active) {
    row.appendChild(createCommand('Open Chat', '', async () => {
      await invoke(actions?.openCampaignChat, {
        saveId: campaign.activeTimeline?.saveId
      }, actions);
    }, {
      icon: 'fa-solid fa-message',
      disabled: !campaign.canOpenChat
    }));
  }
  return row;
}

function createCheckpointCommands(campaign, checkpoint, actions) {
  const row = createElement('div', 'campaign-save-command-row');
  if (!checkpoint) {
    const empty = createElement('p', 'campaign-save-actions-empty');
    empty.textContent = campaign.checkpoints?.length
      ? 'Select a saved game to continue or delete it.'
      : 'No saved games yet.';
    row.appendChild(empty);
    return row;
  }
  row.append(
    createCommand('Load Game', '', async () => {
      await invoke(actions?.loadCheckpoint, {
        campaignId: campaign.id,
        checkpointId: checkpoint.id
      }, actions);
    }, { icon: 'fa-solid fa-play' }),
    createCommand('Delete Save', 'danger', (event) => {
      openDeleteDialog(campaign, checkpoint, actions, event?.currentTarget);
    }, { icon: 'fa-solid fa-trash' })
  );
  return row;
}

function createCheckpointRow(campaign, checkpoint, actions, {
  mobile = false,
  onSelection = null
} = {}) {
  const selectedId = mobile
    ? openMobileCheckpointByCampaign.get(campaign.id)
    : selectedCheckpointByCampaign.get(campaign.id);
  const selected = selectedId === checkpoint.id;
  const wrapper = mobile ? createElement('div', 'mobile-save-row') : null;
  const row = createElement('button', `campaign-save-row${selected ? ' selected' : ''}`);
  row.type = 'button';
  row.setAttribute('aria-pressed', selected ? 'true' : 'false');
  const copy = createElement('span', 'campaign-save-copy');
  const name = createElement('strong');
  name.textContent = checkpoint.name;
  const detail = createElement('span');
  detail.textContent = [
    checkpoint.chapter,
    checkpoint.stardate ? `Stardate ${checkpoint.stardate}` : '',
    formatDate(checkpoint.createdAt, 'Saved game')
  ].filter(Boolean).join(' · ');
  copy.append(name, detail);
  const marker = createElement('span', 'campaign-save-marker');
  marker.textContent = selected ? 'Selected' : 'Saved';
  row.append(copy, marker);
  row.addEventListener('click', () => {
    if (mobile) {
      const next = selected ? '' : checkpoint.id;
      if (next) openMobileCheckpointByCampaign.set(campaign.id, next);
      else openMobileCheckpointByCampaign.delete(campaign.id);
    } else {
      selectedCheckpointByCampaign.set(campaign.id, checkpoint.id);
    }
    onSelection?.();
  });
  if (!mobile) return row;

  const detailPanel = createElement('div', 'mobile-save-detail');
  detailPanel.hidden = !selected;
  detailPanel.appendChild(createCheckpointCommands(campaign, selected ? checkpoint : null, actions));
  wrapper.append(row, detailPanel);
  return wrapper;
}

function createSaves(campaign, actions, rerender, { mobile = false } = {}) {
  const section = createElement('section', 'campaign-saves');
  const heading = createElement('div', 'campaign-saves-head');
  const title = createElement('span');
  title.textContent = `Saved Games ${asArray(campaign.checkpoints).length}`;
  heading.appendChild(title);
  if (campaign.canSaveGame) {
    const saveButton = createButton({
      label: 'Save Game',
      icon: 'fa-solid fa-floppy-disk',
      className: 'campaign-save-create',
      onClick: (event) => openSaveDialog(campaign, actions, event?.currentTarget)
    });
    heading.appendChild(saveButton);
  }
  section.appendChild(heading);

  const list = createElement('div', 'campaign-save-list');
  for (const checkpoint of asArray(campaign.checkpoints)) {
    list.appendChild(createCheckpointRow(campaign, checkpoint, actions, {
      mobile,
      onSelection: rerender
    }));
  }
  section.appendChild(list);

  if (!mobile) {
    const checkpoint = asArray(campaign.checkpoints)
      .find((entry) => entry.id === selectedCheckpointByCampaign.get(campaign.id));
    section.appendChild(createCheckpointCommands(campaign, checkpoint, actions));
  }

  const feedback = createElement('div', 'campaign-feedback');
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  section.appendChild(feedback);
  return section;
}

function createCampaignDetail(view, campaign, actions, rerender, { mobile = false } = {}) {
  const detail = createElement(mobile ? 'div' : 'article', mobile ? 'mobile-campaign-detail' : 'campaign-detail');
  const hero = createElement('div', 'campaign-hero');
  hero.appendChild(createCampaignImage(view, campaign, 'hero', 'campaign-hero-media'));
  const heroCopy = createElement('div', 'campaign-hero-copy');
  const status = createElement('div', 'campaign-status');
  status.textContent = campaignStateLabel(campaign) || 'Campaign';
  const title = createElement('div', 'campaign-title');
  title.textContent = campaign.title;
  const player = createElement('div', 'campaign-player');
  player.textContent = `${campaign.playerName} / ${campaign.playerRole}`;
  heroCopy.append(status, title, player);
  hero.appendChild(heroCopy);

  const body = createElement('div', 'campaign-detail-body');
  body.appendChild(createFacts(campaign));
  if (campaign.premise) {
    const premise = createElement('p', 'campaign-premise');
    premise.textContent = campaign.premise;
    body.appendChild(premise);
  }
  body.append(
    createCampaignCommands(campaign, actions),
    createSaves(campaign, actions, rerender, { mobile })
  );

  detail.append(hero, body);
  return detail;
}

function createDesktopCampaigns(body, view, campaigns, selected, actions, rerender) {
  const journal = createElement('section', 'campaign-journal');
  journal.dataset.routeView = 'campaign';
  const index = createElement('aside', 'campaign-index-panel');
  const heading = createElement('div', 'campaign-index-head');
  const label = createElement('span');
  label.textContent = 'Campaigns';
  const newButton = createElement('button', 'campaign-new-button');
  newButton.type = 'button';
  newButton.title = 'New Campaign';
  newButton.setAttribute('aria-label', 'New Campaign');
  newButton.dataset.directiveTour = 'campaign.start';
  newButton.textContent = '+';
  newButton.addEventListener('click', (event) => openNewCampaignDialog(view, actions, event.currentTarget));
  heading.append(label, newButton);
  index.appendChild(heading);

  const list = createElement('nav', 'campaign-index-list');
  list.setAttribute('aria-label', 'Campaigns');
  list.dataset.directiveTour = 'campaign.index';
  for (const campaign of campaigns) {
    const active = campaign.id === selected?.id;
    const row = createElement('button', `campaign-row${active ? ' active' : ''}`);
    row.type = 'button';
    row.dataset.campaignId = campaign.id;
    row.setAttribute('aria-selected', active ? 'true' : 'false');
    row.appendChild(createCampaignImage(view, campaign, 'thumb', 'campaign-row-media'));
    const copy = createElement('span', 'campaign-row-copy');
    const title = createElement('strong');
    title.textContent = campaign.title;
    const player = createElement('span');
    player.textContent = `${campaign.playerName} · ${campaign.playerRole}`;
    const chapter = createElement('span');
    chapter.textContent = campaign.chapter || campaign.setting || formatDate(campaign.lastPlayedAt);
    copy.append(title, player, chapter);
    row.appendChild(copy);
    const state = campaignStateLabel(campaign);
    if (state) {
      const badge = createElement('span', 'campaign-row-state');
      badge.textContent = state.replace(' Campaign', '');
      row.appendChild(badge);
    }
    row.addEventListener('click', async () => {
      await invoke(actions?.selectCampaign, { campaignId: campaign.id }, actions);
    });
    list.appendChild(row);
  }
  if (!campaigns.length) appendEmpty(list, 'No campaigns are available.');
  bindRovingFocus(list, { selector: '.campaign-row', orientation: 'vertical' });
  index.appendChild(list);
  journal.appendChild(index);
  if (selected) {
    const detail = createCampaignDetail(view, selected, actions, rerender);
    detail.dataset.directiveTour = 'campaign.detail';
    detail.querySelector?.('.campaign-saves')?.setAttribute?.('data-directive-tour', 'campaign.saves');
    journal.appendChild(detail);
  }
  body.appendChild(journal);
}

function createMobileCampaigns(body, view, campaigns, selected, actions, rerender) {
  if (!openMobileCampaignId) openMobileCampaignId = selected?.id || campaigns[0]?.id || '';
  const accordion = createElement('section', 'mobile-campaign-accordion');
  accordion.dataset.routeView = 'campaign';
  accordion.setAttribute('aria-label', 'Campaigns');
  const heading = createElement('div', 'campaign-index-head');
  const label = createElement('span');
  label.textContent = 'Campaigns';
  const newButton = createElement('button', 'campaign-new-button');
  newButton.type = 'button';
  newButton.title = 'New Campaign';
  newButton.setAttribute('aria-label', 'New Campaign');
  newButton.dataset.directiveTour = 'campaign.start';
  newButton.textContent = '+';
  newButton.addEventListener('click', (event) => openNewCampaignDialog(view, actions, event.currentTarget));
  heading.append(label, newButton);
  accordion.appendChild(heading);

  const list = createElement('div', 'mobile-campaign-list');
  list.dataset.directiveTour = 'campaign.index';
  for (const campaign of campaigns) {
    const open = openMobileCampaignId === campaign.id;
    const item = createElement('article', `mobile-campaign-item${open ? ' is-open' : ''}`);
    const head = createElement('div', 'mobile-campaign-head');
    head.appendChild(createCampaignImage(view, campaign, 'thumb', 'mobile-campaign-media'));
    const toggle = createElement('button', 'mobile-campaign-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const copy = createElement('span', 'mobile-campaign-toggle-copy');
    const title = createElement('strong');
    title.textContent = campaign.title;
    const player = createElement('small');
    player.textContent = `${campaign.playerName} · ${campaign.playerRole}`;
    copy.append(title, player);
    const badges = createElement('span', 'mobile-campaign-badges');
    const stateLabel = campaignStateLabel(campaign);
    if (stateLabel) {
      const badge = createElement('span', 'mobile-campaign-badge');
      badge.textContent = stateLabel;
      badges.appendChild(badge);
    }
    const chevron = createIcon('fa-solid fa-chevron-down mobile-campaign-chevron');
    badges.appendChild(chevron);
    toggle.append(copy, badges);
    toggle.addEventListener('click', async () => {
      openMobileCampaignId = open ? '' : campaign.id;
      if (!open) await actions?.selectCampaign?.({ campaignId: campaign.id });
      rerender();
    });
    head.appendChild(toggle);
    item.appendChild(head);
    if (open) item.appendChild(createCampaignDetail(view, campaign, actions, rerender, { mobile: true }));
    list.appendChild(item);
  }
  if (!campaigns.length) appendEmpty(list, 'No campaigns are available.');
  accordion.appendChild(list);
  body.appendChild(accordion);
}

export function renderCampaignPanel(body, view, actions) {
  appendSectionTitle(body, 'Campaign');
  const campaigns = asArray(view?.campaignIndex?.campaigns);
  const selectedId = view?.campaignIndex?.selectedCampaignId;
  const selected = campaigns.find((campaign) => campaign.id === selectedId) || campaigns[0] || null;
  const host = createElement('div', 'directive-expanded-campaign');
  const rerender = () => {
    host.replaceChildren?.();
    if (!host.replaceChildren) host.textContent = '';
    createDesktopCampaigns(host, view, campaigns, selected, actions, rerender);
    createMobileCampaigns(host, view, campaigns, selected, actions, rerender);
  };
  rerender();
  body.appendChild(host);
}
