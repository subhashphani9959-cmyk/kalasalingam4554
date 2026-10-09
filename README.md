# 🚀 QuickBoard

A lightweight, private, real-time shared clipboard and screenshot board designed for two or more friends to connect via a short room code and exchange text, code snippets, and images instantly.

---

## 🌟 Highlights

- **10-Friend 1-on-1 Channels**: Support for up to 10 friends (`Friend 1` to `Friend 10`). You select **one friend to connect with at a time** from the dropdown, ensuring completely private, isolated 1-on-1 sharing without interference.
- **Role Switcher**: Choose whether you are `👤 You` or `👥 Friend`.
- **Instant Connection**: Zero room codes needed. Anyone opening the link connects immediately.
- **Real-Time Sync**: Everything appears on both screens in real time without refreshing.
- **Copy Text & Code**: One-click `📋 Copy` button on every text message with instant visual confirmation.
- **Direct Screenshot Pasting**: Press `Ctrl+V` anywhere on the screen or inside the input box to instantly paste a screenshot.
- **Image Sharing & Download**:
  - `📋 Copy Image` button directly copies the raw PNG image to your system clipboard so you can paste it anywhere (Paint, Word, IDE, chat).
  - `💾 Save` button downloads the image locally.
  - Click any image to open the full-screen zoom Lightbox.
- **Drag & Drop**: Drag images directly from your desktop or browser into the board.
- **Compact Window Mode (`Alt+C`)**: Tailored layout for small side-by-side floating windows or split-screen tiling.
- **Discreet Camouflage Mode (`Alt+S`)**: Toggles the browser tab title to *"Notes - Scratchpad"*, swaps the favicon to a document icon, and softens colors into a minimal scratchpad theme.
- **Completely Independent & Non-Invasive**: Standard web application with zero surveillance, no system inspection, no webcam/mic access, and no proctoring interference.

---

## 🏃 Quick Start

### 1. Start the Server

```bash
npm start
```

The server will output:
```text
======================================================
   🚀 QuickBoard Real-Time Server Running!
======================================================
 • Local URL:    http://localhost:3000
 • Network URL:  http://10.10.21.1:3000  (Connect from Phone/Laptop)
======================================================
```

### 2. Connect
1. **On your device**: Open `http://localhost:3000` in any browser.
2. Click **Create Private Room** to generate a room code (e.g. `K9X2M4`).
3. Send the code (or the direct URL with `#K9X2M4`) to your friend.
4. **On your friend's device**:
   - If on the same Wi-Fi network: Open `http://10.10.21.1:3000` and enter the room code.
   - Or open the shared link directly.
5. Both status badges will update to `🟢 Connected (2 peers)`.

---

## ⌨️ Shortcuts & Hotkeys

| Action | Shortcut |
| :--- | :--- |
| **Paste Screenshot** | `Ctrl + V` (anywhere on page) |
| **Send Message** | `Enter` (or `Ctrl + Enter`) |
| **New Line** | `Shift + Enter` |
| **Discreet Mode** | `Alt + S` |
| **Compact Window** | `Alt + C` |
| **Close Image Viewer** | `Esc` |

---

## 🌐 Sharing with Friends (Internet & Wi-Fi)

### 1-Click All-in-One Launch (Server + Sync + Cloudflare Tunnel)
```bash
npm run all
```
This single command automatically starts:
1. The **QuickBoard Web Server** on port 3000
2. The **Windows Clipboard Sync Daemon** (for instant Ctrl+C / Ctrl+V sync)
3. The **Cloudflare Public Tunnel** (generates a live public URL for remote friends)

### Standalone Commands:
- **Server only**: `npm start`
- **Clipboard Sync Daemon only**: `npm run sync`
- **Cloudflare Public Tunnel only**: `npm run tunnel`

### Which link should you share?
- **Remote Friend (Anywhere in the world)**: Share the **Cloudflare Public URL** (e.g., `https://xxxx.trycloudflare.com/?friend=1&role=friend`).
- **Same Wi-Fi Router (Phone / Laptop)**: Share the **Network URL** (e.g., `http://10.2.5.79:3000/?friend=1&role=friend`).
- **Do NOT share `localhost`**: `http://localhost:3000` only exists inside your own computer and will never work on your friend's device! Click the **🔗 Share Link** button inside the app to see and copy the right link with 1 click.

---

## 📁 Architecture

- **Backend**: Node.js + Express + Socket.io (configured with 50MB payload limits for high-resolution images).
- **Frontend**: Vanilla HTML5, CSS3 design system, and modern Web APIs (`ClipboardItem`, `FileReader`, Drag & Drop).
- **Storage**: In-memory ephemeral room state (automatically cleans up after sessions end).
