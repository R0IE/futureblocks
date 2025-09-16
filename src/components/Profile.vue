<template>
  <div class="profile-page">
    <div class="profile-main">
          <div class="profile-header card">
            <div class="avatar-wrap">
              <img v-if="!editing && user && user.avatar" :src="user.avatar" class="profile-avatar" />
              <div v-if="editing" class="avatar-edit">
                <img v-if="previewAvatar" :src="previewAvatar" class="profile-avatar" />
                <div v-else class="profile-avatar placeholder">No avatar</div>
                <input type="file" @change="onAvatarFile" accept="image/*" />
              </div>
            </div>
            <div class="profile-meta">
              <div v-if="!editing">
                <h2>{{ user?.name || 'Unknown' }}</h2>
                <div class="muted">@{{ user?.username || user?.id || 'guest' }}</div>
              </div>
              <div v-else>
                <input v-model="form.name" placeholder="Name" />
                <input v-model="form.username" placeholder="Username" />
                <textarea v-model="form.bio" placeholder="Bio" rows="3"></textarea>
              </div>
              <div class="badges">
                <span v-for="b in userBadges" :key="b" class="badge">{{ b }}</span>
              </div>
            </div>
            <div class="profile-stats">
              <div><strong>{{ posts.length }}</strong><div class="muted">Posts</div></div>
              <div><strong>{{ totalTipsFormatted }}</strong><div class="muted">Tips received</div></div>
            </div>

            <div class="profile-actions">
              <button v-if="!editing && canEdit" class="btn-create" @click="startEdit">Edit Profile</button>
              <div v-else-if="editing">
                <button class="btn-create" @click="saveProfile" :disabled="saving">Save</button>
                <button class="btn-cancel" @click="cancelEdit">Cancel</button>
              </div>
            </div>
          </div>

      <div class="cards">
        <div class="card">
          <h3>Posts</h3>
          <div class="post-list">
            <div v-for="p in posts" :key="p.id" class="post-row">
              <router-link :to="{ name: 'post', params: { id: p.id } }">{{ p.title }}</router-link>
              <div class="muted small">{{ formatCurrency(sumTips(p)) }} • {{ p.reactions ? Object.values(p.reactions).reduce((s,x)=>s+(x||0),0) : 0 }} reactions</div>
            </div>
          </div>
        </div>

        <div class="card">
          <h3>Recent Tips</h3>
          <div v-if="recentTips.length" class="tip-list">
            <div v-for="t in recentTips" :key="t.id" class="tip-row">
              <div>{{ formatCurrency(t.amount) }}</div>
              <div class="muted small">on <router-link :to="{ name: 'post', params: { id: t.postId } }">{{ t.postTitle }}</router-link></div>
            </div>
          </div>
          <div v-else class="muted">No tips yet.</div>
        </div>
      </div>
    </div>

    <aside class="profile-side">
      <div class="card">
        <h4>Achievements</h4>
        <div v-if="user && user.achievements && user.achievements.length">
          <div v-for="a in user.achievements" :key="a" class="achievement">{{ a }}</div>
        </div>
        <div v-else class="muted">No achievements yet.</div>
      </div>
    </aside>
  </div>
</template>

<script>
import { computed, ref, reactive, watch } from 'vue';
import store from '../store';
import { useRoute } from 'vue-router';

export default {
  setup(){
    const route = useRoute();
    const id = route.params.id;
    const user = computed(()=> store.state.users.find(u => u.id === id) || store.state.currentUser);

    const posts = computed(()=> store.state.posts.filter(p => p.authorId === id));

    function sumTips(p){ return (p.tips || []).reduce((s,t)=>s+(t.amount||0),0); }

    const totalTips = computed(()=> posts.value.reduce((s,p)=> s + sumTips(p), 0));
    const totalTipsFormatted = computed(()=> formatCurrency(totalTips.value));

    const recentTips = computed(()=> {
      const all = [];
      for(const p of posts.value){
        for(const t of (p.tips||[])){
          all.push({ id: p.id+'-'+(t.id||Math.random()), postId: p.id, postTitle: p.title, amount: t.amount, createdAt: t.createdAt });
        }
      }
      return all.sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt)).slice(0,10);
    });

    const userBadges = computed(()=> user.value && user.value.badges ? user.value.badges : []);

    function formatCurrency(v){ try { return new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(v); } catch(e){ return '$' + v; } }

    // --- Edit profile state ---
    const editing = ref(false);
    const saving = ref(false);
  const previewAvatar = ref(null);
  const avatarFile = ref(null);
  const avatarError = ref('');
  const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 MB
    const form = reactive({ name: '', username: '', bio: '' });

    // initialize form when user changes
    watch(user, (nu)=>{
      if (!nu) return;
      form.name = nu.name || '';
      form.username = nu.username || '';
      form.bio = nu.bio || '';
      previewAvatar.value = nu.avatar || null;
    }, { immediate: true });

    const currentUserId = computed(()=> store.state.currentUser ? store.state.currentUser.id : null);
    const canEdit = computed(()=> currentUserId.value && user.value && String(currentUserId.value) === String(user.value.id));

    function startEdit(){
      if (!canEdit.value) return;
      editing.value = true;
    }
    function cancelEdit(){
      editing.value = false;
      avatarFile.value = null;
      // reset form to user
      form.name = user.value?.name || '';
      form.username = user.value?.username || '';
      form.bio = user.value?.bio || '';
      previewAvatar.value = user.value?.avatar || null;
    }

    function onAvatarFile(e){
      avatarError.value = '';
      const f = e && e.target && e.target.files && e.target.files[0];
      if (!f) return;
      if (typeof f.size === 'number' && f.size > MAX_AVATAR_BYTES) {
        avatarFile.value = null;
        previewAvatar.value = null;
        avatarError.value = `File is too large. Max ${Math.round(MAX_AVATAR_BYTES/1024/1024)} MB.`;
        return;
      }
      avatarFile.value = f;
      const r = new FileReader();
      r.onload = () => { previewAvatar.value = String(r.result); };
      r.readAsDataURL(f);
    }

    async function saveProfile(){
      if (!canEdit.value) return;
      if (avatarFile.value && typeof avatarFile.value.size === 'number' && avatarFile.value.size > MAX_AVATAR_BYTES) {
        avatarError.value = `File is too large. Max ${Math.round(MAX_AVATAR_BYTES/1024/1024)} MB.`;
        return;
      }
      saving.value = true;
      try{
        const res = await store.updateUser(user.value.id, { name: form.name, username: form.username, bio: form.bio, avatarFile: avatarFile.value });
        if (res && res.ok) {
          editing.value = false;
          avatarFile.value = null;
          avatarError.value = '';
        } else {
          console.warn('updateUser failed', res);
          if (res && res.msg === 'file_too_large') avatarError.value = `File is too large. Max ${Math.round(MAX_AVATAR_BYTES/1024/1024)} MB.`;
        }
      }catch(e){ console.error(e); }
      saving.value = false;
    }

    return { user, posts, sumTips, totalTipsFormatted, recentTips, userBadges, formatCurrency,
      editing, form, startEdit, cancelEdit, onAvatarFile, previewAvatar, saveProfile, saving, canEdit,
      avatarError, MAX_AVATAR_BYTES
    };
  }
}
</script>

<style scoped>
.profile-page{ display:flex; gap:18px; align-items:flex-start; }
.profile-main{ flex:1; display:flex; flex-direction:column; gap:18px; }
.profile-side{ width:300px; }
.card{ background:var(--panel); padding:14px; border-radius:12px; border:1px solid rgba(255,255,255,0.03); }
.profile-header{ display:flex; gap:16px; align-items:center; }
.profile-avatar{ width:88px; height:88px; border-radius:12px; object-fit:cover; }
.profile-meta h2{ margin:0; }
.profile-stats{ margin-left:auto; display:flex; gap:16px; }
.badges .badge{ display:inline-block; background:rgba(255,255,255,0.03); padding:6px 8px; border-radius:8px; margin-right:6px; font-weight:700; }
.post-list{ display:flex; flex-direction:column; gap:8px; }
.post-row{ display:flex; justify-content:space-between; align-items:center; }
.tip-list{ display:flex; flex-direction:column; gap:8px; }
.achievement{ padding:8px; background:rgba(255,255,255,0.02); border-radius:8px; margin-bottom:8px; }

@media (max-width:900px){ .profile-page{ flex-direction:column; } .profile-side{ width:100%; } }
</style>
