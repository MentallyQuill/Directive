export const DIRECTIVE_GUIDANCE_DEFAULT_TUTORIAL_ID = 'tutorial.basic';

export const DIRECTIVE_TUTORIALS = Object.freeze([
  Object.freeze({
    id: 'tutorial.basic',
    title: 'Basic Walkthrough',
    summary: 'Learn the shortest path from opening Directive to playing in the campaign chat.',
    steps: Object.freeze([
      step('basic.command-spine', 'Command Spine', 'Route buttons open focused Directive surfaces while chat remains the play surface.', {
        target: 'route.campaign',
        fallbackTarget: 'runtime.panel'
      }),
      step('basic.campaign', 'Campaign', 'Campaign is where you choose a package, create a character draft, start play, and manage saves.', {
        route: 'campaign',
        target: 'route-body.campaign',
        fallbackTarget: 'route.campaign'
      }),
      step('basic.start-campaign', 'Start Campaign', 'Start Campaign creates campaign state, the first save, the bound chat, the intro, and prompt context.', {
        route: 'campaign',
        target: 'campaign.start',
        fallbackTarget: 'route-body.campaign'
      }),
      step('basic.play-chat', 'Play In Chat', 'The bound campaign chat is where ordinary roleplay happens. Directive panels are for setup, review, recovery, and pending choices.', {
        target: 'chat.input',
        fallbackTarget: 'route.mission'
      }),
      step('basic.mission', 'Mission', 'Mission shows pending interactions, outcomes, recovery tools, and current command context.', {
        route: 'mission',
        target: 'route-body.mission',
        fallbackTarget: 'route.mission'
      }),
      step('basic.crew', 'Crew', 'Crew shows player-facing officer context and remembered patterns without exposing raw approval scores.', {
        route: 'crew',
        target: 'route-body.crew',
        fallbackTarget: 'route.crew'
      }),
      step('basic.ship', 'Ship', 'Ship condition, damage, restrictions, and technical debt are campaign facts you can inspect.', {
        route: 'ship',
        target: 'route-body.ship',
        fallbackTarget: 'route.ship'
      }),
      step('basic.log', 'Log', 'Log records committed outcomes and visible consequences for later recall.', {
        route: 'log',
        target: 'route-body.log',
        fallbackTarget: 'route.log'
      }),
      step('basic.settings', 'Settings', 'Settings contains runtime controls, provider lanes, model-call diagnostics, safety tools, tips, and tutorials.', {
        route: 'settings',
        target: 'settings.systems',
        fallbackTarget: 'route-body.settings',
        prepare: 'settings-systems'
      })
    ])
  }),
  Object.freeze({
    id: 'tutorial.advanced',
    title: 'Advanced Walkthrough',
    summary: 'Learn how Directive resolves consequential play, recovery, and provider routing.',
    steps: Object.freeze([
      step('advanced.utility-pass', 'Utility Pass', 'Every player post is classified before heavier work so routine play stays fast.', {
        route: 'mission',
        target: 'route-body.mission',
        fallbackTarget: 'route.mission'
      }),
      step('advanced.command-competence', 'Command Competence', 'Routine professional actions may be assumed when they are low-risk and fit the player intent.', {
        route: 'mission',
        target: 'route-body.mission',
        fallbackTarget: 'route.mission'
      }),
      step('advanced.outcomes', 'Consequential Outcomes', 'Consequential actions go through Mission Director resolution before narration commits.', {
        route: 'mission',
        target: 'route-body.mission',
        fallbackTarget: 'route.mission'
      }),
      step('advanced.command-bearing', 'Command Bearing', 'Command Bearing may offer one relevant intervention after a provisional outcome is known.', {
        route: 'mission',
        target: 'mission.command-bearing',
        fallbackTarget: 'route-body.mission'
      }),
      step('advanced.recovery', 'Recovery', 'Recovery tools preserve trust when narration, posting, edits, or save branches need repair.', {
        route: 'mission',
        target: 'mission.recovery',
        fallbackTarget: 'route-body.mission'
      }),
      step('advanced.providers', 'Provider Lanes', 'Provider routing changes which lane handles a role, not what that role is allowed to do.', {
        route: 'settings',
        target: 'settings.providers',
        fallbackTarget: 'route-body.settings',
        prepare: 'settings-providers'
      })
    ])
  }),
  Object.freeze({
    id: 'tutorial.assist',
    title: 'Directive Assist Walkthrough',
    summary: 'Learn how Assist drafts player-character wording without committing campaign state.',
    steps: Object.freeze([
      step('assist.open', 'Open Assist', 'Directive Assist sits beside the chat box for pre-send wording help.', {
        target: 'assist.launcher',
        fallbackTarget: 'chat.input'
      }),
      step('assist.draft', 'Draft In Character', 'Draft In Character turns rough notes into editable in-character prose.', {
        target: 'assist.action.draftInCharacter',
        fallbackTarget: 'assist.launcher',
        prepare: 'assist-menu'
      }),
      step('assist.brief', 'Brief Me', 'Brief Me gives a short player-safe context summary before you send.', {
        target: 'assist.action.briefMe',
        fallbackTarget: 'assist.launcher',
        prepare: 'assist-menu'
      }),
      step('assist.order', 'Frame As Order', 'Frame as Order makes the instruction clear within the player officer authority.', {
        target: 'assist.action.frameAsOrder',
        fallbackTarget: 'assist.launcher',
        prepare: 'assist-menu'
      }),
      step('assist.report', 'Frame As Report', 'Frame as Report is for recommendations, updates, warnings, and professional assessments.', {
        target: 'assist.action.frameAsReport',
        fallbackTarget: 'assist.launcher',
        prepare: 'assist-menu'
      }),
      step('assist.final', 'Final Sent Text', 'The Mission Director reads the final sent chat, not the unsent Assist draft.', {
        target: 'chat.input',
        fallbackTarget: 'assist.launcher'
      })
    ])
  }),
  Object.freeze({
    id: 'tutorial.message-actions',
    title: 'Message Actions Walkthrough',
    summary: 'Learn where Directive message actions live and what each reconciliation action does.',
    steps: Object.freeze([
      step('message.open-host', 'Host Overflow First', 'Open the host message-actions overflow before using the Directive ship button.', {
        target: 'host.message-actions',
        fallbackTarget: 'message.launcher'
      }),
      step('message.open-directive', 'Directive Message Actions', 'The Directive ship button opens reconciliation and intro tools for that message.', {
        target: 'message.launcher',
        fallbackTarget: 'host.message-actions',
        prepare: 'message-host-menu'
      }),
      step('message.reconcile', 'Reconcile This Message', 'Reconcile This Message scans one edited or suspicious message for safe state updates.', {
        target: 'message.action.reconcileMessage',
        fallbackTarget: 'message.launcher',
        prepare: 'message-menu'
      }),
      step('message.range-start', 'Set Reconciliation Start', 'Set Reconciliation Start marks the first message in a passage you want Directive to scan.', {
        target: 'message.action.setStart',
        fallbackTarget: 'message.launcher',
        prepare: 'message-menu'
      }),
      step('message.range-end', 'Set Reconciliation End', 'Set Reconciliation End marks the last message in a passage you want Directive to scan.', {
        target: 'message.action.setEnd',
        fallbackTarget: 'message.launcher',
        prepare: 'message-menu'
      }),
      step('message.from-here', 'Reconcile From Here', 'Reconcile From Here scans from the selected message through the latest chat.', {
        target: 'message.action.reconcileFromHere',
        fallbackTarget: 'message.launcher',
        prepare: 'message-menu'
      })
    ])
  })
]);

export const DIRECTIVE_TIPS = Object.freeze([
  tip('tip.start.chat-is-play', 'Chat Is Play', 'The campaign chat is where you play. Directive routes are for setup, inspection, pending decisions, saves, and recovery.', 'mission', 'route.mission'),
  tip('tip.start.command-spine', 'Command Spine', 'The left spine remembers the current route. Click a route to open its drawer; click the same open route again to collapse it.', null, 'route.campaign'),
  tip('tip.start.campaign-first', 'Campaign First', 'Choose or load a campaign from Campaign before expecting Mission, Crew, Ship, or Log to show live state.', 'campaign', 'route.campaign'),
  tip('tip.start.bound-chat', 'Bound Campaign Chat', 'Directive only mutates campaign state from the bound campaign chat. Other chats should fail open or require rebind.', 'campaign', 'campaign.session', 'route-body.campaign'),
  tip('tip.start.settings-systems', 'Systems Controls', 'Settings > Systems is for runtime behavior and guidance preferences, not hidden campaign status.', 'settings', 'settings.systems', 'route-body.settings', 'settings-systems'),

  tip('tip.assist.open', 'Open Directive Assist', 'Use Directive Assist beside the chat box when you know the intent but want help wording the player-character message.', null, 'assist.launcher', 'chat.input'),
  tip('tip.assist.draft', 'Draft In Character', 'Draft In Character turns rough notes into editable in-character prose. It does not resolve success or commit state.', null, 'assist.action.draftInCharacter', 'assist.launcher', 'assist-menu'),
  tip('tip.assist.brief', 'Brief Me', 'Brief Me gives a short player-safe context summary before you send. It should not reveal hidden truth.', null, 'assist.action.briefMe', 'assist.launcher', 'assist-menu'),
  tip('tip.assist.order', 'Frame As Order', 'Frame as Order makes the instruction clear and lawful within the player officer authority.', null, 'assist.action.frameAsOrder', 'assist.launcher', 'assist-menu'),
  tip('tip.assist.report', 'Frame As Report', 'Frame as Report is for recommendations, updates, warnings, and professional assessments when an order is not the right tone.', null, 'assist.action.frameAsReport', 'assist.launcher', 'assist-menu'),
  tip('tip.assist.apply', 'Apply To Chat', 'Apply to Chat replaces the current composer text with the draft. You can still edit it before sending.', null, 'assist.preview.applyToChat', 'assist.launcher'),
  tip('tip.assist.replace-selection', 'Replace Selection', 'Select part of the chat input before running Assist to replace only that selection with the draft.', null, 'assist.preview.replaceSelection', 'assist.launcher'),
  tip('tip.assist.try-again', 'Try Again', 'Try Again reruns the same Assist action. It changes the draft, not the campaign state.', null, 'assist.preview.tryAgain', 'assist.launcher'),
  tip('tip.assist.restore', 'Restore Rough Text', 'Restore Rough Text brings back the text that was in the composer before an Assist draft was applied.', null, 'assist.preview.restoreRoughText', 'assist.launcher'),
  tip('tip.assist.insert-summary', 'Insert Summary', 'Brief Me can insert a player-safe summary into the composer, but it does not overwrite unless you choose that action.', null, 'assist.preview.insertSummary', 'assist.launcher'),
  tip('tip.assist.cancel', 'Cancel Assist', 'Cancel closes the Assist result without changing the chat box.', null, 'assist.preview.cancel', 'assist.launcher'),
  tip('tip.assist.final-message', 'Sent Text Matters', 'The Mission Director reads the final sent chat, not the unsent Assist draft. Edit before sending if the draft changed your intent.', null, 'chat.input', 'assist.launcher'),
  tip('tip.assist.no-rewards', 'Assist Is Not Progression', 'Using Assist does not award Command Bearing, relationship gains, or Command Log records. The sent action and committed outcome matter.', null, 'assist.launcher'),

  tip('tip.message.open', 'Directive Message Actions', 'Open the host message-actions overflow, then use the Directive ship button for reconciliation and intro tools.', null, 'message.launcher', 'host.message-actions', 'message-host-menu'),
  tip('tip.message.rewrite-intro', 'Rewrite Intro', 'Rewrite Intro regenerates the campaign intro before play begins. Once a player post exists, the intro should no longer be rewritten.', null, 'message.action.rewriteCampaignIntro', 'message.launcher', 'message-menu'),
  tip('tip.message.reconcile-this', 'Reconcile This Message', 'Use Reconcile This Message when one edited or suspicious message may affect Directive state. It does not replay later outcomes.', null, 'message.action.reconcileMessage', 'message.launcher', 'message-menu'),
  tip('tip.message.set-start', 'Set Reconciliation Start', 'Set Reconciliation Start marks the first message in a passage you want Directive to scan.', null, 'message.action.setStart', 'message.launcher', 'message-menu'),
  tip('tip.message.set-end', 'Set Reconciliation End', 'Set Reconciliation End marks the last message in a passage you want Directive to scan.', null, 'message.action.setEnd', 'message.launcher', 'message-menu'),
  tip('tip.message.reconcile-from-here', 'Reconcile From Here', 'Reconcile From Here scans from the selected message through the latest chat and proposes safe state updates.', null, 'message.action.reconcileFromHere', 'message.launcher', 'message-menu'),
  tip('tip.message.recalculate-from-here', 'Recalculate From Here', 'Recalculate From Here previews a mechanics replay from an older snapshot. It can replace or drop later outcomes only after review.', null, 'message.action.recalculateFromHere', 'message.launcher', 'message-menu'),
  tip('tip.message.marked-passage', 'Reconcile Marked Passage', 'Use Reconcile Marked Passage after setting start and end markers. Missing markers should report clearly without changing state.', null, 'assist.reconciliation.reconcileMarked', 'assist.launcher', 'assist-menu'),
  tip('tip.message.clear-markers', 'Clear Reconciliation Set', 'Clear Reconciliation Set removes active start and end markers without scanning the chat.', null, 'message.marker.clear', 'message.marker.status', 'marker-menu'),
  tip('tip.message.open-pending', 'Open Pending Reconciliation', 'Open Pending Reconciliation takes you to Mission when consequential or conflicting reconciliation items need review.', null, 'assist.reconciliation.openPending', 'assist.launcher', 'assist-menu'),
  tip('tip.message.keep-earlier', 'Keep Earlier Messages', 'When a marker range is too broad, Keep Earlier Messages moves the end marker before the selected message.', null, 'message.marker.keepEarlier', 'message.marker.status', 'marker-menu'),
  tip('tip.message.keep-later', 'Keep Later Messages', 'When a marker range is too broad, Keep Later Messages moves the start marker after the selected message.', null, 'message.marker.keepLater', 'message.marker.status', 'marker-menu'),
  tip('tip.message.host-shape', 'Host Overflow First', 'Directive message actions may stay hidden until the host message-actions overflow is opened.', null, 'host.message-actions', 'message.launcher'),

  tip('tip.mechanic.utility-pass', 'Cheap Utility Pass', 'Every player post gets a cheap classification pass or deterministic equivalent before heavier work.', 'mission', 'route-body.mission'),
  tip('tip.mechanic.scene-color', 'Scene Color', 'Flavor, small talk, and nonconsequential roleplay usually update prompt context and let the host continue.', 'mission', 'route-body.mission'),
  tip('tip.mechanic.routine-command', 'Routine Command', 'Routine professional actions can be handled without a full Director turn when they are low-risk and consistent with intent.', 'mission', 'route-body.mission'),
  tip('tip.mechanic.consequential-command', 'Consequential Command', 'Actions with mission, risk, relationship, authority, or resource consequences escalate to the Mission Director.', 'mission', 'route-body.mission'),
  tip('tip.mechanic.pending-interaction', 'Pending Interaction', 'Directive pauses for ambiguity, serious risk, authority review, Command Bearing, replacement review, or recovery.', 'mission', 'route-body.mission'),
  tip('tip.bearing.spend-window', 'Spend Window', 'A point is offered after the provisional outcome is known but before final narration and commit.', 'mission', 'mission.command-bearing', 'route-body.mission'),
  tip('tip.pressure.resolution', 'Resolving Pressure', 'A committed outcome can reduce, suppress, escalate, or resolve pressure records through the same transaction path as mission state.', 'mission', 'route-body.mission'),
  tip('tip.crew.relationships', 'Relationship Signals', 'Crew relationships update from sent messages and committed outcomes, not unsent drafts or hidden guesses.', 'crew', 'route-body.crew'),
  tip('tip.ship.damage', 'Ship Damage Matters', 'Ship damage, restrictions, and technical debt are campaign facts that can shape later options.', 'ship', 'route-body.ship'),
  tip('tip.log.visible-history', 'Visible History', 'The Log is player-facing continuity. It should explain what happened without leaking hidden state.', 'log', 'route-body.log'),

  tip('tip.provider.utility', 'Utility Provider', 'Utility handles fast bounded jobs such as classification, summaries, extraction, and proposal checks.', 'settings', 'settings.providers', 'route-body.settings', 'settings-providers'),
  tip('tip.provider.reasoning', 'Reasoning Provider', 'Reasoning handles deeper prose, counsel, campaign introductions, conclusions, Assist, and creator drafting.', 'settings', 'settings.providers', 'route-body.settings', 'settings-providers'),
  tip('tip.provider.routing', 'Role Routing', 'Routing a role to another lane changes provider choice, not what that role is allowed to do.', 'settings', 'settings.provider-routing', 'settings.providers', 'settings-providers'),
  tip('tip.provider.test', 'Test Provider', 'Use Test Provider after changing a lane so failures are separated from campaign workflow problems.', 'settings', 'settings.provider-test', 'settings.providers', 'settings-providers'),
  tip('tip.provider.model-calls', 'Model Call Journal', 'Model Calls show sanitized role, lane, status, latency, and request hashes without raw prompts or hidden context.', 'settings', 'settings.model-calls', 'settings.providers', 'settings-providers')
]);

export function getDirectiveTutorial(tutorialId = DIRECTIVE_GUIDANCE_DEFAULT_TUTORIAL_ID) {
  return DIRECTIVE_TUTORIALS.find((tutorial) => tutorial.id === tutorialId) || DIRECTIVE_TUTORIALS[0] || null;
}

export function getDirectiveTip(tipId = '') {
  return DIRECTIVE_TIPS.find((tipItem) => tipItem.id === tipId) || null;
}

function step(id, title, body, options = {}) {
  return Object.freeze({
    id,
    title,
    body,
    ...options
  });
}

function tip(id, title, body, route = null, target = '', fallbackTarget = '', prepare = '') {
  return Object.freeze({
    id,
    kind: 'tip',
    title,
    body,
    route,
    target,
    fallbackTarget,
    prepare,
    frequency: 'rotation'
  });
}
