import { reactive, computed } from 'vue';
import * as db from './db';
import { supabase } from './lib/supabase';

const initial = db.loadStateSync(); 
const state = reactive(initial);

function persist() {
  db.saveState(state).catch(err => {
    console.error('[store] saveState failed', err);
  });
}

const store = {
  state,
  async register(username, email, password, avatarData) {
    // Require email for registration (UI should provide it)
    const emailProvided = typeof email === 'string' && email.includes('@');
    // Try Supabase when configured and email is present
    if (supabase && emailProvided) {
      try {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          const msg = (error.message || '').toString();
          if (msg.toLowerCase().includes('anonymous')) {
            // Fall back to local below
            console.warn('Supabase anonymous provider disabled — falling back to local registration:', msg);
          } else {
            return { ok: false, msg: msg || 'supabase_error' };
          }
        } else {
          const user = data?.user ?? null;
          state.currentUser = user ? { id: user.id, username: username || user.email, email: user.email, avatar: avatarData || null } : null;
          persist();
          if (data?.session) return { ok: true, msg: 'registered_logged_in' };
          return { ok: true, msg: 'registered_check_email' };
        }
      } catch (e) {
        const em = (e?.message || '').toString();
        if (em.toLowerCase().includes('anonymous')) {
          console.warn('Supabase anonymous provider disabled — falling back to local registration:', em);
        } else {
          return { ok: false, msg: em || String(e) };
        }
      }
    }

    // Local fallback registration (client-side only) — require email as well
    if (!username || !password || !emailProvided) return { ok: false, msg: 'missing' };
    if (state.users.find(u => u.username === username || (u.email && u.email === email))) return { ok: false, msg: 'exists' };
    const user = { id: Date.now() + Math.random(), username, email, password, avatar: avatarData || null };
    state.users.push(user);
    state.currentUser = { id: user.id, username: user.username, email: user.email, avatar: user.avatar || null };
    persist();
    return { ok: true, msg: 'local_fallback' };
  },
  async login(username, password) {
    const isEmail = typeof username === 'string' && username.includes('@');
    if (supabase && isEmail) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: username, password });
        if (error) return { ok: false, msg: error.message || 'supabase_error' };
        const user = data?.user ?? null;
        if (!user) return { ok: false, msg: 'no_user' };
        state.currentUser = { id: user.id, username: user.email, avatar: null };
        persist();
        return { ok: true };
      } catch (e) {
        return { ok: false, msg: e?.message || String(e) };
      }
    }

    // Fallback to local login
    const u = state.users.find(x => x.username === username && x.password === password);
    if (!u) return { ok: false };
    state.currentUser = { id: u.id, username: u.username, avatar: u.avatar || null };
    persist();
    return { ok: true };
  },
  async logout() {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('supabase signOut failed', e);
      }
    }
    state.currentUser = null;
    persist();
  },

  async createPost({ title, description, deadline, discord, media = [], tags = [] }) {
    if (!state.currentUser) return { ok: false, msg: 'auth' };
    const user = state.currentUser;

    const uploadedUrls = [];

    // Helper: convert various media formats into a Blob and base64
    async function toBlobAndBase64(m) {
      if (!m || !m.data) return { blob: null, base64: null, mime: m && m.type ? m.type : 'application/octet-stream' };
      let blob = null;
      let base64 = null;
      try {
        if (typeof m.data === 'string' && m.data.startsWith('data:')) {
          // data URL
          blob = await (await fetch(m.data)).blob();
          base64 = String(m.data).replace(/^data:.*;base64,/, '');
        } else if (m.file instanceof File) {
          blob = m.file;
          base64 = await (new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result).replace(/^data:.*;base64,/, ''));
            r.onerror = rej;
            r.readAsDataURL(m.file);
          }));
        } else {
          // assume raw base64 string
          base64 = String(m.data).replace(/^data:.*;base64,/, '');
          const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          blob = new Blob([bytes], { type: m.type || 'application/octet-stream' });
        }
      } catch (e) {
        // best-effort fallback
        console.warn('toBlobAndBase64 failed', e);
      }
      return { blob, base64, mime: m.type || 'application/octet-stream' };
    }

    // First try Supabase storage if client is available
    const sb = typeof supabase !== 'undefined' ? supabase : null;
    for (let i = 0; i < (media || []).length; i++) {
      const m = media[i];
      const { blob, base64, mime } = await toBlobAndBase64(m);
      const ext = (mime && mime.split('/')[1]) ? mime.split('/')[1] : 'jpg';
      const filename = `${user.id || 'anon'}_${Date.now()}_${i}.${ext}`;
      const path = `media/${user.id || 'anon'}/${filename}`;

      // Try Supabase upload
      if (sb && sb.storage && typeof sb.storage.from === 'function') {
        try {
          const { error: upErr } = await sb.storage.from('media').upload(path, blob || new Blob([]), { contentType: mime || 'application/octet-stream' });
          if (!upErr) {
            const { data: publicData } = sb.storage.from('media').getPublicUrl(path);
            if (publicData && publicData.publicUrl) {
              uploadedUrls.push(publicData.publicUrl);
              continue;
            }
          } else {
            console.warn('Supabase upload error', upErr);
          }
        } catch (e) {
          console.warn('Supabase upload threw', e);
        }
      }

      // Fallback: try serverless upload endpoint via db.uploadToRemote
      try {
        if (typeof db.uploadToRemote === 'function') {
          const resp = await db.uploadToRemote(filename, mime, base64 || '');
          if (resp && (resp.url || resp?.raw?.url)) {
            uploadedUrls.push(resp.url || resp.raw.url);
            continue;
          }
          // if provider returned different shape, try common property
          if (resp && typeof resp === 'string') {
            uploadedUrls.push(resp);
            continue;
          }
        }
      } catch (e) {
        console.warn('uploadToRemote failed', e);
      }

      // Last-resort: keep data URL inline (will increase localStorage size)
      if (base64) {
        const dataUrl = `data:${mime};base64,${base64}`;
        uploadedUrls.push(dataUrl);
      }
    }

    const post = {
      id: Date.now() + Math.random(),
      authorId: user.id,
      authorName: user.username || user.email || 'unknown',
      title,
      description,
      deadline,
      discord,
      tags,
      media: (uploadedUrls || []).map(u => ({ type: u && u.startsWith('data:') ? 'image' : 'external', data: u })),
      reactions: {},
      reactedBy: {},
      comments: [],
      createdAt: Date.now()
    };

    state.posts.unshift(post);
    persist();

    return { ok: true, post };
  },
  toggleReaction(postId, emoji) {
    if (!state.currentUser) return { ok: false, msg: 'auth' };
    const post = state.posts.find(p => p.id == postId);
    if (!post) return { ok: false };
    const uid = state.currentUser.id;
    const prev = post.reactedBy[uid];
    if (prev === emoji) {
      delete post.reactedBy[uid];
      post.reactions[emoji] = Math.max(0, (post.reactions[emoji]||1) - 1);
    } else {
      if (prev) post.reactions[prev] = Math.max(0, (post.reactions[prev]||1) - 1);
      post.reactedBy[uid] = emoji;
      post.reactions[emoji] = (post.reactions[emoji]||0) + 1;
    }
    persist();
    return { ok: true };
  },
  getPost(id) {
    return state.posts.find(p => p.id == id);
  },
  addMediaToPost(postId, media) {
    const post = state.posts.find(p => p.id == postId);
    if (!post) return { ok: false, msg: 'not_found' };
    post.media = post.media || [];
    post.media.push(media);
    const idx = state.posts.findIndex(p => p.id == postId);
    if (idx > -1) {
      const [x] = state.posts.splice(idx,1);
      state.posts.unshift(x);
    }
    persist();
    return { ok: true, post };
  },

  addComment(postId, content, parentId = null) {
    if (!state.currentUser) return { ok: false, msg: 'auth' };
    const post = state.posts.find(p => p.id == postId);
    if (!post) return { ok: false, msg: 'not_found' };
    const text = (content || '').toString().trim();
    if (!text) return { ok: false, msg: 'empty' };
    const comment = {
      id: Date.now() + Math.random(),
      postId,
      parentId: parentId || null,
      authorId: state.currentUser.id,
      authorName: state.currentUser.username,
      content: text,
      reactions: {},       
      reactedBy: {},       
      pinned: false,
      createdAt: Date.now()
    };
    post.comments = post.comments || [];
    post.comments.push(comment);
    persist();
    return { ok: true, comment };
  },

  toggleCommentReaction(postId, commentId, emoji) {
    if (!state.currentUser) return { ok: false, msg: 'auth' };
    const post = state.posts.find(p => p.id == postId);
    if (!post) return { ok: false, msg: 'post_not_found' };
    post.comments = post.comments || [];
    const c = post.comments.find(x => x.id == commentId);
    if (!c) return { ok: false, msg: 'comment_not_found' };
    const uid = state.currentUser.id;
    const prev = c.reactedBy[uid];
    if (prev === emoji) {
      delete c.reactedBy[uid];
      c.reactions[emoji] = Math.max(0, (c.reactions[emoji]||1) - 1);
    } else {
      if (prev) c.reactions[prev] = Math.max(0, (c.reactions[prev]||1) - 1);
      c.reactedBy[uid] = emoji;
      c.reactions[emoji] = (c.reactions[emoji]||0) + 1;
    }
    persist();
    return { ok: true };
  },

  pinComment(postId, commentId) {
    if (!state.currentUser) return { ok: false, msg: 'auth' };
    const post = state.posts.find(p => p.id == postId);
    if (!post) return { ok: false, msg: 'post_not_found' };
    if (!post.authorId || post.authorId !== state.currentUser.id) return { ok: false, msg: 'forbidden' };
    post.comments = post.comments || [];
    const c = post.comments.find(x => x.id == commentId);
    if (!c) return { ok: false, msg: 'comment_not_found' };
    c.pinned = !c.pinned;
    persist();
    return { ok: true, pinned: c.pinned };
  },

  setSearch(q) {
    state.searchQuery = (q || '').toString();
    persist();
  },
  getPopular(minReactions = 3) {
    return state.posts.filter(p => {
      const total = Object.values(p.reactions).reduce((a,b)=>a+b,0);
      return total >= minReactions;
    }).sort((a,b)=> (Object.values(b.reactions).reduce((s,x)=>s+x,0)) - (Object.values(a.reactions).reduce((s,x)=>s+x,0)));
  }
};

export default store;

/**
 * createPost: uploads a file to storage and creates a post row in the DB.
 * - Ensures the user is authenticated (needed when RLS requires auth.uid()).
 * - Stores files under a user-scoped path to avoid collisions.
 * - Inserts a row with user_id to satisfy common RLS policies.
 *
 * Usage:
 *   await createPost({ title: 'My post', file: File });
 */
export async function createPost({ title, file, bucket = 'posts', table = 'posts' } = {}) {
	// ensure we have an authenticated session
	const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
	if (sessionError) throw sessionError;
	const user = sessionData?.session?.user;
	if (!user) throw new Error('Not authenticated. Please sign in before creating posts.');

	// build a user-scoped filename
	const ext = file.name?.split('.').pop() ?? 'bin';
	const filePath = `${user.id}/${Date.now()}.${ext}`;

	// upload to storage
	const { data: uploadData, error: uploadError } = await supabase.storage
		.from(bucket)
		.upload(filePath, file, { cacheControl: '3600', upsert: false });

	if (uploadError) {
		// If this is an RLS/storage policy problem, show a helpful message
		if (uploadError.message?.toLowerCase().includes('row-level security')) {
			throw new Error(
				'Supabase storage upload blocked by RLS. Ensure your storage policies allow the authenticated user to upload to this bucket.'
			);
		}
		throw uploadError;
	}

	// optionally get a public or signed URL (adjust to your access needs)
	const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
	const publicUrl = publicUrlData?.publicUrl ?? null;

	// insert a DB row including user_id to satisfy RLS policies that check ownership
	const insertPayload = {
		title,
		user_id: user.id, // common column name used in RLS policies
		file_path: filePath,
		file_url: publicUrl,
		created_at: new Date().toISOString(),
	};

	const { data: inserted, error: insertError } = await supabase.from(table).insert([insertPayload]);

	if (insertError) {
		// common RLS-related explanation
		if (insertError.message?.toLowerCase().includes('row-level security')) {
			throw new Error(
				'Insert blocked by row-level security. Make sure your table has a policy allowing authenticated users to insert rows when user_id = auth.uid(), or insert using a server-side service role key.'
			);
		}
		throw insertError;
	}

	return { post: inserted?.[0] ?? null, upload: uploadData, publicUrl };
}

/**
 * insertPost: inserts a post row including user_id to satisfy RLS policies.
 * - payload should include fields matching your posts table (e.g., title, file_path).
 */
export async function insertPost(payload = {}, table = 'posts') {
	// ensure authenticated
	const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
	if (sessionError) throw sessionError;
	const user = sessionData?.session?.user;
	if (!user) throw new Error('Not authenticated — sign in first.');

	// ensure user_id is set to auth.uid()
	const row = {
		...payload,
		user_id: user.id, // important for RLS: must match auth.uid()
	};

	const { data, error } = await supabase.from(table).insert([row]);
	if (error) {
		// helpful message if RLS blocks insert
		if (error.message?.toLowerCase().includes('row-level security')) {
			throw new Error(
				'Insert blocked by RLS. Ensure your posts table has a policy allowing inserts when user_id = auth.uid() and that you are including user_id in the insert.'
			);
		}
		throw error;
	}
	return data?.[0] ?? null;
}