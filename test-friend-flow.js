const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

async function testFriendFlow() {
  console.log('Testing Complete Friend Custom Names Flow...');

  const clientHost = io('http://localhost:3000');
  const clientKarthik = io('http://localhost:3000');

  // 1. Host selects Channel 1
  const hostRes = await new Promise((res) => {
    clientHost.emit('select-channel', { friendId: 1, role: 'You' }, res);
  });
  console.log('Host connected to Channel 1. Friend name on slot 1:', hostRes.friendName);

  // 2. Karthik joins Channel 1 as Friend
  const karthikRes = await new Promise((res) => {
    clientKarthik.emit('select-channel', { friendId: 1, role: 'Friend', customName: 'Karthik' }, res);
  });
  console.log('Karthik connected as Friend on Channel 1:', karthikRes.friendName);

  // 3. Karthik sends a message
  const hostMsgPromise = new Promise((resolve) => {
    clientHost.on('new-message', (msg) => resolve(msg));
  });

  clientKarthik.emit('send-message', {
    type: 'text',
    content: 'Hey! I am ready.',
    senderRole: 'Friend',
    senderName: 'Karthik'
  });

  const receivedByHost = await hostMsgPromise;
  console.log('Host received message from:', receivedByHost.senderName, '->', receivedByHost.content);
  if (receivedByHost.senderName !== 'Karthik') {
    throw new Error('Expected senderName to be Karthik, got: ' + receivedByHost.senderName);
  }

  // 4. Host renames Channel 3 to "Priya"
  const renameRes = await new Promise((res) => {
    clientHost.emit('set-name', { friendId: 3, name: 'Priya', role: 'You' }, res);
  });
  console.log('Host renamed Channel 3 to:', renameRes.friendName);

  // Verify persistence file on disk
  const namesFile = path.join(__dirname, 'data', 'channel-names.json');
  const diskData = JSON.parse(fs.readFileSync(namesFile, 'utf8'));
  console.log('Persisted names on disk:', diskData);
  if (diskData[3] !== 'Priya') {
    throw new Error('Expected diskData[3] to be Priya');
  }

  // 5. Priya connects to Channel 3
  const clientPriya = io('http://localhost:3000');
  const priyaRes = await new Promise((res) => {
    clientPriya.emit('select-channel', { friendId: 3, role: 'Friend' }, res);
  });
  console.log('Priya connected to Channel 3. Slot name is:', priyaRes.friendName);
  if (priyaRes.friendName !== 'Priya') {
    throw new Error('Expected slot 3 to be Priya, got: ' + priyaRes.friendName);
  }

  clientHost.disconnect();
  clientKarthik.disconnect();
  clientPriya.disconnect();

  console.log('\n======================================================');
  console.log('🎉 ALL FRIEND NAME FEATURES FULLY VERIFIED & PASSED!');
  console.log('======================================================\n');
  process.exit(0);
}

testFriendFlow().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
