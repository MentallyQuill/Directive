import assert from 'node:assert/strict';

import {
  __missionComponentsTestHooks,
  addMissionComponent,
  archiveMissionComponent,
  matchMissionComponentSourceText,
  missionComponentsState,
  prepareMissionComponentSelection,
  updateMissionComponent
} from '../../src/runtime/mission-components.mjs';
import { __directiveRuntimeAppTestHooks } from '../../src/runtime/runtime-app.mjs';

const baseState = {
  campaign: {
    id: 'campaign-ashes',
    title: 'Ashes of Peace'
  },
  mission: {
    activeMissionId: 'prelude-a-ship-underway'
  },
  knowledgeLedger: {
    schemaVersion: 2,
    facts: [],
    rumors: [],
    contradictions: []
  }
};

const now = '2026-06-26T21:10:00.000Z';
const selectedText = 'Coolant seal, port nacelle, junction 7-C. Yard report stated new seal installed. Status: Replacement part fabricated. Installation pending.';

const prepared = await prepareMissionComponentSelection({
  selection: {
    selectedText,
    chatId: 'Directive - Ashes of Peace (57) - 2026-06-25@19h21m03s920ms',
    message: {
      hostMessageId: '15',
      role: 'assistant',
      name: 'Directive - Ashes of Peace (57)',
      outcomeId: 'outcome-briefing-packet',
      ingressId: 'ingress-briefing-packet',
      text: `Briefing packet. ${selectedText}`
    }
  },
  campaignState: baseState,
  packageData: {
    crew: {
      senior: [
        { id: 'imani-cross', name: 'Imani Cross', familyName: 'Cross', billet: 'Chief Engineer' }
      ]
    }
  },
  useProvider: false
});

assert.equal(prepared.ok, true);
assert.equal(prepared.proposal.type, 'shipIssue');
assert.equal(prepared.proposal.status, 'unresolved');
assert.equal(prepared.proposal.sourceAuthority, 'officialPacket');
assert.equal(prepared.source.hostMessageId, '15');
assert.equal(prepared.source.outcomeId, 'outcome-briefing-packet');
assert.equal(prepared.source.ingressId, 'ingress-briefing-packet');
assert.equal(prepared.source.selectionHash.startsWith('h'), true);

const added = addMissionComponent(baseState, {
  ...prepared.proposal,
  verbatim: prepared.selectedText,
  source: prepared.source
}, {
  idFactory: () => 'component:coolant-seal:test',
  now
});

assert.equal(added.component.id, 'component:coolant-seal:test');
assert.equal(added.component.verbatim, selectedText);
assert.equal(added.component.source.hostMessageId, '15');
assert.equal(added.component.source.outcomeId, 'outcome-briefing-packet');
assert.equal(added.component.source.ingressId, 'ingress-briefing-packet');
assert.equal(added.campaignState.knowledgeLedger.components.schemaVersion, 1);
assert.equal(added.campaignState.knowledgeLedger.facts.length, 0);
assert.equal(missionComponentsState(added.campaignState).records.length, 1);
assert.equal(baseState.knowledgeLedger.components, undefined, 'add should not mutate the source state');

const updated = updateMissionComponent(added.campaignState, added.component.id, {
  title: 'Edited coolant seal title',
  summary: 'Edited summary.',
  verbatim: 'Attempted source overwrite.',
  source: {
    hostMessageId: '99',
    selectionHash: 'bad',
    sourceStatus: 'stale'
  }
}, {
  now: '2026-06-26T21:11:00.000Z'
});

assert.equal(updated.component.title, 'Edited coolant seal title');
assert.equal(updated.component.summary, 'Edited summary.');
assert.equal(updated.component.verbatim, selectedText, 'update must preserve verbatim source evidence');
assert.equal(updated.component.source.hostMessageId, '15', 'update must preserve source message anchor');
assert.equal(updated.component.source.selectionHash, added.component.source.selectionHash, 'selection hash is immutable');
assert.equal(updated.component.source.sourceStatus, 'stale', 'source status metadata can be updated for reconciliation');
assert.equal(updated.component.lifecycle.createdAt, now);
assert.equal(updated.component.lifecycle.updatedAt, '2026-06-26T21:11:00.000Z');

const archived = archiveMissionComponent(updated.campaignState, added.component.id, {
  now: '2026-06-26T21:12:00.000Z'
});

assert.equal(archived.component.status, 'archived');
assert.equal(archived.component.lifecycle.archivedAt, '2026-06-26T21:12:00.000Z');
assert.equal(missionComponentsState(archived.campaignState).records.length, 1, 'archive should not delete the record');

const playerPrepared = await prepareMissionComponentSelection({
  selection: {
    selectedText: "I'll start with Cross in Engineering.",
    chatId: 'Directive - Ashes of Peace (57)',
    message: {
      hostMessageId: '16',
      role: 'user',
      text: "I'll start with Cross in Engineering."
    }
  },
  campaignState: baseState,
  useProvider: false
});

assert.equal(playerPrepared.proposal.sourceAuthority, 'playerObservation');
assert.equal(playerPrepared.proposal.type, 'lead');

const playerSource = __missionComponentsTestHooks.sourceFromSelection({
  selectedText: 'Sam prepares his first question for Commander Cross.',
  chatId: 'Directive - Ashes of Peace (57)',
  selectionStart: 14,
  selectionEnd: 63,
  message: {
    hostMessageId: '21',
    text: 'Sam prepares his first question for Commander Cross.',
    isUser: true,
    name: 'User'
  }
});
assert.equal(playerSource.source.messageRole, 'user');
assert.equal(playerSource.source.selectionStart, 14);
assert.equal(playerSource.source.selectionEnd, 63);
const playerProposal = __missionComponentsTestHooks.proposalFromSelectedText({
  selectedText: playerSource.selectedText,
  source: playerSource.source,
  message: playerSource.message
});
assert.equal(playerProposal.sourceAuthority, 'playerObservation');

const renderedSelection = 'Coolant seal, port nacelle, junction 7-C. Yard report stated new seal installed. Status: Replacement part fabricated.';
const rawMarkdownSource = '**Coolant seal, port nacelle, junction 7-C.** Yard report stated new seal installed. **Status:** Replacement part fabricated.';
const renderedSource = `Official packet rendered text. ${renderedSelection} EPS power distribution follows.`;
const renderedPreferred = matchMissionComponentSourceText(renderedSelection, [
  rawMarkdownSource,
  renderedSource
]);
assert.equal(renderedPreferred.ok, true);
assert.equal(renderedPreferred.match, 'exact');
assert.equal(renderedPreferred.text, renderedSource, 'source matching should prefer exact rendered text when capture provides it');

const markdownOnly = matchMissionComponentSourceText(renderedSelection, [rawMarkdownSource]);
assert.equal(markdownOnly.ok, true);
assert.equal(markdownOnly.match, 'rendered-markdown', 'raw Markdown source should validate rendered user selections');

const yardWorkRenderedSelection = `OPEN ITEMS — YARD WORK DISCREPANCIES (Flagged by Lt. Cmdr. Cross)

Plasma relay junction, Deck Nine, Section 4. Yard report stated full replacement. Cross inspection found original junction with refurbished casing. Status: Corrected in transit by Engineering team. Cross requests formal amendment to yard record.

Coolant seal, port nacelle, junction 7-C. Yard report stated new seal installed. Seal is holding within tolerance but shows micro-fracture pattern consistent with age. Cross assessment: will fail within 200 hours of sustained warp six or above. Status: Replacement part fabricated. Installation pending — Cross wants to do it during a scheduled stop, not during transit.

EPS power distribution, Deck Five. Three conduits routed differently than original specifications. Cross believes yard crew improvised during reinstallation. Function is nominal but routing doesn't match schematics. Status: Open. Cross has flagged for physical inspection during next maintenance window.

Shuttlebay two magnetic clamp assembly. One of four clamps re-tensioned below spec. Shuttle operations safe but clamp three will need recalibration. Status: Open. Low priority.

Environmental systems, Deck Seven. Humidity control cycling erratically in crew quarters section 7-B. Crew complaints logged. Yard replaced the controller but problem persists. Status: Open. Cross suspects the controller wasn't the problem.

Deflector dish alignment. Within tolerance but at the outer edge. Saye has noted minor sensor ghosting that may correlate. Cross disagrees — attributes sensor variance to software. Status: Open. Disputed between Engineering and Science.`;
const yardWorkRawMarkdown = `**OPEN ITEMS — YARD WORK DISCREPANCIES (Flagged by Lt. Cmdr. Cross)**

1. **Plasma relay junction, Deck Nine, Section 4.** Yard report stated full replacement. Cross inspection found original junction with refurbished casing. *Status: Corrected in transit by Engineering team. Cross requests formal amendment to yard record.*

2. **Coolant seal, port nacelle, junction 7-C.** Yard report stated new seal installed. Seal is holding within tolerance but shows micro-fracture pattern consistent with age. Cross assessment: will fail within 200 hours of sustained warp six or above. *Status: Replacement part fabricated. Installation pending — Cross wants to do it during a scheduled stop, not during transit.*

3. **EPS power distribution, Deck Five.** Three conduits routed differently than original specifications. Cross believes yard crew improvised during reinstallation. Function is nominal but routing doesn't match schematics. *Status: Open. Cross has flagged for physical inspection during next maintenance window.*

4. **Shuttlebay two magnetic clamp assembly.** One of four clamps re-tensioned below spec. Shuttle operations safe but clamp three will need recalibration. *Status: Open. Low priority.*

5. **Environmental systems, Deck Seven.** Humidity control cycling erratically in crew quarters section 7-B. Crew complaints logged. Yard replaced the controller but problem persists. *Status: Open. Cross suspects the controller wasn't the problem.*

6. **Deflector dish alignment.** Within tolerance but at the outer edge. Saye has noted minor sensor ghosting that may correlate. Cross disagrees — attributes sensor variance to software. *Status: Open. Disputed between Engineering and Science.*`;
const renderedListMatch = matchMissionComponentSourceText(yardWorkRenderedSelection, [yardWorkRawMarkdown]);
assert.equal(renderedListMatch.ok, true, 'rendered multi-item selections should match raw Markdown ordered lists');
assert.equal(renderedListMatch.match, 'rendered-markdown');

const resolvedOffByOneSource = __directiveRuntimeAppTestHooks.findMissionComponentSourceMessageMatch({
  selectedText: yardWorkRenderedSelection,
  preferredMessageId: '14',
  fallbackMessage: {
    hostMessageId: '14',
    text: `The terminal display shifted.\n\n${yardWorkRenderedSelection}\n\nSam scrolled further.`
  },
  messages: [
    {
      hostMessageId: '14',
      index: 14,
      text: 'Sam found his small bag of personal items and opened up the briefing packet file.'
    },
    {
      hostMessageId: '15',
      index: 15,
      text: `The terminal display shifted.\n\n${yardWorkRawMarkdown}\n\nSam scrolled further.`
    }
  ]
});
assert.equal(resolvedOffByOneSource.ok, true, 'source resolution should recover when rendered mesid points one row before the raw host message');
assert.equal(resolvedOffByOneSource.message.hostMessageId, '15');
assert.equal(resolvedOffByOneSource.matchedFullMessage, true);

const staleSelection = matchMissionComponentSourceText('Coolant seal was replaced yesterday.', [rawMarkdownSource]);
assert.equal(staleSelection.ok, false, 'changed selections should still be rejected');

const guardedProvider = await prepareMissionComponentSelection({
  selection: {
    selectedText,
    chatId: 'Directive - Ashes of Peace (57)',
    message: {
      hostMessageId: '17',
      role: 'assistant',
      text: `Briefing packet. ${selectedText}`
    }
  },
  campaignState: baseState,
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          content: {
            title: 'Coolant seal micro-fracture',
            type: 'shipIssue',
            status: 'active',
            sourceAuthority: 'systemStatus',
            summary: selectedText,
            tags: ['engineering'],
            links: {}
          }
        }
      };
    }
  }
});

assert.equal(guardedProvider.proposal.status, 'unresolved', 'provider should not soften unresolved ship issues to active');
assert.equal(guardedProvider.proposal.sourceAuthority, 'officialPacket', 'provider should not downgrade report/packet sources to system status');

const guardedSummaryAndLinks = await prepareMissionComponentSelection({
  selection: {
    selectedText,
    chatId: 'Directive - Ashes of Peace (57)',
    message: {
      hostMessageId: '18',
      role: 'assistant',
      text: `Briefing packet. ${selectedText}`
    }
  },
  campaignState: baseState,
  packageData: {
    crew: {
      senior: [
        { id: 'imani-cross', name: 'Imani Cross', familyName: 'Cross', billet: 'Chief Engineer' }
      ]
    }
  },
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          content: {
            title: 'Coolant seal micro-fracture',
            type: 'shipIssue',
            status: 'unresolved',
            sourceAuthority: 'officialPacket',
            summary: 'Cross privately confirms the yard captain falsified the refit paperwork and Sam already ordered a full stop.',
            tags: ['engineering'],
            links: {
              crewIds: ['imani-cross', 'unknown-officer'],
              shipSystemIds: ['ship.port-nacelle', 'ship.unknown-system'],
              missionIds: ['prelude-a-ship-underway', 'unknown-mission']
            }
          }
        }
      };
    }
  }
});
assert.equal(
  guardedSummaryAndLinks.proposal.summary,
  selectedText,
  'provider summaries that add unsupported facts should fall back to selected text'
);
assert.deepEqual(guardedSummaryAndLinks.proposal.links.crewIds, []);
assert.deepEqual(guardedSummaryAndLinks.proposal.links.shipSystemIds, ['ship.port-nacelle']);
assert.deepEqual(guardedSummaryAndLinks.proposal.links.missionIds, ['prelude-a-ship-underway']);
assert.equal(
  guardedSummaryAndLinks.proposal.warnings.some((warning) => /outside the selected text/i.test(warning)),
  true
);

console.log('test-mission-components: ok');
