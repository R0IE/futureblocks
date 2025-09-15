import { reactive, computed } from 'vue';
import * as db from './db'; // new adapter

// replace previous load/save with db adapter
const initial = db.loadStateSync(); // synchronous bootstrap
const state = reactive(initial);

// helper to persist current reactive state (best effort async)
function persist() {
  // call db.saveState but don't block UI; log errors
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
  // updated to accept tags (array of strings)
  createPost({ title, description, deadline, discord, media, tags }) {
    if (!state.currentUser) return { ok: false, msg: 'auth' };
    const post = {
      id: Date.now() + Math.random(),
      authorId: state.currentUser.id,
      authorName: state.currentUser.username,
      title,
      description,
      deadline,
      discord,
      tags: tags || [], // new: tags array
      media: media || [], // array of {type:'image'|'video', data:base64}
      reactions: {}, // key: emoji -> count
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
    // only post author can pin comments
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
