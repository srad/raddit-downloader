import { createMemoryHistory, createRouter } from 'vue-router';
import Gallery from './components/Gallery.vue';
import Duplicates from './components/Duplicates.vue';

const routes = [
  {
    path: '/',
    redirect: '/gallery', // Default to gallery view, or could be '/browse' based on your folder structure logic
  },
  {
    // Catch-all route for file browsing
    // :path(.*)* allows matching /gallery/folder/subfolder
    path: '/browse/:path(.*)*',
    name: 'Gallery',
    component: Gallery,
    props: true,
  },
  // Alias for the root gallery view if accessed directly
  {
    path: '/gallery',
    redirect: '/browse',
  },
  {
    path: '/duplicates',
    name: 'Duplicates',
    component: Duplicates,
  },
];

export const router = createRouter({
  history: createMemoryHistory(),
  routes,
});
