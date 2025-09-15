<template>
  <div class="auth-card">
    <h2>Account</h2>

    <div v-if="user" class="profile">
      <img v-if="user.avatar" :src="user.avatar" class="profile-avatar" />
      <div>
        <div class="profile-name">{{ user.username }}</div>
        <div class="small">You are logged in.</div>
      </div>
    </div>

    <div v-else class="forms">
      <div class="form-col">
        <form @submit.prevent="login" class="card">
          <h3>Login</h3>
          <input v-model="loginName" placeholder="username" />
          <input v-model="loginPass" type="password" placeholder="password" />
          <button>Login</button>
        </form>
      </div>

      <div class="form-col">
        <form @submit.prevent="register" class="card">
          <h3>Create account</h3>
          <input v-model="regName" placeholder="username" />
          <input v-model="regPass" type="password" placeholder="password" />
          <label class="avatar-label">Avatar (optional)</label>
          <input type="file" @change="onFile" accept="image/*" />
          <div v-if="avatarPreview" class="avatar-preview">
            <img :src="avatarPreview" alt="preview" />
          </div>
          <button>Create account</button>
        </form>
      </div>
    </div>

    <div v-if="msg" class="msg">{{ msg }}</div>
  </div>
</template>

<script>
import store from '../store';
import { reactive, toRefs, ref } from 'vue';
import { useRouter } from 'vue-router';

export default {
  setup() {
    const r = reactive({ loginName: '', loginPass: '', regName: '', regPass: '', msg: '' });
    const avatarPreview = ref(null);
    const avatarData = ref(null);
    const router = useRouter();

    function login() {
      const res = store.login(r.loginName, r.loginPass);
      if (res.ok) router.push('/');
      else r.msg = 'invalid credentials';
    }

    function onFile(e) {
      const f = e.target.files && e.target.files[0];
      if (!f) { avatarPreview.value = null; avatarData.value = null; return; }
      const reader = new FileReader();
      reader.onload = () => {
        avatarPreview.value = reader.result;
        avatarData.value = reader.result;
      };
      reader.readAsDataURL(f);
    }

    function register() {
      const res = store.register(r.regName, r.regPass, avatarData.value);
      if (res.ok) router.push('/');
      else r.msg = res.msg === 'exists' ? 'username taken' : 'missing fields';
    }

    return { ...toRefs(r), avatarPreview, onFile, login, register, user: store.state.currentUser, msg: r.msg };
  }
};
</script>

<style>
/* small improved auth styles */
.auth-card { max-width:900px; margin:0 auto; display:flex; flex-direction:column; gap:12px; }
.forms { display:flex; gap:12px; flex-wrap:wrap; }
.form-col { flex:1; min-width:260px; }
.card { padding:12px; background:var(--panel); border-radius:10px; border:1px solid rgba(255,255,255,0.03); }
.card h3 { margin-top:0; }
.card input[type="file"] { margin-top:8px; }
.profile { display:flex; gap:12px; align-items:center; }
.profile-avatar { width:72px; height:72px; border-radius:10px; object-fit:cover; border:2px solid rgba(255,255,255,0.04); }
.avatar-preview img { width:64px; height:64px; object-fit:cover; border-radius:8px; margin-top:8px; }
.msg { color:var(--neon-pink); margin-top:8px; }
.small { color:var(--muted); font-size:13px; }
</style>
