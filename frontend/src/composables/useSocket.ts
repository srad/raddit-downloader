import { reactive, ref } from 'vue';
import { io, Socket } from 'socket.io-client';
import { getApiBase } from '../utils/config';

// 1. Define Types
interface LogEntry {
  time: string;
  message: string;
  isError: boolean;
  detailed?: any;
}

interface ProgressState {
  downloaded: number;
  total: number;
  percentage: number;
  status?: string;
}

interface ProgressData {
  downloaded: number;
  total: number;
}

interface LogData {
  message: string;
  detailed?: boolean | any;
}

// 2. Global State (Singleton pattern)
// This ensures state is shared across all components using this composable
let socket: Socket | null = null;

const status = ref<string>('idle');
const logs = reactive<LogEntry[]>([]);
const refreshSignal = ref<number>(0);
const progress = reactive<ProgressState>({
  downloaded: 0,
  total: 0,
  percentage: 0,
});

let listenersSetup = false;

// 3. Helper to initialize socket
const initSocket = () => {
  if (!socket) {
    const url = getApiBase();
    socket = url ? io(url) : io();
  }
  return socket;
};

// 4. Listeners Logic
const setupListeners = () => {
  const sock = initSocket();
  if (!sock || listenersSetup) return;

  listenersSetup = true;

  sock.on('status', (newStatus: string) => {
    status.value = newStatus;
    if (newStatus === 'idle') {
      progress.downloaded = 0;
      progress.total = 0;
      progress.percentage = 0;
    }
  });

  sock.on('refresh_files', () => {
    refreshSignal.value++;
  });

  sock.on('progress', (data: ProgressData) => {
    progress.downloaded = data.downloaded;
    progress.total = data.total;
    progress.percentage = data.total > 0 ? Math.round((data.downloaded / data.total) * 100) : 0;
  });

  sock.on('log', (data: LogData) => {
    logs.push({
      time: new Date().toLocaleTimeString(),
      message: data.message,
      isError: data.message.includes('ERROR') || !!data.detailed,
      detailed: data.detailed,
    });
    // Keep the log size manageable
    if (logs.length > 500) logs.shift();
  });
};

// 5. Export Composable
export function useSocket() {
  setupListeners();

  return {
    socket: initSocket(),
    status,
    logs,
    refreshSignal,
    progress,
  };
}
