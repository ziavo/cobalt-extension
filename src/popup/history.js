import { $, msg, showToast, timeAgo, ICONS } from './ui.js';

export async function renderHistory() {
  const list = $("history-list");
  const empty = $("history-empty");
  if (!list || !empty) return;
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

export function initHistoryHandlers() {
  $("clear-history-btn").addEventListener("click", async () => {
    await msg({ action: "clearHistory" });
    renderHistory();
    showToast("History cleared");
  });
}
