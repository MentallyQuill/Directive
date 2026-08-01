import { createPackageImage } from './directive-media.js';
import { appendEmpty, createButton, createElement } from './runtime-ui-kit.js';

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, fallback = '') {
  const result = String(value || '').trim();
  return result || fallback;
}

function packageId(pack = {}) {
  return text(pack.packageId || pack.id || pack.manifest?.id);
}

function packageTitle(pack = {}) {
  return text(pack.campaign?.title || pack.title || pack.manifest?.title || packageId(pack), 'Campaign');
}

function packageHook(pack = {}) {
  return text(pack.hook || pack.campaign?.highConcept || pack.campaign?.premise || pack.premise || pack.summary || pack.description);
}

function packageImageQuery(pack = {}, variant = 'card') {
  const image = pack.image || pack.heroImage || {};
  return {
    kind: image.kind || 'ship.hero',
    subjectId: image.subjectId || pack.ship?.id || packageId(pack),
    variant
  };
}

function packageImage(pack, variant, wrapperClass) {
  return createPackageImage(pack, packageImageQuery(pack, variant), {
    wrapperClass,
    label: packageTitle(pack),
    icon: 'fa-solid fa-shuttle-space',
    loading: variant === 'hero' ? 'eager' : 'lazy'
  });
}

function packageStatus(pack = {}) {
  if (pack.active) return 'Active campaign';
  if (pack.actions?.resumeDraft) return 'Draft in progress';
  if (pack.runtimeAssets?.hasProjection === false) return 'Import incomplete';
  return text(pack.status, 'Ready to start');
}

function packageIdentityCue(pack = {}) {
  return text(pack.identityCue || pack.campaign?.theater || pack.theater || pack.ship?.name || pack.ship?.class);
}

export function campaignBrowserSelection(packages = [], selectedId = '') {
  const rows = asArray(packages);
  const requested = text(selectedId);
  return rows.find((pack) => packageId(pack) === requested) || rows[0] || null;
}

function createDetailField(label, value, className = '') {
  const field = createElement('div', `campaign-browser-field${className ? ` ${className}` : ''}`);
  field.dataset.campaignField = label.toLowerCase().replace(/\s+/g, '-');
  const key = createElement('span');
  key.textContent = label;
  const content = createElement('strong');
  content.textContent = text(value, 'Not specified');
  field.append(key, content);
  return field;
}

function createShapeText(pack = {}) {
  const shape = pack.structure || pack.campaign?.structure || {};
  const pieces = [
    shape.expectedSessions ? `${shape.expectedSessions} expected sessions` : '',
    shape.mainQuestCount ? `${shape.mainQuestCount} main arcs` : '',
    shape.sideQuestCount ? `${shape.sideQuestCount} side threads` : ''
  ].filter(Boolean);
  return pieces.join(' · ');
}

function createAction(label, action, pack, actions, close, {
  kind,
  icon = '',
  disabled = false,
  payload = null
} = {}) {
  const button = createButton({
    label,
    icon,
    className: `campaign-browser-action${kind === 'secondary' ? ' secondary' : ''}`,
    disabled,
    onClick: async () => {
      if (typeof action !== 'function') {
        close?.();
        return;
      }
      await action(payload || { packageId: packageId(pack) });
      await actions?.refresh?.();
      close?.();
    }
  });
  button.dataset.campaignAction = kind;
  button.setAttribute('data-campaign-action', kind);
  return button;
}

function renderDetail(detail, pack, actions, close) {
  detail.replaceChildren?.();
  if (!pack) {
    appendEmpty(detail, 'Select a campaign package to see its details.');
    return;
  }
  detail.dataset.campaignPackageId = packageId(pack);
  detail.setAttribute('data-campaign-package-id', packageId(pack));
  const hero = createElement('div', 'campaign-browser-hero');
  hero.appendChild(packageImage(pack, 'hero', 'campaign-browser-hero-media'));
  const heroCopy = createElement('div', 'campaign-browser-hero-copy');
  const status = createElement('span', 'campaign-browser-status');
  status.textContent = packageStatus(pack);
  const title = createElement('h4', 'campaign-browser-title');
  title.textContent = packageTitle(pack);
  const cue = createElement('p', 'campaign-browser-identity');
  cue.textContent = packageIdentityCue(pack);
  heroCopy.append(status, title, cue);
  hero.appendChild(heroCopy);

  const body = createElement('div', 'campaign-browser-detail-body');
  const hook = createElement('p', 'campaign-browser-hook');
  hook.dataset.campaignField = 'hook';
  hook.textContent = packageHook(pack) || 'No campaign hook has been provided.';
  const fields = createElement('div', 'campaign-browser-fields');
  fields.append(
    createDetailField('Setting', pack.theater || pack.campaign?.theater),
    createDetailField('Era', pack.eraLabel || pack.campaign?.eraLabel),
    createDetailField('Ship', pack.ship?.name || pack.ship?.class),
    createDetailField('Player role', pack.playerRole?.label || pack.playerRole?.billet || pack.characterCreation?.lockedRole?.roleLabel),
    createDetailField('Campaign shape', createShapeText(pack))
  );
  const openingHook = text(pack.openingHook || pack.campaign?.openingHook || pack.campaign?.openingHookText);
  if (openingHook) {
    const opening = createElement('p', 'campaign-browser-opening-hook');
    opening.dataset.campaignField = 'opening-hook';
    opening.textContent = openingHook;
    body.appendChild(opening);
  }

  const commands = createElement('div', 'campaign-browser-actions');
  commands.appendChild(createAction('Start Campaign', actions?.startCreatorDraft, pack, actions, close, {
    kind: 'start',
    icon: 'fa-solid fa-play',
    disabled: pack.actions?.startNewCampaign === false || pack.runtimeAssets?.hasProjection === false
  }));
  if (pack.actions?.resumeDraft && typeof actions?.resumeCreatorDraft === 'function') {
    commands.appendChild(createAction('Continue Character Setup', actions.resumeCreatorDraft, pack, actions, close, {
      kind: 'continue',
      icon: 'fa-solid fa-user-pen',
      payload: { draftId: pack.actions.resumeDraft }
    }));
  }
  const importPayload = pack.importPayload || pack.actions?.importPackage || null;
  if (importPayload && typeof actions?.importCampaignPackageArchive === 'function') {
    commands.appendChild(createAction('Import Package', actions.importCampaignPackageArchive, pack, actions, close, {
      kind: 'import',
      icon: 'fa-solid fa-file-import',
      payload: importPayload
    }));
  }
  commands.appendChild(createAction('Cancel', null, pack, actions, close, {
    kind: 'cancel',
    icon: 'fa-solid fa-xmark'
  }));

  body.append(hook, fields, commands);
  detail.append(hero, body);
}

export function renderCampaignBrowser(dialog, {
  packages = [],
  actions = {},
  close = null,
  selectedId = ''
} = {}) {
  const rows = asArray(packages);
  dialog.classList?.add?.('directive-campaign-browser-dialog');
  const browser = createElement('div', 'campaign-browser');
  browser.dataset.campaignBrowser = 'true';
  browser.setAttribute('data-campaign-browser', 'true');
  const master = createElement('nav', 'campaign-browser-master');
  master.setAttribute('aria-label', 'Campaign packages');
  const detail = createElement('section', 'campaign-browser-detail');
  detail.dataset.campaignDetail = 'true';
  detail.setAttribute('data-campaign-detail', 'true');
  let selected = campaignBrowserSelection(rows, selectedId);

  const rerenderDetail = () => renderDetail(detail, selected, actions, close);
  if (!rows.length) {
    appendEmpty(master, 'No campaign packages are available.');
    appendEmpty(detail, 'Import a campaign package or return to the campaign route.');
  } else {
    rows.forEach((pack) => {
      const id = packageId(pack);
      const option = createElement('button', 'campaign-browser-package');
      option.type = 'button';
      option.dataset.campaignPackageId = id;
      option.setAttribute('data-campaign-package-id', id);
      option.setAttribute('aria-selected', selected === pack ? 'true' : 'false');
      option.append(packageImage(pack, 'thumb', 'campaign-browser-thumb'));
      const copy = createElement('span', 'campaign-browser-package-copy');
      const title = createElement('strong');
      title.textContent = packageTitle(pack);
      const cue = createElement('small');
      cue.textContent = packageIdentityCue(pack) || packageStatus(pack);
      copy.append(title, cue);
      option.appendChild(copy);
      option.addEventListener('click', () => {
        selected = pack;
        for (const sibling of master.querySelectorAll?.('[data-campaign-package-id]') || []) {
          sibling.setAttribute('aria-selected', sibling === option ? 'true' : 'false');
        }
        rerenderDetail();
      });
      master.appendChild(option);
    });
    rerenderDetail();
  }
  browser.append(master, detail);
  dialog.appendChild(browser);
  return { browser, master, detail };
}
