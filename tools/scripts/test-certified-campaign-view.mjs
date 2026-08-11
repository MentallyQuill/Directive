import assert from 'node:assert/strict';
import { buildCertifiedCampaignView } from '../../src/ui/view-models/certified-campaign-view.mjs';

const ashesId = 'directive:campaign-package:breckenridge-ashes-of-peace';
const view = {
  campaign: {
    packages: [
      {
        packageId: ashesId,
        title: 'Ashes of Peace',
        campaign: {
          highConcept: 'Current Ashes description.',
          eraLabel: '2376, Post-Dominion War',
          theater: 'Asterion Reach'
        },
        ship: { name: 'U.S.S. Breckenridge', class: 'Intrepid-class' },
        playerRole: { rank: 'Commander', billet: 'Executive Officer' },
        assets: { images: [{ kind: 'ship.hero', variants: { card: 'ashes.webp' } }] }
      },
      {
        packageId: 'directive:campaign-package:glass-harbor-drowned-constellation',
        title: 'Drowned Constellation',
        campaign: { highConcept: 'Current Drowned Constellation description.' },
        assets: { images: [{ kind: 'ship.hero', variants: { card: 'drowned.webp' } }] }
      }
    ]
  },
  campaignIndex: {
    selectedCampaignId: 'campaign.ashes',
    campaigns: [{
      id: 'campaign.ashes',
      packageId: ashesId,
      title: 'Ashes of Peace',
      active: true,
      characterName: 'Ren Okada - Ashes of Peace',
      checkpoints: [{ id: 'save.current', name: 'Current save', loadable: true }]
    }]
  }
};

const campaign = buildCertifiedCampaignView(view);
assert.deepEqual(campaign.packages.map(({ availability }) => availability), ['available', 'coming-later']);
assert.deepEqual(campaign.packages.map(({ disabled }) => disabled), [false, true]);
assert.deepEqual(campaign.packages.map(({ description }) => description), [
  'Current Ashes description.',
  'Current Drowned Constellation description.'
]);
assert.deepEqual(campaign.packages[0].facts, [
  { label: 'Era', value: '2376, Post-Dominion War' },
  { label: 'Theater', value: 'Asterion Reach' },
  { label: 'Assignment', value: 'U.S.S. Breckenridge, Intrepid-class' },
  { label: 'Your Role', value: 'Commander, Executive Officer' }
]);
assert.equal(campaign.selectedCampaignId, 'campaign.ashes');
assert.equal(campaign.campaigns[0].characterName, 'Ren Okada - Ashes of Peace');
assert.equal(campaign.campaigns[0].checkpoints[0].id, 'save.current');
view.campaign.packages[0].title = 'Mutated input';
view.campaign.packages[0].campaign.eraLabel = 'Mutated era';
assert.equal(campaign.packages[0].title, 'Ashes of Peace');
assert.equal(campaign.packages[0].facts[0].value, '2376, Post-Dominion War');

console.log('PASS certified Campaign view');
