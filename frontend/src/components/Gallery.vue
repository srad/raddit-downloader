<template>
  <div class="gallery-container">
    <div class="gallery-toolbar">
      <div class="d-flex align-items-center gap-3 flex-grow-1">
        <div class="fw-bold text-white small">/{{ currentPath }}</div>
        <div class="d-flex gap-2 flex-grow-1" style="max-width: 400px;">
          <input type="text" v-model="filterText" placeholder="Filter files..." class="form-control form-control-sm px-2 py-1" style="height: 30px; font-size: 0.85rem;">
          <select v-model="filterType" class="form-select form-select-sm" style="width: auto; height: 30px; font-size: 0.85rem;">
            <option value="all">All Types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
          </select>
        </div>
      </div>
      <div class="d-flex align-items-center gap-3">
        <span v-if="selectedItems.size > 0" class="text-primary small fw-bold">
          {{ selectedItems.size }} selected
        </span>
        <button v-if="selectedItems.size > 0" class="btn btn-danger btn-sm px-3 py-1" @click="deleteSelected">Delete</button>
      </div>
    </div>

    <div class="gallery-grid" ref="scrollContainer">
      <div v-if="loading && allItems.length === 0" class="text-center mt-5 opacity-50 w-100">Loading...</div>
      <div v-else-if="filteredItems.length === 0" class="text-center mt-5 text-muted w-100">
        {{ allItems.length === 0 ? 'Folder is empty' : 'No files match filter' }}
      </div>

      <div v-for="item in visibleItems" :key="item.path"
           class="gallery-item"
           :class="{ selected: selectedItems.has(item.path) }"
           @click="openLightbox(item.path)">
        
        <input type="checkbox" class="item-checkbox"
               :checked="selectedItems.has(item.path)"
               @click.stop="toggleSelect(item.path)">

        <FileGridItem :item="item" />
      </div>
      
      <div v-if="visibleItems.length < filteredItems.length" class="loading-more text-center py-4 w-100 text-muted small">
        Loading more...
      </div>
    </div>

    <LightBox
      v-if="lightboxOpen"
      :items="filteredItems"
      :index="lightboxIndex"
      @update-index="idx => lightboxItemPath = filteredItems[idx]?.path || null"
      @close="lightboxOpen = false"
      :is-open="lightboxOpen"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useInfiniteScroll, useDebounceFn } from '@vueuse/core';
import LightBox from './LightBox.vue';
import FileGridItem from './FileGridItem.vue';
import { useSocket } from '../composables/useSocket';
import { getApiBase } from '../utils/config';
import type { FileItem } from '../types';

const route = useRoute();
const { refreshSignal, socket } = useSocket();
const apiBase = getApiBase();

const allItems = ref<FileItem[]>([]);
const loading = ref(false);
const filterText = ref('');
const filterType = ref('all');
const selectedItems = ref(new Set<string>());

const lightboxOpen = ref(false);
const lightboxItemPath = ref<string | null>(null);
const visibleLimit = ref(100);
const scrollContainer = ref<HTMLElement | null>(null);
const isLoadingMore = ref(false);

const lightboxIndex = computed(() => {
  if (!lightboxItemPath.value) return -1;
  return filteredItems.value.findIndex(item => item.path === lightboxItemPath.value);
});

const currentPath = computed(() => {
  if (!route.params.path) return '';
  return Array.isArray(route.params.path) ? route.params.path.join('/') : route.params.path;
});

// Listener for incrementally added items
if (socket) {
  socket.on('new_item', (item: FileItem) => {
    // item.path is like "r_pics/image.jpg"
    // currentPath is like "r_pics"
    const lastSlashIndex = item.path.lastIndexOf('/');
    const itemDir = lastSlashIndex !== -1 ? item.path.substring(0, lastSlashIndex) : '';
    
    if (itemDir === currentPath.value) {
      // Add to list if not already there
      const exists = allItems.value.some(existing => existing.path === item.path);
      if (!exists) {
        allItems.value.push(item);
        // Sort alphabetically to match initial load
        allItems.value.sort((a, b) => a.filename.localeCompare(b.filename));
      }
    }
  });
}

const filteredItems = computed(() => {
  return allItems.value.filter(item => {
    const ext = item.filename.split('.').pop()?.toLowerCase() || '';
    const isItemVideo = ['mp4', 'webm', 'gifv'].includes(ext);
    if (filterType.value === 'image' && isItemVideo) return false;
    if (filterType.value === 'video' && !isItemVideo) return false;
    return !(filterText.value && !item.filename.toLowerCase().includes(filterText.value.toLowerCase()));
  });
});

const visibleItems = computed(() => filteredItems.value.slice(0, visibleLimit.value));

const loadMore = async () => {
  console.log('[DEBUG] Infinite scroll triggered. limit:', visibleLimit.value, 'total:', filteredItems.value.length);
  if (isLoadingMore.value || visibleLimit.value >= filteredItems.value.length) {
    console.log('[DEBUG] Skip loading more. loading:', isLoadingMore.value, 'done:', visibleLimit.value >= filteredItems.value.length);
    return;
  }
  isLoadingMore.value = true;
  console.log('[DEBUG] Loading more items...', visibleLimit.value, '->', visibleLimit.value + 100);
  // Small delay to prevent rapid-fire triggers
  await new Promise(r => setTimeout(r, 100));
  visibleLimit.value += 100;
  await nextTick();
  isLoadingMore.value = false;
};

const fetchFiles = async () => {
  loading.value = true;
  try {
    const res = await fetch(`${apiBase}/api/browse?path=${encodeURIComponent(currentPath.value)}`);
    const data: FileItem[] = await res.json();
    allItems.value = data.filter(i => !i.isDirectory);
  } catch (e) { console.error(e); } finally { loading.value = false; }
};

watch(currentPath, () => {
  selectedItems.value.clear();
  visibleLimit.value = 100;
  if (scrollContainer.value) scrollContainer.value.scrollTop = 0;
  fetchFiles();
}, { immediate: true });

watch(refreshSignal, useDebounceFn(fetchFiles, 1000));
watch([filterText, filterType], () => {
  visibleLimit.value = 100;
  if (scrollContainer.value) scrollContainer.value.scrollTop = 0;
});

useInfiniteScroll(scrollContainer, loadMore, { distance: 400 });

const toggleSelect = (path: string) => {
  if (selectedItems.value.has(path)) selectedItems.value.delete(path);
  else selectedItems.value.add(path);
};

const deleteSelected = async () => {
  if (!confirm(`Delete ${selectedItems.value.size} items?`)) return;
  try {
    await fetch(`${apiBase}/api/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: Array.from(selectedItems.value) }),
    });
    await fetchFiles();
    selectedItems.value.clear();
  } catch (err) { alert('Delete failed'); }
};

const openLightbox = (path: string) => {
  lightboxItemPath.value = path;
  lightboxOpen.value = true;
};
</script>

<style scoped>
.gallery-container { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.gallery-toolbar { padding: 10px 20px; background: #161616; border-bottom: 1px solid #2a2a2a; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
.gallery-grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); grid-auto-rows: max-content; gap: 0; }
.gallery-item { position: relative; aspect-ratio: 1; background: #111; cursor: pointer; transition: transform 0.1s, z-index 0.1s; }
.gallery-item:hover { z-index: 1; transform: scale(1.05); box-shadow: 0 0 10px rgba(0, 0, 0, 0.5); }
.gallery-item.selected { outline: 3px solid #ff4500; z-index: 2; }
.item-checkbox { position: absolute; top: 8px; left: 8px; width: 20px; height: 20px; cursor: pointer; z-index: 10; opacity: 0; transition: opacity 0.2s; accent-color: #ff4500; }
.gallery-item:hover .item-checkbox, .gallery-item.selected .item-checkbox { opacity: 1; }
</style>