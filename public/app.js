/**
 * QuickBoard - Instant Shared Board with Comprehensive Clipboard Sync
 * Full support for WhatsApp images, screenshots, and bidirectional clipboard sync.
 */

(function () {
  'use strict';

  // --- DOM Elements ---
  // --- DOM Elements ---
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const btnClearBoard = document.getElementById('btnClearBoard');
  const btnToggleAutoCopy = document.getElementById('btnToggleAutoCopy');
  const btnToggleAutoFocus = document.getElementById('btnToggleAutoFocus');
  const btnRoleYou = document.getElementById('btnRoleYou');
  const btnRoleFriend = document.getElementById('btnRoleFriend');
  const friendSelect = document.getElementById('friendSelect');
  const pickerLabel = document.getElementById('pickerLabel');
  const nameLabel = document.getElementById('nameLabel');
  const userNameInput = document.getElementById('userNameInput');
  const btnShareLink = document.getElementById('btnShareLink');

  // Feed & Input
  const boardFeed = document.getElementById('boardFeed');
  const messageList = document.getElementById('messageList');
  const boardEmptyState = document.getElementById('boardEmptyState');
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');
  const btnPullClipboard = document.getElementById('btnPullClipboard');
  const btnUploadImage = document.getElementById('btnUploadImage');
  const imageFileInput = document.getElementById('imageFileInput');

  // Pending Attachment
  const pendingAttachment = document.getElementById('pendingAttachment');
  const attachmentThumbnail = document.getElementById('attachmentThumbnail');
  const attachmentName = document.getElementById('attachmentName');
  const attachmentSize = document.getElementById('attachmentSize');
  const btnCancelAttachment = document.getElementById('btnCancelAttachment');
  const btnSendAttachment = document.getElementById('btnSendAttachment');

  // Drag & Drop and Lightbox
  const dragDropOverlay = document.getElementById('dragDropOverlay');
  const imageLightbox = document.getElementById('imageLightbox');
  const lightboxImage = document.getElementById('lightboxImage');
  const lightboxTitle = document.getElementById('lightboxTitle');
  const lightboxBackdrop = document.getElementById('lightboxBackdrop');
  const btnLightboxClose = document.getElementById('btnLightboxClose');
  const btnLightboxCopy = document.getElementById('btnLightboxCopy');
  const btnLightboxDownload = document.getElementById('btnLightboxDownload');

  const toastContainer = document.getElementById('toastContainer');

  // Share / Connect Modal Elements
  const shareModal = document.getElementById('shareModal');
  const shareBackdrop = document.getElementById('shareBackdrop');
  const btnShareModalClose = document.getElementById('btnShareModalClose');
  const shareModalTitle = document.getElementById('shareModalTitle');
  const shareUrlPublic = document.getElementById('shareUrlPublic');
  const shareUrlNetwork = document.getElementById('shareUrlNetwork');
  const shareUrlLocal = document.getElementById('shareUrlLocal');
  const btnCopyPublic = document.getElementById('btnCopyPublic');
  const btnCopyNetwork = document.getElementById('btnCopyNetwork');
  const btnCopyLocal = document.getElementById('btnCopyLocal');
  const sharePublicTip = document.getElementById('sharePublicTip');

  let serverNetworkInfo = {
    localIp: window.location.hostname || 'localhost',
    port: window.location.port || '3000',
    tunnelUrl: null
  };

  async function fetchNetworkInfo() {
    try {
      const res = await fetch('/api/info');
      if (res.ok) {
        const data = await res.json();
        if (data) {
          serverNetworkInfo = Object.assign(serverNetworkInfo, data);
          if (data.channelNames) updateChannelNamesDropdown(data.channelNames);
        }
      }
    } catch (e) {
      console.warn('Could not fetch /api/info:', e);
    }
  }

  // --- Parse URL Parameters (Direct Friend Links) ---
  const urlParams = new URLSearchParams(window.location.search);
  const paramFriend = urlParams.get('friend') || urlParams.get('channel') || urlParams.get('id');
  const paramRole = urlParams.get('role');
  const paramName = urlParams.get('name');

  let currentRole = 'You';
  if (paramRole) {
    currentRole = (paramRole.toLowerCase() === 'friend') ? 'Friend' : 'You';
  } else {
    currentRole = localStorage.getItem('qb_role') || 'You';
  }

  let currentFriendId = 1;
  if (paramFriend) {
    const parsed = parseInt(paramFriend, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
      currentFriendId = parsed;
    }
  } else {
    currentFriendId = parseInt(localStorage.getItem('qb_active_friend') || '1', 10);
    if (isNaN(currentFriendId) || currentFriendId < 1 || currentFriendId > 10) currentFriendId = 1;
  }

  let currentUserName = paramName ? paramName.trim().slice(0, 24) : (localStorage.getItem('qb_user_name') || '');
  let channelNames = {}; // friendId -> customName

  // --- State Variables ---
  let socket = null;
  let stagedImage = null;
  let activeLightboxImage = null;
  let lastPastedText = '';
  let autoCopyIncoming = true;
  let autoPasteOnFocus = true;
  let pendingIncomingToCopy = null; // Holds friend's message if tab was in background

  // Initialize Socket.io
  function initSocket() {
    socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('Connected to shared QuickBoard:', socket.id);
      switchChannel(currentFriendId, currentRole);
    });

    socket.on('disconnect', () => {
      updateStatusBadge('disconnected', 'Disconnected. Reconnecting...');
    });

    socket.on('network-info', (info) => {
      if (info) {
        serverNetworkInfo = Object.assign(serverNetworkInfo, info);
      }
    });

    socket.on('channel-status', (status) => {
      if (status && status.friendId === currentFriendId) {
        if (status.channelNames) {
          updateChannelNamesDropdown(status.channelNames);
        }
        updateChannelUI(status);
      }
    });

    socket.on('names-updated', (names) => {
      if (names) {
        const prevName = channelNames[currentFriendId];
        updateChannelNamesDropdown(names);
        const newName = names[currentFriendId] || `Friend ${currentFriendId}`;

        // Keep input in sync if user isn't actively typing in it
        if (userNameInput && document.activeElement !== userNameInput) {
          userNameInput.value = (!newName.startsWith('Friend ')) ? newName : '';
          userNameInput.placeholder = newName;
        }

        updateChannelUI();

        if (prevName && newName && prevName !== newName) {
          showToast(`🔔 Slot ${currentFriendId} renamed to ${newName}`, 'info');
        }
      }
    });

    socket.on('new-message', async (msg) => {
      // Only render messages for the active 1-on-1 friend channel
      if (msg.channelId && msg.channelId !== currentFriendId) return;

      renderMessage(msg);
      scrollToBottom();

      // If message is from another client, auto-copy to clipboard if enabled
      const isFromOther = (msg.senderSocketId !== socket.id);
      if (isFromOther && autoCopyIncoming) {
        if (msg.type === 'text') {
          handleIncomingTextCopy(msg.content, msg.senderName);
        } else if (msg.type === 'image') {
          handleIncomingImageCopy(msg.content, msg.senderName);
        }
      }
    });

    socket.on('board-cleared', ({ friendId }) => {
      if (friendId === currentFriendId) {
        messageList.innerHTML = '';
        checkEmptyState();
        showToast(`Board was cleared`, 'info');
      }
    });
  }

  function getSenderDisplayName() {
    if (currentRole === 'You') {
      return 'You';
    } else {
      const custom = userNameInput ? userNameInput.value.trim() : '';
      if (custom) return custom;
      const slotName = channelNames[currentFriendId];
      if (slotName && !slotName.startsWith('Friend ')) return slotName;
      return currentUserName || `Friend ${currentFriendId}`;
    }
  }

  function updateChannelNamesDropdown(names) {
    if (!names || !friendSelect) return;
    channelNames = names;
    const currentVal = friendSelect.value;
    friendSelect.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      const name = names[i] || `Friend ${i}`;
      opt.textContent = `👥 ${i}. ${name}`;
      if (String(i) === String(currentVal)) opt.selected = true;
      friendSelect.appendChild(opt);
    }
    friendSelect.value = currentFriendId;
  }

  function switchChannel(friendId, role) {
    currentFriendId = parseInt(friendId, 10) || 1;
    currentRole = role;
    localStorage.setItem('qb_active_friend', currentFriendId);
    localStorage.setItem('qb_role', currentRole);
    
    if (friendSelect) friendSelect.value = currentFriendId;
    if (btnRoleYou) btnRoleYou.classList.toggle('active', currentRole === 'You');
    if (btnRoleFriend) btnRoleFriend.classList.toggle('active', currentRole === 'Friend');

    const slotName = channelNames[currentFriendId] || `Friend ${currentFriendId}`;

    if (currentRole === 'You') {
      if (pickerLabel) pickerLabel.textContent = 'Friend:';
      if (nameLabel) nameLabel.textContent = 'Friend Name:';
      if (userNameInput) {
        userNameInput.value = (slotName && !slotName.startsWith('Friend ')) ? slotName : '';
        userNameInput.placeholder = slotName;
        userNameInput.title = `Rename Friend ${currentFriendId}`;
      }
      if (btnShareLink) {
        btnShareLink.title = `Copy direct link for ${slotName}`;
      }
    } else {
      if (pickerLabel) pickerLabel.textContent = 'Slot:';
      if (nameLabel) nameLabel.textContent = 'My Name:';
      if (userNameInput) {
        userNameInput.value = (slotName && !slotName.startsWith('Friend ')) ? slotName : (currentUserName || '');
        userNameInput.placeholder = 'Your name (e.g. Rahul)';
        userNameInput.title = 'Enter your display name';
      }
      if (btnShareLink) {
        btnShareLink.title = `Copy link for this friend slot`;
      }
    }

    if (socket && socket.connected) {
      socket.emit('select-channel', {
        friendId: currentFriendId,
        role: currentRole,
        customName: userNameInput ? userNameInput.value.trim() : ''
      }, (res) => {
        if (res && res.success) {
          if (res.role && res.role !== currentRole) {
            currentRole = res.role;
            localStorage.setItem('qb_role', currentRole);
            if (btnRoleYou) btnRoleYou.classList.toggle('active', currentRole === 'You');
            if (btnRoleFriend) btnRoleFriend.classList.toggle('active', currentRole === 'Friend');
          }
          messageList.innerHTML = '';
          if (Array.isArray(res.messages)) {
            res.messages.forEach((msg) => renderMessage(msg));
          }
          checkEmptyState();
          scrollToBottom();
          if (res.channelNames) {
            updateChannelNamesDropdown(res.channelNames);
          }
          updateChannelUI(res.status);
        }
      });
    } else {
      updateChannelUI({ connected: false });
    }
  }

  function updateChannelUI(status) {
    const friendDisplayName = (status && status.friendName) || channelNames[currentFriendId] || `Friend ${currentFriendId}`;
    document.title = `QuickBoard • ${friendDisplayName}`;

    if (currentRole === 'You') {
      if (pickerLabel) pickerLabel.textContent = 'Friend:';
      if (nameLabel) nameLabel.textContent = 'Friend Name:';
    } else {
      if (pickerLabel) pickerLabel.textContent = 'Slot:';
      if (nameLabel) nameLabel.textContent = 'My Name:';
    }

    if (socket && socket.connected) {
      if (status && status.connected) {
        updateStatusBadge('connected', `Live • ${friendDisplayName} Online`);
      } else {
        updateStatusBadge('connected', `Live • Ready`);
      }
    } else {
      updateStatusBadge('disconnected', `Reconnecting...`);
    }
  }

  function updateStatusBadge(type, text) {
    statusIndicator.className = 'status-pill';
    if (type === 'connected') {
      statusIndicator.classList.add('status-connected');
    } else if (type === 'waiting') {
      statusIndicator.classList.add('status-waiting');
    } else {
      statusIndicator.classList.add('status-disconnected');
    }
    statusText.textContent = text;
  }

  // --- Auto-Copy Incoming from Friend ---
  async function handleIncomingTextCopy(text) {
    pendingIncomingToCopy = { type: 'text', content: text };
    try {
      await navigator.clipboard.writeText(text);
      pendingIncomingToCopy = null;
      lastPastedText = text;
      showToast('⚡ Friend\'s text copied to your clipboard!', 'success');
    } catch (err) {
      // Background tab restriction in browsers
      showToast('📥 Friend sent text! (Click anywhere to sync to clipboard)', 'info');
    }
  }

  async function handleIncomingImageCopy(dataUrl) {
    pendingIncomingToCopy = { type: 'image', content: dataUrl };
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      let pngBlob = blob;
      if (blob.type !== 'image/png') {
        pngBlob = await convertBlobToPng(blob);
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      pendingIncomingToCopy = null;
      showToast('⚡ Friend\'s image copied to your clipboard!', 'success');
    } catch (err) {
      showToast('📥 Friend sent an image! Click "Copy Image" to put in clipboard', 'info');
    }
  }

  // Flush pending incoming copy on user click or window focus
  async function flushPendingIncomingCopy() {
    if (!pendingIncomingToCopy || !autoCopyIncoming) return;
    const item = pendingIncomingToCopy;
    pendingIncomingToCopy = null;

    if (item.type === 'text') {
      try {
        await navigator.clipboard.writeText(item.content);
        lastPastedText = item.content;
        showToast('⚡ Synced friend\'s text to your clipboard!', 'success');
      } catch (e) {}
    } else if (item.type === 'image') {
      try {
        const res = await fetch(item.content);
        const blob = await res.blob();
        let pngBlob = blob;
        if (blob.type !== 'image/png') {
          pngBlob = await convertBlobToPng(blob);
        }
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        showToast('⚡ Synced friend\'s image to your clipboard!', 'success');
      } catch (e) {}
    }
  }

  // --- Auto-Paste on Window Focus ---
  async function checkAndAutoPasteOnFocus() {
    // First, flush any incoming friend copy if tab was in background
    await flushPendingIncomingCopy();

    if (!autoPasteOnFocus) return;

    try {
      // 1. Check for images on clipboard
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              // Avoid re-pasting if it's the exact same size/type recently processed
              stageImageFile(blob, true);
              showToast('⚡ Auto-pasted image from clipboard!', 'success');
              return;
            }
          }
        }
      }

      // 2. Check for text
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim() && text !== lastPastedText) {
          lastPastedText = text;
          socket.emit('send-message', {
            type: 'text',
            content: text,
            text: text,
            senderRole: currentRole,
            senderName: getSenderDisplayName()
          });
          showToast('⚡ Auto-pasted new text from clipboard!', 'success');
        }
      }
    } catch (err) {}
  }

  // --- Comprehensive WhatsApp & System Image Extractor ---
  async function processClipboardData(clipboardData) {
    if (!clipboardData) return false;

    // A. Check files list (common in WhatsApp Web and desktop copy)
    if (clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        const file = clipboardData.files[i];
        if (file.type.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(file.name)) {
          stageImageFile(file, true);
          return true;
        }
      }
    }

    // B. Check items list
    if (clipboardData.items && clipboardData.items.length > 0) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.type.startsWith('image/') || item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            stageImageFile(file, true);
            return true;
          }
        }
      }
    }

    // C. Check HTML (WhatsApp Web copies <img src="blob:..." or "data:image/...">)
    const html = clipboardData.getData('text/html');
    if (html) {
      const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (match && match[1]) {
        const src = match[1];
        if (src.startsWith('data:image/')) {
          // Direct base64 data URL from WhatsApp
          socket.emit('send-message', {
            type: 'image',
            content: src,
            filename: `whatsapp_image_${Date.now()}.png`,
            senderRole: currentRole,
            senderName: getSenderDisplayName()
          });
          showToast('WhatsApp image posted to board!', 'success');
          return true;
        } else if (src.startsWith('blob:') || src.startsWith('http')) {
          try {
            const resp = await fetch(src);
            const blob = await resp.blob();
            stageImageFile(blob, true);
            showToast('WhatsApp image posted to board!', 'success');
            return true;
          } catch (e) {
            console.log('Could not fetch HTML img blob:', e);
          }
        }
      }
    }

    return false;
  }

  // --- 1-Click Pull Clipboard Action ---
  async function pullAndSendClipboard() {
    try {
      // 1. Try reading clipboard items (images)
      if (navigator.clipboard && navigator.clipboard.read) {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                const blob = await item.getType(type);
                stageImageFile(blob, true);
                showToast('Pasted image from clipboard!', 'success');
                return;
              }
            }
          }
        } catch (e) {}
      }

      // 2. Try reading clipboard text
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          lastPastedText = text;
          socket.emit('send-message', {
            type: 'text',
            content: text,
            text: text,
            senderRole: currentRole,
            senderName: getSenderDisplayName()
          });
          showToast('Pasted text from clipboard!', 'success');
          return;
        }
      }

      showToast('Clipboard is empty', 'info');
    } catch (err) {
      showToast('Please allow clipboard permissions in your browser', 'warning');
    }
  }

  // --- Message Sending Logic ---
  function sendTextMessage() {
    const text = messageInput.value.trim();
    if (!text && !stagedImage) return;

    if (stagedImage) {
      sendStagedImage();
      return;
    }

    if (!text) return;

    lastPastedText = text;
    socket.emit(
      'send-message',
      {
        type: 'text',
        content: text,
        text: text,
        senderRole: currentRole,
        senderName: getSenderDisplayName()
      },
      (res) => {
        if (res && res.success) {
          messageInput.value = '';
          autoResizeTextarea();
        } else {
          showToast('Failed to send text', 'warning');
        }
      }
    );
  }

  function sendStagedImage() {
    if (!stagedImage) return;

    btnSendAttachment.disabled = true;
    btnSendAttachment.textContent = 'Sending...';

    socket.emit(
      'send-message',
      {
        type: 'image',
        content: stagedImage.dataUrl,
        filename: stagedImage.filename,
        size: stagedImage.size,
        senderRole: currentRole,
        senderName: getSenderDisplayName()
      },
      (res) => {
        btnSendAttachment.disabled = false;
        btnSendAttachment.textContent = 'Send Image';
        if (res && res.success) {
          clearStagedImage();
          showToast('Image shared instantly!', 'success');
        } else {
          showToast('Failed to send image', 'warning');
        }
      }
    );
  }

  // --- Staging Image File ---
  function stageImageFile(file, autoSend = false) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const sizeStr = formatFileSize(file.size || (dataUrl.length * 0.75));
      const filename = file.name || `image_${Date.now()}.png`;

      stagedImage = {
        dataUrl,
        filename,
        size: sizeStr,
        type: file.type || 'image/png'
      };

      if (autoSend) {
        sendStagedImage();
      } else {
        attachmentThumbnail.src = dataUrl;
        attachmentName.textContent = filename;
        attachmentSize.textContent = sizeStr;
        pendingAttachment.classList.remove('hidden');
        btnSendAttachment.focus();
      }
    };
    reader.readAsDataURL(file);
  }

  function clearStagedImage() {
    stagedImage = null;
    attachmentThumbnail.src = '';
    pendingAttachment.classList.add('hidden');
    imageFileInput.value = '';
  }

  // --- Link Detection & Formatting Helper ---
  function linkifyText(text) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    // Regex for matching http, https, and www URLs
    const urlPattern = /(\b(https?:\/\/|www\.)[^\s<]+[^\s<.,:;"')\]])/gi;
    return escaped.replace(urlPattern, (match) => {
      const href = match.toLowerCase().startsWith('www.') ? `https://${match}` : match;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="message-link" title="Open ${href}">${match}</a>`;
    });
  }

  function extractFirstUrl(text) {
    if (!text) return null;
    const match = text.match(/\b(https?:\/\/[^\s<]+|www\.[^\s<]+)/i);
    if (!match) return null;
    return match[0].toLowerCase().startsWith('www.') ? `https://${match[0]}` : match[0];
  }

  // --- Message Rendering & Actions ---
  function renderMessage(msg) {
    boardEmptyState.classList.add('hidden');

    const isMsgFromHost = msg.senderRole === 'You';
    const isFromMe = (msg.senderRole === currentRole);
    let displayName = msg.senderName;

    if (!displayName) {
      if (isMsgFromHost) {
        displayName = (currentRole === 'You') ? 'You' : 'Host';
      } else {
        displayName = channelNames[msg.channelId || currentFriendId] || `Friend ${msg.channelId || currentFriendId}`;
      }
    }

    let badgeLabel = '';
    let badgeClass = '';

    if (isMsgFromHost) {
      badgeClass = 'sender-badge-you';
      badgeLabel = (currentRole === 'You') ? '👤 You (Host)' : '👤 Host';
    } else {
      badgeClass = 'sender-badge-peer';
      badgeLabel = isFromMe ? `👥 ${displayName} (You)` : `👥 ${displayName}`;
    }

    const timeFormatted = formatTime(msg.timestamp);

    const item = document.createElement('div');
    item.className = 'message-item';
    item.id = msg.id;

    if (msg.type === 'text') {
      const firstUrl = extractFirstUrl(msg.content);
      const openBtnHtml = firstUrl ? `
        <a href="${firstUrl}" target="_blank" rel="noopener noreferrer" class="btn-action btn-open-link" title="Open link in new tab">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          <span>Open Link</span>
        </a>
      ` : '';

      item.innerHTML = `
        <div class="message-meta">
          <div class="sender-tag ${badgeClass}">
            <span>●</span> ${badgeLabel}
          </div>
          <span class="message-time">${timeFormatted}</span>
        </div>
        <div class="message-content-text">
          <pre class="message-text">${linkifyText(msg.content)}</pre>
        </div>
        <div class="message-actions">
          ${openBtnHtml}
          <button class="btn-action btn-copy-text" title="Copy text to clipboard">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span>Copy</span>
          </button>
        </div>
      `;

      const copyBtn = item.querySelector('.btn-copy-text');
      copyBtn.addEventListener('click', () => {
        copyTextToClipboard(msg.content, copyBtn);
      });

    } else if (msg.type === 'image') {
      const sizeTag = msg.size ? `• ${msg.size}` : '';
      item.innerHTML = `
        <div class="message-meta">
          <div class="sender-tag ${badgeClass}">
            <span>●</span> ${badgeLabel}
          </div>
          <span class="message-time">${timeFormatted} ${sizeTag}</span>
        </div>
        <div class="message-content-image">
          <div class="image-preview-wrapper" title="Click to view full size">
            <img src="${msg.content}" alt="Shared image" loading="lazy">
            <div class="image-preview-overlay">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                <line x1="11" y1="8" x2="11" y2="14"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
              <span>Zoom</span>
            </div>
          </div>
        </div>
        <div class="message-actions">
          <button class="btn-action btn-copy-img" title="Copy Image to System Clipboard">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span>Copy Image</span>
          </button>
          <button class="btn-action btn-download-img" title="Save / Download Image">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>Save</span>
          </button>
        </div>
      `;

      const imgWrapper = item.querySelector('.image-preview-wrapper');
      imgWrapper.addEventListener('click', () => {
        openLightbox(msg.content, msg.filename || 'screenshot.png');
      });

      const copyImgBtn = item.querySelector('.btn-copy-img');
      copyImgBtn.addEventListener('click', () => {
        copyImageToClipboard(msg.content, copyImgBtn);
      });

      const downloadImgBtn = item.querySelector('.btn-download-img');
      downloadImgBtn.addEventListener('click', () => {
        downloadImage(msg.content, msg.filename || `quickboard_${Date.now()}.png`);
      });
    }

    messageList.appendChild(item);
  }

  function checkEmptyState() {
    if (messageList.children.length === 0) {
      boardEmptyState.classList.remove('hidden');
    } else {
      boardEmptyState.classList.add('hidden');
    }
  }

  function scrollToBottom() {
    boardFeed.scrollTop = boardFeed.scrollHeight;
  }

  // --- Clipboard Helpers ---
  async function copyTextToClipboard(text, btnElement) {
    try {
      await navigator.clipboard.writeText(text);
      lastPastedText = text;
      if (btnElement) {
        const originalContent = btnElement.innerHTML;
        btnElement.classList.add('copied');
        btnElement.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>Copied!</span>
        `;
        setTimeout(() => {
          btnElement.classList.remove('copied');
          btnElement.innerHTML = originalContent;
        }, 1800);
      }
      showToast('Copied text to clipboard', 'success');
    } catch (err) {
      const tempArea = document.createElement('textarea');
      tempArea.value = text;
      document.body.appendChild(tempArea);
      tempArea.select();
      document.execCommand('copy');
      document.body.removeChild(tempArea);
      showToast('Copied text to clipboard', 'success');
    }
  }

  async function copyImageToClipboard(dataUrl, btnElement) {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      let pngBlob = blob;
      if (blob.type !== 'image/png') {
        pngBlob = await convertBlobToPng(blob);
      }

      const item = new ClipboardItem({ 'image/png': pngBlob });
      await navigator.clipboard.write([item]);

      if (btnElement) {
        const originalContent = btnElement.innerHTML;
        btnElement.classList.add('copied');
        btnElement.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>Copied!</span>
        `;
        setTimeout(() => {
          btnElement.classList.remove('copied');
          btnElement.innerHTML = originalContent;
        }, 1800);
      }
      showToast('Image copied to clipboard! (Ready to paste)', 'success');
    } catch (err) {
      showToast('Direct image copy restricted by browser. Downloading...', 'info');
      downloadImage(dataUrl, `screenshot_${Date.now()}.png`);
    }
  }

  function convertBlobToPng(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((pngBlob) => {
          if (pngBlob) resolve(pngBlob);
          else reject(new Error('Canvas to PNG failed'));
        }, 'image/png');
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }

  function downloadImage(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename || 'quickboard_image.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Image downloaded', 'success');
  }

  // --- Lightbox Modal ---
  function openLightbox(dataUrl, filename) {
    activeLightboxImage = { dataUrl, filename };
    lightboxImage.src = dataUrl;
    lightboxTitle.textContent = filename || 'Screenshot Preview';
    imageLightbox.classList.remove('hidden');
  }

  function closeLightbox() {
    imageLightbox.classList.add('hidden');
    lightboxImage.src = '';
    activeLightboxImage = null;
  }

  // --- Global Keyboard & Paste Listeners ---
  function setupClipboardAndKeyboardListeners() {
    // 1. Direct paste listener (Ctrl+V anywhere)
    window.addEventListener('paste', async (e) => {
      const clipboardData = e.clipboardData || e.originalEvent?.clipboardData;
      const handledImage = await processClipboardData(clipboardData);

      if (handledImage) {
        e.preventDefault();
        return;
      }

      // If text pasted outside textarea, post immediately
      if (document.activeElement !== messageInput) {
        const text = clipboardData.getData('text');
        if (text && text.trim()) {
          e.preventDefault();
          lastPastedText = text;
          socket.emit('send-message', {
            type: 'text',
            content: text,
            text: text,
            senderRole: currentRole,
            senderName: getSenderDisplayName()
          });
          showToast('Pasted text sent to board!', 'success');
        }
      }
    });

    // 2. Auto-sync on window focus
    window.addEventListener('focus', () => {
      checkAndAutoPasteOnFocus();
    });

    // 3. User click anywhere flushes pending clipboard writes if blocked in background
    document.addEventListener('click', () => {
      flushPendingIncomingCopy();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (imageLightbox && !imageLightbox.classList.contains('hidden')) {
          closeLightbox();
        }
        if (shareModal && !shareModal.classList.contains('hidden')) {
          closeShareModal();
        }
      }
    });

    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextMessage();
      }
    });

    messageInput.addEventListener('input', autoResizeTextarea);
  }

  function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 140) + 'px';
  }

  // --- Drag and Drop File Handlers ---
  function setupDragAndDrop() {
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
        dragDropOverlay.classList.remove('hidden');
      }
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragDropOverlay.classList.add('hidden');
        dragCounter = 0;
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dragDropOverlay.classList.add('hidden');

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(file.name)) {
          stageImageFile(file, true);
        } else {
          const reader = new FileReader();
          reader.onload = (evt) => {
            socket.emit('send-message', {
              type: 'text',
              content: evt.target.result,
              text: evt.target.result,
              senderRole: currentRole,
              senderName: getSenderDisplayName()
            });
          };
          reader.readAsText(file);
        }
      }
    });
  }

  // --- Toast Notifications ---
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    } else {
      iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2500);
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatFileSize(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Attach Event Listeners ---
  function attachEventListeners() {
    function setRole(role) {
      switchChannel(currentFriendId, role);
      showToast(`Now set as: ${role}`, 'info');
    }

    btnRoleYou.addEventListener('click', () => setRole('You'));
    btnRoleFriend.addEventListener('click', () => setRole('Friend'));

    friendSelect.addEventListener('change', (e) => {
      switchChannel(e.target.value, currentRole);
      const targetName = channelNames[currentFriendId] || `Friend ${currentFriendId}`;
      showToast(`Switched to ${targetName}`, 'info');
    });

    if (userNameInput) {
      userNameInput.addEventListener('input', () => {
        const val = userNameInput.value.trim().slice(0, 24);
        if (val) {
          channelNames[currentFriendId] = val;
          currentUserName = val;
          localStorage.setItem('qb_user_name', val);
          updateChannelNamesDropdown(channelNames);
          updateChannelUI();
          if (socket && socket.connected) {
            socket.emit('set-name', {
              friendId: currentFriendId,
              name: val,
              role: currentRole
            });
          }
        }
      });
    }

    // Open Share & Connect Modal
    async function openShareModal() {
      await fetchNetworkInfo();
      const friendName = channelNames[currentFriendId] || `Friend ${currentFriendId}`;
      if (shareModalTitle) {
        shareModalTitle.textContent = `Connect with ${friendName} (Slot ${currentFriendId})`;
      }

      const pathQuery = `/?friend=${currentFriendId}&role=friend`;

      // 1. Determine Public / Internet URL
      let publicUrl = '';
      if (serverNetworkInfo.tunnelUrl) {
        publicUrl = `${serverNetworkInfo.tunnelUrl.replace(/\/$/, '')}${pathQuery}`;
      } else if (
        window.location.origin.includes('trycloudflare.com') ||
        window.location.origin.includes('onrender.com') ||
        (!window.location.hostname.includes('localhost') &&
          !window.location.hostname.startsWith('10.') &&
          !window.location.hostname.startsWith('192.168.') &&
          !window.location.hostname.startsWith('172.') &&
          window.location.hostname !== '127.0.0.1')
      ) {
        publicUrl = `${window.location.origin}${pathQuery}`;
      }

      // 2. Wi-Fi Local Network URL
      const networkHost = serverNetworkInfo.localIp || window.location.hostname;
      const portStr = serverNetworkInfo.port ? `:${serverNetworkInfo.port}` : '';
      const networkUrl = `http://${networkHost}${portStr}${pathQuery}`;

      // 3. Localhost URL
      const localUrl = `http://localhost:${serverNetworkInfo.port || 3000}${pathQuery}`;

      if (shareUrlPublic) {
        if (publicUrl) {
          shareUrlPublic.value = publicUrl;
        } else {
          shareUrlPublic.value = 'Start tunnel with: npm run tunnel';
        }
      }
      if (shareUrlNetwork) shareUrlNetwork.value = networkUrl;
      if (shareUrlLocal) shareUrlLocal.value = localUrl;

      if (shareModal) shareModal.classList.remove('hidden');

      // Automatically copy the best working link immediately!
      const bestUrl = publicUrl || networkUrl;
      try {
        await navigator.clipboard.writeText(bestUrl);
        const urlType = publicUrl ? 'Public Internet' : 'Local Wi-Fi';
        showToast(`🔗 Copied ${urlType} link for ${friendName}!`, 'success');
      } catch (e) {}
    }

    function closeShareModal() {
      if (shareModal) shareModal.classList.add('hidden');
    }

    if (btnShareLink) {
      btnShareLink.addEventListener('click', openShareModal);
    }

    if (btnCopyPublic) {
      btnCopyPublic.addEventListener('click', async () => {
        const val = shareUrlPublic.value;
        if (val && val.startsWith('http')) {
          await copyTextToClipboard(val, btnCopyPublic);
          showToast('🔗 Public Internet link copied!', 'success');
        } else {
          showToast('Tip: Run npm run tunnel to generate a public link!', 'info');
        }
      });
    }

    if (btnCopyNetwork) {
      btnCopyNetwork.addEventListener('click', async () => {
        await copyTextToClipboard(shareUrlNetwork.value, btnCopyNetwork);
        showToast('📶 Local Wi-Fi link copied!', 'success');
      });
    }

    if (btnCopyLocal) {
      btnCopyLocal.addEventListener('click', async () => {
        await copyTextToClipboard(shareUrlLocal.value, btnCopyLocal);
        showToast('💻 Localhost link copied! (For this PC only)', 'info');
      });
    }

    if (btnShareModalClose) btnShareModalClose.addEventListener('click', closeShareModal);
    if (shareBackdrop) shareBackdrop.addEventListener('click', closeShareModal);

    btnToggleAutoCopy.addEventListener('click', () => {
      autoCopyIncoming = !autoCopyIncoming;
      btnToggleAutoCopy.classList.toggle('toggle-active', autoCopyIncoming);
      btnToggleAutoCopy.querySelector('.toolbar-label').innerHTML = `Auto-Copy to My Clipboard: <strong>${autoCopyIncoming ? 'ON' : 'OFF'}</strong>`;
      showToast(`Auto-Copy to Clipboard is now ${autoCopyIncoming ? 'ON' : 'OFF'}`, 'info');
    });

    btnToggleAutoFocus.addEventListener('click', () => {
      autoPasteOnFocus = !autoPasteOnFocus;
      btnToggleAutoFocus.classList.toggle('toggle-active', autoPasteOnFocus);
      btnToggleAutoFocus.querySelector('.toolbar-label').innerHTML = `Auto-Paste on Focus: <strong>${autoPasteOnFocus ? 'ON' : 'OFF'}</strong>`;
      showToast(`Auto-Paste on Focus is now ${autoPasteOnFocus ? 'ON' : 'OFF'}`, 'info');
    });

    btnPullClipboard.addEventListener('click', pullAndSendClipboard);

    btnClearBoard.addEventListener('click', () => {
      if (confirm('Clear all messages on this board?')) {
        socket.emit('clear-board');
      }
    });

    messageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendTextMessage();
    });

    btnUploadImage.addEventListener('click', () => {
      imageFileInput.click();
    });

    imageFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        stageImageFile(e.target.files[0], true);
      }
    });

    btnCancelAttachment.addEventListener('click', clearStagedImage);
    btnSendAttachment.addEventListener('click', sendStagedImage);

    // Lightbox
    lightboxBackdrop.addEventListener('click', closeLightbox);
    btnLightboxClose.addEventListener('click', closeLightbox);
    btnLightboxCopy.addEventListener('click', () => {
      if (activeLightboxImage) {
        copyImageToClipboard(activeLightboxImage.dataUrl, btnLightboxCopy);
      }
    });
    btnLightboxDownload.addEventListener('click', () => {
      if (activeLightboxImage) {
        downloadImage(activeLightboxImage.dataUrl, activeLightboxImage.filename);
      }
    });
  }

  async function init() {
    await fetchNetworkInfo();
    switchChannel(currentFriendId, currentRole);
    initSocket();
    setupClipboardAndKeyboardListeners();
    setupDragAndDrop();
    attachEventListeners();
    messageInput.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
