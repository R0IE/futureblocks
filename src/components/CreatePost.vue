<template>
  <div class="create-wrap">
    <h2>Create Project Post</h2>

    <div v-if="!user" class="not-logged">
      You must log in to create a post. <router-link to="/auth">Login</router-link>
    </div>

    <form v-else class="composer" @submit.prevent="submit">
      <div class="left-col">
        <img v-if="user && user.avatar" :src="user.avatar" class="avatar" />
        <div v-else class="avatar placeholder">RB</div>
      </div>

      <div class="right-col">
        <div class="compose-header">
          <input class="title-input" v-model="title" placeholder="Project title" />
          <input class="date-input" v-model="deadline" type="date" />
        </div>

        <textarea class="desc-input" v-model="description" placeholder="Describe your project, goals, and progress..."></textarea>

        <div class="tags-row">
          <input v-model="tagsInput" @input="updateTagsFromInput" placeholder="Tags (comma separated) e.g. adventure,platformer" class="tags-input" />
          <div class="tags-preview">
            <span v-for="(t,i) in tags" :key="i" class="tag-chip">{{ t }}</span>
          </div>
        </div>

        <div class="meta-row">
          <input v-model="discord" placeholder="Discord invite or link (optional)" class="discord-input" />
          <div class="file-upload">
        
            <button type="button" class="upload-cta" title="Attach media">Attach</button>
            <input ref="fileInput" id="fileInput" type="file" @change="onFiles" multiple accept="image/*,image/webp,video/*,.webp,.mp4,.webm,.mov" class="visually-hidden-file-input" />
          </div>
        </div>

        <div class="preview">
          <div v-for="(m,i) in media" :key="i" class="preview-item">
            <img v-if="m.type==='image'" :src="m.data" />
            <video v-else controls :src="m.data" />
            <button type="button" class="remove" @click.prevent="removeMedia(i)">✕</button>
          </div>
        </div>

        <div class="actions">
          <div class="left-actions small" style="color:var(--muted)">{{ msg }}</div>
          <div class="right-actions">
            <button type="button" class="btn-cancel" @click="reset">Cancel</button>
            <button type="submit" class="btn-create" :disabled="!titleTrimmed">Create</button>
          </div>
        </div>

        <div class="debug-box">
          <button type="button" class="btn-cancel" @click="debugOpen = !debugOpen">{{ debugOpen ? 'Hide' : 'Show' }} debug</button>
          <div v-if="debugOpen" class="debug-list">
            <div v-for="(d,i) in debugMessages" :key="i" class="debug-item">{{ d }}</div>
          </div>
        </div>
      </div>
    </form>
  </div>
</template>

<script>
import store from '../store';
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

export default {
  setup() {
    const title = ref('');
    const description = ref('');
    const deadline = ref('');
    const discord = ref('');
    const media = ref([]);
    const msg = ref('');
    const router = useRouter();

    const user = store.state.currentUser;

    const tagsInput = ref('');
    const tags = ref([]);
    const fileInput = ref(null);

    const debugMessages = ref([]);
    const debugOpen = ref(true);
    function logDebug(msg) {
      const t = new Date().toLocaleTimeString() + ' — ' + msg;
      debugMessages.value.unshift(t);
      if (debugMessages.value.length > 80) debugMessages.value.pop();
      console.log('[CreatePost DEBUG]', t);
    }

    function updateTagsFromInput() {
      const arr = (tagsInput.value || '').split(',').map(s=>s.trim()).filter(Boolean);
      tags.value = Array.from(new Set(arr)).slice(0, 10);
    }

    function triggerFile() {
      logDebug('triggerFile called, fileInput ref = ' + (!!fileInput.value));
      try {
        if (fileInput.value && typeof fileInput.value.click === 'function') {
          fileInput.value.click();
          logDebug('clicked fileInput via ref');
          return;
        }
        const el = document.getElementById('fileInput');
        if (el && typeof el.click === 'function') {
          el.click();
          logDebug('clicked fileInput via getElementById fallback');
          return;
        }
        logDebug('no file input element found to click');
      } catch (e) {
        logDebug('triggerFile error: ' + (e && e.message));
      }
    }

    function readFileAsDataURL(file) {
      return new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
    }

    async function resizeImage(file, maxWidth = 1600, quality = 0.8) {
      try {
        const bitmap = await createImageBitmap(file);
        const ratio = Math.min(1, maxWidth / bitmap.width);
        const w = Math.max(1, Math.round(bitmap.width * ratio));
        const h = Math.max(1, Math.round(bitmap.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, w, h);
        const outType = 'image/webp';
        const dataUrl = canvas.toDataURL(outType, quality);
        return dataUrl;
      } catch (err) {
        return await readFileAsDataURL(file);
      }
    }

    async function onFiles(e) {
      logDebug('onFiles event fired');
      const inputFiles = (e && e.target && e.target.files) ? e.target.files : (fileInput.value && fileInput.value.files) ? fileInput.value.files : [];
      const files = Array.from(inputFiles || []);
      logDebug('files to process: ' + (files.length ? files.map(f=>f.name).join(', ') : 'none'));
      if (!files.length) return;
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const name = (file.name || '').toLowerCase();
          const mime = file.type || '';
          const looksLikeVideo = mime.startsWith('video') || /\.(mp4|webm|mov|mkv|avi)$/i.test(name);
          if (looksLikeVideo) {
            const dataUrl = await readFileAsDataURL(file);
            media.value.push({ type: 'video', data: dataUrl });
            logDebug('added media (video): ' + file.name);
          } else {
            // image: resize/compress before storing
            const dataUrl = await resizeImage(file, 1600, 0.8);
            media.value.push({ type: 'image', data: dataUrl });
            logDebug('added media (image, resized): ' + file.name);
          }
        }
      } catch (err) {
        logDebug('file read error: ' + (err && err.message));
      }
      if (fileInput.value) fileInput.value.value = null;
    }

    function removeMedia(index) {
      media.value.splice(index, 1);
    }

    const titleTrimmed = computed(() => (title.value || '').toString().trim());

    function reset() {
      title.value = '';
      description.value = '';
      deadline.value = '';
      discord.value = '';
      media.value = [];
      tagsInput.value = '';
      tags.value = [];
      msg.value = '';
      if (fileInput.value) fileInput.value.value = null;
    }

    async function submit() {
      msg.value = '';
      if (!user) { msg.value = 'You must be logged in to create a post.'; return; }
      if (!titleTrimmed.value) { msg.value = 'Please provide a title.'; return; }

      updateTagsFromInput();

      try {
        const res = await store.createPost({
          title: titleTrimmed.value,
          description: description.value,
          deadline: deadline.value || null,
          discord: discord.value || null,
          media: media.value,
          tags: tags.value
        });

        if (res && res.ok) {
          reset();
          router.push('/post/' + res.post.id);
          return;
        }

        msg.value = res && res.msg ? res.msg : 'Failed to create post';
      } catch (err) {
        msg.value = 'Upload/creation failed: ' + (err && err.message ? err.message : 'unknown');
      }
    }

    onMounted(() => {
      logDebug('CreatePost mounted');
      console.log('[CreatePost] mounted, fileInput ref =', fileInput.value);
    });

    return {
      title,
      description,
      deadline,
      discord,
      media,
      msg,
      user,
      tagsInput,
      tags,
      updateTagsFromInput,
      triggerFile,
      onFiles,
      removeMedia,
      debugMessages, debugOpen, logDebug,
      fileInput, 
      titleTrimmed,
      reset,
      submit
    };
  }
};
</script>

<style scoped>
.create-wrap { max-width:1000px; margin:0 auto; display:flex; flex-direction:column; gap:12px; }
.composer { display:flex; gap:12px; align-items:flex-start; background: transparent; }
.left-col { width:72px; display:flex; justify-content:flex-start; }
.avatar { width:56px; height:56px; border-radius:8px; object-fit:cover; border:2px solid rgba(255,255,255,0.04); }
.avatar.placeholder { display:flex; align-items:center; justify-content:center; background: linear-gradient(135deg,var(--neon-purple),var(--neon-blue)); color:white; font-weight:700; }

.right-col { flex:1; background: var(--panel); border-radius:10px; padding:12px; border:1px solid rgba(255,255,255,0.03); box-shadow: 0 8px 30px rgba(0,0,0,0.5); display:flex; flex-direction:column; gap:10px; }

/* Header row: title and date compact */
.compose-header { display:flex; gap:8px; align-items:center; }
.title-input {
  flex:1;
  padding:8px 10px;
  border-radius:8px;
  background: rgba(255,255,255,0.02);
  border:1px solid rgba(255,255,255,0.03);
  color:var(--text);
  font-weight:700;
  outline:none;
}
.title-input::placeholder { color:var(--muted); }

/* date input smaller, dark */
.date-input {
  width:140px;
  padding:8px 10px;
  border-radius:8px;
  background: rgba(255,255,255,0.02);
  border:1px solid rgba(255,255,255,0.03);
  color:var(--muted);
  outline:none;
}

/* description bubble */
.desc-input {
  min-height:120px;
  resize:vertical;
  padding:10px;
  border-radius:8px;
  background: rgba(0,0,0,0.25);
  border:1px solid rgba(255,255,255,0.02);
  color:var(--text);
  line-height:1.45;
  outline:none;
}
.desc-input::placeholder { color:var(--muted); }

/* tags input */
.tags-row { display:flex; gap:8px; align-items:center; flex-direction:column; }
.tags-input { width:100%; padding:8px 10px; border-radius:8px; background: rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.03); color:var(--text); outline:none; }
.tags-preview { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
.tag-chip { background: rgba(255,255,255,0.03); padding:6px 8px; border-radius:999px; color:var(--muted); font-weight:700; }

/* meta row */
.meta-row { display:flex; gap:8px; align-items:center; justify-content:space-between; }
.discord-input {
  flex:1;
  padding:8px 10px;
  border-radius:8px;
  background: transparent;
  border:1px solid rgba(255,255,255,0.02);
  color:var(--muted);
  outline:none;
}
.discord-input::placeholder { color:var(--muted); }

/* hide native file input, use styled label */
.upload-cta {
  display:inline-block;
  padding:8px 12px;
  border-radius:8px;
  background: rgba(255,255,255,0.02);
  border:1px solid rgba(255,255,255,0.03);
  color:var(--text);
  cursor:pointer;
}

/* preview items */
.preview { display:flex; gap:8px; flex-wrap:wrap; margin-top:6px; }
.preview-item { position:relative; width:160px; height:100px; border-radius:8px; overflow:hidden; background:#0b0f18; border:1px solid rgba(255,255,255,0.02); }
.preview-item img, .preview-item video { width:100%; height:100%; object-fit:cover; display:block; }
.preview-item .remove { position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.6); color:white; border:none; border-radius:6px; width:26px; height:26px; cursor:pointer; }

/* actions row */
.actions { display:flex; justify-content:space-between; align-items:center; margin-top:6px; }
.right-actions { display:flex; gap:8px; align-items:center; }
.btn-cancel { background:transparent; border:1px solid rgba(255,255,255,0.04); color:var(--muted); padding:8px 12px; border-radius:8px; cursor:pointer; }
.btn-create { background: linear-gradient(90deg,var(--neon-blue),var(--neon-purple)); color:white; border:none; padding:8px 14px; border-radius:8px; font-weight:700; cursor:pointer; }
.btn-create[disabled] { opacity:0.5; cursor:not-allowed; }

.small { font-size:13px; color:var(--muted); }

/* responsive */
@media (max-width:720px) {
  .composer { flex-direction:column; }
  .left-col { width:48px; }
  .title-input { font-size:14px; }
  .preview-item { width:120px; height:80px; }
}

/* file-upload should be positioned so the input can overlay the button */
.file-upload { position: relative; display:inline-block; overflow: hidden; }

/* overlay the input on top of the Attach button so native file picker opens on click */
.visually-hidden-file-input {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  z-index: 2; 
  border: 0;
  padding: 0;
  margin: 0;
}

/* ensure upload-cta shows as expected and input sits on top */
.upload-cta { position: relative; z-index: 1; pointer-events: none; }

/* debug panel styles */
.debug-box {
  margin-top: 12px;
  padding: 10px;
  border-radius: 8px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.03);
}
.debug-list {
  max-height: 200px;
  overflow-y: auto;
  margin-top: 8px;
  padding: 8px;
  border-radius: 4px;
  background: rgba(0,0,0,0.6);
}
.debug-item {
  font-size: 12px;
  color: var(--text);
  margin-bottom: 4px;
}
</style>
