const STORAGE_KEY = 'rbtimeline_v1';
let remoteEndpoint = null;

// synchronous load for app bootstrap
export function loadStateSync() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { users: [], posts: [], currentUser: null, searchQuery: '' };
  } catch {
    return { users: [], posts: [], currentUser: null, searchQuery: '' };
  }
}

// set remote endpoint (optional). Example: setRemoteEndpoint('https://example.com/api')
export function setRemoteEndpoint(url) {
  remoteEndpoint = url ? String(url) : null;
}
export function clearRemoteEndpoint() { remoteEndpoint = null; }

// internal: attempt to save JSON to localStorage (may throw QuotaExceededError)
function trySaveLocal(payload) {
  localStorage.setItem(STORAGE_KEY, payload);
}

// compact older posts by clearing their media, returns true if made change
function compactMedia(state) {
  // iterate oldest -> newest (end is newest because posts are unshifted)
  for (let i = state.posts.length - 1; i >= 0; i--) {
    const p = state.posts[i];
    if (p && p.media && p.media.length) {
      p.media = [];
      return true;
    }
  }
  return false;
}

// async saveState: tries to save locally; on quota error tries compaction; optionally posts to remote
export async function saveState(state) {
  const payloadObj = {
    users: state.users,
    posts: state.posts,
    currentUser: state.currentUser,
    searchQuery: state.searchQuery || ''
  };

  // create a cloneable object to avoid mutating original when compacting
  let clonedState = JSON.parse(JSON.stringify(payloadObj));
  let payload = JSON.stringify(clonedState);

  try {
    trySaveLocal(payload);
  } catch (err) {
    // Try compaction: progressively remove media from oldest posts and retry
    try {
      let compacted = false;
      // We'll operate on the reactive state object passed in: mutate it to free memory
      // but first try compaction loop similar to previous behavior
      for (let attempt = 0; attempt < 5; attempt++) {
        // mutate the real state.posts if possible
        if (Array.isArray(state.posts) && state.posts.length) {
          let removed = false;
          for (let i = state.posts.length - 1; i >= 0; i--) {
            const p = state.posts[i];
            if (p && p.media && p.media.length) {
              p.media = [];
              removed = true;
              compacted = true;
              break; // remove one post's media and retry
            }
          }
          if (!removed) break;
        } else {
          break;
        }

        // build new payload and try again
        clonedState = JSON.parse(JSON.stringify({
          users: state.users,
          posts: state.posts,
          currentUser: state.currentUser,
          searchQuery: state.searchQuery || ''
        }));
        payload = JSON.stringify(clonedState);
        try {
          trySaveLocal(payload);
          // success after compaction
          compacted = true;
          break;
        } catch (e2) {
          // continue loop to compact more
        }
      }

      if (!compacted) {
        // as a last resort, remove all posts (keep users/currentUser)
        const postsBackup = state.posts.slice ? state.posts.slice() : state.posts;
        try {
          state.posts.splice(0, state.posts.length); // clear posts
          const minimal = JSON.stringify({
            users: state.users,
            posts: state.posts,
            currentUser: state.currentUser,
            searchQuery: state.searchQuery || ''
          });
          trySaveLocal(minimal);
        } catch (e3) {
          // restore posts if still failing
          if (Array.isArray(state.posts) && Array.isArray(postsBackup)) {
            state.posts.splice(0, 0, ...postsBackup);
          }
          throw err; // rethrow original
        }
      }
    } catch (innerErr) {
      // rethrow original error if we couldn't resolve
      throw err;
    }
  }

  // Optionally try to push to remote endpoint (best-effort, don't block app if remote fails)
  if (remoteEndpoint) {
    try {
      // Fire-and-forget but await so callers can optionally await saveState
      await fetch(remoteEndpoint.replace(/\/+$/,'') + '/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      }).catch(()=>{/* swallow network errors for now */});
    } catch (_) {
      // ignore remote errors
    }
  }

  return true;
}
