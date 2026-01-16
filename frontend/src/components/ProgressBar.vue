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
const percentage = computed(() => {
  if (props.total <= 0) return 0;
  return Math.round((props.current / props.total) * 100);
});
</script>

<template>
  <div class="progress-wrapper">
    <progress :value="current" :max="total" class="progress-bar"></progress>

    <small class="progress-text"> {{ current }} / {{ total }} posts ({{ percentage }}%) </small>
  </div>
</template>

<style scoped>
/* Pico CSS handles the visual bar style via the <progress> tag.
   We just need a wrapper to position the text overlay if you want it
   centered on top, or standard flow if you want it below.

   The style below centers the text ON TOP of the bar, similar to your original design.
*/

.progress-wrapper {
  position: relative;
  width: 100%;
  height: 1.5rem; /* Height of the container */
  background: var(--pico-card-sectioning-background-color);
  border-radius: var(--pico-border-radius);
  overflow: hidden;
}

.progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin-bottom: 0; /* Remove Pico's default bottom margin */
  border-radius: 0;
  appearance: none;
  border: none;
  background: transparent;
}

/* Chrome/Safari/Edge */
.progress-bar::-webkit-progress-bar {
  background: transparent;
}
.progress-bar::-webkit-progress-value {
  background-color: var(--pico-primary);
  transition: width 0.3s ease;
}

/* Firefox */
.progress-bar::-moz-progress-bar {
  background-color: var(--pico-primary);
  transition: width 0.3s ease;
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
