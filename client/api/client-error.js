export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const report = {
    message: String(body.message || 'Unknown client error').slice(0, 500),
    stack: String(body.stack || '').slice(0, 4000),
    componentStack: String(body.componentStack || '').slice(0, 4000),
    path: String(body.path || '').slice(0, 300),
    userAgent: String(body.userAgent || '').slice(0, 500),
    occurredAt: String(body.occurredAt || ''),
  };
  console.error('[CLIENT_RENDER_ERROR]', JSON.stringify(report));
  return res.status(204).end();
}
