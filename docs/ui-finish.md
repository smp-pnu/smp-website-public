# UI layout and finishing rules

The public site keeps its photographic, dark visual identity. The administrator keeps a light workspace. Share spacing and interaction discipline, rather than forcing identical surfaces.

## Administrator

- Shared values: `admin-lab/styles/tokens.css`; appearance primitives: `base.css` and `controls.css`; feature layouts stay with their feature styles.
- Layout spacing uses 4/8/12/16/24/32/48px. Page gutters are 32px, then 24px, then 16px. Typography, borders and optical icon alignment are not forced onto an 8px scale.
- Standard controls are at least 40px high, 48px on narrow/touch screens. Body/list titles use 14px; secondary descriptions use at least 12px.
- At 900px and below, navigation collapses and content tables become stacked rows with titles, status and metadata visible. Keep table roles, selection labels and keyboard order controls.
- Form sections have descriptive legends. Input hints use `aria-describedby`, separate from labels. Saving and publication remain separate actions.
- Notice formatting has a primary row and an explicit expanded secondary group. Hidden commands must not be in the keyboard tab order. On mobile, the toolbar must not cover the document.
- Transient operation progress floats outside layout flow. Failure messages stay visible. Respect reduced motion and retain focus-visible indicators.

## Public site

- Preserve photos and page rhythm. Use a subtle local contrast treatment for notice prose, with aligned heading/body reading widths.
- Search matching includes the full public search index; result descriptions are deliberately shorter. Do not delete searchable summary/author data when simplifying previews.
- PDF navigation, zoom and fullscreen controls share 40/48px minimum heights. Do not change reader caching or navigation behavior for visual adjustments.

## Verification

Check 390px, 768px and 1440px layouts, long titles, empty/loading/error states, keyboard navigation, selection, reordering, draft save, notice preview and PDF controls. Test mutations on synthetic local data; production checks are read-only. No new polling, dependencies, infrastructure or paid services are needed for these styles.
