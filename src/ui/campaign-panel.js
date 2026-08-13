import { appendEmpty, createButton, createElement } from './runtime-ui-kit.js';
import { createCampaignDeleteDialog } from './campaign-delete-dialog.js';
import { createPackageImage } from './directive-media.js';
import { ASHES_V1_PACKAGE_ID } from './v1-player-facing-panel-model.mjs';
import { buildCertifiedCampaignView } from './view-models/certified-campaign-view.mjs';
import { createLoadGameDialog, createSaveGameDialog } from './timeline-dialogs.js';
import { bindSingleOpenDisclosure } from './mobile-record-disclosure.js';

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
  if (typeof onSelect === 'function') row.addEventListener('click', onSelect);
  return row;
}

function createSavedGameRow(campaign, checkpoint, actions) {
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
      label: 'Delete',
      className: 'campaign-command campaign-command-danger',
      onClick: async () => {
        const confirmed = typeof globalThis.confirm !== 'function'
          || globalThis.confirm(`Delete saved game "${checkpoint.name}"?`);
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

function appendCampaignDetail(detail, campaign, pack, actions, { compactIdentity = false } = {}) {
  const hero = createElement('section', 'campaign-hero');
  if (compactIdentity) hero.classList.add('campaign-hero-compact-identity');
  if (pack) hero.appendChild(packageImage(pack, 'hero', 'campaign-hero-media'));
  const copy = createElement('div', 'campaign-hero-copy');
  if (!compactIdentity) {
    const status = createElement('span', 'campaign-status');
    status.textContent = campaign.active ? 'Current campaign' : 'Campaign';
    const title = createElement('h2');
    title.textContent = campaign.title;
    copy.append(status, title);
  }
  const meta = createElement('p');
  meta.textContent = [campaign.playerName, campaign.playerRole, campaign.setting].filter(Boolean).join(' / ');
  const summary = createElement('p', 'campaign-summary');
  summary.textContent = campaign.premise || campaign.chapter || '';
  copy.append(meta, summary);
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
      label: 'Save Game',
      icon: 'fa-solid fa-bookmark',
      className: 'campaign-command',
      onClick: (event) => {
        createSaveGameDialog({
          campaign,
          opener: event?.currentTarget || null,
          onSave: (payload) => runAndRefresh(actions.saveGame, payload, actions)
        });
      }
    }));
  }
  const savedGames = campaign.savedGames || campaign.checkpoints || [];
  commands.appendChild(createButton({
    label: 'Load Game',
    icon: 'fa-solid fa-clock-rotate-left',
    className: 'campaign-command',
    disabled: savedGames.length === 0,
    onClick: (event) => {
      createLoadGameDialog({
        campaign: { ...campaign, savedGames },
        opener: event?.currentTarget || null,
        onLoad: (payload) => runAndRefresh(actions.loadGame || actions.loadCheckpoint, payload, actions)
      });
    }
  }));
  commands.appendChild(createButton({
    label: 'Delete Campaign',
    icon: 'fa-solid fa-trash',
    className: 'campaign-command campaign-command-danger campaign-delete-command',
    disabled: !campaign.characterName,
    onClick: (event) => {
      createCampaignDeleteDialog({
        campaign,
        opener: event?.currentTarget || null,
        onDelete: async () => {
          await actions.deleteCampaign?.({
            campaignId: campaign.id,
            saveId: campaign.activeTimeline?.saveId || null
          });
          selectedRecordKey = `package:${ASHES_V1_PACKAGE_ID}`;
          await actions.refresh?.();
        }
      });
    }
  }));
  detail.appendChild(commands);

  const saves = createElement('section', 'campaign-saves');
  const heading = createElement('h3');
  heading.textContent = 'Saved games';
  const list = createElement('ul', 'campaign-save-list');
  savedGames.forEach((checkpoint) => list.appendChild(createSavedGameRow(campaign, checkpoint, actions)));
  if (!savedGames.length) appendEmpty(list, 'No saved games yet.');
  saves.append(heading, list);
  detail.appendChild(saves);
}

function createCampaignFact({ label, value }) {
  const fact = createElement('div', 'campaign-fact');
  const key = createElement('span');
  key.textContent = label;
  const content = createElement('strong');
  content.textContent = value;
  fact.append(key, content);
  return fact;
}

function appendPackageDetail(detail, pack, actions, { compactIdentity = false } = {}) {
  const unavailable = pack.disabled === true;
  const hero = createElement('section', `campaign-hero campaign-library-hero${unavailable ? ' is-coming-later' : ''}`);
  if (compactIdentity) hero.classList.add('campaign-hero-compact-identity');
  hero.dataset.campaignAvailability = pack.availability;
  hero.appendChild(packageImage(pack, 'hero', 'campaign-hero-media'));
  const copy = createElement('div', 'campaign-hero-copy');
  if (unavailable) {
    const status = createElement('span', 'campaign-status');
    status.textContent = 'Coming later';
    copy.appendChild(status);
  }
  if (!compactIdentity) {
    const title = createElement('h2');
    title.textContent = pack.title;
    copy.appendChild(title);
  }
  if (copy.children.length) hero.appendChild(copy);
  detail.appendChild(hero);

  const body = createElement('div', 'campaign-library-detail-body');
  const description = createElement('p', 'campaign-summary');
  description.dataset.campaignDescription = 'true';
  description.textContent = pack.description;
  description.classList.add('campaign-library-description');
  body.appendChild(description);
  if (pack.facts?.length) {
    const facts = createElement('div', 'campaign-facts campaign-library-facts');
    pack.facts.forEach((fact) => facts.appendChild(createCampaignFact(fact)));
    body.appendChild(facts);
  }
  body.appendChild(createButton({
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
  detail.appendChild(body);
}

function appendRecordDetail(detail, key, model, actions, options = {}) {
  const value = String(key || '');
  if (value.startsWith('campaign:')) {
    const campaign = model.campaigns.find((candidate) => candidate.id === value.slice('campaign:'.length));
    if (campaign) {
      const pack = model.packages.find((candidate) => candidate.packageId === campaign.packageId);
      appendCampaignDetail(detail, campaign, pack, actions, options);
    }
  } else if (value.startsWith('package:')) {
    const pack = model.packages.find((candidate) => candidate.packageId === value.slice('package:'.length));
    if (pack) appendPackageDetail(detail, pack, actions, options);
  }
  if (!detail.children.length) appendEmpty(detail, 'Choose a playable campaign or saved story.');
}

function mobileDetailId(key) {
  return `directive-campaign-mobile-${String(key).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
}

export function renderCampaignPanel(body, view, actions = {}) {
  const model = buildCertifiedCampaignView(view);
  const defaultKey = model.selectedCampaignId
    ? `campaign:${model.selectedCampaignId}`
    : `package:${model.packages.find((pack) => !pack.disabled)?.packageId || ''}`;
  if (!selectedRecordKey) selectedRecordKey = defaultKey;

  const surface = createElement('div', 'directive-expanded-campaign campaign-layout campaign-journal');
  const master = createElement('aside', 'campaign-master campaign-index-panel campaign-desktop-master');
  master.dataset.directiveScrollOwner = 'true';
  const head = createElement('header', 'campaign-index-head');
  const kicker = createElement('span', 'campaign-kicker');
  kicker.textContent = 'Your stories';
  const title = createElement('h2');
  title.textContent = 'Campaigns';
  head.append(kicker, title);
  master.appendChild(head);

  const list = createElement('div', 'campaign-index-list');
  const desktopRows = new Map();
  const refreshSelection = (key) => {
    selectedRecordKey = key;
    body.replaceChildren?.();
    renderCampaignPanel(body, view, actions);
    body.querySelector?.('.campaign-row.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };
  model.campaigns.forEach((campaign) => {
    const key = `campaign:${campaign.id}`;
    const pack = model.packages.find((candidate) => candidate.packageId === campaign.packageId);
    const row = createSelectableRow({
      key,
      title: campaign.title,
      meta: [campaign.playerName, campaign.chapter].filter(Boolean).join(' / '),
      state: campaign.active ? 'Current' : 'Saved',
      imageSource: pack,
      active: key === selectedRecordKey,
      onSelect: () => refreshSelection(key)
    });
    desktopRows.set(key, row);
    list.appendChild(row);
  });

  const libraryHeading = createElement('h3', 'campaign-library-heading');
  libraryHeading.textContent = 'Campaign library';
  list.appendChild(libraryHeading);
  model.packages.forEach((pack) => {
    const key = `package:${pack.packageId}`;
    const row = createSelectableRow({
      key,
      title: pack.title,
      meta: pack.description,
      state: pack.disabled ? '' : 'Playable',
      availability: pack.availability,
      imageSource: pack,
      active: key === selectedRecordKey,
      onSelect: () => refreshSelection(key)
    });
    desktopRows.set(key, row);
    list.appendChild(row);
  });
  master.appendChild(list);

  const detail = createElement('section', 'campaign-detail campaign-desktop-detail');
  detail.dataset.directiveScrollOwner = 'true';
  appendRecordDetail(detail, selectedRecordKey, model, actions);

  const mobile = createElement('section', 'campaign-mobile-accordion');
  mobile.dataset.directiveScrollOwner = 'true';
  const mobileRecords = [];
  const appendMobileRecord = ({ key, title, meta, state, availability = '', imageSource }) => {
    const record = createElement('article', 'campaign-mobile-record');
    record.dataset.mobileRecordContainerKey = key;
    const trigger = createSelectableRow({
      key,
      title,
      meta,
      state,
      availability,
      imageSource,
      active: false,
      onSelect: null
    });
    delete trigger.dataset.campaignRecordKey;
    trigger.classList.add('campaign-mobile-trigger');
    trigger.dataset.mobileRecordKey = key;
    trigger.removeAttribute('aria-pressed');
    const recordDetail = createElement('div', 'campaign-mobile-detail');
    recordDetail.id = mobileDetailId(key);
    appendRecordDetail(recordDetail, key, model, actions, { compactIdentity: true });
    record.append(trigger, recordDetail);
    mobile.appendChild(record);
    mobileRecords.push({ key, trigger, panel: recordDetail });
  };

  if (model.campaigns.length) {
    const storiesHeading = createElement('h3', 'campaign-mobile-section-heading');
    storiesHeading.textContent = 'Your stories';
    mobile.appendChild(storiesHeading);
  }
  model.campaigns.forEach((campaign) => {
    const pack = model.packages.find((candidate) => candidate.packageId === campaign.packageId);
    appendMobileRecord({
      key: `campaign:${campaign.id}`,
      title: campaign.title,
      meta: [campaign.playerName, campaign.chapter].filter(Boolean).join(' / '),
      state: campaign.active ? 'Current' : 'Saved',
      imageSource: pack
    });
  });
  const mobileLibraryHeading = createElement('h3', 'campaign-mobile-section-heading campaign-mobile-library-heading');
  mobileLibraryHeading.textContent = 'Campaign library';
  mobile.appendChild(mobileLibraryHeading);
  model.packages.forEach((pack) => appendMobileRecord({
    key: `package:${pack.packageId}`,
    title: pack.title,
    meta: pack.description,
    state: pack.disabled ? '' : 'Playable',
    availability: pack.availability,
    imageSource: pack
  }));

  const mobileDefaultKey = model.mobileCampaignId
    ? `campaign:${model.mobileCampaignId}`
    : `package:${model.packages.find((pack) => !pack.disabled)?.packageId || ''}`;
  bindSingleOpenDisclosure({
    records: mobileRecords,
    initialOpenKey: mobileDefaultKey,
    onOpen: (key) => {
      selectedRecordKey = key;
      for (const [recordKey, row] of desktopRows) {
        const active = recordKey === key;
        if (active) row.classList.add('active');
        else row.classList.remove('active');
        row.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      detail.replaceChildren();
      appendRecordDetail(detail, key, model, actions);
      mobileRecords.find((record) => record.key === key)?.trigger.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  });

  surface.append(master, detail, mobile);
  body.appendChild(surface);
}
