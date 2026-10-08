const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Support large payloads (up to 50MB) for high-resolution images & WhatsApp screenshots
const io = new Server(server, {
  maxHttpBufferSize: 5e7,
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Persistent storage for custom friend names across restarts
const DATA_DIR = path.join(__dirname, 'data');
const NAMES_FILE = path.join(DATA_DIR, 'channel-names.json');

function loadSavedNames() {
  try {
    if (fs.existsSync(NAMES_FILE)) {
      const data = fs.readFileSync(NAMES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load saved names:', err.message);
  }
  return {};
}

function persistNames() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const map = {};
    for (const [id, chan] of channels.entries()) {
      if (chan.friendName) {
        map[id] = chan.friendName;
      }
    }
    fs.writeFileSync(NAMES_FILE, JSON.stringify(map, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist names:', err.message);
  }
}

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

// 10 Dedicated 1-on-1 Friend Channels
// Each channel (1 to 10) connects 'You' with that specific Friend
const savedNames = loadSavedNames();
const channels = new Map();
for (let i = 1; i <= 10; i++) {
  channels.set(i, {
    friendId: i,
    friendName: savedNames[i] || `Friend ${i}`,
    messages: [], // Chronological messages
    peers: new Map() // socketId -> { role: 'You'|'Friend', name: string, joinedAt }
  });
}

// Helper to return map of all channel friend names
function getChannelNames() {
  const map = {};
  for (const [id, chan] of channels.entries()) {
    map[id] = chan.friendName || `Friend ${id}`;
  }
  return map;
}

// Helper to get local network IPv4 address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Helper to calculate channel peer status
function getChannelStatus(friendId) {
  const chan = channels.get(friendId);
  if (!chan) return { connected: false, peerCount: 0, hasYou: false, hasFriend: false };

  let hasYou = false;
  let hasFriend = false;
  let humanPeers = 0;

  for (const peer of chan.peers.values()) {
    if (peer.role === 'You' && !peer.isDaemon) hasYou = true;
    if (peer.role === 'Friend' && !peer.isDaemon) hasFriend = true;
    if (!peer.isDaemon) humanPeers++;
  }

  // Connected if both roles are present OR if 2 or more human peers are in the room!
  const connected = (hasYou && hasFriend) || (humanPeers >= 2);

  return {
    friendId,
    friendName: chan.friendName || `Friend ${friendId}`,
    channelNames: getChannelNames(),
    connected,
    peerCount: humanPeers,
    hasYou,
    hasFriend
  };
}

// Network info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    localIp: getLocalIp(),
    port: PORT,
    totalChannels: 10,
    channelNames: getChannelNames()
  });
});

// Socket connection
io.on('connection', (socket) => {
  let currentChannelId = null;
  let currentRole = 'You';
  let currentUserName = '';

  // Client selects friend channel (1 to 10) and role ('You' or 'Friend')
  socket.on('select-channel', ({ friendId, role, customName, isDaemon }, callback) => {
    const id = parseInt(friendId, 10) || 1;
    const validatedId = Math.max(1, Math.min(10, id));
    let validRole = role === 'Friend' ? 'Friend' : 'You';

    const chan = channels.get(validatedId);

    // Smart role assignment: If role was not explicitly Friend, but there is already an active human Host in this channel
    if (!isDaemon && role !== 'Friend') {
      let existingHumanHost = false;
      for (const [sId, peer] of chan.peers.entries()) {
        if (sId !== socket.id && peer.role === 'You' && !peer.isDaemon) {
          existingHumanHost = true;
          break;
        }
      }
      if (existingHumanHost) {
        // Second browser connecting automatically becomes Friend!
        validRole = 'Friend';
      }
    }

    // Leave previous channel room if any
    if (currentChannelId) {
      socket.leave(`channel_${currentChannelId}`);
      const prevChan = channels.get(currentChannelId);
      if (prevChan) {
        prevChan.peers.delete(socket.id);
        io.to(`channel_${currentChannelId}`).emit('channel-status', getChannelStatus(currentChannelId));
      }
    }

    // Join new channel
    currentChannelId = validatedId;
    currentRole = validRole;
    socket.join(`channel_${validatedId}`);

    // Update friend custom name if provided
    if (customName && typeof customName === 'string') {
      const clean = customName.trim().slice(0, 24);
      if (clean) {
        currentUserName = clean;
        if (validRole === 'Friend') {
          chan.friendName = clean;
          persistNames();
        }
      }
    }

    chan.peers.set(socket.id, { role: validRole, name: currentUserName, isDaemon: !!isDaemon, joinedAt: Date.now() });

    const status = getChannelStatus(validatedId);

    // Send board history and channel status to caller
    if (typeof callback === 'function') {
      callback({
        success: true,
        friendId: validatedId,
        role: validRole,
        friendName: chan.friendName,
        channelNames: getChannelNames(),
        messages: chan.messages,
        status
      });
    }

    // Broadcast updated status to everyone in this channel and sync channel names globally
    io.to(`channel_${validatedId}`).emit('channel-status', status);
    io.emit('names-updated', getChannelNames());
  });

  // Client updates their name or renames the friend slot
  socket.on('set-name', ({ friendId, name, role }, callback) => {
    const id = parseInt(friendId, 10) || currentChannelId;
    const chan = channels.get(id);
    if (!chan) return;

    if (name && typeof name === 'string') {
      const clean = name.trim().slice(0, 24);
      if (clean) {
        currentUserName = clean;
        chan.friendName = clean; // Name this friend slot
        persistNames();

        const peer = chan.peers.get(socket.id);
        if (peer) peer.name = clean;

        io.emit('names-updated', getChannelNames());
        io.to(`channel_${id}`).emit('channel-status', getChannelStatus(id));

        if (typeof callback === 'function') {
          callback({ success: true, friendName: clean, channelNames: getChannelNames() });
        }
      }
    }
  });

  // Client sends message in the currently selected channel
  socket.on('send-message', (data, callback) => {
    if (!currentChannelId) {
      if (typeof callback === 'function') callback({ success: false, error: 'No channel selected' });
      return;
    }

    const chan = channels.get(currentChannelId);
    if (!chan) return;

    const { type, content, filename, size, text, senderRole, senderName } = data || {};
    if (!type || (!content && !text)) {
      if (typeof callback === 'function') callback({ success: false, error: 'Empty message' });
      return;
    }

    const role = senderRole || currentRole;
    let displayName = senderName ? senderName.trim().slice(0, 24) : '';
    if (!displayName) {
      displayName = role === 'You' ? 'You' : (chan.friendName || `Friend ${currentChannelId}`);
    }

    const message = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      channelId: currentChannelId,
      senderSocketId: socket.id,
      senderRole: role,
      senderName: displayName,
      senderLabel: displayName,
      type: type === 'image' ? 'image' : 'text',
      content: content || text,
      filename: filename || (type === 'image' ? 'screenshot.png' : null),
      size: size || null,
      timestamp: Date.now()
    };

    // Store in channel history (up to 150 items per channel)
    chan.messages.push(message);
    if (chan.messages.length > 150) {
      chan.messages.shift();
    }

    // Broadcast only to this specific 1-on-1 friend channel
    io.to(`channel_${currentChannelId}`).emit('new-message', message);

    if (typeof callback === 'function') {
      callback({ success: true, messageId: message.id });
    }
  });

  // Clear current channel board
  socket.on('clear-board', (callback) => {
    if (!currentChannelId) return;
    const chan = channels.get(currentChannelId);
    if (chan) {
      chan.messages = [];
      io.to(`channel_${currentChannelId}`).emit('board-cleared', { friendId: currentChannelId });
      if (typeof callback === 'function') callback({ success: true });
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    if (currentChannelId) {
      const chan = channels.get(currentChannelId);
      if (chan) {
        chan.peers.delete(socket.id);
        io.to(`channel_${currentChannelId}`).emit('channel-status', getChannelStatus(currentChannelId));
      }
    }
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log('\n======================================================');
  console.log('   🚀 QuickBoard 10-Friend Custom Names Server Running!');
  console.log('======================================================');
  console.log(` • Local URL:    http://localhost:${PORT}`);
  console.log(` • Network URL:  http://${localIp}:${PORT}`);
  console.log(' • Channels:     1 to 10 (Custom names supported)');
  console.log('======================================================\n');
});
