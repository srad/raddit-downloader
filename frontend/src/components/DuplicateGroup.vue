<script setup lang="ts">
import { computed } from 'vue';
import FileGridItem from './FileGridItem.vue';
import type { FileItem } from '../types';

interface DuplicateGroupData {
  type: 'video' | 'image' | 'mixed' | string;
  confidence?: number;
  files: FileItem[];
  avgDistance: number;
}

// 2. Props
const props = defineProps<{
  group: DuplicateGroupData;
  groupIndex: number;
}>();

// 3. Emits
const emit = defineEmits<{
  (e: 'open-lightbox', groupIndex: number, fileIndex: number): void;
  (e: 'delete-file', fileId: string | number, groupIndex: number): void;
}>();

// 4. Logic
const typeIcon = computed(() => {
  switch (props.group.type) {
    case 'video':
      return '📹';
    case 'image':
      return '🖼️';
    case 'mixed':
      return '📁';
    default:
      return '📄';
  }
});

const confidencePercent = computed(() => {
  if (props.group.confidence !== undefined) {
    return Math.round(props.group.confidence * 100);
  }
  return null;
});

const formatSize = (bytes?: number): string => {
  if (bytes === undefined || bytes === 0) return 'Unknown Size';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const openLightbox = (fileIndex: number) => {
  emit('open-lightbox', props.groupIndex, fileIndex);
};

const deleteFile = (fileId: string | number) => {
  emit('delete-file', fileId, props.groupIndex);
};
</script>

<template>
  <article class="duplicate-group">
    <header>
      <div class="header-content">
        <hgroup>
          <h4>
            <span role="img" aria-label="type">{{ typeIcon }}</span>
            Group {{ groupIndex + 1 }}
          </h4>
          <p>{{ group.files.length }} files &bull; Avg distance: {{ group.avgDistance }}</p>
        </hgroup>

        <div v-if="confidencePercent !== null">
          <mark v-if="confidencePercent > 90" class="badge-success">{{ confidencePercent }}% Match</mark>
          <mark v-else>{{ confidencePercent }}% Match</mark>
        </div>
      </div>
    </header>

    <div class="gallery-grid">
      <FileGridItem
        v-for="(file, fileIndex) in group.files"
        :key="file.id"
        :item="file"
        :selectable="false"
        @click="openLightbox(fileIndex)"
      >
        <template #actions>
          <div class="file-info-compact">
            <span class="file-name" :title="file.filename">{{ file.filename }}</span>
            <small>{{ formatSize(file.size) }}</small>
          </div>
          <div class="action-buttons">
            <button class="icon-btn delete" @click.stop="deleteFile(file.id)" title="Delete">🗑️</button>
            <a :href="file.url" target="_blank" class="icon-btn link" @click.stop title="Source">🔗</a>
          </div>
        </template>
      </FileGridItem>
    </div>
  </article>
</template>

<style scoped>
/* Pico CSS handles most typography, colors, and card styles.
   We only add layout styles for the specific gallery grid
   and some spacing adjustments.
*/

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-content hgroup {
  margin-bottom: 0;
}

/* Custom Gallery Grid */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 4px;
}

.file-info-compact {
  flex: 1;
  overflow: hidden;
  color: white;
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

.file-name {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  font-weight: bold;
}

.action-buttons {
  display: flex;
  gap: 4px;
}

.icon-btn {
  background: rgba(255,255,255,0.2);
  border: none;
  border-radius: 4px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  transition: background 0.2s;
  padding: 0;
  text-decoration: none;
}

.icon-btn:hover {
  background: rgba(255,255,255,0.4);
}

.icon-btn.delete:hover {
  background: #cf222e;
}

/* Custom Badge Color override if needed */
.badge-success {
  background-color: #2da44e; /* GitHub green or similar */
  color: white;
  border: none;
}
</style>
