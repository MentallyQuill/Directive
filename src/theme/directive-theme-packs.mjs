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
    label: 'LCARS Command Panel',
    description: 'A UX-first LCARS command-console theme for Directive runtime surfaces.',
    tokens: Object.freeze({
      '--directive-bg': '#05070b',
      '--directive-bg-alt': '#101321',
      '--directive-surface': 'rgba(23, 18, 31, 0.82)',
      '--directive-surface-alt': 'rgba(9, 12, 20, 0.7)',
      '--directive-border': 'rgba(255, 159, 74, 0.34)',
      '--directive-border-strong': 'rgba(255, 199, 102, 0.72)',
      '--directive-text': '#f8efe0',
      '--directive-muted': 'rgba(248, 239, 224, 0.7)',
      '--directive-accent': '#ff9f4a',
      '--directive-focus': '#ffe58f',
      '--directive-button': 'rgba(18, 17, 28, 0.82)',
      '--directive-button-hover': 'rgba(129, 61, 122, 0.48)',
      '--directive-button-text': '#f8efe0',
      '--directive-input': 'rgba(9, 12, 20, 0.82)',
      '--directive-input-border': 'rgba(255, 159, 74, 0.4)',
      '--directive-success': '#95d2b3',
      '--directive-warning': '#ffc766',
      '--directive-danger': '#ef7f72',
      '--directive-command': '#ef7f72',
      '--directive-operations': '#ffc766',
      '--directive-science': '#91a7ff'
    }),
    swatches: Object.freeze([
      '#05070b',
      '#101321',
      '#ff9f4a',
      '#ef7f72',
      '#91a7ff'
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
