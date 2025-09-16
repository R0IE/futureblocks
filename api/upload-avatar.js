import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Ensure service role key is present; this file runs server-side on Vercel only
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const { userId, filename, mime, base64 } = req.body || {};
    if (!userId || !base64) return res.status(400).json({ error: 'missing_parameters' });

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
