import { appendEmpty, createButton, createElement } from './runtime-ui-kit.js';
import { createPackageImage } from './directive-media.js';
import {
  ASHES_V1_PACKAGE_ID,
  createV1CampaignPanelModel
} from './v1-player-facing-panel-model.mjs';

export function resetCampaignPanelState() {
  // V1 Campaign has no hidden selection state.
}

function packageId(pack = {}) {
  return String(pack.packageId || pack.id || pack.manifest?.id || '').trim();
}

function packageTitle(pack = {}) {
  return String(pack.campaign?.title || pack.title || pack.manifest?.title || 'Campaign').trim();
}

function packageSummary(pack = {}) {
  return String(
    pack.campaign?.highConcept
    || pack.campaign?.premise
    || pack.premise
    || pack.summary
    || ''
  ).trim();
}

function packageImage(pack, variant = 'card') {
  return createPackageImage(pack, {
    kind: pack.image?.kind || 'ship.hero',
    subjectId: pack.image?.subjectId || pack.ship?.id || packageId(pack),
    variant
  }, {
    wrapperClass: 'directive-v1-campaign-media',
    label: packageTitle(pack),
    loading: 'lazy'
  });
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

function createPackageCard(pack, actions) {
  const available = pack.available === true;
  const card = createElement('article', `directive-v1-campaign-package${available ? '' : ' is-unavailable'}`);
  card.dataset.packageId = packageId(pack);
  card.appendChild(packageImage(pack));
  const copy = createElement('div', 'directive-v1-campaign-package-copy');
  const state = createElement('span', 'directive-v1-kicker');
  state.textContent = available ? 'Playable in V1' : 'Coming later';
  const title = createElement('h3');
  title.textContent = packageTitle(pack);
  const summary = createElement('p');
  summary.textContent = packageSummary(pack) || (available
    ? 'Begin the Ashes of Peace campaign aboard the U.S.S. Breckenridge.'
    : 'This campaign will become playable after its V1-native story data is complete.');
  copy.append(state, title, summary);

  const commands = createElement('div', 'directive-v1-campaign-commands');
  if (available && pack.actions?.resumeDraft) {
    commands.appendChild(createButton({
      label: 'Continue setup',
      icon: 'fa-solid fa-user-pen',
      className: 'directive-button directive-primary-command',
      onClick: () => runAndRefresh(actions.resumeCreatorDraft, { draftId: pack.actions.resumeDraft }, actions)
    }));
  } else {
    commands.appendChild(createButton({
      label: available ? 'Start campaign' : 'Unavailable',
      icon: available ? 'fa-solid fa-play' : 'fa-solid fa-lock',
      className: 'directive-button directive-primary-command',
      disabled: !available || pack.actions?.startNewCampaign === false,
      onClick: available
        ? () => runAndRefresh(actions.startCreatorDraft, { packageId: ASHES_V1_PACKAGE_ID }, actions)
        : null
    }));
  }
  copy.appendChild(commands);
  card.appendChild(copy);
  return card;
}

function createCheckpoint(campaign, checkpoint, actions) {
  const row = createElement('li', 'directive-v1-checkpoint');
  const copy = createElement('div');
  const title = createElement('strong');
  title.textContent = checkpoint.name;
  const meta = createElement('span');
  meta.textContent = [checkpoint.chapter, checkpoint.stardate, formatDate(checkpoint.createdAt)].filter(Boolean).join(' / ');
  copy.append(title, meta);
  const commands = createElement('div', 'directive-v1-checkpoint-actions');
  commands.appendChild(createButton({
    label: 'Load',
    className: 'directive-button directive-secondary-command',
    disabled: checkpoint.loadable !== true,
    onClick: () => runAndRefresh(actions.loadCheckpoint, {
      campaignId: campaign.id,
      checkpointId: checkpoint.id
    }, actions)
  }));
  commands.appendChild(createButton({
    label: 'Delete',
    className: 'directive-button directive-secondary-command',
    onClick: async () => {
      const confirmed = typeof globalThis.confirm !== 'function'
        || globalThis.confirm(`Delete checkpoint "${checkpoint.name}"?`);
      if (!confirmed) return;
      await runAndRefresh(actions.deleteSave, {
        campaignId: campaign.id,
        checkpointId: checkpoint.id
      }, actions);
    }
  }));
  row.append(copy, commands);
  return row;
}

function createCampaignCard(campaign, actions) {
  const card = createElement('article', 'directive-v1-active-campaign');
  const header = createElement('header');
  const copy = createElement('div');
  const state = createElement('span', 'directive-v1-kicker');
  state.textContent = campaign.active ? 'Current campaign' : 'Campaign';
  const title = createElement('h3');
  title.textContent = campaign.title;
  const meta = createElement('p');
  meta.textContent = [campaign.playerName, campaign.playerRole, campaign.shipName].filter(Boolean).join(' / ');
  copy.append(state, title, meta);
  const commands = createElement('div', 'directive-v1-campaign-commands');
  if (campaign.canOpenChat) {
    commands.appendChild(createButton({
      label: 'Continue',
      icon: 'fa-solid fa-arrow-right',
      className: 'directive-button directive-primary-command',
      onClick: () => runAndRefresh(actions.openCampaignChat, {
        saveId: campaign.activeTimeline?.saveId
      }, actions)
    }));
  }
  if (campaign.canSaveGame) {
    commands.appendChild(createButton({
      label: 'Save checkpoint',
      icon: 'fa-solid fa-bookmark',
      className: 'directive-button directive-secondary-command',
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
  header.append(copy, commands);
  card.appendChild(header);

  if (campaign.premise || campaign.chapter) {
    const detail = createElement('p', 'directive-v1-active-campaign-summary');
    detail.textContent = campaign.chapter || campaign.premise;
    card.appendChild(detail);
  }
  const updated = createElement('p', 'directive-v1-active-campaign-updated');
  updated.textContent = `Last played ${formatDate(campaign.lastPlayedAt)}`;
  card.appendChild(updated);

  if (campaign.checkpoints?.length) {
    const section = createElement('section', 'directive-v1-checkpoints');
    const heading = createElement('h4');
    heading.textContent = 'Checkpoints';
    const list = createElement('ul');
    campaign.checkpoints.forEach((checkpoint) => list.appendChild(createCheckpoint(campaign, checkpoint, actions)));
    section.append(heading, list);
    card.appendChild(section);
  }
  return card;
}

export function renderCampaignPanel(body, view, actions = {}) {
  const model = createV1CampaignPanelModel(view);
  const surface = createElement('div', 'directive-v1-campaign');

  if (model.campaigns.length) {
    const current = createElement('section', 'directive-v1-campaign-section');
    const heading = createElement('header', 'directive-v1-roster-heading');
    const kicker = createElement('span', 'directive-v1-kicker');
    kicker.textContent = 'Your stories';
    const title = createElement('h2');
    title.textContent = 'Campaigns';
    heading.append(kicker, title);
    const list = createElement('div', 'directive-v1-active-campaigns');
    model.campaigns.forEach((campaign) => list.appendChild(createCampaignCard(campaign, actions)));
    current.append(heading, list);
    surface.appendChild(current);
  }

  const library = createElement('section', 'directive-v1-campaign-section');
  const heading = createElement('header', 'directive-v1-roster-heading');
  const kicker = createElement('span', 'directive-v1-kicker');
  kicker.textContent = 'Story library';
  const title = createElement('h2');
  title.textContent = 'Choose a campaign';
  heading.append(kicker, title);
  const packages = createElement('div', 'directive-v1-campaign-packages');
  model.packages.forEach((pack) => packages.appendChild(createPackageCard(pack, actions)));
  if (!model.packages.length) appendEmpty(packages, 'No V1 campaign packages are installed.');
  library.append(heading, packages);
  surface.appendChild(library);
  body.appendChild(surface);
}
