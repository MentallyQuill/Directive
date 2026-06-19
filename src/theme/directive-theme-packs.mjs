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
      '--directive-bg': '#101216',
      '--directive-bg-alt': '#171a20',
      '--directive-surface': '#1d2027',
      '--directive-surface-alt': '#262a33',
      '--directive-border': 'rgba(222, 226, 214, 0.18)',
      '--directive-border-strong': 'rgba(238, 211, 139, 0.42)',
      '--directive-text': '#f0efe6',
      '--directive-muted': 'rgba(240, 239, 230, 0.68)',
      '--directive-accent': '#e0b35a',
      '--directive-focus': '#7fd4ff',
      '--directive-button': 'rgba(224, 179, 90, 0.14)',
      '--directive-button-hover': 'rgba(224, 179, 90, 0.24)',
      '--directive-button-text': '#fff6dc',
      '--directive-input': 'rgba(6, 8, 12, 0.48)',
      '--directive-input-border': 'rgba(222, 226, 214, 0.22)',
      '--directive-success': '#7ccf9a',
      '--directive-warning': '#e0b35a',
      '--directive-danger': '#f06f6f',
      '--directive-command': '#cf4f52',
      '--directive-operations': '#d6a84b',
      '--directive-science': '#55b7c9'
    }),
    swatches: Object.freeze([
      '#101216',
      '#1d2027',
      '#e0b35a',
      '#cf4f52',
      '#55b7c9'
    ])
  })
]);
