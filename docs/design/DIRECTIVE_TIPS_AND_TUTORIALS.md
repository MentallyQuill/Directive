# Directive Tips And Tutorials

## Status

Design and implementation backlog for a pre-alpha guidance layer.

This document defines two related but separate systems:

- **Tutorials**: deliberate guided walkthroughs that teach a workflow across several controls.
- **Tips**: one-shot contextual help cards that teach one useful fact, action, or mechanic at a time.

Both systems should reuse one highlight-and-popover surface inspired by Saga's walkthroughs, but their product behavior is different. Tutorials are user-started learning paths. Tips are lightweight reminders that appear when they are useful and can be dismissed quickly.

## Source Inputs

Current Directive sources this design depends on:

- [Target User Flow](TARGET_USER_FLOW.md)
- [Directive Assist](DIRECTIVE_ASSIST.md)
- [Command Bearing System](COMMAND_BEARING_SYSTEM.md)
- [Command Competence Layer](COMMAND_COMPETENCE_LAYER.md)
- [Crew And Relationship Model](CREW_AND_RELATIONSHIP_MODEL.md)
- [Narrative Thread Engine](NARRATIVE_THREAD_ENGINE.md)
- [Scene Reconciliation Plan](../planning/SCENE_RECONCILIATION_PLAN.md)
- [Mission Director As-Coded](../architecture/MISSION_DIRECTOR_AS_CODED.md)
- [Chat-Native Runtime](../architecture/CHAT_NATIVE_RUNTIME.md)
- [Persistence And Continuity](../architecture/PERSISTENCE_AND_CONTINUITY.md)
- [First Campaign Workflow](../user/FIRST_CAMPAIGN_WORKFLOW.md)
- [Directive Operator Manual](../user/DIRECTIVE_OPERATOR_MANUAL.md)

Saga reference pattern:

- Saga's runtime tour engine uses external popovers, `data-saga-tour` anchors, route preparation, concrete control highlights, Back/Next/Close actions, and focused modules.
- Saga's Basic checklist mini-tours show why task help should use the same external popover without becoming the full walkthrough.

Directive should reuse the pattern, not the exact Saga terminology or styling.

## Core Decision

Create a shared **Directive Guidance** surface with two content modes.

```text
shared highlight and popover engine
  -> tutorial sequences
  -> single-tip cards
  -> Settings Systems controls
```

The first-start prompt should be a compact tip-style card, not a blocking modal:

```text
Directive can walk you through the command spine.

[Begin Tutorial] [Later] [Disable Tutorial] [Disable Tips]
```

Rules:

- First run offers the tutorial if tutorial prompts are enabled and the tutorial has not been completed.
- Finishing the first tutorial records tutorial completion and suppresses future tutorial startup offers.
- `Later` dismisses only the current offer.
- `Disable Tutorial` suppresses future tutorial offers but keeps manual tutorials available in Settings.
- `Disable Tips` suppresses startup and contextual tips, without suppressing manual tutorials.
- After tutorial completion, later runs may offer one tip if tips are enabled.
- Tips should never stack with preset-update dialogs, pending-risk prompts, or other critical recovery decisions.

## Product Boundaries

### Tutorials

Tutorials teach workflows:

- how to open and read the command spine;
- how to start a campaign;
- how to play in the bound campaign chat;
- how to interpret Mission pauses;
- how to use Assist and Message Actions;
- how to inspect Crew, Ship, Log, and Settings without exposing hidden state.

Tutorials can use multiple steps. They can navigate routes, open subtabs, and highlight concrete controls.

### Tips

Tips teach one thing:

- one command;
- one mechanic;
- one safety rule;
- one recovery tool;
- one source of useful information.

Tips can optionally include a `Show Me` action that navigates to one route and highlights one target. `Show Me` must target the smallest stable UI element named by the tip: a specific button or control first, then a sub-tab, then a subsection, then a larger section only when no narrower rendered target exists. Opening a page is route preparation, not the highlight target, unless the tip is explicitly about the page itself. A tip should not have a multi-step chain. If a tip needs more than one step, it should become a tutorial module.

## Preference State

Store guidance preferences as browser/user preference state, not campaign save state.

Recommended localStorage keys:

```text
directive.guidance.tutorialPromptsDisabled.v1
directive.guidance.tipsDisabled.v1
directive.guidance.firstTutorialCompleted.v1
directive.guidance.startupOfferDismissedAt.v1
directive.guidance.tipHistory.v1
directive.guidance.lastTipShownAt.v1
```

Do not store these in campaign saves. A player should be able to copy, branch, load, or archive campaign state without changing whether their browser asks about tutorials.

## Settings Systems Surface

Add a compact **Tips & Tutorials** card to Settings > Systems.

Controls:

| Control | Behavior |
| --- | --- |
| Tutorial prompts | Enable or disable automatic tutorial offers. |
| Startup tips | Enable or disable automatic tip offers. |
| Begin Tutorial | Start the main first-run tutorial from step one. |
| Show Tip | Show a relevant tip immediately. |
| Reset Tutorial Progress | Clears completion and lets the first-run tutorial prompt appear again. |

Keep this near the existing Interface Hints card because tooltips, tips, and tutorials are all guidance preferences.

## Shared Popover Behavior

The shared guidance surface should support:

- fixed popover outside the Directive drawer;
- target highlight via `data-directive-tour`;
- centered fallback when the target is missing;
- route preparation before target lookup;
- mobile-aware placement;
- `Back`, `Next`, and `Finish` for tutorials, plus an icon-only X close control in the popover header;
- `Show Me`, icon-only previous/next tip arrows, and `Disable Tips` for tips, plus the shared header X close control;
- a simple left-arrow tip control with hover text `Last Tip`;
- a simple right-arrow tip control with hover text `Next Tip`;
- Escape closes the current guidance card;
- no prompt-visible campaign prose;
- no hidden-state values in tip copy.

Tip navigation should use familiar arrow icons rather than text-heavy buttons. The left arrow returns to the previously shown tip when one exists. The right arrow advances to another eligible tip. Both arrow buttons must have accessible labels and Directive hover/focus tooltips matching their hover text exactly: `Last Tip` and `Next Tip`.

### Show Me Target Granularity

`Show Me` should never highlight a broad page, drawer, or route when the tip refers to a smaller rendered element. The highlight contract is:

| Tip Refers To | Preferred Highlight | Fallback Highlight |
| --- | --- | --- |
| Whole route or page | Route button, page title, or primary page header | Drawer body |
| Sub-tab | Exact sub-tab button | Containing section |
| Subsection or card | Exact card, panel, or subsection header | Route body |
| Specific action | Exact button, icon button, toggle, menu item, or action row | Containing action group |
| Conditional host control | Exact host control when visible | Centered explanation-only popover |

Use `target` for the narrowest intended `data-directive-tour` anchor. Use `fallbackTarget` only for missing, conditional, mobile, or host-dependent cases. For example, a `Test Provider` tip should highlight the `Test Provider` button, not the Settings page or Providers section. An Open World action tip should highlight the relevant Accept, Delegate, Pause, or Resolve control; only an area-level Open World overview tip should highlight the Open World sub-tab or section.

### Host Adjacent Targets

`Show Me` must also work outside the Directive drawer when the target is a SillyTavern-adjacent control installed by Directive. These targets should use the same popover and highlight system, but their resolver can map `data-directive-tour` target IDs onto stable host DOM hooks.

Directive Assist targets:

| Feature | Preferred Anchor |
| --- | --- |
| Assist launcher | `#directive-assist-button` |
| Assist menu action | `[data-directive-assist-action="<actionId>"]` |
| Assist reconciliation menu action | `[data-directive-reconciliation-action="<actionId>"]` |
| Assist preview action | `[data-directive-assist-preview-action="<actionId>"]` |

Assist menu `Show Me` preparation opens the Assist menu first, then highlights the exact action button: `draftInCharacter`, `briefMe`, `frameAsOrder`, or `frameAsReport`. Assist preview tips should highlight the exact preview button such as `applyToChat`, `replaceSelection`, `tryAgain`, `restoreRoughText`, `insertSummary`, or `cancel`; add those preview action anchors before treating those tips as implemented.

Directive Message Action targets:

| Feature | Preferred Anchor |
| --- | --- |
| Directive message-actions launcher | `[data-directive-message-actions="true"]` on the selected message |
| Directive message-action menu item | `[data-directive-message-action="<actionId>"]` |
| Reconciliation range status control | `[data-directive-reconciliation-status]` on the selected message |
| Reconciliation marker menu item | `[data-directive-reconciliation-action="<actionId>"]` |

Message Action `Show Me` preparation opens the host message-actions overflow when required, opens the Directive ship-button menu for the selected or latest eligible message, then highlights the exact Directive sub-button. `Reconcile This Message`, `Set Reconciliation Start`, `Set Reconciliation End`, `Reconcile From Here`, `Recalculate From Here`, and `Rewrite Intro` should each have their own highlight target. Marker-range tips should open the reconciliation status menu and highlight `clear`, `keepEarlier`, or `keepLater` directly when those controls are eligible.

Recommended step shape:

```js
{
  id,
  kind: 'tutorial' | 'tip',
  title,
  body,
  route,
  section,
  target, // narrowest meaningful data-directive-tour anchor
  fallbackTarget, // broader parent only when target is unavailable
  prepare,
  expected,
  when,
  tags,
  frequency,
  prerequisites
}
```

## Tutorial Library

### First-Run Tutorial

Purpose: teach the shortest path from opening Directive to playing and knowing where recovery lives.

Steps:

1. **Command Spine**: route buttons open focused control surfaces; the chat remains the play surface.
2. **Campaign**: choose a package, inspect readiness, create or load a campaign.
3. **Character Creator**: drafts are setup records, not campaign truth until Start Campaign.
4. **Start Campaign**: activation creates the campaign state, first save, bound chat, intro, and prompt context.
5. **Play In Chat**: the bound campaign chat is where ordinary roleplay happens.
6. **Mission Active**: pending interactions, outcomes, recovery, and current context live here.
7. **Crew**: officers remember player-visible patterns through summaries and memories, not raw approval scores.
8. **Ship**: ship condition, damage, restrictions, and technical debt are campaign facts.
9. **Log**: committed outcomes and visible consequences are player-facing continuity.
10. **Settings Systems**: runtime history, hints, tutorials, tips, and safety controls live here.

### Assist Tutorial

Purpose: teach pre-send player assistance without confusing it with Mission Director adjudication.

Steps:

1. Open Directive Assist beside the SillyTavern composer.
2. Draft In Character turns rough intent into editable player-character prose.
3. Brief Me summarizes player-safe context.
4. Frame as Order makes a lawful order clear.
5. Frame as Report turns intent into a report or recommendation.
6. Review the draft before applying it.
7. Apply to Chat, Replace Selection, Try Again, Restore Rough Text, or Cancel.
8. Send the final chat only when it says what the player wants.

### Message Actions Tutorial

Purpose: teach retcon and reconciliation tools.

Steps:

1. Open the SillyTavern message actions overflow.
2. Open Directive message actions.
3. Reconcile This Message for a single changed message.
4. Set Reconciliation Start and End for a passage.
5. Reconcile From Here for scan-and-patch.
6. Recalculate From Here only for mechanics replay previews.
7. Review Pending Reconciliation in Mission.

### Mechanics Tutorial

Purpose: explain why Directive sometimes pauses or records state.

Steps:

1. Every player post is classified before expensive work.
2. Routine professional actions may be assumed by Command Competence.
3. Consequential actions go through Mission Director resolution.
4. Mechanics commit before narration.
5. Command Bearing may offer an intervention before final narration.
6. Pressure records carry unresolved obligations and future work.
7. Relationships and crew memories change from committed play, not from assistant drafts.
8. Recovery tools preserve trust when narration, posting, edits, or branches fail.

### Settings And Safety Tutorial

Purpose: teach controls that affect provider behavior, persistence, and diagnostics.

Steps:

1. Systems contains runtime controls, hints, tips, and tutorial preferences.
2. Providers contains Utility and Reasoning lanes.
3. Model Call Routing moves roles between lanes without changing authority.
4. Model Calls shows sanitized diagnostics.
5. Safety verifies, settles, exports, reloads, and repairs records.
6. Prompt rebuild and rebind tools are recovery/admin paths, not ordinary first-start flow.

## Tip Backlog

Each tip should be implemented as one content record. The copy below is intentionally short enough for the popover surface. Tooltips and tutorials can use longer variants later.

### Startup And Navigation Tips

| ID | Title | Tip Copy | Show Me Target |
| --- | --- | --- | --- |
| `tip.start.chat-is-play` | Chat Is Play | The campaign chat is where you play. Directive routes are for setup, inspection, pending decisions, saves, and recovery. | Mission Active |
| `tip.start.command-spine` | Command Spine | The left spine remembers the current route. Click a route to open its drawer; click the same open route again to collapse it. | Route buttons |
| `tip.start.campaign-first` | Campaign First | Choose or load a campaign from Campaign before expecting Mission, Crew, Ship, or Log to show live state. | Campaign route |
| `tip.start.bound-chat` | Bound Campaign Chat | Directive only mutates campaign state from the bound campaign chat. Other chats should fail open or require rebind. | Campaign session card |
| `tip.start.no-manual-narrator` | No Manual Narrator | Start Campaign creates the Directive-owned character card and chat. You do not need to make a special narrator chat yourself. | Campaign activation |
| `tip.start.settings-systems` | Systems Controls | Settings > Systems is for runtime behavior and guidance preferences, not hidden campaign status. | Settings Systems |
| `tip.start.mobile-routes` | Mobile Routes | On phone width, the same six routes move to the bottom bar. The workflow stays the same. | Mobile route bar |

### Directive Assist Tips

| ID | Title | Tip Copy | Show Me Target |
| --- | --- | --- | --- |
| `tip.assist.open` | Open Directive Assist | Use Directive Assist beside the chat box when you know the intent but want help wording the player-character message. | Assist launcher `#directive-assist-button` |
| `tip.assist.draft` | Draft In Character | Draft In Character turns rough notes into editable in-character prose. It does not resolve success or commit state. | Assist action `draftInCharacter` |
| `tip.assist.brief` | Brief Me | Brief Me gives a short player-safe context summary before you send. It should not reveal hidden truth. | Assist action `briefMe` |
| `tip.assist.order` | Frame As Order | Frame as Order makes the instruction clear and lawful within the player officer's authority. | Assist action `frameAsOrder` |
| `tip.assist.report` | Frame As Report | Frame as Report is for recommendations, updates, warnings, and professional assessments when an order is not the right tone. | Assist action `frameAsReport` |
| `tip.assist.apply` | Apply To Chat | Apply to Chat replaces the current composer text with the draft. You can still edit it before sending. | Assist preview action `applyToChat` |
| `tip.assist.replace-selection` | Replace Selection | Select part of the chat input before running Assist to replace only that selection with the draft. | Assist preview action `replaceSelection` |
| `tip.assist.try-again` | Try Again | Try Again reruns the same Assist action. It changes the draft, not the campaign state. | Assist preview action `tryAgain` |
| `tip.assist.restore` | Restore Rough Text | Restore Rough Text brings back the text that was in the composer before an Assist draft was applied. | Assist preview action `restoreRoughText` |
| `tip.assist.insert-summary` | Insert Summary | Brief Me can insert a player-safe summary into the composer, but it does not overwrite unless you choose that action. | Assist preview action `insertSummary` |
| `tip.assist.cancel` | Cancel Assist | Cancel closes the Assist result without changing the chat box. | Assist preview action `cancel` |
| `tip.assist.final-message` | Sent Text Matters | The Mission Director reads the final sent chat, not the unsent Assist draft. Edit before sending if the draft changed your intent. | Chat input |
| `tip.assist.no-rewards` | Assist Is Not Progression | Using Assist does not award Command Bearing, relationship gains, or Command Log records. The sent action and committed outcome matter. | Assist preview |
| `tip.assist.role-flexible` | Role-Aware Wording | Assist should adapt to the player role. A commander's order, an ensign's report, and a specialist's assessment should not sound identical. | Assist menu actions |

### Directive Message Action Tips

| ID | Title | Tip Copy | Show Me Target |
| --- | --- | --- | --- |
| `tip.message.open` | Directive Message Actions | Open the host message-actions overflow, then use the Directive ship button for reconciliation and intro tools. | Message actions launcher |
| `tip.message.rewrite-intro` | Rewrite Intro | Rewrite Intro regenerates the campaign intro before play begins. Once a player post exists, the intro should no longer be rewritten. | Message action `rewriteCampaignIntro` |
| `tip.message.reconcile-this` | Reconcile This Message | Use Reconcile This Message when one edited or suspicious message may affect Directive state. It does not replay later outcomes. | Message action `reconcileMessage` |
| `tip.message.set-start` | Set Reconciliation Start | Set Reconciliation Start marks the first message in a passage you want Directive to scan. | Message action `setStart` |
| `tip.message.set-end` | Set Reconciliation End | Set Reconciliation End marks the last message in a passage you want Directive to scan. | Message action `setEnd` |
| `tip.message.reconcile-from-here` | Reconcile From Here | Reconcile From Here scans from the selected message through the latest chat and proposes safe state updates. It does not rerun Mission Director outcomes. | Message action `reconcileFromHere` |
| `tip.message.recalculate-from-here` | Recalculate From Here | Recalculate From Here previews a mechanics replay from an older snapshot. It can replace or drop later outcomes only after review. | Message action `recalculateFromHere` |
| `tip.message.marked-passage` | Reconcile Marked Passage | Use Reconcile Marked Passage after setting start and end markers. Missing markers should report clearly without changing state. | Assist reconciliation action `reconcileMarked` |
| `tip.message.clear-markers` | Clear Reconciliation Set | Clear Reconciliation Set removes active start and end markers without scanning the chat. | Marker action `clear` |
| `tip.message.open-pending` | Open Pending Reconciliation | Open Pending Reconciliation takes you to Mission when consequential or conflicting reconciliation items need review. | Assist reconciliation action `openPending` |
| `tip.message.keep-earlier` | Keep Earlier Messages | When a marker range is too broad, Keep Earlier Messages moves the end marker before the selected message. | Marker action `keepEarlier` |
| `tip.message.keep-later` | Keep Later Messages | When a marker range is too broad, Keep Later Messages moves the start marker after the selected message. | Marker action `keepLater` |
| `tip.message.host-shape` | Host Overflow First | In SillyTavern, Directive message actions may stay hidden until the host message-actions overflow is opened. | Host message actions |

### Core Runtime Mechanic Tips

| ID | Title | Tip Copy | Show Me Target |
| --- | --- | --- | --- |
| `tip.mechanic.utility-pass` | Cheap Utility Pass | Every player post gets a cheap classification pass or deterministic equivalent before heavier work. | Mission Active |
| `tip.mechanic.scene-color` | Scene Color | Flavor, small talk, and nonconsequential roleplay usually update prompt context and let the host continue. | Mission Active |
| `tip.mechanic.routine-command` | Routine Command | Routine professional actions can be handled without a full Director turn when they are low-risk and consistent with intent. | Mission Context |
| `tip.mechanic.consequential-command` | Consequential Command | Actions with mission, risk, relationship, authority, or resource consequences escalate to the Mission Director. | Mission Active |
| `tip.mechanic.pending-interaction` | Pending Interaction | Directive pauses for ambiguity, serious risk, authority review, Command Bearing, replacement review, or recovery. | Mission Active |
| `tip.mechanic.exactly-one-response` | One Response Path | A player post either lets host generation continue, gets one Directive-owned response, or creates one pause. | Mission Active |
| `tip.mechanic.mechanics-before-prose` | Mechanics Before Prose | Directive commits structured mechanics before narration. Prose is presentation, not the source of hidden truth. | Latest outcome |
| `tip.mechanic.narration-retry` | Narration Retry | If narration fails after mechanics commit, retry narration from the same outcome instead of rerolling the result. | Recovery Console |
| `tip.mechanic.rewrite-vs-rerun` | Rewrite Versus Rerun | Rewrite Narration changes prose from the same mechanics. Rerun Outcome previews new mechanics from the retained snapshot. | Recovery Console |
| `tip.mechanic.delete-outcome` | Delete Outcome | Delete Outcome restores the pre-outcome snapshot for the selected outcome. It is a recovery tool, not normal play. | Recovery Console |
| `tip.mechanic.autosave` | Stable Autosaves | Autosaves happen after stable narrated turns. Failed narration should create recovery state instead of corrupting the save. | Campaign Records |
| `tip.mechanic.save-as` | Save Game As | Save Game As branches the current campaign state and updates the active chat binding to the new save. | Campaign Records |
| `tip.mechanic.active-chat-save-guard` | Active Chat Save Guard | Save Game and Save Game As should verify that the active host chat matches the loaded campaign save. | Campaign Records |
| `tip.mechanic.prompt-context` | Prompt Context | Prompt context is rebuilt from authoritative campaign state, not loose model memory or chat scraping. | Campaign session |
| `tip.mechanic.prompt-suspended` | Suspended Prompt | If prompt context is suspended, open or rebind the campaign chat and rebuild prompt context from Campaign or Mission. | Campaign session |

### Pressure Tips

| ID | Title | Tip Copy | Show Me Target |
| --- | --- | --- | --- |
| `tip.pressure.what-it-is` | What Pressure Means | Pressure is durable unresolved force: ship, crew, regional, or obligation state that can matter later. | Mission Context |
| `tip.pressure.not-a-timer` | Not Just A Timer | Pressure can imply urgency, escalation, routing, or future work, but it is not always a visible countdown. | Mission Context |
| `tip.pressure.player-safe` | Player-Safe Pressure | Mission shows player-facing pressure summaries. Hidden raw scoring and Director-only routing stay concealed. | Mission Context |
| `tip.pressure.routing` | Pressure Routes Future Work | Pressure links can help later phases, Open World work, and side assignments surface naturally. | Open World |
| `tip.pressure.resolution` | Resolving Pressure | A committed outcome can reduce, suppress, escalate, or resolve pressure records through the same transaction path as mission state. | Latest outcome |
| `tip.pressure.technical-debt` | Technical Debt Pressure | Ship repairs, shortcuts, and accepted limitations can become pressure that follows the campaign until addressed. | Ship route |
| `tip.pressure.obligation` | Obligation Pressure | Promises, investigations, legal exposure, evidence custody, and delayed duties can become obligation pressure. | Mission Context |
| `tip.pressure.crew` | Crew Pressure | Crew fatigue, unresolved disagreement, or officer strain can become pressure when it creates future operational concern. | Crew route |
| `tip.pressure.open-orders` | Pressure To Open World | Some pressure may produce optional side work, but not every pressure becomes a quest. | Open World |

### Command Bearing Tips

| ID | Title | Tip Copy | Show Me Target |
| --- | --- | --- | --- |
| `tip.bearing.what-it-is` | Command Bearing | Command Bearing tracks leadership history and creates rare typed intervention points. It is not morality or luck. | Mission Active |
| `tip.bearing.inspiration` | Inspiration | Inspiration is leadership through trust, shared purpose, dignity, transparency, and voluntary cooperation. | Command Bearing prompt |
| `tip.bearing.resolve` | Resolve | Resolve is leadership through legitimate authority, preparation, boundaries, discipline, and accepted responsibility. | Command Bearing prompt |
| `tip.bearing.marks` | Command Marks | Marks are earned after meaningful command decisions or story closure when Agency, Commitment, and Causality are present. | Log route |
| `tip.bearing.rank` | Bearing Rank | Inspiration and Resolve ranks advance separately. Rank describes recognized pattern, not automatic success. | Command Bearing display |
| `tip.bearing.reserve` | Command Reserve | Inspiration and Resolve points share one small reserve, so advancing both tracks does not multiply total interventions. | Command Bearing display |
| `tip.bearing.recovery` | Recovery | Recovery can refill a point only at a qualifying interval such as downtime, transit, or chapter transition, and each interval applies once. | Command Bearing display |
| `tip.bearing.spend-window` | Spend Window | A point is offered after the provisional outcome is known but before final narration and commit. | Pending interaction |
| `tip.bearing.two-tiers` | Two-Tier Improvement | One eligible point improves Great Failure to Partial Failure, Failure to Partial Success, Partial Failure to Success, or Partial Success to Great Success. | Pending interaction |
| `tip.bearing.no-success-spend` | No Success Spend | Command Bearing cannot improve an existing Success or Great Success. It is an intervention resource, not a bonus stack. | Pending interaction |
| `tip.bearing.eligibility` | Eligibility Matters | Inspiration or Resolve must be causally relevant to the player's actual method. Keywords alone are not enough. | Pending interaction |
| `tip.bearing.anchored-costs` | Anchored Consequences | A point can improve the result, but it cannot erase a cost or fact already knowingly accepted. | Pending interaction |
| `tip.bearing.one-spend` | One Spend Per Outcome | Only one Command Bearing point can affect a resolved action, and duplicate spends are blocked by the ledger. | Pending interaction |
| `tip.bearing.branch-safety` | Branch Safety | Edits, deletes, and branch restores must roll back spends and awards tied to replaced outcomes. | Recovery Console |

### Command Competence Tips

| ID | Title | Tip Copy | Show Me Target |
| --- | --- | --- | --- |
| `tip.competence.core-rule` | Competence Rule | Directive supplies professional competence. The player supplies judgment. | Mission Context |
| `tip.competence.autocomplete` | Procedural Autocomplete | Routine, reversible, low-cost, noncontroversial steps can be assumed when they match your intent. | Mission Context |
| `tip.competence.command-brief` | Command Brief | The Command Brief gives concise context: routine response, known facts, uncertainty, pressure, and the command question. | Mission Context |
| `tip.competence.domain-reports` | Domain Reports | Officers can provide factual professional assessments. They are not omniscient answer dispensers. | Mission Context |
| `tip.competence.request-counsel` | Request Counsel | Ask for options, protocol, objections, or a domain read in natural language, or use Mission when a pause offers counsel. | Mission Active |
| `tip.competence.warning` | Procedural Warning | Serious foreseeable risk should be made visible before it is committed when the player character would recognize it. | Pending interaction |
| `tip.competence.authority-note` | Authority Notes | Authority notes explain chain of command, jurisdiction, emergency authority, and captain boundaries without blocking all unusual play. | Pending interaction |
| `tip.competence.no-gotcha` | No-Gotcha Consequences | Severe procedural consequences are fair only when the risk was communicated, inferable, knowingly bypassed, or genuinely concealed. | Mission Context |
| `tip.competence.retroactive` | Retroactive Competence | Routine reasonable preparation may be assumed retroactively when it is plausible and uncontradicted. | Mission Context |
| `tip.competence.not-optimal` | Not Autopilot | Competence does not make every order optimal or choose moral, tactical, or political answers for you. | Mission Context |

### Crew, Relationship, And Memory Tips

| ID | Title | Tip Copy | Show Me Target |
| --- | --- | --- | --- |
| `tip.crew.raw-values-hidden` | No Approval Scores | Crew relationships use hidden dimensions, but the UI shows qualitative summaries and memories, not raw numbers. | Crew route |
| `tip.crew.memory-ledger` | Memory Ledger | Officers remember consequential events and their interpretation of those events. Those memories explain later behavior. | Crew dossier |
| `tip.crew.same-event-different-memory` | Different Interpretations | Two officers can interpret the same player action differently because their values, roles, and concerns differ. | Crew dossier |
| `tip.crew.confidence-trust-rapport` | Three Relationship Axes | An officer can trust your competence, doubt your integrity, and still like you personally, or any other combination. | Crew dossier |
| `tip.crew.patterns-matter` | Patterns Matter | Relationship shifts should come from patterns and consequential events, not isolated approval prompts. | Crew dossier |
| `tip.crew.autonomy` | Crew Autonomy | Senior officers may advise, disagree, request meetings, make mistakes, or pursue goals without becoming disobedience machines. | Crew route |
| `tip.crew.dissent` | Dissent Is Useful | Inviting expertise and dissent can be professional leadership. It does not automatically weaken command authority. | Crew route |
| `tip.crew.private-state` | Private State Exists | Officers can have private goals, fears, strain, and secrets. Those are not exposed until play makes them visible. | Crew route |
| `tip.crew.memory-not-prompt` | Memory Is State | The model does not just remember vibes. Directive commits relationship memory into structured campaign state. | Crew dossier |
| `tip.crew.assist-does-not-count` | Drafts Do Not Count | Unsent Assist drafts do not change relationships. Officers respond to sent messages and committed outcomes. | Assist preview |

### Mission, Outcome, And Simulation Tips

| ID | Title | Tip Copy | Show Me Target |
| --- | --- | --- | --- |
| `tip.outcome.ladder` | Outcome Ladder | Consequential actions resolve across Great Failure, Failure, Partial Failure, Partial Success, Success, and Great Success. | Latest outcome |
| `tip.outcome.partial-failure` | Partial Failure Moves Forward | Partial Failure should still create progress, information, positioning, or protection from the worst result. | Latest outcome |
| `tip.outcome.great-failure` | Great Failure Needs Setup | Great Failure must arise from established risk. It should not be arbitrary catastrophe. | Latest outcome |
| `tip.outcome.command-mode` | Command Mode | Command mode preserves full deterministic consequence severity when visible risk is established. | Character/Campaign mode |
| `tip.outcome.exploration-mode` | Exploration Mode | Exploration mode can cap severe outcomes for the player and senior staff, while preserving hidden truth and causal flags. | Character/Campaign mode |
| `tip.outcome.anchored-risks` | Anchored Risks | Accepted risk, time loss, resource cost, and legal exposure can remain even when the main objective succeeds. | Mission Context |
| `tip.outcome.captain-authority` | Captain Authority | Captain boundaries are handled through structured authority packets and visible consequences, not arbitrary plot walls. | Pending interaction |
| `tip.outcome.counsel-not-answer` | Counsel Is Perspective | Officer counsel provides professional perspective. It should not identify a single correct answer. | Mission Context |

### Open Threads And Open World Tips

| ID | Title | Tip Copy | Show Me Target |
| --- | --- | --- | --- |
| `tip.threads.what-they-are` | Open Threads | Open Threads are visible ongoing concerns. Hidden, latent, and watchlisted threads stay out of the UI. | Mission Open Threads |
| `tip.threads.not-quests` | Threads Are Not Quests | A thread can be a vignette, recurring detail, character matter, or future opportunity. It does not have to become a quest. | Mission Open Threads |
| `tip.threads.player-interest` | Player Interest Matters | Following up on small details can turn them into watchlisted or active story material. Ignoring optional material should be valid. | Mission Open Threads |
| `tip.threads.pressure-vs-thread` | Pressure Versus Thread | Pressure asks what unresolved force exists. Thread asks what human or story material is worth remembering. | Mission Open Threads |
| `tip.openworld.available` | Open World Work | Open World shows optional side work and quest opportunities when campaign state makes them player-visible. | Mission Open World |
| `tip.openworld.accept` | Accept Side Work | Accepting an opportunity can make it active or foreground without replacing the main campaign. | Mission Open World |
| `tip.openworld.delegate` | Delegate Side Work | Delegating side work lets suitable actors handle it, but delegation still records campaign consequences. | Mission Open World |
| `tip.openworld.pause` | Pause Side Work | Pause foreground side work when the main campaign needs attention. The record should remain campaign-owned. | Mission Open World |
| `tip.openworld.abandon` | Abandon Side Work | Abandoning optional work is allowed, but the campaign may remember visible consequences. | Mission Open World |

### Ship, Log, And State Tips

| ID | Title | Tip Copy | Show Me Target |
| --- | --- | --- | --- |
| `tip.ship.condition` | Ship Condition | Ship condition, damage, restrictions, and technical debt are campaign facts, not flavor text. | Ship route |
| `tip.ship.technical-limits` | Technical Limits | Engineering limits can create costs or pressure even when the mission objective succeeds. | Ship route |
| `tip.log.player-facing` | Command Log | The Command Log summarizes committed player-facing outcomes. It is not the hidden source of truth. | Log route |
| `tip.log.no-hidden-truth` | Log Safety | Command Log text should not include hidden state refs, raw clocks, raw relationships, or Director-only facts. | Log route |
| `tip.state.structured-authority` | Structured State Is Authority | Chat prose is narrative evidence. Structured campaign state is the authoritative mechanics record. | Settings Safety |
| `tip.state.hidden-simulation` | Hidden Simulation | Hidden truths, raw relationship values, and pressure routing can exist without being shown to the player or narrator. | Settings Safety |
| `tip.state.verify` | Verify Active Save | Use Verify Active Save when storage or active-save identity looks suspicious. | Settings Safety |
| `tip.state.export` | Export Active Save | Export creates a passive backup of the current save without changing campaign state. | Settings Safety |
| `tip.state.settle` | Settle Active State | Settle Active State commits pending storage bookkeeping and stabilizes the active record. | Settings Safety |
| `tip.state.clean` | Clean Missing Records | Clean Missing Records removes orphaned index entries while preserving reported corrupt-payload errors. | Settings Safety |

### Provider And Diagnostics Tips

| ID | Title | Tip Copy | Show Me Target |
| --- | --- | --- | --- |
| `tip.provider.utility` | Utility Provider | Utility handles fast bounded jobs such as classification, summaries, extraction, and proposal checks. | Settings Providers |
| `tip.provider.reasoning` | Reasoning Provider | Reasoning handles deeper prose, counsel, campaign introductions, conclusions, Assist, and creator drafting. | Settings Providers |
| `tip.provider.routing` | Role Routing | Routing a role to another lane changes provider choice, not what that role is allowed to do. | Settings Providers |
| `tip.provider.keys` | Session Keys | Direct endpoint API keys are held for the current browser session and should not be written into saves or diagnostics. | Settings Providers |
| `tip.provider.test` | Test Provider | Use Test Provider after changing a lane so failures are separated from campaign workflow problems. | Settings Providers |
| `tip.provider.model-calls` | Model Call Journal | Model Calls show sanitized role, lane, status, latency, and request hashes without raw prompts or hidden context. | Settings Providers |
| `tip.provider.sidecar-authority` | Sidecar Authority | A model sidecar can propose state changes only through allowed roots and revision checks. It cannot directly rewrite the save. | Settings Providers |

## Initial Implementation Acceptance Criteria

The first implementation pass should prove:

- Startup tutorial offer appears once when enabled and incomplete.
- `Begin Tutorial`, `Later`, `Disable Tutorial`, and `Disable Tips` behave independently.
- Tutorial completion suppresses future tutorial startup prompts.
- Tips can still appear after tutorial completion when tips are enabled.
- Settings > Systems exposes both toggles and manual launch actions.
- At least one tutorial sequence navigates routes and highlights concrete `data-directive-tour` anchors.
- At least one tip highlights a concrete anchor with `Show Me`.
- `Show Me` uses the narrowest available `data-directive-tour` target and falls back to a larger parent only when the narrow target is unavailable.
- Tip popups expose icon-only left and right arrow controls with `Last Tip` and `Next Tip` hover/focus tooltips.
- Assist action tips cover each current Assist action and preview sub-button with exact anchors.
- Message action tips cover current Scene Reconciliation message actions, Assist reconciliation actions, and marker menu sub-buttons with exact anchors.
- Mechanics tips include Pressure, Command Bearing, Command Competence, crew memory, saves/recovery, and provider routing.
- No guidance copy includes hidden facts, raw relationship numbers, raw pressure scores, or prompt-visible setup prose.

## Verification Direction

Focused tests should cover:

- preference storage;
- first-run prompt gating;
- independent tutorial/tip disable toggles;
- Settings Systems controls;
- `data-directive-tour` anchor coverage;
- source checks that reject action-specific tips whose only target is a route, drawer, or broad page anchor;
- focused anchor checks for Assist menu actions, Assist preview actions, Directive message-action menu items, and reconciliation marker menu items;
- popover placement and highlight cleanup;
- no duplicate guidance popovers;
- regression checks for required tip categories;
- live SillyTavern smoke for Assist and message-action anchors.

When this becomes runtime behavior, update the Operator Manual with user-facing instructions and add render captures for the first-run offer, a tutorial step, a tip, and the Settings Systems card.
