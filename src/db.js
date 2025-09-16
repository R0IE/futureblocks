const STORAGE_KEY = 'rbtimeline_v1';
let remoteEndpoint = null;

// pick up VITE_REMOTE_ENDPOINT if present
if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_REMOTE_ENDPOINT) {
  remoteEndpoint = String(import.meta.env.VITE_REMOTE_ENDPOINT).replace(/\/+$/, '');
}

export function loadStateSync() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { users: [], posts: [], currentUser: null, searchQuery: '' };
  } catch {
    return { users: [], posts: [], currentUser: null, searchQuery: '' };
  }
}

export function setRemoteEndpoint(url) {
  remoteEndpoint = url ? String(url).replace(/\/+$/, '') : null;
}
export function clearRemoteEndpoint() { remoteEndpoint = null; }

function trySaveLocal(payload) {
  localStorage.setItem(STORAGE_KEY, payload);
}

// New: upload helper — sends a single file (base64) to the serverless upload endpoint
export async function uploadToRemote(name, mime, base64Data, token) {
  if (!remoteEndpoint) throw new Error('No remote endpoint configured (VITE_REMOTE_ENDPOINT)');
  const url = remoteEndpoint + '/api/upload';
  const body = { name: String(name || ''), mime: String(mime || ''), data: String(base64Data || '') };
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>null);
    throw new Error('upload failed: ' + res.status + ' ' + (txt || res.statusText));
  }
  return res.json();
}

// best-effort async save; returns a Promise
export async function saveState(state) {
  const payloadObj = {
    users: state.users,
    posts: state.posts,
    currentUser: state.currentUser,
    searchQuery: state.searchQuery || ''
  };

  let payload = JSON.stringify(payloadObj);

  try {
    trySaveLocal(payload);
  } catch (err) {
    // try lightweight compaction: remove media from oldest posts then retry
    try {
      let compacted = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        let removed = false;
        if (Array.isArray(state.posts) && state.posts.length) {
          for (let i = state.posts.length - 1; i >= 0; i--) {
            const p = state.posts[i];
            if (p && p.media && p.media.length) {
              p.media = [];
              removed = true;
              break;
            }
          }
        }
        if (!removed) break;
        // retry
        payload = JSON.stringify({
          users: state.users,
          posts: state.posts,
          currentUser: state.currentUser,
          searchQuery: state.searchQuery || ''
        });
        try {
          trySaveLocal(payload);
          compacted = true;
          break;
        } catch (_) {
          // continue compacting
        }
      }

      if (!compacted) {
        const backup = Array.isArray(state.posts) ? state.posts.slice() : null;
        if (Array.isArray(state.posts)) state.posts.splice(0, state.posts.length);
        const minimal = JSON.stringify({
          users: state.users,
          posts: state.posts,
          currentUser: state.currentUser,
          searchQuery: state.searchQuery || ''
        });
        try {
          trySaveLocal(minimal);
        } catch (e3) {
          if (backup) state.posts.splice(0, 0, ...backup);
          throw err;
        }
      }
    } catch (inner) {
      throw err;
    }
  }


  if (remoteEndpoint) {
    try {
      await fetch(remoteEndpoint.replace(/\/+$/, '') + '/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      }).catch(() => { /* ignore remote errors */ });
    } catch (_) { /* ignore */ }
  }

  return true;
}
