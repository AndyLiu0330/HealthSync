# HealthSync Dashboard UI Redesign

**Date:** 2026-07-03

**Goal**

Replace the current report-style `dashboard.html` with a desktop-first health dashboard that visually matches the user's reference: rounded product cards, soft color bands, large key metrics, and embedded trend visuals. The data pipeline, CLI command, and Drive upload flow stay unchanged.

## Scope

This redesign applies only to the HTML produced by `renderDashboard()` in `packages/core/src/report/render.ts`.

In scope:

- Restructure the generated HTML into a multi-zone dashboard layout instead of a flat tile list plus stacked chart sections.
- Introduce a polished visual system tailored to health metrics: rounded cards, soft backgrounds, stronger type hierarchy, and color-coded metric identities.
- Keep all currently enabled metrics renderable.
- Preserve support for `day`, `week`, and `month` ranges.
- Render graceful empty states when a metric has no data.

Out of scope:

- Changes to sync, auth, Drive, report orchestration, or CLI behavior.
- New data sources or metric calculations.
- Changes to any page other than the generated dashboard HTML.

## User Experience Direction

The new dashboard should feel like a premium health product UI rather than an engineering report.

Visual traits:

- desktop-first composition with asymmetrical card placement
- creamy background and layered surfaces rather than plain white cards
- large rounded cards with subtle shadows and low-contrast borders
- distinct but gentle metric colors instead of a single shared chart blue
- short, product-like labels and strong numeric hierarchy

The reference image should guide tone and composition, but the final layout must fit HealthSync's broader metric set and work well on wider screens.

## Layout

### Overall Structure

The page should render as a centered dashboard canvas with:

1. a compact top header
2. a primary metrics grid
3. a secondary insights grid
4. trend content for multi-day ranges

### Header

The header should contain:

- page title
- selected date span
- generation timestamp
- a short health-summary subtitle derived only from available metrics wording, not new calculations

The header should feel editorial and product-like, not like a plain log line.

### Primary Grid

The top grid should prioritize the metrics most people scan first:

- Steps
- Calories
- Sleep
- Heart rate

Recommended composition:

- one large hero card on the left
- two or three stacked summary cards on the right
- one supporting card row beneath

Exact mapping:

- Hero card: the most range-appropriate metric summary
  - `day`: use the first available of `steps`, `sleep`, `heart-rate`, `calories`
  - `week` / `month`: use `steps`
- Right summary cards: `calories`, `sleep`, `heart-rate`
- Supporting card row: `active-zone-minutes` plus one restorative metric when available

If one of these metrics is disabled, the next available enabled metric should fill the slot without breaking the layout.

### Secondary Grid

The secondary grid should hold the less prominent but still valuable metrics:

- resting heart rate
- heart rate variability
- respiratory rate
- SpO2

These should render as smaller cards with lighter emphasis, but still visually integrated with the main design.

## Trend Visualization

### Day Range

For `day`, the dashboard should focus on summary cards only. It should not render the current long list of section charts or placeholder chart sections.

### Week and Month Ranges

For multi-day ranges:

- keep trend visuals
- embed them into cards
- replace the current repeated full-width chart stack with:
  - one prominent trend card
  - a small number of secondary sparkline or compact chart cards

The trend cards should reuse existing metric values rather than introducing new derived series.

Recommended trend priority:

- primary trend card: `steps`
- secondary trend cards: `calories`, `sleep`, `heart-rate`, depending on which types are enabled and have data

When a trend has gaps, the chart must continue to break at missing days just like the current renderer.

## Card Behavior

Each metric card should support three states:

1. data-rich
2. zero-valued
3. empty

Rules:

- zero is a valid value and must display as `0`, never as a dash
- missing data should show a designed empty state rather than looking broken
- units should remain visible but visually subordinate to the main number
- average-vs-sum wording should still be accurate for multi-day ranges

## Styling System

The renderer should move from one global neutral style to a small dashboard-specific design system.

Required tokens:

- page background
- elevated card backgrounds
- text tiers
- border/shadow values
- per-metric accent palettes

Suggested metric accents:

- Steps: aqua / teal
- Calories: warm amber
- Sleep: lavender
- Heart rate: coral or rose
- Active zone minutes: mint / green
- Recovery-style metrics: cool neutrals

The design must remain readable in light mode. If dark mode remains supported, it should be adapted carefully rather than inheriting the old palette unchanged.

## HTML and Renderer Architecture

`renderDashboard()` should be refactored so layout generation is clearer than the current single-loop tile + chart assembly.

Recommended renderer responsibilities:

- summarize enabled metrics
- classify metrics into layout slots
- render primary cards
- render secondary cards
- render range-specific trend section

This can remain in one file if kept readable, but helper functions should be introduced for card rendering and chart rendering to avoid an oversized string-template block.

## Testing Requirements

Existing renderer tests should be updated to validate structure and behavior rather than old markup specifics.

The redesigned renderer must still prove:

- enabled metrics render and disabled metrics do not
- sums and averages remain correct
- zeros render as zero
- missing multi-day data still produces broken line segments rather than false bridges
- `day` range omits trend sections
- empty metrics render intentional placeholders

Add at least one test that checks for the new dashboard structure, such as presence of hero / primary / secondary layout containers.

## Verification

Before considering the work complete:

- build the workspace
- run renderer tests
- run full workspace tests
- run workspace typecheck
- generate the real dashboard for `day`, `week`, and `month`
- visually inspect the produced local dashboard HTML

## Risks and Guardrails

Main risks:

- overfitting the UI to the sample image and losing support for HealthSync's larger metric set
- creating layout assumptions that fail when certain metric types are disabled
- breaking current chart gap behavior while simplifying the trend visuals

Guardrails:

- preserve all current metric math
- degrade gracefully when metrics are absent
- keep the output self-contained as a single static HTML document
- optimize for desktop first, but avoid layouts that collapse badly on narrower widths
