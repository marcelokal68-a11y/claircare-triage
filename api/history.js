import { getHistory, saveHistory } from '../server/apiService.js';
import { readBody, sendError } from './_utils.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = await readBody(req);
      const data = await saveHistory(body);
      return res.status(200).json(data);
    }
    if (req.method === 'GET') {
      const userId = typeof req.query?.user_id === 'string' ? req.query.user_id : '';
      const data = await getHistory(userId);
      return res.status(200).json(data);
    }
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    return sendError(res, err);
  }
}
