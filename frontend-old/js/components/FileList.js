import { ref, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useSocket } from '../composables/useSocket.js';

export default {
    name: 'FileList',
    props: {
        path: { type: String, default: '' },
        label: { type: String, default: 'Files' }, // Kept for prop compatibility
        initialLoad: { type: Boolean, default: false }
    },
    setup(props) {
        const router = useRouter();
        const route = useRoute();
        const { refreshSignal } = useSocket();
        
        const folders = ref([]);
        const isLoading = ref(false);

        const fetchFolders = async () => {
            isLoading.value = true;
            try {
                const res = await fetch(`/api/browse?path=${encodeURIComponent(props.path)}`);
                const data = await res.json();
                folders.value = data.filter(i => i.isDirectory);
            } catch (e) {
                console.error("Failed to load folders", e);
            } finally {
                isLoading.value = false;
            }
        };

        const selectFolder = (folderPath) => {
            router.push(`/browse/${folderPath}`);
        };

        const deleteFolder = async (e, folderPath) => {
            e.stopPropagation();
            if (!confirm(`Permanently delete "${folderPath}"?`)) return;

            try {
                const res = await fetch('/api/delete', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({files: [folderPath]})
                });
                const data = await res.json();
                if (data.success) {
                    const idx = folders.value.findIndex(i => i.path === folderPath);
                    if (idx !== -1) folders.value.splice(idx, 1);
                    
                    if (route.params.path && route.params.path.startsWith(folderPath)) {
                        router.push('/browse');
                    }
                }
            } catch (err) {
                alert('Delete failed');
            }
        };

        watch(refreshSignal, fetchFolders);
        onMounted(fetchFolders);

        // Check if a folder is active (including sub-paths if necessary, though this is a flat list)
        const isActive = (folderPath) => {
            if (!route.params.path) return false;
            // Handle array or string param
            const currentPath = Array.isArray(route.params.path) ? route.params.path.join('/') : route.params.path;
            return currentPath === folderPath || currentPath.startsWith(folderPath + '/');
        };

        return {
            folders,
            isLoading,
            selectFolder,
            deleteFolder,
            isActive
        };
    },
    template: `
        <div class="file-list">
            <div v-if="isLoading" style="padding:10px; color:#666;">Loading...</div>
            <div v-else-if="folders.length === 0" style="padding:10px; color:#999; font-style:italic;">No folders</div>
            
            <div v-for="folder in folders" 
                 :key="folder.path" 
                 class="folder-item"
                 :class="{ active: isActive(folder.path) }" 
                 @click="selectFolder(folder.path)">
                
                <span class="folder-label">{{ folder.name }} ({{ folder.fileCount }})</span>
                <span class="folder-delete" @click="deleteFolder($event, folder.path)" title="Delete Folder">&times;</span>
            </div>
        </div>
    `
}
