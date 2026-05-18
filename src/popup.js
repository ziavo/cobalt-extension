// ═══════════════════════════════════════════════════════════════════════════
// Cobalt Downloader – Popup Logic  v1.4.0
// Instances fetched dynamically; proactive pre-warming; QOL features.
// ═══════════════════════════════════════════════════════════════════════════

let settings = null;
let allInstances = [];
let cachedReadiness = {};

// ─── SVG Constants ──────────────────────────────────────────────────────
const ICONS = {
  download: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`,
  pickerDl: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  copy: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
  bolt: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
};

// ─── Helpers ────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const msg = (p) => chrome.runtime.sendMessage(p);
const setVal = (id, val) => { const el = $(id); if (el) el.value = val; };

const SUPPORTED_DOMAINS = [
  "youtube.com", "youtu.be", "twitter.com", "x.com", "instagram.com",
  "tiktok.com", "reddit.com", "soundcloud.com", "twitch.tv", "vimeo.com",
  "pinterest.com", "bilibili.com", "tumblr.com", "dailymotion.com",
  "ok.ru", "vk.com", "loom.com", "streamable.com",
];

function isSupported(url) {
  try { return SUPPORTED_DOMAINS.some(d => new URL(url).hostname.includes(d)); }
  catch { return false; }
}

function showStatus(type, html) {
  const el = $("status-area");
  el.className = `status-area ${type}`;
  el.innerHTML = html;
}

function hideStatus() {
  const el = $("status-area");
  el.className = "status-area hidden";
  el.innerHTML = "";
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function showToast(message, type = "success") {
  const existing = document.querySelector(".popup-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = `popup-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ─── Tab switching ──────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    $(`panel-${tab.dataset.tab}`).classList.add("active");

    // Lazy-load history when switching to that tab
    if (tab.dataset.tab === "history") renderHistory();
  });
});

// ─── Init ───────────────────────────────────────────────────────────────
async function init() {
  // Step 1: Instant — fill URL from active tab (no await on background)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && isSupported(tab.url)) {
      $("url-input").value = tab.url;
    }
  } catch (_) { }

  // Auto-update URL when the active tab navigates to a supported site
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url && isSupported(changeInfo.url)) {
      // Only update if the changed tab is the active one in the current window
      chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
        if (activeTab?.id === tabId) {
          $("url-input").value = changeInfo.url;
        }
      });
    }
  });
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId, (tab) => {
      if (tab?.url && isSupported(tab.url)) {
        $("url-input").value = tab.url;
      }
    });
  });

  // Step 2: Fast — load settings from storage (local, no network)
  settings = await msg({ action: "getSettings" });

  // Populate quick settings immediately
  setVal("qs-mode", settings.downloadMode);
  setVal("qs-quality", settings.videoQuality);
  setVal("qs-audioFormat", settings.audioFormat);

  // Populate settings tab
  setVal("s-videoQuality", settings.videoQuality);
  setVal("s-youtubeVideoCodec", settings.youtubeVideoCodec);
  setVal("s-downloadMode", settings.downloadMode);
  setVal("s-audioFormat", settings.audioFormat);
  setVal("s-audioBitrate", settings.audioBitrate);
  setVal("s-filenameStyle", settings.filenameStyle);
  $("s-disableMetadata").checked = settings.disableMetadata;
  $("s-convertGif").checked = settings.convertGif;

  updateActiveLabel();
  updateDownloadCount();
  initAutoSave();

  // Step 3: Restore any active/recent downloads (popup was closed and reopened)
  restoreActiveDownloads();

  // Step 4: Async — load instances in background (may need network)
  // Fire preAuth in background (don't await)
  msg({ action: "preAuth" });

  msg({ action: "getInstances" }).then(inst => {
    allInstances = inst || [];
    if (allInstances.length === 0) {
      // Retry once after 2s if instances haven't loaded yet (first install / SW cold start)
      setTimeout(() => {
        msg({ action: "getInstances" }).then(retry => {
          if (retry?.length) {
            allInstances = retry;
            updateActiveLabel();
            renderInstances();
          }
        });
      }, 2000);
    }
    updateActiveLabel();
    renderInstances();

    // Batch ping after instances are loaded (fire-and-forget)
    msg({ action: "batchPing" }).then(results => {
      if (!results) return;
      for (const [url, data] of Object.entries(results)) {
        const dot = document.querySelector(`.instance-status[data-url="${CSS.escape(url)}"]`);
        if (dot) {
          dot.classList.remove("checking");
          dot.classList.add(data.online ? "online" : "offline");
          if (data.online && data.latency != null) {
            const card = dot.closest(".instance-card");
            const meta = card?.querySelector(".instance-meta");
            if (meta && !meta.textContent.includes("ms")) {
              meta.textContent += ` · ${data.latency}ms`;
            }
          }
        }
      }
    });
  });

  // Step 5: Readiness indicator (fire-and-forget)
  msg({ action: "getReadiness" }).then(readiness => {
    cachedReadiness = readiness?.readiness || {};
    updateActiveLabel(readiness);
  });
}

async function restoreActiveDownloads() {
  try {
    const downloads = await msg({ action: "getActiveDownloads" });
    if (!downloads?.length) return;

    const btn = $("download-btn");

    for (const dl of downloads) {
      if (dl.status === "downloading" || dl.status === "downloading-file") {
        activeDownloadCount++;
        btn.classList.add("downloading");
        const entryId = addDownloadEntry(dl.url);
        trackDownloadProgress(dl.url, entryId);
      } else if (dl.status === "success" && dl.result) {
        const fname = dl.result.filename || "file";
        const sizeStr = dl.result.fileSize ? ` (${dl.result.fileSize})` : "";
        const via = dl.result.usedInstance ? ` · ${dl.result.usedInstance}` : "";
        const entryId = addDownloadEntry(dl.url);
        updateDownloadEntry(entryId, "success", `✓ ${fname}${sizeStr}${via}`);
      } else if (dl.status === "error" && dl.result) {
        const entryId = addDownloadEntry(dl.url);
        updateDownloadEntry(entryId, "error", `✕ ${dl.result.error || "Failed"}`);
      }
    }
  } catch (_) { }
}

function updateActiveLabel(readiness) {
  const active = allInstances.find(i => i.url === settings.activeInstance);
  const hostname = active
    ? active.name
    : settings.activeInstance
      ? new URL(settings.activeInstance).hostname
      : "Auto";
  $("active-instance-name").textContent = hostname;

  // Update readiness indicator
  const readyDot = $("ready-indicator");
  if (readyDot) {
    const isReady = readiness?.activeReady || cachedReadiness[settings.activeInstance]?.ready;
    readyDot.className = `ready-indicator ${isReady ? "ready" : "warming"}`;
    readyDot.title = isReady ? "Auth token cached — ready to download instantly" : "Warming up connection…";
  }
}

async function updateDownloadCount() {
  try {
    const res = await msg({ action: "getDownloadCount" });
    const count = res?.count || 0;
    const el = $("dl-count");
    if (el) el.textContent = count > 0 ? `${count} downloads` : "";
  } catch (_) { }
}

// ─── Paste + Clear ──────────────────────────────────────────────────────
$("paste-btn").addEventListener("click", async () => {
  try {
    $("url-input").value = await navigator.clipboard.readText();
    $("url-input").focus();
  } catch {
    showStatus("error", "Clipboard access denied");
  }
});

$("clear-btn").addEventListener("click", () => {
  $("url-input").value = "";
  hideStatus();
  $("picker-area").classList.add("hidden");
  $("url-input").focus();
});

// ─── Keyboard shortcuts ────────────────────────────────────────────────
$("url-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("download-btn").click();
  }
});


// ─── Download ───────────────────────────────────────────────────────────
let activeDownloadCount = 0;

// Trigger a real browser download (file save dialog) using chrome.downloads API
// Add a download item to the status feed with progress bar placeholders
function addDownloadEntry(url) {
  const area = $("status-area");
  area.classList.remove("hidden");
  area.classList.remove("error", "success");
  area.classList.add("loading");

  const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const shortUrl = url.replace(/^https?:\/\//, "").slice(0, 40) + (url.length > 55 ? "…" : "");
  const entry = document.createElement("div");
  entry.className = "dl-entry";
  entry.id = id;
  entry.innerHTML = `
    <div class="dl-entry-main">
      <span class="spinner"></span> 
      <span class="dl-entry-text">${shortUrl}</span>
    </div>
    <div class="dl-progress-wrap hidden">
      <div class="dl-progress-bar-container">
        <div class="dl-progress-bar" style="width: 0%"></div>
      </div>
      <span class="dl-progress-pct">0%</span>
    </div>
  `;
  area.prepend(entry);
  return id;
}

function trackDownloadProgress(url, entryId) {
  const btn = $("download-btn");
  const poller = setInterval(async () => {
    const all = await msg({ action: "getActiveDownloads" });
    const current = all?.find(d => d.url === url);
    if (!current) {
      clearInterval(poller);
      return;
    }

    const entry = document.getElementById(entryId);
    if (!entry) {
      clearInterval(poller);
      return;
    }

    if (current.status === "downloading") {
      const label = entry.querySelector(".dl-entry-text");
      if (label) label.textContent = "Resolving link with server...";
    } else if (current.status === "downloading-file") {
      const wrap = entry.querySelector(".dl-progress-wrap");
      if (wrap) {
        wrap.classList.remove("hidden");
        const pct = current.percent || 0;
        entry.querySelector(".dl-progress-bar").style.width = `${pct}%`;
        entry.querySelector(".dl-progress-pct").textContent = `${pct}%`;
      }
      const label = entry.querySelector(".dl-entry-text");
      if (label) {
        const fname = current.result?.filename || "file";
        label.textContent = `Saving: ${fname}`;
      }
    } else if (current.status === "success") {
      clearInterval(poller);
      activeDownloadCount--;
      if (activeDownloadCount <= 0) { activeDownloadCount = 0; btn.classList.remove("downloading"); }

      const fname = current.result?.filename || "file";
      const sizeStr = current.result?.fileSize ? ` (${current.result.fileSize})` : "";
      const via = current.result?.usedInstance ? ` · ${current.result.usedInstance}` : "";
      updateDownloadEntry(entryId, "success", `✓ ${fname}${sizeStr}${via}`);
      if (current.result?.status === "picker") renderPicker(current.result);
      updateDownloadCount();
    } else if (current.status === "error") {
      clearInterval(poller);
      activeDownloadCount--;
      if (activeDownloadCount <= 0) { activeDownloadCount = 0; btn.classList.remove("downloading"); }
      
      let errorMsg = current.result?.error || "Request failed.";
      if (current.result?.allFailed) {
        errorMsg = errorMsg.replace(/Download failed:\n?/, "").split("\n")[0];
      }
      updateDownloadEntry(entryId, "error", `✕ ${errorMsg}`);
    }
  }, 800);
}

function updateDownloadEntry(id, status, html) {
  const entry = document.getElementById(id);
  if (!entry) return;
  entry.className = `dl-entry ${status}`;
  entry.innerHTML = html;
  // Auto-remove success entries after 8s
  if (status === "success") {
    setTimeout(() => {
      entry.style.opacity = "0";
      setTimeout(() => {
        entry.remove();
        const area = $("status-area");
        if (!area.querySelector(".dl-entry")) area.classList.add("hidden");
      }, 300);
    }, 8000);
  }
}

$("download-btn").addEventListener("click", async () => {
  const url = $("url-input").value.trim();
  if (!url) { showStatus("error", "Please paste a URL first"); return; }

  // Don't block — start download and re-enable button immediately
  activeDownloadCount++;
  const btn = $("download-btn");
  btn.classList.add("downloading");

  const entryId = addDownloadEntry(url);

  const overrides = {
    downloadMode: $("qs-mode").value,
    videoQuality: $("qs-quality").value,
    audioFormat: $("qs-audioFormat").value,
  };

  // Start progress tracking instantly
  trackDownloadProgress(url, entryId);

  // Fire-and-forget: download runs in background, UI updates via poller
  msg({ action: "download", url, overrides }).catch(err => {
    activeDownloadCount--;
    if (activeDownloadCount <= 0) { activeDownloadCount = 0; btn.classList.remove("downloading"); }
    updateDownloadEntry(entryId, "error", `✕ ${err.message}`);
  });
});


// ─── Picker ─────────────────────────────────────────────────────────────
function renderPicker(data) {
  const area = $("picker-area");
  area.classList.remove("hidden");

  const frag = document.createDocumentFragment();
  const grid = document.createElement("div");
  grid.className = "picker-grid";

  data.picker.forEach((item, i) => {
    const div = document.createElement("div");
    div.className = "picker-item";
    div.dataset.url = item.url;
    div.title = `Item ${i + 1} — click to download`;
    div.innerHTML = `
      <img src="${item.thumb || item.url}" alt="Item ${i + 1}" loading="lazy">
      <div class="picker-dl">${ICONS.pickerDl}</div>`;
    div.addEventListener("click", () => triggerDownload(item.url));
    grid.appendChild(div);
  });

  frag.appendChild(grid);

  if (data.audio) {
    const audioBtn = document.createElement("button");
    audioBtn.className = "secondary-btn";
    audioBtn.style.cssText = "margin-top:8px;width:100%";
    audioBtn.textContent = "🎵 Download Audio";
    audioBtn.addEventListener("click", () => chrome.tabs.create({ url: data.audio, active: false }));
    frag.appendChild(audioBtn);
  }

  area.innerHTML = "";
  area.appendChild(frag);
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTANCES TAB
// ═══════════════════════════════════════════════════════════════════════════

function renderInstances() {
  const list = $("instance-list");
  const frag = document.createDocumentFragment();

  const customUrls = new Set((settings.customInstances || []).map(i => i.url));

  // Priority instances first (user-added)
  if (settings.customInstances?.length) {
    const header = document.createElement("div");
    header.className = "instance-section-header";
    header.textContent = "⭐ Priority Instances";
    frag.appendChild(header);

    settings.customInstances.forEach((inst, idx) => {
      frag.appendChild(createInstanceCard(inst, true, idx));
    });
  }

  // Split auto-fetched instances into official and community
  const autoInstances = allInstances.filter(i => !customUrls.has(i.url));
  const officialInstances = autoInstances.filter(i => i.trust === "official");
  const communityInstances = autoInstances.filter(i => i.trust !== "official");

  // Official instances
  if (officialInstances.length) {
    const header = document.createElement("div");
    header.className = "instance-section-header";
    header.textContent = `★ Official Instances (${officialInstances.length})`;
    frag.appendChild(header);

    officialInstances.forEach(inst => {
      frag.appendChild(createInstanceCard(inst, false));
    });
  }

  // Community instances
  if (communityInstances.length) {
    const header = document.createElement("div");
    header.className = "instance-section-header";
    header.textContent = `🌐 Community Instances (${communityInstances.length})`;
    frag.appendChild(header);

    communityInstances.forEach(inst => {
      frag.appendChild(createInstanceCard(inst, false));
    });
  }

  list.innerHTML = "";
  list.appendChild(frag);
}

function createInstanceCard(inst, isPriority, priorityIdx) {
  const selected = inst.url === settings.activeInstance;
  const trustBadge = inst.trust === "official"
    ? '<span class="auth-badge official" title="Official">★</span>' : "";
  const scoreBadge = inst.score
    ? `<span class="score-badge">${inst.score}%</span>` : "";

  // Check readiness from cached data
  const readiness = cachedReadiness[inst.url];
  const authIcon = readiness?.ready
    ? `<span class="auth-ready-badge" title="Auth ready">${ICONS.bolt}</span>`
    : "";

  const card = document.createElement("div");
  card.className = `instance-card${selected ? " selected" : ""}`;
  card.innerHTML = `
    <div class="instance-status checking" data-url="${inst.url}"></div>
    <div class="instance-info">
      <div class="instance-name">${trustBadge}${inst.name}${scoreBadge}${authIcon}</div>
      <div class="instance-meta">${new URL(inst.url).hostname}${inst.version ? " · v" + inst.version : ""}</div>
    </div>
    <div class="instance-actions">
      ${isPriority
      ? `<button class="remove-btn" title="Remove from priority">×</button>`
      : `<button class="pin-btn" title="Add to priority instances">📌</button>`}
    </div>`;

  // Click to set as active
  card.addEventListener("click", (e) => {
    if (e.target.closest(".remove-btn") || e.target.closest(".pin-btn")) return;
    settings.activeInstance = inst.url;
    msg({ action: "saveSettings", settings });
    // Trigger pre-auth for newly selected instance
    msg({ action: "preAuth" });
    updateActiveLabel();
    renderInstances();
    showToast(`Switched to ${inst.name}`);
  });

  // Pin button
  const pinBtn = card.querySelector(".pin-btn");
  if (pinBtn) {
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!settings.customInstances) settings.customInstances = [];
      if (!settings.customInstances.some(i => i.url === inst.url)) {
        settings.customInstances.push({ ...inst, trust: "custom" });
        msg({ action: "saveSettings", settings });
        renderInstances();
        showToast(`Pinned ${inst.name}`);
      }
    });
  }

  // Remove button
  const removeBtn = card.querySelector(".remove-btn");
  if (removeBtn) {
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      settings.customInstances = settings.customInstances.filter((_, i) => i !== priorityIdx);
      if (inst.url === settings.activeInstance && allInstances.length) {
        settings.activeInstance = allInstances[0]?.url || "";
        updateActiveLabel();
      }
      msg({ action: "saveSettings", settings });
      renderInstances();
      showToast("Instance removed");
    });
  }

  return card;
}

// ─── Refresh instances ──────────────────────────────────────────────────
$("check-all-btn").addEventListener("click", async () => {
  const btn = $("check-all-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="width:12px;height:12px;border-width:1.5px;margin-right:4px"></span> Refreshing…`;

  allInstances = await msg({ action: "refreshInstances" }) || [];
  renderInstances();

  // Batch ping all
  const results = await msg({ action: "batchPing" });
  if (results) {
    for (const [url, data] of Object.entries(results)) {
      const dot = document.querySelector(`.instance-status[data-url="${CSS.escape(url)}"]`);
      if (dot) {
        dot.classList.remove("checking");
        dot.classList.add(data.online ? "online" : "offline");
      }
    }
  }

  btn.disabled = false;
  btn.innerHTML = `${ICONS.refresh} Refresh`;
  showToast("Instances refreshed");
});

// ─── Add custom instance ────────────────────────────────────────────────
$("add-instance-btn").addEventListener("click", () => {
  const nameInput = $("new-instance-name");
  const urlInput = $("new-instance-url");
  const name = nameInput.value.trim();
  let url = urlInput.value.trim();
  if (!name || !url) {
    // Visual feedback
    if (!name) nameInput.classList.add("shake");
    if (!url) urlInput.classList.add("shake");
    setTimeout(() => { nameInput.classList.remove("shake"); urlInput.classList.remove("shake"); }, 500);
    return;
  }
  if (!url.startsWith("http")) url = "https://" + url;
  url = url.replace(/\/+$/, "");

  if (!settings.customInstances) settings.customInstances = [];
  if (settings.customInstances.some(i => i.url === url)) {
    urlInput.style.borderColor = "var(--red)";
    setTimeout(() => (urlInput.style.borderColor = ""), 1500);
    return;
  }

  settings.customInstances.push({
    name, url, frontend: "", trust: "custom", apiKey: "", score: 0,
  });
  msg({ action: "saveSettings", settings });
  renderInstances();
  nameInput.value = "";
  urlInput.value = "";
  showToast(`Added ${name}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY TAB
// ═══════════════════════════════════════════════════════════════════════════

async function renderHistory() {
  const list = $("history-list");
  const empty = $("history-empty");
  const history = await msg({ action: "getHistory" });

  if (!history || history.length === 0) {
    list.innerHTML = "";
    empty.style.display = "flex";
    return;
  }

  empty.style.display = "none";
  const frag = document.createDocumentFragment();

  history.forEach(entry => {
    const card = document.createElement("div");
    card.className = "history-item";
    const sizeStr = entry.fileSize ? ` · ${entry.fileSize}` : "";
    card.innerHTML = `
      <div class="history-info">
        <div class="history-filename" title="${entry.filename}">${entry.filename}</div>
        <div class="history-meta">${entry.instance ? entry.instance + " · " : ""}${timeAgo(entry.timestamp)}${sizeStr}</div>
      </div>
      <div class="history-actions">
        <button class="history-copy" title="Copy source URL">${ICONS.copy}</button>
        <button class="history-redownload" title="Download again">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>`;

    // Copy source URL
    const copyBtn = card.querySelector(".history-copy");
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (entry.sourceUrl) {
        navigator.clipboard.writeText(entry.sourceUrl);
        showToast("URL copied");
      }
    });

    const redownloadBtn = card.querySelector(".history-redownload");
    redownloadBtn.addEventListener("click", () => {
      if (entry.url) {
        chrome.tabs.create({ url: entry.url, active: false });
      } else if (entry.sourceUrl) {
        $("url-input").value = entry.sourceUrl;
        document.querySelector('.tab[data-tab="download"]').click();
      }
    });

    frag.appendChild(card);
  });

  list.innerHTML = "";
  list.appendChild(frag);
}

$("clear-history-btn").addEventListener("click", async () => {
  await msg({ action: "clearHistory" });
  renderHistory();
  showToast("History cleared");
});

// ═══════════════════════════════════════════════════════════════════════════
// RESET DOWNLOAD COUNT
// ═══════════════════════════════════════════════════════════════════════════
$("reset-count-btn").addEventListener("click", async () => {
  await msg({ action: "resetDownloadCount" });
  updateDownloadCount();
  showToast("Count reset");
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-SAVE SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

function initAutoSave() {
  let saveTimer = null;

  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveAllSettings, 300);
  }

  document.querySelectorAll(".auto-save").forEach(el => {
    const event = el.type === "checkbox" ? "change" : "change";
    el.addEventListener(event, debouncedSave);
  });

  // Quick-settings also trigger save
  ["qs-mode", "qs-quality", "qs-audioFormat"].forEach(id => {
    $(id).addEventListener("change", () => {
      settings.downloadMode = $("qs-mode").value;
      settings.videoQuality = $("qs-quality").value;
      settings.audioFormat = $("qs-audioFormat").value;
      // Sync to settings tab
      setVal("s-downloadMode", settings.downloadMode);
      setVal("s-videoQuality", settings.videoQuality);
      setVal("s-audioFormat", settings.audioFormat);
      msg({ action: "saveSettings", settings });
    });
  });
}

function saveAllSettings() {
  settings.videoQuality = $("s-videoQuality").value;
  settings.youtubeVideoCodec = $("s-youtubeVideoCodec").value;
  settings.downloadMode = $("s-downloadMode").value;
  settings.audioFormat = $("s-audioFormat").value;
  settings.audioBitrate = $("s-audioBitrate").value;
  settings.filenameStyle = $("s-filenameStyle").value;
  settings.disableMetadata = $("s-disableMetadata").checked;
  settings.convertGif = $("s-convertGif").checked;

  msg({ action: "saveSettings", settings });

  // Sync quick settings dropdowns
  setVal("qs-mode", settings.downloadMode);
  setVal("qs-quality", settings.videoQuality);
  setVal("qs-audioFormat", settings.audioFormat);

  // Flash toast
  const toast = $("settings-toast");
  toast.classList.remove("hidden");
  toast.classList.add("visible");
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.classList.add("hidden"), 200);
  }, 1500);
}

// ─── Start ──────────────────────────────────────────────────────────────
init();
