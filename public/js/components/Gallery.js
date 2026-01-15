import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useInfiniteScroll, useDebounceFn } from '@vueuse/core';
import Lightbox from './Lightbox.js';
import { useSocket } from '../composables/useSocket.js';

export default {
    name: 'Gallery',
    components: { Lightbox },
    setup() {
        const route = useRoute();
        const { refreshSignal } = useSocket();
        const allItems = ref([]);
        const loading = ref(false);
        const filterText = ref('');
        const filterType = ref('all');
        const selectedItems = ref(new Set());
        
        // Lightbox state
        const lightboxOpen = ref(false);
        const lightboxIndex = ref(-1);

        // Infinite scroll state
        const visibleLimit = ref(50);
        const scrollContainer = ref(null);
        const isLoadingMore = ref(false);

        // Hover state for videos
        const hoveringPath = ref(null);

        const currentPath = computed(() => {
            if (!route.params.path) return '';
            return Array.isArray(route.params.path) ? route.params.path.join('/') : route.params.path;
        });

        const filteredItems = computed(() => {
            return allItems.value.filter(item => {
                const ext = item.name.split('.').pop().toLowerCase();
                const isVideo = ['mp4', 'webm', 'gifv'].includes(ext);

                if (filterType.value === 'image' && isVideo) return false;
                if (filterType.value === 'video' && !isVideo) return false;
                if (filterText.value && !item.name.toLowerCase().includes(filterText.value.toLowerCase())) return false;
                return true;
            });
        });

        const visibleItems = computed(() => {
            return filteredItems.value.slice(0, visibleLimit.value);
        });

        const loadMore = async () => {
            if (isLoadingMore.value) return;
            if (visibleLimit.value >= filteredItems.value.length) return;
            
            isLoadingMore.value = true;
            await new Promise(r => setTimeout(r, 50));
            visibleLimit.value += 50;
            await nextTick();
            isLoadingMore.value = false;
        };

        const checkFill = async (attempt = 0) => {
            if (attempt > 10) return; // Safety break
            await nextTick();
            if (!scrollContainer.value) return;
            
            if (visibleLimit.value >= filteredItems.value.length) return;

            // If no scrollbar and we have more items, load more
            if (scrollContainer.value.scrollHeight <= scrollContainer.value.clientHeight) {
                await loadMore();
                await new Promise(r => setTimeout(r, 50)); // Allow layout to update
                checkFill(attempt + 1);
            }
        };

        const fetchFiles = async () => {
            // If already loading, we might want to skip or queue, but for now just let it run
            loading.value = true;
            // Don't clear selection on background refresh
            // selectedItems.value.clear(); 
            
            // Only reset limit if we are changing paths, not on refresh
            // visibleLimit.value = 50; 
            
            try {
                const p = currentPath.value;
                const res = await fetch(`/api/browse?path=${encodeURIComponent(p)}`);
                const data = await res.json();
                allItems.value = data.filter(i => !i.isDirectory);
            } catch (e) {
                console.error(e);
            } finally {
                loading.value = false;
                checkFill();
            }
        };

        // Debounced fetch for refresh signals
        const debouncedFetch = useDebounceFn(() => {
            fetchFiles();
        }, 1000);

        // Initial load and path change - immediate
        watch(currentPath, () => {
             selectedItems.value.clear();
             visibleLimit.value = 50;
             if (scrollContainer.value) scrollContainer.value.scrollTop = 0;
             fetchFiles();
        }, { immediate: true });

        // Socket signal - debounced
        watch(refreshSignal, debouncedFetch);
        
        watch([filterText, filterType], async () => {
            visibleLimit.value = 50;
            if (scrollContainer.value) scrollContainer.value.scrollTop = 0;
            checkFill();
        });

        // Use VueUse infinite scroll
        useInfiniteScroll(
            scrollContainer,
            () => { loadMore(); },
            { distance: 400 }
        );

        const toggleSelect = (path) => {
            if (selectedItems.value.has(path)) {
                selectedItems.value.delete(path);
            } else {
                selectedItems.value.add(path);
            }
        };

        const deleteSelected = async () => {
            if (!confirm(`Delete ${selectedItems.value.size} items?`)) return;
            try {
                await fetch('/api/delete', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({files: Array.from(selectedItems.value)})
                });
                await fetchFiles();
                selectedItems.value.clear();
            } catch (err) {
                alert('Delete failed');
            }
        };

        const openLightbox = (index) => {
            lightboxIndex.value = index;
            lightboxOpen.value = true;
        };

        const isVideo = (name) => ['mp4', 'webm', 'gifv'].includes(name.split('.').pop().toLowerCase());
        const isGif = (name) => name.toLowerCase().endsWith('.gif');

        return {
            currentPath,
            allItems,
            filteredItems,
            visibleItems,
            loading,
            filterText,
            filterType,
            selectedItems,
            toggleSelect,
            deleteSelected,
            lightboxOpen,
            lightboxIndex,
            openLightbox,
            isVideo,
            isGif,
            scrollContainer,
            hoveringPath
        };
    },
    template: `
        <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;">
            <div class="gallery-toolbar">
                <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
                    <div id="current-path" style="font-weight: bold; min-width: 50px;">/{{ currentPath }}</div>
                    <div style="display: flex; gap: 8px; flex: 1; max-width: 400px;">
                        <input type="text" v-model="filterText" placeholder="Filter files..."
                               style="padding: 4px 8px; font-size: 0.85rem; height: 30px;">
                        <select v-model="filterType"
                                style="width: auto; padding: 4px 8px; font-size: 0.85rem; height: 30px;">
                            <option value="all">All Types</option>
                            <option value="image">Images</option>
                            <option value="video">Videos</option>
                        </select>
                    </div>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <span v-if="selectedItems.size > 0" style="color: var(--primary);">
                        {{ selectedItems.size }} selected
                    </span>
                    <button v-if="selectedItems.size > 0" class="btn btn-danger" 
                            style="padding: 4px 10px; font-size: 0.8rem;" 
                            @click="deleteSelected">Delete
                    </button>
                </div>
            </div>

            <div class="gallery-grid" id="gallery-grid" ref="scrollContainer">
                <div v-if="loading && allItems.length === 0" style="grid-column: 1/-1; text-align: center; margin-top: 50px;">Loading...</div>
                <div v-else-if="filteredItems.length === 0" style="color:#666; grid-column: 1/-1; text-align: center; margin-top: 50px;">
                    {{ allItems.length === 0 ? 'Folder is empty' : 'No files match filter' }}
                </div>

                <div v-for="(item, index) in visibleItems" :key="item.path"
                     class="gallery-item"
                     :class="{ selected: selectedItems.has(item.path) }"
                     @click="openLightbox(index)"
                     @mouseenter="hoveringPath = item.path"
                     @mouseleave="hoveringPath = null">

                    <input type="checkbox" class="item-checkbox"
                           :checked="selectedItems.has(item.path)"
                           @click.stop="toggleSelect(item.path)">

                    <!-- Thumbnail available - use it for better performance -->
                    <template v-if="item.thumbnail">
                        <img :src="'/thumbnails/' + item.thumbnail" loading="lazy"
                             style="width: 100%; height: 100%; object-fit: cover;">

                        <!-- Video overlay indicator -->
                        <div v-if="isVideo(item.name)" class="video-overlay">
                            <svg width="48" height="48" fill="white" viewBox="0 0 16 16" style="opacity: 0.9;">
                                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
                            </svg>
                        </div>
                        <span v-if="isVideo(item.name)" class="gallery-item-info" style="background-color: mediumseagreen">
                            {{ item.name.split('.').pop() }}
                        </span>
                        <span v-else-if="isGif(item.name)" class="gallery-item-info" style="background-color: deepskyblue">Gif</span>
                    </template>

                    <!-- No thumbnail - fallback to old behavior -->
                    <template v-else>
                        <!-- Video Logic -->
                        <template v-if="isVideo(item.name)">
                             <video v-if="hoveringPath === item.path"
                                   :src="'/downloads/' + item.path"
                                   muted loop autoplay
                                   style="object-fit: contain; width: 100%; height: 100%; display: block;">
                            </video>
                            <div v-else class="video-placeholder" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #eee;">
                                <svg width="48" height="48" fill="#999" viewBox="0 0 16 16">
                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                    <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
                                </svg>
                            </div>
                            <span class="gallery-item-info" style="background-color: mediumseagreen">{{ item.name.split('.').pop() }}</span>
                        </template>

                        <template v-else-if="isGif(item.name)">
                            <img :src="'/downloads/' + item.path" class="hover-gif" loading="lazy">
                            <span class="gallery-item-info" style="background-color: deepskyblue">Gif</span>
                        </template>

                        <img v-else :src="'/downloads/' + item.path" loading="lazy">
                    </template>
                </div>
                
                <!-- Loading indicator -->
                <div v-if="visibleItems.length < filteredItems.length"
                     style="grid-column: 1 / -1; height: 50px; min-height: 50px; width: 100%; display: flex; justify-content: center; align-items: center; color: #666;">
                     Loading more...
                </div>
            </div>

            <lightbox 
                :isOpen="lightboxOpen" 
                :items="filteredItems" 
                v-model:index="lightboxIndex" 
                @close="lightboxOpen = false"
            ></lightbox>
        </div>
    `
}


