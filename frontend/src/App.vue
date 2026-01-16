<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import FileList from './components/FileList.vue';
import { RouterView, useRouter } from 'vue-router';
import { getApiBase } from './utils/config';
import type { SearchPayload } from './components/SearchBar.vue';
import SearchBar from './components/SearchBar.vue';
import { useSocket } from './composables/useSocket.ts';

// 1. Types & Global Augmentation
// Ensure TypeScript knows about the global appVersion
declare global {
  interface Window {
    appVersion?: string;
  }
}

interface LogItem {
  time: string;
  message: string;
  isError: boolean;
}

// 2. Setup Composables
const { socket, logs, status, progress } = useSocket();
const apiBase = getApiBase();

const router = useRouter();

// 3. State
// Note: In a larger app, form state like this might belong in a Pinia store
// or the specific View component (e.g. Home.vue), but we keep it here to match your source.
const isRunning = computed(() => status.value === 'running');
const sorting = ref('new');
const time = ref('all');
const limit = ref(0);
const history = ref<string[]>([]);
const logBuffer = ref<LogItem[]>([]);
const MAX_LOGS = 300;

const logsVisible = ref(false);
const backgroundTask = ref<{
  message: string;
  currentProgress?: number;
  total?: number;
  progress?: number;
  type: 'info' | 'success' | 'error';
} | null>(null);

const version = ref(window.appVersion || '1.0.0');

//@ts-ignore
const startDownload = async (payload: SearchPayload) => {
  if (!payload.subreddit) return;
  try {
    await fetch(`${apiBase}/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subreddit: payload.subreddit,
        sorting: sorting.value,
        time: time.value,
        limit: limit.value,
      }),
    });
  } catch (e) {
    alert('Failed to start');
  }
};

//@ts-ignore
const stopDownload = async () => {
  try {
    await fetch(`${apiBase}/api/stop`, { method: 'POST' });
  } catch (e) {
    console.error(e);
  }
};

// 6. Lifecycle
onMounted(async () => {
  // Test message to verify indicator is working
  backgroundTask.value = { message: 'Background tasks system ready', type: 'info' };
  setTimeout(() => {
    if (backgroundTask.value?.message === 'Background tasks system ready') {
      backgroundTask.value = null;
    }
  }, 3000);

  try {
    const res = await fetch(`${apiBase}/api/history`);
    if (res.ok) {
      history.value = await res.json();
    }
  } catch (e) {
    console.error(e);
  }

  socket.on('log', (data) => {
    const logItem: LogItem = {
      time: new Date().toLocaleTimeString(),
      message: data.message,
      isError: data.isError
    };

    logBuffer.value.push(logItem);
    if (logBuffer.value.length > MAX_LOGS) logBuffer.value.shift();

    if (logsVisible.value) {
      logBuffer.value.push(logItem);

      if (logBuffer.value.length > MAX_LOGS) {
        logBuffer.value = logBuffer.value.reverse().slice(MAX_LOGS);
      }
    }
  });

  // Background Task Listeners
  socket.on('thumbnail_generation', (data: any) => {
    if (data.status === 'started' || data.status === 'processing') {
      const progress = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;
      backgroundTask.value = {
        progress: progress,
        currentProgress: data.processed,
        total: data.total,
        message: `Generating thumbnails: ${data.processed}/${data.total} (${progress}%)`,
        type: 'info',
      };
    } else if (data.status === 'completed') {
      backgroundTask.value = { message: 'Thumbnail generation complete', type: 'success' };
      setTimeout(() => (backgroundTask.value = null), 3000);
    } else if (data.status === 'error') {
      backgroundTask.value = { message: `Thumbnail error: ${data.error}`, type: 'error' };
      setTimeout(() => (backgroundTask.value = null), 5000);
    }
  });

  socket.on('phash_generation', (data: any) => {
    if (data.status === 'started' || data.status === 'processing') {
      const progress = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;
      backgroundTask.value = {
        currentProgress: data.processed,
        total: data.total,
        progress: progress,
        message: `Indexing ${data.processed}/${data.total} (${progress}%)`,
        type: 'info',
      };
    } else if (data.status === 'completed') {
      backgroundTask.value = { message: 'Content indexing complete', type: 'success' };
      setTimeout(() => (backgroundTask.value = null), 3000);
    } else if (data.status === 'error') {
      backgroundTask.value = { message: `Indexing error: ${data.error}`, type: 'error' };
      setTimeout(() => (backgroundTask.value = null), 5000);
    }
  });
});
</script>

<template>
  <div class="app-layout">
    <header class="app-header navbar navbar-dark bg-dark border-bottom px-2 py-3">
      <div class="container-fluid d-flex justify-content-between align-items-center h-100">
        <!-- Brand -->
        <div class="d-flex align-items-center gap-2">
          <strong style="color: orangered; font-size: 1.2rem">Raddit Downloader</strong>
          <small class="text-muted" style="font-size: 0.7em">v{{ version }}</small>
        </div>

        <!-- Background Status -->
        <div v-if="backgroundTask" class="d-flex align-items-center gap-2 bg-body-secondary px-2 py-1 rounded">
          <div
            :class="{
              'text-success': backgroundTask.type === 'success',
              'text-danger': backgroundTask.type === 'error',
              'text-white': backgroundTask.type === 'info',
            }"
            class="d-flex align-items-center gap-2"
          >
            <span
              v-if="backgroundTask.type === 'info'"
              class="spinner-border spinner-border-sm"
              role="status"
              aria-hidden="true"
              style="width: 0.8rem; height: 0.8rem"
            ></span>
            <small>{{ backgroundTask.message }}</small>
          </div>
        </div>

        <!-- Actions -->
        <div class="d-flex gap-2">
          <button class="btn btn-secondary" type="button" @click="router.push('/duplicates')">Duplicates</button>
          <button @click="logsVisible = !logsVisible" class="btn btn-secondary" :class="{ active: logsVisible }">
            Logs
          </button>
        </div>
      </div>
    </header>

    <SearchBar
      @start="startDownload"
      @stop="stopDownload"
      :history="history"
      :progress="progress"
      :is-running="isRunning"
    />

    <div class="app-body d-flex flex-grow-1 overflow-hidden">
      <aside class="app-sidebar bg-body-tertiary border-end d-flex flex-column" style="width: 250px">
        <div class="sidebar-content flex-grow-1 overflow-auto">
          <FileList path="" :initial-load="true" />
        </div>
      </aside>

      <main class="app-main flex-grow-1 position-relative d-flex flex-column overflow-hidden bg-body">
        <div class="view-container flex-grow-1 overflow-auto p-3">
          <RouterView v-slot="{ Component }">
            <component :is="Component" />
          </RouterView>
        </div>

        <div class="logs-panel" :class="{ visible: logsVisible }">
          <header
            class="logs-header d-flex justify-content-between align-items-center px-3 py-1 bg-dark text-light border-bottom border-secondary"
          >
            <strong class="small">System Logs</strong>
            <button class="btn-close btn-close-white" @click="logsVisible = false" aria-label="Close"></button>
          </header>
          <div class="logs-body p-2 font-monospace small overflow-auto text-success bg-black flex-grow-1">
            <div v-for="(log, i) in logBuffer" :key="i" class="mb-1" :class="{ 'text-danger': log.isError || log.message.indexOf('ERROR') !== -1 }">
              <span class="opacity-75 me-2">[{{ log.time }}]</span>
              <span>{{ log.message }}</span>
            </div>
            <div v-if="logs.length === 0" class="opacity-50 fst-italic">No logs recorded</div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* App Layout */
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: var(--bs-body-bg);
  color: var(--bs-body-color);
}

/* Logs Panel Styling (Custom as it's a specific overlay) */
.logs-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 300px;
  background: black;
  border-top: 1px solid var(--bs-border-color);
  transform: translateY(100%);
  transition: transform 0.3s ease-in-out;
  display: flex;
  flex-direction: column;
  z-index: 1050;
  box-shadow: 0 -4px 10px rgba(0, 0, 0, 0.3);
}

.logs-panel.visible {
  transform: translateY(0);
}
</style>
