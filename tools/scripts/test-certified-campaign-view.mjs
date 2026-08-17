import assert from 'node:assert/strict';
import { buildCertifiedCampaignView } from '../../src/ui/view-models/certified-campaign-view.mjs';

const ashesId = 'directive:campaign-package:breckenridge-ashes-of-peace';
const view = {
  v1PlayerProjection: {
    time: {
      kind: 'directive.timePlayerProjection.v1',
      stardate: 53068.405312,
      secondOfDay: 31059,
      clockDisplay: '08:37:39',
      stardateDisplay: '53068.4'
    }
  },
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
assert.deepEqual(campaign.time, view.v1PlayerProjection.time);
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

const mobilePriority = buildCertifiedCampaignView({
  ...view,
  campaignIndex: {
    campaigns: [
      { id: 'campaign.active', packageId: ashesId, active: true, lastPlayedAt: '2026-08-10T12:00:00.000Z' },
      { id: 'campaign.recent', packageId: ashesId, active: false, lastPlayedAt: '2026-08-12T12:00:00.000Z' },
      { id: 'campaign.invalid', packageId: ashesId, active: false, lastPlayedAt: 'not-a-date' }
    ]
  }
});
assert.equal(mobilePriority.selectedCampaignId, 'campaign.active', 'desktop selection must retain its active fallback');
assert.equal(mobilePriority.mobileCampaignId, 'campaign.recent', 'phone selection must prefer the last-played campaign');

const explicitMobilePriority = buildCertifiedCampaignView({
  ...view,
  campaignIndex: {
    selectedCampaignId: 'campaign.active',
    campaigns: mobilePriority.campaigns
  }
});
assert.equal(explicitMobilePriority.mobileCampaignId, 'campaign.active', 'an explicit rendered selection must win on phone');

console.log('PASS certified Campaign view');
