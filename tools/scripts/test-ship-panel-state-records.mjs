import assert from 'node:assert/strict';

import { renderShipPanel } from '../../src/ui/ship-panel.js';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.className = '';
    this.title = '';
  }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === 'class') this.className = normalized;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = normalized;
    }
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

function textOf(element) {
  return [
    element.textContent || '',
    ...element.children.map(textOf)
  ].join(' ').replace(/\s+/g, ' ').trim();
}

function allElements(element) {
  return [
    element,
    ...element.children.flatMap(allElements)
  ];
}

function elementsByClass(element, className) {
  return allElements(element).filter((item) => String(item.className || '').split(/\s+/).includes(className));
}

globalThis.document = new FakeDocument();

const body = document.createElement('main');
renderShipPanel(body, {
  activePackage: {
    ship: {
      id: 'uss-breckenridge',
      name: 'U.S.S. Breckenridge',
      class: 'Intrepid-class',
      affiliation: 'Starfleet',
      openingCondition: 'Returned to service after repair.',
      commandStructure: {
        commandingOfficer: 'mara-whitaker',
        playerBillet: 'Executive Officer',
        actingXoBeforePlayer: 'hadrik-bronn',
        captainRetainsFinalAuthority: true
      },
      systems: {
        knownTechnicalDebt: [
          {
            id: 'integrated-validation',
            label: 'Integrated validation pending',
            playerSafeSummary: 'Integrated validation still required under sustained deployment conditions.',
            status: 'active'
          }
        ]
      }
    },
    crew: {
      senior: [
        {
          id: 'mara-whitaker',
          name: 'Mara Whitaker',
          rank: 'Captain',
          billet: 'Commanding Officer'
        },
        {
          id: 'hadrik-bronn',
          name: 'Hadrik Bronn',
          rank: 'Lieutenant Commander',
          billet: 'Chief Tactical and Security Officer'
        }
      ]
    }
  },
  campaignState: {
    campaign: {
      title: 'Ashes of Peace'
    },
    player: {
      name: 'Talia Serrin',
      rank: 'Commander',
      billet: 'Executive Officer'
    },
    ship: {
      id: 'uss-breckenridge',
      name: 'U.S.S. Breckenridge',
      class: 'Intrepid-class',
      condition: 'Returned to service after repair.',
      damage: [
        { id: 'hidden-damage', summary: 'Hidden damage should not render.', visibility: 'hidden' }
      ],
      activeRestrictions: [
        {
          id: 'warp-temporary-limit',
          summary: 'Maximum warp is temporarily restricted pending integrated validation.',
          playerVisible: true,
          detectorScore: 'hidden implementation detail'
        },
        {
          id: 'hidden-restriction',
          summary: 'Hidden restriction should not render.',
          visibility: 'hidden'
        }
      ],
      technicalDebt: [
        {
          id: 'certificate-compatibility',
          playerSafeSummary: 'Command-network certificate compatibility issue remains open.',
          status: 'active'
        }
      ]
    }
  }
});

const renderedText = textOf(body);
assert.match(renderedText, /Maximum warp is temporarily restricted pending integrated validation/);
assert.match(renderedText, /Command-network certificate compatibility issue remains open/);
assert.match(renderedText, /Known Technical Debt/);
assert.match(renderedText, /Operating Restrictions/);
assert.match(renderedText, /1 restriction affects current operations/);
assert.doesNotMatch(renderedText, /\[object Object\]/);
assert.doesNotMatch(renderedText, /Bridge Authority/);
assert.doesNotMatch(renderedText, /Hidden restriction should not render|Hidden damage should not render|hidden implementation detail/);
assert.equal(elementsByClass(body, 'directive-ship-readiness-folder').length, 3);
const readinessMarkers = elementsByClass(body, 'directive-ship-readiness-item-marker');
assert.ok(readinessMarkers.length > 0, 'readiness rows should include decorative severity markers');
for (const marker of readinessMarkers) {
  assert.equal(marker.attributes.get('aria-hidden'), 'true');
  assert.equal(elementsByClass(marker, 'fa-angle-right').length, 0, 'readiness row markers should render as CSS boxes, not arrow icons');
}
assert.equal(elementsByClass(body, 'directive-ship-command-card').length, 0);
assert.equal(elementsByClass(body, 'directive-ship-caveat-card').length, 0);

delete globalThis.document;

console.log('Ship panel state record tests passed: object caveats render in readiness folders without hidden leakage');
