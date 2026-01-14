import { computed, ref, onMounted, onUnmounted, watch } from 'vue';

export default {
    name: 'Lightbox',
    props: {
        items: { type: Array, required: true },
        index: { type: Number, required: true },
        isOpen: { type: Boolean, default: false }
    },
    emits: ['close', 'update:index'],
    setup(props, { emit }) {
        const containerRef = ref(null);
        const resolution = ref('');

        const currentItem = computed(() => {
            if (props.index < 0 || props.index >= props.items.length) return null;
            return props.items[props.index];
        });

        const currentUrl = computed(() => currentItem.value ? `/downloads/${currentItem.value.path}` : '');
        
        const isVideo = computed(() => {
            if (!currentItem.value) return false;
            const ext = currentItem.value.name.split('.').pop().toLowerCase();
            return ['mp4', 'webm', 'gifv'].includes(ext);
        });

        const formatSize = (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        const close = () => emit('close');
        
        const next = () => {
            if (props.index < props.items.length - 1) {
                emit('update:index', props.index + 1);
            }
        };
        
        const prev = () => {
            if (props.index > 0) {
                emit('update:index', props.index - 1);
            }
        };

        const onMediaLoad = (e) => {
            const el = e.target;
            if (isVideo.value) {
                resolution.value = `${el.videoWidth} x ${el.videoHeight}`;
            } else {
                resolution.value = `${el.naturalWidth} x ${el.naturalHeight}`;
            }
        };

        const handleKey = (e) => {
            if (!props.isOpen) return;
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowRight') next();
            if (e.key === 'ArrowLeft') prev();
        };

        onMounted(() => window.addEventListener('keydown', handleKey));
        onUnmounted(() => window.removeEventListener('keydown', handleKey));

        watch(() => props.index, () => {
            resolution.value = '...';
        });

        return {
            currentItem,
            currentUrl,
            isVideo,
            close,
            next,
            prev,
            formatSize,
            onMediaLoad,
            resolution
        };
    },
    template: `
        <div v-if="isOpen" class="lightbox active">
            <span class="lightbox-close" @click="close">×</span>
            <div class="lightbox-nav lightbox-prev" @click="prev" v-if="index > 0">&#10094;</div>
            <div class="lightbox-nav lightbox-next" @click="next" v-if="index < items.length - 1">&#10095;</div>

            <div id="lightbox-container" style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
                <video 
                    v-if="isVideo" 
                    :src="currentUrl" 
                    controls 
                    autoplay 
                    class="lightbox-content"
                    @loadedmetadata="onMediaLoad"
                ></video>
                <img 
                    v-else 
                    :src="currentUrl" 
                    class="lightbox-content" 
                    @load="onMediaLoad"
                >
            </div>

            <div v-if="currentItem" id="lightbox-info" class="lightbox-info" style="display: flex;">
                <div><span class="info-label">File:</span> {{ currentItem.path }}</div>
                <div class="info-group">
                    <div><span class="info-label">Size:</span> {{ formatSize(currentItem.size) }}</div>
                    <div><span class="info-label">Res:</span> {{ resolution }}</div>
                </div>
            </div>
        </div>
    `
}
