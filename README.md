# ClairCare Triage (MVP)

A multilingual medical triage assistant that asks sequential questions, builds a structured history, and produces an educational summary with diagnostic hypotheses and urgency guidance.

## Setup

1. Create a `.env` file:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.4
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
OPENAI_TTS_MODEL=gpt-4o-mini-tts
VITE_SUPABASE_URL=https://gmsvrzchvvvxkdgjuiyx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_E0t_2tzeACR5q2pMXr1avQ_42Bqr5LC
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.gmsvrzchvvvxkdgjuiyx.supabase.co:5432/postgres
```

2. Install dependencies:

```bash
npm install
```

3. Start dev server:

```bash
npm run dev
```

The API runs on port `3000` and the Vite dev server on `5173`.

## Notes

- This MVP is **educational** and does **not** provide definitive diagnoses.
- Login is via Supabase Google OAuth.
- LGPD consent is required before triage starts.
- History is stored in Supabase Postgres and retained for up to 30 days (auto-pruned).
