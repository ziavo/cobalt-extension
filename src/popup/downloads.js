import { $, msg, showStatus, ICONS } from './ui.js';
import { updateDownloadCount } from './settings.js';

export let activeDownloadCount = 0;

export function setActiveDownloadCount(val) {
  activeDownloadCount = val;
}

export function triggerDownload(url, filename) {
  msg({ action: "triggerDownload", url, filename });
}

export function addDownloadEntry(url) {
  const area = $("status-area");
  if (!area) return "";
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

export function trackDownloadProgress(url, entryId) {
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
      if (activeDownloadCount <= 0) {
        activeDownloadCount = 0;
        if (btn) btn.classList.remove("downloading");
      }

      const fname = current.result?.filename || "file";
      const sizeStr = current.result?.fileSize ? ` (${current.result.fileSize})` : "";
      const via = current.result?.usedInstance ? ` · ${current.result.usedInstance}` : "";
      updateDownloadEntry(entryId, "success", `✓ ${fname}${sizeStr}${via}`);
      if (current.result?.status === "picker") renderPicker(current.result);
      updateDownloadCount();
    } else if (current.status === "error") {
      clearInterval(poller);
      activeDownloadCount--;
      if (activeDownloadCount <= 0) {
        activeDownloadCount = 0;
        if (btn) btn.classList.remove("downloading");
      }
      
      let errorMsg = current.result?.error || "Request failed.";
      if (current.result?.allFailed) {
        errorMsg = errorMsg.replace(/Download failed:\n?/, "").split("\n")[0];
      }
      updateDownloadEntry(entryId, "error", `✕ ${errorMsg}`);
    }
  }, 800);
}

export function updateDownloadEntry(id, status, html) {
  const entry = document.getElementById(id);
  if (!entry) return;
  entry.className = `dl-entry ${status}`;
  entry.innerHTML = html;
  if (status === "success") {
    setTimeout(() => {
      entry.style.opacity = "0";
      setTimeout(() => {
        entry.remove();
        const area = $("status-area");
        if (area && !area.querySelector(".dl-entry")) area.classList.add("hidden");
      }, 300);
    }, 8000);
  }
}

export async function restoreActiveDownloads() {
  try {
    const downloads = await msg({ action: "getActiveDownloads" });
    if (!downloads?.length) return;

    const btn = $("download-btn");

    for (const dl of downloads) {
      if (dl.status === "downloading" || dl.status === "downloading-file") {
        activeDownloadCount++;
        if (btn) btn.classList.add("downloading");
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

export function renderPicker(data) {
  const area = $("picker-area");
  if (!area) return;
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

export function initDownloadTrigger() {
  $("download-btn").addEventListener("click", async () => {
    const url = $("url-input").value.trim();
    if (!url) {
      showStatus("error", "Please paste a URL first");
      return;
    }

    activeDownloadCount++;
    const btn = $("download-btn");
    if (btn) btn.classList.add("downloading");

    const entryId = addDownloadEntry(url);

    const overrides = {
      downloadMode: $("qs-mode").value,
      videoQuality: $("qs-quality").value,
      audioFormat: $("qs-audioFormat").value,
    };

    trackDownloadProgress(url, entryId);

    msg({ action: "download", url, overrides }).catch(err => {
      activeDownloadCount--;
      if (activeDownloadCount <= 0) {
        activeDownloadCount = 0;
        if (btn) btn.classList.remove("downloading");
      }
      updateDownloadEntry(entryId, "error", `✕ ${err.message}`);
    });
  });

  $("url-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("download-btn").click();
    }
  });
}
