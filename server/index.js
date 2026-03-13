import express from 'express';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import { Pool } from 'pg';
import { buildSystemPrompt } from './triagePrompt.js';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
app.use(express.json({ limit: '15mb' }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const databaseUrl = process.env.DATABASE_URL;
const pgPool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }
    })
  : null;

async function initDatabase() {
  if (!pgPool) return;
  await pgPool.query(`
    create table if not exists triage_history (
      id bigserial primary key,
      user_id text not null,
      user_email text,
      locale text,
      urgency text,
      summary text,
      payload jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await pgPool.query(`
    create index if not exists triage_history_user_created_idx
    on triage_history (user_id, created_at desc);
  `);
}

function buildCasePrompt(payload) {
  const { locale, initialSymptoms, qa, age, sex } = payload;
  const lines = [];
  lines.push(`Locale: ${locale || 'pt'}`);
  if (age) lines.push(`Age: ${age}`);
  if (sex) lines.push(`Sex: ${sex}`);
  lines.push(`Initial symptoms: ${initialSymptoms || ''}`);
  if (Array.isArray(qa) && qa.length > 0) {
    lines.push('Q&A so far:');
    qa.forEach((item, idx) => {
      lines.push(`${idx + 1}. Q: ${item.q}`);
      lines.push(`   A: ${item.a}`);
    });
  }
  return lines.join('\n');
}

function parseBase64Audio(audioBase64) {
  if (!audioBase64 || typeof audioBase64 !== 'string') return null;
  const match = audioBase64.match(/^data:audio\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const extension = match[1].split('+')[0] || 'webm';
  const mimeType = `audio/${match[1]}`;
  const bytes = Buffer.from(match[2], 'base64');
  return { extension, mimeType, bytes };
}

app.post('/api/triage', async (req, res) => {
  try {
    const { locale, session_id, initialSymptoms, qa, age, sex } = req.body || {};

    if (!initialSymptoms) {
      return res.status(400).json({ error: 'initialSymptoms is required' });
    }

    const systemPrompt = buildSystemPrompt(locale || 'pt');
    const userPrompt = buildCasePrompt({ locale, initialSymptoms, qa, age, sex });

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.4',
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      safety_identifier: session_id || undefined,
      text: {
        format: {
          type: 'json_schema',
          name: 'triage_result',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: [
              'next_question',
              'done',
              'questions_remaining_estimate',
              'history',
              'hypotheses',
              'red_flags',
              'urgency',
              'specialists',
              'summary_paragraph'
            ],
            properties: {
              next_question: { type: 'string' },
              done: { type: 'boolean' },
              questions_remaining_estimate: { type: 'number' },
              history: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'hpi',
                  'ros',
                  'pmh',
                  'meds',
                  'allergies',
                  'family_history',
                  'social'
                ],
                properties: {
                  hpi: { type: 'string' },
                  ros: { type: 'string' },
                  pmh: { type: 'string' },
                  meds: { type: 'string' },
                  allergies: { type: 'string' },
                  family_history: { type: 'string' },
                  social: { type: 'string' }
                }
              },
              hypotheses: {
                type: 'array',
                minItems: 3,
                maxItems: 6,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['name', 'probability', 'rationale'],
                  properties: {
                    name: { type: 'string' },
                    probability: { type: 'number' },
                    rationale: { type: 'string' }
                  }
                }
              },
              red_flags: { type: 'array', items: { type: 'string' } },
              urgency: {
                type: 'string',
                enum: ['self-care', 'routine', 'urgent', 'emergency']
              },
              specialists: { type: 'array', items: { type: 'string' } },
              summary_paragraph: { type: 'string' }
            }
          },
          strict: true
        }
      }
    });

    const text = response.output_text || '';
    const data = JSON.parse(text);
    return res.status(200).json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'server_error',
      message: err instanceof Error ? err.message : 'Unknown server error'
    });
  }
});

app.post('/api/transcribe', async (req, res) => {
  try {
    const { audio_base64, locale } = req.body || {};
    const parsed = parseBase64Audio(audio_base64);
    if (!parsed) {
      return res.status(400).json({ error: 'invalid_audio_payload' });
    }

    const file = await toFile(parsed.bytes, `voice-note.${parsed.extension}`, {
      type: parsed.mimeType
    });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
      language: locale || 'pt',
      response_format: 'json'
    });

    return res.status(200).json({ text: transcription.text || '' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'server_error',
      message: err instanceof Error ? err.message : 'Unknown server error'
    });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text_required' });
    }

    const speech = await openai.audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      voice: voice || 'alloy',
      input: text.slice(0, 4000),
      response_format: 'mp3'
    });

    const audioBuffer = Buffer.from(await speech.arrayBuffer());
    return res.status(200).json({
      audio_base64: `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'server_error',
      message: err instanceof Error ? err.message : 'Unknown server error'
    });
  }
});

app.post('/api/history', async (req, res) => {
  try {
    if (!pgPool) {
      return res.status(503).json({ error: 'database_not_configured' });
    }

    const { user_id, user_email, locale, urgency, summary, payload } = req.body || {};
    if (!user_id || !summary) {
      return res.status(400).json({ error: 'user_id_and_summary_required' });
    }

    await pgPool.query(
      `
      insert into triage_history (user_id, user_email, locale, urgency, summary, payload)
      values ($1, $2, $3, $4, $5, $6)
      `,
      [user_id, user_email || null, locale || null, urgency || null, summary, payload || null]
    );

    await pgPool.query(`delete from triage_history where created_at < now() - interval '30 days'`);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'server_error',
      message: err instanceof Error ? err.message : 'Unknown server error'
    });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    if (!pgPool) {
      return res.status(503).json({ error: 'database_not_configured' });
    }

    const userId = req.query.user_id;
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'user_id_required' });
    }

    const { rows } = await pgPool.query(
      `
      select id, locale, urgency, summary, created_at
      from triage_history
      where user_id = $1
        and created_at >= now() - interval '30 days'
      order by created_at desc
      limit 50
      `,
      [userId]
    );
    return res.status(200).json({ items: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'server_error',
      message: err instanceof Error ? err.message : 'Unknown server error'
    });
  }
});

async function start() {
  try {
    await initDatabase();
  } catch (err) {
    console.error('Failed to initialize database schema:', err);
  }

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      root: rootDir,
      server: { middlewareMode: true },
      appType: 'custom'
    });
    app.use(vite.middlewares);
    app.get('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const templatePath = path.resolve(rootDir, 'index.html');
        const raw = await fs.readFile(templatePath, 'utf-8');
        const html = await vite.transformIndexHtml(url, raw);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (err) {
        vite.ssrFixStacktrace(err);
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(rootDir, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start();
