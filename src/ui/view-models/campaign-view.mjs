function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return String(value || '').trim();
}

function time(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function packageIdOf(pack = {}) {
  return text(pack.packageId || pack.manifest?.packageId || pack.id);
}

function packageImage(pack = {}) {
  return cloneJson(
    pack.image
    || pack.heroImage
    || pack.assets?.hero
    || pack.assets?.shipHero
    || (pack.ship?.id ? {
      kind: 'ship.hero',
      subjectId: pack.ship.id
    } : null)
    || null
  );
}

function packagePremise(pack = {}) {
  return text(
    pack.premise
    || pack.campaign?.premise
    || pack.summary
    || pack.description
  );
}

export function buildCampaignView({
  saves = [],
  packages = [],
  checkpoints = [],
  selectedCampaignId = ''
} = {}) {
  const packageMap = new Map((Array.isArray(packages) ? packages : [])
    .map((pack) => [packageIdOf(pack), pack])
    .filter(([id]) => id));
  const checkpointRows = (Array.isArray(checkpoints) ? checkpoints : [])
    .filter((checkpoint) => checkpoint?.kind === 'directive.manualCheckpoint.v1');
  const grouped = new Map();

  for (const save of Array.isArray(saves) ? saves : []) {
    if (!save?.id || save.slotType === 'autosave') continue;
    const campaignId = text(save.metadata?.campaignId);
    if (!campaignId) continue;
    if (!grouped.has(campaignId)) grouped.set(campaignId, []);
    grouped.get(campaignId).push(save);
  }

  const campaigns = [...grouped.entries()].map(([campaignId, campaignSaves]) => {
    const ordered = campaignSaves.slice().sort((left, right) => {
      if (left.current === true && right.current !== true) return -1;
      if (right.current === true && left.current !== true) return 1;
      return time(right.updatedAt || right.metadata?.lastUpdatedAt)
        - time(left.updatedAt || left.metadata?.lastUpdatedAt);
    });
    const timeline = ordered[0];
    const metadata = timeline.metadata || {};
    const packageId = text(metadata.packageId);
    const pack = packageMap.get(packageId) || {};
    const active = timeline.current === true;
    const binding = cloneJson(metadata.campaignChatBinding || timeline.campaignChatBinding || null);
    return {
      id: campaignId,
      title: text(metadata.campaignTitle || pack.title || pack.campaign?.title) || 'Campaign',
      playerName: text(metadata.playerName) || 'Player Commander',
      playerRole: text(metadata.playerRole || metadata.playerBillet) || 'Command Officer',
      shipName: text(metadata.shipName),
      status: text(metadata.campaignStatus) || (active ? 'active' : 'stored'),
      setting: text(metadata.setting || metadata.assignment || metadata.shipName),
      chapter: text(metadata.activeMissionTitle || metadata.chapterTitle || metadata.activeMissionId),
      lastPlayedAt: timeline.updatedAt || metadata.lastUpdatedAt || null,
      premise: text(metadata.summary) || packagePremise(pack),
      image: packageImage(pack),
      mediaPackage: {
        packageId: packageId || null,
        ship: cloneJson(pack.ship || null),
        assets: cloneJson(pack.assets || {})
      },
      packageId: packageId || null,
      active,
      canOpenChat: Boolean(active && binding?.chatId),
      canSaveGame: active,
      activeTimeline: {
        saveId: timeline.id,
        chatBindingAvailable: Boolean(binding?.chatId),
        chatBinding: binding
      },
      checkpoints: checkpointRows
        .filter((checkpoint) => checkpoint.campaignId === campaignId)
        .sort((left, right) => time(right.createdAt) - time(left.createdAt))
        .map((checkpoint) => ({
          id: checkpoint.id,
          name: checkpoint.name,
          chapter: checkpoint.summary?.chapter || null,
          stardate: checkpoint.summary?.stardate || null,
          createdAt: checkpoint.createdAt,
          loadable: true
        }))
    };
  }).sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    return time(right.lastPlayedAt) - time(left.lastPlayedAt);
  });

  const requested = text(selectedCampaignId);
  return {
    selectedCampaignId: campaigns.some((campaign) => campaign.id === requested)
      ? requested
      : (campaigns[0]?.id || null),
    campaigns
  };
}
