import assert from 'node:assert/strict';
import {
  CLAIM_AUTHORITY_CATEGORIES,
  CLAIM_DISPOSITIONS,
  classifyPlayerClaims,
  classifyGeneratedClaims,
  resolveClaimDisposition
} from '../../src/continuity/claim-authority.mjs';

const player = classifyPlayerClaims({
  text: 'The abandoned cargo ship is secretly carrying the missing crew.',
  knownFactIds: ['fact.hesperus.inspectionFalsified']
});
assert.equal(player.category, CLAIM_AUTHORITY_CATEGORIES.playerClaim);
assert.equal(player.disposition, CLAIM_DISPOSITIONS.verificationRequired);
assert.equal(player.accepted, false);
assert.equal(player.claims.length, 1);
assert.equal(player.claims[0].disposition, CLAIM_DISPOSITIONS.verificationRequired);

const supportedPlayer = classifyPlayerClaims({
  text: 'The inspection record was falsified.',
  supportedFactIds: ['fact.hesperus.inspectionFalsified']
});
assert.equal(supportedPlayer.claims[0].category, CLAIM_AUTHORITY_CATEGORIES.supportedHypothesis);
assert.equal(supportedPlayer.claims[0].disposition, CLAIM_DISPOSITIONS.acknowledgeUncertainty);
assert.equal(supportedPlayer.claims[0].evidenceRefIds[0], 'fact.hesperus.inspectionFalsified');

const generated = classifyGeneratedClaims({
  text: 'The crew confirmed that the abandoned cargo ship was carrying the missing crew.',
  review: { ok: true, findings: [] }
});
assert.equal(generated.category, CLAIM_AUTHORITY_CATEGORIES.generatedClaim);
assert.equal(generated.disposition, CLAIM_DISPOSITIONS.quarantine);
assert.equal(generated.accepted, false);
assert.equal(generated.claims.length, 1);

assert.equal(resolveClaimDisposition({ category: 'authoredFact' }).disposition, CLAIM_DISPOSITIONS.commit);
assert.equal(resolveClaimDisposition({ category: 'committedObservation' }).disposition, CLAIM_DISPOSITIONS.commit);
assert.equal(resolveClaimDisposition({ category: 'supportedHypothesis', evidenceRefIds: ['fact.1'] }).disposition, CLAIM_DISPOSITIONS.acknowledgeUncertainty);
assert.equal(resolveClaimDisposition({ category: 'unresolvedHypothesis' }).disposition, CLAIM_DISPOSITIONS.verificationRequired);
assert.equal(resolveClaimDisposition({ category: 'generatedClaim' }).disposition, CLAIM_DISPOSITIONS.quarantine);

console.log('claim authority passed');
