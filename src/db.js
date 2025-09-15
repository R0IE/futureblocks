const STORAGE_KEY = 'rbtimeline_v1';
let remoteEndpoint = null;


export function loadStateSync() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { users: [], posts: [], currentUser: null, searchQuery: '' };
  } catch {
    return { users: [], posts: [], currentUser: null, searchQuery: '' };
  }
}

export function setRemoteEndpoint(url) {
  remoteEndpoint = url ? String(url) : null;
}
export function clearRemoteEndpoint() { remoteEndpoint = null; }

function trySaveLocal(payload) {
  localStorage.setItem(STORAGE_KEY, payload);
}


function compactMedia(state) {
  for (let i = state.posts.length - 1; i >= 0; i--) {
    const p = state.posts[i];
    if (p && p.media && p.media.length) {
      p.media = [];
      return true;
    }
  }
  return false;
}

export async function saveState(state) {
  const payloadObj = {
    users: state.users,
    posts: state.posts,
    currentUser: state.currentUser,
    searchQuery: state.searchQuery || ''
  };

  let clonedState = JSON.parse(JSON.stringify(payloadObj));
  let payload = JSON.stringify(clonedState);

  try {
    trySaveLocal(payload);
  } catch (err) {
    try {
      let compacted = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        if (Array.isArray(state.posts) && state.posts.length) {
          let removed = false;
          for (let i = state.posts.length - 1; i >= 0; i--) {
            const p = state.posts[i];
            if (p && p.media && p.media.length) {
              p.media = [];
              removed = true;
              compacted = true;
              break;
            }
          }
          if (!removed) break;
        } else {
          break;
        }

        clonedState = JSON.parse(JSON.stringify({
          users: state.users,
          posts: state.posts,
          currentUser: state.currentUser,
          searchQuery: state.searchQuery || ''
        }));
        payload = JSON.stringify(clonedState);
        try {
          trySaveLocal(payload);
          compacted = true;
          break;
        } catch (e2) {
        }
      }

      if (!compacted) {
        const postsBackup = state.posts.slice ? state.posts.slice() : state.posts;
        try {
          state.posts.splice(0, state.posts.length);
          const minimal = JSON.stringify({
            users: state.users,
            posts: state.posts,
            currentUser: state.currentUser,
            searchQuery: state.searchQuery || ''
          });
          trySaveLocal(minimal);
        } catch (e3) {
          if (Array.isArray(state.posts) && Array.isArray(postsBackup)) {
            state.posts.splice(0, 0, ...postsBackup);
          }
          throw err; 
        }
      }
    } catch (innerErr) {
      throw err;
    }
  }

  if (remoteEndpoint) {
    try {
      await fetch(remoteEndpoint.replace(/\/+$/,'') + '/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      }).catch(()=>{/* swallow network errors for now */});
    } catch (_) {
    }
  }

  return true;
}
