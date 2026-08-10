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
    summary: 'The Dominion War is over, but the choices made to survive it still shape Federation worlds. You join the USS Breckenridge as its new executive officer while a mostly reconstituted crew returns to service. Three days later, a stabilization assignment begins with missing relief crews and counterfeit Starfleet orders. Command the mission, shape the crew, and decide what Starfleet principles require when restoring the old order may not be enough.',
    imageRoot: 'assets/packages/breckenridge/images/ship'
  }),
  teaser({
    id: 'directive:campaign-package:glass-harbor-drowned-constellation',
    title: 'Drowned Constellation',
    shipId: 'uss-glass-harbor',
    shipName: 'U.S.S. Glass Harbor',
    summary: 'As the newly promoted executive officer of the USS Glass Harbor, you enter the unmapped currents of the Nerine Reef. When the captain and her shuttle vanish during a gravitic inversion, you assume acting command. Rescue, survey, escort, and diplomacy all depend on charts that different communities need for different reasons. Decide who may map the Reef when every reliable route can save lives, expose a sanctuary, create a border, or become a weapon.',
    imageRoot: 'assets/packages/glass-harbor/images/ship'
  }),
  teaser({
    id: 'directive:campaign-package:serein-black-current',
    title: 'Black Current',
    shipId: 'uss-serein',
    shipName: 'U.S.S. Serein',
    summary: 'The Dominion War is over, but the Vanta Wake continues to deliver its wreckage. A migrating subspace current releases damaged vessels, live ordnance, records, and survivors months after the battles that trapped them. Command the USS Serein through rescue operations where every recovered person and object carries competing claims. Decide who owns what returns, which people are still legally alive, and what it means to come home to a world that already buried you.',
    imageRoot: 'assets/packages/serein/images/ship'
  }),
  teaser({
    id: 'directive:campaign-package:eudora-vale-broken-accord',
    title: 'Broken Accord',
    shipId: 'uss-eudora-vale',
    shipName: 'U.S.S. Eudora Vale',
    summary: 'Five inhabited worlds depend on a shared terraforming lattice that has kept their fragile environments alive for generations. When a lattice surge leaves the USS Eudora Vale without its captain, you inherit your first independent command. Keeping the system alive means discovering why its benefits and burdens were never shared honestly. Balance finite Starfleet resources, competing planetary needs, and the question of what lawful authority can replace a peace built on unequal sacrifice.',
    imageRoot: 'assets/packages/eudora-vale/images/ship'
  }),
  teaser({
    id: 'directive:campaign-package:aster-vale-unseen-border',
    title: 'Unseen Border',
    shipId: 'uss-aster-vale',
    shipName: 'U.S.S. Aster Vale',
    summary: 'Starfleet charts say the Lacuna March is empty in places where families are raising children and convoys still travel by mutable markers. When an official colony route ends in empty space, you take the USS Aster Vale beyond the boundary of reliable maps. Every route you restore may save a settlement, expose a sanctuary, or reveal whose orders made entire communities disappear on paper. Command the ship, protect the witnesses, and decide whether visibility is rescue, betrayal, or both.',
    imageRoot: 'assets/packages/aster-vale/images/ship'
  }),
  teaser({
    id: 'directive:campaign-package:celandine-enemys-garden',
    title: "Enemy's Garden",
    shipId: 'uss-celandine',
    shipName: 'U.S.S. Celandine',
    summary: 'Several worlds survived the final years of the Dominion War by adopting K-17 crops that thrive in damaged soil. The harvest prevented famine, but it also displaced local seed lines and bound each world to a dangerous biological inheritance. When the USS Celandine captain enters quarantine, you assume acting command over a relief mission no planet can survive alone. Guide the transition through planting deadlines, finite clean stock, and competing claims over who controls the seeds, the science, and the future.',
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
