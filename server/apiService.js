import OpenAI, { toFile } from 'openai';
import { Pool } from 'pg';
import { buildSystemPrompt } from './triagePrompt.js';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

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

let databaseReadyPromise = null;

const triageSchema = {
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
      required: ['hpi', 'ros', 'pmh', 'meds', 'allergies', 'family_history', 'social'],
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
};

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

export async function ensureDatabase() {
  if (!pgPool) return;
  if (!databaseReadyPromise) {
    databaseReadyPromise = (async () => {
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
    })();
  }
  await databaseReadyPromise;
}

export async function runTriage(payload = {}) {
  const { locale, session_id, initialSymptoms, qa, age, sex } = payload;
  if (!initialSymptoms) {
    throw new HttpError(400, 'initialSymptoms_required', 'initialSymptoms is required');
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
        schema: triageSchema,
        strict: true
      }
    }
  });

  const text = response.output_text || '';
  return JSON.parse(text);
}

export async function transcribeAudio(payload = {}) {
  const { audio_base64, locale } = payload;
  const parsed = parseBase64Audio(audio_base64);
  if (!parsed) {
    throw new HttpError(400, 'invalid_audio_payload', 'Invalid base64 audio payload');
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

  return { text: transcription.text || '' };
}

export async function synthesizeSpeech(payload = {}) {
  const { text, voice } = payload;
  if (!text || typeof text !== 'string') {
    throw new HttpError(400, 'text_required', 'text is required');
  }

  const speech = await openai.audio.speech.create({
    model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    voice: voice || 'alloy',
    input: text.slice(0, 4000),
    response_format: 'mp3'
  });

  const audioBuffer = Buffer.from(await speech.arrayBuffer());
  return { audio_base64: `data:audio/mpeg;base64,${audioBuffer.toString('base64')}` };
}

export async function saveHistory(payload = {}) {
  if (!pgPool) {
    throw new HttpError(503, 'database_not_configured', 'Database not configured');
  }
  await ensureDatabase();

  const { user_id, user_email, locale, urgency, summary, payload: rawPayload } = payload;
  if (!user_id || !summary) {
    throw new HttpError(400, 'user_id_and_summary_required', 'user_id and summary are required');
  }

  await pgPool.query(
    `
      insert into triage_history (user_id, user_email, locale, urgency, summary, payload)
      values ($1, $2, $3, $4, $5, $6)
    `,
    [user_id, user_email || null, locale || null, urgency || null, summary, rawPayload || null]
  );
  await pgPool.query(`delete from triage_history where created_at < now() - interval '30 days'`);
  return { ok: true };
}

export async function getHistory(userId) {
  if (!pgPool) {
    throw new HttpError(503, 'database_not_configured', 'Database not configured');
  }
  await ensureDatabase();
  if (!userId) {
    throw new HttpError(400, 'user_id_required', 'user_id is required');
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
  return { items: rows };
}
