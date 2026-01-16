import { computed } from 'vue';

export default {
    name: 'ProgressBar',
    props: {
        current: {
            type: Number,
            required: true,
            default: 0
        },
        total: {
            type: Number,
            required: true,
            default: 0
        }
    },
    setup(props) {
        const percentage = computed(() => {
            if (props.total <= 0) return 0;
            return Math.round((props.current / props.total) * 100);
        });

        return {
            percentage
        };
    },
    template: `
        <div class="progress-bar-container">
             <div class="progress-bar-fill" :style="{ width: percentage + '%' }"></div>
             <span class="progress-text">{{ current }} / {{ total }} posts ({{ percentage }}%)</span>
        </div>
    `
}
