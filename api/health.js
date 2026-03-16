import { healthStatus } from '../server/apiService.js';
import { sendError } from './_utils.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  try {
    const data = await healthStatus();
    return res.status(200).json(data);
  } catch (err) {
    return sendError(res, err);
  }
}
