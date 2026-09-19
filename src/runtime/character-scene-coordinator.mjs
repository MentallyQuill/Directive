import { createCharacterKnowledgePacket, compileCharacterPacket } from '../story/character-knowledge.mjs';
import { parseCharacterContribution, parseCharacterExposure } from '../story/character-knowledge-contracts.mjs';
import { CONTINUITY_STABLE_ID_PATTERN } from '../story/continuity-contracts.mjs';
import { canonicalJson } from '../storage/v1-state-delta-codec.mjs';
import { stableSha256Hex } from './v1-stable-hash.mjs';
import { assertGenerationActive, generationAbortedError } from './generation-cancellation.mjs';

const ID = new RegExp(CONTINUITY_STABLE_ID_PATTERN);
const validId = value => typeof value === 'string' && value.length <= 180 && ID.test(value);
function fail(code = 'DIRECTIVE_CHARACTER_SCENE_INVALID') {
  throw Object.assign(new Error(code === 'DIRECTIVE_CHARACTER_SCENE_STALE' ? 'Character scene changed during generation.' : 'Character scene cannot be prepared.'), { code });
}
// Maps and Sets in an admitted snapshot must participate in its cache identity.
function canonicalInput(value) {
  if (value instanceof Map) return { map: [...value].map(([key, item]) => [canonicalInput(key), canonicalInput(item)]).sort((a, b) => canonicalJson(a[0]).localeCompare(canonicalJson(b[0]))) };
  if (value instanceof Set) return { set: [...value].map(canonicalInput).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))) };
  if (Array.isArray(value)) return value.map(canonicalInput);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, canonicalInput(item)]));
  return value;
}
const digest = value => stableSha256Hex(canonicalJson(canonicalInput(value)));

function graph(plan, participants, playerId, limits) {
  if (!Array.isArray(plan) || plan.length > limits.maxCharacterCalls || !Array.isArray(participants) || !validId(playerId)) fail();
  const people = new Map();
  for (const person of participants) {
    if (!validId(person?.personId) || people.has(person.personId) || !Array.isArray(person.audience) || person.audience.length > 16) fail();
    const audience = new Map();
    for (const route of person.audience) {
      if (!validId(route?.personId) || audience.has(route.personId) || !['heard', 'observed', 'read'].includes(route.acquisition)) fail();
      audience.set(route.personId, route.acquisition);
    }
    people.set(person.personId, { ...person, audience });
  }
  const nodes = new Map(), previousByPerson = new Map();
  for (const node of plan) {
    const person = people.get(node?.personId);
    if (!node || Object.keys(node).some(key => !['id', 'personId', 'dependsOnIds'].includes(key)) || !validId(node.id)
      || nodes.has(node.id) || node.personId === playerId || !person || !Array.isArray(node.dependsOnIds)
      || new Set(node.dependsOnIds).size !== node.dependsOnIds.length
      || (!(person.present === true && person.conscious === true) && person.reactionPathValidated !== true)) fail();
    const previous = previousByPerson.get(node.personId);
    const dependencies = [...node.dependsOnIds];
    if (previous && !dependencies.includes(previous)) dependencies.push(previous);
    nodes.set(node.id, { ...node, dependsOnIds: dependencies, audience: person.audience });
    previousByPerson.set(node.personId, node.id);
  }
  if (new Set(plan.map(node => node.personId)).size > limits.maxActors) fail('DIRECTIVE_CHARACTER_SCENE_CAPACITY');
  for (const node of nodes.values()) for (const id of node.dependsOnIds) {
    const source = nodes.get(id);
    if (!source || id === node.id || (source.personId !== node.personId && !source.audience.has(node.personId))) fail();
  }
  const rounds = [], visited = new Set();
  while (visited.size < nodes.size) {
    const round = [...nodes.values()].filter(node => !visited.has(node.id) && node.dependsOnIds.every(id => visited.has(id)));
    if (!round.length) fail();
    rounds.push(round);
    if (rounds.length > limits.maxRounds) fail('DIRECTIVE_CHARACTER_SCENE_CAPACITY');
    round.forEach(node => visited.add(node.id));
  }
  return { nodes, rounds, people };
}

function abortable(promise, signal) {
  assertGenerationActive(signal);
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(generationAbortedError());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  return Promise.race([promise, aborted]).finally(() => signal.removeEventListener('abort', onAbort));
}

/** participants is a runtime-admitted scene/channel projection, never model authority.
 * A model may propose the bounded plan; it cannot enlarge those channel audiences.
 * No draft data is written into snapshot or accepted continuity here.
 */
export function createCharacterSceneCoordinator({ responder, limits: configured = {} } = {}) {
  if (typeof responder?.respond !== 'function') throw new TypeError('character-scene-responder-required');
  const limits = { maxActors: 3, maxRounds: 2, maxCharacterCalls: 4, concurrency: 2, ...configured };
  for (const key of ['maxActors', 'maxRounds', 'maxCharacterCalls', 'concurrency']) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > ({ maxActors: 3, maxRounds: 2, maxCharacterCalls: 4, concurrency: 2 })[key]) fail();
  }
  return {
    createFlight({ snapshot, sourcePair = {}, provisionalExposures = [], participants, identity, plan, playerId, budget, signal, isCurrent } = {}) {
      assertGenerationActive(signal);
      if (typeof isCurrent !== 'function' || !identity || typeof identity.bindingKey !== 'string' || !identity.bindingKey
        || !validId(identity.branchId) || snapshot?.state?.storySettlement?.branchId !== identity.branchId
        || !['sourceDigest', 'settingsDigest'].every(key => /^[a-f0-9]{64}$/.test(identity[key]))
        || !Number.isSafeInteger(identity.epoch) || identity.epoch < 0 || typeof budget?.reserve !== 'function') fail();
      const frozenIdentity = structuredClone(identity);
      const captured = structuredClone(snapshot), capturedPair = structuredClone(sourcePair), capturedExposures = structuredClone(provisionalExposures);
      const { nodes, rounds, people } = graph(structuredClone(plan), structuredClone(participants), playerId, limits);
      if (!(captured.characters instanceof Map) || [...nodes.values()].some(node => !captured.characters.has(node.personId)
        || [...node.audience.keys()].some(id => id !== playerId && !captured.characters.has(id)))) fail();
      if ([...nodes.values()].reduce((count, node) => count + node.audience.size, 0) > 32) fail('DIRECTIVE_CHARACTER_SCENE_CAPACITY');
      const baseDigest = digest({ identity: frozenIdentity, snapshot: captured, sourcePair: capturedPair, provisionalExposures: capturedExposures, plan, participants, limits });
      if (!isCurrent(structuredClone(frozenIdentity))) fail('DIRECTIVE_CHARACTER_SCENE_STALE');
      if (budget.available < nodes.size + 2) fail('DIRECTIVE_TURN_ATTEMPT_LIMIT');
      const narration = budget.reserve(`narration.${baseDigest}`, 1);
      let review;
      try { review = budget.reserve(`review.${baseDigest}`, 1); } catch (error) { budget.release(narration); throw error; }
      const cache = new Map(), invalidated = new Set();
      let version = 0, closed = false, running = false, candidate = null, controller = new AbortController();
      const check = expected => {
        assertGenerationActive(signal);
        if (closed || expected !== version) throw generationAbortedError();
        if (!isCurrent(structuredClone(frozenIdentity))) fail('DIRECTIVE_CHARACTER_SCENE_STALE');
      };
      const dispose = () => {
        closed = true; candidate = null; cache.clear(); invalidated.clear(); controller.abort();
        budget.release(narration); budget.release(review); signal?.removeEventListener('abort', dispose);
      };
      signal?.addEventListener('abort', dispose, { once: true });
      function packetFor(node, order) {
        const compiled = createCharacterKnowledgePacket({ snapshot: captured, sourcePair: capturedPair, provisionalExposures: capturedExposures,
          personId: node.personId, beforeOrder: Number.MAX_SAFE_INTEGER, limits });
        if (!compiled.ok) fail(compiled.code);
        const base = compiled.packet, sourceIds = new Set([compiled.digest]);
        const candidates = base.information.map(item => ({ ...item, recipientIds: [node.personId], sourceIds: [compiled.digest], learnedAt: -1 }));
        for (const id of node.dependsOnIds) {
          const entry = cache.get(id);
          const own = entry?.contribution.personId === node.personId;
          if (!entry || (!own && !entry.contribution.recipientIds.includes(node.personId))) fail();
          const exposure = own ? { id: `self-contribution.${digest(id).slice(0, 24)}`, text: entry.contribution.text }
            : entry.disclosures.find(item => item.exposure.recipientIds.includes(node.personId))?.exposure;
          if (!exposure) fail();
          const acquisition = own ? 'observed' : nodes.get(id).audience.get(node.personId);
          sourceIds.add(entry.contributionDigest);
          candidates.push({ id: exposure.id, text: exposure.text, claimType: 'character-claim', acquisition,
            status: 'current', recipientIds: [node.personId], sourceIds: [entry.contributionDigest], learnedAt: entry.order });
        }
        return compileCharacterPacket({ personId: node.personId, identity: base.identity, publicSituation: base.situation,
          authoredInformation: base.authoredInformation, candidates, validSourceIds: sourceIds, beforeOrder: order,
          maxCharacters: limits.maxCharacters ?? 12000, maxEstimatedTokens: limits.maxEstimatedTokens ?? 12000 });
      }
      return {
        get revision() { return version; },
        get finalizationReservations() { return { narration, review }; },
        getDraft() { return candidate ? structuredClone(candidate) : null; },
        assertCurrent(flightDigest) {
          check(version);
          if (!candidate || candidate.flightDigest !== flightDigest) fail('DIRECTIVE_CHARACTER_SCENE_STALE');
        },
        invalidate(contributionId) {
          check(version);
          if (!nodes.has(contributionId)) fail();
          const affected = new Set([contributionId]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const node of nodes.values()) if (!affected.has(node.id) && node.dependsOnIds.some(id => affected.has(id))) { affected.add(node.id); changed = true; }
          }
          version++; candidate = null; controller.abort(); controller = new AbortController();
          affected.forEach(id => { cache.delete(id); invalidated.add(id); });
          return [...affected];
        },
        dispose,
        async run() {
          check(version);
          if (running) fail('DIRECTIVE_CHARACTER_SCENE_BUSY');
          running = true;
          const runVersion = version, runSignal = controller.signal;
          let order = 0;
          try {
            for (const round of rounds) {
              const ordered = round.map(node => ({ node, order: order++ }));
              for (let offset = 0; offset < ordered.length; offset += limits.concurrency) {
                check(runVersion);
                await Promise.all(ordered.slice(offset, offset + limits.concurrency).map(async ({ node, order }) => {
                  const packet = packetFor(node, order), packetDigest = digest(packet);
                  const cacheKey = digest({ baseDigest, node, packetDigest, dependencies: node.dependsOnIds.map(id => cache.get(id)?.contributionDigest) });
                  if (cache.get(node.id)?.cacheKey === cacheKey) return;
                  const result = await abortable(Promise.resolve(responder.respond({ packet, playerId, contributionId: node.id,
                    audienceIds: new Set(node.audience.keys()), priorContributionIds: new Set(node.dependsOnIds), signal: runSignal, budget, repair: invalidated.has(node.id) })), runSignal);
                  check(runVersion); assertGenerationActive(runSignal);
                  const contribution = parseCharacterContribution(result?.contribution, { packet, playerId, audienceIds: new Set(node.audience.keys()), priorContributionIds: new Set(node.dependsOnIds) });
                  if (contribution.id !== node.id) fail();
                  // The runtime graph owns causal order even when model output omits an edge.
                  contribution.dependsOnIds = [...node.dependsOnIds];
                  const contributionDigest = digest(contribution);
                  const dependencyExposures = node.dependsOnIds.flatMap(id => {
                    const source = cache.get(id);
                    if (source.contribution.personId === node.personId) return [];
                    return [source.disclosures.find(item => item.exposure.recipientIds.includes(node.personId))?.exposure.id];
                  });
                  if (dependencyExposures.some(id => !id)) fail();
                  const disclosures = contribution.recipientIds.map((recipientId, recipientIndex) => {
                    const acquisition = node.audience.get(recipientId);
                    if (contribution.kind === 'action' && acquisition !== 'observed') fail();
                    const exposure = parseCharacterExposure({ kind: 'directive.characterExposure.v1', id: `disclosure.${digest([node.id, recipientId]).slice(0, 24)}`,
                      speakerId: contribution.personId, recipientIds: [recipientId], acquisition,
                      text: contribution.text, claimType: 'character-claim', source: { type: 'contribution', contributionId: contribution.id },
                      dependsOnIds: dependencyExposures }, {
                      speakerIds: new Set(people.keys()), audienceIds: new Set(node.audience.keys()), passageIds: new Set(),
                      contributions: new Map([[contribution.id, contribution]]), exposureIds: new Set(dependencyExposures),
                    });
                    return { exposure, order: order * 16 + recipientIndex, contributionDigest };
                  });
                  invalidated.delete(node.id);
                  cache.set(node.id, { cacheKey, order, packet, packetDigest, contribution, contributionDigest, disclosures });
                }));
                check(runVersion);
              }
            }
            const entries = [...cache.values()].sort((a, b) => a.order - b.order);
            candidate = { identity: structuredClone(frozenIdentity), revision: version,
              flightDigest: digest({ baseDigest, version, contributions: entries.map(entry => entry.contributionDigest) }),
              contributions: entries.map(entry => entry.contribution),
              packets: entries.map(entry => ({ personId: entry.packet.personId, contributionId: entry.contribution.id, packet: entry.packet, digest: entry.packetDigest })),
              disclosures: entries.flatMap(entry => entry.disclosures), rounds: rounds.length };
            return structuredClone(candidate);
          } catch (error) {
            if (runVersion === version) dispose();
            throw error;
          } finally { running = false; }
        },
      };
    },
  };
}
