export const DIRECTIVE_GUIDANCE_DEFAULT_TUTORIAL_ID = 'tutorial.v1';

function step(id, title, body, options = {}) {
  return Object.freeze({ id, title, body, ...options });
}

function tip(id, title, body, route = null, target = '', fallbackTarget = '', prepare = '') {
  return Object.freeze({ id, kind: 'tip', title, body, route, target, fallbackTarget, prepare });
}

export const DIRECTIVE_TUTORIALS = Object.freeze([
  Object.freeze({
    id: 'tutorial.v1',
    title: 'Directive V1 Walkthrough',
    summary: 'Learn the story-first loop and the five concise Directive routes.',
    trainingScenario: false,
    steps: Object.freeze([
      step('v1.launcher', 'Open Directive', 'The ship icon beside the composer opens and closes Directive. Chat remains the place where you play.', {
        target: 'runtime.launcher',
        fallbackTarget: 'chat.input',
      }),
      step('v1.routes', 'Five Deliberate Routes', 'Campaign, Mission, Crew, Ship, and Settings each own one kind of player-facing information.', {
        target: 'route.campaign',
        fallbackTarget: 'runtime.panel',
      }),
      step('v1.campaign', 'Campaign', 'Start or continue Ashes of Peace here. Other campaign art may appear as a disabled preview, but V1 does not load older campaign saves.', {
        route: 'campaign',
        target: 'campaign.command',
        fallbackTarget: 'route.campaign',
      }),
      step('v1.mission', 'Mission', 'Mission shows only discovered primary and optional objectives, real progress, and clocks that have actually become visible.', {
        route: 'mission',
        target: 'mission.overview',
        fallbackTarget: 'route.mission',
      }),
      step('v1.crew', 'Crew', 'Crew keeps stable identity, visible relationship posture, mission involvement, and rare meaningful moments—not conversation logs.', {
        route: 'crew',
        target: 'crew.roster',
        fallbackTarget: 'route.crew',
      }),
      step('v1.ship', 'Ship', 'Ship presents one operational overview with only material limitations. A passing mention does not become a tracker.', {
        route: 'ship',
        target: 'ship.readiness',
        fallbackTarget: 'route.ship',
      }),
      step('v1.bearing', 'Command Bearing', 'Command Bearing is one small reserve. Exceptional informed command may earn a point; an explicit narrative edge may spend one.', {
        route: 'crew',
        target: 'crew.command-bearing',
        fallbackTarget: 'route.crew',
      }),
      step('v1.swipes', 'Your Selection Is Canon', 'Swipe freely. Directive waits until your next player message before accepting the selected assistant response into story state.', {
        target: 'chat.input',
        fallbackTarget: 'runtime.launcher',
      }),
      step('v1.settings', 'Settings', 'Settings contains provider, presentation, storage, and guidance controls—not duplicate campaign information.', {
        route: 'settings',
        target: 'settings.systems',
        fallbackTarget: 'route.settings',
      }),
    ]),
  }),
]);

export const DIRECTIVE_TIPS = Object.freeze([
  tip('tip.v1.chat', 'Chat Is Play', 'Play in the bound campaign chat. Directive is the concise reference for accepted state.', 'mission', 'chat.input', 'route.mission'),
  tip('tip.v1.swipe', 'Swipe Before You Commit', 'A generated reply is accepted only when you send the next player message with that swipe selected.', null, 'chat.input', 'runtime.launcher'),
  tip('tip.v1.objectives', 'Objectives Stay Spoiler Safe', 'Undiscovered optional work remains hidden until the story gives your character a fair reason to know about it.', 'mission', 'mission.overview', 'route.mission'),
  tip('tip.v1.ship', 'One Ship Overview', 'Only material operational changes belong on Ship; atmosphere and isolated mentions stay in the prose.', 'ship', 'ship.readiness', 'route.ship'),
  tip('tip.v1.crew', 'Meaningful Crew Memory', 'Crew moments are distilled when an encounter matters, not recorded for every exchange.', 'crew', 'crew.roster', 'route.crew'),
  tip('tip.v1.bearing', 'Command Bearing Is Scarce', 'Command Bearing rewards exceptional informed command, not routine objective completion.', 'crew', 'crew.command-bearing', 'route.crew'),
  tip('tip.v1.native-editing', 'Native Editing', 'Use normal SillyTavern swipes, edits, and deletes. Directive invalidates affected accepted sources and rebuilds from what remains.', null, 'chat.input', 'runtime.launcher'),
]);

export function getDirectiveTutorial(tutorialId = DIRECTIVE_GUIDANCE_DEFAULT_TUTORIAL_ID) {
  return DIRECTIVE_TUTORIALS.find((tutorial) => tutorial.id === tutorialId) || DIRECTIVE_TUTORIALS[0] || null;
}

export function getDirectiveTip(tipId = '') {
  return DIRECTIVE_TIPS.find((tipItem) => tipItem.id === tipId) || null;
}
