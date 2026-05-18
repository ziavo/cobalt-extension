// ═══════════════════════════════════════════════════════════════════════════
// Cobalt Downloader – Background Service Worker  v1.4.0
// ═══════════════════════════════════════════════════════════════════════════

const INSTANCES_API = "https://instances.cobalt.best/api/instances.json";
const INSTANCES_CACHE_MS = 30 * 60 * 1000;   // 30 min
const DOWNLOAD_TIMEOUT_MS = 20_000;           // 20s per download attempt
const INFO_TIMEOUT_MS = 8_000;
const TURNSTILE_TIMEOUT_MS = 25_000;           // 25s — Turnstile can be slow
const MAX_FALLBACK_TRIES = 5;
const MAX_HISTORY = 50;
const PREWARM_ALARM = "cobalt-prewarm";
const PREWARM_INTERVAL_MIN = 10;              // re-check auth every 10 min

const DEFAULT_SETTINGS = {
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

// ─── In-memory caches ───────────────────────────────────────────────────
let tokenCache = {};
let cachedInstances = null;
let instancesFetchedAt = 0;
const instanceInfoCache = {};
let preAuthInProgress = false;
// Tracks readiness: { [url]: { ready: bool, latency: number|null, checkedAt } }
let instanceReadiness = {};

// ─── Download state map (survives popup close/reopen) ────────────────
const downloadStates = new Map(); // url -> { status, result, startedAt }

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENT JWT STORAGE
// ═══════════════════════════════════════════════════════════════════════════

async function loadTokenCache() {
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

async function saveTokenCache() {
  try { await chrome.storage.local.set({ tokenCache }); } catch (_) { }
}

function cacheToken(instanceUrl, token, expSeconds) {
  // Add 30s safety margin to avoid edge-case expiry during request
  tokenCache[instanceUrl] = {
    token,
    expiresAt: Date.now() + Math.max((expSeconds - 30) * 1000, 60_000),
  };
  saveTokenCache();
}

loadTokenCache();

// ─── Init ───────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get("settings");
  if (!data.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  fetchInstances();
  setupPrewarmAlarm();
  setupContextMenu();
});

// On SW restart — load cached instances from storage (instant), then refresh from API
loadCachedInstances().then(() => fetchInstances());
setupPrewarmAlarm();
setupContextMenu();

// Load instances from persistent storage (survives SW restart)
async function loadCachedInstances() {
  try {
    const data = await chrome.storage.local.get("cachedInstances");
    if (data.cachedInstances?.instances?.length) {
      cachedInstances = data.cachedInstances.instances;
      instancesFetchedAt = data.cachedInstances.fetchedAt || 0;
    }
  } catch (_) { }
}

async function getSettings() {
  const data = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROACTIVE PRE-WARMING (runs in background on alarm)
// ═══════════════════════════════════════════════════════════════════════════

function setupPrewarmAlarm() {
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

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT MENU - Right-click "Download with Cobalt"
// ═══════════════════════════════════════════════════════════════════════════

function setupContextMenu() {
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

// ═══════════════════════════════════════════════════════════════════════════
// DOWNLOAD HISTORY
// ═══════════════════════════════════════════════════════════════════════════

async function addToHistory(entry) {
  try {
    const { downloadHistory = [] } = await chrome.storage.local.get("downloadHistory");
    downloadHistory.unshift({
      url: entry.url,
      sourceUrl: entry.sourceUrl,
      filename: entry.filename || "download",
      instance: entry.instance || "",
      timestamp: Date.now(),
    });
    // Keep only the last MAX_HISTORY items
    if (downloadHistory.length > MAX_HISTORY) downloadHistory.length = MAX_HISTORY;
    await chrome.storage.local.set({ downloadHistory });
  } catch (_) { }
}

async function getHistory() {
  try {
    const { downloadHistory = [] } = await chrome.storage.local.get("downloadHistory");
    return downloadHistory;
  } catch (_) { return []; }
}

async function clearHistory() {
  await chrome.storage.local.set({ downloadHistory: [] });
}

// ═══════════════════════════════════════════════════════════════════════════
// BADGE COUNTER  (per-instance)
// ═══════════════════════════════════════════════════════════════════════════

async function updateBadge() {
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

async function incrementDownloadCount(instanceUrl) {
  try {
    const { downloadCounts = {} } = await chrome.storage.local.get("downloadCounts");
    downloadCounts[instanceUrl] = (downloadCounts[instanceUrl] || 0) + 1;
    await chrome.storage.local.set({ downloadCounts });
    updateBadge();
  } catch (_) { }
}

updateBadge();

// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC INSTANCE FETCHING
// ═══════════════════════════════════════════════════════════════════════════

async function fetchInstances(force = false) {
  if (!force && cachedInstances && Date.now() - instancesFetchedAt < INSTANCES_CACHE_MS) {
    return cachedInstances;
  }

  // Try cobalt.directory first (reliable), then instances.cobalt.best as backup
  const sources = [
    { url: "https://cobalt.directory/api/tests", parser: parseDirectoryAPI },
    { url: INSTANCES_API, parser: parseInstancesBestAPI },
  ];

  for (const source of sources) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(source.url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const json = await res.json();
      const instances = source.parser(json);

      if (instances.length > 0) {
        cachedInstances = instances;
        instancesFetchedAt = Date.now();
        chrome.storage.local.set({ cachedInstances: { instances, fetchedAt: instancesFetchedAt } }).catch(() => {});

        const settings = await getSettings();
        if (!settings.activeInstance && instances.length > 0) {
          settings.activeInstance = instances[0].url;
          await chrome.storage.local.set({ settings });
        }
        return instances;
      }
    } catch (_) { }
  }

  // All APIs failed — use hardcoded fallback
  console.warn("[Cobalt] All instance APIs failed, using hardcoded fallback");
  if (cachedInstances) return cachedInstances;

  const fallback = [
    { name: "cobalt.meowing.de", url: "https://nuko-c.meowing.de", frontend: "https://cobalt.meowing.de", score: 100, version: "11.7.1", services: {}, trust: "community", apiKey: "" },
    { name: "Cobalt Official (blossom)", url: "https://blossom.imput.net", frontend: "https://cobalt.tools", score: 78, version: "11.7.1", services: {}, trust: "official", apiKey: "" },
    { name: "Cobalt Official (sunny)", url: "https://sunny.imput.net", frontend: "https://cobalt.tools", score: 78, version: "11.7.1", services: {}, trust: "official", apiKey: "" },
    { name: "Cobalt Official (nachos)", url: "https://nachos.imput.net", frontend: "https://cobalt.tools", score: 78, version: "11.7.1", services: {}, trust: "official", apiKey: "" },
    { name: "Cobalt Official (kityune)", url: "https://kityune.imput.net", frontend: "https://cobalt.tools", score: 78, version: "11.7.1", services: {}, trust: "official", apiKey: "" },
    { name: "cobalt.canine.tools", url: "https://cobalt.alpha.wolfy.love", frontend: "https://cobalt.canine.tools", score: 96, version: "11.7.1", services: {}, trust: "community", apiKey: "" },
    { name: "cobalt.kittycat.boo", url: "https://dog.kittycat.boo", frontend: "https://cobalt.kittycat.boo", score: 91, version: "11.7.1", services: {}, trust: "community", apiKey: "" },
    { name: "cobalt.clxxped.lol", url: "https://lime.clxxped.lol", frontend: "https://cobalt.clxxped.lol", score: 87, version: "11.7.1", services: {}, trust: "community", apiKey: "" },
    { name: "cobalt.squair.xyz", url: "https://cobaltapi.squair.xyz", frontend: "https://cobalt.squair.xyz", score: 87, version: "11.7.1", services: {}, trust: "community", apiKey: "" },
    { name: "cobalt.blackcat.sweeux.org", url: "https://api.cobalt.blackcat.sweeux.org", frontend: "https://cobalt.blackcat.sweeux.org", score: 87, version: "11.7.1", services: {}, trust: "community", apiKey: "" },
  ];
  cachedInstances = fallback;
  instancesFetchedAt = Date.now();
  return fallback;
}

// Parse cobalt.directory /api/tests format
function parseDirectoryAPI(json) {
  if (!json?.data || !Array.isArray(json.data)) return [];

  return json.data
    .filter(i => i.online && i.api && i.protocol === "https")
    .map(i => {
      const isOfficial = i.frontend === "cobalt.tools";
      const tests = i.tests || {};
      const totalTests = Object.keys(tests).filter(k => k !== "Frontend").length;
      const passedTests = Object.values(tests).filter(t => t.status === true && t.friendly).length;
      const score = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

      // Build services map from test results
      const services = {};
      for (const [key, val] of Object.entries(tests)) {
        if (key === "Frontend") continue;
        services[key] = val.status;
      }

      let name;
      if (isOfficial) {
        const sub = i.api.split(".")[0];
        name = `Cobalt Official (${sub})`;
      } else {
        name = i.frontend || i.api;
      }

      return {
        name,
        url: `https://${i.api}`,
        frontend: i.frontend ? `https://${i.frontend}` : `https://${i.api}`,
        score,
        version: i.version || "?",
        services,
        trust: isOfficial ? "official" : "community",
        apiKey: "",
      };
    })
    .sort((a, b) => {
      // Official first, then by score
      if (a.trust === "official" && b.trust !== "official") return -1;
      if (b.trust === "official" && a.trust !== "official") return 1;
      return b.score - a.score;
    });
}

// Parse instances.cobalt.best format (backup)
function parseInstancesBestAPI(json) {
  if (!Array.isArray(json)) return [];

  return json
    .filter(i => i.online && i.api && i.protocol === "https")
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map(i => {
      const isOfficial = i.frontend === "cobalt.tools";
      let name;
      if (isOfficial) {
        const sub = i.api.split(".")[0];
        name = `Cobalt Official (${sub})`;
      } else {
        name = i.frontend || i.api;
      }
      return {
        name,
        url: `https://${i.api}`,
        frontend: i.frontend ? `https://${i.frontend}` : `https://${i.api}`,
        score: i.score || 0,
        version: i.version || "?",
        services: i.services || {},
        trust: isOfficial ? "official" : "community",
        apiKey: "",
      };
    });
}

async function getAllInstances() {
  const [apiInstances, settings] = await Promise.all([fetchInstances(), getSettings()]);
  const custom = (settings.customInstances || []).map(i => ({ ...i, trust: "custom" }));
  const seen = new Set();
  const merged = [];
  for (const inst of [...custom, ...apiInstances]) {
    if (!seen.has(inst.url)) { seen.add(inst.url); merged.push(inst); }
  }
  return merged;
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTANCE HEALTH CHECK (with latency)
// ═══════════════════════════════════════════════════════════════════════════

async function pingInstance(instanceUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const start = Date.now();
    const res = await fetch(instanceUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;
    if (!res.ok) return { online: false, latency: null };
    // Update readiness cache
    instanceReadiness[instanceUrl] = {
      ready: hasValidToken(instanceUrl),
      latency,
      checkedAt: Date.now(),
    };
    return { online: true, latency };
  } catch {
    return { online: false, latency: null };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function getInstanceInfo(instanceUrl) {
  const cached = instanceInfoCache[instanceUrl];
  if (cached && cached.fetchedAt > Date.now() - 300_000) return cached;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), INFO_TIMEOUT_MS);
    const res = await fetch(instanceUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const json = await res.json();
    const info = {
      online: true,
      version: json.cobalt?.version || "unknown",
      services: json.cobalt?.services || [],
      turnstileSitekey: json.cobalt?.turnstileSitekey || null,
      url: json.cobalt?.url || instanceUrl,
      fetchedAt: Date.now(),
    };
    instanceInfoCache[instanceUrl] = info;
    return info;
  } catch {
    return { online: false, version: null, services: [], turnstileSitekey: null, url: instanceUrl, fetchedAt: Date.now() };
  }
}

function getAuthHeaders(instance) {
  if (instance?.apiKey) return { Authorization: `Api-Key ${instance.apiKey}` };
  const c = tokenCache[instance?.url];
  if (c && c.expiresAt > Date.now()) return { Authorization: `Bearer ${c.token}` };
  return {};
}

function hasValidToken(url) {
  const c = tokenCache[url];
  return c && c.expiresAt > Date.now();
}

async function createSession(instanceUrl, turnstileToken) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${instanceUrl}/session`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "cf-turnstile-response": turnstileToken,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const json = await res.json();
    if (json.token) {
      cacheToken(instanceUrl, json.token, json.exp || 1800);
      return { success: true };
    }
    return { success: false, error: json.error?.code || "Session failed" };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TURNSTILE VIA BACKGROUND TAB
// ═══════════════════════════════════════════════════════════════════════════

async function solveTurnstile(frontendUrl, sitekey) {
  let tabId = null;
  try {
    const authPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error("Turnstile timed out (15s)"));
      }, TURNSTILE_TIMEOUT_MS);

      function listener(msg) {
        if (msg.action === "__ts_done") {
          chrome.runtime.onMessage.removeListener(listener);
          clearTimeout(timeout);
          resolve(msg);
        }
      }
      chrome.runtime.onMessage.addListener(listener);
    });

    const tab = await chrome.tabs.create({ url: frontendUrl, active: false });
    tabId = tab.id;

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(fn);
        reject(new Error("Tab timeout"));
      }, TURNSTILE_TIMEOUT_MS);
      function fn(id, info) {
        if (id === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(fn);
          clearTimeout(t);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(fn);
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        window.addEventListener("message", (e) => {
          if (e.data?.type === "__ts")
            chrome.runtime.sendMessage({ action: "__ts_done", ...e.data });
        });
      },
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (sk) => {
        let done = false;
        function finish(token, err) {
          if (done) return;
          done = true;
          window.postMessage({ type: "__ts", token, error: err }, "*");
        }

        let polls = 0;
        const poller = setInterval(() => {
          if (done) { clearInterval(poller); return; }
          polls++;
          if (typeof turnstile !== "undefined") {
            try {
              const r = turnstile.getResponse();
              if (r) { clearInterval(poller); finish(r, null); return; }
            } catch (_) { }
          }
          if (polls === 6) renderOwn();
        }, 500);

        function renderOwn() {
          if (done) return;
          function go() {
            if (done) return;
            const d = document.createElement("div");
            d.style.cssText = "position:fixed;top:-9999px;left:-9999px;";
            document.body.appendChild(d);
            try {
              turnstile.render(d, {
                sitekey: sk,
                callback: (t) => { d.remove(); finish(t, null); },
                "error-callback": (c) => { d.remove(); finish(null, "error:" + c); },
                theme: "dark",
              });
            } catch (e) { d.remove(); finish(null, e.message); }
          }
          if (typeof turnstile !== "undefined") go();
          else {
            const s = document.createElement("script");
            s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
            s.onload = () => setTimeout(go, 200);
            s.onerror = () => finish(null, "script load failed");
            document.head.appendChild(s);
          }
        }
      },
      args: [sitekey],
    });

    const result = await authPromise;
    chrome.tabs.remove(tabId).catch(() => {});
    if (result.error || !result.token) return { success: false, error: result.error || "No token" };
    return { success: true, token: result.token };
  } catch (err) {
    if (tabId) chrome.tabs.remove(tabId).catch(() => {});
    return { success: false, error: err.message };
  }
}

async function authenticateInstance(inst) {
  if (hasValidToken(inst.url)) return { success: true };
  if (inst.apiKey) return { success: true }; // API key auth, no turnstile needed
  const info = await getInstanceInfo(inst.url);
  // No sitekey = instance doesn't require auth, treat as success
  if (!info.turnstileSitekey) return { success: true };
  const frontendUrl = inst.frontend || info.url || inst.url;
  const ts = await solveTurnstile(frontendUrl, info.turnstileSitekey);
  if (!ts.success) return ts;
  return createSession(inst.url, ts.token);
}

// ═══════════════════════════════════════════════════════════════════════════
// PRE-AUTHENTICATION (proactive, runs on alarm + popup open)
// ═══════════════════════════════════════════════════════════════════════════

async function preAuth() {
  if (preAuthInProgress) return;
  preAuthInProgress = true;
  try {
    const settings = await getSettings();
    const allInstances = await getAllInstances();
    const activeUrl = settings.activeInstance || allInstances[0]?.url;
    if (!activeUrl) return;
    if (hasValidToken(activeUrl)) {
      instanceReadiness[activeUrl] = {
        ready: true,
        latency: instanceReadiness[activeUrl]?.latency || null,
        checkedAt: Date.now(),
      };
      return;
    }
    const inst = allInstances.find(i => i.url === activeUrl) || allInstances[0];
    if (inst) {
      const result = await authenticateInstance(inst);
      instanceReadiness[activeUrl] = {
        ready: result.success,
        latency: instanceReadiness[activeUrl]?.latency || null,
        checkedAt: Date.now(),
      };
    }
  } catch (_) {
  } finally {
    preAuthInProgress = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DOWNLOAD
// ═══════════════════════════════════════════════════════════════════════════

const activeDownloads = new Set();

async function tryDownload(instanceUrl, instance, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(instanceUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...getAuthHeaders(instance),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const json = await res.json();

    if (json.status === "error") {
      const code = json.error?.code || "Unknown";
      return { success: false, error: code, isAuthError: code.includes("api.auth") };
    }
    if (json.status === "redirect" || json.status === "tunnel")
      return { success: true, url: json.url, filename: json.filename, status: json.status };
    if (json.status === "picker")
      return { success: true, picker: json.picker, audio: json.audio, audioFilename: json.audioFilename, status: "picker" };
    if (json.status === "local-processing" && json.tunnel?.length)
      return { success: true, url: json.tunnel[0], filename: json.output?.filename || "download", status: "tunnel" };
    return { success: false, error: "Unexpected response", isAuthError: false };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") return { success: false, error: "Request timed out", isAuthError: false };
    throw err;
  }
}

function triggerDownload(url, filename) {
  if (!url) return;
  const opts = { url };
  if (filename) opts.filename = filename;
  try {
    chrome.downloads.download(opts, (downloadId) => {
      if (chrome.runtime.lastError) {
        chrome.tabs.create({ url, active: false });
      }
    });
  } catch (_) {
    chrome.tabs.create({ url, active: false });
  }
}

async function processDownload(url, overrides = {}) {
  if (activeDownloads.has(url)) {
    return { success: false, error: "Download already in progress for this URL" };
  }
  activeDownloads.add(url);
  downloadStates.set(url, { status: "downloading", result: null, startedAt: Date.now() });

  try {
    const result = await _processDownload(url, overrides);
    downloadStates.set(url, { status: result.success ? "success" : "error", result, startedAt: downloadStates.get(url)?.startedAt });
    
    // Auto-trigger native browser download if successful and not a picker
    if (result.success && result.status !== "picker" && result.url) {
      triggerDownload(result.url, result.filename);
    }

    // Auto-clear after 30s
    setTimeout(() => downloadStates.delete(url), 30_000);
    return result;
  } catch (err) {
    downloadStates.set(url, { status: "error", result: { success: false, error: err.message } });
    setTimeout(() => downloadStates.delete(url), 30_000);
    throw err;
  } finally {
    activeDownloads.delete(url);
  }
}

function randomizeFilename(filename) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let hash = "";
  for (let i = 0; i < 6; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const ext = filename && filename.includes(".") ? filename.substring(filename.lastIndexOf(".")) : ".mp4";
  return `${hash}${ext}`;
}

async function _processDownload(url, overrides = {}) {
  const settings = await getSettings();
  const allInstances = await getAllInstances();
  const preferredUrl = overrides.instanceUrl || settings.activeInstance || allInstances[0]?.url;

  const isRandom = settings.filenameStyle === "random";
  const body = {
    url,
    videoQuality: settings.videoQuality,
    audioFormat: settings.audioFormat,
    audioBitrate: settings.audioBitrate,
    downloadMode: settings.downloadMode,
    filenameStyle: isRandom ? "basic" : settings.filenameStyle,
    youtubeVideoCodec: settings.youtubeVideoCodec,
    disableMetadata: settings.disableMetadata,
    convertGif: settings.convertGif,
    ...overrides,
  };
  delete body.instanceUrl;

  const ordered = [...allInstances];
  const pi = ordered.findIndex(i => i.url === preferredUrl);
  if (pi > 0) { const [p] = ordered.splice(pi, 1); ordered.unshift(p); }

  const primary = ordered[0];
  let primaryAttempted = false;

  // PHASE 1: Try the preferred instance first if it has a cached token
  if (primary && (hasValidToken(primary.url) || primary.apiKey)) {
    primaryAttempted = true;
    try {
      const r = await tryDownload(primary.url, primary, body);
      if (r.success) {
        if (isRandom) r.filename = randomizeFilename(r.filename);
        addToHistory({ url: r.url, sourceUrl: url, filename: r.filename, instance: primary.name });
        incrementDownloadCount(primary.url);
        return { ...r, usedInstance: primary.name };
      }
      if (r.isAuthError) { delete tokenCache[primary.url]; saveTokenCache(); }
    } catch (_) { }
  }

  // PHASE 2: Auth + retry the preferred instance
  if (primary && !primaryAttempted) {
    try {
      const auth = await authenticateInstance(primary);
      if (auth.success) {
        const r = await tryDownload(primary.url, primary, body);
        if (r.success) {
          if (isRandom) r.filename = randomizeFilename(r.filename);
          addToHistory({ url: r.url, sourceUrl: url, filename: r.filename, instance: primary.name });
          incrementDownloadCount(primary.url);
          return { ...r, usedInstance: primary.name };
        }
      }
    } catch (_) { }
  }

  // PHASE 3: Smart fallback — prefer instances that don't need Turnstile
  const fallbacks = ordered.slice(1, 15); // top 15 candidates
  // Pre-fetch instance info in parallel to know which need auth
  const infoResults = await Promise.allSettled(
    fallbacks.map(inst => getInstanceInfo(inst.url))
  );
  // Sort: no-auth first, then already-authed, then turnstile-required
  const ranked = fallbacks.map((inst, i) => {
    const info = infoResults[i].status === "fulfilled" ? infoResults[i].value : null;
    const needsTurnstile = info?.turnstileSitekey ? true : false;
    const hasToken = hasValidToken(inst.url) || !!inst.apiKey;
    const priority = hasToken ? 0 : (!needsTurnstile ? 1 : 2);
    return { inst, priority, info };
  }).sort((a, b) => a.priority - b.priority);

  const errors = [];
  for (const { inst } of ranked) {
    if (errors.length >= MAX_FALLBACK_TRIES) break;
    try {
      const auth = await authenticateInstance(inst);
      if (auth.success) {
        const r = await tryDownload(inst.url, inst, body);
        if (r.success) {
          if (isRandom) r.filename = randomizeFilename(r.filename);
          addToHistory({ url: r.url, sourceUrl: url, filename: r.filename, instance: inst.name });
          incrementDownloadCount(inst.url);
          return { ...r, usedInstance: inst.name };
        }
        errors.push(`${inst.name}: ${r.error}`);
      } else {
        errors.push(`${inst.name}: ${auth.error}`);
      }
    } catch (e) { errors.push(`${inst.name}: ${e.message}`); }
  }

  return { success: false, error: `Download failed:\n${errors.join("\n")}`, allFailed: true };
}

// ─── Message handler ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "__ts_done") return false;

  const handlers = {
    download: () => processDownload(message.url, message.overrides || {}),
    preAuth: () => preAuth().then(() => ({ ok: true })),
    checkInstance: () => getInstanceInfo(message.url),
    getActiveDownloads: () => Promise.resolve(
      Array.from(downloadStates.entries()).map(([url, s]) => ({ url, ...s }))
    ),
    pingInstance: () => pingInstance(message.url),
    getInstances: () => getAllInstances(),
    refreshInstances: () => fetchInstances(true).then(() => getAllInstances()),
    getSettings: () => getSettings(),
    saveSettings: () => chrome.storage.local.set({ settings: message.settings }).then(() => ({ ok: true })),
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
      // Return readiness state for all instances so popup can show it instantly
      const settings = await getSettings();
      const activeUrl = settings.activeInstance || "";
      const ready = hasValidToken(activeUrl);
      return { activeReady: ready, readiness: instanceReadiness };
    },
    batchPing: async () => {
      // Ping multiple instances in parallel for faster health checks
      const instances = await getAllInstances();
      const top = instances.slice(0, 8); // only ping top 8
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

// ─── Global Commands & Shortcuts ──────────────────────────────────────────
const SUPPORTED_DOMAINS = [
  "youtube.com", "youtu.be", "twitter.com", "x.com", "instagram.com",
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
        // Run background download
        await processDownload(tab.url);
      }
    } catch (_) {}
  }
});

