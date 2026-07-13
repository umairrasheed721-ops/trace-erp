# WhatsApp Local Helper & Extension

This module is a local companion tool designed to bridge the Trace ERP web application and the native WhatsApp Desktop application (on both macOS and Windows). It allows the browser-based ERP (and its Chrome extension) to copy images/media dynamically to the system clipboard and trigger native clipboard pasting (`Ctrl+V` or `Cmd+V`) directly into native WhatsApp chats.

---

## Directory Structure

* `/extension` - Chrome extension loaded into the browser to automate page triggers and capture events on `web.whatsapp.com`.
* `/helper-app` - Node.js local companion daemon (running on port `9099`) that handles background downloading, clipboard manipulation, and shell key-send automation.
* `start-helper.bat` - Windows launcher script (auto-updates files via `git pull` on launch).
* `start-helper.command` - macOS launcher script (auto-updates files via `git pull` on launch).

---

## Setup & Running Instructions

### 1. Prerequisites
* **Node.js**: Installed on the local host machine (v18+ recommended).
* **Git**: Installed and configured for auto-updating.

### 2. Loading the Chrome Extension
1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. Toggle **Developer mode** (top-right corner).
4. Click **Load unpacked** (top-left).
5. Select the `/extension` directory inside this folder.

### 3. Launching the Local Helper Daemon
* **On Windows**: Double-click `start-helper.bat`.
* **On macOS**: Double-click `start-helper.command` (make sure it has execute permissions: `chmod +x start-helper.command`).

Upon launch, the script will:
1. Run `git pull` to fetch the latest updates from the repository.
2. Run `npm install` inside the `helper-app` to set up dependencies.
3. Start the local server at `http://127.0.0.1:9099`.

---

## AI Agent Integration & Usage

Other AI agents or systems can interact with the helper daemon directly:

### 1. Send Images/Media to WhatsApp
Post a JSON payload to the helper's `/paste-image` endpoint:

* **Endpoint**: `POST http://127.0.0.1:9099/paste-image`
* **Headers**: `Content-Type: application/json`
* **Body**:
  ```json
  {
    "imageUrls": [
      "https://cdn.shopify.com/s/files/.../image1.jpg",
      "https://cdn.shopify.com/s/files/.../image2.jpg"
    ]
  }
  ```

### How the Helper Processes the Payload:
1. Downloads the remote images into temp files locally.
2. Platform-specific execution:
   * **macOS (darwin)**: Uses an AppleScript Cocoa AppKit snippet to load the files onto `NSPasteboard` and issues a `keystroke "v" using {command down}` command to focus and paste into the native WhatsApp app.
   * **Windows (win32)**: Invokes the Windows shell protocol handler `Start-Process "whatsapp:"` to focus the native application, sets the Win32 clipboard drop list using PowerShell `[System.Windows.Forms.Clipboard]`, and issues `Ctrl+V` (`^v`) to paste.
