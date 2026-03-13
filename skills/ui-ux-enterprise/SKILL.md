---
name: ui-ux-enterprise
description: Design or refactor digital products into enterprise-grade UI/UX with Apple-inspired clarity, depth, motion, and material polish while preserving business density, accessibility, and operational efficiency. Use when users ask for premium enterprise interfaces, executive dashboards, B2B SaaS redesigns, design-system hardening, or “Apple-like” visual and interaction quality without copying Apple brand assets.
---

# UI/UX Enterprise

## Core Objective

Create interfaces that feel premium and calm, but still handle complex enterprise workflows, long forms, dense tables, and multi-role operations.

## Apply Apple-Inspired Principles

1. Prioritize clarity first:
   - Simplify first-screen information.
   - Reduce visual noise with strong spacing and strict hierarchy.
   - Prefer one primary action per surface.
2. Add depth with restraint:
   - Layer surfaces with subtle elevation, blur, and translucency where useful.
   - Keep depth semantic (focus, grouping, modality), not decorative.
3. Keep motion meaningful:
   - Use short, smooth transitions to explain state changes.
   - Animate continuity between list/detail, filter/update, and modal flows.
4. Preserve precision in typography:
   - Use a clear type scale with predictable rhythm.
   - Reserve bold weights for hierarchy and critical metrics.
5. Preserve trust and accessibility:
   - Maintain WCAG-compliant contrast and keyboard navigation.
   - Keep touch targets usable and error states explicit.

## Enterprise Adaptation Rules

1. Preserve information density without clutter:
   - Group by task domain.
   - Collapse secondary metadata behind progressive disclosure.
2. Design for decision speed:
   - Keep KPIs and status visible near related actions.
   - Show risk/state badges near records, not in distant legends.
3. Handle complexity through structure:
   - Separate command layer, workflow layer, and output layer.
   - Keep filters sticky and selection state persistent.
4. Make states explicit:
   - Design empty, loading, partial, error, and success states.
   - Provide next best actions for each state.
5. Respect governance and auditability:
   - Surface permissions, approvals, and change logs in-context.
   - Avoid hidden destructive actions.

## Execution Workflow

1. Diagnose product context:
   - Identify persona, primary jobs-to-be-done, risk level, and success metrics.
   - Capture constraints: compliance, localization, accessibility, legacy data.
2. Define screen hierarchy:
   - Map primary routes and critical task paths.
   - Assign every component a priority level: primary, secondary, contextual.
3. Build visual direction:
   - Define color roles, spacing scale, radius, elevation, and motion tokens.
   - Keep palettes neutral-first with intentional accent usage.
4. Shape interaction model:
   - Define navigation model, progressive disclosure points, and feedback patterns.
   - Confirm keyboard, mouse, and touch behavior.
5. Validate and harden:
   - Test responsiveness, accessibility, and performance.
   - Check edge cases for enterprise data volume and permission boundaries.

## Output Contract

When delivering designs or implementation guidance, include:

1. UX rationale:
   - Explain hierarchy, disclosure, and interaction choices.
2. Visual system summary:
   - List typography, color roles, spacing, radius, elevation, and motion tokens.
3. Component decisions:
   - Document key components (tables, forms, cards, filters, modals, alerts).
4. State matrix:
   - Define behavior for empty/loading/error/success/permission-denied.
5. Responsiveness and accessibility checks:
   - Confirm desktop, tablet, mobile, keyboard, and contrast behavior.

## Guardrails

1. Do not copy Apple logos, product names, proprietary layouts, or marketing assets.
2. Do not trade functional clarity for visual novelty.
3. Do not hide critical enterprise metadata behind excessive minimalism.
4. Do not introduce motion that slows frequent operational tasks.
5. Do not break existing design-system conventions unless explicitly requested.

## Layout Pattern

- Header with brand and system controls.
- Status strip with identity, consent, readiness.
- Main workflow card for login, consent, and intake.
- Results workspace revealed only after first successful processing.

## Styling Pattern

- Distinct card surfaces for command vs clinical output.
- Tight typography scale with clear heading rhythm.
- Use calm color accents for confidence and warning.
