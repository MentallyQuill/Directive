# Character Creator Assist Modal Design

## Goal

Move Character Creator wand generation out of the commissioning form and into an interactive modal that shows live progress, requires confirmation before applying any generated fields, and cancels safely when either the modal or Directive closes.

## Interaction

- Clicking a section wand opens the modal immediately above the Directive shell.
- The rest of Directive is dimmed and inert while the modal is open.
- The loading state shows an animated indicator, the active section, current provider progress, and a Cancel action.
- Progress copy continues to reflect Reasoning retries, Utility fallback, and local fallback.
- Both empty-section drafts and refinements use the same review flow. Generated fields are never applied automatically.
- A successful response replaces the loading state with the provider source, proposed field values, warnings or notes, and Apply, Regenerate, and Dismiss actions.
- Apply updates only the active section, saves the creator draft, closes the modal, and restores focus to the wand.
- Regenerate keeps the modal open, returns it to the loading state, and starts a new request from the current form values.
- Dismiss closes the completed result without modifying the form.
- Escape and the modal close control behave like Cancel while loading and Dismiss after completion.

## Request Lifecycle

Only one Character Creator assist session may be active. Each provider run has its own `AbortController` and identity token.

Closing the modal, hiding Directive, navigating the mobile history entry, disabling the extension, or replacing the assist session aborts the active controller and removes the modal. A provider that resolves after cancellation cannot update the DOM or apply fields because its identity token is no longer current.

Cancellation leaves the form and saved draft unchanged. Reopening Directive shows the unchanged creator state and does not resurrect a late result.

## Components

- `src/ui/character-creator-assist-dialog.js` owns modal markup, focus containment, inert shell handling, presentation states, and the single active-session registry.
- `src/ui/character-creator-panel.js` owns form snapshots, request execution, stale-result checks, field application, and saving.
- `src/runtime/runtime-shell.js` cancels the registered assist session before hiding Directive.
- `styles/directive.css` defines the modal and loading states and removes the negative sticky command-bar behavior that can overlap commissioning controls when content becomes tall.

## Error Handling

Canceled work closes silently and never becomes a warning. Provider failures and unusable responses remain in the modal with Retry and Dismiss actions. Local fallback is presented as a normal reviewable result and is not auto-applied.

## Accessibility

The modal uses `role="dialog"`, `aria-modal="true"`, a labelled title, polite live progress, an initial focus target, Escape handling, and a contained Tab order. The Directive shell is inert for the modal lifetime and its prior accessibility state is restored on close.

## Verification

- Focused DOM tests cover immediate loading presentation, progress changes, result review, cancel, retry, focus restoration, and one-active-session behavior.
- Character Creator integration tests cover review-before-apply for empty and populated sections plus ignored late results.
- Runtime shell tests cover close-triggered cancellation.
- A browser layout contract verifies the command bar is non-sticky and commissioning buttons retain their minimum height with long content.
- The complete V1 alpha gate must pass before merge.

