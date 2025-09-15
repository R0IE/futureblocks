import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles.css';

console.log('[main] starting app');

// global error hooks to surface runtime issues
window.addEventListener('error', (ev) => {
  console.error('[global error]', ev.message || ev.error, ev);
});
window.addEventListener('unhandledrejection', (ev) => {
  console.error('[unhandled rejection]', ev.reason);
});

createApp(App).use(router).mount('#app');
