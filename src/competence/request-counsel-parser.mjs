import { buildCompetenceContext, unique } from './competence-policy-index.mjs';

const BROAD_COUNSEL_TERMS = [
  'recommendation',
  'recommendations',
  'advise',
  'advice',
  'counsel',
  'options',
  'what am i overlooking',
  'objections',
  'protocol',
  'what does protocol require'
];

const DOMAIN_TERMS = [
  { domain: 'medical', terms: ['doctor', 'medical', 'sickbay', 'pathogen', 'bio', 'biological', 'quarantine'] },
  { domain: 'security', terms: ['security', 'tactical', 'trap', 'boarding', 'weapons', 'threat'] },
  { domain: 'operations', terms: ['ops', 'operations', 'certificate', 'signal', 'authority code', 'routing'] },
  { domain: 'engineering', terms: ['engineering', 'engineer', 'computer', 'shutdown', 'power', 'plasma'] },
  { domain: 'science', terms: ['science', 'sensor', 'sensors', 'signature', 'forensics', 'analysis'] },
  { domain: 'command', terms: ['captain', 'authority', 'jurisdiction', 'final say'] }
];

function includesAny(text, values = []) {
  const normalized = String(text || '').toLowerCase();
  return values.some((value) => normalized.includes(String(value).toLowerCase()));
}

export function parseCounselRequest(sceneSnapshot = {}) {
  const context = buildCompetenceContext(sceneSnapshot);
  const requestedByFlag = sceneSnapshot.requestCounsel === true || sceneSnapshot.requestedCounsel === true;
  const broad = requestedByFlag || includesAny(context.playerInput, BROAD_COUNSEL_TERMS);
  const asksForDomainCounsel = broad || includesAny(context.playerInput, [
    'assessment',
    'recommend',
    'risk',
    'what do you think',
    'what are we missing',
    'what am i overlooking',
    'report',
    'objection',
    'objections',
    '?'
  ]);
  const domains = asksForDomainCounsel
    ? DOMAIN_TERMS
      .filter((item) => includesAny(context.playerInput, item.terms) || context.intentTags.includes(item.domain))
      .map((item) => item.domain)
    : [];

  return {
    requested: broad || domains.length > 0,
    scope: domains.length > 0 ? 'domain' : (broad ? 'broad' : 'none'),
    domains: unique(domains),
    promptText: sceneSnapshot.playerInput || ''
  };
}
