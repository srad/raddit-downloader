<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebounceFn, useInfiniteScroll } from '@vueuse/core';
import DuplicateGroup from './DuplicateGroup.vue';
import { useSocket } from '../composables/useSocket';
import { getApiBase } from '../utils/config';
import LightBox from './LightBox.vue';
import type { FileItem } from '../types';

interface DuplicateGroupData {
  id: string; // Internal unique ID for Vue keys
  type: string;
  confidence?: number;
  files: FileItem[];
  avgDistance: number;
}

interface PhashProgress {
  show: boolean;
  status: 'processing' | 'completed' | '';
  processed: number;
  total: number;
  generated: number;
  skipped: number;
}

interface DuplicatesResponse {
  groups: any[];
  totalGroups: number;
  totalDuplicates: number;
}

// --- Composables ---
const { socket } = useSocket();
const apiBase = getApiBase();
const route = useRoute();
const router = useRouter();

// --- State ---
const loading = ref(false);
const scanProgress = ref({
  show: false,
  processed: 0,
  total: 0,
  percentage: 0,
});

const duplicateGroups = ref<DuplicateGroupData[]>([]);
const selectedPaths = ref(new Set<string>());

// Filters
const threshold = ref(85);
const contentTypeFilter = ref<'all' | 'image' | 'video'>('all');
const nameFilter = ref('');

// Pagination
const visibleLimit = ref(20);
const scrollContainer = ref<HTMLElement | null>(null);
const isLoadingMore = ref(false);

// Lightbox
const lightboxOpen = ref(false);
const lightboxIndex = ref(-1);
const currentGroupIndex = ref(-1);

// Progress
const phashProgress = ref<PhashProgress>({
  show: false,
  status: '',
  processed: 0,
  total: 0,
  generated: 0,
  skipped: 0,
});

// --- Computed ---
const thresholdLabel = computed(() => `${threshold.value}% similarity`);

const currentPathFilter = computed(() => (route.query.path as string) || null);

const filteredGroups = computed(() => {
  return duplicateGroups.value.filter((group) => {
    if (contentTypeFilter.value !== 'all') {
      const matchesType = group.type === contentTypeFilter.value || group.type === 'mixed';
      if (!matchesType) return false;
    }

    if (nameFilter.value) {
      const searchLower = nameFilter.value.toLowerCase();
      const hasMatch = group.files.some((file) => file.filename.toLowerCase().includes(searchLower));
      if (!hasMatch) return false;
    }

    return true;
  });
});

const totalDuplicatesCount = computed(() => {
  return filteredGroups.value.reduce((sum, g) => sum + g.files.length, 0);
});

const visibleGroups = computed(() => {
  return filteredGroups.value.slice(0, visibleLimit.value);
});

// --- Methods ---
const loadMore = async () => {
  if (isLoadingMore.value) return;
  if (visibleLimit.value >= filteredGroups.value.length) return;

  isLoadingMore.value = true;
  await new Promise((r) => setTimeout(r, 50));
  visibleLimit.value += 20;
  await nextTick();
  isLoadingMore.value = false;
};

const cancelScan = async () => {
  try {
    await fetch(`${apiBase}/api/duplicates/cancel`, { method: 'POST' });
    loading.value = false;
    scanProgress.value.show = false;
  } catch (e) {
    console.error(e);
  }
};

const loadDuplicates = async () => {
  if (loading.value) return;
  loading.value = true;
  scanProgress.value = { show: true, processed: 0, total: 0, percentage: 0 };
  visibleLimit.value = 20;
  selectedPaths.value.clear();

  try {
    let url = `${apiBase}/api/duplicates?threshold=${threshold.value}`;
    if (currentPathFilter.value) {
      url += `&path=${encodeURIComponent(currentPathFilter.value)}`;
    }

    const response = await fetch(url);
    if (response.status === 499) return;
    const data: DuplicatesResponse = await response.json();

    duplicateGroups.value = (data.groups || []).map((g, idx) => ({
      ...g,
      // Create a unique ID for this group based on file IDs
      id:
        g.files
          .map((f: any) => f.id)
          .sort()
          .join('-') || `group-${idx}-${Date.now()}`,
    }));
  } catch (error) {
    console.error('Failed to load duplicates:', error);
    alert('Failed to load duplicates');
  } finally {
    loading.value = false;
    scanProgress.value.show = false;
  }
};
const debouncedLoadDuplicates = useDebounceFn(loadDuplicates, 500);

const generatePhashes = async () => {
  try {
    const body = currentPathFilter.value ? { path: currentPathFilter.value } : {};
    const response = await fetch(`${apiBase}/api/generate-phash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();

    if (data.status === 'completed' && data.total === 0) {
      alert('All files already have perceptual hashes');
    }
  } catch (error) {
    console.error('Failed to start phash generation:', error);
    alert('Failed to start phash generation');
  }
};

const deleteFile = async (fileId: string | number, groupId: string) => {
  const groupIndex = duplicateGroups.value.findIndex((g) => g.id === groupId);
  const group = duplicateGroups.value[groupIndex];
  const file = group?.files.find((f) => f.id === fileId);
  if (!file) return;

  if (!confirm(`Permanently delete "${file.filename}"?`)) return;

  try {
    const response = await fetch(`${apiBase}/api/delete-duplicate/${fileId}`, {
      method: 'DELETE',
    });
    const data = await response.json();

    if (data.success) {
      // IMMEDIATE REMOVAL FROM STATE
      if (group) {
        group.files = group.files.filter((f) => f.id !== fileId);
        selectedPaths.value.delete(file.path);

        // Remove the whole group if it no longer represents a duplicate pair
        if (group.files.length < 2) {
          duplicateGroups.value.splice(groupIndex, 1);
        }
      }
    } else {
      alert('Failed to delete file');
    }
  } catch (error) {
    console.error('Delete failed:', error);
    alert('Delete failed');
  }
};

const toggleSelection = (path: string) => {
  if (selectedPaths.value.has(path)) {
    selectedPaths.value.delete(path);
  } else {
    selectedPaths.value.add(path);
  }
};

const selectDuplicates = () => {
  duplicateGroups.value.forEach((group) => {
    group.files.slice(1).forEach((file) => {
      selectedPaths.value.add(file.path);
    });
  });
};

const deleteSelected = async () => {
  if (selectedPaths.value.size === 0) return;
  if (!confirm(`Permanently delete ${selectedPaths.value.size} selected items?`)) return;

  try {
    const response = await fetch(`${apiBase}/api/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: Array.from(selectedPaths.value) }),
    });
    const data = await response.json();

    if (data.success) {
      // Reload to ensure state is clean
      loadDuplicates();
    } else {
      alert('Failed to delete files');
    }
  } catch (error) {
    console.error('Bulk delete failed:', error);
    alert('Delete failed');
  }
};

const clearPathFilter = () => {
  router.push('/duplicates');
};

// Lightbox Logic
const openImageInLightbox = (groupId: string, fileIndex: number) => {
  currentGroupIndex.value = filteredGroups.value.findIndex((g) => g.id === groupId);
  lightboxIndex.value = fileIndex;
  lightboxOpen.value = true;
};

const closeLightbox = () => {
  lightboxOpen.value = false;
};

const prevImage = () => {
  if (currentGroupIndex.value < 0) return;
  if (lightboxIndex.value > 0) {
    lightboxIndex.value--;
  }
};

const nextImage = () => {
  if (currentGroupIndex.value < 0) return;
  const group = filteredGroups.value[currentGroupIndex.value];
  if (group && lightboxIndex.value < group.files.length - 1) {
    lightboxIndex.value++;
  }
};
// --- Lifecycle ---
onMounted(() => {
  loadDuplicates();

  socket.on('duplicate_scan_progress', (data: any) => {
    if (data.status === 'started') {
      scanProgress.value = { show: true, processed: 0, total: 0, percentage: 0 };
    } else if (data.status === 'processing') {
      scanProgress.value.show = true;
      scanProgress.value.processed = data.processed;
      scanProgress.value.total = data.total;
      scanProgress.value.percentage = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;
    } else if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'error') {
      scanProgress.value.show = false;
      if (data.status === 'cancelled') loading.value = false;
    }
  });

  socket.on('phash_generation', (data: any) => {
    if (data.status === 'started') {
      phashProgress.value = {
        show: true,
        status: 'processing',
        processed: 0,
        total: data.total,
        generated: 0,
        skipped: 0,
      };
    } else if (data.status === 'processing') {
      phashProgress.value.processed = data.processed;
      phashProgress.value.generated = data.generated || 0;
      phashProgress.value.skipped = data.skipped || 0;
    } else if (data.status === 'completed') {
      phashProgress.value.status = 'completed';
      phashProgress.value.processed = data.processed;
      phashProgress.value.generated = data.generated || 0;
      phashProgress.value.skipped = data.skipped || 0;

      setTimeout(() => {
        phashProgress.value.show = false;
        loadDuplicates();
      }, 3000);
    }
  });
});

watch(threshold, () => {
  debouncedLoadDuplicates();
});

watch(
  () => route.query.path,
  () => {
    loadDuplicates();
  },
);

useInfiniteScroll(
  scrollContainer,
  () => {
    loadMore();
  },
  { distance: 400 },
);
</script>
<template>
  <main class="duplicates-container d-flex flex-column h-100 p-2 overflow-hidden">
    <div
      v-if="currentPathFilter"
      class="alert alert-secondary d-flex align-items-center justify-content-between py-2 px-3 mb-2 border-0"
    >
      <div class="small d-flex align-items-center gap-2">
        <span class="opacity-75">Filtering folder:</span>
        <strong class="text-primary">{{ currentPathFilter }}</strong>
      </div>
      <button class="btn btn-link btn-sm p-0 text-decoration-none" @click="clearPathFilter">
        &times; Clear filter
      </button>
    </div>

    <div
      v-if="phashProgress.show"
      class="phash-banner alert alert-primary d-flex flex-column align-items-stretch mb-3 bg-gradient text-white border-0 py-2"
    >
      <div class="d-flex align-items-center gap-2 mb-2">
        <span
          v-if="phashProgress.status === 'processing'"
          class="spinner-border spinner-border-sm"
          role="status"
        ></span>
        <span v-if="phashProgress.status === 'processing'" class="small">
          Generating hashes... ({{ phashProgress.processed }} / {{ phashProgress.total }})
        </span>
        <span v-else class="small">
          ✓ Generated {{ phashProgress.generated }} phash(es)
          <span v-if="phashProgress.skipped > 0">(skipped {{ phashProgress.skipped }})</span>
        </span>
      </div>
      <div class="progress" style="height: 6px">
        <div
          class="progress-bar bg-white"
          role="progressbar"
          :style="{
            width: (phashProgress.total > 0 ? (phashProgress.processed / phashProgress.total) * 100 : 0) + '%',
          }"
          :aria-valuenow="phashProgress.processed"
          :aria-valuemin="0"
          :aria-valuemax="phashProgress.total"
        ></div>
      </div>
    </div>

    <nav class="duplicates-toolbar d-flex align-items-center bg-dark border-bottom p-3 mb-3 gap-3 flex-wrap">
      <div class="fw-bold text-nowrap text-uppercase letter-spacing-1 small opacity-75">Duplicates</div>

      <div class="d-flex gap-2 align-items-center flex-wrap flex-grow-1">
        <select v-model="contentTypeFilter" class="form-select form-select-sm" style="width: 120px">
          <option value="all">All Types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>

        <input
          v-model="nameFilter"
          type="search"
          placeholder="Filter..."
          class="form-control form-control-sm"
          style="width: 180px"
        />

        <div class="d-flex align-items-center gap-2 flex-grow-1 mx-2" style="max-width: 300px">
          <span class="small text-muted text-nowrap">{{ thresholdLabel }}</span>
          <input
            id="threshold"
            v-model.number="threshold"
            type="range"
            class="form-range"
            min="50"
            max="100"
            step="1"
          />
        </div>
      </div>

      <div class="d-flex gap-2">
        <template v-if="selectedPaths.size > 0">
          <button @click="deleteSelected" class="btn btn-sm btn-danger px-3">
            Delete Selected ({{ selectedPaths.size }})
          </button>
        </template>
        <template v-else>
          <button @click="selectDuplicates" class="btn btn-sm btn-outline-primary" v-if="filteredGroups.length > 0">
            Select Duplicates
          </button>
        </template>
        <button @click="loadDuplicates" class="btn btn-sm btn-primary px-3" :disabled="loading">Scan</button>
        <button @click="generatePhashes" class="btn btn-sm btn-outline-secondary px-3">Re-Hash</button>
      </div>
    </nav>

    <div class="duplicates-scroll-area flex-grow-1 overflow-auto position-relative" ref="scrollContainer">
      <div v-if="loading" class="alert alert-info d-flex flex-column gap-2 m-2">
        <div class="d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2">
            <span class="spinner-border spinner-border-sm" role="status"></span>
            <strong>Analyzing files...</strong>
            <span v-if="scanProgress.show && scanProgress.total > 0" class="small">
              ({{ scanProgress.processed }} / {{ scanProgress.total }}) - {{ scanProgress.percentage }}%
            </span>
          </div>
          <button class="btn btn-sm btn-outline-dark" @click="cancelScan">Cancel</button>
        </div>
        <div v-if="scanProgress.show" class="progress" style="height: 6px">
          <div
            class="progress-bar progress-bar-striped progress-bar-animated"
            role="progressbar"
            :style="{ width: scanProgress.percentage + '%' }"
            :aria-valuenow="scanProgress.percentage"
            :aria-valuemin="0"
            :aria-valuemax="100"
          ></div>
        </div>
      </div>

      <template v-else>
        <div v-if="filteredGroups.length > 0" class="px-2 mb-2 text-muted small">
          Found <strong>{{ filteredGroups.length }}</strong> groups with
          <strong>{{ totalDuplicatesCount }}</strong> files
        </div>

        <div v-if="duplicateGroups.length === 0" class="text-center p-5 text-muted">
          <h3 class="h5 mt-3">No Duplicates Found</h3>
          <p class="small">Try adjusting the similarity threshold or generate phashes for existing files.</p>
        </div>

        <div v-else class="duplicates-grid d-flex flex-column gap-3">
          <DuplicateGroup
            v-for="group in visibleGroups"
            :key="group.id"
            :group="group"
            :selected-paths="selectedPaths"
            @open-lightbox="openImageInLightbox"
            @delete-file="deleteFile"
            @toggle-selection="toggleSelection"
          />
        </div>
      </template>

      <div v-if="visibleGroups.length < filteredGroups.length" class="text-center p-3 text-muted">
        <span class="spinner-border spinner-border-sm me-2" role="status"></span>
        <span class="small">Loading more...</span>
      </div>
    </div>

    <LightBox
      v-if="filteredGroups && lightboxOpen && currentGroupIndex >= 0"
      :index="lightboxIndex"
      :is-open="lightboxOpen"
      :items="filteredGroups[currentGroupIndex]!.files"
      :current-index="lightboxIndex"
      @close="closeLightbox"
      @prev="prevImage"
      @next="nextImage"
    />
  </main>
</template>

<style scoped>
.phash-banner {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
</style>
