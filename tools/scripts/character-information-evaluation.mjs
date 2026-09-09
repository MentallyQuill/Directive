// Offline, manually labelled projection-isolation fixtures. No provider or host access.
// stdout is a JSON artifact for later repeated, blinded A/B/C model evaluation.
import { pathToFileURL } from 'node:url';
import { CHARACTER_INFORMATION_POLICY, createCharacterInformationProjection } from '../../src/story/character-information.mjs';

const shuttle = 'Two Type-9s are standing by as a cargo fallback.';
const estimate = 'Restoration is expected at fifteen hundred.';
const request = 'Renwick needs additional cargo handlers.';
const callback = 'Sam promised Renwick a fourteen-thirty callback.';
const cases = [
  { id: 'nayar-private-call', transcript: [
    'Sam privately speaks with Renwick, who asks for cargo handlers. Sam promises him a fourteen-thirty callback.',
    `Sam arrives at Nayar\'s cargo bay and tells her: "${shuttle}"`,
  ], received: [shuttle], mustAvoid: ['Nayar attributing a staffing request to Renwick', 'Nayar knowing the callback deadline'], mustAllow: ['Nayar independently proposing cargo handlers', 'Nayar asking when transporters return'] },
  { id: 'explicit-briefing', transcript: [
    `Sam tells Nayar: "${shuttle} ${request} I promised him a fourteen-thirty callback."`,
  ], received: [shuttle, request, callback], mustAvoid: ['Nayar acting as if the briefing omitted those details'], mustAllow: ['Nayar referring to the received request and deadline'] },
  { id: 'speakerphone', transcript: [
    'Nayar stands beside Sam. The call is explicitly on speakerphone, and she listens as Renwick asks for cargo handlers.',
  ], received: [request], mustAvoid: ['Nayar inventing other private arrangements'], mustAllow: ['Nayar responding to the request she heard'] },
  { id: 'late-arrival', transcript: [
    'Renwick asks Sam for cargo handlers over a private call. Sam ends the call. Nayar enters afterward.',
    `Sam tells Nayar: "${shuttle}"`,
  ], received: [shuttle], mustAvoid: ['Retroactively treating Nayar as present for the call'], mustAllow: ['A competent staffing suggestion without claimed prior briefing'] },
  { id: 'outdated-estimate', transcript: [
    `Sam tells Nayar: "${estimate}"`,
    'Later Cross privately tells Sam restoration is now expected at sixteen hundred. Sam returns to Nayar without relaying the update.',
  ], received: [estimate], mustAvoid: ['Silently updating Nayar to sixteen hundred'], mustAllow: ['Nayar asking whether her last estimate still stands'] },
  { id: 'claim-is-not-transfer', transcript: [
    'An unidentified crewman tells Nayar: "Renwick told Sam he needs handlers." No Renwick-to-Nayar exchange is established.',
  ], received: ['A crewman claims Renwick told Sam he needs handlers.'], mustAvoid: ['Nayar saying Renwick told her directly', 'Treating the crewman\'s claim as independently verified'], mustAllow: ['Nayar referring to the crewman\'s report or seeking confirmation'] },
  { id: 'private-thought', transcript: [
    `Sam thinks privately about his fourteen-thirty promise. He says to Nayar: "${shuttle}"`,
  ], received: [shuttle], mustAvoid: ['Treating Sam\'s private thought as audible'], mustAllow: ['Nayar reasoning from the spoken fallback plan'] },
  { id: 'partial-document', transcript: [
    'Sam reads a private PADD containing the callback deadline and staffing request. He does not show it to Nayar.',
    `He summarizes only this section aloud to Nayar: "${shuttle}"`,
  ], received: [shuttle], mustAvoid: ['Granting Nayar the unread sections of the PADD'], mustAllow: ['Nayar requesting more detail'] },
];

export function createInformationEvaluationPack() {
  return {
    kind: 'directive.characterInformationEvaluation.v1',
    status: 'unrun',
    scope: 'Manual access labels isolate narrator response to projections. This is not an extractor test or a production latency benchmark. Keep transcript and provider settings identical across arms; do not send expectations to the narrator.',
    measurement: ['unsupported knowledge in dialogue AND narration', 'false ignorance', 'invented prior communication', 'professional competence', 'time to first story text', 'total wall time', 'provider attempts'],
    cases: cases.map(({ received, ...scenario }) => {
      const events = [{ id: 'open', threadId: 'information', operation: 'open', payload: { title: 'Information', category: 'information' }, sourceContributionIds: ['opening'], dependsOnEventIds: [] },
        ...received.map((text, i) => ({ id: `fact.${i}`, threadId: 'information', operation: 'addFact', settledAtRevision: i + 1, sourceContributionIds: [`source.${i}`], dependsOnEventIds: ['open'], payload: { text, claimType: 'character-claim', informationAccess: { recipientIds: ['priya-nayar'], acquisition: 'heard', audienceSources: [] } } }))];
      const projection = createCharacterInformationProjection({ events, personIds: ['priya-nayar'] });
      const base = 'Write the next brief scene with Nayar responding to Sam. Nayar is a competent operations officer. Preserve player agency and established continuity. Do not write Sam\'s answer.';
      const arms = {
        A: { system: base, transcript: scenario.transcript },
        B: { system: `${base}\n${CHARACTER_INFORMATION_POLICY}`, transcript: scenario.transcript },
        C: { system: `${base}\n${CHARACTER_INFORMATION_POLICY}\n${JSON.stringify({ characterInformation: projection })}`, transcript: scenario.transcript },
      };
      return { ...scenario, arms, inputCharacters: Object.fromEntries(Object.entries(arms).map(([id, arm]) => [id, JSON.stringify(arm).length])) };
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(createInformationEvaluationPack(), null, 2)}\n`);
}
