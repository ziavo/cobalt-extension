import {
  tokenCache,
  cacheToken,
  hasValidToken,
  instanceInfoCache,
  instanceReadiness,
  preAuthInProgress,
  setPreAuthInProgress,
  getSettings
} from './storage.js';
import { getAllInstances } from './cobalt.js';

export const TURNSTILE_TIMEOUT_MS = 30_000;
export const INFO_TIMEOUT_MS = 8_000;

export async function getInstanceInfo(instanceUrl) {
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

export async function createSession(instanceUrl, turnstileToken) {
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

export async function solveTurnstile(frontendUrl, sitekey) {
  let tabId = null;
  let timeoutId = null;
  let tabTimeoutId = null;
  let listener = null;
  let tabUpdateListener = null;

  try {
    const authPromise = new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Turnstile timed out (${TURNSTILE_TIMEOUT_MS / 1000}s)`));
      }, TURNSTILE_TIMEOUT_MS);

      listener = function(msg) {
        if (msg.action === "__ts_done") {
          resolve(msg);
        }
      };
      chrome.runtime.onMessage.addListener(listener);
    });

    const tab = await chrome.tabs.create({
      url: frontendUrl,
      active: false
    });
    tabId = tab.id;

    await new Promise((resolve, reject) => {
      tabTimeoutId = setTimeout(() => {
        reject(new Error("Tab timeout"));
      }, TURNSTILE_TIMEOUT_MS);
      
      tabUpdateListener = function(id, info) {
        if (id === tabId && info.status === "complete") {
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(tabUpdateListener);
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
    if (tabId) chrome.tabs.remove(tabId).catch(() => {});
    if (result.error || !result.token) return { success: false, error: result.error || "No token" };
    return { success: true, token: result.token };
  } catch (err) {
    if (tabId) chrome.tabs.remove(tabId).catch(() => {});
    return { success: false, error: err.message };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (tabTimeoutId) {
      clearTimeout(tabTimeoutId);
      tabTimeoutId = null;
    }
    if (listener) {
      chrome.runtime.onMessage.removeListener(listener);
      listener = null;
    }
    if (tabUpdateListener) {
      chrome.tabs.onUpdated.removeListener(tabUpdateListener);
      tabUpdateListener = null;
    }
  }
}

export async function authenticateInstance(inst) {
  if (hasValidToken(inst.url)) return { success: true };
  if (inst.apiKey) return { success: true };
  const info = await getInstanceInfo(inst.url);
  if (!info.turnstileSitekey) return { success: true };
  const frontendUrl = inst.frontend || info.url || inst.url;
  const ts = await solveTurnstile(frontendUrl, info.turnstileSitekey);
  if (!ts.success) return ts;
  return createSession(inst.url, ts.token);
}

export async function preAuth() {
  if (preAuthInProgress) return;
  setPreAuthInProgress(true);
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
      const info = await getInstanceInfo(inst.url);
      if (!info.turnstileSitekey) {
        const result = await authenticateInstance(inst);
        instanceReadiness[activeUrl] = {
          ready: result.success,
          latency: instanceReadiness[activeUrl]?.latency || null,
          checkedAt: Date.now(),
        };
      } else {
        instanceReadiness[activeUrl] = {
          ready: false,
          latency: instanceReadiness[activeUrl]?.latency || null,
          checkedAt: Date.now(),
        };
      }
    }
  } catch (_) {
  } finally {
    setPreAuthInProgress(false);
  }
}
