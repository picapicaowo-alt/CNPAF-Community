---
name: CNPAF Community Adaptive Evidence System
description: One trusted CNPAF identity adapted to field collection, evidence review, and administration.
colors:
  institutional-blue: "#036EB7"
  institutional-blue-deep: "#025389"
  action-blue: "#036EB7"
  action-blue-dark: "#035E9C"
  human-orange: "#e86f19"
  human-orange-on-blue: "#ffead8"
  navigation-on-blue: "#e5f1f7"
  archival-canvas: "#edf2f3"
  paper: "#fbfcfc"
  paper-soft: "#f3f6f6"
  ink: "#18323f"
  ink-muted: "#5b707a"
  ink-muted-strong: "#405964"
  rule: "#cad7db"
  rule-strong: "#aebfc5"
  info-surface: "#e4f1f8"
  success: "#116b4e"
  success-surface: "#e7f5ef"
  warning: "#9a500f"
  warning-surface: "#fff1df"
  danger: "#af343b"
  danger-surface: "#fbe9e9"
  violet: "#65538f"
  violet-surface: "#eeeaf5"
  chart-orange: "#df6d1a"
  chart-slate: "#607a87"
  chart-neutral: "#7f929a"
typography:
  display:
    fontFamily: "var(--font-cnpaf), 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 5.6vw, 5.8rem)"
    fontWeight: 720
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "var(--font-cnpaf), 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.8rem, 2.4vw, 2.45rem)"
    fontWeight: 720
    lineHeight: 1.12
    letterSpacing: "-0.034em"
  title:
    fontFamily: "var(--font-cnpaf), 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.08rem"
    fontWeight: 690
    letterSpacing: "-0.018em"
  body:
    fontFamily: "var(--font-cnpaf), 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 450
    lineHeight: 1.65
    letterSpacing: "-0.006em"
  label:
    fontFamily: "var(--font-cnpaf), 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "normal"
  data:
    fontFamily: "SFMono-Regular, Consolas, 'Liberation Mono', monospace"
    fontSize: "13px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  status: "6px"
  compact: "8px"
  control: "9px"
  component: "12px"
  large: "14px"
  extra-large: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "42px"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-dark}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "42px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "42px"
  input:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.component}"
    padding: "20px"
  card-compact:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.component}"
    padding: "14px"
  status-pill:
    typography: "{typography.label}"
    rounded: "{rounded.status}"
    padding: "4px 10px"
    height: "24px"
  navigation-item:
    textColor: "#e5f1f7"
    typography: "{typography.label}"
    rounded: "{rounded.compact}"
    padding: "0 13px"
    height: "43px"
---

# Design System: CNPAF Community Adaptive Evidence System

## Overview

**Creative North Star: "The Adaptive Evidence System"**

CNPAF Community is a trustworthy working instrument, not a generic dashboard skin. The official round CNPAF logo at `public/cnpaf-logo.webp` is the identity source: its blue seal establishes professional and institutional authority, while its orange heart-and-people mark introduces human care. The interface carries that relationship through cool archival paper, disciplined blue structure, sparing orange emphasis, clear rules, and compact data typography. The logo itself must remain unchanged and should appear only at genuine identity anchors.

One visual language adapts to three operating scenes. Volunteers get a mobile-first community field notebook with larger controls, clear sync and task state, and a focused next action. Reviewers and coordinators get a desktop evidence register optimized for scanning risk, provenance, queues, and exact values. Administrators get a familiar, dense control product with the same brand semantics and slightly tighter surfaces. These are role-specific expressions of one system, never separate brands.

The final finish review disposition is **SHIP**. Direction contract `43c0ea9d` is the governing implementation reference: institutional blue, human orange, cool archival paper, disciplined rules, compact data typography, and a primarily 12px component language.

**Key Characteristics:**

- One CNPAF identity with three role-appropriate densities and navigation patterns.
- Chinese-first bilingual typography that remains legible when English labels expand.
- Evidence-led hierarchy: priority, state, provenance, and action precede decorative metrics.
- Flat, ruled surfaces at rest; restrained elevation appears only where interaction or layering requires it.
- Blue carries structure and action; orange marks human attention and priority, never ambient decoration.
- Official logo used intact and sparingly, without repeating the circular seal as ornament.

## Colors

The palette feels like an institutional register printed on cool archival paper, with clear blue action, humane orange emphasis, and semantic tones reserved for real states.

### Primary

- **Institutional Blue:** The principal CNPAF field for the desktop rail, mobile field header, identity panels, and major branded surfaces. It conveys continuity with the official blue seal.
- **Deep Institutional Blue:** The stronger structural blue for the default sidebar, field task cards, dark text on pale blue surfaces, and high-authority framing.
- **Action Blue:** The interactive color for primary buttons, links, selected controls, chart series, and focus-related affordances.
- **Action Blue Dark:** The hover and emphasis counterpart for blue actions; it also supports legible icon and text treatment on pale blue surfaces.

### Secondary

- **Human Orange:** The direct translation of the logo's heart-and-people mark. Use it for a priority inset, active tab underline, caret, short brand accent, or one high-signal distinction—not for broad interface chrome.

### Tertiary

- **Evidence Green:** Success, approval, and coverage. It also serves as a chart color when the data meaning is completion or recommended collection coverage.
- **Evidence Violet:** A subdued secondary analytical series and status family. It supports differentiation without introducing fashionable product-purple branding.

### Neutral

- **Archival Canvas:** The cool, low-contrast page ground that separates the application from white content surfaces.
- **Paper:** The primary reading, form, and record surface.
- **Soft Paper:** A secondary tonal layer for quiet hover states, list headers, and supporting containers.
- **Evidence Ink:** The default text and strong rule color; blue-black rather than pure black.
- **Muted Ink / Strong Muted Ink:** Secondary copy, metadata, axes, captions, and subdued navigation.
- **Rule / Strong Rule:** Structural dividers and input boundaries. Rules carry much of the hierarchy, so they remain visible but quiet.

### Semantic

- **Info Surface:** Pale blue for selected rows, informative feedback, active mobile navigation, and icon wells.
- **Success Surface:** Pale green behind approved, synced, and healthy states.
- **Warning Surface:** Pale amber behind pending, incomplete, or attention-needed states.
- **Danger Surface:** Pale red behind error, rejected, or unsafe states.
- **Violet Surface:** Pale violet behind the violet analytical or categorical family.

### Named Rules

**The Blue Structure, Orange Signal Rule.** Blue may form persistent structure and action. Orange appears only where a person needs a distinct cue or where the CNPAF identity is being stated.

**The Semantic Integrity Rule.** Never assign green, amber, red, or violet for visual variety. Each must retain its established state or analytical meaning, and state must also be expressed in text or iconography.

**The No Purple Product Rule.** Violet is a subordinate evidence category, never a gradient brand field, AI aura, or replacement for CNPAF blue.

## Typography

**Display Font:** Noto Sans SC Variable, with PingFang SC, Hiragino Sans GB, Microsoft YaHei, and system sans-serif fallbacks

**Body Font:** Noto Sans SC Variable, with the same Chinese-capable fallback stack
**Label/Mono Font:** SFMono-Regular, with Consolas and Liberation Mono fallbacks, for identifiers and numeric evidence only

**Character:** The type system is direct, contemporary, and calm. A single Chinese-first sans-serif family prevents role surfaces from fragmenting, while a compact monospaced data face makes counts, ranks, dates, and identifiers align like an evidence register.

### Hierarchy

- **Display** (720, responsive 2.6–5.8rem, 0.98 line height): Reserved for the institutional login statement; it is not a dashboard headline style.
- **Headline** (720, responsive 1.8–2.45rem, 1.12 line height): Page titles and major work-context headings, balanced across one or two short lines.
- **Title** (690, 1.08rem): Section headings and chart/card titles.
- **Body** (450, 14px, 1.65 line height): Explanations, form help, and record context; keep prose to approximately 68–72 characters per line where the layout permits.
- **Label** (650, 11px): Eyebrows, metadata, table headers, status labels, and compact navigation. Use natural case in both languages; do not force uppercase.
- **Data** (650, 13px base): Counts, ordered ranks, record IDs, dates, and aligned numerical evidence. Use tabular numerals for values and times.

### Named Rules

**The Chinese-First Measure Rule.** Choose line length, wrapping, and control width for Chinese first, then verify that the complete English translation remains readable without truncating critical state.

**The Mono Means Evidence Rule.** Monospace is reserved for data that benefits from alignment or traceability. It is not a decorative interface font.

**The No Marketing Headline Rule.** Oversized display typography belongs only to the identity-bearing authentication panel. Work surfaces lead with compact, task-oriented hierarchy.

## Layout

The desktop application uses a fixed left navigation rail and a centered, bounded work area. The shared sidebar is 232px wide, reduces to 208px below 1100px, and disappears below 900px. The general content maximum is 1440px; the evidence surface expands to 1480px and selected review/record routes to 1540px, the admin surface holds at 1380px, and the field surface narrows to 980px with capture and task flows capped at 820px.

Desktop content padding is 34px vertically and 38px horizontally by default. Evidence work receives 42px horizontal breathing room; field work receives 32px. At 1100px, complex three-column summaries become two columns with the lead item spanning the row, and horizontal padding contracts to 26px. At 899px, all primary grids become one column and the main area uses 22px 16px 104px, reserving space for fixed mobile navigation. At 680px, cards use 18px internal padding and register rows recompose around the minimum information needed to act.

Spacing follows a practical 4/8px rhythm with recurring gaps at 8, 12, 16, 20, 24, and 32px. Default stacks use 20px after the adaptive layer; compact stacks use 12px. A standard card uses 20px padding, while compact records use 14px. Dense admin tables use 11px vertical cell padding; field capture sections use responsive 20–32px padding.

### Role Topology

- **Volunteer — field notebook:** Mobile-first, narrow measure, elevated paper sheets, blue identity header, fixed bottom navigation, large touch controls, and one visually dominant current task. Inputs and buttons become at least 48px high below 900px; choices become at least 52px high.
- **Reviewer/coordinator — evidence register:** Desktop-first, widest measure, square-ended ruled slogan treatment, flatter lists, outlined state pills, indexed queues, tabular counts, and scan-efficient rows.
- **Administrator — dense control product:** Familiar sidebar and tables, 1380px content maximum, 10px container corners, tighter page header, 11px table cell rhythm, and restrained surfaces without special editorial composition.

### PWA and Responsive Rules

- Below 900px, replace the sidebar with a sticky 64px top header and fixed bottom navigation. The bottom bar is at least 70px high and includes safe-area insets.
- Preserve at least 104px bottom content padding so fixed navigation never covers the final action or record.
- Sticky step footers sit above the bottom navigation and field actions are at least 48px high.
- Tables retain a practical minimum width and scroll horizontally; do not compress evidence columns into unreadable fragments.
- Tabs may scroll horizontally with contained overscroll. Important actions and states must not depend on hover.
- Offline, draft, sync, and retry state must remain visible in the field surface and be phrased as an actionable status.

### Named Rules

**The Same Chain, Different Desk Rule.** Preserve shared tokens, semantics, and identity while changing density and composition for the actual role—not merely for viewport width.

**The Thumb-Reach Rule.** On the field surface, the next safe action and current sync state must remain reachable and visible without precision tapping.

**The Evidence Width Rule.** Do not make dense evidence fit by hiding meaning. Allow wider registers and controlled horizontal scrolling before abbreviating provenance, state, or exact values.

## Elevation & Depth

The system is flat by default and uses borders and tonal layers to express structure. Standard cards, tables, registers, and charts have no shadow at rest. A small ambient shadow appears on interactive hover and on field-notebook sheets; a medium ambient shadow is reserved for true layered surfaces such as authentication cards and install banners. Branded current-task cards may use a deeper blue shadow because they function as the field user's primary sheet, not as a generic card style.

### Shadow Vocabulary

- **Ambient Small** (`0 5px 14px rgba(20, 56, 72, 0.06)`): Interactive card hover and field paper separation.
- **Ambient Medium** (`0 18px 44px rgba(20, 56, 72, 0.11)`): Authentication card, install banner, and other genuine overlays or gates.
- **Action Lift** (`0 6px 14px rgba(8, 94, 150, 0.14)`): Primary button at rest; strengthens slightly on hover.
- **Navigation Separation** (`10px 0 30px rgba(6, 54, 84, 0.08)`): Quiet desktop rail separation from the archival canvas.

### Named Rules

**The Flat Register Rule.** Evidence containers are ruled, not floated. Do not give every card a shadow.

**The Meaningful Lift Rule.** Elevation indicates interaction, mobile sheet separation, or a true layer. It is never ambient decoration.

## Shapes

The core silhouette is a gently curved 12px component rectangle with visible rules. Compact navigation and register elements use 8px corners; controls use 9px; status labels use a compact 6px corner rather than a capsule. Large legacy containers may reach 14–16px, but new standard work surfaces should return to the 12px core. Admin surfaces intentionally tighten to 10px. Reviewer slogan bands and tabs use square edges where they behave like register rules rather than cards.

The official logo is the only recurring circle. Avatars may also remain circular because they represent people. Do not echo the seal by turning controls, cards, chart containers, or decorative badges into repeated circles.

### Named Rules

**The Twelve-Pixel Center Rule.** Start new components at 12px and deviate only for a documented functional family: compact navigation, controls, status labels, admin density, or large identity surfaces.

**The Seal Is Not a Motif Rule.** Preserve the circular logo intact at brand anchors; never crop, recolor, redraw, or tile it as decoration.

## Components

Components should feel dependable and deliberate: clear boundaries, compact labels, restrained motion, and unambiguous state.

### Buttons

- **Shape:** Compact rounded rectangle (9px) with a 42px minimum height and 8px 14px padding. Field buttons become at least 48px high on mobile.
- **Primary:** Action blue background, white text, and a restrained blue action shadow. Use for the single next or committing action in a local group.
- **Hover / Focus:** Hover darkens to action blue dark and adds a modest lift; active moves down 1px and scales to 0.99. Keyboard focus uses a 3px translucent blue outline with 3px offset.
- **Secondary:** Paper background, evidence-ink text, strong neutral rule, and no shadow. Hover shifts to pale blue.
- **Ghost:** Transparent with blue-dark text; hover adds only a neutral rule and soft-paper fill.
- **Danger:** Danger red is reserved for destructive or rejecting actions. Disabled controls use solid gray treatment and remain legible, never opacity alone.

### Status Pills and Tabs

- **Status style:** Compact 24px-high, 6px-radius labels with 11px semibold text. Use a pale semantic surface plus semantic text; the evidence surface may switch to an outline in the same semantic color.
- **State:** Always pair color with a localized state label and, where needed, an icon. Do not communicate approved, pending, unsafe, or offline status by hue alone.
- **Tabs:** Flat, natural-case labels on a bottom rule. The active tab uses a 2px human-orange underline and deep-blue text. On mobile, tabs scroll horizontally rather than wrap into ambiguous rows.

### Cards / Containers

- **Corner Style:** Standard 12px, compact register panels 8px, admin containers 10px.
- **Background:** Paper at rest; soft paper for subordinate groupings; pale semantic surfaces only when the container communicates a state.
- **Shadow Strategy:** None at rest on desktop evidence and admin surfaces. Interactive cards lift 2px with the small ambient shadow. Field sheets may use the small shadow at rest.
- **Border:** One-pixel rule is the default structural boundary. Priority rows receive a 3px orange inset at the leading edge.
- **Internal Padding:** 20px standard, 14px compact, 18px on narrow mobile cards, and 20–32px for focused field capture sections.

### Inputs / Fields

- **Style:** White field, strong neutral border, evidence-ink text, 9px corners, 10px 12px padding, and 44px minimum height.
- **Focus:** Border changes to action blue with a 3px translucent blue ring. The text caret uses human orange as a small human-centered cue.
- **Error / Disabled:** Error copy sits in a labeled red feedback container; disabled controls retain explicit gray fill, border, and readable text. Labels, help, and errors remain adjacent to the field.
- **Mobile field behavior:** Inputs, selects, and text areas use 16px text and at least 48px height to prevent fragile zoom and precision interaction.

### Navigation

The desktop rail is deep institutional blue, 232px wide, with 43px-high links, 8px corners, pale-blue default text, and line icons. The active item reverses to near-white with deep-blue text, a subtle shadow, and a 2px orange leading rule. On mobile, navigation moves to the fixed bottom bar; the active destination uses pale blue, while the field surface uses institutional blue with white text. Current-page state is also exposed semantically, not only visually.

### Evidence Registers and Tables

Registers are the signature pattern for reviewer/coordinator work. Use ordered ranks, a concise title and explanation, an exact tabular count, and an explicit action. Rows are separated by rules and use a quiet pale-blue hover. Priority is conveyed with the orange leading inset plus ordering and text. Tables use sticky headers, natural-case 11px labels, tabular numeric columns, and a pale neutral header surface.

### Charts

Charts are evidence graphics, not decorative dashboard filler. Every chart sits in a ruled paper container with a title, an interpretive subtitle, and an accessible text label. Gridlines are light and dashed; axes and labels use strong muted ink at 11px. Tooltips use an 8px radius, rule border, exact values, and a restrained ambient shadow.

- Reuse blue for submitted/action, green for approved/coverage, orange for attention or started, slate/violet for evidence composition, and cool gray for incomplete or neutral series.
- Preserve semantic color meaning across chart types and pages. Never rotate a palette merely for variety.
- Use line style, fill openness, direct values, labels, or shape in addition to hue. The started/submitted/approved trend, for example, differentiates series with dotted, dashed, and solid lines.
- Disable nonessential chart animation. Interactive series controls must be keyboard-operable, visibly focused, and must never allow the last visible series to be hidden.
- Heatmaps retain exact values in every cell and an accessible table structure; tone supplements the number.
- Start insight pages with changes and attention in a ranked register; charts come after the decision-oriented summary.

### Feedback and Offline State

Feedback uses a 12px ruled container and a pale semantic surface with localized, actionable copy. Info, success, warning, and error each have distinct border, background, and text treatment. PWA install, local draft, sync, retry, and offline states must state what happened and what the user can do next; never reduce these states to a dot or icon alone.

### Interaction and Accessibility

Interactive motion is short and functional: approximately 150–170ms for color, border, shadow, and small position changes. Hover lift is at most 2px; active press is at most 1px plus a subtle scale. Under `prefers-reduced-motion`, scrolling becomes immediate and transitions and animations collapse to 0.01ms. Focus-visible treatment is consistent across controls. Under forced colors, active navigation, status pills, and buttons receive a system-colored border. All icons are paired with visible text or accessible names when they convey an action.

## Do's and Don'ts

### Do:

- **Do** preserve `public/cnpaf-logo.webp` unchanged and use it at the sidebar/mobile brand, authentication identity panel, or another true brand anchor.
- **Do** maintain one shared token and semantic system while adapting density, navigation, and composition to field, evidence, and admin work.
- **Do** use cool paper, explicit one-pixel rules, tabular values, ordered queues, and localized state labels to make the evidence chain easy to audit.
- **Do** keep primary actions reachable and at least 48px high on the mobile field surface, with safe-area-aware bottom spacing.
- **Do** make every important state understandable without color and every interactive control keyboard-operable with a visible focus ring.
- **Do** retain exact values, accessible labels, and non-color differentiation in analytical graphics.
- **Do** verify every new screen in both Chinese and English, including long labels, chart axes, table headers, and bottom navigation.

### Don't:

- **Don't** force volunteers, reviewers, and administrators into the same generic dashboard composition.
- **Don't** use purple gradients, glass cards, glow effects, floating pill overload, oversized dashboard headlines, or template-like three-column KPI grids as a default visual language.
- **Don't** repeat, crop, recolor, simplify, or redraw the round CNPAF seal, and do not treat its circle as a decorative motif.
- **Don't** use orange as a large background or routine button color; its scarcity is what preserves its human and priority meaning.
- **Don't** place every section in an elevated card. Prefer flat ruled registers, tables, and tonal grouping on evidence and admin surfaces.
- **Don't** use decorative charts, unexplained color rotation, animation-only meaning, hidden exact values, or synthetic impact claims.
- **Don't** hide provenance, approval, risk, offline, draft, sync, or permission state to make a layout look cleaner.
- **Don't** rely on hover, color alone, tiny touch targets, or clipped English translations for any required action.
