import {
  getSettings,
  saveSettings,
  getHistory,
  clearHistory,
  updateBadge,
  tokenCache,
  hasValidToken,
  instanceReadiness,
  downloadStates
} from './storage.js';
import {
  preAuth,
  getInstanceInfo
} from './turnstile.js';
import {
  fetchInstances,
  getAllInstances,
  pingInstance,
  processDownload,
  triggerDownload
} from './cobalt.js';

export const PREWARM_ALARM = "cobalt-prewarm";
export const PREWARM_INTERVAL_MIN = 10;

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get("settings");
  if (!data.settings) {
    const { DEFAULT_SETTINGS } = await import('./storage.js');
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  fetchInstances();
  setupPrewarmAlarm();
  setupContextMenu();
});

fetchInstances();
setupPrewarmAlarm();
setupContextMenu();

export function setupPrewarmAlarm() {
  try {
    chrome.alarms.get(PREWARM_ALARM, (existing) => {
      if (!existing) {
        chrome.alarms.create(PREWARM_ALARM, { periodInMinutes: PREWARM_INTERVAL_MIN });
      }
    });
  } catch (_) { }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PREWARM_ALARM) {
    preAuth();
  }
});

export function setupContextMenu() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "cobalt-download-page",
        title: "Download with Cobalt",
        contexts: ["page"],
      });
      chrome.contextMenus.create({
        id: "cobalt-download-link",
        title: "Download link with Cobalt",
        contexts: ["link"],
      });
    });
  } catch (_) { }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.menuItemId === "cobalt-download-link" ? info.linkUrl : (tab?.url || info.pageUrl);
  if (!url) return;
  try {
    const result = await processDownload(url);
    if (result?.success && result.url) {
      chrome.tabs.create({ url: result.url, active: false });
    }
  } catch (_) { }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "__ts_done") return false;

  const handlers = {
    download: () => processDownload(message.url, message.overrides || {}),
    triggerDownload: () => {
      triggerDownload(message.url, message.filename, message.sourceUrl || message.url);
      return Promise.resolve({ ok: true });
    },
    preAuth: () => preAuth().then(() => ({ ok: true })),
    checkInstance: () => getInstanceInfo(message.url),
    getActiveDownloads: () => Promise.resolve(
      Array.from(downloadStates.entries()).map(([url, s]) => ({ url, ...s }))
    ),
    pingInstance: () => pingInstance(message.url),
    getInstances: () => getAllInstances(),
    refreshInstances: () => fetchInstances(true).then(() => getAllInstances()),
    getSettings: () => getSettings(),
    saveSettings: () => saveSettings(message.settings).then(() => ({ ok: true })),
    getHistory: () => getHistory(),
    clearHistory: () => clearHistory().then(() => ({ ok: true })),
    getDownloadCount: async () => {
      const settings = await getSettings();
      const activeUrl = settings.activeInstance || "";
      const { downloadCounts = {} } = await chrome.storage.local.get("downloadCounts");
      return { count: downloadCounts[activeUrl] || 0 };
    },
    resetDownloadCount: async () => {
      const settings = await getSettings();
      const activeUrl = settings.activeInstance || "";
      const { downloadCounts = {} } = await chrome.storage.local.get("downloadCounts");
      downloadCounts[activeUrl] = 0;
      await chrome.storage.local.set({ downloadCounts });
      updateBadge();
      return { ok: true };
    },
    getReadiness: async () => {
      const settings = await getSettings();
      const activeUrl = settings.activeInstance || "";
      const ready = hasValidToken(activeUrl);
      return { activeReady: ready, readiness: instanceReadiness };
    },
    batchPing: async () => {
      const instances = await getAllInstances();
      const top = instances.slice(0, 8);
      const results = {};
      await Promise.allSettled(top.map(async (inst) => {
        const r = await pingInstance(inst.url);
        results[inst.url] = r;
      }));
      return results;
    },
  };

  const handler = handlers[message.action];
  if (handler) {
    handler().then(sendResponse);
    return true;
  }
});

const SUPPORTED_DOMAINS = [
  "youtube.com", "youtu.be", "twitter.com", "x.com",
  "tiktok.com", "reddit.com", "soundcloud.com", "twitch.tv", "vimeo.com",
  "pinterest.com", "bilibili.com", "tumblr.com", "dailymotion.com",
  "ok.ru", "vk.com", "loom.com", "streamable.com",
];

function isSupported(url) {
  try {
    return SUPPORTED_DOMAINS.some(d => new URL(url).hostname.includes(d));
  } catch {
    return false;
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "quick-download") {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url && isSupported(tab.url)) {
        await processDownload(tab.url);
      }
    } catch (_) {}
  }
});
