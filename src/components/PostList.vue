<template>
  <div>
    <!-- NEW: Tag filter bar (only on home) -->
    <div v-if="route.path === '/'" class="tag-bar">
      <button :class="['tag-btn', { active: selectedTag === '' }]" @click="selectTag('')">All</button>
      <button v-for="t in allTags" :key="t" :class="['tag-btn', { active: selectedTag===t }]" @click="selectTag(t)">{{ t }}</button>
    </div>

    <div class="hero" :style="heroStyle">
      <div class="hero-info">
        <h2>{{ heroTitle }}</h2>
        <p class="small">{{ heroSubtitle }}</p>
      </div>

      <!-- FEATURES: top5 display header -->
      <div v-if="route.path === '/features'" class="features-top5">
        <div class="small muted">Top 5 Games</div>
      </div>

      <!-- UPCOMING: timeline selector -->
      <div v-if="route.path === '/upcoming'" class="timeline-row">
        <label class="small muted">Timeline:</label>
        <select v-model="timeline">
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="all">All upcoming</option>
        </select>
      </div>
    </div>

    <div class="grid">
      <div v-for="p in displayed" :key="p.id" class="card" @click="$router.push('/post/'+p.id)">
        <div class="thumb">
          <img v-if="p.media && p.media[0] && p.media[0].type==='image'" :src="p.media[0].data" alt="" />
          <video v-else-if="p.media && p.media[0] && p.media[0].type==='video'" :src="p.media[0].data" muted playsinline />
          <div v-else style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted)">No artwork</div>
        </div>
        <div class="card-body">
          <h3>{{ p.title }}</h3>
          <div class="meta">
            <div class="small">by {{ p.authorName }}</div>
            <div class="badge">{{ totalReacts(p) }}</div>
          </div>

          <div class="reveal">
            <div class="small">{{ snippet(p.description) }}</div>
            <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center">
              <div class="rating">{{ stars(p) }}</div>
              <div class="small">
                {{ p.deadline ? 'Deadline: '+p.deadline : '' }}
                <span v-if="p.deadline"> • <strong>{{ timeUntil(p.deadline) }}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="displayed.length===0" style="margin-top:18px;color:var(--muted)">{{ emptyMessage }}</div>
  </div>
</template>

<script>
import store from '../store';
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';

export default {
  setup() {
    const posts = store.state.posts;
    const query = computed(()=> (store.state.searchQuery || '').toLowerCase().trim());
    const route = useRoute();

    // live "now" for countdowns
    const now = ref(new Date());
    let timer = null;
    onMounted(()=> {
      timer = setInterval(()=> { now.value = new Date(); }, 30000); // update every 30s
    });
    onUnmounted(()=> { if (timer) clearInterval(timer); });

    // tags
    const selectedTag = ref('');
    const allTags = computed(()=> {
      const s = new Set();
      posts.forEach(p => (p.tags||[]).forEach(t => s.add(t)));
      return Array.from(s);
    });
    function selectTag(t){ selectedTag.value = t; }

    // upcoming timeline
    const timeline = ref('week');
    function inTimeline(deadlineStr){
      if (!deadlineStr) return false;
      const d = new Date(deadlineStr + 'T00:00:00');
      const n = now.value;
      if (timeline.value === 'today') {
        return d.toDateString() === n.toDateString();
      } else if (timeline.value === 'week') {
        const diff = (d - n)/(1000*60*60*24);
        return diff >= 0 && diff < 7;
      } else if (timeline.value === 'month') {
        const diff = (d - n)/(1000*60*60*24);
        return diff >= 0 && diff < 31;
      }
      return d >= n;
    }

    // human friendly remaining time until deadline
    function timeUntil(deadlineStr) {
      if (!deadlineStr) return '';
      const d = new Date(deadlineStr + 'T00:00:00');
      const ms = d - now.value;
      if (ms <= 0) return 'Released';
      const days = Math.floor(ms / (1000*60*60*24));
      if (days > 7) return `${days}d`;
      const hours = Math.floor(ms / (1000*60*60));
      if (hours >= 24) return `${days}d ${Math.floor((ms - days*24*60*60*1000)/(1000*60*60))}h`;
      const minutes = Math.floor(ms / (1000*60));
      if (hours >= 1) return `${hours}h ${minutes % 60}m`;
      return `${minutes}m`;
    }

    const displayed = computed(()=> {
      const arr = posts.slice();
      if (route.path === '/features') {
        // top 5 by reactions
        arr.sort((a,b)=> {
          const sa = Object.values(a.reactions||{}).reduce((s,x)=>s+x,0);
          const sb = Object.values(b.reactions||{}).reduce((s,x)=>s+x,0);
          if (sb !== sa) return sb - sa;
          return b.createdAt - a.createdAt;
        });
        return arr.slice(0,5);
      }
      if (route.path === '/upcoming') {
        return arr.filter(p => p.deadline && inTimeline(p.deadline))
                  .sort((a,b)=> new Date(a.deadline) - new Date(b.deadline));
      }
      // home: apply search, sort by popularity/recency and tag filter
      arr.sort((a,b)=> {
        const ra = Object.values(a.reactions||{}).reduce((s,x)=>s+x,0);
        const rb = Object.values(b.reactions||{}).reduce((s,x)=>s+x,0);
        if (rb !== ra) return rb - ra;
        return b.createdAt - a.createdAt;
      });
      let res = arr;
      if (selectedTag.value) {
        res = res.filter(p => (p.tags||[]).includes(selectedTag.value));
      }
      if (!query.value) return res;
      return res.filter(p => {
        const hay = (p.title + ' ' + (p.description||'') + ' ' + (p.authorName||'')).toLowerCase();
        return hay.includes(query.value);
      });
    });

    const heroPost = computed(()=> displayed.value.length ? displayed.value[0] : null);
    const heroStyle = computed(()=> {
      if (!heroPost.value || !heroPost.value.media || !heroPost.value.media[0]) {
        return { background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(0,212,255,0.06))' };
      }
      const url = heroPost.value.media[0].data;
      return { backgroundImage: `url(${url})` };
    });
    const heroTitle = computed(()=> {
      if (route.path === '/games') return heroPost.value ? heroPost.value.title : 'Featured Games';
      if (route.path === '/features') return 'Top Games';
      if (route.path === '/upcoming') return 'Upcoming Releases';
      return heroPost.value ? heroPost.value.title : 'Discover top Roblox games';
    });
    const heroSubtitle = computed(()=> {
      if (route.path === '/games') return heroPost.value ? (heroPost.value.description || '') : 'Browse the latest games and community projects.';
      if (route.path === '/features') return 'A curated top 5 based on community reactions.';
      if (route.path === '/upcoming') return 'Games with release dates coming soon. Filter timeline to narrow results.';
      return heroPost.value ? (heroPost.value.description || '') : 'Explore featured projects, screenshots and community highlights.';
    });

    function totalReacts(p){ return Object.values(p.reactions||{}).reduce((s,x)=>s+x,0); }
    function snippet(text){ if (!text) return ''; return text.length>120 ? text.slice(0,117)+'...' : text; }
    function stars(p){
      const total = totalReacts(p);
      const rating = Math.min(5, Math.max(1, Math.ceil(total/3)));
      return '★'.repeat(rating) + '☆'.repeat(5-rating);
    }

    const emptyMessage = computed(()=> {
      if (route.path === '/upcoming') return 'No upcoming games in the selected timeline.';
      if (selectedTag.value) return 'No games for this tag.';
      return 'No games match your search.';
    });

    return { displayed, heroStyle, heroTitle, heroSubtitle, totalReacts, snippet, stars,
             route, allTags, selectedTag, selectTag, timeline,
             commentEmojis: [], // noop for PostList scope
             timeUntil,
             emptyMessage };
  }
};
</script>

<style>
.hero {
  padding: 32px 16px;
  color: white;
  background-size: cover;
  background-position: center;
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  margin-bottom: 24px;
}
.hero-info {
  position: relative;
  z-index: 2;
}
.hero::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.card {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s;
}
.card:hover {
  transform: translateY(-4px);
}
.thumb {
  width: 100%;
  padding-top: 56.25%; /* 16:9 */
  position: relative;
}
.thumb img, .thumb video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.card-body {
  padding: 16px;
}
.meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.badge {
  background: #007bff;
  color: white;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.875rem;
}
.reveal {
  display: none;
}
.card:hover .reveal {
  display: block;
}
.rating {
  font-size: 1.25rem;
  color: #ffcc00;
}
.small {
  font-size: 0.875rem;
}
.controls {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
}
.tag-bar { display:flex; gap:8px; margin-bottom:12px; align-items:center; flex-wrap:wrap; }
.tag-btn { background: rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.02); color:var(--muted); padding:6px 10px; border-radius:999px; cursor:pointer; }
.tag-btn.active { background: linear-gradient(90deg,var(--neon-blue),var(--neon-purple)); color:white; border-color: rgba(255,255,255,0.04); }
/* timeline selector */
.timeline-row { display:flex; gap:8px; align-items:center; margin-top:12px; justify-content:flex-end; color:var(--muted); }
</style>
