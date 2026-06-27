import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DIRECTIVE_PRIMARY_ROUTES,
  getDirectiveRoute
} from '../../src/ui/directive-routes.mjs';
import {
  DIRECTIVE_BUNDLED_ICON_PACKS,
  DIRECTIVE_ICON_SLOTS,
  resolveDirectiveIconSlot
} from '../../src/theme/directive-icon-packs.mjs';
import {
  DIRECTIVE_BUNDLED_THEME_PACKS,
  DIRECTIVE_THEME_TOKEN_ROLES,
  applyDirectiveTheme
} from '../../src/theme/directive-theme-packs.mjs';
import { createCampaignPackageSummary } from '../../src/packages/campaign-package-context.mjs';
import { resolvePackageImage } from '../../src/packages/package-image-resolver.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function walkData(value, visitor, trail = '$') {
  visitor(value, trail);
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkData(item, visitor, `${trail}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    walkData(child, visitor, `${trail}.${key}`);
  }
}

function assertPassiveData(records, label) {
  walkData(records, (value, trail) => {
    assert.notEqual(typeof value, 'function', `${label} contains a function at ${trail}`);
    if (typeof value !== 'string') return;
    assert.doesNotMatch(value, /<\s*script\b/i, `${label} contains script markup at ${trail}`);
    assert.doesNotMatch(value, /\bjavascript\s*:/i, `${label} contains a script URL at ${trail}`);
    assert.doesNotMatch(value, /@\s*import\b/i, `${label} contains CSS import text at ${trail}`);
    assert.doesNotMatch(value, /\bexpression\s*\(/i, `${label} contains executable CSS text at ${trail}`);
    assert.doesNotMatch(value, /\burl\s*\(/i, `${label} contains URL-bearing CSS text at ${trail}`);
  });
}

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function listFiles(relativePath) {
  const root = path.join(repoRoot, relativePath);
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relativePath, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) files.push(...await listFiles(child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

assert.equal(DIRECTIVE_BUNDLED_THEME_PACKS.length, 1, 'first slice should define one bundled default Theme Pack');
const defaultTheme = DIRECTIVE_BUNDLED_THEME_PACKS[0];
assert.equal(defaultTheme.kind, 'directive.theme-pack');
assert.equal(defaultTheme.source, 'bundled');
for (const tokenRole of DIRECTIVE_THEME_TOKEN_ROLES) {
  assert.ok(defaultTheme.tokens[tokenRole], `default Theme Pack missing ${tokenRole}`);
}
assert.deepEqual(
  Object.keys(defaultTheme.tokens).sort(),
  [...DIRECTIVE_THEME_TOKEN_ROLES].sort(),
  'default Theme Pack should define exactly the approved semantic roles'
);
assertPassiveData(DIRECTIVE_BUNDLED_THEME_PACKS, 'Theme Pack data');

assert.equal(DIRECTIVE_BUNDLED_ICON_PACKS.length, 1, 'first slice should define one bundled default Icon Pack');
const defaultIconPack = DIRECTIVE_BUNDLED_ICON_PACKS[0];
assert.equal(defaultIconPack.kind, 'directive.icon-pack');
assert.equal(defaultIconPack.source, 'bundled');
for (const iconSlot of DIRECTIVE_ICON_SLOTS) {
  assert.ok(defaultIconPack.slots[iconSlot], `default Icon Pack missing ${iconSlot}`);
  assert.match(defaultIconPack.slots[iconSlot].type, /^(class|mask)$/, `${iconSlot} should use a supported icon descriptor type`);
}
assertPassiveData(DIRECTIVE_BUNDLED_ICON_PACKS, 'Icon Pack data');

for (const iconSlot of [
  'route.campaign',
  'route.mission',
  'route.crew',
  'route.ship',
  'route.log',
  'route.settings',
  'action.drawerCollapse',
  'action.drawerExpand',
  'action.close',
  'action.refresh',
  'action.resize'
]) {
  assert.equal(defaultIconPack.slots[iconSlot].type, 'mask', `${iconSlot} should use the bundled vector glyph`);
}

assert.equal(
  getDirectiveRoute('settings').shelfLabel,
  'Providers & Controls',
  'Settings shelf label should foreground provider controls'
);
assert.equal(
  DIRECTIVE_PRIMARY_ROUTES.filter((route) => route.id === 'settings').length,
  1,
  'Settings should remain a single primary route'
);

const conventionalShellSlots = new Map([
  ['action.fullscreen', 'fa-regular fa-window-maximize'],
  ['action.restore', 'fa-regular fa-window-restore'],
  ['action.densityCompact', 'fa-solid fa-outdent'],
  ['action.densityExpanded', 'fa-solid fa-indent']
]);
for (const [iconSlot, className] of conventionalShellSlots) {
  assert.equal(defaultIconPack.slots[iconSlot].type, 'class', `${iconSlot} should use a conventional utility icon`);
  assert.equal(defaultIconPack.slots[iconSlot].value, className, `${iconSlot} should use the expected utility icon class`);
}

const missionIcon = resolveDirectiveIconSlot(defaultIconPack, 'route.mission');
assert.equal(missionIcon.source, 'pack');
assert.equal(missionIcon.type, 'mask');
assert.equal(missionIcon.value, 'route-mission');

const fallbackIcon = resolveDirectiveIconSlot({ slots: {} }, 'action.openOrders');
assert.equal(fallbackIcon.source, 'fallback');
assert.equal(fallbackIcon.value, 'fa-solid fa-share-nodes');

const unknownIcon = resolveDirectiveIconSlot({ slots: {} }, 'route.unmapped');
assert.equal(unknownIcon.source, 'fallback');
assert.equal(unknownIcon.value, 'fa-solid fa-circle');
const closeIcon = resolveDirectiveIconSlot(defaultIconPack, 'action.close');
assert.equal(closeIcon.source, 'pack');
assert.equal(closeIcon.type, 'mask');
assert.equal(closeIcon.value, 'action-close');

const appliedTheme = {};
const themedRoot = {
  dataset: {},
  style: {
    setProperty(key, value) {
      appliedTheme[key] = value;
    }
  }
};
assert.equal(applyDirectiveTheme(themedRoot, defaultTheme), defaultTheme);
assert.equal(themedRoot.dataset.directiveThemePack, defaultTheme.id);
for (const tokenRole of DIRECTIVE_THEME_TOKEN_ROLES) {
  assert.equal(appliedTheme[tokenRole], defaultTheme.tokens[tokenRole], `runtime theme should apply ${tokenRole}`);
}

const packageFixture = {
  assets: {
    images: [
      {
        id: 'fixture.crew.mara.primary',
        kind: 'crew.portrait.formal',
        subjectId: 'mara-whitaker',
        variants: {
          card: 'assets/packages/example/images/crew/mara-whitaker.card.webp',
          thumb: 'assets/packages/example/images/crew/mara-whitaker.thumb.webp'
        },
        alt: 'Captain Mara Whitaker'
      },
      {
        id: 'fixture.ship.primary',
        kind: 'ship.hero',
        subjectId: 'uss-test',
        variants: {
          hero: 'assets/packages/example/images/ship/uss-test.hero.webp',
          card: 'assets/packages/example/images/ship/uss-test.card.webp'
        },
        alt: 'U.S.S. Test'
      }
    ]
  }
};

const crewDetail = resolvePackageImage(packageFixture, {
  kind: 'crew.portrait.formal',
  subjectId: 'mara-whitaker',
  variant: 'detail'
});
assert.equal(crewDetail.type, 'image');
assert.equal(crewDetail.variant, 'card');
assert.equal(crewDetail.fallbackReason, 'variant-fallback');
assert.equal(crewDetail.path, 'assets/packages/example/images/crew/mara-whitaker.card.webp');
assert.equal(crewDetail.alt, 'Captain Mara Whitaker');

const shipHero = resolvePackageImage(packageFixture, {
  kind: 'ship.hero',
  subjectId: 'uss-test',
  variant: 'hero'
});
assert.equal(shipHero.type, 'image');
assert.equal(shipHero.variant, 'hero');
assert.equal(shipHero.fallbackReason, '');

const missingCrew = resolvePackageImage(packageFixture, {
  kind: 'crew.portrait.formal',
  subjectId: 'player-commander',
  variant: 'thumb'
});
assert.equal(missingCrew.type, 'placeholder');
assert.equal(missingCrew.placeholderType, 'directive.package-image-placeholder');
assert.equal(missingCrew.label, 'PC');
assert.equal(missingCrew.reason, 'missing-image');

const breckenridgePackage = JSON.parse(await readText('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json'));
const breckenridgeStationHero = resolvePackageImage(breckenridgePackage, {
  kind: 'location.hero',
  subjectId: 'asterion-station',
  variant: 'hero'
});
assert.equal(breckenridgeStationHero.type, 'image');
assert.equal(breckenridgeStationHero.path, 'assets/packages/breckenridge/images/locations/asterion-station.hero.webp');
assert.doesNotMatch(JSON.stringify(breckenridgePackage.assets?.images || []), /sourcePath|assets\/packages\/breckenridge\/source/, 'package runtime metadata should not point at bulky source PNGs');

const glassHarborPackage = JSON.parse(await readText('packages/bundled/glass-harbor/drowned-constellation.campaign-package.json'));
const glassHarborSummary = createCampaignPackageSummary(glassHarborPackage);
const glassHarborShipHero = resolvePackageImage(glassHarborPackage, {
  kind: 'ship.hero',
  subjectId: 'uss-glass-harbor',
  variant: 'hero'
});
assert.equal(glassHarborShipHero.type, 'image');
assert.equal(glassHarborShipHero.path, 'assets/packages/glass-harbor/images/ship/uss-glass-harbor.hero.webp');
const glassHarborSummaryShipHero = resolvePackageImage(glassHarborSummary, {
  kind: 'ship.hero',
  subjectId: 'uss-glass-harbor',
  variant: 'card'
});
assert.equal(glassHarborSummaryShipHero.type, 'image');
assert.equal(glassHarborSummaryShipHero.path, 'assets/packages/glass-harbor/images/ship/uss-glass-harbor.card.webp');
for (const crewId of ['amina-rhos', 'ishan-tal', 'mara-venn', 'shara-zhthenn', 'olan-rix', 'sorren-vale', 'tkessa', 'cpo-hark']) {
  const portrait = resolvePackageImage(glassHarborPackage, {
    kind: 'crew.portrait.formal',
    subjectId: crewId,
    variant: 'detail'
  });
  assert.equal(portrait.type, 'image', `Glass Harbor ${crewId} portrait should resolve`);
  assert.equal(portrait.path, `assets/packages/glass-harbor/images/crew/${crewId}.detail.webp`);
}

const sereinPackage = JSON.parse(await readText('packages/bundled/serein/black-current.campaign-package.json'));
const sereinSummary = createCampaignPackageSummary(sereinPackage);
const sereinShipHero = resolvePackageImage(sereinPackage, {
  kind: 'ship.hero',
  subjectId: 'uss-serein',
  variant: 'hero'
});
assert.equal(sereinShipHero.type, 'image');
assert.equal(sereinShipHero.path, 'assets/packages/serein/images/ship/uss-serein.hero.webp');
const sereinSummaryShipHero = resolvePackageImage(sereinSummary, {
  kind: 'ship.hero',
  subjectId: 'uss-serein',
  variant: 'card'
});
assert.equal(sereinSummaryShipHero.type, 'image');
assert.equal(sereinSummaryShipHero.path, 'assets/packages/serein/images/ship/uss-serein.card.webp');
for (const crewId of ['anika-lorne', 'tmeru', 'ral-enor', 'hesh-marr', 'lio-sen', 'nira-zhren', 'samir-holt', 'cpo-vek']) {
  const portrait = resolvePackageImage(sereinPackage, {
    kind: 'crew.portrait.formal',
    subjectId: crewId,
    variant: 'detail'
  });
  assert.equal(portrait.type, 'image', `Serein ${crewId} portrait should resolve`);
  assert.equal(portrait.path, `assets/packages/serein/images/crew/${crewId}.detail.webp`);
}

const asterValePackage = JSON.parse(await readText('packages/bundled/aster-vale/unseen-border.campaign-package.json'));
for (const crewId of ['idris-kellan', 'lyra-chen', 'sima-taren', 'neral-thzor', 'omar-venn', 'tavra-nesh', 'ilan-korev', 'mara-dey']) {
  const portrait = resolvePackageImage(asterValePackage, {
    kind: 'crew.portrait.formal',
    subjectId: crewId,
    variant: 'detail'
  });
  assert.equal(portrait.type, 'image', `Aster Vale ${crewId} portrait should resolve`);
  assert.equal(portrait.path, `assets/packages/aster-vale/images/crew/${crewId}.detail.webp`);
}

const eudoraValePackage = JSON.parse(await readText('packages/bundled/eudora-vale/broken-accord.campaign-package.json'));
for (const crewId of ['nasrin-rhee', 'asha-ren', 'haro-chveth', 'milo-fenn', 'ila-tovan', 'koris-zhraal', 'jaya-kel', 'venn-talar']) {
  const portrait = resolvePackageImage(eudoraValePackage, {
    kind: 'crew.portrait.formal',
    subjectId: crewId,
    variant: 'detail'
  });
  assert.equal(portrait.type, 'image', `Eudora Vale ${crewId} portrait should resolve`);
  assert.equal(portrait.path, `assets/packages/eudora-vale/images/crew/${crewId}.detail.webp`);
}

const celandinePackage = JSON.parse(await readText('packages/bundled/celandine/enemys-garden.campaign-package.json'));
for (const crewId of ['maia-dorel', 'rinn-sorell', 'sovek', 'anika-bost', 'thena-zharis', 'calen-varo', 'nomi-keth', 'emet-raal']) {
  const portrait = resolvePackageImage(celandinePackage, {
    kind: 'crew.portrait.formal',
    subjectId: crewId,
    variant: 'detail'
  });
  assert.equal(portrait.type, 'image', `Celandine ${crewId} portrait should resolve`);
  assert.equal(portrait.path, `assets/packages/celandine/images/crew/${crewId}.detail.webp`);
}

const packageSourceImages = (await listFiles('assets/packages')).filter((filePath) => /\.(?:png|jpe?g)$/i.test(filePath));
assert.deepEqual(packageSourceImages, [], 'package runtime assets should not include source PNG/JPEG files; keep rebuild inputs in ignored source-images/');

const resolverSource = await readText('src/packages/package-image-resolver.mjs');
assert.doesNotMatch(resolverSource, /breckenridge/i, 'image resolver must not build package-specific filenames');

const css = await readText('styles/directive.css');
assert.match(css, /\.directive-floating-tooltip\s*\{/, 'CSS should define the shared Directive floating tooltip');
assert.match(css, /\.directive-guidance-popover\s*\{[\s\S]*?position:\s*fixed\s*!important/, 'Guidance popovers should keep fixed viewport positioning.');
assert.match(css, /\.directive-guidance-popover\.directive-lcars-panel\s*\{[\s\S]*?position:\s*fixed\s*!important/, 'Guidance popovers should not be reset by shared LCARS panel positioning.');
assert.match(css, /\.directive-guidance-actions \.directive-button\s*\{[\s\S]*?min-height:\s*28px\s*!important/, 'Guidance text buttons should stay compact under the runtime shell button theme.');
assert.match(css, /\.directive-guidance-popover \.directive-guidance-icon-button\.directive-icon-button\s*\{[\s\S]*?width:\s*28px\s*!important/, 'Guidance icon buttons should override broad runtime icon-button sizing.');
assert.match(css, /\.directive-guidance-popover \.directive-guidance-icon-button\.directive-icon-button:hover,[\s\S]*?\.directive-guidance-popover \.directive-guidance-icon-button\.directive-icon-button:focus-visible\s*\{[\s\S]*?color:\s*var\(--directive-bg,[\s\S]*?background:\s*var\(--directive-accent/, 'Guidance icon-button hover should keep arrows visibly contrasted.');
for (const requiredToken of [
  '--directive-bg',
  '--directive-text',
  '--directive-border',
  '--directive-border-strong',
  '--directive-muted',
  '--directive-button',
  '--directive-button-hover',
  '--directive-button-text',
  '--directive-input',
  '--directive-input-border',
  '--directive-focus',
  '--directive-surface',
  '--directive-surface-alt'
]) {
  assert.match(css, new RegExp(requiredToken), `CSS should route existing shell/control surfaces through ${requiredToken}`);
}

assert.doesNotMatch(css, /\bdirective-(fab|floating-action)\b/i, 'Directive CSS must not introduce floating shell controls');
assert.match(css, /\.directive-runtime-panel\s*\{[\s\S]*?\btop:\s*16px;/, 'desktop shell should remain top anchored');
assert.match(css, /\.directive-shell-actions\s*\{[\s\S]*?justify-content:\s*flex-end;/, 'shell actions should remain top-right aligned');
assert.match(css, /\.directive-runtime-panel\s*\{[\s\S]*?\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/, 'runtime shell should reserve a persistent bottom navigation row');
assert.match(css, /\.directive-mobile-bottom-bar\s*\{[\s\S]*?repeat\(var\(--directive-mobile-bottom-tab-count,\s*6\),\s*minmax\(0,\s*1fr\)\)/, 'shared shell should use bottom route navigation at every viewport');
assert.match(css, /\.directive-mobile-bottom-tab-active\s*\{[\s\S]*?\bborder-color:\s*var\(--directive-border-strong/, 'shared shell should highlight the active bottom route with theme border tokens');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-panel\s*\{[\s\S]*?\binset:\s*0;/, 'phone-width shell should fill the viewport from the top');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-panel\s*\{[\s\S]*?\bheight:\s*100dvh;/, 'phone-width shell should set explicit viewport height for fixed-position hosts with zero-height html roots');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-panel\s*\{[\s\S]*?\bz-index:\s*10020;/, 'phone-width shell should sit above other full-screen extension panels');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-header\s*\{[\s\S]*?\bdisplay:\s*grid;/, 'phone-width shell should keep title and shell actions visible above bottom navigation');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-body\s*\{[\s\S]*?\bflex:\s*1\s+1\s+auto;/, 'phone-width shell should make content the primary scroll pane');
assert.match(css, /\/\* Status tiles[\s\S]*?\.directive-lcars-status-block\s*\{[\s\S]*?\bmin-height:\s*48px\s*!important;[\s\S]*?\bgrid-template-columns:\s*28px\s+minmax\(0,\s*1fr\)\s*!important;[\s\S]*?\bpadding:\s*6px\s+8px\s*!important;/, 'shared LCARS status tiles should use the compact density contract');
assert.match(css, /\/\* Status tiles[\s\S]*?\.directive-lcars-status-icon\s*\{[\s\S]*?\bwidth:\s*28px\s*!important;[\s\S]*?\bheight:\s*28px\s*!important;/, 'shared LCARS status tile icon wells should stay compact');
assert.match(css, /\.directive-runtime-panel\.directive-command-spine-shell\s*\{[\s\S]*?--directive-shell-left:\s*16px;[\s\S]*?\bleft:\s*var\(--directive-shell-left\)\s*!important;/, 'SillyTavern command spine should keep a persisted horizontal shelf position');
assert.match(css, /\.directive-runtime-panel\.directive-command-spine-shell\s*\{[\s\S]*?--directive-shell-top:\s*calc\(\(100dvh - var\(--directive-spine-height\)\) \/ 2\);[\s\S]*?\btop:\s*var\(--directive-shell-top\)\s*!important;/, 'SillyTavern command spine should default to centered vertical shelf geometry');
assert.match(css, /\.directive-runtime-panel\.directive-command-spine-shell\s*\{[\s\S]*?--directive-spine-height:\s*min\(400px,\s*calc\(100dvh - 32px\)\);[\s\S]*?\bheight:\s*var\(--directive-spine-height\)\s*!important;/, 'SillyTavern command shelf height should be independent of drawer resizing');
assert.match(css, /\.directive-command-spine-shell \.directive-command-shelf-drag-handle\s*\{[\s\S]*?\bcursor:\s*grab;/, 'the command shelf should expose a visible drag affordance on its handle regions');
assert.match(css, /\.directive-command-spine-shell \.directive-command-spine\s*\{[\s\S]*?grid-template-rows:\s*58px\s+minmax\(0,\s*1fr\)\s+58px;/, 'command shelf should reserve a tight grab bar for the new logo artwork');
assert.match(css, /\.directive-command-spine-shell \.directive-spine-brand\s*\{[\s\S]*?background:\s*linear-gradient\(155deg,\s*var\(--directive-amber-bright,\s*#ffb238\),\s*var\(--directive-orange,\s*#e56f24\)\);/, 'command shelf logo box should use the Campaign active amber gradient');
assert.match(css, /\.directive-command-spine-shell \.directive-spine-brand-logo\s*\{[\s\S]*?background-image:\s*url\("\.\.\/assets\/branding\/directive-logo-compact-dark-alpha\.png"\)/, 'collapsed command shelf should use the compact Directive logo asset');
assert.match(css, /\.directive-command-spine-shell\.directive-spine-expanded \.directive-spine-brand-logo\s*\{[\s\S]*?background-image:\s*url\("\.\.\/assets\/branding\/directive-logo-wide-dark-alpha\.png"\)/, 'expanded command shelf should use the wide Directive logo asset');
assert.match(css, /\.directive-command-spine-shell \.directive-command-drawer\s*\{[\s\S]*?left:\s*calc\(var\(--directive-spine-width\) \+ var\(--directive-drawer-gap\)\)/, 'the active command drawer should open to the right of the spine');
assert.match(css, /\.directive-command-spine-shell \.directive-command-drawer\s*\{[\s\S]*?\bcontainer-type:\s*inline-size;/, 'the active command drawer should provide the resize-aware container for route panels');
assert.match(css, /\.directive-command-spine-shell \.directive-campaign-overview\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)\s*!important;/, 'command-spine Campaign status tiles should use compact responsive columns');
assert.match(css, /\.directive-command-spine-shell \.directive-mission-command-facts,[\s\S]*?\.directive-command-spine-shell \.directive-log-summary-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)\s*!important;/, 'command-spine route status grids should use compact responsive columns');
assert.match(css, /\.directive-command-spine-shell \.directive-ship-hero\s*\{[\s\S]*?grid-template-columns:\s*minmax\(320px,\s*0\.9fr\)\s+minmax\(0,\s*1\.72fr\)\s*!important;/, 'command-spine Ship hero should keep a wide ship picture on the right at drawer width');
assert.match(css, /\.directive-ship-hero-media\s*\{[\s\S]*?width:\s*calc\(100% \+ clamp\(84px,\s*10cqw,\s*128px\)\);[\s\S]*?margin-left:\s*calc\(-1 \* clamp\(84px,\s*10cqw,\s*128px\)\);/, 'Ship hero media should overlap the copy edge for the crossfade');
assert.match(css, /@container\s*\(max-width:\s*640px\)\s*\{\s*\.directive-command-spine-shell \.directive-ship-hero\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;[\s\S]*?\.directive-command-spine-shell \.directive-ship-hero-media\s*\{[\s\S]*?width:\s*100%;[\s\S]*?margin-left:\s*0;/, 'command-spine Ship hero should remove the crossfade overlap when stacked in narrow drawers');
assert.match(css, /\.directive-command-spine-shell \.directive-command-drawer-resize-handle\s*\{[\s\S]*?\bbottom:\s*-1px;/, 'command drawer resize handle should sit on the bottom edge');
assert.doesNotMatch(css, /\.directive-command-spine-shell \.directive-command-drawer-resize-handle-left\s*\{/, 'the command drawer should not keep a bottom-left resize handle');
assert.match(css, /\.directive-command-spine-shell \.directive-command-drawer-resize-handle-right\s*\{[\s\S]*?\bright:\s*-1px;/, 'the command drawer should expose a bottom-right resize handle');
assert.match(css, /\.directive-command-spine-shell \.directive-command-drawer-resize-handle-right \.directive-command-drawer-resize-icon\s*\{[\s\S]*?transform:\s*scaleX\(-1\);/, 'the bottom-right drawer resize glyph should face the drawer corner');
assert.match(css, /\.directive-command-spine-shell\.directive-runtime-fullscreen \.directive-command-drawer\s*\{[\s\S]*?\bposition:\s*fixed\s*!important;[\s\S]*?\binset:\s*12px\s*!important;/, 'dense workspaces should support a click-open full-screen drawer');
assert.match(css, /\.directive-record-save-as-dialog-overlay\s*\{[\s\S]*?\bz-index:\s*2147483647;[\s\S]*?\bpointer-events:\s*auto;/, 'Save Game As modal should cover the browser above the Directive window and block background clicks');
assert.match(css, /@media\s*\(max-width:\s*680px\)\s*\{[\s\S]*?\.directive-command-spine-shell \.directive-command-spine\s*\{[\s\S]*?\bdisplay:\s*none\s*!important;/, 'phone-width shell should replace the command spine with the mobile navigation fallback');
assert.match(css, /\.directive-command-spine-shell\[data-active-route="mission"\]\s*\{[\s\S]*?--directive-active-route-accent:\s*#b18dcc;/, 'command shelf should expose active-route accent tokens for drawer chrome');
assert.match(css, /\.directive-command-spine-shell \.directive-spine-route\s*\{[\s\S]*?--directive-route-accent:[\s\S]*?background:[\s\S]*?rgba\(15,\s*18,\s*24,\s*0\.98\)/, 'inactive desktop shelf routes should render as dark control tiles');
assert.match(css, /\.directive-command-spine-shell \.directive-spine-route-icon \.directive-vector-glyph\s*\{[\s\S]*?width:\s*30px;[\s\S]*?height:\s*30px;/, 'desktop shelf route glyphs should render large enough for detailed vector icons');
assert.match(css, /\.directive-command-spine-shell\.directive-spine-expanded \.directive-spine-route-icon \.directive-vector-glyph\s*\{[\s\S]*?width:\s*32px;[\s\S]*?height:\s*32px;/, 'expanded shelf route glyphs should render larger than compact route glyphs');
assert.match(css, /\.directive-command-spine-shell \.directive-spine-route::before\s*\{[\s\S]*?background:\s*linear-gradient\(180deg,\s*var\(--directive-route-accent\),\s*var\(--directive-route-accent-end\)\)/, 'desktop shelf routes should expose route-colored right-edge rail segments');
assert.doesNotMatch(css, /\.directive-command-spine-shell \.directive-spine-route-selected\s*\{[\s\S]*?background:\s*linear-gradient\(155deg,\s*var\(--directive-route-accent\),\s*var\(--directive-route-accent-end\)\)/, 'closed selected desktop shelf routes should not keep the solid active-route fill');
assert.match(css, /\.directive-command-spine-shell \.directive-spine-route-selected\.directive-spine-route-active\s*\{[\s\S]*?background:\s*linear-gradient\(155deg,\s*var\(--directive-route-accent\),\s*var\(--directive-route-accent-end\)\)/, 'selected active desktop shelf routes should fill with their route accent');
assert.doesNotMatch(css, /\.directive-command-spine-shell \.directive-spine-route-active::after\s*\{/, 'active shelf routes should not draw a second connector pseudo-element');
assert.match(css, /\.directive-command-spine-shell \.directive-spine-route-selected\.directive-spine-route-active::before\s*\{[\s\S]*?right:\s*calc\(-1 \* \(var\(--directive-drawer-gap\) \+ 5px\)\);[\s\S]*?width:\s*calc\(var\(--directive-drawer-gap\) \+ 11px\);/, 'selected active shelf route should bridge the drawer gap with its selected rail');
assert.match(css, /\.directive-command-spine-shell \.directive-spine-route-selected\.directive-spine-route-active:hover,[\s\S]*?\.directive-command-spine-shell \.directive-spine-route-selected\.directive-spine-route-active:focus-visible\s*\{[\s\S]*?background:\s*linear-gradient\(155deg,\s*var\(--directive-route-accent\),\s*var\(--directive-route-accent-end\)\)\s*!important;[\s\S]*?outline:\s*2px\s+solid\s+var\(--directive-focus,\s*#ffe58f\);/, 'selected active shelf route hover should keep the selected fill while retaining the outline');
assert.match(css, /\.directive-command-spine-shell \.directive-spine-route-selected\.directive-spine-route-active:hover \.directive-spine-route-index,[\s\S]*?\.directive-command-spine-shell \.directive-spine-route-selected\.directive-spine-route-active:focus-visible \.directive-spine-route-detail\s*\{[\s\S]*?color:\s*var\(--directive-active-route-ink\)\s*!important;/, 'selected active shelf route hover should not invert child text or icon colors independently');
assert.doesNotMatch(css, /\.directive-command-spine-shell \.directive-command-drawer-hinge\s*\{/, 'command drawer should not keep a decorative hinge that creates a top-left gap');
assert.match(css, /\.directive-command-spine-shell \.directive-command-drawer-header\s*\{[\s\S]*?margin-left:\s*0\s*!important;[\s\S]*?width:\s*100%\s*!important;|\.directive-command-spine-shell \.directive-command-drawer-header\s*\{[\s\S]*?width:\s*100%\s*!important;[\s\S]*?margin-left:\s*0\s*!important;/, 'command drawer header should override the shared runtime header gutter');
assert.match(css, /\.directive-command-spine-shell \.directive-command-drawer-header\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto\s*!important;/, 'command drawer header should not reserve a dead hinge column');
assert.match(css, /\.directive-command-spine-shell \.directive-command-drawer-header\s*\{[\s\S]*?box-shadow:\s*inset\s*4px\s*0\s*0\s*color-mix\(in srgb,\s*var\(--directive-active-route-accent\)\s*86%,\s*transparent\);/, 'command drawer header should keep a subtle route accent without a protruding hinge');
assert.match(css, /\.directive-command-spine-shell \.directive-command-mobile-nav \.directive-mobile-bottom-tab\[data-route-tone="mission"\]\s*\{[\s\S]*?--directive-route-accent:\s*#b18dcc;/, 'mobile command shelf should use the same route tone selectors as the desktop spine');
assert.match(css, /\.directive-command-spine-shell \.directive-command-mobile-nav \.directive-mobile-bottom-tab::before\s*\{[\s\S]*?height:\s*4px;[\s\S]*?background:\s*linear-gradient\(90deg,\s*var\(--directive-route-accent\),\s*var\(--directive-route-accent-end\)\)/, 'mobile command shelf should expose route-colored top-edge rail segments');
assert.match(css, /\.directive-command-spine-shell \.directive-command-mobile-nav \.directive-mobile-bottom-tab-active\s*\{[\s\S]*?background:\s*linear-gradient\(180deg,\s*var\(--directive-route-accent\),\s*var\(--directive-route-accent-end\)\)/, 'selected mobile shelf routes should fill with their route accent');
assert.match(css, /\.directive-command-spine-shell \.directive-command-mobile-nav\s*\{[\s\S]*?margin-left:\s*0\s*!important;[\s\S]*?background:\s*linear-gradient\(180deg,\s*#080b10,\s*#020304\)\s*!important;/, 'mobile command shelf should not inherit legacy phone end caps');
assert.match(css, /\.directive-command-spine-shell \.directive-command-mobile-nav \.directive-mobile-bottom-tab:not\(\.directive-mobile-bottom-tab-active\) \.directive-mobile-bottom-icon,[\s\S]*?\.directive-command-spine-shell \.directive-command-mobile-nav \.directive-mobile-bottom-tab:not\(\.directive-mobile-bottom-tab-active\) \.directive-mobile-bottom-label\s*\{[\s\S]*?color:\s*var\(--directive-route-accent\)\s*!important;/, 'inactive mobile command shelf icons and labels should keep route accent colors');
assert.match(css, /@media\s*\(max-width:\s*680px\)\s*\{[\s\S]*?\.directive-command-spine-shell \.directive-command-drawer::before,[\s\S]*?\.directive-command-spine-shell \.directive-command-drawer::after\s*\{[\s\S]*?content:\s*none\s*!important;[\s\S]*?display:\s*none\s*!important;/, 'mobile command drawer should hide desktop drawer ornaments');
assert.doesNotMatch(css, /directive-mobile-can-go-back/, 'primary route navigation should not reserve a mobile Back shelf segment');
assert.match(css, /\.directive-runtime-panel\s*\{[\s\S]*?--directive-mobile-control-height:\s*44px;/, 'runtime shell should own mobile touch control dimensions');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-mobile-touch \.directive-button,[\s\S]*?min-height:\s*var\(--directive-mobile-control-height,\s*44px\)/, 'phone route controls should use mobile touch targets');
assert.match(css, /\.directive-provider-role-folder-summary\s*\{[\s\S]*?grid-template-columns:\s*22px\s+34px\s+minmax\(0,\s*1fr\)\s+auto/, 'Settings model-call routing should use disclosure folder summaries like Ship readiness');
assert.match(css, /\.directive-provider-role-folder\[open\] \.directive-provider-role-folder-disclosure i\s*\{[\s\S]*?transform:\s*rotate\(90deg\)/, 'Settings model-call routing folders should rotate the disclosure chevron when open');
assert.match(css, /\.directive-provider-role-select-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(190px,\s*1fr\)\)/, 'Settings model-call routing folders should contain compact role dropdown grids');
assert.match(css, /\.directive-vector-glyph\s*\{[\s\S]*?mask-image:\s*var\(--directive-glyph-url\)/, 'CSS should render vector glyphs through a theme-colorable mask');
assert.match(css, /data-glyph="route-campaign"[\s\S]*?route-campaign\.svg/, 'CSS should map route glyph IDs to bundled vector SVG assets');
assert.match(css, /\.directive-assist-button \.directive-assist-button-icon\s*\{[\s\S]*?color:\s*currentColor;/, 'Assist launcher ship glyph should stay tied to the host button tint');
assert.match(css, /\.directive-assist-button\[data-directive-assist-busy="true"\] \.directive-assist-button-icon\s*\{[\s\S]*?display:\s*none;/, 'Assist launcher should hide the ship glyph while generation is pending');
assert.match(css, /\.directive-assist-button\[data-directive-assist-busy="true"\] \.directive-assist-button-spinner\s*\{[\s\S]*?animation:\s*directive-assist-spinner/, 'Assist launcher should animate a spinner while generation is pending');
assert.doesNotMatch(css, /\.directive-assist-button\s*\{[^}]*color:\s*inherit;/, 'Assist launcher should not override the neighboring SillyTavern hotbar button color');
assert.match(css, /\.directive-creator-step-state\s*\{[\s\S]*?text-transform:\s*uppercase/, 'Character Creator should put compact completion state directly on step controls');
assert.match(css, /\.directive-creator-command-bar\s*\{[\s\S]*?display:\s*flex;/, 'Character Creator command bar should use compact wrapping command controls instead of equal-width peer tracks');
assert.match(css, /\.directive-creator-route-exit-command\s*\{[\s\S]*?var\(--directive-science/, 'Character Creator route exit should use a distinct science/teal-tinted treatment');
assert.match(css, /\.directive-creator-discard-command\s*\{[\s\S]*?var\(--directive-danger/, 'Character Creator discard should use the warning/destructive color token');
assert.match(css, /\.directive-creator-section\s*\{[\s\S]*?\bdisplay:\s*none;/, 'Character Creator should hide inactive creator sections without unmounting inputs');
assert.match(css, /\.directive-creator-section-active\s*\{[\s\S]*?\bdisplay:\s*grid;/, 'Character Creator should show the active creator section');
assert.match(css, /\.directive-creator-section-assist-control\[data-creator-assist-busy="true"\] \.directive-creator-assist-busy-spinner\s*\{[\s\S]*?animation:\s*directive-assist-spinner/, 'Character Creator section assist should animate a spinner while section drafting is pending');
assert.match(css, /\.directive-creator-section-assist-control\[data-creator-assist-busy="true"\] \.directive-creator-section-wand\s*\{[\s\S]*?var\(--directive-danger/, 'Character Creator cancel state should visually distinguish the busy wand action');
assert.match(css, /\.directive-starship-command-backdrop\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?width:\s*100%;[\s\S]*?opacity:\s*0\.74;/, 'Campaign Command should use package ship art as a full-panel active-snapshot backdrop');
assert.match(css, /\.directive-starship-command-backdrop::after\s*\{[\s\S]*?linear-gradient\(90deg,\s*rgba\(5,\s*8,\s*13,\s*0\.94\)[\s\S]*?radial-gradient\(circle at 76% 42%/, 'Campaign Command backdrop should darken the full-panel ship art for readable foreground content');
assert.match(css, /\.directive-starship-command-snapshot > :not\(\.directive-starship-command-backdrop\)\s*\{[\s\S]*?z-index:\s*1;/, 'Campaign Command content should stay above the faded backdrop');
assert.match(css, /\.directive-starship-record-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(88px,\s*auto\)/, 'Campaign records should use compact row/action layout');
assert.match(css, /\.directive-starship-current-record\s*\{[\s\S]*?var\(--directive-success/, 'Campaign records should visually distinguish the current save');
assert.match(css, /\.directive-settings-subtabs\s*\{[\s\S]*?grid-auto-flow:\s*column;/, 'Settings should expose route-local subtabs for dense control groups');
assert.match(css, /\.directive-settings-safety-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, 'Settings State Safety controls should use stable two-column command rows');
assert.match(css, /\.directive-lcars-toggle\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+46px/, 'Settings tooltip preference should use a compact stable LCARS switch layout');
assert.match(css, /\.directive-lcars-toggle-input:checked \+ \.directive-lcars-toggle-slider[\s\S]*?var\(--directive-operations/, 'Settings LCARS switch should visually distinguish enabled state');
assert.match(css, /\.directive-mission-sidework-status-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(104px,\s*1fr\)\)/, 'Mission Side Work should expose compact LCARS status tiles');
assert.match(css, /\.directive-mission-sidework-fact-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(142px,\s*1fr\)\)/, 'Mission Side Work facts should use compact responsive rows');
assert.match(css, /\.directive-mission-sidework-action-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(118px,\s*1fr\)\)/, 'Mission Side Work actions should use touch-safe responsive controls');
assert.match(css, /\.directive-record-save-as-dialog-overlay\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?place-items:\s*center;/, 'Campaign Records Save Game As should use a centered modal overlay');
assert.match(css, /\.directive-record-save-as-dialog-actions\s*\{[\s\S]*?justify-content:\s*flex-end;/, 'Campaign Records Save Game As dialog should group Save and Cancel actions');
assert.match(css, /\.directive-field-control-invalid\s*\{[\s\S]*?var\(--directive-danger/, 'Invalid Save Game As names should use the danger token');

const settingsPanelSource = await readText('src/ui/settings-panel.js');
const missionPanelSource = await readText('src/ui/mission-panel.js');
const crewPanelSource = await readText('src/ui/crew-panel.js');
const shipPanelSource = await readText('src/ui/ship-panel.js');
const commandLogPanelSource = await readText('src/ui/command-log-panel.js');
const characterCreatorPanelSource = await readText('src/ui/character-creator-panel.js');
const runtimeUiKitSource = await readText('src/ui/runtime-ui-kit.js');
const runtimeShellSource = await readText('src/runtime/runtime-shell.js');
const commandSpineSource = await readText('src/ui/directive-command-spine-shell.js');
const commandSpineLayoutSource = await readText('src/ui/directive-shell-layout.mjs');
const campaignPanelSource = await readText('src/ui/campaign-panel.js');
const assistSource = await readText('src/assist/directive-assist.mjs');
const directiveAssistButtonSource = await readText('src/hosts/sillytavern/directive-assist-button.js');
assert.match(runtimeUiKitSource, /export function addTooltip/, 'runtime UI kit should expose a shared tooltip helper');
assert.match(runtimeUiKitSource, /dataset\.directiveTooltip/, 'runtime UI kit should store tooltip text in a Directive data attribute');
assert.match(runtimeUiKitSource, /options\.nativeTitle\s*===\s*true[\s\S]*removeAttribute\?\.\(['"]title['"]\)/, 'runtime UI kit tooltips should suppress native title by default');
assert.match(runtimeUiKitSource, /DIRECTIVE_TOOLTIPS_DISABLED_STORAGE_KEY/, 'runtime UI kit should persist the Directive tooltip display preference');
assert.match(runtimeUiKitSource, /export function setDirectiveTooltipsDisabled/, 'runtime UI kit should expose a global tooltip disable switch');
assert.match(runtimeUiKitSource, /areDirectiveTooltipsDisabled\(\)[\s\S]*isMobileRuntimeTooltipSurface/, 'runtime tooltips should respect the global disabled preference before showing');
assert.doesNotMatch(runtimeUiKitSource, /isMobileRuntimeTooltipSurface[\s\S]*?closest\([^)]*directive-mobile-touch/, 'runtime tooltips should not suppress every command spine hover just because the shell is touch-friendly');
assert.match(runtimeUiKitSource, /directiveTooltipHoverBound/, 'runtime tooltips should track hover listener binding independently');
assert.match(runtimeUiKitSource, /directiveTooltipFocusBound/, 'runtime tooltips should track focus listener binding independently');
assert.match(runtimeUiKitSource, /pointerenter[\s\S]*mouseenter[\s\S]*mouseover/, 'runtime tooltips should handle pointer and bubbling mouse hover events');
assert.match(commandSpineSource, /addTooltip/, 'command-spine shell controls should use shared tooltips');
assert.match(commandSpineSource, /mobileTooltip/, 'mobile route buttons should preserve route tooltip text separately from their short label');
assert.match(runtimeShellSource, /dataset\.mobileTooltip/, 'runtime shell should sync mobile route tooltips after layout updates');
assert.match(campaignPanelSource, /Prompt Context[\s\S]*Player-safe campaign context currently installed/, 'Campaign should explain Prompt Context as player-safe chat prompt context');
assert.match(missionPanelSource, /Current play surface:[\s\S]*Save, narration retry, reconciliation/, 'Mission subtabs should explain active, context, thread, side-work, and recovery sections');
assert.match(settingsPanelSource, /Choose which provider lane handles each Directive background job/, 'Settings model-call routing should explain provider lane routing');
assert.match(settingsPanelSource, /appendTooltipPreferenceSettings[\s\S]*directive-lcars-toggle directive-settings-tooltip-toggle/, 'Settings Systems should expose an LCARS tooltip preference switch');
assert.match(settingsPanelSource, /setDirectiveTooltipsDisabled/, 'Settings tooltip switch should update the shared runtime tooltip preference');
assert.doesNotMatch(settingsPanelSource, /directive-lcars-toggle-status|tooltipPreferenceStatus/, 'Settings tooltip switch should not repeat enabled/disabled metadata outside the slider');
assert.match(characterCreatorPanelSource, /How your officer reads evidence, people, and uncertainty/, 'Character Creator should explain abstract command traits');
assert.match(crewPanelSource, /Qualitative visible stance[\s\S]*Numeric relationship scores stay internal/, 'Crew should explain command posture without exposing raw relationship values');
assert.match(shipPanelSource, /not software debt/, 'Ship should explain Technical Debt as ship-system caveats');
assert.match(commandLogPanelSource, /Hidden Director state is not shown/, 'Command Log should clarify that entries are player-facing records');
assert.match(assistSource, /Turn rough intent into editable player-character wording/, 'Directive Assist actions should expose explanatory tooltip copy');
assert.match(directiveAssistButtonSource, /globalThis\.toastr\?\.info\?/, 'Directive Assist actions should notify through SillyTavern toastr when generation starts');
assert.match(directiveAssistButtonSource, /Replace only the selected chat text with this draft/, 'Directive Assist preview actions should include explicit title tooltips');
assert.match(runtimeShellSource, /applyDirectiveTheme\(panel,\s*getDirectiveThemePack\(\)\)/, 'runtime shell should apply the bundled Theme Pack instead of inheriting host button colors');
assert.match(runtimeShellSource, /createDirectiveCommandSpineShell/, 'SillyTavern runtime should mount the command-spine shell');
assert.match(runtimeShellSource, /startDirectiveDrawerResize/, 'runtime shell should own persistent drawer resizing');
assert.match(runtimeShellSource, /startDirectiveShelfDrag/, 'runtime shell should own persistent shelf dragging');
assert.match(runtimeShellSource, /resetCampaignPanelState[\s\S]*resetCrewPanelState|resetCrewPanelState[\s\S]*resetCampaignPanelState/, 'Reset Window should clear route-local UI state as part of layout reset');
assert.match(runtimeShellSource, /resetSettingsPanelState/, 'Reset Window should clear Settings route-local UI state as part of layout reset');
assert.match(runtimeShellSource, /fullscreenMode\s*===\s*['"]workspace['"]/, 'runtime shell should distinguish required full-screen workspaces from manual expansion');
assert.match(commandSpineSource, /directiveShelfDragHandle/, 'command-spine shell should mark grab handles for moving the shelf');
assert.doesNotMatch(commandSpineSource, /createDrawerResizeHandle\(\{\s*edge:\s*['"]left['"]/, 'command-spine shell should not render the bottom-left resize handle');
assert.match(commandSpineSource, /createDrawerResizeHandle\(\{\s*edge:\s*['"]right['"]/, 'command-spine shell should render the bottom-right resize handle');
assert.match(commandSpineSource, /action\.resize/, 'command-spine shell should render the bundled resize glyph in drawer handles');
assert.match(commandSpineSource, /Hide shelf labels[\s\S]*?Show shelf labels|Show shelf labels[\s\S]*?Hide shelf labels/, 'command-spine shell should name the shelf toggle around label visibility');
assert.match(commandSpineSource, /fa-solid fa-outdent[\s\S]*?fa-solid fa-indent|fa-solid fa-indent[\s\S]*?fa-solid fa-outdent/, 'command-spine shell should use conventional indent/outdent shelf-label icons');
assert.match(runtimeShellSource, /fa-regular fa-window-restore[\s\S]*?fa-regular fa-window-maximize|fa-regular fa-window-maximize[\s\S]*?fa-regular fa-window-restore/, 'runtime shell should use conventional window-state icons for full-screen and restore');
assert.match(commandSpineSource, /label:\s*['"]Close active drawer['"][\s\S]*?iconSlot:\s*['"]action\.close['"]/, 'Close active drawer should use the same close glyph as the Directive shelf close control');
assert.doesNotMatch(runtimeShellSource, /slot:\s*mobile\s*\?\s*['"]action\.close['"]\s*:\s*['"]action\.drawerCollapse['"]/, 'Close active drawer should not resync back to the drawer-collapse glyph on desktop');
assert.match(commandSpineSource, /directive-command-mobile-nav/, 'command-spine shell should retain a phone-width route fallback');
assert.match(commandSpineLayoutSource, /viewport\.width\s*\*\s*0\.47/, 'default drawer geometry should target approximately half the display width');
assert.match(commandSpineLayoutSource, /shelfLeft|shelfTop/, 'layout persistence should include movable shelf position fields');
assert.match(commandSpineLayoutSource, /localStorage|safeStorage/, 'drawer geometry should be persisted through host-safe local layout storage');
assert.doesNotMatch(runtimeShellSource, /routeHistory|navigateBack/, 'runtime shell should not replay primary tab click history');
assert.match(campaignPanelSource, /directive-campaign-console/, 'Campaign should render an LCARS console wrapper');
assert.match(campaignPanelSource, /campaignIndex/, 'Campaign Command should read the runtime campaign-session index');
assert.match(campaignPanelSource, /directive-campaign-session-list/, 'Campaign Command should render a scalable campaign-session list');
assert.match(campaignPanelSource, /Hide From Command[\s\S]*Show In Command|Show In Command[\s\S]*Hide From Command/, 'Campaign Command should support reversible hide/show session rows');
assert.match(campaignPanelSource, /createCommandSessionBackdrop[\s\S]*directive-campaign-session-backdrop/, 'Expanded Campaign Command rows should keep the cinematic package backdrop treatment');
assert.match(campaignPanelSource, /createCommandSessionBackdrop[\s\S]*kind:\s*['"]location\.hero['"][\s\S]*subjectId:\s*['"]asterion-station['"]/, 'Expanded Campaign Command row backdrops should use the Asterion Station location art instead of duplicating the Breckenridge hero');
assert.match(campaignPanelSource, /createCommandSessionHeroVisual[\s\S]*directive-campaign-session-hero-visual/, 'Expanded Campaign Command rows should restore the large campaign ship image as a visible resume surface');
assert.match(campaignPanelSource, /directive-campaign-session-start-screen[\s\S]*directive-campaign-session-start-copy/, 'Expanded Campaign Command rows should compose a start-screen style campaign snapshot');
assert.match(campaignPanelSource, /commandSessionHeroSubtitle[\s\S]*commandSessionChatLabel/, 'Campaign Command hero captions should show the bound SillyTavern chat identity instead of only status labels');
assert.match(campaignPanelSource, /commandSessionIsSelectedChat[\s\S]*view\?\.currentChat\?\.chatId/, 'Campaign Command current-chat labels should compare the selected host chat with the session binding');
assert.doesNotMatch(campaignPanelSource, /directive-campaign-session-hero-subtitle['"],\s*commandSessionStatusLabel\(session\)/, 'Campaign Command hero captions should not render stale Current Chat status text when a bound chat name is available');
assert.match(campaignPanelSource, /createCommandSessionMetaTile[\s\S]*directive-campaign-session-fact/, 'Expanded Campaign Command rows should render Save, Mission, Phase, and Stardate as compact metadata tiles');
assert.doesNotMatch(campaignPanelSource, /directive-campaign-session-facts['"][\s\S]{0,700}createStatusBlock/, 'Expanded Campaign Command facts should not use the larger shared status-block widgets');
assert.match(css, /\.directive-campaign-session-list\s*\{[\s\S]*?max-height:[\s\S]*?overflow:\s*auto/, 'Campaign Command session rows should scroll internally for large campaign inventories');
assert.match(css, /\.directive-campaign-session-list\s*\{[\s\S]*?grid-auto-rows:\s*max-content[\s\S]*?align-content:\s*start/, 'Campaign Command session rows should size to their content instead of compressing inside the scroll list');
assert.match(css, /\.directive-command-spine-shell\[data-drawer-density="compact"\]\s+\.directive-campaign-session-summary\s*\{[\s\S]*?grid-template-areas:[\s\S]*?"toggle title"[\s\S]*?"toggle meta"/, 'Campaign Command compact drawer rows should place badges under the title instead of squeezing three columns');
assert.match(css, /\.directive-campaign-session-details\s*\{[\s\S]*?min-height:\s*260px[\s\S]*?overflow:\s*hidden[\s\S]*?linear-gradient/, 'Expanded Campaign Command rows should frame the restored splash image behind row details');
assert.match(css, /\.directive-campaign-session-start-screen\s*\{[\s\S]*?grid-template-columns:\s*minmax\(240px,\s*0\.48fr\)\s+minmax\(0,\s*1fr\)/, 'Expanded Campaign Command rows should use a campaign-start composition with image and snapshot columns');
assert.match(css, /\.directive-campaign-session-hero-visual\s*\{[\s\S]*?min-height:\s*210px[\s\S]*?height:\s*clamp\(210px,\s*24cqw,\s*300px\)/, 'Expanded Campaign Command rows should keep the Breckenridge image large enough to anchor the resume card');
assert.match(css, /\.directive-campaign-session-facts\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(138px,\s*1fr\)\)/, 'Expanded Campaign Command facts should use compact metadata columns');
assert.match(css, /\.directive-campaign-session-fact-value\s*\{[\s\S]*?overflow-wrap:\s*anywhere[\s\S]*?white-space:\s*normal/, 'Expanded Campaign Command fact values should wrap long Save, Mission, Phase, and Stardate text');
assert.match(campaignPanelSource, /resetCampaignPanelState/, 'Campaign should expose a Reset Window hook for sub-shelf, package, briefing, and save selections');
assert.match(campaignPanelSource, /Open Campaign Chat/, 'Campaign Command should open the bound host chat as the primary play surface');
assert.match(`${campaignPanelSource}\n${missionPanelSource}`, /Finish Chat Setup[\s\S]*Retry Chat Setup|Retry Chat Setup[\s\S]*Finish Chat Setup/, 'Campaign chat setup recovery should use user-facing chat setup labels');
assert.doesNotMatch(`${campaignPanelSource}\n${missionPanelSource}`, /Resume Activation/, 'Campaign chat setup recovery should not expose the internal activation label');
assert.doesNotMatch(missionPanelSource, /What does the XO do\?|turn\.playerInput|Preview Outcome/, 'Mission should not reintroduce the old fallback XO preview input');
assert.match(campaignPanelSource, /Mission Review/, 'Campaign Command should retain Mission as a review and recovery surface');
assert.match(campaignPanelSource, /directive-campaign-library-browser/, 'Campaign should render campaign packages as a selectable library browser');
assert.match(campaignPanelSource, /directive-starship-campaign-briefing/, 'Campaign should open a campaign briefing before Character Creator');
assert.match(campaignPanelSource, /createCampaignBriefingBackdrop[\s\S]*kind:\s*['"]location\.hero['"][\s\S]*subjectId:\s*['"]asterion-station['"]/, 'Campaign Library briefing inspector should use Asterion Station as its atmospheric backdrop');
assert.match(css, /\.directive-starship-campaign-briefing\s*\{[\s\S]*?position:\s*relative[\s\S]*?overflow:\s*hidden/, 'Campaign Library briefing inspector should layer package backdrop media inside the panel');
assert.match(css, /\.directive-starship-campaign-briefing\s*>\s*:not\(\.directive-starship-briefing-backdrop\)\s*\{[\s\S]*?z-index:\s*1/, 'Campaign Library briefing content should render above the station backdrop');
assert.match(css, /\.directive-starship-briefing-backdrop\s*\{[\s\S]*?opacity:\s*0\.5/, 'Campaign Library briefing backdrop should be visible without overpowering text');
assert.doesNotMatch(campaignPanelSource, /Library Notices|Runtime Projection|Mission Graphs|Package Health/, 'Campaign Library should avoid redundant package and notice summary cards');
assert.match(missionPanelSource, /currentChatEmptyMessage/, 'Mission should use current-chat empty-state copy');
assert.match(crewPanelSource, /currentChatEmptyMessage[\s\S]*activePackageForView/, 'Crew should use current-chat empty-state copy and selected-chat package data');
assert.match(shipPanelSource, /currentChatEmptyMessage[\s\S]*activePackageForView/, 'Ship should use current-chat empty-state copy and selected-chat package data');
assert.match(commandLogPanelSource, /currentChatEmptyMessage/, 'Log should use current-chat empty-state copy');
assert.match(campaignPanelSource, /directive-starship-records-console/, 'Campaign should render saves as an LCARS records console');
assert.doesNotMatch(campaignPanelSource, /Save Records|Character Setup Drafts|directive-starship-records-sidebar|directive-starship-records-status-grid|directive-starship-setup-drafts/, 'Campaign Records should stay focused on save files without a summary sidebar or setup-draft section');
assert.match(campaignPanelSource, /directive-starship-save-inspector/, 'Campaign records should inspect the selected save before loading it');
assert.match(campaignPanelSource, /directive-starship-record-row/, 'Campaign records should use compact LCARS record rows instead of generic metadata rows');
assert.match(campaignPanelSource, /label:\s*'Save Game'[\s\S]*label:\s*'Save Game As\.\.\.'[\s\S]*label:\s*'Load Save'[\s\S]*label:\s*'Delete Save'/, 'Campaign Records inspector should order save commands above Load Save and Delete Save');
assert.match(campaignPanelSource, /directive-starship-save-actions directive-starship-save-actions-grid/, 'Campaign Records single-save commands should use the aligned action grid');
assert.match(css, /\.directive-starship-save-actions-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, 'Campaign Records single-save commands should render as a 2x2 grid');
assert.match(campaignPanelSource, /manualSaveGuardForView[\s\S]*?chatNative\?\.manualSaveGuard/, 'Campaign Records should read the runtime active-chat save guard');
assert.match(campaignPanelSource, /directive-starship-save-guard[\s\S]*?Open Campaign Chat/, 'Campaign Records should explain blocked manual saves and offer the bound chat recovery action');
assert.match(campaignPanelSource, /manualSaveReady[\s\S]*?disabled:\s*!canSaveActiveGame[\s\S]*?disabled:\s*!canSaveActiveGameAs/, 'Campaign Records should disable manual save commands when the active chat is not verified');
assert.match(campaignPanelSource, /openRecordSaveAsDialog[\s\S]*label:\s*'Save'[\s\S]*label:\s*'Cancel'|openRecordSaveAsDialog[\s\S]*label:\s*'Cancel'[\s\S]*label:\s*'Save'/, 'Campaign Records Save Game As should prompt with Save and Cancel controls');
assert.match(campaignPanelSource, /directive-record-save-as-name-input/, 'Campaign Records Save Game As should name branches inside the dialog');
assert.match(missionPanelSource, /directive-mission-console/, 'Mission should render an LCARS console wrapper');
assert.match(missionPanelSource, /directive-mission-status-grid/, 'Mission should expose current mission state as compact status blocks');
assert.match(missionPanelSource, /directive-mission-subtabs/, 'Mission should expose compact section navigation for dense mission surfaces');
assert.match(missionPanelSource, /function missionRecordText/, 'Mission should normalize structured state records before rendering text');
assert.match(missionPanelSource, /Current Orders/, 'Mission should surface accepted open assignments as current orders');
assert.match(missionPanelSource, /directive-mission-sidework-console/, 'Mission Side Work should render a dedicated LCARS side-work console');
assert.match(missionPanelSource, /directive-mission-sidework-status-grid/, 'Mission Side Work should summarize optional work before rendering records');
assert.match(missionPanelSource, /directive-mission-sidework-card/, 'Mission Side Work should render optional assignments as compact LCARS records');
assert.match(missionPanelSource, /preserveMissionSubtabScroll/, 'Mission subtabs should preserve the drawer scroll anchor while switching local sections');
assert.match(missionPanelSource, /missionScrollContainer[\s\S]*?event\?\.preventDefault\?\.\(\)[\s\S]*?event\?\.stopPropagation\?\.\(\)/, 'Mission subtabs should switch locally without bubbling into shell refresh behavior');
assert.match(missionPanelSource, /No quest opportunities are currently active or visible\./, 'Mission Open World sub-tab should resolve to a real empty state when no quest work is available');
assert.doesNotMatch(missionPanelSource, /\{ id: 'directive-mission-recovery-section', label: 'Recovery'/, 'Mission should not render a Recovery subtab');
assert.doesNotMatch(missionPanelSource, /Save As Name|appendMissionRecoverySaveControls/, 'Mission should not keep the old inline Save As form');
assert.match(missionPanelSource, /directive-chat-play-surface-card/, 'Mission should identify the bound host chat as the primary play surface');
assert.match(missionPanelSource, /Continuity Matrix[\s\S]*directive-mission-continuity-state/, 'Mission should surface a compact Continuity Matrix status row in the chat play surface');
assert.match(missionPanelSource, /directive-pending-chat-interaction-card/, 'Mission should surface chat-native pause and confirmation decisions');
assert.doesNotMatch(missionPanelSource, /supportsChatNative/, 'Mission should not retain the old host-fallback command input branch');
assert.match(crewPanelSource, /directive-crew-console/, 'Crew should render an LCARS personnel console wrapper');
assert.match(crewPanelSource, /resetCrewPanelState/, 'Crew should expose a Reset Window hook for selected roster state');
assert.match(crewPanelSource, /directive-crew-readiness-grid/, 'Crew should expose roster readiness as compact status blocks');
assert.match(crewPanelSource, /directive-crew-roster-row/, 'Crew should render compact LCARS personnel rows instead of generic metadata cards');
assert.match(crewPanelSource, /createPlayerPortraitImage/, 'Crew should render the uploaded player portrait for the player commander');
assert.match(crewPanelSource, /importPlayerPortrait/, 'Crew should allow changing the player portrait after campaign start');
assert.match(shipPanelSource, /directive-ship-console/, 'Ship should render an LCARS starship status console wrapper');
assert.match(shipPanelSource, /directive-ship-readiness-grid/, 'Ship should expose readiness as compact status blocks');
assert.match(shipPanelSource, /directive-ship-readiness-folder/, 'Ship should render operational readiness caveats as folder disclosures');
assert.match(css, /\.directive-ship-readiness-item-copy strong\s*\{[\s\S]*?text-overflow:\s*clip;[\s\S]*?white-space:\s*normal;[\s\S]*?overflow-wrap:\s*anywhere;/, 'Ship Operational Readiness item titles should wrap instead of truncating');
assert.doesNotMatch(shipPanelSource, /Bridge Authority/, 'Ship should not keep the removed Bridge Authority card');
assert.match(commandLogPanelSource, /directive-log-console/, 'Log should render an LCARS command-history console wrapper');
assert.match(commandLogPanelSource, /directive-log-status-grid/, 'Log should expose command-history summary as compact status blocks');
assert.match(commandLogPanelSource, /directive-log-timeline/, 'Log should render compact LCARS timeline entries instead of generic metadata cards');
assert.match(commandLogPanelSource, /parseJsonText/, 'Log should parse assisted-summary JSON before rendering player-facing text');
assert.match(characterCreatorPanelSource, /directive-creator-console/, 'Character Creator should render an LCARS commissioning console wrapper');
assert.doesNotMatch(characterCreatorPanelSource, /directive-creator-status-grid|directive-creator-progress-grid|Revision \${creator\.draft\.revision}/, 'Character Creator should not render duplicate package/draft/progress grids');
assert.match(characterCreatorPanelSource, /directive-creator-step-state/, 'Character Creator should show progress state on step controls');
assert.match(characterCreatorPanelSource, /Campaign Library/, 'Character Creator should label the route-level exit as Campaign Library');
assert.doesNotMatch(characterCreatorPanelSource, /label:\s*['"]Return to Campaign/, 'Character Creator should not use the ambiguous Return to Campaign visible label');
assert.match(characterCreatorPanelSource, /Next: \$\{formatCreatorStepLabel\(nextStepId\)\}/, 'Character Creator should expose guided Next step commands');
assert.match(characterCreatorPanelSource, /Discard Character/, 'Character Creator should expose explicit discard/reset for in-progress drafts');
assert.match(characterCreatorPanelSource, /directive-creator-command-bar/, 'Character Creator should keep compact route, save, step, start, and discard controls near the active pane');
assert.match(characterCreatorPanelSource, /directive-creator-section-active/, 'Character Creator should render one active creator section at a time');
assert.match(characterCreatorPanelSource, /fa-solid fa-wand-magic-sparkles/, 'Character Creator sections should expose a wand helper for section drafting');
assert.match(characterCreatorPanelSource, /AbortController/, 'Character Creator section drafting should expose a cancelable provider request');
assert.match(characterCreatorPanelSource, /fa-solid fa-xmark/, 'Character Creator section drafting should swap the wand for a cancel icon while pending');
assert.match(characterCreatorPanelSource, /generateCreatorSectionDraft/, 'Character Creator wand helper should call the runtime section draft action');
assert.match(characterCreatorPanelSource, /createPlayerPortraitImage/, 'Character Creator should render a player portrait import tile');
assert.match(characterCreatorPanelSource, /importCreatorPortrait/, 'Character Creator portrait tile should call the creator portrait import action');
assert.match(settingsPanelSource, /directive-settings-console/, 'Settings should render an LCARS control-console wrapper');
assert.match(settingsPanelSource, /function appendContinuityProjectionDiagnostics/, 'Settings should render a sanitized Continuity Projection Matrix diagnostics card');
assert.match(settingsPanelSource, /view\?\.continuityProjectionDiagnostics/, 'Settings Continuity diagnostics should consume only the sanitized runtime view');
assert.match(settingsPanelSource, /directive-settings-continuity-card/, 'Settings should style Continuity diagnostics as a compact Safety card');
assert.match(settingsPanelSource, /Rebuild Prompt Context[\s\S]*actions\.rebuildPromptContext/, 'Settings Continuity diagnostics should expose prompt rebuild without owning raw continuity state');
assert.doesNotMatch(settingsPanelSource, /directive-settings-status-grid|Storage Diagnostics|Diagnostics Summary/, 'Settings should not render duplicate overview and storage diagnostics grids');
assert.match(settingsPanelSource, /directive-settings-subtabs/, 'Settings should expose local subtabs for Systems, Providers, and Safety');
assert.match(settingsPanelSource, /label:\s*['"]Systems['"][\s\S]*label:\s*['"]Providers['"][\s\S]*label:\s*['"]Safety['"]/, 'Settings subtabs should be Systems, Providers, and Safety');
assert.match(settingsPanelSource, /consoleSurface\.appendChild\(createSettingsSubtabs\(sections,\s*activeSectionId\)\);[\s\S]*const systemsSection/, 'Settings should render local tabs before Settings section content');
assert.doesNotMatch(settingsPanelSource, /Control Plane|Runtime & State Safety|directive-settings-overview-card|directive-settings-overview-grid|Open World|Open-World Runtime Diagnostics|Refresh Opportunities/, 'Settings should not render the removed overview or Open World diagnostics surfaces');
assert.match(settingsPanelSource, /resetSettingsPanelState/, 'Settings should expose a Reset Window hook for active subtab state');
assert.match(settingsPanelSource, /const\s+SETTINGS_SAFETY_SECTION_ID\s*=\s*['"]directive-settings-safety-section['"]/, 'Settings should keep a stable Safety pane id');
assert.match(settingsPanelSource, /DEFAULT_SETTINGS_SECTION_ID\s*=\s*SETTINGS_SYSTEMS_SECTION_ID/, 'Settings should make Systems the initial active control pane');
assert.match(settingsPanelSource, /let\s+activeSettingsSectionId\s*=\s*DEFAULT_SETTINGS_SECTION_ID/, 'Settings should preserve the active local subtab across route refreshes');
assert.doesNotMatch(settingsPanelSource, /appendCommandBearingSettings|directive-settings-command-card|Shared Reserve|Morality Score/, 'Settings Systems should not render Command Bearing status');
assert.match(settingsPanelSource, /label:\s*['"]Command Bearing['"][\s\S]*commandBearingFitChecker[\s\S]*commandBearingSpendValidator[\s\S]*commandBearingEvaluator/, 'Settings provider routing should expose Command Bearing model-call roles as routing controls');
assert.doesNotMatch(settingsPanelSource, /simulationModeSettingsRows|joinList|createMetaRow\('Active Package'|createMetaRow\('Package Version'|createMetaRow\('Simulation Mode'|createMetaRow\('Allowed Modes'|createMetaRow\('Turn Save History'|createMetaRow\('Consequence Policy'|createMetaRow\('Mode Summary'/, 'Settings Runtime should only render editable runtime settings');
assert.match(settingsPanelSource, /createCardTitle\('Runtime'\)[\s\S]*label:\s*['"]Max Turn Save History['"][\s\S]*label:\s*['"]Autosave Every Messages['"][\s\S]*label:\s*['"]Apply['"]/, 'Settings Runtime should keep max-history, autosave cadence, and Apply controls');
assert.match(settingsPanelSource, /directive-settings-runtime-form[\s\S]*Save Policy[\s\S]*directive-settings-runtime-group[\s\S]*Outcome Integrity/, 'Settings Runtime should group save policy and Outcome Integrity controls instead of rendering one loose action row');
assert.match(settingsPanelSource, /settingsChanged[\s\S]*saveButton\.disabled/, 'Settings Runtime Apply should stay disabled until the grouped form changes');
assert.doesNotMatch(settingsPanelSource, /directive-settings-runtime-note|Campaign-specific settings for the current active campaign/, 'Settings Runtime should not render redundant explanatory note text under the title');
assert.match(settingsPanelSource, /selectSettingsSection\(SETTINGS_PROVIDERS_SECTION_ID\)[\s\S]*?actions\.installDirectivePreset/, 'Settings preset installation should keep the Providers pane active before refresh');
assert.match(settingsPanelSource, /selectSettingsSection\(SETTINGS_PROVIDERS_SECTION_ID\)[\s\S]*?actions\.refreshDirectivePresetStatus/, 'Settings preset status refresh should keep the Providers pane active before refresh');
assert.match(settingsPanelSource, /directive-lcars-toggle directive-settings-preset-autocheck-toggle/, 'Directive Preset settings should expose the auto-check control as the shared LCARS switch.');
assert.match(settingsPanelSource, /actions\.updateDirectivePresetAutoCheck/, 'Directive Preset auto-check toggle should persist through the runtime action.');
assert.match(settingsPanelSource, /card\.dataset\.directiveSettingsTarget\s*=\s*DIRECTIVE_PRESET_SETTINGS_TARGET/, 'Directive Preset settings card should have a stable highlight target.');
assert.match(settingsPanelSource, /selectDirectivePresetSettingsSection[\s\S]*SETTINGS_PROVIDERS_SECTION_ID/, 'Directive Preset guided focus should prepare the Providers settings section.');
assert.match(settingsPanelSource, /requestAnimationFrame\(\(\)\s*=>\s*\{[\s\S]*requestAnimationFrame\(resolve\)/, 'Directive Preset guided focus should wait for two render frames before highlighting.');
assert.match(settingsPanelSource, /scrollIntoView\?\.\(\{[\s\S]*block:\s*['"]center['"]/, 'Directive Preset guided focus should scroll the target card into view.');
assert.match(runtimeShellSource, /export async function openDirectivePresetSettings/, 'Runtime shell should expose a helper to open Directive Preset settings.');
assert.match(runtimeShellSource, /export async function runDirectivePresetStartupReminder/, 'Runtime shell should expose a startup reminder helper for Directive Preset updates.');
assert.match(runtimeShellSource, /Open Preset Settings[\s\S]*Not Now[\s\S]*Don't Remind Me Again/, 'Directive Preset startup reminder should expose open, defer, and disable choices.');
const presetStartupReminderSource = runtimeShellSource.slice(
  runtimeShellSource.indexOf('export async function runDirectivePresetStartupReminder'),
  runtimeShellSource.indexOf('export async function showDirectiveRuntimePanel')
);
assert.doesNotMatch(presetStartupReminderSource, /installDirectivePreset|installBundledPreset/, 'Directive Preset startup reminder should not install the preset directly.');
assert.match(css, /\.directive-settings-focus-highlight\s*\{/, 'Directive CSS should style guided Settings highlights.');
assert.match(css, /\.directive-preset-update-dialog-overlay\s*\{[\s\S]*?position:\s*fixed/, 'Directive CSS should style the preset update dialog overlay.');
assert.match(settingsPanelSource, /Model Call Routing/, 'Settings should expose per-role Utility and Reasoning routing controls');
assert.match(settingsPanelSource, /MODEL_CALL_ROUTING_GROUPS/, 'Settings model-call routing should group roles by what each call does');
assert.match(settingsPanelSource, /createElement\('details',\s*`directive-provider-role-folder/, 'Settings model-call routing categories should render as dropdown disclosure folders');
assert.match(settingsPanelSource, /createElement\('summary',\s*['"]directive-provider-role-folder-summary['"]\)/, 'Settings model-call routing folders should use native summary controls');
assert.match(settingsPanelSource, /modelCallGroupSummary\(group\.routes\)/, 'Settings model-call routing folder summaries should describe their contained role list');
assert.doesNotMatch(settingsPanelSource, /directive-provider-role-group-header|createElement\('section',\s*['"]directive-provider-role-group['"]\)/, 'Settings model-call routing should not render old always-open category panels');
assert.match(settingsPanelSource, /Default \(\$\{providerKindLabel/, 'Settings model-call routing dropdowns should expose a Default lane option');
assert.match(settingsPanelSource, /updateProviderRoleRouting/, 'Settings role routing controls should call the runtime role-routing action');
assert.match(settingsPanelSource, /resetProviderRoleRouting/, 'Settings role routing controls should restore default role lanes');
assert.match(settingsPanelSource, /Model Calls/, 'Settings should expose sanitized model-call diagnostics as a control-plane surface');
assert.match(settingsPanelSource, /chatNative\?\.modelCalls/, 'Settings model-call diagnostics should read the sanitized runtime journal');
assert.match(settingsPanelSource, /notifyProviderTestResult/, 'Settings provider tests should notify the operator after each test run');
assert.match(settingsPanelSource, /globalThis\.toastr/, 'Settings provider-test notifications should use SillyTavern toast feedback when available');
assert.doesNotMatch(settingsPanelSource, /lastOpenWorldActionResult|getQuestOpportunities|providerAssistCandidateCount|hasProviderAssistSurface/, 'Settings should not own Open World assist diagnostics');
assert.match(settingsPanelSource, /Safety & State|Campaign State Controls/, 'Settings should expose safety controls');
assert.match(settingsPanelSource, /Verify Active Save/, 'Settings should expose active-save verification');
assert.match(settingsPanelSource, /Settle Active State/, 'Settings should expose settle-current-state control');
assert.match(settingsPanelSource, /Export Active Save/, 'Settings should expose passive save export');
assert.match(settingsPanelSource, /Clean Missing Records/, 'Settings should expose missing-index cleanup');
assert.match(settingsPanelSource, /lastStateSafetyResult/, 'Settings should render the last State Safety action result');
assert.doesNotMatch(commandLogPanelSource, /continuityProjection|candidateClaims|rejectedClaims|factIndex|sourceIds/, 'Command Log should not render Continuity Matrix inspector internals');
assert.match(css, /\.directive-settings-continuity-card\s*\{/, 'Directive CSS should style the Continuity diagnostics card');
assert.match(css, /\.directive-continuity-status-grid\s*\{/, 'Directive CSS should style the Continuity diagnostics status grid');
assert.match(css, /\.directive-continuity-inspector\s*\{/, 'Directive CSS should style the Continuity diagnostics inspector header');
assert.match(css, /\.directive-mission-continuity-state\s*\{/, 'Directive CSS should style the Mission Continuity Matrix row');
assert.match(css, /\.directive-settings-runtime-form\s*\{[\s\S]*?width:\s*min\(100%,\s*720px\);[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, 'Settings Runtime should use a capped two-column grouped form on wider drawers');
assert.match(css, /\.directive-settings-runtime-actions\s*\{[\s\S]*?justify-content:\s*flex-end;/, 'Settings Runtime Apply should live in a separate right-aligned action row');
assert.doesNotMatch(css, /\.directive-runtime-history-controls/, 'Settings Runtime should not keep the old loose history-control grid');
assert.doesNotMatch(settingsPanelSource, /No provider assist diagnostics are available\./, 'Settings should not show a low-value Assist empty state when provider diagnostics are unavailable');
assert.doesNotMatch(missionPanelSource, /Provider Assist Diagnostics|providerAssistDiagnostics|providerAssistProposals/, 'Mission should not render provider-assist diagnostics as player-facing sidecar internals');

for (const relativePath of [
  'src/theme/directive-theme-packs.mjs',
  'src/theme/directive-icon-packs.mjs',
  'src/packages/package-image-resolver.mjs',
  'src/ui/crew-panel.js',
  'src/ui/settings-panel.js',
  'styles/directive.css'
]) {
  const text = await readText(relativePath);
  assert.doesNotMatch(text, /\bRaw Values\b/i, `${relativePath} introduced a visible raw-value label`);
  assert.doesNotMatch(text, /\bRelationship Dimensions\b/i, `${relativePath} introduced visible relationship mechanics`);
  assert.doesNotMatch(text, /\braw\s+(relationship|development|hidden|values?)\b/i, `${relativePath} introduced a raw hidden-value label`);
  assert.doesNotMatch(text, /\bhidden\s+(relationship|development)\s+values?\b/i, `${relativePath} introduced a hidden-state label`);
}

console.log('Visual system foundation tests passed: theme tokens, passive packs, icon fallback, image fallback, shared shell CSS, and Settings diagnostics placement');
