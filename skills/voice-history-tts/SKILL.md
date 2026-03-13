---
name: voice-history-tts
description: Use this skill when building or maintaining voice-first medical intake flows that record user audio, transcribe speech to structured history text, and generate TTS playback summaries.
---

# Voice History + TTS

Use this skill for healthcare intake UX where the user can speak symptoms, get transcription in the active text field, and listen to generated summaries.

## Workflow

1. Add voice capture controls in the frontend.
2. Send recorded audio to backend as base64 (`data:audio/...;base64,...`).
3. Transcribe audio with `client.audio.transcriptions.create`.
4. Insert transcribed text into the currently active intake field.
5. Generate spoken playback with `client.audio.speech.create`.
6. Keep explicit medical disclaimer visible and avoid treatment claims.

## Backend Contract

- `POST /api/transcribe`
- Input JSON: `{ "audio_base64": "...", "locale": "pt|es|en" }`
- Output JSON: `{ "text": "..." }`
- Model default: `gpt-4o-mini-transcribe`

- `POST /api/tts`
- Input JSON: `{ "text": "...", "voice": "alloy|ash|..." }`
- Output JSON: `{ "audio_base64": "data:audio/mpeg;base64,..." }`
- Model default: `gpt-4o-mini-tts`

## Guardrails

- Limit accepted payload size and validate MIME prefix before decoding.
- Never persist raw audio unless the user explicitly requests retention.
- Strip or avoid personal identifiers in prompts when not needed.
- Show fallback error messages that include server detail for debugging.

## UI Expectations

- Buttons: `Record`, `Stop`, `Transcribe`, `Play Summary`.
- Responsive behavior on mobile and desktop.
- If recording is active, disable duplicate record action.
- If no recorded audio exists, disable transcription action.
