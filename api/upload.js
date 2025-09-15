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

  // normalize base64 payload (support data:...;base64, prefixed strings)
  const base64 = String(data).replace(/^data:.*;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  if (process.env.VERCEL_BLOB_TOKEN) {
    try {
      const blobPkg = require('@vercel/blob');

      if (typeof blobPkg.upload === 'function') {
        const result = await blobPkg.upload({
          token: process.env.VERCEL_BLOB_TOKEN,
          file: buffer,
          filename: name,
          contentType: mime || 'application/octet-stream'
        });
        const url = result && (result.url || result.Location || (Array.isArray(result) && result[0] && result[0].url));
        return res.status(200).json(url ? { url, raw: result } : result);
      }

      if (typeof blobPkg.default === 'function') {
        const result = await blobPkg.default({ token: process.env.VERCEL_BLOB_TOKEN, file: buffer, filename: name, contentType: mime || 'application/octet-stream' });
        const url = result && (result.url || result.Location);
        return res.status(200).json(url ? { url, raw: result } : result);
      }

    } catch (err) {
      console.error('[api/upload] Vercel Blob upload failed:', err && err.message ? err.message : err);
    }
  }

  const BLOB_PROVIDER_URL = process.env.BLOB_PROVIDER_URL || null;
  const BLOB_PROVIDER_TOKEN = process.env.BLOB_PROVIDER_TOKEN || null;

  if (BLOB_PROVIDER_URL) {
    try {
      const forwardRes = await fetch(BLOB_PROVIDER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(BLOB_PROVIDER_TOKEN ? { 'Authorization': `Bearer ${BLOB_PROVIDER_TOKEN}` } : {})
        },
        body: JSON.stringify({ name, mime, data: base64 })
      });

      const text = await forwardRes.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) { parsed = { raw: text }; }

      if (!forwardRes.ok) {
        res.status(forwardRes.status).json({ error: 'Provider upload failed', details: parsed });
        return;
      }

      // Expect provider returns { url: 'https://...' } or similar — return to client
      // Normalize to { url } when possible
      const url = parsed && (parsed.url || parsed.location || parsed.Location) || (parsed.raw && parsed.raw);
      return res.status(200).json(url ? { url, raw: parsed } : parsed);
    } catch (err) {
      console.error('[api/upload] forwarding to BLOB_PROVIDER_URL failed:', err && err.message ? err.message : err);
      res.status(500).json({ error: 'Upload handler failed', message: err && err.message ? err.message : String(err) });
      return;
    }
  }

  res.status(501).json({ error: 'No blob provider configured. Set VERCEL_BLOB_TOKEN or BLOB_PROVIDER_URL in environment variables.' });
};
