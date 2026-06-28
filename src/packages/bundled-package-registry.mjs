function packageAssetUrl(relativePath) {
  return new URL(`../../${relativePath}`, import.meta.url);
}

function createBundledCampaignPackageRef({
  id,
  slug,
  campaignTitle,
  manifestTitle,
  status,
  assetRoots,
  packagePath,
  projectionPath,
  crewDatasetPath,
  shipDatasetPath = null,
  missionGraphPaths
}) {
  const graphPaths = Object.freeze([...missionGraphPaths]);
  const graphRefs = Object.freeze(graphPaths.map((path) => Object.freeze({
    path,
    url: packageAssetUrl(path)
  })));
  const roots = Object.freeze([...assetRoots]);
  return Object.freeze({
    id,
    slug,
    title: campaignTitle,
    campaignTitle,
    manifestTitle,
    status,
    assetRoot: roots[0] || '',
    assetRoots: roots,
    packagePath,
    packageUrl: packageAssetUrl(packagePath),
    projectionPath,
    projectionUrl: packageAssetUrl(projectionPath),
    crewDatasetPath,
    crewDatasetUrl: packageAssetUrl(crewDatasetPath),
    shipDatasetPath,
    shipDatasetUrl: shipDatasetPath ? packageAssetUrl(shipDatasetPath) : null,
    missionGraphPath: graphPaths[0] || '',
    missionGraphUrl: graphPaths[0] ? packageAssetUrl(graphPaths[0]) : null,
    missionGraphPaths: graphPaths,
    missionGraphUrls: graphRefs
  });
}

export const BUNDLED_CAMPAIGN_PACKAGE_REFS = Object.freeze([
  createBundledCampaignPackageRef({
    id: 'directive:campaign-package:breckenridge-ashes-of-peace',
    slug: 'breckenridge-ashes-of-peace',
    campaignTitle: 'Ashes of Peace',
    manifestTitle: 'U.S.S. Breckenridge: Ashes of Peace - Open World',
    status: 'pre-alpha',
    assetRoots: ['assets/packages/breckenridge'],
    packagePath: 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',
    projectionPath: 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
    crewDatasetPath: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
    shipDatasetPath: 'packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json',
    missionGraphPaths: [
      'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
      'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json',
      'packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json'
    ]
  }),
  createBundledCampaignPackageRef({
    id: 'directive:campaign-package:glass-harbor-drowned-constellation',
    slug: 'glass-harbor-drowned-constellation',
    campaignTitle: 'Drowned Constellation',
    manifestTitle: 'U.S.S. Glass Harbor: Drowned Constellation - Open World',
    status: 'draft',
    assetRoots: [
      'assets/packages/glass-harbor',
      'packages/bundled/glass-harbor/assets/maps'
    ],
    packagePath: 'packages/bundled/glass-harbor/drowned-constellation.campaign-package.json',
    projectionPath: 'packages/bundled/glass-harbor/drowned-constellation.campaign-projection.json',
    crewDatasetPath: 'packages/bundled/glass-harbor/glass-harbor-senior-staff.crew-dataset.json',
    missionGraphPaths: [
      'packages/bundled/glass-harbor/mission-graphs/prelude-soundings.mission-graph.json',
      'packages/bundled/glass-harbor/mission-graphs/chapter-1-aster-basin.mission-graph.json',
      'packages/bundled/glass-harbor/mission-graphs/chapter-2-caligo-sounding.mission-graph.json'
    ]
  }),
  createBundledCampaignPackageRef({
    id: 'directive:campaign-package:serein-black-current',
    slug: 'serein-black-current',
    campaignTitle: 'Black Current',
    manifestTitle: 'U.S.S. Serein: Black Current - Open World',
    status: 'draft',
    assetRoots: [
      'assets/packages/serein',
      'packages/bundled/serein/assets/maps'
    ],
    packagePath: 'packages/bundled/serein/black-current.campaign-package.json',
    projectionPath: 'packages/bundled/serein/black-current.campaign-projection.json',
    crewDatasetPath: 'packages/bundled/serein/serein-senior-staff.crew-dataset.json',
    missionGraphPaths: [
      'packages/bundled/serein/mission-graphs/prelude-wreckfall.mission-graph.json',
      'packages/bundled/serein/mission-graphs/chapter-1-first-manifest.mission-graph.json',
      'packages/bundled/serein/mission-graphs/chapter-2-forty-seven-hours-late.mission-graph.json'
    ]
  }),
  createBundledCampaignPackageRef({
    id: 'directive:campaign-package:eudora-vale-broken-accord',
    slug: 'eudora-vale-broken-accord',
    campaignTitle: 'Broken Accord',
    manifestTitle: 'U.S.S. Eudora Vale: Broken Accord - Open World',
    status: 'draft',
    assetRoots: ['assets/packages/eudora-vale'],
    packagePath: 'packages/bundled/eudora-vale/broken-accord.campaign-package.json',
    projectionPath: 'packages/bundled/eudora-vale/broken-accord.campaign-projection.json',
    crewDatasetPath: 'packages/bundled/eudora-vale/eudora-vale-senior-staff.crew-dataset.json',
    missionGraphPaths: [
      'packages/bundled/eudora-vale/mission-graphs/prelude-the-captains-chair.mission-graph.json',
      'packages/bundled/eudora-vale/mission-graphs/chapter-1-bread-and-weather.mission-graph.json',
      'packages/bundled/eudora-vale/mission-graphs/chapter-2-the-weight-of-water.mission-graph.json'
    ]
  }),
  createBundledCampaignPackageRef({
    id: 'directive:campaign-package:aster-vale-unseen-border',
    slug: 'aster-vale-unseen-border',
    campaignTitle: 'Unseen Border',
    manifestTitle: 'U.S.S. Aster Vale: Unseen Border - Open World',
    status: 'draft',
    assetRoots: ['assets/packages/aster-vale'],
    packagePath: 'packages/bundled/aster-vale/unseen-border.campaign-package.json',
    projectionPath: 'packages/bundled/aster-vale/unseen-border.campaign-projection.json',
    crewDatasetPath: 'packages/bundled/aster-vale/aster-vale-senior-staff.crew-dataset.json',
    missionGraphPaths: [
      'packages/bundled/aster-vale/mission-graphs/prelude-the-blank-route.mission-graph.json',
      'packages/bundled/aster-vale/mission-graphs/chapter-1-the-missing-colony.mission-graph.json',
      'packages/bundled/aster-vale/mission-graphs/chapter-2-haldens-shuttle.mission-graph.json'
    ]
  }),
  createBundledCampaignPackageRef({
    id: 'directive:campaign-package:celandine-enemys-garden',
    slug: 'celandine-enemys-garden',
    campaignTitle: "Enemy's Garden",
    manifestTitle: "U.S.S. Celandine: Enemy's Garden - Open World",
    status: 'draft',
    assetRoots: [
      'assets/packages/celandine',
      'packages/bundled/celandine/assets/maps'
    ],
    packagePath: 'packages/bundled/celandine/enemys-garden.campaign-package.json',
    projectionPath: 'packages/bundled/celandine/enemys-garden.campaign-projection.json',
    crewDatasetPath: 'packages/bundled/celandine/celandine-senior-staff.crew-dataset.json',
    missionGraphPaths: [
      'packages/bundled/celandine/mission-graphs/prelude-the-first-harvest.mission-graph.json',
      'packages/bundled/celandine/mission-graphs/chapter-1-the-old-seed.mission-graph.json',
      'packages/bundled/celandine/mission-graphs/chapter-2-a-marker-in-the-blood.mission-graph.json'
    ]
  })
]);

export function getBundledCampaignPackageRef(packageIdOrSlug) {
  const key = String(packageIdOrSlug || '').trim();
  return BUNDLED_CAMPAIGN_PACKAGE_REFS.find((ref) => ref.id === key || ref.slug === key) || null;
}

export function bundledCampaignPackagePaths() {
  return BUNDLED_CAMPAIGN_PACKAGE_REFS.map((ref) => ref.packagePath);
}

export function bundledCampaignProjectionPairs() {
  return BUNDLED_CAMPAIGN_PACKAGE_REFS.map((ref) => [ref.projectionPath, ref.packagePath]);
}

export function bundledCrewDatasetPairs() {
  return BUNDLED_CAMPAIGN_PACKAGE_REFS.map((ref) => [ref.packagePath, ref.crewDatasetPath]);
}

export function bundledShipDatasetPairs() {
  return BUNDLED_CAMPAIGN_PACKAGE_REFS
    .filter((ref) => ref.shipDatasetPath)
    .map((ref) => [ref.packagePath, ref.shipDatasetPath]);
}

export function bundledMissionGraphTriples() {
  return BUNDLED_CAMPAIGN_PACKAGE_REFS.flatMap((ref) => (
    ref.missionGraphPaths.map((graphPath) => [ref.packagePath, ref.crewDatasetPath, graphPath])
  ));
}
