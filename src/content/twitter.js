window.cobaltInjectTwitter = function injectTwitter() {
  const bars = document.querySelectorAll('div[role="group"][aria-label*="Tweet interactions"], div[role="group"]');
  
  bars.forEach((bar) => {
    if (!bar.querySelector('[data-testid="like"]')) return;
    if (bar.querySelector(".cobalt-download-btn")) return;

    const bookmarkBtn = bar.querySelector('[data-testid="bookmark"]');
    const shareBtn = bar.querySelector('button[aria-label*="Share"]') || bar.querySelector('[aria-label="Share post"]');
    
    const targetBtn = bookmarkBtn || shareBtn;
    if (!targetBtn) return;

    const wrapper = targetBtn.closest('div[role="group"] > div');
    if (!wrapper) return;

    const downloadWrapper = wrapper.cloneNode(true);
    downloadWrapper.classList.add("cobalt-download-btn");

    const btn = downloadWrapper.querySelector("button");
    if (!btn) return;
    btn.setAttribute("aria-label", "Download with Cobalt");
    btn.setAttribute("title", "Download with Cobalt");

    const svg = btn.querySelector("svg");
    if (svg) {
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.innerHTML = `
        <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    }

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (btn.classList.contains("cobalt-loading")) return;
      btn.classList.add("cobalt-loading");

      const originalSvg = svg ? svg.innerHTML : "";
      if (svg) {
        svg.innerHTML = `
          <circle class="cobalt-loading-spinner" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="25 8"/>
        `;
      }

      const article = bar.closest("article");
      let tweetUrl = window.location.href;
      if (article) {
        const timeLink = article.querySelector("time")?.parentElement;
        if (timeLink && timeLink.href) {
          tweetUrl = timeLink.href;
        }
      }

      try {
        const response = await chrome.runtime.sendMessage({ action: "download", url: tweetUrl });
        if (response && response.success) {
          if (response.status === "picker" && response.picker?.length > 0) {
            btn.classList.remove("cobalt-loading");
            if (svg) svg.innerHTML = originalSvg;
            window.cobaltShowPickerMenu(downloadWrapper, response.picker, tweetUrl);
          } else {
            if (svg) {
              svg.innerHTML = `
                <path d="M20 6L9 17l-5-5" stroke="#22c55e" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              `;
            }
            setTimeout(() => {
              btn.classList.remove("cobalt-loading");
              if (svg) svg.innerHTML = originalSvg;
            }, 3000);
          }
        } else {
          throw new Error();
        }
      } catch (err) {
        if (svg) {
          svg.innerHTML = `
            <path d="M18 6L6 18M6 6l12 12" stroke="#ef4444" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          `;
        }
        setTimeout(() => {
          btn.classList.remove("cobalt-loading");
          if (svg) svg.innerHTML = originalSvg;
        }, 3000);
      }
    });

    wrapper.parentNode.insertBefore(downloadWrapper, wrapper.nextSibling);
  });
};
