export const DIRECTIVE_GUIDANCE_DEFAULT_TUTORIAL_ID = 'tutorial.basic';

export const DIRECTIVE_TUTORIALS = Object.freeze([
  Object.freeze({
    id: 'tutorial.basic',
    title: 'Basic Walkthrough',
    summary: 'Learn the first playable loop: choose a campaign, inspect its routes, resolve a pending outcome, and return later.',
    trainingScenario: true,
    steps: Object.freeze([
      step('basic.welcome', 'Welcome To Directive', 'Directive adds campaign state, pending decisions, recovery, and player-safe context around the normal host chat.', {
        target: 'runtime.panel',
        fallbackTarget: 'route.campaign'
      }),
      step('basic.navigation', 'Directive Routes', 'The bottom route bar switches between Campaign, Mission, People, Ship, and Settings. Chat remains the play surface; Directive is for command, review, and recovery.', {
        target: 'route.campaign',
        fallbackTarget: 'runtime.panel'
      }),
      step('basic.campaign-command', 'Campaign Command', 'Campaign Command shows one card per campaign, targets the latest save, and keeps branch details in Records.', {
        route: 'campaign',
        target: 'campaign.command',
        fallbackTarget: 'route.campaign'
      }),
      step('basic.start-or-continue', 'Start Or Continue', 'New Campaign starts Character Creator. Load Latest Save or Open Campaign Chat continues an existing campaign without changing the campaign package.', {
        route: 'campaign',
        target: 'campaign.start',
        fallbackTarget: 'campaign.continue',
        prepare: 'campaign-library'
      }),
      step('basic.activation', 'Campaign Activation', 'Activation means the save, chat binding, intro, and prompt context are mounted. If setup is interrupted, recovery commands appear here.', {
        route: 'campaign',
        target: 'campaign.activation',
        fallbackTarget: 'campaign.command',
        prepare: 'campaign-command'
      }),
      step('basic.play-chat', 'Play In Chat', 'The bound campaign chat is where ordinary roleplay happens. Directive panels are for setup, review, recovery, and pending choices.', {
        target: 'chat.input',
        fallbackTarget: 'route.mission'
      }),
      step('basic.mission-overview', 'Mission Overview', 'Mission summarizes the active objective, player character, ship, campaign mode, and what needs attention next.', {
        route: 'mission',
        target: 'mission.overview',
        fallbackTarget: 'route.mission'
      }),
      step('basic.pending-outcome', 'Pending Outcome', 'Consequential player actions pause here as a provisional outcome before narration commits to chat.', {
        route: 'mission',
        target: 'mission.pending-outcome',
        fallbackTarget: 'mission.command-surface'
      }),
      step('basic.accept-outcome', 'Accept Outcome', 'Accept Outcome commits the mechanics packet and lets Directive continue with narration and state updates.', {
        route: 'mission',
        target: 'mission.outcome.accept',
        fallbackTarget: 'mission.pending-outcome'
      }),
      step('basic.crew-roster', 'Crew Roster', 'Crew shows player-facing officer context, posture, pressure, and remembered patterns without exposing raw scores.', {
        route: 'crew',
        target: 'crew.roster',
        fallbackTarget: 'route-body.crew',
        prepare: 'crew-roster'
      }),
      step('basic.crew-detail', 'Officer Detail', 'Select an officer to see their public profile, visible pressures, open work, command memory, and open threads.', {
        route: 'crew',
        target: 'crew.detail',
        fallbackTarget: 'crew.roster',
        prepare: 'crew-roster'
      }),
      step('basic.ship-readiness', 'Ship Readiness', 'Ship condition, damage, restrictions, and technical debt are campaign facts that can shape later options.', {
        route: 'ship',
        target: 'ship.readiness',
        fallbackTarget: 'route.ship'
      }),
      step('basic.mission-history', 'Mission History', 'Mission keeps visible objectives and related history together without exposing hidden Director state.', {
        route: 'mission',
        target: 'mission.quest.history',
        fallbackTarget: 'route.mission'
      }),
      step('basic.directive-assist', 'Directive Assist', 'Assist helps draft, brief, and frame player-character text before you send. It does not commit campaign state.', {
        target: 'assist.launcher',
        fallbackTarget: 'chat.input'
      }),
      step('basic.message-actions', 'Message Actions', 'Directive message actions live on host messages for reconciliation, intro rewrites, and marked passage tools.', {
        target: 'message.launcher',
        fallbackTarget: 'host.message-actions'
      }),
      step('basic.settings', 'Tips And Tutorials', 'Settings keeps tutorials and tips separate. You can restart walkthroughs, show a tip, or turn either prompt family off.', {
        route: 'settings',
        target: 'settings.guidance',
        fallbackTarget: 'route-body.settings',
        prepare: 'settings-systems'
      })
    ])
  }),
  Object.freeze({
    id: 'tutorial.advanced',
    title: 'Advanced Walkthrough',
    summary: 'Learn how Directive resolves consequential play, recovery, and provider routing.',
    trainingScenario: true,
    steps: Object.freeze([
      step('advanced.utility-pass', 'Utility Pass', 'Every player post is classified before heavier work so routine play stays fast.', {
        route: 'mission',
        target: 'mission.chat-play',
        fallbackTarget: 'route.mission'
      }),
      step('advanced.command-competence', 'Command Competence', 'Routine professional actions may be assumed when they are low-risk and fit the player intent.', {
        route: 'mission',
        target: 'mission.command-brief',
        fallbackTarget: 'route.mission'
      }),
      step('advanced.outcomes', 'Consequential Outcomes', 'Consequential actions go through Mission Director resolution before narration commits.', {
        route: 'mission',
        target: 'mission.pending-outcome',
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
      step('advanced.pressure', 'Pressure Records', 'Pressure records keep visible clocks and obligations available to future scenes without revealing hidden causes.', {
        route: 'mission',
        target: 'mission.pressure',
        fallbackTarget: 'mission.context',
        prepare: 'mission-context'
      }),
      step('advanced.open-threads', 'Open Threads', 'Open Threads preserve unresolved player-visible concerns that can return later.', {
        route: 'mission',
        target: 'mission.open-threads',
        fallbackTarget: 'mission.subtab.open-threads',
        prepare: 'mission-open-threads'
      }),
      step('advanced.sidework', 'Open World', 'Open World tracks optional side work, delegated tasks, and opportunities outside the current mission beat.', {
        route: 'mission',
        target: 'mission.open-world',
        fallbackTarget: 'mission.subtab.open-world',
        prepare: 'mission-open-world'
      }),
      step('advanced.records', 'Saves And Branches', 'Campaign Records contains manual saves, autosaves, branches, and load/delete controls away from the active chat loop.', {
        route: 'campaign',
        target: 'campaign.records',
        fallbackTarget: 'campaign.subtab.records',
        prepare: 'campaign-records'
      }),
      step('advanced.reconciliation', 'Scene Reconciliation', 'Message and marker tools let Directive review edited passages without blindly replaying the whole campaign.', {
        target: 'message.launcher',
        fallbackTarget: 'host.message-actions'
      }),
      step('advanced.providers', 'Provider Lanes', 'Provider routing changes which lane handles a role, not what that role is allowed to do.', {
        route: 'settings',
        target: 'settings.providers',
        fallbackTarget: 'route-body.settings',
        prepare: 'settings-providers'
      }),
      step('advanced.safety', 'Safety And Integrity', 'Safety controls are for recovery, protected edits, prompt context, storage checks, and other trust-preserving operations.', {
        route: 'settings',
        target: 'settings.safety',
        fallbackTarget: 'route-body.settings',
        prepare: 'settings-safety'
      })
    ])
  }),
  Object.freeze({
    id: 'tutorial.assist',
    title: 'Directive Assist Walkthrough',
    summary: 'Learn how Assist drafts player-character wording without committing campaign state.',
    trainingScenario: false,
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
      step('assist.continue-scene', 'Continue Scene', 'Continue Scene drafts a local scene-continuation cue. The sent message still goes through scene-navigation guards.', {
        target: 'assist.action.continueScene',
        fallbackTarget: 'assist.launcher',
        prepare: 'assist-menu'
      }),
      step('assist.cut-scene', 'Cut Within Scene', 'Cut Within Scene drafts a local scene-transition cue for the current unresolved situation.', {
        target: 'assist.action.cutWithinScene',
        fallbackTarget: 'assist.launcher',
        prepare: 'assist-menu'
      }),
      step('assist.apply', 'Apply To Chat', 'Apply to Chat copies the draft into the composer where you can still edit before sending.', {
        target: 'assist.preview.applyToChat',
        fallbackTarget: 'assist.launcher',
        prepare: 'assist-preview'
      }),
      step('assist.replace-selection', 'Replace Selection', 'If you selected composer text before asking Assist, Replace Selection updates only that highlighted span.', {
        target: 'assist.preview.replaceSelection',
        fallbackTarget: 'assist.preview.applyToChat',
        prepare: 'assist-preview'
      }),
      step('assist.try-again', 'Try Again', 'Try Again reruns the same Assist action. It changes the draft, not campaign state.', {
        target: 'assist.preview.tryAgain',
        fallbackTarget: 'assist.launcher',
        prepare: 'assist-preview'
      }),
      step('assist.restore', 'Restore Rough Text', 'Restore Rough Text returns the composer to the text that existed before applying an Assist draft.', {
        target: 'assist.preview.restoreRoughText',
        fallbackTarget: 'assist.launcher',
        prepare: 'assist-preview'
      }),
      step('assist.cancel', 'Cancel Assist', 'Cancel closes the Assist result without changing the composer.', {
        target: 'assist.preview.cancel',
        fallbackTarget: 'assist.launcher',
        prepare: 'assist-preview'
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
    trainingScenario: false,
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
      }),
      step('message.recalculate', 'Recalculate From Here', 'Recalculate From Here previews a mechanics replay from an older snapshot before you accept any replacement.', {
        target: 'message.action.recalculateFromHere',
        fallbackTarget: 'message.launcher',
        prepare: 'message-menu'
      }),
      step('message.clear-markers', 'Clear Reconciliation Set', 'Clear Reconciliation Set removes active start and end markers without scanning the chat.', {
        target: 'message.marker.clear',
        fallbackTarget: 'message.marker.status',
        prepare: 'marker-menu'
      })
    ])
  }),
  Object.freeze({
    id: 'tutorial.campaign-records',
    title: 'Campaign Records Walkthrough',
    summary: 'Learn package selection, active campaigns, checkpoints, and autosaves.',
    trainingScenario: true,
    steps: Object.freeze([
      step('records.command', 'Active Campaigns', 'Campaign lists one entry per playthrough and identifies its current checkpoint.', {
        route: 'campaign',
        target: 'campaign.session',
        fallbackTarget: 'campaign.command',
        prepare: 'campaign-command'
      }),
      step('records.library', 'Campaign Library', 'Library lets you inspect or import packages. Browsing packages does not change the active campaign state.', {
        route: 'campaign',
        target: 'campaign.library',
        fallbackTarget: 'campaign.subtab.library',
        prepare: 'campaign-library'
      }),
      step('records.start', 'New Campaign', 'New Campaign starts Character Creator for the selected package. It does not overwrite an existing save.', {
        route: 'campaign',
        target: 'campaign.start',
        fallbackTarget: 'campaign.library',
        prepare: 'campaign-library'
      }),
      step('records.records', 'Checkpoint Journal', 'The journal keeps immutable manual checkpoints grouped with their campaign.', {
        route: 'campaign',
        target: 'campaign.records',
        fallbackTarget: 'campaign.subtab.records',
        prepare: 'campaign-records'
      }),
      step('records.save-row', 'Checkpoint Row', 'Select a checkpoint to inspect its snapshot and available actions.', {
        route: 'campaign',
        target: 'campaign.records.save-row',
        fallbackTarget: 'campaign.records',
        prepare: 'campaign-records'
      }),
      step('records.inspector', 'Checkpoint Inspector', 'The inspector explains what the checkpoint contains before you load or delete it.', {
        route: 'campaign',
        target: 'campaign.records.inspector',
        fallbackTarget: 'campaign.records',
        prepare: 'campaign-records'
      }),
      step('records.checkpoint', 'Save Game', 'Save Game creates a named, immutable checkpoint without changing simulation state.', {
        route: 'campaign',
        target: 'campaign.records.save',
        fallbackTarget: 'campaign.records.inspector',
        prepare: 'campaign-records'
      })
    ])
  }),
  Object.freeze({
    id: 'tutorial.mission-outcomes',
    title: 'Mission Outcomes Walkthrough',
    summary: 'Learn pending interactions, provisional outcomes, command bearing, and recovery.',
    trainingScenario: true,
    steps: Object.freeze([
      step('outcomes.overview', 'Mission Overview', 'Mission tells you whether to continue in chat, resolve a pause, repair narration, or review an outcome.', {
        route: 'mission',
        target: 'mission.overview',
        fallbackTarget: 'route-body.mission'
      }),
      step('outcomes.chat-play', 'Chat Play Surface', 'The play surface summarizes the bound chat, prompt context, tracked turns, and current revision state.', {
        route: 'mission',
        target: 'mission.chat-play',
        fallbackTarget: 'mission.command-surface'
      }),
      step('outcomes.pending', 'Provisional Outcome', 'A consequential action becomes a provisional outcome before it can update state or post narration.', {
        route: 'mission',
        target: 'mission.pending-outcome',
        fallbackTarget: 'mission.command-surface'
      }),
      step('outcomes.accept', 'Accept Outcome', 'Accepting commits mechanics and visible consequences. Discarding leaves the committed campaign unchanged.', {
        route: 'mission',
        target: 'mission.outcome.accept',
        fallbackTarget: 'mission.pending-outcome'
      }),
      step('outcomes.bearing', 'Command Bearing', 'Command Bearing appears after a provisional outcome is known, so the intervention targets a real consequence.', {
        route: 'mission',
        target: 'mission.command-bearing',
        fallbackTarget: 'mission.pending-outcome'
      }),
      step('outcomes.context', 'Mission Context', 'Context keeps objectives, pressures, and active directives visible without moving them into hidden Settings state.', {
        route: 'mission',
        target: 'mission.context',
        fallbackTarget: 'mission.subtab.context',
        prepare: 'mission-context'
      }),
      step('outcomes.recovery', 'Recovery Console', 'Recovery is grouped away from normal command so repair tools are explicit and reviewable.', {
        route: 'mission',
        target: 'mission.recovery',
        fallbackTarget: 'mission.command-surface'
      })
    ])
  }),
  Object.freeze({
    id: 'tutorial.crew-ship-log',
    title: 'Crew, Ship, And Log Walkthrough',
    summary: 'Learn player-safe crew memory, ship readiness, and command history.',
    trainingScenario: true,
    steps: Object.freeze([
      step('crewship.character', 'Player Character', 'The Character tab shows player-facing identity, service record, Command Bearing, and visible crew interactions.', {
        route: 'crew',
        target: 'crew.character',
        fallbackTarget: 'route-body.crew',
        prepare: 'crew-character'
      }),
      step('crewship.bearing', 'Character Command Bearing', 'Command Bearing tracks visible evidence, reviews, reserve, and recent spends without exposing hidden scoring.', {
        route: 'crew',
        target: 'crew.command-bearing',
        fallbackTarget: 'crew.character',
        prepare: 'crew-character'
      }),
      step('crewship.roster', 'Duty Roster', 'The Crew tab opens officer dossiers from the Duty Roster.', {
        route: 'crew',
        target: 'crew.roster',
        fallbackTarget: 'crew.subtab.crew',
        prepare: 'crew-roster'
      }),
      step('crewship.relationships', 'Officer Memory', 'Officer details show qualitative posture, pressure, open work, memory, and open threads without raw relationship numbers.', {
        route: 'crew',
        target: 'crew.relationships',
        fallbackTarget: 'crew.detail',
        prepare: 'crew-roster'
      }),
      step('crewship.ship-hero', 'Ship Identity', 'Ship opens on the assigned vessel and the active campaign command context.', {
        route: 'ship',
        target: 'ship.hero',
        fallbackTarget: 'route-body.ship'
      }),
      step('crewship.readiness', 'Operational Readiness', 'Readiness folders separate damage, restrictions, and technical debt so risks stay specific.', {
        route: 'ship',
        target: 'ship.readiness',
        fallbackTarget: 'route-body.ship'
      }),
      step('crewship.damage', 'Damage Record', 'Ship records are player-visible campaign facts that can constrain future outcomes.', {
        route: 'ship',
        target: 'ship.readiness.damage',
        fallbackTarget: 'ship.readiness'
      }),
      step('crewship.log-overview', 'Command Log Overview', 'The Log is player-facing continuity from newest to oldest.', {
        route: 'log',
        target: 'log.overview',
        fallbackTarget: 'route-body.log'
      }),
      step('crewship.log-search', 'Search And Filters', 'Search and filters help find summaries, consequences, and committed inputs later.', {
        route: 'log',
        target: 'log.search',
        fallbackTarget: 'log.overview'
      }),
      step('crewship.log-latest', 'Latest Record', 'The latest record is expanded first so the most recent consequence is easy to inspect.', {
        route: 'log',
        target: 'log.entry.latest',
        fallbackTarget: 'log.timeline'
      })
    ])
  }),
  Object.freeze({
    id: 'tutorial.settings-safety',
    title: 'Settings And Safety Walkthrough',
    summary: 'Learn guidance controls, provider lanes, diagnostics, prompt safety, and recovery settings.',
    trainingScenario: true,
    steps: Object.freeze([
      step('settings.guidance', 'Tips And Tutorials', 'Tutorial prompts and startup tips have separate toggles, and every walkthrough can be restarted here.', {
        route: 'settings',
        target: 'settings.guidance',
        fallbackTarget: 'settings.systems',
        prepare: 'settings-systems'
      }),
      step('settings.library', 'Tutorial Library', 'The tutorial library lets players revisit Basic, Advanced, Assist, Message Actions, and focused route tutorials.', {
        route: 'settings',
        target: 'settings.guidance.library',
        fallbackTarget: 'settings.guidance',
        prepare: 'settings-systems'
      }),
      step('settings.tips', 'Startup Tips', 'Tips rotate after the first tutorial and can still be shown manually from Settings.', {
        route: 'settings',
        target: 'settings.guidance.tips-toggle',
        fallbackTarget: 'settings.guidance',
        prepare: 'settings-systems'
      }),
      step('settings.runtime', 'Runtime Controls', 'Runtime settings belong to the active campaign and should not hide campaign-owned facts in global Settings.', {
        route: 'settings',
        target: 'settings.runtime',
        fallbackTarget: 'settings.systems',
        prepare: 'settings-systems'
      }),
      step('settings.providers', 'Provider Lanes', 'Utility and Reasoning lanes can be configured separately, then tested before returning to play.', {
        route: 'settings',
        target: 'settings.providers',
        fallbackTarget: 'route-body.settings',
        prepare: 'settings-providers'
      }),
      step('settings.routing', 'Model Call Routing', 'Routing a role to another lane changes provider choice, not what the role is allowed to do.', {
        route: 'settings',
        target: 'settings.provider-routing',
        fallbackTarget: 'settings.providers',
        prepare: 'settings-providers'
      }),
      step('settings.safety', 'Safety', 'Safety surfaces keep prompt context, protected edits, storage checks, and recovery operations reviewable.', {
        route: 'settings',
        target: 'settings.safety',
        fallbackTarget: 'route-body.settings',
        prepare: 'settings-safety'
      }),
      step('settings.reset', 'Reset Tutorial Progress', 'Reset Tutorial Progress only re-enables the first-run tutorial offer. It does not change campaign state.', {
        route: 'settings',
        target: 'settings.guidance.reset',
        fallbackTarget: 'settings.guidance',
        prepare: 'settings-systems'
      })
    ])
  })
]);

export const DIRECTIVE_TIPS = Object.freeze([
  tip('tip.start.chat-is-play', 'Chat Is Play', 'The campaign chat is where you play. Directive routes are for setup, inspection, pending decisions, saves, and recovery.', 'mission', 'route.mission'),
  tip('tip.start.navigation', 'Directive Routes', 'The bottom route bar remembers the current route and keeps Campaign, Mission, People, Ship, and Settings available at every viewport.', null, 'route.campaign'),
  tip('tip.start.campaign-first', 'Campaign First', 'Choose or load a campaign from Campaign before expecting Mission, People, or Ship to show live state.', 'campaign', 'route.campaign'),
  tip('tip.start.bound-chat', 'Bound Campaign Chat', 'Directive only mutates campaign state from the bound campaign chat. Other chats should fail open or require rebind.', 'campaign', 'campaign.session', 'route-body.campaign'),
  tip('tip.start.settings-systems', 'Systems Controls', 'Settings > Systems is for runtime behavior and guidance preferences, not hidden campaign status.', 'settings', 'settings.systems', 'route-body.settings', 'settings-systems'),

  tip('tip.assist.open', 'Open Directive Assist', 'Use Directive Assist beside the chat box when you know the intent but want help wording the player-character message.', null, 'assist.launcher', 'chat.input'),
  tip('tip.assist.draft', 'Draft In Character', 'Draft In Character turns rough notes into editable in-character prose. It does not resolve success or commit state.', null, 'assist.action.draftInCharacter', 'assist.launcher', 'assist-menu'),
  tip('tip.assist.brief', 'Brief Me', 'Brief Me gives a short player-safe context summary before you send. It should not reveal hidden truth.', null, 'assist.action.briefMe', 'assist.launcher', 'assist-menu'),
  tip('tip.assist.order', 'Frame As Order', 'Frame as Order makes the instruction clear and lawful within the player officer authority.', null, 'assist.action.frameAsOrder', 'assist.launcher', 'assist-menu'),
  tip('tip.assist.report', 'Frame As Report', 'Frame as Report is for recommendations, updates, warnings, and professional assessments when an order is not the right tone.', null, 'assist.action.frameAsReport', 'assist.launcher', 'assist-menu'),
  tip('tip.assist.continue-scene', 'Continue Scene', 'Continue Scene drafts a local pacing cue. It still gets checked as the sent chat message.', null, 'assist.action.continueScene', 'assist.launcher', 'assist-menu'),
  tip('tip.assist.cut-scene', 'Cut Within Scene', 'Cut Within Scene drafts a local transition cue without granting a skip through durable outcomes.', null, 'assist.action.cutWithinScene', 'assist.launcher', 'assist-menu'),
  tip('tip.assist.apply', 'Apply To Chat', 'Apply to Chat replaces the current composer text with the draft. You can still edit it before sending.', null, 'assist.preview.applyToChat', 'assist.launcher', 'assist-preview'),
  tip('tip.assist.replace-selection', 'Replace Selection', 'Select part of the chat input before running Assist to replace only that selection with the draft.', null, 'assist.preview.replaceSelection', 'assist.launcher', 'assist-preview'),
  tip('tip.assist.try-again', 'Try Again', 'Try Again reruns the same Assist action. It changes the draft, not the campaign state.', null, 'assist.preview.tryAgain', 'assist.launcher', 'assist-preview'),
  tip('tip.assist.restore', 'Restore Rough Text', 'Restore Rough Text brings back the text that was in the composer before an Assist draft was applied.', null, 'assist.preview.restoreRoughText', 'assist.launcher', 'assist-preview'),
  tip('tip.assist.insert-summary', 'Insert Summary', 'Brief Me can insert a player-safe summary into the composer, but it does not overwrite unless you choose that action.', null, 'assist.preview.insertSummary', 'assist.launcher', 'assist-preview'),
  tip('tip.assist.cancel', 'Cancel Assist', 'Cancel closes the Assist result without changing the chat box.', null, 'assist.preview.cancel', 'assist.launcher', 'assist-preview'),
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
