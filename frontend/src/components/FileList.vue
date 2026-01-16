<template>
  <div class="file-list">
    <div v-if="isLoading" class="p-3 text-muted small fst-italic">Loading...</div>
    <div v-else-if="folders.length === 0" class="p-3 text-muted small fst-italic">No folders</div>
    
    <div v-for="folder in folders" 
         :key="folder.path" 
         class="folder-item"
         :class="{ active: isActive(folder.path) }" 
         @click="selectFolder(folder.path)">
        <span class="folder-label text-truncate">{{ folder.filename }} ({{ folder.fileCount }})</span>
        <span class="folder-delete" @click.stop="deleteFolder(folder.path)" title="Delete Folder">&times;</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSocket } from '../composables/useSocket';
import { getApiBase } from '../utils/config';

interface FolderItem {
  filename: string;
  path: string;
  isDirectory: boolean;
  fileCount: number;
}

const props = defineProps<{
  path: string;
  label?: string;
  initialLoad?: boolean;
}>();

const router = useRouter();
const route = useRoute();
const { refreshSignal, socket } = useSocket();
const apiBase = getApiBase();

const folders = ref<FolderItem[]>([]);
const isLoading = ref(false);

// Listen for new items to update folder counts
if (socket) {
  socket.on('new_item', (item: any) => {
    // item.path is "r_pics/image.jpg"
    const lastSlashIndex = item.path.lastIndexOf('/');
    const itemDir = lastSlashIndex !== -1 ? item.path.substring(0, lastSlashIndex) : '';
    
    const folder = folders.value.find(f => f.path === itemDir);
    if (folder) {
      folder.fileCount++;
    }
  });

  socket.on('new_folder', (folder: FolderItem) => {
    // folder.path is "r_pics"
    // props.path is "" (for root)
    const lastSlashIndex = folder.path.lastIndexOf('/');
    const parentDir = lastSlashIndex !== -1 ? folder.path.substring(0, lastSlashIndex) : '';
    
    if (parentDir === props.path) {
      const exists = folders.value.some(f => f.path === folder.path);
      if (!exists) {
        folders.value.push(folder);
        // Sort folders alphabetically
        folders.value.sort((a, b) => a.filename.localeCompare(b.filename));
      }
    }
  });
}

const fetchFolders = async () => {
  isLoading.value = true;
  try {
    const res = await fetch(`${apiBase}/api/browse?path=${encodeURIComponent(props.path)}`);
    if (!res.ok) throw new Error('Network response not ok');
    const data: FolderItem[] = await res.json();
    folders.value = data.filter((i) => i.isDirectory);
  } catch (e) { console.error(e); } finally { isLoading.value = false; }
};

const selectFolder = (path: string) => router.push(`/browse/${path}`);

const deleteFolder = async (folderPath: string) => {
  if (!confirm(`Permanently delete "${folderPath}"?`)) return;
  try {
    const res = await fetch(`${apiBase}/api/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [folderPath] }),
    });
    if ((await res.json()).success) {
      folders.value = folders.value.filter(f => f.path !== folderPath);
      const current = Array.isArray(route.params.path) ? route.params.path.join('/') : route.params.path;
      if (current && current.startsWith(folderPath)) router.push('/browse');
    }
  } catch (err) { alert('Delete failed'); }
};

const isActive = (path: string) => {
  const current = Array.isArray(route.params.path) ? route.params.path.join('/') : route.params.path;
  return current === path || (current && current.startsWith(path + '/'));
};

watch(refreshSignal, fetchFolders);
onMounted(fetchFolders);
</script>

<style scoped>
.folder-delete {
    margin-left: auto;
    color: #ff4444;
    opacity: 0;
    transition: opacity 0.2s;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 1.1rem;
    line-height: 1;
}
.folder-item:hover .folder-delete { opacity: 1; }
.folder-delete:hover { background: rgba(255, 68, 68, 0.2); }
</style>
