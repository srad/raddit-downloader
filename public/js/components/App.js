import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import FileTree from './FileTree.js';
import { useSocket } from '../composables/useSocket.js';

export default {
    name: 'App',
    components: { FileTree },
    setup() {
        const { socket, status, logs } = useSocket();
        
        // Form State
        const subreddit = ref('');
        const sorting = ref('new');
        const time = ref('all');
        const limit = ref(0); // number input defaults to 0
        const history = ref([]);
        
        // UI State
        const logsVisible = ref(false);
        const optionsOpen = ref(false);
        const version = ref(window.appVersion || '1.0.0');

        const isRunning = computed(() => status.value === 'running');

        // Load History
        onMounted(async () => {
            try {
                const res = await fetch('/api/history');
                history.value = await res.json();
            } catch(e) { console.error(e); }
        });

        const startDownload = async () => {
            if (!subreddit.value) return;
            try {
                await fetch('/api/start', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        subreddit: subreddit.value,
                        sorting: sorting.value,
                        time: time.value,
                        limit: limit.value
                    })
                });
            } catch (e) { alert('Failed to start'); }
        };

        const stopDownload = async () => {
            try {
                await fetch('/api/stop', { method: 'POST' });
            } catch(e) {}
        };

        return {
            status, logs, logsVisible, optionsOpen, version,
            subreddit, sorting, time, limit, history,
            isRunning,
            startDownload, stopDownload
        };
    },
    template: `
        <!-- Header -->
        <div class="header">
            <div class="header-top">
                <div class="logo">
                    <span>Raddit Downloader</span>
                    <span class="logo-version">v{{ version }}</span>
                </div>
                <div class="header-actions">
                    <button class="btn btn-secondary" @click="logsVisible = !logsVisible">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"
                             style="vertical-align: -2px; margin-right: 6px;">
                            <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/>
                            <path d="M3 4.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5z"/>
                        </svg>
                        Logs
                    </button>
                </div>
            </div>

            <form class="search-container" @submit.prevent="startDownload">
                <div class="main-input-group">
                    <input list="history-list" v-model="subreddit" placeholder="Enter subreddit or u/username..." required :disabled="isRunning">
                    <datalist id="history-list">
                        <option v-for="h in history" :value="h"></option>
                    </datalist>
                    
                    <button v-if="!isRunning" type="submit" class="btn">
                        <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16" style="vertical-align: -3px; margin-right: 6px;">
                            <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                            <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                        </svg>
                        Download
                    </button>
                    
                    <button v-else type="button" class="btn btn-stop" @click="stopDownload">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="vertical-align: -2px; margin-right: 6px;">
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                        </svg>
                        Stop
                    </button>
                </div>

                <div class="options-toggle" :class="{ open: optionsOpen }" @click="optionsOpen = !optionsOpen">
                    <svg fill="currentColor" viewBox="0 0 16 16">
                        <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                    </svg>
                    <span>Advanced Options</span>
                </div>

                <div class="options-row" :class="{ open: optionsOpen }">
                    <div class="input-group">
                        <label class="input-label">Sort By</label>
                        <select v-model="sorting">
                            <option value="top">Top</option>
                            <option value="hot">Hot</option>
                            <option value="new">New</option>
                            <option value="rising">Rising</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label class="input-label">Time Period</label>
                        <select v-model="time">
                            <option value="all">All Time</option>
                            <option value="month">This Month</option>
                            <option value="year">This Year</option>
                            <option value="week">This Week</option>
                            <option value="day">Today</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label class="input-label">Post Limit</label>
                        <div class="input-wrapper">
                            <input type="number" v-model.number="limit" min="0" placeholder="50">
                            <div class="input-hint">0 for unlimited</div>
                        </div>
                    </div>
                </div>
            </form>
        </div>

        <!-- Main App -->
        <div class="app-container">
            <!-- Sidebar -->
            <div class="sidebar">
                <div class="sidebar-header">FILES</div>
                <div class="file-tree">
                    <!-- Root File Tree -->
                    <file-tree path="" label="Downloads" :initial-load="true"></file-tree>
                </div>
            </div>

            <!-- Main Content -->
            <div class="main-content">
                <router-view></router-view>
                
                <div class="logs-panel" :class="{ visible: logsVisible }">
                    <div v-for="(log, i) in logs" :key="i" class="log-entry" :class="{ 'log-error': log.isError }">
                        [{{ log.time }}] {{ log.message }}
                    </div>
                </div>
            </div>
        </div>
    `
}
