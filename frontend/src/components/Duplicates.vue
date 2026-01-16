<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useDebounceFn, useInfiniteScroll } from '@vueuse/core';
import DuplicateGroup from './DuplicateGroup.vue';
import { useSocket } from '../composables/useSocket';
import { getApiBase } from '../utils/config';
import LightBox from './LightBox.vue';
import type { FileItem } from '../types';

interface DuplicateGroupData {
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
  groups: DuplicateGroupData[];
  totalGroups: number;
  totalDuplicates: number;
}

// --- Composables ---
const { socket } = useSocket();
const apiBase = getApiBase();

// --- State ---
const loading = ref(false);
const scanProgress = ref({
  show: false,
  processed: 0,
  total: 0,
  percentage: 0
});

const duplicateGroups = ref<DuplicateGroupData[]>([]);
const totalGroups = ref(0);
const totalDuplicates = ref(0);

// Filters
const threshold = ref(5);
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
const thresholdLabel = computed(() => `${threshold.value} bits`);

const filteredGroups = computed(() => {
  return duplicateGroups.value.filter((group) => {
    // Content type filter
    if (contentTypeFilter.value !== 'all') {
      const matchesType = group.type === contentTypeFilter.value || group.type === 'mixed';
      if (!matchesType) return false;
    }

    // Name filter
    if (nameFilter.value) {
      const searchLower = nameFilter.value.toLowerCase();
      const hasMatch = group.files.some((file) => file.filename.toLowerCase().includes(searchLower));
      if (!hasMatch) return false;
    }

    return true;
  });
});

const visibleGroups = computed(() => {
  return filteredGroups.value.slice(0, visibleLimit.value);
});

// --- Methods ---
const loadMore = async () => {
  if (isLoadingMore.value) return;
  if (visibleLimit.value >= filteredGroups.value.length) return;

  isLoadingMore.value = true;
  await new Promise((r) => setTimeout(r, 50)); // Small delay to allow UI to breathe
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
  if (loading.value) return; // Prevent double trigger
  loading.value = true;
  scanProgress.value = { show: true, processed: 0, total: 0, percentage: 0 };
  visibleLimit.value = 20; // Reset pagination on reload
  
  try {
    const response = await fetch(`${apiBase}/api/duplicates?threshold=${threshold.value}`);
    if (response.status === 499) {
      console.log('Scan cancelled');
      return;
    }
    const data: DuplicatesResponse = await response.json();

    duplicateGroups.value = data.groups || [];
    totalGroups.value = data.totalGroups || 0;
    totalDuplicates.value = data.totalDuplicates || 0;
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
    const response = await fetch(`${apiBase}/api/generate-phash`, { method: 'POST' });
    const data = await response.json();

    if (data.status === 'completed' && data.total === 0) {
      alert('All files already have perceptual hashes');
    }
  } catch (error) {
    console.error('Failed to start phash generation:', error);
    alert('Failed to start phash generation');
  }
};

const deleteFile = async (fileId: string | number, groupIndex: number) => {
  if (!confirm('Permanently delete this file?')) return;

  try {
    const response = await fetch(`${apiBase}/api/delete-duplicate/${fileId}`, {
      method: 'DELETE',
    });
    const data = await response.json();

    if (data.success) {
      // Remove file from group locally to avoid full reload
      const group = duplicateGroups.value[groupIndex];
      if (group) {
        group.files = group.files.filter((f) => f.id !== fileId);

        // Remove group if it has less than 2 files
        if (group.files.length < 2) {
          duplicateGroups.value.splice(groupIndex, 1);
          totalGroups.value--;
        }
        totalDuplicates.value--;
      }
    } else {
      alert('Failed to delete file');
    }
  } catch (error) {
    console.error('Delete failed:', error);
    alert('Delete failed');
  }
};

// Lightbox Logic
const openImageInLightbox = (groupIndex: number, fileIndex: number) => {
  currentGroupIndex.value = groupIndex;
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
    <!-- Phash Progress Banner -->
    <div v-if="phashProgress.show" class="phash-banner alert alert-primary d-flex flex-column align-items-stretch mb-3 bg-gradient text-white border-0 py-2">
      <div class="d-flex align-items-center gap-2 mb-2">
        <span v-if="phashProgress.status === 'processing'" class="spinner-border spinner-border-sm" role="status"></span>
        <span v-if="phashProgress.status === 'processing'" class="small">
          Generating hashes... ({{ phashProgress.processed }} / {{ phashProgress.total }})
        </span>
        <span v-else class="small">
          ✓ Generated {{ phashProgress.generated }} phash(es)
          <span v-if="phashProgress.skipped > 0">(skipped {{ phashProgress.skipped }})</span>
        </span>
      </div>
      <div class="progress" style="height: 6px;">
        <div 
          class="progress-bar bg-white" 
          role="progressbar" 
          :style="{ width: (phashProgress.processed / phashProgress.total * 100) + '%' }"
          :aria-valuenow="phashProgress.processed" 
          :aria-valuemin="0" 
          :aria-valuemax="phashProgress.total"
        ></div>
      </div>
    </div>

    <!-- Toolbar -->
    <nav class="duplicates-toolbar d-flex align-items-center bg-dark border-bottom p-3 mb-3 gap-3 flex-wrap">
      <div class="fw-bold text-nowrap text-uppercase letter-spacing-1 small opacity-75">Duplicates</div>

      <div class="d-flex gap-2 align-items-center flex-wrap flex-grow-1">
        <select v-model="contentTypeFilter" class="form-select form-select-sm" style="width: 120px;">
          <option value="all">All Types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        
        <input 
          v-model="nameFilter" 
          type="search" 
          placeholder="Filter..." 
          class="form-control form-control-sm"
          style="width: 180px;"
        />

        <div class="d-flex align-items-center gap-2 flex-grow-1 mx-2" style="max-width: 300px;">
          <span class="small text-muted text-nowrap">Diff: {{ thresholdLabel }}</span>
          <input id="threshold" v-model.number="threshold" type="range" class="form-range" min="0" max="15" />
        </div>
      </div>

      <div class="d-flex gap-2">
        <button @click="loadDuplicates" class="btn btn-sm btn-primary px-3" :disabled="loading">Scan</button>
        <button @click="generatePhashes" class="btn btn-sm btn-outline-secondary px-3">Re-Hash</button>
      </div>
    </nav>

    <!-- Scroll Area -->
    <div class="duplicates-scroll-area flex-grow-1 overflow-auto position-relative" ref="scrollContainer">
      <!-- Analysis Progress -->
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
        <div v-if="scanProgress.show" class="progress" style="height: 6px;">
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
        <!-- Summary -->
        <div v-if="totalGroups > 0" class="px-2 mb-2 text-muted small">
          Found <strong>{{ filteredGroups.length }}</strong> groups with <strong>{{ totalDuplicates }}</strong> files
          <span v-if="filteredGroups.length !== totalGroups" class="fst-italic">
            ({{ totalGroups - filteredGroups.length }} filtered out)
          </span>
        </div>

        <!-- Empty State -->
        <div v-if="totalGroups === 0" class="text-center p-5 text-muted">
          <h3 class="h5 mt-3">No Duplicates Found</h3>
          <p class="small">Try adjusting the similarity threshold or generate phashes for existing files.</p>
        </div>

        <!-- Grid -->
        <div v-else class="duplicates-grid d-flex flex-column gap-3">
          <DuplicateGroup
            v-for="(group, groupIndex) in visibleGroups"
            :key="groupIndex"
            :group="group"
            :group-index="groupIndex"
            @open-lightbox="openImageInLightbox"
            @delete-file="deleteFile"
          />
        </div>
      </template>

      <!-- Loader -->
      <div v-if="visibleGroups.length < filteredGroups.length" class="text-center p-3 text-muted">
        <span class="spinner-border spinner-border-sm me-2" role="status"></span>
        <span class="small">Loading more...</span>
      </div>
    </div>

    <!-- Lightbox -->
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
/* Custom overrides where bootstrap util classes aren't enough */
.phash-banner {
  /* Keep the custom gradient look but integrated with Bootstrap alert structure */
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
</style>
