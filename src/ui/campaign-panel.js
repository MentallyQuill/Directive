import { addTooltip, appendEmpty, createButton, createElement } from './runtime-ui-kit.js';
import { createCampaignDeleteDialog } from './campaign-delete-dialog.js';
import { createDirectiveMaskIcon, createPackageImage } from './directive-media.js';
import { ASHES_V1_PACKAGE_ID } from './v1-player-facing-panel-model.mjs';
import { buildCertifiedCampaignView } from './view-models/certified-campaign-view.mjs';
import { createLoadGameDialog, createSaveGameDialog } from './timeline-dialogs.js';
import { bindSingleOpenDisclosure } from './mobile-record-disclosure.js';
import { createPackageHeroVisual } from './package-hero-scene.js';
import { bindReactiveHeroOrbit } from './reactive-hero-orbit.js';
import { createShipChronometer } from './ship-chronometer.js';

let selectedRecordKey = null;
let campaignPanelMode = null;
let lastActiveCampaignId = null;
const DELETE_CAMPAIGN_ICON = 'assets/icons/delete-campaign.svg';

export function resetCampaignPanelState() {
  selectedRecordKey = null;
  campaignPanelMode = null;
  lastActiveCampaignId = null;
}

async function runAndRefresh(action, payload, actions, afterRefresh = null) {
  await action?.(payload);
  await actions.refresh?.();
  afterRefresh?.();
}

function focusCampaignAction(body, action) {
  body.querySelector?.(`[data-campaign-action="${action}"]`)?.focus?.();
}

function packageImage(pack, variant = 'card', wrapperClass = 'campaign-row-art') {
  const createVisual = variant === 'hero' ? createPackageHeroVisual : createPackageImage;
  return createVisual(pack, {
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

function appendCampaignDetail(detail, campaign, pack, actions, {
  compactIdentity = false,
  dashboard = false,
  time = null,
  focusRoot = detail
} = {}) {
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
  if (dashboard) {
    hero.classList.add('campaign-dashboard-hero');
    const chronometer = createShipChronometer(time, { variant: 'campaign' });
    if (chronometer) copy.appendChild(chronometer);
  } else {
    hero.classList.add('campaign-browser-hero');
  }
  bindReactiveHeroOrbit(hero);
  detail.appendChild(hero);

  const commands = createElement('div', `campaign-detail-actions${dashboard ? ' campaign-dashboard-actions' : ''}`);
  if (campaign.canOpenChat) {
    const continueCampaign = createButton({
      label: 'Continue',
      icon: 'fa-solid fa-arrow-right',
      className: 'campaign-command campaign-command-primary',
      onClick: () => runAndRefresh(
        actions.openCampaignChat,
        { saveId: campaign.activeTimeline?.saveId },
        actions,
        () => focusCampaignAction(focusRoot, 'continue')
      )
    });
    continueCampaign.dataset.campaignAction = 'continue';
    commands.appendChild(continueCampaign);
  }
  if (campaign.canSaveGame) {
    const saveGame = createButton({
      label: 'Save Game',
      icon: 'fa-solid fa-bookmark',
      className: 'campaign-command',
      onClick: (event) => {
        createSaveGameDialog({
          campaign,
          opener: event?.currentTarget || null,
          onSave: (payload) => actions.saveGame?.(payload),
          onSaved: () => actions.refresh?.()
        });
      }
    });
    saveGame.dataset.campaignAction = 'save';
    commands.appendChild(saveGame);
  }
  const savedGames = campaign.savedGames || campaign.checkpoints || [];
  const loadGame = createButton({
    label: 'Load Game',
    icon: 'fa-solid fa-clock-rotate-left',
    className: 'campaign-command',
    disabled: savedGames.length === 0,
    onClick: (event) => {
      createLoadGameDialog({
        campaign: { ...campaign, savedGames },
        opener: event?.currentTarget || null,
        onLoad: (payload) => runAndRefresh(actions.loadGame || actions.loadCheckpoint, payload, actions),
        onDelete: typeof actions.deleteSave === 'function'
          ? ({ savedGameId }) => actions.deleteSave({
            campaignId: campaign.id,
            checkpointId: savedGameId
          })
          : null
      });
    }
  });
  loadGame.dataset.campaignAction = 'load';
  commands.appendChild(loadGame);
  const deleteCampaign = createElement('button', 'campaign-command campaign-command-danger campaign-delete-command campaign-delete-icon-command');
  deleteCampaign.type = 'button';
  deleteCampaign.disabled = !campaign.characterName;
  deleteCampaign.dataset.campaignAction = 'delete';
  deleteCampaign.setAttribute('aria-label', 'Delete campaign');
  addTooltip(deleteCampaign, 'Delete campaign');
  deleteCampaign.appendChild(createDirectiveMaskIcon(DELETE_CAMPAIGN_ICON, 'campaign-delete-icon'));
  deleteCampaign.addEventListener('click', (event) => {
    event?.preventDefault?.();
    if (deleteCampaign.disabled) return;
    createCampaignDeleteDialog({
      campaign,
      opener: event?.currentTarget || null,
      onDelete: async () => {
        await actions.deleteCampaign?.({
          campaignId: campaign.id,
          saveId: campaign.activeTimeline?.saveId || null
        });
        selectedRecordKey = `package:${ASHES_V1_PACKAGE_ID}`;
        campaignPanelMode = 'browser';
        await actions.refresh?.();
      }
    });
  });
  commands.appendChild(deleteCampaign);
  detail.appendChild(commands);
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
  const hero = createElement('section', `campaign-hero campaign-browser-hero campaign-library-hero${unavailable ? ' is-coming-later' : ''}`);
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
  bindReactiveHeroOrbit(hero);
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
  const activeCampaign = model.campaigns.find((campaign) => campaign.active) || null;
  const activeCampaignId = activeCampaign?.id || null;
  if (activeCampaignId && activeCampaignId !== lastActiveCampaignId) campaignPanelMode = 'dashboard';
  lastActiveCampaignId = activeCampaignId;
  if (activeCampaign && campaignPanelMode !== 'browser') {
    campaignPanelMode = 'dashboard';
    const dashboard = createElement('section', 'directive-expanded-campaign campaign-layout campaign-dashboard');
    dashboard.dataset.campaignView = 'dashboard';
    dashboard.dataset.directiveScrollOwner = 'true';
    const heading = createElement('header', 'campaign-dashboard-heading');
    const title = createElement('h2');
    title.textContent = 'Current Campaign';
    const campaigns = createButton({
      label: 'Campaigns',
      className: 'campaign-command campaign-browser-command',
      onClick: () => {
        campaignPanelMode = 'browser';
        body.replaceChildren?.();
        renderCampaignPanel(body, view, actions);
        focusCampaignAction(body, 'back-to-current');
      }
    });
    campaigns.dataset.campaignAction = 'campaigns';
    heading.append(title, campaigns);
    dashboard.appendChild(heading);
    const pack = model.packages.find((candidate) => candidate.packageId === activeCampaign.packageId);
    appendCampaignDetail(dashboard, activeCampaign, pack, actions, {
      dashboard: true,
      time: model.time,
      focusRoot: body
    });
    body.appendChild(dashboard);
    return;
  }
  campaignPanelMode = 'browser';
  const defaultKey = model.selectedCampaignId
    ? `campaign:${model.selectedCampaignId}`
    : `package:${model.packages.find((pack) => !pack.disabled)?.packageId || ''}`;
  if (!selectedRecordKey) selectedRecordKey = defaultKey;

  const browser = createElement('section', 'campaign-browser');
  browser.dataset.campaignView = 'browser';
  if (activeCampaign) {
    const browserHead = createElement('header', 'campaign-browser-heading');
    const browserTitle = createElement('h2');
    browserTitle.textContent = 'Campaigns';
    const back = createButton({
      label: 'Back to Current Campaign',
      className: 'campaign-command campaign-browser-back-command',
      onClick: () => {
        campaignPanelMode = 'dashboard';
        body.replaceChildren?.();
        renderCampaignPanel(body, view, actions);
        focusCampaignAction(body, 'campaigns');
      }
    });
    back.dataset.campaignAction = 'back-to-current';
    browserHead.append(browserTitle, back);
    browser.appendChild(browserHead);
  }
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
  appendRecordDetail(detail, selectedRecordKey, model, actions, { focusRoot: body });

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
    appendRecordDetail(recordDetail, key, model, actions, { compactIdentity: true, focusRoot: body });
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
      appendRecordDetail(detail, key, model, actions, { focusRoot: body });
      mobileRecords.find((record) => record.key === key)?.trigger.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  });

  surface.append(master, detail, mobile);
  browser.appendChild(surface);
  body.appendChild(browser);
}
