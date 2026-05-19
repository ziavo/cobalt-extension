import {
  tokenCache,
  saveTokenCache,
  hasValidToken,
  getAuthHeaders,
  getSettings,
  addToHistory,
  incrementDownloadCount,
  updateBadge,
  downloadStates,
  activeDownloads,
  nativeDownloads,
  instanceReadiness
} from './storage.js';
import { authenticateInstance, getInstanceInfo } from './turnstile.js';

export const INSTANCES_API = "https://instances.cobalt.best/api/instances.json";
export const INSTANCES_CACHE_MS = 30 * 60 * 1000;
export const DOWNLOAD_TIMEOUT_MS = 20_000;
export const MAX_FALLBACK_TRIES = 5;

export let cachedInstances = null;
export let instancesFetchedAt = 0;

export async function fetchInstances(force = false) {
  if (!force && cachedInstances && Date.now() - instancesFetchedAt < INSTANCES_CACHE_MS) {
    return cachedInstances;
  }

  try {
    const data = await chrome.storage.local.get("cachedInstances");
    if (!force && data.cachedInstances?.instances?.length) {
      cachedInstances = data.cachedInstances.instances;
      instancesFetchedAt = data.cachedInstances.fetchedAt || 0;
      return cachedInstances;
    }
  } catch (_) { }

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
      if (a.trust === "official" && b.trust !== "official") return -1;
      if (b.trust === "official" && a.trust !== "official") return 1;
      return b.score - a.score;
    });
}

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

export async function getAllInstances() {
  const [apiInstances, settings] = await Promise.all([fetchInstances(), getSettings()]);
  const custom = (settings.customInstances || []).map(i => ({ ...i, trust: "custom" }));
  const seen = new Set();
  const merged = [];
  for (const inst of [...custom, ...apiInstances]) {
    if (!seen.has(inst.url)) { seen.add(inst.url); merged.push(inst); }
  }
  return merged;
}

export async function pingInstance(instanceUrl) {
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

export async function tryDownload(instanceUrl, instance, body) {
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

export function triggerDownload(url, filename, sourceUrl) {
  if (!url) return;
  const opts = { url };
  if (filename) {
    const hasExtension = filename.includes(".") && filename.lastIndexOf(".") > filename.lastIndexOf("/");
    if (!hasExtension) {
      let ext = "";
      try {
        const u = new URL(url);
        const pathname = u.pathname;
        const lastSlash = pathname.lastIndexOf("/");
        const file = lastSlash !== -1 ? pathname.substring(lastSlash + 1) : pathname;
        const dot = file.lastIndexOf(".");
        if (dot !== -1) {
          ext = file.substring(dot);
        }
      } catch (_) {}
      
      if (ext) {
        const q = ext.indexOf("?");
        if (q !== -1) ext = ext.substring(0, q);
        const h = ext.indexOf("#");
        if (h !== -1) ext = ext.substring(0, h);
        const match = ext.match(/^\.[a-zA-Z0-9]{1,5}$/);
        if (!match) ext = "";
      }
      
      if (!ext) {
        if (url.includes("video") || url.includes(".mp4")) {
          ext = ".mp4";
        } else {
          ext = ".jpg";
        }
      }
      opts.filename = filename + ext;
    } else {
      opts.filename = filename;
    }
  }
  try {
    chrome.downloads.download(opts, (downloadId) => {
      if (chrome.runtime.lastError) {
        chrome.tabs.create({ url, active: false });
      } else if (downloadId && sourceUrl) {
        nativeDownloads.set(downloadId, sourceUrl);
        const state = downloadStates.get(sourceUrl);
        if (state) {
          state.status = "downloading-file";
          state.percent = 0;
          state.downloadId = downloadId;
          downloadStates.set(sourceUrl, state);
        }
      }
    });
  } catch (_) {
    chrome.tabs.create({ url, active: false });
  }
}

export function randomizeFilename(filename) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let hash = "";
  for (let i = 0; i < 6; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const ext = filename && filename.includes(".") ? filename.substring(filename.lastIndexOf(".")) : ".mp4";
  return `${hash}${ext}`;
}

export async function getFileSize(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    const len = res.headers.get("content-length");
    if (len) {
      const bytes = parseInt(len, 10);
      if (!isNaN(bytes) && bytes > 0) {
        if (bytes < 1024) return bytes + " B";
        const kb = bytes / 1024;
        if (kb < 1024) return kb.toFixed(1) + " KB";
        const mb = kb / 1024;
        if (mb < 1024) return mb.toFixed(1) + " MB";
        const gb = mb / 1024;
        return gb.toFixed(1) + " GB";
      }
    }
  } catch (_) {}
  return null;
}

export async function processDownload(url, overrides = {}) {
  if (activeDownloads.has(url)) {
    return { success: false, error: "Download already in progress for this URL" };
  }
  activeDownloads.add(url);
  downloadStates.set(url, { status: "downloading", result: null, startedAt: Date.now() });

  try {
    const result = await _processDownload(url, overrides);
    downloadStates.set(url, { status: result.success ? "success" : "error", result, startedAt: downloadStates.get(url)?.startedAt });
    
    if (result.success && result.status !== "picker" && result.url) {
      triggerDownload(result.url, result.filename, url);
    }

    const current = downloadStates.get(url);
    if (current && current.status !== "downloading-file") {
      setTimeout(() => downloadStates.delete(url), 30_000);
    }
    return result;
  } catch (err) {
    downloadStates.set(url, { status: "error", result: { success: false, error: err.message } });
    setTimeout(() => downloadStates.delete(url), 30_000);
    throw err;
  } finally {
    activeDownloads.delete(url);
  }
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

  if (primary && (hasValidToken(primary.url) || primary.apiKey)) {
    primaryAttempted = true;
    try {
      const r = await tryDownload(primary.url, primary, body);
      if (r.success) {
        if (isRandom) r.filename = randomizeFilename(r.filename);
        if (r.url && r.status !== "picker") {
          const sz = await getFileSize(r.url);
          if (sz) r.fileSize = sz;
        }
        addToHistory({ url: r.url, sourceUrl: url, filename: r.filename, instance: primary.name, fileSize: r.fileSize });
        incrementDownloadCount(primary.url);
        return { ...r, usedInstance: primary.name };
      }
      if (r.isAuthError) { delete tokenCache[primary.url]; saveTokenCache(); }
    } catch (_) { }
  }

  if (primary && !primaryAttempted) {
    try {
      const auth = await authenticateInstance(primary);
      if (auth.success) {
        const r = await tryDownload(primary.url, primary, body);
        if (r.success) {
          if (isRandom) r.filename = randomizeFilename(r.filename);
          if (r.url && r.status !== "picker") {
            const sz = await getFileSize(r.url);
            if (sz) r.fileSize = sz;
          }
          addToHistory({ url: r.url, sourceUrl: url, filename: r.filename, instance: primary.name, fileSize: r.fileSize });
          incrementDownloadCount(primary.url);
          return { ...r, usedInstance: primary.name };
        }
      }
    } catch (_) { }
  }

  const fallbacks = ordered.slice(1, 15);
  const infoResults = await Promise.allSettled(
    fallbacks.map(inst => getInstanceInfo(inst.url))
  );
  
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
          if (r.url && r.status !== "picker") {
            const sz = await getFileSize(r.url);
            if (sz) r.fileSize = sz;
          }
          addToHistory({ url: r.url, sourceUrl: url, filename: r.filename, instance: inst.name, fileSize: r.fileSize });
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

chrome.downloads.onChanged.addListener((delta) => {
  const downloadId = delta.id;
  const sourceUrl = nativeDownloads.get(downloadId);
  if (!sourceUrl) return;

  const state = downloadStates.get(sourceUrl);
  if (!state) return;

  chrome.downloads.search({ id: downloadId }, (items) => {
    if (!items || items.length === 0) return;
    const item = items[0];

    if (item.state === "in_progress") {
      if (item.totalBytes > 0) {
        const pct = Math.round((item.bytesReceived / item.totalBytes) * 100);
        state.status = "downloading-file";
        state.percent = pct;
        downloadStates.set(sourceUrl, state);

        chrome.action.setBadgeText({ text: `${pct}%` });
        chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
      }
    } else if (item.state === "complete") {
      state.status = "success";
      state.percent = 100;
      downloadStates.set(sourceUrl, state);
      nativeDownloads.delete(downloadId);

      updateBadge();
      setTimeout(() => downloadStates.delete(sourceUrl), 30_000);
    } else if (item.state === "interrupted") {
      state.status = "error";
      if (!state.result) state.result = {};
      state.result.error = "Download interrupted";
      downloadStates.set(sourceUrl, state);
      nativeDownloads.delete(downloadId);

      updateBadge();
      setTimeout(() => downloadStates.delete(sourceUrl), 30_000);
    }
  });
});
