export const DIRECTIVE_THEME_TOKEN_ROLES = Object.freeze([
  '--directive-bg',
  '--directive-bg-alt',
  '--directive-surface',
  '--directive-surface-alt',
  '--directive-border',
  '--directive-border-strong',
  '--directive-text',
  '--directive-muted',
  '--directive-accent',
  '--directive-focus',
  '--directive-button',
  '--directive-button-hover',
  '--directive-button-text',
  '--directive-input',
  '--directive-input-border',
  '--directive-success',
  '--directive-warning',
  '--directive-danger',
  '--directive-command',
  '--directive-operations',
  '--directive-science'
]);

export const DIRECTIVE_DEFAULT_THEME_PACK_ID = 'directive.theme.command-panel.default';

export const DIRECTIVE_BUNDLED_THEME_PACKS = Object.freeze([
  Object.freeze({
    id: DIRECTIVE_DEFAULT_THEME_PACK_ID,
    kind: 'directive.theme-pack',
    schemaVersion: 1,
    source: 'bundled',
    label: 'Command Panel',
    description: 'A compact operational theme for Directive command surfaces.',
    tokens: Object.freeze({
      '--directive-bg': '#120c12',
      '--directive-bg-alt': '#090c12',
      '--directive-surface': 'rgba(43, 28, 28, 0.74)',
      '--directive-surface-alt': 'rgba(18, 18, 24, 0.62)',
      '--directive-border': 'rgba(185, 139, 54, 0.28)',
      '--directive-border-strong': 'rgba(215, 181, 109, 0.58)',
      '--directive-text': '#f1ead8',
      '--directive-muted': 'rgba(241, 234, 216, 0.68)',
      '--directive-accent': '#d7b56d',
      '--directive-focus': '#ffeaa7',
      '--directive-button': 'rgba(18, 18, 24, 0.72)',
      '--directive-button-hover': 'rgba(92, 23, 36, 0.48)',
      '--directive-button-text': '#f1ead8',
      '--directive-input': 'rgba(18, 18, 24, 0.76)',
      '--directive-input-border': 'rgba(185, 139, 54, 0.34)',
      '--directive-success': '#b9d8b8',
      '--directive-warning': '#e0c184',
      '--directive-danger': '#e1a0a0',
      '--directive-command': '#cf4f52',
      '--directive-operations': '#d7b56d',
      '--directive-science': '#38b8a6'
    }),
    swatches: Object.freeze([
      '#120c12',
      '#2b1c1c',
      '#d7b56d',
      '#cf4f52',
      '#38b8a6'
    ])
  })
]);

export function getDirectiveThemePack(themePackId = DIRECTIVE_DEFAULT_THEME_PACK_ID) {
  return DIRECTIVE_BUNDLED_THEME_PACKS.find((pack) => pack.id === themePackId) || DIRECTIVE_BUNDLED_THEME_PACKS[0];
}

export function applyDirectiveTheme(root, themePack = getDirectiveThemePack()) {
  if (!root?.style || !themePack?.tokens) return null;
  for (const tokenRole of DIRECTIVE_THEME_TOKEN_ROLES) {
    const value = themePack.tokens[tokenRole];
    if (value) {
      root.style.setProperty(tokenRole, value);
    }
  }
  root.dataset.directiveThemePack = themePack.id || DIRECTIVE_DEFAULT_THEME_PACK_ID;
  return themePack;
}
