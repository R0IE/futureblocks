<template>
  <div v-if="post" class="post-view">
    <div class="main">
      <div class="hero" :style="heroStyle">
        <div class="hero-meta">
          <h1 class="title">{{ post.title }}</h1>
          <div class="sub">by <strong>{{ post.authorName }}</strong> • <span class="muted">{{ formattedDate }}</span></div>
        </div>
      </div>

      <div class="embed">
        <div class="embed-left">
          <div class="author-line">
            <img v-if="authorAvatar" :src="authorAvatar" class="author-avatar" />
            <div>
              <div class="author-name">{{ post.authorName }}</div>
              <div class="muted small">Project post • {{ totalReacts(post) }} reactions</div>
            </div>
          </div>

          <div class="description" v-html="post.description"></div>

          <div class="media-grid">
            <div v-for="(m,i) in post.media" :key="i" class="media-card" @click.stop="openMedia(m)">
              <img v-if="m.type==='image'" :src="m.data" alt="media" />
              <video v-else :src="m.data" muted playsinline></video>
            </div>
          </div>

          <div class="actions">
            <div class="reactions">
              <button
                v-for="e in emojis"
                :key="e"
                :class="['react-btn', { active: isPostReacted(e) }]"
                @click="react(e)">
                <span class="emoji">{{ e }}</span>
                <span class="count">{{ post.reactions[e] || 0 }}</span>
              </button>
            </div>

            <div class="tip-area">
              <button class="tip-btn" @click.stop="openTipModal">Support / Tip</button>
              <div class="tip-summary small muted">{{ formatCurrency(post.supportsTotal || 0) }} • {{ post.supports || 0 }} supports</div>
              <TipModal v-if="showTipModal" :postId="post.id" @close="showTipModal = false" @tipped="onTipped" />
            </div>

            <div class="upload" v-if="currentUser && currentUser.id === post.authorId">
              <label class="upload-label">Add media</label>
              <input type="file" @change="onFiles" accept="image/*,video/*" multiple />
            </div>
          </div>

        
          <div class="comments-section">
            <h3>Comments <span class="muted">({{ allComments.length }})</span></h3>

            <div v-if="pinnedComments.length" class="pinned-block">
              <div class="pinned-label">Pinned</div>
              <div v-for="c in pinnedComments" :key="c.id" class="comment">
                <img v-if="getUserAvatar(c.authorId)" :src="getUserAvatar(c.authorId)" class="comment-avatar" />
                <div class="comment-body">
                  <div class="comment-bubble pinned">
                    <div class="comment-head">
                      <span class="comment-author">{{ c.authorName }}</span>
                      <span class="comment-ts muted">{{ formatDate(c.createdAt) }}</span>
                    </div>
                    <div class="comment-content">{{ c.content }}</div>
                    <div class="comment-row">
                      <div class="reacts">
                        <button v-for="e in commentEmojis" :key="e" class="react-pill" @click="toggleCommentReact(c, e)">
                          <span>{{ e }}</span>
                          <span class="count">{{ c.reactions && c.reactions[e] ? c.reactions[e] : 0 }}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="replies-controls" v-if="repliesOf(c.id).length">
                    <button class="show-replies-btn" v-if="!replyLimit[c.id] || replyLimit[c.id] === 0" @click="showInitialReplies(c.id)">
                      Show {{ Math.min(5, repliesOf(c.id).length) }} replies
                    </button>
                    <div v-else>
                      <button class="show-replies-btn" v-if="replyLimit[c.id] < repliesOf(c.id).length" @click="showMoreReplies(c.id)">
                        Show more replies ({{ Math.min(repliesOf(c.id).length, replyLimit[c.id] + 5) }})
                      </button>
                      <button class="show-replies-btn" v-else @click="hideReplies(c.id)">Hide replies</button>
                    </div>
                  </div>

                  <div class="replies" v-if="visibleReplies(c.id).length">
                    <div v-for="r in visibleReplies(c.id)" :key="r.id" class="reply">
                      <img v-if="getUserAvatar(r.authorId)" :src="getUserAvatar(r.authorId)" class="comment-avatar" />
                      <div class="reply-body">
                        <div class="reply-head"><strong>{{ r.authorName }}</strong> <span class="muted small">{{ formatDate(r.createdAt) }}</span></div>
                        <div class="reply-content">{{ r.content }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="comment-list">
              <div v-for="c in topLevelComments" :key="c.id" class="comment">
                <img v-if="getUserAvatar(c.authorId)" :src="getUserAvatar(c.authorId)" class="comment-avatar" />
                <div class="comment-body">
                  <div class="comment-bubble">
                    <div class="comment-head">
                      <span class="comment-author">{{ c.authorName }}</span>
                      <span class="comment-ts muted">{{ formatDate(c.createdAt) }}</span>
                      <span v-if="post.authorId === currentUser?.id" class="pin-btn" @click="pinComment(c)">{{ c.pinned ? 'Unpin' : 'Pin' }}</span>
                    </div>
                    <div class="comment-content">{{ c.content }}</div>

                    <div class="comment-row">
                      <div class="reacts">
                    
                        <button
                          v-for="e in commentEmojis"
                          :key="e"
                          :class="['react-pill', { active: currentUser && c.reactedBy && c.reactedBy[currentUser.id] === e }]"
                          @click="toggleCommentReact(c, e)">
                          <span>{{ e }}</span>
                          <span class="count">{{ c.reactions && c.reactions[e] ? c.reactions[e] : 0 }}</span>
                        </button>
                      </div>
                      <div class="comment-actions">
                        <button class="reply-btn" @click="toggleReplyBox(c.id)">{{ replyOpen[c.id] ? 'Cancel' : 'Reply' }}</button>
                      </div>
                    </div>
                  </div>

                  <div class="replies-controls" v-if="repliesOf(c.id).length">
                    <button class="show-replies-btn" v-if="!replyLimit[c.id] || replyLimit[c.id] === 0" @click="showInitialReplies(c.id)">
                      Show {{ Math.min(5, repliesOf(c.id).length) }} replies
                    </button>
                    <div v-else>
                      <button class="show-replies-btn" v-if="replyLimit[c.id] < repliesOf(c.id).length" @click="showMoreReplies(c.id)">
                        Show more replies ({{ Math.min(repliesOf(c.id).length, replyLimit[c.id] + 5) }})
                      </button>
                      <button class="show-replies-btn" v-else @click="hideReplies(c.id)">Hide replies</button>
                    </div>
                  </div>

                  <div class="replies" v-if="visibleReplies(c.id).length">
                    <div v-for="r in visibleReplies(c.id)" :key="r.id" class="reply">
                      <img v-if="getUserAvatar(r.authorId)" :src="getUserAvatar(r.authorId)" class="comment-avatar" />
                      <div class="reply-body">
                        <div class="reply-head"><strong>{{ r.authorName }}</strong> <span class="muted small">{{ formatDate(r.createdAt) }}</span></div>
                        <div class="reply-content">{{ r.content }}</div>
                        <div class="reply-row">
                          <div class="reacts">
                            <button v-for="e in commentEmojis" :key="e" class="react-pill" @click="toggleCommentReact(r, e)">
                              <span>{{ e }}</span>
                              <span class="count">{{ r.reactions && r.reactions[e] ? r.reactions[e] : 0 }}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-if="replyOpen[c.id]" class="reply-composer">
                    <img v-if="currentUser && currentUser.avatar" :src="currentUser.avatar" class="comment-avatar" />
                    <div class="compose-right">
                      <textarea v-model="replyText[c.id]" placeholder="Write a reply..." rows="2"></textarea>
                      <div class="compose-actions">
                        <button class="btn-cancel" @click="cancelReply(c.id)">Cancel</button>
                        <button class="btn-create" @click="postReply(c.id)" :disabled="!replyText[c.id] || !replyText[c.id].trim()">Reply</button>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>

        
            <div class="comment-form" v-if="currentUser">
              <div class="comment-compose">
                <img v-if="currentUser && currentUser.avatar" :src="currentUser.avatar" class="comment-avatar" />
                <div class="compose-right">
                  <textarea v-model="commentText" placeholder="Add a comment..." rows="3"></textarea>
                  <div class="compose-actions">
                    <button type="button" class="btn-cancel" @click="commentText = ''">Clear</button>
                    <button type="button" class="btn-create" @click="addComment" :disabled="!commentText.trim()">Post Comment</button>
                  </div>
                  <div class="small" style="color:var(--muted)">{{ commentMsg }}</div>
                </div>
              </div>
            </div>

            <div v-else class="small muted">Log in to post comments.</div>
          </div>

        </div>
      </div>
    </div>

    <aside class="sidebar">
      <div class="card info-card">
        <div class="info-row">
          <strong>Author</strong>
          <div class="author-block">
            <img v-if="authorAvatar" :src="authorAvatar" class="sidebar-avatar" />
            <div>
              <div class="name">{{ post.authorName }}</div>
              <div class="muted small">Creator</div>
            </div>
          </div>
        </div>

        <div class="info-row">
          <strong>Stats</strong>
          <div class="muted small">{{ totalReacts(post) }} total reactions</div>
        </div>

        <div class="info-row" v-if="post.deadline">
          <strong>Deadline</strong>
          <div class="muted small">{{ post.deadline }}</div>
        </div>

        <div class="info-row" v-if="post.discord">
          <strong>Discord</strong>
          <a :href="post.discord" target="_blank" class="discord-btn">Join Server</a>
        </div>

        <div class="info-row">
          <router-link to="/" class="back-link">← Back to games</router-link>
        </div>
      </div>
    </aside>

    <div v-if="lightboxSrc" class="lightbox" @click="closeLightbox">
      <div class="lightbox-inner" @click.stop>
        <button class="close" @click="closeLightbox">✕</button>
        <img v-if="isImage(lightboxItem)" :src="lightboxSrc" />
        <video v-else controls :src="lightboxSrc" />
      </div>
    </div>
  </div>

  <div v-else class="notfound">Post not found.</div>
</template>

<script>
import store from '../store';
import { computed, ref, reactive, watch } from 'vue';
import { useRoute } from 'vue-router';
import TipModal from './TipModal.vue';

export default {
  components: { TipModal },
  setup() {
    const route = useRoute();
    const id = route.params.id;
    const post = computed(() => store.getPost(id));
    const currentUser = store.state.currentUser;
    const emojis = ['👍','❤️','🚀','🔥'];
    const commentEmojis = ['👍','❤️','🔥'];
  const showTipModal = ref(false);

    const lightboxSrc = ref(null);
    const lightboxItem = ref(null);
    function openMedia(m) { lightboxItem.value = m; lightboxSrc.value = m && m.data ? m.data : null; }
    function closeLightbox() { lightboxSrc.value = null; lightboxItem.value = null; }
    function isImage(m) { return m && m.type === 'image'; }

    function openTipModal(){ showTipModal.value = true; }
    function onTipped(payload){
      // payload: { postId, amount }
      // store.tipPost already updated the post; UI will reflect changes.
      showTipModal.value = false;
      // optionally, we could show a toast here.
      console.log('Tipped', payload);
    }

    async function onFiles(e) {
      const files = (e && e.target && e.target.files) ? Array.from(e.target.files) : [];
      if (!files.length) return;
      for (const f of files) {
        // call store helper
        store.addMediaToPost(post.value.id, { file: f, type: f.type && f.type.startsWith('video') ? 'video' : 'image' });
      }
    }

    function formatCurrency(v){
      try { return '$' + (Number(v||0).toFixed(2)); } catch(e) { return '$0.00'; }
    }

    const allComments = computed(()=> (post.value && post.value.comments) ? post.value.comments : []);

    const pinnedComments = computed(()=> allComments.value.filter(c=>c.pinned));

    const topLevelComments = computed(()=> allComments.value.filter(c=>!c.parentId && !c.pinned));

    function repliesOf(commentId) {
      return allComments.value.filter(c => c.parentId === commentId);
    }

    const recentTips = computed(()=> {
      if (!post.value || !post.value.tips || !post.value.tips.length) return '';
      return post.value.tips.slice(-3).map(t=>('$'+(t.amount||0))).join(', ');
    });

    const replyLimit = reactive({}); 

    function visibleReplies(commentId) {
      const arr = repliesOf(commentId);
      const lim = replyLimit[commentId] || 0;
      if (lim <= 0) return [];
      return arr.slice(0, lim);
    }

    function showInitialReplies(commentId) {
      const total = repliesOf(commentId).length;
      replyLimit[commentId] = Math.min(5, total);
    }

    function showMoreReplies(commentId) {
      const total = repliesOf(commentId).length;
      const cur = replyLimit[commentId] || 0;
      replyLimit[commentId] = Math.min(total, cur + 5);
    }

    function hideReplies(commentId) {
      replyLimit[commentId] = 0;
    }

    const replyOpen = reactive({});
    const replyText = reactive({});

    function toggleReplyBox(cid) {
      replyOpen[cid] = !replyOpen[cid];
      if (!replyOpen[cid]) replyText[cid] = '';
    }
    function cancelReply(cid) {
      replyOpen[cid] = false;
      replyText[cid] = '';
    }

    function postReply(parentId) {
      const txt = (replyText[parentId] || '').trim();
      if (!txt) return;
      const res = store.addComment(post.value.id, txt, parentId);
      if (res.ok) {
        replyText[parentId] = '';
        replyOpen[parentId] = false;
      }
    }

    const commentText = ref('');
    const commentMsg = ref('');
    function addComment() {
      commentMsg.value = '';
      if (!currentUser) { commentMsg.value = 'Please log in.'; return; }
      const txt = (commentText.value || '').trim();
      if (!txt) { commentMsg.value = 'Comment cannot be empty.'; return; }
      const res = store.addComment(post.value.id, txt, null);
      if (res.ok) {
        commentText.value = '';
      } else {
        commentMsg.value = res.msg || 'Failed to post comment';
      }
    }

    function getUserAvatar(uid) {
      const u = store.state.users.find(x => x.id === uid);
      return u ? u.avatar : null;
    }

    function formatDate(ts) {
      try { return new Date(ts).toLocaleString(); } catch(e) { return ''; }
    }

    function toggleCommentReact(comment, emoji) {
      store.toggleCommentReaction(post.value.id, comment.id, emoji);
    }

    async function pinComment(c) {
      const res = store.pinComment(post.value.id, c.id);
      if (!res.ok) {
      }
    }

    function isPostReacted(e) {
      if (!currentUser || !post.value) return false;
      return post.value.reactedBy && post.value.reactedBy[currentUser.id] === e;
    }

    return {
      post, currentUser, authorAvatar: computed(()=> {
        if (!post.value) return null;
        const usr = store.state.users.find(u => u.id === post.value.authorId);
        return usr ? usr.avatar : null;
      }), heroStyle: computed(()=> {
        if (!post.value || !post.value.media || !post.value.media[0]) {
          return { background: 'linear-gradient(135deg, rgba(124,92,255,0.08), rgba(0,212,255,0.04))' };
        }
        return { backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.5)), url(${post.value.media[0].data})`, backgroundSize: 'cover', backgroundPosition: 'center' };
      }), formattedDate: computed(()=> post.value ? new Date(post.value.createdAt).toLocaleString() : ''),
      emojis, react: (e)=>{ if (!post.value) return; store.toggleReaction(post.value.id, e); }, totalReacts: (p)=> Object.values(p.reactions || {}).reduce((s,x)=>s+(x||0),0),

      allComments, pinnedComments, topLevelComments, repliesOf,
      replyLimit, visibleReplies, showInitialReplies, showMoreReplies, hideReplies,
      replyOpen, replyText, toggleReplyBox, cancelReply, postReply,
      commentText, commentMsg, addComment,
      getUserAvatar, formatDate,
      toggleCommentReact, pinComment, commentEmojis,

      lightboxSrc, lightboxItem, openMedia, closeLightbox, isImage,

      isPostReacted,
      showTipModal, openTipModal, onTipped,
      onFiles, formatCurrency,
    };
  }
};
</script>

<style scoped>
.post-view { display:flex; gap:18px; align-items:flex-start; margin-top:8px; }
.main { flex:1; display:flex; flex-direction:column; gap:18px; }
.sidebar { width:320px; max-width:35%; }

.hero {
  border-radius:12px;
  min-height:120px;
  padding:14px;
  display:flex;
  align-items:flex-end;
  color:var(--text);
  background-size:cover;
  background-position:center;
}
.hero-meta .title { margin:0; font-size:22px; font-weight:800; letter-spacing:-0.4px; }
.sub { color:var(--muted); margin-top:6px; }

/* embed area (discord-like message box) */
.embed { padding:10px; }
.author-line { display:flex; gap:12px; align-items:center; margin-bottom:10px; }
.author-avatar { width:52px; height:52px; border-radius:10px; object-fit:cover; border:2px solid rgba(255,255,255,0.03); }
.author-name { font-weight:700; }
.description { color:var(--text); line-height:1.5; margin-bottom:12px; white-space:pre-wrap; }

/* media grid */
.media-grid { display:flex; gap:8px; flex-wrap:wrap; }
.media-card { width:160px; height:96px; border-radius:8px; overflow:hidden; cursor:pointer; background:#0b0f18; border:1px solid rgba(255,255,255,0.02); transition:transform .18s; display:flex; align-items:center; justify-content:center; }
.media-card img, .media-card video { width:100%; height:100%; object-fit:cover; display:block; }
.media-card:hover { transform:translateY(-6px); box-shadow: 0 12px 30px rgba(0,0,0,0.6); }

/* actions */
.actions { display:flex; justify-content:space-between; align-items:center; margin-top:14px; gap:12px; flex-wrap:wrap; }
.reactions { display:flex; gap:8px; flex-wrap:wrap; }
.react-btn {
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:8px 12px;
  border-radius:999px;
  background: rgba(255,255,255,0.02);
  border:1px solid rgba(255,255,255,0.03);
  color:var(--text);
  cursor:pointer;
  transition: transform .12s, box-shadow .12s, background .12s;
}
.react-btn.active {
  background: linear-gradient(90deg, rgba(0,212,255,0.14), rgba(139,92,246,0.12));
  box-shadow: 0 8px 22px rgba(124,92,255,0.12);
  border-color: rgba(124,92,255,0.22);
  color: white;
}
.emoji { font-size:18px; }
.count { font-weight:700; color:var(--muted); }

/* upload input */
.upload input[type=file] { display:block; margin-top:6px; color:var(--muted); }

.tip-area { display:flex; align-items:center; gap:10px; }
.tip-menu { background: rgba(0,0,0,0.6); padding:10px; border-radius:8px; position:absolute; z-index:60; margin-top:8px; }
.tip-presets .preset { background:transparent; border:1px solid rgba(255,255,255,0.04); color:var(--text); padding:6px 10px; border-radius:8px; margin-right:6px; cursor:pointer; }

@media (max-width:900px){
  .post-view { flex-direction:column; }
  .sidebar { width:100%; max-width:100%; }
}

/* sidebar card */
.info-card { background: linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.00)); padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.02); display:flex; flex-direction:column; gap:12px; }
.info-row { display:flex; justify-content:space-between; align-items:center; }
.author-block { display:flex; gap:8px; align-items:center; }
.sidebar-avatar { width:48px; height:48px; border-radius:8px; object-fit:cover; }

/* discord button style */
.discord-btn { display:inline-block; background: linear-gradient(90deg,var(--neon-blue),var(--neon-purple)); color:white; padding:8px 12px; border-radius:8px; text-decoration:none; font-weight:700; }
.back-link { color:var(--muted); text-decoration:none; }

/* lightbox */
.lightbox { position:fixed; inset:0; background:rgba(2,6,23,0.85); display:flex; align-items:center; justify-content:center; z-index:1200; padding:24px; }
.lightbox-inner { position:relative; max-width:94%; max-height:94%; }
.lightbox-inner img, .lightbox-inner video { max-width:100%; max-height:100%; border-radius:8px; display:block; }
.lightbox .close { position:absolute; right:-8px; top:-8px; background:rgba(0,0,0,0.6); color:white; border:none; border-radius:999px; width:36px; height:36px; cursor:pointer; }

/* Comments styles */
.comments-section {
  margin-top:18px;
  background: transparent;
  padding:8px 0;
}
.comments-section h3 { margin:0 0 8px 0; font-size:15px; color:var(--text); }

/* pinned comments */
.pinned-block { margin-bottom:10px; }
.pinned-label { font-size:13px; color:var(--muted); margin-bottom:8px; }

/* list */
.comment-list { display:flex; flex-direction:column; gap:10px; margin-top:8px; }

/* each comment: avatar + bubble */
.comment {
  display:flex;
  gap:12px;
  align-items:flex-start;
}
.comment-avatar {
  width:36px;
  height:36px;
  border-radius:8px;
  object-fit:cover;
  border:2px solid rgba(255,255,255,0.03);
  flex-shrink:0;
}

/* bubble */
.comment-body { flex:1; }
.comment-bubble {
  background: linear-gradient(180deg, rgba(255,255,255,0.01), transparent);
  border:1px solid rgba(255,255,255,0.02);
  padding:10px;
  border-radius:10px;
  box-shadow: 0 6px 18px rgba(2,6,23,0.35);
}
.comment-head {
  display:flex;
  gap:8px;
  align-items:center;
}
.comment-author { font-weight:700; color:var(--text); font-size:14px; }
.comment-ts { font-size:12px; color:var(--muted); margin-left:6px; }

/* content */
.comment-content { margin-top:6px; color:var(--text); white-space:pre-wrap; line-height:1.4; }

/* composer */
.comment-form { margin-top:12px; }
.comment-compose { display:flex; gap:10px; align-items:flex-start; }
.compose-right { flex:1; display:flex; flex-direction:column; gap:8px; }
.comment-form textarea {
  width:100%;
  padding:10px;
  border-radius:8px;
  background: var(--panel);
  border:1px solid rgba(255,255,255,0.03);
  color:var(--text);
  resize:vertical;
  outline:none;
}
.compose-actions { display:flex; gap:8px; justify-content:flex-end; }
.btn-cancel {
  background:transparent;
  border:1px solid rgba(255,255,255,0.03);
  color:var(--muted);
  padding:6px 10px;
  border-radius:8px;
  cursor:pointer;
}
.btn-create {
  background: linear-gradient(90deg,var(--neon-blue),var(--neon-purple));
  color:white;
  border:none;
  padding:6px 12px;
  border-radius:8px;
  font-weight:700;
  cursor:pointer;
}
.btn-create[disabled] { opacity:0.5; cursor:not-allowed; }

/* replies indentation */
.replies { margin-left:48px; margin-top:8px; display:flex; flex-direction:column; gap:8px; }
.reply { display:flex; gap:8px; align-items:flex-start; }
.reply-body { background: rgba(255,255,255,0.01); padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,0.02); }

/* reaction pill */
.react-pill { 
  display:inline-flex; align-items:center; gap:6px; padding:6px 8px; border-radius:999px;
  background: rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.03);
  color:var(--text); cursor:pointer; transition: all .12s;
}
.react-pill .count { color:var(--muted); font-weight:700; }
.react-pill.active {
  background: linear-gradient(90deg, rgba(0,212,255,0.12), rgba(139,92,246,0.10));
  border-color: rgba(124,92,255,0.18);
  box-shadow: 0 8px 20px rgba(124,92,255,0.08);
  color: white;
}

/* Reply button style (subtle, like Discord) */
.reply-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  font-weight:600;
  padding:6px 8px;
  border-radius:6px;
  cursor:pointer;
}
.reply-btn:hover {
  background: rgba(255,255,255,0.02);
  color: var(--text);
}

/* small tweak to reaction count spacing */
.react-pill .count, .react-btn .count { margin-left:6px; font-size:13px; }

/* controls for reply toggles */
.replies-controls { margin:6px 0 8px 48px; } /* align with replies indentation */
.show-replies-btn {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.04);
  color: var(--muted);
  padding:6px 10px;
  border-radius:8px;
  cursor:pointer;
  font-weight:700;
}
.show-replies-btn:hover { background: rgba(255,255,255,0.02); color: var(--text); }
</style>
