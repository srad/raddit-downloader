<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FileItem } from '../types';
import { getApiBase } from '../utils/config';

// Props
const props = defineProps<{
  item: FileItem;
  selectable?: boolean;
  selected?: boolean;
}>();

// Emits
const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'toggle-select'): void;
}>();

// State
const hovering = ref(false);
const apiBase = getApiBase();

// Computed
const getUrl = (path: string) => `${apiBase}${path}`;

const ext = computed(() => props.item.filename.split('.').pop()?.toLowerCase() || '');

const isVideo = computed(() => ['mp4', 'webm', 'gifv', 'mov', 'avi', 'mkv'].includes(ext.value));
const isGif = computed(() => ext.value === 'gif');

const thumbnailUrl = computed(() => {
  if (props.item.thumbnail) return getUrl(`/thumbnails/${props.item.thumbnail}`);
  // Fallback for videos without thumbnail (shouldn't happen often if generated)
  // or images where thumbnail generation failed
  if (!isVideo.value) return getUrl(`/downloads/${props.item.path}`);
  return null;
});

const contentUrl = computed(() => getUrl(`/downloads/${props.item.path}`));

// Methods
const handleClick = () => emit('click');
const handleToggleSelect = () => emit('toggle-select');

</script>

<template>
  <div
    class="gallery-item position-relative ratio ratio-1x1 bg-black overflow-hidden border border-2 border-transparent"
    :class="{ selected: selected }"
    @click="handleClick"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
  >
    <div class="item-overlay position-absolute top-0 start-0 w-100 h-100 d-flex flex-column" v-if="hovering" style="z-index: 5; background: rgba(0, 0, 0, 0.3); pointer-events: none;">
      <div class="overlay-top pointer-events-auto">
        <slot name="header"></slot>
      </div>
      <div class="overlay-center flex-grow-1 pointer-events-auto" @click.stop="handleClick" style="cursor: pointer;">
        <!-- Click target for open -->
      </div>
      <div class="overlay-bottom p-2 d-flex justify-content-between align-items-end pointer-events-auto" style="background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);">
        <slot name="actions"></slot>
      </div>
    </div>

    <input
      v-if="selectable"
      type="checkbox"
      class="item-checkbox position-absolute form-check-input m-0"
      :checked="selected"
      @click.stop="handleToggleSelect"
      style="top: 6px; left: 6px; z-index: 10; opacity: 0; transition: opacity 0.2s;"
    />

    <figure class="media-wrapper m-0 w-100 h-100 d-flex align-items-center justify-content-center position-relative">
      <template v-if="thumbnailUrl">
        <img :src="thumbnailUrl" loading="lazy" :alt="item.filename" class="w-100 h-100 object-fit-cover d-block" />

        <div v-if="isVideo" class="video-overlay position-absolute top-50 start-50 translate-middle text-white" style="font-size: 2rem; text-shadow: 0 2px 5px rgba(0, 0, 0, 0.5); pointer-events: none;">▶</div>

        <span v-if="isVideo" class="badge position-absolute bottom-0 end-0 m-1 bg-success opacity-75">{{ ext }}</span>
        <span v-else-if="isGif" class="badge position-absolute bottom-0 end-0 m-1 bg-info opacity-75">GIF</span>
      </template>

      <template v-else>
        <!-- No thumbnail available -->
        <template v-if="isVideo">
          <video
            v-if="hovering"
            :src="contentUrl"
            muted
            loop
            autoplay
            class="preview-video w-100 h-100 object-fit-cover d-block"
          ></video>
          <div v-else class="placeholder-icon w-100 h-100 d-flex align-items-center justify-content-center bg-body-tertiary">
            <!-- Video Placeholder Icon -->
            <svg width="48" height="48" fill="currentColor" viewBox="0 0 16 16" style="opacity: 0.3">
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
              <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z" />
            </svg>
          </div>
          <span class="badge position-absolute bottom-0 end-0 m-1 bg-success opacity-75">{{ ext }}</span>
        </template>

        <template v-else>
          <!-- Image fallback (load full image) -->
          <img :src="contentUrl" loading="lazy" :alt="item.filename" class="w-100 h-100 object-fit-cover d-block" />
        </template>
      </template>
    </figure>
  </div>
</template>

<style scoped>
.gallery-item {
  cursor: pointer;
  border-color: transparent !important; /* Default border invisible */
}

.gallery-item:hover {
  z-index: 2;
  border-color: rgba(255, 255, 255, 0.3) !important; /* Subtle hover border */
}

.gallery-item.selected {
  border-color: var(--bs-primary) !important;
  opacity: 0.9;
}

.item-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.gallery-item:hover .item-checkbox,
.gallery-item.selected .item-checkbox {
  opacity: 1 !important;
}

.pointer-events-auto {
  pointer-events: auto;
}
</style>
