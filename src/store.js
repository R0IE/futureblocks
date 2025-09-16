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
    // Prefer Supabase when configured and we can interpret the identifier as an email
    const looksLikeEmail = typeof username === 'string' && username.includes('@');
    const localHasEmail = state.users.find(u => u.email && u.email === username);
    if (supabase && (looksLikeEmail || localHasEmail)) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: username, password });
        if (error) return { ok: false, msg: error.message || 'supabase_error' };
        const user = data?.user ?? null;
        if (!user) return { ok: false, msg: 'no_user' };
        state.currentUser = { id: user.id, username: user.email, email: user.email, avatar: null };
        persist();
        return { ok: true };
      } catch (e) {
        return { ok: false, msg: e?.message || String(e) };
      }
    }

    // Local fallback: username/password matching local store
    const u = state.users.find(x => x.username === username && x.password === password);
    if (!u) return { ok: false };
    state.currentUser = { id: u.id, username: u.username, email: u.email || null, avatar: u.avatar || null };
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

    // Check whether the current user has an active Supabase session that matches
    // the app's currentUser. If not, avoid using Supabase storage/DB (prevents RLS failures).
    let canUseSupabase = false;
    try {
      if (supabase && supabase.auth && typeof supabase.auth.getSession === 'function') {
        const { data: sessionData } = await supabase.auth.getSession();
        const sbUser = sessionData?.session?.user ?? null;
        if (sbUser && user && sbUser.id === user.id) canUseSupabase = true;
      }
    } catch (e) {
      canUseSupabase = false;
    }

    const sb = canUseSupabase ? supabase : null;

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
    for (let i = 0; i < (media || []).length; i++) {
      const m = media[i];
      const { blob, base64, mime } = await toBlobAndBase64(m);
      const ext = (mime && mime.split('/')[1]) ? mime.split('/')[1] : 'jpg';
      const filename = `${user.id || 'anon'}_${Date.now()}_${i}.${ext}`;
      const path = `media/${user.id || 'anon'}/${filename}`;

      // Try Supabase upload only when we have a matching Supabase session
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

    // Build local post object
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
      supportsTotal: 0, // total amount tipped/support given to this post
      tips: [], // { userId, amount, createdAt }
      supports: 0, // simple support count
      comments: [],
      createdAt: Date.now()
    };

    // If we have Supabase session, try inserting a remote DB row (so post exists server-side).
    // If insert fails due to RLS, return a clear error so you can adjust policies.
    if (sb) {
      try {
        const insertPayload = {
          title,
          user_id: user.id,
          file_path: null,
          file_url: uploadedUrls[0] || null,
          created_at: new Date().toISOString()
        };
        const { data: inserted, error: insertError } = await sb.from('posts').insert([insertPayload]);
        if (insertError) {
          if (insertError.message?.toLowerCase().includes('row-level security')) {
            return { ok: false, msg: 'Insert blocked by row-level security. Ensure your posts table policy allows inserts where user_id = auth.uid().' };
          }
          return { ok: false, msg: insertError.message || 'insert_failed' };
        }
        // If remote insert succeeded, prefer the server id if available
        if (inserted && inserted[0] && inserted[0].id) post.id = inserted[0].id;
      } catch (e) {
        return { ok: false, msg: e?.message || String(e) };
      }
    }

    // Always keep a local copy so the UI updates even when remote operations aren't used
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
    // Award simple achievement for first vote
    try {
      const user = state.users.find(u => u.id === uid);
      if (user) {
        user.achievements = user.achievements || {};
        if (!user.achievements.firstVote) {
          user.achievements.firstVote = { earnedAt: Date.now(), desc: 'First Vote' };
        }
      }
      // Maintain creator badges: e.g., First 10 Upvotes
      const author = state.users.find(u => u.id === post.authorId);
      if (author) {
        author.badges = author.badges || {};
        // compute total upvotes for the author's posts
        const authorPosts = state.posts.filter(x => x.authorId === author.id);
        const totalUpvotes = authorPosts.reduce((s,pp)=> s + Object.values(pp.reactions || {}).reduce((a,b)=>a+b,0), 0);
        if (totalUpvotes >= 10 && !author.badges['first10upvotes']) {
          author.badges['first10upvotes'] = { awardedAt: Date.now(), desc: 'First 10 Upvotes' };
        }
      }
    } catch (e) {
      console.warn('award achievement failed', e);
    }

    persist();
    return { ok: true };
  },
  
  // Tip a post (support a creator). Amount is a number (currency units).
  tipPost(postId, amount) {
    if (!state.currentUser) return { ok: false, msg: 'auth' };
    const post = state.posts.find(p => p.id == postId);
    if (!post) return { ok: false, msg: 'not_found' };
    const amt = Number(amount) || 0;
    if (amt <= 0) return { ok: false, msg: 'invalid_amount' };
    const uid = state.currentUser.id;
    post.tips = post.tips || [];
    post.tips.push({ userId: uid, amount: amt, createdAt: Date.now() });
    post.supportsTotal = (post.supportsTotal || 0) + amt;
    // track simple supports count
    post.supports = (post.supports || 0) + 1;

    // award achievements to tipper
    try {
      const tipper = state.users.find(u => u.id === uid);
      if (tipper) {
        tipper.achievements = tipper.achievements || {};
        tipper.achievements.firstTip = tipper.achievements.firstTip || { earnedAt: Date.now(), desc: 'First Tip' };
        // Supported 5 Games
        const tipsMade = state.posts.reduce((c,p)=> c + (p.tips ? p.tips.filter(t=>t.userId===uid).length : 0), 0);
        if (tipsMade >= 5 && !tipper.achievements.supported5) {
          tipper.achievements.supported5 = { earnedAt: Date.now(), desc: 'Supported 5 Games' };
        }
      }
    } catch (e) {
      console.warn('tip achievements failed', e);
    }

    // award badges to creator for most supported game if applicable
    try {
      const creator = state.users.find(u => u.id === post.authorId);
      if (creator) {
        creator.badges = creator.badges || {};
        const top = this.getLeaderboard('posts', 1);
        if (top && top.length && top[0].id === post.id) {
          creator.badges['most_supported_game'] = { awardedAt: Date.now(), desc: 'Most Supported Game' };
        }
      }
    } catch (e) {
      console.warn('creator badge failed', e);
    }

    persist();
    return { ok: true };
  },

  // Compute a leaderboard of posts or creators by supportsTotal or reactions
  // type: 'posts' or 'creators' ; limit: number
  getLeaderboard(type = 'posts', limit = 10, period = 'week') {
    if (type === 'posts') {
      const arr = state.posts.slice().sort((a,b)=> (b.supportsTotal || 0) - (a.supportsTotal || 0));
      return arr.slice(0, limit);
    } else if (type === 'creators') {
      // aggregate by authorId
      const m = {};
      state.posts.forEach(p=>{
        m[p.authorId] = m[p.authorId] || { authorId: p.authorId, totalSupports: 0, totalReacts:0 };
        m[p.authorId].totalSupports += (p.supportsTotal || 0);
        m[p.authorId].totalReacts += Object.values(p.reactions||{}).reduce((s,x)=>s+x,0);
      });
      const arr = Object.values(m).map(x=> ({ id: x.authorId, totalSupports: x.totalSupports, totalReacts: x.totalReacts, author: state.users.find(u=>u.id===x.authorId) }));
      arr.sort((a,b)=> b.totalSupports - a.totalSupports);
      return arr.slice(0, limit);
    }
    return [];
  },

  // Return spotlight posts for homepage — pick a few with high engagement and/or editor picks
  getSpotlight(limit = 3) {
    // pick posts with recent activity: supports + reactions weighted, prefer upcoming deadlines
    const score = (p) => {
      const reacts = Object.values(p.reactions||{}).reduce((s,x)=>s+x,0);
      const supports = p.supportsTotal || 0;
      // urgency for deadlines: if within 7 days give bonus
      let urgency = 0;
      if (p.deadline) {
        const d = new Date(p.deadline + 'T00:00:00');
        const diff = (d - Date.now())/(1000*60*60*24);
        if (diff >= 0 && diff < 7) urgency = 5;
      }
      return reacts * 1 + supports * 0.5 + urgency;
    };
    const arr = state.posts.slice().sort((a,b)=> score(b) - score(a));
    return arr.slice(0, limit);
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
  // Update a user's profile fields (name, username, bio, avatar)
  async updateUser(userId, { name, username, bio, avatarFile, avatarData } = {}) {
    const u = state.users.find(x => x.id == userId);
    if (!u) return { ok: false, msg: 'user_not_found' };

    // helper: convert File to data URL
    async function fileToDataUrl(file) {
      return await new Promise((res, rej) => {
        try {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = rej;
          r.readAsDataURL(file);
        } catch (e) { rej(e); }
      });
    }

    try {
      // server-side size limit check: 3 MB
      const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
      if (avatarFile && typeof avatarFile.size === 'number' && avatarFile.size > MAX_AVATAR_BYTES) {
        return { ok: false, msg: 'file_too_large' };
      }
      // If we have a Supabase client and an authenticated Supabase session for this user, upload to 'avatars' bucket
      let uploadedUrl = null;
      try {
        if (avatarFile && supabase && supabase.auth && typeof supabase.auth.getSession === 'function') {
          const { data: sessionData } = await supabase.auth.getSession();
          const sbUser = sessionData?.session?.user ?? null;
          if (sbUser && String(sbUser.id) === String(userId)) {
            // attempt upload
            const mime = avatarFile.type || 'image/png';
            const ext = mime.split('/')[1] || 'png';
            const filename = `avatar_${userId}_${Date.now()}.${ext}`;
            const path = `avatars/${userId}/${filename}`;
            try {
              const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile, { contentType: mime });
              if (!upErr) {
                const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path);
                if (publicData && publicData.publicUrl) uploadedUrl = publicData.publicUrl;
              } else {
                console.warn('Supabase avatar upload error', upErr);
              }
            } catch (e) { console.warn('Supabase avatar upload threw', e); }
          }
        }
      } catch (e) {
        console.warn('supabase avatar pre-check failed', e);
      }

      if (uploadedUrl) {
        u.avatar = uploadedUrl;
      } else if (avatarFile && typeof avatarFile === 'object' && typeof avatarFile.name === 'string') {
        const dataUrl = await fileToDataUrl(avatarFile);
        u.avatar = dataUrl;
      } else if (avatarData) {
        u.avatar = avatarData;
      }
    } catch (e) {
      console.warn('avatar conversion or upload failed', e);
    }

    if (typeof name === 'string') u.name = name;
    if (typeof username === 'string') u.username = username;
    if (typeof bio === 'string') u.bio = bio;

    // keep currentUser in sync
    if (state.currentUser && state.currentUser.id == u.id) {
      state.currentUser = { ...state.currentUser, username: u.username, avatar: u.avatar, name: u.name };
    }

    persist();
    return { ok: true, user: u };
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