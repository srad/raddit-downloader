<template>
  <div class="settings-view container-fluid py-4">
    <div class="row">
      <div class="col-12">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div class="d-flex align-items-center gap-3">
            <button class="btn btn-outline-secondary d-flex align-items-center" @click="router.push('/')">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" class="me-2">
                <path fill-rule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"/>
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
                    <input class="form-check-input" type="checkbox" id="redownload_posts" v-model="config.redownload_posts">
                    <label class="form-check-label" for="redownload_posts">Redownload Already Downloaded Posts</label>
                  </div>
                  <div class="form-check form-switch mt-2">
                    <input class="form-check-input" type="checkbox" id="prevent_duplicates" v-model="config.prevent_duplicates">
                    <label class="form-check-label" for="prevent_duplicates">Prevent Duplicates (pHash)</label>
                  </div>
                  <div class="form-check form-switch mt-2">
                    <input class="form-check-input" type="checkbox" id="use_history_database" v-model="config.use_history_database">
                    <label class="form-check-label" for="use_history_database">Use History Database</label>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="download_comments" v-model="config.download_comments">
                    <label class="form-check-label" for="download_comments">Download Comments</label>
                  </div>
                  <div class="form-check form-switch mt-2">
                    <input class="form-check-input" type="checkbox" id="download_youtube_videos_experimental" v-model="config.download_youtube_videos_experimental">
                    <label class="form-check-label" for="download_youtube_videos_experimental">YouTube Support (Experimental)</label>
                  </div>
                </div>
              </div>

              <hr class="my-4">

              <div class="row g-3 align-items-center">
                <div class="col-auto">
                  <label for="duplicate_threshold" class="col-form-label">Duplicate Threshold:</label>
                </div>
                <div class="col-auto">
                  <input type="number" id="duplicate_threshold" class="form-control" v-model.number="config.duplicate_threshold">
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
                  <input type="number" id="rate_limit_delay_ms" class="form-control" v-model.number="config.rate_limit_delay_ms">
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
                <input class="form-check-input" type="checkbox" id="detailed_logs" v-model="config.detailed_logs">
                <label class="form-check-label" for="detailed_logs">Enable Detailed Logs</label>
              </div>
              <div class="form-check form-switch mt-2">
                <input class="form-check-input" type="checkbox" id="local_logs" v-model="config.local_logs">
                <label class="form-check-label" for="local_logs">Enable Local Log Files</label>
              </div>
              
              <div v-if="config.local_logs" class="mt-3 ps-4">
                <h6>Log Filename Scheme:</h6>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="l_showDate" v-model="config.local_logs_naming_scheme.showDateAndTime">
                  <label class="form-check-label" for="l_showDate">Date and Time</label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="l_showSubs" v-model="config.local_logs_naming_scheme.showSubreddits">
                  <label class="form-check-label" for="l_showSubs">Subreddits</label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="l_showNum" v-model="config.local_logs_naming_scheme.showNumberOfPosts">
                  <label class="form-check-label" for="l_showNum">Number of Posts</label>
                </div>
              </div>
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
import type { Config } from '../types';

const router = useRouter();
const apiBase = getApiBase();
const loading = ref(true);
const saving = ref(false);
const config = ref<Config>({} as Config);

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
      const errorMsg = data.details ? data.details.join('\n') : (data.error || 'Failed to save settings');
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

onMounted(fetchSettings);
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