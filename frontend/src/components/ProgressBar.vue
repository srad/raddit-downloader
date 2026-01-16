<script setup lang="ts">
import { computed } from 'vue';

// 1. Props with TypeScript interface and Defaults
const props = withDefaults(
  defineProps<{
    current?: number;
    total?: number;
  }>(),
  {
    current: 0,
    total: 0,
  },
);

// 2. Computed Logic
const isInfinite = computed(() => props.total > 1000000000); // Check for ALL_POSTS (Number.MAX_SAFE_INTEGER)

const percentage = computed(() => {
  if (props.total <= 0 || isInfinite.value) return 0;
  return Math.round((props.current / props.total) * 100);
});

const displayTotal = computed(() => isInfinite.value ? 'All' : props.total);
</script>

<template>
  <div class="progress-wrapper">
    <div 
      class="progress-inner" 
      :class="{ 'is-indeterminate': isInfinite }"
      :style="isInfinite ? {} : { width: percentage + '%' }"
    ></div>

    <small class="progress-text"> 
      {{ current }} / {{ displayTotal }} posts 
      <template v-if="!isInfinite">({{ percentage }}%)</template>
    </small>
  </div>
</template>

<style scoped>
.progress-wrapper {
  position: relative;
  width: 100%;
  height: 1.5rem;
  background: var(--pico-card-sectioning-background-color);
  border-radius: var(--pico-border-radius);
  overflow: hidden;
}

.progress-inner {
  height: 100%;
  background-color: var(--pico-primary);
  transition: width 0.3s ease;
}

.progress-inner.is-indeterminate {
  width: 100%;
  background: linear-gradient(90deg, var(--pico-primary) 0%, #ff8c00 50%, var(--pico-primary) 100%);
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
  color: var(--pico-color); /* Matches theme text color */
  font-weight: bold;
  font-size: 0.8rem;
  z-index: 2;
  white-space: nowrap;
  mix-blend-mode: exclusion; /* Optional: helps text contrast against filled/unfilled parts */
}
</style>
