# 🌌 Cobalt Downloader Extension

[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge%20%7C%20Brave-blueviolet?style=for-the-badge&logo=google-chrome)](https://github.com)
[![Manifest Version](https://img.shields.io/badge/Manifest-V3-success?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Aesthetic](https://img.shields.io/badge/UI-Premium%20Glassmorphism-pink?style=for-the-badge)](https://github.com)

A high-performance, non-blocking media downloader browser extension built for **Cobalt**. Utilizing native Chrome APIs and premium glassmorphic UI principles, this extension bypasses unstable tab-based loops to provide concurrent, reliable, and single-click media acquisitions directly from your browser.

---

## 🚀 Key Features

*   **⚡ Non-Blocking Concurrent Downloads:** Download multiple media streams simultaneously. The button never locks up, and each download runs independently in a beautiful real-time status feed.
*   **🌍 Multi-Source Automated Instance Discovery:** Dynamically queries `cobalt.directory/api/tests` (and falls back to `instances.cobalt.best`) to construct a real-time list of online, high-scoring public instances.
*   **🎨 Premium Glassmorphic UI:** A dark-mode desktop cockpit with curated color harmonies (HSL tailored violet & indigo accents), micro-animations, customizable qualities, default mode selectors, and clean sliders.
*   **🔧 Native Chrome Integration:** Fully integrated with `chrome.downloads` to prompt native "Save As" browser dialogs, eliminating page/tab redirections entirely.
*   **⌨️ Global Command Shortcut (`Alt+Shift+D`):** Instantly trigger background downloads of video/audio from supported tabs at any time, even with the extension popup closed!
*   **🛡️ Smart Fallback Engine:** If an instance fails, times out, or triggers Turnstile authentication, the downloader automatically and silently routes requests to the next healthiest, verified, and high-performance instance.
*   **🔄 Tab-Sync URL Auto-Detection:** Automatically syncs the URL input panel in real-time as you switch browser tabs or navigate on supported media platforms.

---

## 📐 System Architecture

```mermaid
graph TD
    User([User Shortcut or Button Click]) -->|Triggers| ActiveTab[Active Tab Media Link]
    ActiveTab -->|Alt+Shift+D / Action| BG[background.js Service Worker]
    
    subgraph Extension Service Worker (background.js)
        BG -->|Check Cache| Storage[(chrome.storage.local)]
        BG -->|Queries Health & Rank| API[cobalt.directory API]
        BG -->|Fetches Fallbacks| FallbackList[Ranked Safe Instances]
        BG -->|Performs Handshake| AuthEngine[Instance Authenticator]
        BG -->|Triggers Save Dialog| NativeDL[chrome.downloads API]
    end

    subgraph UI Interface (popup.html / popup.js)
        Popup[popup.html Glassmorphic Menu] -->|Queries State| BG
        Popup -->|Renders Real-time Feed| StatusFeed[Concurrent Progress List]
        Popup -->|Pin Priority / Add Custom| InstanceConfig[Custom Instance Panel]
    end
    
    BG <.->|Bidirectional Messaging| Popup
```

---

## 🛠️ Installation Guide

1.  **Clone or Download this Repository:**
    ```bash
    git clone https://github.com/yourusername/cobalt-extension.git
    ```
2.  **Open Chrome Extensions Page:**
    *   Navigate to `chrome://extensions/` in your Chrome, Edge, or Brave browser.
3.  **Enable Developer Mode:**
    *   Toggle the **Developer mode** switch in the top-right corner.
4.  **Load the Extension:**
    *   Click **Load unpacked** in the top-left corner.
    *   Select the **`src/`** directory of this repository (which contains `manifest.json`, the core JS scripts, CSS, and icons).

---

## 📖 Complete User & Configuration Guide

### 1. Download Mode & Quality Settings
*   **Mode Selectors:**
    *   `Auto`: Intelligently captures video + audio at default specs.
    *   `Audio Only`: Automatically extracts the best audio bitrate stream and packages it into your preferred container (`MP3`, `WAV`, `OGG`, `Opus`).
    *   `Mute`: Downloads only the video channel without audio.
*   **Quality Picker:** Select resolutions ranging from `144p` up to `4K / 8K` presets.
*   **Filename Styling:** Customize file naming structures (Pretty, Classic, Basic, Nerdy) to match your offline media library organization.

### 2. Multi-Instance Customization
Navigate to the **Instances** tab to customize your API routes:
*   **Pinning Priority:** Tap the "Star" icon next to any community instance to mark it as a priority path. The engine will always try your pinned instances first.
*   **Custom Instances:** Paste your own private or custom-hosted Cobalt API URL under **Add Priority Instance** to integrate it instantly into the pool.
*   **Auto-Prewarming:** The background worker automatically runs a low-latency check every 10 minutes to pre-authenticate and keep JWT tokens valid for selected instances, providing instant cold-starts.

---

## ⌨️ Custom Shortcuts

| Action | Keyboard Shortcut | Context |
| :--- | :--- | :--- |
| **Quick Download** | `Alt+Shift+D` | **Global** (Works on YouTube, X, TikTok, etc. even when popup is closed) |
| **Instant Enter** | `Enter` | Inside input box (Starts download) |

---

## ⚙️ Supported Platforms

*   **YouTube** & **YouTube Shorts** (`youtube.com`, `youtu.be`)
*   **Twitter / X** (`twitter.com`, `x.com`)
*   **Instagram** (Reels, Posts)
*   **TikTok**
*   **Reddit**
*   **SoundCloud**
*   **Twitch** (Clips)
*   **Vimeo**, **Dailymotion**, **Loom**, **Streamable** & more!

---

## 🔒 Privacy & Safety

*   **Local-First Operations:** No user telemetry, download history, or custom instance settings ever leave your local machine. All download counts, tokens, and instance records are securely saved inside standard `chrome.storage.local`.
*   **No Third-Party Redirects:** Downloads route through highly trusted public instances direct to your browser's local sandbox using Chrome’s native sandbox download manager.
