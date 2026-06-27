import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const ADDENDUM_START = '<!-- directive-rich-character-expansion:start -->';
const ADDENDUM_END = '<!-- directive-rich-character-expansion:end -->';

const FOUNDATIONAL_CARD_TYPES = [
  'crew.profile',
  'crew.voice',
  'crew.relationship',
  'crew.reveal',
  'crew.development',
  'command.styleReaction'
];

const CAMPAIGNS = [
  {
    key: 'glass-harbor',
    datasetPath: 'packages/bundled/glass-harbor/glass-harbor-senior-staff.crew-dataset.json',
    biblePath: 'content/campaigns/glass-harbor/crew/GLASS_HARBOR_SENIOR_STAFF_CHARACTER_BIBLE.md',
    themes: {
      title: 'Glass Harbor / Drowned Constellation',
      settingNoun: 'the Drowned Constellation',
      pressureNoun: 'the charts',
      sceneNoun: 'the route opens',
      moralEngine: 'route custody, sanctuary, salvage pressure, and truthful survey work',
      moralQuestion: 'whether a true chart can still become a weapon',
      commandCulture: 'a succession culture shaped by Rhos, sanctuary politics, and the cost of publishing dangerous routes',
      privateFear: 'their cleanest answer may expose the very people the mission is trying to protect'
    }
  },
  {
    key: 'serein',
    datasetPath: 'packages/bundled/serein/serein-senior-staff.crew-dataset.json',
    biblePath: 'content/campaigns/serein/crew/SEREIN_SENIOR_STAFF_CHARACTER_BIBLE.md',
    themes: {
      title: 'Serein / Black Current',
      settingNoun: 'the Wake',
      pressureNoun: 'the wreck field',
      sceneNoun: 'the rescue window closes',
      moralEngine: 'wreck recovery, survivor priority, evidence custody, and memorial law',
      moralQuestion: 'whether rescue, evidence, and grief can share the same hands',
      commandCulture: 'a recovery culture where the acting captain must save lives without making the wrecks disappear as evidence',
      privateFear: 'urgency will turn remains, records, and survivor consent into inconvenient debris'
    }
  },
  {
    key: 'eudora-vale',
    datasetPath: 'packages/bundled/eudora-vale/eudora-vale-senior-staff.crew-dataset.json',
    biblePath: 'content/campaigns/eudora-vale/crew/EUDORA_VALE_SENIOR_STAFF_CHARACTER_BIBLE.md',
    themes: {
      title: 'Eudora Vale / Broken Accord',
      settingNoun: 'the lattice',
      pressureNoun: 'Nacre access',
      sceneNoun: 'Rhee no longer stands beside them',
      moralEngine: 'known-crew memory, water allocation, public disclosure, and the burden of succession',
      moralQuestion: 'whether water access can be repaired without another quiet bargain',
      commandCulture: 'a familiar crew testing what the former XO becomes when captaincy is no longer theoretical',
      privateFear: 'loyalty to Rhee will become a substitute for accountable command in the present'
    }
  },
  {
    key: 'aster-vale',
    datasetPath: 'packages/bundled/aster-vale/aster-vale-senior-staff.crew-dataset.json',
    biblePath: 'content/campaigns/aster-vale/crew/ASTER_VALE_SENIOR_STAFF_CHARACTER_BIBLE.md',
    themes: {
      title: 'Aster Vale / Unseen Border',
      settingNoun: 'the Lacuna',
      pressureNoun: 'the redacted routes',
      sceneNoun: 'the protected crossing fails',
      moralEngine: 'border relationships, lawful protection, redacted charts, and local custom under inquiry',
      moralQuestion: 'whether protection can survive without becoming erasure',
      commandCulture: 'a border-ship culture loyal to Kellan but forced to test the new XO against hidden maps and local obligations',
      privateFear: 'the officer will mistake secrecy for care or exposure for courage'
    }
  },
  {
    key: 'celandine',
    datasetPath: 'packages/bundled/celandine/celandine-senior-staff.crew-dataset.json',
    biblePath: 'content/campaigns/celandine/crew/CELANDINE_SENIOR_STAFF_CHARACTER_BIBLE.md',
    themes: {
      title: "Celandine / Enemy's Garden",
      settingNoun: 'the K-17 transition',
      pressureNoun: 'the harvest',
      sceneNoun: 'the relief schedule slips',
      moralEngine: 'relief ethics, quarantine succession, local institutions, and dependency without abandonment',
      moralQuestion: 'whether relief can end dependency without abandoning people mid-harvest',
      commandCulture: 'a relief-ship culture where competence is measured by what remains working after Starfleet leaves',
      privateFear: 'a life-saving intervention will become a permanent instrument of dependency'
    },
    normalizePlayerBoundary: true
  }
];

const DOMAINS = {
  command: {
    label: 'command',
    lane: 'command',
    fieldFrame: 'lawful authority, succession, and public consequence',
    ensembleRole: 'sets command weather for the ship without turning every discussion into a loyalty test',
    coreNeed: 'authority must be answerable after the emergency ends',
    professionalNeed: 'command is a service obligation rather than a performance of certainty',
    blindSpot: 'can carry too much cost privately and confuse restraint with protection',
    blindSpotShort: 'the clean command answer',
    demeanor: 'controlled and attentive',
    warmth: 'specific trust, remembered details, and small private invitations back into the room',
    offDutyHabit: 'walk the quiet decks and make a private note about who looked less tired',
    artifact: 'decision record',
    workNoun: 'log',
    ordinaryComfort: 'the second-best tea from the ready room',
    colleaguePlural: 'the senior staff',
    avoid: ['generic wise captain', 'icy procedural authority', 'monologue-first leadership']
  },
  science: {
    label: 'science',
    lane: 'science',
    fieldFrame: 'measurement, inference, uncertainty, and the ethics of public knowledge',
    ensembleRole: 'keeps the room honest about what is measured, what is inferred, and what is being wished into certainty',
    coreNeed: 'truth has to remain useful without becoming reckless',
    professionalNeed: 'uncertainty is recorded before it is politically domesticated',
    blindSpot: 'can make the clean model sound more patient than the people waiting on it',
    blindSpotShort: 'the elegant model',
    demeanor: 'precise and intent',
    warmth: 'teaching the uncertainty instead of weaponizing it, and noticing when someone finally asks the better question',
    offDutyHabit: 're-label a messy data set until it stops irritating them',
    artifact: 'model',
    workNoun: 'confidence band',
    ordinaryComfort: 'the calibration notes and a mug that has seen better labs',
    colleaguePlural: 'the models',
    avoid: ['truth-machine scientist', 'condescending exposition engine', 'certainty as a personality']
  },
  engineering: {
    label: 'engineering',
    lane: 'engineering',
    fieldFrame: 'repair debt, fabrication limits, heat, stress, and practical consequence',
    ensembleRole: 'turns moral promises into the hours, parts, people, and failure margins they actually require',
    coreNeed: 'a repair that cannot be maintained is only a delayed failure',
    professionalNeed: 'technical debt must be named before command spends it',
    blindSpot: 'can make sustainability sound like refusal when they are actually trying to keep future options alive',
    blindSpotShort: 'the tidy load path',
    demeanor: 'dry and concrete',
    warmth: 'showing someone how the system works and making room for a junior fix that changes the plan',
    offDutyHabit: 'put the tool locker back in an order only they find soothing',
    artifact: 'repair schedule',
    workNoun: 'load path',
    ordinaryComfort: 'a lukewarm cup balanced nowhere regulations would approve',
    colleaguePlural: 'the repair crews',
    avoid: ['miracle-worker engineer', 'complaint as the only trait', 'tech debt without human cost']
  },
  security: {
    label: 'security',
    lane: 'security',
    fieldFrame: 'threat paths, custody, force boundaries, and civilian protection',
    ensembleRole: 'names what a hostile actor can do without pretending every civilian is already hostile',
    coreNeed: 'protection must remain accountable while danger is still real',
    professionalNeed: 'rules must still work during the worst watch',
    blindSpot: 'can trust a hardened boundary more quickly than a fragile relationship',
    blindSpotShort: 'the hardened boundary',
    demeanor: 'spare and operational',
    warmth: 'consistent protection, clean apologies after overreach, and private respect for people who hold a line well',
    offDutyHabit: 'rewrite the watch bill so the tired people stop being invisible',
    artifact: 'threat path',
    workNoun: 'custody chain',
    ordinaryComfort: 'the watch board and coffee strong enough to make it legal',
    colleaguePlural: 'the watchstanders',
    avoid: ['reflexive militarist', 'threat theater', 'suspicion without proportionality']
  },
  medical: {
    label: 'medical',
    lane: 'medical',
    fieldFrame: 'triage, consent, chronic harm, and medical independence',
    ensembleRole: 'keeps the body count, patient autonomy, and long-term damage inside the command conversation',
    coreNeed: 'a saved life cannot be treated as an administrative inconvenience afterward',
    professionalNeed: 'patient welfare is operational fact, not sentimental delay',
    blindSpot: 'can make necessary limits sound colder than the care behind them',
    blindSpotShort: 'the guarded diagnosis',
    demeanor: 'quiet and difficult to deflect',
    warmth: 'remembering patient details, protecting consent, and making tired people sit down before they collapse',
    offDutyHabit: 'inventory the small comforts sickbay keeps unofficially',
    artifact: 'triage board',
    workNoun: 'consent line',
    ordinaryComfort: 'sickbay tea that tastes better than it looks',
    colleaguePlural: 'the medics',
    avoid: ['saintly doctor', 'moral lecture as default', 'diagnosis replacing character']
  },
  operations: {
    label: 'operations',
    lane: 'operations',
    fieldFrame: 'dependencies, schedule ownership, access, and implementation',
    ensembleRole: 'turns command intent into named owners, visible bottlenecks, and consequences that can be tracked',
    coreNeed: 'a promise without capacity is only a future breach',
    professionalNeed: 'implementation has an owner before the room treats it as decided',
    blindSpot: 'can sound like they are protecting the schedule when they are protecting people from impossible orders',
    blindSpotShort: 'the clean dependency chart',
    demeanor: 'compressed and practical',
    warmth: 'quietly clearing a path for someone else to succeed and remembering who has been carrying extra load',
    offDutyHabit: 'rebuild the shift board with unnecessary precision',
    artifact: 'allocation plan',
    workNoun: 'dependency chart',
    ordinaryComfort: 'a ration bar split with whoever missed dinner',
    colleaguePlural: 'the duty leads',
    avoid: ['bureaucrat caricature', 'schedule as personality', 'competence without emotional texture']
  },
  flight: {
    label: 'flight',
    lane: 'flight',
    fieldFrame: 'routes, margins, practiced memory, and embodied risk',
    ensembleRole: 'makes distance, timing, and ship handling felt as choices rather than map labels',
    coreNeed: 'skill should expand command options without becoming an exemption from judgment',
    professionalNeed: 'the route is understood as lived practice, not just coordinates',
    blindSpot: 'can defend the maneuver when the real wound is whether command trusts their judgment',
    blindSpotShort: 'the beautiful approach',
    demeanor: 'loose until danger sharpens them',
    warmth: 'sharing route lore, giving junior pilots credit, and making fear breathable with one quick aside',
    offDutyHabit: 'fly the route again in simulation and pretend it was recreation',
    artifact: 'approach vector',
    workNoun: 'flight margin',
    ordinaryComfort: 'a sim log with too many personal annotations',
    colleaguePlural: 'the helm team',
    avoid: ['reckless pilot caricature', 'constant swagger', 'skill without accountability']
  },
  deck: {
    label: 'deck',
    lane: 'operations',
    fieldFrame: 'hatches, cargo, frightened passengers, watches, and physical implementation',
    ensembleRole: 'shows command what an order looks like at the hatch, in the hold, and after the fourth bad hour',
    coreNeed: 'orders have to survive contact with tired hands and real corridors',
    professionalNeed: 'the people enforcing policy are not treated as furniture',
    blindSpot: 'can turn practical skepticism into a wall before command has finished explaining',
    blindSpotShort: 'the corridor-level answer',
    demeanor: 'plainspoken and dryly humane',
    warmth: 'knowing names, finding blankets, and turning discipline into steadiness instead of fear',
    offDutyHabit: 'walk the cargo lanes and fix three small problems nobody put on a list',
    artifact: 'watch bill',
    workNoun: 'hatch plan',
    ordinaryComfort: 'the deck kettle and a mug that outranks several officers by seniority',
    colleaguePlural: 'the deck crews',
    avoid: ['gruff enlisted stereotype', 'comic relief only', 'practicality without moral intelligence']
  },
  counsel: {
    label: 'counsel',
    lane: 'medical',
    fieldFrame: 'trust, testimony, consent, negotiation, and emotional consequence',
    ensembleRole: 'keeps the room aware of what fear, pride, grief, and public legitimacy are doing to the facts',
    coreNeed: 'truth lands differently depending on who is safe enough to hear it',
    professionalNeed: 'trust must be built as deliberately as any technical system',
    blindSpot: 'can overestimate what careful language can repair once harm is already public',
    blindSpotShort: 'the careful room',
    demeanor: 'patient and perceptive',
    warmth: 'offering choices, remembering boundaries, and letting silence do work without making it punitive',
    offDutyHabit: 'make a private note about who finally stopped performing strength',
    artifact: 'trust map',
    workNoun: 'consent boundary',
    ordinaryComfort: 'the quiet cup nobody has to explain',
    colleaguePlural: 'the negotiators',
    avoid: ['mind-reader counselor', 'softness without rigor', 'therapy-speak as a substitute for voice']
  }
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(path.resolve(root, filePath), `${JSON.stringify(value, null, 2)}\n`);
}

function readText(filePath) {
  return fs.readFileSync(path.resolve(root, filePath), 'utf8');
}

function writeText(filePath, value) {
  fs.writeFileSync(path.resolve(root, filePath), value);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sentence(value) {
  const text = compact(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function stripGeneratedProfile(value) {
  return compact(value).replace(/\s+In ensemble play, .+$/u, '').trim();
}

function stripGeneratedVoice(value) {
  return compact(value).replace(/\s+Use the voice capsule to blend role pressure, warmth, flaw, ordinary life, and crew banter\.?$/u, '').trim();
}

function stripGeneratedRelationship(value) {
  return compact(value).replace(/^Relationship texture: .*?not empty approval\.\s*/u, '').trim();
}

function stripGeneratedDevelopment(value) {
  return compact(value).replace(/^Development vector: .*?after the cost becomes visible\.\s*/u, '').trim();
}

function stripGeneratedReveal(value) {
  const text = compact(value);
  return text.startsWith('Private pressure:') ? '' : text;
}

function stripGeneratedStyle(value, officerName) {
  const text = compact(value);
  return text.startsWith(`${officerName} responds to player command style through`) ? '' : text;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function addUnique(list, value) {
  if (!list.includes(value)) {
    list.push(value);
  }
}

function domainForOfficer(officer) {
  const billet = String(officer.billet || '').toLowerCase();
  if (billet.includes('counselor') || billet.includes('diplomatic')) return DOMAINS.counsel;
  if (billet.includes('medical') || billet.includes('physician') || billet.includes('public-health')) return DOMAINS.medical;
  if (billet.includes('tactical') || billet.includes('security')) return DOMAINS.security;
  if (billet.includes('flight') || billet.includes('pilot') || billet.includes('helm')) return DOMAINS.flight;
  if (billet.includes('engineer')) return DOMAINS.engineering;
  if (billet.includes('science') || billet.includes('cartographer') || billet.includes('climatologist') || billet.includes('xenobotanist') || billet.includes('subspace')) return DOMAINS.science;
  if (billet.includes('deck') || billet.includes('chief of the boat') || billet.includes('cargo') || billet.includes('enlisted')) return DOMAINS.deck;
  if (billet.includes('operations') || billet.includes('second officer') || billet.includes('coordinator')) return DOMAINS.operations;
  if (billet.includes('commanding') || billet.includes('captain')) return DOMAINS.command;
  return DOMAINS.operations;
}

function cardsForOfficer(dataset, officerId) {
  return ensureArray(dataset.cards).filter((card) => ensureArray(card.scope?.characters).includes(officerId));
}

function cardByType(cards, type) {
  return cards.find((card) => card.type === type) || null;
}

function sourceRef(campaign, officer) {
  return {
    document: campaign.biblePath,
    refs: ['Rich Character Expansion Addendum', officer.name]
  };
}

function ensureGates(card, playerKnowledge) {
  card.gates = {
    playerKnowledge,
    relationshipMin: card.gates?.relationshipMin ?? null,
    developmentMin: card.gates?.developmentMin ?? null,
    requiresRevealedFactIds: ensureArray(card.gates?.requiresRevealedFactIds),
    blocksUntilFactIds: ensureArray(card.gates?.blocksUntilFactIds),
    requiresOutcomeIds: ensureArray(card.gates?.requiresOutcomeIds)
  };
}

function ensurePayloadBase(card, narratorSafe) {
  card.payload = card.payload || {};
  card.payload.summary = sentence(card.payload.summary || 'Character guidance.');
  card.payload.constraints = ensureArray(card.payload.constraints);
  card.payload.narratorSafe = card.audiences?.includes('narrator') ? true : narratorSafe;
  card.payload.stateRefs = ensureArray(card.payload.stateRefs);
  card.payload.effects = ensureArray(card.payload.effects);
}

function addConstraint(card, text) {
  card.payload.constraints = ensureArray(card.payload.constraints);
  addUnique(card.payload.constraints, text);
}

function addStateRef(card, text) {
  card.payload.stateRefs = ensureArray(card.payload.stateRefs);
  addUnique(card.payload.stateRefs, text);
}

function addEffect(card, text) {
  card.payload.effects = ensureArray(card.payload.effects);
  addUnique(card.payload.effects, text);
}

function buildLineShapes(campaign, domain) {
  return [
    {
      id: 'recommendation-with-caveat',
      situation: `giving a domain recommendation when pressure around ${campaign.pressureNoun} is politically loaded`,
      shape: `I can give you the clean ${domain.artifact}, but it won't answer who carries the cost after ${campaign.sceneNoun}.`,
      bibleAxes: ['role-pressure', 'relationship-mode', 'moral-engine']
    },
    {
      id: 'private-ease-before-hard-work',
      situation: 'making a trusted conversation feel human before disagreement',
      shape: `I brought ${domain.ordinaryComfort}; if we're going to argue about ${campaign.pressureNoun}, we might as well do it awake.`,
      bibleAxes: ['warmth', 'ordinary-life', 'humor']
    },
    {
      id: 'crew-banter-with-purpose',
      situation: 'letting banter carry tension without erasing the work',
      shape: "Well, if I get a vote, mine is that we stop pretending the easy option is quiet.",
      bibleAxes: ['humor', 'relationship-mode', 'ordinary-life']
    },
    {
      id: 'flaw-owned-in-trust',
      situation: 'admitting a personal bias during a private debrief',
      shape: `I know I'm pushing for ${domain.blindSpotShort}, and I know that can sound like I'm protecting my desk more than the people.`,
      bibleAxes: ['flaw', 'relationship-mode', 'warmth']
    },
    {
      id: 'stress-triage',
      situation: 'narrowing a crisis conversation without becoming robotic',
      shape: 'Slow down. Give me the part that breaks first, then give me the part we can still save.',
      bibleAxes: ['role-pressure', 'stress-shift', 'moral-engine']
    },
    {
      id: 'ordinary-life-release',
      situation: 'showing off-duty texture after a difficult watch',
      shape: `After watch, I'm going to ${domain.offDutyHabit}, because apparently that's how I convince my brain we're not still on duty.`,
      bibleAxes: ['ordinary-life', 'warmth']
    },
    {
      id: 'self-correction-under-pressure',
      situation: 'catching their own tendency before it distorts a recommendation',
      shape: "The flaw in my plan isn't courage; it's that I keep making the same risk look tidy.",
      bibleAxes: ['flaw', 'stress-shift', 'moral-engine']
    },
    {
      id: 'relationship-boundary',
      situation: 'asking the player to hear the person behind the data',
      shape: `You don't need to agree with me, but I need to know whether you heard the person my ${domain.workNoun} doesn't include.`,
      bibleAxes: ['relationship-mode', 'warmth', 'role-pressure']
    },
    {
      id: 'campaign-moral-engine',
      situation: 'naming the campaign-scale moral pressure in natural speech',
      shape: `The thing I keep coming back to is ${campaign.moralQuestion}, and that doesn't fit neatly in a report.`,
      bibleAxes: ['moral-engine', 'ordinary-life']
    },
    {
      id: 'dry-pressure-humor',
      situation: 'using humor to keep the room moving after a blunt command choice',
      shape: "That's not my favorite sentence you've said today, Commander, but it is a useful one.",
      bibleAxes: ['stress-shift', 'humor', 'role-pressure']
    }
  ];
}

function buildVoiceCapsule(campaign, officer, cards, domain) {
  const themes = campaign.themes || campaign;
  const voiceCard = cardByType(cards, 'crew.voice');
  const profileCard = cardByType(cards, 'crew.profile');
  const existingVoice = stripGeneratedVoice(voiceCard?.payload?.summary);
  const publicFrame = stripGeneratedProfile(profileCard?.payload?.summary);
  return {
    coreEngine: `${officer.name} tries to make ${domain.fieldFrame} serve ${themes.moralEngine}. Their judgment is driven by the belief that ${domain.coreNeed}.`,
    contradiction: `${officer.name}'s strength is also their blind spot: they ${domain.blindSpot}. The public presentation is ${domain.demeanor}, but their care appears through ${domain.warmth}.`,
    speechMechanics: unique([
      existingVoice ? `Start from the existing voice note: ${existingVoice}` : null,
      `Speaks through ${domain.artifact}, ${domain.workNoun}, and concrete consequences instead of abstract theme language.`,
      "Uses contractions and connective tissue in trusted conversation; pressure makes the sentences shorter, not lifeless.",
      `Lets disagreement carry ${domain.fieldFrame} without reducing every line to a command objection.`
    ]),
    pressureShift: [
      `Under pressure, ${officer.name} narrows to ${domain.artifact}, immediate harm, and who must own the next action.`,
      `When personally implicated, they can overcorrect toward ${domain.blindSpotShort} before trust or evidence loosens the grip.`,
      `If the player names the cost directly, they become more candid and less performative about their domain.`
    ],
    warmthHumor: [
      `Warmth shows through ${domain.warmth}.`,
      `Banter should sound like working relief among people who know the stakes, not a pasted joke or catchphrase.`,
      `Private ease can include ${domain.ordinaryComfort}, ${domain.offDutyHabit}, and small acknowledgments of fatigue.`
    ],
    physicalTells: [
      `Attention returns to ${domain.artifact} or ${domain.workNoun} when the room starts pretending the issue is simpler than it is.`,
      `Their posture softens when someone names the human consequence before the procedural convenience.`,
      `Ordinary-life texture: ${domain.offDutyHabit}.`
    ],
    exampleLineShapes: buildLineShapes(themes, domain),
    avoid: unique([
      ...domain.avoid,
      'single-trait billet voice',
      'all command-pressure examples',
      'warmth as automatic agreement',
      'hidden exposition in narrator-safe speech'
    ])
  };
}

function buildGeneratedGuidance(campaign, officer, cards, domain) {
  const profile = cardByType(cards, 'crew.profile');
  const relationship = cardByType(cards, 'crew.relationship');
  const development = cardByType(cards, 'crew.development');
  const reveal = cardByType(cards, 'crew.reveal');
  const style = cardByType(cards, 'command.styleReaction');
  const publicSummary = stripGeneratedProfile(profile?.payload?.summary);
  const relationshipSummary = stripGeneratedRelationship(relationship?.payload?.summary);
  const developmentSummary = stripGeneratedDevelopment(development?.payload?.summary);
  const revealSummary = stripGeneratedReveal(reveal?.payload?.summary);
  const styleSummary = stripGeneratedStyle(style?.payload?.summary, officer.name);

  return {
    profile: `${publicSummary} In ensemble play, ${officer.name} ${domain.ensembleRole} inside ${campaign.themes.commandCulture}.`,
    relationship: `Relationship texture: ${officer.name} gains professional confidence when the player names owners, cost, and uncertainty in their domain; integrity trust rises when ugly facts are logged before they become convenient; personal rapport grows through specific respect, not empty approval. ${relationshipSummary}`,
    reveal: revealSummary || `Private pressure: ${officer.name} fears ${campaign.themes.privateFear}, especially when their own blind spot could make the problem look cleaner than it is. Keep this behind high-trust conversation, crisis disclosure, or evidence that makes the pressure causal.`,
    development: `Development vector: ${officer.name} can grow when the player gives them accountable authority, hears dissent without turning it into disloyalty, and follows through after the cost becomes visible. ${developmentSummary}`,
    style: styleSummary || `${officer.name} responds to player command style through ${domain.fieldFrame}: they support decisions that state cost, ownership, and lawful limits; they resist shortcuts that turn ${campaign.themes.moralEngine} into a mood rather than an accountable order.`
  };
}

function updateVoiceCard(card, campaign, officer, cards, domain) {
  card.source = sourceRef(campaign, officer);
  ensurePayloadBase(card, true);
  card.payload.summary = sentence(`${stripGeneratedVoice(card.payload.summary)} Use the voice capsule to blend role pressure, warmth, flaw, ordinary life, and crew banter.`);
  addConstraint(card, 'Use line shapes as examples of rhythm and personality coverage, not mandatory quotes.');
  addConstraint(card, 'Do not reduce the officer to a cold job function or make every line a command objection.');
  card.payload.voiceCapsule = buildVoiceCapsule(campaign, officer, cards, domain);
  addStateRef(card, `crew.${officer.id}`);
}

function updateProfileCard(card, campaign, officer, cards, domain, guidance) {
  card.source = sourceRef(campaign, officer);
  ensurePayloadBase(card, true);
  card.payload.summary = sentence(guidance.profile);
  addConstraint(card, 'Use as service-record-safe characterization, not as full private biography.');
  addConstraint(card, 'Do not write the player character voice, values, feelings, or decisions.');
  addStateRef(card, `crew.${officer.id}`);
}

function updateRelationshipCard(card, campaign, officer, cards, domain, guidance) {
  card.source = sourceRef(campaign, officer);
  ensurePayloadBase(card, card.audiences?.includes('narrator') ? true : false);
  card.payload.summary = sentence(guidance.relationship);
  addConstraint(card, 'Track professional confidence, integrity trust, and personal rapport separately.');
  addConstraint(card, 'Do not expose raw relationship values or private reveal material in narrator packets.');
  addStateRef(card, `relationships.${officer.id}`);
  addEffect(card, 'may_change_relationship.professionalConfidence');
  addEffect(card, 'may_change_relationship.integrityTrust');
  addEffect(card, 'may_change_relationship.personalRapport');
}

function updateRevealCard(card, campaign, officer, cards, domain, guidance) {
  card.source = sourceRef(campaign, officer);
  card.visibility = card.visibility === 'lockedHidden' ? 'lockedHidden' : 'directorOnly';
  card.audiences = unique([...ensureArray(card.audiences), 'crewDirector', 'missionDirector']).filter((audience) => audience !== 'narrator' && audience !== 'commandLog');
  ensureGates(card, ['none', 'serviceRecord', 'professionalConversation'].includes(card.gates?.playerKnowledge) ? 'highTrust' : card.gates?.playerKnowledge || 'highTrust');
  ensurePayloadBase(card, false);
  card.payload.narratorSafe = false;
  card.payload.summary = sentence(guidance.reveal);
  addConstraint(card, 'Director-only until an authored gate, evidence trigger, high-trust conversation, or crisis disclosure justifies it.');
  addConstraint(card, 'Never reveal through narrator convenience or first-scene exposition.');
  addStateRef(card, `crewDevelopment.${officer.id}.personalArcProgress`);
  addStateRef(card, 'revealedCards');
  addEffect(card, `may_unlock_private_scene.${officer.id}`);
}

function updateDevelopmentCard(card, campaign, officer, cards, domain, guidance) {
  card.source = sourceRef(campaign, officer);
  ensurePayloadBase(card, false);
  card.payload.narratorSafe = false;
  card.payload.summary = sentence(guidance.development);
  addConstraint(card, 'Change development only through committed observable events, not because the conversation sounded friendly.');
  addConstraint(card, 'Useful disagreement can advance development when it clarifies cost, authority, or trust.');
  addStateRef(card, `crewDevelopment.${officer.id}.operationalExperience`);
  addStateRef(card, `crewDevelopment.${officer.id}.playerMentorship`);
  addStateRef(card, `crewDevelopment.${officer.id}.personalArcProgress`);
  addEffect(card, 'can_award_development.operationalExperience');
  addEffect(card, 'can_award_development.playerMentorship');
  addEffect(card, 'can_award_development.personalArcProgress');
}

function updateStyleCard(card, campaign, officer, cards, domain, guidance) {
  card.source = sourceRef(campaign, officer);
  card.visibility = 'directorOnly';
  card.audiences = unique([...ensureArray(card.audiences), 'crewDirector', 'missionDirector', 'commandDirector']).filter((audience) => audience !== 'narrator');
  ensureGates(card, ['serviceRecord', 'highTrust', 'crisisDisclosure', 'revealed'].includes(card.gates?.playerKnowledge) ? 'professionalConversation' : card.gates?.playerKnowledge || 'professionalConversation');
  ensurePayloadBase(card, false);
  card.payload.narratorSafe = false;
  card.payload.summary = sentence(guidance.style);
  addConstraint(card, 'Ground every reaction in a committed player action or repeated command pattern.');
  addConstraint(card, 'Do not use this as a generic approval meter.');
  addStateRef(card, `relationships.${officer.id}`);
  addStateRef(card, 'mission.captainIntent');
  addEffect(card, 'may_classify_action.commandStyle');
  addEffect(card, 'may_change_directive_pressure');
}

function createCard({ campaign, dataset, officer, profileCard, type, title, visibility, audiences, playerKnowledge, lanes, keywords, priority, payloadSummary }) {
  return {
    id: `crew.${officer.id}.${type === 'command.styleReaction' ? 'style-reaction' : type.replace('crew.', '')}`,
    type,
    title,
    datasetId: dataset.manifest.id,
    source: sourceRef(campaign, officer),
    visibility,
    audiences,
    scope: {
      ...clone(profileCard?.scope || {}),
      characters: [officer.id]
    },
    gates: {
      playerKnowledge,
      relationshipMin: null,
      developmentMin: null,
      requiresRevealedFactIds: [],
      blocksUntilFactIds: [],
      requiresOutcomeIds: []
    },
    retrieval: {
      lanes,
      keywords: unique([officer.name, officer.billet, ...keywords]),
      priority
    },
    payload: {
      summary: payloadSummary,
      constraints: [],
      narratorSafe: audiences.includes('narrator'),
      stateRefs: [`crew.${officer.id}`],
      effects: []
    }
  };
}

function ensureMissingCards(campaign, dataset, officer, cards, domain, guidance) {
  const profileCard = cardByType(cards, 'crew.profile');
  if (!cardByType(cards, 'crew.reveal')) {
    const card = createCard({
      campaign,
      dataset,
      officer,
      profileCard,
      type: 'crew.reveal',
      title: `${officer.name} reveal ladder`,
      visibility: 'directorOnly',
      audiences: ['crewDirector', 'missionDirector'],
      playerKnowledge: 'highTrust',
      lanes: ['crew_reveal', domain.lane],
      keywords: [campaign.themes.settingNoun, campaign.themes.pressureNoun, 'reveal ladder'],
      priority: 'high',
      payloadSummary: guidance.reveal
    });
    dataset.cards.push(card);
    cards.push(card);
  }
  if (!cardByType(cards, 'command.styleReaction')) {
    const card = createCard({
      campaign,
      dataset,
      officer,
      profileCard,
      type: 'command.styleReaction',
      title: `${officer.name} command style reaction`,
      visibility: 'directorOnly',
      audiences: ['crewDirector', 'missionDirector', 'commandDirector'],
      playerKnowledge: 'professionalConversation',
      lanes: ['command_style', 'crew_reaction', domain.lane],
      keywords: [campaign.themes.moralEngine, 'command style', 'player command'],
      priority: 'normal',
      payloadSummary: guidance.style
    });
    dataset.cards.push(card);
    cards.push(card);
  }
}

function updateOfficerCards(campaign, dataset, officer) {
  const domain = domainForOfficer(officer);
  const cards = cardsForOfficer(dataset, officer.id);
  const guidance = buildGeneratedGuidance(campaign, officer, cards, domain);

  officer.requiredCardTypes = [...FOUNDATIONAL_CARD_TYPES];
  ensureMissingCards(campaign, dataset, officer, cards, domain, guidance);

  const byType = new Map(cardsForOfficer(dataset, officer.id).map((card) => [card.type, card]));
  updateProfileCard(byType.get('crew.profile'), campaign, officer, cards, domain, guidance);
  updateVoiceCard(byType.get('crew.voice'), campaign, officer, cards, domain);
  updateRelationshipCard(byType.get('crew.relationship'), campaign, officer, cards, domain, guidance);
  updateRevealCard(byType.get('crew.reveal'), campaign, officer, cards, domain, guidance);
  updateDevelopmentCard(byType.get('crew.development'), campaign, officer, cards, domain, guidance);
  updateStyleCard(byType.get('command.styleReaction'), campaign, officer, cards, domain, guidance);
}

function ensureSources(dataset) {
  for (const source of dataset.sources || []) {
    if (/Character Bible/i.test(source.title) && !source.role) source.role = 'crew-source';
    if (/Crew Dataset Contract/i.test(source.title) && !source.role) source.role = 'dataset-contract';
  }
  if (!dataset.sources.some((source) => source.path === 'docs/packages/CREW_DATASET_RICH_CHARACTER_DESIGN.md')) {
    dataset.sources.push({
      title: 'Crew Dataset Rich Character Design',
      path: 'docs/packages/CREW_DATASET_RICH_CHARACTER_DESIGN.md',
      role: 'dataset-design'
    });
  }
}

function normalizeDimensions(dataset) {
  for (const collection of [dataset.relationshipDimensions, dataset.developmentDimensions]) {
    for (const dimension of collection || []) {
      if (!dimension.label && dimension.title) {
        dimension.label = dimension.title;
      }
      delete dimension.title;
    }
  }
}

function rebuildIndexes(dataset) {
  const officerOrder = new Map(dataset.officers.map((officer, index) => [officer.id, index]));
  const typeOrder = new Map(FOUNDATIONAL_CARD_TYPES.map((type, index) => [type, index]));
  dataset.cards.sort((left, right) => {
    const leftOfficer = ensureArray(left.scope?.characters).find((id) => officerOrder.has(id)) || '';
    const rightOfficer = ensureArray(right.scope?.characters).find((id) => officerOrder.has(id)) || '';
    const officerDelta = (officerOrder.get(leftOfficer) ?? 999) - (officerOrder.get(rightOfficer) ?? 999);
    if (officerDelta !== 0) return officerDelta;
    const typeDelta = (typeOrder.get(left.type) ?? 999) - (typeOrder.get(right.type) ?? 999);
    if (typeDelta !== 0) return typeDelta;
    return left.id.localeCompare(right.id);
  });

  const byOfficer = Object.fromEntries(dataset.officers.map((officer) => [officer.id, []]));
  const byType = {};
  const byAudience = {};
  const byRevealGate = {};

  for (const card of dataset.cards) {
    for (const officerId of ensureArray(card.scope?.characters)) {
      if (byOfficer[officerId]) addUnique(byOfficer[officerId], card.id);
    }
    byType[card.type] = byType[card.type] || [];
    addUnique(byType[card.type], card.id);
    for (const audience of ensureArray(card.audiences)) {
      byAudience[audience] = byAudience[audience] || [];
      addUnique(byAudience[audience], card.id);
    }
    const gate = card.gates?.playerKnowledge || 'none';
    byRevealGate[gate] = byRevealGate[gate] || [];
    addUnique(byRevealGate[gate], card.id);
  }

  dataset.indexes = { byOfficer, byType, byAudience, byRevealGate };
}

function normalizeCelandinePlayerBoundary(text) {
  const start = text.indexOf('## Commander Player Commander');
  const next = text.indexOf('## Lieutenant Commander Rinn Sorell', start);
  if (start === -1 || next === -1 || next <= start) {
    return text;
  }
  const replacement = [
    '## Player Commander Authority Boundary',
    '',
    'The player character is the newly assigned Executive Officer and Acting Captain once Dorel is quarantined. This is an authority boundary, not an authored personality record.',
    '',
    'Do not supply the player character with fixed voice, values, interiority, fears, off-duty habits, or emotional reactions. Campaign data may define lawful authority, command responsibilities, information access, relationship dimensions, and consequences that respond to player choices.',
    ''
  ].join('\n');
  return `${text.slice(0, start).trimEnd()}\n\n${replacement}\n${text.slice(next)}`;
}

function markdownLineShape(line) {
  return `- ${line.situation}: "${line.shape}" (${line.bibleAxes.join(', ')})`;
}

function buildOfficerAddendum(campaign, dataset, officer) {
  const domain = domainForOfficer(officer);
  const cards = cardsForOfficer(dataset, officer.id);
  const guidance = buildGeneratedGuidance(campaign, officer, cards, domain);
  const capsule = buildVoiceCapsule(campaign, officer, cards, domain);
  const development = cardByType(cards, 'crew.development')?.payload?.summary || '';
  const relationship = cardByType(cards, 'crew.relationship')?.payload?.summary || '';
  const reveal = cardByType(cards, 'crew.reveal')?.payload?.summary || guidance.reveal;

  return [
    `### ${officer.name} - ${officer.billet}`,
    '',
    `**Dataset ID:** \`${officer.id}\`  `,
    `**Domain:** ${domain.label}  `,
    `**At-a-glance identity:** ${sentence(guidance.profile)}`,
    '',
    `**Role in the ensemble:** ${sentence(domain.ensembleRole)} In ${campaign.themes.title}, they put pressure on ${campaign.themes.commandCulture}.`,
    '',
    `**Formative pressure:** ${sentence(reveal)}`,
    '',
    `**Core engine:** ${capsule.coreEngine}`,
    '',
    `**Central contradiction:** ${capsule.contradiction}`,
    '',
    `**Default demeanor and values:** ${officer.name} is ${domain.demeanor} and values ${domain.fieldFrame}. They should bring ${domain.coreNeed} into scenes without turning that value into a slogan.`,
    '',
    `**Strengths:** ${officer.name} can make ${domain.artifact}, ${domain.workNoun}, and domain limits legible under pressure. They are useful because they can disagree without trying to own the whole campaign.`,
    '',
    `**Blind spots:** ${sentence(domain.blindSpot)} This flaw should complicate scenes without making the officer a caricature or generic obstacle.`,
    '',
    `**Stress behavior:** ${capsule.pressureShift.join(' ')}`,
    '',
    `**Warmth, humor, and ordinary life:** ${capsule.warmthHumor.join(' ')}`,
    '',
    `**Physical tells:** ${capsule.physicalTells.join(' ')}`,
    '',
    `**Player relationship triggers:** ${sentence(relationship)} Trust rises through accountable delegation, candid records, and respect for domain expertise. Trust falls when the player hides cost, performs consultation, or turns dissent into disloyalty.`,
    '',
    `**Senior staff relationships:** Use ${officer.name} in banter and conflict around ${campaign.themes.pressureNoun}, ${domain.artifact}, and ${domain.workNoun}. They should have working familiarity with adjacent departments, not only one-on-one reactions to the player.`,
    '',
    `**Long-term character pressure:** ${sentence(development)} Let growth come from repeated player choices and mission consequence rather than automatic friendliness.`,
    '',
    '**Reveal ladder:** Service records can show billet, public competence, and visible demeanor. Professional conversation can show work habits and ordinary warmth. High-trust or crisis disclosure can expose the private pressure above. Never reveal hidden material through narrator convenience.',
    '',
    `**Voice guide:** ${capsule.speechMechanics.join(' ')}`,
    '',
    '**Example line shapes:**',
    ...capsule.exampleLineShapes.map(markdownLineShape),
    '',
    `**Dataset translation notes:** Keep \`crew.voice\` narrator-safe with a compact voice capsule. Keep \`crew.reveal\`, \`crew.development\`, and \`command.styleReaction\` director-only unless a future authored reveal explicitly changes audience safety.`,
    ''
  ].join('\n');
}

function replaceAddendum(text, addendum) {
  const start = text.indexOf(ADDENDUM_START);
  const end = text.indexOf(ADDENDUM_END);
  if (start !== -1 && end !== -1 && end > start) {
    return `${text.slice(0, start).trimEnd()}\n\n${addendum.trim()}\n`;
  }
  return `${text.trimEnd()}\n\n${addendum.trim()}\n`;
}

function updateBible(campaign, dataset) {
  let text = readText(campaign.biblePath);
  if (campaign.normalizePlayerBoundary) {
    text = normalizeCelandinePlayerBoundary(text);
  }
  const officerSections = dataset.officers.map((officer) => buildOfficerAddendum(campaign, dataset, officer)).join('\n');
  const addendum = [
    ADDENDUM_START,
    '',
    '## Rich Character Expansion Addendum',
    '',
    'This addendum raises the senior staff to the richer character-bible standard used for Ashes-caliber campaign authoring. It is structured for later dataset distillation: each officer has personality engine, contradiction, warmth, ordinary-life texture, relationship triggers, reveal discipline, and speakable line shapes.',
    '',
    'Line shapes are examples of rhythm, posture, and personality coverage. They are not mandatory quotes and should not be repeated mechanically.',
    '',
    officerSections,
    ADDENDUM_END,
    ''
  ].join('\n');
  writeText(campaign.biblePath, replaceAddendum(text, addendum));
}

function updateDataset(campaign, dataset) {
  ensureSources(dataset);
  normalizeDimensions(dataset);
  for (const officer of dataset.officers) {
    updateOfficerCards(campaign, dataset, officer);
  }
  rebuildIndexes(dataset);
}

for (const campaign of CAMPAIGNS) {
  const dataset = readJson(campaign.datasetPath);
  updateDataset(campaign, dataset);
  writeJson(campaign.datasetPath, dataset);
  updateBible(campaign, dataset);
  console.log(`Migrated ${campaign.themes.title}`);
}
