# ⏱️ TubeTime — YouTube Analytics

**Know exactly how much time YouTube takes from you.**

TubeTime is a lightweight Chrome extension that measures your *real* YouTube watch time — per video and per channel — and turns it into a clean, actionable dashboard. No accounts, no servers, no distractions. Your data stays in your browser.

---

## ✨ Features
*   **Real Watch Time** — counts only seconds the video is actually playing (pause, tab-switch, and autoplay aware).
*   **Per-Video & Per-Channel** — see which channels and videos eat your day.
*   **Dashboard** — Today, Last 7 Days, and Monthly breakdowns at a glance.
*   **Trend Chart** — daily watch-time bars (7 / 30 days) to spot patterns.
*   **Insight Cards** — daily average, peak watching hour, longest single session.
*   **Channel Drill-Down** — click a channel to see every video you watched there.
*   **Search** — instantly filter channels and videos.
*   **Export** — one click to CSV or JSON.
*   **Privacy First** — all data stored locally via `chrome.storage.local`.
*   **Google Sheets Sync** *(optional)* — batch-archive sessions to your own private spreadsheet.

---

## 🔧 How It Works

TubeTime has four moving parts. The content script measures time, storage holds it, the
service worker syncs it, and the popup shows it.

```
                          ┌──────────────────────────────────────────┐
                          │            YOUTUBE TAB (SPA)             │
                          │   play / pause / ended / URL change      │
                          └────────────────────┬─────────────────────┘
                                               │  events
                                               ▼
                          ┌──────────────────────────────────────────┐
                          │            content.js                    │
                          │  • detect video id from URL              │
                          │  • read title + channel + avatar         │
                          │  • accumulate ONLY while playing         │
                          │  • flush every 5s + on pause/switch      │
                          └────────────────────┬─────────────────────┘
                                               │  write session
                                               ▼
                          ┌──────────────────────────────────────────┐
                          │        chrome.storage.local              │
                          │   key: session_<date>_<videoId>          │
                          │   { title, channel, totalSecs, date … }  │
                          └─────────┬───────────────────────┬────────┘
                                    │ read                  │ "SESSION_UPDATED"
                                    ▼                       ▼
              ┌───────────────────────────────┐   ┌──────────────────────────────┐
              │      popup.html / popup.js    │   │        background.js         │
              │  • aggregate by day/channel   │   │  (service worker)            │
              │  • render dashboard + charts  │   │  • queue pending keys        │
              │  • search / drill-down        │   │  • alarm every 2 min         │
              │  • export CSV / JSON          │   │  • FORCE_FLUSH open tabs     │
              └───────────────────────────────┘   └───────────────┬──────────────┘
                                                                  │ batch append
                                                                  ▼
                                                    ┌──────────────────────────────┐
                                                    │   Google Sheets API (opt.)   │
                                                    │   Date │ Channel │ Title │ s  │
                                                    └──────────────────────────────┘
```

**Watch-time tracking (per video):**

```
  URL has ?v=ID ──► onVideoChange() ──► poll for title/channel ──► attach <video> listeners
                                                                          │
        play ──► startTracking()  (sessionStart = now)                    │
       pause ──► pauseTracking()  (accumulatedSecs += now − sessionStart) ◄┘
   every 5s  ──► flushSession()   ──► storage.local.set(session_<date>_<id>)
   new video ──► flush old ──► reset state ──► repeat
```

---

## 🛠️ Installation (Developer Mode)

1.  **Clone or download** this repository.
2.  Open Chrome → `chrome://extensions/`.
3.  Enable **Developer mode** (top-right toggle).
4.  Click **Load unpacked** and select the project folder.
5.  **Pin** TubeTime for quick access — then watch a video and open the popup.

> Google Sheets sync is optional. Add your OAuth `client_id` in `manifest.json` to enable it.

---

## 👩‍💻 Developed By
Created by **[Nid](https://www.linkedin.com/in/nidhan-p)** — built out of a desire for a precise, clutter-free way to understand digital consumption habits.

---
© 2024 TubeTime | All Rights Reserved.
