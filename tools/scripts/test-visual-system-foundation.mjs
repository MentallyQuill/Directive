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
assert.doesNotMatch(resolverSource, /breckenridge/i, 'image resolver must not build package-specific filenames');

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
assert.match(css, /\.directive-runtime-panel\s*\{[\s\S]*?\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/, 'runtime shell should reserve a persistent bottom navigation row');
assert.match(css, /\.directive-mobile-bottom-bar\s*\{[\s\S]*?repeat\(var\(--directive-mobile-bottom-tab-count,\s*6\),\s*minmax\(0,\s*1fr\)\)/, 'shared shell should use bottom route navigation at every viewport');
assert.match(css, /\.directive-mobile-bottom-tab-active\s*\{[\s\S]*?\bborder-color:\s*var\(--directive-border-strong/, 'shared shell should highlight the active bottom route with theme border tokens');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-panel\s*\{[\s\S]*?\binset:\s*0;/, 'phone-width shell should fill the viewport from the top');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-panel\s*\{[\s\S]*?\bheight:\s*100dvh;/, 'phone-width shell should set explicit viewport height for fixed-position hosts with zero-height html roots');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-panel\s*\{[\s\S]*?\bz-index:\s*10020;/, 'phone-width shell should sit above other full-screen extension panels');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-header\s*\{[\s\S]*?\bdisplay:\s*grid;/, 'phone-width shell should keep title and shell actions visible above bottom navigation');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-runtime-body\s*\{[\s\S]*?\bflex:\s*1\s+1\s+auto;/, 'phone-width shell should make content the primary scroll pane');
assert.match(css, /\.directive-mobile-shell-action-bar\s*\{[\s\S]*?\bdisplay:\s*none;/, 'mobile shell action bar should be hidden outside phone layout');
assert.doesNotMatch(css, /directive-mobile-can-go-back/, 'primary route navigation should not reserve a mobile Back shelf segment');
assert.match(css, /\.directive-runtime-panel\s*\{[\s\S]*?--directive-mobile-control-height:\s*44px;/, 'runtime shell should own mobile touch control dimensions');
assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.directive-mobile-touch \.directive-button,[\s\S]*?min-height:\s*var\(--directive-mobile-control-height,\s*44px\)/, 'phone route controls should use mobile touch targets');
assert.match(css, /\.directive-theme-swatch-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(34px,\s*1fr\)\)/, 'Settings Theme Pack swatches should render as a compact responsive strip');
assert.match(css, /\.directive-icon-preview-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(92px,\s*1fr\)\)/, 'Settings Icon Pack preview should render compact route/action previews');
assert.match(css, /\.directive-creator-status-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, 'Character Creator should expose compact LCARS status tiles');
assert.match(css, /\.directive-creator-progress-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/, 'Character Creator should expose four compact step progress tiles');
assert.match(css, /\.directive-creator-command-bar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(104px,\s*0\.9fr\)\s*repeat\(3,\s*minmax\(74px,\s*1fr\)\)/, 'Character Creator command bar should keep mode, Save, Begin, and Back controls in a stable row');
assert.match(css, /\.directive-creator-section\s*\{[\s\S]*?\bdisplay:\s*none;/, 'Character Creator should hide inactive creator sections without unmounting inputs');
assert.match(css, /\.directive-creator-section-active\s*\{[\s\S]*?\bdisplay:\s*grid;/, 'Character Creator should show the active creator section');
assert.match(css, /\.directive-starship-records-status-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, 'Starships records should expose compact LCARS status tiles without label clipping');
assert.match(css, /\.directive-starship-record-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(74px,\s*auto\)/, 'Starships records should use compact row/action layout');
assert.match(css, /\.directive-starship-current-record\s*\{[\s\S]*?var\(--directive-success/, 'Starships records should visually distinguish the current save');
assert.match(css, /\.directive-settings-status-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'Settings should expose compact LCARS status tiles before dense controls');
assert.match(css, /\.directive-settings-subtabs\s*\{[\s\S]*?grid-auto-flow:\s*column;/, 'Settings should expose route-local subtabs for dense control groups');
assert.match(css, /\.directive-settings-safety-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, 'Settings State Safety controls should use stable two-column command rows');
assert.match(css, /\.directive-mission-sidework-status-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(104px,\s*1fr\)\)/, 'Mission Side Work should expose compact LCARS status tiles');
assert.match(css, /\.directive-mission-sidework-fact-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(142px,\s*1fr\)\)/, 'Mission Side Work facts should use compact responsive rows');
assert.match(css, /\.directive-mission-sidework-action-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(118px,\s*1fr\)\)/, 'Mission Side Work actions should use touch-safe responsive controls');
assert.match(css, /\.directive-mission-recovery-status-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(104px,\s*1fr\)\)/, 'Mission Recovery should expose compact LCARS status tiles');
assert.match(css, /\.directive-mission-recovery-fact-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(142px,\s*1fr\)\)/, 'Mission Recovery facts should use compact responsive rows');
assert.match(css, /\.directive-mission-recovery-risk-row\s*\{[\s\S]*?border-top:/, 'Mission Recovery should visually separate risk actions from routine save actions');

const settingsPanelSource = await readText('src/ui/settings-panel.js');
const missionPanelSource = await readText('src/ui/mission-panel.js');
const crewPanelSource = await readText('src/ui/crew-panel.js');
const shipPanelSource = await readText('src/ui/ship-panel.js');
const commandLogPanelSource = await readText('src/ui/command-log-panel.js');
const characterCreatorPanelSource = await readText('src/ui/character-creator-panel.js');
const runtimeShellSource = await readText('src/runtime/runtime-shell.js');
const compactShellSource = await readText('src/ui/directive-compact-shell.js');
const starshipsPanelSource = await readText('src/ui/starships-panel.js');
assert.match(runtimeShellSource, /applyDirectiveTheme\(panel,\s*getDirectiveThemePack\(\)\)/, 'runtime shell should apply the bundled Theme Pack instead of inheriting host button colors');
assert.match(compactShellSource, /resolveDirectiveIconSlot/, 'compact shell should resolve route and action icons from Icon Pack slots');
assert.match(compactShellSource, /bottom-navigation/, 'compact shell should declare the bottom-navigation shell contract');
assert.match(compactShellSource, /directive-bottom-route-bar/, 'compact shell should render shared bottom route navigation');
assert.doesNotMatch(runtimeShellSource, /routeHistory|navigateBack/, 'runtime shell should not replay primary tab click history');
assert.doesNotMatch(compactShellSource, /directive-mobile-can-go-back|item\.id\s*===\s*['"]back['"]/, 'compact shell should not special-case Back as primary navigation');
assert.match(compactShellSource, /mobileShellActions\.length\s*>\s*0/, 'compact shell should only mount mobile shell actions when explicitly requested');
assert.match(starshipsPanelSource, /directive-starships-console/, 'Starships should render an LCARS console wrapper');
assert.match(starshipsPanelSource, /directive-primary-command-zone/, 'Starships should elevate the next safe command');
assert.match(starshipsPanelSource, /directive-lcars-readiness-grid/, 'Starships should expose readiness as LCARS status blocks');
assert.match(starshipsPanelSource, /directive-starship-records-console/, 'Starships should render saves and drafts as an LCARS records console');
assert.match(starshipsPanelSource, /directive-starship-records-status-grid/, 'Starships records should summarize drafts, accepted drafts, saves, and current save state');
assert.match(starshipsPanelSource, /directive-starship-record-row/, 'Starships records should use compact LCARS record rows instead of generic metadata rows');
assert.match(missionPanelSource, /directive-mission-console/, 'Mission should render an LCARS console wrapper');
assert.match(missionPanelSource, /directive-mission-status-grid/, 'Mission should expose current mission state as compact status blocks');
assert.match(missionPanelSource, /directive-mission-subtabs/, 'Mission should expose compact section navigation for dense mission surfaces');
assert.match(missionPanelSource, /directive-mission-sidework-console/, 'Mission Side Work should render a dedicated LCARS side-work console');
assert.match(missionPanelSource, /directive-mission-sidework-status-grid/, 'Mission Side Work should summarize optional work before rendering records');
assert.match(missionPanelSource, /directive-mission-sidework-card/, 'Mission Side Work should render optional assignments as compact LCARS records');
assert.match(missionPanelSource, /No side work is active\./, 'Mission Side Work sub-tab should resolve to a real empty state when no side work is available');
assert.match(missionPanelSource, /directive-mission-recovery-console/, 'Mission Recovery should render a dedicated LCARS recovery console');
assert.match(missionPanelSource, /directive-mission-recovery-status-grid/, 'Mission Recovery should summarize save, narration, and outcome state before controls');
assert.match(missionPanelSource, /directive-mission-recovery-risk-row/, 'Mission Recovery should separate destructive outcome actions from safe save actions');
assert.match(missionPanelSource, /directive-mission-command-card/, 'Mission should elevate Player Action or pending outcome review as the primary command zone');
assert.match(crewPanelSource, /directive-crew-console/, 'Crew should render an LCARS personnel console wrapper');
assert.match(crewPanelSource, /directive-crew-readiness-grid/, 'Crew should expose roster readiness as compact status blocks');
assert.match(crewPanelSource, /directive-crew-roster-row/, 'Crew should render compact LCARS personnel rows instead of generic metadata cards');
assert.match(shipPanelSource, /directive-ship-console/, 'Ship should render an LCARS starship status console wrapper');
assert.match(shipPanelSource, /directive-ship-readiness-grid/, 'Ship should expose readiness as compact status blocks');
assert.match(shipPanelSource, /commandLabel/, 'Ship should resolve package command IDs into player-facing labels where available');
assert.match(commandLogPanelSource, /directive-log-console/, 'Log should render an LCARS command-history console wrapper');
assert.match(commandLogPanelSource, /directive-log-status-grid/, 'Log should expose command-history summary as compact status blocks');
assert.match(commandLogPanelSource, /directive-log-timeline/, 'Log should render compact LCARS timeline entries instead of generic metadata cards');
assert.match(commandLogPanelSource, /parseJsonText/, 'Log should parse assisted-summary JSON before rendering player-facing text');
assert.match(characterCreatorPanelSource, /directive-creator-console/, 'Character Creator should render an LCARS commissioning console wrapper');
assert.match(characterCreatorPanelSource, /directive-creator-status-grid/, 'Character Creator should expose package and draft state as compact status blocks');
assert.match(characterCreatorPanelSource, /directive-creator-progress-grid/, 'Character Creator should show compact step progress before the active form pane');
assert.match(characterCreatorPanelSource, /directive-creator-command-bar/, 'Character Creator should keep Save, Begin, Back, and mode controls near the active pane');
assert.match(characterCreatorPanelSource, /directive-creator-section-active/, 'Character Creator should render one active creator section at a time');
assert.match(settingsPanelSource, /directive-settings-console/, 'Settings should render an LCARS control-console wrapper');
assert.match(settingsPanelSource, /directive-settings-status-grid/, 'Settings should expose runtime health as compact LCARS status blocks');
assert.match(settingsPanelSource, /directive-settings-subtabs/, 'Settings should expose local subtabs for Systems, Safety, Packs, and Assist');
assert.match(settingsPanelSource, /directive-settings-safety-section/, 'Settings should make State Safety the initial active control pane');
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
assert.match(settingsPanelSource, /No provider assist diagnostics are available\./, 'Settings Assist sub-tab should resolve to a real empty state when provider diagnostics are unavailable');
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
