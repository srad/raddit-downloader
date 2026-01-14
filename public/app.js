// --- State ---
let currentPath = '';
let allItems = []; // Store all items in current folder
let galleryItems = []; // Store filtered items
let selectedItems = new Set();
let currentLightboxIndex = -1;

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
            if (!item.isDirectory) return; // Skip files in tree view

            const div = document.createElement('div');
            div.className = 'tree-item tree-folder';
            div.textContent = item.name + ` (${item.fileCount})`;
            div.title = item.name;

            // Delete Button
            const delBtn = document.createElement('span');
            delBtn.className = 'tree-delete';
            delBtn.innerHTML = '&times;';
            delBtn.title = 'Delete Folder';
            delBtn.onclick = (e) => deleteItem(e, item.path);
            div.appendChild(delBtn);

            div.onclick = async (e) => {
                if (e.target === delBtn) return;
                e.stopPropagation();

                // Load into gallery
                await loadGallery(item.path);

                // Expand logic
                let children = div.nextElementSibling;
                if (children && children.classList.contains('tree-children')) {
                    children.classList.toggle('open');
                } else {
                    const childContainer = document.createElement('div');
                    childContainer.className = 'tree-children open';
                    container.insertBefore(childContainer, div.nextElementSibling);
                    loadTree(item.path, childContainer);
                }
            };

            container.appendChild(div);
        });
    } catch (e) {
        console.error("Tree load failed", e);
        container.innerHTML = '<div style="color:red; padding:10px;">Error loading tree</div>';
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

    await renderGallery();
};

const renderGallery = async () => {
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = '';

    if (galleryItems.length === 0) {
        const msg = allItems.length === 0 ? 'Folder is empty' : 'No files match filter';
        grid.innerHTML = `<div style="color:#666; grid-column: 1/-1; text-align: center; margin-top: 50px;">${msg}</div>`;
        return;
    }

    galleryItems.forEach((item, index) => {
        const el = document.createElement('div');
        el.className = 'gallery-item';

        const ext = item.name.split('.').pop().toLowerCase();
        const isVideo = ['mp4', 'webm', 'gifv'].includes(ext);
        const url = `/downloads/${item.path}`;

        let mediaEl = "";
        if (isVideo) {
            mediaEl = `<video src="${url}" muted loop onmouseover="this.play()" onmouseout="this.pause()"></video><span class="gallery-item-info" style="background-color: mediumseagreen">${ext}</span>`;
        } else if (url.indexOf('.gif') !== -1) {
            mediaEl = `<img src="${url}" class="hover-gif" loading="lazy"><span class="gallery-item-info" style="background-color: deepskyblue">Gif</span>`;
        } else {
            mediaEl = `<img src="${url}" loading="lazy">`;
        }

        el.innerHTML = `
                    <input type="checkbox" class="item-checkbox" onclick="toggleSelect(event, '${item.path}')">
                    ${mediaEl}
                `;

        //el.innerHTML += `<div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.6); color:white; font-size:10px; padding:2px 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; pointer-events:none;">${item.name}</div>`;

        if (selectedItems.has(item.path)) {
            el.classList.add('selected');
            el.querySelector('.item-checkbox').checked = true;
        }

        el.onclick = (e) => {
            if (e.target.type !== 'checkbox') openLightbox(index);
        };

        grid.appendChild(el);
    });
    await gifFreezer();
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
};

const toggleOptions = () => {
    const optionsRow = document.getElementById('advancedOptions');
    const toggle = document.querySelector('.options-toggle');
    optionsRow.classList.toggle('open');
    toggle.classList.toggle('open');
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
        const entry = document.createElement('div');
        entry.className = 'log-entry ' + (data.message.includes('ERROR') ? 'log-error' : '');
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${data.message}`;
        logsDiv.appendChild(entry);
        logsDiv.scrollTop = logsDiv.scrollHeight;
    });

    socket.on('status', (status) => {
        if (status === 'running') {
            startBtn.style.display = 'none';
            stopBtn.style.display = 'block';
            stopBtn.disabled = false;
            searchInput.setAttribute("disabled", true);
            logsDiv.classList.add('visible');
        } else {
            startBtn.style.display = 'block';
            startBtn.disabled = false;
            searchInput.removeAttribute("disabled");
            startBtn.textContent = 'Start Download'; // Reset text
            stopBtn.style.display = 'none';
            stopBtn.disabled = true;
        }
    });

    socket.on('refresh_files', async () => {
        loadTree('', document.getElementById('file-tree')); // Refresh root
        if (currentPath) loadGallery(currentPath); // Refresh current gallery
    });
});

const gifFreezer = () => {
// Target only images inside your specific class
    const images = document.querySelectorAll('.gallery-item img');

    images.forEach(gif => {
        // 1. Create the wrapper div
        const wrapper = document.createElement('div');
        wrapper.classList.add('gif-wrapper');

        // 2. Wrap the GIF (Insert wrapper before gif, move gif inside wrapper)
        gif.parentNode.insertBefore(wrapper, gif);
        wrapper.appendChild(gif);

        // 3. Create the Canvas (static screenshot)
        const canvas = document.createElement('canvas');
        canvas.width = gif.naturalWidth;  // Use natural dimensions for resolution
        canvas.height = gif.naturalHeight;

        // 4. Draw the first frame of the GIF
        const ctx = canvas.getContext('2d');
        ctx.drawImage(gif, 0, 0, gif.naturalWidth, gif.naturalHeight);

        // 5. Place the canvas inside the wrapper (on top of the gif)
        wrapper.appendChild(canvas);
    });
};