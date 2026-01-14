import { ref, reactive } from 'vue';

const socket = io();

const status = ref('idle');
const logs = reactive([]);
const refreshSignal = ref(0);

socket.on('status', (newStatus) => {
    status.value = newStatus;
});

socket.on('refresh_files', () => {
    refreshSignal.value++;
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
        refreshSignal
    };
}
