<script setup lang="ts">
import { computed } from 'vue';

interface LogEntry {
  time: string;
  message: string;
  isError: boolean;
  detailed?: any;
}

const props = defineProps<{
  logs: LogEntry[];
  visible: boolean;
  limit?: number;
}>();

const displayLogs = computed(() => {
  if (!props.limit || props.limit <= 0) {
    return props.logs;
  }
  return props.logs.slice(-props.limit);
});

const getLogClass = (log: LogEntry) => {
  const msg = log.message.toUpperCase();
  if (log.isError || msg.includes('ERROR')) return 'log-error';
  if (msg.includes('WARNING')) return 'log-warning';
  if (msg.includes('DEBUG')) return 'log-debug';
  if (msg.includes('SUCCESS') || msg.includes('DONE')) return 'log-success';
  if (msg.includes('INFO')) return 'log-info';
  return 'log-default';
};
</script>

<template>
  <Transition name="slide-up">
    <div v-if="visible" class="logs-panel">
      <div v-for="(log, i) in displayLogs" :key="i" class="log-entry" :class="getLogClass(log)">
        <span class="log-time">[{{ log.time }}]</span>
        <span class="log-message">{{ log.message }}</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.logs-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 200px;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(10px);
  border-top: 1px solid #2a2a2a;
  overflow-y: auto;
  padding: 15px;
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.85rem;
  z-index: 100;
  box-shadow: 0 -5px 20px rgba(0, 0, 0, 0.5);
}

.log-entry {
  margin-bottom: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
  border-left: 3px solid transparent;
}

.log-time {
  opacity: 0.4;
  margin-right: 10px;
  font-variant-numeric: tabular-nums;
}

/* Log Levels */
.log-default { color: #ccc; border-left-color: #444; }
.log-info { color: #64b5f6; border-left-color: #2196f3; background: rgba(33, 150, 243, 0.05); }
.log-debug { color: #b0bec5; border-left-color: #607d8b; font-style: italic; }
.log-warning { color: #ffd54f; border-left-color: #ffc107; background: rgba(255, 193, 7, 0.05); }
.log-error { color: #ef5350; border-left-color: #f44336; background: rgba(244, 67, 54, 0.05); font-weight: 500; }
.log-success { color: #81c784; border-left-color: #4caf50; background: rgba(76, 175, 80, 0.05); }

/* Transition */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
