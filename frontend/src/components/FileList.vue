<template>
  <aside class="file-list-container h-100 d-flex flex-column bg-body-tertiary border-end">
    <div
      v-if="label"
      class="sidebar-header px-3 py-2 fw-bold text-uppercase text-muted border-bottom"
      style="font-size: 0.7rem; letter-spacing: 1px"
    >
      {{ label }}
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="p-3 text-center text-muted small fst-italic">
      <div class="spinner-border spinner-border-sm me-2" role="status"></div>
      Loading...
    </div>

    <!-- Empty -->
    <div v-else-if="folders.length === 0" class="p-3 text-center text-muted small fst-italic">No folders found</div>

    <!-- File Tree -->
    <nav v-else class="file-tree flex-grow-1 overflow-auto py-1">
      <ul class="list-unstyled m-0 p-0">
        <li v-for="folder in folders" :key="folder.path">
          <div
            class="folder-item d-flex align-items-center px-3 py-1 user-select-none"
            :class="{ 'active bg-primary text-white': isActive(folder.path), 'text-body': !isActive(folder.path) }"
            @click="selectFolder(folder.path)"
            role="button"
            tabindex="0"
            style="cursor: pointer; min-height: 28px"
          >
            <!-- Icon -->
            <span class="me-2 opacity-75 small">📁</span>

            <!-- Label -->
            <span class="folder-label text-truncate flex-grow-1 justify-content-between d-flex" style="font-size: 0.85rem">
              <span>{{ folder.name }}</span> <small class="ms-1 opacity-75">({{ folder.fileCount }})</small>
            </span>

            <!-- Delete Action -->
            <button
              @click="deleteFolder(folder.path)"
              type="button"
              class="btn btn-sm ms-2 folder-delete"
              @click.stop="deleteFolder(folder.path)"
            >
              <Lineicons :icon="Trash3Outlined" :size="12" color="orange" />
            </button>
          </div>
        </li>
      </ul>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSocket } from '../composables/useSocket';
import { getApiBase } from '../utils/config';
import { Lineicons } from '@lineiconshq/vue-lineicons';
import { Trash3Outlined } from '@lineiconshq/free-icons';

// 1. Types
interface FolderItem {
  name: string;
  path: string;
  isDirectory: boolean;
  fileCount: number;
}

// 2. Props
const props = withDefaults(
  defineProps<{
    path?: string;
    label?: string;
    initialLoad?: boolean;
  }>(),
  {
    path: '',
    label: 'Files',
    initialLoad: false,
  },
);

// 3. Setup Hooks
const router = useRouter();
const route = useRoute();
const { refreshSignal } = useSocket();
const apiBase = getApiBase();

// 4. State
const folders = ref<FolderItem[]>([]);
const isLoading = ref(false);

// 5. Methods
const fetchFolders = async () => {
  isLoading.value = true;
  try {
    const res = await fetch(`${apiBase}/api/browse?path=${encodeURIComponent(props.path)}`);
    if (!res.ok) throw new Error('Network response was not ok');

    const data: FolderItem[] = await res.json();
    folders.value = data.filter((i) => i.isDirectory);
  } catch (e) {
    console.error('Failed to load folders', e);
  } finally {
    isLoading.value = false;
  }
};

const selectFolder = (folderPath: string) => {
  router.push(`/browse/${folderPath}`);
};

const deleteFolder = async (folderPath: string) => {
  if (!confirm(`Permanently delete "${folderPath}"?`)) return;

  try {
    const res = await fetch(`${apiBase}/api/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [folderPath] }),
    });

    const data = await res.json();
    if (data.success) {
      // Optimistic UI update
      const idx = folders.value.findIndex((i) => i.path === folderPath);
      if (idx !== -1) folders.value.splice(idx, 1);

      // Redirect if we are currently inside the deleted folder
      const currentPath = Array.isArray(route.params.path) ? route.params.path.join('/') : route.params.path || '';

      if (currentPath.startsWith(folderPath)) {
        router.push('/browse');
      }
    }
  } catch (err) {
    alert('Delete failed');
  }
};

const isActive = (folderPath: string): boolean => {
  if (!route.params.path) return false;

  const currentPath = Array.isArray(route.params.path) ? route.params.path.join('/') : route.params.path;

  return currentPath === folderPath || currentPath.startsWith(folderPath + '/');
};

// 6. Lifecycle & Watchers
watch(refreshSignal, fetchFolders);
onMounted(fetchFolders);
</script>

<style scoped>
.folder-item {
  transition: background-color 0.05s;
}

.folder-item:not(.active):hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.folder-item:hover .folder-delete {
  visibility: visible;
}
.folder-item .folder-delete {
  visibility: hidden;
}
</style>
