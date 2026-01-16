<template>
  <form class="w-100 p-3" @submit.prevent="startDownload">
    <div class="d-flex gap-2 w-100 mb-2 justify-content-center align-items-center">
      <input
        list="history-list"
        v-model="subreddit"
        placeholder="Enter subreddit or u/username..."
        required
        :disabled="isRunning"
        class="form-control form-control-lg"
      />
      <datalist id="history-list">
        <option v-for="h in props.history" :key="h" :value="h"></option>
      </datalist>

      <button v-if="!isRunning" type="submit" class="btn btn-primary btn-lg">Download</button>
      <button v-else type="button" class="btn btn-warning" @click="stopDownload">Stop</button>
    </div>

    <div v-if="isRunning" class="progress-wrapper">
      <ProgressBar :current="progress?.downloaded || 0" :total="progress?.total || 0" />
    </div>

    <div class="options-toggle" :class="{ open: optionsOpen }" @click="optionsOpen = !optionsOpen">
      <svg class="toggle-icon" fill="currentColor" viewBox="0 0 16 16">
        <path
          fill-rule="evenodd"
          d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"
        />
      </svg>
      <span>Advanced Options</span>
    </div>

    <div class="options-row w-100 d-flex" :class="{ open: optionsOpen }">
      <div class="d-flex gap-2 flex-fill">
        <label>Sort By</label>
        <select v-model="sorting" class="form-select">
          <option value="top">Top</option>
          <option value="hot">Hot</option>
          <option value="new" selected>New</option>
          <option value="rising">Rising</option>
        </select>
      </div>
      <div class="d-flex gap-2 flex-fill">
        <label>Time Period</label>
        <select v-model="time" class="form-select">
          <option value="all" selected>All Time</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="week">This Week</option>
          <option value="day">Today</option>
        </select>
      </div>
      <div class="d-flex gap-2 flex-fill">
        <label>Post Limit</label>
        <div class="input-wrapper">
          <input type="number" v-model.number="limit" min="0" value="0" class="form-control" />
          <div class="input-hint">0 for unlimited</div>
        </div>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ProgressBar from './ProgressBar.vue';
import { useSocket } from '../composables/useSocket';

// --- Interfaces ---

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

// --- Props ---

const props = defineProps<{
  history: string[]; // List of previous searches for the datalist
}>();

// --- Emits ---

const emit = defineEmits<{
  (e: 'start', payload: SearchPayload): void;
  (e: 'stop'): void;
}>();

// --- Local State ---

const { socket } = useSocket();

const subreddit = ref('');
const sorting = ref('top');
const time = ref('all');
const limit = ref<number>(50); // Default to 50
const optionsOpen = ref(false);
const isRunning = ref(false);
const progress = ref<ProgressState | null>();

// --- Methods ---

const startDownload = () => {
  if (!subreddit.value) return;

  const payload: SearchPayload = {
    subreddit: subreddit.value,
    sorting: sorting.value,
    time: time.value,
    limit: limit.value,
  };

  emit('start', payload);
};

const stopDownload = () => {
  emit('stop');
};

onMounted(() => {
  socket.on('status', (status) => {
    isRunning.value = status === 'running';
  });

  socket.on('progress', (data: ProgressState) => {
    progress.value = data;
  });
});
</script>

<style scoped>
.options-toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 0.9rem;
  color: #6c757d;
  user-select: none;
}

.toggle-icon {
  width: 16px;
  height: 16px;
  margin-right: 0.5rem;
  transition: transform 0.3s ease;
}

.options-toggle.open .toggle-icon {
  transform: rotate(180deg);
}

/* Collapsible Animation */
.options-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  max-height: 0;
  overflow: hidden;
  transition:
    max-height 0.3s ease-out,
    opacity 0.3s ease-out;
  opacity: 0;
}

.options-row.open {
  max-height: 200px; /* Adjust based on expected height */
  opacity: 1;
  padding-bottom: 0.5rem;
}
</style>
