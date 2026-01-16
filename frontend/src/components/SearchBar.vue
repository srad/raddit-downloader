<template>
  <form class="search-container" @submit.prevent="startDownload">
    <div class="main-input-group d-flex gap-3 mb-2">
      <div class="input-group flex-grow-1">
        <AutocompleteInput
          v-model="subreddit"
          :items="props.history"
          placeholder="Enter subreddit or u/username..."
          :disabled="isRunning"
          @submit="startDownload"
        />
      </div>

      <button v-if="!isRunning" type="submit" class="btn btn-primary px-4 py-2 d-flex align-items-center">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16" class="me-2">
          <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
          <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
        </svg>
        Download
      </button>
      <button v-else type="button" class="btn btn-danger px-4 py-2 d-flex align-items-center" @click="stopDownload">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" class="me-2">
          <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
          <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
        </svg>
        Stop
      </button>
    </div>

    <div v-if="isRunning" class="progress-bar-container mb-3">
      <div 
        class="progress-bar-fill" 
        :class="{ 'is-indeterminate': isInfinite }"
        :style="isInfinite ? {} : { width: progressPercentage + '%' }"
      ></div>
      <span class="progress-text">
        {{ progress?.downloaded || 0 }} / {{ displayTotal }} posts 
        <template v-if="!isInfinite">({{ progressPercentage }}%)</template>
      </span>
    </div>

    <div class="options-toggle d-flex align-items-center gap-2 mb-2 cursor-pointer" :class="{ open: optionsOpen }" @click="optionsOpen = !optionsOpen">
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" class="toggle-icon">
        <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
      </svg>
      <span class="small fw-bold text-uppercase opacity-75">Advanced Options</span>
    </div>

    <div class="options-row overflow-hidden" :class="{ open: optionsOpen }">
      <div class="row g-3 py-2">
        <div class="col-md-4">
          <label class="input-label mb-1">Sort By</label>
          <select v-model="sorting" class="form-select">
            <option value="top">Top</option>
            <option value="hot">Hot</option>
            <option value="new">New</option>
            <option value="rising">Rising</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="input-label mb-1">Time Period</label>
          <select v-model="time" class="form-select">
            <option value="all">All Time</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="week">This Week</option>
            <option value="day">Today</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="input-label mb-1">Post Limit</label>
          <div class="d-flex align-items-center gap-2">
            <input type="number" v-model.number="limit" min="0" class="form-control" />
            <span class="small opacity-50 text-nowrap">0 for unlimited</span>
          </div>
        </div>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import AutocompleteInput from './AutocompleteInput.vue';

export interface SearchPayload {
  subreddit: string;
  sorting: string;
  time: string;
  limit: number;
}

export interface ProgressState {
  downloaded: number;
  total: number;
}

const props = defineProps<{
  history: string[];
  isRunning: boolean;
  progress: ProgressState | null;
}>();

const emit = defineEmits<{
  (e: 'start', payload: SearchPayload): void;
  (e: 'stop'): void;
}>();

const subreddit = ref('');
const sorting = ref('new');
const time = ref('all');
const limit = ref<number>(0);
const optionsOpen = ref(false);

const isInfinite = computed(() => (props.progress?.total || 0) > 1000000000);
const displayTotal = computed(() => isInfinite.value ? 'All' : (props.progress?.total || 0));

const progressPercentage = computed(() => {
  if (!props.progress || props.progress.total <= 0 || isInfinite.value) return 0;
  return Math.round((props.progress.downloaded / props.progress.total) * 100);
});

const startDownload = () => {
  emit('start', { subreddit: subreddit.value, sorting: sorting.value, time: time.value, limit: limit.value });
};

const stopDownload = () => emit('stop');
</script>

<style scoped>
.search-container {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.cursor-pointer { cursor: pointer; }
.toggle-icon { transition: transform 0.2s; }
.options-toggle.open .toggle-icon { transform: rotate(180deg); }

.options-row {
  max-height: 0;
  opacity: 0;
  transition: max-height 0.3s ease, opacity 0.3s ease;
}
.options-row.open {
  max-height: 200px;
  opacity: 1;
}

.input-label {
  font-size: 0.75rem;
  color: #999;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.progress-bar-container {
    background: #161616;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    height: 30px;
    position: relative;
    overflow: hidden;
}

.progress-bar-fill {
    height: 100%;
    background: #ff4500;
    transition: width 0.3s ease;
}

.progress-bar-fill.is-indeterminate {
    width: 100%;
    background: linear-gradient(90deg, #ff4500 0%, #ff8c00 50%, #ff4500 100%);
    background-size: 200% 100%;
    animation: move-indeterminate 2s linear infinite;
}

@keyframes move-indeterminate {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
}

.progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.8rem;
    color: white;
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}
</style>