export const MAX_HISTORY = 50;

export const DEFAULT_SETTINGS = {
  activeInstance: "",
  videoQuality: "1080",
  audioFormat: "mp3",
  audioBitrate: "128",
  downloadMode: "auto",
  filenameStyle: "pretty",
  youtubeVideoCodec: "h264",
  disableMetadata: false,
  convertGif: true,
  customInstances: [],
};

export let tokenCache = {};
export const downloadStates = new Map();
export const activeDownloads = new Set();
export const nativeDownloads = new Map();
export const instanceInfoCache = {};
export let instanceReadiness = {};
export let preAuthInProgress = false;

export function setPreAuthInProgress(value) {
  preAuthInProgress = value;
}

export async function loadTokenCache() {
  try {
    const data = await chrome.storage.local.get("tokenCache");
    if (data.tokenCache) {
      tokenCache = data.tokenCache;
      const now = Date.now();
      let pruned = false;
      for (const url in tokenCache) {
        if (tokenCache[url].expiresAt <= now) {
          delete tokenCache[url];
          pruned = true;
        }
      }
      if (pruned) saveTokenCache();
    }
  } catch (_) { }
}

export async function saveTokenCache() {
  try {
    await chrome.storage.local.set({ tokenCache });
  } catch (_) { }
}

export function cacheToken(instanceUrl, token, expSeconds) {
  tokenCache[instanceUrl] = {
    token,
    expiresAt: Date.now() + Math.max((expSeconds - 30) * 1000, 60_000),
  };
  saveTokenCache();
}

export function hasValidToken(url) {
  const c = tokenCache[url];
  return c && c.expiresAt > Date.now();
}

export function getAuthHeaders(instance) {
  if (instance?.apiKey) return { Authorization: `Api-Key ${instance.apiKey}` };
  const c = tokenCache[instance?.url];
  if (c && c.expiresAt > Date.now()) return { Authorization: `Bearer ${c.token}` };
  return {};
}

export async function getSettings() {
  const data = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
  updateBadge();
}

export async function addToHistory(entry) {
  try {
    const { downloadHistory = [] } = await chrome.storage.local.get("downloadHistory");
    downloadHistory.unshift({
      url: entry.url,
      sourceUrl: entry.sourceUrl,
      filename: entry.filename || "download",
      instance: entry.instance || "",
      fileSize: entry.fileSize || "",
      timestamp: Date.now(),
    });
    if (downloadHistory.length > MAX_HISTORY) downloadHistory.length = MAX_HISTORY;
    await chrome.storage.local.set({ downloadHistory });
  } catch (_) { }
}

export async function getHistory() {
  try {
    const { downloadHistory = [] } = await chrome.storage.local.get("downloadHistory");
    return downloadHistory;
  } catch (_) {
    return [];
  }
}

export async function clearHistory() {
  await chrome.storage.local.set({ downloadHistory: [] });
}

export async function updateBadge() {
  try {
    const settings = await getSettings();
    const activeUrl = settings.activeInstance || "";
    const { downloadCounts = {} } = await chrome.storage.local.get("downloadCounts");
    const count = downloadCounts[activeUrl] || 0;
    const text = count > 0 ? String(count) : "";
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: "#818cf8" });
  } catch (_) { }
}

export async function incrementDownloadCount(instanceUrl) {
  try {
    const { downloadCounts = {} } = await chrome.storage.local.get("downloadCounts");
    downloadCounts[instanceUrl] = (downloadCounts[instanceUrl] || 0) + 1;
    await chrome.storage.local.set({ downloadCounts });
    updateBadge();
  } catch (_) { }
}

loadTokenCache();
