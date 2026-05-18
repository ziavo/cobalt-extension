// ═══════════════════════════════════════════════════════════════════════════
// Cobalt Downloader – Offscreen Turnstile Solver
// Runs in an invisible offscreen document — no tabs, no flicker.
// ═══════════════════════════════════════════════════════════════════════════

let turnstileReady = false;
let turnstileLoadPromise = null;

function loadTurnstileScript() {
  if (turnstileLoadPromise) return turnstileLoadPromise;
  turnstileLoadPromise = new Promise((resolve, reject) => {
    if (typeof turnstile !== "undefined") { turnstileReady = true; resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.onload = () => {
      turnstileReady = true;
      resolve();
    };
    s.onerror = () => reject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(s);
  });
  return turnstileLoadPromise;
}

// Pre-load Turnstile immediately when offscreen doc is created
loadTurnstileScript().catch(() => {});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "__solve_turnstile") return false;

  const { sitekey, requestId } = msg;

  solveTurnstile(sitekey, requestId)
    .then(result => sendResponse(result))
    .catch(err => sendResponse({ success: false, error: err.message, requestId }));

  return true; // async response
});

async function solveTurnstile(sitekey, requestId) {
  // Ensure script is loaded
  await loadTurnstileScript();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Turnstile challenge timed out (20s)"));
    }, 20_000);

    // Clean up any previous widgets
    const container = document.getElementById("turnstile-container");
    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    container.appendChild(widgetDiv);

    try {
      turnstile.render(widgetDiv, {
        sitekey,
        callback: (token) => {
          clearTimeout(timeout);
          container.innerHTML = "";
          resolve({ success: true, token, requestId });
        },
        "error-callback": (code) => {
          clearTimeout(timeout);
          container.innerHTML = "";
          resolve({ success: false, error: "Turnstile error: " + code, requestId });
        },
        "expired-callback": () => {
          clearTimeout(timeout);
          container.innerHTML = "";
          resolve({ success: false, error: "Turnstile token expired", requestId });
        },
        size: "compact",
        theme: "dark",
      });
    } catch (e) {
      clearTimeout(timeout);
      container.innerHTML = "";
      reject(e);
    }
  });
}
