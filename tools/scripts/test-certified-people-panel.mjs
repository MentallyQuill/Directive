import assert from 'node:assert/strict';
import { renderCrewPanel, resetCrewPanelState } from '../../src/ui/crew-panel.js';

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.scrollTop = 0;
    this.replaceChildrenCount = 0;
    const classes = () => new Set(this.className.split(/\s+/).filter(Boolean));
    const writeClasses = (values) => { this.className = [...values].join(' '); };
    this.classList = {
      add: (...names) => { const values = classes(); names.forEach((name) => values.add(name)); writeClasses(values); },
      remove: (...names) => { const values = classes(); names.forEach((name) => values.delete(name)); writeClasses(values); },
      contains: (name) => classes().has(name),
      toggle: (name, force) => {
        const values = classes();
        const enabled = force === undefined ? !values.has(name) : Boolean(force);
        if (enabled) values.add(name); else values.delete(name);
        writeClasses(values);
        return enabled;
      }
    };
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) {
    this.replaceChildrenCount += 1;
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    this.append(...children);
  }
  replaceChild(next, previous) {
    const index = this.children.indexOf(previous);
    if (index < 0) return null;
    previous.parentNode = null;
    next.parentNode = this;
    this.children[index] = next;
    return previous;
  }
  remove() {
    const parent = this.parentNode;
    if (!parent) return;
    parent.children = parent.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
}

globalThis.document = {
  createElement: (tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text })
};

const projection = {
  branchId: 'save.current',
  kind: 'directive.playerProjection.v1',
  player: {
    kind: 'directive.playerIdentityProjection.v1', playerId: 'player.sam', name: 'Sam Vickers', rank: 'Commander', billet: 'Executive Officer',
    species: { label: 'Human' }, appearance: 'Attentive and deliberate.', dossier: { briefBiography: 'Visible biography.' }, portrait: null
  },
  mission: { kind: 'directive.missionPlayerProjection.v1', missionId: 'mission.prelude', objectives: [] },
  people: {
    kind: 'directive.peoplePlayerProjection.v1',
    people: [{
      id: 'person.whitaker', name: 'Mara Whitaker', billet: 'Commanding Officer', categoryId: 'ships-company',
      portrait: { kind: 'crew.portrait.formal', subjectId: 'person.whitaker' },
      service: { organization: 'starfleet', department: 'command', rankCode: 'captain', rankLabel: 'Captain' },
      profileSummary: 'Visible profile.', relationshipPosture: 'Watchful', moments: []
    }]
  },
  ship: { kind: 'directive.shipPlayerProjection.v1', shipId: 'ship.breckenridge' },
  commandBearing: {
    kind: 'directive.commandBearingPlayerProjection.v1', balance: 1, capacity: 3, latestAwardReason: null, pendingEdge: null, latestSpend: null
  }
};

const body = new Element('div');
resetCrewPanelState();
const packageData = { assets: { images: [{
  id: 'crew.whitaker', kind: 'crew.portrait.formal', subjectId: 'person.whitaker',
  variants: { thumb: 'whitaker-thumb.webp', detail: 'whitaker-detail.webp' }, alt: 'Mara Whitaker'
}] } };
const view = {
  campaignState: { campaign: { id: 'campaign.ashes' } },
  activeSaveId: 'save.current',
  currentChatActivePackage: packageData,
  v1PlayerProjection: projection
};
renderCrewPanel(body, view, { reserveCommandBearingEdge() {} });

const all = (root) => [root, ...root.children.flatMap(all)];
const nodes = all(body);
const byClass = (className) => nodes.filter((node) => node.className.split(/\s+/).includes(className));
const firstIndex = (className) => nodes.findIndex((node) => node.className.split(/\s+/).includes(className));
const text = nodes.map((node) => node.textContent || '').join(' ');

assert.equal(byClass('people-route').length, 1);
assert.equal(byClass('people-layout').length, 1);
assert.equal(byClass('people-roster').length, 1);
assert.equal(byClass('people-detail').length, 2, 'desktop detail and the open phone record share the same person model');
assert.equal(byClass('people-collection-toolbar').length, 2);
assert.equal(byClass('collection-category').length, 2);
assert.equal(byClass('collection-drag-handle').length >= 6, true);
assert.equal(byClass('collection-person-drag-handle').length, 4, 'desktop and mobile person records use the person-only handle');
const categoryHandles = byClass('collection-category-head')
  .flatMap((head) => head.children)
  .filter((node) => node.className.split(/\s+/).includes('collection-drag-handle'));
assert.equal(categoryHandles.length > 0, true);
assert.equal(categoryHandles.some((node) => node.className.split(/\s+/).includes('collection-person-drag-handle')), false, 'category handles retain their existing presentation');
assert.equal(byClass('people-row-image').length, 2);
assert.equal(byClass('mobile-crew-avatar').length, 2);
assert.equal(byClass('directive-command-bearing-strip').length, 1);
assert.ok(firstIndex('directive-command-bearing-strip') < firstIndex('people-layout'));
assert.equal(nodes.filter((node) => node.dataset.directiveScrollOwner === 'true').length, 3, 'desktop list/detail and mobile accordion each own their bounded scroll region');
assert.match(text, /1 of 3 available/);
assert.match(text, /Sam Vickers/);
assert.match(text, /Mara Whitaker/);
assert.doesNotMatch(text, /Marks|Ranks|Resolve|Inspiration/);

const originalScrollOwner = byClass('people-journal-host')[0];
originalScrollOwner.scrollTop = 237;
const replacementCount = body.replaceChildrenCount;
const whitakerMobileToggle = nodes.find((node) => node.dataset.personId === 'person.whitaker' && node.className.split(/\s+/).includes('mobile-accordion-toggle'));
whitakerMobileToggle.listeners.get('click')();
const mobileSelection = all(body);
assert.equal(body.replaceChildrenCount, replacementCount, 'mobile disclosure must not rebuild the People panel');
assert.equal(mobileSelection.includes(originalScrollOwner), true, 'mobile disclosure must retain the original scroll owner');
assert.equal(originalScrollOwner.scrollTop, 237, 'mobile disclosure must preserve roster scroll position');
assert.deepEqual(
  mobileSelection
    .filter((node) => node.className.split(/\s+/).includes('mobile-crew-item') && node.className.split(/\s+/).includes('is-open'))
    .map((node) => node.dataset.personId),
  ['person.whitaker'],
  'mobile disclosure keeps exactly the selected record open'
);
assert.equal(whitakerMobileToggle.attributes.get('aria-expanded'), 'true');
assert.equal(
  mobileSelection.find((node) => node.dataset.personId === 'person.whitaker' && node.className.split(/\s+/).includes('collection-person-row') && node.className.split(/\s+/).includes('active')) !== undefined,
  true,
  'mobile selection synchronizes the desktop roster state'
);

const whitakerRow = mobileSelection.find((node) => node.dataset.personId === 'person.whitaker' && node.className.split(/\s+/).includes('people-row'));
whitakerRow.listeners.get('click')();
const rerendered = all(body);
const detailPortrait = rerendered.find((node) => node.className.split(/\s+/).includes('people-detail-portrait'));
const detailImage = all(detailPortrait).find((node) => node.tagName === 'IMG');
assert.match(detailImage.src, /whitaker-detail\.webp$/);

console.log('PASS certified People panel');
