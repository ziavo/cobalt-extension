const style = document.createElement("style");
style.textContent = `
  @keyframes cobalt-rotate {
    100% { transform: rotate(360deg); }
  }
  .cobalt-loading-spinner {
    animation: cobalt-rotate 1s linear infinite !important;
    transform-origin: center !important;
  }
  .cobalt-loading {
    opacity: 0.6 !important;
    pointer-events: none !important;
  }
`;
document.head.appendChild(style);

window.cobaltShowPickerMenu = function showPickerMenu(anchorButton, pickerItems, sourceUrl) {
  const existingPicker = document.querySelector(".cobalt-picker-menu");
  if (existingPicker) existingPicker.remove();

  const menu = document.createElement("div");
  menu.className = "cobalt-picker-menu";
  
  menu.style.position = "absolute";
  menu.style.zIndex = "2147483647";
  menu.style.background = "rgba(15, 23, 42, 0.92)";
  menu.style.backdropFilter = "blur(20px)";
  menu.style.webkitBackdropFilter = "blur(20px)";
  menu.style.border = "1px solid rgba(255, 255, 255, 0.12)";
  menu.style.borderRadius = "16px";
  menu.style.padding = "16px";
  menu.style.width = "320px";
  menu.style.boxShadow = "0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 1px 1px rgba(255,255,255,0.1) inset";
  menu.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  menu.style.color = "#ffffff";
  menu.style.display = "flex";
  menu.style.flexDirection = "column";
  menu.style.gap = "12px";

  const rect = anchorButton.getBoundingClientRect();
  menu.style.left = `${rect.left + window.scrollX}px`;
  menu.style.top = `${rect.bottom + window.scrollY + 8}px`;

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.borderBottom = "1px solid rgba(255, 255, 255, 0.1)";
  header.style.paddingBottom = "8px";

  const title = document.createElement("span");
  title.innerText = "Select items to save";
  title.style.fontWeight = "600";
  title.style.fontSize = "14px";
  
  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "&times;";
  closeBtn.style.background = "none";
  closeBtn.style.border = "none";
  closeBtn.style.color = "rgba(255, 255, 255, 0.6)";
  closeBtn.style.fontSize = "18px";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.padding = "0 4px";
  closeBtn.addEventListener("click", () => menu.remove());

  header.appendChild(title);
  header.appendChild(closeBtn);
  menu.appendChild(header);

  const listContainer = document.createElement("div");
  listContainer.style.display = "flex";
  listContainer.style.flexDirection = "column";
  listContainer.style.gap = "8px";
  listContainer.style.maxHeight = "240px";
  listContainer.style.overflowY = "auto";
  listContainer.style.paddingRight = "4px";

  pickerItems.forEach((item, index) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gap = "10px";
    row.style.padding = "8px";
    row.style.borderRadius = "8px";
    row.style.background = "rgba(255, 255, 255, 0.04)";
    row.style.border = "1px solid rgba(255, 255, 255, 0.04)";

    const leftSide = document.createElement("div");
    leftSide.style.display = "flex";
    leftSide.style.alignItems = "center";
    leftSide.style.gap = "8px";

    if (item.thumb) {
      const img = document.createElement("img");
      img.src = item.thumb;
      img.style.width = "40px";
      img.style.height = "40px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "6px";
      img.style.border = "1px solid rgba(255, 255, 255, 0.08)";
      leftSide.appendChild(img);
    } else {
      const iconSpan = document.createElement("span");
      iconSpan.style.width = "40px";
      iconSpan.style.height = "40px";
      iconSpan.style.background = "rgba(255, 255, 255, 0.06)";
      iconSpan.style.borderRadius = "6px";
      iconSpan.style.display = "flex";
      iconSpan.style.alignItems = "center";
      iconSpan.style.justifyContent = "center";
      iconSpan.style.color = "#818cf8";
      
      if (item.type === "video") {
        iconSpan.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="23 7 16 12 23 17 23 7"></polygon>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
        `;
      } else {
        iconSpan.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        `;
      }
      leftSide.appendChild(iconSpan);
    }

    const info = document.createElement("div");
    info.style.display = "flex";
    info.style.flexDirection = "column";

    const label = document.createElement("span");
    label.innerText = `Item ${index + 1}`;
    label.style.fontSize = "13px";
    label.style.fontWeight = "500";

    const typeLabel = document.createElement("span");
    typeLabel.innerText = item.type === "video" ? "Video" : "Photo";
    typeLabel.style.fontSize = "11px";
    typeLabel.style.color = "rgba(255, 255, 255, 0.4)";

    info.appendChild(label);
    info.appendChild(typeLabel);
    leftSide.appendChild(info);

    const dlBtn = document.createElement("button");
    dlBtn.innerText = "Save";
    dlBtn.style.padding = "6px 12px";
    dlBtn.style.background = "#818cf8";
    dlBtn.style.border = "none";
    dlBtn.style.borderRadius = "6px";
    dlBtn.style.color = "#ffffff";
    dlBtn.style.fontSize = "12px";
    dlBtn.style.fontWeight = "600";
    dlBtn.style.cursor = "pointer";
    dlBtn.style.transition = "background 0.2s";

    dlBtn.addEventListener("mouseover", () => dlBtn.style.background = "#6366f1");
    dlBtn.addEventListener("mouseout", () => dlBtn.style.background = "#818cf8");

    dlBtn.addEventListener("click", async () => {
      dlBtn.innerText = "Saving...";
      dlBtn.style.background = "rgba(255, 255, 255, 0.2)";
      dlBtn.style.pointerEvents = "none";

      try {
        const res = await chrome.runtime.sendMessage({
          action: "triggerDownload",
          url: item.url,
          filename: `cobalt_save_${index + 1}`,
          sourceUrl: sourceUrl
        });
        if (res && res.ok) {
          dlBtn.innerText = "Saved!";
          dlBtn.style.background = "#22c55e";
        } else {
          throw new Error();
        }
      } catch (err) {
        dlBtn.innerText = "Failed";
        dlBtn.style.background = "#ef4444";
      } finally {
        setTimeout(() => {
          dlBtn.innerText = "Save";
          dlBtn.style.background = "#818cf8";
          dlBtn.style.pointerEvents = "auto";
        }, 2000);
      }
    });

    row.appendChild(leftSide);
    row.appendChild(dlBtn);
    listContainer.appendChild(row);
  });

  menu.appendChild(listContainer);

  const footer = document.createElement("div");
  footer.style.display = "flex";
  footer.style.gap = "8px";
  footer.style.borderTop = "1px solid rgba(255, 255, 255, 0.1)";
  footer.style.paddingTop = "12px";

  const dlAllBtn = document.createElement("button");
  dlAllBtn.innerText = `Download All (${pickerItems.length})`;
  dlAllBtn.style.flexGrow = "1";
  dlAllBtn.style.padding = "8px";
  dlAllBtn.style.background = "rgba(255, 255, 255, 0.1)";
  dlAllBtn.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  dlAllBtn.style.borderRadius = "8px";
  dlAllBtn.style.color = "#ffffff";
  dlAllBtn.style.fontSize = "13px";
  dlAllBtn.style.fontWeight = "600";
  dlAllBtn.style.cursor = "pointer";
  dlAllBtn.style.transition = "background 0.2s, border-color 0.2s";

  dlAllBtn.addEventListener("mouseover", () => {
    dlAllBtn.style.background = "rgba(255, 255, 255, 0.15)";
    dlAllBtn.style.borderColor = "rgba(255, 255, 255, 0.3)";
  });
  dlAllBtn.addEventListener("mouseout", () => {
    dlAllBtn.style.background = "rgba(255, 255, 255, 0.1)";
    dlAllBtn.style.borderColor = "rgba(255, 255, 255, 0.2)";
  });

  dlAllBtn.addEventListener("click", async () => {
    dlAllBtn.innerText = "Downloading...";
    dlAllBtn.style.pointerEvents = "none";
    
    for (let i = 0; i < pickerItems.length; i++) {
      const item = pickerItems[i];
      try {
        await chrome.runtime.sendMessage({
          action: "triggerDownload",
          url: item.url,
          filename: `cobalt_save_all_${i + 1}`,
          sourceUrl: sourceUrl
        });
      } catch (e) {
        console.error("Failed to download item:", i, e);
      }
      await new Promise(r => setTimeout(r, 200));
    }

    dlAllBtn.innerText = "All Downloads Started!";
    dlAllBtn.style.background = "#22c55e";
    setTimeout(() => {
      menu.remove();
    }, 2000);
  });

  footer.appendChild(dlAllBtn);
  menu.appendChild(footer);

  document.body.appendChild(menu);

  function clickOutsideHandler(e) {
    if (!menu.contains(e.target) && !anchorButton.contains(e.target)) {
      menu.remove();
      document.removeEventListener("mousedown", clickOutsideHandler);
    }
  }
  document.addEventListener("mousedown", clickOutsideHandler);
};
