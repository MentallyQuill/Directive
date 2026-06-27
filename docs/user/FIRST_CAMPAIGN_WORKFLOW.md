# First Campaign Workflow

Use this guide for the shortest path from opening Directive to playing the bundled Breckenridge / Ashes of Peace campaign in a normal SillyTavern chat.

Directive is pre-alpha. The chat-native lifecycle is implemented and contract-tested; live-host verification remains part of release qualification.

## 1. Open Directive

1. Install or load Directive in SillyTavern and reload the page.
2. Open the SillyTavern extensions menu and choose **Directive**.
3. Open **Campaign**, then select the bundled **Ashes of Peace** package.
4. Confirm that package, storage, Utility provider, and Reasoning provider diagnostics are ready.

Installing or browsing packages does not create campaign state and does not inject campaign context into the host model.

## 2. Configure Providers

Directive has two independent provider lanes under **Settings**:

- **Utility Provider** handles low-cost classification, continuity, summaries, prompt-context assistance, and bounded sidecar proposal checks.
- **Reasoning Provider** handles counsel, committed-outcome narration, campaign introductions, campaign conclusions, quest architecture, character drafting, and any role you manually route there.

Each lane can use:

- **Current Host Model**;
- **Host Connection Profile**;
- **OpenAI-Compatible Endpoint**.

Use **Test Provider** after changing a lane. Use **Model Call Routing** when a specific role should run through Utility or Reasoning instead of its default. Direct endpoint API keys are held for the current browser session only and are not written into extension settings, campaign state, saves, logs, or provider diagnostics.

The default for both lanes is the current SillyTavern model, so separate configuration is optional.

## 3. Create The Player Officer

1. On **Campaign**, choose **New Campaign**.
2. Complete identity, form of address, species, career background, formative experience, assignment reason, command traits, command flaw, and dossier review.
3. Select **Campaign Difficulty**: `Command` for full causal severity or `Exploration` for story-forward guardrails.
4. Use **Save Draft** to preserve unfinished setup.
5. Choose **Start Campaign** when the final dossier is ready.

Character Creator drafts are recoverable setup records. They are not authoritative campaign state.

## 4. Campaign Activation

**Start Campaign** runs an idempotent activation journal. Directive:

1. accepts the final creator draft;
2. projects the package into campaign-owned state;
3. initializes player, crew, ship, mission, pressure, relationship, Command Bearing, Command Log, turn, and save ledgers;
4. writes the first save;
5. creates and selects a Directive-owned host character card;
6. creates a fresh host chat for that Directive character card;
7. posts one in-character campaign introduction;
8. installs player-safe campaign prompt context;
9. opens the bound chat;
10. marks the campaign active.

The generated character and chat names use campaign context, preferring `Directive - Ashes of Peace` and falling back to `Directive` when the host rejects the longer name. If a matching Directive character card already exists, Directive creates the next available numbered card, such as `Directive - Ashes of Peace (1)` and `Directive - Ashes of Peace (2)`. The user does not need to create a special narrator character or manually name a Directive chat.

While activation runs, SillyTavern shows a compact Directive activity pill in the chat surface. During the slowest first-start step it reads **Writing opening scene...** and shows Save, Chat, and Opening Scene progress chips; it advances through prompt installation and clears after **Campaign ready.**

Activation steps are journaled. If setup is interrupted, **Finish Chat Setup** continues the remaining work. If setup fails, **Retry Chat Setup** reruns the journal without duplicating the chat or introduction.

The opening scene is mandatory. If it is missing because setup is still running, was interrupted, or the provider call failed, Campaign and Mission show **Opening Scene Required** with **Build Opening Scene**. You can leave it for later, but play, Save Game, and Save Game As remain blocked until the intro is posted.

Campaign Difficulty is stored with the campaign save. During play, change it from **Campaign > Command**; it applies to future outcomes only and does not rewrite committed Command Log entries or prior consequences.

## 5. Play In Chat

Write normal in-character posts in the bound campaign chat. The chat is the play surface; the Directive drawer is the campaign control and inspection surface.

Every player post passes through a cheap utility gate. Directive classifies it as one of:

- scene color;
- routine command;
- consequential command;
- counsel request;
- clarification required;
- risk confirmation required;
- Director response required;
- no Directive action.

Scene color and non-consequential roleplay normally continue through SillyTavern generation with current prompt context. Routine professional actions may update continuity or the Command Log without a full adjudication. Consequential actions escalate into the existing Mission Director and any relevant relationship, crew, ship, Command Bearing, continuity, or side-work evaluators.

Directive enforces exactly one response path per player post:

- **Inject and continue:** Directive updates prompt context and allows ordinary host generation.
- **Directive-posted response:** Directive commits mechanics, generates from the committed packet, aborts the ordinary generation, and posts one in-character response itself.

## 6. Resolve A Pause

Directive pauses only for material ambiguity, serious foreseeable risk, authority boundaries, eligible Command Bearing intervention, meaningful choice, or recoverable provider failure.

Open **Mission** to review **Pending Interaction**. Depending on the interaction, available actions include:

- confirm risk;
- accept the committed direction;
- invoke an eligible Inspiration or Resolve spend;
- revise or dismiss the order;
- open the campaign chat to clarify.

The old Mission command textarea remains only as a fallback for hosts or recovery conditions that cannot intercept chat. It is not the default play loop.

## 7. Inspect Campaign State

Use the Directive routes without leaving the play chat:

- **Campaign:** bound-chat identity, activation status, prompt revision, campaign snapshot, saves, package selection, conclusion, and archive controls.
- **Mission:** active context, pending review, committed outcome, side work, and recovery.
- **Crew:** player-safe senior-staff continuity and relationship descriptors.
- **Ship:** current condition, damage, repair state, restrictions, and technical debt.
- **Log:** committed Command Log and recent continuity.
- **Settings:** Utility and Reasoning providers, prompt controls, storage diagnostics, and state-safety actions.

Raw relationship values, hidden clocks, unrevealed facts, Director reasoning, and other concealed state are excluded from ordinary prompt packets and player-facing projections.

## 8. Saves And Recovery

Directive checkpoints deterministic mechanics before any provider narration. A provider failure cannot reroll the outcome.

Available recovery paths include:

- **Retry Response** for a committed chat response that failed to generate or post;
- **Rewrite Narration** for prose generated from the same outcome;
- **Rerun Outcome** from the pre-outcome snapshot when mechanics should deliberately be re-resolved;
- **Delete Outcome** to restore the tracked pre-outcome state;
- **Rebuild Prompt Context** after context drift;
- **Rebind Chat** after a binding problem or after duplicating/restoring the host chat outside Directive;
- **Campaign > Records** for Save Game, Save Game As..., Load Save, and Delete Save;
- Settings Safety for verify, settle, export, and missing-record cleanup controls.

Player-message edits and deletions are journaled. Directive either rolls back safely or marks the affected turn for explicit review when dependent committed state prevents silent reversal.

## 9. Conclude And Archive

Use **Conclude Campaign** when the campaign reaches its endpoint. Directive:

1. commits conclusion mechanics and pressure settlement;
2. writes the final Command Log entry;
3. checkpoints the conclusion before provider work;
4. generates and posts one final in-character scene and recap;
5. marks the campaign save complete;
6. clears active campaign prompt injection.

A failed final post can be retried without changing the committed completion reason or rerunning conclusion mechanics. After successful completion, use **Archive Campaign** to preserve the final record in an inactive state.

## Current Limits

- The chat-native lifecycle has dependency-free fake-host and contract coverage, but this build has not been certified by a live SillyTavern browser smoke in every supported provider and chat mode.
- Automatic chat creation depends on SillyTavern exposing character creation, character selection, and chat creation APIs to extensions. When those host APIs are unavailable, restore the host session and use **Retry Chat Setup**.
- Mission play now continues through the bound campaign chat. Mission remains available for current state, pending reviews, recovery, side work, and open threads. Campaign Records owns Save Game, Save Game As, Load Save, and Delete Save.
- Directive is pre-alpha. Back up important saves before upgrading.
