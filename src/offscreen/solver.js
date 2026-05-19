export let turnstileReady = false;
export let turnstileLoadPromise = null;

export function loadTurnstileScript() {
  if (turnstileLoadPromise) return turnstileLoadPromise;
  turnstileLoadPromise = new Promise((resolve, reject) => {
    if (typeof turnstile !== "undefined") {
      turnstileReady = true;
      resolve();
      return;
    }
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

export async function solveTurnstile(sitekey, requestId) {
  await loadTurnstileScript();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Turnstile challenge timed out (20s)"));
    }, 20_000);

    const container = document.getElementById("turnstile-container");
    if (!container) {
      clearTimeout(timeout);
      reject(new Error("Container element #turnstile-container not found"));
      return;
    }
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
