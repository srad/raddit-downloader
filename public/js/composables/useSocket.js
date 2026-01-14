import { ref, reactive } from 'vue';

const socket = io();

const status = ref('idle');
const logs = reactive([]);
const refreshSignal = ref(0);
const progress = reactive({
    downloaded: 0,
    total: 0,
    percentage: 0
});

socket.on('status', (newStatus) => {
    status.value = newStatus;
    if (newStatus === 'idle') {
        progress.downloaded = 0;
        progress.total = 0;
        progress.percentage = 0;
    }
});

socket.on('refresh_files', () => {
    refreshSignal.value++;
});

socket.on('progress', (data) => {
    progress.downloaded = data.downloaded;
    progress.total = data.total;
    progress.percentage = data.total > 0 ? Math.round((data.downloaded / data.total) * 100) : 0;
});

socket.on('log', (data) => {
    logs.push({
        time: new Date().toLocaleTimeString(),
        message: data.message,
        isError: data.message.includes('ERROR') || data.detailed
    });
    // Keep log size manageable
    if (logs.length > 500) logs.shift();
});

export function useSocket() {
    return {
        socket,
        status,
        logs,
        refreshSignal,
        progress
    };
}
