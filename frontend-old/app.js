// --- State ---
let currentPath = '';
let allItems = []; // Store all items in current folder
let galleryItems = []; // Store filtered items
let selectedItems = new Set();
let currentLightboxIndex = -1;
let logBuffer = [];
const MAX_LOGS = 200;

// Pagination / Lazy Load State
let visibleLimit = 50;
let observer = null;
const PAGE_SIZE = 50;
let lastRefresh = 0;

// --- File Tree Logic ---
const loadTree = async (pathStr, container) => {
    try {
        const items = await fetch(`/api/browse?path=${encodeURIComponent(pathStr)}`).then(r => r.json());
        container.innerHTML = '';

        if (items.length === 0 && pathStr === '') {
            container.innerHTML = '<div style="padding:10px; color:#666;">No downloads yet.</div>';
            return;
        }

        items.forEach(item => {
            // Only show directories in tree, files are shown in gallery
            if (!item.isDirectory) return; 

            const div = document.createElement('div');
            div.className = 'folder-item';
            div.title = item.name;

            // Text Node
            const label = document.createElement('span');
            // label.className = 'folder-label'; // Optional, or just inline
            label.textContent = `${item.name} (${item.fileCount})`;
            div.appendChild(label);

            // Delete Button
            const delBtn = document.createElement('span');
            delBtn.className = 'folder-delete';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Delete Folder';
            delBtn.onclick = (e) => deleteItem(e, item.path);
            div.appendChild(delBtn);

            div.onclick = async (e) => {
                if (e.target === delBtn) return;
                
                // Highlight active folder
                document.querySelectorAll('.folder-item').forEach(el => el.classList.remove('active'));
                div.classList.add('active');

                // Load into gallery
                await loadGallery(item.path);
            };

            container.appendChild(div);
        });
    } catch (e) {
        console.error("Tree load failed", e);
        container.innerHTML = '<div style="color:red; padding:10px;">Error loading folders</div>';
    }
};

const deleteItem = async (e, pathStr) => {
    e.stopPropagation();
    if (!confirm(`Permanently delete "${pathStr}"?`)) return;

    try {
        const res = await fetch('/api/delete', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({files: [pathStr]})
        });
        const data = await res.json();
        if (data.success) {
            loadTree('', document.getElementById('file-tree')); // Reload Root for simplicity
            if (currentPath.startsWith(pathStr)) {
                document.getElementById('gallery-grid').innerHTML = '';
                currentPath = '';
            }
        }
    } catch (err) {
        alert('Delete failed');
    }
};

// --- Gallery Logic ---
const loadGallery = async (pathStr) => {
    currentPath = pathStr;
    document.getElementById('current-path').textContent = '/' + pathStr;
    selectedItems.clear();
    updateToolbar();

    const items = await fetch(`/api/browse?path=${encodeURIComponent(pathStr)}`).then(r => r.json());
    allItems = items.filter(i => !i.isDirectory);

    await applyFilter();
};

const applyFilter = async () => {
    const filterType = document.getElementById('filter-type').value;
    const filterText = document.getElementById('filter-text').value.toLowerCase();

    galleryItems = allItems.filter(item => {
        const ext = item.name.split('.').pop().toLowerCase();
        const isVideo = ['mp4', 'webm', 'gifv'].includes(ext);

        // Type Filter
        if (filterType === 'image' && isVideo) return false;
        if (filterType === 'video' && !isVideo) return false;

        // Text Filter
        if (filterText && !item.name.toLowerCase().includes(filterText)) return false;

        return true;
    });

    // Reset pagination
    visibleLimit = PAGE_SIZE;
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = ''; // Clear existing
    grid.scrollTop = 0;

    await renderGalleryChunk();
};

// Render only a chunk of items
const renderGalleryChunk = async () => {
    const grid = document.getElementById('gallery-grid');
    
    if (galleryItems.length === 0) {
        const msg = allItems.length === 0 ? 'Folder is empty' : 'No files match filter';
        grid.innerHTML = `<div style="color:#666; grid-column: 1/-1; text-align: center; margin-top: 50px;">${msg}</div>`;
        return;
    }

    // Remove old sentinel if exists
    const oldSentinel = document.getElementById('scroll-sentinel');
    if (oldSentinel) oldSentinel.remove();

    // Calculate range to render
    // If grid is empty, render 0 to visibleLimit
    // If not empty, we are appending, so render from current children count to visibleLimit
    // But to be safe and simple, let's just determine startIndex based on what's already there?
    // Actually, simpler: clear grid if visibleLimit is PAGE_SIZE. Otherwise append.
    
    // However, existing items might be there.
    // Let's rely on galleryItems slice.
    
    // Count currently rendered items (excluding text nodes/sentinels)
    const renderedCount = grid.querySelectorAll('.gallery-item').length;
    const chunk = galleryItems.slice(renderedCount, visibleLimit);

    chunk.forEach((item, i) => {
        const index = renderedCount + i; // Global index
        const el = document.createElement('div');
        el.className = 'gallery-item';

        const ext = item.name.split('.').pop().toLowerCase();
        const isVideo = ['mp4', 'webm', 'gifv'].includes(ext);
        const isGif = url => url.toLowerCase().endsWith('.gif');
        const url = `/downloads/${item.path}`;
        const thumbnailUrl = item.thumbnail ? `/thumbnails/${item.thumbnail}` : null;

        let mediaEl = "";

        // Use thumbnail if available
        if (thumbnailUrl) {
            if (isVideo) {
                // Video with thumbnail - show thumbnail + play overlay
                mediaEl = `
                    <img src="${thumbnailUrl}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
                    <div class="video-overlay">
                        <svg width="48" height="48" fill="white" viewBox="0 0 16 16" style="opacity: 0.9;">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                            <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
                        </svg>
                    </div>
                    <span class="gallery-item-info" style="background-color: mediumseagreen">${ext}</span>
                `;
            } else if (isGif(url)) {
                // GIF with thumbnail
                mediaEl = `<img src="${thumbnailUrl}" loading="lazy" style="width:100%; height:100%; object-fit:cover;"><span class="gallery-item-info" style="background-color: deepskyblue">Gif</span>`;
            } else {
                // Image with thumbnail
                mediaEl = `<img src="${thumbnailUrl}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">`;
            }
        } else {
            // No thumbnail - fallback to old behavior
            if (isVideo) {
                // Video Placeholder Logic
                const placeholder = `
                    <div class="video-placeholder" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#eee;">
                        <svg width="48" height="48" fill="#999" viewBox="0 0 16 16">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                            <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
                        </svg>
                    </div>
                    <span class="gallery-item-info" style="background-color: mediumseagreen">${ext}</span>
                `;
                mediaEl = placeholder;

                // Mouse events for lazy video load
                el.onmouseenter = () => {
                    const container = el.querySelector('.video-placeholder');
                    if(container) {
                       el.dataset.savedHtml = container.outerHTML;
                       const v = document.createElement('video');
                       v.src = url;
                       v.muted = true;
                       v.loop = true;
                       v.autoplay = true;
                       v.style.width = '100%';
                       v.style.height = '100%';
                       v.style.objectFit = 'contain';
                       v.style.display = 'block';
                       container.replaceWith(v);
                    }
                };

                el.onmouseleave = () => {
                    const v = el.querySelector('video');
                    if(v && el.dataset.savedHtml) {
                        v.outerHTML = el.dataset.savedHtml;
                    }
                };
            } else if (isGif(url)) {
                mediaEl = `<img src="${url}" class="hover-gif" loading="lazy"><span class="gallery-item-info" style="background-color: deepskyblue">Gif</span>`;
            } else {
                mediaEl = `<img src="${url}" loading="lazy">`;
            }
        }

        el.innerHTML = `
                    <input type="checkbox" class="item-checkbox" onclick="toggleSelect(event, '${item.path}')">
                    ${mediaEl}
                `;

        if (selectedItems.has(item.path)) {
            el.classList.add('selected');
            el.querySelector('.item-checkbox').checked = true;
        }

        el.onclick = (e) => {
            if (e.target.type !== 'checkbox') openLightbox(index);
        };

        grid.appendChild(el);
    });
    
    // Apply GIF freezer only to the new chunk
    await gifFreezer();

    // Setup Infinite Scroll Sentinel
    if (visibleLimit < galleryItems.length) {
        const sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        sentinel.style.height = '50px';
        sentinel.style.gridColumn = '1 / -1';
        sentinel.style.textAlign = 'center';
        sentinel.textContent = 'Loading more...';
        grid.appendChild(sentinel);
        
        setupObserver(sentinel);
    }
};

const setupObserver = (sentinel) => {
    if (observer) observer.disconnect();
    
    observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            visibleLimit += PAGE_SIZE;
            renderGalleryChunk();
        }
    }, { root: document.getElementById('gallery-grid'), threshold: 0.1 });
    
    observer.observe(sentinel);
};


const toggleSelect = (e, path) => {
    e.stopPropagation();
    if (selectedItems.has(path)) selectedItems.delete(path); else selectedItems.add(path);

    e.target.parentElement.classList.toggle('selected');
    updateToolbar();
};

const updateToolbar = () => {
    const count = selectedItems.size;
    document.getElementById('selection-count').textContent = `${count} selected`;
    document.getElementById('selection-count').style.display = count > 0 ? 'block' : 'none';
    document.getElementById('deleteBtn').style.display = count > 0 ? 'block' : 'none';
};

const deleteSelected = async () => {
    if (!confirm(`Delete ${selectedItems.size} items?`)) return;

    await fetch('/api/delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({files: Array.from(selectedItems)})
    });

    await loadGallery(currentPath);
};

// --- Lightbox Logic ---
const openLightbox = (index) => {
    currentLightboxIndex = index;
    document.getElementById('lightbox').classList.add('active');
    renderLightboxItem();
};

const closeLightbox = () => {
    document.getElementById('lightbox').classList.remove('active');
    const container = document.getElementById('lightbox-container');
    container.innerHTML = '';
};

const renderLightboxItem = () => {
    if (currentLightboxIndex < 0 || currentLightboxIndex >= galleryItems.length) return;

    const item = galleryItems[currentLightboxIndex];
    const url = `/downloads/${item.path}`;
    const ext = item.name.split('.').pop().toLowerCase();
    const isVideo = ['mp4', 'webm', 'gifv'].includes(ext);
    const container = document.getElementById('lightbox-container');
    const infoBox = document.getElementById('lightbox-info');

    const size = formatSize(item.size);
    const pathDisplay = item.path.replace(/\\/g, '/');

    // Set Info content
    infoBox.style.display = 'flex';
    infoBox.innerHTML = `
                <div><span class="info-label">File:</span> ${pathDisplay}</div>
                <div class="info-group">
                    <div><span class="info-label">Size:</span> ${size}</div>
                    <div id="res-info"><span class="info-label">Res:</span> ...</div>
                </div>
            `;

    if (isVideo) {
        container.innerHTML = `<video src="${url}" controls autoplay class="lightbox-content"></video>`;
        const video = container.querySelector('video');
        video.onloadedmetadata = () => {
            document.getElementById('res-info').innerHTML = `<span class="info-label">Res:</span> ${video.videoWidth} x ${video.videoHeight}`;
        };
    } else {
        container.innerHTML = `<img src="${url}" class="lightbox-content">`;
        const img = container.querySelector('img');
        img.onload = () => {
            document.getElementById('res-info').innerHTML = `<span class="info-label">Res:</span> ${img.naturalWidth} x ${img.naturalHeight}`;
        };
    }
};

const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const prevImage = () => {
    if (currentLightboxIndex > 0) {
        currentLightboxIndex--;
        renderLightboxItem();
    }
};

const nextImage = () => {
    if (currentLightboxIndex < galleryItems.length - 1) {
        currentLightboxIndex++;
        renderLightboxItem();
    }
};

const toggleLogs = () => {
    const p = document.getElementById('logs-panel');
    p.classList.toggle('visible');
    if (p.classList.contains('visible')) {
        renderLogs();
    }
};

const renderLogs = () => {
    const logsDiv = document.getElementById('logs-panel');
    logsDiv.innerHTML = '';
    logBuffer.forEach(data => {
        const entry = document.createElement('div');
        entry.className = 'log-entry ' + (data.message.includes('ERROR') ? 'log-error' : '');
        entry.textContent = `[${data.time}] ${data.message}`;
        logsDiv.appendChild(entry);
    });
    logsDiv.scrollTop = logsDiv.scrollHeight;
};

const toggleOptions = () => {
    const optionsRow = document.getElementById('advancedOptions');
    const toggle = document.querySelector('.options-toggle');
    optionsRow.classList.toggle('open');
    toggle.classList.toggle('open');
};

const openDataFolder = async () => {
    try {
        // Get the data directory path from server
        const response = await fetch('/api/data-directory');
        const data = await response.json();

        // Check if we're in Electron (desktop mode)
        if (window.electronAPI && window.electronAPI.openFolder) {
            // Use Electron's shell API to open folder
            window.electronAPI.openFolder(data.path);
        } else {
            // Web mode - show path and copy to clipboard
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(data.path);
                alert(`Downloads folder path copied to clipboard:\n${data.path}\n\nPaste this into your file explorer.`);
            } else {
                alert(`Downloads folder location:\n${data.path}`);
            }
        }
    } catch (error) {
        console.error('Failed to open folder:', error);
        alert('Failed to open folder');
    }
};

window.addEventListener('load', function () {
    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('lightbox').classList.contains('active')) return;
        if (e.key === 'ArrowLeft') prevImage();
        if (e.key === 'ArrowRight') nextImage();
        if (e.key === 'Escape') closeLightbox();
    });

    document.body.addEventListener('htmx:beforeRequest', function (evt) {
        if (evt.target.id === 'downloadForm') {
            startBtn.disabled = true;
            startBtn.textContent = 'Starting...';
        }
    });

// --- Init ---
    const socket = io();
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const logsDiv = document.getElementById('logs-panel');
    const searchInput = document.getElementById('searchInput');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

// Fetch History
    fetch('/api/history').then(r => r.json()).then(items => {
        const dl = document.getElementById('history');
        items.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub;
            dl.appendChild(opt);
        });
    });

// Initial Tree Load
    loadTree('', document.getElementById('file-tree'));

// --- Socket Logic ---
    socket.on('log', (data) => {
        const logItem = {
            time: new Date().toLocaleTimeString(),
            message: data.message
        };
        logBuffer.push(logItem);
        if (logBuffer.length > MAX_LOGS) logBuffer.shift();

        if (logsDiv.classList.contains('visible')) {
            const entry = document.createElement('div');
            entry.className = 'log-entry ' + (data.message.includes('ERROR') ? 'log-error' : '');
            entry.textContent = `[${logItem.time}] ${logItem.message}`;
            logsDiv.appendChild(entry);
            
            while (logsDiv.children.length > MAX_LOGS) {
                logsDiv.removeChild(logsDiv.firstChild);
            }
            logsDiv.scrollTop = logsDiv.scrollHeight;
        }
    });

    socket.on('status', (status) => {
        if (status === 'running') {
            startBtn.style.display = 'none';
            stopBtn.style.display = 'block';
            stopBtn.disabled = false;
            searchInput.setAttribute("disabled", true);
            
            // Show Progress
            progressContainer.style.display = 'block';
            progressFill.style.width = '0%';
            progressText.textContent = 'Starting...';
        } else {
            startBtn.style.display = 'block';
            startBtn.disabled = false;
            searchInput.removeAttribute("disabled");
            startBtn.textContent = 'Start Download'; // Reset text
            stopBtn.style.display = 'none';
            stopBtn.disabled = true;
            
            // Hide Progress
            progressContainer.style.display = 'none';
            progressFill.style.width = '0%';
        }
    });

    socket.on('progress', (data) => {
        const { downloaded, total } = data;
        const percentage = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        
        progressFill.style.width = percentage + '%';
        progressText.textContent = `${downloaded} / ${total} posts (${percentage}%)`;
    });

    socket.on('refresh_files', async () => {
        // Client-side throttle (2 seconds)
        const now = Date.now();
        if (now - lastRefresh < 2000) return;
        lastRefresh = now;

        loadTree('', document.getElementById('file-tree')); // Refresh root
        if (currentPath) loadGallery(currentPath); // Refresh current gallery
    });

    // Thumbnail generation progress
    socket.on('thumbnail_generation', (data) => {
        const banner = document.getElementById('thumbnail-banner');
        const text = document.getElementById('thumbnail-banner-text');
        const progressBar = document.getElementById('thumbnail-banner-progress-bar');

        if (data.status === 'started') {
            banner.style.display = 'block';
            text.textContent = `Generating thumbnails... (0 / ${data.total})`;
            progressBar.style.width = '0%';
        } else if (data.status === 'processing') {
            const percentage = Math.round((data.processed / data.total) * 100);
            text.textContent = `Generating thumbnails... (${data.processed} / ${data.total})`;
            progressBar.style.width = percentage + '%';
        } else if (data.status === 'completed') {
            let message = `✓ Generated ${data.processed} thumbnail(s)`;
            if (data.skipped && data.skipped > 0) {
                message += ` (skipped ${data.skipped} corrupted file(s))`;
            }
            text.textContent = message;
            progressBar.style.width = '100%';

            // Hide banner after 4 seconds
            setTimeout(() => {
                banner.style.display = 'none';
            }, 4000);

            // Refresh gallery if viewing files
            if (currentPath) loadGallery(currentPath);
        } else if (data.status === 'error') {
            text.textContent = '✗ Error generating thumbnails';
            setTimeout(() => {
                banner.style.display = 'none';
            }, 5000);
        }
    });
});

const gifFreezer = () => {
    // Target only images inside .gallery-item that are NOT already wrapped
    // We check for direct children 'img.hover-gif'
    // But since we might run this multiple times, we need to be careful not to double-wrap.
    // The previous implementation selected ALL '.gallery-item img'.
    // We should only select those that don't have a parent .gif-wrapper.
    
    // Note: My new render logic creates `img.hover-gif`.
    const images = document.querySelectorAll('.gallery-item > img.hover-gif');

    images.forEach(gif => {
        // 1. Create the wrapper div
        const wrapper = document.createElement('div');
        wrapper.classList.add('gif-wrapper');
        wrapper.style.width = "100%";
        wrapper.style.height = "100%";

        // 2. Wrap the GIF (Insert wrapper before gif, move gif inside wrapper)
        gif.parentNode.insertBefore(wrapper, gif);
        wrapper.appendChild(gif);

        // 3. Create the Canvas (static screenshot)
        // Wait for load to ensure dimensions
        if (gif.complete) {
            setupCanvas(gif, wrapper);
        } else {
            gif.onload = () => setupCanvas(gif, wrapper);
        }
    });
};

const setupCanvas = (gif, wrapper) => {
     const canvas = document.createElement('canvas');
        canvas.width = gif.naturalWidth;  // Use natural dimensions for resolution
        canvas.height = gif.naturalHeight;

        // 4. Draw the first frame of the GIF
        const ctx = canvas.getContext('2d');
        ctx.drawImage(gif, 0, 0, gif.naturalWidth, gif.naturalHeight);

        // 5. Place the canvas inside the wrapper (on top of the gif)
        wrapper.appendChild(canvas);
}