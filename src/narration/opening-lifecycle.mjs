import { createNarrationPolicy } from './narration-policy.mjs';
import { createOpeningDirectorRequest, parseOpeningDirection, createOpeningNarrationRequest } from './campaign-opening.mjs';

const clone = value => structuredClone(value);
const visible = messages => messages.some(message => !message.isSystem && message.role !== 'system');

// Chat metadata travels with native branches and is removed with the chat. It is
// presentation custody, not a second source of campaign state.
export function createOpeningLifecycle({ chat, getBinding, isCurrent, generateDirector, generateNarration, getProseGuidance, getAnalysisLimits = () => ({}), postOpening = null, publishProtectedOpening = null }) {
  if (postOpening !== null && typeof postOpening !== 'function') throw new TypeError('postOpening must be a function');
  const post = postOpening || (options => chat.postAssistantMessage(options));
  const flights = new Map();
  let status = null;
  let epoch = 0;
  function currentStatus() {
    const binding = getBinding();
    return status?.chatId === binding?.chatId && status?.saveId === binding?.saveId ? clone(status) : null;
  }
  function generate(input) {
    const generationEpoch = epoch;
    const binding = clone(getBinding());
    const key = JSON.stringify(binding);
    if (flights.has(key)) return flights.get(key);
    const captured = clone(input);
    captured.limits = clone(getAnalysisLimits());
    const policy = createNarrationPolicy({ settings: captured.settings, player: captured.player });
    const assertCurrent = () => {
      if (generationEpoch !== epoch) throw Object.assign(new Error('Generation canceled.'), { code: 'DIRECTIVE_GENERATION_ABORTED' });
      if (!isCurrent(binding)) throw new Error('The campaign chat changed. Return to it to generate the opening.');
    };
    const run = async () => {
      try {
        assertCurrent();
        if (captured.characterKnowledge?.mode === 'protected' && typeof publishProtectedOpening === 'function') {
          const recovered = await publishProtectedOpening({ recoveryOnly: true, expectedBinding: binding, assertCurrent });
          if (recovered) {
            assertCurrent();
            if (recovered.ok !== true || recovered.persisted !== true) throw new Error('Protected opening recovery is pending.');
            status = { ...binding, status: 'ready', message: null }; return recovered;
          }
        }
        const messages = await chat.getRecentMessages({ limit: 4 });
        assertCurrent();
        if (visible(messages)) { status = { ...binding, status: 'ready', message: null }; return { ok: true, posted: false, reason: 'chat-not-empty' }; }
        status = { ...binding, status: 'generating', message: 'Preparing the opening scene.' };
        const directorRequest = createOpeningDirectorRequest({ ...captured, narrationPolicy: policy });
        const inputs = { premise: captured.premise, player: directorRequest.context.playerIdentity, background: directorRequest.context.backgroundReferences, ...(directorRequest.context.characterKnowledge ? { characterKnowledge: directorRequest.context.characterKnowledge } : {}) };
        if (captured.characterKnowledge?.mode === 'protected' && typeof publishProtectedOpening !== 'function') throw new Error('Protected opening publication is unavailable.');
        const sourceKey = JSON.stringify(inputs);
        let record = chat.getOpeningRecord();
        if (record?.kind !== 'directive.openingRecord.v1' || record.campaignId !== binding.campaignId || record.sourceKey !== sourceKey) record = null;
        if (record && !parseOpeningDirection(record.direction, { request: directorRequest }).ok) record = null;
        if (!record) {
          const response = await generateDirector(directorRequest);
          assertCurrent();
          const parsed = parseOpeningDirection(response?.text ?? response, { request: directorRequest });
          if (!parsed.ok) throw new Error('The scene direction could not be prepared. Please retry the opening.');
          record = { kind: 'directive.openingRecord.v1', campaignId: binding.campaignId, sourceKey, inputs, direction: parsed.value };
          await chat.setOpeningRecord(record);
          assertCurrent();
        }
        if (directorRequest.context.characterKnowledge) {
          const parsed = parseOpeningDirection(record.direction, { request: directorRequest });
          const result = await publishProtectedOpening({ input: captured, request: directorRequest, admission: parsed.characterScene,
            expectedBinding: binding, requireEmpty: true, assertCurrent });
          assertCurrent();
          if (result?.ok !== true || result?.persisted !== true) throw new Error('Protected opening publication is pending.');
          status = { ...binding, status: 'ready', message: null };
          return result;
        }
        const proseGuidance = await getProseGuidance();
        assertCurrent();
        const request = createOpeningNarrationRequest({ ...captured, narrationPolicy: policy, direction: record.direction, proseGuidance });
        const response = await generateNarration(request);
        assertCurrent();
        const text = String(response?.text ?? '').trim();
        if (!text || /<(?:think|analysis)[\s>]/i.test(text)) throw new Error('The narration model did not return a visible opening. Please retry.');
        if (visible(await chat.getRecentMessages({ limit: 4 }))) { status = { ...binding, status: 'ready', message: null }; return { ok: true, posted: false, reason: 'chat-not-empty' }; }
        assertCurrent();
        await chat.setOpeningRecord({ ...record, narrationSettings: { pov: policy.pov, tense: policy.tense } });
        assertCurrent();
        if (visible(await chat.getRecentMessages({ limit: 4 }))) { status = { ...binding, status: 'ready', message: null }; return { ok: true, posted: false, reason: 'chat-not-empty' }; }
        assertCurrent();
        const result = await post({ requireEmpty: true, expectedBinding: binding, text, campaignId: binding.campaignId, turnId: 'opening', outcomeId: 'opening', responseKind: 'narration', idempotencyKey: `directive.v1.opening.${binding.saveId}` });
        assertCurrent();
        if (result?.ok === false) throw Object.assign(new Error('The opening could not be posted.'), { code: 'DIRECTIVE_OPENING_POST_FAILED' });
        status = { ...binding, status: 'ready', message: null };
        return { ...result, ok: true };
      } catch (error) {
        if (generationEpoch === epoch && isCurrent(binding)) status = { ...binding, status: 'failed', message: 'The opening could not be generated. Your character is saved. Retry when ready.' };
        return { ok: false, posted: false, reason: 'opening-generation-failed', message: currentStatus()?.message || 'The campaign chat changed.', error: { code: error?.code || 'DIRECTIVE_OPENING_FAILED', message: error?.message || String(error) } };
      }
    };
    const pending = run();
    flights.set(key, pending);
    pending.finally(() => { if (flights.get(key) === pending) flights.delete(key); });
    return pending;
  }
  return { generate, currentStatus, cancel() {
    epoch += 1;
    flights.clear();
    if (status?.status === 'generating') status = { ...status, status: 'pending', message: 'Generation stopped. Retry when ready.' };
  } };
}
