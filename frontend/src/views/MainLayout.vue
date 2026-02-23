<template>
  <div class="main-layout-container">
    <!-- Header contains Logo, Actions and Search Bar -->
    <header class="header">
      <div class="header-top d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center justify-content-end gap-2">
          <div class="stat-item d-flex gap-2" :title="`Tracked downloads in database: ${stats.count}`">
            <span class="stat-label">Records:</span>
            <span class="stat-value">{{ stats.count }}</span>
          </div>
          <div class="stat-item d-flex gap-2" :title="`Actual files on disk: ${stats.fileCount || 0}`">
            <span class="stat-label">Files:</span>
            <span class="stat-value">{{ stats.fileCount || 0 }}</span>
          </div>
          <div class="stat-item d-flex gap-2">
            <span class="stat-label">Total Size:</span>
            <span class="stat-value">{{ formatSize(stats.totalSize) }}</span>
          </div>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary" @click="openDataFolder">
            <span>Open Folder</span>
          </button>
          <button class="btn btn-outline-secondary" @click="router.push('/duplicates')">Duplicates</button>
          <button class="btn btn-outline-secondary" @click="router.push('/settings')">Settings</button>
          <button
            class="btn btn-outline-secondary"
            @click="logsVisible = !logsVisible"
            :class="{ active: logsVisible }"
          >
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

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import { getApiBase } from '../utils/config';
import type { SearchPayload } from '../components/SearchBar.vue';
import SearchBar from '../components/SearchBar.vue';
import FileList from '../components/FileList.vue';
import LogPanel from '../components/LogPanel.vue';
import { useSocket } from '../composables/useSocket.ts';
import { useThrottleFn } from '@vueuse/core';

const { status, progress, logs, refreshSignal } = useSocket();
const apiBase = getApiBase();
const router = useRouter();

const isRunning = computed(() => status.value === 'running');
const history = ref<string[]>([]);
const logsVisible = ref(false);
const stats = ref({ count: 0, fileCount: 0, totalSize: 0 });

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const fetchStatsThrottled = useThrottleFn(async () => {
  try {
    const res = await fetch(`${apiBase}/api/stats`);
    if (res.ok) stats.value = await res.json();
  } catch (e) {
    console.error(e);
  }
}, 5000);

let statsInterval: any = null;

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
  } catch (e) {
    console.error(e);
  }
};

const startDownload = async (payload: SearchPayload) => {
  if (!payload.subreddit) return;
  try {
    await fetch(`${apiBase}/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    alert('Failed to start');
  }
};

const stopDownload = async () => {
  try {
    await fetch(`${apiBase}/api/stop`, { method: 'POST' });
  } catch (e) {
    console.error(e);
  }
};

onMounted(async () => {
  try {
    const res = await fetch(`${apiBase}/api/history`);
    if (res.ok) history.value = await res.json();

    fetchStatsThrottled();
    statsInterval = setInterval(fetchStatsThrottled, 60000);
  } catch (e) {
    console.error(e);
  }
});

onUnmounted(() => {
  if (statsInterval) clearInterval(statsInterval);
});

watch(refreshSignal, () => {
  fetchStatsThrottled();
});

watch(status, (newStatus) => {
  if (newStatus === 'idle') fetchStatsThrottled();
});
</script>

<style scoped>
.main-layout-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.stats-info {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.stat-item {
  display: flex;
  gap: 5px;
}

.stat-label {
  font-weight: 500;
  opacity: 0.7;
}

.stat-value {
  color: var(--primary);
  font-weight: 700;
}
</style>
