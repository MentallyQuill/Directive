# Certified V1 UI Restoration Design

## Status

Approved for uninterrupted implementation, verification, merge to `main`, and push.

This is a conformance restoration, not a redesign. Directive's certified expanded interface remains the visual, geometric, responsive, and interaction authority. The current V1 runtime remains the semantic, storage, projection, and gameplay-action authority.

## Decision Summary

Restore the certified Directive interface around the current V1 runtime by transplanting the certified shell and route components, then feeding them through pure V1 view adapters and the existing V1 action boundary.

Do not revert the V1 runtime. Do not revive retired tracking, reconciliation, compatibility, migration, import, legacy-storage, or operator-console systems. If a certified surface depended on a retired system, omit that surface and close the composition using the certified component grammar. Never render a fake or disabled control merely to occupy its old space.

## Authority Order

1. Frozen mockup `docs/design/mockups/directive-expanded-interface.html` at Git blob `954d50e508772557fd827d93c58c0b442888cacb`.
2. `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md` from the certified interface lineage.
3. Certified production implementation `0ec4a12066584c54157ea81f56f1073a00bcdf94` and certification record `80e5e6fc6685c8f281982f5b01f27adbdab62a82`.
4. Current V1 state, player-safe projections, actions, storage, and Story Settlement contracts.
5. The approved post-certification exceptions in this document.

Later visual simplifications, the shortened current Design Bible, and the current `directive-v1-*` route compositions are not visual authority.

## Approved Post-Certification Exceptions

Only these intentional differences from the certified reference are permitted:

1. Non-Ashes campaign cards remain visible but greyed, labeled `Coming later`, semantically disabled, and noninteractive.
2. Current campaign descriptions replace the older certified fixture descriptions without changing certified card geometry or typography.
3. The Character Builder wand helper remains a modal overlay that dims the interface, makes the underlying Directive shell inert, traps focus, and restores focus to the invoking wand on close.
4. The shell and route page never scroll. Only explicitly bounded route panels, lists, disclosures, form regions, text fields, or modal bodies may own scrolling.

No other intentional visual variance is authorized.

## Goals

1. Restore the certified LCARS shell, typography, density, spacing, imagery, responsive layouts, control treatment, and navigation.
2. Preserve every current V1 runtime connection and player-safe information boundary.
3. Fit new V1 gameplay surfaces into the certified component language.
4. Restore the certified Campaign library treatment while retaining current descriptions and disabled preview campaigns.
5. Preserve the current Character Builder wand-helper modal behavior while conforming its appearance to the certified system.
6. Enforce bounded internal scrolling with no route-page or document scrolling caused by Directive.
7. Reinstate deterministic and browser-level conformance gates that prevent future visual drift.
8. Verify the exact installed and served SillyTavern extension, not only repository fixtures.

## Non-Goals

- Reintroducing legacy saves, migrations, adapters, or fallback state.
- Reintroducing Directive Assist, reconciliation, protected editing, tracking review, Open Threads, Open World, legacy issue tracking, or old operator tooling.
- Recreating the old runtime data model for the convenience of restored components.
- Adding speculative fields or controls when V1 cannot source them safely.
- Changing V1 Story Settlement, accepted-pair semantics, mission reduction, storage, campaign rules, or prompt authority.
- Modernizing, simplifying, or reinterpreting the certified visual system.

## Architecture

The restoration boundary is:

```text
V1 runtime state and current runtime view
        -> exact player-safe V1 projections
        -> pure certified-route view adapters
        -> restored certified shell and route components
        -> existing V1 runtime actions
```

The route adapters are presentation code. They may normalize labels, group records, select player-safe imagery, and omit absent values. They may not mutate runtime state, call a model, infer facts from prose, fabricate legacy fields, or expose hidden state.

### Adapter Responsibilities

Create one focused adapter module per route:

- Campaign: package library, active campaigns, current timeline, and checkpoints.
- Mission: current mission, visible required and optional objectives, known facts, real clocks, capabilities, and terminal result.
- People: player identity, visible people, service metadata, public relationship posture, meaningful moments, and Command Bearing.
- Ship: identity, aggregate operational status, material limitations, and capabilities.
- Settings: current player-facing provider, preset, runtime, verification, and support configuration.

Each adapter returns a purpose-built certified route model. Restored route components consume only that model plus a deliberately bounded action object.

## Shared Shell

Restore the certified expanded shell literally:

- narrow five-segment LCARS rail;
- Directive identity and route path in the top bar;
- one Close action and no primary-route Back action;
- certified shell dimensions, radii, palette, typography, and shadows;
- stable bottom navigation with Campaign, Mission, People, Ship, and Settings;
- route colors and certified active states;
- viewport containment at desktop, compact desktop, phone, and narrow phone sizes.

Retain the current runtime lifecycle, overlay mounting, open/close history behavior, last-route persistence, view refresh, focus restoration, and preset reminder integration.

## Scroll Ownership

The following are hard invariants:

- `.directive-runtime-panel`: `overflow: hidden`.
- `.directive-workspace`: `overflow: hidden`.
- `.directive-route-body`: `overflow: hidden`.
- top bar, route heading, LCARS rail, and bottom navigation never scroll.
- `document.documentElement` and the SillyTavern page do not gain overflow from Directive.

Desktop scroll owners:

- Campaign master list and selected campaign/checkpoint detail.
- Mission collection and selected mission detail.
- People roster and written person detail.
- Ship operational-status and capability panels only when their bounded content requires it.
- The selected Settings General or Advanced panel.
- Character Builder form regions and long text fields.

Phone scroll owners:

- the bounded route record list;
- the currently expanded record detail or disclosure;
- a bounded Settings panel;
- the Character Builder form region;
- the wand-helper modal body.

Opening one peer phone record closes the previous peer. The route heading and bottom navigation remain fixed inside the shell.

## Campaign Route

Restore the certified Campaign master/detail and responsive record compositions.

### Library

- Use certified artwork size, crop, framing, typography, spacing, and selection treatment.
- Ashes of Peace is available and exposes the current V1 creator/start action.
- Other campaign packages retain their current names, images, and descriptions.
- Non-Ashes packages render greyed, retain readable contrast, show `Coming later`, and expose no pointer, keyboard, or assistive activation.
- Package selection is presentation-only.

### Active Campaigns And Checkpoints

- Restore the certified active-campaign identity, hero, premise, player information, chapter, last-played metadata, and checkpoint composition.
- `Open Chat` invokes the current `openCampaignChat` action.
- `Save Game` invokes the current checkpoint-producing `saveGame` action.
- `Load Game` invokes the current `loadCheckpoint` action.
- `Delete Save` invokes the current `deleteSave` action after confirmation.
- Do not restore package import, legacy campaign loading, mutable Save As behavior, or compatibility labels.

## Mission Route

Restore the certified Mission collection/detail hierarchy and phone disclosure composition while using only the exact V1 mission projection.

Show:

- authored mission title and concise summary;
- required and optional objective groups;
- objective status and player-safe completion/result text;
- known facts;
- real visible clocks and their known consequences;
- currently available capabilities;
- terminal mission result and authorized next assignment when present.

Do not show:

- hidden or undiscovered objectives;
- a fabricated percentage or hidden total;
- legacy quest selection authority;
- Director previews, pending outcomes, reconciliation, recovery consoles, Open World, Open Threads, or sidework trackers.

The single current V1 mission is the foreground record. The composition must remain valid with one mission; it may not invent additional records to fill the master pane.

## People Route

Restore the certified People master/detail composition, portraits, service marks, responsive records, category treatment, and internal scrolling.

The route consumes only:

- the V1 player identity projection;
- the V1 People projection;
- public service metadata;
- public role and profile summaries;
- public relationship posture;
- settled defining moments;
- the V1 Command Bearing projection.

Player identity appears through the certified People record system rather than a new dashboard card.

### Command Bearing

Add a compact, fixed People-route utility strip above the roster/detail workspace. It uses People route colors, certified condensed typography, certified pip/status grammar, and certified button treatment.

It may show:

- available reserve and capacity;
- latest authored award reason when present;
- a pending armed edge and its clear state;
- the latest committed spend when useful;
- `Use Command Bearing` or `Cancel Command Bearing` through the current V1 actions.

It must not become an oversized dashboard card, scroll with either roster or detail, expose retired Marks/ranks/tracks, or imply an unavailable spend.

## Ship Route

Restore the certified ship hero, identity overlay, bounded operational-board layout, and responsive disclosures.

Map the V1 projection as follows:

- ship name, class, registry, capability summary, and package image -> certified hero;
- aggregate operational status -> certified primary operational panel;
- material limitations -> certified prioritized limitation records;
- capabilities -> certified capability panel.

Omit position, course, readiness, issue rows, damage lists, or technical debt when V1 does not provide them. Do not revive the retired issue tracker or infer additional structure from prose.

## Settings Route

Restore the certified General and Advanced Settings compositions and typography while retaining only current V1 controls:

- runtime cadence currently exposed by the runtime view;
- Story Settlement and narration provider routing;
- provider test feedback;
- Directive preset status, install, refresh, and startup check preference;
- active-save verification;
- privacy-bounded support export.

Do not restore tutorial libraries, guidance toggles, continuity diagnostics, reconciliation, recovery, storage cleanup, legacy provider roles, prompt inspectors, or tracking telemetry.

## Character Builder And Wand Helper

Restore the certified Character Builder layout, typography, spacing, form controls, command bar, review composition, and responsive behavior while preserving the current V1 creator actions and validation.

Retain the current wand-helper modal architecture and behavior:

- mount through the Directive modal root;
- dim and visually de-emphasize the entire underlying Directive UI;
- set the underlying shell inert;
- use `role="dialog"` and `aria-modal="true"`;
- trap Tab and Shift+Tab inside the modal;
- focus Cancel while loading, Apply on success, and Retry on error;
- allow cancellation of the active request;
- restore focus to the invoking wand on close;
- preserve loading, fallback-provider progress, result, error, regenerate, apply, dismiss, and cancellation states.

Restyle the overlay and dialog with the certified LCARS palette, typography, radii, structural cap/rule grammar, button hierarchy, spacing, and scrollbar treatment. Only the modal body may scroll when needed; its header and actions remain stable.

## Retired Surface Policy

When certified source code references a retired subsystem:

1. Remove the import and code path.
2. Do not add a compatibility adapter.
3. Do not render a disabled placeholder.
4. Preserve the surrounding certified composition using its existing layout primitives.
5. Add a negative test proving the retired surface is absent.

This applies to package import, legacy save loading, Directive Assist, reconciliation, protected editing, pending outcome review, Open Threads, Open World, legacy quest manipulation, tracking review, old issue tracking, old Command Bearing systems, tutorial UI, and permanent recovery tooling.

## Error And Empty States

- Invalid or missing V1 projections fail closed using the current V1 projection error boundary.
- An inactive campaign displays the certified route-specific empty state and directs the player to Campaign.
- Optional absent data is omitted instead of represented by `Unknown`, zero, or empty cards.
- Action failures remain local to the invoking certified panel and preserve the last committed projection.
- Missing imagery uses the current package asset placeholder inside certified geometry.
- The UI never dumps raw state, internal IDs, prompts, endpoint URLs, credentials, or hidden facts.

## Testing And Certification

### Restored Authorities

Restore and protect:

- the frozen mockup;
- the expanded-interface contract;
- the full certified Design Bible;
- deterministic expanded-interface fixtures;
- the preview server;
- mockup-authority checks;
- screenshot and DOM conformance tests;
- focus, reorder, responsive-record, and media tests that remain applicable.

### Approved Variance Manifest

Create one machine-readable variance fixture that permits only:

- disabled `Coming later` campaigns;
- current campaign descriptions;
- the wand-helper modal;
- bounded internal scroll ownership.

Every variance must name its selector, expected behavior, and reason. Unlisted variance fails certification.

### Required Viewports

- `1440x900`
- `1024x768`
- `390x844`
- `360x800`

### Required Assertions

- certified shell geometry and typography;
- stable five-route navigation;
- no document or route-page overflow;
- exact scroll-owner allowlist by route and viewport;
- Campaign library geometry, descriptions, disabled preview semantics, and actions;
- Mission visibility, objective grouping, clocks, and terminal states;
- People master/detail behavior, service marks, portraits, and Command Bearing actions;
- Ship hero, aggregate status, limitations, and capabilities;
- Settings current controls and negative legacy audit;
- Character Builder composition and wand-helper modal behavior;
- focus visibility, modal focus trap, inert background, and focus restoration;
- mouse, touch, and keyboard behavior for any retained presentation-only ordering;
- no hidden facts or retired controls in the DOM.

### Runtime And Host Gates

- focused route and adapter tests after each route;
- complete current V1 alpha gate;
- current Story Settlement, mission, storage, campaign, creator, provider, and Command Bearing tests;
- source/install production-file parity;
- cache-busted served-file verification;
- live SillyTavern activation of all five routes;
- live Campaign, Mission, People, Ship, Settings, creator, modal, save/load, provider, and Command Bearing interaction checks where state permits.

Fixture screenshot success alone does not prove live campaign binding or installed behavior.

## Delivery Sequence

1. Restore the design authorities and establish failing conformance gates.
2. Add pure V1 certified-route adapters.
3. Restore the shell and scrolling contract.
4. Restore Campaign.
5. Restore Mission.
6. Restore People and Command Bearing.
7. Restore Ship.
8. Restore Settings.
9. Conform Character Builder and the wand-helper modal.
10. Complete visual, interaction, V1, installed-copy, and live-host certification.
11. Merge the verified branch into `main` and push.

Each route is a reviewable, independently testable checkpoint. The branch must not merge while any route uses the simplified `directive-v1-*` composition as its primary visual implementation or while an unapproved visual variance remains.

## Definition Of Done

The restoration is complete only when:

- the certified shell and all five route compositions are restored;
- V1 remains the sole runtime and semantic authority;
- current V1 actions work through certified controls;
- all retired systems and controls remain absent;
- the four approved exceptions are implemented and no others exist;
- the shell and route page never scroll;
- only bounded internal panels own overflow;
- the wand helper retains its modal behavior and matches certified styling;
- deterministic, screenshot, DOM, accessibility, interaction, full V1, installed-copy, and live-host gates pass;
- the verified implementation is merged into `main` and pushed.
