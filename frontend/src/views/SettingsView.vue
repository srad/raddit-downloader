<template>
  <div class="settings-view container-fluid py-4">
    <div class="row">
      <div class="col-12">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div class="d-flex align-items-center gap-3">
            <button class="btn btn-outline-secondary d-flex align-items-center" @click="router.push('/')">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" class="me-2">
                <path
                  fill-rule="evenodd"
                  d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"
                />
              </svg>
              Back
            </button>
            <h2 class="mb-0">Settings</h2>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-outline-secondary" @click="resetToDefault">Reset to Default</button>
            <button class="btn btn-primary" @click="saveSettings" :disabled="saving">
              <span v-if="saving" class="spinner-border spinner-border-sm me-2"></span>
              Save Settings
            </button>
          </div>
        </div>

        <div v-if="loading" class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>

        <div v-else class="settings-form">
          <!-- Download Options -->
          <div class="card mb-4">
            <div class="card-header">
              <h5 class="mb-0">Download Options</h5>
            </div>
            <div class="card-body">
              <div class="row g-3">
                <div class="col-md-6">
                  <div class="form-check form-switch">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="redownload_posts"
                      v-model="config.redownload_posts"
                    />
                    <label class="form-check-label" for="redownload_posts">Redownload Already Downloaded Posts</label>
                  </div>
                  <div class="form-check form-switch mt-2">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="prevent_duplicates"
                      v-model="config.prevent_duplicates"
                    />
                    <label class="form-check-label" for="prevent_duplicates">Prevent Duplicates (pHash)</label>
                  </div>
                  <div class="form-check form-switch mt-2">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="use_history_database"
                      v-model="config.use_history_database"
                    />
                    <label class="form-check-label" for="use_history_database">Use History Database</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="form-check form-switch">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="download_comments"
                      v-model="config.download_comments"
                    />
                    <label class="form-check-label" for="download_comments">Download Comments</label>
                  </div>
                  <div class="form-check form-switch mt-2">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="download_youtube_videos_experimental"
                      v-model="config.download_youtube_videos_experimental"
                    />
                    <label class="form-check-label" for="download_youtube_videos_experimental"
                      >YouTube Support (Experimental)</label
                    >
                  </div>
                </div>
              </div>

              <hr class="my-4" />

              <div class="row g-3 align-items-center">
                <div class="col-auto">
                  <label for="duplicate_threshold" class="col-form-label">Duplicate Threshold:</label>
                </div>
                <div class="col-auto">
                  <input
                    type="number"
                    id="duplicate_threshold"
                    class="form-control"
                    v-model.number="config.duplicate_threshold"
                  />
                </div>
                <div class="col-auto">
                  <span class="form-text">Lower is stricter. Default: 5.</span>
                </div>
              </div>

              <div class="row g-3 align-items-center mt-2">
                <div class="col-auto">
                  <label for="rate_limit_delay_ms" class="col-form-label">API Request Delay (ms):</label>
                </div>
                <div class="col-auto">
                  <input
                    type="number"
                    id="rate_limit_delay_ms"
                    class="form-control"
                    v-model.number="config.rate_limit_delay_ms"
                  />
                </div>
                <div class="col-auto">
                  <span class="form-text">Minimum: 100ms. Default: 2000ms.</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Logging -->
          <div class="card mb-4">
            <div class="card-header">
              <h5 class="mb-0">Logging</h5>
            </div>
            <div class="card-body">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="detailed_logs" v-model="config.detailed_logs" />
                <label class="form-check-label" for="detailed_logs">Enable Detailed Logs</label>
              </div>
              <div class="form-check form-switch mt-2">
                <input class="form-check-input" type="checkbox" id="local_logs" v-model="config.local_logs" />
                <label class="form-check-label" for="local_logs">Enable Local Log Files</label>
              </div>

              <div v-if="config.local_logs" class="mt-3 ps-4">
                <h6>Log Filename Scheme:</h6>
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="l_showDate"
                    v-model="config.local_logs_naming_scheme.showDateAndTime"
                  />
                  <label class="form-check-label" for="l_showDate">Date and Time</label>
                </div>
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="l_showSubs"
                    v-model="config.local_logs_naming_scheme.showSubreddits"
                  />
                  <label class="form-check-label" for="l_showSubs">Subreddits</label>
                </div>
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="l_showNum"
                    v-model="config.local_logs_naming_scheme.showNumberOfPosts"
                  />
                  <label class="form-check-label" for="l_showNum">Number of Posts</label>
                </div>
              </div>
            </div>
          </div>

          <!-- Library Maintenance -->
          <div class="card mb-4">
            <div class="card-header">
              <h5 class="mb-0">Library Maintenance</h5>
            </div>
            <div class="card-body">
              <h6>Re-hash Perceptual Hashes</h6>
              <p class="text-muted small">
                If you have recently updated the application and duplicate detection accuracy is low, you may need to
                re-generate the perceptual hashes for your entire library.
                <strong>Warning:</strong> This will clear all existing similarity data and re-scan every file.
              </p>

              <div v-if="phashProgress.show" class="mb-3">
                <div class="d-flex justify-content-between mb-1 small">
                  <span>{{ phashProgress.status === 'completed' ? '✓ Re-hash Complete' : 'Re-hashing...' }}</span>
                  <span>{{ phashProgress.processed }} / {{ phashProgress.total }}</span>
                </div>
                <div class="progress" style="height: 10px">
                  <div
                    class="progress-bar progress-bar-striped progress-bar-animated"
                    :class="{ 'bg-success': phashProgress.status === 'completed' }"
                    role="progressbar"
                    :style="{
                      width:
                        (phashProgress.total > 0 ? (phashProgress.processed / phashProgress.total) * 100 : 0) + '%',
                    }"
                  ></div>
                </div>
              </div>

              <button
                class="btn btn-warning btn-sm"
                @click="rehashAll"
                :disabled="phashProgress.show && phashProgress.status !== 'completed'"
              >
                {{
                  phashProgress.show && phashProgress.status !== 'completed'
                    ? 'Re-hash in progress...'
                    : 'Start Full Re-hash'
                }}
              </button>

              <hr class="my-4" />

              <h6>Synchronize Library</h6>
              <p class="text-muted small">
                If the file counts in your folders don't match the statistics at the top, your database may be out of
                sync. This will scan your downloads folder and add any missing files to the database.
              </p>

              <div v-if="syncProgress.show" class="mb-3">
                <div class="d-flex justify-content-between mb-1 small">
                  <span>{{
                    syncProgress.status === 'completed' ? '✓ Synchronization Complete' : 'Synchronizing...'
                  }}</span>
                  <span>{{ syncProgress.processed }} / {{ syncProgress.total }}</span>
                </div>
                <div class="progress" style="height: 10px">
                  <div
                    class="progress-bar progress-bar-striped progress-bar-animated bg-info"
                    :class="{ 'bg-success': syncProgress.status === 'completed' }"
                    role="progressbar"
                    :style="{
                      width: (syncProgress.total > 0 ? (syncProgress.processed / syncProgress.total) * 100 : 0) + '%',
                    }"
                  ></div>
                </div>
                <div class="mt-1 small text-muted" v-if="syncProgress.status !== 'completed'">
                  Indexed {{ syncProgress.indexed }} new files...
                </div>
              </div>

              <button
                class="btn btn-info btn-sm text-white"
                @click="syncLibrary"
                :disabled="syncProgress.show && syncProgress.status !== 'completed'"
              >
                {{
                  syncProgress.show && syncProgress.status !== 'completed'
                    ? 'Sync in progress...'
                    : 'Synchronize Database'
                }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getApiBase } from '../utils/config';
import { useSocket } from '../composables/useSocket';
import type { Config } from '../types';

const router = useRouter();
const apiBase = getApiBase();
const { socket } = useSocket();
const loading = ref(true);
const saving = ref(false);
const config = ref<Config>({} as Config);

const phashProgress = ref({
  show: false,
  status: '',
  processed: 0,
  total: 0,
});

const syncProgress = ref({
  show: false,
  status: '',
  processed: 0,
  total: 0,
  indexed: 0,
});

const fetchSettings = async () => {
  try {
    loading.value = true;
    const res = await fetch(`${apiBase}/api/settings`);
    if (res.ok) {
      config.value = await res.json();
    }
  } catch (e) {
    console.error('Failed to fetch settings:', e);
  } finally {
    loading.value = false;
  }
};

const saveSettings = async () => {
  try {
    saving.value = true;
    const res = await fetch(`${apiBase}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config.value),
    });

    const data = await res.json();

    if (res.ok) {
      if (data.warnings && data.warnings.length > 0) {
        alert('Settings saved with warnings:\n' + data.warnings.join('\n'));
      } else {
        alert('Settings saved successfully!');
      }
    } else {
      const errorMsg = data.details ? data.details.join('\n') : data.error || 'Failed to save settings';
      alert('Error saving settings:\n' + errorMsg);
    }
  } catch (e) {
    console.error('Failed to save settings:', e);
    alert('Error saving settings');
  } finally {
    saving.value = false;
  }
};

const resetToDefault = () => {
  if (confirm('Are you sure you want to reset all settings to default?')) {
    fetchSettings();
  }
};

const rehashAll = async () => {
  if (
    confirm(
      'This will delete all existing similarity data and re-scan your entire library. This may take a long time. Continue?',
    )
  ) {
    return;
  }

  try {
    const res = await fetch(`${apiBase}/api/duplicates/rehash-all`, { method: 'POST' });
    if (res.ok) {
      phashProgress.value.show = true;
      phashProgress.value.status = 'processing';
    } else {
      alert('Failed to start re-hash process');
    }
  } catch (e) {
    console.error(e);
    alert('Error starting re-hash');
  }
};

const syncLibrary = async () => {
  try {
    const res = await fetch(`${apiBase}/api/maintenance/sync-library`, { method: 'POST' });
    const data = await res.json();

    if (res.ok) {
      if (data.status === 'completed' && data.total === 0) {
        alert(data.message);
      } else {
        syncProgress.value.show = true;
        syncProgress.value.status = 'processing';
      }
    } else {
      alert('Failed to start synchronization');
    }
  } catch (e) {
    console.error(e);
    alert('Error starting synchronization');
  }
};

onMounted(() => {
  fetchSettings();

  if (socket) {
    socket.on('phash_generation', (data: any) => {
      phashProgress.value.show = true;
      phashProgress.value.processed = data.processed;
      phashProgress.value.total = data.total;
      phashProgress.value.status = data.status;

      if (data.status === 'completed') {
        setTimeout(() => {
          phashProgress.value.show = false;
        }, 5000);
      }
    });

    socket.on('library_sync_progress', (data: any) => {
      syncProgress.value.show = true;
      syncProgress.value.processed = data.processed;
      syncProgress.value.total = data.total;
      syncProgress.value.indexed = data.indexed;
      syncProgress.value.status = data.status;

      if (data.status === 'completed') {
        setTimeout(() => {
          syncProgress.value.show = false;
        }, 5000);
      }
    });
  }
});
</script>

<style scoped>
.settings-view {
  height: 100%;
  overflow-y: auto;
}

.card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
}

.card-header {
  background-color: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid var(--border-color);
}
</style>
