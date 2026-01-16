<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDebounceFn, useInfiniteScroll } from '@vueuse/core';
import { useSocket } from '../composables/useSocket';
import { getApiBase } from '../utils/config';
import LightBox from './LightBox.vue';
import FileGridItem from './FileGridItem.vue';
import type { FileItem } from '../types';

// 2. Setup Hooks
const route = useRoute();
const { refreshSignal } = useSocket();

const apiBase = getApiBase();

// 3. State
const allItems = ref<FileItem[]>([]);
const loading = ref(false);
const filterText = ref('');
const filterType = ref<'all' | 'image' | 'video'>('all');
const selectedItems = ref(new Set<string>());

// Lightbox state
const lightboxOpen = ref(false);
const lightboxIndex = ref(-1);

// Infinite scroll state
const visibleLimit = ref(50);
const scrollContainer = ref<HTMLElement | null>(null);
const isLoadingMore = ref(false);

// 4. Computed
const currentPath = computed(() => {
  if (!route.params.path) return '';
  return Array.isArray(route.params.path) ? route.params.path.join('/') : route.params.path;
});

const filteredItems = computed<FileItem[]>(() => {
  return allItems.value.filter((item) => {
    const ext = item.filename.split('.').pop()?.toLowerCase() || '';
    const isItemVideo = ['mp4', 'webm', 'gifv'].includes(ext);

    if (filterType.value === 'image' && isItemVideo) return false;
    if (filterType.value === 'video' && !isItemVideo) return false;
    return !(filterText.value && !item.filename.toLowerCase().includes(filterText.value.toLowerCase()));
  });
});

const visibleItems = computed(() => {
  return filteredItems.value.slice(0, visibleLimit.value);
});

// 5. Methods
const loadMore = async () => {
  if (isLoadingMore.value) return;
  if (visibleLimit.value >= filteredItems.value.length) return;

  isLoadingMore.value = true;
  await new Promise((r) => setTimeout(r, 50));
  visibleLimit.value += 50;
  await nextTick();
  isLoadingMore.value = false;
};

// Recursive check to fill screen if content is too short for scrollbar
const checkFill = async (attempt = 0) => {
  if (attempt > 10) return; // Safety break
  await nextTick();
  if (!scrollContainer.value) return;

  if (visibleLimit.value >= filteredItems.value.length) return;

  // If no scrollbar and we have more items, load more
  if (scrollContainer.value.scrollHeight <= scrollContainer.value.clientHeight) {
    await loadMore();
    await new Promise((r) => setTimeout(r, 50)); // Allow layout to update
    await checkFill(attempt + 1);
  }
};

const fetchFiles = async () => {
  loading.value = true;
  try {
    const p = currentPath.value;
    // Ensure path is just empty string for root, not undefined
    const queryPath = p ? encodeURIComponent(p) : '';
    const res = await fetch(`${apiBase}/api/browse?path=${queryPath}`);
    if (!res.ok) throw new Error('Network response not ok');
    const data: FileItem[] = await res.json();
    allItems.value = data.filter((i) => !i.isDirectory);
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
    await checkFill();
  }
};

const debouncedFetch = useDebounceFn(() => {
  fetchFiles();
}, 1000);

const toggleSelect = (path: string) => {
  if (selectedItems.value.has(path)) {
    selectedItems.value.delete(path);
  } else {
    selectedItems.value.add(path);
  }
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
  } catch (err) {
    alert('Delete failed');
  }
};

const openLightbox = (index: number) => {
  lightboxIndex.value = index;
  lightboxOpen.value = true;
};

// 6. Watchers & Lifecycle
// Initial load and path change - immediate
watch(
  currentPath,
  () => {
    selectedItems.value.clear();
    visibleLimit.value = 50;
    if (scrollContainer.value) scrollContainer.value.scrollTop = 0;
    fetchFiles();
  },
  { immediate: true },
);

// Socket signal - debounced refresh
watch(refreshSignal, debouncedFetch);

// Reset scroll on filter change
watch([filterText, filterType], async () => {
  visibleLimit.value = 50;
  if (scrollContainer.value) scrollContainer.value.scrollTop = 0;
  await checkFill();
});

// Use VueUse infinite scroll
useInfiniteScroll(
  scrollContainer,
  () => {
    loadMore();
  },
  { distance: 400 },
);
</script>

<template>
  <div class="gallery-layout d-flex flex-column h-100 bg-body">
    <!-- Toolbar -->
    <nav class="gallery-toolbar d-flex justify-content-between align-items-center bg-body-tertiary border-bottom px-2" style="height: 48px; flex-shrink: 0;">
      <!-- Path -->
      <div class="path-crumb d-flex align-items-center gap-2 overflow-hidden" style="max-width: 30%;">
        <strong class="text-truncate">/{{ currentPath }}</strong>
      </div>

      <!-- Filters -->
      <div class="toolbar-filters d-flex gap-2 align-items-center">
        <input
          type="search"
          v-model="filterText"
          placeholder="Filter files..."
          aria-label="Filter"
          class="form-control form-control-sm"
          style="width: 200px;"
        />
        <select
          v-model="filterType"
          aria-label="Filter Type"
          class="form-select form-select-sm"
          style="width: 120px;"
        >
          <option value="all">All Types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
      </div>

      <!-- Actions -->
      <div class="selection-actions d-flex align-items-center gap-3">
        <small v-if="selectedItems.size > 0" class="text-muted">{{ selectedItems.size }} selected</small>
        <button v-if="selectedItems.size > 0" @click="deleteSelected" class="btn btn-sm btn-outline-danger">
          Delete
        </button>
      </div>
    </nav>

    <!-- Scroll Area -->
    <div class="gallery-scroll-area flex-grow-1 overflow-auto p-2 position-relative" id="gallery-grid" ref="scrollContainer">
      <!-- Loading State -->
      <div v-if="loading && allItems.length === 0" class="text-center mt-5 text-muted">
        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
        Loading files...
      </div>

      <!-- Empty / No Match State -->
      <div v-else-if="filteredItems.length === 0" class="text-center mt-5 text-muted fst-italic">
        {{ allItems.length === 0 ? 'Folder is empty' : 'No files match filter' }}
      </div>

      <!-- Grid -->
      <div v-else class="gallery-grid">
        <FileGridItem
          v-for="(item, index) in visibleItems"
          :key="item.path"
          :item="item"
          :selectable="true"
          :selected="selectedItems.has(item.path)"
          @click="openLightbox(index)"
          @toggle-select="toggleSelect(item.path)"
        />
      </div>

      <!-- Scroll Loader -->
      <div v-if="visibleItems.length < filteredItems.length" class="text-center p-4 text-muted w-100 grid-full-width">
        <span class="spinner-grow spinner-grow-sm me-2" role="status" aria-hidden="true"></span>
        <span>Loading more...</span>
      </div>
    </div>

    <LightBox
      v-if="lightboxOpen"
      :items="filteredItems"
      :index="lightboxIndex"
      @update="index => lightboxIndex = index"
      @close="lightboxOpen = false"
      :is-open="lightboxOpen"
    />
  </div>
</template>

<style scoped>
/* 3. Grid (Keeping custom grid as Bootstrap rows/cols are too rigid for thumbnail gallery) */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 2px;
}

/* Helper to make loader span full width in grid */
.grid-full-width {
  grid-column: 1 / -1;
}

/* Mobile Tweaks */
@media (max-width: 768px) {
  .gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  }
  .toolbar-filters {
    display: none !important; /* Hide filters on very small screens */
  }
}
</style>
