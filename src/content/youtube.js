window.cobaltInjectYouTube = function injectYouTube() {
  const menuRenderers = document.querySelectorAll(
    "ytd-menu-renderer #top-level-buttons-computed, ytd-menu-renderer #items"
  );
  
  menuRenderers.forEach((menu) => {
    if (menu.querySelector(".cobalt-download-btn")) return;

    const targetBtn = menu.querySelector("yt-button-view-model");
    if (!targetBtn) return;

    const downloadBtn = targetBtn.cloneNode(true);
    downloadBtn.classList.add("cobalt-download-btn");

    const textSpan = downloadBtn.querySelector(
      "yt-formatted-string, span, div.yt-spec-button-shape-next__button-text-content"
    );
    if (textSpan) {
      textSpan.textContent = "Save";
    }

    const svg = downloadBtn.querySelector("svg");
    if (svg) {
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.innerHTML = `
        <path d="M12 3v13m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    }

    downloadBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (downloadBtn.classList.contains("cobalt-loading")) return;
      downloadBtn.classList.add("cobalt-loading");

      if (textSpan) textSpan.textContent = "Saving...";
      
      const originalSvg = svg ? svg.innerHTML : "";
      if (svg) {
        svg.innerHTML = `
          <circle class="cobalt-loading-spinner" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="25 8"/>
        `;
      }

      try {
        const response = await chrome.runtime.sendMessage({ action: "download", url: window.location.href });
        if (response && response.success) {
          if (response.status === "picker" && response.picker?.length > 0) {
            downloadBtn.classList.remove("cobalt-loading");
            if (textSpan) textSpan.textContent = "Save";
            if (svg) svg.innerHTML = originalSvg;
            window.cobaltShowPickerMenu(downloadBtn, response.picker, window.location.href);
          } else {
            if (textSpan) textSpan.textContent = "Saved!";
            if (svg) {
              svg.innerHTML = `
                <path d="M20 6L9 17l-5-5" stroke="#22c55e" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              `;
            }
            setTimeout(() => {
              downloadBtn.classList.remove("cobalt-loading");
              if (textSpan) textSpan.textContent = "Save";
              if (svg) svg.innerHTML = originalSvg;
            }, 3000);
          }
        } else {
          throw new Error();
        }
      } catch (err) {
        if (textSpan) textSpan.textContent = "Error";
        if (svg) {
          svg.innerHTML = `
            <path d="M18 6L6 18M6 6l12 12" stroke="#ef4444" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          `;
        }
        setTimeout(() => {
          downloadBtn.classList.remove("cobalt-loading");
          if (textSpan) textSpan.textContent = "Save";
          if (svg) svg.innerHTML = originalSvg;
        }, 3000);
      }
    });

    menu.appendChild(downloadBtn);
  });
};
