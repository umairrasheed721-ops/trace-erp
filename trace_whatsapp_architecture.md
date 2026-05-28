# Trace WhatsApp Engine: Architecture Map

This document provides a concise structural map of the WhatsApp Engine codebase, highlighting the key event listeners, state variables, media pipelines, and potential bottlenecks.

---

## 1. Backend: Baileys Engine (`whatsapp_bot.js`)

**Path:** [whatsapp_bot.js](file:///Users/umairrasheed/Desktop/antigravity/trace-erp/backend/engines/whatsapp_bot.js)

### Major Baileys Event Listeners
- `creds.update`: Saves updated database/file authentication credentials.
- `presence.update`: Tracks contacts' online states (typing/recording status) and broadcasts it.
- `connection.update`: Manages connection lifecycle (open, reconnects, QR code ready, session invalidation).
- `messaging-history.set`: Processes initial history sync load to insert historical messages into the DB.
- `messages.update`: Listens for status changes (sent, delivered, read) and checks poll votes for COD order verifications.
- `messages.upsert`: Main message ingestion loop. Handles new messages, deletes, downloads media attachments, triggers transcription/OCR, and feeds the Gemini/fallback response pipeline.

### Media Handling Functions
- `getMessageMediaDetails(msg)`: Extracts attachment type, MIME type, filename, and caption.
- `saveMediaFile(msg, mediaDetails, downloadMediaMessage)`: Downloads, decrypts, and saves attachments locally.
- `transcribeVoiceNote(...)` *(dispatched asynchronously)*: Transcribes audio files to text.
- `scanReceiptOCR(...)` *(dispatched asynchronously)*: Scans receipt images for amounts, txn IDs, and banks.

### WebSocket Broadcast Triggers
- `typing`: Broadcasts `phone` and `isTyping` status when presence changes.
- `messages.update`: Syncs message status (sent/delivered/read) with the client.
- `message`: Syncs new incoming/outgoing messages, poll votes, and quick-replies.
- `message_deleted`: Triggers message bubble revocation.
- `high_risk_triage`: Alerts support agents when high-risk customer intents are detected.
- `human_handoff_required`: Informs client when live support override is active or Gemini escalates.

---

## 2. Frontend: React Chat (`WhatsAppPortal.jsx`)

**Path:** [WhatsAppPortal.jsx](file:///Users/umairrasheed/Desktop/antigravity/trace-erp/frontend/src/pages/WhatsAppPortal.jsx)

### React State Variables (Exact Names)
- `chats`: List of active chat conversations.
- `loadingChats`: Chat listing loader indicator.
- `activeChat`: Selected chat metadata object.
- `messages`: Timeline messages list.
- `loadingMessages`: Timeline loading indicator.
- `searchText`: Left panel contact filter text.
- `inputText`: Chat text area message input.
- `uploading`: Attachment upload activity state.
- `isDragging`: Drag-and-drop overlay state.
- `isRecording`: Mic audio recording status.
- `recordingTime`: Duration counter for voice notes.
- `customerInfo`: Holds `latestOrder`, `orderHistory`, and `geminiMemory`.
- `quickReplies`: List of template quick-replies.
- `quickPills`: Horizontal quick-reply pills text.
- `showQuickReplies`: Toggles quick replies drawer.
- `sendingReply`: Multi-click debounce guard indicator.
- `wsStatus`: WebSocket state indicator.
- `typingStatus`: User typing indicator status map.
- `zoomedImage`: Image zoom lightbox overlay image source.
- `activeNumber`: Connected bot WhatsApp number.
- `activeFilter`: Sidebar chat category selection.
- `slashCmd`: Tracks current autocomplete search query.
- `showSlashMenu`: Toggles slash-commands dropdown.
- `syncingMessages`: Displays chat timeline refresh progress.
- `showCmdPalette`: Toggles global `⌘K` command palette modal.
- `cmdQuery`: Cmd palette search query.
- `cmdActiveIdx`: Selected cmd list index.
- `humanHandoffActive`: Displays banner when manual override is on.
- `showSettings`: Settings modal visibility toggle.

### WebSocket Incoming Event Listeners
- `message_deleted`: Redacts deleted bubbles and removes active quotes.
- `messages.update`: Updates message status tick.
- `message`: Appends/deduplicates new message bubble and moves chat to top of sidebar.
- `typing`: Shows/clears user typing bubble with a auto-reset timeout.
- `transcript`: Displays speech-to-text transcript inline.
- `ocr_result`: Renders payment cards on receipt match and triggers toast notifications.
- `memory_update`: Refreshes Gemini client-side active memory card.

### Main Rendering Sub-Components
- `CustomAudioPlayer`: Inline components for controlling voice note playback with seek sliders.
- `VoiceNoteButton`: Extracted voice recorder toggle.
- `QuickReplyPanel`: Slide-out panel for quick replies search and delivery.
- `MediaUploadOverlay`: Visual backdrop for file drag-and-drop.
- `SettingsModal`: Settings customization window.

---

## 3. Bottlenecks: Top 3 Largest Functions (By Line Count)

### Backend (`whatsapp_bot.js`)
1. `_connect()` (~908 lines): Coordinates connection lifecycle, QR generation, auth storage initialization, and registers all Baileys socket listeners (`presence`, `connection`, `messaging-history`, `messages.update`, `messages.upsert`).
2. `_processQueue()` (~700 lines): Coordinates message queuing, anti-ban pace intervals, WISMO interception, COD verification replies, and the autonomous Gemini/fallback response pipeline.
3. `syncDeepHistory()` (~97 lines): Pulls last 50 historical messages from WhatsApp Web API for active database customers on connection.

### Frontend (`WhatsAppPortal.jsx`)
1. `connectWebSocket()` (~248 lines): Establishes WebSocket client listener, deduplicates incoming messages, handles OCR results, typing states, and updates active conversation list indices.
2. `handleVoiceNote()` (~89 lines): Hooks microphone access, records voice notes, manages time states, packages multipart form uploads, and handles optimistic timeline injection.
3. `handleMediaUpload()` (~72 lines): Coordinates file validation, temp blob creation, optimistic UI bubble insertion, progress, and API uploads.
