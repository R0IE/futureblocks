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
  register(username, password, avatarData) {
    if (!username || !password) return { ok: false, msg: 'missing' };
    if (state.users.find(u => u.username === username)) return { ok: false, msg: 'exists' };
    const user = { id: Date.now() + Math.random(), username, password, avatar: avatarData || null };
    state.users.push(user);
    state.currentUser = { id: user.id, username: user.username, avatar: user.avatar || null };
    persist();
    return { ok: true };
  },
  login(username, password) {
    const u = state.users.find(x => x.username === username && x.password === password);
    if (!u) return { ok: false };
    state.currentUser = { id: u.id, username: u.username, avatar: u.avatar || null };
    persist();
    return { ok: true };
  },
  logout() {
    state.currentUser = null;
    persist();
  },

  async createPost({ title, description, deadline, discord, media = [], tags = [] }) {
    if (!state.currentUser) return { ok: false, msg: 'auth' };
    const user = state.currentUser;

    const uploadedUrls = [];
    for (let i = 0; i < (media || []).length; i++) {
      const m = media[i];
      if (!m || !m.data) continue;

      // convert data URL to Blob if needed
      let blob;
      if (typeof m.data === 'string' && m.data.startsWith('data:')) {
        blob = await (await fetch(m.data)).blob();
      } else if (m.file instanceof File) {
        blob = m.file;
      } else {
        // assume base64 without prefix
        const base64 = String(m.data).replace(/^data:.*;base64,/, '');
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        blob = new Blob([bytes], { type: m.type || 'application/octet-stream' });
      }

      const ext = (m.type && m.type.split('/')[1]) ? m.type.split('/')[1] : 'jpg';
      const path = `media/${user.id}/${Date.now()}_${i}.${ext}`;

      const { error: upErr } = await supabase.storage.from('media').upload(path, blob, {
        contentType: m.type || 'application/octet-stream'
      });

      if (upErr) {
        console.warn('upload failed', upErr);
        continue;
      }

      const { data: publicData } = supabase.storage.from('media').getPublicUrl(path);
      uploadedUrls.push(publicData.publicUrl);
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
      media: uploadedUrls.map(u => ({ type: 'external', data: u })),
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
