import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { reviewContinuityContradictions } from '../../src/continuity/contradiction-guard.mjs';

const packagePath = path.join('packages', 'bundled', 'breckenridge', 'ashes-of-peace.campaign-package.json');
const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

function review(text) {
  return reviewContinuityContradictions({
    text,
    campaignState: {},
    packageData
  });
}

const sixDayReview = review('The Breckenridge has been at impulse for six days since leaving Utopia Planitia.');
assert.equal(sixDayReview.ok, false);
assert(sixDayReview.findings.some((finding) => finding.factId?.endsWith('.not-six-days-impulse')));

const shortRefitReview = review("The U.S.S. Breckenridge was three days out of Utopia Planitia's refit cradle, and it showed.");
assert.equal(shortRefitReview.ok, false);
assert(shortRefitReview.findings.some((finding) => finding.factId?.endsWith('.not-short-refit-duration')));

const validOpeningReview = review([
  'The Breckenridge is twenty-five days out from Utopia Planitia.',
  'The shuttle approaches from astern and settles onto the hangar floor of Shuttlebay 2.'
].join(' '));
assert.equal(validOpeningReview.ok, true);

const hesperusState = {
  campaign: {
    packageId: 'directive:campaign-package:breckenridge-ashes-of-peace'
  },
  mission: {
    activeMissionId: 'prelude-a-ship-underway',
    activePhaseId: 'shuttle-rendezvous',
    phase: 'shuttle-rendezvous'
  }
};

function reviewHesperus(text, activePackageData = packageData) {
  return reviewContinuityContradictions({
    text,
    campaignState: hesperusState,
    packageData: activePackageData
  });
}

const pirateAssertionReview = reviewHesperus([
  'Bronn folded his arms. "Pirates took the Hesperus cargo; that much is clear."',
  'Whitaker nodded and ordered pursuit of the raiders.'
].join(' '), null);
assert.equal(pirateAssertionReview.ok, false);
assert(pirateAssertionReview.findings.some((finding) => finding.kind === 'mission-guardrail-violation'));

const cautiousHypothesisReview = reviewHesperus([
  'Bronn folded his arms. "Piracy is one possibility, but the evidence is not there yet."',
  'Whitaker ordered the crew to keep the Hesperus rescue and repair assessment first.'
].join(' '), null);
assert.equal(cautiousHypothesisReview.ok, true);

console.log('continuity contradiction guard ok');
