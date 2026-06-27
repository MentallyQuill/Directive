function compact(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export const STARFLEET_VOYAGER_UNIFORM_RULE = 'Starfleet Voyager-era uniform division colors: Command wears burgundy-red; Tactical, Operations, and Engineering wear mustard-yellow; Science wears teal; Medical wears blue.';

export const STARFLEET_VOYAGER_UNIFORM_COLORS = Object.freeze({
  command: 'burgundy-red',
  tactical: 'mustard-yellow',
  operations: 'mustard-yellow',
  engineering: 'mustard-yellow',
  science: 'teal',
  medical: 'blue'
});

function divisionFromText(value = '') {
  const text = compact(value).toLowerCase();
  if (!text) return null;
  if (/\bmedical\b|\bdoctor\b|\bchief medical officer\b|\bphysician\b/.test(text)) return 'medical';
  if (/\bscience\b|\bscientist\b|\bresearch\b|\bsensor analysis\b/.test(text)) return 'science';
  if (/\btactical\b|\bsecurity\b|\bweapons\b|\bshipboard defense\b/.test(text)) return 'tactical';
  if (/\bengineering\b|\bengineer\b|\bdamage control\b|\bsystems\b/.test(text)) return 'engineering';
  if (/\boperations\b|\bops\b|\blogistics\b|\bcoordination\b/.test(text)) return 'operations';
  if (/\bflight control\b|\bconn\b|\bhelm\b|\bpilot\b|\bcommanding officer\b|\bexecutive officer\b|\bfirst officer\b|\bcommand\b|\bcaptain\b/.test(text)) return 'command';
  return null;
}

export function inferStarfleetUniformDivision(officer = {}) {
  const explicit = divisionFromText([
    officer.uniformDivision,
    officer.division,
    officer.department
  ].filter(Boolean).join(' '));
  if (explicit) return explicit;
  return divisionFromText([
    officer.billet,
    officer.role,
    officer.packageRole
  ].filter(Boolean).join(' '));
}

export function starfleetUniformFactForCrew(officer = {}) {
  const division = inferStarfleetUniformDivision(officer);
  const color = division ? STARFLEET_VOYAGER_UNIFORM_COLORS[division] : null;
  if (!division || !color) return null;
  const name = compact([officer.rank, officer.name || officer.id].filter(Boolean).join(' ')) || compact(officer.name || officer.id || 'This officer');
  return {
    rule: 'voyager-era-starfleet-uniform-division-colors',
    division,
    color,
    summary: `${name} wears ${color} for the ${division} division under Voyager-era Starfleet uniform rules.`
  };
}
