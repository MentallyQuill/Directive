import { createAshesInitialState, loadAshesRuntimeAssets } from '../scripts/v1-test-fixtures.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';
import { prepareV1AcceptedPairSnapshot } from '../../src/runtime/v1-accepted-pair-source.mjs';
import { prepareV1AcceptedPairTimeAdvance } from '../../src/runtime/v1-accepted-pair-time.mjs';

// Only the external model and storage medium are substituted. Interpretation,
// validation, state gateway, settlement receipts, and clock custody are real.
export function createTimeRuntimeHarness(outputs, { failWrites = 0 } = {}) {
  const assets = loadAshesRuntimeAssets();
  let state = createAshesInitialState();
  let calls = 0;
  let writes = 0;
  const requests = [];
  const gateway = createStateDeltaGateway({
    getState: () => state, setState: next => { state = next; },
    persist: async () => {
      writes += 1;
      if (writes <= failWrites) throw new Error('planned storage failure');
    },
  });
  const makeRuntime = () => createV1MissionRuntime({
    getState: () => state, stateDeltaGateway: gateway,
    generationRouter: { generate: async (role, request) => {
      requests.push({ role, request: structuredClone(request) });
      const output = outputs[calls++] ?? outputs.at(-1);
      return { ok: true, response: { text: JSON.stringify(output) } };
    } },
    prepareAcceptedPairTime: ({ campaignState, snapshot, timeDecision }) => prepareV1AcceptedPairTimeAdvance({
      campaignState, snapshot, timeDecision, packageData: assets.packageData,
    }),
  });
  let runtime = makeRuntime();
  return {
    get state() { return structuredClone(state); },
    get calls() { return calls; },
    get writes() { return writes; },
    get requests() { return structuredClone(requests); },
    get runtime() { return runtime; },
    assets,
    reload() { state = structuredClone(state); runtime = makeRuntime(); },
    settle(messages, options = {}) {
      const prepared = prepareV1AcceptedPairSnapshot({ campaignState: state, recentMessages: messages,
        currentPlayerMessage: messages.at(-1), chatId: state.campaignChatBinding.chatId });
      if (!prepared.ok) throw new Error(prepared.reason);
      return runtime.settleAcceptedPair({ snapshot: prepared.snapshot, runtimeAssets: assets, ...options });
    },
  };
}
