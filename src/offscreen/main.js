import { loadTurnstileScript, solveTurnstile } from './solver.js';

loadTurnstileScript().catch(() => {});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "__solve_turnstile") return false;

  const { sitekey, requestId } = msg;

  solveTurnstile(sitekey, requestId)
    .then(result => sendResponse(result))
    .catch(err => sendResponse({ success: false, error: err.message, requestId }));

  return true;
});
