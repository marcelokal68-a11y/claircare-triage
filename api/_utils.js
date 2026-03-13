import { HttpError } from '../server/apiService.js';

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length > 0) {
    try {
      return JSON.parse(req.body);
    } catch (err) {
      throw new HttpError(400, 'invalid_json', 'Invalid JSON body');
    }
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch (err) {
    throw new HttpError(400, 'invalid_json', 'Invalid JSON body');
  }
}

export function sendError(res, err) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  console.error(err);
  return res.status(500).json({
    error: 'server_error',
    message: err instanceof Error ? err.message : 'Unknown server error'
  });
}
