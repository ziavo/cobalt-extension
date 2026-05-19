import { $, msg, setVal, showToast, ICONS } from './ui.js';

export let settings = null;
export let allInstances = [];
export let cachedReadiness = {};

export function setSettings(val) { settings = val; }
export function setAllInstances(val) { allInstances = val; }
export function setCachedReadiness(val) { cachedReadiness = val; }

export function updateActiveLabel(readiness) {
  if (!settings) return;
  const active = allInstances.find(i => i.url === settings.activeInstance);
  const hostname = active
    ? active.name
    : settings.activeInstance
      ? new URL(settings.activeInstance).hostname
      : "Auto";
  $("active-instance-name").textContent = hostname;

  const readyDot = $("ready-indicator");
  if (readyDot) {
    const isReady = readiness?.activeReady || cachedReadiness[settings.activeInstance]?.ready;
    readyDot.className = `ready-indicator ${isReady ? "ready" : "warming"}`;
    readyDot.title = isReady ? "Auth token cached — ready to download instantly" : "Warming up connection…";
  }
}

export async function updateDownloadCount() {
  try {
    const res = await msg({ action: "getDownloadCount" });
    const count = res?.count || 0;
    const el = $("dl-count");
    if (el) el.textContent = count > 0 ? `${count} downloads` : "";
  } catch (_) { }
}

export function renderInstances() {
  const list = $("instance-list");
  if (!list) return;
  const frag = document.createDocumentFragment();

  const customUrls = new Set((settings.customInstances || []).map(i => i.url));

  if (settings.customInstances?.length) {
    const header = document.createElement("div");
    header.className = "instance-section-header";
    header.textContent = "⭐ Priority Instances";
    frag.appendChild(header);

    settings.customInstances.forEach((inst, idx) => {
      frag.appendChild(createInstanceCard(inst, true, idx));
    });
  }

  const autoInstances = allInstances.filter(i => !customUrls.has(i.url));
  const officialInstances = autoInstances.filter(i => i.trust === "official");
  const communityInstances = autoInstances.filter(i => i.trust !== "official");

  if (officialInstances.length) {
    const header = document.createElement("div");
    header.className = "instance-section-header";
    header.textContent = `★ Official Instances (${officialInstances.length})`;
    frag.appendChild(header);

    officialInstances.forEach(inst => {
      frag.appendChild(createInstanceCard(inst, false));
    });
  }

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

  card.addEventListener("click", (e) => {
    if (e.target.closest(".remove-btn") || e.target.closest(".pin-btn")) return;
    settings.activeInstance = inst.url;
    msg({ action: "saveSettings", settings });
    msg({ action: "preAuth" });
    updateActiveLabel();
    renderInstances();
    showToast(`Switched to ${inst.name}`);
  });

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

export function initSettingsHandlers() {
  $("add-instance-btn").addEventListener("click", () => {
    const nameInput = $("new-instance-name");
    const urlInput = $("new-instance-url");
    const name = nameInput.value.trim();
    let url = urlInput.value.trim();
    if (!name || !url) {
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

  $("check-all-btn").addEventListener("click", async () => {
    const btn = $("check-all-btn");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="width:12px;height:12px;border-width:1.5px;margin-right:4px"></span> Refreshing…`;

    const insts = await msg({ action: "refreshInstances" });
    setAllInstances(insts || []);
    renderInstances();

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

  $("reset-count-btn").addEventListener("click", async () => {
    await msg({ action: "resetDownloadCount" });
    updateDownloadCount();
    showToast("Count reset");
  });
}

export function initAutoSave() {
  let saveTimer = null;

  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveAllSettings, 300);
  }

  document.querySelectorAll(".auto-save").forEach(el => {
    el.addEventListener("change", debouncedSave);
  });

  ["qs-mode", "qs-quality", "qs-audioFormat"].forEach(id => {
    $(id).addEventListener("change", () => {
      settings.downloadMode = $("qs-mode").value;
      settings.videoQuality = $("qs-quality").value;
      settings.audioFormat = $("qs-audioFormat").value;
      
      setVal("s-downloadMode", settings.downloadMode);
      setVal("s-videoQuality", settings.videoQuality);
      setVal("s-audioFormat", settings.audioFormat);
      msg({ action: "saveSettings", settings });
    });
  });
}

export function saveAllSettings() {
  settings.videoQuality = $("s-videoQuality").value;
  settings.youtubeVideoCodec = $("s-youtubeVideoCodec").value;
  settings.downloadMode = $("s-downloadMode").value;
  settings.audioFormat = $("s-audioFormat").value;
  settings.audioBitrate = $("s-audioBitrate").value;
  settings.filenameStyle = $("s-filenameStyle").value;
  settings.disableMetadata = $("s-disableMetadata").checked;
  settings.convertGif = $("s-convertGif").checked;

  msg({ action: "saveSettings", settings });

  setVal("qs-mode", settings.downloadMode);
  setVal("qs-quality", settings.videoQuality);
  setVal("qs-audioFormat", settings.audioFormat);

  const toast = $("settings-toast");
  toast.classList.remove("hidden");
  toast.classList.add("visible");
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.classList.add("hidden"), 200);
  }, 1500);
}
