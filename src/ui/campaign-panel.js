import { appendEmpty, createButton, createElement } from './runtime-ui-kit.js';
import { createPackageImage } from './directive-media.js';
import { ASHES_V1_PACKAGE_ID } from './v1-player-facing-panel-model.mjs';
import { buildCertifiedCampaignView } from './view-models/certified-campaign-view.mjs';

let selectedRecordKey = null;

export function resetCampaignPanelState() {
  selectedRecordKey = null;
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Not yet played';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function runAndRefresh(action, payload, actions) {
  await action?.(payload);
  await actions.refresh?.();
}

function packageImage(pack, variant = 'card', wrapperClass = 'campaign-row-art') {
  return createPackageImage(pack, {
    kind: pack.image?.kind || 'ship.hero',
    subjectId: pack.image?.subjectId || pack.ship?.id || pack.packageId,
    variant
  }, {
    wrapperClass,
    label: pack.title,
    loading: 'lazy'
  });
}

function createSelectableRow({ key, title, meta, state, availability = '', imageSource, active, onSelect }) {
  const row = createElement('button', `campaign-row${active ? ' active' : ''}`);
  row.type = 'button';
  row.dataset.campaignRecordKey = key;
  if (availability) row.dataset.campaignAvailability = availability;
  row.setAttribute('aria-pressed', active ? 'true' : 'false');
  if (imageSource) row.appendChild(packageImage(imageSource));
  const copy = createElement('span', 'campaign-row-copy');
  const heading = createElement('strong');
  heading.textContent = title;
  const detail = createElement('span');
  detail.textContent = meta;
  copy.append(heading, detail);
  row.appendChild(copy);
  if (state) {
    const status = createElement('span', 'campaign-row-state');
    status.textContent = state;
    row.appendChild(status);
  }
  row.addEventListener('click', onSelect);
  return row;
}

function createCheckpointRow(campaign, checkpoint, actions) {
  const row = createElement('li', 'campaign-save-row');
  const copy = createElement('div', 'campaign-save-copy');
  const title = createElement('strong');
  title.textContent = checkpoint.name || 'Checkpoint';
  const meta = createElement('span');
  meta.textContent = [checkpoint.chapter, checkpoint.stardate, formatDate(checkpoint.createdAt)].filter(Boolean).join(' / ');
  copy.append(title, meta);
  const commands = createElement('div', 'campaign-save-actions');
  commands.append(
    createButton({
      label: 'Load',
      className: 'campaign-command',
      disabled: checkpoint.loadable !== true,
      onClick: () => runAndRefresh(actions.loadCheckpoint, {
        campaignId: campaign.id,
        checkpointId: checkpoint.id
      }, actions)
    }),
    createButton({
      label: 'Delete',
      className: 'campaign-command campaign-command-danger',
      onClick: async () => {
        const confirmed = typeof globalThis.confirm !== 'function'
          || globalThis.confirm(`Delete checkpoint "${checkpoint.name}"?`);
        if (!confirmed) return;
        await runAndRefresh(actions.deleteSave, {
          campaignId: campaign.id,
          checkpointId: checkpoint.id
        }, actions);
      }
    })
  );
  row.append(copy, commands);
  return row;
}

function appendCampaignDetail(detail, campaign, pack, actions) {
  const hero = createElement('section', 'campaign-hero');
  if (pack) hero.appendChild(packageImage(pack, 'hero', 'campaign-hero-media'));
  const copy = createElement('div', 'campaign-hero-copy');
  const status = createElement('span', 'campaign-status');
  status.textContent = campaign.active ? 'Current campaign' : 'Campaign';
  const title = createElement('h2');
  title.textContent = campaign.title;
  const meta = createElement('p');
  meta.textContent = [campaign.playerName, campaign.playerRole, campaign.setting].filter(Boolean).join(' / ');
  const summary = createElement('p', 'campaign-summary');
  summary.textContent = campaign.premise || campaign.chapter || '';
  copy.append(status, title, meta, summary);
  hero.appendChild(copy);
  detail.appendChild(hero);

  const commands = createElement('div', 'campaign-detail-actions');
  if (campaign.canOpenChat) {
    commands.appendChild(createButton({
      label: 'Continue',
      icon: 'fa-solid fa-arrow-right',
      className: 'campaign-command campaign-command-primary',
      onClick: () => runAndRefresh(actions.openCampaignChat, { saveId: campaign.activeTimeline?.saveId }, actions)
    }));
  }
  if (campaign.canSaveGame) {
    commands.appendChild(createButton({
      label: 'Save checkpoint',
      icon: 'fa-solid fa-bookmark',
      className: 'campaign-command',
      onClick: async () => {
        const suggested = campaign.chapter ? `Before ${campaign.chapter}` : 'Checkpoint';
        const name = typeof globalThis.prompt === 'function'
          ? globalThis.prompt('Checkpoint name', suggested)
          : suggested;
        if (!String(name || '').trim()) return;
        await runAndRefresh(actions.saveGame, { name: String(name).trim() }, actions);
      }
    }));
  }
  detail.appendChild(commands);

  const saves = createElement('section', 'campaign-saves');
  const heading = createElement('h3');
  heading.textContent = 'Campaign saves';
  const list = createElement('ul', 'campaign-save-list');
  (campaign.checkpoints || []).forEach((checkpoint) => list.appendChild(createCheckpointRow(campaign, checkpoint, actions)));
  if (!campaign.checkpoints?.length) appendEmpty(list, 'No checkpoints saved yet.');
  saves.append(heading, list);
  detail.appendChild(saves);
}

function appendPackageDetail(detail, pack, actions) {
  const unavailable = pack.disabled === true;
  const hero = createElement('section', `campaign-hero campaign-library-hero${unavailable ? ' is-coming-later' : ''}`);
  hero.dataset.campaignAvailability = pack.availability;
  hero.appendChild(packageImage(pack, 'hero', 'campaign-hero-media'));
  const copy = createElement('div', 'campaign-hero-copy');
  const status = createElement('span', 'campaign-status');
  status.textContent = unavailable ? 'Coming later' : 'Playable in V1';
  const title = createElement('h2');
  title.textContent = pack.title;
  const description = createElement('p', 'campaign-summary');
  description.dataset.campaignDescription = 'true';
  description.textContent = pack.description;
  copy.append(status, title, description);
  hero.appendChild(copy);
  detail.appendChild(hero);
  detail.appendChild(createButton({
    label: unavailable ? 'New campaign' : (pack.actions?.resumeDraft ? 'Continue setup' : 'Start campaign'),
    icon: 'fa-solid fa-play',
    className: 'campaign-command campaign-command-primary',
    disabled: unavailable,
    onClick: unavailable
      ? null
      : (pack.actions?.resumeDraft
        ? () => runAndRefresh(actions.resumeCreatorDraft, { draftId: pack.actions.resumeDraft }, actions)
        : () => runAndRefresh(actions.startCreatorDraft, { packageId: ASHES_V1_PACKAGE_ID }, actions))
  }));
}

export function renderCampaignPanel(body, view, actions = {}) {
  const model = buildCertifiedCampaignView(view);
  const defaultKey = model.selectedCampaignId
    ? `campaign:${model.selectedCampaignId}`
    : `package:${model.packages.find((pack) => !pack.disabled)?.packageId || ''}`;
  if (!selectedRecordKey) selectedRecordKey = defaultKey;

  const surface = createElement('div', 'directive-expanded-campaign campaign-layout campaign-journal');
  const master = createElement('aside', 'campaign-master campaign-index-panel');
  master.dataset.directiveScrollOwner = 'true';
  const head = createElement('header', 'campaign-index-head');
  const kicker = createElement('span', 'campaign-kicker');
  kicker.textContent = 'Your stories';
  const title = createElement('h2');
  title.textContent = 'Campaigns';
  head.append(kicker, title);
  master.appendChild(head);

  const list = createElement('div', 'campaign-index-list');
  const refreshSelection = (key) => {
    selectedRecordKey = key;
    body.replaceChildren?.();
    renderCampaignPanel(body, view, actions);
    body.querySelector?.('.campaign-row.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };
  model.campaigns.forEach((campaign) => {
    const key = `campaign:${campaign.id}`;
    const pack = model.packages.find((candidate) => candidate.packageId === campaign.packageId);
    list.appendChild(createSelectableRow({
      key,
      title: campaign.title,
      meta: [campaign.playerName, campaign.chapter].filter(Boolean).join(' / '),
      state: campaign.active ? 'Current' : 'Saved',
      imageSource: pack,
      active: key === selectedRecordKey,
      onSelect: () => refreshSelection(key)
    }));
  });

  const libraryHeading = createElement('h3', 'campaign-library-heading');
  libraryHeading.textContent = 'Campaign library';
  list.appendChild(libraryHeading);
  model.packages.forEach((pack) => {
    const key = `package:${pack.packageId}`;
    list.appendChild(createSelectableRow({
      key,
      title: pack.title,
      meta: pack.description,
      state: pack.disabled ? '' : 'Playable',
      availability: pack.availability,
      imageSource: pack,
      active: key === selectedRecordKey,
      onSelect: () => refreshSelection(key)
    }));
  });
  master.appendChild(list);

  const detail = createElement('section', 'campaign-detail');
  detail.dataset.directiveScrollOwner = 'true';
  const [kind, id] = String(selectedRecordKey).split(':', 2);
  if (kind === 'campaign') {
    const campaign = model.campaigns.find((candidate) => candidate.id === id) || model.campaigns[0];
    if (campaign) {
      const pack = model.packages.find((candidate) => candidate.packageId === campaign.packageId);
      appendCampaignDetail(detail, campaign, pack, actions);
    }
  } else {
    const pack = model.packages.find((candidate) => candidate.packageId === selectedRecordKey.slice('package:'.length));
    if (pack) appendPackageDetail(detail, pack, actions);
  }
  if (!detail.children.length) appendEmpty(detail, 'Choose a playable campaign or saved story.');

  surface.append(master, detail);
  body.appendChild(surface);
}
