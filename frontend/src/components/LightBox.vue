<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { FileItem } from '../types';
import { getApiBase } from '../utils/config';

// 2. Props & Emits
const props = defineProps<{
  items: FileItem[];
  index: number;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'update', index: number): void;
  (e: 'close'): void;
}>();

// 3. State
const resolution = ref('');

// 4. Computed
const currentItem = computed(() => {
  if (props.index < 0 || props.index >= props.items.length) return null;
  return props.items[props.index];
});

const apiBase = getApiBase();
const currentUrl = computed(() => (currentItem.value ? `${apiBase}/downloads/${currentItem.value.path}` : ''));

const isVideo = computed(() => {
  if (!currentItem.value) return false;
  const ext = currentItem.value.filename.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'webm', 'gifv', 'mov'].includes(ext);
});

// 5. Methods
const formatSize = (bytes?: number): string => {
  if (bytes === undefined || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const close = () => emit('close');

const next = () => {
  if (props.index < props.items.length - 1) {
    emit('update', props.index + 1);
  }
};

const prev = () => {
  if (props.index > 0) {
    emit('update', props.index - 1);
  }
};

const onMediaLoad = (e: Event) => {
  const el = e.target as HTMLElement;
  if (isVideo.value) {
    const video = el as HTMLVideoElement;
    resolution.value = `${video.videoWidth} x ${video.videoHeight}`;
  } else {
    const img = el as HTMLImageElement;
    resolution.value = `${img.naturalWidth} x ${img.naturalHeight}`;
  }
};

const handleKey = (e: KeyboardEvent) => {
  if (!props.isOpen) return;
  if (e.key === 'Escape') close();
  if (e.key === 'ArrowRight') next();
  if (e.key === 'ArrowLeft') prev();
};

// 6. Lifecycle & Watchers
onMounted(() => window.addEventListener('keydown', handleKey));
onUnmounted(() => window.removeEventListener('keydown', handleKey));

watch(
  () => props.index,
  () => {
    resolution.value = '...';
  },
);
</script>

<template>
  <div v-if="isOpen" class="lightbox-overlay" role="dialog" aria-modal="true">
    <button class="lightbox-close" @click="close" aria-label="Close">&times;</button>

    <button v-if="index > 0" class="nav-btn prev" @click.stop="prev" aria-label="Previous image">&#10094;</button>

    <button v-if="index < items.length - 1" class="nav-btn next" @click.stop="next" aria-label="Next image">
      &#10095;
    </button>

    <div class="media-container" @click.self="close">
      <video
        v-if="isVideo"
        :src="currentUrl"
        controls
        autoplay
        class="media-content"
        @loadedmetadata="onMediaLoad"
      ></video>
      <img v-else :src="currentUrl" class="media-content" @load="onMediaLoad" alt="Full screen preview" />
    </div>

    <footer v-if="currentItem" class="lightbox-footer">
      <div class="info-row">
        <strong>File:</strong>
        <span class="truncate">{{ currentItem.path }}</span>
      </div>
      <div class="info-details">
        <span><strong>Size:</strong> {{ formatSize(currentItem.size) }}</span>
        <span class="separator">&bull;</span>
        <span><strong>Res:</strong> {{ resolution }}</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Lightbox Specific Styles
   These override Pico defaults to ensure a dark, full-screen cinema mode.
*/

.lightbox-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.95);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  color: white; /* Force white text regardless of theme */
}

/* Close Button - Custom absolute positioning */
.lightbox-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 2.5rem;
  line-height: 1;
  cursor: pointer;
  z-index: 10001;
  padding: 0.5rem;
  transition: color 0.2s;
}
.lightbox-close:hover {
  color: white;
  transform: none; /* Override Pico button transform */
}

/* Navigation Buttons */
.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 3rem;
  padding: 1rem;
  cursor: pointer;
  z-index: 10001;
  transition: color 0.2s;
}
.nav-btn:hover {
  color: white;
  background: transparent;
}
.prev {
  left: 1rem;
}
.next {
  right: 1rem;
}

/* Media Container */
.media-container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 0;
}

.media-content {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
}

/* Footer / Info Bar */
.lightbox-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 1rem 2rem;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  pointer-events: none; /* Let clicks pass through to background */
}

.info-row,
.info-details {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: #ddd;
}

.info-details {
  font-size: 0.85rem;
  color: #aaa;
}

.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80vw;
}

.separator {
  margin: 0 0.5rem;
  opacity: 0.5;
}
</style>
