setInterval(() => {
  const host = window.location.hostname;
  if (host.includes("tiktok.com")) {
    if (typeof window.cobaltInjectTikTok === "function") {
      window.cobaltInjectTikTok();
    }
  } else if (host.includes("youtube.com")) {
    if (typeof window.cobaltInjectYouTube === "function") {
      window.cobaltInjectYouTube();
    }
  } else if (host.includes("twitter.com") || host.includes("x.com")) {
    if (typeof window.cobaltInjectTwitter === "function") {
      window.cobaltInjectTwitter();
    }
  }
}, 1500);
