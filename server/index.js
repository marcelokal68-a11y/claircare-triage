import express from 'express';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import {
  deleteHistory,
  healthStatus,
  HttpError,
  ensureDatabase,
  getHistory,
  runTriage,
  saveHistory,
  synthesizeSpeech,
  transcribeAudio
} from './apiService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
app.use(express.json({ limit: '15mb' }));

function mapError(err, res) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  console.error(err);
  return res.status(500).json({
    error: 'server_error',
    message: err instanceof Error ? err.message : 'Unknown server error'
  });
}

app.post('/api/triage', async (req, res) => {
  try {
    const data = await runTriage(req.body || {});
    return res.status(200).json(data);
  } catch (err) {
    return mapError(err, res);
  }
});

app.post('/api/transcribe', async (req, res) => {
  try {
    const data = await transcribeAudio(req.body || {});
    return res.status(200).json(data);
  } catch (err) {
    return mapError(err, res);
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const data = await synthesizeSpeech(req.body || {});
    return res.status(200).json(data);
  } catch (err) {
    return mapError(err, res);
  }
});

app.post('/api/history', async (req, res) => {
  try {
    const data = await saveHistory(req.body || {});
    return res.status(200).json(data);
  } catch (err) {
    return mapError(err, res);
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const userId = typeof req.query.user_id === 'string' ? req.query.user_id : '';
    const data = await getHistory(userId);
    return res.status(200).json(data);
  } catch (err) {
    return mapError(err, res);
  }
});

app.delete('/api/history', async (req, res) => {
  try {
    const userId =
      typeof req.query.user_id === 'string'
        ? req.query.user_id
        : typeof req.body?.user_id === 'string'
          ? req.body.user_id
          : '';
    const data = await deleteHistory(userId);
    return res.status(200).json(data);
  } catch (err) {
    return mapError(err, res);
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    const data = await healthStatus();
    return res.status(200).json(data);
  } catch (err) {
    return mapError(err, res);
  }
});

async function start() {
  try {
    await ensureDatabase();
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
