export const ASHES_V1_PACKAGE_ID = 'directive:campaign-package:breckenridge-ashes-of-peace';

function assetUrl(path) {
  return new URL(`../../${path}`, import.meta.url);
}

const ASHES_MISSIONS = Object.freeze([
  'prelude-a-ship-underway',
  'chapter-1-the-empty-convoy',
  'chapter-2-false-colors',
  'open-orders-1-work-worth-doing',
  'chapter-3-dead-letters',
  'chapter-4-the-colony-that-stayed',
  'chapter-5-old-lessons',
  'open-orders-2-what-survives',
  'chapter-6-the-cost-of-knowing',
  'chapter-7-a-peace-of-their-own',
  'open-orders-3-before-the-lamps-go-out',
  'chapter-8-the-last-directive',
  'epilogue-the-terms-we-keep'
]);

export const ASHES_V1_BUNDLED_REF = Object.freeze({
  id: ASHES_V1_PACKAGE_ID,
  slug: 'breckenridge-ashes-of-peace',
  title: 'Ashes of Peace',
  packagePath: 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',
  packageUrl: assetUrl('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json'),
  crewDatasetPath: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
  crewDatasetUrl: assetUrl('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json'),
  shipDatasetPath: 'packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json',
  shipDatasetUrl: assetUrl('packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json'),
  missionDefinitionRefs: Object.freeze(ASHES_MISSIONS.map((name) => Object.freeze({
    path: `packages/bundled/breckenridge/v1/${name}.mission-v1.json`,
    url: assetUrl(`packages/bundled/breckenridge/v1/${name}.mission-v1.json`)
  })))
});

export const BUNDLED_CAMPAIGN_PACKAGE_REFS = Object.freeze([ASHES_V1_BUNDLED_REF]);

function teaser({ id, title, shipId, shipName, summary, imageRoot }) {
  return Object.freeze({
    packageId: id,
    id,
    title,
    campaign: { title, highConcept: summary },
    ship: { id: shipId, name: shipName },
    assets: {
      images: [{
        id: `${shipId}.teaser`,
        kind: 'ship.hero',
        subjectId: shipId,
        variants: {
          hero: `${imageRoot}/${shipId}.hero.webp`,
          card: `${imageRoot}/${shipId}.card.webp`,
          thumb: `${imageRoot}/${shipId}.thumb.webp`
        },
        alt: `${shipName} campaign artwork`
      }]
    },
    teaserOnly: true
  });
}

export const V1_CAMPAIGN_LIBRARY_TEASERS = Object.freeze([
  teaser({
    id: ASHES_V1_PACKAGE_ID,
    title: 'Ashes of Peace',
    shipId: 'uss-breckenridge',
    shipName: 'U.S.S. Breckenridge',
    summary: 'A postwar command story about trust, reconstruction, and the terms peace demands.',
    imageRoot: 'assets/packages/breckenridge/images/ship'
  }),
  teaser({
    id: 'directive:campaign-package:glass-harbor-drowned-constellation',
    title: 'Drowned Constellation',
    shipId: 'uss-glass-harbor',
    shipName: 'U.S.S. Glass Harbor',
    summary: 'A rescue command faces the accumulating cost of saving everyone.',
    imageRoot: 'assets/packages/glass-harbor/images/ship'
  }),
  teaser({
    id: 'directive:campaign-package:serein-black-current',
    title: 'Black Current',
    shipId: 'uss-serein',
    shipName: 'U.S.S. Serein',
    summary: 'An uneasy frontier investigation tests what evidence and allegiance mean.',
    imageRoot: 'assets/packages/serein/images/ship'
  }),
  teaser({
    id: 'directive:campaign-package:eudora-vale-broken-accord',
    title: 'Broken Accord',
    shipId: 'uss-eudora-vale',
    shipName: 'U.S.S. Eudora Vale',
    summary: 'A fragile settlement asks whether peace can survive its own compromises.',
    imageRoot: 'assets/packages/eudora-vale/images/ship'
  }),
  teaser({
    id: 'directive:campaign-package:aster-vale-unseen-border',
    title: 'Unseen Border',
    shipId: 'uss-aster-vale',
    shipName: 'U.S.S. Aster Vale',
    summary: 'A missing colony draws a crew beyond the boundary of reliable maps.',
    imageRoot: 'assets/packages/aster-vale/images/ship'
  }),
  teaser({
    id: 'directive:campaign-package:celandine-enemys-garden',
    title: "Enemy's Garden",
    shipId: 'uss-celandine',
    shipName: 'U.S.S. Celandine',
    summary: 'A biological mystery turns cultivation, survival, and memory against one another.',
    imageRoot: 'assets/packages/celandine/images/ship'
  })
]);

export function getBundledCampaignPackageRef(packageIdOrSlug) {
  const key = String(packageIdOrSlug || '').trim();
  return key === ASHES_V1_BUNDLED_REF.id || key === ASHES_V1_BUNDLED_REF.slug
    ? ASHES_V1_BUNDLED_REF
    : null;
}

export function bundledCampaignPackagePaths() {
  return [ASHES_V1_BUNDLED_REF.packagePath];
}

export function bundledCrewDatasetPairs() {
  return [[ASHES_V1_BUNDLED_REF.packagePath, ASHES_V1_BUNDLED_REF.crewDatasetPath]];
}

export function bundledShipDatasetPairs() {
  return [[ASHES_V1_BUNDLED_REF.packagePath, ASHES_V1_BUNDLED_REF.shipDatasetPath]];
}

export function bundledMissionDefinitionPairs() {
  return ASHES_V1_BUNDLED_REF.missionDefinitionRefs.map((ref) => [ASHES_V1_BUNDLED_REF.packagePath, ref.path]);
}
