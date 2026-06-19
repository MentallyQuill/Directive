import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  assert.equal(defaultIconPack.slots[iconSlot].type, 'class', `${iconSlot} should use a host-safe class fallback`);
}
assertPassiveData(DIRECTIVE_BUNDLED_ICON_PACKS, 'Icon Pack data');

const missionIcon = resolveDirectiveIconSlot(defaultIconPack, 'route.mission');
assert.equal(missionIcon.source, 'pack');
assert.equal(missionIcon.value, 'fa-solid fa-compass');

const fallbackIcon = resolveDirectiveIconSlot({ slots: {} }, 'action.openOrders');
assert.equal(fallbackIcon.source, 'fallback');
assert.equal(fallbackIcon.value, 'fa-solid fa-share-nodes');

const unknownIcon = resolveDirectiveIconSlot({ slots: {} }, 'route.unmapped');
assert.equal(unknownIcon.source, 'fallback');
assert.equal(unknownIcon.value, 'fa-solid fa-circle');
const closeIcon = resolveDirectiveIconSlot(defaultIconPack, 'action.close');
assert.equal(closeIcon.source, 'pack');
assert.equal(closeIcon.value, 'fa-solid fa-xmark');

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

const resolverSource = await readText('src/packages/package-image-resolver.mjs');
assert.doesNotMatch(resolverSource, /breckinridge/i, 'image resolver must not build package-specific filenames');

const css = await readText('styles/directive.css');
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
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-panel\s*\{[\s\S]*?\binset:\s*0;/, 'phone-width shell should fill the viewport from the top');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-panel\s*\{[\s\S]*?\bheight:\s*100dvh;/, 'phone-width shell should set explicit viewport height for fixed-position hosts with zero-height html roots');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-panel\s*\{[\s\S]*?\bz-index:\s*10020;/, 'phone-width shell should sit above other full-screen extension panels');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-header\s*\{[\s\S]*?\bdisplay:\s*none;/, 'phone-width shell should hide the desktop top-tab header');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-body\s*\{[\s\S]*?\bflex:\s*1\s+1\s+auto;/, 'phone-width shell should make content the primary scroll pane');
assert.match(css, /\.directive-mobile-shell-action-bar\s*\{[\s\S]*?\bdisplay:\s*none;/, 'mobile shell action bar should be hidden outside phone layout');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-mobile-shell-action-bar\s*\{[\s\S]*?\bborder-top:/, 'phone-width shell should expose bottom shell actions');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-mobile-bottom-bar\s*\{[\s\S]*?repeat\(var\(--directive-mobile-bottom-tab-count,\s*6\),\s*minmax\(0,\s*1fr\)\)/, 'phone-width shell should use bottom route navigation');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-mobile-bottom-tab-active\s*\{[\s\S]*?\bborder-color:\s*var\(--directive-border-strong/, 'phone-width shell should highlight the active bottom route with theme border tokens');
assert.match(css, /\.directive-runtime-panel\s*\{[\s\S]*?--directive-mobile-control-height:\s*44px;/, 'runtime shell should own mobile touch control dimensions');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-mobile-touch \.directive-button,[\s\S]*?min-height:\s*var\(--directive-mobile-control-height,\s*44px\)/, 'phone route controls should use mobile touch targets');
assert.match(css, /\.directive-theme-swatch-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(34px,\s*1fr\)\)/, 'Settings Theme Pack swatches should render as a compact responsive strip');
assert.match(css, /\.directive-icon-preview-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(92px,\s*1fr\)\)/, 'Settings Icon Pack preview should render compact route/action previews');

const settingsPanelSource = await readText('src/ui/settings-panel.js');
const missionPanelSource = await readText('src/ui/mission-panel.js');
const runtimeShellSource = await readText('src/runtime/runtime-shell.js');
const compactShellSource = await readText('src/ui/directive-compact-shell.js');
assert.match(runtimeShellSource, /applyDirectiveTheme\(panel,\s*getDirectiveThemePack\(\)\)/, 'runtime shell should apply the bundled Theme Pack instead of inheriting host button colors');
assert.match(compactShellSource, /resolveDirectiveIconSlot/, 'compact shell should resolve route and action icons from Icon Pack slots');
assert.match(settingsPanelSource, /DIRECTIVE_BUNDLED_THEME_PACKS/, 'Settings should read the active bundled Theme Pack');
assert.match(settingsPanelSource, /DIRECTIVE_BUNDLED_ICON_PACKS/, 'Settings should read the active bundled Icon Pack');
assert.match(settingsPanelSource, /Theme Pack/, 'Settings should expose Theme Pack status');
assert.match(settingsPanelSource, /Icon Pack/, 'Settings should expose Icon Pack status');
assert.match(settingsPanelSource, /directive-theme-swatch/, 'Settings should render Theme Pack swatches');
assert.match(settingsPanelSource, /directive-icon-preview/, 'Settings should render Icon Pack previews');
assert.match(settingsPanelSource, /Provider Assist Diagnostics/, 'Settings should expose provider-assist diagnostics as a control-plane surface');
assert.match(settingsPanelSource, /lastSideMissionProviderAssistResult/, 'Settings provider-assist diagnostics should use the runtime result already present in the view');
assert.match(settingsPanelSource, /providerAssistDiagnostics/, 'Settings provider-assist diagnostics should read persisted sanitized diagnostics');
assert.match(settingsPanelSource, /providerAssistProposals/, 'Settings provider-assist diagnostics should read persisted proposal counts');
assert.match(settingsPanelSource, /Run Provider Assist/, 'Settings should expose provider-assist as an explicit operator action');
assert.match(settingsPanelSource, /runSideMissionProviderAssistance/, 'Settings provider-assist action should use the runtime action');
assert.match(settingsPanelSource, /providerAssistCandidateCount/, 'Settings provider-assist action should require deterministic eligible follow-up candidates');
assert.match(settingsPanelSource, /State Safety/, 'Settings should expose State Safety controls');
assert.match(settingsPanelSource, /Verify Active Save/, 'Settings should expose active-save verification');
assert.match(settingsPanelSource, /Settle Active State/, 'Settings should expose settle-current-state control');
assert.match(settingsPanelSource, /Export Active Save/, 'Settings should expose passive save export');
assert.match(settingsPanelSource, /Clean Missing Records/, 'Settings should expose missing-index cleanup');
assert.match(settingsPanelSource, /lastStateSafetyResult/, 'Settings should render the last State Safety action result');
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
