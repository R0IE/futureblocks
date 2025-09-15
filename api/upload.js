module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { name, mime, data } = req.body || {};
  if (!name || !data) {
    res.status(400).json({ error: 'Missing name or data' });
    return;
  }

  // provider configuration (set in Vercel Environment Variables)
  const BLOB_PROVIDER_URL = process.env.BLOB_PROVIDER_URL || null; // e.g. your provider upload endpoint
  const BLOB_PROVIDER_TOKEN = process.env.BLOB_PROVIDER_TOKEN || null; // optional auth token

  if (!BLOB_PROVIDER_URL) {
    // No remote configured — respond with helpful message so frontend can handle fallback
    res.status(501).json({ error: 'No BLOB_PROVIDER_URL configured on server. Set Vercel env BLOB_PROVIDER_URL to enable uploads.' });
    return;
  }

  try {
    // Forward to provider — expecting provider accepts JSON { name, mime, data } (base64)
    const forwardRes = await fetch(BLOB_PROVIDER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(BLOB_PROVIDER_TOKEN ? { 'Authorization': `Bearer ${BLOB_PROVIDER_TOKEN}` } : {})
      },
      body: JSON.stringify({ name, mime, data })
    });

    const payload = await forwardRes.text();
    let parsed;
    try { parsed = JSON.parse(payload); } catch(e) { parsed = { raw: payload }; }

    if (!forwardRes.ok) {
      res.status(forwardRes.status).json({ error: 'Provider upload failed', details: parsed });
      return;
    }

    // Expect provider returns { url: 'https://...' } or similar — return to client
    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: 'Upload handler failed', message: err && err.message ? err.message : String(err) });
  }
};
