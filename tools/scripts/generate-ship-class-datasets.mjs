import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim();
}

function unique(values = []) {
  return [...new Set(values.map(compact).filter(Boolean))];
}

function source(document, refs) {
  return { document, refs };
}

const serviceGate = {
  playerKnowledge: 'serviceRecord',
  requiresRevealedFactIds: [],
  blocksUntilFactIds: [],
  requiresOutcomeIds: []
};

function area({
  id,
  name,
  decks,
  zone,
  exteriorPlacement = '',
  functions,
  sceneUses,
  hardFacts,
  textures,
  constraints,
  keywords,
  systems = [],
  refs,
  summary
}) {
  return {
    id,
    name,
    decks,
    zone,
    exteriorPlacement,
    functions,
    sceneUses,
    hardFacts,
    textures,
    constraints,
    keywords,
    systems,
    refs,
    summary
  };
}

function system({
  id,
  name,
  scope,
  capability,
  dependencies,
  failureModes,
  sceneUses,
  keywords,
  refs,
  summary
}) {
  return {
    id,
    name,
    scope,
    capability,
    dependencies,
    failureModes,
    sceneUses,
    keywords,
    refs,
    summary
  };
}

const CLASSES = {
  steamrunner: {
    classId: 'steamrunner-class',
    classLabel: 'Steamrunner-class',
    document: 'Directive_Steamrunner_Class_Starship_Bible.md',
    sourceTitle: 'Directive Steamrunner-Class Starship Bible',
    sourcePath: 'docs/source/Directive_Steamrunner_Class_Starship_Bible.md',
    profileRefs: ['2. Class Personality', '9. Portrayal Principles'],
    exteriorRefs: ['3.1 Silhouette and first read', '3.2 Exterior zones'],
    shuttleRefs: ['3.3 Shuttle approach truth', '5.9 Aft-lower flight deck, Deck 13'],
    identity: {
      summary: 'A Steamrunner-class ship is a compact 2370s Starfleet escort, route-security, recovery, and tactical survey vessel whose tactical profile is most useful when it keeps movement lawful, mapped, supplied, and alive.',
      hardAnchors: [
        'Flattened irregular saucer and cowled nacelles.',
        'Main deflector is aft on a detached secondary-hull housing.',
        'Directive baseline places small-craft operations in an aft-lower service volume approached from astern and below.'
      ],
      textures: ['flattened hull', 'cowled nacelles', 'aft deflector glow', 'route displays', 'busy recovery traffic'],
      constraints: [
        'Do not give the class a generic forward deflector or Galaxy-style saucer layout.',
        'Do not make tactical credibility erase route, rescue, custody, and convoy tradeoffs.'
      ],
      avoid: ['Galaxy-class grandeur', 'Intrepid deck map by default', 'Defiant-style pure warship tone']
    },
    exterior: {
      summary: 'The Steamrunner exterior reads broad, flat, tactical, and workmanlike: embedded nacelles, inset bridge, aft deflector housing, service locks, and recovery-facing stern geometry.',
      hardAnchors: [
        'The bridge is inset forward between cowling structures.',
        'The aft deflector housing is a class-defining exterior feature.',
        'Stern geometry matters for towing, field work, and shuttle recovery.'
      ],
      textures: ['cowling shadows', 'aft service lights', 'shield arcs over a flattened hull', 'cargo locks', 'tractor-emitter status'],
      constraints: ['Exterior prose should respect the aft deflector and cowled nacelle geometry.']
    },
    areas: [
      area({
        id: 'steamrunner.bridge',
        name: 'Bridge',
        decks: [1],
        zone: 'Deck 1 inset forward command module',
        exteriorPlacement: 'Inset forward between cowling structures rather than raised on a saucer crown',
        functions: ['command', 'route decisions', 'convoy coordination', 'tactical control', 'recovery prioritization'],
        sceneUses: ['acting-command pressure', 'convoy clearance', 'recovery prioritization', 'battle arc assignment'],
        hardFacts: ['The bridge is inset into the forward hull geometry, not perched on a broad Galaxy-style saucer crown.'],
        textures: ['central command chairs', 'route overlays', 'aft tractor load display', 'forward conn', 'tactical arc status'],
        constraints: ['Bridge scenes should turn contested movement into accountable command decisions.'],
        keywords: ['bridge', 'conn', 'ops', 'tactical', 'viewscreen', 'convoy', 'route'],
        refs: ['5.1 Bridge, Deck 1'],
        summary: 'The Deck 1 bridge is the Steamrunner decision room where routes, shuttles, tractor loads, civilian traffic, and tactical arcs become one order.'
      }),
      area({
        id: 'steamrunner.command-support',
        name: 'Ready room and briefing room',
        decks: [1, 2],
        zone: 'Compact command support adjacent to or below the bridge',
        exteriorPlacement: 'Forward command structure near bridge access',
        functions: ['private command work', 'senior-staff synthesis', 'witness interviews', 'route policy'],
        sceneUses: ['private command judgment', 'formal briefing', 'route custody argument', 'inquiry preparation'],
        hardFacts: ['Command support rooms are compact and remain operationally close to the bridge.'],
        textures: ['working desk', 'secure wall display', 'briefing table', 'route-status terminal'],
        constraints: ['Private command scenes should stay connected to ship traffic, recovery calls, and route pressure.'],
        keywords: ['ready room', 'briefing room', 'conference', 'senior staff', 'private command'],
        refs: ['5.2 Ready room and briefing room, Decks 1-2'],
        summary: 'Command support spaces convert operational noise into private judgment and senior-staff synthesis.'
      }),
      area({
        id: 'steamrunner.wardroom',
        name: 'Wardroom, mess, and crew commons',
        decks: [3, 4],
        zone: 'Mid-forward primary-hull social spaces',
        exteriorPlacement: 'Primary hull crew volume',
        functions: ['meals', 'crew morale', 'informal diplomacy', 'survivor holding', 'after-action decompression'],
        sceneUses: ['civilian reassurance', 'crew fatigue', 'command rapport', 'post-mission aftermath'],
        hardFacts: ['The wardroom is a working commons, not a luxury lounge or Ten Forward duplicate.'],
        textures: ['compact tables', 'replicator alcoves', 'route-status chatter', 'tired recovery crews', 'survivor blankets'],
        constraints: ['Crowding should change the room before abstract morale does.'],
        keywords: ['wardroom', 'mess', 'crew commons', 'meal', 'morale', 'survivor'],
        refs: ['5.3 Wardroom, mess, and crew commons, Decks 3-4'],
        summary: 'The wardroom turns route policy, rescue outcomes, and crew fatigue into ordinary shipboard life.'
      }),
      area({
        id: 'steamrunner.sickbay',
        name: 'Sickbay and medical isolation',
        decks: [5],
        zone: 'Deck 5 protected medical suite',
        functions: ['medical care', 'quarantine', 'casualty sorting', 'survivor stabilization', 'forensic support'],
        sceneUses: ['recovery cost', 'contamination', 'triage ethics', 'command consequence'],
        hardFacts: ['Sickbay is protected from direct flight-deck exposure while remaining connected to transporter and cargo casualty routes.'],
        textures: ['biobeds', 'surgical bay', 'isolation rooms', 'decon room', 'overflow screens'],
        constraints: ['Medical capacity should expose limits; the ship cannot house every survivor or treat mass emergence alone.'],
        keywords: ['sickbay', 'medical', 'doctor', 'biobed', 'quarantine', 'triage', 'decon'],
        systems: ['steamrunner.small-craft-cargo-integration'],
        refs: ['5.4 Sickbay and medical isolation, Deck 5'],
        summary: 'Steamrunner sickbay turns route-security and recovery missions into bodies, quarantine risk, and triage math.'
      }),
      area({
        id: 'steamrunner.transporter-security',
        name: 'Transporter rooms, security, and armory',
        decks: [6],
        zone: 'Deck 6 movement and custody spine',
        functions: ['personnel transport', 'evidence transfer', 'security response', 'detention', 'arms accountability'],
        sceneUses: ['boarding risk', 'salvage law', 'refugee movement', 'armed response'],
        hardFacts: ['Transport, custody, and security spaces are close enough for movement to become accountable immediately.'],
        textures: ['six-pad platform', 'operator booth', 'biofilter logs', 'secured arms issue', 'compact brig'],
        constraints: ['Transporters require locks, biofilters, shield status, power, and custody decisions.'],
        keywords: ['transporter', 'beam', 'security', 'brig', 'armory', 'biofilter', 'custody'],
        refs: ['5.5 Transporter rooms, security, and armory, Deck 6'],
        summary: 'Transporter and security spaces turn intent into irreversible movement and accountable custody.'
      }),
      area({
        id: 'steamrunner.mission-ops-science',
        name: 'Mission ops, route analysis, and science labs',
        decks: [7, 8],
        zone: 'Decks 7-8 broad primary-hull analysis spaces',
        functions: ['route validation', 'hazard analysis', 'survey science', 'evidence reconstruction', 'chart custody'],
        sceneUses: ['charts', 'wreck emergence', 'anomalies', 'sanctuary detection', 'false certainty'],
        hardFacts: ['Mission ops is the class-native place where a Steamrunner earns the right to say a route is safe enough.'],
        textures: ['wall-scale route displays', 'probe telemetry', 'sensor-fusion table', 'sealed evidence readers', 'confidence overlays'],
        constraints: ['Good sensors still produce uncertainty, blind spots, false confidence, and political exposure.'],
        keywords: ['mission ops', 'science lab', 'route', 'chart', 'sensor', 'survey', 'evidence'],
        systems: ['steamrunner.sensors-chart-custody'],
        refs: ['5.6 Mission ops, route analysis, and science labs, Decks 7-8'],
        summary: 'Mission ops makes contested routes legible enough for command action without making the map automatically true.'
      }),
      area({
        id: 'steamrunner.cargo-recovery-holds',
        name: 'Cargo, salvage, and recovery holds',
        decks: [9, 10],
        zone: 'Decks 9-10 aft-central service hull',
        functions: ['cargo', 'relief pallets', 'salvage sorting', 'survivor property', 'field equipment'],
        sceneUses: ['physical evidence', 'scarcity', 'repair parts', 'disaster logistics'],
        hardFacts: ['Cargo and recovery holds make rescue, salvage, relief, and evidence physical.'],
        textures: ['pallet rails', 'modular containers', 'environmental cages', 'salvage tables', 'temporary bunks'],
        constraints: ['Cargo volume runs out before compassion does.'],
        keywords: ['cargo', 'salvage', 'recovery hold', 'relief', 'supplies', 'inventory', 'pallet'],
        systems: ['steamrunner.small-craft-cargo-integration'],
        refs: ['5.7 Cargo, salvage, and recovery holds, Decks 9-10'],
        summary: 'Cargo and recovery holds turn abstract rescue into mass, labels, custody, locks, and finite volume.'
      }),
      area({
        id: 'steamrunner.main-engineering-aft-deflector',
        name: 'Main engineering and aft deflector control',
        decks: [11, 12],
        zone: 'Decks 11-12 aft service concentration',
        exteriorPlacement: 'Internal support for the aft detached deflector housing and cowled nacelle roots',
        functions: ['warp power', 'impulse support', 'tractor load control', 'aft deflector coordination', 'damage control'],
        sceneUses: ['power tradeoffs', 'damage control', 'towing', 'field pulses', 'repair triage'],
        hardFacts: ['Engineering and aft deflector control are physically and operationally tied to stern field geometry.'],
        textures: ['compact core bay', 'power-transfer consoles', 'aft deflector control alcove', 'tractor-load display', 'cowling access trunk'],
        constraints: ['Deflector activity, tractor load, shields, and shuttle recovery can conflict under pressure.'],
        keywords: ['engineering', 'main engineering', 'warp core', 'deflector', 'aft deflector', 'tractor', 'power'],
        systems: ['steamrunner.aft-deflector', 'steamrunner.tractor-convoy-control'],
        refs: ['5.8 Main engineering and aft deflector control, Decks 11-12'],
        summary: 'Engineering turns route promises into physics: power, tractor load, deflector timing, cowling heat, and repairable risk.'
      }),
      area({
        id: 'steamrunner.aft-lower-flight-deck',
        name: 'Aft-lower flight deck',
        decks: [13],
        zone: 'Deck 13 aft-lower service volume',
        exteriorPlacement: 'Aft-lower service volume in the broad rear hull above and around the detached deflector housing; approach from astern and below',
        functions: ['shuttle launch', 'shuttle recovery', 'field-team staging', 'survivor intake', 'small-craft repair'],
        sceneUses: ['away-team launch', 'emergency recovery', 'evacuation', 'shuttle repair', 'mission staging'],
        hardFacts: [
          'Steamrunner small-craft recovery uses an aft-lower stern service volume in Directive baseline.',
          'Small craft approach from astern and below.',
          'The aft deflector housing and shuttle recovery share stern geometry.'
        ],
        textures: ['approach strobes', 'bay force field', 'deck-control booth', 'maintenance cradles', 'cargo tie-downs'],
        constraints: [
          'Do not depict a wide forward, saucer-underbelly, or generic belly shuttlebay.',
          'Deflector activity, tractor load, shields, and bay force fields can affect recovery timing.'
        ],
        keywords: ['shuttlebay', 'shuttle bay', 'flight deck', 'hangar', 'shuttle', 'launch', 'recovery', 'aft bay'],
        systems: ['steamrunner.aft-deflector', 'steamrunner.small-craft-cargo-integration'],
        refs: ['3.3 Shuttle approach truth', '5.9 Aft-lower flight deck, Deck 13'],
        summary: 'The aft-lower flight deck is the Steamrunner mission threshold, with shuttle approach from astern and below through stern service geometry.'
      }),
      area({
        id: 'steamrunner.jefferies-lower-support',
        name: 'Jefferies tubes and lower support',
        decks: [14, 15, 16],
        zone: 'Lower maintenance network and cowling support',
        functions: ['repair access', 'environmental support', 'shield-grid service', 'emergency routing'],
        sceneUses: ['physical risk', 'hidden damage', 'private confession', 'systems mystery'],
        hardFacts: ['Lower support and maintenance access expose the ship as a body of heat, conduits, vibration, and narrow routes.'],
        textures: ['ladder tubes', 'cowling crawlways', 'warm conduits', 'shield-grid panels', 'environmental valves'],
        constraints: ['Maintenance scenes should use cramped physical risk rather than generic corridor action.'],
        keywords: ['Jefferies', 'crawlway', 'lower support', 'conduit', 'relay', 'cowling', 'maintenance'],
        refs: ['5.10 Jefferies tubes and lower support, Decks 14-16'],
        summary: 'Jefferies tubes and lower support make the Steamrunner hull physically accountable.'
      })
    ],
    systems: [
      system({
        id: 'steamrunner.aft-deflector',
        name: 'Aft deflector and field geometry',
        scope: 'Aft detached secondary-hull housing',
        capability: 'Navigation and field projection from stern geometry, creating class-specific towing, hazard, and recovery constraints.',
        dependencies: ['power transfer', 'tractor loads', 'shuttle recovery timing', 'stern shield arcs'],
        failureModes: ['field instability', 'recovery window delay', 'tow interference', 'sensor distortion'],
        sceneUses: ['route scan', 'wreck tow', 'shuttle recovery conflict', 'hazard pulse'],
        keywords: ['deflector', 'aft deflector', 'field', 'tractor', 'tow', 'stern'],
        refs: ['6.1 Aft deflector and field geometry'],
        summary: 'The aft deflector is the recurring Steamrunner system that makes field work, towing, and shuttle recovery physically specific.'
      }),
      system({
        id: 'steamrunner.tractor-convoy-control',
        name: 'Tractor, towing, and convoy control',
        scope: 'Tractor emitters, shield arcs, and convoy movement control',
        capability: 'Secures wrecks, guides convoys, holds recovery lines, and protects traffic one crisis at a time.',
        dependencies: ['tractor emitter availability', 'structural integrity', 'shield geometry', 'power reserve', 'legal custody'],
        failureModes: ['emitter overheating', 'tow drift', 'shield exposure', 'custody dispute'],
        sceneUses: ['hazardous recovery', 'convoy escort', 'salvage custody', 'route denial'],
        keywords: ['tractor', 'tow', 'convoy', 'recovery', 'escort', 'route'],
        refs: ['6.2 Tractor, towing, and convoy control'],
        summary: 'Tractor and convoy systems are strong but bounded by load, arcs, power, and what becomes exposed while the ship holds one line.'
      }),
      system({
        id: 'steamrunner.tactical-defensive',
        name: 'Phasers, torpedoes, shields, and deterrence',
        scope: 'Tactical and defensive suite',
        capability: 'Credible 2370s escort firepower and shielding for convoy cover, route denial, and self-defense.',
        dependencies: ['weapon arcs', 'shield sectors', 'rules of engagement', 'torpedo inventory', 'civilian proximity'],
        failureModes: ['arc limitation', 'shield gap', 'political escalation', 'inventory pressure'],
        sceneUses: ['convoy defense', 'warning posture', 'shuttle cover', 'battle-line support'],
        keywords: ['phaser', 'torpedo', 'shields', 'tactical', 'weapons', 'deterrence'],
        refs: ['6.3 Tactical systems'],
        summary: 'Steamrunner tactical systems create credible threat presence but should support escort and rescue rather than erase politics.'
      }),
      system({
        id: 'steamrunner.sensors-chart-custody',
        name: 'Sensors, route maps, and chart custody',
        scope: 'Mission ops sensor fusion and route-record control',
        capability: 'Turns contested space into maps, models, custody records, and command recommendations.',
        dependencies: ['sensor calibration', 'probe telemetry', 'local interference', 'data custody', 'command authorization'],
        failureModes: ['false certainty', 'blind spot', 'chart exposure', 'model drift'],
        sceneUses: ['route validation', 'sanctuary exposure', 'wreck emergence prediction', 'evidence dispute'],
        keywords: ['sensor', 'chart', 'route', 'mission ops', 'map', 'custody', 'survey'],
        refs: ['6.4 Sensors, route maps, and chart custody'],
        summary: 'The Steamrunner sensor suite makes movement legible while creating political exposure and false-certainty risk.'
      }),
      system({
        id: 'steamrunner.small-craft-cargo-integration',
        name: 'Small-craft, cargo, medical, and security integration',
        scope: 'Flight deck, cargo holds, transporter, medical, and security traffic chain',
        capability: 'Moves field teams, survivors, cargo, evidence, and casualties through a constrained rescue chain.',
        dependencies: ['bay clearance', 'cargo volume', 'medical capacity', 'security routing', 'decontamination'],
        failureModes: ['bay choke point', 'medical overflow', 'cargo conflict', 'security breach'],
        sceneUses: ['survivor intake', 'field-team launch', 'repair logistics', 'evacuation flow'],
        keywords: ['flight deck', 'cargo', 'sickbay', 'security', 'decon', 'evacuation'],
        refs: ['6.5 Small-craft and cargo integration'],
        summary: 'Flight deck, cargo, medical, and security are one chain; rescue scenes should feel connected rather than room-isolated.'
      })
    ]
  },
  newOrleans: {
    classId: 'new-orleans-class',
    classLabel: 'New Orleans-class',
    document: 'Directive_New_Orleans_Class_Starship_Bible.md',
    sourceTitle: 'Directive New Orleans-Class Starship Bible',
    sourcePath: 'docs/source/Directive_New_Orleans_Class_Starship_Bible.md',
    profileRefs: ['2. Class Personality', '9. Portrayal Principles'],
    exteriorRefs: ['3.1 Silhouette and first read', '3.2 Exterior zones'],
    shuttleRefs: ['3.3 Shuttle approach truth', '5.10 Aft saucer/neck shuttlebay, Deck 13'],
    identity: {
      summary: 'A New Orleans-class ship is a mature Starfleet frigate: smaller than Galaxy-class grandeur, formal enough for diplomacy, and defined by mission/sensor pods that make visibility, evidence, and chart custody consequential.',
      hardAnchors: [
        'Galaxy-family silhouette at frigate scale.',
        'Two dorsal saucer mission/sensor pods and one ventral secondary-hull pod in Directive baseline.',
        'Primary small-craft bay is in the aft saucer/neck service zone, approached from astern.'
      ],
      textures: ['warm Galaxy-era light', 'pod status columns', 'route records', 'observation-room formality', 'evidence lockers'],
      constraints: [
        'Do not treat the ship as a full Galaxy-class city.',
        'Do not ignore the pods or use them as routine shuttlebays by default.'
      ],
      avoid: ['Galaxy-class reskin', 'pod-as-magic-module', 'Intrepid-style compact modernity']
    },
    exterior: {
      summary: 'The exterior reads as a compact Galaxy-era frigate with a familiar saucer, compact engineering hull, nacelles, and three prominent mission/sensor pods.',
      hardAnchors: [
        'The three pods are class-defining exterior features.',
        'The class is significantly smaller than a Galaxy-class ship.',
        'Pod arcs and calibration can affect what the ship can prove.'
      ],
      textures: ['dorsal pod shadows', 'ventral pod access', 'familiar saucer curve', 'compact secondary hull', 'pod calibration lights'],
      constraints: ['Exterior prose should keep pod placement, saucer scale, engineering hull, and aft bay geometry consistent.']
    },
    areas: [
      area({
        id: 'new-orleans.bridge',
        name: 'Bridge',
        decks: [1],
        zone: 'Deck 1 Galaxy-family bridge module scaled to frigate size',
        exteriorPlacement: 'Dorsal saucer command module',
        functions: ['command', 'pod tasking', 'patrol decisions', 'tactical coordination'],
        sceneUses: ['acting command', 'border calls', 'evidence authorization', 'route clearance'],
        hardFacts: ['The bridge uses familiar Starfleet formality at smaller frigate scale.'],
        textures: ['central command chairs', 'pod-status displays', 'route evidence overlay', 'forward conn', 'compact tactical station'],
        constraints: ['Bridge scenes should turn what the ship sees into what Starfleet will do about it.'],
        keywords: ['bridge', 'conn', 'ops', 'tactical', 'pod tasking', 'viewscreen'],
        refs: ['5.1 Bridge, Deck 1'],
        summary: 'The New Orleans bridge turns pod returns, border contacts, and patrol reports into accountable command action.'
      }),
      area({
        id: 'new-orleans.ready-observation',
        name: 'Ready room and observation room',
        decks: [2],
        zone: 'Deck 2 command support',
        exteriorPlacement: 'Dorsal saucer near bridge access',
        functions: ['private command judgment', 'formal senior-staff synthesis', 'inquiry', 'records authorization'],
        sceneUses: ['witness protection', 'border policy', 'command transition', 'sealed evidence debate'],
        hardFacts: ['The observation room is formal enough for senior-staff synthesis but smaller than Galaxy-class ceremony.'],
        textures: ['long table', 'wall display', 'secure evidence cabinet', 'ready-room terminal'],
        constraints: ['Discovered facts here should become accountable records, not detached exposition.'],
        keywords: ['ready room', 'observation room', 'briefing room', 'senior staff', 'inquiry'],
        refs: ['5.2 Ready room and observation room, Deck 2'],
        summary: 'Command support rooms turn discovered facts into records the ship and commander must own.'
      }),
      area({
        id: 'new-orleans.wardroom-diplomatic',
        name: 'Wardroom, mess, and diplomatic cabin',
        decks: [3, 4, 5],
        zone: 'Forward and mid-saucer social and diplomatic spaces',
        exteriorPlacement: 'Saucer crew and guest volume',
        functions: ['meals', 'morale', 'informal diplomacy', 'protected civilian meetings'],
        sceneUses: ['trust', 'asylum', 'crew fatigue', 'witness conversation'],
        hardFacts: ['The wardroom carries compact Starfleet dignity without flagship scale.'],
        textures: ['compact tables', 'replicator alcove', 'mission plaque', 'protected waiting room', 'older display panel'],
        constraints: ['Social space should show how visibility and records affect people, not only policy.'],
        keywords: ['wardroom', 'mess', 'diplomatic cabin', 'meal', 'witness', 'morale'],
        refs: ['5.3 Wardroom, mess, and diplomatic cabin, Decks 3-5'],
        summary: 'The wardroom turns formal Starfleet procedure into personal trust, asylum pressure, and crew fatigue.'
      }),
      area({
        id: 'new-orleans.sickbay',
        name: 'Sickbay',
        decks: [4, 5],
        zone: 'Protected mid-saucer medical suite',
        functions: ['treatment', 'forensic medicine', 'asylum medical exams', 'casualty care'],
        sceneUses: ['body evidence', 'trauma', 'privacy', 'command cost'],
        hardFacts: ['Medical truth can protect or endanger a person when records are politically contested.'],
        textures: ['biobeds', 'surgical alcove', 'CMO office', 'forensic evidence storage', 'privacy screens'],
        constraints: ['Medical logs may require sealing, redaction, or command-level protection.'],
        keywords: ['sickbay', 'doctor', 'medical', 'forensic', 'biobed', 'privacy'],
        systems: ['new-orleans.records-chart-custody'],
        refs: ['5.4 Sickbay, Decks 4-5'],
        summary: 'Sickbay turns disputed facts into bodies, medical records, and privacy risk.'
      }),
      area({
        id: 'new-orleans.transporter-security',
        name: 'Transporter rooms, security, and brig',
        decks: [6],
        zone: 'Deck 6 movement and custody spaces',
        functions: ['personnel transfer', 'custody', 'evidence transfer', 'detainment', 'asylum movement'],
        sceneUses: ['asylum', 'boarding', 'witness protection', 'arrest', 'chain of custody'],
        hardFacts: ['Transporter movement can become asylum, kidnapping, rescue, extradition refusal, or evidence contamination.'],
        textures: ['multi-pad transporter', 'operator booth', 'secure interview room', 'compact brig', 'evidence intake'],
        constraints: ['Movement must remain legally and ethically legible.'],
        keywords: ['transporter', 'beam', 'security', 'brig', 'evidence', 'custody', 'asylum'],
        systems: ['new-orleans.records-chart-custody'],
        refs: ['5.5 Transporter rooms, security, and brig, Deck 6'],
        summary: 'Transporter and security spaces turn movement into custody, protection, and legal risk.'
      }),
      area({
        id: 'new-orleans.mission-ops-pod-control',
        name: 'Mission ops and pod-control room',
        decks: [9],
        zone: 'Central mission space linked to dorsal and ventral pod access trunks',
        exteriorPlacement: 'Internal pod-control space tied to two dorsal saucer pods and one ventral secondary-hull pod',
        functions: ['pod tasking', 'chart validation', 'border-marker verification', 'evidence control'],
        sceneUses: ['hidden route discovery', 'sanctuary exposure', 'sensor dispute', 'sealed data review'],
        hardFacts: [
          'New Orleans-class ships carry two dorsal saucer mission/sensor pods and one ventral secondary-hull pod in Directive baseline.',
          'Mission pods are specialized perception systems, not routine shuttlebays or infinite cargo modules by default.'
        ],
        textures: ['pod-status columns', 'raw telemetry archive', 'sealed and public map displays', 'calibration logs'],
        constraints: ['Pod data has arc, power, calibration, maintenance, and custody limits.'],
        keywords: ['mission ops', 'pod control', 'mission pod', 'sensor pod', 'chart', 'route', 'border', 'evidence'],
        systems: ['new-orleans.mission-pods', 'new-orleans.records-chart-custody'],
        refs: ['5.6 Mission ops and pod-control room, Deck 9'],
        summary: 'Mission ops is where the New Orleans turns perception into institutional risk.'
      }),
      area({
        id: 'new-orleans.science-pod-access',
        name: 'Science labs and pod access',
        decks: [7, 8],
        zone: 'Saucer labs with access trunks to dorsal pods',
        exteriorPlacement: 'Internal access toward dorsal saucer mission/sensor pods',
        functions: ['analysis', 'calibration', 'sample work', 'probe telemetry', 'specialist review'],
        sceneUses: ['verification', 'sabotage', 'false positives', 'specialist conflict'],
        hardFacts: ['Dorsal pod access is specialized and constrained, not a normal hallway network.'],
        textures: ['lab benches', 'sensor calibration chamber', 'pod-access ladder', 'probe cradle', 'sealed sample locker'],
        constraints: ['Pod calibration can delay action even when command wants immediate certainty.'],
        keywords: ['science lab', 'pod access', 'calibration', 'probe', 'sensor', 'sample'],
        systems: ['new-orleans.mission-pods'],
        refs: ['5.7 Science labs and pod access, Decks 7-8'],
        summary: 'Science labs test whether seeing is knowing and whether pod data can be trusted.'
      }),
      area({
        id: 'new-orleans.main-engineering',
        name: 'Main engineering and deflector control',
        decks: [10, 11],
        zone: 'Compact secondary hull and lower mission support',
        exteriorPlacement: 'Secondary hull power and deflector support',
        functions: ['warp power', 'deflector control', 'pod power distribution', 'repair authority'],
        sceneUses: ['power tradeoffs', 'pod damage', 'warp stress', 'repair ethics'],
        hardFacts: ['Pod operation competes with shields, transporters, warp, and other ship systems through a finite power grid.'],
        textures: ['compact warp core', 'power-transfer consoles', 'pod power taps', 'deflector controls', 'older conduit labels'],
        constraints: ['Age is not incompetence; the ship is proven, repairable, and still bounded by power tradeoffs.'],
        keywords: ['engineering', 'warp core', 'deflector', 'power grid', 'pod power', 'repair'],
        systems: ['new-orleans.power-grid', 'new-orleans.mission-pods'],
        refs: ['5.8 Main engineering and deflector control, Decks 10-11'],
        summary: 'Engineering turns pod loadouts and institutional intent into power, maintenance, and repair cost.'
      }),
      area({
        id: 'new-orleans.cargo-field-stores',
        name: 'Cargo and field stores',
        decks: [12],
        zone: 'Lower saucer or upper secondary service volume',
        functions: ['relief cargo', 'field kits', 'probe pallets', 'witness property', 'mission supplies'],
        sceneUses: ['scarcity', 'evidence custody', 'asylum logistics', 'expedition prep'],
        hardFacts: ['Cargo turns records, charts, and evidence into physical objects with custody.'],
        textures: ['modular containers', 'probe racks', 'locked evidence cages', 'relief pallets', 'cargo lifts'],
        constraints: ['Which object is sealed, returned, or moved should matter.'],
        keywords: ['cargo', 'field stores', 'probe', 'evidence cage', 'relief', 'supply'],
        systems: ['new-orleans.records-chart-custody'],
        refs: ['5.9 Cargo and field stores, Deck 12'],
        summary: 'Cargo makes the ship act on what it records: probes, relief, evidence, and field gear.'
      }),
      area({
        id: 'new-orleans.aft-saucer-shuttlebay',
        name: 'Aft saucer/neck shuttlebay',
        decks: [13],
        zone: 'Deck 13 aft saucer/neck service zone',
        exteriorPlacement: 'Aft saucer/neck service bay approached from astern and slightly above the engineering hull',
        functions: ['shuttle launch', 'shuttle recovery', 'maintenance', 'protected passenger transfer'],
        sceneUses: ['away-team movement', 'asylum arrivals', 'casualty return', 'pod interference'],
        hardFacts: [
          'Directive New Orleans baseline places the primary small-craft bay in the aft saucer/neck service zone.',
          'Shuttles approach from astern and slightly above the engineering hull.',
          'Mission pods are not routine shuttlebays by default.'
        ],
        textures: ['modest bay', 'force-field threshold', 'deck-control booth', 'maintenance alcove', 'passenger screening point'],
        constraints: [
          'Do not depict shuttles routinely entering a mission pod.',
          'Do not scale the bay into a massive Galaxy-class dorsal flight deck.'
        ],
        keywords: ['shuttlebay', 'shuttle bay', 'shuttle', 'hangar', 'launch', 'recovery', 'aft bay'],
        systems: ['new-orleans.small-craft-custody', 'new-orleans.mission-pods'],
        refs: ['3.3 Shuttle approach truth', '5.10 Aft saucer/neck shuttlebay, Deck 13'],
        summary: 'The aft saucer/neck shuttlebay turns passage into physical movement and official record.'
      }),
      area({
        id: 'new-orleans.lower-support-ventral-pod',
        name: 'Lower support and ventral pod access',
        decks: [14],
        zone: 'Lower hull, environmental, maintenance, and ventral pod access',
        exteriorPlacement: 'Lower secondary-hull support near the ventral mission/sensor pod',
        functions: ['repair access', 'environmental control', 'lower pod calibration', 'emergency routing'],
        sceneUses: ['physical risk', 'hidden damage', 'sabotage', 'private work scenes'],
        hardFacts: ["The ventral pod's reliability depends on lower support access, seals, relays, and calibration."],
        textures: ['ladders', 'ventral pod hatch', 'environmental junctions', 'older conduit labels', 'emergency bulkheads'],
        constraints: ['Remote diagnostics may not replace physical pod access under sabotage or damage.'],
        keywords: ['lower support', 'ventral pod', 'Jefferies', 'pod hatch', 'environmental', 'maintenance'],
        systems: ['new-orleans.mission-pods', 'new-orleans.power-grid'],
        refs: ['5.11 Lower support and ventral pod access, Deck 14'],
        summary: 'Lower support makes the class signature pods physically maintainable and vulnerable.'
      })
    ],
    systems: [
      system({
        id: 'new-orleans.mission-pods',
        name: 'Mission/sensor pod suite',
        scope: 'Two dorsal saucer pods and one ventral secondary-hull pod',
        capability: 'Specialized sensor, survey, tactical-support, or mission-package functions that make hidden space visible.',
        dependencies: ['power allocation', 'calibration', 'pod arc', 'maintenance access', 'data custody'],
        failureModes: ['blind spot', 'false certainty', 'power conflict', 'sealed-data exposure', 'pod damage'],
        sceneUses: ['chart validation', 'hidden-route detection', 'border marker verification', 'evidence dispute'],
        keywords: ['mission pod', 'sensor pod', 'pod', 'calibration', 'chart', 'border'],
        refs: ['6.1 Mission/sensor pods'],
        summary: 'Mission pods extend perception and make visibility consequential.'
      }),
      system({
        id: 'new-orleans.records-chart-custody',
        name: 'Records, charts, and evidence custody',
        scope: 'Ship logs, chart authority, medical/security records, and evidence handling',
        capability: 'Controls what the ship knows, what it logs, who can read it, and when it becomes public.',
        dependencies: ['access controls', 'raw data archives', 'command authorization', 'medical privacy', 'security chain of custody'],
        failureModes: ['exposure of protected location', 'evidence contamination', 'sealed-data leak', 'public-trust collapse'],
        sceneUses: ['asylum', 'chart publication', 'witness protection', 'border proof'],
        keywords: ['record', 'chart', 'evidence', 'custody', 'log', 'sealed data'],
        refs: ['6.2 Records, charts, and evidence custody'],
        summary: 'Records are story objects: they protect, expose, authorize, and haunt.'
      }),
      system({
        id: 'new-orleans.tactical-defensive',
        name: 'Frigate tactical systems',
        scope: 'Phaser arrays, photon torpedoes, shields, and patrol authority',
        capability: 'Credible patrol and escort capability without task-group dominance.',
        dependencies: ['weapon arcs', 'shield sectors', 'rules of engagement', 'pod power demand', 'civilian proximity'],
        failureModes: ['arc limitation', 'escalation', 'inventory pressure', 'shield compromise'],
        sceneUses: ['border warning', 'convoy cover', 'self-defense', 'limited enforcement'],
        keywords: ['phaser', 'torpedo', 'shields', 'tactical', 'frigate', 'escort'],
        refs: ['6.3 Tactical systems'],
        summary: 'Tactical authority is bounded by patrol scale, legitimacy, and what the ship can prove.'
      }),
      system({
        id: 'new-orleans.power-grid',
        name: 'Older-but-proven power grid',
        scope: 'Mature Galaxy-era power distribution adapted for frigate pods and frontier refits',
        capability: 'Understood and repairable systems that support pod loads, shields, transporters, and warp with real tradeoffs.',
        dependencies: ['EPS distribution', 'pod loadout', 'warp demand', 'shield status', 'refit history'],
        failureModes: ['pod power conflict', 'old conduit stress', 'calibration drift', 'temporary blind spot'],
        sceneUses: ['pod operation under fire', 'repair history', 'route scan tradeoff', 'field refit'],
        keywords: ['power grid', 'EPS', 'engineering', 'pod power', 'refit', 'warp'],
        refs: ['6.4 Older-but-proven power grid'],
        summary: 'The ship is proven, not shabby: age means repairable knowledge and inherited constraints.'
      }),
      system({
        id: 'new-orleans.small-craft-custody',
        name: 'Small-craft movement and custody',
        scope: 'Aft shuttlebay, passenger screening, pod-safe approach windows, and movement logs',
        capability: 'Moves teams, witnesses, casualties, and supplies while preserving legal and operational records.',
        dependencies: ['bay clearance', 'pod sweep timing', 'screening logs', 'security routing', 'medical/cargo readiness'],
        failureModes: ['unlogged arrival', 'pod interference', 'screening failure', 'custody ambiguity'],
        sceneUses: ['asylum arrival', 'away-team launch', 'protected transfer', 'casualty return'],
        keywords: ['shuttlebay', 'shuttle', 'custody', 'screening', 'arrival', 'launch'],
        refs: ['3.3 Shuttle approach truth', '6.2 Records, charts, and evidence custody'],
        summary: 'Small-craft movement aboard a New Orleans is physical passage and official record at the same time.'
      })
    ]
  },
  norway: {
    classId: 'norway-class',
    classLabel: 'Norway-class',
    document: 'Directive_Norway_Class_Starship_Bible.md',
    sourceTitle: 'Directive Norway-Class Starship Bible',
    sourcePath: 'docs/source/Directive_Norway_Class_Starship_Bible.md',
    profileRefs: ['2. Class Personality', '9. Portrayal Principles'],
    exteriorRefs: ['3.1 Silhouette and first read', '3.2 Exterior zones'],
    shuttleRefs: ['3.3 Shuttle approach truth', '5.7 Aft centerline shuttlebay and intake screening, Deck 9'],
    identity: {
      summary: 'A Norway-class ship is a compact 2370s Starfleet response vessel whose visible combat authority protects relief, biological science, convoy work, and public-accounting missions without replacing local institutions.',
      hardAnchors: [
        'Broad flat-iron hull with Defiant-like keel influence.',
        'Wing-shaped warp pylons create an aft centerline gap.',
        'Directive baseline places the shuttlebay at the aft centerline, approached from astern through the pylon gap.',
        'Dorsal bow phaser emitter is a class tell.'
      ],
      textures: ['clean relief spine', 'bow emitter status', 'pylon-gap approach lights', 'decon glare', 'cargo ledgers'],
      constraints: [
        'Do not treat the class as a hospital ship with no tactical edge or as a Defiant-style gunboat.',
        'Replicators do not erase agricultural, seed, medicine, or regional logistics scarcity.'
      ],
      avoid: ['Intrepid clone', 'Galaxy-style dorsal shuttlebay', 'pure battleship posture']
    },
    exterior: {
      summary: 'The Norway exterior reads broad, flat, and purposeful: flat-iron hull, Defiant-like keel, wing-shaped pylons with aft gap, dorsal bow phaser emitter, and service/cargo locks for relief work.',
      hardAnchors: [
        'Wing-shaped pylons and aft gap shape small-craft approach.',
        'The dorsal bow phaser emitter should appear as deterrence and perception pressure.',
        'Relief posture should be visible through cargo locks, sanitation fields, and convoy shielding.'
      ],
      textures: ['pylon shadows', 'bow-emitter heat', 'sanitation lights', 'cargo lock beacons', 'broad hull plating'],
      constraints: ['Exterior prose should keep the pylon gap, bow emitter, and flat hull visible when relevant.']
    },
    areas: [
      area({
        id: 'norway.bridge',
        name: 'Bridge',
        decks: [1],
        zone: 'Deck 1 forward/dorsal command module',
        exteriorPlacement: 'Forward/dorsal command placement on the broad main hull',
        functions: ['command', 'convoy coordination', 'tactical deterrence', 'relief prioritization'],
        sceneUses: ['acting command', 'crisis triage', 'convoy defense', 'public accountability'],
        hardFacts: ['The bridge tracks convoy position, quarantine state, crop stores, medical load, and threat arcs together.'],
        textures: ['central command chair', 'convoy display', 'bow-emitter status', 'quarantine feed', 'relief clock'],
        constraints: ['Bridge scenes should turn care and deterrence into accountable orders.'],
        keywords: ['bridge', 'conn', 'ops', 'tactical', 'convoy', 'bow emitter', 'relief'],
        refs: ['5.1 Bridge, Deck 1'],
        summary: 'The Norway bridge is a triage board where relief, quarantine, convoy, and tactical pressures compete.'
      }),
      area({
        id: 'norway.ready-briefing',
        name: 'Ready room and briefing room',
        decks: [2],
        zone: 'Deck 2 command support',
        functions: ['private command ownership', 'cross-discipline planning', 'relief policy', 'quarantine ethics'],
        sceneUses: ['relief policy', 'quarantine ethics', 'public accounting', 'command transition'],
        hardFacts: ['The briefing room can become a contested aid office where true priorities cannot all win.'],
        textures: ['secure terminal', 'convoy map', 'supply-band display', 'medical science feed', 'compact table'],
        constraints: ['Humanitarian planning should remain physically tied to ship stores, quarantine, and escort limits.'],
        keywords: ['ready room', 'briefing room', 'relief policy', 'quarantine', 'senior staff'],
        refs: ['5.2 Ready room and briefing room, Deck 2'],
        summary: 'Command support rooms turn urgent care into rules the ship can follow.'
      }),
      area({
        id: 'norway.mission-ops-accounting',
        name: 'Mission ops and public-accounting room',
        decks: [4],
        zone: 'Deck 4 central mission spine',
        functions: ['relief tracking', 'convoy coordination', 'supply transparency', 'regional status'],
        sceneUses: ['food accounting', 'route priority', 'public trust', 'pressure clocks'],
        hardFacts: ['Mission ops makes relief math visible and challengeable.'],
        textures: ['supply boards', 'convoy overlays', 'crop-transition models', 'decontamination queues', 'public-facing terminal'],
        constraints: ['Visible fairness can create panic when there is not enough.'],
        keywords: ['mission ops', 'accounting', 'supply board', 'convoy', 'relief', 'public trust'],
        systems: ['norway.public-accounting'],
        refs: ['5.3 Mission ops and public-accounting room, Deck 4'],
        summary: 'Mission ops turns compassion into numbers the crew, locals, and command can inspect.'
      }),
      area({
        id: 'norway.sickbay-quarantine',
        name: 'Sickbay and quarantine ward',
        decks: [5],
        zone: 'Deck 5 protected mid-spine medical suite',
        functions: ['treatment', 'isolation', 'exposure response', 'medical ethics', 'triage'],
        sceneUses: ['control-spore exposure', 'famine injuries', 'triage', 'command cost'],
        hardFacts: ['Sickbay and quarantine are shipboard borders: help may require sealed doors, refused contact, or transport denial.'],
        textures: ['biobeds', 'quarantine fields', 'decon vestibule', 'sample pass-through', 'overflow screens'],
        constraints: ['Quarantine should have physical flow, logs, pass-throughs, and emotional cost.'],
        keywords: ['sickbay', 'quarantine', 'doctor', 'medical', 'biobed', 'decon', 'isolation'],
        systems: ['norway.quarantine-decon'],
        refs: ['5.4 Sickbay and quarantine ward, Deck 5'],
        summary: 'Sickbay turns relief policy into bodies, isolation, exposure risk, and medical authority.'
      }),
      area({
        id: 'norway.bio-agriculture-labs',
        name: 'Biological and agricultural labs',
        decks: [6],
        zone: 'Deck 6 controlled biological workspaces',
        functions: ['crop analysis', 'pathogen work', 'seed testing', 'ecological modeling', 'sample custody'],
        sceneUses: ['food transition', 'contamination', 'scientific dissent', 'moral delay'],
        hardFacts: ['Lab delay can be care: certification, seed testing, and contamination review decide whether relief is safe.'],
        textures: ['sealed benches', 'growth cabinets', 'sample lockers', 'decon pass-throughs', 'humid grow-light spill'],
        constraints: ['Science can look like delay when cargo holds are full of urgent need.'],
        keywords: ['lab', 'biology', 'agriculture', 'seed', 'crop', 'sample', 'xenobotany'],
        systems: ['norway.relief-cargo-seed-custody', 'norway.quarantine-decon'],
        refs: ['5.5 Biological and agricultural labs, Deck 6'],
        summary: 'Agricultural labs turn survival into evidence before it becomes distribution.'
      }),
      area({
        id: 'norway.relief-cargo-seed-vaults',
        name: 'Relief cargo, seed vaults, and field stores',
        decks: [7, 8],
        zone: 'Decks 7-8 central/lower mission spine',
        functions: ['food storage', 'seed custody', 'relief pallets', 'field equipment', 'temporary intake'],
        sceneUses: ['scarcity', 'ownership', 'dependency', 'public trust'],
        hardFacts: ['Clean seed, medicine, and cargo are finite and carry temperature, viability, destination, custody, and public-accounting constraints.'],
        textures: ['seed vault lockers', 'environmental racks', 'ration pallets', 'cargo nets', 'inventory boards'],
        constraints: ['Replicators cannot erase agricultural scale, seed viability, local autonomy, or public trust problems.'],
        keywords: ['cargo', 'seed vault', 'relief supplies', 'food', 'ration', 'field stores', 'inventory'],
        systems: ['norway.relief-cargo-seed-custody', 'norway.public-accounting'],
        refs: ['5.6 Relief cargo, seed vaults, and field stores, Decks 7-8'],
        summary: 'Cargo and seed vaults make care finite and politically visible.'
      }),
      area({
        id: 'norway.aft-centerline-shuttlebay',
        name: 'Aft centerline shuttlebay and intake screening',
        decks: [9],
        zone: 'Deck 9 aft centerline bay',
        exteriorPlacement: 'Aft centerline bay opening into the gap between wing-shaped warp pylons; approach from astern through the pylon gap',
        functions: ['shuttle launch', 'shuttle recovery', 'relief intake', 'small-craft maintenance', 'decontamination routing'],
        sceneUses: ['away-team launch', 'quarantine transfer', 'convoy rescue', 'cargo intake'],
        hardFacts: [
          'Norway small-craft recovery uses the aft pylon-gap shuttlebay in Directive baseline.',
          'Small craft approach from astern through the gap between wing-shaped warp pylons.',
          'The bay links directly to intake screening, decon, cargo, and medical routes.'
        ],
        textures: ['pylon-gap approach lights', 'bay force field', 'sanitation arches', 'intake screening', 'cargo lanes'],
        constraints: [
          'Do not depict a saucer-underbelly, forward bow, or Galaxy-style dorsal shuttlebay.',
          'Pylon field stress, shields, decon readiness, and cargo/medical traffic can affect recovery timing.'
        ],
        keywords: ['shuttlebay', 'shuttle bay', 'shuttle', 'pylon gap', 'launch', 'recovery', 'decon', 'intake'],
        systems: ['norway.pylon-field-power', 'norway.quarantine-decon'],
        refs: ['3.3 Shuttle approach truth', '5.7 Aft centerline shuttlebay and intake screening, Deck 9'],
        summary: 'The aft centerline shuttlebay is both welcome door and contamination boundary, reached from astern through the pylon gap.'
      }),
      area({
        id: 'norway.main-engineering-pylon-support',
        name: 'Main engineering and pylon field support',
        decks: [10, 11],
        zone: 'Decks 10-11 aft/lower engineering spaces near pylon roots',
        exteriorPlacement: 'Aft/lower support spaces tied to wing-pylon field geometry and keel access',
        functions: ['warp power', 'shield grid', 'cargo power', 'pylon field stability', 'repair authority'],
        sceneUses: ['power triage', 'convoy protection', 'relief system load', 'pylon damage'],
        hardFacts: ['Humanitarian systems compete for power: shields, quarantine fields, cargo refrigeration, transporters, grow cabinets, decon pumps, and warp speed.'],
        textures: ['compact warp core', 'pylon-field status displays', 'cargo environmental feeds', 'engineering office', 'lower keel access'],
        constraints: ['Engineering should turn relief promises into power distribution and accepted risk.'],
        keywords: ['engineering', 'warp core', 'pylon', 'power', 'shields', 'cargo refrigeration', 'decon pumps'],
        systems: ['norway.pylon-field-power'],
        refs: ['5.8 Main engineering and pylon field support, Decks 10-11'],
        summary: 'Engineering decides what care costs in power, protection, quarantine, and movement.'
      }),
      area({
        id: 'norway.transporter-security',
        name: 'Transporter, security, and controlled-access spaces',
        decks: [12],
        zone: 'Deck 12 lower mission/security deck',
        functions: ['personnel transfer', 'controlled access', 'evidence custody', 'detention', 'aid protection'],
        sceneUses: ['quarantine exceptions', 'prisoner safety', 'supply theft', 'public order'],
        hardFacts: ['Security protects aid, quarantine, patients, and public order; it is not punitive by default.'],
        textures: ['transporter pads', 'decon tie-in', 'controlled checkpoint', 'compact brig', 'evidence lockers'],
        constraints: ['The ship must be open enough to help and closed enough to prevent collapse.'],
        keywords: ['transporter', 'security', 'brig', 'controlled access', 'checkpoint', 'decon'],
        systems: ['norway.quarantine-decon', 'norway.public-accounting'],
        refs: ['5.9 Transporter, security, and controlled-access spaces, Deck 12'],
        summary: 'Transporter and security spaces turn relief into a controlled boundary.'
      }),
      area({
        id: 'norway.lower-support-keel',
        name: 'Lower support and keel maintenance',
        decks: [13, 14],
        zone: 'Lower keel, environmental, sanitation, waste, and pylon/structural access',
        exteriorPlacement: 'Lower keel and pylon-root support structures',
        functions: ['repair access', 'environmental processing', 'sanitation', 'structural support', 'waste processing'],
        sceneUses: ['unglamorous relief work', 'hidden damage', 'contamination cleanup', 'private pressure'],
        hardFacts: ['Relief can fail because of filters, pumps, waste processors, decon lines, or environmental systems.'],
        textures: ['crawlways', 'waste processors', 'water reclamation', 'sanitation pumps', 'keel braces', 'filter stacks'],
        constraints: ['Unglamorous support work should matter as much as public speeches when relief systems strain.'],
        keywords: ['lower support', 'keel', 'decon pump', 'filters', 'waste processing', 'environmental', 'maintenance'],
        systems: ['norway.quarantine-decon', 'norway.pylon-field-power'],
        refs: ['5.10 Lower support and keel maintenance, Decks 13-14'],
        summary: 'Lower support turns noble relief into pipes, filters, waste, heat, and labor.'
      })
    ],
    systems: [
      system({
        id: 'norway.bow-phaser-deterrence',
        name: 'Bow phaser emitter and defensive posture',
        scope: 'Dorsal bow tactical emitter and defensive command posture',
        capability: 'Visible deterrence that protects relief operations and complicates how help is perceived.',
        dependencies: ['rules of engagement', 'shield state', 'convoy proximity', 'public trust', 'power reserve'],
        failureModes: ['escalation', 'trust loss', 'heat stress', 'defensive blind spot'],
        sceneUses: ['convoy defense', 'site protection', 'pirate deterrence', 'political discomfort'],
        keywords: ['bow phaser', 'emitter', 'deterrence', 'phaser', 'convoy', 'tactical'],
        refs: ['6.1 Bow phaser emitter and defensive posture'],
        summary: 'The bow emitter protects relief but can make help feel coercive.'
      }),
      system({
        id: 'norway.quarantine-decon',
        name: 'Quarantine and decontamination systems',
        scope: 'Medical, lab, shuttlebay, and controlled-access decon flow',
        capability: 'Uses fields, doors, pass-throughs, logs, and sanitation systems to prevent exposure from becoming spread.',
        dependencies: ['medical authority', 'decon pumps', 'traffic flow', 'sensor screening', 'security checkpoints'],
        failureModes: ['breach', 'false negative', 'public panic', 'isolation strain', 'pump failure'],
        sceneUses: ['exposure response', 'quarantine exception', 'contaminated cargo', 'patient isolation'],
        keywords: ['quarantine', 'decon', 'medical', 'isolation', 'exposure', 'biofilter'],
        refs: ['6.2 Quarantine and decontamination systems'],
        summary: 'Quarantine is a physical, ethical, and logistical system rather than a generic locked door.'
      }),
      system({
        id: 'norway.relief-cargo-seed-custody',
        name: 'Relief cargo, seed custody, and cold chain',
        scope: 'Central mission-spine cargo and biological support spaces',
        capability: 'Transports, protects, verifies, and distributes finite relief supplies and biological materials.',
        dependencies: ['environmental control', 'public accounting', 'decon flow', 'cargo security', 'lab verification'],
        failureModes: ['viability loss', 'theft', 'contamination', 'public legitimacy collapse', 'allocation conflict'],
        sceneUses: ['famine response', 'seed transition', 'relief convoy', 'custody dispute'],
        keywords: ['cargo', 'seed', 'relief', 'food', 'cold chain', 'public accounting'],
        refs: ['6.3 Relief cargo, seed custody, and cold chain'],
        summary: 'Cargo is a regional life-support system with temperature, custody, destination, viability, and legitimacy.'
      }),
      system({
        id: 'norway.pylon-field-power',
        name: 'Pylon field support and compact power grid',
        scope: 'Wing-pylon warp field, aft bay geometry, and shipwide power distribution',
        capability: 'Coordinates warp field stability, shields, shuttlebay approach, and relief system power under compact-grid limits.',
        dependencies: ['pylon integrity', 'warp field control', 'shuttle approach window', 'cargo environmental load', 'shield demand'],
        failureModes: ['pylon stress', 'bay approach delay', 'power brownout', 'shield compromise', 'warp limit'],
        sceneUses: ['pylon damage', 'shuttle recovery', 'convoy timing', 'relief power triage'],
        keywords: ['pylon', 'warp field', 'power grid', 'shuttlebay', 'pylon gap', 'engineering'],
        refs: ['6.4 Pylon field support and compact power grid'],
        summary: 'The pylon gap and power grid are operational constraints, not decoration.'
      }),
      system({
        id: 'norway.public-accounting',
        name: 'Public accounting and relief legitimacy',
        scope: 'Mission ops ledgers, supply boards, public-facing records, and command authorization',
        capability: 'Makes scarce relief choices visible, inspectable, and challengeable enough to sustain trust.',
        dependencies: ['accurate inventory', 'local data', 'command authorization', 'communications', 'crew transparency discipline'],
        failureModes: ['rumor', 'favoritism allegation', 'panic', 'hidden stock accusation', 'legitimacy collapse'],
        sceneUses: ['supply dispute', 'public briefing', 'faction challenge', 'relief allocation'],
        keywords: ['accounting', 'ledger', 'supply board', 'public trust', 'relief', 'legitimacy'],
        refs: ['6.5 Public accounting'],
        summary: 'Public accounting lets relief choices become playable pressure instead of hidden math.'
      })
    ]
  }
};

const PACKAGES = [
  {
    classKey: 'steamrunner',
    datasetId: 'glass-harbor.steamrunner-class',
    output: 'packages/bundled/glass-harbor/glass-harbor-steamrunner-class.ship-dataset.json',
    packagePath: 'packages/bundled/glass-harbor/drowned-constellation.campaign-package.json',
    packageId: 'directive:campaign-package:glass-harbor-drowned-constellation',
    shipId: 'uss-glass-harbor',
    shipName: 'U.S.S. Glass Harbor',
    title: 'U.S.S. Glass Harbor Steamrunner-Class Ship Dataset',
    status: 'draft',
    campaignSlug: 'drowned-constellation',
    campaignTitle: 'Drowned Constellation',
    campaignSourceTitle: 'Glass Harbor / Drowned Constellation',
    campaignSourcePath: 'docs/campaigns/GLASS_HARBOR_DROWNED_CONSTELLATION.md',
    campaignSourceRole: 'campaign-reference',
    campaignUse: 'Nerine Reef route-security, gravitic survey, civilian rescue support, towing, and chart custody.',
    campaignKeywords: ['Nerine Reef', 'gravitic route', 'survey buoy', 'sanctuary', 'chart custody']
  },
  {
    classKey: 'steamrunner',
    datasetId: 'serein.steamrunner-class',
    output: 'packages/bundled/serein/serein-steamrunner-class.ship-dataset.json',
    packagePath: 'packages/bundled/serein/black-current.campaign-package.json',
    packageId: 'directive:campaign-package:serein-black-current',
    shipId: 'uss-serein',
    shipName: 'U.S.S. Serein',
    title: 'U.S.S. Serein Steamrunner-Class Ship Dataset',
    status: 'draft',
    campaignSlug: 'black-current',
    campaignTitle: 'Black Current',
    campaignSourceTitle: 'Serein / Black Current',
    campaignSourcePath: 'docs/campaigns/SEREIN_BLACK_CURRENT.md',
    campaignSourceRole: 'campaign-reference',
    campaignUse: 'Vanta Wake hazardous recovery, survivor triage, towing, evidence custody, ordnance safety, and corridor reopening.',
    campaignKeywords: ['Vanta Wake', 'emergence', 'tractor tow', 'survivor recovery', 'evidence custody']
  },
  {
    classKey: 'newOrleans',
    datasetId: 'aster-vale.new-orleans-class',
    output: 'packages/bundled/aster-vale/aster-vale-new-orleans-class.ship-dataset.json',
    packagePath: 'packages/bundled/aster-vale/unseen-border.campaign-package.json',
    packageId: 'directive:campaign-package:aster-vale-unseen-border',
    shipId: 'uss-aster-vale',
    shipName: 'U.S.S. Aster Vale',
    title: 'U.S.S. Aster Vale New Orleans-Class Ship Dataset',
    status: 'draft',
    campaignSlug: 'unseen-border',
    campaignTitle: 'Unseen Border',
    campaignSourceTitle: 'Aster Vale / Unseen Border',
    campaignSourcePath: 'docs/campaigns/ASTER_VALE_UNSEEN_BORDER.md',
    campaignSourceRole: 'campaign-reference',
    campaignUse: 'Lacuna March frontier patrol, chart validation, protected visibility, evidence custody, asylum, and modular mission-pod work.',
    campaignKeywords: ['Lacuna March', 'mission pod', 'chart validation', 'protected visibility', 'asylum']
  },
  {
    classKey: 'norway',
    datasetId: 'celandine.norway-class',
    output: 'packages/bundled/celandine/celandine-norway-class.ship-dataset.json',
    packagePath: 'packages/bundled/celandine/enemys-garden.campaign-package.json',
    packageId: 'directive:campaign-package:celandine-enemys-garden',
    shipId: 'uss-celandine',
    shipName: 'U.S.S. Celandine',
    title: 'U.S.S. Celandine Norway-Class Ship Dataset',
    status: 'draft',
    campaignSlug: 'enemys-garden',
    campaignTitle: "Enemy's Garden",
    campaignSourceTitle: "Celandine / Enemy's Garden",
    campaignSourcePath: 'docs/campaigns/CELANDINE_ENEMYS_GARDEN.md',
    campaignSourceRole: 'campaign-reference',
    campaignUse: 'Cyradon relief, agricultural science, seed custody, quarantine, crop transition, and convoy protection.',
    campaignKeywords: ['Cyradon', 'seed custody', 'quarantine', 'agricultural lab', 'public accounting']
  }
];

function readPackageVersion(packagePath) {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(root, packagePath), 'utf8'));
  return pkg.manifest?.version || '0.1.0-pre-alpha.1';
}

function cardBase({ id, type, title, datasetId, sourceRef, audiences, scope, lanes, keywords, priority = 'normal', summary, constraints, hardAnchors, textures, avoid = [], narratorSafe = true }) {
  const payload = {
    summary,
    constraints,
    narratorSafe,
    hardAnchors,
    textures
  };
  if (avoid.length) payload.avoid = avoid;
  return {
    id,
    type,
    title,
    datasetId,
    source: sourceRef,
    visibility: 'publicPackage',
    audiences,
    scope,
    gates: cloneJson(serviceGate),
    retrieval: {
      lanes,
      keywords,
      priority
    },
    payload
  };
}

function buildCards(classData, pkg, areas, systems) {
  const cards = [];
  const datasetId = pkg.datasetId;
  const doc = classData.document;
  const campaignUse = `${pkg.shipName}: ${pkg.campaignUse}`;
  const shipKeywords = [classData.classLabel, pkg.shipName, pkg.campaignTitle, ...pkg.campaignKeywords];

  cards.push(cardBase({
    id: `ship.${classData.classId}.class.identity`,
    type: 'ship.profile',
    title: `${classData.classLabel} storytelling identity`,
    datasetId,
    sourceRef: source(doc, classData.profileRefs),
    audiences: ['missionDirector', 'shipDirector', 'commandDirector', 'narrator'],
    scope: { campaigns: [pkg.campaignSlug], systems: systems.slice(0, 2).map((entry) => entry.id) },
    lanes: ['ship_identity', 'ship_area', 'ship_system'],
    keywords: unique(['ship', classData.classLabel, ...shipKeywords]),
    priority: 'high',
    summary: `${pkg.shipName} is a ${classData.classLabel} vessel. ${classData.identity.summary} Campaign use: ${campaignUse}`,
    constraints: classData.identity.constraints,
    hardAnchors: classData.identity.hardAnchors,
    textures: classData.identity.textures,
    avoid: classData.identity.avoid
  }));

  cards.push(cardBase({
    id: `ship.${classData.classId}.exterior.silhouette`,
    type: 'ship.exterior',
    title: `${classData.classLabel} exterior silhouette`,
    datasetId,
    sourceRef: source(doc, classData.exteriorRefs),
    audiences: ['missionDirector', 'shipDirector', 'narrator'],
    scope: { campaigns: [pkg.campaignSlug], systems: systems.map((entry) => entry.id).slice(0, 3) },
    lanes: ['ship_exterior', 'ship_area'],
    keywords: unique(['exterior', 'hull', 'silhouette', ...shipKeywords]),
    priority: 'normal',
    summary: classData.exterior.summary,
    constraints: classData.exterior.constraints,
    hardAnchors: classData.exterior.hardAnchors,
    textures: classData.exterior.textures
  }));

  const shuttleArea = areas.find((entry) => entry.keywords.some((keyword) => /shuttle\s*bay|shuttlebay/i.test(keyword)));
  if (shuttleArea) {
    cards.push(cardBase({
      id: `ship.${classData.classId}.exterior.shuttlebay-approach`,
      type: 'ship.exterior',
      title: `${classData.classLabel} shuttlebay approach`,
      datasetId,
      sourceRef: source(doc, classData.shuttleRefs),
      audiences: ['missionDirector', 'shipDirector', 'commandDirector', 'narrator'],
      scope: {
        campaigns: [pkg.campaignSlug],
        locations: [shuttleArea.id],
        systems: shuttleArea.systems || []
      },
      lanes: ['ship_exterior', 'ship_area', 'shuttlebay', 'opening_shuttle_rendezvous'],
      keywords: unique(['shuttlebay', 'shuttle bay', 'shuttle', 'hangar', 'docking', 'approach', ...shuttleArea.keywords, ...shipKeywords]),
      priority: 'critical',
      summary: `${shuttleArea.summary} ${shuttleArea.hardFacts.join(' ')}`,
      constraints: shuttleArea.constraints,
      hardAnchors: shuttleArea.hardFacts,
      textures: shuttleArea.textures,
      avoid: shuttleArea.constraints.filter((entry) => /do not|avoid|not/i.test(entry))
    }));
  }

  for (const entry of areas) {
    const isShuttle = entry === shuttleArea;
    cards.push(cardBase({
      id: `ship.${classData.classId}.location.${entry.id.split('.').slice(1).join('.')}`,
      type: 'ship.location',
      title: entry.name,
      datasetId,
      sourceRef: source(doc, entry.refs || ['5. Key Area Profiles']),
      audiences: unique(['missionDirector', 'shipDirector', 'narrator', isShuttle ? 'commandDirector' : ''].filter(Boolean)),
      scope: {
        campaigns: [pkg.campaignSlug],
        locations: [entry.id],
        systems: entry.systems || []
      },
      lanes: unique(['ship_area', entry.id.split('.')[1] || entry.id, isShuttle ? 'shuttlebay' : ''].filter(Boolean)),
      keywords: unique([...entry.keywords, ...pkg.campaignKeywords]),
      priority: isShuttle || /bridge|sickbay|engineering|mission ops/i.test(entry.name) ? 'high' : 'normal',
      summary: entry.summary,
      constraints: entry.constraints,
      hardAnchors: entry.hardFacts,
      textures: entry.textures
    }));
  }

  for (const entry of systems) {
    cards.push(cardBase({
      id: `ship.${classData.classId}.system.${entry.id.split('.').slice(1).join('.')}`,
      type: 'ship.system',
      title: entry.name,
      datasetId,
      sourceRef: source(doc, entry.refs || ['6. Ship Systems as Story Pressure']),
      audiences: ['missionDirector', 'shipDirector', 'commandDirector', 'narrator'],
      scope: {
        campaigns: [pkg.campaignSlug],
        systems: [entry.id]
      },
      lanes: ['ship_system', entry.id.split('.')[1] || entry.id],
      keywords: unique([...entry.keywords, ...pkg.campaignKeywords]),
      priority: /deflector|pod|quarantine|cargo|seed|pylon|tractor/i.test(entry.name) ? 'high' : 'normal',
      summary: entry.summary,
      constraints: [
        `Capability: ${entry.capability}`,
        `Dependencies: ${entry.dependencies.join('; ')}.`,
        `Failure modes: ${entry.failureModes.join('; ')}.`
      ],
      hardAnchors: [entry.scope, entry.capability],
      textures: entry.sceneUses
    }));
  }

  return cards;
}

function stripDatasetOnlyAreaFields(entry) {
  const next = cloneJson(entry);
  delete next.refs;
  delete next.summary;
  return next;
}

function stripDatasetOnlySystemFields(entry) {
  const next = cloneJson(entry);
  delete next.refs;
  delete next.summary;
  return next;
}

function buildIndexes(dataset) {
  const indexes = {
    byArea: {},
    bySystem: {},
    byType: {},
    byAudience: {},
    byRevealGate: {},
    byKeyword: {}
  };
  for (const entry of dataset.areas) indexes.byArea[entry.id] = [];
  for (const entry of dataset.systems) indexes.bySystem[entry.id] = [];
  for (const card of dataset.cards) {
    indexes.byType[card.type] ||= [];
    indexes.byType[card.type].push(card.id);
    for (const audience of card.audiences || []) {
      indexes.byAudience[audience] ||= [];
      indexes.byAudience[audience].push(card.id);
    }
    const gate = card.gates?.playerKnowledge || 'none';
    indexes.byRevealGate[gate] ||= [];
    indexes.byRevealGate[gate].push(card.id);
    for (const areaId of card.scope?.locations || []) {
      indexes.byArea[areaId] ||= [];
      indexes.byArea[areaId].push(card.id);
    }
    for (const systemId of card.scope?.systems || []) {
      indexes.bySystem[systemId] ||= [];
      indexes.bySystem[systemId].push(card.id);
    }
    for (const keyword of card.retrieval?.keywords || []) {
      const key = keyword.toLowerCase();
      indexes.byKeyword[key] ||= [];
      if (!indexes.byKeyword[key].includes(card.id)) indexes.byKeyword[key].push(card.id);
    }
  }
  for (const index of Object.values(indexes)) {
    for (const [key, values] of Object.entries(index)) index[key] = unique(values);
  }
  return indexes;
}

function buildDataset(pkg) {
  const classData = CLASSES[pkg.classKey];
  const version = readPackageVersion(pkg.packagePath);
  const areas = classData.areas.map(stripDatasetOnlyAreaFields);
  const systems = classData.systems.map(stripDatasetOnlySystemFields);
  const cards = buildCards(classData, pkg, classData.areas, classData.systems);
  const dataset = {
    manifest: {
      kind: 'directive.shipDataset',
      schemaVersion: 1,
      id: pkg.datasetId,
      packageId: pkg.packageId,
      shipId: pkg.shipId,
      classId: classData.classId,
      title: pkg.title,
      version,
      status: pkg.status
    },
    sources: [
      {
        title: classData.sourceTitle,
        path: classData.sourcePath,
        version: '0.1',
        role: 'ship-bible'
      },
      {
        title: pkg.campaignSourceTitle,
        path: pkg.campaignSourcePath,
        role: pkg.campaignSourceRole
      },
      {
        title: `${pkg.campaignTitle} campaign package`,
        path: pkg.packagePath,
        version,
        role: 'campaign-package'
      }
    ],
    areas,
    systems,
    cards,
    indexes: {}
  };
  dataset.indexes = buildIndexes(dataset);
  return dataset;
}

for (const pkg of PACKAGES) {
  const dataset = buildDataset(pkg);
  const outputPath = path.resolve(root, pkg.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  console.log(`Generated ${pkg.output}`);
}
