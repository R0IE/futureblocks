import { createRouter, createWebHistory } from 'vue-router';
import PostList from './components/PostList.vue';
import Auth from './components/Auth.vue';
import CreatePost from './components/CreatePost.vue';
import PostView from './components/PostView.vue';

const routes = [
  { path: '/', component: PostList },
  { path: '/trending', component: PostList },
  { path: '/games', component: PostList },
  { path: '/features', component: PostList },
  { path: '/upcoming', component: PostList },
  { path: '/auth', component: Auth },
  { path: '/create', component: CreatePost },
  { path: '/post/:id', name: 'post', component: PostView, props: true },
  { path: '/profile/:id', name: 'profile', component: () => import('./components/Profile.vue'), props: true }
];

export default createRouter({
  history: createWebHistory(),
  routes
});
