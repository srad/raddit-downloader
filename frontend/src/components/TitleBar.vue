<script setup lang="ts">
import { ref, onMounted } from 'vue';

const isElectron = !!window.electronAPI;
const isMaximized = ref(false);

const minimize = () => window.electronAPI?.minimize();
const maximize = () => window.electronAPI?.maximize();
const close = () => window.electronAPI?.close();

const version = ref(window.version || '');

onMounted(async () => {
  if (window.electronAPI) {
    // Get initial state
    isMaximized.value = await window.electronAPI.isMaximized();
    
    // Listen for changes
    window.electronAPI.onWindowStateChange((maximized) => {
      isMaximized.value = maximized;
    });
  }
});
</script>

<template>
  <div v-if="isElectron" class="title-bar">
    <div class="title-drag-region">
      <div class="app-title">
        <span class="title-icon">🚀</span>
        <div class="logo">
          <span>Raddit Downloader</span>
          <span class="logo-version">v{{ version }}</span>
        </div>
      </div>
    </div>
    
    <div class="window-controls">
      <button class="control-btn minimize" @click="minimize" title="Minimize">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
      
      <button class="control-btn maximize" @click="maximize" :title="isMaximized ? 'Restore' : 'Maximize'">
        <!-- Maximize Icon -->
        <svg v-if="!isMaximized" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
        <!-- Restore/Collapse Icon -->
        <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>
      </button>

      <button class="control-btn close" @click="close" title="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.title-bar {
  height: 60px;
  background: #111;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
  border-bottom: 1px solid #222;
  z-index: 10000;
}

.title-drag-region {
  flex: 1;
  height: 100%;
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  padding-left: 18px;
}

.app-title {
  font-size: 1.0rem;
  color: #aaa;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  font-size: 1rem;
}

.window-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 50px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #888;
  transition: all 0.1s ease;
  border-radius: 0;
  padding: 0;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.control-btn.close:hover {
  background: #e81123;
  color: white;
}

.control-btn svg {
  opacity: 0.8;
}
</style>
