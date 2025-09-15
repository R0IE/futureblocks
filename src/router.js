import { createRouter, createWebHistory } from 'vue-router';
import PostList from './components/PostList.vue';
import Auth from './components/Auth.vue';
import CreatePost from './components/CreatePost.vue';
import PostView from './components/PostView.vue';

const routes = [
  { path: '/', component: PostList },
  { path: '/games', component: PostList },
  { path: '/features', component: PostList },
  { path: '/upcoming', component: PostList }, // new upcoming view (same component with timeline)
  { path: '/auth', component: Auth },
  { path: '/create', component: CreatePost },
  { path: '/post/:id', component: PostView, props: true }
];

export default createRouter({ history: createWebHistory(), routes });
