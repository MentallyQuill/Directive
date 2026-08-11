# Campaign Library Detail Rework Design

## Goal

Move Campaign Library descriptive content out of the artwork so the cover remains legible and the unused detail-pane space carries useful campaign context. Preserve the certified Campaign master/detail interaction, current availability rules, and all saved-campaign behavior.

## Scope

This change applies only to Campaign Library package details. Saved and current campaign details, checkpoints, creator behavior, and campaign-start behavior remain unchanged.

## Approved Layout

Each selected library package uses three vertical regions:

1. **Cover hero** — campaign artwork with a bottom gradient and title.
2. **Campaign information** — the complete opening description followed by campaign facts.
3. **Primary action** — the existing start, continue-setup, or unavailable action.

The body content sits below the hero inside the existing scroll-owning detail pane. It must use the certified LCARS spacing, typography, fact-tile, and action grammar rather than introducing a new card system.

## Cover Content

For the playable Ashes of Peace package, the title is the only text rendered over the cover image. Remove `Playable in V1` and move the description below the image.

For future packages, retain `Coming Later` immediately above the title. The description still moves below the image. `Coming Later` is the sole exception to the title-only cover rule because it communicates the disabled action state.

The cover must not contain descriptions, campaign facts, mission counts, estimated length, version information, or other metadata.

## Description And Facts

Render the package's complete current description first. Beneath it, render four compact facts in this order:

1. **Era**
2. **Theater**
3. **Assignment**
4. **Your Role**

For Ashes of Peace, the approved presentation values are:

| Fact | Value |
| --- | --- |
| Era | 2376, Post-Dominion War |
| Theater | Asterion Reach |
| Assignment | U.S.S. Breckenridge, Intrepid-class |
| Your Role | Commander, Executive Officer |

The other Campaign Library teasers use the same four-field contract and these approved player-safe values:

| Campaign | Era | Theater | Assignment | Your Role |
| --- | --- | --- | --- | --- |
| Drowned Constellation | 2373, Dominion War | Nerine Reef | U.S.S. Glass Harbor, Steamrunner-class | Commander, Executive Officer |
| Black Current | 2376, Post-Dominion War | Vanta Wake | U.S.S. Serein, Steamrunner-class | Commander, Executive Officer |
| Broken Accord | 2378, Post-Dominion War | Ilyra System | U.S.S. Eudora Vale, Intrepid-class | Commander, Executive Officer |
| Unseen Border | 2371 | Lacuna March | U.S.S. Aster Vale, New Orleans-class | Commander, Executive Officer |
| Enemy's Garden | 2376, Post-Dominion War | Cyradon Relief Cluster | U.S.S. Celandine, Norway-class | Commander, Executive Officer |

Store these as explicit teaser metadata sourced from the current authoring baselines. The renderer must not parse descriptions or infer facts from prose. Missing values are omitted rather than shown as `Pending`, `Unknown`, or empty tiles.

Do not expose mission count, chapter count, expected sessions, story arcs, quest templates, or any other campaign-size signal.

## Actions And Availability

Place the existing primary action below the facts:

- Ashes of Peace: `Start campaign` or `Continue setup`, using the existing action selection and handlers.
- Future campaigns: disabled `New campaign`, using the existing coming-later state.

The rework must not change selection behavior, package identity, creator drafts, campaign mutation, or the rule that only Ashes of Peace is playable in V1.

## Responsive Behavior

Desktop keeps the certified master/detail split. The detail body uses the available width rather than leaving the area beneath the hero empty.

At narrow widths:

- keep the cover compact now that it no longer contains a long description;
- arrange facts as a two-column grid;
- allow longer values to wrap without clipping or ellipsis;
- preserve local detail-pane scrolling and access to the primary action.

## Accessibility

- Keep the campaign title as the detail heading.
- Keep `Coming Later` as visible text for unavailable packages.
- Do not use color or image desaturation as the only availability signal.
- Preserve useful image alternative text.
- Preserve native disabled-button semantics for unavailable actions.
- Ensure moved description and fact text remain readable at the supported desktop and phone widths.

## Verification

Focused Campaign tests must prove:

- Ashes has no `Playable in V1` text;
- the Ashes hero contains only its title;
- future heroes contain `Coming Later` and their title, but not their description;
- each description is rendered below its hero;
- the four approved fact labels render from explicit metadata;
- no mission-count or campaign-length text is exposed;
- Ashes retains its start or continue-setup action;
- future actions remain disabled and mutation-free;
- saved/current campaign details are unchanged.

Browser layout verification must cover desktop and phone widths, including wrapping fact values, the two-column mobile fact grid, local scrolling, and access to the primary action.

## Non-Goals

- Revealing campaign size or duration.
- Restoring legacy package-health, import, readiness, story-arc, or quest-template dashboards.
- Changing campaign descriptions or cover assets.
- Redesigning saved-campaign details or checkpoint management.
- Adding legacy compatibility, migration, or inference layers.
