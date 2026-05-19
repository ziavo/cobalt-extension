export const ICONS = {
  download: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`,
  pickerDl: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  copy: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
  bolt: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
};

export const SUPPORTED_DOMAINS = [
  "youtube.com", "youtu.be", "twitter.com", "x.com",
  "tiktok.com", "reddit.com", "soundcloud.com", "twitch.tv", "vimeo.com",
  "pinterest.com", "bilibili.com", "tumblr.com", "dailymotion.com",
  "ok.ru", "vk.com", "loom.com", "streamable.com",
];

export const $ = (id) => document.getElementById(id);
export const msg = (p) => chrome.runtime.sendMessage(p);
export const setVal = (id, val) => { const el = $(id); if (el) el.value = val; };

export function isSupported(url) {
  try {
    return SUPPORTED_DOMAINS.some(d => new URL(url).hostname.includes(d));
  } catch {
    return false;
  }
}

export function showStatus(type, html) {
  const el = $("status-area");
  if (el) {
    el.className = `status-area ${type}`;
    el.innerHTML = html;
  }
}

export function hideStatus() {
  const el = $("status-area");
  if (el) {
    el.className = "status-area hidden";
    el.innerHTML = "";
  }
}

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function showToast(message, type = "success") {
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

export function initTabSwitching(renderHistoryCallback) {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      $(`panel-${tab.dataset.tab}`).classList.add("active");

      if (tab.dataset.tab === "history" && typeof renderHistoryCallback === "function") {
        renderHistoryCallback();
      }
    });
  });
}

export function initClipboardActions() {
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
}
