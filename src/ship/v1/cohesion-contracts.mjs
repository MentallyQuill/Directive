export const COHESION_CATALOG_KIND = 'directive.cohesionCatalog.v1';

const FAMILIES = new Set(['personnel', 'coordination', 'training', 'systems', 'shipboardLife']);
const BINDING_MODES = new Set(['backgroundOnly', 'establishedPublic', 'roleOnly']);
const LEVEL_COUNTS = Object.freeze({ 1: 20, 2: 12, 3: 6, 4: 2 });
const FAMILY_COUNTS = Object.freeze({ personnel: 12, coordination: 10, training: 8, systems: 6, shipboardLife: 4 });

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stableId(value) {
  return text(value) && /^[a-z0-9][a-z0-9._:-]*$/.test(value);
}

function strings(value, path, errors, { nonEmpty = true } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    errors.push(`${path} must be ${nonEmpty ? 'a non-empty' : 'an'} array`);
    return [];
  }
  if (new Set(value).size !== value.length) errors.push(`${path} must not contain duplicates`);
  for (const item of value) if (!text(item)) errors.push(`${path} must contain non-empty strings`);
  return value;
}

function exactInteger(value, expected, path, errors) {
  if (!Number.isInteger(value) || value !== expected) errors.push(`${path} must be ${expected}`);
}

function validatePolicy(policy, errors) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    errors.push('policy must be an object');
    return;
  }
  const weights = policy.levelWeights || {};
  for (const [level, expected] of Object.entries({ 1: 50, 2: 30, 3: 15, 4: 5 })) {
    exactInteger(weights[level], expected, `policy.levelWeights.${level}`, errors);
  }
  const cooldowns = policy.cooldownChecks || {};
  for (const [level, expected] of Object.entries({ 1: 3, 2: 6, 3: 12 })) {
    exactInteger(cooldowns[level], expected, `policy.cooldownChecks.${level}`, errors);
  }
  const schedule = policy.schedule || {};
  for (const [field, expected] of Object.entries({
    warmupHours: 4,
    intervalHours: 12,
    boundaryMinimumHours: 4,
    targetUnresolved: 3,
    crowdedThreshold: 8,
    normalChancePercent: 35,
    crowdedChancePercent: 15,
    criticalPauseBelow: 40,
    visibleLimit: 5,
  })) exactInteger(schedule[field], expected, `policy.schedule.${field}`, errors);
}

function validateTemplate(template, index, errors) {
  const path = template?.id || `templates[${index}]`;
  if (!stableId(template?.id)) errors.push(`${path} requires a stable id`);
  if (!Number.isInteger(template?.version) || template.version < 1) errors.push(`${path} version must be positive`);
  if (!text(template?.title)) errors.push(`${path} title is required`);
  if (!Number.isInteger(template?.level) || template.level < 1 || template.level > 4) errors.push(`${path} level must be 1-4`);
  if (template?.cohesion !== template?.level * 5) errors.push(`${path} Cohesion must equal five times level`);
  if (!FAMILIES.has(template?.primaryFamily)) errors.push(`${path} primaryFamily is unknown`);
  for (const family of strings(template?.secondaryFamilies, `${path}.secondaryFamilies`, errors, { nonEmpty: false })) {
    if (!FAMILIES.has(family)) errors.push(`${path} secondary family is unknown: ${family}`);
  }
  if (!BINDING_MODES.has(template?.bindingMode)) errors.push(`${path} bindingMode is unknown`);
  strings(template?.bindingRoles, `${path}.bindingRoles`, errors);
  if (!text(template?.anchor)) errors.push(`${path} anchor is required`);
  for (const field of ['situation', 'objective', 'whyItMatters', 'operationalEffect']) {
    if (!text(template?.playerText?.[field])) errors.push(`${path}.playerText.${field} is required`);
  }
  if (!Array.isArray(template?.phases) || template.phases.length < 2) errors.push(`${path} requires at least two phases`);
  const phaseIds = new Set();
  for (const phase of template?.phases || []) {
    if (!stableId(phase?.id) || !text(phase?.label)) errors.push(`${path} contains an invalid phase`);
    if (phaseIds.has(phase?.id)) errors.push(`${path} contains duplicate phase: ${phase?.id}`);
    phaseIds.add(phase?.id);
  }
  strings(template?.approaches, `${path}.approaches`, errors);
  if (!text(template?.computerHelp)) errors.push(`${path} computerHelp is required`);
  if (!text(template?.completion?.guidance)) errors.push(`${path}.completion.guidance is required`);
  strings(template?.completion?.exclusions, `${path}.completion.exclusions`, errors);
  strings(template?.variations, `${path}.variations`, errors);
  strings(template?.narratorLimits, `${path}.narratorLimits`, errors);
}

function validateAuthoredIssue(issue, index, errors) {
  const path = issue?.id || `authoredIssues[${index}]`;
  for (const field of ['id', 'systemId', 'terminalStateId', 'conditionId']) {
    if (!stableId(issue?.[field])) errors.push(`${path}.${field} must be a stable id`);
  }
  if (!Number.isInteger(issue?.level) || issue.level < 1 || issue.level > 4) errors.push(`${path}.level must be 1-4`);
  if (!FAMILIES.has(issue?.primaryFamily)) errors.push(`${path}.primaryFamily is unknown`);
  if (!text(issue?.anchor) || !text(issue?.computerHelp)) errors.push(`${path} anchor and computerHelp are required`);
  for (const field of ['title', 'situation', 'objective', 'whyItMatters', 'operationalEffect']) {
    if (!text(issue?.playerText?.[field])) errors.push(`${path}.playerText.${field} is required`);
  }
  strings(issue?.phaseMilestoneIds, `${path}.phaseMilestoneIds`, errors);
}

export function validateCohesionCatalog(catalog = {}) {
  const errors = [];
  if (catalog?.kind !== COHESION_CATALOG_KIND) errors.push(`kind must be ${COHESION_CATALOG_KIND}`);
  if (catalog?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!stableId(catalog?.id)) errors.push('id must be stable');
  if (!text(catalog?.packageId)) errors.push('packageId is required');
  validatePolicy(catalog?.policy, errors);
  const crew = catalog?.backgroundCrew || {};
  strings(crew.names, 'backgroundCrew.names', errors);
  strings(crew.pronouns, 'backgroundCrew.pronouns', errors);
  strings(crew.ranks, 'backgroundCrew.ranks', errors);
  strings(crew.departments, 'backgroundCrew.departments', errors);
  strings(crew.watches, 'backgroundCrew.watches', errors);
  strings(crew.qualifications, 'backgroundCrew.qualifications', errors);
  if (!Array.isArray(catalog?.authoredIssues)) errors.push('authoredIssues must be an array');
  if (!Array.isArray(catalog?.templates)) errors.push('templates must be an array');
  const ids = new Set();
  const titles = new Set();
  for (const [index, template] of (catalog?.templates || []).entries()) {
    validateTemplate(template, index, errors);
    if (ids.has(template?.id)) errors.push(`duplicate template id: ${template?.id}`);
    if (titles.has(template?.title)) errors.push(`duplicate template title: ${template?.title}`);
    ids.add(template?.id);
    titles.add(template?.title);
  }
  if ((catalog?.templates || []).length !== 40) errors.push('templates must contain exactly 40 entries');
  for (const [level, expected] of Object.entries(LEVEL_COUNTS)) {
    const actual = (catalog?.templates || []).filter((template) => template?.level === Number(level)).length;
    if (actual !== expected) errors.push(`level ${level} must contain ${expected} templates`);
  }
  for (const [family, expected] of Object.entries(FAMILY_COUNTS)) {
    const actual = (catalog?.templates || []).filter((template) => template?.primaryFamily === family).length;
    if (actual !== expected) errors.push(`${family} must contain ${expected} templates`);
  }
  const authoredIds = new Set();
  for (const [index, issue] of (catalog?.authoredIssues || []).entries()) {
    validateAuthoredIssue(issue, index, errors);
    if (authoredIds.has(issue?.id)) errors.push(`duplicate authored issue id: ${issue?.id}`);
    authoredIds.add(issue?.id);
  }
  return { ok: errors.length === 0, errors };
}

export function indexCohesionCatalog(catalog = {}) {
  const validation = validateCohesionCatalog(catalog);
  if (!validation.ok) throw new TypeError(validation.errors.join('\n'));
  return {
    policy: structuredClone(catalog.policy),
    backgroundCrew: structuredClone(catalog.backgroundCrew),
    templates: new Map(catalog.templates.map((template) => [template.id, structuredClone(template)])),
    authoredIssues: [...catalog.authoredIssues].sort((left, right) => left.id.localeCompare(right.id)).map((issue) => structuredClone(issue)),
  };
}
