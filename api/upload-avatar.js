import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Ensure service role key is present; this file runs server-side on Vercel only
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  // Require an Authorization header (Bearer <access_token>) to ensure request comes from an authenticated user
  const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || null;
  if (!auth || !String(auth).toLowerCase().startsWith('bearer ')) return res.status(401).json({ error: 'missing_auth' });
  const token = String(auth).split(' ')[1];

  try {
    // verify token maps to a valid user
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData || !userData.user) {
      console.warn('upload-avatar auth verification failed', userErr);
      return res.status(401).json({ error: 'invalid_token' });
    }

    const { user } = userData;
    const { userId, filename, mime, base64 } = req.body || {};
    if (!userId || !base64) return res.status(400).json({ error: 'missing_parameters' });

    // ensure the token holder is the same as the provided userId (prevent rogue uploads)
    if (String(user.id) !== String(userId)) return res.status(403).json({ error: 'forbidden' });

    const ext = (filename && filename.split('.').pop()) || (mime && mime.split('/')[1]) || 'png';
    const safeName = filename ? filename.replace(/[^a-zA-Z0-9._-]/g, '_') : `avatar.${ext}`;
    const path = `avatars/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;

    const buffer = Buffer.from(base64, 'base64');

    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, buffer, { contentType: mime || 'image/png' });
    if (uploadError) {
      console.error('Supabase upload error', uploadError);
      return res.status(500).json({ error: uploadError.message || 'upload_failed' });
    }

    const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path);
    const publicUrl = publicData?.publicUrl || null;
    return res.json({ publicUrl });
  } catch (e) {
    console.error('upload-avatar error', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
