# Jable Favourites Exporter

> 🔧 A Tampermonkey user script to export all favourite or watch-later videos from [Jable.tv](https://jable.tv/) — even when pagination is loaded dynamically.

---

## 📦 Features

✅ Export all items across multiple pages (auto-click pagination).  
✅ Supports both **「影片收藏」** and **「稍後觀看」** pages.  
✅ Works even when Jable uses AJAX to load content (no API access needed).  
✅ Output format: **JSON** (default) or **CSV** (toggleable).  
✅ Compatible with modern browsers (Chrome / Edge / Firefox).  
✅ No external dependencies.  

---

## 🚀 Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2. Visit the script file: jable-favourites-exporter.user.js
3. Tampermonkey will prompt to install the script — click **Install**.

---

## 🧭 Usage

1. Go to your Jable account:
- **影片收藏** → `https://jable.tv/my/favourites/videos/`
- **稍後觀看** → `https://jable.tv/my/favourites/videos-watch-later/`
2. Wait until all thumbnails are loaded.
3. Click the **「匯出全部」** button (next to ⚙️ 設定).
4. The script will:
- Simulate clicking each pagination button.
- Collect video titles and URLs.
- Export a JSON or CSV file automatically.

---

## 💾 Output Files

| Page | URL | Output filename |
|------|-----|-----------------|
| 影片收藏 | `https://jable.tv/my/favourites/videos/` | `favourites_list.json` (or `.csv`) |
| 稍後觀看 | `https://jable.tv/my/favourites/videos-watch-later/` | `watch_later_list.json` (or `.csv`) |

You can change export format by editing this line in the script:
```js
var EXPORT_FORMAT = 'json'; // or 'csv'
