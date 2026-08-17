import {
  ASHES_V1_PACKAGE_ID,
  createV1CampaignPanelModel
} from '../v1-player-facing-panel-model.mjs';

const clone = (value) => value === undefined
  ? undefined
  : JSON.parse(JSON.stringify(value));

export function buildCertifiedCampaignView(view = {}) {
  const model = createV1CampaignPanelModel(view);
  const campaigns = clone(model.campaigns);
  const requestedCampaignId = view?.campaignIndex?.selectedCampaignId || null;
  const explicitCampaignId = campaigns.some((campaign) => campaign.id === requestedCampaignId)
    ? requestedCampaignId
    : null;
  const activeCampaignId = campaigns.find((campaign) => campaign.active)?.id || null;
  const lastPlayedCampaignId = campaigns
    .filter((campaign) => !Number.isNaN(new Date(campaign.lastPlayedAt).getTime()))
    .sort((left, right) => new Date(right.lastPlayedAt).getTime() - new Date(left.lastPlayedAt).getTime())[0]?.id || null;
  const packages = model.packages.map((pack) => {
    const packageId = pack.packageId || pack.id || pack.manifest?.id || '';
    const available = packageId === ASHES_V1_PACKAGE_ID;
    const facts = [
      { label: 'Era', value: pack.campaign?.eraLabel || pack.campaign?.openingYear },
      { label: 'Theater', value: pack.campaign?.theater },
      { label: 'Assignment', value: [pack.ship?.name, pack.ship?.class].filter(Boolean).join(', ') },
      { label: 'Your Role', value: [pack.playerRole?.rank, pack.playerRole?.billet].filter(Boolean).join(', ') }
    ]
      .map(({ label, value }) => ({ label, value: String(value || '').trim() }))
      .filter(({ value }) => value);
    return {
      ...clone(pack),
      packageId,
      title: pack.title || pack.campaign?.title || pack.manifest?.title || 'Untitled campaign',
      description: pack.description || pack.campaign?.highConcept || pack.manifest?.description || '',
      facts,
      availability: available ? 'available' : 'coming-later',
      disabled: !available
    };
  });
  return {
    time: view?.v1PlayerProjection?.time?.kind === 'directive.timePlayerProjection.v1'
      ? clone(view.v1PlayerProjection.time)
      : null,
    selectedCampaignId: explicitCampaignId || activeCampaignId,
    mobileCampaignId: explicitCampaignId || lastPlayedCampaignId || activeCampaignId,
    packages,
    campaigns
  };
}
