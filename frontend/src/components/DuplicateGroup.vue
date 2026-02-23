<script setup lang="ts">
import { computed } from 'vue';
import FileGridItem from './FileGridItem.vue';
import type { FileItem } from '../types';

interface DuplicateGroupData {
  id: string;
  type: 'video' | 'image' | 'mixed' | string;
  confidence?: number;
  files: FileItem[];
  avgDistance: number;
}

// 2. Props
const props = defineProps<{
  group: DuplicateGroupData;
  selectedPaths: Set<string>;
}>();

// 3. Emits
const emit = defineEmits<{
  (e: 'open-lightbox', groupId: string, fileIndex: number): void;
  (e: 'delete-file', fileId: string | number, groupId: string): void;
  (e: 'toggle-selection', path: string): void;
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
  emit('open-lightbox', props.group.id, fileIndex);
};

const deleteFile = (fileId: string | number) => {
  emit('delete-file', fileId, props.group.id);
};

const toggleSelection = (path: string) => {
  emit('toggle-selection', path);
};
</script>
<template>
  <article class="duplicate-group">
    <header>
      <div class="header-content">
        <hgroup>
          <h4>
            <span role="img" aria-label="type">{{ typeIcon }}</span>
            Group
          </h4>
          <p>{{ group.files.length }} files &bull; Similarity: {{ group.avgDistance }}%</p>
        </hgroup>

        <div v-if="confidencePercent !== null">
          <mark v-if="confidencePercent > 90" class="badge-success">{{ confidencePercent }}% Match</mark>
          <mark v-else>{{ confidencePercent }}% Match</mark>
        </div>
      </div>
    </header>

    <div class="gallery-grid">
      <div
        v-for="(file, fileIndex) in group.files"
        :key="file.id"
        class="file-item-wrapper"
        :class="{ selected: selectedPaths.has(file.path) }"
        @click="openLightbox(fileIndex)"
      >
        <input
          type="checkbox"
          class="item-checkbox"
          :checked="selectedPaths.has(file.path)"
          @click.stop="toggleSelection(file.path)"
        />

        <FileGridItem :item="file">
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
    </div>
  </article>
</template>

<style scoped>
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-content hgroup {
  margin-bottom: 0;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.file-item-wrapper {
  position: relative;
  aspect-ratio: 1;
  background: #111;
  cursor: pointer;
  border-radius: 4px;
  overflow: hidden;
  transition: transform 0.1s;
}

.file-item-wrapper:hover {
  transform: scale(1.02);
  z-index: 1;
}

.file-item-wrapper.selected {
  outline: 3px solid var(--primary);
}

.item-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 18px;
  height: 18px;
  z-index: 10;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  accent-color: var(--primary);
}

.file-item-wrapper:hover .item-checkbox,
.file-item-wrapper.selected .item-checkbox {
  opacity: 1;
}

.file-info-compact {
  flex: 1;
  overflow: hidden;
  color: white;
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
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
  background: rgba(255, 255, 255, 0.2);
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
  background: rgba(255, 255, 255, 0.4);
}

.icon-btn.delete:hover {
  background: #cf222e;
}

.badge-success {
  background-color: #2da44e;
  color: white;
  border: none;
}
</style>
