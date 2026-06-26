# ⏱️ Focusflow

Track YouTube watch time, per video and per channel, in a clean local dashboard. No accounts, no servers. All data stays in the browser.

## ✨ Features
- **Real watch time**: counts only while the video plays (pause & autoplay aware)
- **Dashboard**: Today, Last 7 Days, Monthly, plus a trend chart & insight cards
- **Channel drill-down**, **search**, **CSV / JSON export**
- **Private**: stored via `chrome.storage.local`
- **Google Sheets sync** *(optional)*

## 🔧 How It Works
```
YouTube tab ──► content.js ──► chrome.storage.local ──► popup (dashboard)
 play/pause     accumulate         session_<date>_<id>        │
                                          │                   └─► background.js ──► Google Sheets (opt.)
```

## 🛠️ Install (Developer Mode)
1. Clone/download this repo
2. Open `chrome://extensions/` and enable **Developer mode**
3. **Load unpacked**, select the project folder, then **Pin** it

> Sheets sync is optional. Add your OAuth `client_id` in `manifest.json`.

## 👩‍💻 By
**[Nid](https://www.linkedin.com/in/nidhan-p)**. A precise, clutter-free way to understand YouTube habits.

---
© 2026 Focusflow
