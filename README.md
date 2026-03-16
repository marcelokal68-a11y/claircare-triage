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
- Users can delete their own history via UI ("Excluir meus dados") or API.

## API

- `POST /api/triage` - run clinical triage
- `POST /api/transcribe` - speech-to-text
- `POST /api/tts` - text-to-speech
- `POST /api/history` - store triage summary
- `GET /api/history?user_id=...` - list user history (30 days)
- `DELETE /api/history?user_id=...` - delete user history
- `GET /api/health` - readiness probe

## Go-Live Checklist

1. Set Vercel envs for production:
   - `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_TTS_MODEL`
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `DATABASE_URL` (with real password)
2. Configure Supabase Auth:
   - Google provider enabled
   - Site URL: `https://claircare-triage.vercel.app`
   - Redirect URLs include `https://claircare-triage.vercel.app`
3. Validate endpoints:
   - `GET /api/health` returns `ok: true`
   - triage, transcribe and tts requests work in production
4. Validate LGPD flow:
   - consent required before triage
   - delete history action works
