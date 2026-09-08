import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMissionAcceptedPairInterpretationOutput as parse } from '../../src/mission/v1/accepted-pair-interpreter.mjs';
import { explicitWait, interpretation, timeState, timeSnapshot, timePackage } from '../fixtures/v1-time-reliability-cases.mjs';
import { prepareV1AcceptedPairTimeAdvance as prepare } from '../../src/runtime/v1-accepted-pair-time.mjs';
import { prepareV1AcceptedPairSnapshot } from '../../src/runtime/v1-accepted-pair-source.mjs';
import { createTimeRuntimeHarness } from '../fixtures/v1-time-runtime-harness.mjs';
import { openingDurationCases } from '../fixtures/v1-time-reliability-cases.mjs';
import { createFakeDirectiveHost, createFakeGenerationClient } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

test('a ten-minute source cannot validate as one hour', () => {
  const result = parse(interpretation({
    decision: 'advance', elapsedSeconds: 3600,
    durationSeconds: 3600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: explicitWait.currentPlayer.text,
  }), { candidatePacket: { candidates: [] }, sourcePair: explicitWait });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /duration.*600/i);
});

test('an unsupported 31-day jump cannot validate', () => {
  const result = parse(interpretation({ decision: 'advance', elapsedSeconds: 2678400 }), {
    candidatePacket: { candidates: [] }, sourcePair: explicitWait,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /duration evidence/i);
});

test('opening player meditation consumes its ten minutes without a verb whitelist', () => {
  const snapshot = timeSnapshot('I meditate for ten minutes.', { opening: true });
  const result = prepare({ campaignState: timeState(), snapshot, packageData: timePackage,
    timeDecision: interpretation({ decision: 'advance', elapsedSeconds: 600,
      durationSeconds: 600, durationSourceSlot: 'currentPlayer', durationEvidenceQuote: snapshot.source.currentPlayer.text,
    }).time,
  });
  assert.equal(result.patch?.timeLedger.elapsedSeconds, 600);
});

test('rejected assistant sleep cannot contribute eight hours', () => {
  const sourcePair = { previousAssistant: { text: 'You sleep for eight hours.' }, currentPlayer: { text: 'No, I remain awake and say hello.' } };
  const result = parse(interpretation({ decision: 'advance', elapsedSeconds: 28800,
    durationSeconds: 28800, durationSourceSlot: 'previousAssistant', durationEvidenceQuote: sourcePair.previousAssistant.text,
  }, 'rejected'), { candidatePacket: { candidates: [] }, sourcePair });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /unaccepted assistant/i);
});

test('unresolved time leaves the pair retryable and commits no zero decision', () => {
  const state = timeState();
  const snapshot = timeSnapshot('I wait exactly ten minutes.');
  const unresolved = prepare({ campaignState: state, snapshot, packageData: timePackage,
    timeDecision: interpretation({ decision: 'indeterminate', elapsedSeconds: 0 }).time,
  });
  assert.equal(unresolved.ok, false);
  assert.equal(unresolved.reasonCode, 'time-interpretation-unresolved');
  assert.equal(unresolved.patch, undefined);
  const retried = prepare({ campaignState: state, snapshot, packageData: timePackage,
    timeDecision: interpretation({ decision: 'advance', elapsedSeconds: 600,
      durationSeconds: 600, durationSourceSlot: 'currentPlayer', durationEvidenceQuote: snapshot.source.currentPlayer.text,
    }).time,
  });
  assert.equal(retried.status, 'planned');
  assert.equal(retried.patch.timeLedger.elapsedSeconds, 600);
  assert.equal(retried.patch.timeLedger.decisions.length, 1);
});

test('the contract accepts source-bound speech, including a short reply, without fixed pacing', () => {
  const sourcePair = { previousAssistant: { text: 'You sleep for eight hours.' }, currentPlayer: { text: 'No.' } };
  const result = parse(interpretation({ decision: 'advance', basis: 'implicitAction', elapsedSeconds: 1,
    sourceSlot: 'currentPlayer', evidenceQuote: 'No.',
  }, 'corrected'), { candidatePacket: { candidates: [] }, sourcePair });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.value.time.elapsedSeconds, 1);
});

test('opening scope accepts player passage without requiring a first-person sentence', () => {
  const snapshot = timeSnapshot('Ten minutes of meditation pass in silence.', { opening: true });
  const time = interpretation({ decision: 'advance', elapsedSeconds: 600,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer', durationEvidenceQuote: snapshot.source.currentPlayer.text,
  }).time;
  const result = prepare({ campaignState: timeState(), snapshot, packageData: timePackage, timeDecision: time });
  assert.equal(result.patch?.timeLedger.elapsedSeconds, 600);
});

test('even a short opening-baseline action cannot be charged as new elapsed time', () => {
  const snapshot = timeSnapshot('I listen.', { opening: true, assistantText: 'The captain greets you.' });
  const result = prepare({ campaignState: timeState(), snapshot, packageData: timePackage,
    timeDecision: interpretation({ decision: 'advance', elapsedSeconds: 10, basis: 'implicitAction',
      sourceSlot: 'previousAssistant', evidenceQuote: snapshot.source.previousAssistant.text,
    }).time,
  });
  assert.equal(result.ok, false);
  assert.equal(result.patch, undefined);
});

test('an explicit interval may be followed by separately evidenced immediate action', () => {
  const sourcePair = { previousAssistant: explicitWait.previousAssistant,
    currentPlayer: { text: 'I wait exactly ten minutes. Then I enter and introduce myself.' } };
  const result = parse(interpretation({ decision: 'advance', elapsedSeconds: 610,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer', durationEvidenceQuote: 'I wait exactly ten minutes.',
    sourceSlot: 'currentPlayer', evidenceQuote: 'Then I enter and introduce myself.',
  }), { candidatePacket: { candidates: [] }, sourcePair });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.value.time.elapsedSeconds, 610);
});

test('explicit quantity conversion supports ordinary compound and decimal durations', () => {
  for (const [phrase, seconds] of [['half an hour', 1800], ['1.5 hours', 5400], ['twenty-one minutes', 1260], ['ninety minutes', 5400], ['an hour and a half', 5400], ['one and a half hours', 5400], ['one hundred twenty minutes', 7200]]) {
    const text = `I meditate for ${phrase}.`;
    const sourcePair = { ...explicitWait, currentPlayer: { text } };
    const result = parse(interpretation({ decision: 'advance', elapsedSeconds: seconds, durationSeconds: seconds,
      durationSourceSlot: 'currentPlayer', durationEvidenceQuote: text,
    }), { candidatePacket: { candidates: [] }, sourcePair });
    assert.equal(result.ok, true, `${phrase}: ${JSON.stringify(result.errors)}`);
    const wrong = parse(interpretation({ decision: 'advance', elapsedSeconds: seconds + 60, durationSeconds: seconds + 60,
      durationSourceSlot: 'currentPlayer', durationEvidenceQuote: text,
    }), { candidatePacket: { candidates: [] }, sourcePair });
    assert.equal(wrong.ok, false, phrase);
  }
});

test('the accepted-pair snapshot preserves the prompting player action as timing context', () => {
  const recentMessages = [
    { id: 'p0', isUser: true, text: 'I wait exactly ten minutes.' },
    { id: 'a1', text: 'The ten minutes pass. The captain arrives.' },
    { id: 'p1', isUser: true, text: 'I greet her.' },
  ];
  const result = prepareV1AcceptedPairSnapshot({ campaignState: timeState(), recentMessages,
    currentPlayerMessage: recentMessages[2] });
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.source.previousAssistant.promptingPlayerText, 'I wait exactly ten minutes.');
});

test('runtime retries unresolved interpretation with a fresh result and one atomic commit', async () => {
  const messages = [{ id: 'a1', text: 'The room is quiet.' }, { id: 'p1', isUser: true, text: 'I wait exactly ten minutes.' }];
  const harness = createTimeRuntimeHarness([
    interpretation({ decision: 'indeterminate', elapsedSeconds: 0 }),
    interpretation({ decision: 'advance', elapsedSeconds: 600, durationSeconds: 600,
      durationSourceSlot: 'currentPlayer', durationEvidenceQuote: messages[1].text }),
  ]);
  const original = harness.state;
  const unresolved = await harness.settle(messages);
  assert.equal(unresolved.ok, false);
  assert.equal(unresolved.reasonCode, 'time-interpretation-unresolved');
  assert.deepEqual(harness.state, original);
  assert.equal(harness.writes, 0);
  const retried = await harness.settle(messages);
  assert.equal(retried.ok, true, JSON.stringify(retried));
  assert.equal(harness.calls, 2);
  assert.equal(harness.writes, 1);
  assert.equal(harness.state.timeLedger.elapsedSeconds, 600);
  assert.equal((await harness.settle(messages)).status, 'already-settled');
  assert.equal(harness.calls, 2);
  assert.equal(harness.state.timeLedger.elapsedSeconds, 600);
});

test('a recap receives already-counted player context and does not repeat the wait', async () => {
  const messages = [{ id: 'a1', text: 'The room is quiet.' }, { id: 'p1', isUser: true, text: 'I wait exactly ten minutes.' }];
  const harness = createTimeRuntimeHarness([
    interpretation({ decision: 'advance', elapsedSeconds: 600, durationSeconds: 600,
      durationSourceSlot: 'currentPlayer', durationEvidenceQuote: messages[1].text }),
    interpretation({ decision: 'advance', elapsedSeconds: 4, sourceSlot: 'currentPlayer', evidenceQuote: 'I greet her.' }),
  ]);
  assert.equal((await harness.settle(messages)).ok, true);
  messages.push({ id: 'a2', text: 'The ten minutes pass. The captain arrives.' }, { id: 'p2', isUser: true, text: 'I greet her.' });
  assert.equal((await harness.settle(messages)).ok, true);
  const context = JSON.parse(harness.requests[1].request.messages[1].content.slice(harness.requests[1].request.messages[1].content.indexOf('{')));
  assert.equal(context.time.alreadyCountedPlayer?.text, messages[1].text);
  assert.equal(harness.state.timeLedger.elapsedSeconds, 604);
  harness.reload();
  assert.equal((await harness.settle(messages)).status, 'already-settled');
  assert.equal(harness.state.timeLedger.elapsedSeconds, 604);
});

for (const [label, playerText, timeDecision, expectedSeconds] of openingDurationCases) {
  test(`source-bound opening interpretation: ${label}`, () => {
    const snapshot = timeSnapshot(playerText, { opening: true });
    const result = prepare({ campaignState: timeState(), snapshot, packageData: timePackage,
      timeDecision: { ...timeDecision, basis: label === 'calendar scene cut' ? 'sceneTransition' : 'explicitDuration' },
    });
    if (expectedSeconds > 0) assert.equal(result.patch?.timeLedger.elapsedSeconds, expectedSeconds);
    else { assert.equal(result.ok, false); assert.equal(result.patch, undefined); }
  });
}

test('clock custody rejects an unclassified fresh proposal even if called without the parser', () => {
  const result = prepare({ campaignState: timeState(), snapshot: timeSnapshot('I nod.'), packageData: timePackage,
    timeDecision: { decision: 'advance', elapsedSeconds: 2678400, reason: 'unsupported', confidence: 1 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.patch, undefined);
});

test('approximate prose does not pretend to specify an exact stopwatch duration', () => {
  const sourcePair = { ...explicitWait, currentPlayer: { text: 'I wait about ten minutes.' } };
  const result = parse(interpretation({ decision: 'advance', elapsedSeconds: 570, durationSeconds: 570,
    durationSourceSlot: 'currentPlayer', durationEvidenceQuote: sourcePair.currentPlayer.text,
  }), { candidatePacket: { candidates: [] }, sourcePair });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

for (const text of ['I wait 10-15 minutes.', 'I wait 10–15 minutes.', 'I wait ten to fifteen minutes.']) {
  test(`a duration range stays a contextual estimate: ${text}`, () => {
    const sourcePair = { ...explicitWait, currentPlayer: { text } };
    const result = parse(interpretation({ decision: 'advance', elapsedSeconds: 750, durationSeconds: 750,
      durationSourceSlot: 'currentPlayer', durationEvidenceQuote: text,
    }), { candidatePacket: { candidates: [] }, sourcePair });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  });
}

test('a storage retry reuses valid interpretation and advances only once', async () => {
  const messages = [{ id: 'a1', text: 'The room is quiet.' }, { id: 'p1', isUser: true, text: 'I wait exactly ten minutes.' }];
  const harness = createTimeRuntimeHarness([
    interpretation({ decision: 'advance', elapsedSeconds: 600, durationSeconds: 600,
      durationSourceSlot: 'currentPlayer', durationEvidenceQuote: messages[1].text }),
  ], { failWrites: 1 });
  const original = harness.state;
  assert.equal((await harness.settle(messages)).reasonCode, 'persistence-failed');
  assert.deepEqual(harness.state, original);
  assert.equal((await harness.settle(messages)).ok, true);
  assert.equal(harness.calls, 1);
  assert.equal(harness.state.timeLedger.elapsedSeconds, 600);
  assert.equal(harness.state.timeLedger.decisions.length, 1);
});

test('an unresolved pair remains unsettled after reload and can then be resolved', async () => {
  const messages = [{ id: 'a1', text: 'The room is quiet.' }, { id: 'p1', isUser: true, text: 'I wait exactly ten minutes.' }];
  const harness = createTimeRuntimeHarness([
    interpretation({ decision: 'indeterminate', elapsedSeconds: 0 }),
    interpretation({ decision: 'advance', elapsedSeconds: 600, durationSeconds: 600,
      durationSourceSlot: 'currentPlayer', durationEvidenceQuote: messages[1].text }),
  ]);
  assert.equal((await harness.settle(messages)).ok, false);
  harness.reload();
  assert.equal((await harness.settle(messages)).ok, true);
  assert.equal(harness.state.timeLedger.elapsedSeconds, 600);
  assert.equal(harness.state.timeLedger.decisions.length, 1);
});

test('concurrent work consumes the encompassing interval and an OOC correction adds no time', async () => {
  const text = 'I wait exactly ten minutes, working on the report during the wait.';
  const messages = [{ id: 'a1', text: 'The room is quiet.' }, { id: 'p1', isUser: true, text }];
  const harness = createTimeRuntimeHarness([
    interpretation({ decision: 'advance', elapsedSeconds: 600, durationSeconds: 600,
      durationSourceSlot: 'currentPlayer', durationEvidenceQuote: 'I wait exactly ten minutes' }),
    interpretation({ decision: 'unchanged', elapsedSeconds: 0 }, 'corrected'),
  ]);
  assert.equal((await harness.settle(messages)).ok, true);
  assert.equal(harness.state.timeLedger.elapsedSeconds, 600);
  messages.push({ id: 'a2', text: 'During those ten minutes, the report was completed.' },
    { id: 'p2', isUser: true, text: 'OOC: The report is still unfinished; the wait happened.' });
  assert.equal((await harness.settle(messages)).ok, true);
  assert.equal(harness.state.timeLedger.elapsedSeconds, 600);
  assert.equal(harness.state.timeLedger.entries.length, 1);
});

test('an independent enacted wait does not inherit a refusal or modal from the prior clause', () => {
  for (const text of ['I refuse to argue, then I wait ten minutes.', 'I decide what I should say, then I wait ten minutes.']) {
    const snapshot = timeSnapshot(text, { opening: true });
    const result = prepare({ campaignState: timeState(), snapshot, packageData: timePackage,
      timeDecision: interpretation({ decision: 'advance', elapsedSeconds: 600, durationSeconds: 600,
        durationSourceSlot: 'currentPlayer', durationEvidenceQuote: 'I wait ten minutes.',
      }).time,
    });
    assert.equal(result.patch?.timeLedger.elapsedSeconds, 600, text);
  }
});

test('a completed until-clock transition is accepted as forward passage', () => {
  const snapshot = timeSnapshot('I work until 10:00.', { opening: true });
  const result = prepare({ campaignState: timeState(), snapshot, packageData: timePackage,
    timeDecision: interpretation({ decision: 'advance', basis: 'sceneTransition', elapsedSeconds: 5400, durationSeconds: 5400,
      durationSourceSlot: 'currentPlayer', durationEvidenceQuote: snapshot.source.currentPlayer.text,
    }).time,
  });
  assert.equal(result.patch?.timeLedger.shipClock.display, '10:00:00 hours');
});

test('the app blocks narration on unresolved timing and manual retry commits the exact pending pair', async () => {
  let calls = 0;
  const text = 'I wait exactly ten minutes.';
  const generation = createFakeGenerationClient({ responses: { acceptedPairMissionEvidence: async () => ({
    text: JSON.stringify(++calls === 1
      ? interpretation({ decision: 'indeterminate', elapsedSeconds: 0 })
      : interpretation({ decision: 'advance', elapsedSeconds: 600, durationSeconds: 600,
        durationSourceSlot: 'currentPlayer', durationEvidenceQuote: text })), providerId: 'fake-utility',
  }) } });
  const host = createFakeDirectiveHost({ chatNative: true, generation });
  let sequence = 0;
  const app = createDirectiveRuntimeApp({ host, packageLoader: async () => loadAshesRuntimeAssets(),
    idFactory: prefix => `${prefix}.${++sequence}` });
  await app.initialize();
  await app.startCreatorDraft();
  await app.saveCreatorDraft({ patch: { activeStep: 'review', input: {
    identity: { name: 'Time Tester', pronounsOrAddress: 'they/them', speciesId: 'human', ageBandId: 'mid-career', appearance: 'Attentive.' },
    service: { careerBackgroundId: 'tactical-security', formativeExperienceId: 'dominion-war-fleet-service', assignmentReasonId: 'experienced-outsider-transfer' },
    personality: { traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' }, flawId: 'impatient' },
    dossier: { briefBiography: 'A command officer committed to reconstruction.', publicReputation: 'An attentive command officer.' },
  } } });
  await app.acceptCreatorDraftAndStartCampaign();
  const player = host.chat.pushPlayerMessage({ text, hostMessageId: 'time.player' });
  const failed = await app.observeHostPlayerMessage({ message: player });
  assert.equal(failed.mission.reasonCode, 'time-interpretation-unresolved');
  const blocked = await app.getChatTurnOrchestrator().interceptGeneration();
  assert.equal(blocked.abortDefaultGeneration, true);
  assert.equal(calls, 1, 'no automatic interpretation loop');
  assert.equal((await app.retryPendingAcceptedPairSettlement()).ok, true);
  assert.equal(calls, 2);
  assert.equal((await app.getCurrentView({ tabId: 'mission' })).campaignState.timeLedger.elapsedSeconds, 600);
  assert.equal((await app.getChatTurnOrchestrator().interceptGeneration()).abortDefaultGeneration, false);
  assert.equal(calls, 2);
});
