import { createMemoryHistory, createRouter } from 'vue-router';
import Gallery from './components/Gallery.vue';
import Duplicates from './components/Duplicates.vue';
import SettingsView from './views/SettingsView.vue';
import MainLayout from './views/MainLayout.vue';

const routes = [
  {
    path: '/',
    component: MainLayout,
    children: [
      {
        path: '',
        redirect: '/gallery',
      },
      {
        path: 'gallery',
        redirect: '/browse',
      },
      {
        path: 'browse/:path(.*)*',
        name: 'Gallery',
        component: Gallery,
        props: true,
      },
      {
        path: 'duplicates',
        name: 'Duplicates',
        component: Duplicates,
      },
    ]
  },
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsView,
  },
];

export const router = createRouter({
  history: createMemoryHistory(),
  routes,
});
