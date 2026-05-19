import {
  $,
  msg,
  setVal,
  isSupported,
  initTabSwitching,
  initClipboardActions
} from './ui.js';
import {
  setSettings,
  setAllInstances,
  setCachedReadiness,
  updateActiveLabel,
  updateDownloadCount,
  renderInstances,
  initSettingsHandlers,
  initAutoSave
} from './settings.js';
import {
  renderHistory,
  initHistoryHandlers
} from './history.js';
import {
  restoreActiveDownloads,
  initDownloadTrigger
} from './downloads.js';

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && isSupported(tab.url)) {
      $("url-input").value = tab.url;
    }
  } catch (_) { }

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url && isSupported(changeInfo.url)) {
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

  const fetchedSettings = await msg({ action: "getSettings" });
  setSettings(fetchedSettings);

  setVal("qs-mode", fetchedSettings.downloadMode);
  setVal("qs-quality", fetchedSettings.videoQuality);
  setVal("qs-audioFormat", fetchedSettings.audioFormat);

  setVal("s-videoQuality", fetchedSettings.videoQuality);
  setVal("s-youtubeVideoCodec", fetchedSettings.youtubeVideoCodec);
  setVal("s-downloadMode", fetchedSettings.downloadMode);
  setVal("s-audioFormat", fetchedSettings.audioFormat);
  setVal("s-audioBitrate", fetchedSettings.audioBitrate);
  setVal("s-filenameStyle", fetchedSettings.filenameStyle);
  $("s-disableMetadata").checked = fetchedSettings.disableMetadata;
  $("s-convertGif").checked = fetchedSettings.convertGif;

  initTabSwitching(renderHistory);
  initClipboardActions();
  initSettingsHandlers();
  initHistoryHandlers();
  initDownloadTrigger();

  updateActiveLabel();
  updateDownloadCount();
  initAutoSave();

  restoreActiveDownloads();

  msg({ action: "preAuth" });

  msg({ action: "getInstances" }).then(inst => {
    const instances = inst || [];
    setAllInstances(instances);
    
    if (instances.length === 0) {
      setTimeout(() => {
        msg({ action: "getInstances" }).then(retry => {
          if (retry?.length) {
            setAllInstances(retry);
            updateActiveLabel();
            renderInstances();
          }
        });
      }, 2000);
    }
    
    updateActiveLabel();
    renderInstances();

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

  msg({ action: "getReadiness" }).then(readiness => {
    setCachedReadiness(readiness?.readiness || {});
    updateActiveLabel(readiness);
  });
}

document.addEventListener("DOMContentLoaded", init);
