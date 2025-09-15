const STORAGE_KEY = 'rbtimeline_v1';
let remoteEndpoint = null;


export function loadStateSync() {
	// synchronous bootstrap used by store
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
				// last resort: clear posts (preserve users/currentUser) and try
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
					// restore and rethrow original
					if (backup) state.posts.splice(0, 0, ...backup);
					throw err;
				}
			}
		} catch (inner) {
			throw err;
		}
	}

	// optional: try to notify remote endpoint (best-effort)
	if (remoteEndpoint) {
		try {
			await fetch(remoteEndpoint.replace(/\/+$/, '') + '/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: payload
			}).catch(()=>{/* ignore remote errors */});
		} catch (_) { /* ignore */ }
	}

	return true;
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
