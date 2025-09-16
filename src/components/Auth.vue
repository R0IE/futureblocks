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
          <input v-model="loginName" placeholder="username or email" />
          <input v-model="loginPass" type="password" placeholder="password" />
          <button>Login</button>
        </form>
      </div>

      <div class="form-col">
        <form @submit.prevent="register" class="card">
          <h3>Create account</h3>
          <input v-model="regName" placeholder="username" />
          <input v-model="regEmail" placeholder="email" />
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
import supabase from '../lib/supabase';

export default {
  setup() {
    const r = reactive({ loginName: '', loginPass: '', regName: '', regEmail: '', regPass: '', msg: '' });
    const avatarPreview = ref(null);
    const avatarData = ref(null);
    const router = useRouter();

    async function login() {
      r.msg = '';
      const res = await store.login(r.loginName, r.loginPass);
      if (res.ok) {
        router.push('/');
      } else {
        r.msg = res.msg || 'invalid credentials';
      }
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

    async function register() {
      r.msg = '';
      const res = await store.register(r.regName, r.regEmail, r.regPass, avatarData.value);
      if (res.ok) {
        // provide feedback depending on whether we used Supabase or local fallback
        if (res.msg === 'registered_check_email') r.msg = 'Check your email to confirm registration.';
        else if (res.msg === 'registered_logged_in') router.push('/');
        else router.push('/');
      } else {
        if (res.msg === 'exists') r.msg = 'username or email already in use';
        else if (res.msg === 'missing') r.msg = 'missing fields';
        else r.msg = res.msg || 'registration failed';
      }
    }

    return { ...toRefs(r), avatarPreview, onFile, login, register, user: store.state.currentUser, msg: r.msg };
  },
  created() {
    const session = supabase.auth.getSession().then(({ data }) => {
      this.user = data.session?.user ?? null;
    });

    this.authListener = supabase.auth.onAuthStateChange((event, session) => {
      this.user = session?.user ?? null;
    });
  },
  unmounted() {
    if (this.authListener?.subscription) {
      this.authListener.subscription.unsubscribe();
    }
  },
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
