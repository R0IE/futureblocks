import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const body = req.body || {};
    const { userId, title, description, deadline, discord, tags, media } = body;
    if (!userId || !title) return res.status(400).json({ error: 'missing_parameters' });

    // Validate media array: [{ filename, mime, base64 }]
    const uploadedUrls = [];
    if (Array.isArray(media) && media.length) {
      for (let i = 0; i < media.length; i++) {
        const item = media[i] || {};
        const filename = String(item.filename || `file_${i}.bin`).replace(/[^a-zA-Z0-9._-]/g, '_');
        const mime = String(item.mime || 'application/octet-stream');
        const base64 = String(item.base64 || '').replace(/^data:.*;base64,/, '');
        if (!base64) continue;

        const path = `media/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}_${filename}`;
        const buffer = Buffer.from(base64, 'base64');

        // Basic size check: 10 MB per file
        const MAX_BYTES = 10 * 1024 * 1024;
        if (buffer.length > MAX_BYTES) {
          return res.status(400).json({ error: 'file_too_large' });
        }

        const { error: uploadError } = await supabase.storage.from('media').upload(path, buffer, { contentType: mime });
        if (uploadError) {
          console.error('create-post upload error', uploadError);
          return res.status(500).json({ error: uploadError.message || 'upload_failed' });
        }

        const { data: publicData } = supabase.storage.from('media').getPublicUrl(path);
        const publicUrl = publicData?.publicUrl || null;
        if (publicUrl) uploadedUrls.push(publicUrl);
      }
    }

    // Insert post row
    const insertPayload = {
      title: title || null,
      description: description || null,
      deadline: deadline || null,
      discord: discord || null,
      tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
      user_id: userId,
      media_urls: uploadedUrls,
      file_url: uploadedUrls[0] || null,
      supports_total: 0,
      created_at: new Date().toISOString()
    };

    const { data: inserted, error: insertError } = await supabase.from('posts').insert([insertPayload]).select();
    if (insertError) {
      console.error('create-post insert error', insertError);
      return res.status(500).json({ error: insertError.message || 'insert_failed' });
    }

    return res.json({ ok: true, post: inserted && inserted[0] ? inserted[0] : null });
  } catch (e) {
    console.error('create-post exception', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
