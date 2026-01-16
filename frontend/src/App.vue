<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import FileList from './components/FileList.vue';
import { RouterView, useRouter } from 'vue-router';
import { getApiBase } from './utils/config';
import type { SearchPayload } from './components/SearchBar.vue';
import SearchBar from './components/SearchBar.vue';
import LogPanel from './components/LogPanel.vue';
import { useSocket } from './composables/useSocket.ts';

declare global {
  interface Window {
    appVersion?: string;
    electronAPI?: {
      openFolder: (path: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

const { status, progress, logs } = useSocket();
const apiBase = getApiBase();
const router = useRouter();

const isRunning = computed(() => status.value === 'running');
const history = ref<string[]>([]);
const logsVisible = ref(false);
const version = ref(window.appVersion || '2.0.1');

const openDataFolder = async () => {
  try {
    const res = await fetch(`${apiBase}/api/data-directory`);
    if (res.ok) {
      const data = await res.json();
      if (window.electronAPI) {
        await window.electronAPI.openFolder(data.path);
      } else {
        alert(`Data folder: ${data.path}`);
      }
    }
  } catch (e) { console.error(e); }
};

const startDownload = async (payload: SearchPayload) => {
  if (!payload.subreddit) return;
  try {
    await fetch(`${apiBase}/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) { alert('Failed to start'); }
};

const stopDownload = async () => {
  try {
    await fetch(`${apiBase}/api/stop`, { method: 'POST' });
  } catch (e) { console.error(e); }
};

onMounted(async () => {
  try {
    const res = await fetch(`${apiBase}/api/history`);
    if (res.ok) history.value = await res.json();
  } catch (e) { console.error(e); }
});
</script>

<template>
  <div class="app-layout">
    <!-- Header contains Logo, Actions and Search Bar -->
    <header class="header">
      <div class="header-top">
        <div class="logo">
          <span>Raddit Downloader</span>
          <span class="logo-version">v{{ version }}</span>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary btn-sm" @click="openDataFolder">Open Folder</button>
          <button class="btn btn-secondary btn-sm" @click="router.push('/duplicates')">Duplicates</button>
          <button class="btn btn-secondary btn-sm" @click="logsVisible = !logsVisible" :class="{ active: logsVisible }">
            Logs
          </button>
        </div>
      </div>

      <SearchBar
        @start="startDownload"
        @stop="stopDownload"
        :history="history"
        :progress="progress"
        :is-running="isRunning"
      />
    </header>

    <div class="app-container">
      <!-- Sidebar is BELOW the header -->
      <aside class="sidebar">
        <div class="sidebar-header">FILES</div>
        <FileList path="" label="Downloads" :initial-load="true" />
      </aside>

      <!-- Main content is RIGHT of the sidebar -->
      <main class="main-content">
        <RouterView />

        <LogPanel :logs="logs" :visible="logsVisible" :limit="100" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
</style>
