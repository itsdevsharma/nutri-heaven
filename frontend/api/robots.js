import { robotsTxt } from '../seo/site.js';
import { getOrigin } from '../seo/server.js';
export default function handler(_req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send(robotsTxt(getOrigin()));
}
