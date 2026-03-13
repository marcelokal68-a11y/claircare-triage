---
name: ui-ux-clean-intake
description: Use this skill when designing medical intake screens that must start clean, progressively reveal complexity, and show output panels only after processing.
---

# UI/UX Clean Intake

Design principle: do not overwhelm the user before triage starts.

## Rules

1. Start with a clean wizard: login, consent, then main symptom.
2. Keep all diagnostic output hidden until the first processed result exists.
3. Use compact status chips for flow progress.
4. Keep voice capture controls close to symptom input and not inside the output area.
5. Preserve responsive behavior with single-column fallback on mobile.

## UX pattern

- Initial state:
  - Brand, medical disclaimer, wizard steps, login card.
- Pre-processing state:
  - Consent checklist, symptom/voice input card.
- Post-processing state:
  - Structured history panel + output panel.
