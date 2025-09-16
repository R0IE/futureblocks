<template>
  <div class="app-layout">
    <main class="content">
      <header class="topbar">
        <div class="brand">
          <div class="logo">RB</div>
          <h1 class="brand-title">Roblox Showcase</h1>
        </div>

        <nav class="top-nav">
          <router-link to="/" class="nav-link">Home</router-link>
          <router-link to="/games" class="nav-link">Games</router-link>
          <router-link to="/features" class="nav-link">Features</router-link>
          <router-link to="/upcoming" class="nav-link">Upcoming</router-link>
          <a class="nav-link disabled">Community</a>
        </nav>

        <div class="search-wrap">
          <div class="search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <input v-model="searchQuery" placeholder="Search games, tags, creators..." />
          </div>
        </div>

        <div class="top-actions">
          <router-link :to="user ? '/create' : '/auth'" class="create-btn">Create</router-link>
          <router-link v-if="user" :to="{ name: 'profile', params: { id: user.id } }" class="acct-link">
            <img v-if="user && user.avatar" :src="user.avatar" class="avatar" alt="avatar" />
            <span class="acct-name">{{ user.username }}</span>
          </router-link>
          <router-link v-else to="/auth" class="acct-link">
            <span class="acct-name">Login</span>
          </router-link>
          <button class="btn-ghost" @click="toggleTheme" :title="theme==='dark' ? 'Switch to light' : 'Switch to dark'">{{ theme === 'dark' ? '🌙' : '☀️' }}</button>
          <button v-if="user" @click="logout" class="btn-ghost">Logout</button>
        </div>
      </header>

      <section class="main-area">
        <router-view />
      </section>
      <Toasts />
    </main>
  </div>
</template>

<script>
import store from './store';
import { computed, ref, onMounted } from 'vue';
import Toasts from './components/Toasts.vue';
export default {
  components: { Toasts },
  setup() {
    const searchQuery = computed({
      get: () => store.state.searchQuery,
      set: v => store.setSearch(v)
    });

    const theme = ref('dark');
    function applyTheme(t){
      try { document.documentElement.setAttribute('data-theme', t); } catch(e){}
      theme.value = t;
      try { localStorage.setItem('theme', t); } catch(e){}
    }
    function toggleTheme(){ applyTheme(theme.value === 'dark' ? 'light' : 'dark'); }
    onMounted(()=>{ const saved = (localStorage.getItem('theme') || '').toString(); applyTheme(saved === 'light' ? 'light' : 'dark'); });

    return {
      user: store.state.currentUser,
      logout: store.logout,
      searchQuery,
      theme,
      toggleTheme
    };
  }
};
</script>


<style scoped>
/* layout: single full-width column */
.app-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  min-height: 100vh;
  background: var(--bg);
  padding: 12px;
}

/* topbar inside main content */
.topbar {
  display:flex;
  align-items:center;
  gap:12px;
  background: linear-gradient(180deg, rgba(255,255,255,0.005), transparent);
  padding:10px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.02);
}

/* brand */
.brand { display:flex; align-items:center; gap:12px; }
.logo { width:40px; height:40px; border-radius:8px; background: linear-gradient(135deg,var(--neon-purple),var(--neon-blue)); display:flex; align-items:center; justify-content:center; color:white; font-weight:800; }
.brand-title { margin:0; font-size:16px; font-weight:700; color:var(--text); }

/* top navigation (moved from sidebar) */
.top-nav { display:flex; gap:8px; align-items:center; margin-left:8px; }
.nav-link { color:var(--muted); text-decoration:none; padding:8px 10px; border-radius:8px; font-weight:600; }
.nav-link:hover { color:var(--text); background: rgba(255,255,255,0.02); }

.search-wrap { flex:1; display:flex; justify-content:center; }
.search { width:70%; max-width:720px; min-width:160px; background:var(--panel); border-radius:999px; padding:8px 12px; display:flex; align-items:center; border:1px solid rgba(255,255,255,0.03); }
.search input { background:transparent; border:0; outline:0; color:var(--text); font-size:14px; margin-left:8px; width:100%; }

/* topbar actions */
.top-actions { display:flex; align-items:center; gap:10px; }
.create-btn { padding:8px 12px; border-radius:8px; background: linear-gradient(90deg,var(--neon-blue),var(--neon-purple)); color:white; text-decoration:none; font-weight:700; border:none; }
.acct-link { display:inline-flex; align-items:center; gap:8px; color:var(--muted); text-decoration:none; }
.avatar { width:32px; height:32px; border-radius:50%; object-fit:cover; border:2px solid rgba(255,255,255,0.04); }
.btn-ghost { background:transparent; border:1px solid rgba(255,255,255,0.03); color:var(--muted); padding:6px 10px; border-radius:8px; }

/* main area */
.main-area { margin-top:12px; }
.server-bottom { width:100%; display:flex; justify-content:center; padding-bottom:8px; }
.notif-dot, .notif-dot::after { width:10px; height:10px; background:var(--neon-pink); border-radius:50%; }

/* channels column */
.channels {
  background: linear-gradient(180deg, rgba(255,255,255,0.01), transparent);
  border-radius: 12px;
  padding: 12px;
  display:flex;
  flex-direction:column;
  gap:12px;
  border:1px solid rgba(255,255,255,0.02);
}
.channels-header { color:var(--muted); font-weight:700; font-size:13px; }
.channels-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; }
.channels-list a { color:var(--muted); text-decoration:none; padding:6px 8px; border-radius:8px; display:block; }
.channels-list a:hover { background: rgba(255,255,255,0.02); color:var(--text); }
.channels-footer { margin-top:auto; display:flex; justify-content:center; }
.create-compact { padding:8px 12px; border-radius:8px; background: linear-gradient(90deg,var(--neon-blue),var(--neon-purple)); color:white; text-decoration:none; font-weight:700; }

/* main content */
.content {
  display:flex;
  flex-direction:column;
  gap:12px;
}

/* topbar inside main content */
.topbar {
  display:flex;
  align-items:center;
  gap:12px;
  background: linear-gradient(180deg, rgba(255,255,255,0.005), transparent);
  padding:10px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.02);
}
.brand { display:flex; align-items:center; gap:12px; }
.logo { width:40px; height:40px; border-radius:8px; background: linear-gradient(135deg,var(--neon-purple),var(--neon-blue)); display:flex; align-items:center; justify-content:center; color:white; font-weight:800; }
.brand-title { margin:0; font-size:16px; font-weight:700; color:var(--text); }

.search-wrap { flex:1; display:flex; justify-content:center; }
.search { width:70%; max-width:720px; min-width:160px; background:var(--panel); border-radius:999px; padding:8px 12px; display:flex; align-items:center; border:1px solid rgba(255,255,255,0.03); }
.search input { background:transparent; border:0; outline:0; color:var(--text); font-size:14px; margin-left:8px; width:100%; }

/* topbar actions */
.top-actions { display:flex; align-items:center; gap:10px; }
.create-btn { padding:8px 12px; border-radius:8px; background: linear-gradient(90deg,var(--neon-blue),var(--neon-purple)); color:white; text-decoration:none; font-weight:700; border:none; }
.acct-link { display:inline-flex; align-items:center; gap:8px; color:var(--muted); text-decoration:none; }
.avatar { width:32px; height:32px; border-radius:50%; object-fit:cover; border:2px solid rgba(255,255,255,0.04); }
.btn-ghost { background:transparent; border:1px solid rgba(255,255,255,0.03); color:var(--muted); padding:6px 10px; border-radius:8px; }

/* main-area (router content) */
.main-area { display:block; }

/* responsive: collapse channels into top row on small screens */
@media (max-width:900px) {
  .app-layout { grid-template-columns: 56px 1fr; }
  .channels { display:none; }
  .search { width:100%; min-width:0; }
}
@media (max-width:520px) {
  .app-layout { grid-template-columns: 48px 1fr; padding:8px; }
  .sidebar-vertical .server { width:40px; height:40px; }
}
</style>
