export const DIRECTIVE_STATIC_PROMPT_KEYS = Object.freeze([
  'directive.contract',
  'directive.continuity.invariants',
  'directive.scene.active',
  'directive.continuity.domain',
  'directive.recap.committed',
  'directive.context.revolving'
]);

export const CONTINUITY_PROMPT_LANES = Object.freeze([
  {
    id: 'continuity-contract',
    promptKey: 'directive.contract',
    title: 'Directive Contract',
    placement: 'inPrompt',
    depth: 0,
    priority: 1,
    ttl: 'session'
  },
  {
    id: 'continuity-invariants',
    promptKey: 'directive.continuity.invariants',
    title: 'Continuity Invariants',
    placement: 'inPrompt',
    depth: 1,
    priority: 5,
    ttl: 'session'
  },
  {
    id: 'continuity-scene-active',
    promptKey: 'directive.scene.active',
    title: 'Active Scene Continuity',
    placement: 'inChat',
    depth: 1,
    priority: 10,
    ttl: 'turn'
  },
  {
    id: 'continuity-domain',
    promptKey: 'directive.continuity.domain',
    title: 'Domain Continuity',
    placement: 'inChat',
    depth: 3,
    priority: 20,
    ttl: 'scene'
  },
  {
    id: 'continuity-recap-committed',
    promptKey: 'directive.recap.committed',
    title: 'Committed Recap',
    placement: 'inChat',
    depth: 5,
    priority: 40,
    ttl: 'scene'
  },
  {
    id: 'continuity-revolving-context',
    promptKey: 'directive.context.revolving',
    title: 'Revolving Context',
    placement: 'inChat',
    depth: 7,
    priority: 60,
    ttl: 'revolving'
  }
]);
