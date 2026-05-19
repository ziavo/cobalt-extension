window.cobaltInjectTikTok = function injectTikTok() {
  const sidebars = document.querySelectorAll(
    'section[class*="SectionActionBarContainer"], div[class*="DivActionBarContainer"]'
  );
  
  sidebars.forEach((sidebar) => {
    if (sidebar.querySelector(".cobalt-download-btn")) return;

    const shareBtn = sidebar.querySelector('button[aria-label^="Share video"]');
    if (!shareBtn) return;

    const downloadBtn = shareBtn.cloneNode(true);
    downloadBtn.classList.add("cobalt-download-btn");
    downloadBtn.setAttribute("aria-label", "Download with Cobalt");
    downloadBtn.removeAttribute("aria-expanded");
    
    const iconSpan = downloadBtn.querySelector('span[class*="SpanIconWrapper"]');
    if (iconSpan) {
      iconSpan.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="24" height="24">
          <path d="M12 3v13m0 0l-4-4m4 4l4-4M5 20h14" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    }

    const labelStrong = downloadBtn.querySelector('strong[class*="StrongText"]');
    if (labelStrong) {
      labelStrong.innerText = "Save";
    }

    downloadBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (downloadBtn.classList.contains("cobalt-loading")) return;
      downloadBtn.classList.add("cobalt-loading");

      if (labelStrong) labelStrong.innerText = "Saving...";
      
      const originalIcon = iconSpan ? iconSpan.innerHTML : "";
      if (iconSpan) {
        iconSpan.innerHTML = `
          <svg class="cobalt-loading-spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="24" height="24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="30 10" fill="none" />
          </svg>
        `;
      }

      let videoUrl = window.location.href;
      
      try {
        if (!videoUrl.includes("/video/") && !videoUrl.includes("/photo/")) {
          let parent = sidebar.parentElement;
          let foundUrl = null;
          for (let i = 0; i < 8 && parent; i++) {
            const link = parent.querySelector('a[href*="/video/"], a[href*="/photo/"]');
            if (link && link.href) {
              foundUrl = link.href;
              break;
            }
            parent = parent.parentElement;
          }
          if (foundUrl) {
            videoUrl = foundUrl;
          }
        }

        console.log("[Cobalt] Resolved URL:", videoUrl);

        if (!videoUrl.includes("/video/") && !videoUrl.includes("/photo/")) {
          throw new Error("Could not find post URL. Please open the post directly.");
        }

        const response = await chrome.runtime.sendMessage({ action: "download", url: videoUrl });
        if (response && response.success) {
          if (response.status === "picker" && response.picker?.length > 0) {
            downloadBtn.classList.remove("cobalt-loading");
            if (labelStrong) labelStrong.innerText = "Save";
            if (iconSpan) iconSpan.innerHTML = originalIcon;
            window.cobaltShowPickerMenu(downloadBtn, response.picker, videoUrl);
          } else {
            if (labelStrong) labelStrong.innerText = "Saved!";
            if (iconSpan) {
              iconSpan.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3.5" width="24" height="24">
                  <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              `;
            }
            setTimeout(() => {
              downloadBtn.classList.remove("cobalt-loading");
              if (labelStrong) labelStrong.innerText = "Save";
              if (iconSpan) iconSpan.innerHTML = originalIcon;
            }, 3000);
          }
        } else {
          throw new Error(response?.error || "Download failed");
        }
      } catch (err) {
        console.error("[Cobalt Error]:", err);
        if (labelStrong) labelStrong.innerText = "Error";
        if (iconSpan) {
          iconSpan.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3.5" width="24" height="24">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        }
        setTimeout(() => {
          downloadBtn.classList.remove("cobalt-loading");
          if (labelStrong) labelStrong.innerText = "Save";
          if (iconSpan) iconSpan.innerHTML = originalIcon;
        }, 3000);
      }
    });

    shareBtn.parentNode.insertBefore(downloadBtn, shareBtn.nextSibling);
  });
};
