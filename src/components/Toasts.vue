<template>
  <div class="toasts" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" :class="['toast', t.type]">
      <div class="msg">{{ t.message }}</div>
      <button class="close" @click="dismiss(t.id)" aria-label="Dismiss">✕</button>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue';
import store from '../store';
export default {
  setup(){
    const toasts = computed(()=> store.state.toasts || []);
    function dismiss(id){ store.removeToast(id); }
    return { toasts, dismiss };
  }
}
</script>

<style scoped>
.toasts{ position:fixed; right:18px; top:18px; display:flex; flex-direction:column; gap:8px; z-index:2000; }
.toast{ display:flex; align-items:center; gap:10px; background:var(--panel); padding:10px 12px; border-radius:10px; box-shadow:0 8px 30px rgba(2,6,23,0.6); border:1px solid rgba(255,255,255,0.03); }
.toast.info{ border-left:4px solid #60a5fa; }
.toast.success{ border-left:4px solid #34d399; }
.toast.error{ border-left:4px solid #fb7185; }
.toast .msg{ font-weight:600; color:var(--text); }
.toast .close{ background:transparent; border:none; color:var(--muted); }
</style>