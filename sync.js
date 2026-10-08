/**
 * QuickBoard Local Clipboard Sync Daemon
 * Bridges Windows OS Clipboard directly with QuickBoard in real-time.
 * 
 * 1. When you copy text, code, or WhatsApp images on PC,
 *    it automatically uploads them to QuickBoard.
 * 2. When your friend sends any text or image on QuickBoard,
 *    it automatically copies it into your Windows clipboard!
 */

const { io } = require('socket.io-client');
const { spawn, execFile } = require('child_process');
const path = require('path');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const READ_SCRIPT = path.join(__dirname, 'scripts', 'read-clip.ps1');
const SET_SCRIPT = path.join(__dirname, 'scripts', 'set-clip.ps1');

const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling']
});

let lastLocalClipboard = '';
let isUpdatingClipboard = false;

// Read text or image from Windows clipboard
function readClipboard() {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', READ_SCRIPT],
      { maxBuffer: 50 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const out = stdout.trim();
        if (out.startsWith('TXT:')) {
          resolve({ type: 'text', content: out.substring(4) });
        } else if (out.startsWith('IMG:')) {
          const b64 = out.substring(4);
          resolve({
            type: 'image',
            content: 'data:image/png;base64,' + b64,
            filename: `whatsapp_image_${Date.now()}.png`
          });
        } else {
          resolve(null);
        }
      }
    );
  });
}

// Write incoming text or image into Windows system clipboard
function setSystemClipboard(type, content) {
  return new Promise((resolve) => {
    isUpdatingClipboard = true;
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SET_SCRIPT]);

    ps.on('error', (err) => {
      console.error('Failed to spawn clipboard setter:', err);
      isUpdatingClipboard = false;
      resolve(false);
    });

    if (type === 'image') {
      const b64 = content.replace(/^data:image\/\w+;base64,/, '');
      ps.stdin.write('IMG:' + b64);
    } else {
      ps.stdin.write('TXT:' + content);
    }
    ps.stdin.end();

    ps.on('close', () => {
      setTimeout(() => {
        isUpdatingClipboard = false;
      }, 1000);
      resolve(true);
    });
  });
}

const FRIEND_ID = parseInt(process.env.FRIEND_ID || '1', 10);

socket.on('connect', async () => {
  console.log('\n======================================================');
  console.log(`   🔄 QuickBoard Windows Clipboard Sync ACTIVE! (Friend ${FRIEND_ID})`);
  console.log('======================================================');
  console.log(' • Any text or WhatsApp image copied on PC auto-syncs to board.');
  console.log(' • Any text sent by friend auto-copies to your Windows clipboard.');
  console.log('======================================================\n');

  socket.emit('select-channel', { friendId: FRIEND_ID, role: 'You', isDaemon: true });

  // Initialize with current clipboard content to prevent re-sending on startup
  const initial = await readClipboard();
  if (initial && initial.content) {
    lastLocalClipboard = initial.content;
  }
});

// Incoming message from friend -> Automatically set to Windows Clipboard!
socket.on('new-message', async (msg) => {
  if (msg.senderSocketId === socket.id) return; // Skip own echo
  if (msg.senderRole === 'You') return; // Skip messages sent by Host (You)

  const sender = msg.senderName || 'Friend';
  if (msg.type === 'text' && msg.content) {
    console.log(`[Auto-Sync] 📥 ${sender} sent text -> Copying directly to your Windows clipboard!`);
    lastLocalClipboard = msg.content;
    await setSystemClipboard('text', msg.content);
    const verified = await readClipboard();
    if (verified && verified.content) {
      lastLocalClipboard = verified.content;
    }
    console.log(`[Auto-Sync] ✅ Copied to Windows clipboard! Press Ctrl+V anywhere.\n`);
  } else if (msg.type === 'image' && msg.content) {
    console.log(`[Auto-Sync] 📥 ${sender} sent image -> Copying directly to your Windows clipboard!`);
    lastLocalClipboard = msg.content;
    await setSystemClipboard('image', msg.content);
    const verified = await readClipboard();
    if (verified && verified.content) {
      lastLocalClipboard = verified.content;
    }
    console.log(`[Auto-Sync] ✅ Image copied to Windows clipboard! Press Ctrl+V anywhere.\n`);
  }
});

// Watch Windows clipboard every 1.2 seconds for new copies on this PC
setInterval(async () => {
  if (isUpdatingClipboard || !socket.connected) return;

  const current = await readClipboard();
  if (!current || !current.content) return;

  // New text or image copied on PC (e.g. from WhatsApp, ChatGPT, etc.)
  if (current.content !== lastLocalClipboard) {
    lastLocalClipboard = current.content;
    console.log(`[Auto-Sync] 📤 Detected new copy on PC (${current.type}) -> Sending to QuickBoard!`);

    socket.emit('send-message', {
      type: current.type,
      content: current.content,
      text: current.type === 'text' ? current.content : '',
      filename: current.filename || null,
      senderRole: 'You',
      senderName: 'You'
    });
  }
}, 1200);
