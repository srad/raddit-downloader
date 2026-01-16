<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FileItem } from '../types';
import { getApiBase } from '../utils/config';

const props = defineProps<{ item: FileItem; }>();
const hovering = ref(false);
const apiBase = getApiBase();

const ext = computed(() => props.item.filename.split('.').pop()?.toLowerCase() || '');
const isVideo = computed(() => ['mp4', 'webm', 'gifv', 'mov', 'avi', 'mkv'].includes(ext.value));
const isGif = computed(() => ext.value === 'gif');

const thumbnailUrl = computed(() => {
  if (props.item.thumbnail) return `${apiBase}/thumbnails/${props.item.thumbnail}`;
  if (!isVideo.value) return `${apiBase}/downloads/${props.item.path}`;
  return null;
});

const contentUrl = computed(() => `${apiBase}/downloads/${props.item.path}`);
</script>

<template>
  <div class="media-wrapper w-100 h-100" @mouseenter="hovering = true" @mouseleave="hovering = false">
    <template v-if="thumbnailUrl">
      <img :src="thumbnailUrl" loading="lazy" class="media-content" />
      <div v-if="isVideo" class="video-overlay">
        <svg width="48" height="48" fill="white" viewBox="0 0 16 16" style="opacity: 0.9;">
          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
          <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
        </svg>
      </div>
      <span v-if="isVideo" class="item-badge" style="background-color: mediumseagreen">{{ ext }}</span>
      <span v-else-if="isGif" class="item-badge" style="background-color: deepskyblue">Gif</span>
    </template>

    <template v-else>
      <template v-if="isVideo">
        <video v-if="hovering" :src="contentUrl" muted loop autoplay class="media-content"></video>
        <div v-else class="video-placeholder">
          <svg width="48" height="48" fill="#999" viewBox="0 0 16 16">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
            <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
          </svg>
        </div>
        <span class="item-badge" style="background-color: mediumseagreen">{{ ext }}</span>
      </template>
      <img v-else :src="contentUrl" loading="lazy" class="media-content" />
    </template>
  </div>
</template>

<style scoped>
.media-wrapper { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.media-content { width: 100%; height: 100%; object-fit: cover; display: block; }
.video-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; }
.item-badge { position: absolute; bottom: 5%; left: 5%; color: white; font-size: 0.7rem; padding: 4px 6px; border-radius: 4px; opacity: 0.8; font-weight: bold; text-transform: uppercase; }
.video-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #1a1a1b; }
</style>
