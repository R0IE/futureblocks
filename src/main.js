import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles.css';

console.log('[main] starting app');


window.addEventListener('error', (ev) => {
  console.error('[global error]', ev.message || ev.error, ev);
});
window.addEventListener('unhandledrejection', (ev) => {
  console.error('[unhandled rejection]', ev.reason);
});

try {
  // attempt to mount normally
  createApp(App).use(router).mount('#app');
} catch (err) {
  // render minimal error UI if mount fails (prevents white screen)
  const root = document.getElementById('app');
  if (root) {
    root.innerHTML = `
      <div style="font-family:Inter, Arial, sans-serif; padding:24px; color:#fff; background:#111; min-height:100vh;">
        <h2 style="color:#ff6ac1">Application failed to start</h2>
        <pre style="white-space:pre-wrap;color:#ffdcdc">${err && err.message ? err.message : String(err)}</pre>
        <p style="color:#9aa7bb">Check browser console and server logs for details.</p>
      </div>
    `;
  } else {
    console.error('Mount failed and #app not found', err);
  }
}
