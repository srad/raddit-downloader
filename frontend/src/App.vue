<template>
  <div class="app-layout">
    <TitleBar />
    <RouterView />
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
import TitleBar from './components/TitleBar.vue';
</script>

<style>
/* Global styles can stay here or in style.scss */
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
</style>