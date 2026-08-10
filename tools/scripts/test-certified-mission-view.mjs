import assert from 'node:assert/strict';
import { buildCertifiedMissionView } from '../../src/ui/view-models/certified-mission-view.mjs';

const projection = {
  mission: {
    kind: 'directive.missionPlayerProjection.v1',
    missionId: 'mission.prelude',
    title: 'Prelude: A Ship Underway',
    summary: 'Assume command and establish readiness.',
    status: 'active',
    objectives: [
      {
        id: 'objective.handover',
        class: 'required',
        title: 'Complete the command handover',
        summary: 'Establish working boundaries with Captain Whitaker.',
        status: 'active',
        disposition: null,
        terminalText: null
      },
      {
        id: 'objective.hesperus-rescue',
        class: 'optional',
        title: 'Aid the Hesperus',
        summary: 'Protect the transport and its passengers.',
        status: 'terminal',
        disposition: 'completed',
        terminalText: 'The passengers are safe.'
      }
    ],
    facts: [],
    clocks: [],
    capabilities: [],
    terminal: null
  }
};

assert.deepEqual(buildCertifiedMissionView(projection), {
  selectedMissionId: 'mission.prelude',
  missions: [{
    id: 'mission.prelude',
    title: 'Prelude: A Ship Underway',
    summary: 'Assume command and establish readiness.',
    status: 'active',
    requiredObjectives: [{
      id: 'objective.handover',
      title: 'Complete the command handover',
      summary: 'Establish working boundaries with Captain Whitaker.',
      status: 'active',
      disposition: null,
      terminalText: null
    }],
    optionalObjectives: [{
      id: 'objective.hesperus-rescue',
      title: 'Aid the Hesperus',
      summary: 'Protect the transport and its passengers.',
      status: 'terminal',
      disposition: 'completed',
      terminalText: 'The passengers are safe.'
    }],
    knownFacts: [],
    clocks: [],
    capabilities: [],
    terminal: null
  }]
});

console.log('PASS certified Mission view');
