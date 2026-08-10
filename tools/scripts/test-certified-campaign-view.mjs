import assert from 'node:assert/strict';
import { buildCertifiedCampaignView } from '../../src/ui/view-models/certified-campaign-view.mjs';

const ashesId = 'directive:campaign-package:breckenridge-ashes-of-peace';
const view = {
  campaign: {
    packages: [
      {
        packageId: ashesId,
        title: 'Ashes of Peace',
        campaign: { highConcept: 'Current Ashes description.' },
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
assert.equal(campaign.selectedCampaignId, 'campaign.ashes');
assert.equal(campaign.campaigns[0].checkpoints[0].id, 'save.current');
view.campaign.packages[0].title = 'Mutated input';
assert.equal(campaign.packages[0].title, 'Ashes of Peace');

console.log('PASS certified Campaign view');
