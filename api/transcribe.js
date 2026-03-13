import { transcribeAudio } from '../server/apiService.js';
import { readBody, sendError } from './_utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  try {
    const body = await readBody(req);
    const data = await transcribeAudio(body);
    return res.status(200).json(data);
  } catch (err) {
    return sendError(res, err);
  }
}
